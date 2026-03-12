"""
Authentication endpoints – signup, login, logout, refresh, user, reset-password, OAuth.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Dict, Any
from sqlalchemy.orm import Session

from database import get_db
from dependencies import limiter, user_limiter, verify_token, get_auth
from logging_config import get_logger, log_external_service
from services.auth_service import SupabaseAuthService
from services.gitea_service import GiteaAdminService
from services.gitea_token_service import GiteaTokenService
from models.schemas import (
    SignUpRequest,
    SignInRequest,
    UpdateUserRequest,
    ResetPasswordRequest,
    RefreshTokenRequest,
)
import secrets

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Signup ───────────────────────────────────────────────────────────────────

@router.post("/signup")
@limiter.limit("5/minute")
async def signup(
    request: Request,
    signup_request: SignUpRequest,
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Register a new user and provision a matching Gitea account with persistent token."""
    logger.info("signup", email=signup_request.email)

    sb = await auth_service.sign_up(
        email=signup_request.email,
        password=signup_request.password,
        metadata=signup_request.metadata,
    )

    if not sb.get("success"):
        logger.warning("signup", status="failed", service="supabase", message=sb.get("message"))
        raise HTTPException(status_code=400, detail=sb.get("message"))

    supabase_user_id = sb.get("user", {}).get("id")
    if not supabase_user_id:
        raise HTTPException(status_code=500, detail="Supabase user created but no ID returned")

    # Provision Gitea user with Supabase UUID as username
    gitea_result: Dict[str, Any]
    try:
        gitea = GiteaAdminService()
        logger.debug("signup", message="gitea service initialized")

        existing_user = gitea.get_user_by_username(supabase_user_id)

        if existing_user.get("exists"):
            logger.info("signup", gitea_user=supabase_user_id, message="Using existing Gitea account")
            gitea_result = {
                "success": True,
                "status": 200,
                "message": "Using existing SoundHaus Gitea account",
                "username": supabase_user_id,
                "data": existing_user.get("data"),
                "is_new": False,
            }
        else:
            logger.info("signup", gitea_user=supabase_user_id, message="Creating new Gitea user")
            pw_len = len(signup_request.password) if signup_request.password else 0
            logger.debug("signup", password_present=bool(signup_request.password), password_length=pw_len)

            gitea_result = gitea.create_user(
                username=supabase_user_id,
                email=signup_request.email,
                password=(
                    signup_request.password
                    if signup_request.password and signup_request.password.strip()
                    else secrets.token_urlsafe(32)
                ),
                visibility="private",
            )
            gitea_result["is_new"] = True

        log_external_service(
            logger, "gitea", "create_user",
            success=gitea_result.get("success", False),
            status_code=gitea_result.get("status"),
        )
    except Exception as e:
        gitea_result = {
            "success": False,
            "status": 0,
            "message": f"Gitea provisioning error: {e}",
        }
        logger.error("signup", service="gitea", error=str(e), exc_info=True)

    # Gitea token creation disabled for web-only flow
    # Users don't need git credentials for web-based operations
    # The backend uses admin token for all Gitea operations on behalf of users
    # Note: Re-enable this for Desktop app or if users need local git access
    logger.info("signup", action="gitea_token_skipped", reason="web_only_flow", user_id=supabase_user_id)

    return {
        "success": True,
        "supabase": sb,
        "gitea": gitea_result,
    }


# ── Login / Logout / Refresh ─────────────────────────────────────────────────

@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    login_request: SignInRequest,
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Sign in an existing user with email and password."""
    result = await auth_service.sign_in(
        email=login_request.email,
        password=login_request.password,
    )
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    return result


@router.post("/logout")
@user_limiter.limit("30/minute")
async def logout(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Sign out the current user."""
    result = await auth_service.sign_out(token)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/refresh")
@limiter.limit("20/minute")
async def refresh_session(
    request: Request,
    refresh_request: RefreshTokenRequest,
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Refresh an expired access token using a refresh token."""
    result = await auth_service.refresh_session(refresh_request.refresh_token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    return result


# ── User CRUD ────────────────────────────────────────────────────────────────

@router.get("/user")
@user_limiter.limit("60/minute")
async def get_current_user(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Get the current authenticated user's information."""
    result = await auth_service.get_user(token)
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    return result


@router.patch("/user")
@user_limiter.limit("10/minute")
async def update_user(
    request: Request,
    update_request: UpdateUserRequest,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Update the current user's information."""
    updates = {}
    if update_request.email:
        updates["email"] = update_request.email
    if update_request.password:
        updates["password"] = update_request.password
    if update_request.data:
        updates["data"] = update_request.data

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    result = await auth_service.update_user(token, updates)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── Password Reset ───────────────────────────────────────────────────────────

@router.post("/reset-password")
@limiter.limit("3/minute")
async def reset_password(
    request: Request,
    reset_request: ResetPasswordRequest,
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Send a password reset email to the user."""
    result = await auth_service.reset_password_email(reset_request.email)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── OAuth ────────────────────────────────────────────────────────────────────

@router.get("/oauth/{provider}")
@limiter.limit("10/minute")
async def oauth_signin(
    request: Request,
    provider: str,
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """Initiate OAuth sign in with a provider (google, github, etc.)."""
    result = await auth_service.sign_in_with_oauth(provider)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result
