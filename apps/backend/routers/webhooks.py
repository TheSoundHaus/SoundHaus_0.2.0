"""
Webhook endpoints – receive Gitea events, list deliveries, activity feed, repo events.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional
import json as _json

from database import get_db
from dependencies import limiter, verify_token
from logging_config import get_logger
from services.webhook_service import webhook_service
from models.webhook_models import WebhookDelivery, PushEvent, RepositoryEvent

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
    body = await request.body()

    event_type = request.headers.get("X-Gitea-Event") or request.headers.get("x-gitea-event", "unknown")
    delivery_id = request.headers.get("X-Gitea-Delivery") or request.headers.get("x-gitea-delivery", "unknown")
    signature = request.headers.get("X-Gitea-Signature") or request.headers.get("x-gitea-signature", "")

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
    repo_id = f"{owner}/{repo}"

    push_events = (
        db.query(PushEvent)
        .filter(PushEvent.repo_id == repo_id)
        .order_by(PushEvent.pushed_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    return {
        "success": True,
        "repo": repo_id,
        "count": len(push_events),
        "activity": [
            {
                "id": e.id,
                "ref": e.ref,
                "before_sha": e.before_sha[:8] if e.before_sha else None,
                "after_sha": e.after_sha[:8] if e.after_sha else None,
                "commit_count": e.commit_count,
                "pusher": e.pusher_username,
                "pushed_at": str(e.pushed_at) if e.pushed_at else None,
            }
            for e in push_events
        ],
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
    Get repository lifecycle events – branch creates/deletes, tags, etc. (public).

    DESKTOP TEAM: Use alongside /activity for a complete repo timeline.
    """
    repo_id = f"{owner}/{repo}"

    events = (
        db.query(RepositoryEvent)
        .filter(RepositoryEvent.repo_id == repo_id)
        .order_by(RepositoryEvent.occurred_at.desc())
        .limit(min(limit, 50))
        .all()
    )

    return {
        "success": True,
        "repo": repo_id,
        "count": len(events),
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "actor": e.actor_username,
                "occurred_at": str(e.occurred_at) if e.occurred_at else None,
            }
            for e in events
        ],
    }
