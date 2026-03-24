"""
Commit and diff endpoints — serve commit history and ALS diff data.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from dependencies import limiter, verify_token
from logging_config import get_logger
from models.commit_models import CommitDetail
from models.diff_models import AlsDiff
from models.repo_models import RepoData

logger = get_logger(__name__)

router = APIRouter(tags=["commits"])


@router.get("/repos/{owner}/{repo}/commits")
@limiter.limit("60/minute")
async def get_commit_list(
    request: Request,
    owner: str,
    repo: str,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=20, ge=1, le=100, description="Commits per page"),
    db: Session = Depends(get_db),
):
    """Returns paginated commit history for a repository."""
    # TODO: implement
    raise NotImplementedError("get_commit_list not yet implemented")


@router.get("/repos/{owner}/{repo}/commits/{sha}")
@limiter.limit("60/minute")
async def get_commit_detail(
    request: Request,
    owner: str,
    repo: str,
    sha: str,
    db: Session = Depends(get_db),
):
    """Returns full metadata for a single commit by SHA (full or short)."""
    # TODO: implement
    raise NotImplementedError("get_commit_detail not yet implemented")


@router.post("/repos/{owner}/{repo}/diff")
@limiter.limit("10/minute")
async def post_als_diff(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Accepts ALS diff JSON from Desktop app after a push. Clears needs_update flag."""
    # TODO: implement
    raise NotImplementedError("post_als_diff not yet implemented")


@router.get("/repos/{owner}/{repo}/commits/{sha}/diff")
@limiter.limit("60/minute")
async def get_commit_diff(
    request: Request,
    owner: str,
    repo: str,
    sha: str,
    db: Session = Depends(get_db),
):
    """Returns ALS diff data for a specific commit SHA."""
    # TODO: implement
    raise NotImplementedError("get_commit_diff not yet implemented")
