"""
Snippet comment endpoints — CRUD for time-stamped comments on audio snippets.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from sqlalchemy import asc
from pydantic import BaseModel, Field

from database import get_db
from dependencies import limiter, verify_token, get_auth
from logging_config import get_logger
from models.comment_models import SnippetComment
from models.repo_models import RepoData
from models.profile_models import Profile

logger = get_logger(__name__)

router = APIRouter(tags=["comments"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class CreateCommentRequest(BaseModel):
    timestamp_seconds: float = Field(..., ge=0, description="Position in seconds within the snippet")
    comment_text: str = Field(..., min_length=1, max_length=500, description="Comment body")


class CommentResponse(BaseModel):
    id: str
    user_id: str
    username: str
    avatar_url: str | None
    timestamp_seconds: float
    comment_text: str
    created_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/snippet/comments")
@limiter.limit("30/minute")
async def add_snippet_comment(
    request: Request,
    owner: str,
    repo: str,
    body: CreateCommentRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Add a time-stamped comment to a repo's audio snippet."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    repo_id = f"{owner}/{repo}"

    # Verify repo exists
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail=f"Repository {repo_id} not found")

    # Verify repo has a snippet
    if not repo_data.audio_snippet:
        raise HTTPException(status_code=400, detail="Repository has no audio snippet to comment on")

    # Validate timestamp against snippet duration if available
    if repo_data.snippet_duration and body.timestamp_seconds > repo_data.snippet_duration:
        raise HTTPException(
            status_code=400,
            detail=f"Timestamp {body.timestamp_seconds}s exceeds snippet duration {repo_data.snippet_duration}s",
        )

    comment = SnippetComment(
        repo_id=repo_id,
        user_id=str(user_id),
        timestamp_seconds=body.timestamp_seconds,
        comment_text=body.comment_text.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    # Resolve username for response
    profile = db.query(Profile).filter(Profile.id == str(user_id)).first()
    username = profile.username if profile else str(user_id)
    avatar_url = profile.avatar_url if profile else None

    logger.info(
        "snippet_comment_added",
        repo_id=repo_id,
        user_id=str(user_id),
        timestamp=body.timestamp_seconds,
    )

    return {
        "success": True,
        "comment": {
            "id": comment.id,
            "user_id": comment.user_id,
            "username": username,
            "avatar_url": avatar_url,
            "timestamp_seconds": comment.timestamp_seconds,
            "comment_text": comment.comment_text,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        },
    }


@router.get("/repos/{owner}/{repo}/snippet/comments")
@limiter.limit("60/minute")
async def list_snippet_comments(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """List all comments on a repo's audio snippet, sorted by timestamp."""
    repo_id = f"{owner}/{repo}"

    # Verify repo exists
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail=f"Repository {repo_id} not found")

    comments = (
        db.query(SnippetComment)
        .filter(SnippetComment.repo_id == repo_id)
        .order_by(asc(SnippetComment.timestamp_seconds))
        .all()
    )

    # Batch-resolve usernames
    user_ids = list({c.user_id for c in comments})
    profiles = db.query(Profile).filter(Profile.id.in_(user_ids)).all()
    profile_map = {p.id: p for p in profiles}

    return {
        "success": True,
        "comments": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "username": profile_map[c.user_id].username if c.user_id in profile_map else c.user_id,
                "avatar_url": profile_map[c.user_id].avatar_url if c.user_id in profile_map else None,
                "timestamp_seconds": c.timestamp_seconds,
                "comment_text": c.comment_text,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in comments
        ],
    }


@router.delete("/repos/{owner}/{repo}/snippet/comments/{comment_id}")
@limiter.limit("30/minute")
async def delete_snippet_comment(
    request: Request,
    owner: str,
    repo: str,
    comment_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete a comment (only the comment author or repo owner can delete)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = str(user_res["user"]["id"])
    repo_id = f"{owner}/{repo}"

    comment = (
        db.query(SnippetComment)
        .filter(SnippetComment.id == comment_id, SnippetComment.repo_id == repo_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Only comment author or repo owner can delete
    if comment.user_id != user_id and str(owner) != user_id:
        raise HTTPException(status_code=403, detail="Not allowed to delete this comment")

    db.delete(comment)
    db.commit()

    logger.info("snippet_comment_deleted", comment_id=comment_id, repo_id=repo_id, user_id=user_id)

    return {"success": True, "message": "Comment deleted"}
