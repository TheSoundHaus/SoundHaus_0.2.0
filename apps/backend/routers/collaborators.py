"""
Collaborator endpoints – invite, list, pending invitations, accept, decline,
remove.

Visibility-aware behavior:
    * Public repos:  the "collaborators" list is derived from push history
      (owner + every distinct ``PushEvent.pusher_username``). Sending
      invitations is forbidden — public repos accept contributions via
      remix/fork, not ACL.
    * Private repos: the list is the Gitea ACL (which is exactly the set of
      users who accepted an invitation, since ``accept`` calls
      ``RepoService.add_collaborator``). Search + invite + cancel UI is fully
      enabled.

Invitation state machine:
    pending → accepted   (POST /invitations/{id}/accept)
    pending → declined   (POST /invitations/{id}/decline)
    pending → expired    (lazy: any list endpoint flips rows whose
                          ``expires_at`` < now)
    pending → (deleted)  (DELETE /invitations/{id} by owner)
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Iterable

from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_auth, limiter, resolve_owner_id, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from models.collaborator_requests import InviteCollaboratorRequest
from models.invitation_models import CollaboratorInvitation
from models.profile_models import Profile
from models.repo_models import RepoData
from models.webhook_models import PushEvent
from services.gitea_service import GiteaAdminService
from services.repo_service import RepoService

logger = get_logger(__name__)

router = APIRouter(tags=["collaborators"])


# ── Invitation status constants (single source of truth) ────────────────────

STATUS_PENDING = "pending"
STATUS_ACCEPTED = "accepted"
STATUS_DECLINED = "declined"
STATUS_EXPIRED = "expired"

VALID_PERMISSIONS = ("read", "write", "admin")


# ── Helpers ─────────────────────────────────────────────────────────────────

def _is_repo_public(owner_gitea: str, repo_name: str, db: Session) -> bool:
    """Return True if the repo is public (or unknown — fail-closed to private).

    A repo is public when ``RepoData.is_public`` is True. If no RepoData row
    exists we treat the repo as private (fail-closed) so invite/ACL behavior
    remains the safe default.
    """
    repo = (
        db.query(RepoData)
        .filter(RepoData.gitea_id == f"{owner_gitea}/{repo_name}")
        .first()
    )
    return bool(repo and repo.is_public)


def _expire_pending(rows: Iterable[CollaboratorInvitation], db: Session) -> None:
    """Lazily flip pending invitations whose expiry has passed → expired.

    Mutates the rows in-place and commits if any were changed. Safe to call
    on any iterable of invitation rows fetched in the same session.
    """
    now = datetime.now(UTC)
    changed = False
    for inv in rows:
        if inv.status == STATUS_PENDING and inv.expires_at and inv.expires_at < now:
            inv.status = STATUS_EXPIRED
            changed = True
    if changed:
        db.commit()


def _profile_lookup(db: Session, identifiers: set[str]) -> dict[str, Profile]:
    """Resolve a mixed set of usernames OR Supabase UUIDs to Profile rows.

    Returns a map keyed by both the original identifier and the username,
    so callers can look up either direction.
    """
    if not identifiers:
        return {}
    lookup: dict[str, Profile] = {}
    by_username = db.query(Profile).filter(Profile.username.in_(identifiers)).all()
    for p in by_username:
        lookup[p.username] = p
    remaining = identifiers - set(lookup.keys())
    if remaining:
        by_id = db.query(Profile).filter(Profile.id.in_(remaining)).all()
        for p in by_id:
            lookup[p.id] = p
            if p.username:
                lookup[p.username] = p
    return lookup


# ── Invite ──────────────────────────────────────────────────────────────────

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
    """Invite a user to collaborate on a private repository.

    Public repos return 403 — they accept contributions via remix/fork only.
    """
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

        user_id = str(user_res["user"]["id"])
        email = user_res["user"]["email"]
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

        # Phase 1 fork: invitations are private-repo only.
        if _is_repo_public(owner_gitea, repo_name, db):
            return JSONResponse(
                {
                    "success": False,
                    "message": "Public repositories do not support invitations. "
                               "Contributors should remix the repo instead.",
                },
                status_code=403,
            )

        invitee_email = body.email
        permission = body.permission

        if permission not in VALID_PERMISSIONS:
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
            status=STATUS_PENDING,
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
        ) from e
    except Exception as e:
        db.rollback()
        logger.error("invite_collaborator", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create invitation: {str(e)}") from e


# ── Collaboration Status ────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo_name}/collaboration-status")
@user_limiter.limit("60/minute")
async def get_collaboration_status(
    request: Request,
    owner: str,
    repo_name: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Return the current user's collaboration status for a repo.

    Returns one of:
        - "collaborator" — already has access (Gitea ACL membership for
                            private repos, or has pushed commits for public)
        - "pending"      — has a pending invitation (includes invitation_id)
        - "none"         — no relationship
    """
    try:
        user_res = await get_auth().get_user(token)
        if not user_res.get("success"):
            raise HTTPException(status_code=401, detail="Unauthorized")

        user_id = str(user_res["user"]["id"])
        email = user_res["user"]["email"]
        owner_gitea = str(resolve_owner_id(owner, db))
        is_public = _is_repo_public(owner_gitea, repo_name, db)

        if is_public:
            # Public repos: caller is a "collaborator" iff they appear in push
            # history. Owner is always considered a collaborator.
            if owner_gitea == user_id:
                return {"success": True, "status": "collaborator"}
            push_match = (
                db.query(PushEvent.id)
                .filter(
                    PushEvent.repo_id == f"{owner_gitea}/{repo_name}",
                    PushEvent.pusher_username == user_id,
                )
                .first()
            )
            if push_match:
                return {"success": True, "status": "collaborator"}
            return {"success": True, "status": "none"}

        # Private repo: check Gitea ACL membership.
        repo_service = RepoService()
        collab_result = repo_service.list_collaborators(owner_gitea, repo_name, db)
        if collab_result.get("success"):
            for c in collab_result.get("collaborators", []):
                if c.get("login") == user_id:
                    return {"success": True, "status": "collaborator"}

        # Then check for a pending invitation.
        invitation = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.invitee_email == email,
                CollaboratorInvitation.repo_name == repo_name,
                CollaboratorInvitation.owner_username == owner_gitea,
                CollaboratorInvitation.status == STATUS_PENDING,
                CollaboratorInvitation.expires_at > datetime.now(UTC),
            )
            .first()
        )

        if invitation:
            return {"success": True, "status": "pending", "invitation_id": invitation.id}

        return {"success": True, "status": "none"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_collaboration_status", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check collaboration status") from e


# ── List Collaborators (visibility-forked) ──────────────────────────────────

@router.get("/repos/{owner}/{repo_name}/collaborators")
@user_limiter.limit("60/minute")
async def list_collaborators(
    request: Request,
    owner: str,
    repo_name: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List collaborators for a repository.

    Public repos:   owner + unique pushers (from ``PushEvent``), enriched
                    with profile data. Permission is always reported as
                    ``"contributor"`` for non-owners and ``"owner"`` for the
                    owner — there is no ACL to derive Gitea-style roles from.
    Private repos:  current Gitea ACL members enriched with profile data.
                    Each member here represents an accepted invitation.
    """
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        return JSONResponse({"success": False}, status_code=401)

    owner_id = str(resolve_owner_id(owner, db))

    if _is_repo_public(owner_id, repo_name, db):
        return _list_public_collaborators(owner_id, repo_name, db)

    repo_service = RepoService()
    result = repo_service.list_collaborators(owner_id, repo_name, db)
    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    return {"success": True, "collaborators": result.get("collaborators", [])}


def _list_public_collaborators(owner_id: str, repo_name: str, db: Session) -> dict:
    """Build the public-repo collaborator list from push history."""
    repo_id = f"{owner_id}/{repo_name}"

    # Owner is always first.
    owner_profile = db.query(Profile).filter(Profile.id == owner_id).first()
    owner_entry = {
        "login": owner_id,
        "username": owner_profile.username if owner_profile else owner_id,
        "email": owner_profile.email if owner_profile else "",
        "avatar_url": owner_profile.avatar_url if owner_profile else "",
        "bio": owner_profile.bio if owner_profile else None,
        "permission": "owner",
    }

    pusher_ids = {
        row[0]
        for row in db.query(PushEvent.pusher_username)
        .filter(PushEvent.repo_id == repo_id)
        .distinct()
        .all()
        if row[0] and row[0] != owner_id
    }

    collaborators = [owner_entry]
    if pusher_ids:
        profiles = _profile_lookup(db, pusher_ids)
        for pid in sorted(pusher_ids):
            profile = profiles.get(pid)
            collaborators.append({
                "login": pid,
                "username": profile.username if profile else pid,
                "email": profile.email if profile else "",
                "avatar_url": profile.avatar_url if profile else "",
                "bio": profile.bio if profile else None,
                "permission": "contributor",
            })

    return {"success": True, "collaborators": collaborators}


# ── Pending Invitations (current user) ──────────────────────────────────────

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

        # Lazy-expire any of this user's pending invitations whose deadline
        # has passed before serving the still-valid set.
        stale = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.invitee_email == email,
                CollaboratorInvitation.status == STATUS_PENDING,
            )
            .all()
        )
        _expire_pending(stale, db)

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.invitee_email == email,
                CollaboratorInvitation.status == STATUS_PENDING,
                CollaboratorInvitation.expires_at > datetime.now(UTC),
            )
            .all()
        )

        owner_ids = {inv.owner_username for inv in invitations}
        owner_lookup = _profile_lookup(db, owner_ids)
        id_to_username = {
            key: profile.username
            for key, profile in owner_lookup.items()
            if profile.username
        }

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
        raise HTTPException(status_code=500, detail="Failed to fetch invitations") from e


# ── Accept / Decline ────────────────────────────────────────────────────────

@router.post("/invitations/{invitation_id}/accept")
@user_limiter.limit("20/minute")
async def accept_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Accept a collaboration invitation.

    Transitions the invitation state ``pending → accepted`` and links the
    invitee into the repository's ACL via Gitea so they appear in the
    Private Repo Collaborators list.
    """
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

        # Lazy-expire if past deadline so the state machine is consistent.
        if (
            invitation.status == STATUS_PENDING
            and invitation.expires_at
            and invitation.expires_at < datetime.now(UTC)
        ):
            invitation.status = STATUS_EXPIRED
            db.commit()

        if invitation.status != STATUS_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Invitation already {invitation.status}",
            )

        # Ensure invitee has a Gitea account.
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
                already_exists = "already exists" in (create_result.get("message") or "")
                if not already_exists:
                    logger.error(
                        "accept_invitation",
                        action="create_gitea_user",
                        status="failed",
                        message=create_result.get("message"),
                    )
                    raise HTTPException(status_code=500, detail="Failed to provision Git account")
                logger.info(
                    "accept_invitation",
                    action="create_gitea_user",
                    status="already_exists",
                    username=invitee_username,
                )

        # Resolve the owner's UUID — Gitea repos are namespaced by owner UUID,
        # not by display username.
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
            owner_profile.id,
            invitation.repo_name,
            invitee_username,
            invitation.permission,
        )

        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to add collaborator: {result.get('message')}",
            )

        invitation.status = STATUS_ACCEPTED
        invitation.responded_at = datetime.now(UTC)
        db.commit()

        return {"success": True, "message": f"You are now a collaborator on {invitation.repo_name}"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("accept_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to accept invitation") from e


@router.post("/invitations/{invitation_id}/decline")
@user_limiter.limit("20/minute")
async def decline_invitation(
    request: Request,
    invitation_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Decline a collaboration invitation. Only valid from the pending state."""
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

        # State-machine guard: cannot decline an already-resolved invitation.
        if invitation.status != STATUS_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot decline — invitation already {invitation.status}",
            )

        invitation.status = STATUS_DECLINED
        invitation.responded_at = datetime.now(UTC)
        db.commit()

        return {"success": True, "message": "Invitation declined"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("decline_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to decline invitation") from e


# ── Repo Invitations (owner view) ───────────────────────────────────────────

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

        owner_gitea = str(resolve_owner_id(owner, db))

        invitations = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.repo_name == repo_name,
                CollaboratorInvitation.owner_username == owner_gitea,
            )
            .order_by(CollaboratorInvitation.created_at.desc())
            .all()
        )

        # Sweep stale pending → expired before serializing.
        _expire_pending(invitations, db)

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
        raise HTTPException(status_code=500, detail="Failed to fetch repo invitations") from e


# ── All Invitations sent by the current user (across all repos) ─────────────

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

        _expire_pending(invitations, db)

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
        raise HTTPException(status_code=500, detail="Failed to fetch sent invitations") from e


# ── Cancel Invitation ───────────────────────────────────────────────────────

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

        if invitation.status != STATUS_PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel — invitation already {invitation.status}",
            )

        db.delete(invitation)
        db.commit()

        return {"success": True, "message": "Invitation cancelled"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error("cancel_invitation", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to cancel invitation") from e


# ── User Search ─────────────────────────────────────────────────────────────

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
            # Hide auto-generated SoundHaus emails (UUID-style local parts).
            email = p.email or ""
            import re as _re
            is_generated = bool(_re.search(r'[0-9a-f]{8,}', email.split('@')[0]))
            shown_email = "" if is_generated else email

            users.append({
                "username": p.username or "",
                "email": shown_email,
                "avatar_url": p.avatar_url or "",
                "invite_email": p.email or "",
            })

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
        raise HTTPException(status_code=500, detail="Failed to search users") from e


# ── Remove ──────────────────────────────────────────────────────────────────

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
    """Remove a collaborator from a private repository.

    Public repos do not maintain an ACL — this returns 400 there because the
    "collaborators" list is derived from immutable push history.
    """
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

    if _is_repo_public(owner_gitea, repo_name, db):
        return JSONResponse(
            {
                "success": False,
                "message": "Public repositories have no ACL to remove members from. "
                           "The collaborator list is derived from push history.",
            },
            status_code=400,
        )

    repo_service = RepoService()
    result = repo_service.remove_collaborator(owner_gitea, repo_name, username)

    if not result.get("success"):
        return JSONResponse({"success": False, "message": result.get("message")}, status_code=400)
    return {"success": True, "message": f"Collaborator {username} removed"}
