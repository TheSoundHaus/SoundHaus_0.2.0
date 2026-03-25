"""
ALS diff models — stores semantic diff data posted by the Desktop app after a git push.
"""

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class AlsDiff(Base):
    """
    Stores ALS semantic diff data posted by the Desktop app after a git push.
    Can be empty for commits that don't involve .als file changes.
    """
    __tablename__ = "als_diffs"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign keys ───────────────────────────────────────────────────────
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    commit_sha = Column(String(40), nullable=False, index=True)
    before_sha = Column(String(40), nullable=True)

    # ── Diff metadata ──────────────────────────────────────────────────────
    diff_type = Column(String(50), nullable=False, default="combined")
    diff_summary = Column(Text, nullable=True)
    diff_data = Column(JSON, nullable=False)
    desktop_version = Column(String(20), nullable=True)

    # ── Housekeeping ───────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────
    repo = relationship("RepoData", back_populates="als_diffs")
    commit = relationship(
        "CommitDetail",
        primaryjoin="AlsDiff.commit_sha == CommitDetail.sha",
        foreign_keys="[AlsDiff.commit_sha]",
        back_populates="als_diff",
        uselist=False,
        viewonly=True,
    )

    def __repr__(self) -> str:
        return f"<AlsDiff(repo='{self.repo_id}', sha='{self.commit_sha[:8]}', type='{self.diff_type}')>"
