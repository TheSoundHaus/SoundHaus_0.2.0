"""
Commit detail models — stores per-commit metadata extracted from Gitea push webhook payloads.

=============================================================================
WHAT THIS FILE DOES AND WHY IT EXISTS
=============================================================================

When Gitea fires a "push" webhook, the payload includes a `commits` array where
each entry looks like:

    {
        "id":        "a1b2c3d4e5f6...",        # full 40-char SHA
        "message":   "added drums track",
        "author":    {"name": "Nathan", "email": "n@example.com"},
        "timestamp": "2026-03-06T12:00:00Z",
        "added":     ["Samples/kick.wav"],
        "modified":  ["MyProject.als"],
        "removed":   []
    }

The existing `PushEvent` model only stores AGGREGATE data (how many commits,
the before/after SHA, the pusher). `CommitDetail` stores ONE ROW PER COMMIT,
making the following things possible:

  - Show a full commit list on the repo detail page (with real messages/authors)
  - Link each commit to its ALS diff (if a Desktop app posted one)
  - Display exactly which .als / .wav / .wav files changed in each commit
  - "Blame" style views in the future (which commit last touched this file)

=============================================================================
RELATIONSHIP TO OTHER TABLES
=============================================================================

    push_events (1) ──── (N) commit_details
    repo_data   (1) ──── (N) commit_details
    commit_details (1) ─ (0..1) als_diffs

  A `CommitDetail` row belongs to both a `PushEvent` AND a `RepoData`.
  The `RepoData` FK is denormalized (repo_id is already reachable through
  push_event) but it dramatically simplifies queries like:
      "give me all commits for repo X"
  without needing a join through push_events.

=============================================================================
DESIGN DECISION A — File change storage strategy
=============================================================================

  OPTION 1 (chosen default — JSON columns):
    files_added    = Column(JSON)  → ["Samples/kick.wav", "Samples/snare.wav"]
    files_modified = Column(JSON)  → ["MyProject.als"]
    files_removed  = Column(JSON)  → []

    Pros: Simple, no extra tables, mirrors Gitea payload shape exactly.
    Cons: Not SQL-filterable — you can't do WHERE 'foo.als' IN files_modified.
          Fine for display, bad if you need "which commits touched file X?"

  OPTION 2 (normalized — separate commit_file_changes table):
    class CommitFileChange(Base):
        commit_id  = FK → commit_details.id
        path       = String
        change_type = Enum("added", "modified", "removed")

    Pros: Full SQL filtering, "file blame" queries become easy.
    Cons: 3–50× more rows depending on commit size, more complex inserts.

  RECOMMENDATION: Start with Option 1. Upgrade to Option 2 if you add a
  "file explorer with blame" feature. To decide: ask yourself right now if
  you plan to build a "filter commits by file" search feature this semester.
  If yes, go with Option 2 immediately.

=============================================================================
DESIGN DECISION B — push_event_id nullability
=============================================================================

  Currently `push_event_id` is nullable=False (strict FK).
  If you ever want to import historical commits from Gitea's REST API
  (outside a webhook flow), those commits won't have a PushEvent row.

  OPTION 1 (current): nullable=False — enforces "commits only come from pushes"
  OPTION 2: nullable=True  — allows historical import but loses referential integrity

  RECOMMENDATION: Keep nullable=False for MVP. Add a comment here when you
  decide to build historical import.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid


class CommitDetail(Base):
    """
    One row per commit present in a Gitea push event payload.

    Populated by: webhook_service._handle_push()
    Read by:      GET /repos/{owner}/{repo}/commits
                  GET /repos/{owner}/{repo}/commits/{sha}

    NOTE: This is NOT written in real time during git push — it is written
    when Gitea fires the webhook AFTER the push completes. There will be a
    short delay (< 1 second normally) between push and row creation.
    """
    __tablename__ = "commit_details"

    # ── Primary key ────────────────────────────────────────────────────────
    # UUID so commit rows are globally unique even across repos.
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign keys ───────────────────────────────────────────────────────

    # The push event this commit belongs to.
    # DESIGN DECISION B: nullable=False — change to nullable=True if you need
    # to import historical commits from Gitea REST API without a webhook.
    push_event_id = Column(
        Integer,
        ForeignKey("push_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Denormalized repo FK for simpler per-repo queries.
    # Value is always the same as push_event.repo_id, just duplicated here.
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Commit identity ────────────────────────────────────────────────────

    # Full 40-character git SHA (e.g. "a1b2c3d4e5f6...").
    # Indexed because GET /commits/{sha} needs fast lookup.
    sha = Column(String(40), nullable=False, index=True)

    # First 8 chars of SHA for display ("a1b2c3d4"). Computed at insert time.
    # Stored separately to avoid substring operations in every SELECT.
    short_sha = Column(String(8), nullable=False)

    # ── Commit metadata ────────────────────────────────────────────────────

    # Full commit message. Can be multiline (subject + body).
    # Stored as Text (no length limit) because "Conventional Commits" style
    # messages can include footers with issue references etc.
    message = Column(Text, nullable=False)

    # Git author name (from commit object — may differ from Gitea login).
    # Example: "Nathan Hall" vs Gitea username "nathanhall97"
    author_name = Column(String(255), nullable=False)

    # Git author email. Useful for Gravatar or matching to Supabase user.
    author_email = Column(String(255), nullable=True)

    # ISO timestamp of the commit (from git object, not server receipt time).
    # This is what Gitea reports in payload.commits[n].timestamp.
    timestamp = Column(DateTime(timezone=True), nullable=True)

    # ── File change lists ──────────────────────────────────────────────────
    # DESIGN DECISION A: JSON columns vs normalized table — see module docstring.

    # List of file paths added in this commit.
    # Example: ["Samples/kick.wav", "MyProject.als"]
    files_added = Column(JSON, nullable=True, default=list)

    # List of file paths modified in this commit.
    # Example: ["MyProject.als"]
    files_modified = Column(JSON, nullable=True, default=list)

    # List of file paths removed in this commit.
    # Example: ["OldSamples/old_kick.wav"]
    files_removed = Column(JSON, nullable=True, default=list)

    # ── Housekeeping ───────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────

    # Back-reference to the parent push event.
    push_event = relationship("PushEvent", back_populates="commit_details")

    # Back-reference to the repository.
    repo = relationship("RepoData", back_populates="commit_details")

    # One commit can have at most one ALS diff (posted by Desktop after push).
    # uselist=False makes this feel like a single object, not a list.
    als_diff = relationship(
        "AlsDiff",
        back_populates="commit",
        uselist=False,  # one-to-one
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CommitDetail(sha='{self.short_sha}', repo='{self.repo_id}', msg='{self.message[:40]}')>"
