"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";

// ── Types ───────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "denied";

export interface ReviewAnnotationData {
    id: string;
    author_id: string;
    author_username: string;
    comment_text: string;
    target_path: string | null;
    created_at: string;
}

export interface ReviewSessionData {
    id: string;
    commit_sha: string;
    branch_name: string;
    artist_id: string;
    artist_username: string;
    status: ReviewStatus;
    reviewer_id: string | null;
    reviewer_username: string | null;
    reviewer_notes: string | null;
    created_at: string;
    reviewed_at: string | null;
    annotation_count?: number;
    annotations?: ReviewAnnotationData[];
}

// ── API functions ───────────────────────────────────────────────────────────

// POST /repos/{owner}/{repo}/reviews — create a review session
export async function createReviewSession(
    owner: string,
    repo: string,
    commitSha: string,
    branchName: string,
): Promise<ApiResponse<{ review_id: string; status: string; created_at: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    return authFetch(`/repos/${o}/${r}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit_sha: commitSha, branch_name: branchName }),
    });
}

// GET /repos/{owner}/{repo}/reviews — list review sessions
export async function listReviewSessions(
    owner: string,
    repo: string,
    status?: ReviewStatus,
): Promise<ApiResponse<ReviewSessionData[]>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    const qs = status ? `?status=${status}` : "";
    const result = await authFetch<{ reviews: ReviewSessionData[] }>(
        `/repos/${o}/${r}/reviews${qs}`,
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.reviews ?? [] };
}

// GET /repos/{owner}/{repo}/reviews/{reviewId} — get review detail
export async function getReviewSession(
    owner: string,
    repo: string,
    reviewId: string,
): Promise<ApiResponse<ReviewSessionData>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    const result = await authFetch<{ review: ReviewSessionData }>(
        `/repos/${o}/${r}/reviews/${reviewId}`,
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.review };
}

// POST /repos/{owner}/{repo}/reviews/{reviewId}/approve
export async function approveReview(
    owner: string,
    repo: string,
    reviewId: string,
    notes?: string,
): Promise<ApiResponse<{ message: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    return authFetch(`/repos/${o}/${r}/reviews/${reviewId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes ?? null }),
    });
}

// POST /repos/{owner}/{repo}/reviews/{reviewId}/deny
export async function denyReview(
    owner: string,
    repo: string,
    reviewId: string,
    notes?: string,
): Promise<ApiResponse<{ message: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    return authFetch(`/repos/${o}/${r}/reviews/${reviewId}/deny`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes ?? null }),
    });
}

// POST /repos/{owner}/{repo}/reviews/{reviewId}/annotate
export async function annotateReview(
    owner: string,
    repo: string,
    reviewId: string,
    commentText: string,
    targetPath?: string,
): Promise<ApiResponse<ReviewAnnotationData>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    const result = await authFetch<{ annotation: ReviewAnnotationData }>(
        `/repos/${o}/${r}/reviews/${reviewId}/annotate`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                comment_text: commentText,
                target_path: targetPath ?? null,
            }),
        },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.annotation };
}

// POST /repos/{owner}/{repo}/collaborators/promote
export async function promoteToProducer(
    owner: string,
    repo: string,
    email: string,
): Promise<ApiResponse<{ message: string }>> {
    const o = encodeURIComponent(owner);
    const r = encodeURIComponent(repo);
    return authFetch(`/repos/${o}/${r}/collaborators/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
}
