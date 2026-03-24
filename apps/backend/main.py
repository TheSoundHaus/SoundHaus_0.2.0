"""
SoundHaus API – application assembly.

This module creates the FastAPI app, registers middleware,
initialises the database, and mounts all routers.
The actual endpoint logic lives in the routers/ package.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import settings
from database import init_db, test_connection
from dependencies import limiter
from logging_config import get_logger
from middlewares.security_headers import SecurityHeadersMiddleware

# ── Routers ──────────────────────────────────────────────────────────────────
from routers import (
    health,
    auth,
    repos,
    collaborators,
    desktop,
    genres,
    snippets,
    stems,
    webhooks,
    commits,
    audio,
    comments,
)

# ── App creation ─────────────────────────────────────────────────────────────

app = FastAPI(title="SoundHaus API", version="1.0.0")

# ── Rate-limiter setup ───────────────────────────────────────────────────────

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=(
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
        if settings.is_development
        else None
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Origin",
        "X-Requested-With",
        "X-CSRF-Token",
        "X-Cached-Gitea-Token",
    ],
    expose_headers=[
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
    max_age=600,
)

# ── Security headers ────────────────────────────────────────────────────────

app.add_middleware(SecurityHeadersMiddleware)

# ── Logging ──────────────────────────────────────────────────────────────────

logger = get_logger(__name__)

# ── Database init ────────────────────────────────────────────────────────────

logger.info("api_startup", message="Starting SoundHaus API")
logger.info("db_init", message="Attempting database connection")

try:
    if test_connection():
        logger.info("db_connection", status="success", message="Database connection successful")
        logger.info("db_init", message="Creating database tables")
        init_db()
        logger.info("db_init", status="success", message="Database initialized and ready")
    else:
        logger.error(
            "db_connection",
            status="failed",
            message="Database connection failed! Check your DATABASE_URL",
        )
except Exception as e:
    logger.error("db_init", status="failed", error=str(e), exc_info=True)

# ── Register routers ────────────────────────────────────────────────────────

app.include_router(health.router)       # GET /  ,  GET /health
app.include_router(auth.router)         # /api/auth/*
app.include_router(repos.router)        # /repos/*
app.include_router(collaborators.router)  # /repos/*/collaborators/*  ,  /invitations/*
app.include_router(desktop.router)      # /api/auth/desktop-login  ,  /api/auth/tokens  ,  /api/desktop/*
app.include_router(genres.router)       # /genres/*  ,  /repos/*/genres
app.include_router(snippets.router)     # /repos/*/snippet*
app.include_router(stems.router)        # /repos/*/stems/*
app.include_router(webhooks.router)     # /api/webhooks/*
app.include_router(commits.router)      # /repos/*/commits/*  ,  /repos/*/diff
app.include_router(audio.router)        # /repos/*/audio/waveform
app.include_router(comments.router)     # /repos/*/snippet/comments
