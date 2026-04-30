"""
Unit tests for ClassroomService + LtiService (Phase 8).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from models.classroom_models import ClassroomMember
from services.classroom_service import build_ags_score_payload, classroom_service
from services.lti_service import lti_service


def test_create_classroom_auto_enrolls_instructor(db_session):
    classroom = classroom_service.create_classroom(
        db_session, instructor_id="instructor-1", name="Intro to DAW"
    )
    assert classroom.id
    assert classroom.join_code

    members = (
        db_session.query(ClassroomMember).filter_by(classroom_id=classroom.id).all()
    )
    assert len(members) == 1
    assert members[0].role == "instructor"


def test_join_classroom_by_code(db_session):
    classroom = classroom_service.create_classroom(
        db_session, instructor_id="instructor-2", name="x"
    )
    joined = classroom_service.join_classroom_by_code(
        db_session, "student-1", classroom.join_code
    )
    assert joined.id == classroom.id

    members = (
        db_session.query(ClassroomMember).filter_by(classroom_id=classroom.id).all()
    )
    assert {m.user_id for m in members} == {"instructor-2", "student-1"}


def test_require_membership_rejects_non_members(db_session):
    classroom = classroom_service.create_classroom(
        db_session, instructor_id="inst-3", name="x"
    )
    with pytest.raises(PermissionError):
        classroom_service.require_membership(db_session, classroom.id, "nobody")


def test_submit_flags_late_submission(db_session):
    classroom = classroom_service.create_classroom(
        db_session, instructor_id="inst-4", name="x"
    )
    deadline = datetime.now(UTC) - timedelta(days=1)
    assignment = classroom_service.create_assignment(
        db_session,
        classroom.id,
        title="Mix the stems",
        description_md=None,
        template_repo_id=None,
        deadline_at=deadline,
    )
    # Student must join first
    classroom_service.upsert_member(db_session, classroom.id, "student-X", role="student")

    sub = classroom_service.submit(
        db_session,
        assignment.id,
        "student-X",
        submission_repo_id="student-X/mix",
        submission_sha="a" * 40,
    )
    assert sub.is_late is True


def test_grade_updates_score_and_timestamp(db_session):
    classroom = classroom_service.create_classroom(
        db_session, instructor_id="inst-5", name="x"
    )
    assignment = classroom_service.create_assignment(
        db_session,
        classroom.id,
        title="t",
        description_md=None,
        template_repo_id=None,
        deadline_at=None,
    )
    classroom_service.upsert_member(db_session, classroom.id, "stu", role="student")
    sub = classroom_service.submit(
        db_session, assignment.id, "stu", submission_repo_id=None, submission_sha=None
    )
    graded = classroom_service.grade(db_session, sub.id, score=88.5, feedback_md="Nice work")
    assert graded.score == 88.5
    assert graded.feedback_md == "Nice work"
    assert graded.graded_at is not None


def test_ags_score_payload_shape():
    payload = build_ags_score_payload("canvas-user-1", score=9.0, max_score=10.0)
    assert payload["userId"] == "canvas-user-1"
    assert payload["scoreGiven"] == 9.0
    assert payload["scoreMaximum"] == 10.0
    assert payload["activityProgress"] == "Completed"
    assert payload["gradingProgress"] == "FullyGraded"


def test_register_deployment_is_idempotent(db_session):
    dep1 = lti_service.register_deployment(
        db_session,
        issuer="https://canvas.instructure.com",
        client_id="10000",
        deployment_id="1:abc",
        public_jwks_url="https://canvas/jwks",
        auth_login_url="https://canvas/auth",
        auth_token_url="https://canvas/token",
    )
    dep2 = lti_service.register_deployment(
        db_session,
        issuer="https://canvas.instructure.com",
        client_id="10000",
        deployment_id="1:abc",
        public_jwks_url="https://canvas/jwks-v2",  # updated
        auth_login_url="https://canvas/auth",
        auth_token_url="https://canvas/token",
    )
    assert dep1.id == dep2.id
    assert dep2.public_jwks_url.endswith("v2")


def test_map_lti_user_upserts(db_session):
    dep = lti_service.register_deployment(
        db_session,
        issuer="https://canvas.instructure.com",
        client_id="20000",
        deployment_id="1:xyz",
        public_jwks_url="https://canvas/jwks",
        auth_login_url="https://canvas/auth",
        auth_token_url="https://canvas/token",
    )
    u = lti_service.map_lti_user(
        db_session,
        deployment_id=dep.id,
        platform_user_id="canvas-user-42",
        soundhaus_user_id="soundhaus-user-42",
        email="s@example.com",
    )
    assert u.id
    assert u.soundhaus_user_id == "soundhaus-user-42"

    # Upsert updates email
    u2 = lti_service.map_lti_user(
        db_session,
        deployment_id=dep.id,
        platform_user_id="canvas-user-42",
        soundhaus_user_id="soundhaus-user-42",
        email="new@example.com",
    )
    assert u2.id == u.id
    assert u2.email == "new@example.com"
