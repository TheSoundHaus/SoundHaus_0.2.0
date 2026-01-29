"""
Dependency injection functions for FastAPI routes
"""
from fastapi import Depends, Header, HTTPException
from typing import Optional
from app.services.auth_service import get_auth_service, SupabaseAuthService


def get_auth() -> SupabaseAuthService:
    """Dependency to get auth service instance"""
    return get_auth_service()


async def verify_token(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth)
) -> str:
    """
    Extract and verify JWT token from Authorization header.

    Returns:
        str: The validated JWT token

    Raises:
        HTTPException: 401 if token is missing, invalid, or expired
    """
    print(f"[verify_token] authorization header: {authorization[:50] if authorization else 'MISSING'}...")

    if not authorization or not authorization.startswith("Bearer "):
        print("[verify_token] FAILED: missing or invalid header")
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid authorization header"
        )

    token = authorization.replace("Bearer ", "")
    print(f"[verify_token] extracted token: {token[:20]}...")

    is_valid = await auth_service.verify_token(token)
    print(f"[verify_token] is_valid: {is_valid}")

    if not is_valid:
        print("[verify_token] FAILED: token invalid")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    print("[verify_token] SUCCESS")
    return token


async def get_current_user(
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth)
) -> dict:
    """
    Get current user info from verified token.

    Returns:
        dict: User information from Supabase

    Raises:
        HTTPException: 401 if user cannot be retrieved
    """
    user_res = await auth_service.get_user(token)
    if "error" in user_res:
        raise HTTPException(status_code=401, detail=user_res["error"])
    return user_res
