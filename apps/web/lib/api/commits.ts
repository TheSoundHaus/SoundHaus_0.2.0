"use server";

/**
 * Commit and diff API calls for the Repository Detail page.
 *
 * ==========================================================================
 * WHAT THIS FILE DOES
 * ==========================================================================
 *
 * This file mirrors the four endpoints in apps/backend/routers/commits.py:
 *
 *   getCommits()      → GET /repos/{owner}/{repo}/commits
 *   getCommitDetail() → GET /repos/{owner}/{repo}/commits/{sha}
 *   getCommitDiff()   → GET /repos/{owner}/{repo}/commits/{sha}/diff
 *
 * The fourth endpoint (POST /diff) is called from the Desktop app, NOT the
 * web app, so it does not have a wrapper here.
 *
 * All three functions follow the same pattern as repos.ts / snippets.ts:
 *   1. Call authFetch<T>(endpoint) — handles JWT header, base URL, etc.
 *   2. If error, return { success: false, error: message }
 *   3. If success, unwrap the nested response and return { success: true, data }
 *
 * ==========================================================================
 * TYPE NOTES
 * ==========================================================================
 *
 * The types below mirror the backend CommitDetail and AlsDiff SQLAlchemy models.
 * Once the backend is implemented, copy the actual response shapes here.
 * For now the types are declared locally. Move them to lib/types/api.ts when stable.
 *
 * ==========================================================================
 * DESIGN DECISION — where to put types
 * ==========================================================================
 *
 *   OPTION 1 (current): Inline types in this file (fast, self-contained).
 *   OPTION 2: Shared types in lib/types/api.ts alongside GiteaRepo, etc.
 *
 *   RECOMMENDATION: Start with Option 1. Move to api.ts when the second
 *   component that needs these types appears (DRY principle trigger).
 */

import { authFetch } from "./client";
import type { ApiResponse } from "../types/api";


// ── Local types (see DESIGN DECISION above) ──────────────────────────────────

/**
 * A single commit as returned by GET /repos/{owner}/{repo}/commits[/{sha}].
 * Mirrors the CommitDetail SQLAlchemy model in apps/backend/models/commit_models.py.
 */
export interface CommitSummary {
    /** UUID primary key of the CommitDetail row */
    id: string;
    /** Full 40-character git SHA */
    sha: string;
    /** First 8 characters of SHA — use for display */
    short_sha: string;
    /** Full commit message (may be multi-line) */
    message: string;
    /** Git author name (from commit object, not necessarily Gitea username) */
    author_name: string;
    /** Git author email — may be null if not available */
    author_email: string | null;
    /** ISO 8601 timestamp string of the commit (from git object) */
    timestamp: string | null;
    /** File paths added in this commit */
    files_added: string[];
    /** File paths modified in this commit */
    files_modified: string[];
    /** File paths removed in this commit */
    files_removed: string[];
    /**
     * True if an AlsDiff row exists for this SHA.
     * Use this to conditionally show the "View Diff" button on CommitCard.
     */
    has_diff: boolean;
}

/**
 * Paginated list response from GET /repos/{owner}/{repo}/commits.
 */
export interface CommitListResponse {
    repo: string;
    page: number;
    limit: number;
    total: number;
    commits: CommitSummary[];
}

/**
 * ALS diff data returned by GET /repos/{owner}/{repo}/commits/{sha}/diff.
 * Mirrors the AlsDiff SQLAlchemy model in apps/backend/models/diff_models.py.
 *
 * diff_data shape depends on diff_type:
 *   "xml":        { summary: string, project: { Tracks: TrackChange[] } }
 *   "structural": { ok: true, changes: AlsChange[] }
 *   "combined":   { xml: {...}, structural: {...} }
 *
 * See the AlsChange type in apps/desktop/src/types/index.ts for the
 * exact shape of AlsChange.
 */
export interface AlsDiffData {
    id: string;
    commit_sha: string;
    before_sha: string | null;
    /** "xml" | "structural" | "combined" — controls which renderer to use */
    diff_type: string;
    /** Human-readable summary for quick display */
    diff_summary: string | null;
    /** Raw diff payload — branch on diff_type in the component */
    diff_data: Record<string, unknown>;
    created_at: string;
}


// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetches paginated commit history for a repository.
 *
 * @param owner   - Supabase user UUID (owner of the repo)
 * @param repo    - Gitea repository slug
 * @param page    - Page number, 1-indexed (default 1)
 * @param limit   - Commits per page (default 20, max 100)
 *
 * IMPLEMENTATION NOTES:
 * - On the repo detail page, call this once on mount (page=1, limit=20).
 * - For "Load More", increment page and append to existing list (do not replace).
 * - The `total` field lets you show "Showing 20 of 47 commits" and decide
 *   whether to render the Load More button.
 * - On error, log and show a toast — don't crash the entire page.
 */
export async function getCommits(
    owner: string,
    repo: string,
    page: number = 1,
    limit: number = 20,
): Promise<ApiResponse<CommitListResponse>> {
    // TODO: implement
    // const result = await authFetch<CommitListResponse>(
    //     `/repos/${owner}/${repo}/commits?page=${page}&limit=${limit}`
    // );
    // if (!result.success) return { success: false, error: result.error };
    // return { success: true, data: result.data! };
    throw new Error("getCommits not yet implemented");
}

/**
 * Fetches full metadata for a single commit by SHA.
 *
 * @param owner - Supabase user UUID
 * @param repo  - Gitea repository slug
 * @param sha   - Full or short (8+ char) git SHA
 *
 * IMPLEMENTATION NOTES:
 * - Call this when the user clicks a commit row to expand its detail panel.
 * - `files_added`, `files_modified`, `files_removed` are already in CommitSummary
 *   from the list endpoint, so you may not need this unless you want to lazy-load
 *   file lists (optimization for large repos with many files per commit).
 * - If you keep full file lists in the list response (the current plan), this
 *   endpoint becomes only needed for future features (e.g., per-file blame).
 *
 * DESIGN DECISION — is this endpoint necessary for MVP?
 *   OPTION 1: Skip it for MVP, use file list from getCommits() result.
 *   OPTION 2: Keep it for future diff expansion from a commit detail page.
 *   RECOMMENDATION: Keep the function stub but don't call it in the initial
 *   implementation — only wire it up when you build a dedicated commit detail page.
 */
export async function getCommitDetail(
    owner: string,
    repo: string,
    sha: string,
): Promise<ApiResponse<{ commit: CommitSummary }>> {
    // TODO: implement
    // const result = await authFetch<{ commit: CommitSummary }>(
    //     `/repos/${owner}/${repo}/commits/${sha}`
    // );
    // if (!result.success) return { success: false, error: result.error };
    // return { success: true, data: result.data! };
    throw new Error("getCommitDetail not yet implemented");
}

/**
 * Fetches the ALS semantic diff for a specific commit SHA.
 *
 * @param owner - Supabase user UUID
 * @param repo  - Gitea repository slug
 * @param sha   - Full or short git SHA
 *
 * IMPORTANT: This returns `success: true` even when no diff exists.
 * Check `data` for null/undefined before rendering.
 * The backend returns { success: false, error: "No ALS diff found..." } as a
 * non-error response (not a 404), so authFetch will interpret it as success.
 *
 * Usage in component:
 *   const result = await getCommitDiff(owner, repo, sha);
 *   if (result.success && result.data?.diff) {
 *     // render diff
 *   } else {
 *     // show "No diff available for this commit"
 *   }
 *
 * IMPLEMENTATION NOTES:
 * - Call this lazily when the user clicks "View Diff" on a commit that has_diff=true.
 * - Cache the result in component state keyed by sha to avoid re-fetching.
 */
export async function getCommitDiff(
    owner: string,
    repo: string,
    sha: string,
): Promise<ApiResponse<{ diff: AlsDiffData | null }>> {
    // TODO: implement
    // const result = await authFetch<{ diff: AlsDiffData | null }>(
    //     `/repos/${owner}/${repo}/commits/${sha}/diff`
    // );
    // if (!result.success) return { success: false, error: result.error };
    // return { success: true, data: result.data! };
    throw new Error("getCommitDiff not yet implemented");
}
