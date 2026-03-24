"use server";

/**
 * Commit and diff API calls for the Repository Detail page.
 */

import type { ApiResponse } from "../types/api";


// ── Types ─────────────────────────────────────────────────────────────────────

/** A single commit as returned by the commits endpoint. */
export interface CommitSummary {
    id: string;
    sha: string;
    short_sha: string;
    message: string;
    author_name: string;
    author_email: string | null;
    timestamp: string | null;
    files_added: string[];
    files_modified: string[];
    files_removed: string[];
    has_diff: boolean;
}

/** Paginated list response from GET /repos/{owner}/{repo}/commits. */
export interface CommitListResponse {
    repo: string;
    page: number;
    limit: number;
    total: number;
    commits: CommitSummary[];
}

/** ALS diff data returned by GET /repos/{owner}/{repo}/commits/{sha}/diff. */
export interface AlsDiffData {
    id: string;
    commit_sha: string;
    before_sha: string | null;
    diff_type: string;
    diff_summary: string | null;
    diff_data: Record<string, unknown>;
    created_at: string;
}


// ── API functions ─────────────────────────────────────────────────────────────

/** Fetches paginated commit history for a repository. */
export async function getCommits(
    _owner: string,
    _repo: string,
    _page: number = 1,
    _limit: number = 20,
): Promise<ApiResponse<CommitListResponse>> {
    const result = await authFetch<CommitListResponse>(
        `/repos/${owner}/${repo}/commits?page=${page}&limit=${limit}`
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data! };
}

/** Fetches full metadata for a single commit by SHA. */
export async function getCommitDetail(
    _owner: string,
    _repo: string,
    _sha: string,
): Promise<ApiResponse<{ commit: CommitSummary }>> {
    const result = await authFetch<{ commit: CommitSummary }>(
        `/repos/${owner}/${repo}/commits/${sha}`
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data! };
}

/** Fetches the ALS semantic diff for a specific commit SHA. */
export async function getCommitDiff(
    _owner: string,
    _repo: string,
    _sha: string,
): Promise<ApiResponse<{ diff: AlsDiffData | null }>> {
    const result = await authFetch<{ diff: AlsDiffData | null }>(
        `/repos/${owner}/${repo}/commits/${sha}/diff`
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data! };
}
