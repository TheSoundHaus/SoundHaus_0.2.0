"""
Shared dependencies used across all routers.

Contains authentication helpers, rate limiters, and constants
that multiple router modules depend on.
"""

from fastapi import Depends, Header, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any

from database import get_db
from config import settings
from logging_config import get_logger
from services.auth_service import get_auth_service, SupabaseAuthService

logger = get_logger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MAX_TOKENS_PER_USER = 10
DEFAULT_TOKEN_EXPIRY_DAYS = 90
MAX_AUDIO_SNIPPET_SIZE = 10 * 1024 * 1024  # 10MB limit for audio snippet uploads


# ── Helpers ──────────────────────────────────────────────────────────────────

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


# ── Rate Limiters ────────────────────────────────────────────────────────────

def get_user_or_ip(request: Request) -> str:
    """
    Rate limit by user ID if authenticated, otherwise by IP.
    Prevents one user from consuming all rate limits behind a shared IP (like NAT).
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


# IP-based limiter (for unauthenticated / public endpoints)
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.redis_url,
)

# User-based limiter (for authenticated endpoints)
user_limiter = Limiter(
    key_func=get_user_or_ip,
    default_limits=[settings.rate_limit_default],
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.redis_url,
)
# SlowAPI may override `enabled` from RATELIMIT_* / Starlette Config; keep pydantic as source of truth.
limiter.enabled = settings.rate_limit_enabled
user_limiter.enabled = settings.rate_limit_enabled


# ── Auth Dependencies ────────────────────────────────────────────────────────

def get_auth() -> SupabaseAuthService:
    """Dependency to obtain an auth-service instance."""
    return get_auth_service()


async def verify_token(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth),
) -> str:
    """Extract and verify a JWT token from the Authorization header."""
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


async def verify_token_or_pat(
    authorization: Optional[str] = Header(None),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Verify either a Supabase JWT token or a Personal Access Token.

    Enables both web users (JWT) and desktop users (PAT) to access
    protected endpoints.

    Returns:
        Dict with user_id, email/pat_id, and auth_type ("jwt" or "pat").

    Raises:
        HTTPException 401 if credentials are invalid or missing.
    """
    logger.debug(
        "verify_token_or_pat",
        authorization_present=bool(authorization),
        authorization_prefix=authorization[:50] if authorization else "MISSING",
    )

    user_info = await auth_service.verify_token_or_pat(authorization, db)

    logger.debug("verify_token_or_pat", result=str(user_info))

    if user_info is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing authentication credentials",
        )
    return user_info
