"use server";

import {
    createReviewSession,
    listReviewSessions,
    getReviewSession,
    approveReview,
    denyReview,
    annotateReview,
    promoteToProducer,
} from "@/lib/api/reviews";
import type { ReviewSessionData, ReviewAnnotationData, ReviewStatus } from "@/lib/api/reviews";

type ActionResult<T = void> =
    | { success: true; data?: T }
    | { success: false; error: string };

export async function createReviewAction(
    owner: string,
    repo: string,
    commitSha: string,
    branchName: string,
): Promise<ActionResult<{ review_id: string }>> {
    try {
        const result = await createReviewSession(owner, repo, commitSha, branchName);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, data: result.data };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to create review" };
    }
}

export async function listReviewsAction(
    owner: string,
    repo: string,
    status?: ReviewStatus,
): Promise<ActionResult<ReviewSessionData[]>> {
    try {
        const result = await listReviewSessions(owner, repo, status);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, data: result.data };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to list reviews" };
    }
}

export async function getReviewAction(
    owner: string,
    repo: string,
    reviewId: string,
): Promise<ActionResult<ReviewSessionData>> {
    try {
        const result = await getReviewSession(owner, repo, reviewId);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, data: result.data };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to get review" };
    }
}

export async function approveReviewAction(
    owner: string,
    repo: string,
    reviewId: string,
    notes?: string,
): Promise<ActionResult> {
    try {
        const result = await approveReview(owner, repo, reviewId, notes);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to approve review" };
    }
}

export async function denyReviewAction(
    owner: string,
    repo: string,
    reviewId: string,
    notes?: string,
): Promise<ActionResult> {
    try {
        const result = await denyReview(owner, repo, reviewId, notes);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to deny review" };
    }
}

export async function annotateReviewAction(
    owner: string,
    repo: string,
    reviewId: string,
    commentText: string,
    targetPath?: string,
): Promise<ActionResult<ReviewAnnotationData>> {
    try {
        const result = await annotateReview(owner, repo, reviewId, commentText, targetPath);
        if (!result.success) return { success: false, error: result.error };
        return { success: true, data: result.data };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to add annotation" };
    }
}

export async function promoteToProducerAction(
    owner: string,
    repo: string,
    email: string,
): Promise<ActionResult> {
    try {
        const result = await promoteToProducer(owner, repo, email);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Failed to promote" };
    }
}
