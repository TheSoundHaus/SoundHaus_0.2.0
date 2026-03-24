"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    GitBranch,
    Music,
    Users,
    FolderGit2,
    Compass,
    Settings,
    Mail,
    Clock,
    Plus,
    GitCommit,
} from "lucide-react";
import { useUser } from "@/lib/context/UserContext";
import { getDashboardData } from "@/lib/api/dashboard";
import type { DashboardData, DashboardActivity } from "@/lib/api/dashboard";

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const seconds = Math.floor((now - then) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

function activityIcon(type: DashboardActivity["type"]) {
    switch (type) {
        case "push":
            return "bg-emerald-500";
        case "create":
            return "bg-glass-blue-500";
        case "collaborate":
            return "bg-amber-500";
        default:
            return "bg-zinc-500";
    }
}

// ── Skeleton Components ────────────────────────────────────────────────────

function StatSkeleton() {
    return (
        <div className="rounded-xl border border-zinc-800 p-6 bg-zinc-900/50 animate-pulse">
            <div className="w-5 h-5 rounded bg-zinc-800 mb-3" />
            <div className="h-8 w-16 rounded bg-zinc-800 mb-1" />
            <div className="h-4 w-20 rounded bg-zinc-800" />
        </div>
    );
}

function ActivitySkeleton() {
    return (
        <div className="flex items-start gap-3 px-3 py-3 animate-pulse">
            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-700" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-zinc-800" />
                <div className="h-3 w-20 rounded bg-zinc-800" />
            </div>
        </div>
    );
}

function ProjectSkeleton() {
    return (
        <div className="px-3 py-2.5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-zinc-800" />
                <div className="h-3 w-12 rounded bg-zinc-800" />
            </div>
            <div className="mt-1 h-3 w-20 rounded bg-zinc-800" />
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────

/**
 * Dashboard Page - Main authenticated home page
 * Fetches real data from enriched repos, commits, and invitations.
 */
export default function DashboardPage() {
    const { user } = useUser();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            const result = await getDashboardData();
            if (cancelled) return;
            if (result.success && result.data) {
                setData(result.data);
                setError(null);
            } else {
                setError(result.error ?? "Failed to load dashboard");
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, []);

    const greeting = user?.display_name
        ? `Welcome back, ${user.display_name}`
        : "Welcome back to SoundHaus";

    const stats = data?.stats;
    const activity = data?.activity ?? [];
    const recentRepos = data?.recentRepos ?? [];
    const pendingInvitations = data?.pendingInvitations ?? 0;

    return (
        <div className="mx-auto max-w-7xl px-6 py-12">
            {/* Welcome Header */}
            <div className="mb-10">
                <h1 className="mb-2 text-4xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-lg text-zinc-400">{greeting}</p>
            </div>

            {error && (
                <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Main Content - Stats + Activity */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Quick Stats */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        {loading ? (
                            <>
                                <StatSkeleton />
                                <StatSkeleton />
                                <StatSkeleton />
                            </>
                        ) : (
                            [
                                { icon: FolderGit2, value: stats?.projectCount ?? 0, label: "Projects", color: "text-glass-blue-400" },
                                { icon: GitBranch, value: stats?.totalCommits ?? 0, label: "Commits", color: "text-emerald-400" },
                                { icon: Users, value: stats?.collaborationCount ?? 0, label: "Collaborations", color: "text-amber-400" },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="group rounded-xl border border-zinc-800 p-6 bg-zinc-900/50 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900/80"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <stat.icon className={`w-5 h-5 ${stat.color} opacity-70`} />
                                    </div>
                                    <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                                    <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pending Invitations Banner */}
                    {!loading && pendingInvitations > 0 && (
                        <Link
                            href="/settings"
                            className="flex items-center gap-3 rounded-xl border border-amber-700/40 bg-amber-900/15 px-5 py-4 transition-colors hover:border-amber-600/50 hover:bg-amber-900/25"
                        >
                            <Mail className="w-5 h-5 text-amber-400" />
                            <span className="text-sm text-amber-300">
                                You have <strong>{pendingInvitations}</strong> pending collaboration
                                {pendingInvitations > 1 ? "s" : ""} invitation{pendingInvitations > 1 ? "s" : ""}
                            </span>
                        </Link>
                    )}

                    {/* Recent Activity Feed */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                        <h2 className="mb-5 text-xl font-semibold flex items-center gap-2">
                            <Music className="w-5 h-5 text-glass-blue-400 opacity-70" />
                            Recent Activity
                        </h2>
                        <div className="space-y-1">
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <ActivitySkeleton key={i} />
                                ))
                            ) : activity.length === 0 ? (
                                <div className="flex flex-col items-center gap-3 py-8 text-center">
                                    <Clock className="w-8 h-8 text-zinc-600" />
                                    <p className="text-sm text-zinc-500">No activity yet. Create your first project!</p>
                                    <Link
                                        href="/repositories"
                                        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-glass-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-glass-blue-500"
                                    >
                                        <Plus className="w-4 h-4" /> New Project
                                    </Link>
                                </div>
                            ) : (
                                activity.map((item, i) => (
                                    <div
                                        key={`${item.repoName}-${item.type}-${i}`}
                                        className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-zinc-800/40"
                                    >
                                        <div className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${activityIcon(item.type)}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm">
                                                <span className="text-zinc-300">{item.description} </span>
                                                <Link
                                                    href={`/repository/${item.repoOwner}/${item.repoName}`}
                                                    className="font-semibold text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                                                >
                                                    {item.repoName}
                                                </Link>
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-0.5">
                                                {timeAgo(item.time)}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar - Quick Actions + Projects */}
                <div className="space-y-6">
                    {/* Quick Actions Card */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                        <h3 className="mb-4 text-lg font-semibold">Quick Actions</h3>
                        <div className="space-y-2">
                            {[
                                { href: "/repositories", label: "Browse Projects", icon: FolderGit2 },
                                { href: "/explore", label: "Explore Projects", icon: Compass },
                                { href: "/settings", label: "Settings", icon: Settings },
                            ].map((action) => (
                                <Link
                                    key={action.href}
                                    href={action.href}
                                    className="flex items-center gap-3 rounded-lg border border-zinc-800 px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-500/30 hover:bg-zinc-800/50 hover:text-glass-blue-400 group"
                                >
                                    <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-glass-blue-400 transition-colors" />
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Your Projects */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-lg font-semibold">Your Projects</h3>
                            <Link
                                href="/repositories"
                                className="text-xs text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                            >
                                View all
                            </Link>
                        </div>
                        <div className="space-y-1">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <ProjectSkeleton key={i} />
                                ))
                            ) : recentRepos.length === 0 ? (
                                <p className="text-sm text-zinc-500 py-4 text-center">
                                    No projects yet
                                </p>
                            ) : (
                                recentRepos.slice(0, 5).map((repo) => (
                                    <Link
                                        key={repo.full_name}
                                        href={`/repository/${repo.full_name}`}
                                        className="block group rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-800/40"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium group-hover:text-glass-blue-400 transition-colors truncate">
                                                {repo.name}
                                            </span>
                                            <span className="text-xs text-zinc-600 shrink-0 ml-2">
                                                {repo.private ? "Private" : "Public"}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                                            <span>{timeAgo(repo.updated_at)}</span>
                                            {repo.genres.length > 0 && (
                                                <span className="truncate">{repo.genres.slice(0, 2).join(", ")}</span>
                                            )}
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
