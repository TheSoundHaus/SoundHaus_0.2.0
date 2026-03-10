"""
Desktop app & Personal Access Token endpoints – desktop-login, PAT CRUD,
and Gitea credential provisioning.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional, Dict
from datetime import datetime, timezone

from database import get_db
from config import settings
from dependencies import (
    limiter,
    user_limiter,
    verify_token,
    verify_token_or_pat,
    get_auth,
)
from logging_config import get_logger
from services.auth_service import SupabaseAuthService
from services.gitea_service import GiteaAdminService
from services.pat_service import PATService
from models.schemas import SignInRequest
from models.gitea_token_models import GiteaToken

logger = get_logger(__name__)

router = APIRouter(prefix="/api", tags=["desktop"])


# ── Desktop Login ────────────────────────────────────────────────────────────

@router.post("/auth/desktop-login")
@limiter.limit("10/minute")
async def desktop_login(
    request: Request,
    login_request: SignInRequest,
    db: Session = Depends(get_db),
    auth_service: SupabaseAuthService = Depends(get_auth),
):
    """
    Desktop app login – authenticates, auto-provisions a Backend PAT,
    and returns both session tokens and PAT credentials.

    Unlike web login, this endpoint:
    1. Authenticates with email/password
    2. Automatically creates a Backend PAT for the desktop app
    3. Returns both session token (for UI) and PAT (for API calls)

    Desktop app workflow:
        1. User enters email/password in desktop login form
        2. Desktop calls this endpoint (instead of /api/auth/login)
        3. Receives PAT in response
        4. Stores PAT securely in OS keychain (electron-store + keytar)
        5. Uses PAT for all subsequent API calls
        6. On logout, revokes PAT via DELETE /api/auth/tokens/{token_id}

    Security:
        - PAT is ONLY returned once (like GitHub)
        - Desktop must store it securely
        - Old desktop PATs are auto-revoked on new login (prevents token sprawl)
    """
    # Step 1: Auth user with Supabase
    result = await auth_service.sign_in(
        email=login_request.email,
        password=login_request.password,
    )

    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))

    user_id = result["user"]["id"]

    # Step 2: Revoke any existing desktop PATs (cleanup old sessions)
    pat_service = PATService()
    existing_pats = await pat_service.list_pats(user_id, db)

    for pat in existing_pats:
        if pat.token_name.startswith("Desktop Auto Token"):
            await pat_service.revoke_pat(str(pat.id), user_id, db)

    # Step 3: Create new desktop PAT automatically
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    token_name = f"Desktop Auto Token {timestamp}"

    pat_result = await pat_service.create_pat(
        user_id=user_id,
        token_name=token_name,
        db=db,
        expires_in_days=90,
    )

    if not pat_result.get("success"):
        raise HTTPException(status_code=500, detail="Failed to create desktop credentials")

    # Step 4: Return combined response with auto-provisioned PAT
    return {
        "success": True,
        "user": result["user"],
        "session": result["session"],
        "desktop_credentials": {
            "pat": pat_result["token"],
            "pat_id": pat_result["token_id"],
            "expires_at": pat_result["expires_at"],
        },
        "message": "Desktop login successful. Credentials stored securely.",
    }


# ── PAT CRUD ─────────────────────────────────────────────────────────────────

@router.post("/auth/tokens")
@user_limiter.limit("10/minute")
async def create_personal_access_token(
    request: Request,
    request_body: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a Personal Access Token for desktop app authentication."""
    user_res = await get_auth().get_user(token)
    user_id = user_res["user"]["id"]

    token_name = request_body.get("token_name", "Unnamed_Token")
    expires_in_days = request_body.get("expires_in_days", 14)

    result = await PATService.create_pat(
        user_id=user_id,
        token_name=token_name,
        db=db,
        expires_in_days=expires_in_days,
    )

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to create token"))

    return result


@router.get("/auth/tokens")
@user_limiter.limit("60/minute")
async def list_personal_access_tokens(
    request: Request,
    user_info: Dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db),
):
    """List all PATs for the current user (metadata only)."""
    user_id = user_info["user_id"]

    pat_service = PATService()
    tokens = await pat_service.list_pats(user_id, db)

    token_list = []
    for t in tokens:
        scopes = []
        if t.scopes is not None:
            scopes = t.scopes.split(",")
        token_list.append({
            "id": t.id,
            "token_name": t.token_name,
            "token_prefix": t.token_prefix,
            "scopes": scopes,
            "last_used": t.last_used.isoformat() if t.last_used else None,
            "usage_count": t.usage_count,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
        })

    return {"success": True, "tokens": token_list}


@router.delete("/auth/tokens/{token_id}")
@user_limiter.limit("20/minute")
async def revoke_personal_access_token(
    request: Request,
    token_id: str,
    user_info: Dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db),
):
    """Revoke (soft-delete) a Personal Access Token."""
    pat_service = PATService()
    user_id = user_info["user_id"]

    result = await pat_service.revoke_pat(token_id, user_id, db)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("message", "Token not found or unauthorized"))

    return {"success": True, "token_id": token_id, "message": "Token revoked successfully"}


# ── Gitea Desktop Credentials ───────────────────────────────────────────────

@router.get("/desktop/credentials")
@user_limiter.limit("10/minute")
async def get_desktop_credentials(
    request: Request,
    user_info: Dict = Depends(verify_token_or_pat),
    cached_gitea_token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Get Gitea credentials for git operations (works for both web and desktop).

    Desktop: Passes cached_gitea_token parameter from OS keychain
    Web: Token is looked up from database cache

    Either reuses a cached Gitea PAT or creates a new one if invalid/missing.
    """
    user_id = user_info["user_id"]
    gitea_admin_service = GiteaAdminService()

    # Try desktop's parameter-based cache first (for backward compatibility)
    if cached_gitea_token:
        logger.info("get_desktop_credentials", action="validating_desktop_cached_token")
        token_check = gitea_admin_service.verify_gitea_token(cached_gitea_token)
        if token_check.get("valid"):
            logger.info("get_desktop_credentials", action="desktop_cached_token_valid")
            return {
                "success": True,
                "gitea_url": settings.gitea_public_url,
                "username": user_id,
                "token": cached_gitea_token,
                "clone_url_format": f"{settings.gitea_public_url}/{user_id}/{{repo_name}}.git",
            }
        else:
            logger.info("get_desktop_credentials", action="desktop_cached_token_invalid")

    # Try database cache (for web users or if desktop cache failed)
    db_token = db.query(GiteaToken).filter(
        GiteaToken.user_id == user_id,
        (GiteaToken.is_revoked == False) | (GiteaToken.is_revoked.is_(None))
    ).first()

    if db_token:
        logger.info("get_desktop_credentials", action="validating_db_cached_token", user_id=user_id)
        # Verify the stored token is still valid with Gitea
        # Note: We store the plaintext token in token_hash for Gitea tokens
        # (unlike PATs which are bcrypt hashed, Gitea tokens need to be retrievable)
        token_check = gitea_admin_service.verify_gitea_token(db_token.token_hash)
        if token_check.get("valid"):
            logger.info("get_desktop_credentials", action="db_cached_token_valid")
            # Update last_used timestamp
            db_token.last_used = datetime.now(timezone.utc)
            db_token.usage_count = (db_token.usage_count or 0) + 1
            db.commit()
            return {
                "success": True,
                "gitea_url": settings.gitea_public_url,
                "username": user_id,
                "token": db_token.token_hash,
                "clone_url_format": f"{settings.gitea_public_url}/{user_id}/{{repo_name}}.git",
            }
        else:
            logger.info("get_desktop_credentials", action="db_cached_token_invalid_revoking")
            # Token invalid, mark as revoked
            db_token.is_revoked = True
            db.commit()

    # Create a new Gitea token
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
    # Determine source based on auth type
    auth_type = user_info.get("auth_type", "unknown")
    created_via = "desktop" if auth_type == "pat" else "web"
    token_name = f"{created_via.capitalize()} Access Token - {timestamp}"

    logger.info("get_desktop_credentials", action="creating_new_gitea_token", created_via=created_via)
    gitea_result = gitea_admin_service.create_or_get_user_token(user_id, token_name)

    if not gitea_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=gitea_result.get("message", "Failed to get Gitea credentials"),
        )

    new_token = gitea_result["token"]["sha1"]

    # Store the new token in database for future reuse
    try:
        new_gitea_token = GiteaToken(
            user_id=user_id,
            token_hash=new_token,  # Store plaintext for Gitea (needs to be retrievable)
            token_prefix=new_token[:16] if len(new_token) >= 16 else new_token[:8],
            token_name=token_name,
            created_via=created_via,
            scopes='["write:repository", "read:user"]',  # Default Gitea scopes
        )
        db.add(new_gitea_token)
        db.commit()
        logger.info("get_desktop_credentials", action="stored_new_token_in_db", user_id=user_id)
    except Exception as e:
        logger.error("get_desktop_credentials", action="failed_to_store_token", error=str(e))
        # Don't fail the request if DB storage fails, just log it
        db.rollback()

    return {
        "success": True,
        "gitea_url": settings.gitea_public_url,
        "username": user_id,
        "token": new_token,
        "clone_url_format": f"{settings.gitea_public_url}/{user_id}/{{repo_name}}.git",
    }
