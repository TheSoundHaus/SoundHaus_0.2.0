"""
Stem separation models.
Tracks Demucs stem-generation jobs and individual stem files.
"""
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Float,
    Enum, ForeignKey, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum

from database import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class StemJobStatus(str, enum.Enum):
    """Status of a stem generation job."""
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class StemType(str, enum.Enum):
    """Types of audio stems produced by Demucs."""
    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    OTHER = "other"


# ── Models ───────────────────────────────────────────────────────────────────

class SnippetVersion(Base):
    """
    Represents one stem-generation run for a repo's audio snippet.
    Links to the parent RepoData row via repo_gitea_id.
    """
    __tablename__ = "snippet_versions"

    id = Column(Integer, primary_key=True, index=True)

    # FK to repo_data.gitea_id  (e.g. "uuid/repo-name")
    repo_gitea_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Source audio metadata
    source_upload_url = Column(String, nullable=False)   # Supabase CDN URL of original snippet
    source_hash = Column(String, nullable=False, index=True)  # SHA-256 for dedup

    # Optional commit linkage (V2 timeline feature)
    commit_sha = Column(String, nullable=True, index=True)

    # Job status
    status = Column(
        Enum(StemJobStatus),
        default=StemJobStatus.QUEUED,
        nullable=False,
        index=True,
    )
    error_message = Column(Text, nullable=True)

    # Publication: True → this is the "current" stem set shown to visitors
    is_confirmed = Column(Boolean, default=False, nullable=False)

    # Creator (Supabase user UUID string, not a FK — users live in Supabase)
    created_by = Column(String(255), nullable=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Demucs model used (for regeneration tracking)
    demucs_model_version = Column(String, default="htdemucs", nullable=False)

    # ── Relationships ────────────────────────────────────────────────────
    repo = relationship("RepoData", back_populates="snippet_versions")
    stem_files = relationship(
        "StemFile",
        back_populates="snippet_version",
        cascade="all, delete-orphan",
    )


class StemFile(Base):
    """Individual stem file (vocals, drums, bass, other)."""
    __tablename__ = "stem_files"

    id = Column(Integer, primary_key=True, index=True)

    snippet_version_id = Column(
        Integer,
        ForeignKey("snippet_versions.id"),
        nullable=False,
        index=True,
    )

    # Which stem
    stem_type = Column(Enum(StemType), nullable=False)

    # Supabase Storage
    storage_path = Column(String, nullable=False)   # bucket path
    public_url = Column(String, nullable=False)      # CDN URL

    # Audio metadata
    duration_seconds = Column(Float, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    format = Column(String, default="mp3", nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # ── Relationships ────────────────────────────────────────────────────
    snippet_version = relationship("SnippetVersion", back_populates="stem_files")