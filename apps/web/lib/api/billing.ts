"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";

export type Tier = "free" | "pro" | "team";

export interface SubscriptionStatus {
    success: boolean;
    tier: Tier;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
}

export interface StorageUsageInfo {
    success: boolean;
    tier: Tier;
    bytes_used: number;
    quota_bytes: number;
    within_quota: boolean;
    quotas: Record<Tier, { storage_bytes: number; private_repos: number; classroom_seats: number }>;
}

export async function getSubscription(): Promise<ApiResponse<SubscriptionStatus>> {
    return authFetch<SubscriptionStatus>("/billing/subscription");
}

export async function getStorageUsage(): Promise<ApiResponse<StorageUsageInfo>> {
    return authFetch<StorageUsageInfo>("/billing/storage");
}

export async function createCheckoutSession(tier: "pro" | "team"): Promise<ApiResponse<{ url: string }>> {
    return authFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ tier }),
    });
}

export async function openCustomerPortal(): Promise<ApiResponse<{ url: string }>> {
    return authFetch<{ url: string }>("/billing/portal", { method: "POST" });
}
