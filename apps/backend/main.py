from database import get_db, init_db, test_connection, SessionLocal
from fastapi import FastAPI, HTTPException, Depends, Header, Response, File, UploadFile, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from logging_config import get_logger, log_error, log_external_service, log_db_operation
from typing import Optional, Dict, Any
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from services.repo_service import RepoService
from services.gitea_service import GiteaAdminService
from services.auth_service import get_auth_service, SupabaseAuthService
from services.pat_service import PATService
from services.webhook_service import webhook_service
from models.repo_models import RepoData
from models.clone_models import CloneEvent
from models.genre_models import GenreList, repo_genres
from models.pat_models import PersonalAccessToken
from models.invitation_models import CollaboratorInvitation
from models.webhook_models import (
    WebhookDelivery, PushEvent, RepositoryEvent, WebhookConfig,
    validate_webhook_signature, parse_gitea_event, extract_repo_info
)
import hashlib
import os
import sys
import uuid
import secrets
import subprocess
import traceback
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from pathlib import Path
from models.schemas import (
    SignUpRequest,
    SignInRequest,
    UpdateUserRequest,
    ResetPasswordRequest,
    RefreshTokenRequest,
    CreateRepoRequest,
    UploadFileRequest,
    DeleteFileRequest,
    WatchStartRequest,
    SpawnWorkerRequest,
    RepoPreferencesRequest,
)
from config import settings
from middlewares.security_headers import SecurityHeadersMiddleware

# Load environment variables
load_dotenv()

# Helper function for user-based rate limiting
def get_user_or_ip(request: Request) -> str:
    """
    Rate limit by user ID if authenticated, otherwise by IP.
    This prevents one user from consuming all rate limits behind a shared IP (like NAT).
    """
    # Try to get user from request state (set by verify_token dependency)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    
    # Fall back to IP address
    return get_remote_address(request)

def format_bytes(bytes_size: int) -> str:
    """Convert bytes to human-readable format (KB, MB, GB)."""
    if bytes_size < 1024:
        return f"{bytes_size} bytes"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    elif bytes_size < 1024 * 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_size / (1024 * 1024 * 1024):.1f} GB"

# Initialize IP-based limiter with config
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
    enabled=settings.rate_limit_enabled  # Easy to disable in dev
)

# Initialize user-based limiter for authenticated endpoints
user_limiter = Limiter(
    key_func=get_user_or_ip,
    default_limits=[settings.rate_limit_default],
    enabled=settings.rate_limit_enabled
)

# Other app constants
MAX_TOKENS_PER_USER = 10
DEFAULT_TOKEN_EXPIRY_DAYS = 90
MAX_AUDIO_SNIPPET_SIZE = 10 * 1024 * 1024  # 10MB limit for audio snippet uploads

app = FastAPI(title="SoundHaus API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)



# CORS middleware for React frontend (Vite defaults to 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$" if settings.is_development else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "X-CSRF-Token",
    ],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Add security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Initialize logger for main module
logger = get_logger(__name__)

# Database initialization - call immediately when module loads
logger.info("api_startup", message="Starting SoundHaus API")
logger.info("db_init", message="Attempting database connection")
try:
    if test_connection():
        logger.info("db_connection", status="success", message="Database connection successful")
        logger.info("db_init", message="Creating database tables")
        init_db()
        logger.info("db_init", status="success", message="Database initialized and ready")
    else:
        logger.error("db_connection", status="failed", message="Database connection failed! Check your DATABASE_URL")
except Exception as e:
    logger.error("db_init", status="failed", error=str(e), exc_info=True)

# Dependency to get auth service
def get_auth() -> SupabaseAuthService:
    return get_auth_service()

# Dependency to extract and verify token
async def verify_token(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth)
) -> str:
    """Extract and verify JWT token from Authorization header."""
    logger.debug("verify_token", authorization_present=bool(authorization))
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning("verify_token", status="failed", reason="missing_or_invalid_header")
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.replace("Bearer ", "")
    logger.debug("verify_token", token_prefix=token[:20])
    is_valid = await auth_service.verify_token(token)
    logger.debug("verify_token", is_valid=is_valid)
    
    if not is_valid:
        logger.warning("verify_token", status="failed", reason="invalid_token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    logger.debug("verify_token", status="success")
    return token

# Dependency to verify either JWT token or Personal Access Token
async def verify_token_or_pat(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Verify either a Supabase JWT token or a Personal Access Token.
    This enables both web users (JWT) and desktop users (PAT) to access protected endpoints.
    
    Args:
        authorization: Authorization header ("Bearer <jwt>" or "token <pat>")
        auth_service: The Supabase auth service instance
        db: Database session for PAT lookups
    
    Returns:
        Dict with user_id, email/pat_id, and auth_type
    
    Raises:
        HTTPException: 401 if credentials are invalid or missing
    
    Example usage in an endpoint:
        @app.get("/api/protected")
        async def protected_route(user_info: Dict = Depends(verify_token_or_pat)):
            user_id = user_info["user_id"]
            auth_type = user_info["auth_type"]  # "jwt" or "pat"
            # ... your endpoint logic
    """

    print(f"[verify_token_or_pat] Authorization header: {authorization[:50] if authorization else 'MISSING'}...")

    user_info = await auth_service.verify_token_or_pat(authorization, db)

    print(f"[verify_token_or_pat] Result: {user_info}")

    if user_info is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing authentication credentials"
        )
    return user_info

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "SoundHaus API", "version": "1.0.0", "status": "running"}

# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy"}

# ============== AUTH ENDPOINTS ==============

@app.post("/api/auth/signup")
@limiter.limit("5/minute")
async def signup(request: Request, signup_request: SignUpRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Register a new user with email and password, and provision a matching Gitea account.

    Workflow:
    1) Create user in Supabase
    2) If Supabase succeeds, create corresponding user in Gitea using admin API
    """
    logger.info("signup", email=signup_request.email)
    sb = await auth_service.sign_up(
        email=signup_request.email,
        password=signup_request.password,
        metadata=signup_request.metadata,
    )

    if not sb.get("success"):
        logger.warning("signup", status="failed", service="supabase", message=sb.get("message"))
        raise HTTPException(status_code=400, detail=sb.get("message"))

    # Get Supabase user ID to use as Gitea username
    supabase_user_id = sb.get("user", {}).get("id")
    if not supabase_user_id:
        raise HTTPException(status_code=500, detail="Supabase user created but no ID returned")

    # Provision Gitea user with Supabase UUID as username
    gitea_result: Dict[str, Any]
    try:
        gitea = GiteaAdminService()
        logger.debug("signup", message="gitea service initialized")
        
        # Check if Gitea user already exists with this Supabase UUID
        existing_user = gitea.get_user_by_username(supabase_user_id)
        
        if existing_user.get("exists"):
            logger.info("signup", gitea_user=supabase_user_id, message="Using existing Gitea account")
            gitea_result = {
                "success": True,
                "status": 200,
                "message": "Using existing SoundHaus Gitea account",
                "username": supabase_user_id,
                "data": existing_user.get("data"),
                "is_new": False
            }
        else:
            # Create new Gitea user with email alias for isolation
            logger.info("signup", gitea_user=supabase_user_id, message="Creating new Gitea user")
            pw_len = len(signup_request.password) if signup_request.password else 0
            logger.debug("signup", password_present=bool(signup_request.password), password_length=pw_len)
            
            gitea_result = gitea.create_user(
                username=supabase_user_id,
                email=signup_request.email,  # Will be converted to +soundhaus alias internally
                password=signup_request.password if signup_request.password and signup_request.password.strip() else secrets.token_urlsafe(32),
                visibility="private"  # Hide from public user lists
            )
            gitea_result["is_new"] = True

        log_external_service(logger, "gitea", "create_user", success=gitea_result.get("success", False), status_code=gitea_result.get("status"))
    except Exception as e:  # configuration or runtime error
        gitea_result = {
            "success": False,
            "status": 0,
            "message": f"Gitea provisioning error: {e}",
        }
        logger.error("signup", service="gitea", error=str(e), exc_info=True)

    # Combine response
    return {
        "success": True,
        "supabase": sb,
        "gitea": gitea_result,
    }

@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, login_request: SignInRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Sign in an existing user with email and password."""
    result = await auth_service.sign_in(
        email=login_request.email,
        password=login_request.password
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.post("/api/auth/logout")
@user_limiter.limit("30/minute")  # User-based: higher limit since they're authenticated
async def logout(request: Request, token: str = Depends(verify_token), auth_service: SupabaseAuthService = Depends(get_auth)):
    """Sign out the current user."""
    result = await auth_service.sign_out(token)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

@app.post("/api/auth/refresh")
@limiter.limit("20/minute")  # IP-based: users may refresh frequently
async def refresh_session(request: Request, refresh_request: RefreshTokenRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Refresh an expired access token using a refresh token."""
    result = await auth_service.refresh_session(refresh_request.refresh_token)
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.get("/api/auth/user")
@user_limiter.limit("60/minute")  # User-based: frequent polling for user info
async def get_current_user(request: Request, token: str = Depends(verify_token), auth_service: SupabaseAuthService = Depends(get_auth)):
    """Get the current authenticated user's information."""
    result = await auth_service.get_user(token)
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.patch("/api/auth/user")
@user_limiter.limit("10/minute")  # User-based: updating user info should be limited
async def update_user(
    request: Request,
    update_request: UpdateUserRequest,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
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

@app.post("/api/auth/reset-password")
@limiter.limit("3/minute")
async def reset_password(request: Request, reset_request: ResetPasswordRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Send a password reset email to the user."""
    result = await auth_service.reset_password_email(reset_request.email)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

@app.get("/api/auth/oauth/{provider}")
@limiter.limit("10/minute")  # IP-based: prevent OAuth abuse
async def oauth_signin(request: Request, provider: str, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Initiate OAuth sign in with a provider (google, github, etc.)."""
    result = await auth_service.sign_in_with_oauth(provider)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

# ============== PROTECTED ENDPOINTS ==============

@app.get("/repos")
@user_limiter.limit("60/minute")  # User-based: allow frequent repo list checks
async def list_repos(request: Request, token: str = Depends(verify_token)):
    """List Gitea repositories for the current user (protected)."""
    logger.debug("list_repos", endpoint="/repos", method="GET")
    user_res = await get_auth().get_user(token)
    logger.debug("list_repos", get_user_success=user_res.get('success'))
    if not user_res.get("success"):
        logger.warning("list_repos", status="failed", reason="user_fetch_failed", message=user_res.get('message'))
        raise HTTPException(status_code=401, detail=user_res.get("message", "Unable to fetch user"))
    
    user_id = user_res["user"]["id"]
    logger.debug("list_repos", user_id=user_id)

    gitea_username = user_id
    logger.debug("list_repos", gitea_username=gitea_username)
    svc = RepoService()
    res = svc.list_user_repos(gitea_username)
    logger.info("list_repos", success=res.get('success'), repo_count=len(res.get('repos', [])))
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to list repos"))
    return {"success": True, "repos": res.get("repos", [])}


@app.post("/repos")
@user_limiter.limit("20/minute")  # User-based: prevent repo spam per user
async def create_repo(request: Request, create_request: CreateRepoRequest, token: str = Depends(verify_token), db: Session = Depends(get_db)):
    """Create a new Gitea repository for the current user (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")
    
    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    res = svc.create_user_repo(gitea_username, create_request.name, db, description=create_request.description or "", private=create_request.private)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to create repo"))
    
    # Create RepoData entry in our database (audio_snippet starts as None)
    gitea_id = f"{gitea_username}/{create_request.name}"
    repo_data = RepoData(
        gitea_id=gitea_id,
        audio_snippet=None,  # Will be set later via POST /repos/{owner}/{repo}/snippet
        clone_count=0,
        owner_id=user_id  # Add owner_id for repository isolation
    )
    db.add(repo_data)
    db.commit()
    db.refresh(repo_data)
    
    # Auto-create webhook for push/create/delete notifications
    webhook_result = None
    try:
        gitea_admin = GiteaAdminService()
        webhook_result = webhook_service.setup_webhook_for_repo(
            owner=gitea_username,
            repo=create_request.name,
            gitea_admin=gitea_admin,
            db=db
        )
        db.commit()
        if webhook_result.get("success"):
            logger.info("webhook_auto_created",
                        repo=gitea_id,
                        webhook_id=webhook_result.get("webhook_id"))
        else:
            logger.warning("webhook_auto_create_failed",
                           repo=gitea_id,
                           error=webhook_result.get("message"))
    except Exception as e:
        # Don't fail repo creation if webhook setup fails
        logger.error("webhook_auto_create_error",
                     repo=gitea_id,
                     error=str(e))
    
    return {
        "success": True,
        "repo": res.get("repo"),
        "repo_data": {"gitea_id": repo_data.gitea_id},
        "webhook": webhook_result
    }

@app.get("/repos/{repo_name}/contents")
@user_limiter.limit("100/minute")  # User-based: file browsing can be frequent
async def get_repo_contents(request: Request, repo_name: str, path: str = "", token: str = Depends(verify_token)):
    """Get contents of a repository at a specific path (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id    
    svc = RepoService()
    res = svc.get_repo_contents(gitea_username, repo_name, path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to fetch repo contents"))
    return {"success": True, "contents": res.get("contents")}

@app.post("/repos/{repo_name}/upload")
@user_limiter.limit("30/minute")  # User-based: reasonable upload frequency
async def upload_file(request: Request, repo_name: str, upload_request: UploadFileRequest, token: str = Depends(verify_token)):
    """Upload a file to a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = upload_request.branch or "main"
    res = svc.upload_file(gitea_username, repo_name, upload_request.file_path, upload_request.content, upload_request.message, branch)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to upload file"))
    return {"success": True, "file": res.get("file")}


@app.patch("/repos/{owner}/{repo}/settings")
@user_limiter.limit("20/minute")  # User-based: prevent setting spam
async def patch_repo_settings(request: Request, owner: str, repo: str, settings: dict, token: str = Depends(verify_token)):
    """Update repository settings by delegating to Gitea (protected).

    This endpoint verifies the authenticated user owns the repo (owner must match)
    and then calls the RepoService which uses Gitea's PATCH /api/v1/repos/{owner}/{repo}.
    """
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    # Ensure the requester is the repo owner
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not authorized to modify this repo")

    svc = RepoService()
    res = svc.update_repo_settings(owner, repo, settings)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to update repo settings"))
    return {"success": True, "repo": res.get("repo")}


# TODO: Decide if these endpoints need to be deleted or not, I am confused as to 
# why they exist. -NATHAN
# # In-memory repo preferences storage (TODO: Move to database for persistence)
# # Format: {user_id: {repo_name: {local_path: str, ...}}}
# repo_preferences: Dict[str, Dict[str, Dict[str, Any]]] = {}

# # ============== REPO PREFERENCES ENDPOINTS ==============

# @app.get("/repos/{repo_name}/preferences")
# @user_limiter.limit("60/minute")  # User-based: desktop app may check frequently
# async def get_repo_preferences(request: Request, repo_name: str, token: str = Depends(verify_token)):
#     """Get preferences for a specific repository."""
#     user_res = await get_auth().get_user(token)
#     if not user_res.get("success"):
#         raise HTTPException(status_code=401, detail="Unable to fetch user")
    
#     user_id = user_res["user"]["id"]
    
#     if user_id not in repo_preferences:
#         return {"success": True, "preferences": None}
    
#     prefs = repo_preferences[user_id].get(repo_name)
#     return {"success": True, "preferences": prefs}

# @app.post("/repos/{repo_name}/preferences")
# @user_limiter.limit("30/minute")  # User-based: reasonable save frequency
# async def save_repo_preferences(request: Request, repo_name: str, pref_request: RepoPreferencesRequest, token: str = Depends(verify_token)):
#     """Save preferences for a specific repository."""
#     user_res = await get_auth().get_user(token)
#     if not user_res.get("success"):
#         raise HTTPException(status_code=401, detail="Unable to fetch user")
    
#     user_id = user_res["user"]["id"]
    
#     if user_id not in repo_preferences:
#         repo_preferences[user_id] = {}
    
#     repo_preferences[user_id][repo_name] = {
#         "local_path": pref_request.local_path,
#         "updated_at": datetime.utcnow().isoformat()
#     }
    
#     return {
#         "success": True,
#         "preferences": repo_preferences[user_id][repo_name]
#     }

# ============== REPO DATA ENDPOINTS ==============

# Post update to clone table
@app.post("/repos/{owner}/{repo}/clone")
@limiter.limit("30/minute")
async def record_clone_event(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Record a clone event for a repository (first clone only per user)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in to clone")
    
    user_id = user_res["user"]["id"]
    repo_id = f"{owner}/{repo}"

    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data: 
        raise HTTPException(
            status_code=404,
            detail="Repository not found. Owner must register it on Soundhaus."
        )
    
    try:
        clone_event = CloneEvent(repo_id=repo_id, user_id=user_id)
        db.add(clone_event)

        repo_data.clone_count += 1

        db.commit()
    
    except IntegrityError:
        db.rollback()


    return {
        "success": True,
        "message": "Clone recorded!",
        "repo_id": repo_id,
        "total_clones": repo_data.clone_count,
        "clone_url": f"{settings.gitea_public_url}/{repo_id}.git"
    }

# Get count of clones
# Get repo snippet from url
# Post snippet to URL (this might be more suited for the desktop backend?)


# ============== COLLABORATOR ENDPOINTS ==============

# Collaborator invitation storage
@app.post("/repos/{repo_name}/collaborators/invite")
@limiter.limit("10/minute")
async def invite_collaborator(
    request: Request,
    repo_name: str,
    request_body: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Invite a user to collaborate on a repository."""
    try:

        user_res = await get_auth().get_user(token)
        
        if not user_res.get("success"):
            return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

        user_id = user_res["user"]["id"]
        email = user_res["user"]["email"]

        owner_username = user_id

        # Verify repo exists
        repo_service = RepoService()
        repo_check = repo_service.get_repo(owner_username, repo_name)
        if not repo_check.get("success"):
            return JSONResponse({"success": False, "message": "Repository not found"}, status_code=404)
        
        invitee_email = request_body.get("email")
        permission = request_body.get("permission", "write")  # read, write, admin
        
        if not invitee_email:
            return JSONResponse({"success": False, "message": "Email required"}, status_code=400)
        
        # TODO: Check if inviter user exists in Supabase
        
        # Generate invitation
        invitation_id = str(uuid.uuid4())
        invitation_token = secrets.token_urlsafe(32)
        
        invitation = CollaboratorInvitation(
            id = invitation_id,
            invitation_token = invitation_token,
            repo_name = repo_name,
            owner_email = email,
            owner_username = owner_username,
            invitee_email = invitee_email,
            permission = permission,
            status = "pending",
            created_at = datetime.now(timezone.utc),
            expires_at = (datetime.now(timezone.utc) + timedelta(days=7))
        )

        db.add(invitation)
        db.commit()
        db.refresh(invitation)
       
        return {
            "success": True,
            "invitation_id": invitation_id,
            "message": f"Invitation sent to {invitee_email}",
            "expires_at": invitation.expires_at.isoformat()
        }
    except IntegrityError as e:
        db.rollback()
        logger.error("invite_collaborator", error=str(e), error_type="integrity_error")
        raise HTTPException(
            statuscode=400,
            detail=f"Failed to add invitation to database: {e}, database constraint violation"
        )
    except Exception as e:
        db.rollback()
        logger.error("invite_collaborator", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create invitation: {str(e)}"
        )


@app.get("/repos/{repo_name}/collaborators")
@user_limiter.limit("60/minute")  # User-based: allow frequent collaboration checks
async def list_collaborators(
    request: Request,
    repo_name: str,
    token: str = Depends(verify_token)
):
    """List all collaborators for a repository."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    gitea_username = user_id

    repo_service = RepoService()
    result = repo_service.list_collaborators(gitea_username, repo_name)

    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    
    return {"success": True, "collaborators": result.get("collaborators", [])}

@app.get("/invitations/pending")
@user_limiter.limit("60/minute")  # User-based: allow checking for invitations
async def get_pending_invitations(
    request: Request,
    token: str = Depends(verify_token), 
    db: Session = Depends(get_db)
    ):

    """Get all pending invitations for the current user."""
    try:
        user_res = await get_auth().get_user(token)
        
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        email = user_res["user"]["email"]
        
        # Properly chain the query
        invitations = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.invitee_email == email,
            CollaboratorInvitation.status == "pending",
            CollaboratorInvitation.expires_at > datetime.now(timezone.utc)
        ).all()
        
        invitation_list = [
            {
                "id": inv.id,
                "repo_name": inv.repo_name,
                "owner_username": inv.owner_username,
                "owner_email": inv.owner_email,
                "permission": inv.permission,
                "created_at": inv.created_at.isoformat(),
                "expires_at": inv.expires_at.isoformat()
            }
            for inv in invitations
        ]
        
        return {"success": True, "invitations": invitation_list}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_pending_invitations", error=str(e), exc_info=True)
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch invitations"
        )

@app.post("/invitations/{invitation_id}/accept")
@user_limiter.limit("20/minute")  # User-based: accepting invitations
async def accept_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Accept a collaboration invitation."""
    try:
        user_res = await get_auth().get_user(token)
        
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = user_res["user"]["id"]
        email = user_res["user"]["email"]
        
        # Query database for invitation (properly chained)
        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Use dot notation for SQLAlchemy objects!
        if invitation.invitee_email != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")
        
        if invitation.status != "pending":
            raise HTTPException(
                status_code=400,
                detail=f"Invitation already {invitation.status}"
            )
        
        if invitation.expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invitation has expired")
        
        # Generate username for invitee
        gitea = GiteaAdminService()
        invitee_username = user_id
        
        # Check if user exists in Gitea, create if not
        user_check = gitea.get_user_by_username(invitee_username)
        if not user_check.get("exists"):
            logger.info("accept_invitation", action="creating_gitea_user", username=invitee_username)
            
            create_result = gitea.create_user(
                username=invitee_username,
                email=email,
                password=secrets.token_urlsafe(32),
            )
            
            if not create_result.get("success"):
                logger.error("accept_invitation", action="create_gitea_user", status="failed", message=create_result.get('message'))
                raise HTTPException(
                    status_code=500,
                    detail="Failed to provision Git account"
                )
        
        # Add collaborator to repository
        repo_service = RepoService()
        result = repo_service.add_collaborator(
            invitation.owner_username,
            invitation.repo_name,
            invitee_username,
            invitation.permission
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to add collaborator: {result.get('message')}"
            )
        
        # Mark invitation as accepted
        invitation.status = "accepted"
        invitation.responded_at = datetime.now(timezone.utc)
        db.commit()
        
        return {
            "success": True,
            "message": f"You are now a collaborator on {invitation.repo_name}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("accept_invitation", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to accept invitation"
        )

@app.post("/invitations/{invitation_id}/decline")
@user_limiter.limit("20/minute")  # User-based: declining invitations
async def decline_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Decline a collaboration invitation."""
    try:
        user_res = await get_auth().get_user(token)
        
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")
        
        email = user_res["user"]["email"]
        
        # Properly chained query
        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()
        
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        
        # Dot notation!
        if invitation.invitee_email != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")
        
        # Mark invitation as declined
        invitation.status = "declined"
        invitation.responded_at = datetime.now(timezone.utc)
        db.commit()
        
        return {"success": True, "message": "Invitation declined"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("decline_invitation", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to decline invitation"
        )

@app.delete("/repos/{repo_name}/collaborators/{username}")
@user_limiter.limit("20/minute")  # User-based: removing collaborators
async def remove_collaborator(
    request: Request,
    repo_name: str,
    username: str,
    token: str = Depends(verify_token)
):
    """Remove a collaborator from a repository."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    owner_username = user_id

    repo_service = RepoService()
    result = repo_service.remove_collaborator(owner_username, repo_name, username)
    
    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    
    return {"success": True, "message": f"Collaborator {username} removed"}

# ============== DESKTOP APP / PAT ENDPOINTS ==============
# These endpoints support the desktop Git client (replacing file watcher system)

@app.post("/api/auth/desktop-login")
@limiter.limit("10/minute")
async def desktop_login(
    request: Request,
    login_request: SignInRequest,
    db: Session = Depends(get_db),
    auth_service:SupabaseAuthService = Depends(get_auth)
):
    """
    Desktop app login endpoint that automatically provisions a Backend PAT.
    
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
        password=login_request.password
    )

    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    user_id = result["user"]["id"]

    # Step 2: Revoke any existing desktop PATs (cleanup old sessions)
    pat_service = PATService()
    existing_pats = await pat_service.list_pats(user_id, db)

    # Step 2: Revoke old desktop tokens to prevent sprawl
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
        expires_in_days=90  # 3 months, user can stay logged in
    )
    
    if not pat_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail="Failed to create desktop credentials"
        )
    
    # Step 4: Return combined response with auto-provisioned PAT
    return {
        "success": True,
        "user": result["user"],
        "session": result["session"],  # For UI state management
        "desktop_credentials": {
            "pat": pat_result["token"],  # ONLY TIME THIS IS VISIBLE!
            "pat_id": pat_result["token_id"],
            "expires_at": pat_result["expires_at"]
        },
        "message": "Desktop login successful. Credentials stored securely."
    }



@app.post("/api/auth/tokens")
@user_limiter.limit("10/minute")  # User-based: prevent PAT spam
async def create_personal_access_token(
    request: Request,
    request_body: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Create a Personal Access Token for desktop app authentication.
    
    Request body:
        - token_name: User-friendly name for the token (default: "Unnamed_Token")
        - expires_in_days: Days until expiration (default: 14, null = never expires)
    
    Returns:
        - success: True
        - token: The raw token (ONLY TIME USER SEES IT - must save!)
        - token_id: UUID of the created token
        - token_name: Name of the token
        - token_prefix: First 16 chars for identification (e.g., "soundh_abc123...")
        - created_at: ISO timestamp
        - expires_at: ISO timestamp or null
        - message: Warning to save the token
    
    Security notes:
        - NEVER store raw token, only bcrypt hash
        - Uses secrets.token_urlsafe() for secure generation
    """

    user_res = await get_auth().get_user(token)
    user_id = user_res["user"]["id"]  # Supabase UUID

    token_name = request_body.get("token_name", "Unnamed_Token")
    expires_in_days = request_body.get("expires_in_days", 14)

    result = await PATService.create_pat(
        user_id=user_id,
        token_name=token_name,
        db=db,
        expires_in_days=expires_in_days
    )

    # Need to check if it succeeded:
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "Failed to create token")
        )

    # Return the result (contains the token!):
    return result

@app.get("/api/auth/tokens")
@user_limiter.limit("60/minute")  # User-based: allow checking tokens
async def list_personal_access_tokens(
    request: Request,
    user_info: Dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db)
):
    """
    List all Personal Access Tokens for the current user.
    Shows metadata only - never shows actual token values.
    
    Frontend usage:
        - Display in "Active Tokens" table in Settings page
        - Show last_used to help users identify unused tokens
        - Provide "Revoke" button for each token
    
    Security:
        - NEVER return token_hash or plaintext token
        - Only shows prefix to help identify tokens
    """
    user_id = user_info["user_id"]

    pat_service = PATService()
    tokens = await pat_service.list_pats(user_id, db)

    token_list = []
    for t in tokens:
        scopes = []
        if t.scopes is not None:
            scopes = t.scopes.split(',') 
        token = {
            "id":t.id,
            "token_name":t.token_name,
            "token_prefix":t.token_prefix,
            "scopes": scopes,
            "last_used": t.last_used.isoformat() if t.last_used else None,
            "usage_count": t.usage_count,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,        }
        token_list.append(token)

    return {"success": True, "tokens":token_list}

@app.delete("/api/auth/tokens/{token_id}")
@user_limiter.limit("20/minute")  # User-based: revoking tokens
async def revoke_personal_access_token(
    request: Request,
    token_id: str,
    user_info: Dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db)
):
    """
    Revoke (delete) a Personal Access Token.
    Users can only revoke their own tokens.
    
    Security:
        - User can only revoke their own tokens (enforced in PATService)
        - Soft delete (is_revoked=True) preserves audit trail
    """
    pat_service = PATService()
    user_id = user_info["user_id"]

    result = await pat_service.revoke_pat(token_id, user_id, db)

    if not result.get("success"):
        raise HTTPException(
            status_code = 404,
            detail = result.get("message", "Token not found or unauthorized")
        )
    
    return {"success":True, "token_id":token_id, "message":"Token revoked successfully"}


@app.get("/api/desktop/credentials")
@user_limiter.limit("10/minute")  # User-based: desktop credential requests
async def get_desktop_credentials(
    request: Request,
    user_info: Dict = Depends(verify_token_or_pat),
    cached_gitea_token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get Gitea credentials for desktop Git operations.
    
    This endpoint validates the Backend PAT and either reuses a cached Gitea PAT
    or creates a new one if the cached one is invalid/missing.
    
    IMPORTANT: This endpoint uses Backend PATs for API authentication,
    but returns Gitea PATs for Git operations (clone, push, pull).
    These are TWO DIFFERENT systems:
        - Backend PAT: Authentication with FastAPI (what user provides in header)
        - Gitea PAT: Git credentials (what this endpoint returns)
    
    Desktop app workflow:
        1. User enters Backend PAT in desktop app settings
        2. App calls this endpoint with: Authorization: token <backend_pat>
        3. Gets Gitea credentials in response
        4. Uses Gitea credentials for all Git operations
        5. Continues using Backend PAT for FastAPI endpoints
    
    Query parameters:
        - cached_gitea_token: (Optional) Gitea PAT from local storage to validate
    
    Security:
        - Backend PAT authenticates the API request (verify_token_or_pat dependency)
        - Gitea PAT is validated before reuse, or new one is created
        - Both systems are separate and serve different purposes
    """

    # supabase user + gitea ID
    user_id = user_info["user_id"]
    gitea_admin_service = GiteaAdminService()

    # Step 1: Try to reuse cached Gitea token if provided
    if cached_gitea_token:
        print(f"[get_desktop_credentials] Validating cached Gitea token...")
        token_check = gitea_admin_service.verify_gitea_token(cached_gitea_token)
        if token_check.get("valid"):
            print(f"[get_desktop_credentials] Cached token is still valid, reusing it")
            return {
                "success": True,
                "gitea_url": GITEA_PUBLIC_URL,
                "username": user_id,
                "token": cached_gitea_token,
                "clone_url_format": f"{GITEA_PUBLIC_URL}/{user_id}/{{repo_name}}.git"
            }
        else:
            print(f"[get_desktop_credentials] Cached token is invalid/expired, creating new one")

    # Step 2: Create a new Gitea token (cached was missing or invalid)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    token_name = f"Desktop Access Token - {timestamp}"

    gitea_result = gitea_admin_service.create_or_get_user_token(
        user_id,
        token_name,
    )

    if not gitea_result.get("success"):
        raise HTTPException(
            status_code = 500,
            detail = gitea_result.get("message", "Failed to get Gitea credentials")
        )
    return {
        "success":True, 
        "gitea_url":settings.gitea_public_url,
        "username":user_id, 
        "token": gitea_result["token"]["sha1"],
        "clone_url_format": f"{settings.gitea_public_url}/{user_id}/{{repo_name}}.git"
    }

# ============== FILE WATCHER ENDPOINTS (REMOVED) ==============
# The following endpoints were removed as part of migrating from auto-sync to manual Git commits:
# - POST /watch/start - Started file watch session
# - POST /watch/stop - Stopped file watch session
# - GET /watch/status/{watch_id} - Got watch session status
# - GET /watch/sessions - Listed all watch sessions
# - POST /watch/spawn - Spawned worker process
# - GET /watch/worker-script - Downloaded Python worker script
# - GET /watch/download-script/{watch_id} - Generated platform-specific launcher scripts
#
# Desktop app will now use standard Git operations directly against Gitea via HTTP/SSH.
# Users will commit/push manually through the desktop UI (GitHub Desktop style).


# ============== GITEA ENDPOINTS ==============


@app.delete("/repos/{repo_name}/contents")
@user_limiter.limit("30/minute")  # User-based: file deletions should be moderate
async def delete_file(request: Request, repo_name: str, file_path: str, delete_request: DeleteFileRequest, token: str = Depends(verify_token)):
    """Delete a file from a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = delete_request.branch or "main"
    res = svc.delete_file(gitea_username, repo_name, file_path, delete_request.message, branch)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to delete file"))
    return {"success": True, "message": res.get("message")}

# ============== SOUNDHAUS-SPECIFIC ENDPOINTS ==============

@app.get("/repos/public")
@limiter.limit("60/minute")
async def get_public_repos(request: Request, genres: Optional[str] = None, match: str = "any", db: Session = Depends(get_db)):
    """Get all publicly published repos with audio snippets (Explore page)."""
    
    genre_names = []
    if genres is not None:
        genre_names = [g.strip() for g in genres.split(",")]
    query = db.query(RepoData)
    
    if genre_names:
        base = (
            db.query(RepoData.gitea_id)
            .join(RepoData.genres)
            .filter(GenreList.genre_name.in_(genre_names))
        )

        if match == "all":
            base = (
                base
                .group_by(RepoData.gitea_id)
                .having(func.count(func.distinct(GenreList.genre_name)) == len(genre_names))
            )

        subq = base.subquery()
        query = query.filter(RepoData.gitea_id.in_(subq))
    # Now fetch Gitea metadata for each repo to get rich details
    svc = RepoService()
    result = []
    for repo in query:
        # Parse owner/repo from gitea_id (format: "owner/reponame")
        try:
            owner, repo_name = repo.gitea_id.split("/", 1)
            
            # Fetch Gitea metadata (description, stars, etc.)
            gitea_data = svc.get_repo_contents(owner, repo_name)
            
            repo_info = {
                "gitea_id": repo.gitea_id,
                "owner": owner,
                "repo_name": repo_name,
                "clone_count": repo.clone_count,
                "audio_snippet": repo.audio_snippet,
                # Include snippet metadata for audio player
                "snippet_metadata": {
                    "duration": repo.snippet_duration,
                    "file_size": repo.snippet_file_size,
                    "format": repo.snippet_format,
                    "sample_rate": repo.snippet_sample_rate,
                    "channels": repo.snippet_channels
                } if repo.audio_snippet else None,
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{settings.gitea_public_url}/{repo.gitea_id}.git"
            }
            
            # Add Gitea metadata if available
            if gitea_data.get("success"):
                contents = gitea_data.get("contents", {})
                # If contents is a list (directory), get repo info from first item's parent
                if isinstance(contents, list) and len(contents) > 0:
                    repo_info["description"] = contents[0].get("repository", {}).get("description", "")
                    repo_info["stars"] = contents[0].get("repository", {}).get("stars_count", 0)
                    repo_info["updated_at"] = contents[0].get("repository", {}).get("updated_at", "")
            
            result.append(repo_info)
        except Exception as e:
            logger.warning("get_public_repos", gitea_id=repo.gitea_id, error=str(e))
            # Still include repo even if Gitea fetch fails
            result.append({
                "gitea_id": repo.gitea_id,
                "clone_count": repo.clone_count,
                "audio_snippet": repo.audio_snippet,
                "snippet_metadata": {
                    "duration": repo.snippet_duration,
                    "file_size": repo.snippet_file_size,
                    "format": repo.snippet_format,
                    "sample_rate": repo.snippet_sample_rate,
                    "channels": repo.snippet_channels
                } if repo.audio_snippet else None,
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{settings.gitea_public_url}/{repo.gitea_id}.git"
            })
    
    return {"success": True, "repos": result}


@app.get("/repos/{owner}/{repo}/stats")
@limiter.limit("60/minute")  # IP-based: public stats viewing
async def get_repo_stats(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db)
):
    """Get detailed stats for a specific repo."""
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")
    
    recent_clones = db.query(CloneEvent).filter(
        CloneEvent.repo_id == repo_id
    ).order_by(CloneEvent.cloned_at.desc()).limit(10).all()
    
    return {
        "success": True,
        "gitea_id": repo_data.gitea_id,
        "clone_count": repo_data.clone_count,
        "audio_snippet": repo_data.audio_snippet,
        "genres": [{"genre_id": g.genre_id, "genre_name": g.genre_name} for g in repo_data.genres],
        "recent_clones": [
            {
                "user_id": c.user_id,
                "cloned_at": c.cloned_at.isoformat()
            } for c in recent_clones
        ]
    }


@app.post("/repos/{owner}/{repo}/genres")
@user_limiter.limit("20/minute")  # User-based: updating genres
async def update_repo_genres(
    request: Request,
    owner: str,
    repo: str,
    req: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Assign genres to a repo (owner only)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    user_id = user_res["user"]["id"]
    
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not your repo")
    
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")
    
    genre_ids = req.get("genre_ids", [])
    genres = db.query(GenreList).filter(GenreList.genre_id.in_(genre_ids)).all()
    
    repo_data.genres = genres
    db.commit()
    
    return {"success": True, "message": "Genres updated"}


@app.get("/genres")
@limiter.limit("60/minute")
async def get_genres(request: Request, db: Session = Depends(get_db)):
    """Get all available genres (public endpoint)."""
    genres = db.query(GenreList).all()
    return {
        "success": True,
        "genres": [
            {"genre_id": g.genre_id, "genre_name": g.genre_name, "genre_color": g.genre_color, "genre_icon": g.genre_icon}
            for g in genres
        ]
    }


@app.post("/genres")
@user_limiter.limit("10/minute")  # User-based: admin only, but still limit
async def create_genre(
    request: Request,
    req: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Create a new genre (admin only - for now just requires auth)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    if not user_res.get("is_admin"):
        raise HTTPException(status_code=403, detail="User does not have Admin privileges")

    genre_name = req.get("genre_name")
    if not genre_name:
        raise HTTPException(status_code=400, detail="genre_name required")
    
    existing = db.query(GenreList).filter(GenreList.genre_name == genre_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Genre already exists")
    
    new_genre = GenreList(genre_name=genre_name)
    db.add(new_genre)
    db.commit()
    db.refresh(new_genre)
    
    return {
        "success": True,
        "genre": {
            "genre_id": new_genre.genre_id,
            "genre_name": new_genre.genre_name
        }
    }

@app.get("/genres/{genre_id}")
@limiter.limit("60/minute")  # IP-based: public genre browsing
async def get_genre_details(
    request: Request,
    genre_id: int,
    db: Session = Depends(get_db)
):
    """Users should be able to hover over genre tags and view this data about them,
        it should show a brief description of the genre, how many songs in soundhaus
        are under this genre, and the top 3 public repos tagged with said genre 
    """

    query = db.query(GenreList).filter(GenreList.genre_id==genre_id)
    genre = query.one()
# TODO: add this as a return value, more details in models/genre_models.py     
#   "top_three_songs": genre.top_songs[:3],
    return {
        "success":True,
        "genre_name": genre.genre_name,
        "description": genre.genre_description,
        "song_count": genre.song_count,
        "genre_icon": genre.genre_icon,
        "genre_color": genre.genre_color,
    }
@app.patch("/genres/{genre_id}")
@user_limiter.limit("20/minute")  # User-based: admin only
async def patch_genre_data(
    request: Request,
    genre_id: int,
    genre_name: Optional[str]=None,
    genre_description: Optional[str]=None,
    genre_icon: Optional[str]=None,
    genre_color: Optional[str]=None,
    display_order: Optional[int]=None,
    song_count: Optional[int]=None,
    db: Session = Depends(get_db),
):
    #TODO: Require admin for this endpoint

    query = db.query(GenreList).filter(GenreList.genre_id==genre_id)
    genre = query.one()

    if genre_name is not None:
        genre.genre_name = genre_name
    if genre_description is not None:
        genre.genre_description = genre_description
    if genre_icon is not None:
        genre.genre_icon = genre_icon
    if genre_color is not None:
        genre.genre_color = genre_color
    if display_order is not None:
        genre.display_order = display_order
    if song_count is not None:
        genre.song_count = song_count
    
    db.commit()

    return {"status": "success", "description":"changed " }


@app.post("/repos/{owner}/{repo}/snippet")
@limiter.limit("5/minute")
async def upload_audio_snippet(
    request: Request,
    owner: str,
    repo: str,
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Upload audio snippet for a repo (owner only).
    
    Extracts and stores metadata (duration, sample_rate, etc.) for frontend display.
    The snippet serves as an audio preview for the Explore page.
    """
    from services.snippet_service import snippet_service
    
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    user_id = user_res["user"]["id"]
    
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not your repo")
    
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        # Auto-create repo_data entry if it doesn't exist
        repo_data = RepoData(gitea_id=repo_id, owner_id=str(user_id), clone_count=0)
        db.add(repo_data)
    
    # Validate file size before reading content (check Content-Length header)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_AUDIO_SNIPPET_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum allowed size of {format_bytes(MAX_AUDIO_SNIPPET_SIZE)}"
                )
        except ValueError:
            # Invalid Content-Length header, will validate after reading
            pass
    
    # Validate content-type header before processing
    if file.content_type and not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid content type '{file.content_type}'. Must be an audio file."
        )
    
    # Read file content
    content = await file.read()
    
    # Validate actual file size after reading (defense in depth)
    if len(content) > MAX_AUDIO_SNIPPET_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size {format_bytes(len(content))} exceeds maximum allowed size of {format_bytes(MAX_AUDIO_SNIPPET_SIZE)}"
        )
    
    # Validate file is not empty
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    
    # Save file, validate audio type, and extract metadata via Supabase Storage
    try:
        result = await snippet_service.save_snippet(
            owner, repo, file.filename, content,
            content_type=file.content_type
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Update repo_data with snippet URL and metadata
    repo_data.audio_snippet = result["url"]
    repo_data.snippet_duration = result.get("duration")
    repo_data.snippet_file_size = result.get("file_size")
    repo_data.snippet_format = result.get("format")
    repo_data.snippet_sample_rate = result.get("sample_rate")
    repo_data.snippet_channels = result.get("channels")
    
    db.commit()
    
    logger.info("repo_snippet_uploaded", 
               repo_id=repo_id, 
               url=result["url"],
               duration=result.get("duration"),
               file_size=result.get("file_size"))
    
    return {
        "success": True,
        "url": result["url"],
        "metadata": {
            "duration": result.get("duration"),
            "file_size": result.get("file_size"),
            "format": result.get("format"),
            "sample_rate": result.get("sample_rate"),
            "channels": result.get("channels")
        }
    }


@app.get("/repos/{owner}/{repo}/snippet")
async def get_repo_snippet(
    owner: str,
    repo: str,
    db: Session = Depends(get_db)
):
    """
    Redirect to the Supabase CDN URL for the audio snippet.
    No auth required - snippets are public previews.
    """
    from fastapi.responses import RedirectResponse
    
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    
    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet for this repo")
    
    logger.debug("repo_snippet_redirect", repo_id=repo_id, url=repo_data.audio_snippet)
    
    return RedirectResponse(url=repo_data.audio_snippet)


@app.get("/repos/{owner}/{repo}/snippet/metadata")
async def get_repo_snippet_metadata(
    owner: str,
    repo: str,
    db: Session = Depends(get_db)
):
    """
    Get metadata for a repo's audio snippet (public).
    
    Returns duration, file_size, format, etc. for the frontend
    to display progress bar and audio info.
    """
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    
    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet for this repo")
    
    return {
        "success": True,
        "repo_id": repo_id,
        "snippet": {
            "url": repo_data.audio_snippet,
            "duration": repo_data.snippet_duration,
            "file_size": repo_data.snippet_file_size,
            "format": repo_data.snippet_format,
            "sample_rate": repo_data.snippet_sample_rate,
            "channels": repo_data.snippet_channels
        }
    }


@app.delete("/repos/{owner}/{repo}/snippet")
@limiter.limit("10/minute")
async def delete_repo_snippet(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Delete the audio snippet for a repo (owner only)."""
    from services.snippet_service import snippet_service
    
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    user_id = user_res["user"]["id"]
    
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not your repo")
    
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    
    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet to delete")
    
    # Delete from Supabase Storage
    deleted = await snippet_service.delete_snippet(owner, repo)
    if not deleted:
        logger.warning("snippet_delete_storage_miss", repo_id=repo_id,
                       message="File not found in Supabase but clearing DB record anyway")
    
    # Clear snippet data in database
    repo_data.audio_snippet = None
    repo_data.snippet_duration = None
    repo_data.snippet_file_size = None
    repo_data.snippet_format = None
    repo_data.snippet_sample_rate = None
    repo_data.snippet_channels = None
    db.commit()
    
    logger.info("repo_snippet_deleted", repo_id=repo_id)
    
    return {"success": True, "message": "Snippet deleted"}


# ==============================================================================
# WEBHOOK ENDPOINTS
# ==============================================================================
#
# DESKTOP TEAM INTEGRATION GUIDE:
#
# These endpoints power the real-time activity system. Gitea fires webhooks
# to the receiver endpoint below, and the backend stores the parsed data.
# The desktop app then reads that data via the GET endpoints.
#
# Endpoints for desktop app to consume:
#   GET /api/webhooks/repo/{owner}/{repo}/activity  → Push/commit feed (public)
#   GET /api/webhooks/repo/{owner}/{repo}/events    → Branch/tag lifecycle (public)
#   GET /api/webhooks/deliveries                    → Raw delivery log (auth required)
#
# Endpoint the desktop app should NEVER call:
#   POST /api/webhooks/gitea  → Gitea-only receiver (webhook signature required)
#
# Suggested polling strategy for desktop app:
#   1. On repo page mount: fetch /activity and /events once
#   2. Set interval every 30 seconds to re-fetch
#   3. Clear interval on unmount / page navigation
#   4. Rate limit: 30 requests/minute per endpoint (safe with 30s polling)
#
# ==============================================================================

@app.post("/api/webhooks/gitea")
async def receive_gitea_webhook(
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Receive and process Gitea webhook events.

    DESKTOP TEAM: Do NOT call this endpoint from the desktop app.
    This is called exclusively by Gitea when git events occur (push, branch
    create/delete, etc.). It requires a valid HMAC-SHA256 signature that
    only Gitea can produce using the shared webhook secret.

    Headers from Gitea:
      - X-Gitea-Event: Event type (push, create, delete, repository, fork)
      - X-Gitea-Delivery: Unique delivery UUID
      - X-Gitea-Signature: HMAC-SHA256 signature for validation

    Flow:
      1. Read raw body and validate HMAC signature
      2. Parse event type from headers
      3. Route to webhook_service.process_event()
      4. Return 200 (always, to prevent Gitea retry storms)

    Returns 200 even on invalid signatures to prevent Gitea from endlessly
    retrying failed deliveries. The response body indicates success/rejection.
    """
    # Step 1: Read raw body for signature validation
    body = await request.body()

    # Step 2: Extract Gitea headers
    event_type = request.headers.get("X-Gitea-Event") or request.headers.get("x-gitea-event", "unknown")
    delivery_id = request.headers.get("X-Gitea-Delivery") or request.headers.get("x-gitea-delivery", "unknown")
    signature = request.headers.get("X-Gitea-Signature") or request.headers.get("x-gitea-signature", "")

    logger.info("webhook_received",
                event_type=event_type,
                delivery_id=delivery_id,
                body_size=len(body))

    # Step 3: Validate signature
    if not webhook_service.validate_signature(body, signature):
        logger.warning("webhook_rejected_invalid_signature",
                       delivery_id=delivery_id,
                       event_type=event_type)
        # Return 200 anyway to prevent Gitea from retrying endlessly
        return {"status": "rejected", "reason": "invalid_signature"}

    # Step 4: Parse payload
    try:
        import json as _json
        payload = _json.loads(body)
    except Exception as e:
        logger.error("webhook_invalid_json", error=str(e))
        return {"status": "rejected", "reason": "invalid_json"}

    # Step 5: Process the event through the service
    result = webhook_service.process_event(event_type, delivery_id, payload, db)

    return {"status": "ok", "result": result}


@app.get("/api/webhooks/deliveries")
@limiter.limit("30/minute")
async def list_webhook_deliveries(
    request: Request,
    repo: Optional[str] = None,
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    List recent webhook deliveries for debugging and monitoring.

    DESKTOP TEAM: This is a debugging/admin endpoint. You probably don't need
    this in the main UI, but it could be useful for a "Webhook Health" panel
    in an admin/settings view. Requires authentication.

    Query params:
      - repo: Filter by repo full name (e.g., "uuid-123/my-beats")
      - event_type: Filter by event type (e.g., "push", "create", "delete")
      - status: Filter by processing status ("success", "failed", "pending")
      - limit: Max results (default 50, capped at 100)

    Example desktop fetch:
      const res = await fetch(
        `${API_URL}/api/webhooks/deliveries?repo=${encodeURIComponent(repoId)}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

    Response shape:
      {
        "success": true,
        "count": 3,
        "deliveries": [
          {
            "id": "uuid-string",
            "event_type": "push",
            "repo_id": "uuid-123/my-beats",
            "status": "success",
            "delivered_at": "2025-01-15T10:30:00+00:00",
            "error_message": null
          }
        ]
      }
    """
    query = db.query(WebhookDelivery).order_by(WebhookDelivery.delivered_at.desc())

    if repo:
        query = query.filter(WebhookDelivery.repo_id == repo)
    if event_type:
        query = query.filter(WebhookDelivery.event_type == event_type)
    if status:
        query = query.filter(WebhookDelivery.processing_status == status)

    deliveries = query.limit(min(limit, 100)).all()

    return {
        "success": True,
        "count": len(deliveries),
        "deliveries": [
            {
                "id": d.id,
                "event_type": d.event_type,
                "repo_id": d.repo_id,
                "status": d.processing_status,
                "delivered_at": str(d.delivered_at) if d.delivered_at else None,
                "error_message": d.error_message
            }
            for d in deliveries
        ]
    }


@app.get("/api/webhooks/repo/{owner}/{repo}/activity")
@limiter.limit("30/minute")
async def get_repo_activity(
    request: Request,
    owner: str,
    repo: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get recent push activity for a repo — the main activity feed.

    DESKTOP TEAM: This is the PRIMARY endpoint for showing repo activity.
    Use this to build a commit/push timeline in the desktop UI.

    No authentication required — this is a public endpoint.

    URL params:
      - owner: Gitea username (the user's Supabase UUID)
      - repo:  Repository name (e.g., "my-beats")
    
    Query params:
      - limit: Max results (default 20, capped at 50)

    Example desktop fetch:
      const res = await fetch(
        `${API_URL}/api/webhooks/repo/${owner}/${repoName}/activity?limit=10`
      );
      const data = await res.json();
      // data.activity = array of push events

    Response shape:
      {
        "success": true,
        "repo": "uuid-123/my-beats",
        "count": 2,
        "activity": [
          {
            "id": 1,
            "ref": "refs/heads/main",          // branch that was pushed to
            "before_sha": "abc12345",           // SHA before push (first 8 chars)
            "after_sha": "def67890",            // SHA after push (first 8 chars)
            "commit_count": 3,                  // number of commits in this push
            "pusher": "nathan",                 // Gitea username who pushed
            "pushed_at": "2025-01-15 10:30:00+00:00"
          }
        ]
      }

    UI suggestions:
      - Show as "Nathan pushed 3 commits to main • 2 hours ago"
      - Use `commit_count` for display, `ref` to extract branch name
      - `ref` format is "refs/heads/branch-name" — strip "refs/heads/" for display
      - Poll every 30 seconds while user is viewing the repo page
    """
    repo_id = f"{owner}/{repo}"

    push_events = (
        db.query(PushEvent)
        .filter(PushEvent.repo_id == repo_id)
        .order_by(PushEvent.pushed_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    return {
        "success": True,
        "repo": repo_id,
        "count": len(push_events),
        "activity": [
            {
                "id": e.id,
                "ref": e.ref,
                "before_sha": e.before_sha[:8] if e.before_sha else None,
                "after_sha": e.after_sha[:8] if e.after_sha else None,
                "commit_count": e.commit_count,
                "pusher": e.pusher_username,
                "pushed_at": str(e.pushed_at) if e.pushed_at else None,
            }
            for e in push_events
        ]
    }


@app.get("/api/webhooks/repo/{owner}/{repo}/events")
@limiter.limit("30/minute")
async def get_repo_events(
    request: Request,
    owner: str,
    repo: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get repository lifecycle events (branch creates, deletes, tags, etc.).

    DESKTOP TEAM: Use this alongside /activity to build a complete
    repo timeline. This shows structural changes (branches/tags), while
    /activity shows content changes (pushes/commits).

    No authentication required — this is a public endpoint.

    URL params:
      - owner: Gitea username (the user's Supabase UUID)
      - repo:  Repository name

    Query params:
      - limit: Max results (default 20, capped at 50)

    Example desktop fetch:
      const res = await fetch(
        `${API_URL}/api/webhooks/repo/${owner}/${repoName}/events?limit=10`
      );

    Response shape:
      {
        "success": true,
        "repo": "uuid-123/my-beats",
        "count": 2,
        "events": [
          {
            "id": 1,
            "event_type": "branch_created",    // or "branch_deleted", "tag_created", etc.
            "actor": "nathan",                 // Gitea username who performed the action
            "occurred_at": "2025-01-15 10:25:00+00:00"
          }
        ]
      }

    Possible event_type values:
      - "branch_created"     → New branch created
      - "branch_deleted"     → Branch deleted
      - "tag_created"        → New tag created
      - "tag_deleted"        → Tag deleted
      - "repository_created" → Repo created (from repo lifecycle webhook)
      - "repository_deleted" → Repo deleted
      - "repository_renamed" → Repo renamed

    UI suggestions:
      - Show as "Nathan created branch 'feature/drums' • 5 min ago"
      - Combine with /activity data and sort by timestamp for a unified feed
    """
    repo_id = f"{owner}/{repo}"

    events = (
        db.query(RepositoryEvent)
        .filter(RepositoryEvent.repo_id == repo_id)
        .order_by(RepositoryEvent.occurred_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    return {
        "success": True,
        "repo": repo_id,
        "count": len(events),
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "actor": e.actor_username,
                "occurred_at": str(e.occurred_at) if e.occurred_at else None,
            }
            for e in events
        ]
    }


# ============== ERROR HANDLERS ==============

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
        },
    )

