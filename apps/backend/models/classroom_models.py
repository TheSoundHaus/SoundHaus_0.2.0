"""
Classroom + LTI 1.3 data models (Phase 8).

Tables:
    classrooms             — a course / section instance
    classroom_members      — students + instructors, linked to user_id
    assignments            — an assignment template bound to a classroom
    submissions            — a student's submission (repo pointer + score)
    lti_deployments        — Canvas tenant registration (issuer/client_id/deployment)
    lti_users              — maps Canvas platform user_id to Soundhaus user_id

Monetary/score fields are plain floats (not cents) — grades are percentages.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base

# ── Classrooms ──────────────────────────────────────────────────────────────


class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    instructor_id = Column(String(255), nullable=False, index=True)
    # Institution / LTI context — null for native (non-Canvas) classrooms.
    lti_deployment_id = Column(String(36), ForeignKey("lti_deployments.id", ondelete="SET NULL"), nullable=True)
    canvas_context_id = Column(String(255), nullable=True, index=True)  # Canvas course id

    join_code = Column(String(16), nullable=True, unique=True)  # for native join-by-code UX
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    members = relationship("ClassroomMember", back_populates="classroom", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="classroom", cascade="all, delete-orphan")


class ClassroomMember(Base):
    __tablename__ = "classroom_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(255), nullable=False, index=True)  # Soundhaus user
    role = Column(String(16), nullable=False, default="student")  # student / ta / instructor

    # NRPS passthrough — Canvas platform-level user id, kept for re-sync.
    lti_platform_user_id = Column(String(255), nullable=True)

    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    classroom = relationship("Classroom", back_populates="members")

    __table_args__ = (
        UniqueConstraint("classroom_id", "user_id", name="uq_classroom_member"),
    )


# ── Assignments ─────────────────────────────────────────────────────────────


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description_md = Column(Text, nullable=True)

    # Optional template repo the assignment ships with — students fork from here.
    template_repo_id = Column(String(255), nullable=True)

    deadline_at = Column(DateTime(timezone=True), nullable=True)
    max_score = Column(Float, nullable=False, default=100.0)

    # LTI / Canvas bindings
    canvas_resource_link_id = Column(String(255), nullable=True, index=True)
    canvas_line_item_url = Column(Text, nullable=True)  # AGS lineitems URL for score passback

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    classroom = relationship("Classroom", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id = Column(String(36), ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(String(255), nullable=False, index=True)
    submission_repo_id = Column(String(255), nullable=True)  # student's fork / repo
    submission_sha = Column(String(40), nullable=True)

    submitted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    graded_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Float, nullable=True)
    feedback_md = Column(Text, nullable=True)
    # Whether the submission counts as late (deadline_at < submitted_at).
    is_late = Column(Boolean, nullable=False, default=False)

    assignment = relationship("Assignment", back_populates="submissions")

    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_per_student"),
    )


# ── LTI 1.3 ─────────────────────────────────────────────────────────────────


class LtiDeployment(Base):
    """A Canvas tenant registration.

    Multi-tenant: each Canvas instance (Issuer) + client_id + deployment_id
    tuple yields one row. Keys are referenced by classrooms created via LTI
    launches.
    """

    __tablename__ = "lti_deployments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    issuer = Column(String(512), nullable=False)
    client_id = Column(String(255), nullable=False)
    deployment_id = Column(String(255), nullable=False)

    public_jwks_url = Column(Text, nullable=False)
    auth_login_url = Column(Text, nullable=False)
    auth_token_url = Column(Text, nullable=False)

    # Where the tool ultimately lands the user after launch (web dashboard)
    tool_redirect_url = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("issuer", "client_id", "deployment_id", name="uq_lti_deployment"),
        Index("ix_lti_deployment_issuer_client", "issuer", "client_id"),
    )


class LtiUser(Base):
    """Maps Canvas platform user (sub claim) to Soundhaus user_id."""

    __tablename__ = "lti_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform_user_id = Column(String(255), nullable=False)
    deployment_id = Column(String(36), ForeignKey("lti_deployments.id", ondelete="CASCADE"), nullable=False, index=True)
    soundhaus_user_id = Column(String(255), nullable=False, index=True)
    email = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("deployment_id", "platform_user_id", name="uq_lti_user"),
    )
