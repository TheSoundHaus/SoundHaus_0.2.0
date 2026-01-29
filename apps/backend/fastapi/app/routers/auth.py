"""
Authentication endpoints
Handles user registration, login, OAuth, and session management
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
import secrets

from app.dependencies import get_auth, verify_token
from app.services.auth_service import SupabaseAuthService
from app.services.gitea_service import GiteaAdminService
from app.models.schemas import (
    SignUpRequest,
    SignInRequest,
    UpdateUserRequest,
    ResetPasswordRequest,
    RefreshTokenRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup")
async def signup(
    request: SignUpRequest,
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """
    Register a new user with email and password, and provision a matching Gitea account.

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

    # Attempt to create Gitea user
    gitea_result: Dict[str, Any]
    try:
        gitea = GiteaAdminService()
        print("[signup] gitea service initialized")
        full_name = request.name or (request.metadata or {}).get("name")
        print(f"[signup] gitea full_name={full_name}")
        pw_len = len(request.password) if request.password else 0
        print(f"[signup] password_present={bool(request.password)} length={pw_len}")

        # Use Supabase user id as the Gitea username if available
        gitea_username = sb.get("user", {}).get("id")

        if not request.password or not request.password.strip():
            # Try to create Gitea user with random password if no password provided
            print("[signup] no password provided, generating random password for Gitea user")
            gitea_result = gitea.create_user(
                username=gitea_username,
                email=request.email,
                password=secrets.token_urlsafe(32),  # Random password (user won't use it)
            )
        else:
            gitea_result = gitea.create_user(
                username=gitea_username,
                email=request.email,
                password=request.password,
            )

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


@router.post("/login")
async def login(
    request: SignInRequest,
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Sign in an existing user with email and password."""
    result = await auth_service.sign_in(
        email=request.email,
        password=request.password
    )

    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))

    return result


@router.post("/logout")
async def logout(
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Sign out the current user."""
    result = await auth_service.sign_out(token)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result


@router.post("/refresh")
async def refresh_session(
    request: RefreshTokenRequest,
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Refresh an expired access token using a refresh token."""
    result = await auth_service.refresh_session(request.refresh_token)

    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))

    return result


@router.get("/user")
async def get_current_user(
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Get the current authenticated user's information."""
    result = await auth_service.get_user(token)

    if not result.get("success"):
        raise HTTPException(status_code=401, detail=result.get("message"))

    return result


@router.patch("/user")
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


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Send a password reset email to the user."""
    result = await auth_service.reset_password_email(request.email)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result


@router.get("/oauth/{provider}")
async def oauth_signin(
    provider: str,
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """Initiate OAuth sign in with a provider (google, github, etc.)."""
    result = await auth_service.sign_in_with_oauth(provider)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result


@router.get("/generate-desktop-token")
async def generate_desktop_token(
    email: str,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
):
    """
    Generate a magic link token for desktop authentication.

    This endpoint is called by the web app after a user logs in and wants to
    authenticate their desktop app. It requires a valid web session token and
    generates a hashed_token that can be used with the custom URL scheme:
    soundhaus://auth?hashed_token={token}

    Args:
        email: The user's email address
        token: The user's current access token (from Authorization header)

    Returns:
        Dict containing the hashed_token for desktop authentication
    """
    # Verify the user making the request
    user_result = await auth_service.get_user(token)
    if not user_result.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Verify the email matches the authenticated user
    if user_result["user"]["email"] != email:
        raise HTTPException(status_code=403, detail="Email does not match authenticated user")

    # Generate the magic link token
    result = await auth_service.generate_magic_link(email)

    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to generate token"))

    return {
        "success": True,
        "hashed_token": result["hashed_token"],
        "email": email
    }
