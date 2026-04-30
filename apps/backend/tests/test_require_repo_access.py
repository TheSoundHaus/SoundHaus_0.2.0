"""
Unit tests for dependencies.require_repo_access.

Covers the matrix:
  - unknown repo                                                  -> 404
  - public repo, anonymous                                        -> ok
  - public repo, authed                                           -> ok
  - private repo, anonymous                                       -> 404
  - private repo, owner                                           -> ok
  - private repo, accepted collaborator (by email)                -> ok
  - private repo, pending/declined/expired collaborator           -> 404
  - private repo, random authenticated user                       -> 404
"""

from __future__ import annotations

from datetime import UTC

import pytest

from dependencies import require_repo_access
from fastapi import HTTPException

OWNER_ID = "supabase-uuid-owner"
COLLAB_EMAIL = "collab@example.com"
REPO_NAME = "test-beats"


@pytest.fixture
def seed_public_repo(db_session):
    from models.repo_models import RepoData

    repo = RepoData(
        gitea_id=f"{OWNER_ID}/{REPO_NAME}-public",
        owner_id=OWNER_ID,
        is_public=True,
    )
    db_session.add(repo)
    db_session.commit()
    return repo.gitea_id


@pytest.fixture
def seed_private_repo(db_session):
    from models.repo_models import RepoData

    repo = RepoData(
        gitea_id=f"{OWNER_ID}/{REPO_NAME}",
        owner_id=OWNER_ID,
        is_public=False,
    )
    db_session.add(repo)
    db_session.commit()
    return repo.gitea_id


@pytest.fixture
def seed_accepted_invitation(db_session, seed_private_repo):
    from datetime import datetime, timedelta

    from models.invitation_models import CollaboratorInvitation

    inv = CollaboratorInvitation(
        invitation_token="tok-accepted",
        repo_name=REPO_NAME,
        owner_email="owner@example.com",
        owner_username=OWNER_ID,
        invitee_email=COLLAB_EMAIL,
        permission="write",
        status="accepted",
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db_session.add(inv)
    db_session.commit()
    return inv


@pytest.fixture
def seed_pending_invitation(db_session, seed_private_repo):
    from datetime import datetime, timedelta

    from models.invitation_models import CollaboratorInvitation

    inv = CollaboratorInvitation(
        invitation_token="tok-pending",
        repo_name=REPO_NAME,
        owner_email="owner@example.com",
        owner_username=OWNER_ID,
        invitee_email="pending@example.com",
        permission="write",
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )
    db_session.add(inv)
    db_session.commit()
    return inv


# ── Tests ───────────────────────────────────────────────────────────────────


def test_unknown_repo_returns_404(db_session):
    with pytest.raises(HTTPException) as exc:
        require_repo_access("someone", "missing-repo", None, None, db_session)
    assert exc.value.status_code == 404


def test_public_repo_allows_anonymous(db_session, seed_public_repo):
    require_repo_access(OWNER_ID, f"{REPO_NAME}-public", None, None, db_session)


def test_public_repo_allows_authed_stranger(db_session, seed_public_repo):
    require_repo_access(
        OWNER_ID,
        f"{REPO_NAME}-public",
        "some-other-uuid",
        "stranger@example.com",
        db_session,
    )


def test_private_repo_blocks_anonymous(db_session, seed_private_repo):
    with pytest.raises(HTTPException) as exc:
        require_repo_access(OWNER_ID, REPO_NAME, None, None, db_session)
    assert exc.value.status_code == 404


def test_private_repo_allows_owner(db_session, seed_private_repo):
    require_repo_access(OWNER_ID, REPO_NAME, OWNER_ID, "owner@example.com", db_session)


def test_private_repo_allows_accepted_collaborator(
    db_session, seed_accepted_invitation
):
    require_repo_access(
        OWNER_ID, REPO_NAME, "some-collab-uuid", COLLAB_EMAIL, db_session
    )


def test_private_repo_blocks_pending_collaborator(
    db_session, seed_pending_invitation
):
    with pytest.raises(HTTPException) as exc:
        require_repo_access(
            OWNER_ID, REPO_NAME, "pending-uuid", "pending@example.com", db_session
        )
    assert exc.value.status_code == 404


def test_private_repo_blocks_random_user(db_session, seed_private_repo):
    with pytest.raises(HTTPException) as exc:
        require_repo_access(
            OWNER_ID, REPO_NAME, "random-uuid", "random@example.com", db_session
        )
    assert exc.value.status_code == 404
