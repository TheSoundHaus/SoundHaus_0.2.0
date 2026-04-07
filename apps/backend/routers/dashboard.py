"""
Dashboard endpoints — heatmap, snippet feed, and collaboration panel data.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, and_, text
from sqlalchemy.orm import Session

from database import get_db
from dependencies import limiter, verify_token
from logging_config import get_logger
from models.invitation_models import CollaboratorInvitation
from models.profile_models import Profile
from models.repo_models import RepoData
from models.seen_models import UserRepoSeen
from models.webhook_models import PushEvent
from services.auth_service import SupabaseAuthService
from dependencies import get_auth

logger = get_logger(__name__)

router = APIRouter(tags=["dashboard"])


# ── Activity Heatmap ─────────────────────────────────────────────────────────

@router.get("/api/dashboard/heatmap")
@limiter.limit("60/minute")
async def get_activity_heatmap(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """
    Returns daily push-event counts for the authenticated user's repos over the
    past 365 days. Used to render the GitHub-style activity heatmap on the dashboard.

    Response shape:
        { "days": [{"date": "2025-04-06", "count": 3}, ...] }
    """
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user_res["user"]["id"]

    since = datetime.now(timezone.utc) - timedelta(days=364)

    rows = (
        db.query(
            func.date(PushEvent.pushed_at).label("day"),
            func.sum(PushEvent.commit_count).label("count"),
        )
        .join(RepoData, RepoData.gitea_id == PushEvent.repo_id)
        .filter(
            RepoData.owner_id == user_id,
            PushEvent.pushed_at >= since,
        )
        .group_by(func.date(PushEvent.pushed_at))
        .all()
    )

    days = [{"date": str(row.day), "count": row.count} for row in rows]
    return {"days": days}


# ── Snippet Feed ─────────────────────────────────────────────────────────────

@router.get("/api/feed/snippets")
@limiter.limit("60/minute")
async def get_snippet_feed(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    Returns recently-active public repos that have an audio snippet.
    No auth required — this is a public discovery feed.

    Response shape:
        { "snippets": [...], "total": int, "page": int, "pages": int }
    """
    offset = (page - 1) * limit

    base_q = (
        db.query(RepoData)
        .filter(RepoData.audio_snippet.isnot(None))
        .order_by(RepoData.last_activity_at.desc().nullslast())
    )

    total = base_q.count()
    repos = base_q.offset(offset).limit(limit).all()

    snippets = []
    for r in repos:
        parts = r.gitea_id.split("/", 1)
        repo_name = parts[1] if len(parts) == 2 else r.gitea_id
        owner_slug = parts[0] if len(parts) == 2 else ""

        # Look up profile for username / avatar
        profile = db.query(Profile).filter(Profile.id == r.owner_id).first()
        owner_username = profile.username if profile else owner_slug
        avatar_url = profile.avatar_url if profile else None

        snippets.append(
            {
                "repo_id": r.gitea_id,
                "repo_name": repo_name,
                "owner_id": r.owner_id,
                "owner_username": owner_username,
                "owner_avatar_url": avatar_url,
                "audio_snippet": r.audio_snippet,
                "snippet_duration": r.snippet_duration,
                "thumbnail_url": r.thumbnail_url,
                "thumbnail_type": r.thumbnail_type,
                "last_activity_at": r.last_activity_at.isoformat() if r.last_activity_at else None,
                "genres": [g.name for g in r.genres] if r.genres else [],
            }
        )

    return {
        "snippets": snippets,
        "total": total,
        "page": page,
        "pages": max(1, (total + limit - 1) // limit),
    }


# ── Collaboration Panel ───────────────────────────────────────────────────────

@router.get("/api/dashboard/collaborations")
@limiter.limit("60/minute")
async def get_collaborations(
    request: Request,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """
    Returns repos where the current user is an accepted collaborator,
    along with unread-activity counts since they last visited.

    Response shape:
        { "collaborations": [{ "repo_id", "repo_name", "owner_username",
                                "unread_count",
                                "last_seen_at", "last_push_at" }] }
    """
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user_res["user"]["id"]

    # Get user's email so we can match invitations
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        return {"collaborations": []}
    user_email = profile.email

    # Find accepted invitations for this email
    invites = (
        db.query(CollaboratorInvitation)
        .filter(
            CollaboratorInvitation.invitee_email == user_email,
            CollaboratorInvitation.status == "accepted",
        )
        .all()
    )

    if not invites:
        return {"collaborations": []}

    repo_ids = [inv.repo_name for inv in invites]

    # Load repos
    repos = db.query(RepoData).filter(RepoData.gitea_id.in_(repo_ids)).all()
    repo_map = {r.gitea_id: r for r in repos}

    # Load seen records for this user
    seen_rows = (
        db.query(UserRepoSeen)
        .filter(UserRepoSeen.user_id == user_id, UserRepoSeen.repo_id.in_(repo_ids))
        .all()
    )
    seen_map = {s.repo_id: s.last_seen_at for s in seen_rows}

    result = []
    for inv in invites:
        repo = repo_map.get(inv.repo_name)
        if not repo:
            continue

        last_seen = seen_map.get(inv.repo_name)

        # Count pushes since last_seen (or all time if never seen)
        unread_q = db.query(func.count(PushEvent.id)).filter(
            PushEvent.repo_id == inv.repo_name
        )
        if last_seen:
            unread_q = unread_q.filter(PushEvent.pushed_at > last_seen)
        unread_count = unread_q.scalar() or 0

        # Owner profile
        owner_profile = db.query(Profile).filter(Profile.id == repo.owner_id).first()
        owner_username = owner_profile.username if owner_profile else inv.owner_username

        parts = inv.repo_name.split("/", 1)
        repo_name = parts[1] if len(parts) == 2 else inv.repo_name

        result.append(
            {
                "repo_id": inv.repo_name,
                "repo_name": repo_name,
                "owner_username": owner_username,
                "unread_count": unread_count,
                "last_seen_at": last_seen.isoformat() if last_seen else None,
                "last_push_at": repo.last_push_at.isoformat() if repo.last_push_at else None,
                "thumbnail_url": repo.thumbnail_url,
                "thumbnail_type": repo.thumbnail_type,
            }
        )

    return {"collaborations": result}


@router.post("/api/dashboard/collaborations/{owner}/{repo}/seen")
@limiter.limit("60/minute")
async def mark_collaboration_seen(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    auth_service: SupabaseAuthService = Depends(get_auth),
    db: Session = Depends(get_db),
):
    """Mark a collaborating repo as seen (clears unread count)."""
    user_res = await auth_service.get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    user_id = user_res["user"]["id"]
    repo_id = f"{owner}/{repo}"

    seen = db.query(UserRepoSeen).filter(
        UserRepoSeen.user_id == user_id,
        UserRepoSeen.repo_id == repo_id,
    ).first()

    now = datetime.now(timezone.utc)
    if seen:
        seen.last_seen_at = now
    else:
        seen = UserRepoSeen(user_id=user_id, repo_id=repo_id, last_seen_at=now)
        db.add(seen)

    db.commit()
    return {"success": True}
