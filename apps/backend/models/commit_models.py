"""
Commit detail models — stores per-commit metadata from Gitea push webhooks.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class CommitDetail(Base):
    """One row per commit in a Gitea push event payload."""
    __tablename__ = "commit_details"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign keys ───────────────────────────────────────────────────────
    push_event_id = Column(
        Integer,
        ForeignKey("push_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Denormalized repo FK for simpler per-repo queries.
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Commit identity ────────────────────────────────────────────────────
    sha = Column(String(40), nullable=False, index=True)
    short_sha = Column(String(8), nullable=False)

    # ── Commit metadata ────────────────────────────────────────────────────
    message = Column(Text, nullable=False)
    author_name = Column(String(255), nullable=False)
    author_email = Column(String(255), nullable=True)
    timestamp = Column(DateTime(timezone=True), nullable=True)

    # ── File changes (JSON arrays from Gitea payload) ──────────────────────
    files_added = Column(JSON, nullable=True, default=list)
    files_modified = Column(JSON, nullable=True, default=list)
    files_removed = Column(JSON, nullable=True, default=list)

    # ── Housekeeping ───────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────
    push_event = relationship("PushEvent", back_populates="commit_details")
    repo = relationship("RepoData", back_populates="commit_details")

    als_diff = relationship(
        "AlsDiff",
        primaryjoin="CommitDetail.sha == AlsDiff.commit_sha",
        foreign_keys="[AlsDiff.commit_sha]",
        back_populates="commit",
        uselist=False,
        viewonly=True,
    )
    def __repr__(self) -> str:
        return f"<CommitDetail(sha='{self.short_sha}', msg='{self.message[:30]}')>"
