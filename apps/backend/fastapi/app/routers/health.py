"""
Health and utility endpoints
"""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/")
def read_root():
    """Root endpoint - API information"""
    return {
        "message": "SoundHaus API",
        "version": "1.0.0",
        "status": "running"
    }


@router.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}
