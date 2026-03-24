"use server";

import type { ApiResponse } from "../types/api";
import { authFetch } from "./client";
import { getAccessToken } from "../utils/auth";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserProfile {
    id: string;
    email: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string | null;
    updated_at: string | null;
}

// ─── GET /api/auth/profile ──────────────────────────────────────────────────

export async function getProfile(): Promise<ApiResponse<UserProfile>> {
    const result = await authFetch<{ profile: UserProfile }>("/api/auth/profile");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data!.profile };
}

// ─── PUT /api/auth/profile ──────────────────────────────────────────────────

export async function updateProfile(
    updates: { display_name?: string; bio?: string }
): Promise<ApiResponse<UserProfile>> {
    const result = await authFetch<{ profile: UserProfile }>("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(updates),
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data!.profile };
}

// ─── POST /api/auth/profile/avatar ──────────────────────────────────────────

export async function uploadAvatar(formData: FormData): Promise<ApiResponse<{ avatar_url: string }>> {
    const token = await getAccessToken();
    const API_BASE_URL = process.env.API_URL || "http://localhost:8000";

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/profile/avatar`, {
            method: "POST",
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                // Do NOT set Content-Type — let the browser set multipart boundary
            },
            body: formData,
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                errorMessage = body.detail ?? errorMessage;
            } catch {
                errorMessage = response.statusText || errorMessage;
            }
            return { success: false, error: errorMessage };
        }

        const data = await response.json();
        return { success: true, data: { avatar_url: data.avatar_url } };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Upload failed" };
    }
}

// ─── DELETE /api/auth/profile/avatar ────────────────────────────────────────

export async function deleteAvatar(): Promise<ApiResponse<null>> {
    const result = await authFetch<{ success: boolean }>("/api/auth/profile/avatar", {
        method: "DELETE",
    });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: null };
}
