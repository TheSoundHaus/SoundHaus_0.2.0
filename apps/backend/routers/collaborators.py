"""
Collaborator endpoints – invite, list, pending invitations, accept, decline, remove.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta, timezone
from typing import Dict
import uuid
import secrets

from database import get_db
from dependencies import limiter, user_limiter, verify_token, get_auth
from logging_config import get_logger
from services.repo_service import RepoService
from services.gitea_service import GiteaAdminService
from services.gitea_token_service import GiteaTokenService
from models.invitation_models import CollaboratorInvitation

logger = get_logger(__name__)

router = APIRouter(tags=["collaborators"])


# ── Invite ───────────────────────────────────────────────────────────────────

@router.post("/repos/{repo_name}/collaborators/invite")
@limiter.limit("10/minute")
async def invite_collaborator(
    request: Request,
    repo_name: str,
    request_body: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Invite a user to collaborate on a repository."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

        user_id = user_res["user"]["id"]
        email = user_res["user"]["email"]
        owner_username = user_id

        # Get user's Gitea token
        gitea_token = await GiteaTokenService.get_or_create_token(user_id, db, created_via="web")
        if not gitea_token:
            return JSONResponse({"success": False, "message": "Gitea session expired. Please log in again."}, status_code=401)

        # Verify repo exists
        repo_service = RepoService(user_token=gitea_token)
        repo_check = repo_service.get_repo(owner_username, repo_name)
        if not repo_check.get("success"):
            return JSONResponse({"success": False, "message": "Repository not found"}, status_code=404)

        invitee_email = request_body.get("email")
        permission = request_body.get("permission", "write")

        if not invitee_email:
            return JSONResponse({"success": False, "message": "Email required"}, status_code=400)

        invitation_id = str(uuid.uuid4())
        invitation_token = secrets.token_urlsafe(32)

        invitation = CollaboratorInvitation(
            id=invitation_id,
            invitation_token=invitation_token,
            repo_name=repo_name,
            owner_email=email,
            owner_username=owner_username,
            invitee_email=invitee_email,
            permission=permission,
            status="pending",
            created_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )

        db.add(invitation)
        db.commit()
        db.refresh(invitation)

        return {
            "success": True,
            "invitation_id": invitation_id,
            "message": f"Invitation sent to {invitee_email}",
            "expires_at": invitation.expires_at.isoformat(),
        }
    except IntegrityError as e:
        db.rollback()
        logger.error("invite_collaborator", error=str(e), error_type="integrity_error")
        raise HTTPException(
            status_code=400,
            detail=f"Failed to add invitation to database: {e}, database constraint violation",
        )
    except Exception as e:
        db.rollback()
        logger.error("invite_collaborator", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create invitation: {str(e)}")


# ── List Collaborators ───────────────────────────────────────────────────────

@router.get("/repos/{repo_name}/collaborators")
@user_limiter.limit("60/minute")
async def list_collaborators(
    request: Request,
    repo_name: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List all collaborators for a repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    # Get user's Gitea token
    gitea_token = await GiteaTokenService.get_or_create_token(user_id, db, created_via="web")
    if not gitea_token:
        return JSONResponse({"success": False, "message": "Gitea session expired. Please log in again."}, status_code=401)

    repo_service = RepoService(user_token=gitea_token)
    result = repo_service.list_collaborators(user_id, repo_name)

    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    return {"success": True, "collaborators": result.get("collaborators", [])}


# ── Pending Invitations ──────────────────────────────────────────────────────

@router.get("/invitations/pending")
@user_limiter.limit("60/minute")
async def get_pending_invitations(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get all pending invitations for the current user."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        email = user_res["user"]["email"]

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.invitee_email == email,
                CollaboratorInvitation.status == "pending",
                CollaboratorInvitation.expires_at > datetime.utcnow(),
            )
            .all()
        )

        invitation_list = [
            {
                "id": inv.id,
                "repo_name": inv.repo_name,
                "owner_username": inv.owner_username,
                "owner_email": inv.owner_email,
                "permission": inv.permission,
                "created_at": inv.created_at.isoformat(),
                "expires_at": inv.expires_at.isoformat(),
            }
            for inv in invitations
        ]

        return {"success": True, "invitations": invitation_list}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_pending_invitations", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch invitations")


# ── Accept / Decline ─────────────────────────────────────────────────────────

@router.post("/invitations/{invitation_id}/accept")
@user_limiter.limit("20/minute")
async def accept_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Accept a collaboration invitation."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = user_res["user"]["id"]
        email = user_res["user"]["email"]

        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        if invitation.invitee_email != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")

        if invitation.status != "pending":
            raise HTTPException(status_code=400, detail=f"Invitation already {invitation.status}")

        if invitation.expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Invitation has expired")

        # Ensure invitee has a Gitea account
        gitea = GiteaAdminService()
        invitee_username = user_id

        user_check = gitea.get_user_by_username(invitee_username)
        if not user_check.get("exists"):
            logger.info("accept_invitation", action="creating_gitea_user", username=invitee_username)
            create_result = gitea.create_user(
                username=invitee_username,
                email=email,
                password=secrets.token_urlsafe(32),
            )
            if not create_result.get("success"):
                logger.error("accept_invitation", action="create_gitea_user", status="failed", message=create_result.get("message"))
                raise HTTPException(status_code=500, detail="Failed to provision Git account")

        # Get invitee's Gitea token
        gitea_token = await GiteaTokenService.get_or_create_token(user_id, db, created_via="web")
        if not gitea_token:
            raise HTTPException(status_code=401, detail="Gitea session expired. Please log in again.")

        # Add collaborator to repository
        repo_service = RepoService(user_token=gitea_token)
        result = repo_service.add_collaborator(
            invitation.owner_username,
            invitation.repo_name,
            invitee_username,
            invitation.permission,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to add collaborator: {result.get('message')}")

        invitation.status = "accepted"
        invitation.responded_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": f"You are now a collaborator on {invitation.repo_name}"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("accept_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to accept invitation")


@router.post("/invitations/{invitation_id}/decline")
@user_limiter.limit("20/minute")
async def decline_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Decline a collaboration invitation."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        email = user_res["user"]["email"]

        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        if invitation.invitee_email != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")

        invitation.status = "declined"
        invitation.responded_at = datetime.utcnow()
        db.commit()

        return {"success": True, "message": "Invitation declined"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("decline_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to decline invitation")


# ── Remove ───────────────────────────────────────────────────────────────────

@router.delete("/repos/{repo_name}/collaborators/{username}")
@user_limiter.limit("20/minute")
async def remove_collaborator(
    request: Request,
    repo_name: str,
    username: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Remove a collaborator from a repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = user_res["user"]["id"]

    # Get user's Gitea token
    gitea_token = await GiteaTokenService.get_or_create_token(user_id, db, created_via="web")
    if not gitea_token:
        return JSONResponse({"success": False, "message": "Gitea session expired. Please log in again."}, status_code=401)

    repo_service = RepoService(user_token=gitea_token)
    result = repo_service.remove_collaborator(user_id, repo_name, username)

    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    return {"success": True, "message": f"Collaborator {username} removed"}
