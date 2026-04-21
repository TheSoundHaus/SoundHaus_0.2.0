"""
Review endpoints — the "Mastering Gate" workflow.

Provides CRUD for review sessions (Artist push approvals),
annotations (Producer/Owner comments on diffs), and role promotion.
"""

from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_auth, resolve_owner_id, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from models.profile_models import Profile
from services.review_service import ReviewService

logger = get_logger(__name__)

router = APIRouter(tags=["reviews"])

svc = ReviewService()


# ── Request / Response schemas ───────────────────────────────────────────────

class CreateReviewRequest(BaseModel):
    commit_sha: str = Field(..., min_length=7, max_length=40)
    branch_name: str = Field(..., min_length=1, max_length=255)


class ReviewActionRequest(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=2000)


class AnnotateRequest(BaseModel):
    comment_text: str = Field(..., min_length=1, max_length=2000)
    target_path: Optional[str] = Field(default=None, max_length=500)


class PromoteRequest(BaseModel):
    email: str = Field(..., description="Email of the Artist to promote")


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _get_caller(token: str):
    """Return (user_id, email) or raise 401."""
    auth = get_auth()
    user_res = await auth.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = user_res["user"]
    return str(user["id"]), user["email"]


def _build_repo_id(owner: str, repo: str, db: Session) -> str:
    owner_id = str(resolve_owner_id(owner, db))
    return f"{owner_id}/{repo}"


def _username_for(user_id: str, db: Session) -> str:
    """Resolve a Supabase UUID to a SoundHaus username."""
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    return profile.username if profile else user_id


# ── Create review session ────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/reviews", status_code=201)
@user_limiter.limit("20/minute")
async def create_review(
    request: Request,
    owner: str,
    repo: str,
    body: CreateReviewRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a review session when an Artist pushes changes."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if role == "none":
        raise HTTPException(status_code=403, detail="You are not a collaborator on this repo")

    session = svc.create_session(
        repo_id=repo_id,
        commit_sha=body.commit_sha,
        branch_name=body.branch_name,
        artist_id=user_id,
        db=db,
    )

    return {
        "success": True,
        "review_id": session.id,
        "status": session.status,
        "created_at": session.created_at.isoformat(),
    }


# ── List review sessions ────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/reviews")
@user_limiter.limit("60/minute")
async def list_reviews(
    request: Request,
    owner: str,
    repo: str,
    status: Optional[str] = None,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List review sessions for a repository."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if role == "none":
        raise HTTPException(status_code=403, detail="You are not a collaborator on this repo")

    if status and status not in ("pending", "approved", "denied"):
        raise HTTPException(status_code=400, detail="Status must be pending, approved, or denied")

    sessions = svc.list_sessions(repo_id, db, status=status)

    return {
        "success": True,
        "reviews": [
            {
                "id": s.id,
                "commit_sha": s.commit_sha,
                "branch_name": s.branch_name,
                "artist_id": s.artist_id,
                "artist_username": _username_for(s.artist_id, db),
                "status": s.status,
                "reviewer_id": s.reviewer_id,
                "reviewer_username": _username_for(s.reviewer_id, db) if s.reviewer_id else None,
                "reviewer_notes": s.reviewer_notes,
                "created_at": s.created_at.isoformat(),
                "reviewed_at": s.reviewed_at.isoformat() if s.reviewed_at else None,
                "annotation_count": len(s.annotations),
            }
            for s in sessions
        ],
    }


# ── Get review detail ───────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/reviews/{review_id}")
@user_limiter.limit("60/minute")
async def get_review(
    request: Request,
    owner: str,
    repo: str,
    review_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get a single review session with its annotations."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if role == "none":
        raise HTTPException(status_code=403, detail="You are not a collaborator on this repo")

    session = svc.get_session(review_id, db)
    if not session or session.repo_id != repo_id:
        raise HTTPException(status_code=404, detail="Review session not found")

    return {
        "success": True,
        "review": {
            "id": session.id,
            "commit_sha": session.commit_sha,
            "branch_name": session.branch_name,
            "artist_id": session.artist_id,
            "artist_username": _username_for(session.artist_id, db),
            "status": session.status,
            "reviewer_id": session.reviewer_id,
            "reviewer_username": (
                _username_for(session.reviewer_id, db) if session.reviewer_id else None
            ),
            "reviewer_notes": session.reviewer_notes,
            "created_at": session.created_at.isoformat(),
            "reviewed_at": session.reviewed_at.isoformat() if session.reviewed_at else None,
            "annotations": [
                {
                    "id": a.id,
                    "author_id": a.author_id,
                    "author_username": _username_for(a.author_id, db),
                    "comment_text": a.comment_text,
                    "target_path": a.target_path,
                    "created_at": a.created_at.isoformat(),
                }
                for a in session.annotations
            ],
        },
    }


# ── Approve ──────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/reviews/{review_id}/approve")
@user_limiter.limit("20/minute")
async def approve_review(
    request: Request,
    owner: str,
    repo: str,
    review_id: str,
    body: ReviewActionRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Approve a pending review — merges the Artist's branch to main."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if not svc.can_review(role):
        raise HTTPException(
            status_code=403,
            detail="Only Producers or the Owner can approve reviews",
        )

    session = svc.get_session(review_id, db)
    if not session or session.repo_id != repo_id:
        raise HTTPException(status_code=404, detail="Review session not found")

    owner_gitea = str(resolve_owner_id(owner, db))
    result = svc.approve_session(session, user_id, body.notes, owner_gitea, repo, db)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ── Deny ─────────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/reviews/{review_id}/deny")
@user_limiter.limit("20/minute")
async def deny_review(
    request: Request,
    owner: str,
    repo: str,
    review_id: str,
    body: ReviewActionRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Deny a pending review — rejects the Artist's changes."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if not svc.can_review(role):
        raise HTTPException(
            status_code=403,
            detail="Only Producers or the Owner can deny reviews",
        )

    session = svc.get_session(review_id, db)
    if not session or session.repo_id != repo_id:
        raise HTTPException(status_code=404, detail="Review session not found")

    result = svc.deny_session(session, user_id, body.notes, db)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result


# ── Annotate ─────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/reviews/{review_id}/annotate")
@user_limiter.limit("30/minute")
async def annotate_review(
    request: Request,
    owner: str,
    repo: str,
    review_id: str,
    body: AnnotateRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Attach a comment to a review session, optionally targeting a track path."""
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if role == "none":
        raise HTTPException(status_code=403, detail="You are not a collaborator on this repo")

    session = svc.get_session(review_id, db)
    if not session or session.repo_id != repo_id:
        raise HTTPException(status_code=404, detail="Review session not found")

    annotation = svc.add_annotation(
        session_id=review_id,
        author_id=user_id,
        comment_text=body.comment_text,
        target_path=body.target_path,
        db=db,
    )

    return {
        "success": True,
        "annotation": {
            "id": annotation.id,
            "author_id": annotation.author_id,
            "author_username": _username_for(annotation.author_id, db),
            "comment_text": annotation.comment_text,
            "target_path": annotation.target_path,
            "created_at": annotation.created_at.isoformat(),
        },
    }


# ── Promote Artist → Producer ───────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/collaborators/promote")
@user_limiter.limit("10/minute")
async def promote_collaborator(
    request: Request,
    owner: str,
    repo: str,
    body: PromoteRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Promote an Artist to Producer on a repository.

    Only the Owner or an existing Producer can promote.
    """
    user_id, email = await _get_caller(token)
    repo_id = _build_repo_id(owner, repo, db)

    role = svc.resolve_role(user_id, email, repo_id, db)
    if not svc.can_promote(role):
        raise HTTPException(
            status_code=403,
            detail="Only Producers or the Owner can promote collaborators",
        )

    owner_gitea = str(resolve_owner_id(owner, db))
    result = svc.promote_to_producer(repo, owner_gitea, body.email, db)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])

    return result
