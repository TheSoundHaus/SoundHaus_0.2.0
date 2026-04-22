"""
Test fixtures for the SoundHaus backend test suite.

=============================================================================
HOW THIS WORKS
=============================================================================

We use an in-memory SQLite database with StaticPool. StaticPool forces
SQLAlchemy to reuse the SAME underlying database connection for every
session, which means:

  1. The fixture's session (seed data) and the endpoint's session (queries)
     both see the same tables and rows.
  2. We don't need complex transaction-sharing or connection-binding tricks.
  3. Tables are created once per test, and dropped after.

The trade-off: tests can't test true connection isolation. That's fine
for our use case — we just want to verify endpoint logic.

=============================================================================
USAGE
=============================================================================

    cd apps/backend
    pytest                                 # run all tests
    pytest tests/test_commits.py -v        # verbose
    pytest tests/test_commits.py -x        # stop on first failure
    pytest -k "test_post"                  # pattern match
"""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from database import Base, get_db
from dependencies import verify_token
from main import app


# ── In-memory SQLite with StaticPool ────────────────────────────────────────
# StaticPool reuses one connection for ALL sessions → shared in-memory DB.

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
)


# ── SQLite FK enforcement ──────────────────────────────────────────────────

@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# ── Auth overrides ──────────────────────────────────────────────────────────

async def override_verify_token_desktop():
    """Returns a Desktop PAT token (soundh_ prefix)."""
    return "soundh_test_pat_token_for_testing"


async def override_verify_token_web():
    """Returns a web JWT token (no soundh_ prefix) — rejected by POST /diff."""
    return "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.fake"


# ── DB override ─────────────────────────────────────────────────────────────

def override_get_db():
    """Yield a test session from the shared-connection engine."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Core fixtures ───────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def setup_db():
    """
    Create all tables before each test, drop them after.
    autouse=True means this runs for EVERY test automatically.
    """
    # Import ALL models so Base.metadata registers every table
    import models.webhook_models   # noqa: F401
    import models.invitation_models  # noqa: F401
    import models.repo_models     # noqa: F401
    import models.clone_models    # noqa: F401
    import models.genre_models    # noqa: F401
    import models.pat_models      # noqa: F401
    import models.commit_models   # noqa: F401
    import models.diff_models     # noqa: F401
    import models.snippet_models  # noqa: F401

    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session():
    """A standalone DB session for seed data insertion."""
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    """
    FastAPI TestClient with Desktop PAT auth.
    """
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[verify_token] = override_verify_token_desktop

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def client_web_auth():
    """
    TestClient simulating a web user (JWT, no PAT).
    POST /diff should REJECT requests from this client.
    """
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[verify_token] = override_verify_token_web

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ── Seed data helpers ───────────────────────────────────────────────────────

@pytest.fixture
def seed_repo(db_session):
    """Insert a RepoData row. Returns the repo_id string."""
    from models.repo_models import RepoData

    repo = RepoData(
        gitea_id="testuser/test-beats",
        owner_id="supabase-uuid-1234",
        clone_count=0,
        needs_update=False,
    )
    db_session.add(repo)
    db_session.commit()
    return repo.gitea_id


@pytest.fixture
def seed_push_event(db_session, seed_repo):
    """Insert a PushEvent row (required FK for CommitDetail). Returns the id."""
    from models.webhook_models import PushEvent

    push = PushEvent(
        repo_id=seed_repo,
        pusher_id="user-uuid-5678",
        pusher_username="testuser",
        ref="refs/heads/main",
        before_sha="0" * 40,
        after_sha="a" * 40,
        commit_count=1,
    )
    db_session.add(push)
    db_session.commit()
    return push.id


@pytest.fixture
def seed_commit(db_session, seed_repo, seed_push_event):
    """Insert a single CommitDetail row. Returns the object."""
    from models.commit_models import CommitDetail
    from datetime import datetime, timezone

    commit = CommitDetail(
        push_event_id=seed_push_event,
        repo_id=seed_repo,
        sha="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
        short_sha="a1b2c3d4",
        message="added drums and bass",
        author_name="Nathan",
        author_email="nathan@example.com",
        timestamp=datetime(2026, 3, 6, 12, 0, 0, tzinfo=timezone.utc),
        files_added=["Samples/kick.wav"],
        files_modified=["MyProject.als"],
        files_removed=[],
    )
    db_session.add(commit)
    db_session.commit()
    return commit


@pytest.fixture
def seed_diff(db_session, seed_repo, seed_commit):
    """Insert an AlsDiff row linked to seed_commit via SHA. Returns the object."""
    from models.diff_models import AlsDiff

    diff = AlsDiff(
        repo_id=seed_repo,
        commit_sha=seed_commit.sha,
        before_sha="0" * 40,
        diff_type="combined",
        diff_summary="2 tracks added, 1 renamed",
        diff_data={
            "xml": {
                "summary": "2 tracks added",
                "project": {
                    "Tracks": [
                        {"name": "Drums", "type": "midi", "status": "added"},
                        {"name": "Bass", "type": "audio", "status": "added"},
                    ]
                }
            },
            "structural": {
                "ok": True,
                "changes": [
                    {
                        "trackId": "1",
                        "trackName": "Drums",
                        "beforeTrackName": "",
                        "afterTrackName": "Drums",
                        "before": {"name": None},
                        "after": {"name": "Drum Rack"},
                    }
                ]
            }
        },
        desktop_version="0.2.0",
    )
    db_session.add(diff)
    db_session.commit()
    return diff


@pytest.fixture
def seed_multiple_commits(db_session, seed_repo, seed_push_event):
    """
    Insert 5 commits for pagination testing.
    Returns a list of CommitDetail objects (newest first by timestamp).
    """
    from models.commit_models import CommitDetail
    from datetime import datetime, timezone, timedelta

    commits = []
    base_time = datetime(2026, 3, 6, 12, 0, 0, tzinfo=timezone.utc)

    for i in range(5):
        sha_char = str(i)
        commit = CommitDetail(
            push_event_id=seed_push_event,
            repo_id=seed_repo,
            sha=sha_char * 40,
            short_sha=sha_char * 8,
            message=f"commit number {i}",
            author_name="Nathan",
            author_email="nathan@example.com",
            timestamp=base_time + timedelta(hours=i),
            files_added=[f"file_{i}.wav"],
            files_modified=[],
            files_removed=[],
        )
        db_session.add(commit)
        commits.append(commit)

    db_session.commit()
    return list(reversed(commits))  # newest first
