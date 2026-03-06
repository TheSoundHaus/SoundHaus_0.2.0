"""
ALS diff models — stores semantic diff data posted by the Desktop app after a git push.

=============================================================================
WHAT THIS FILE DOES AND WHY IT EXISTS
=============================================================================

The Desktop app has TWO parallel diff systems that analyze .als files:

  SYSTEM A — Rust NAPI "xml diff" (IPC channel: "diff-xml")
    Input:  current .als path + previous .als path
    Output: { summary: string, project: { Tracks: [...] } }
    What it captures: track adds/removes/renames, top-level project structure

  SYSTEM B — TypeScript "structural compare" (IPC channel: "find-instrument-changes")
    Input:  current .als path + previous .als path
    Output: { ok: true, changes: AlsChange[] }
    Where AlsChange = {
        trackId:         string,
        trackName:       string,
        beforeTrackName: string,
        afterTrackName:  string,
        before:          AlsDeviceHint,  // { name?, trackHint? }
        after:           AlsDeviceHint,
    }
    What it captures: instrument/device swaps on each track

FLOW:
  1. User pushes in Desktop app
  2. Desktop calls `git push` via IPC
  3. Desktop invokes BOTH diff systems (diff-xml + find-instrument-changes)
  4. Desktop POSTs combined result to  POST /repos/{owner}/{repo}/diff
  5. This model stores one row for each system's output (diff_type field)
  6. Web repo page reads these rows to render the "Diff" tab

Why Desktop posts, not server-side?
  - The .als binary is on the Desktop machine, not the server
  - Server would need to clone the repo and parse binary just to diff
  - Desktop already has both .als versions in memory after the push
  - Keeps parsing logic out of the backend (Rust/TS NAPI stays Desktop-side)

=============================================================================
RELATIONSHIP TO OTHER TABLES
=============================================================================

    commit_details (1) ─ (0..2) als_diffs
         repo_data (1) ──── (N) als_diffs

  Each push can produce up to 2 AlsDiff rows (one per system type).
  In practice you'll usually post both in a single request and have the
  endpoint create both rows, OR you post a combined JSON blob and use a
  single row. See DESIGN DECISION B.

=============================================================================
DESIGN DECISION A — One table vs two separate tables per diff system
=============================================================================

  OPTION 1 (current — single table, diff_type discriminator):
    diff_type = "xml"        → System A output goes in diff_data
    diff_type = "structural" → System B output goes in diff_data
    One SELECT gives you both. Easy to add a diff_type = "midi" later.

  OPTION 2 (two tables — XmlDiff and StructuralDiff):
    Typed columns per system instead of generic JSON.
    Pros: DB-level schema validation for each diff format.
    Cons: Every new diff system needs a new migration.

  RECOMMENDATION: Option 1. You already have the `diff_type` field as a
  safety valve. If the JSON schema for each type stabilizes, add a JSON
  Schema check at the service layer (not DB layer) to validate the shape.

=============================================================================
DESIGN DECISION B — One row per diff system vs combined blob
=============================================================================

  OPTION 1 (current): Two rows per push (diff_type="xml" and diff_type="structural")
    POST /diff called TWICE by Desktop, or in a loop.
    Pros: Clean separation, each system's data isolated.
    Cons: Two round-trips (or one endpoint that accepts an array).

  OPTION 2: Single row, diff_data = { xml: {...}, structural: {...} }
    diff_type = "combined"
    Pros: One round-trip, simpler Desktop code.
    Cons: Slightly harder to query "just structural changes" later.

  RECOMMENDATION: Option 2 (combined) for MVP simplicity. You can always
  split later. Adjust the `diff_type` enum values below accordingly.

=============================================================================
DESIGN DECISION C — commit_sha vs commit_id FK
=============================================================================

  `commit_sha` stores a raw git SHA string. The FK could instead point to
  `commit_details.id` (UUID), but using the SHA directly allows AlsDiff rows
  to be created BEFORE the CommitDetail row exists (race conditions on Gitea
  webhook vs Desktop POST timing) without violating FK constraints.

  OPTION 1 (current): commit_sha String — looser coupling, no FK constraint.
  OPTION 2: commit_id FK → commit_details.id — strict integrity guarantee.

  RECOMMENDATION: Option 1 for MVP. Add a FK after confirming commit details
  always arrive before diffs (they should, since Gitea webhook fires before
  Desktop finishes IPC calls, but test this assumption).
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

    Populated by: POST /repos/{owner}/{repo}/diff  (Desktop PAT auth required)
    Read by:      GET /repos/{owner}/{repo}/commits/{sha}/diff
                  GET /repos/{owner}/{repo}/diff/latest

    NOTE: This table can be empty for commits that don't involve .als file
    changes (e.g., a push that only changes .wav sample files).
    The web UI should gracefully handle the absence of a diff row.
    """
    __tablename__ = "als_diffs"

    # ── Primary key ────────────────────────────────────────────────────────
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # ── Foreign keys ───────────────────────────────────────────────────────

    # The repo this diff belongs to.
    repo_id = Column(
        String(255),
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # DESIGN DECISION C: Raw SHA string (not a FK to commit_details.id).
    # Indexed so GET /commits/{sha}/diff can find rows quickly.
    # Change to ForeignKey("commit_details.id") if you want strict integrity.
    commit_sha = Column(String(40), nullable=False, index=True)

    # SHA of the commit BEFORE this push (the "base" for the diff).
    # Stored so the UI can show "compared against <short_sha>" in headers.
    before_sha = Column(String(40), nullable=True)

    # ── Diff metadata ──────────────────────────────────────────────────────

    # DESIGN DECISION A/B: which diff system produced this row.
    # Suggested values:
    #   "xml"        — System A (Rust NAPI, track-level structural)
    #   "structural" — System B (TypeScript, instrument/device changes)
    #   "combined"   — Both systems merged into one blob (Option 2)
    diff_type = Column(String(50), nullable=False, default="combined")

    # Human-readable summary string for quick display.
    # For System A: payload.summary (e.g., "2 tracks added, 1 renamed")
    # For combined: generate on Desktop before posting.
    diff_summary = Column(Text, nullable=True)

    # Full diff payload as JSON. Shape depends on diff_type:
    #
    #   diff_type = "xml":
    #     { "summary": "...", "project": { "Tracks": [...] } }
    #
    #   diff_type = "structural":
    #     { "ok": true, "changes": [{ trackId, trackName, before, after }, ...] }
    #
    #   diff_type = "combined":
    #     { "xml": { ... }, "structural": { ... } }
    #
    # The web AlsDiffView component should branch on diff_type to select
    # the right renderer.
    diff_data = Column(JSON, nullable=False)

    # Desktop app version that generated this diff.
    # Useful for detecting when a format change breaks parsing.
    # Example: "0.2.0"
    # Leave nullable for now; add a version string in Desktop when stable.
    desktop_version = Column(String(20), nullable=True)

    # ── Housekeeping ───────────────────────────────────────────────────────
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # ── Relationships ──────────────────────────────────────────────────────

    # Back-reference to the repository.
    repo = relationship("RepoData", back_populates="als_diffs")

    # Back-reference to the commit whose SHA matches commit_sha.
    # DESIGN DECISION C: This relationship only works if you switch to a FK.
    # For now, leave it as None and do manual SHA lookups in the service layer.
    #
    # commit = relationship("CommitDetail", back_populates="als_diff",
    #                       foreign_keys=[commit_sha],
    #                       primaryjoin="AlsDiff.commit_sha == CommitDetail.sha")
    #
    # TODO: Uncomment the above relationship when you've decided on Design Decision C.
    commit = None  # placeholder — replace with relationship() per Decision C

    def __repr__(self) -> str:
        return f"<AlsDiff(repo='{self.repo_id}', sha='{self.commit_sha[:8]}', type='{self.diff_type}')>"
