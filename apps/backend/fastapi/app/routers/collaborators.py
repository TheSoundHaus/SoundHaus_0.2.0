"""
Collaboration and invitation endpoints
Handles inviting users, managing collaborators, and processing invitations
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
import uuid
import secrets

from app.dependencies import get_auth, verify_token
from app.services.repo_service import RepoService
from app.services.gitea_service import GiteaAdminService
from app.storage import pending_invitations

router = APIRouter(tags=["collaborators"])


@router.post("/repos/{repo_name}/collaborators/invite")
async def invite_collaborator(
    repo_name: str,
    request: dict,
    token: str = Depends(verify_token)
):
    """Invite a user to collaborate on a repository."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=401
        )

    user_id = user_res["user"]["id"]
    email = user_res["user"]["email"]

    owner_username = user_id

    # Verify repo ownership
    repo_service = RepoService()
    repo_check = repo_service.get_repo_contents(owner_username, repo_name)
    if not repo_check.get("success"):
        return JSONResponse(
            {"success": False, "message": "Repository not found"},
            status_code=404
        )

    invitee_email = request.get("email")
    permission = request.get("permission", "write")  # read, write, admin

    if not invitee_email:
        return JSONResponse(
            {"success": False, "message": "Email required"},
            status_code=400
        )

    # TODO: Check if invitee user exists in Supabase

    # Generate invitation
    invitation_id = str(uuid.uuid4())
    invitation_token = secrets.token_urlsafe(32)

    pending_invitations[invitation_id] = {
        "invitation_id": invitation_id,
        "invitation_token": invitation_token,
        "repo_name": repo_name,
        "owner_email": email,
        "owner_username": owner_username,
        "invitee_email": invitee_email,
        "permission": permission,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat()
    }

    return {
        "success": True,
        "invitation_id": invitation_id,
        "message": f"Invitation sent to {invitee_email}"
    }


@router.get("/repos/{repo_name}/collaborators")
async def list_collaborators(
    repo_name: str,
    token: str = Depends(verify_token)
):
    """List all collaborators for a repository."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    gitea_username = user_id

    repo_service = RepoService()
    result = repo_service.list_collaborators(gitea_username, repo_name)

    if not result.get("success"):
        return JSONResponse(
            {"success": False, "message": result.get("message")},
            status_code=400
        )

    return {"success": True, "collaborators": result.get("collaborators", [])}


@router.get("/invitations/pending")
async def get_pending_invitations(token: str = Depends(verify_token)):
    """Get all pending invitations for the current user."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_data = user_res.get("user", {})
    email = user_data.get("email", "")

    # Filter invitations for this user
    user_invitations = [
        inv for inv in pending_invitations.values()
        if inv["invitee_email"] == email and inv["status"] == "pending"
    ]

    return {"success": True, "invitations": user_invitations}


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation(
    invitation_id: str,
    token: str = Depends(verify_token)
):
    """Accept a collaboration invitation."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]
    email = user_res["user"]["email"]

    invitation = pending_invitations.get(invitation_id)
    if not invitation:
        return JSONResponse(
            {"success": False, "message": "Invitation not found"},
            status_code=404
        )

    if invitation["invitee_email"] != email:
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=403
        )

    if invitation["status"] != "pending":
        return JSONResponse(
            {"success": False, "message": "Invitation already processed"},
            status_code=400
        )

    # Generate username for invitee
    gitea = GiteaAdminService()
    invitee_username = user_id

    # Check if user exists in Gitea, create if not
    user_check = gitea.get_user(invitee_username)
    if not user_check.get("success"):
        print(f"[Invitation] User {invitee_username} doesn't exist in Gitea, attempting to create...")

        # Try to create Gitea user (won't fail if they already exist via different username)
        create_result = gitea.create_user(
            username=invitee_username,
            email=email,
            password=secrets.token_urlsafe(32),  # Random password (user won't use it)
        )

        if create_result.get("success"):
            print(f"[Invitation] Created Gitea user: {invitee_username}")
        else:
            # This is OK if they're logged in, as they should already have a Gitea account
            print(f"[Invitation] Could not create Gitea user: {create_result.get('message')}")
            print(f"[Invitation] Proceeding anyway - user may already have an account")
    else:
        print(f"[Invitation] User {invitee_username} already exists in Gitea")

    # Add collaborator to repository
    repo_service = RepoService()
    result = repo_service.add_collaborator(
        invitation["owner_username"],
        invitation["repo_name"],
        invitee_username,
        invitation["permission"]
    )

    if not result.get("success"):
        return JSONResponse(
            {
                "success": False,
                "message": f"Failed to add collaborator: {result.get('message')}"
            },
            status_code=400
        )

    # Mark invitation as accepted
    pending_invitations[invitation_id]["status"] = "accepted"
    pending_invitations[invitation_id]["accepted_at"] = datetime.utcnow().isoformat()

    return {
        "success": True,
        "message": f"You are now a collaborator on {invitation['repo_name']}"
    }


@router.post("/invitations/{invitation_id}/decline")
async def decline_invitation(
    invitation_id: str,
    token: str = Depends(verify_token)
):
    """Decline a collaboration invitation."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_data = user_res.get("user", {})
    email = user_data.get("email", "")

    invitation = pending_invitations.get(invitation_id)
    if not invitation:
        return JSONResponse(
            {"success": False, "message": "Invitation not found"},
            status_code=404
        )

    if invitation["invitee_email"] != email:
        return JSONResponse(
            {"success": False, "message": "Unauthorized"},
            status_code=403
        )

    # Mark invitation as declined
    pending_invitations[invitation_id]["status"] = "declined"
    pending_invitations[invitation_id]["declined_at"] = datetime.utcnow().isoformat()

    return {"success": True, "message": "Invitation declined"}


@router.delete("/repos/{repo_name}/collaborators/{username}")
async def remove_collaborator(
    repo_name: str,
    username: str,
    token: str = Depends(verify_token)
):
    """Remove a collaborator from a repository."""
    user_res = await get_auth().get_user(token)

    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    owner_username = user_id

    repo_service = RepoService()
    result = repo_service.remove_collaborator(owner_username, repo_name, username)

    if not result.get("success"):
        return JSONResponse(
            {"success": False, "message": result.get("message")},
            status_code=400
        )

    return {"success": True, "message": f"Collaborator {username} removed"}
