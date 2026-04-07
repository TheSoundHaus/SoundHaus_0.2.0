"use server";

import type {
  ApiResponse,
  StemJobStatusResponse,
  StemsLatestResponse,
  SnippetVersion,
} from "../types/api";
import { authFetch } from "./client";

/**
 * Start a stem generation job for a repo's snippet.
 */
export async function createStemJob(
  owner: string,
  repo: string,
  sourceSnippetUrl: string,
  commitSha?: string,
): Promise<ApiResponse<StemJobStatusResponse>> {
  return authFetch<StemJobStatusResponse>(
    `/repos/${owner}/${repo}/stems/jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_snippet_url: sourceSnippetUrl,
        commit_sha: commitSha ?? null,
      }),
    },
  );
}

/**
 * Poll a stem job's status.
 */
export async function getStemJobStatus(
  owner: string,
  repo: string,
  jobId: number,
): Promise<ApiResponse<StemJobStatusResponse>> {
  return authFetch<StemJobStatusResponse>(
    `/repos/${owner}/${repo}/stems/jobs/${jobId}`,
  );
}

/**
 * Get the latest confirmed stems for a repo.
 */
export async function getLatestStems(
  owner: string,
  repo: string,
): Promise<ApiResponse<StemsLatestResponse>> {
  return authFetch<StemsLatestResponse>(
    `/repos/${owner}/${repo}/stems/latest`,
  );
}

/**
 * Confirm a successful stem set as the "current" one.
 */
export async function confirmStemJob(
  owner: string,
  repo: string,
  jobId: number,
): Promise<ApiResponse<{ success: boolean; message: string }>> {
  return authFetch<{ success: boolean; message: string }>(
    `/repos/${owner}/${repo}/stems/jobs/${jobId}/confirm`,
    { method: "POST" },
  );
}

/**
 * Get all stem versions (history) for a repo.
 */
export async function getStemHistory(
  owner: string,
  repo: string,
): Promise<ApiResponse<SnippetVersion[]>> {
  return authFetch<SnippetVersion[]>(
    `/repos/${owner}/${repo}/stems/history`,
  );
}
