"""
Audio snippet endpoints – upload, stream/redirect, metadata, delete.
"""

from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import (
    MAX_AUDIO_SNIPPET_SIZE,
    format_bytes,
    get_auth,
    limiter,
    require_repo_access,
    resolve_owner_id,
    verify_token,
)
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from logging_config import get_logger
from models.repo_models import RepoData

logger = get_logger(__name__)

router = APIRouter(tags=["snippets"])

async def _optional_caller(request: Request):
    authz = request.headers.get("Authorization") or request.headers.get("authorization")
    if not authz or not authz.startswith("Bearer "):
        return None, None
    token = authz.replace("Bearer ", "", 1).strip()
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return None, None
    user = user_res.get("user", {}) or {}
    return user.get("id"), user.get("email")


# ── Upload ───────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/snippet")
@limiter.limit(settings.rate_limit_upload)
async def upload_audio_snippet(
    request: Request,
    owner: str,
    repo: str,
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Upload audio snippet for a repo (owner only)."""
    from services.snippet_service import snippet_service

    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    if str(user_id) != str(owner_id):
        raise HTTPException(status_code=403, detail="Not your repo")

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        repo_data = RepoData(gitea_id=repo_id, owner_id=str(user_id), clone_count=0)
        db.add(repo_data)

    # Validate file size before reading content (check Content-Length header)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_AUDIO_SNIPPET_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum allowed size of {format_bytes(MAX_AUDIO_SNIPPET_SIZE)}"
                )
        except ValueError:
            # Invalid Content-Length header, will validate after reading
            pass

    # Validate content-type header before processing
    if file.content_type and not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type '{file.content_type}'. Must be an audio file."
        )

    content = await file.read()

    # Validate actual file size after reading (defense in depth)
    if len(content) > MAX_AUDIO_SNIPPET_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size {format_bytes(len(content))} exceeds maximum allowed size of {format_bytes(MAX_AUDIO_SNIPPET_SIZE)}"
        )

    # Validate file is not empty
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        result = await snippet_service.save_snippet(
            owner, repo, file.filename, content,
            content_type=file.content_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    repo_data.audio_snippet = result["url"]
    repo_data.snippet_duration = result.get("duration")
    repo_data.snippet_file_size = result.get("file_size")
    repo_data.snippet_format = result.get("format")
    repo_data.snippet_sample_rate = result.get("sample_rate")
    repo_data.snippet_channels = result.get("channels")
    db.commit()

    logger.info(
        "repo_snippet_uploaded",
        repo_id=repo_id,
        url=result["url"],
        duration=result.get("duration"),
        file_size=result.get("file_size"),
    )

    return {
        "success": True,
        "url": result["url"],
        "metadata": {
            "duration": result.get("duration"),
            "file_size": result.get("file_size"),
            "format": result.get("format"),
            "sample_rate": result.get("sample_rate"),
            "channels": result.get("channels"),
        },
    }


# ── Get / Redirect ──────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/snippet")
async def get_repo_snippet(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """Redirect to the Supabase CDN URL for the audio snippet (public)."""
    caller_id, caller_email = await _optional_caller(request)
    require_repo_access(owner, repo, caller_id, caller_email, db)

    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()

    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet for this repo")

    logger.debug("repo_snippet_redirect", repo_id=repo_id, url=repo_data.audio_snippet)
    return RedirectResponse(url=repo_data.audio_snippet)


# ── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/snippet/metadata")
async def get_repo_snippet_metadata(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """Get metadata for a repo's audio snippet (public)."""
    caller_id, caller_email = await _optional_caller(request)
    require_repo_access(owner, repo, caller_id, caller_email, db)

    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()

    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet for this repo")

    return {
        "success": True,
        "repo_id": repo_id,
        "snippet": {
            "url": repo_data.audio_snippet,
            "duration": repo_data.snippet_duration,
            "file_size": repo_data.snippet_file_size,
            "format": repo_data.snippet_format,
            "sample_rate": repo_data.snippet_sample_rate,
            "channels": repo_data.snippet_channels,
        },
    }


# ── Delete ───────────────────────────────────────────────────────────────────

@router.delete("/repos/{owner}/{repo}/snippet")
@limiter.limit("10/minute")
async def delete_repo_snippet(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete the audio snippet for a repo (owner only)."""
    from services.snippet_service import snippet_service

    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    if str(user_id) != str(owner_id):
        raise HTTPException(status_code=403, detail="Not your repo")

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()

    if not repo_data or not repo_data.audio_snippet:
        raise HTTPException(status_code=404, detail="No audio snippet to delete")

    deleted = await snippet_service.delete_snippet(owner_id, repo)
    if not deleted:
        logger.warning(
            "snippet_delete_storage_miss",
            repo_id=repo_id,
            message="File not found in Supabase but clearing DB record anyway",
        )

    repo_data.audio_snippet = None
    repo_data.snippet_duration = None
    repo_data.snippet_file_size = None
    repo_data.snippet_format = None
    repo_data.snippet_sample_rate = None
    repo_data.snippet_channels = None
    db.commit()

    logger.info("repo_snippet_deleted", repo_id=repo_id)
    return {"success": True, "message": "Snippet deleted"}
