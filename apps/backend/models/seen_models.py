"""
UserRepoSeen — tracks the last time a user acknowledged activity on a collaborating repo.
Used to compute "unread" activity counts in the collaboration panel.
"""

from sqlalchemy import Column, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class UserRepoSeen(Base):
    """
    One row per (user_id, repo_id) pair.
    Updated whenever the user opens the collaboration panel or views the repo.
    """
    __tablename__ = "user_repo_seen"

    user_id = Column(String(255), primary_key=True, nullable=False)
    repo_id = Column(String(255), primary_key=True, nullable=False)
    last_seen_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "repo_id", name="uq_user_repo_seen"),
    )
