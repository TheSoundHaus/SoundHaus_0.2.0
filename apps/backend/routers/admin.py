"""
Admin / operations endpoints.

Guarded by a single `X-Admin-Token` header matched against `settings.admin_token`
so internal crons (DO scheduled jobs, systemd timers) can trigger expensive
maintenance tasks without shipping a full RBAC layer.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import limiter, resolve_owner_id
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from logging_config import get_logger
from models.repo_models import RepoData

logger = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin_token(x_admin_token: str | None = Header(None)) -> None:
    expected = getattr(settings, "admin_token", None) or ""
    if not expected:
        raise HTTPException(status_code=503, detail="Admin API disabled (no token configured)")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Invalid admin token")


@router.post("/recompute-explore-scores")
@limiter.limit("6/minute")
async def recompute_explore_scores(
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin_token),
):
    """Trigger an in-process recompute of every public repo's explore_score.

    Intended for systemd timers / DO scheduled jobs. Returns per-run stats.
    """
    # Lazy import — keeps the router file light and avoids heavy math imports
    # at FastAPI startup.
    from scripts.recompute_explore_scores import recompute

    stats = recompute(db)
    logger.info("admin_recompute_explore_scores", **stats)
    return {"success": True, **stats}


@router.post("/backfill-commits")
@limiter.limit("3/minute")
async def backfill_commits(
    request: Request,
    owner: Optional[str] = None,
    repo: Optional[str] = None,
    db: Session = Depends(get_db),
    _: None = Depends(_require_admin_token),
):
    """Backfill missing CommitDetail rows from Gitea.

    Without query params: walks every repo in repo_data and reconciles.
    With ?owner=…&repo=…: backfills a single repo (useful for retries after a
    webhook miss). `owner` may be a SoundHaus username or a Supabase UUID; both
    resolve to the canonical Gitea owner id.

    Closes the gap left by `webhook_service._handle_push` in the rare case the
    auto-create rollback path failed for a given delivery.
    """
    # Lazy import — backfill script pulls in `requests` and the full ORM stack
    from scripts.backfill_commits import backfill_repo

    if (owner is None) ^ (repo is None):
        raise HTTPException(
            status_code=400,
            detail="Pass both ?owner=…&repo=… or neither (full reconcile).",
        )

    results: list[dict] = []

    if owner and repo:
        owner_id = resolve_owner_id(owner, db)
        gitea_id = f"{owner_id}/{repo}"
        repo_row = db.query(RepoData).filter(RepoData.gitea_id == gitea_id).first()
        if not repo_row:
            raise HTTPException(status_code=404, detail=f"Repo {gitea_id} not registered")
        inserted = backfill_repo(db, owner_id, repo)
        results.append({"repo": gitea_id, "inserted": inserted})
    else:
        repos = db.query(RepoData).all()
        for r in repos:
            if "/" not in r.gitea_id:
                continue
            owner_id, _, repo_name = r.gitea_id.partition("/")
            try:
                inserted = backfill_repo(db, owner_id, repo_name)
                results.append({"repo": r.gitea_id, "inserted": inserted})
            except Exception as e:
                logger.warning(
                    "admin_backfill_repo_failed",
                    repo=r.gitea_id,
                    error=str(e),
                )
                results.append({"repo": r.gitea_id, "error": str(e)})

    total_inserted = sum(r.get("inserted", 0) for r in results)
    logger.info(
        "admin_backfill_commits",
        repos=len(results),
        inserted=total_inserted,
    )
    return {
        "success": True,
        "repos_processed": len(results),
        "total_inserted": total_inserted,
        "results": results,
    }
