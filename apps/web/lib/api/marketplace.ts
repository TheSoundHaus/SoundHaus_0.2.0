"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";

export interface CollabListing {
    id: string;
    buyer_id: string;
    title: string;
    budget_cents: number;
    currency: string;
    skills_wanted: string[];
    deadline_at: string | null;
    status: string;
    created_at: string | null;
}

export interface SampleListing {
    id: string;
    title: string;
    description: string | null;
    price_cents: number;
    currency: string;
    seller_id: string;
    duration_seconds: number | null;
    bpm: number | null;
    key_sig: string | null;
    tags: string[];
    purchase_count: number;
    preview_r2_object_key: string | null;
}

// ── Collaboration marketplace ────────────────────────────────────────────────

export async function listCollabListings(
    status: "open" | "in_progress" | "approved" = "open",
    limit = 20,
    offset = 0,
): Promise<ApiResponse<{ success: boolean; listings: CollabListing[] }>> {
    const qs = new URLSearchParams({ status, limit: String(limit), offset: String(offset) });
    return authFetch(`/marketplace/collab/listings?${qs.toString()}`);
}

export async function createCollabListing(body: {
    title: string;
    description_md: string;
    budget_cents: number;
    currency?: string;
    skills_wanted?: string[];
    deadline_at?: string;
}): Promise<ApiResponse<{ success: boolean; listing_id: string }>> {
    return authFetch("/marketplace/collab/listings", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function applyToListing(
    listingId: string,
    body: { cover_letter_md?: string; proposed_rate_cents?: number },
): Promise<ApiResponse<{ success: boolean; application_id: string; status: string }>> {
    return authFetch(`/marketplace/collab/listings/${listingId}/apply`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function acceptApplication(
    applicationId: string,
    amountCents: number,
): Promise<
    ApiResponse<{
        success: boolean;
        status: string;
        payment_intent_id: string;
        client_secret: string | null;
        amount_cents: number;
        platform_fee_cents: number;
    }>
> {
    return authFetch(`/marketplace/collab/applications/${applicationId}/accept`, {
        method: "POST",
        body: JSON.stringify({ amount_cents: amountCents }),
    });
}

export async function deliverApplication(
    applicationId: string,
    body: { delivery_repo_id: string; delivery_note_md?: string },
): Promise<ApiResponse<{ success: boolean; status: string }>> {
    return authFetch(`/marketplace/collab/applications/${applicationId}/deliver`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

export async function approveApplication(
    applicationId: string,
): Promise<ApiResponse<{ success: boolean; status: string; payment_intent_id: string | null }>> {
    return authFetch(`/marketplace/collab/applications/${applicationId}/approve`, {
        method: "POST",
    });
}

// ── Musician profile ─────────────────────────────────────────────────────────

export async function upsertMusicianProfile(body: {
    headline?: string;
    bio_md?: string;
    hourly_rate_cents?: number;
    skills?: string[];
    portfolio_repo_ids?: string[];
    accepting_work?: boolean;
}): Promise<
    ApiResponse<{
        success: boolean;
        profile: {
            user_id: string;
            headline: string | null;
            hourly_rate_cents: number | null;
            skills: string[];
            portfolio_repo_ids: string[];
            accepting_work: boolean;
            connect_onboarding_complete: boolean;
        };
    }>
> {
    return authFetch("/marketplace/musicians/me", {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

export async function startConnectOnboarding(): Promise<
    ApiResponse<{ success: boolean; url: string; account_id: string }>
> {
    return authFetch("/marketplace/musicians/connect/onboarding", { method: "POST" });
}

// ── Samples ──────────────────────────────────────────────────────────────────

export async function listSamples(
    tag?: string,
    limit = 20,
    offset = 0,
): Promise<ApiResponse<{ success: boolean; samples: SampleListing[] }>> {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (tag) qs.set("tag", tag);
    return authFetch(`/marketplace/samples?${qs.toString()}`);
}
