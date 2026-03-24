"""
Snippet comment models — time-stamped comments on audio snippets.
"""

from sqlalchemy import Column, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base
import uuid


class SnippetComment(Base):
    """
    A time-stamped comment on a repository's audio snippet.
    Similar to SoundCloud-style comments pinned to a timestamp.
    """
    __tablename__ = "snippet_comments"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign key to repo ────────────────────────────────────────────────
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Comment author (Supabase UUID) ─────────────────────────────────────
    user_id = Column(String(255), nullable=False, index=True)

    # ── Timestamp in seconds within the audio snippet ──────────────────────
    timestamp_seconds = Column(Float, nullable=False)

    # ── Comment text ───────────────────────────────────────────────────────
    comment_text = Column(Text, nullable=False)

    # ── Metadata ───────────────────────────────────────────────────────────
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
