"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    is_public: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface PublicProfile {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    created_at: string | null;
}

// ─── GET /api/auth/profile ──────────────────────────────────────────────────

export async function getProfile(): Promise<ApiResponse<UserProfile>> {
    const result = await authFetch<{ profile: UserProfile }>("/api/auth/profile");
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.profile) return { success: false, error: "Empty profile response" };
    return { success: true, data: result.data.profile };
}

// ─── PUT /api/auth/profile ──────────────────────────────────────────────────

export async function updateProfile(
    updates: { display_name?: string; bio?: string; is_public?: boolean }
): Promise<ApiResponse<UserProfile>> {
    const result = await authFetch<{ profile: UserProfile }>("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(updates),
    });
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.profile) return { success: false, error: "Empty profile response" };
    return { success: true, data: result.data.profile };
}

// ─── POST /api/auth/profile/avatar ──────────────────────────────────────────

export async function uploadAvatar(formData: FormData): Promise<ApiResponse<{ avatar_url: string }>> {
    const result = await authFetch<{ avatar_url: string }>("/api/auth/profile/avatar", {
        method: "POST",
        body: formData,
        // Do NOT set Content-Type — authFetch skips it for FormData
    });
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.avatar_url) return { success: false, error: "No avatar URL returned" };
    return { success: true, data: { avatar_url: result.data.avatar_url } };
}

// ─── DELETE /api/auth/profile/avatar ────────────────────────────────────────

export async function deleteAvatar(): Promise<ApiResponse<null>> {
    const result = await authFetch<{ success: boolean }>("/api/auth/profile/avatar", {
        method: "DELETE",
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: null };
}

// ─── GET /api/auth/profile/{username}/public ────────────────────────────────

export async function getPublicProfile(username: string): Promise<ApiResponse<PublicProfile>> {
    const baseUrl = process.env.API_URL || "http://localhost:8000";
    try {
        const res = await fetch(`${baseUrl}/api/auth/profile/${encodeURIComponent(username)}/public`, {
            cache: "no-store",
        });
        if (!res.ok) {
            let errorMessage = `HTTP ${res.status}`;
            try {
                const body = await res.json();
                errorMessage = body.detail ?? errorMessage;
            } catch {
                errorMessage = res.statusText || errorMessage;
            }
            return { success: false, error: errorMessage };
        }
        const data = await res.json();
        return { success: true, data: data.profile };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Network error" };
    }
}

// ─── GET /api/auth/profile/stats ────────────────────────────────────────────

export interface UserStats {
    total_repos: number;
    total_commits: number;
    total_clones_received: number;
    collaborations: number;
    total_size_kb: number;
}

export async function getUserStats(): Promise<ApiResponse<UserStats>> {
    const result = await authFetch<{ stats: UserStats }>("/api/auth/profile/stats");
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.stats) return { success: false, error: "Empty stats response" };
    return { success: true, data: result.data.stats };
}
