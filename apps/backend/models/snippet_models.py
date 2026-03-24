"""
Snippet history models — version history for audio snippet previews.
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class SnippetHistory(Base):
    """
    Records each superseded audio snippet for a repository.
    One row is written before the live snippet is overwritten.
    """
    __tablename__ = "snippet_history"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign key ────────────────────────────────────────────────────────
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Versioning ─────────────────────────────────────────────────────────
    version_number = Column(Integer, nullable=False)

    # ── Storage URL ────────────────────────────────────────────────────────
    # Points to the versioned file, NOT the current live URL.
    snippet_url = Column(String(500), nullable=False)

    # ── Snippet metadata (copied from RepoData at time of snapshot) ────────
    duration = Column(Float, nullable=True)
    file_size = Column(Integer, nullable=True)
    format = Column(String(20), nullable=True)
    sample_rate = Column(Integer, nullable=True)
    channels = Column(Integer, nullable=True)

    # ── Context ────────────────────────────────────────────────────────────
    commit_sha = Column(String(40), nullable=True)
    replaced_by_user_id = Column(String(255), nullable=True)
    replaced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationship ───────────────────────────────────────────────────────
    repo = relationship("RepoData", back_populates="snippet_history")

    def __repr__(self) -> str:
        return (
            f"<SnippetHistory(repo='{self.repo_id}', "
            f"version={self.version_number}, "
            f"format='{self.format}')>"
        )
