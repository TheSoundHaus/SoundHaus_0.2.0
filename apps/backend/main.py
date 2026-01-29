from fastapi import FastAPI, HTTPException, Depends, Header, Response, File, UploadFile, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from typing import Optional, Dict, Any
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from services.repo_service import RepoService
from services.gitea_service import GiteaAdminService
from services.auth_service import get_auth_service, SupabaseAuthService
from services.pat_service import PATService
from database import get_db, init_db, test_connection
from models.repo_models import RepoData
from models.clone_models import CloneEvent
from models.genre_models import GenreList, repo_genres
from models.pat_models import PersonalAccessToken
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
from datetime import datetime, timedelta
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
app = FastAPI(title="SoundHaus API", version="1.0.0")

# Load environment variables
load_dotenv()

# Define constants from environment
GITEA_PUBLIC_URL = os.getenv("GITEA_PUBLIC_URL", "http://127.0.0.1:3000")  # fallback default
GITEA_ADMIN_TOKEN = os.getenv("GITEA_ADMIN_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

# Other app constants
MAX_TOKENS_PER_USER = 10
DEFAULT_TOKEN_EXPIRY_DAYS = 90

# CORS middleware for React frontend (Vite defaults to 5173)
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database initialization - call immediately when module loads
print("Starting SoundHaus API...")
print("Attempting database connection...")
try:
    if test_connection():
        print("Database connection successful!")
        print("Creating database tables...")
        init_db()
        print("Database initialized and ready!")
    else:
        print("Database connection failed! Check your DATABASE_URL")
except Exception as e:
    print(f"Database initialization error: {e}")
    import traceback
    traceback.print_exc()

# Dependency to get auth service
def get_auth() -> SupabaseAuthService:
    return get_auth_service()

# Dependency to extract and verify token
async def verify_token(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth)
) -> str:
    """Extract and verify JWT token from Authorization header."""
    print(f"[main] verify_token - authorization header: {authorization[:50] if authorization else 'MISSING'}...")
    if not authorization or not authorization.startswith("Bearer "):
        print("[main] verify_token - FAILED: missing or invalid header")
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.replace("Bearer ", "")
    print(f"[main] verify_token - extracted token: {token[:20]}...")
    is_valid = await auth_service.verify_token(token)
    print(f"[main] verify_token - is_valid: {is_valid}")
    
    if not is_valid:
        print("[main] verify_token - FAILED: token invalid")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    print("[main] verify_token - SUCCESS")
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
async def signup(request: SignUpRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Register a new user with email and password, and provision a matching Gitea account.

    Workflow:
    1) Create user in Supabase
    2) If Supabase succeeds, create corresponding user in Gitea using admin API
    """
    print("[signup] incoming email=", request.email)
    sb = await auth_service.sign_up(
        email=request.email,
        password=request.password,
        metadata=request.metadata,
    )

    if not sb.get("success"):
        print("[signup] supabase failed:", sb.get("message"))
        raise HTTPException(status_code=400, detail=sb.get("message"))

    # Get Supabase user ID to use as Gitea username
    supabase_user_id = sb.get("user", {}).get("id")
    if not supabase_user_id:
        raise HTTPException(status_code=500, detail="Supabase user created but no ID returned")

    # Provision Gitea user with Supabase UUID as username
    gitea_result: Dict[str, Any]
    try:
        gitea = GiteaAdminService()
        print("[signup] gitea service initialized")
        
        # Check if Gitea user already exists with this Supabase UUID
        existing_user = gitea.get_user_by_username(supabase_user_id)
        
        if existing_user.get("exists"):
            print(f"[signup] Gitea user {supabase_user_id} already exists, using existing account")
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
            print(f"[signup] Creating new Gitea user {supabase_user_id}")
            pw_len = len(request.password) if request.password else 0
            print(f"[signup] password_present={bool(request.password)} length={pw_len}")
            
            gitea_result = gitea.create_user(
                username=supabase_user_id,
                email=request.email,  # Will be converted to +soundhaus alias internally
                password=request.password if request.password and request.password.strip() else secrets.token_urlsafe(32),
                visibility="private"  # Hide from public user lists
            )
            gitea_result["is_new"] = True

        print("[signup] gitea result:", {k: v for k, v in gitea_result.items() if k != 'data'})
    except Exception as e:  # configuration or runtime error
        gitea_result = {
            "success": False,
            "status": 0,
            "message": f"Gitea provisioning error: {e}",
        }
        print("[signup] gitea exception:", e)

    # Combine response
    return {
        "success": True,
        "supabase": sb,
        "gitea": gitea_result,
    }

@app.post("/api/auth/login")
async def login(request: SignInRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Sign in an existing user with email and password."""
    result = await auth_service.sign_in(
        email=request.email,
        password=request.password
    )
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.post("/api/auth/logout")
async def logout(token: str = Depends(verify_token), auth_service: SupabaseAuthService = Depends(get_auth)):
    """Sign out the current user."""
    result = await auth_service.sign_out(token)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

@app.post("/api/auth/refresh")
async def refresh_session(request: RefreshTokenRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Refresh an expired access token using a refresh token."""
    result = await auth_service.refresh_session(request.refresh_token)
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.get("/api/auth/user")
async def get_current_user(token: str = Depends(verify_token), auth_service: SupabaseAuthService = Depends(get_auth)):
    """Get the current authenticated user's information."""
    result = await auth_service.get_user(token)
    
    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))
    
    return result

@app.patch("/api/auth/user")
async def update_user(
    request: UpdateUserRequest,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Update the current user's information."""
    updates = {}
    if request.email:
        updates["email"] = request.email
    if request.password:
        updates["password"] = request.password
    if request.data:
        updates["data"] = request.data
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    result = await auth_service.update_user(token, updates)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

@app.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Send a password reset email to the user."""
    result = await auth_service.reset_password_email(request.email)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

@app.get("/api/auth/oauth/{provider}")
async def oauth_signin(provider: str, auth_service: SupabaseAuthService = Depends(get_auth)):
    """Initiate OAuth sign in with a provider (google, github, etc.)."""
    result = await auth_service.sign_in_with_oauth(provider)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))
    
    return result

# ============== PROTECTED ENDPOINTS ==============

@app.get("/repos")
async def list_repos(token: str = Depends(verify_token)):
    """List Gitea repositories for the current user (protected)."""
    print("[/repos GET] Starting list_repos")
    user_res = await get_auth().get_user(token)
    print(f"[/repos GET] get_user result: success={user_res.get('success')}")
    if not user_res.get("success"):
        print(f"[/repos GET] FAILED to get user: {user_res.get('message')}")
        raise HTTPException(status_code=401, detail=user_res.get("message", "Unable to fetch user"))
    
    user_id = user_res["user"]["id"]
    print(f"[/repos GET] User: user_id={user_id}")

    gitea_username = user_id
    print(f"[/repos GET] Gitea username: {gitea_username}")
    svc = RepoService()
    res = svc.list_user_repos(gitea_username)
    print(f"[/repos GET] list_user_repos result: success={res.get('success')}, repo_count={len(res.get('repos', []))}")
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to list repos"))
    return {"success": True, "repos": res.get("repos", [])}


@app.post("/repos")
async def create_repo(req: CreateRepoRequest, token: str = Depends(verify_token), db: Session = Depends(get_db)):
    """Create a new Gitea repository for the current user (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")
    
    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    res = svc.create_user_repo(gitea_username, req.name, description=req.description or "", private=req.private)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to create repo"))
    
    # Create RepoData entry in our database (audio_snippet starts as None)
    gitea_id = f"{gitea_username}/{req.name}"
    repo_data = RepoData(
        gitea_id=gitea_id,
        audio_snippet=None,  # Will be set later via POST /repos/{owner}/{repo}/snippet
        clone_count=0,
        owner_id=user_id  # Add owner_id for repository isolation
    )
    db.add(repo_data)
    db.commit()
    db.refresh(repo_data)
    
    return {"success": True, "repo": res.get("repo"), "repo_data": {"gitea_id": repo_data.gitea_id}}

@app.get("/repos/{repo_name}/contents")
async def get_repo_contents(repo_name: str, path: str = "", token: str = Depends(verify_token)):
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
async def upload_file(repo_name: str, req: UploadFileRequest, token: str = Depends(verify_token)):
    """Upload a file to a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = req.branch or "main"
    res = svc.upload_file(gitea_username, repo_name, req.file_path, req.content, req.message, branch)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to upload file"))
    return {"success": True, "file": res.get("file")}


@app.patch("/repos/{owner}/{repo}/settings")
async def patch_repo_settings(owner: str, repo: str, settings: dict, token: str = Depends(verify_token)):
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

# In-memory repo preferences storage (TODO: Move to database for persistence)
# Format: {user_id: {repo_name: {local_path: str, ...}}}
repo_preferences: Dict[str, Dict[str, Dict[str, Any]]] = {}

# ============== REPO PREFERENCES ENDPOINTS ==============

@app.get("/repos/{repo_name}/preferences")
async def get_repo_preferences(repo_name: str, token: str = Depends(verify_token)):
    """Get preferences for a specific repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")
    
    user_id = user_res["user"]["id"]
    
    if user_id not in repo_preferences:
        return {"success": True, "preferences": None}
    
    prefs = repo_preferences[user_id].get(repo_name)
    return {"success": True, "preferences": prefs}

@app.post("/repos/{repo_name}/preferences")
async def save_repo_preferences(repo_name: str, req: RepoPreferencesRequest, token: str = Depends(verify_token)):
    """Save preferences for a specific repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")
    
    user_id = user_res["user"]["id"]
    
    if user_id not in repo_preferences:
        repo_preferences[user_id] = {}
    
    repo_preferences[user_id][repo_name] = {
        "local_path": req.local_path,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    return {
        "success": True,
        "preferences": repo_preferences[user_id][repo_name]
    }

# ============== REPO DATA ENDPOINTS ==============

# Post update to clone table
@app.post("/repos/{owner}/{repo}/clone")
async def record_clone_event(
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
        "clone_url": f"{os.getenv('GITEA_PUBLIC_URL', 'http://129.212.182.247:3000')}/{repo_id}.git"
    }

# Get count of clones
# Get repo snippet from url
# Post snippet to URL (this might be more suited for the desktop backend?)


# ============== COLLABORATOR ENDPOINTS ==============

# Collaborator invitation storage
pending_invitations: Dict[str, Dict[str, Any]] = {}

@app.post("/repos/{repo_name}/collaborators/invite")
async def invite_collaborator(
    repo_name: str,
    request: dict,
    token: str = Depends(verify_token)
):
    """Invite a user to collaborate on a repository."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    user_id = user_res["user"]["id"]
    email = user_res["user"]["email"]

    owner_username = user_id

    # Verify repo ownership
    repo_service = RepoService()
    repo_check = repo_service.get_repo_contents(owner_username, repo_name)
    if not repo_check.get("success"):
        return JSONResponse({"success": False, "message": "Repository not found"}, status_code=404)
    
    invitee_email = request.get("email")
    permission = request.get("permission", "write")  # read, write, admin
    
    if not invitee_email:
        return JSONResponse({"success": False, "message": "Email required"}, status_code=400)
    
    # TODO: Check if inviter user exists in Supabase
    
    # Generate invitation
    invitation_id = str(uuid.uuid4())
    invitation_token = secrets.token_urlsafe(32)
    
    pending_invitations[invitation_id] = {
        "invitation_id": invitation_id,
        "invitation_token": invitation_token,
        "repo_name": repo_name,
        "owner_email": email,
        "owner_username": owner_username,
        "invitee_email": invitee_email,
        "permission": permission,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat()
    }
    
    return {
        "success": True,
        "invitation_id": invitation_id,
        "message": f"Invitation sent to {invitee_email}"
    }

@app.get("/repos/{repo_name}/collaborators")
async def list_collaborators(
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
async def get_pending_invitations(token: str = Depends(verify_token)):
    """Get all pending invitations for the current user."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)
    
    user_data = user_res.get("user", {})
    email = user_data.get("email", "")
    
    # Filter invitations for this user
    user_invitations = [
        inv for inv in pending_invitations.values()
        if inv["invitee_email"] == email and inv["status"] == "pending"
    ]
    
    return {"success": True, "invitations": user_invitations}

@app.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: str,
    token: str = Depends(verify_token)
):
    """Accept a collaboration invitation."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]
    email = user_res["user"]["email"]
    
    invitation = pending_invitations.get(invitation_id)
    if not invitation:
        return JSONResponse({"success": False, "message": "Invitation not found"}, status_code=404)
    
    if invitation["invitee_email"] != email:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=403)
    
    if invitation["status"] != "pending":
        return JSONResponse({"success": False, "message": "Invitation already processed"}, status_code=400)
    
    # Generate username for invitee
    gitea = GiteaAdminService()
    invitee_username = user_id
    
    # Check if user exists in Gitea, create if not
    user_check = gitea.get_user(invitee_username)
    if not user_check.get("success"):
        print(f"[Invitation] User {invitee_username} doesn't exist in Gitea, attempting to create...")
        
        # Try to create Gitea user (won't fail if they already exist via different username)
        create_result = gitea.create_user(
            username=invitee_username,
            email=email,
            password=secrets.token_urlsafe(32),  # Random password (user won't use it)
        )
        
        if create_result.get("success"):
            print(f"[Invitation] Created Gitea user: {invitee_username}")
        else:
            # This is OK if they're logged in, as they should already have a Gitea account
            print(f"[Invitation] Could not create Gitea user: {create_result.get('message')}")
            print(f"[Invitation] Proceeding anyway - user may already have an account")
    else:
        print(f"[Invitation] User {invitee_username} already exists in Gitea")
    
    # Add collaborator to repository
    repo_service = RepoService()
    result = repo_service.add_collaborator(
        invitation["owner_username"],
        invitation["repo_name"],
        invitee_username,
        invitation["permission"]
    )
    
    if not result.get("success"):
        return JSONResponse({
            "success": False,
            "message": f"Failed to add collaborator: {result.get('message')}"
        }, status_code=400)
    
    # Mark invitation as accepted
    pending_invitations[invitation_id]["status"] = "accepted"
    pending_invitations[invitation_id]["accepted_at"] = datetime.utcnow().isoformat()
    
    return {
        "success": True,
        "message": f"You are now a collaborator on {invitation['repo_name']}"
    }

@app.post("/invitations/{invitation_id}/decline")
async def decline_invitation(
    invitation_id: str,
    token: str = Depends(verify_token)
):
    """Decline a collaboration invitation."""
    user_res = await get_auth().get_user(token)
    
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)
    
    user_data = user_res.get("user", {})
    email = user_data.get("email", "")
    
    invitation = pending_invitations.get(invitation_id)
    if not invitation:
        return JSONResponse({"success": False, "message": "Invitation not found"}, status_code=404)
    
    if invitation["invitee_email"] != email:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=403)
    
    # Mark invitation as declined
    pending_invitations[invitation_id]["status"] = "declined"
    pending_invitations[invitation_id]["declined_at"] = datetime.utcnow().isoformat()
    
    return {"success": True, "message": "Invitation declined"}

@app.delete("/repos/{repo_name}/collaborators/{username}")
async def remove_collaborator(
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
async def desktop_login(
    request: SignInRequest,
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
        email=request.email,
        password=request.password
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
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
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
async def create_personal_access_token(
    request: dict,
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

    token_name = request.get("token_name", "Unnamed_Token")
    expires_in_days = request.get("expires_in_days", 14)

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
async def list_personal_access_tokens(
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
async def revoke_personal_access_token(
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
async def get_desktop_credentials(
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
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S-%f")
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
        "gitea_url":GITEA_PUBLIC_URL,
        "username":user_id, 
        "token": gitea_result["token"]["sha1"],
        "clone_url_format": f"{GITEA_PUBLIC_URL}/{user_id}/{{repo_name}}.git"
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
async def delete_file(repo_name: str, file_path: str, req: DeleteFileRequest, token: str = Depends(verify_token)):
    """Delete a file from a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = req.branch or "main"
    res = svc.delete_file(gitea_username, repo_name, file_path, req.message, branch)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to delete file"))
    return {"success": True, "message": res.get("message")}

# ============== SOUNDHAUS-SPECIFIC ENDPOINTS ==============

@app.get("/repos/public")
async def get_public_repos(genres: Optional[str] = None, match: str = "any", db: Session = Depends(get_db)):
    """Get all publicly published repos with audio snippets (Explore page)."""
    
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
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{os.getenv('GITEA_PUBLIC_URL', 'http://129.212.182.247:3000')}/{repo.gitea_id}.git"
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
            print(f"[get_public_repos] Error processing {repo.gitea_id}: {e}")
            # Still include repo even if Gitea fetch fails
            result.append({
                "gitea_id": repo.gitea_id,
                "clone_count": repo.clone_count,
                "audio_snippet": repo.audio_snippet,
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{os.getenv('GITEA_PUBLIC_URL', 'http://129.212.182.247:3000')}/{repo.gitea_id}.git"
            })
    
    return {"success": True, "repos": result}



@app.get("/repos/{owner}/{repo}/stats")
async def get_repo_stats(
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
async def update_repo_genres(
    owner: str,
    repo: str,
    request: dict,
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
    
    genre_ids = request.get("genre_ids", [])
    genres = db.query(GenreList).filter(GenreList.genre_id.in_(genre_ids)).all()
    
    repo_data.genres = genres
    db.commit()
    
    return {"success": True, "message": "Genres updated"}


@app.get("/genres")
async def get_genres(db: Session = Depends(get_db)):
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
async def create_genre(
    request: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Create a new genre (admin only - for now just requires auth)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    
    if not user_res.get("is_admin"):
        raise HTTPException(status_code=403, detail="User does not have Admin privileges")

    genre_name = request.get("genre_name")
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

@app.post("/genres/{genre_id}")
async def get_genre_details(
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
async def patch_genre_data(
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
async def upload_audio_snippet(
    owner: str,
    repo: str,
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Upload audio snippet for a repo (owner only)."""
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
        repo_data = RepoData(gitea_id=repo_id, clone_count=0)
        db.add(repo_data)
    
    if not file.content_type or not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File must be audio")
    
    # For now, save to local uploads directory
    # TODO: Integrate with DigitalOcean Spaces or S3
    import os
    from pathlib import Path
    
    upload_dir = Path("/app/uploads") if os.path.exists("/app") else Path("./uploads")
    upload_dir.mkdir(exist_ok=True)
    
    file_path = upload_dir / f"{owner}_{repo}_{file.filename}"
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Store relative URL (in production, this would be DigitalOcean Spaces URL)
    url = f"/uploads/{owner}_{repo}_{file.filename}"
    repo_data.audio_snippet = url
    db.commit()
    
    return {"success": True, "url": url}


# ============== WEBHOOK ENDPOINTS ==============

@app.post("/api/webhooks/gitea")
async def receive_gitea_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
):
    """
    Webhook receiver endpoint for Gitea events.
    Validates signatures and processes events in background.
    """
    print("🔔 Webhook received!")  # Debug log
    
    # Create our own DB session to avoid dependency issues
    db = SessionLocal()
    
    try:
        # Step 1: Extract signature from headers
        headers_dict = dict(request.headers)
        signature = headers_dict.get("x-gitea-signature")
        
        # Step 2: Read raw request body
        body = await request.body()
        
        # Step 3: Validate webhook signature
        webhook_secret = os.getenv("GITEA_WEBHOOK_SECRET")
        if not webhook_secret or not validate_webhook_signature(body, signature, webhook_secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
        
        # Step 4: Parse webhook payload (from already-read body)
        import json
        payload = json.loads(body)
        event_type = parse_gitea_event(headers_dict)
        repo_info = extract_repo_info(payload)
        
        # Step 5: Log webhook delivery (only if repo exists or create placeholder)
        delivery = WebhookDelivery(
            repo_id=repo_info["full_name"],
            event_type=event_type,
            payload=payload,
            signature=signature,
            processing_status="pending"
        )
        db.add(delivery)
        db.commit()
        
        # Step 6: Route to appropriate handler in background
        if event_type == "push":
            background_tasks.add_task(handle_push_event, payload, delivery.id)
        elif event_type == "create":
            background_tasks.add_task(handle_create_event, payload, delivery.id)
        elif event_type == "delete":
            background_tasks.add_task(handle_delete_event, payload, delivery.id)
        elif event_type == "repository":
            background_tasks.add_task(handle_repository_event, payload, delivery.id)
        
        # Step 7: Return 200 immediately
        return {"status": "accepted", "delivery_id": delivery.id}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error processing webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ============== WEBHOOK EVENT HANDLERS ==============

async def handle_push_event(payload: Dict[str, Any], delivery_id: str):
    """Handle push webhook events."""
    db = SessionLocal()
    try:
        repo_info = extract_repo_info(payload)
        repo_id = repo_info["full_name"]
        
        # Extract pusher info
        pusher = payload.get("pusher", {})
        pusher_username = pusher.get("username", "unknown")
        
        # Extract commit info
        ref = payload.get("ref", "")
        before_sha = payload.get("before", "")
        after_sha = payload.get("after", "")
        commits = payload.get("commits", [])
        commit_count = len(commits)
        
        # Create PushEvent record
        push_event = PushEvent(
            repo_id=repo_id,
            pusher_id=pusher_username,  # In production, map to Supabase UUID
            pusher_username=pusher_username,
            ref=ref,
            before_sha=before_sha,
            after_sha=after_sha,
            commit_count=commit_count
        )
        db.add(push_event)
        
        # Update RepoData
        repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
        if repo_data:
            repo_data.last_push_at = datetime.utcnow()
            repo_data.total_commits = (repo_data.total_commits or 0) + commit_count
            repo_data.last_activity_at = datetime.utcnow()
        
        # Update delivery status
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "success"
        
        db.commit()
    except Exception as e:
        # Update delivery with error
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "failed"
            delivery.error_message = str(e)
            db.commit()
        print(f"Error handling push event: {e}")
    finally:
        db.close()


async def handle_create_event(payload: Dict[str, Any], delivery_id: str):
    """Handle create webhook events (branch/tag creation)."""
    db = SessionLocal()
    try:
        repo_info = extract_repo_info(payload)
        repo_id = repo_info["full_name"]
        
        ref_type = payload.get("ref_type", "unknown")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", "unknown")
        
        # Create RepositoryEvent record
        repo_event = RepositoryEvent(
            repo_id=repo_id,
            event_type=f"{ref_type}_created",
            actor_id=sender_username,
            actor_username=sender_username
        )
        db.add(repo_event)
        
        # Update RepoData activity
        repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
        if repo_data:
            repo_data.last_activity_at = datetime.utcnow()
        
        # Update delivery status
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "success"
        
        db.commit()
    except Exception as e:
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "failed"
            delivery.error_message = str(e)
            db.commit()
        print(f"Error handling create event: {e}")
    finally:
        db.close()


async def handle_delete_event(payload: Dict[str, Any], delivery_id: str):
    """Handle delete webhook events (branch/tag deletion)."""
    db = SessionLocal()
    try:
        repo_info = extract_repo_info(payload)
        repo_id = repo_info["full_name"]
        
        ref_type = payload.get("ref_type", "unknown")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", "unknown")
        
        # Create RepositoryEvent record
        repo_event = RepositoryEvent(
            repo_id=repo_id,
            event_type=f"{ref_type}_deleted",
            actor_id=sender_username,
            actor_username=sender_username
        )
        db.add(repo_event)
        
        # Update delivery status
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "success"
        
        db.commit()
    except Exception as e:
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "failed"
            delivery.error_message = str(e)
            db.commit()
        print(f"Error handling delete event: {e}")
    finally:
        db.close()


async def handle_repository_event(payload: Dict[str, Any], delivery_id: str):
    """Handle repository webhook events (repo created/deleted)."""
    db = SessionLocal()
    try:
        action = payload.get("action", "unknown")
        repo_info = extract_repo_info(payload)
        repo_id = repo_info["full_name"]
        
        sender = payload.get("sender", {})
        sender_username = sender.get("username", "unknown")
        
        # Create RepositoryEvent record
        repo_event = RepositoryEvent(
            repo_id=repo_id,
            event_type=f"repository_{action}",
            actor_id=sender_username,
            actor_username=sender_username
        )
        db.add(repo_event)
        
        # Update delivery status
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "success"
        
        db.commit()
    except Exception as e:
        delivery = db.query(WebhookDelivery).filter(WebhookDelivery.id == delivery_id).first()
        if delivery:
            delivery.processing_status = "failed"
            delivery.error_message = str(e)
            db.commit()
        print(f"Error handling repository event: {e}")
    finally:
        db.close()


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

