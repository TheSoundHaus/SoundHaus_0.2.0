"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/lib/context/UserContext";
import { getPublicRepos } from "@/lib/api/repos";
import type { PublicRepo } from "@/lib/types/api";
import { Compass, TrendingUp, AudioLines, Music } from "lucide-react";
import {
    extractYouTubeVideoId,
    youtubeThumbnailHq,
} from "@/lib/utils/youtube";

import WaveformSpinner from "@/components/WaveformSpinner";
import AudioPlayer from "@/components/AudioPlayer";

/** Filter out raw UUIDs that legacy users have as their Gitea username */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ownerLabel(username?: string | null, fallback?: string | null): string {
    for (const v of [username, fallback]) {
        if (v && !UUID_RE.test(v)) return v;
    }
    return 'SoundHaus User';
}

export default function ExplorePage() {
    const { user, loading } = useUser();
    const [sortBy, setSortBy] = useState<"top" | "recent" | "trending">("top");
    const [searchQuery, setSearchQuery] = useState("");
    const [repos, setRepos] = useState<PublicRepo[]>([]);
    const [reposLoading, setReposLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

    // Collect all unique genres from loaded repos for the filter pills
    const allGenres = useMemo(() => {
        const set = new Set<string>();
        repos.forEach((r) => r.genres?.forEach((g) => set.add(g)));
        return Array.from(set).sort();
    }, [repos]);

    useEffect(() => {
        let cancelled = false;
        async function fetchRepos() {
            setReposLoading(true);
            setError(null);
            const result = await getPublicRepos();
            if (cancelled) return;
            if (result.success) {
                setRepos(result.data);
            } else {
                setError(result.error);
            }
            setReposLoading(false);
        }
        fetchRepos();
        return () => { cancelled = true; };
    }, []);

    const filteredAndSortedRepos = useMemo(() => {
        let filtered = repos;

        // Genre tag filter
        if (selectedGenres.length > 0) {
            filtered = filtered.filter((repo) =>
                selectedGenres.every((g) => repo.genres?.includes(g))
            );
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter((repo) => {
                const un = (repo.owner_username || "").toLowerCase();
                return (
                    repo.repo_name.toLowerCase().includes(query) ||
                    repo.owner.toLowerCase().includes(query) ||
                    un.includes(query)
                );
            });
        }
        const sorted = [...filtered];
        switch (sortBy) {
            case "top":
                sorted.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
                break;
            case "recent":
                sorted.sort(
                    (a, b) =>
                        new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
                );
                break;
            case "trending":
                sorted.sort((a, b) => {
                    const aScore =
                        (a.stars ?? 0) *
                        (1 + 1 / (Date.now() - new Date(a.updated_at ?? 0).getTime()));
                    const bScore =
                        (b.stars ?? 0) *
                        (1 + 1 / (Date.now() - new Date(b.updated_at ?? 0).getTime()));
                    return bScore - aScore;
                });
                break;
        }
        return sorted;
    }, [repos, sortBy, searchQuery, selectedGenres]);

    const trendingRepos = useMemo(() => {
        return [...repos]
            .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
            .slice(0, 5);
    }, [repos]);

    const formatRelativeTime = (isoString: string): string => {
        const now = new Date();
        const date = new Date(isoString);
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "today";
        if (diffDays === 1) return "yesterday";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    };

    return (
        <div className="relative mx-auto max-w-[1400px] px-6 py-12">
            {/* Page Header */}
            <div className="mb-10 animate-fade-in-up">
                <h1 className="mb-2 text-4xl font-bold tracking-tight">
                    Explore
                </h1>
                <p className="text-lg text-zinc-400">
                    Discover public Ableton projects from the community
                </p>
            </div>

            {/* Three-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-[20%_1fr_20%] lg:grid-cols-[22%_1fr_22%] gap-8">

                {/* LEFT SIDEBAR: Profile Card */}
                <aside className="lg:sticky lg:top-6 lg:self-start">
                    <div className="glass-card rounded-xl p-6 animate-fade-in-up delay-100">
                        {loading ? (
                            <div className="flex flex-col items-center space-y-4 animate-pulse">
                                <div className="w-20 h-20 rounded-full bg-zinc-800" />
                                <div className="h-4 w-32 bg-zinc-800 rounded" />
                                <div className="h-3 w-40 bg-zinc-800 rounded" />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="relative group">
                                    <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-glass-blue-500/10 to-glass-blue-400/5 blur-xl opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                                    <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-zinc-700 ring-offset-2 ring-offset-zinc-900">
                                        {user?.avatar_url ? (
                                            <img
                                                src={user.avatar_url}
                                                alt={user.username}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-glass-blue-500 to-glass-blue-600 flex items-center justify-center">
                                                <span className="text-2xl font-bold text-white">
                                                    {user?.username?.[0]?.toUpperCase() || "?"}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <h2 className="text-lg font-semibold text-zinc-100">
                                    {user?.username || "Guest"}
                                </h2>
                                <div className="flex items-center gap-2 text-sm text-zinc-400">
                                    <svg className="w-4 h-4 text-glass-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                    <span className="font-medium text-glass-cyan-500">0</span>
                                    <span>starred</span>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* CENTER COLUMN: Repository Feed */}
                <section className="space-y-6">
                    {/* Search and Filters */}
                    <div className="space-y-4">
                        <div className="relative">
                            <input
                                type="search"
                                placeholder="Search projects..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="glass-card w-full rounded-lg px-4 py-3 pl-10 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all duration-300"
                            />
                            <svg
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <div className="flex gap-2">
                            {([
                                { key: "top", label: "Top Rated" },
                                { key: "recent", label: "Recent" },
                                { key: "trending", label: "Trending" },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setSortBy(key)}
                                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                                        sortBy === key
                                            ? "btn btn-primary"
                                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Genre tag filters */}
                        {allGenres.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {allGenres.map((genre) => {
                                    const active = selectedGenres.includes(genre);
                                    return (
                                        <button
                                            key={genre}
                                            onClick={() =>
                                                setSelectedGenres((prev) =>
                                                    active ? prev.filter((g) => g !== genre) : [...prev, genre]
                                                )
                                            }
                                            className={`rounded-full px-3 py-1 text-xs font-medium border transition-all duration-200 ${
                                                active
                                                    ? "border-glass-blue-500 bg-glass-blue-500/20 text-glass-blue-300"
                                                    : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                                            }`}
                                        >
                                            {genre}
                                        </button>
                                    );
                                })}
                                {selectedGenres.length > 0 && (
                                    <button
                                        onClick={() => setSelectedGenres([])}
                                        className="rounded-full px-3 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Repository Cards */}
                    <div className="space-y-5">
                        {reposLoading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <WaveformSpinner size="lg" bars={7} label="Discovering projects..." />
                            </div>
                        ) : error ? (
                            <div className="text-center py-16">
                                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-zinc-800/60 border border-zinc-700/50 backdrop-blur-sm flex items-center justify-center">
                                    <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-zinc-400">Failed to load projects</p>
                                <p className="text-xs mt-1 text-zinc-500">{error}</p>
                            </div>
                        ) : filteredAndSortedRepos.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-zinc-800/60 border border-zinc-700/50 backdrop-blur-sm flex items-center justify-center">
                                    <Compass className="w-6 h-6 text-zinc-500" />
                                </div>
                                <p className="text-sm text-zinc-400">No projects found</p>
                                <p className="text-xs mt-1 text-zinc-500">Try adjusting your search</p>
                            </div>
                        ) : (
                            filteredAndSortedRepos.map((repo) => {
                                const ytId =
                                    repo.thumbnail_type === "youtube" && repo.thumbnail_url
                                        ? extractYouTubeVideoId(repo.thumbnail_url)
                                        : null;
                                const ownerShown = ownerLabel(
                                    repo.owner_username,
                                    repo.owner,
                                );
                                return (
                                <Link
                                    key={repo.gitea_id}
                                    href={`/explore/${repo.owner}/${repo.repo_name}`}
                                    className="group block glass-card rounded-xl overflow-hidden transition-all duration-300 hover:border-glass-blue-500/40 hover:shadow-[0_0_24px_rgba(167,199,231,0.15)] no-underline animate-fade-in-up"
                                >
                                    {/* Thumbnail: image, YouTube still (hqdefault), audio hint, or placeholder */}
                                    <div className="relative h-48 overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-800/80 to-zinc-900">
                                        {repo.thumbnail_url && repo.thumbnail_type === "image" ? (
                                            <img
                                                src={repo.thumbnail_url}
                                                alt={repo.repo_name}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                            />
                                        ) : ytId ? (
                                            <div className="relative w-full h-full">
                                                <img
                                                    src={youtubeThumbnailHq(ytId)}
                                                    alt=""
                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                />
                                                {/* Play overlay */}
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-300 group-hover:bg-black/10">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg shadow-black/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/15">
                                                        <svg viewBox="0 0 24 24" fill="white" className="w-4.5 h-4.5 ml-0.5 drop-shadow-sm"><path d="M8 5v14l11-7z"/></svg>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : repo.audio_snippet ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900/85"
                                                onClick={(e) => e.preventDefault()}>
                                                <AudioLines className="w-8 h-8 text-glass-blue-400/60" />
                                                <div className="w-4/5">
                                                    <AudioPlayer src={repo.audio_snippet} compact />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-600">
                                                <Music className="w-12 h-12 opacity-40" />
                                                <div className="absolute inset-x-6 bottom-4 flex items-end justify-center gap-[1px] opacity-20">
                                                    {Array.from({ length: 40 }).map((_, i) => {
                                                        const h = 15 + Math.sin(i * 0.35 + (repo.stars ?? 0)) * 28 + Math.cos(i * 0.8) * 18;
                                                        return (
                                                            <div
                                                                key={i}
                                                                className="flex-1 rounded-t-sm bg-glass-blue-400"
                                                                style={{ height: `${Math.max(h, 8)}%` }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="p-5 space-y-3">
                                        <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-[#A7C7E7] transition-colors duration-300">
                                            {repo.repo_name}
                                        </h3>
                                        <p className="text-sm text-zinc-400">
                                            <Link
                                                href={`/profile/${repo.owner_username || repo.owner}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="font-medium text-zinc-400 hover:text-[#A7C7E7] transition-colors"
                                            >
                                                {ownerShown}
                                            </Link>
                                            {repo.updated_at && (
                                                <>
                                                    <span className="mx-2 text-zinc-600">&middot;</span>
                                                    <span>Updated {formatRelativeTime(repo.updated_at)}</span>
                                                </>
                                            )}
                                        </p>
                                        {repo.genres.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {repo.genres.map((genre) => (
                                                    <span key={genre} className="text-[10px] text-glass-blue-400 bg-zinc-800/60 rounded-full px-2 py-0.5 border border-zinc-700/50 backdrop-blur-sm">
                                                        {genre}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex gap-4 text-sm text-glass-cyan-500">
                                            <span className="flex items-center gap-1.5">
                                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                                {repo.stars ?? 0}
                                            </span>
                                            <span className="flex items-center gap-1.5 text-zinc-400">
                                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                                                </svg>
                                                {repo.clone_count} clones
                                            </span>
                                            {repo.audio_snippet && (
                                                <span className="flex items-center gap-1.5 text-zinc-400">
                                                    <AudioLines className="w-3.5 h-3.5" />
                                                    Audio
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                            })
                        )}
                    </div>
                </section>

                {/* RIGHT SIDEBAR: Trending */}
                <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
                    <div className="glass-card rounded-xl p-5 transition-all duration-300 hover:border-glass-blue-500/40 hover:shadow-[0_0_24px_rgba(167,199,231,0.15)]">
                        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-zinc-800">
                            <TrendingUp className="w-4 h-4 text-glass-blue-400" />
                            <h2 className="text-sm font-semibold text-glass-blue-400 tracking-wide">Trending</h2>
                        </div>
                        <div className="space-y-1">
                            {trendingRepos.map((repo, index) => (
                                <Link
                                    key={repo.gitea_id}
                                    href={`/explore/${repo.owner}/${repo.repo_name}`}
                                    className="group flex items-start gap-2.5 rounded-lg px-2 py-2.5 -mx-2 transition-colors hover:bg-zinc-800/50 no-underline"
                                >
                                    <span className="text-xs font-bold text-zinc-600 mt-0.5 min-w-[1.25rem]">
                                        {index + 1}.
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-zinc-300 group-hover:text-[#A7C7E7] transition-colors truncate">
                                            {repo.repo_name}
                                        </h3>
                                        <p className="text-xs text-zinc-500 mt-0.5">
                                            <Link
                                                href={`/profile/${repo.owner_username || repo.owner}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="hover:text-zinc-300 transition-colors"
                                            >
                                                {ownerLabel(repo.owner_username, repo.owner)}
                                            </Link>
                                        </p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <svg className="w-3 h-3 text-glass-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span className="text-xs font-medium text-glass-cyan-500">{repo.stars ?? 0}</span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
