"use server";

/**
 * Dashboard API — aggregates data from existing endpoints
 * to power the main dashboard page with real user statistics.
 */

import type { EnrichedRepo } from "../types/api";
import type { CommitListResponse } from "./commits";
import { getEnrichedRepos } from "./repos";
import { getCommits } from "./commits";
import { getPendingInvitations } from "./invitations";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardStats {
    projectCount: number;
    totalCommits: number;
    collaborationCount: number;
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
    // Build activity feed from repo metadata (creation/update times)
    const activities: DashboardActivity[] = [];

    for (const repo of repos) {
        // Add "created project" activity
        if (repo.created_at) {
            activities.push({
                type: "create",
                description: `Created project`,
                repoName: repo.name,
                repoOwner: repo.owner_id,
                time: repo.created_at,
            });
        }

        // Add "updated project" activity if different from created
        if (repo.updated_at && repo.updated_at !== repo.created_at) {
            activities.push({
                type: "push",
                description: `Updated`,
                repoName: repo.name,
                repoOwner: repo.owner_id,
                time: repo.updated_at,
            });
        }

        // Mark collaborations
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

    // Sort by most recent first
    activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    // Return top 10
    return activities.slice(0, 10);
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

        // Fetch commit counts for the 5 most recently updated repos (in parallel)
        const recentRepos = [...repos]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5);

        const commitResults = await Promise.all(
            recentRepos.map((repo) => {
                const [owner, repoName] = repo.full_name.split("/");
                return getCommits(owner, repoName, 1, 1).catch(() => null);
            })
        );

        // Sum up total commits across recent repos
        let totalCommits = 0;
        for (const result of commitResults) {
            if (result && result.success && result.data) {
                totalCommits += (result.data as CommitListResponse).total ?? 0;
            }
        }

        // Count collaborations
        const collaborationCount = repos.filter((r) => r.role === "collaborator").length;

        // Build activity feed
        const activity = buildActivity(repos);

        return {
            success: true,
            data: {
                stats: {
                    projectCount: repos.length,
                    totalCommits,
                    collaborationCount,
                },
                recentRepos,
                activity,
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
