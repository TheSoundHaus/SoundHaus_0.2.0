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
    Star,
} from "lucide-react";
import { useUser } from "@/lib/context/UserContext";
import { getDashboardData } from "@/lib/api/dashboard";
import type { DashboardData, DashboardActivity } from "@/lib/api/dashboard";
import WaveformSpinner from "@/components/WaveformSpinner";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import SnippetFeed from "@/components/SnippetFeed";
import CollaborationPanel from "@/components/CollaborationPanel";

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

    const greeting = user?.username
        ? `Welcome back, ${user.username}`
        : "Welcome back to SoundHaus";

    const stats = data?.stats;
    const activity = data?.activity ?? [];
    const recentRepos = data?.recentRepos ?? [];
    const pendingInvitations = data?.pendingInvitations ?? 0;

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <WaveformSpinner size="lg" bars={7} label="Loading your dashboard..." />
            </div>
        );
    }

    return (
        <div className="relative mx-auto max-w-7xl px-6 py-12">
            {/* Welcome Header */}
            <div className="mb-10 animate-fade-in-up">
                <h1 className="mb-2 text-4xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-lg text-zinc-400">{greeting}</p>
            </div>

            {error && (
                <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
                    {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2 space-y-6">
                    {/* Quick Stats */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                                { icon: FolderGit2, value: stats?.projectCount ?? 0, label: "Projects", color: "text-glass-blue-400" },
                                { icon: GitBranch, value: stats?.totalCommits ?? 0, label: "Commits", color: "text-emerald-400" },
                                { icon: Users, value: stats?.collaborationCount ?? 0, label: "Collaborations", color: "text-amber-400" },
                                { icon: Star, value: stats?.totalStars ?? 0, label: "Stars Received", color: "text-yellow-400" },
                            ].map((stat, i) => (
                                <div
                                    key={stat.label}
                                    className={`glass-card group rounded-xl p-6 transition-all duration-300 hover:border-glass-blue-500/40 hover:shadow-[0_0_20px_rgba(167,199,231,0.12)] animate-fade-in-up delay-${(i + 1) * 100}`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <stat.icon className={`w-5 h-5 ${stat.color} opacity-70`} />
                                    </div>
                                    <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                                    <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
                                </div>
                            ))}
                    </div>

                    {/* Activity Heatmap */}
                    <ActivityHeatmap />

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
                    <div className="glass-card rounded-xl p-6 animate-fade-in-up delay-300">
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
                                    <p className="text-sm text-zinc-500">No activity yet. Push a project from the desktop app to get started!</p>
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
                                                {item.type === "push" ? (
                                                    <>
                                                        <span className="text-zinc-300 line-clamp-1">{item.description} </span>
                                                        <Link
                                                            href={`/repository/${item.repoOwner}/${item.repoName}`}
                                                            className="font-semibold text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                                                        >
                                                            {item.repoName}
                                                        </Link>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-zinc-300">{item.description} </span>
                                                        <Link
                                                            href={`/repository/${item.repoOwner}/${item.repoName}`}
                                                            className="font-semibold text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                                                        >
                                                            {item.repoName}
                                                        </Link>
                                                    </>
                                                )}
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

                    {/* Snippet Discovery Feed */}
                    <SnippetFeed />
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="glass-card rounded-xl p-6 animate-fade-in-up delay-200">
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
                                    className="glass-btn flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium group"
                                >
                                    <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-glass-blue-400 transition-colors" />
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Collaboration Panel */}
                    <CollaborationPanel />

                    <div className="glass-card rounded-xl p-6 animate-fade-in-up delay-300">
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
