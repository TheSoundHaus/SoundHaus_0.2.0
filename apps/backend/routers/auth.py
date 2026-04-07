"""
Authentication endpoints – signup, login, logout, refresh, user, reset-password, OAuth.
Profile endpoints – get/update profile, upload/delete avatar.
"""

from fastapi.responses import JSONResponse
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File
from typing import Dict, Any
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import limiter, user_limiter, verify_token, get_auth
from logging_config import get_logger, log_external_service
from services.auth_service import SupabaseAuthService
from services.gitea_service import GiteaAdminService
from services.repo_service import RepoService
from services.profile_service import profile_service
from models.repo_models import RepoData
from models.profile_models import Profile
from models.schemas import (
    SignUpRequest,
    SignInRequest,
    UpdateUserRequest,
    ResetPasswordRequest,
    RefreshTokenRequest,
    ProfileUpdateRequest,
)
import re
import secrets

_PROFILE_PATH_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Signup ───────────────────────────────────────────────────────────────────

@router.post("/signup")
@limiter.limit(settings.rate_limit_signup)
async def signup(
    request: Request,
    signup_request: SignUpRequest,
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Register a new user and provision a matching Gitea account."""
    username = signup_request.name.strip()
    logger.info("signup", email=signup_request.email, username=username)

    # Validate username format before anything else
    try:
        profile_service._validate_username(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Check username uniqueness in our profiles table
    from models.profile_models import Profile
    existing = db.query(Profile).filter(Profile.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Username '{username}' is already taken")

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

    # Provision Gitea user with human-readable username (not UUID)
    gitea_result: Dict[str, Any]
    try:
        gitea = GiteaAdminService()
        logger.debug("signup", message="gitea service initialized")

        existing_user = gitea.get_user_by_username(username)

        if existing_user.get("exists"):
            logger.info("signup", gitea_user=username, message="Using existing Gitea account")
            gitea_result = {
                "success": True,
                "status": 200,
                "message": "Using existing SoundHaus Gitea account",
                "username": username,
                "data": existing_user.get("data"),
                "is_new": False,
            }
        else:
            logger.info("signup", gitea_user=username, message="Creating new Gitea user")
            pw_len = len(signup_request.password) if signup_request.password else 0
            logger.debug("signup", password_present=bool(signup_request.password), password_length=pw_len)

            gitea_result = gitea.create_user(
                username=username,
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

    # Create profile row in our database
    try:
        profile_result = profile_service.create_profile(
            user_id=supabase_user_id,
            username=username,
            email=signup_request.email,
            display_name=username,
            db=db,
        )
        if not profile_result.get("success"):
            logger.warning("signup", message=f"Profile creation issue: {profile_result.get('message')}")
    except Exception as e:
        logger.error("signup", service="profile", error=str(e), exc_info=True)

    return {"success": True, "supabase": sb, "gitea": gitea_result}


# ── Login / Logout / Refresh ─────────────────────────────────────────────────

@router.post("/login")
@limiter.limit(settings.rate_limit_auth)
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
    if not settings.password_reset_email_enabled:
        logger.warning(
            "password_reset_email_paused",
            message="POST /api/auth/reset-password blocked: PASSWORD_RESET_EMAIL_ENABLED is false",
        )
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "code": "password_reset_email_paused",
                "message": "Password reset by email is temporarily unavailable.",
            },
        )
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


# ── Profile ──────────────────────────────────────────────────────────────────

@router.get("/profile")
@user_limiter.limit("60/minute")
async def get_profile(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Get the current user's profile (username, display_name, bio, avatar_url)."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]
    profile = profile_service.get_profile(user_id, db)

    if not profile:
        # Auto-create a stub profile from Supabase metadata if missing
        email = user_res["user"].get("email", "")
        username = user_res["user"].get("user_metadata", {}).get("username", email.split("@")[0])
        result = profile_service.create_profile(
            user_id=user_id,
            username=username,
            email=email,
            display_name=username,
            db=db,
        )
        if result.get("success"):
            profile = result["profile"]
        else:
            raise HTTPException(status_code=500, detail="Could not create profile")

    return {"success": True, "profile": profile}


@router.put("/profile")
@user_limiter.limit("20/minute")
async def update_profile(
    request: Request,
    body: ProfileUpdateRequest,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Update display_name and/or bio for the current user."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]
    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.bio is not None:
        updates["bio"] = body.bio
    if body.is_public is not None:
        updates["is_public"] = body.is_public
    if body.social_instagram is not None:
        updates["social_instagram"] = body.social_instagram
    if body.social_youtube is not None:
        updates["social_youtube"] = body.social_youtube
    if body.social_spotify is not None:
        updates["social_spotify"] = body.social_spotify
    if body.social_twitter is not None:
        updates["social_twitter"] = body.social_twitter
    if body.social_website is not None:
        updates["social_website"] = body.social_website

    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")

    result = profile_service.update_profile(user_id, updates, db)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/profile/avatar")
@user_limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Upload or replace the current user's profile avatar."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]
    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"
    filename = file.filename or "avatar"

    result = profile_service.upload_avatar(user_id, file_bytes, content_type, filename, db)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.delete("/profile/avatar")
@user_limiter.limit("10/minute")
async def delete_avatar(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Remove the current user's profile avatar."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]
    result = profile_service.delete_avatar(user_id, db)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


# ── User Statistics ──────────────────────────────────────────────────────────

@router.get("/profile/stats")
@user_limiter.limit("30/minute")
async def get_user_stats(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Get aggregate statistics for the currently authenticated user."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]

    # ── DB aggregations (fast single-row queries) ────────────────────────
    total_owned = (
        db.query(func.count(RepoData.gitea_id))
        .filter(RepoData.owner_id == user_id)
        .scalar() or 0
    )
    total_commits = (
        db.query(func.sum(RepoData.total_commits))
        .filter(RepoData.owner_id == user_id)
        .scalar() or 0
    )
    total_clones = (
        db.query(func.sum(RepoData.clone_count))
        .filter(RepoData.owner_id == user_id)
        .scalar() or 0
    )

    # ── Gitea call for collaboration count + storage size ────────────────
    collaboration_count = 0
    total_size_kb = 0
    try:
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        gitea_username = profile.username if profile and profile.username else user_id
        svc = RepoService()
        gitea_result = svc.list_user_repos(gitea_username)
        if gitea_result.get("success"):
            owned_ids = gitea_result.get("owned_ids", set())
            all_repos = gitea_result.get("repos", [])
            collaboration_count = sum(
                1 for r in all_repos if r["id"] not in owned_ids
            )
            total_size_kb = sum(
                r.get("size", 0) for r in all_repos if r["id"] in owned_ids
            )
    except Exception as e:
        logger.warning("user_stats_gitea_error", user_id=user_id, error=str(e))

    return {
        "success": True,
        "stats": {
            "total_repos": total_owned,
            "total_commits": int(total_commits),
            "total_clones_received": int(total_clones),
            "collaborations": collaboration_count,
            "total_size_kb": total_size_kb,
        },
    }


# ── Public Profile ───────────────────────────────────────────────────────────

@router.get("/profile/{username}/public")
@limiter.limit("60/minute")
async def get_public_profile(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
):
    """Get a user's public profile by SoundHaus username or Supabase user id (no auth)."""
    profile = profile_service.get_profile_by_username(username, db)
    if not profile and _PROFILE_PATH_UUID.match(username):
        profile = profile_service.get_profile(username, db)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    is_public = profile.get("is_public", False)

    # Return only public-safe fields (exclude email and id)
    pub_username = profile.get("username") or profile.get("display_name") or profile.get("id") or ""
    return {
        "success": True,
        "is_public": is_public,
        "profile": {
            "username": pub_username,
            "display_name": profile["display_name"],
            "avatar_url": profile["avatar_url"],
            "bio": profile["bio"] if is_public else None,
            "created_at": profile["created_at"],
            "social_instagram": profile.get("social_instagram") if is_public else None,
            "social_youtube": profile.get("social_youtube") if is_public else None,
            "social_spotify": profile.get("social_spotify") if is_public else None,
            "social_twitter": profile.get("social_twitter") if is_public else None,
            "social_website": profile.get("social_website") if is_public else None,
        },
    }
