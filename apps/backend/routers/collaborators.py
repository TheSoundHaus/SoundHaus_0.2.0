"""
Collaborator endpoints – invite, list, pending invitations, accept, decline, remove.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi.responses import JSONResponse
from sqlalchemy import func as sql_func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_auth, limiter, resolve_owner_id, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from models.collaborator_requests import InviteCollaboratorRequest
from models.invitation_models import CollaboratorInvitation
from models.profile_models import Profile
from services.gitea_service import GiteaAdminService
from services.repo_service import RepoService

logger = get_logger(__name__)

router = APIRouter(tags=["collaborators"])


def _norm_email(value: str | None) -> str:
    return (value or "").strip().lower()


# ── Invite ───────────────────────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo_name}/collaborators/invite")
@limiter.limit("10/minute")
async def invite_collaborator(
    request: Request,
    owner: str,
    repo_name: str,
    body: InviteCollaboratorRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Invite a user to collaborate on a repository.

    ``owner`` is the SoundHaus username or Gitea owner id (UUID), same as the
    collaborators list route — resolved to the canonical Gitea owner before checks.
    """
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

        user_id = str(user_res["user"]["id"])
        email = user_res["user"].get("email") or ""

        owner_gitea = str(resolve_owner_id(owner, db))

        if owner_gitea != user_id:
            return JSONResponse(
                {"success": False, "message": "Only the repository owner can send invitations"},
                status_code=403,
            )

        repo_service = RepoService()
        repo_check = repo_service.get_repo(owner_gitea, repo_name)
        if not repo_check.get("success"):
            return JSONResponse({"success": False, "message": "Repository not found"}, status_code=404)

        # Invitations are only allowed for private repositories
        repo_data = repo_check.get("repo", {})
        if not repo_data.get("private", False):
            return JSONResponse(
                {
                    "success": False,
                    "message": "Invitations are only available for private repositories. Public repos use forking for collaboration.",
                },
                status_code=403,
            )

        invitee_email = _norm_email(body.email)
        permission = body.permission

        if permission not in ("read", "write", "admin"):
            return JSONResponse(
                {"success": False, "message": "Permission must be 'read', 'write', or 'admin'"},
                status_code=400,
            )

        invitation_id = str(uuid.uuid4())
        invitation_token = secrets.token_urlsafe(32)

        invitation = CollaboratorInvitation(
            id=invitation_id,
            invitation_token=invitation_token,
            repo_name=repo_name,
            owner_email=email,
            owner_username=owner_gitea,
            invitee_email=invitee_email,
            permission=permission,
            status="pending",
            created_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(days=7),
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

@router.get("/repos/{owner}/{repo_name}/collaborators")
@user_limiter.limit("60/minute")
async def list_collaborators(
    request: Request,
    owner: str,
    repo_name: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List all collaborators for a repository, enriched with SoundHaus usernames."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    owner_id = resolve_owner_id(owner, db)
    repo_service = RepoService()
    result = repo_service.list_collaborators(owner_id, repo_name, db)

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

        email = _norm_email(user_res["user"].get("email"))
        if not email:
            return {"success": True, "invitations": []}

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(
                sql_func.lower(CollaboratorInvitation.invitee_email) == email,
                CollaboratorInvitation.status == "pending",
                CollaboratorInvitation.expires_at > datetime.now(UTC),
            )
            .all()
        )

        # Collect unique owner identifiers and resolve to human-readable usernames
        owner_ids = {inv.owner_username for inv in invitations}
        profiles = db.query(Profile).filter(Profile.id.in_(owner_ids)).all()
        # Also check by username in case some are already stored as username
        profiles += db.query(Profile).filter(Profile.username.in_(owner_ids)).all()
        id_to_username = {}
        for p in profiles:
            id_to_username[p.id] = p.username
            id_to_username[p.username] = p.username

        invitation_list = [
            {
                "id": inv.id,
                "repo_name": inv.repo_name,
                "owner_username": id_to_username.get(inv.owner_username, inv.owner_username),
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

        user_id = str(user_res["user"]["id"])
        email = _norm_email(user_res["user"].get("email"))
        if not email:
            raise HTTPException(status_code=400, detail="Your account must have an email to accept this invitation")

        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        if _norm_email(invitation.invitee_email) != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")

        if invitation.status != "pending":
            raise HTTPException(status_code=400, detail=f"Invitation already {invitation.status}")

        if invitation.expires_at < datetime.now(UTC):
            raise HTTPException(status_code=400, detail="Invitation has expired")

        # Ensure invitee has a Gitea account — login may be Profile.username or legacy Supabase UUID
        gitea = GiteaAdminService()
        invitee_profile = db.query(Profile).filter(Profile.id == user_id).first()
        preferred_login = (
            (invitee_profile.username or "").strip() or user_id
            if invitee_profile
            else user_id
        )

        invitee_username = preferred_login
        user_check = gitea.get_user_by_username(invitee_username)
        if not user_check.get("exists") and invitee_username != user_id:
            user_check = gitea.get_user_by_username(user_id)
            if user_check.get("exists"):
                invitee_username = user_id

        if not user_check.get("exists"):
            logger.info("accept_invitation", action="creating_gitea_user", username=invitee_username)
            create_result = gitea.create_user(
                username=invitee_username,
                email=email or (invitee_profile.email if invitee_profile else ""),
                password=secrets.token_urlsafe(32),
            )
            if not create_result.get("success"):
                logger.error("accept_invitation", action="create_gitea_user", status="failed", message=create_result.get("message"))
                raise HTTPException(status_code=500, detail="Failed to provision Git account")

        # Add collaborator to repository
        # Gitea repos are keyed by the owner's Supabase UUID, not display username.
        # Resolve the owner's UUID from the stored owner_username or owner_email.
        owner_profile = (
            db.query(Profile)
            .filter(
                (Profile.username == invitation.owner_username)
                | (Profile.id == invitation.owner_username)
            )
            .first()
        )
        if not owner_profile:
            raise HTTPException(status_code=500, detail="Could not resolve repo owner")

        repo_service = RepoService()
        result = repo_service.add_collaborator(
            owner_profile.id,  # UUID — the Gitea repo namespace
            invitation.repo_name,
            invitee_username,
            invitation.permission,
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=f"Failed to add collaborator: {result.get('message')}")

        invitation.status = "accepted"
        invitation.responded_at = datetime.now(UTC)
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

        email = _norm_email(user_res["user"].get("email"))

        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        if _norm_email(invitation.invitee_email) != email:
            raise HTTPException(status_code=403, detail="This invitation is not for you")

        invitation.status = "declined"
        invitation.responded_at = datetime.now(UTC)
        db.commit()

        return {"success": True, "message": "Invitation declined"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("decline_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to decline invitation")


# ── Repo Invitations (owner view) ────────────────────────────────────────────

@router.get("/repos/{owner}/{repo_name}/invitations")
@user_limiter.limit("60/minute")
async def get_repo_invitations(
    request: Request,
    owner: str,
    repo_name: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List all invitations sent by the repo owner for a specific repository."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = user_res["user"]["id"]
        owner_id = resolve_owner_id(owner, db)
        if str(user_id) != str(owner_id):
            raise HTTPException(
                status_code=403,
                detail="Only the repository owner can list invitations for this repo",
            )

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.repo_name == repo_name,
                CollaboratorInvitation.owner_username == owner_id,
            )
            .order_by(CollaboratorInvitation.created_at.desc())
            .all()
        )

        return {
            "success": True,
            "invitations": [
                {
                    "id": inv.id,
                    "invitee_email": inv.invitee_email,
                    "permission": inv.permission,
                    "status": inv.status,
                    "created_at": inv.created_at.isoformat(),
                    "expires_at": inv.expires_at.isoformat(),
                    "responded_at": inv.responded_at.isoformat() if inv.responded_at else None,
                }
                for inv in invitations
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_repo_invitations", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch repo invitations")


# ── All Invitations (owner sent across all repos) ────────────────────────────

@router.get("/invitations/sent")
@user_limiter.limit("60/minute")
async def get_sent_invitations(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Get all invitations sent by the current user across all repositories."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = user_res["user"]["id"]

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(CollaboratorInvitation.owner_username == user_id)
            .order_by(CollaboratorInvitation.created_at.desc())
            .all()
        )

        return {
            "success": True,
            "invitations": [
                {
                    "id": inv.id,
                    "repo_name": inv.repo_name,
                    "invitee_email": inv.invitee_email,
                    "permission": inv.permission,
                    "status": inv.status,
                    "created_at": inv.created_at.isoformat(),
                    "expires_at": inv.expires_at.isoformat(),
                    "responded_at": inv.responded_at.isoformat() if inv.responded_at else None,
                }
                for inv in invitations
            ],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_sent_invitations", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch sent invitations")


# ── Cancel Invitation ────────────────────────────────────────────────────────

@router.delete("/invitations/{invitation_id}")
@user_limiter.limit("20/minute")
async def cancel_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Cancel a pending invitation (owner action)."""
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = user_res["user"]["id"]

        invitation = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.id == invitation_id
        ).first()

        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")

        if invitation.owner_username != user_id:
            raise HTTPException(status_code=403, detail="Only the repo owner can cancel invitations")

        if invitation.status != "pending":
            raise HTTPException(status_code=400, detail=f"Cannot cancel — invitation already {invitation.status}")

        db.delete(invitation)
        db.commit()

        return {"success": True, "message": "Invitation cancelled"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("cancel_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to cancel invitation")


# ── User Search ──────────────────────────────────────────────────────────────

@router.get("/users/search")
@user_limiter.limit("30/minute")
async def search_users(
    request: Request,
    q: str = "",
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Search users by username. Enriches Gitea results with profile data."""
    if not q or len(q) < 2:
        return {"success": True, "users": []}

    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Search in our profiles table first (has real usernames, emails)
        q_lower = q.lower()
        profiles = (
            db.query(Profile)
            .filter(
                (Profile.username.ilike(f"%{q_lower}%"))
                | (Profile.email.ilike(f"%{q_lower}%"))
            )
            .limit(10)
            .all()
        )

        users = []
        for p in profiles:
            # Hide auto-generated SoundHaus emails (contain UUID-style segments)
            email = p.email or ""
            import re as _re
            is_generated = bool(_re.search(r'[0-9a-f]{8,}', email.split('@')[0]))
            shown_email = "" if is_generated else email

            users.append({
                "username": p.username or "",
                "email": shown_email,
                "avatar_url": p.avatar_url or "",
                "invite_email": p.email or "",  # always include real email for invite action
            })

        # Fallback to Gitea search if no profile results
        if not users:
            gitea = GiteaAdminService()
            result = gitea.search_users(q)
            if result.get("success"):
                users = result.get("users", [])

        return {"success": True, "users": users}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("search_users", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to search users")


# ── Remove ───────────────────────────────────────────────────────────────────

@router.delete("/repos/{owner}/{repo_name}/collaborators/{username}")
@user_limiter.limit("20/minute")
async def remove_collaborator(
    request: Request,
    owner: str,
    repo_name: str,
    username: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Remove a collaborator from a repository."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    user_id = str(user_res["user"]["id"])
    owner_gitea = str(resolve_owner_id(owner, db))
    if owner_gitea != user_id:
        return JSONResponse(
            {"success": False, "message": "Only the repository owner can remove collaborators"},
            status_code=403,
        )

    repo_service = RepoService()
    result = repo_service.remove_collaborator(owner_gitea, repo_name, username)

    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    return {"success": True, "message": f"Collaborator {username} removed"}
