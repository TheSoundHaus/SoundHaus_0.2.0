"""
LTI 1.3 endpoints (Phase 8).

    GET  /.well-known/jwks.json        — Soundhaus tool's public keys
    POST /lti/login                    — OIDC 3rd-party login init
    POST /lti/launch                   — Resource link launch
    POST /lti/deep-link-return         — Deep Linking 2.0 response
    POST /lti/deployments              — Register a Canvas tenant (admin)

The launch endpoint verifies the id_token, upserts the classroom/member/
assignment, and redirects the browser to the web dashboard with a signed
hand-off cookie. Lower-level JWT + OIDC handling is delegated to
`services.lti_service`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse, RedirectResponse

from config import settings
from database import get_db
from dependencies import limiter
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from logging_config import get_logger
from services.classroom_service import classroom_service
from services.lti_service import lti_service, tool_jwks

logger = get_logger(__name__)

router = APIRouter(tags=["lti"])


# ── JWKS ────────────────────────────────────────────────────────────────────


@router.get("/.well-known/jwks.json")
@limiter.limit("120/minute")
async def jwks(request: Request):
    return JSONResponse(tool_jwks())


# ── Deployment registration ─────────────────────────────────────────────────


class RegisterDeploymentRequest(BaseModel):
    issuer: str = Field(..., min_length=1)
    client_id: str = Field(..., min_length=1)
    deployment_id: str = Field(..., min_length=1)
    public_jwks_url: str
    auth_login_url: str
    auth_token_url: str
    tool_redirect_url: str | None = None


@router.post("/lti/deployments")
@limiter.limit("20/minute")
async def register_deployment(
    request: Request,
    body: RegisterDeploymentRequest,
    db: Session = Depends(get_db),
):
    # Guarded by admin token — reuse admin router's env var.
    admin_token = request.headers.get("X-Admin-Token") or ""
    if not settings.admin_token or admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Admin auth required")
    dep = lti_service.register_deployment(
        db,
        issuer=body.issuer,
        client_id=body.client_id,
        deployment_id=body.deployment_id,
        public_jwks_url=body.public_jwks_url,
        auth_login_url=body.auth_login_url,
        auth_token_url=body.auth_token_url,
        tool_redirect_url=body.tool_redirect_url,
    )
    return {"success": True, "deployment_id": dep.id}


# ── OIDC login ──────────────────────────────────────────────────────────────


@router.post("/lti/login")
@limiter.limit("60/minute")
async def lti_login(
    request: Request,
    iss: str = Form(...),
    login_hint: str = Form(...),
    target_link_uri: str = Form(...),
    client_id: str | None = Form(default=None),
    lti_message_hint: str | None = Form(default=None),
):
    """Canvas hits this endpoint to initiate an OIDC login handshake.
    We reply with a 302 to Canvas's auth endpoint with the correct params.
    """
    try:
        url = lti_service.oidc_login_redirect_url(
            iss=iss,
            client_id=client_id,
            login_hint=login_hint,
            target_link_uri=target_link_uri,
            lti_message_hint=lti_message_hint,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(url, status_code=302)


# ── Resource link launch ────────────────────────────────────────────────────


@router.post("/lti/launch")
@limiter.limit("60/minute")
async def lti_launch(
    request: Request,
    id_token: str = Form(...),
    state: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    """Canvas posts a signed id_token here. We verify, upsert classroom +
    member + assignment, then bounce the user to the web dashboard.
    """
    try:
        claims = lti_service.verify_launch_id_token(id_token)
    except Exception as exc:
        logger.warning("lti_launch_verify_failed", error=str(exc))
        raise HTTPException(status_code=400, detail="Invalid LTI id_token") from exc

    issuer = claims.get("iss") or ""
    client_id = _first_aud(claims.get("aud"))
    deployment_id_claim = claims.get("https://purl.imsglobal.org/spec/lti/claim/deployment_id")
    platform_user_id = claims.get("sub")

    if not all([issuer, client_id, deployment_id_claim, platform_user_id]):
        raise HTTPException(status_code=400, detail="Incomplete LTI claims")

    deployment = lti_service.find_deployment(
        db, issuer=issuer, client_id=client_id, deployment_id=deployment_id_claim
    )
    if deployment is None:
        raise HTTPException(status_code=403, detail="Unknown LTI deployment")

    # Upsert LtiUser -> Soundhaus user. In production this would mint a
    # Supabase session cookie after looking up / creating a profile row.
    soundhaus_user_id = lti_service.find_soundhaus_user_for_platform_user(
        db, deployment_id=deployment.id, platform_user_id=platform_user_id
    ) or f"lti:{deployment.id}:{platform_user_id}"
    lti_service.map_lti_user(
        db,
        deployment_id=deployment.id,
        platform_user_id=platform_user_id,
        soundhaus_user_id=soundhaus_user_id,
        email=claims.get("email"),
        display_name=claims.get("name"),
    )

    # Upsert classroom from Canvas context claim.
    context_claim = claims.get("https://purl.imsglobal.org/spec/lti/claim/context") or {}
    context_id = context_claim.get("id")
    context_title = context_claim.get("title") or "Canvas course"

    from models.classroom_models import Classroom

    classroom = (
        db.query(Classroom)
        .filter(
            Classroom.lti_deployment_id == deployment.id,
            Classroom.canvas_context_id == context_id,
        )
        .first()
    )
    if classroom is None:
        classroom = classroom_service.create_classroom(
            db,
            soundhaus_user_id,  # instructor placeholder; real instructor mapped via NRPS
            name=context_title,
            lti_deployment_id=deployment.id,
            canvas_context_id=context_id,
        )

    # Roles claim → member role
    roles = claims.get("https://purl.imsglobal.org/spec/lti/claim/roles") or []
    role = _role_from_lti(roles)
    classroom_service.upsert_member(
        db,
        classroom.id,
        soundhaus_user_id,
        role=role,
        lti_platform_user_id=platform_user_id,
    )

    # Upsert assignment from resource_link claim (+ bind AGS line-item if present)
    rl_claim = claims.get("https://purl.imsglobal.org/spec/lti/claim/resource_link") or {}
    resource_link_id = rl_claim.get("id")
    assignment = None
    if resource_link_id:
        assignment = classroom_service.find_assignment_by_resource_link(
            db, classroom.id, resource_link_id
        )
        if assignment is None:
            assignment = classroom_service.create_assignment(
                db,
                classroom.id,
                title=rl_claim.get("title") or "Canvas assignment",
                description_md=rl_claim.get("description"),
                template_repo_id=None,
                deadline_at=None,
                canvas_resource_link_id=resource_link_id,
                canvas_line_item_url=_extract_line_item_url(claims),
            )
        elif not assignment.canvas_line_item_url:
            line_item = _extract_line_item_url(claims)
            if line_item:
                assignment.canvas_line_item_url = line_item
                db.commit()

    # Bounce user to web dashboard. Real deploy should mint a one-shot
    # Supabase session hand-off token here.
    target = deployment.tool_redirect_url or settings.stripe_portal_return_url
    qs = "?classroom_id=" + classroom.id
    if assignment:
        qs += "&assignment_id=" + assignment.id
    return RedirectResponse(target + qs, status_code=302)


# ── Deep Linking 2.0 return ─────────────────────────────────────────────────


class DeepLinkRequest(BaseModel):
    deployment_id: str
    client_id: str
    issuer: str
    assignment_url: str
    assignment_title: str


@router.post("/lti/deep-link-return")
@limiter.limit("30/minute")
async def deep_link_return(request: Request, body: DeepLinkRequest):
    """Called by the tool UI after the instructor picks an assignment template.
    Returns a signed JWT that the tool auto-submits back to Canvas.
    """
    try:
        token = lti_service.build_deep_link_response_jwt(
            deployment_id=body.deployment_id,
            client_id=body.client_id,
            issuer=body.issuer,
            assignment_url=body.assignment_url,
            assignment_title=body.assignment_title,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, "JWT": token}


# ── Helpers ────────────────────────────────────────────────────────────────


def _first_aud(aud):
    if isinstance(aud, list):
        return aud[0] if aud else None
    return aud


def _role_from_lti(roles: list[str]) -> str:
    roles_str = " ".join(roles).lower()
    if "instructor" in roles_str:
        return "instructor"
    if "teachingassistant" in roles_str or "/ta" in roles_str:
        return "ta"
    return "student"


def _extract_line_item_url(claims: dict) -> str | None:
    ags = claims.get("https://purl.imsglobal.org/spec/lti-ags/claim/endpoint") or {}
    return ags.get("lineitem")
