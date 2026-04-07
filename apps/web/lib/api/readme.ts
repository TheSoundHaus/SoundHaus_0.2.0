"use server";

import { authFetch } from "./client";
import type { ApiResponse } from "../types/api";

// ── Types ───────────────────────────────────────────────────────────────────

interface ReadmeResponse {
  readme_content: string;
}

// ── API calls ───────────────────────────────────────────────────────────────

/**
 * Fetch the README markdown content for a repository.
 */
export async function getReadme(
  owner: string,
  repo: string
): Promise<ApiResponse<string>> {
  const res = await authFetch<ReadmeResponse>(
    `/repos/${owner}/${repo}/readme`
  );
  if (!res.success) return res;
  return { success: true, data: res.data.readme_content };
}

/**
 * Update the README markdown content for a repository.
 */
export async function updateReadme(
  owner: string,
  repo: string,
  content: string
): Promise<ApiResponse<string>> {
  const res = await authFetch<ReadmeResponse>(
    `/repos/${owner}/${repo}/readme`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readme_content: content }),
    }
  );
  if (!res.success) return res;
  return { success: true, data: res.data.readme_content };
}
