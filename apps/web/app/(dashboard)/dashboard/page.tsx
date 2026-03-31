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
    AudioLines,
    Waves,
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
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-6 animate-pulse">
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
            {/* Radial glow behind header */}
            <div
                className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[800px] h-[400px]"
                style={{ background: "radial-gradient(ellipse 50% 60% at 50% 0%, rgba(167, 199, 231, 0.04) 0%, transparent 70%)" }}
                aria-hidden
            />

            {/* Welcome Header */}
            <div className="relative mb-12 text-center">
                <div className="inline-flex items-center gap-2 mb-4">
                    <Waves className="w-5 h-5 text-glass-blue-400" />
                    <p className="text-xs font-medium tracking-[0.25em] uppercase text-glass-blue-400">Dashboard</p>
                </div>
                <h1 className="mb-3 text-4xl md:text-5xl font-bold tracking-tight">{greeting}</h1>
                <p className="text-zinc-500 text-base font-light">Your studio at a glance.</p>
                <div className="mt-6 h-px bg-gradient-to-r from-transparent via-glass-blue-400/20 to-transparent" />
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-red-800/40 bg-red-900/15 px-5 py-4 text-sm text-red-400">
                    {error}
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Main Content - Stats + Activity */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Quick Stats */}
                    <div className="grid gap-5 sm:grid-cols-3">
                        {loading ? (
                            <><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
                        ) : (
                            [
                                { icon: FolderGit2, value: stats?.projectCount ?? 0, label: "Projects", color: "text-glass-blue-400", glowColor: "167, 199, 231" },
                                { icon: GitBranch, value: stats?.totalCommits ?? 0, label: "Commits", color: "text-emerald-400", glowColor: "52, 211, 153" },
                                { icon: Users, value: stats?.collaborationCount ?? 0, label: "Collaborations", color: "text-amber-400", glowColor: "251, 191, 36" },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="group relative rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-6 transition-all duration-500 hover:border-white/[0.12] hover:bg-zinc-900/80"
                                >
                                    <div
                                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                        style={{ boxShadow: `0 0 60px rgba(${stat.glowColor}, 0.06)` }}
                                    />
                                    <div className="relative">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                                                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                            </div>
                                        </div>
                                        <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                                        <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Pending Invitations Banner */}
                    {!loading && pendingInvitations > 0 && (
                        <Link
                            href="/settings"
                            className="flex items-center gap-3 rounded-xl border border-amber-700/30 bg-amber-900/10 px-5 py-4 transition-colors hover:border-amber-600/40 hover:bg-amber-900/20"
                        >
                            <Mail className="w-5 h-5 text-amber-400" />
                            <span className="text-sm text-amber-300">
                                You have <strong>{pendingInvitations}</strong> pending collaboration
                                {pendingInvitations > 1 ? "s" : ""} invitation{pendingInvitations > 1 ? "s" : ""}
                            </span>
                        </Link>
                    )}

                    {/* Recent Activity Feed */}
                    <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-6 transition-all duration-500 hover:border-white/[0.10]" style={{ boxShadow: "0 0 80px rgba(167, 199, 231, 0.02)" }}>
                        <h2 className="mb-5 text-xl font-semibold flex items-center gap-2">
                            <AudioLines className="w-5 h-5 text-glass-blue-400 opacity-70" />
                            Recent Activity
                        </h2>
                        <div className="space-y-1">
                            {loading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <ActivitySkeleton key={i} />
                                ))
                            ) : activity.length === 0 ? (
                                <div className="flex flex-col items-center gap-4 py-10 text-center">
                                    <div className="w-14 h-14 rounded-full bg-zinc-900 border border-white/[0.06] flex items-center justify-center" style={{ boxShadow: "0 0 30px rgba(167, 199, 231, 0.04)" }}>
                                        <Clock className="w-6 h-6 text-zinc-600" />
                                    </div>
                                    <p className="text-sm text-zinc-500">No activity yet. Create your first project!</p>
                                    <Link
                                        href="/repositories"
                                        className="inline-flex items-center gap-1.5 bg-white text-zinc-900 font-semibold rounded-full px-6 py-2.5 text-sm transition-all duration-300 hover:bg-glass-blue-400 hover:shadow-[0_0_30px_rgba(167,199,231,0.3)] no-underline"
                                    >
                                        <Plus className="w-4 h-4" /> New Project
                                    </Link>
                                </div>
                            ) : (
                                activity.map((item, i) => (
                                    <div
                                        key={`${item.repoName}-${item.type}-${i}`}
                                        className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-white/[0.02]"
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
                                            <div className="text-xs text-zinc-600 mt-0.5">
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
                <div className="space-y-8">
                    {/* Quick Actions Card */}
                    <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-6 transition-all duration-500 hover:border-white/[0.10]">
                        <h3 className="mb-5 text-lg font-semibold flex items-center gap-2">
                            <Music className="w-4 h-4 text-glass-blue-400 opacity-70" />
                            Quick Actions
                        </h3>
                        <div className="space-y-2">
                            {[
                                { href: "/repositories", label: "Browse Projects", icon: FolderGit2 },
                                { href: "/explore", label: "Explore Projects", icon: Compass },
                                { href: "/settings", label: "Settings", icon: Settings },
                            ].map((action) => (
                                <Link
                                    key={action.href}
                                    href={action.href}
                                    className="flex items-center gap-3 rounded-xl border border-white/[0.04] px-4 py-3 text-sm font-medium transition-all duration-300 hover:border-glass-blue-400/20 hover:bg-white/[0.02] hover:text-glass-blue-400 group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                                        <action.icon className="w-4 h-4 text-zinc-500 group-hover:text-glass-blue-400 transition-colors" />
                                    </div>
                                    {action.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Your Projects */}
                    <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-6 transition-all duration-500 hover:border-white/[0.10]">
                        <div className="mb-5 flex items-center justify-between">
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
                                <p className="text-sm text-zinc-500 py-6 text-center">
                                    No projects yet
                                </p>
                            ) : (
                                recentRepos.slice(0, 5).map((repo) => (
                                    <Link
                                        key={repo.full_name}
                                        href={`/repository/${repo.full_name}`}
                                        className="block group rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium group-hover:text-glass-blue-400 transition-colors truncate">
                                                {repo.name}
                                            </span>
                                            <span className="text-[10px] text-zinc-600 shrink-0 ml-2 rounded-full border border-white/[0.06] px-2 py-0.5">
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
