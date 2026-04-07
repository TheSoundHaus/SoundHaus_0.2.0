#!/usr/bin/env python3
"""
Master seed script — bootstraps the full test environment for testuser.

Usage:
    cd apps/backend
    python scripts/seed_all.py

Prerequisites:
    - Docker compose must be running  (docker compose up -d)
    - .env must exist with DATABASE_URL, GITEA_ADMIN_TOKEN, etc.

This script:
    1. Seeds genre list
    2. Seeds testuser + test-diff-project + commits + diffs (via seed_diff_test)
    3. Seeds an audio snippet for the test repo
    4. Seeds repo events for the timeline
    5. Assigns genres to the test repo
"""

import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal, init_db

init_db()

from models.repo_models import RepoData
from models.genre_models import GenreList, repo_genres
from models.webhook_models import RepositoryEvent
from models.snippet_models import SnippetHistory
from models.profile_models import Profile
from datetime import datetime, timezone, timedelta


# ── Constants ───────────────────────────────────────────────────────────────

TEST_USER_ID = "a5107bf7-fc11-404d-87f2-df7b6bf1b336"
TEST_USERNAME = "testuser"
TEST_REPO = "test-diff-project"
REPO_ID = f"{TEST_USER_ID}/{TEST_REPO}"


def step_1_genres():
    """Seed genres (delegates to seed_genres.py)."""
    print("\n" + "=" * 60)
    print("STEP 1: Seeding genres...")
    print("=" * 60)
    from scripts.seed_genres import INITIAL_GENRES

    db = SessionLocal()
    try:
        existing = db.query(GenreList).count()
        if existing > 0:
            print(f"   ℹ️  {existing} genres already exist, skipping.")
            return
        for g in INITIAL_GENRES:
            db.add(GenreList(**g))
        db.commit()
        print(f"   ✅ Seeded {len(INITIAL_GENRES)} genres")
    finally:
        db.close()


def step_2_user_and_repo():
    """Seed testuser + test-diff-project + commits + diffs."""
    print("\n" + "=" * 60)
    print("STEP 2: Seeding testuser, repo, commits, and diffs...")
    print("=" * 60)
    from scripts.seed_diff_test import seed
    seed()


def step_3_audio_snippet():
    """Seed an audio snippet for the test repo."""
    print("\n" + "=" * 60)
    print("STEP 3: Seeding audio snippet...")
    print("=" * 60)

    db = SessionLocal()
    try:
        repo = db.query(RepoData).filter(RepoData.gitea_id == REPO_ID).first()
        if not repo:
            print(f"   ⚠️  RepoData for {REPO_ID} not found — skipping snippet")
            return

        if repo.audio_snippet:
            print(f"   ℹ️  Snippet already set: {repo.audio_snippet}")
            return

        # Point to a local test file (for dev, the /audio/ route won't resolve
        # from Spaces, but the metadata will populate the UI).
        test_audio = "/test_files/drum_loop_120bpm.mp3"
        repo.audio_snippet = test_audio
        repo.snippet_duration = 8.0
        repo.snippet_file_size = 128000
        repo.snippet_format = "mp3"
        repo.snippet_sample_rate = 44100
        repo.snippet_channels = 2
        db.commit()
        print(f"   ✅ Snippet metadata set for {REPO_ID}")
    finally:
        db.close()


def step_4_events():
    """Seed timeline events for the test repo."""
    print("\n" + "=" * 60)
    print("STEP 4: Seeding timeline events...")
    print("=" * 60)

    db = SessionLocal()
    try:
        existing = db.query(RepositoryEvent).filter(RepositoryEvent.repo_id == REPO_ID).count()
        if existing > 0:
            print(f"   ℹ️  {existing} events already exist, skipping.")
            return

        base = datetime.now(timezone.utc) - timedelta(days=7)
        events = [
            ("repository_created", base),
            ("branch_created", base + timedelta(minutes=5)),
            ("push", base + timedelta(hours=2)),
            ("push", base + timedelta(days=1)),
            ("collaborator_added", base + timedelta(days=2)),
            ("push", base + timedelta(days=3)),
            ("snippet_uploaded", base + timedelta(days=3, hours=6)),
            ("push", base + timedelta(days=5)),
            ("tag_created", base + timedelta(days=6)),
        ]
        for event_type, ts in events:
            db.add(RepositoryEvent(
                repo_id=REPO_ID,
                event_type=event_type,
                actor_id=TEST_USER_ID,
                actor_username=TEST_USERNAME,
                occurred_at=ts,
            ))
        db.commit()
        print(f"   ✅ Seeded {len(events)} timeline events")
    finally:
        db.close()


def step_5_genres_for_repo():
    """Assign some genres to the test repo."""
    print("\n" + "=" * 60)
    print("STEP 5: Assigning genres to test repo...")
    print("=" * 60)

    db = SessionLocal()
    try:
        existing = db.execute(
            repo_genres.select().where(repo_genres.c.repo_id == REPO_ID)
        ).fetchall()
        if existing:
            print(f"   ℹ️  {len(existing)} genres already assigned, skipping.")
            return

        # Grab the first 3 genres from the list
        genres = db.query(GenreList).order_by(GenreList.display_order).limit(3).all()
        for g in genres:
            db.execute(repo_genres.insert().values(repo_id=REPO_ID, genre_id=g.genre_id))
        db.commit()
        print(f"   ✅ Assigned {len(genres)} genres to {REPO_ID}")
    finally:
        db.close()


def main():
    print("=" * 60)
    print("🌱 SoundHaus Master Seed — Full Test Environment")
    print("=" * 60)

    step_1_genres()
    step_2_user_and_repo()
    step_3_audio_snippet()
    step_4_events()
    step_5_genres_for_repo()

    print("\n" + "=" * 60)
    print("🎉 All seed steps complete!")
    print(f"   User:  testuser (testuser@soundhaus.dev / TestPass123!)")
    print(f"   Repo:  {REPO_ID}")
    print(f"   URL:   http://localhost:3001/repository/{REPO_ID}")
    print("=" * 60)


if __name__ == "__main__":
    main()
