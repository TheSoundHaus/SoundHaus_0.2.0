"""
Snippet history models — version history for audio snippet previews.

=============================================================================
WHAT THIS FILE DOES AND WHY IT EXISTS
=============================================================================

The current snippet system is a pure overwrite: uploading a new snippet
replaces the file at `{owner}/{repo}/snippet.{ext}` in Supabase Storage.
The old file is gone, with no record it ever existed.

`SnippetHistory` solves this by:

  1. Before overwriting, copying the current snippet metadata (URL, duration,
     file size, etc.) into a `SnippetHistory` row. The actual storage file is
     moved to a versioned path: `{owner}/{repo}/snippet_v{N}.{ext}`.

  2. The current "live" snippet stays at the same path in `RepoData.audio_snippet`.

  3. GET /repos/{owner}/{repo}/snippet/history returns all past versions
     for display in the "Snippet" tab, allowing a side-by-side comparison.

=============================================================================
FILE STORAGE PATH STRATEGY
=============================================================================

    CURRENT (will change):
      Live:    supabase://snippets/{owner}/{repo}/snippet.mp3
      History: (nothing — file deleted on overwrite)

    AFTER THIS CHANGE:
      Live:    supabase://snippets/{owner}/{repo}/snippet.mp3     ← always current
      History: supabase://snippets/{owner}/{repo}/snippet_v1.mp3  ← first version
               supabase://snippets/{owner}/{repo}/snippet_v2.mp3  ← second version
               ...

  IMPORTANT: snippet_history rows store the URL to the HISTORICAL (versioned)
  file. They do NOT store the URL of the current live file. You read
  `RepoData.audio_snippet` for the live URL.

=============================================================================
RELATIONSHIP TO OTHER TABLES
=============================================================================

    repo_data (1) ──── (N) snippet_history

  No FK to push_events because snippet uploads are user-triggered (any time),
  not always tied to a push. The `commit_sha` field is optional metadata.

=============================================================================
DESIGN DECISION A — Versioned file retention policy
=============================================================================

  OPTION 1 (current — keep forever):
    All old snippets accumulate in storage. Simple, never breaks links.
    Cons: Storage costs grow over time.

  OPTION 2 (keep last N versions):
    After upload, delete versions older than N. Requires a cleanup job.
    Implement by querying SnippetHistory for rows where version_number < (latest - N)
    and calling supabase.storage.remove() for each.

  OPTION 3 (soft delete flag):
    Add `is_deleted: bool = False` and mark old rows without removing files.
    Lets you re-surface them in the UI without re-downloading.

  RECOMMENDATION: Option 1 for MVP. Revisit when storage costs become visible
  in Supabase dashboard. Supabase free tier gives 1GB storage.

=============================================================================
DESIGN DECISION B — version_number scoping
=============================================================================

  OPTION 1 (current — per repo):
    Each repo's version numbers start at 1. Repo A v1 and Repo B v1 are both "1".
    SELECT MAX(version_number) WHERE repo_id = X  →  increment for next row.
    Pros: Meaningful "Version 3 of 5" display labels.
    Cons: Requires a SELECT before every INSERT to get the next number.

  OPTION 2 (global auto-increment):
    Single global sequence. Simpler insert but version numbers aren't meaningful.

  RECOMMENDATION: Option 1. The INCREMENT logic belongs in snippet_service.py's
  new `_get_next_version_number(repo_id, db)` method.
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class SnippetHistory(Base):
    """
    Records each superceded audio snippet for a repository.

    One row is written BEFORE the live snippet is overwritten.
    The row's `snippet_url` points to the MOVED (versioned) file in storage.

    Populated by: snippet_service.save_snippet() — before overwriting
    Read by:      GET /repos/{owner}/{repo}/snippet/history
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

    # 1-indexed version count per repo. Version 1 = first snippet ever uploaded.
    # DESIGN DECISION B: per-repo scope. The INSERT logic in snippet_service
    # must query MAX(version_number) WHERE repo_id = X before inserting.
    version_number = Column(Integer, nullable=False)

    # ── Storage URL ────────────────────────────────────────────────────────

    # Supabase Storage public URL for the VERSIONED file.
    # Example: "https://xyz.supabase.co/storage/v1/object/public/snippets/
    #           owner/repo/snippet_v1.mp3"
    # NOT the current live URL (that lives in RepoData.audio_snippet).
    snippet_url = Column(String(500), nullable=False)

    # ── Snippet metadata (mirrors RepoData columns) ────────────────────────
    # These are copied from the RepoData row at the moment of snapshot.
    # They describe the HISTORICAL snippet, not the current one.

    # Duration in seconds (float for sub-second precision).
    duration = Column(Float, nullable=True)

    # Size in bytes of the audio file.
    file_size = Column(Integer, nullable=True)

    # Audio format string: "mp3", "wav", "flac", etc.
    format = Column(String(20), nullable=True)

    # Sample rate in Hz (e.g., 44100, 48000).
    sample_rate = Column(Integer, nullable=True)

    # Number of audio channels: 1 = mono, 2 = stereo.
    channels = Column(Integer, nullable=True)

    # ── Context (optional but useful) ─────────────────────────────────────

    # If the upload was caused by / associated with a push event, store the
    # HEAD commit SHA here. Allows "Version 2 — from commit a1b2c3d4" display.
    # Nullable because manual uploads may not have an associated commit.
    commit_sha = Column(String(40), nullable=True)

    # Supabase user ID of who triggered the overwrite (the uploader).
    # Nullable for backward-compat if you add history for existing snippets.
    replaced_by_user_id = Column(String(255), nullable=True)

    # Timestamp when this version was replaced (i.e., when the new snippet was uploaded).
    # NOT when this row was created — they're the same in practice, but semantically distinct.
    replaced_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── DESIGN DECISION A extension point ─────────────────────────────────
    # Add `is_deleted = Column(Boolean, default=False)` here if you choose Option 3.
    # is_deleted = Column(Boolean, default=False, nullable=False)

    # ── Relationship ───────────────────────────────────────────────────────
    repo = relationship("RepoData", back_populates="snippet_history")

    def __repr__(self) -> str:
        return (
            f"<SnippetHistory(repo='{self.repo_id}', "
            f"version={self.version_number}, "
            f"format='{self.format}')>"
        )
