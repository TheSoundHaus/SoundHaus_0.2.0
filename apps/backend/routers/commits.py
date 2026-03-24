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
    repo_id = f"{owner}/{repo}"

    # Verify the repo exists
    repo_row = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_row:
        raise HTTPException(status_code=404, detail=f"Repository {repo_id} not found")

    # Total count for pagination metadata
    total = db.query(CommitDetail).filter(CommitDetail.repo_id == repo_id).count()

    # Fetch commits page
    offset = (page - 1) * limit
    commits = (
        db.query(CommitDetail)
        .filter(CommitDetail.repo_id == repo_id)
        .order_by(desc(CommitDetail.timestamp))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Batch-fetch which SHAs have an AlsDiff row
    commit_shas = [c.sha for c in commits]
    diff_shas = set()
    if commit_shas:
        diff_rows = (
            db.query(AlsDiff.commit_sha)
            .filter(AlsDiff.repo_id == repo_id, AlsDiff.commit_sha.in_(commit_shas))
            .all()
        )
        diff_shas = {row[0] for row in diff_rows}

    # Serialize
    commits_out = []
    for c in commits:
        commits_out.append({
            "id": c.id,
            "sha": c.sha,
            "short_sha": c.short_sha,
            "message": c.message,
            "author_name": c.author_name,
            "author_email": c.author_email,
            "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            "files_added": c.files_added or [],
            "files_modified": c.files_modified or [],
            "files_removed": c.files_removed or [],
            "has_diff": c.sha in diff_shas,
        })

    return {
        "success": True,
        "repo": repo_id,
        "page": page,
        "limit": limit,
        "total": total,
        "commits": commits_out,
    }


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
    repo_id = f"{owner}/{repo}"

    # Support both full and short SHAs; reject on ambiguity
    if len(sha) == 40:
        commits = (
            db.query(CommitDetail)
            .filter(CommitDetail.repo_id == repo_id, CommitDetail.sha == sha)
            .all()
        )
    elif len(sha) >= 7:
        commits = (
            db.query(CommitDetail)
            .filter(CommitDetail.repo_id == repo_id, CommitDetail.sha.startswith(sha))
            .all()
        )
    else:
        raise HTTPException(status_code=400, detail="SHA must be at least 7 characters")

    if not commits:
        raise HTTPException(status_code=404, detail="Commit not found")

    if len(commits) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"Ambiguous SHA prefix '{sha}' matches {len(commits)} commits"
        )

    c = commits[0]

    # Check if an AlsDiff exists for this commit
    has_diff = db.query(AlsDiff).filter(AlsDiff.commit_sha == c.sha).first() is not None

    return {
        "success": True,
        "commit": {
            "id": c.id,
            "sha": c.sha,
            "short_sha": c.short_sha,
            "message": c.message,
            "author_name": c.author_name,
            "author_email": c.author_email,
            "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            "files_added": c.files_added or [],
            "files_modified": c.files_modified or [],
            "files_removed": c.files_removed or [],
            "has_diff": has_diff,
        }
    }


@router.post("/repos/{owner}/{repo}/diff")
@limiter.limit("10/minute")
async def post_als_diff(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Accepts ALS diff JSON from Desktop app after a push. Uses upsert for retry safety."""
    # Verify Desktop PAT auth
    if not token or not token.startswith("soundh_"):
        raise HTTPException(status_code=403, detail="Desktop PAT required")

    # Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Validate required fields
    commit_sha = body.get("commit_sha")
    diff_data = body.get("diff_data")
    if not commit_sha or not diff_data:
        raise HTTPException(status_code=400, detail="commit_sha and diff_data are required")

    repo_id = f"{owner}/{repo}"

    # Verify repo exists
    repo_row = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_row:
        raise HTTPException(status_code=404, detail=f"Repository {repo_id} not found")

    # Upsert: check if diff already exists for this SHA
    existing = (
        db.query(AlsDiff)
        .filter(AlsDiff.repo_id == repo_id, AlsDiff.commit_sha == commit_sha)
        .first()
    )

    if existing:
        # Update existing diff row
        existing.diff_data = diff_data
        existing.diff_type = body.get("diff_type", "combined")
        existing.diff_summary = body.get("diff_summary")
        existing.before_sha = body.get("before_sha")
        existing.desktop_version = body.get("desktop_version")
        db.commit()
        diff_id = existing.id
        logger.info("als_diff_updated", repo_id=repo_id, commit_sha=commit_sha[:8])
    else:
        # Create new diff row
        new_diff = AlsDiff(
            repo_id=repo_id,
            commit_sha=commit_sha,
            before_sha=body.get("before_sha"),
            diff_type=body.get("diff_type", "combined"),
            diff_summary=body.get("diff_summary"),
            diff_data=diff_data,
            desktop_version=body.get("desktop_version"),
        )
        db.add(new_diff)
        db.commit()
        db.refresh(new_diff)
        diff_id = new_diff.id
        logger.info("als_diff_created", repo_id=repo_id, commit_sha=commit_sha[:8])

    return {"success": True, "diff_id": diff_id}


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
    repo_id = f"{owner}/{repo}"

    # Support both full and short SHAs
    if len(sha) == 40:
        diff_row = (
            db.query(AlsDiff)
            .filter(AlsDiff.repo_id == repo_id, AlsDiff.commit_sha == sha)
            .first()
        )
    elif len(sha) >= 7:
        diff_row = (
            db.query(AlsDiff)
            .filter(AlsDiff.repo_id == repo_id, AlsDiff.commit_sha.startswith(sha))
            .first()
        )
    else:
        raise HTTPException(status_code=400, detail="SHA must be at least 7 characters")

    if not diff_row:
        return {"success": False, "error": "No ALS diff found for this commit"}

    return {
        "success": True,
        "diff": {
            "id": diff_row.id,
            "commit_sha": diff_row.commit_sha,
            "before_sha": diff_row.before_sha,
            "diff_type": diff_row.diff_type,
            "diff_summary": diff_row.diff_summary,
            "diff_data": diff_row.diff_data,
            "created_at": diff_row.created_at.isoformat() if diff_row.created_at else None,
        }
    }
