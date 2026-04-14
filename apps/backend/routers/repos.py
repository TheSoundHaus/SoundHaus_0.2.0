"""
Repository CRUD endpoints – list, create, contents, upload, settings, clone,
delete-file, public repos, and repo stats.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import (
    get_auth,
    limiter,
    resolve_owner_id,
    user_limiter,
    verify_token,
    verify_token_or_pat,
)
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from logging_config import get_logger
from models.clone_models import CloneEvent
from models.genre_models import GenreList
from models.invitation_models import CollaborationRequest, CollaboratorInvitation
from models.profile_models import Profile
from models.repo_models import RepoData
from models.schemas import (
    CreateRepoRequest,
    DeleteFileRequest,
    RegisterRepoRequest,
    UploadFileRequest,
)
from services.gitea_service import GiteaAdminService
from services.repo_service import RepoService

logger = get_logger(__name__)


def _norm_email(value: str | None) -> str:
    return (value or "").strip().lower()

router = APIRouter(tags=["repos"])


# ── Helpers ───────────────────────────────────────────────────────────────────


def _resolve_gitea_username(user_id: str, db: Session) -> str:
    """Return the Gitea login for a Supabase UUID.

    In SoundHaus, Gitea user logins ARE the Supabase UUID strings.
    This function exists so call-sites remain readable.
    """
    return user_id


def _owner_profile_fields(profile: Profile | None, gitea_owner: str) -> dict[str, str]:
    """SoundHaus username (for /profile links)."""
    if profile is None:
        return {"owner_username": gitea_owner}
    username = profile.username or gitea_owner
    return {"owner_username": username}


def _verify_owner(user_id: str, url_owner: str, db: Session) -> None:
    """Raise 403 if the authenticated user does not own the resource.

    url_owner can be a Supabase UUID or a SoundHaus username; we resolve
    it to the canonical UUID before comparing.
    """
    owner_id = resolve_owner_id(url_owner, db)
    if str(user_id) != str(owner_id):
        raise HTTPException(status_code=403, detail="Not authorized")


# ── List / Create ────────────────────────────────────────────────────────────

@router.get("/repos")
@user_limiter.limit("60/minute")
async def list_repos(request: Request, token: str = Depends(verify_token), db: Session = Depends(get_db)):
    """List Gitea repositories for the current user (protected)."""
    logger.debug("list_repos", endpoint="/repos", method="GET")
    user_res = await get_auth().get_user(token)
    logger.debug("list_repos", get_user_success=user_res.get("success"))

    if not user_res.get("success"):
        logger.warning("list_repos", status="failed", reason="user_fetch_failed", message=user_res.get("message"))
        raise HTTPException(status_code=401, detail=user_res.get("message", "Unable to fetch user"))

    user_id = user_res["user"]["id"]
    gitea_username = _resolve_gitea_username(user_id, db)
    logger.debug("list_repos", user_id=user_id, gitea_username=gitea_username)

    svc = RepoService()
    res = svc.list_user_repos(gitea_username)
    logger.info("list_repos", success=res.get("success"), repo_count=len(res.get("repos", [])))

    if not res.get("success"):
        if "does not exist" in str(res.get("message", "")):
            return {"success": True, "repos": []}
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
    gitea_username = _resolve_gitea_username(user_id, db)

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

    # Note: webhook is already created inside RepoService.create_user_repo()
    # via _create_repo_webhook(), so no duplicate setup needed here.

    return {
        "success": True,
        "repo": res.get("repo"),
        "repo_data": {"gitea_id": repo_data.gitea_id},
    }


@router.post("/repos/register")
@user_limiter.limit("20/minute")
async def register_repo(
    request: Request,
    register_request: RegisterRepoRequest,
    user_info: dict = Depends(verify_token_or_pat),
    db: Session = Depends(get_db),
):
    """Register an existing Gitea repo in the database.

    Called by the desktop app after it creates a repo directly via the Gitea
    user API so that the repo_data row (needed for stars, clones, genres, etc.)
    also exists.  If the row already exists this is a no-op and returns success.
    """
    if not user_info or not user_info.get("user_id"):
        raise HTTPException(status_code=401, detail="Unable to identify user")

    user_id = user_info["user_id"]
    gitea_username = _resolve_gitea_username(user_id, db)
    gitea_id = f"{gitea_username}/{register_request.name}"

    existing = db.query(RepoData).filter(RepoData.gitea_id == gitea_id).first()
    if existing:
        return {"success": True, "repo_data": {"gitea_id": existing.gitea_id}, "created": False}

    repo_data = RepoData(
        gitea_id=gitea_id,
        audio_snippet=None,
        clone_count=0,
        owner_id=user_id,
    )
    try:
        db.add(repo_data)
        db.commit()
        db.refresh(repo_data)
    except IntegrityError:
        db.rollback()
        return {"success": True, "repo_data": {"gitea_id": gitea_id}, "created": False}

    # Set up a webhook for this repo so push events are tracked
    try:
        svc = RepoService()
        svc._create_repo_webhook(user_id, register_request.name, db)
    except Exception as e:
        logger.warning("register_repo", msg="webhook creation failed", error=str(e))

    return {"success": True, "repo_data": {"gitea_id": repo_data.gitea_id}, "created": True}


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
@user_limiter.limit(settings.rate_limit_upload)
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
    owner_id = resolve_owner_id(owner, db)
    _verify_owner(user_id, owner_id, db)

    svc = RepoService()
    res = svc.update_repo_settings(owner_id, repo, settings)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Failed to update repo settings"))

    # If the repo was renamed, sync the gitea_id in RepoData
    new_name = settings.get("name")
    if new_name and new_name != repo:
        old_id = f"{owner_id}/{repo}"
        new_id = f"{owner_id}/{new_name}"
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
    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"

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
    genres: str | None = None,
    match: str = "any",
    db: Session = Depends(get_db),
):
    """Get all publicly published repos with audio snippets (Explore page).

    Only repos whose Gitea visibility is public are returned.
    """
    genre_names = []
    if genres is not None:
        genre_names = [g.strip() for g in genres.split(",")]

    query = db.query(RepoData).filter(RepoData.is_public.is_(True))

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

    all_repos = query.all()

    # Batch-resolve owner UUIDs → SoundHaus username + display name
    owner_ids = list({r.gitea_id.split("/", 1)[0] for r in all_repos if "/" in r.gitea_id})
    profile_rows = db.query(Profile).filter(Profile.id.in_(owner_ids)).all()
    profile_map = {str(p.id): _owner_profile_fields(p, str(p.id)) for p in profile_rows}

    svc = RepoService()
    result = []

    # Parallelize Gitea visibility checks to avoid N+1 sequential HTTP calls
    def _fetch_gitea(repo_row):
        owner, repo_name = repo_row.gitea_id.split("/", 1)
        gitea_info = svc.get_repo(owner, repo_name)
        return repo_row, gitea_info

    gitea_results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_fetch_gitea, r): r for r in all_repos}
        for future in as_completed(futures):
            try:
                repo_row, gitea_info = future.result()
                gitea_results[repo_row.gitea_id] = gitea_info
            except Exception as e:
                repo_row = futures[future]
                logger.warning("get_public_repos_parallel", gitea_id=repo_row.gitea_id, error=str(e))

    for repo in all_repos:
        try:
            owner, repo_name = repo.gitea_id.split("/", 1)
            fields = profile_map.get(owner, _owner_profile_fields(None, owner))

            # Check Gitea visibility — skip private repos
            gitea_info = gitea_results.get(repo.gitea_id, {})
            if not gitea_info.get("success"):
                continue
            gitea_repo = gitea_info.get("repo", {})
            if gitea_repo.get("private", True):
                continue

            repo_info = {
                "gitea_id": repo.gitea_id,
                "owner": owner,
                "owner_username": fields["owner_username"],
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
                "thumbnail_url": repo.thumbnail_url,
                "thumbnail_type": repo.thumbnail_type,
                "description": gitea_repo.get("description", ""),
                "stars": gitea_repo.get("stars_count", 0),
                "updated_at": gitea_repo.get("updated_at", ""),
            }

            result.append(repo_info)
        except Exception as e:
            logger.warning("get_public_repos", gitea_id=repo.gitea_id, error=str(e))

    return {"success": True, "repos": result}


@router.get("/repos/user/{username}")
@limiter.limit("60/minute")
async def get_user_public_repos(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
):
    """Get all public repos owned by a specific user (no auth required).
    Accepts either a Supabase UUID or a SoundHaus username."""
    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        profile = db.query(Profile).filter(Profile.id == username).first()
    owner_id = str(profile.id) if profile else username
    labels = _owner_profile_fields(profile, owner_id)
    owner_username = labels["owner_username"]

    repos = db.query(RepoData).filter(
        RepoData.owner_id == owner_id,
        RepoData.is_public.is_(True),
    ).all()

    svc = RepoService()
    result = []
    for repo in repos:
        try:
            owner, repo_name = repo.gitea_id.split("/", 1)
            gitea_data = svc.get_repo_contents(owner, repo_name)

            repo_info = {
                "gitea_id": repo.gitea_id,
                "owner": owner,
                "owner_username": owner_username,
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
                "thumbnail_url": repo.thumbnail_url,
                "thumbnail_type": repo.thumbnail_type,
            }

            if gitea_data.get("success"):
                contents = gitea_data.get("contents", {})
                if isinstance(contents, list) and len(contents) > 0:
                    repo_info["description"] = contents[0].get("repository", {}).get("description", "")
                    repo_info["stars"] = contents[0].get("repository", {}).get("stars_count", 0)
                    repo_info["updated_at"] = contents[0].get("repository", {}).get("updated_at", "")

            result.append(repo_info)
        except Exception as e:
            logger.warning("get_user_public_repos", gitea_id=repo.gitea_id, error=str(e))

    return {"success": True, "repos": result}


@router.get("/repos/user/{username}/stats")
@limiter.limit("60/minute")
async def get_user_public_stats(
    request: Request,
    username: str,
    db: Session = Depends(get_db),
):
    """Get aggregate public stats for a user (no auth required)."""
    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        profile = db.query(Profile).filter(Profile.id == username).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = str(profile.id)

    pub_filter = [
        RepoData.owner_id == user_id,
        RepoData.is_public.is_(True),
    ]
    total_repos = (
        db.query(func.count(RepoData.gitea_id))
        .filter(*pub_filter)
        .scalar() or 0
    )
    total_commits = (
        db.query(func.sum(RepoData.total_commits))
        .filter(*pub_filter)
        .scalar() or 0
    )
    total_clones = (
        db.query(func.sum(RepoData.clone_count))
        .filter(*pub_filter)
        .scalar() or 0
    )
    collaborations = 0
    if profile.email:
        collaborations = (
            db.query(func.count(CollaboratorInvitation.id))
            .filter(
                CollaboratorInvitation.invitee_email == profile.email,
                CollaboratorInvitation.status == "accepted",
            )
            .scalar() or 0
        )

    return {
        "success": True,
        "stats": {
            "total_repos": total_repos,
            "total_commits": int(total_commits),
            "total_clones_received": int(total_clones),
            "collaborations": collaborations,
        },
    }


@router.get("/repos/{owner}/{repo}/stats")
@limiter.limit("60/minute")
async def get_repo_stats(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """Get detailed stats for a specific repo."""
    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"
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

    # Fetch description, privacy, and fork parent from Gitea
    svc = RepoService()
    description = ""
    is_private = True
    fork_parent = None
    try:
        gitea_info = svc.get_repo(owner_id, repo)
        if gitea_info.get("success"):
            repo_obj = gitea_info.get("repo", {})
            description = repo_obj.get("description", "")
            is_private = repo_obj.get("private", True)
            parent = repo_obj.get("parent")
            if parent:
                parent_owner_id = parent.get("owner", {}).get("login", "")
                parent_name = parent.get("name", "")
                parent_profile = db.query(Profile).filter(Profile.id == parent_owner_id).first()
                fork_parent = {
                    "owner": parent_profile.username if parent_profile and parent_profile.username else parent_owner_id,
                    "repo": parent_name,
                }
    except Exception:
        pass  # Non-critical: description/privacy are cosmetic

    # Resolve owner UUID → username + display name
    owner_profile = db.query(Profile).filter(Profile.id == owner_id).first()
    olab = _owner_profile_fields(owner_profile, owner_id)

    viewer_can_clone = False
    viewer_pending_invite = False
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            user_res = await get_auth().get_user(token)
            if user_res.get("success"):
                uid = str(user_res["user"]["id"])
                email_n = _norm_email(user_res["user"].get("email"))
                if uid == str(owner_id):
                    viewer_can_clone = True
                else:
                    collabs = svc.list_collaborators(owner_id, repo, db)
                    if collabs.get("success"):
                        my_ids = {uid}
                        rp = db.query(Profile).filter(Profile.id == uid).first()
                        if rp and rp.username:
                            my_ids.add(rp.username.strip())
                        for c in collabs.get("collaborators", []):
                            login = (c.get("login") or "").strip()
                            uname = (c.get("username") or "").strip()
                            if login in my_ids or (rp and rp.username and uname == rp.username):
                                viewer_can_clone = True
                                break
                    if not viewer_can_clone and email_n:
                        now = datetime.now(UTC)
                        pend = (
                            db.query(CollaboratorInvitation)
                            .filter(
                                CollaboratorInvitation.repo_name == repo,
                                CollaboratorInvitation.owner_username == owner_id,
                                func.lower(CollaboratorInvitation.invitee_email) == email_n,
                                CollaboratorInvitation.status == "pending",
                                CollaboratorInvitation.expires_at > now,
                            )
                            .first()
                        )
                        viewer_pending_invite = pend is not None
        except Exception as ex:
            logger.debug("get_repo_stats_viewer_flags", error=str(ex))

    return {
        "success": True,
        "gitea_id": repo_data.gitea_id,
        "owner_username": olab["owner_username"],
        "description": description,
        "private": is_private,
        "owner_id": owner_id,
        "clone_url": f"{settings.gitea_public_url}/{owner_id}/{repo}.git",
        "clone_count": repo_data.clone_count,
        "audio_snippet": repo_data.audio_snippet,
        "thumbnail_url": repo_data.thumbnail_url,
        "thumbnail_type": repo_data.thumbnail_type,
        "forked_from": repo_data.forked_from,
        "open_to_collab": repo_data.open_to_collab,
        "genres": [{"genre_id": g.genre_id, "genre_name": g.genre_name} for g in repo_data.genres],
        "recent_clones": [
            {"user_id": c.user_id, "cloned_at": c.cloned_at.isoformat()}
            for c in recent_clones
        ],
        "fork_parent": fork_parent,
        "viewer_can_clone": viewer_can_clone,
        "viewer_pending_invite": viewer_pending_invite,
    }


# ── Collaboration Requests Toggle ────────────────────────────────────────────

@router.patch("/repos/{owner}/{repo}/open-to-collab")
@user_limiter.limit("10/minute")
async def toggle_open_to_collab(
    request: Request,
    owner: str,
    repo: str,
    body: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Toggle whether this repo accepts collaboration requests. Owner only."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)

    if str(user_id) != str(owner_id):
        raise HTTPException(status_code=403, detail="Only the repo owner can change this setting")

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repository not found")

    repo_data.open_to_collab = bool(body.get("open_to_collab", False))
    db.commit()

    return {"success": True, "open_to_collab": repo_data.open_to_collab}


@router.post("/repos/{owner}/{repo}/collaboration-request")
@user_limiter.limit("10/minute")
async def create_collaboration_request(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Logged-in user asks the owner for an invite. Requires open_to_collab."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = str(user_res["user"]["id"])
    email = _norm_email(user_res["user"].get("email"))
    if not email:
        raise HTTPException(status_code=400, detail="Your account needs an email address to request access")

    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repository not found")

    if not repo_data.open_to_collab:
        raise HTTPException(status_code=403, detail="This project is not accepting collaboration requests")

    if user_id == str(owner_id):
        raise HTTPException(status_code=400, detail="You already own this project")

    svc = RepoService()
    collabs = svc.list_collaborators(owner_id, repo, db)
    if collabs.get("success"):
        rp = db.query(Profile).filter(Profile.id == user_id).first()
        my_ids = {user_id}
        if rp and rp.username:
            my_ids.add(rp.username.strip())
        for c in collabs.get("collaborators", []):
            login = (c.get("login") or "").strip()
            uname = (c.get("username") or "").strip()
            if login in my_ids or (rp and rp.username and uname == rp.username):
                raise HTTPException(status_code=400, detail="You are already a collaborator")

    existing = (
        db.query(CollaborationRequest)
        .filter(
            CollaborationRequest.owner_id == owner_id,
            CollaborationRequest.repo_name == repo,
            CollaborationRequest.requester_id == user_id,
            CollaborationRequest.status == "pending",
        )
        .first()
    )
    if existing:
        return {"success": True, "message": "You already have a pending request for this project"}

    row = CollaborationRequest(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        repo_name=repo,
        requester_id=user_id,
        requester_email=email,
        status="pending",
    )
    db.add(row)
    db.commit()
    return {"success": True, "message": "Request sent to the project owner"}


@router.get("/repos/{owner}/{repo}/collaboration-requests")
@user_limiter.limit("60/minute")
async def list_collaboration_requests(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Owner-only: pending collaboration requests for this repo."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = str(user_res["user"]["id"])
    owner_id = resolve_owner_id(owner, db)
    if user_id != str(owner_id):
        raise HTTPException(status_code=403, detail="Only the repository owner can view requests")

    rows = (
        db.query(CollaborationRequest)
        .filter(
            CollaborationRequest.owner_id == owner_id,
            CollaborationRequest.repo_name == repo,
            CollaborationRequest.status == "pending",
        )
        .order_by(CollaborationRequest.created_at.desc())
        .all()
    )
    out = []
    for r in rows:
        prof = db.query(Profile).filter(Profile.id == r.requester_id).first()
        out.append(
            {
                "id": r.id,
                "requester_id": r.requester_id,
                "requester_email": r.requester_email,
                "requester_username": prof.username if prof and prof.username else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return {"success": True, "requests": out}


@router.delete("/repos/{owner}/{repo}/collaboration-requests/{request_id}")
@user_limiter.limit("20/minute")
async def dismiss_collaboration_request(
    request: Request,
    owner: str,
    repo: str,
    request_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Owner dismisses a pending collaboration request."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_id = str(user_res["user"]["id"])
    owner_id = resolve_owner_id(owner, db)
    if user_id != str(owner_id):
        raise HTTPException(status_code=403, detail="Only the repository owner can dismiss requests")

    row = (
        db.query(CollaborationRequest)
        .filter(
            CollaborationRequest.id == request_id,
            CollaborationRequest.owner_id == owner_id,
            CollaborationRequest.repo_name == repo,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    row.status = "dismissed"
    db.commit()
    return {"success": True, "message": "Request dismissed"}


# ── Fork ─────────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/fork")
@user_limiter.limit("10/minute")
async def fork_repo(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Fork a public repository into the authenticated user's namespace."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in to fork")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    source_repo_id = f"{owner_id}/{repo}"

    # Verify the source repo exists in SoundHaus
    source_data = db.query(RepoData).filter(RepoData.gitea_id == source_repo_id).first()
    if not source_data:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Cannot fork your own repo
    if str(user_id) == str(owner_id):
        raise HTTPException(status_code=400, detail="Cannot fork your own project")

    # Ensure the forking user has a Gitea account
    gitea = GiteaAdminService()
    user_check = gitea.get_user_by_username(user_id)
    if not user_check.get("exists"):
        raise HTTPException(status_code=400, detail="Git account not provisioned. Please log in from the desktop app first.")

    # Call Gitea fork API
    svc = RepoService()
    result = svc.fork_repo(owner_id, repo, user_id)

    if not result.get("success"):
        status = result.get("status", 500)
        if status == 409:
            raise HTTPException(status_code=409, detail="You already have a version of this project")
        raise HTTPException(status_code=status or 500, detail=result.get("message", "Failed to fork"))

    forked_repo = result.get("repo", {})
    fork_full_name = forked_repo.get("full_name", f"{user_id}/{repo}")

    # Create a RepoData entry for the fork
    try:
        fork_data = RepoData(
            gitea_id=fork_full_name,
            owner_id=user_id,
            forked_from=source_repo_id,
            clone_count=0,
            total_commits=0,
            is_public=source_data.is_public,
        )
        db.add(fork_data)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Fork RepoData already exists — not an error

    # Resolve forking user's display name
    fork_profile = db.query(Profile).filter(Profile.id == user_id).first()
    fork_username = fork_profile.username if fork_profile else user_id

    return {
        "success": True,
        "message": f"Created your version of {repo}",
        "fork": {
            "full_name": fork_full_name,
            "name": forked_repo.get("name", repo),
            "owner": fork_username,
            "clone_url": forked_repo.get("clone_url", f"{settings.gitea_public_url}/{fork_full_name}.git"),
            "forked_from": source_repo_id,
        },
    }


# ── Star / Favorite ─────────────────────────────────────────────────────────

@router.put("/repos/{owner}/{repo}/star")
@user_limiter.limit("30/minute")
async def star_repo(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Star (favorite) a repository on behalf of the current user."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    gitea = GiteaAdminService()
    result = gitea.star_repo(user_id, owner_id, repo)

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
    db: Session = Depends(get_db),
):
    """Unstar (unfavorite) a repository on behalf of the current user."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    gitea = GiteaAdminService()
    result = gitea.unstar_repo(user_id, owner_id, repo)

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
    owner_id = resolve_owner_id(owner, db)
    _verify_owner(user_id, owner_id, db)

    repo_id = f"{owner_id}/{repo}"

    # Delete from Gitea
    svc = RepoService()
    result = svc.delete_repo(owner_id, repo)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to delete repo from Gitea"))

    # Delete RepoData row (CASCADE will clean up clone_events, webhook data, genres)
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if repo_data:
        db.delete(repo_data)
        db.commit()
        logger.info("repo_deleted", repo_id=repo_id)

    # Mark orphaned invitations: expire pending ones, flag accepted/declined
    orphaned = (
        db.query(CollaboratorInvitation)
        .filter(CollaboratorInvitation.repo_name == repo)
        .all()
    )
    if orphaned:
        for inv in orphaned:
            if inv.status == "pending":
                inv.status = "expired"
            inv.repo_name = f"{inv.repo_name} [deleted]"
        db.commit()
        logger.info("repo_invitations_flagged", repo=repo, count=len(orphaned))

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
    gitea_username = _resolve_gitea_username(user_id, db)

    # Fetch Gitea repos
    svc = RepoService()
    gitea_result = svc.list_user_repos(gitea_username)
    if not gitea_result.get("success"):
        if "does not exist" in str(gitea_result.get("message", "")):
            return {"success": True, "repos": []}
        raise HTTPException(status_code=400, detail=gitea_result.get("message", "Failed to list repos"))

    gitea_repos = gitea_result.get("repos", [])
    owned_ids = gitea_result.get("owned_ids", set())

    # Fetch starred repos for this user
    gitea_admin = GiteaAdminService()
    starred_result = gitea_admin.list_user_starred(gitea_username)
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

    # Batch-resolve owner UUIDs → SoundHaus username + display name
    owner_ids = list({r.get("owner", {}).get("login", "") for r in gitea_repos})
    profile_rows = db.query(Profile).filter(Profile.id.in_(owner_ids)).all()
    profile_map = {str(p.id): _owner_profile_fields(p, str(p.id)) for p in profile_rows}

    enriched = []
    for repo in gitea_repos:
        full_name = repo.get("full_name", "")
        rd = repo_data_map.get(full_name)
        owner_login = repo.get("owner", {}).get("login", "")
        olab = profile_map.get(owner_login, _owner_profile_fields(None, owner_login))

        enriched.append({
            "id": repo.get("id"),
            "name": repo.get("name"),
            "full_name": full_name,
            "description": repo.get("description", ""),
            "private": repo.get("private", True),
            "owner_id": owner_login,
            "owner_username": olab["owner_username"],
            "created_at": repo.get("created_at", ""),
            "updated_at": repo.get("updated_at", ""),
            "stars_count": repo.get("stars_count", 0),
            "total_commits": rd.total_commits if rd else 0,
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
            "thumbnail_url": rd.thumbnail_url if rd else None,
            "thumbnail_type": rd.thumbnail_type if rd else None,
            "is_starred": full_name in starred_ids,
            "role": "owner" if repo.get("id") in owned_ids else "collaborator",
        })

    return {"success": True, "repos": enriched}


# ── README ───────────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/readme")
@limiter.limit("60/minute")
async def get_readme(
    request: Request,
    owner: str,
    repo: str,
    db: Session = Depends(get_db),
):
    """Get the markdown README content for a repository."""
    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    return {
        "success": True,
        "readme_content": repo_data.readme_content or "",
    }


@router.put("/repos/{owner}/{repo}/readme")
@limiter.limit("20/minute")
async def update_readme(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Update the markdown README content. Only the repo owner or collaborators can edit."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = user_res["user"]["id"]

    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    # Authorization: owner or admin collaborator
    is_owner = str(repo_data.owner_id) == str(user_id)
    is_collab = False
    if not is_owner:
        user_email = user_res["user"]["email"]
        collab = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.repo_name == repo,
                CollaboratorInvitation.invitee_email == user_email,
                CollaboratorInvitation.status == "accepted",
                CollaboratorInvitation.permission == "admin",
            )
            .first()
        )
        is_collab = collab is not None

    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized to edit this repo's README")

    body = await request.json()
    content = body.get("readme_content", "")
    if len(content) > 50000:
        raise HTTPException(status_code=400, detail="README content too large (max 50,000 chars)")

    repo_data.readme_content = content
    db.commit()

    logger.info("update_readme", repo_id=repo_id, user_id=user_id, length=len(content))

    return {"success": True, "readme_content": repo_data.readme_content}


# ── Thumbnail ────────────────────────────────────────────────────────────────

MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024  # 5 MB

@router.put("/repos/{owner}/{repo}/thumbnail")
@user_limiter.limit("20/minute")
async def update_thumbnail(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Set or update the repository thumbnail. Accepts JSON with either
    a YouTube URL or a base64-encoded image."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    _verify_owner(user_id, owner_id, db)

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    body = await request.json()
    thumb_type = body.get("type")  # "youtube" or "image"
    thumb_url = body.get("url")    # YouTube URL or Supabase image URL

    if thumb_type not in ("youtube", "image"):
        raise HTTPException(status_code=400, detail="type must be 'youtube' or 'image'")

    if thumb_type == "youtube":
        # Validate it looks like a YouTube URL
        if not thumb_url or not isinstance(thumb_url, str):
            raise HTTPException(status_code=400, detail="url is required for youtube thumbnail")
        import re
        yt_pattern = re.compile(
            r'^https?://(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)[\w\-]{11}'
        )
        if not yt_pattern.match(thumb_url):
            raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        repo_data.thumbnail_url = thumb_url
        repo_data.thumbnail_type = "youtube"

    elif thumb_type == "image":
        if not thumb_url or not isinstance(thumb_url, str):
            raise HTTPException(status_code=400, detail="url is required for image thumbnail")
        # URL should be from Supabase storage
        repo_data.thumbnail_url = thumb_url
        repo_data.thumbnail_type = "image"

    db.commit()
    logger.info("thumbnail_updated", repo_id=repo_id, type=thumb_type)

    return {
        "success": True,
        "thumbnail_url": repo_data.thumbnail_url,
        "thumbnail_type": repo_data.thumbnail_type,
    }


@router.post("/repos/{owner}/{repo}/thumbnail/upload")
@user_limiter.limit("10/minute")
async def upload_thumbnail_image(
    request: Request,
    owner: str,
    repo: str,
    file: UploadFile = File(...),
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Upload an image file as the repository thumbnail."""
    from services.snippet_service import snippet_service

    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    _verify_owner(user_id, owner_id, db)

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    # Validate content type
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image type '{file.content_type}'. Allowed: JPEG, PNG, WebP, GIF"
        )

    content = await file.read()
    if len(content) > MAX_THUMBNAIL_SIZE:
        raise HTTPException(status_code=400, detail="Thumbnail must be under 5 MB")
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Upload to Supabase Storage in a dedicated thumbnails bucket
    from pathlib import Path
    ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
    storage_path = f"{owner}/{repo}/thumbnail{ext}"

    supabase = snippet_service.supabase
    bucket = "thumbnails"

    supabase.storage.from_(bucket).upload(
        path=storage_path,
        file=content,
        file_options={
            "content-type": file.content_type,
            "upsert": "true",
        },
    )

    public_url = supabase.storage.from_(bucket).get_public_url(storage_path)

    repo_data.thumbnail_url = public_url
    repo_data.thumbnail_type = "image"
    db.commit()

    logger.info("thumbnail_image_uploaded", repo_id=repo_id, url=public_url)

    return {
        "success": True,
        "thumbnail_url": public_url,
        "thumbnail_type": "image",
    }


@router.delete("/repos/{owner}/{repo}/thumbnail")
@user_limiter.limit("20/minute")
async def delete_thumbnail(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Remove the repository thumbnail."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    owner_id = resolve_owner_id(owner, db)
    _verify_owner(user_id, owner_id, db)

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    repo_data.thumbnail_url = None
    repo_data.thumbnail_type = None
    db.commit()

    logger.info("thumbnail_deleted", repo_id=repo_id)
    return {"success": True, "message": "Thumbnail removed"}
