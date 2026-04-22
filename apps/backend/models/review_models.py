"""
Review models — the "Mastering Gate" review workflow.

Stores review sessions (pending push approvals) and annotations
(timestamped comments tied to specific commits/tracks within a review).
"""

from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class ReviewSession(Base):
    """
    A review request created when an Artist pushes changes.

    Lifecycle: pending → approved | denied
    Only Producers or the Owner can transition a session out of 'pending'.
    """
    __tablename__ = "review_sessions"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign key to repository ──────────────────────────────────────────
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Push context ───────────────────────────────────────────────────────
    commit_sha = Column(String(40), nullable=False, index=True)
    branch_name = Column(String(255), nullable=False)

    # ── Artist who pushed (Supabase UUID) ──────────────────────────────────
    artist_id = Column(String(255), nullable=False, index=True)

    # ── Review state ───────────────────────────────────────────────────────
    # "pending" | "approved" | "denied"
    status = Column(String(20), nullable=False, default="pending")

    # ── Reviewer (Producer or Owner who acted) ─────────────────────────────
    reviewer_id = Column(String(255), nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    # ── Timestamps ─────────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # ── Relationships ──────────────────────────────────────────────────────
    repo = relationship("RepoData", backref="review_sessions")
    annotations = relationship(
        "ReviewAnnotation",
        back_populates="review_session",
        cascade="all, delete-orphan",
        order_by="ReviewAnnotation.created_at",
    )

    __table_args__ = (
        Index("ix_review_sessions_repo_status", "repo_id", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ReviewSession(id='{self.id[:8]}', repo='{self.repo_id}', "
            f"status='{self.status}', artist='{self.artist_id[:8]}')>"
        )


class ReviewAnnotation(Base):
    """
    A timestamped comment on a review session — attached to a specific
    track path or the review as a whole.
    """
    __tablename__ = "review_annotations"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign key to review session ──────────────────────────────────────
    review_session_id = Column(
        String,
        ForeignKey("review_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Author (Supabase UUID — Producer, Owner, or the Artist) ───────────
    author_id = Column(String(255), nullable=False, index=True)

    # ── Comment content ────────────────────────────────────────────────────
    comment_text = Column(Text, nullable=False)

    # ── Optional: path to a specific MIDI track or metadata file ───────────
    # e.g. "tracks/Lead Synth.mid" or "project.als"
    target_path = Column(String(500), nullable=True)

    # ── Timestamps ─────────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────
    review_session = relationship("ReviewSession", back_populates="annotations")

    def __repr__(self) -> str:
        return (
            f"<ReviewAnnotation(id='{self.id[:8]}', "
            f"session='{self.review_session_id[:8]}', path='{self.target_path}')>"
        )
