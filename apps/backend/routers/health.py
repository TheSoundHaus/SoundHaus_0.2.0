"""Health-check endpoints."""

from fastapi import APIRouter
from config import settings

router = APIRouter(tags=["health"])


@router.get("/")
def read_root():
    return {"message": "SoundHaus API", "version": "1.0.0", "status": "running"}


@router.get("/health")
def health_check():
    return {"status": "healthy"}


@router.get("/debug/gitea-token")
def debug_gitea_token():
    """Debug endpoint to check what Gitea admin token is loaded."""
    token = settings.gitea_admin_token
    return {
        "token_configured": bool(token),
        "token_length": len(token) if token else 0,
        "token_prefix": token[:10] if token else None,
        "token_suffix": token[-10:] if token and len(token) > 10 else None,
        "gitea_url": settings.gitea_url,
        "gitea_public_url": settings.gitea_public_url
    }
