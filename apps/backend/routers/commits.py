"""
Commit and diff endpoints — serve commit history and ALS diff data.
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from dependencies import limiter, verify_token, verify_token_or_pat, resolve_owner_id
from logging_config import get_logger
from models.commit_models import CommitDetail
from models.diff_models import AlsDiff
from models.repo_models import RepoData
from models.profile_models import Profile
from sqlalchemy.exc import IntegrityError

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
    owner = resolve_owner_id(owner, db)
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

    # Batch-fetch author profiles by email, username, and id (UUID) for avatar + display name
    author_emails = list({c.author_email for c in commits if c.author_email})
    author_names = list({c.author_name for c in commits if c.author_name})
    profile_by_email: dict = {}
    profile_by_name: dict = {}
    profile_by_id: dict = {}  # fallback: author_name may be a Supabase UUID
    if author_emails:
        profiles = db.query(Profile).filter(Profile.email.in_(author_emails)).all()
        profile_by_email = {p.email: p for p in profiles}
    if author_names:
        profiles2 = db.query(Profile).filter(Profile.username.in_(author_names)).all()
        profile_by_name = {p.username: p for p in profiles2 if p.username}
        # For any author_name not resolved via username, try as Profile.id (UUID)
        unresolved_names = [n for n in author_names if n not in profile_by_name]
        if unresolved_names:
            profiles3 = db.query(Profile).filter(Profile.id.in_(unresolved_names)).all()
            profile_by_id = {p.id: p for p in profiles3}

    # Serialize
    commits_out = []
    for c in commits:
        # Resolve author profile: try email first, then username match, then UUID match
        author_profile = (
            profile_by_email.get(c.author_email)
            or profile_by_name.get(c.author_name)
            or profile_by_id.get(c.author_name)
        )

        # Determine diff status:
        #   "ready"   — AlsDiff row exists, diff is viewable
        #   "pending" — .als changed but desktop hasn't uploaded the diff yet
        #   "none"    — no .als changes in this commit
        if c.sha in diff_shas:
            diff_status = "ready"
        elif getattr(c, "diff_pending", "none") == "pending":
            diff_status = "pending"
        else:
            diff_status = "none"

        commits_out.append({
            "id": c.id,
            "sha": c.sha,
            "short_sha": c.short_sha,
            "message": c.message,
            "author_name": author_profile.username if author_profile and author_profile.username else c.author_name,
            "author_email": c.author_email,
            "author_avatar_url": author_profile.avatar_url if author_profile else None,
            "timestamp": c.timestamp.isoformat() if c.timestamp else None,
            "files_added": c.files_added or [],
            "files_modified": c.files_modified or [],
            "files_removed": c.files_removed or [],
            "has_diff": c.sha in diff_shas,
            "diff_status": diff_status,
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
    owner = resolve_owner_id(owner, db)
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
    user_info: dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db),
):
    """Accepts ALS diff JSON from Desktop app after a push. Uses upsert for retry safety."""
    # Accept both desktop PAT auth and web JWT auth
    if not user_info or not user_info.get("user_id"):
        raise HTTPException(status_code=403, detail="Valid authentication required")

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

    # Validate diff_data has meaningful content (guard against empty/corrupt payloads)
    if not isinstance(diff_data, dict):
        raise HTTPException(status_code=400, detail="diff_data must be a JSON object")
    if "tracks" not in diff_data:
        raise HTTPException(status_code=400, detail="diff_data must contain a 'tracks' key")

    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"

    # Verify repo exists — auto-create the row if it's missing (the push already
    # succeeded on Gitea, so the repo is real even if registration was skipped)
    repo_row = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_row:
        user_id = user_info["user_id"]
        try:
            repo_row = RepoData(
                gitea_id=repo_id,
                audio_snippet=None,
                clone_count=0,
                owner_id=user_id,
            )
            db.add(repo_row)
            db.commit()
            db.refresh(repo_row)
            logger.info("auto_created_repo_for_diff", repo_id=repo_id, user_id=user_id)
        except IntegrityError:
            db.rollback()
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

    # Clear diff_pending flag on the CommitDetail row
    commit_row = (
        db.query(CommitDetail)
        .filter(CommitDetail.repo_id == repo_id, CommitDetail.sha == commit_sha)
        .first()
    )
    if commit_row and commit_row.diff_pending == "pending":
        commit_row.diff_pending = "ready"
        commit_row.diff_pending_since = None
        db.commit()
        logger.info("diff_pending_cleared", repo_id=repo_id, commit_sha=commit_sha[:8])

    # Clear any older pending commits in this repo — the desktop only uploads
    # a diff for HEAD, so earlier commits in the same push would stay "pending"
    # forever.  Mark them "none" so the web polling stops.
    stale_rows = (
        db.query(CommitDetail)
        .filter(
            CommitDetail.repo_id == repo_id,
            CommitDetail.diff_pending == "pending",
            CommitDetail.sha != commit_sha,
        )
        .all()
    )
    for row in stale_rows:
        row.diff_pending = "none"
        row.diff_pending_since = None
    if stale_rows:
        db.commit()
        logger.info("stale_pending_cleared", repo_id=repo_id, count=len(stale_rows))

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
    owner = resolve_owner_id(owner, db)
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


@router.get("/repos/{owner}/{repo}/diff-status")
@limiter.limit("120/minute")
async def get_diff_status(
    request: Request,
    owner: str,
    repo: str,
    shas: str = Query(..., description="Comma-separated SHAs to check"),
    db: Session = Depends(get_db),
):
    """
    Lightweight polling endpoint — returns diff_status for a list of commit SHAs.
    Used by the web UI to check if pending diffs have arrived without refetching
    the full commit list.
    """
    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"
    sha_list = [s.strip() for s in shas.split(",") if s.strip()]

    if not sha_list or len(sha_list) > 50:
        raise HTTPException(status_code=400, detail="Provide 1-50 comma-separated SHAs")

    # Batch check: which SHAs have an AlsDiff row
    diff_rows = (
        db.query(AlsDiff.commit_sha)
        .filter(AlsDiff.repo_id == repo_id, AlsDiff.commit_sha.in_(sha_list))
        .all()
    )
    diff_shas = {row[0] for row in diff_rows}

    # Batch check: which SHAs are still pending
    pending_rows = (
        db.query(CommitDetail.sha, CommitDetail.diff_pending)
        .filter(CommitDetail.repo_id == repo_id, CommitDetail.sha.in_(sha_list))
        .all()
    )
    pending_map = {row[0]: row[1] for row in pending_rows}

    statuses = {}
    for sha in sha_list:
        if sha in diff_shas:
            statuses[sha] = "ready"
        elif pending_map.get(sha) == "pending":
            statuses[sha] = "pending"
        else:
            statuses[sha] = "none"

    return {"success": True, "statuses": statuses}
