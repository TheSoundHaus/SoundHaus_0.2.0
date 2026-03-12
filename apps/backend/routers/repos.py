"""
Repository CRUD endpoints – list, create, contents, upload, settings, clone,
delete-file, public repos, and repo stats.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

from database import get_db
from config import settings
from dependencies import limiter, user_limiter, verify_token, get_auth
from logging_config import get_logger
from services.repo_service import RepoService
from services.gitea_service import GiteaAdminService
from services.webhook_service import webhook_service
from models.repo_models import RepoData
from models.clone_models import CloneEvent
from models.genre_models import GenreList
from models.schemas import (
    CreateRepoRequest,
    UploadFileRequest,
    DeleteFileRequest,
)
from sqlalchemy.exc import IntegrityError

logger = get_logger(__name__)

router = APIRouter(tags=["repos"])


# ── List / Create ────────────────────────────────────────────────────────────

@router.get("/repos")
@user_limiter.limit("60/minute")
async def list_repos(request: Request, token: str = Depends(verify_token)):
    """List Gitea repositories for the current user (protected)."""
    logger.debug("list_repos", endpoint="/repos", method="GET")
    user_res = await get_auth().get_user(token)
    logger.debug("list_repos", get_user_success=user_res.get("success"))

    if not user_res.get("success"):
        logger.warning("list_repos", status="failed", reason="user_fetch_failed", message=user_res.get("message"))
        raise HTTPException(status_code=401, detail=user_res.get("message", "Unable to fetch user"))

    user_id = user_res["user"]["id"]
    logger.debug("list_repos", user_id=user_id)

    svc = RepoService()
    res = svc.list_user_repos(user_id)
    logger.info("list_repos", success=res.get("success"), repo_count=len(res.get("repos", [])))

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to list repos"))
    return {"success": True, "repos": res.get("repos", [])}


@router.post("/repos")
@user_limiter.limit("20/minute")
async def create_repo(
    request: Request,
    create_request: CreateRepoRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a new Gitea repository for the current user (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    gitea_username = user_id

    svc = RepoService()
    res = svc.create_user_repo(
        gitea_username,
        create_request.name,
        db,
        description=create_request.description or "",
        private=create_request.private,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to create repo"))

    # Create RepoData entry in our database
    gitea_id = f"{gitea_username}/{create_request.name}"
    repo_data = RepoData(
        gitea_id=gitea_id,
        audio_snippet=None,
        clone_count=0,
        owner_id=user_id,
    )
    db.add(repo_data)
    db.commit()
    db.refresh(repo_data)

    # Auto-create webhook for push/create/delete notifications
    webhook_result = None
    try:
        gitea_admin = GiteaAdminService()
        webhook_result = webhook_service.setup_webhook_for_repo(
            owner=gitea_username,
            repo=create_request.name,
            gitea_admin=gitea_admin,
            db=db,
        )
        db.commit()
        if webhook_result.get("success"):
            logger.info("webhook_auto_created", repo=gitea_id, webhook_id=webhook_result.get("webhook_id"))
        else:
            logger.warning("webhook_auto_create_failed", repo=gitea_id, error=webhook_result.get("message"))
    except Exception as e:
        logger.error("webhook_auto_create_error", repo=gitea_id, error=str(e))

    return {
        "success": True,
        "repo": res.get("repo"),
        "repo_data": {"gitea_id": repo_data.gitea_id},
        "webhook": webhook_result,
    }


# ── Contents / Upload / Delete ───────────────────────────────────────────────

@router.get("/repos/{repo_name}/contents")
@user_limiter.limit("100/minute")
async def get_repo_contents(
    request: Request,
    repo_name: str,
    path: str = "",
    token: str = Depends(verify_token),
):
    """Get contents of a repository at a specific path (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    svc = RepoService()
    res = svc.get_repo_contents(user_id, repo_name, path)

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to fetch repo contents"))
    return {"success": True, "contents": res.get("contents")}


@router.post("/repos/{repo_name}/upload")
@user_limiter.limit("30/minute")
async def upload_file(
    request: Request,
    repo_name: str,
    upload_request: UploadFileRequest,
    token: str = Depends(verify_token),
):
    """Upload a file to a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    svc = RepoService()
    branch = upload_request.branch or "main"
    res = svc.upload_file(user_id, repo_name, upload_request.file_path, upload_request.content, upload_request.message, branch)

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to upload file"))
    return {"success": True, "file": res.get("file")}


@router.delete("/repos/{repo_name}/contents")
@user_limiter.limit("30/minute")
async def delete_file(
    request: Request,
    repo_name: str,
    file_path: str,
    delete_request: DeleteFileRequest,
    token: str = Depends(verify_token),
):
    """Delete a file from a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    svc = RepoService()
    branch = delete_request.branch or "main"
    res = svc.delete_file(user_id, repo_name, file_path, delete_request.message, branch)

    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to delete file"))
    return {"success": True, "message": res.get("message")}


# ── Settings ─────────────────────────────────────────────────────────────────

@router.patch("/repos/{owner}/{repo}/settings")
@user_limiter.limit("20/minute")
async def patch_repo_settings(
    request: Request,
    owner: str,
    repo: str,
    settings: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Update repository settings via Gitea (protected, owner only).
    If the settings include a 'name' key (rename), the RepoData.gitea_id
    is updated to match the new owner/repo-name."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not authorized to modify this repo")

    svc = RepoService()
    res = svc.update_repo_settings(owner, repo, settings)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to update repo settings"))

    # If the repo was renamed, sync the gitea_id in RepoData
    new_name = settings.get("name")
    if new_name and new_name != repo:
        old_id = f"{owner}/{repo}"
        new_id = f"{owner}/{new_name}"
        repo_data = db.query(RepoData).filter(RepoData.gitea_id == old_id).first()
        if repo_data:
            repo_data.gitea_id = new_id
            db.commit()
            logger.info("repo_renamed_sync", old_id=old_id, new_id=new_id)

    return {"success": True, "repo": res.get("repo")}


# ── Clone Event ──────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/clone")
@limiter.limit("30/minute")
async def record_clone_event(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Record a clone event for a repository (first clone only per user)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in to clone")

    user_id = user_res["user"]["id"]
    repo_id = f"{owner}/{repo}"

    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(
            status_code=404,
            detail="Repository not found. Owner must register it on Soundhaus.",
        )

    try:
        clone_event = CloneEvent(repo_id=repo_id, user_id=user_id)
        db.add(clone_event)
        repo_data.clone_count += 1
        db.commit()
    except IntegrityError:
        db.rollback()

    return {
        "success": True,
        "message": "Clone recorded!",
        "repo_id": repo_id,
        "total_clones": repo_data.clone_count,
        "clone_url": f"{settings.gitea_public_url}/{repo_id}.git",
    }


# ── Public / Stats ───────────────────────────────────────────────────────────

@router.get("/repos/public")
@limiter.limit("60/minute")
async def get_public_repos(
    request: Request,
    genres: Optional[str] = None,
    match: str = "any",
    db: Session = Depends(get_db),
):
    """Get all publicly published repos with audio snippets (Explore page)."""
    genre_names = []
    if genres is not None:
        genre_names = [g.strip() for g in genres.split(",")]

    query = db.query(RepoData)

    if genre_names:
        base = (
            db.query(RepoData.gitea_id)
            .join(RepoData.genres)
            .filter(GenreList.genre_name.in_(genre_names))
        )
        if match == "all":
            base = (
                base.group_by(RepoData.gitea_id)
                .having(func.count(func.distinct(GenreList.genre_name)) == len(genre_names))
            )
        subq = base.subquery()
        query = query.filter(RepoData.gitea_id.in_(subq))

    svc = RepoService()
    result = []
    for repo in query:
        try:
            owner, repo_name = repo.gitea_id.split("/", 1)
            gitea_data = svc.get_repo_contents(owner, repo_name)

            repo_info = {
                "gitea_id": repo.gitea_id,
                "owner": owner,
                "repo_name": repo_name,
                "clone_count": repo.clone_count,
                "audio_snippet": repo.audio_snippet,
                "snippet_metadata": {
                    "duration": repo.snippet_duration,
                    "file_size": repo.snippet_file_size,
                    "format": repo.snippet_format,
                    "sample_rate": repo.snippet_sample_rate,
                    "channels": repo.snippet_channels,
                } if repo.audio_snippet else None,
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{settings.gitea_public_url}/{repo.gitea_id}.git",
            }

            if gitea_data.get("success"):
                contents = gitea_data.get("contents", {})
                if isinstance(contents, list) and len(contents) > 0:
                    repo_info["description"] = contents[0].get("repository", {}).get("description", "")
                    repo_info["stars"] = contents[0].get("repository", {}).get("stars_count", 0)
                    repo_info["updated_at"] = contents[0].get("repository", {}).get("updated_at", "")

            result.append(repo_info)
        except Exception as e:
            logger.warning("get_public_repos", gitea_id=repo.gitea_id, error=str(e))
            result.append({
                "gitea_id": repo.gitea_id,
                "clone_count": repo.clone_count,
                "audio_snippet": repo.audio_snippet,
                "snippet_metadata": {
                    "duration": repo.snippet_duration,
                    "file_size": repo.snippet_file_size,
                    "format": repo.snippet_format,
                    "sample_rate": repo.snippet_sample_rate,
                    "channels": repo.snippet_channels,
                } if repo.audio_snippet else None,
                "genres": [g.genre_name for g in repo.genres],
                "clone_url": f"{settings.gitea_public_url}/{repo.gitea_id}.git",
            })

    return {"success": True, "repos": result}


@router.get("/repos/{owner}/{repo}/stats")
@limiter.limit("60/minute")
async def get_repo_stats(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """Get detailed stats for a specific repo."""
    repo_id = f"{owner}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()

    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    recent_clones = (
        db.query(CloneEvent)
        .filter(CloneEvent.repo_id == repo_id)
        .order_by(CloneEvent.cloned_at.desc())
        .limit(10)
        .all()
    )

    return {
        "success": True,
        "gitea_id": repo_data.gitea_id,
        "clone_count": repo_data.clone_count,
        "audio_snippet": repo_data.audio_snippet,
        "genres": [{"genre_id": g.genre_id, "genre_name": g.genre_name} for g in repo_data.genres],
        "recent_clones": [
            {"user_id": c.user_id, "cloned_at": c.cloned_at.isoformat()}
            for c in recent_clones
        ],
    }


# ── Star / Favorite ─────────────────────────────────────────────────────────

@router.put("/repos/{owner}/{repo}/star")
@user_limiter.limit("30/minute")
async def star_repo(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
):
    """Star (favorite) a repository on behalf of the current user."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    gitea = GiteaAdminService()
    result = gitea.star_repo(user_id, owner, repo)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to star repo"))
    return {"success": True, "message": "Repository starred"}


@router.delete("/repos/{owner}/{repo}/star")
@user_limiter.limit("30/minute")
async def unstar_repo(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
):
    """Unstar (unfavorite) a repository on behalf of the current user."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    gitea = GiteaAdminService()
    result = gitea.unstar_repo(user_id, owner, repo)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to unstar repo"))
    return {"success": True, "message": "Repository unstarred"}


@router.get("/repos/starred")
@user_limiter.limit("60/minute")
async def list_starred_repos(
    request: Request,
    token: str = Depends(verify_token),
):
    """List all repositories the current user has starred."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    gitea = GiteaAdminService()
    result = gitea.list_user_starred(user_id)

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to list starred repos"))
    return {"success": True, "repos": result.get("repos", [])}


# ── Delete Repo ──────────────────────────────────────────────────────────────

@router.delete("/repos/{owner}/{repo}")
@user_limiter.limit("10/minute")
async def delete_repo(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Delete a repository from Gitea and remove its RepoData from the database."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    if str(user_id) != str(owner):
        raise HTTPException(status_code=403, detail="Not authorized to delete this repo")

    repo_id = f"{owner}/{repo}"

    # Delete from Gitea
    svc = RepoService()
    result = svc.delete_repo(owner, repo)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to delete repo from Gitea"))

    # Delete RepoData row (CASCADE will clean up clone_events, webhook data, genres)
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if repo_data:
        db.delete(repo_data)
        db.commit()
        logger.info("repo_deleted", repo_id=repo_id)

    return {"success": True, "message": f"Repository '{repo}' deleted"}


# ── Enriched Repos ───────────────────────────────────────────────────────────

@router.get("/repos/enriched")
@user_limiter.limit("60/minute")
async def get_enriched_repos(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Get the current user's repos enriched with SoundHaus metadata.
    Combines Gitea repo data + RepoData (snippet, genres, clone_count) + star status.
    Single call replaces N+1 pattern of getMyRepos + getRepoStats per repo.
    """
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    # Fetch Gitea repos
    svc = RepoService()
    gitea_result = svc.list_user_repos(user_id)
    if not gitea_result.get("success"):
        raise HTTPException(status_code=400, detail=gitea_result.get("message", "Failed to list repos"))

    gitea_repos = gitea_result.get("repos", [])

    # Fetch starred repos for this user
    gitea_admin = GiteaAdminService()
    starred_result = gitea_admin.list_user_starred(user_id)
    starred_ids = set()
    if starred_result.get("success"):
        for sr in starred_result.get("repos", []):
            starred_ids.add(sr.get("full_name", ""))

    # Fetch all RepoData rows for this user's repos in one query
    repo_full_names = [r.get("full_name", "") for r in gitea_repos]
    repo_data_rows = (
        db.query(RepoData)
        .filter(RepoData.gitea_id.in_(repo_full_names))
        .all()
    )
    repo_data_map = {rd.gitea_id: rd for rd in repo_data_rows}

    enriched = []
    for repo in gitea_repos:
        full_name = repo.get("full_name", "")
        rd = repo_data_map.get(full_name)

        enriched.append({
            "id": repo.get("id"),
            "name": repo.get("name"),
            "full_name": full_name,
            "description": repo.get("description", ""),
            "private": repo.get("private", True),
            "owner_id": repo.get("owner", {}).get("login", ""),
            "created_at": repo.get("created_at", ""),
            "updated_at": repo.get("updated_at", ""),
            "stars_count": repo.get("stars_count", 0),
            "clone_count": rd.clone_count if rd else 0,
            "audio_snippet": rd.audio_snippet if rd else None,
            "snippet_metadata": {
                "duration": rd.snippet_duration,
                "file_size": rd.snippet_file_size,
                "format": rd.snippet_format,
                "sample_rate": rd.snippet_sample_rate,
                "channels": rd.snippet_channels,
            } if rd and rd.audio_snippet else None,
            "genres": [g.genre_name for g in rd.genres] if rd else [],
            "is_starred": full_name in starred_ids,
        })

    return {"success": True, "repos": enriched}
