"""
Stem Worker – polls the DB for QUEUED SnippetVersion rows and processes them.

Runs as a long-lived loop inside the fastapi container (or a dedicated
worker container). Start with:

    python /workers/stem_worker.py

The FastAPI app source is mounted at /app, so we add /app to sys.path.
"""

import asyncio
import os
import sys

# The FastAPI source is mounted at /app inside Docker.
# Add it so we can import database, models, config, etc.
sys.path.insert(0, "/app")

from database import SessionLocal  # noqa: E402
from models.stem_models import SnippetVersion, StemJobStatus  # noqa: E402
from services.demucs_service import DemucsService  # noqa: E402
from logging_config import get_logger  # noqa: E402

logger = get_logger("soundhaus.worker")

# How long to sleep when no jobs are found
POLL_INTERVAL = int(os.getenv("WORKER_POLL_INTERVAL", "5"))  # seconds

# How long a PROCESSING job can sit before it's considered stale (seconds)
STALE_JOB_TIMEOUT = int(os.getenv("STALE_JOB_TIMEOUT", "600"))  # 10 min


def recover_stale_jobs() -> int:
    """
    Reset any PROCESSING jobs back to QUEUED on startup.
    This handles cases where the worker crashed mid-separation.
    """
    from datetime import datetime, timedelta, timezone

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=STALE_JOB_TIMEOUT)
        stale = (
            db.query(SnippetVersion)
            .filter(
                SnippetVersion.status == StemJobStatus.PROCESSING,
                SnippetVersion.updated_at < cutoff,
            )
            .all()
        )
        count = len(stale)
        for job in stale:
            logger.warning("recovering_stale_job", job_id=job.id, repo=job.repo_gitea_id)
            job.status = StemJobStatus.QUEUED
            job.error_message = "Recovered: previous worker died mid-processing"
        db.commit()
        if count:
            logger.info("stale_jobs_recovered", count=count)
        return count
    finally:
        db.close()


async def process_next_job() -> bool:
    """
    Fetch and process the oldest QUEUED job.
    Returns True if a job was processed, False if the queue was empty.
    """
    db = SessionLocal()
    try:
        job: SnippetVersion | None = (
            db.query(SnippetVersion)
            .filter(SnippetVersion.status == StemJobStatus.QUEUED)
            .order_by(SnippetVersion.created_at)
            .first()
        )

        if not job:
            return False

        # Parse owner/repo from gitea_id ("owner-uuid/repo-name")
        parts = job.repo_gitea_id.split("/", 1)
        if len(parts) != 2:
            logger.error("bad_gitea_id", gitea_id=job.repo_gitea_id)
            job.status = StemJobStatus.FAILED
            job.error_message = f"Malformed repo_gitea_id: {job.repo_gitea_id}"
            db.commit()
            return True

        owner, repo_name = parts

        logger.info(
            "processing_job",
            job_id=job.id,
            repo=job.repo_gitea_id,
        )

        demucs = DemucsService(db)
        await demucs.process_stems_job(job.id, owner, repo_name)

        return True

    except Exception as exc:
        logger.error("worker_job_error", error=str(exc), exc_info=True)
        return True  # still consumed a job attempt

    finally:
        db.close()


async def main():
    """Main worker loop."""
    logger.info("worker_started", poll_interval=POLL_INTERVAL)

    # Recover any jobs stuck in PROCESSING from a prior crash
    recover_stale_jobs()

    while True:
        had_job = await process_next_job()
        if not had_job:
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
