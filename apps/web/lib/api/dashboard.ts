"use server";

/**
 * Dashboard API — aggregates data from existing endpoints
 * to power the main dashboard page with real user statistics.
 */

import type { EnrichedRepo, ApiResponse } from "../types/api";
import { getEnrichedRepos } from "./repos";
import { getPendingInvitations } from "./invitations";
import { authFetch } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
    projectCount: number;
    totalCommits: number;
    collaborationCount: number;
    totalStars: number;
}

export interface DashboardActivity {
    type: "push" | "create" | "collaborate";
    description: string;
    repoName: string;
    repoOwner: string;
    time: string; // ISO timestamp
}

export interface DashboardData {
    stats: DashboardStats;
    recentRepos: EnrichedRepo[];
    activity: DashboardActivity[];
    pendingInvitations: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildActivity(repos: EnrichedRepo[]): DashboardActivity[] {
    // Build activity from repo metadata — create/collaborate events.
    const activities: DashboardActivity[] = [];

    for (const repo of repos) {
        if (repo.created_at) {
            activities.push({
                type: "create",
                description: `Created project`,
                repoName: repo.name,
                repoOwner: repo.owner_username,
                time: repo.created_at,
            });
        }

        if (repo.role === "collaborator") {
            activities.push({
                type: "collaborate",
                description: `Collaborating on`,
                repoName: repo.name,
                repoOwner: repo.owner_username,
                time: repo.created_at,
            });
        }
    }

    return activities;
}

// ── Main API ──────────────────────────────────────────────────────────────────

/**
 * Fetches all dashboard data in parallel.
 * Aggregates repos, commit counts, and invitation data.
 */
export async function getDashboardData(): Promise<{
    success: boolean;
    data?: DashboardData;
    error?: string;
}> {
    try {
        // Fetch repos and invitations in parallel
        const [reposResult, invitationsResult] = await Promise.all([
            getEnrichedRepos(),
            getPendingInvitations(),
        ]);

        if (!reposResult.success) {
            return { success: false, error: reposResult.error };
        }

        const repos = reposResult.data ?? [];
        const pendingInvitations = invitationsResult.success
            ? (invitationsResult.data ?? []).length
            : 0;

        // Use total_commits from enriched repo data (maintained by webhook on each push)
        const totalCommits = repos.reduce((sum, r) => sum + (r.total_commits ?? 0), 0);

        // Get the 5 most recently updated repos for display
        const recentRepos = [...repos]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5);

        // Count collaborations
        const collaborationCount = repos.filter((r) => r.role === "collaborator").length;

        // Sum stars across all owned repos
        const totalStars = repos
            .filter((r) => r.role === "owner")
            .reduce((sum, r) => sum + (r.stars_count ?? 0), 0);

        // Build activity feed from repo metadata (create/collaborate events)
        const allActivity = buildActivity(repos)
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 15);

        return {
            success: true,
            data: {
                stats: {
                    projectCount: repos.length,
                    totalCommits,
                    collaborationCount,
                    totalStars,
                },
                recentRepos,
                activity: allActivity,
                pendingInvitations,
            },
        };
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : "Failed to load dashboard data",
        };
    }
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export interface HeatmapDay {
    date: string;   // "YYYY-MM-DD"
    count: number;
}

export async function getActivityHeatmap(): Promise<ApiResponse<HeatmapDay[]>> {
    const result = await authFetch<{ days: HeatmapDay[] }>("/api/dashboard/heatmap");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.days ?? [] };
}

// ── Snippet Feed ──────────────────────────────────────────────────────────────

export interface SnippetFeedItem {
    repo_id: string;
    repo_name: string;
    owner_id: string;
    owner_username: string;
    owner_avatar_url: string | null;
    audio_snippet: string;
    snippet_duration: number | null;
    thumbnail_url: string | null;
    thumbnail_type: string | null;
    last_activity_at: string | null;
    genres: string[];
}

export interface SnippetFeedResponse {
    snippets: SnippetFeedItem[];
    total: number;
    page: number;
    pages: number;
}

export async function getSnippetFeed(page = 1): Promise<ApiResponse<SnippetFeedResponse>> {
    const result = await authFetch<SnippetFeedResponse>(
        `/api/feed/snippets?page=${page}&limit=12`
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// ── Collaborations ────────────────────────────────────────────────────────────

export interface CollaborationItem {
    repo_id: string;
    repo_name: string;
    owner_username: string;
    unread_count: number;
    last_seen_at: string | null;
    last_push_at: string | null;
    thumbnail_url: string | null;
    thumbnail_type: string | null;
}

export async function getCollaborations(): Promise<ApiResponse<CollaborationItem[]>> {
    const result = await authFetch<{ collaborations: CollaborationItem[] }>(
        "/api/dashboard/collaborations"
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.collaborations ?? [] };
}

export async function markCollaborationSeen(
    owner: string,
    repo: string
): Promise<ApiResponse<void>> {
    const result = await authFetch<void>(
        `/api/dashboard/collaborations/${owner}/${repo}/seen`,
        { method: "POST" }
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: undefined };
}
