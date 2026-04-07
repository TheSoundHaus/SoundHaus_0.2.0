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
    // Synthetic fallback — create/collaborate events from repo metadata.
    // Real commit-based "push" events are added in getDashboardData().
    const activities: DashboardActivity[] = [];

    for (const repo of repos) {
        if (repo.created_at) {
            activities.push({
                type: "create",
                description: `Created project`,
                repoName: repo.name,
                repoOwner: repo.owner_id,
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

        // Fetch commit counts for the 5 most recently updated repos (in parallel)
        const recentRepos = [...repos]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 5);

        const commitResults = await Promise.all(
            recentRepos.map((repo) => {
                const parts = repo.full_name.split("/");
                const owner = parts[0] ?? "";
                const repoName = parts[1] ?? "";
                if (!owner || !repoName) return null;
                return getCommits(owner, repoName, 1, 5).catch(() => null);
            })
        );

        // Sum up total commits across recent repos and collect real push events
        let totalCommits = 0;
        const commitActivities: DashboardActivity[] = [];
        for (let i = 0; i < commitResults.length; i++) {
            const result = commitResults[i];
            if (result && result.success && result.data) {
                const resp = result.data as CommitListResponse;
                totalCommits += resp.total ?? 0;
                const repo = recentRepos[i];
                if (!repo) continue;
                for (const commit of (resp.commits ?? [])) {
                    if (commit.timestamp) {
                        commitActivities.push({
                            type: "push",
                            description: commit.message || "Pushed changes to",
                            repoName: repo.name,
                            repoOwner: repo.owner_id,
                            time: commit.timestamp,
                        });
                    }
                }
            }
        }

        // Count collaborations
        const collaborationCount = repos.filter((r) => r.role === "collaborator").length;

        // Sum stars across all owned repos
        const totalStars = repos
            .filter((r) => r.role === "owner")
            .reduce((sum, r) => sum + (r.stars_count ?? 0), 0);

        // Build activity feed: real commit events + synthetic create/collaborate
        const syntheticActivity = buildActivity(repos);
        const allActivity = [...commitActivities, ...syntheticActivity]
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
