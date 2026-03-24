"""
Stem separation endpoints – create jobs, poll status, confirm, history.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from dependencies import limiter, verify_token, get_auth
from logging_config import get_logger
from models.repo_models import RepoData
from models.stem_models import SnippetVersion, StemJobStatus

from models.schemas import (
    StemJobCreate,
    StemJobStatusResponse,
    SnippetVersionResponse,
    StemsLatestResponse,
)

logger = get_logger(__name__)

router = APIRouter(tags=["stems"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_repo(db: Session, owner: str, repo: str) -> RepoData:
    """Fetch a RepoData row or raise 404."""
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo_data


async def _get_user_id(token: str) -> str:
    """Extract Supabase user ID from token."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")
    return user_res["user"]["id"]


def _require_owner(user_id: str, owner: str):
    """Ensure the authenticated user matches the repo owner."""
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not your repo")


# ── Create stem job ──────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/stems/jobs", response_model=StemJobStatusResponse)
@limiter.limit("5/minute")
async def create_stem_job(
    request: Request,
    owner: str,
    repo: str,
    job_data: StemJobCreate,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Start a stem generation job (owner only).

    Returns a job_id immediately. The worker picks up the QUEUED row and
    processes it asynchronously. Poll GET .../stems/jobs/{job_id} for status.
    """
    from services.demucs_service import DemucsService

    user_id = await _get_user_id(token)
    _require_owner(user_id, owner)

    repo_data = _get_repo(db, owner, repo)

    demucs = DemucsService(db)

    # Download source to compute hash for deduplication
    source_file = await demucs.download_source_audio(str(job_data.source_snippet_url))
    source_hash = demucs.calculate_file_hash(source_file)
    source_file.unlink(missing_ok=True)  # clean up temp

    # If we already have a successful run for this exact audio, return it
    existing = demucs.check_duplicate(repo_data.gitea_id, source_hash)
    if existing:
        return StemJobStatusResponse(
            job_id=existing.id,
            status=existing.status,
            error_message="Stems already exist for this audio",
        )

    # If there's already a queued or processing job for this repo, return it
    in_progress = (
        db.query(SnippetVersion)
        .filter(
            SnippetVersion.repo_gitea_id == repo_data.gitea_id,
            SnippetVersion.status.in_([StemJobStatus.QUEUED, StemJobStatus.PROCESSING]),
        )
        .first()
    )
    if in_progress:
        return StemJobStatusResponse(
            job_id=in_progress.id,
            status=in_progress.status,
            error_message="A stem job is already in progress",
        )

    # Create a QUEUED SnippetVersion
    version = SnippetVersion(
        repo_gitea_id=repo_data.gitea_id,
        source_upload_url=str(job_data.source_snippet_url),
        source_hash=source_hash,
        commit_sha=job_data.commit_sha,
        status=StemJobStatus.QUEUED,
        created_by=str(user_id),
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    logger.info("stem_job_created", job_id=version.id, repo=repo_data.gitea_id)

    return StemJobStatusResponse(
        job_id=version.id,
        status=version.status,
        error_message=None,
    )


# ── Poll job status ──────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/stems/jobs/{job_id}", response_model=StemJobStatusResponse)
async def get_stem_job_status(
    owner: str,
    repo: str,
    job_id: int,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Poll the status of a stem generation job."""
    version = db.query(SnippetVersion).filter(SnippetVersion.id == job_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Job not found")

    return StemJobStatusResponse(
        job_id=version.id,
        status=version.status,
        error_message=version.error_message,
    )


# ── Get latest confirmed stems ───────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/stems/latest", response_model=StemsLatestResponse)
async def get_latest_stems(
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """
    Get the latest confirmed stem set for a repo (public, follows repo visibility).
    """
    repo_data = _get_repo(db, owner, repo)

    latest = (
        db.query(SnippetVersion)
        .filter(
            SnippetVersion.repo_gitea_id == repo_data.gitea_id,
            SnippetVersion.is_confirmed == True,
            SnippetVersion.status == StemJobStatus.SUCCEEDED,
        )
        .order_by(SnippetVersion.created_at.desc())
        .first()
    )

    return StemsLatestResponse(
        snippet_version=latest,
        has_stems=latest is not None,
    )


# ── Confirm a stem set ──────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/stems/jobs/{job_id}/confirm")
@limiter.limit("10/minute")
async def confirm_stem_job(
    request: Request,
    owner: str,
    repo: str,
    job_id: int,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Confirm a successful stem set as the "current" one (owner only).
    Un-confirms any previously confirmed version.
    """
    user_id = await _get_user_id(token)
    _require_owner(user_id, owner)

    repo_data = _get_repo(db, owner, repo)

    version = db.query(SnippetVersion).filter(SnippetVersion.id == job_id).first()
    if not version or version.repo_gitea_id != repo_data.gitea_id:
        raise HTTPException(status_code=404, detail="Job not found")

    if version.status != StemJobStatus.SUCCEEDED:
        raise HTTPException(status_code=400, detail="Cannot confirm a non-successful job")

    # Un-confirm all other versions for this repo
    db.query(SnippetVersion).filter(
        SnippetVersion.repo_gitea_id == repo_data.gitea_id,
    ).update({"is_confirmed": False})

    version.is_confirmed = True
    db.commit()

    logger.info("stem_confirmed", job_id=job_id, repo=repo_data.gitea_id)
    return {"success": True, "message": "Stem set confirmed as current"}


# ── Stem history ─────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/stems/history", response_model=List[SnippetVersionResponse])
async def get_stems_history(
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get all stem versions for a repo (owner only)."""
    user_id = await _get_user_id(token)
    _require_owner(user_id, owner)

    repo_data = _get_repo(db, owner, repo)

    versions = (
        db.query(SnippetVersion)
        .filter(SnippetVersion.repo_gitea_id == repo_data.gitea_id)
        .order_by(SnippetVersion.created_at.desc())
        .all()
    )

    return versions
