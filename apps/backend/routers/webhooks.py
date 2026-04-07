"""
Webhook endpoints – receive Gitea events, list deliveries, activity feed, repo events.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session, selectinload
from typing import Optional
import json as _json
from starlette.requests import ClientDisconnect

from database import get_db
from dependencies import limiter, verify_token, resolve_owner_id
from logging_config import get_logger
from services.webhook_service import webhook_service
from models.webhook_models import WebhookDelivery, PushEvent, RepositoryEvent
from models.commit_models import CommitDetail
from models.invitation_models import CollaboratorInvitation
from models.snippet_models import SnippetHistory
from models.profile_models import Profile

logger = get_logger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ── Gitea Receiver ───────────────────────────────────────────────────────────

@router.post("/gitea")
async def receive_gitea_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receive and process Gitea webhook events.

    DESKTOP TEAM: Do NOT call this endpoint from the desktop app.
    This is called exclusively by Gitea when git events occur.
    """
    # Read headers first (available even if body stream disconnects)
    event_type = request.headers.get("X-Gitea-Event") or request.headers.get("x-gitea-event", "unknown")
    delivery_id = request.headers.get("X-Gitea-Delivery") or request.headers.get("x-gitea-delivery", "unknown")
    signature = request.headers.get("X-Gitea-Signature") or request.headers.get("x-gitea-signature", "")

    try:
        body = await request.body()
    except ClientDisconnect:
        logger.error("webhook_client_disconnect", event_type=event_type, delivery_id=delivery_id)
        return {"status": "error", "detail": "Client disconnected before body could be read"}

    logger.info("webhook_received", event_type=event_type, delivery_id=delivery_id, body_size=len(body))

    # Validate signature
    if not webhook_service.validate_signature(body, signature):
        logger.warning("webhook_rejected_invalid_signature", delivery_id=delivery_id, event_type=event_type)
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Parse payload
    try:
        payload = _json.loads(body)
    except Exception as e:
        logger.error("webhook_invalid_json", error=str(e))
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Process event
    result = webhook_service.process_event(event_type, delivery_id, payload, db)
    return {"status": "ok", "result": result}


# ── Deliveries (auth required) ──────────────────────────────────────────────

@router.get("/deliveries")
@limiter.limit("30/minute")
async def list_webhook_deliveries(
    request: Request,
    repo: Optional[str] = None,
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """List recent webhook deliveries for debugging and monitoring."""
    query = db.query(WebhookDelivery).order_by(WebhookDelivery.delivered_at.desc())

    if repo:
        query = query.filter(WebhookDelivery.repo_id == repo)
    if event_type:
        query = query.filter(WebhookDelivery.event_type == event_type)
    if status:
        query = query.filter(WebhookDelivery.processing_status == status)

    deliveries = query.limit(min(limit, 100)).all()

    return {
        "success": True,
        "count": len(deliveries),
        "deliveries": [
            {
                "id": d.id,
                "event_type": d.event_type,
                "repo_id": d.repo_id,
                "status": d.processing_status,
                "delivered_at": str(d.delivered_at) if d.delivered_at else None,
                "error_message": d.error_message,
            }
            for d in deliveries
        ],
    }


# ── Public Activity Feed ────────────────────────────────────────────────────

@router.get("/repo/{owner}/{repo}/activity")
@limiter.limit("30/minute")
async def get_repo_activity(
    request: Request,
    owner: str,
    repo: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """
    Get recent push activity for a repo (public).

    DESKTOP TEAM: Primary endpoint for showing repo activity.
    Poll every 30 seconds while viewing a repo page.
    """
    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"

    push_events = (
        db.query(PushEvent)
        .options(selectinload(PushEvent.commit_details))
        .filter(PushEvent.repo_id == repo_id)
        .order_by(PushEvent.pushed_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    # Batch-resolve pusher avatars and display names
    pusher_names = {e.pusher_username for e in push_events if e.pusher_username}
    pusher_avatars: dict[str, str | None] = {}
    pusher_display: dict[str, str] = {}  # stored-name → human username
    if pusher_names:
        rows = db.query(Profile).filter(Profile.username.in_(pusher_names)).all()
        for p in rows:
            pusher_avatars[p.username] = p.avatar_url
            pusher_display[p.username] = p.username
        unresolved = pusher_names - set(pusher_avatars.keys())
        if unresolved:
            rows = db.query(Profile).filter(Profile.id.in_(unresolved)).all()
            for p in rows:
                pusher_avatars[p.id] = p.avatar_url
                pusher_display[p.id] = p.username or p.id

    activity_items = []
    for e in push_events:
        # Get the latest commit message from the push's commit details
        commit_message = None
        if e.commit_details:
            sorted_details = sorted(
                e.commit_details,
                key=lambda c: c.timestamp or c.created_at,
                reverse=True,
            )
            commit_message = sorted_details[0].message if sorted_details else None

        activity_items.append({
            "id": e.id,
            "ref": e.ref,
            "before_sha": e.before_sha[:8] if e.before_sha else None,
            "after_sha": e.after_sha[:8] if e.after_sha else None,
            "commit_count": e.commit_count,
            "commit_message": commit_message,
            "pusher": pusher_display.get(e.pusher_username, e.pusher_username),
            "pusher_avatar": pusher_avatars.get(e.pusher_username),
            "pushed_at": str(e.pushed_at) if e.pushed_at else None,
        })

    return {
        "success": True,
        "repo": repo_id,
        "count": len(push_events),
        "activity": activity_items,
    }


# ── Public Repo Events ──────────────────────────────────────────────────────

@router.get("/repo/{owner}/{repo}/events")
@limiter.limit("30/minute")
async def get_repo_events(
    request: Request,
    owner: str,
    repo: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """
    Get repository lifecycle events – branch creates/deletes, tags,
    collaborator invitations, and snippet updates (public).

    DESKTOP TEAM: Use alongside /activity for a complete repo timeline.
    """
    owner = resolve_owner_id(owner, db)
    repo_id = f"{owner}/{repo}"

    # Core repository events (branch/tag/repo lifecycle)
    repo_events = (
        db.query(RepositoryEvent)
        .filter(RepositoryEvent.repo_id == repo_id)
        .order_by(RepositoryEvent.occurred_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    all_events = [
        {
            "id": e.id,
            "event_type": e.event_type,
            "actor": e.actor_username,
            "detail": None,
            "occurred_at": str(e.occurred_at) if e.occurred_at else None,
        }
        for e in repo_events
    ]

    # Collaborator invitation events
    invitations = (
        db.query(CollaboratorInvitation)
        .filter(
            CollaboratorInvitation.owner_username == owner,
            CollaboratorInvitation.repo_name == repo,
            CollaboratorInvitation.status.in_(["accepted", "pending"]),
        )
        .order_by(CollaboratorInvitation.created_at.desc())
        .limit(min(limit, 30))
        .all()
    )

    # Resolve invitee emails -> usernames
    invitee_emails = {inv.invitee_email for inv in invitations if inv.invitee_email}
    email_to_username: dict[str, str] = {}
    if invitee_emails:
        rows = db.query(Profile).filter(Profile.email.in_(invitee_emails)).all()
        for p in rows:
            email_to_username[p.email] = p.username or p.email.split("@")[0]

    # Resolve invitation owner UUIDs -> human usernames
    owner_ids = {inv.owner_username for inv in invitations if inv.owner_username}
    owner_display: dict[str, str] = {}
    if owner_ids:
        rows = db.query(Profile).filter(Profile.username.in_(owner_ids)).all()
        for p in rows:
            owner_display[p.username] = p.username
        unresolved = owner_ids - set(owner_display.keys())
        if unresolved:
            rows = db.query(Profile).filter(Profile.id.in_(unresolved)).all()
            for p in rows:
                owner_display[p.id] = p.username or p.id

    for inv in invitations:
        invitee_name = email_to_username.get(inv.invitee_email, inv.invitee_email.split("@")[0])
        owner_name = owner_display.get(inv.owner_username, inv.owner_username)
        if inv.status == "accepted":
            all_events.append({
                "id": f"collab-{inv.id}",
                "event_type": "collaborator_joined",
                "actor": invitee_name,
                "detail": f"Invited by {owner_name} with {inv.permission} access",
                "occurred_at": str(inv.responded_at or inv.created_at),
            })
        elif inv.status == "pending":
            all_events.append({
                "id": f"collab-{inv.id}",
                "event_type": "collaborator_invited",
                "actor": owner_name,
                "detail": f"Invited {invitee_name} with {inv.permission} access",
                "occurred_at": str(inv.created_at),
            })

    # Snippet update events
    snippet_events = (
        db.query(SnippetHistory)
        .filter(SnippetHistory.repo_id == repo_id)
        .order_by(SnippetHistory.replaced_at.desc())
        .limit(min(limit, 20))
        .all()
    )

    # Resolve snippet uploader UUIDs -> usernames
    uploader_ids = {s.replaced_by_user_id for s in snippet_events if s.replaced_by_user_id}
    id_to_username: dict[str, str] = {}
    if uploader_ids:
        rows = db.query(Profile).filter(Profile.id.in_(uploader_ids)).all()
        for p in rows:
            id_to_username[p.id] = p.username or p.id

    for s in snippet_events:
        all_events.append({
            "id": f"snippet-{s.id}",
            "event_type": "snippet_updated",
            "actor": id_to_username.get(s.replaced_by_user_id, "unknown") if s.replaced_by_user_id else "unknown",
            "detail": f"v{s.version_number}" + (f" ({s.format})" if s.format else ""),
            "occurred_at": str(s.replaced_at) if s.replaced_at else None,
        })

    # Sort all events by occurred_at descending, then limit
    all_events.sort(key=lambda x: x["occurred_at"] or "", reverse=True)
    all_events = all_events[:min(limit, 50)]

    # Batch-resolve avatar URLs and display names for all actors
    actor_names = {ev["actor"] for ev in all_events if ev.get("actor")}
    actor_avatars: dict[str, str | None] = {}
    actor_display: dict[str, str] = {}  # stored-name → human username
    if actor_names:
        rows = db.query(Profile).filter(Profile.username.in_(actor_names)).all()
        for p in rows:
            actor_avatars[p.username] = p.avatar_url
            actor_display[p.username] = p.username
        unresolved = actor_names - set(actor_avatars.keys())
        if unresolved:
            rows = db.query(Profile).filter(Profile.id.in_(unresolved)).all()
            for p in rows:
                actor_avatars[p.id] = p.avatar_url
                actor_display[p.id] = p.username or p.id

    for ev in all_events:
        raw_actor = ev.get("actor")
        ev["actor_avatar"] = actor_avatars.get(raw_actor)
        ev["actor"] = actor_display.get(raw_actor, raw_actor)

    return {
        "success": True,
        "repo": repo_id,
        "count": len(all_events),
        "events": all_events,
    }
