"""
Recompute `RepoData.explore_score` for every public repo.

Scoring formula (plan.md §7):
    score = (
        log(stars + 1)            * 3.0
      + log(clones + 1)           * 2.5
      + log(recent_commits_30d+1) * 4.0
      + (2.0 if has_snippet else 0.0)
      + (0.5 if has_thumbnail else 0.0)
    ) * time_decay
    time_decay = 1.0 / (hours_since(last_activity_at) + 2.0) ** 0.4

Run locally:
    python scripts/recompute_explore_scores.py

Production: a systemd timer or DO scheduled job hits this every 15 minutes.
The script is idempotent and acquires a distributed lock so concurrent runs
are safe.

This file is also import-friendly: `routers/admin.py` calls `recompute()`
in-process for a manual /admin/recompute-explore-scores endpoint.
"""

from __future__ import annotations

import asyncio
import math
import os
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from models.commit_models import CommitDetail  # noqa: E402
from models.repo_models import RepoData  # noqa: E402
from services.redis_service import distributed_lock  # noqa: E402


def _time_decay(last_activity_at: datetime | None) -> float:
    if last_activity_at is None:
        return 0.3
    now = datetime.now(UTC)
    if last_activity_at.tzinfo is None:
        last_activity_at = last_activity_at.replace(tzinfo=UTC)
    hours = max(0.0, (now - last_activity_at).total_seconds() / 3600.0)
    return 1.0 / ((hours + 2.0) ** 0.4)


def _score_row(
    row: RepoData,
    recent_commit_counts: dict[str, int],
) -> float:
    stars = row.stars_count or 0
    clones = row.clone_count or 0
    recent = recent_commit_counts.get(row.gitea_id, 0)

    raw = (
        math.log(stars + 1) * 3.0
        + math.log(clones + 1) * 2.5
        + math.log(recent + 1) * 4.0
        + (2.0 if row.audio_snippet else 0.0)
        + (0.5 if row.thumbnail_url else 0.0)
    )
    return round(raw * _time_decay(row.last_activity_at), 6)


def recompute(db: Session) -> dict[str, int]:
    """Recompute scores for every public repo. Returns stats."""
    cutoff = datetime.now(UTC) - timedelta(days=30)

    # Bulk-count recent commits per repo in a single query
    rows = (
        db.query(CommitDetail.repo_id, func.count(CommitDetail.id))
        .filter(CommitDetail.timestamp >= cutoff)
        .group_by(CommitDetail.repo_id)
        .all()
    )
    recent_commit_counts = dict(rows)

    public_repos = db.query(RepoData).filter(RepoData.is_public.is_(True)).all()
    updated = 0
    for r in public_repos:
        new_score = _score_row(r, recent_commit_counts)
        if abs((r.explore_score or 0.0) - new_score) > 1e-4:
            r.explore_score = new_score
            updated += 1

    if updated:
        db.commit()

    return {"scanned": len(public_repos), "updated": updated}


async def main() -> int:
    async with distributed_lock("cron:recompute_explore_scores", ttl_ms=10 * 60_000) as got:
        if not got:
            print("another worker holds the lock — exiting")
            return 0
        db: Session = SessionLocal()
        try:
            stats = recompute(db)
        finally:
            db.close()
    print(f"recompute_explore_scores: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
