"""
Commit and diff endpoints — serve commit history and ALS diff data.

=============================================================================
WHAT THIS ROUTER HANDLES
=============================================================================

This router provides four endpoints:

  GET  /repos/{owner}/{repo}/commits
      Returns paginated commit history for a repository.
      Uses CommitDetail rows (created by webhook_service._handle_push).
      Public endpoint — no auth required for public repos.

  GET  /repos/{owner}/{repo}/commits/{sha}
      Returns a single commit's full metadata + file change lists.
      Public endpoint.

  POST /repos/{owner}/{repo}/diff
      Accepts ALS diff JSON from the Desktop app after a git push.
      Creates an AlsDiff row. ALSO clears repo_data.needs_update flag.
      REQUIRES Desktop PAT auth (verify_token checking token prefix).

  GET  /repos/{owner}/{repo}/commits/{sha}/diff
      Returns the AlsDiff row for a given commit SHA.
      Public endpoint — returns 404 if no diff was posted for that commit.

=============================================================================
AUTHENTICATION NOTES
=============================================================================

  GET endpoints: public (no auth), so web app can render commit history
    without the viewer being logged in. If the repo is private, you'll need
    to add an ownership check — that's a TODO for post-MVP.

  POST /diff: requires Desktop PAT auth. The token header looks like:
    Authorization: token soundh_xxxxxxxxxxxxxxxx
  This is the same `verify_token` dependency used in other Desktop endpoints.
  The handler should reject plain JWT tokens from web users.

=============================================================================
PAGINATION DESIGN DECISION
=============================================================================

  OPTION 1 (cursor-based, current stub default):
    GET /commits?after=<sha>&limit=20
    Stable across inserts. Good for infinite scroll.
    Harder to implement — requires WHERE sha < cursor ORDER BY timestamp DESC.

  OPTION 2 (offset-based):
    GET /commits?page=1&limit=20
    Simple. Unstable if new commits arrive between pages.
    Fine for MVP since commit history is append-only (no mid-list inserts).

  RECOMMENDATION: Option 2 (offset) for MVP. The web UI can use "Load more"
  button with page increment. Cursor pagination can be added later.

"""

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database import get_db
from dependencies import limiter, verify_token
from logging_config import get_logger
from models.commit_models import CommitDetail
from models.diff_models import AlsDiff
from models.repo_models import RepoData

logger = get_logger(__name__)

router = APIRouter(tags=["commits"])


# ── GET commit list ────────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/commits")
@limiter.limit("60/minute")
async def get_commit_list(
    request: Request,
    owner: str,
    repo: str,
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(default=20, ge=1, le=100, description="Commits per page"),
    db: Session = Depends(get_db),
):
    """
    Returns paginated commit history for a repository.

    Response shape:
    {
        "success": true,
        "repo": "owner/repo",
        "page": 1,
        "limit": 20,
        "total": 47,
        "commits": [
            {
                "id": "uuid",
                "sha": "a1b2c3d4e5f6...",
                "short_sha": "a1b2c3d4",
                "message": "added drums",
                "author_name": "Nathan",
                "author_email": "n@example.com",
                "timestamp": "2026-03-06T12:00:00Z",
                "files_added": ["Samples/kick.wav"],
                "files_modified": ["MyProject.als"],
                "files_removed": [],
                "has_diff": true   ← True if an AlsDiff row exists for this SHA
            }, ...
        ]
    }

    IMPLEMENTATION STEPS:
    1. Build repo_id = f"{owner}/{repo}"
    2. Query CommitDetail WHERE repo_id = repo_id ORDER BY timestamp DESC
    3. Apply OFFSET (page-1)*limit, LIMIT limit
    4. For each commit, check if an AlsDiff row exists for commit.sha
       (do this in one query: SELECT commit_sha FROM als_diffs WHERE repo_id = X)
    5. Build response dict. Return 404 if repo doesn't exist in repo_data.
    """
    # TODO: implement
    raise NotImplementedError("get_commit_list not yet implemented")


# ── GET single commit ──────────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/commits/{sha}")
@limiter.limit("60/minute")
async def get_commit_detail(
    request: Request,
    owner: str,
    repo: str,
    sha: str,
    db: Session = Depends(get_db),
):
    """
    Returns full metadata for a single commit including file change lists.

    `sha` can be a full 40-char SHA or first 8+ chars (short SHA).
    The handler should accept both and query accordingly.

    Response shape:
    {
        "success": true,
        "commit": {
            ... all CommitDetail fields ...,
            "has_diff": true
        }
    }

    IMPLEMENTATION STEPS:
    1. Build repo_id = f"{owner}/{repo}"
    2. Query CommitDetail WHERE repo_id = X AND (sha = sha OR sha LIKE sha+"%")
       Use `.startswith()` to support short SHAs.
    3. If not found, raise HTTPException(404, "Commit not found")
    4. Check for AlsDiff row WHERE commit_sha = commit.sha
    5. Return serialized commit + has_diff flag.

    DESIGN DECISION — short SHA ambiguity:
      OPTION 1: Query WHERE sha.startswith(user_input) — could match multiple rows
                if two commits share a prefix (astronomically rare but possible).
      OPTION 2: Only accept full 40-char SHAs.
      OPTION 3: Accept both, raise 400 if ambiguous (multiple matches).
      RECOMMENDATION: Option 3.
    """
    # TODO: implement
    raise NotImplementedError("get_commit_detail not yet implemented")


# ── POST diff (Desktop only) ───────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/diff")
@limiter.limit("10/minute")
async def post_als_diff(
    request: Request,
    owner: str,
    repo: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Called by the Desktop app after a git push to store ALS diff data.
    Also clears the repo_data.needs_update flag.

    Expected request body (JSON):
    {
        "commit_sha":   "a1b2c3d4e5f6...",   # full SHA of the pushed HEAD commit
        "before_sha":   "00000000...",        # SHA before the push (from git push output)
        "diff_type":    "combined",           # or "xml", "structural" — see diff_models.py
        "diff_summary": "2 tracks added",    # human-readable string
        "diff_data":    { ... },             # the full diff payload from Desktop IPC
        "desktop_version": "0.2.0"           # optional
    }

    Response:
    { "success": true, "diff_id": "uuid" }

    IMPLEMENTATION STEPS:
    1. Verify auth: token must start with "soundh_" (Desktop PAT).
       If it doesn't, raise HTTPException(403, "Desktop PAT required").
       Hint: `if not token.startswith("soundh_"): raise HTTPException(403, ...)`
    2. Parse request body with `await request.json()`.
    3. Validate required fields: commit_sha, diff_data.
    4. Build AlsDiff row, db.add(), db.commit()
    5. Update repo_data.needs_update = False, db.commit()
       (Clears the "new push available" banner on the web UI)
    6. Return {"success": True, "diff_id": new_diff.id}

    DESIGN DECISION — what if diff already exists for this SHA?
      OPTION 1: Upsert (update existing row if SHA matches). Safe for retries.
      OPTION 2: Reject with 409 Conflict. Simpler.
      RECOMMENDATION: Option 1 (upsert). Desktop may retry on network failure.
    """
    # TODO: implement
    raise NotImplementedError("post_als_diff not yet implemented")


# ── GET diff for a commit ──────────────────────────────────────────────────────

@router.get("/repos/{owner}/{repo}/commits/{sha}/diff")
@limiter.limit("60/minute")
async def get_commit_diff(
    request: Request,
    owner: str,
    repo: str,
    sha: str,
    db: Session = Depends(get_db),
):
    """
    Returns the ALS diff data for a specific commit SHA.

    Response:
    {
        "success": true,
        "diff": {
            "id": "uuid",
            "commit_sha": "a1b2c3d4...",
            "before_sha": "00000000...",
            "diff_type": "combined",
            "diff_summary": "2 tracks added",
            "diff_data": { ... },
            "created_at": "2026-03-06T12:00:00Z"
        }
    }
    Or: { "success": false, "error": "No diff found for this commit" }

    IMPLEMENTATION STEPS:
    1. Build repo_id = f"{owner}/{repo}"
    2. Query AlsDiff WHERE repo_id = X AND commit_sha starts with `sha`
    3. If none: return {"success": False, "error": "No ALS diff found for this commit"}
       (Do NOT raise 404 — the web UI should gracefully show "No diff available"
        rather than treating it as an error state.)
    4. Serialize and return the diff row.
    """
    # TODO: implement
    raise NotImplementedError("get_commit_diff not yet implemented")
