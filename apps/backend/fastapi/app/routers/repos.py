"""
Repository management endpoints
Handles repository listing, creation, file operations, and preferences
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime

from app.dependencies import get_auth, verify_token
from app.services.repo_service import RepoService
from app.storage import repo_preferences
from app.models.schemas import (
    CreateRepoRequest,
    UploadFileRequest,
    DeleteFileRequest,
    RepoPreferencesRequest,
)

router = APIRouter(prefix="/repos", tags=["repos"])


@router.get("")
async def list_repos(token: str = Depends(verify_token)):
    """List Gitea repositories for the current user (protected)."""
    print("[/repos GET] Starting list_repos")
    user_res = await get_auth().get_user(token)
    print(f"[/repos GET] get_user result: success={user_res.get('success')}")

    if not user_res.get("success"):
        print(f"[/repos GET] FAILED to get user: {user_res.get('message')}")
        raise HTTPException(
            status_code=401,
            detail=user_res.get("message", "Unable to fetch user")
        )

    user_id = user_res["user"]["id"]
    print(f"[/repos GET] User: user_id={user_id}")

    gitea_username = user_id
    print(f"[/repos GET] Gitea username: {gitea_username}")

    svc = RepoService()
    res = svc.list_user_repos(gitea_username)
    print(f"[/repos GET] list_user_repos result: success={res.get('success')}, repo_count={len(res.get('repos', []))}")

    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Failed to list repos")
        )

    return {"success": True, "repos": res.get("repos", [])}


@router.post("")
async def create_repo(
    req: CreateRepoRequest,
    token: str = Depends(verify_token)
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
        req.name,
        description=req.description or "",
        private=req.private
    )

    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Failed to create repo")
        )

    return {"success": True, "repo": res.get("repo")}


@router.get("/{repo_name}/contents")
async def get_repo_contents(
    repo_name: str,
    path: str = "",
    token: str = Depends(verify_token)
):
    """Get contents of a repository at a specific path (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    res = svc.get_repo_contents(gitea_username, repo_name, path)

    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Failed to fetch repo contents")
        )

    return {"success": True, "contents": res.get("contents")}


@router.post("/{repo_name}/upload")
async def upload_file(
    repo_name: str,
    req: UploadFileRequest,
    token: str = Depends(verify_token)
):
    """Upload a file to a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = req.branch or "main"
    res = svc.upload_file(
        gitea_username,
        repo_name,
        req.file_path,
        req.content,
        req.message,
        branch
    )

    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Failed to upload file")
        )

    return {"success": True, "file": res.get("file")}


@router.delete("/{repo_name}/contents")
async def delete_file(
    repo_name: str,
    file_path: str,
    req: DeleteFileRequest,
    token: str = Depends(verify_token)
):
    """Delete a file from a repository (protected)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    gitea_username = user_id
    svc = RepoService()
    branch = req.branch or "main"
    res = svc.delete_file(gitea_username, repo_name, file_path, req.message, branch)

    if not res.get("success"):
        raise HTTPException(
            status_code=400,
            detail=res.get("message", "Failed to delete file")
        )

    return {"success": True, "message": res.get("message")}


# ============== REPO PREFERENCES ENDPOINTS ==============


@router.get("/{repo_name}/preferences")
async def get_repo_preferences(
    repo_name: str,
    token: str = Depends(verify_token)
):
    """Get preferences for a specific repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    if user_id not in repo_preferences:
        return {"success": True, "preferences": None}

    prefs = repo_preferences[user_id].get(repo_name)
    return {"success": True, "preferences": prefs}


@router.post("/{repo_name}/preferences")
async def save_repo_preferences(
    repo_name: str,
    req: RepoPreferencesRequest,
    token: str = Depends(verify_token)
):
    """Save preferences for a specific repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unable to fetch user")

    user_id = user_res["user"]["id"]

    if user_id not in repo_preferences:
        repo_preferences[user_id] = {}

    repo_preferences[user_id][repo_name] = {
        "local_path": req.local_path,
        "updated_at": datetime.utcnow().isoformat()
    }

    return {
        "success": True,
        "preferences": repo_preferences[user_id][repo_name]
    }
