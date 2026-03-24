"use server";

/**
 * Commit and diff API calls for the Repository Detail page.
 */

import { authFetch } from "./client";
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
    owner: string,
    repo: string,
    page: number = 1,
    limit: number = 20,
): Promise<ApiResponse<CommitListResponse>> {
    // TODO: implement
    throw new Error("getCommits not yet implemented");
}

/** Fetches full metadata for a single commit by SHA. */
export async function getCommitDetail(
    owner: string,
    repo: string,
    sha: string,
): Promise<ApiResponse<{ commit: CommitSummary }>> {
    // TODO: implement
    throw new Error("getCommitDetail not yet implemented");
}

/** Fetches the ALS semantic diff for a specific commit SHA. */
export async function getCommitDiff(
    owner: string,
    repo: string,
    sha: string,
): Promise<ApiResponse<{ diff: AlsDiffData | null }>> {
    // TODO: implement
    throw new Error("getCommitDiff not yet implemented");
}
