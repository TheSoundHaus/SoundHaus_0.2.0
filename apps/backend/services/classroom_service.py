"""
Classroom service (Phase 8).

Handles classroom CRUD + enrollment + assignment/submission lifecycle.
LTI-specific logic lives in `services/lti_service.py`; this service only
records the outcome of a launch (upsert member, stamp resource_link on
assignment) and handles score passback.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from logging_config import get_logger
from models.classroom_models import (
    Assignment,
    Classroom,
    ClassroomMember,
    Submission,
)

logger = get_logger(__name__)


def _join_code() -> str:
    # Short, human-friendly, case-insensitive join codes.
    return secrets.token_urlsafe(6).upper().replace("_", "").replace("-", "")[:8]


class ClassroomService:
    # ── Classrooms ─────────────────────────────────────────────────────────

    def create_classroom(
        self,
        db: Session,
        instructor_id: str,
        *,
        name: str,
        description: str | None = None,
        lti_deployment_id: str | None = None,
        canvas_context_id: str | None = None,
    ) -> Classroom:
        classroom = Classroom(
            name=name.strip(),
            description=description,
            instructor_id=instructor_id,
            lti_deployment_id=lti_deployment_id,
            canvas_context_id=canvas_context_id,
            join_code=_join_code(),
        )
        db.add(classroom)
        # Instructor auto-enrolled as member.
        db.flush()
        db.add(
            ClassroomMember(
                classroom_id=classroom.id,
                user_id=instructor_id,
                role="instructor",
            )
        )
        db.commit()
        db.refresh(classroom)
        return classroom

    def list_classrooms_for_user(self, db: Session, user_id: str) -> list[Classroom]:
        rows = (
            db.query(Classroom)
            .join(ClassroomMember, ClassroomMember.classroom_id == Classroom.id)
            .filter(ClassroomMember.user_id == user_id)
            .order_by(Classroom.created_at.desc())
            .all()
        )
        return rows

    def get_classroom(self, db: Session, classroom_id: str) -> Classroom | None:
        return db.query(Classroom).filter(Classroom.id == classroom_id).first()

    def join_classroom_by_code(self, db: Session, user_id: str, join_code: str) -> Classroom:
        classroom = db.query(Classroom).filter(Classroom.join_code == join_code.upper()).first()
        if classroom is None:
            raise ValueError("Invalid join code")
        self.upsert_member(db, classroom.id, user_id, role="student")
        return classroom

    # ── Members ────────────────────────────────────────────────────────────

    def upsert_member(
        self,
        db: Session,
        classroom_id: str,
        user_id: str,
        *,
        role: str = "student",
        lti_platform_user_id: str | None = None,
    ) -> ClassroomMember:
        existing = (
            db.query(ClassroomMember)
            .filter(
                ClassroomMember.classroom_id == classroom_id,
                ClassroomMember.user_id == user_id,
            )
            .first()
        )
        if existing is not None:
            if lti_platform_user_id and not existing.lti_platform_user_id:
                existing.lti_platform_user_id = lti_platform_user_id
                db.commit()
            return existing
        member = ClassroomMember(
            classroom_id=classroom_id,
            user_id=user_id,
            role=role,
            lti_platform_user_id=lti_platform_user_id,
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        return member

    def require_membership(
        self,
        db: Session,
        classroom_id: str,
        user_id: str,
        *,
        allowed_roles: tuple[str, ...] = ("student", "ta", "instructor"),
    ) -> ClassroomMember:
        m = (
            db.query(ClassroomMember)
            .filter(
                ClassroomMember.classroom_id == classroom_id,
                ClassroomMember.user_id == user_id,
            )
            .first()
        )
        if m is None:
            raise PermissionError("Not a member of this classroom")
        if m.role not in allowed_roles:
            raise PermissionError(f"Role '{m.role}' not permitted here")
        return m

    # ── Assignments ────────────────────────────────────────────────────────

    def create_assignment(
        self,
        db: Session,
        classroom_id: str,
        *,
        title: str,
        description_md: str | None,
        template_repo_id: str | None,
        deadline_at: datetime | None,
        max_score: float = 100.0,
        canvas_resource_link_id: str | None = None,
        canvas_line_item_url: str | None = None,
    ) -> Assignment:
        a = Assignment(
            classroom_id=classroom_id,
            title=title.strip(),
            description_md=description_md,
            template_repo_id=template_repo_id,
            deadline_at=deadline_at,
            max_score=max_score,
            canvas_resource_link_id=canvas_resource_link_id,
            canvas_line_item_url=canvas_line_item_url,
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        return a

    def list_assignments(self, db: Session, classroom_id: str) -> list[Assignment]:
        return (
            db.query(Assignment)
            .filter(Assignment.classroom_id == classroom_id)
            .order_by(Assignment.created_at.desc())
            .all()
        )

    def find_assignment_by_resource_link(
        self,
        db: Session,
        classroom_id: str,
        resource_link_id: str,
    ) -> Assignment | None:
        return (
            db.query(Assignment)
            .filter(
                Assignment.classroom_id == classroom_id,
                Assignment.canvas_resource_link_id == resource_link_id,
            )
            .first()
        )

    # ── Submissions ────────────────────────────────────────────────────────

    def submit(
        self,
        db: Session,
        assignment_id: str,
        student_id: str,
        *,
        submission_repo_id: str | None,
        submission_sha: str | None,
    ) -> Submission:
        assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
        if assignment is None:
            raise ValueError("Assignment not found")

        now = datetime.now(UTC)
        is_late = bool(assignment.deadline_at and now > assignment.deadline_at)

        existing = (
            db.query(Submission)
            .filter(
                Submission.assignment_id == assignment_id,
                Submission.student_id == student_id,
            )
            .first()
        )
        if existing is not None:
            existing.submission_repo_id = submission_repo_id
            existing.submission_sha = submission_sha
            existing.submitted_at = now
            existing.is_late = is_late
            db.commit()
            db.refresh(existing)
            return existing

        sub = Submission(
            assignment_id=assignment_id,
            student_id=student_id,
            submission_repo_id=submission_repo_id,
            submission_sha=submission_sha,
            submitted_at=now,
            is_late=is_late,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub

    def grade(
        self,
        db: Session,
        submission_id: str,
        *,
        score: float,
        feedback_md: str | None = None,
    ) -> Submission:
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if sub is None:
            raise ValueError("Submission not found")
        sub.score = float(score)
        sub.feedback_md = feedback_md
        sub.graded_at = datetime.now(UTC)
        db.commit()
        db.refresh(sub)
        return sub


classroom_service = ClassroomService()


# ── AGS score passback plumbing ─────────────────────────────────────────────


def build_ags_score_payload(student_platform_user_id: str, score: float, max_score: float) -> dict[str, Any]:
    """Return the body for Canvas AGS `lineItem.postScore`.

    Reference: IMS LTI AGS 2.0. Pasted into the HTTP POST by `lti_service`.
    """
    return {
        "userId": student_platform_user_id,
        "scoreGiven": float(score),
        "scoreMaximum": float(max_score),
        "timestamp": datetime.now(UTC).isoformat(),
        "activityProgress": "Completed",
        "gradingProgress": "FullyGraded",
    }
