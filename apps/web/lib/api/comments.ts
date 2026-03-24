"use server";

import { authFetch } from "./client";
import type { ApiResponse, SnippetComment } from "../types/api";

// ── Types ───────────────────────────────────────────────────────────────────

interface CommentsListResponse {
  comments: SnippetComment[];
}

interface CreateCommentPayload {
  timestamp_seconds: number;
  comment_text: string;
}

// ── API calls ───────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a repo's audio snippet, sorted by timestamp.
 */
export async function getSnippetComments(
  owner: string,
  repo: string
): Promise<ApiResponse<SnippetComment[]>> {
  const res = await authFetch<CommentsListResponse>(
    `/repos/${owner}/${repo}/snippet/comments`
  );
  if (!res.success) return res;
  return { success: true, data: res.data.comments };
}

/**
 * Add a time-stamped comment to a repo's audio snippet.
 */
export async function addSnippetComment(
  owner: string,
  repo: string,
  payload: CreateCommentPayload
): Promise<ApiResponse<SnippetComment>> {
  return authFetch<SnippetComment>(
    `/repos/${owner}/${repo}/snippet/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Delete a snippet comment (only author or repo owner may delete).
 */
export async function deleteSnippetComment(
  owner: string,
  repo: string,
  commentId: string
): Promise<ApiResponse<{ detail: string }>> {
  return authFetch<{ detail: string }>(
    `/repos/${owner}/${repo}/snippet/comments/${commentId}`,
    { method: "DELETE" }
  );
}
