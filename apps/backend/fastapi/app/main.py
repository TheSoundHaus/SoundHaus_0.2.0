"""
SoundHaus FastAPI Backend
Main application entry point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, auth, repos, collaborators

# Initialize FastAPI application
app = FastAPI(
    title="SoundHaus API",
    description="Backend API for SoundHaus collaborative music production platform",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(repos.router)
app.include_router(collaborators.router)
