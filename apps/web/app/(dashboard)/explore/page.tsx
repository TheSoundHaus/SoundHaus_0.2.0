"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/lib/context/UserContext";
import { searchReposAction } from "@/lib/actions/repos.actions";
import type { SearchRepoItem } from "@/lib/types/api";

type SortKey = "top" | "recent" | "clones";

const SORT_MAP: Record<SortKey, string> = {
  top: "stars",
  recent: "updated",
  clones: "clones",
};

/**
 * Explore Page - GitHub-inspired three-column layout
 * Left: User profile card with starred repos
 * Center (50%): Repository feed with search and filters
 * Right: Trending repositories sidebar
 *
 * Fetches real data from GET /repos/search via searchReposAction
 */
export default function ExplorePage() {
  const { user, loading: userLoading } = useUser();
  const [sortBy, setSortBy] = useState<SortKey>("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [repos, setRepos] = useState<SearchRepoItem[]>([]);
  const [topRepos, setTopRepos] = useState<SearchRepoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input (400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Fetch repos when sort or debounced query changes
  useEffect(() => {
    let cancelled = false;
    async function fetchRepos() {
      setLoading(true);
      setError(null);
      // Backend requires q to be at least 1 char; use a space to browse all
      const query = debouncedQuery.trim() || " ";
      const result = await searchReposAction(query, SORT_MAP[sortBy], 30);
      if (cancelled) return;
      if (result.success) {
        setRepos(result.data.repos);
      } else {
        setError(result.error);
        setRepos([]);
      }
      setLoading(false);
    }
    fetchRepos();
    return () => { cancelled = true; };
  }, [sortBy, debouncedQuery]);

  // Fetch top-starred repos once for the trending sidebar
  useEffect(() => {
    let cancelled = false;
    async function fetchTop() {
      const result = await searchReposAction(" ", "stars", 5);
      if (cancelled) return;
      if (result.success) {
        setTopRepos(result.data.repos);
      }
    }
    fetchTop();
    return () => { cancelled = true; };
  }, []);

  // Format relative time
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

  // Calculate starred repos count (placeholder - would come from API)
  const starredCount = 24; // TODO: Implement actual starred repos tracking

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8">
      {/* Three-column grid layout */}
      <div className="grid grid-cols-1 md:grid-cols-[20%_60%_20%] lg:grid-cols-[25%_50%_25%] gap-6">
        {/* LEFT SIDEBAR: Profile Card */}
        <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)]">
          <div className="rounded-lg border border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 p-6 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            {userLoading ? (
              <div className="flex flex-col items-center space-y-4 animate-pulse">
                <div className="w-20 h-20 rounded-full bg-zinc-800"></div>
                <div className="h-4 w-32 bg-zinc-800 rounded"></div>
                <div className="h-3 w-40 bg-zinc-800 rounded"></div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Avatar with electric glow ring */}
                <div className="relative group">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-glass-blue-500/20 via-glass-cyan-500/20 to-glass-blue-400/20 blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                  <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-glass-blue-500/30 ring-offset-2 ring-offset-zinc-900">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-glass-blue-600 to-glass-blue-700 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">
                          {user?.username?.[0]?.toUpperCase() || "?"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Username */}
                <h2 className="text-lg font-semibold tracking-wide bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                  {user?.username || "Guest"}
                </h2>

                {/* Starred count */}
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <svg
                    className="w-4 h-4 text-glass-cyan-500"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-medium">{starredCount}</span>
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
            {/* Search bar */}
            <div className="relative">
              <input
                type="search"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-zinc-700/50 bg-zinc-900/50 backdrop-blur-sm px-4 py-2.5 pl-10 text-sm placeholder:text-zinc-500 focus:border-glass-blue-500/50 focus:ring-2 focus:ring-glass-blue-500/20 focus:outline-none transition-all duration-300"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2">
              {(
                [
                  { key: "top", label: "Top Rated" },
                  { key: "recent", label: "Recent" },
                  { key: "clones", label: "Most Cloned" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`relative px-4 py-2 text-sm font-medium rounded-md transition-all duration-300 ${
                    sortBy === key
                      ? "bg-glass-blue-500 text-white shadow-lg shadow-glass-blue-500/50"
                      : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50 hover:text-zinc-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Repository Cards */}
          <div className="space-y-4">
            {loading ? (
              // Loading skeleton
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 overflow-hidden animate-pulse"
                >
                  <div className="h-48 bg-zinc-800/50"></div>
                  <div className="p-5 space-y-3">
                    <div className="h-5 w-2/3 bg-zinc-800 rounded"></div>
                    <div className="h-4 w-1/2 bg-zinc-800/60 rounded"></div>
                    <div className="flex gap-4">
                      <div className="h-4 w-16 bg-zinc-800/40 rounded"></div>
                      <div className="h-4 w-20 bg-zinc-800/40 rounded"></div>
                      <div className="h-4 w-16 bg-zinc-800/40 rounded"></div>
                    </div>
                  </div>
                </div>
              ))
            ) : error ? (
              <div className="text-center py-12 text-zinc-500">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-red-500/60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-lg">Something went wrong</p>
                <p className="text-sm mt-1 text-zinc-600">{error}</p>
              </div>
            ) : repos.length === 0 ? (
              <div className="text-center py-12 text-zinc-500">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-zinc-700"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-lg">No projects found</p>
                <p className="text-sm mt-1">Try adjusting your search</p>
              </div>
            ) : (
              repos.map((repo) => (
                <article
                  key={repo.gitea_id}
                  className="group relative rounded-lg border border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 overflow-hidden backdrop-blur-sm transition-all duration-500 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_40px_rgba(167,199,231,0.15)] cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="relative h-48 overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
                    {/* Waveform-inspired pattern overlay */}
                    <div className="absolute inset-0 opacity-30">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 400 200"
                        preserveAspectRatio="none"
                      >
                        <path
                          d="M0 100 Q100 50 200 100 T400 100"
                          fill="none"
                          stroke="url(#waveGradient)"
                          strokeWidth="2"
                        />
                        <path
                          d="M0 100 Q100 150 200 100 T400 100"
                          fill="none"
                          stroke="url(#waveGradient)"
                          strokeWidth="2"
                        />
                        <defs>
                          <linearGradient
                            id="waveGradient"
                            x1="0%"
                            y1="0%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor="#A7C7E7" />
                            <stop offset="100%" stopColor="#7099C3" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    {/* Electric glow texture */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(167,199,231,0.1),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  </div>

                  {/* Content */}
                  <div className="p-5 space-y-3">
                    {/* Title */}
                    <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-glass-blue-400 transition-all duration-300">
                      {repo.repo_name}
                    </h3>

                    {/* Author and timestamp */}
                    <p className="text-sm text-zinc-400">
                      <span className="font-medium text-zinc-300">
                        {repo.owner_username}
                      </span>
                      <span className="mx-2">&bull;</span>
                      <span>Updated {formatRelativeTime(repo.updated_at)}</span>
                    </p>

                    {/* Description */}
                    {repo.description && (
                      <p className="text-sm text-zinc-500 line-clamp-2">
                        {repo.description}
                      </p>
                    )}

                    {/* Genres */}
                    {repo.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {repo.genres.map((genre) => (
                          <span
                            key={genre}
                            className="px-2 py-0.5 text-xs rounded-full bg-glass-blue-500/10 text-glass-blue-400 border border-glass-blue-500/20"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats */}
                    <div className="flex gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-glass-cyan-500">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {repo.stars_count}
                      </span>
                      <span className="flex items-center gap-1.5 text-glass-blue-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        {repo.clone_count} clones
                      </span>
                      {repo.audio_snippet && (
                        <span className="flex items-center gap-1.5 text-zinc-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                          </svg>
                          preview
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* RIGHT SIDEBAR: Trending */}
        <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="rounded-lg border border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 p-4 backdrop-blur-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            {/* Header with trending icon */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800/60">
              <svg
                className="w-5 h-5 text-glass-blue-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z"
                  clipRule="evenodd"
                />
              </svg>
              <h2 className="text-lg font-semibold text-glass-blue-400">
                Top Projects
              </h2>
            </div>

            {/* Trending list */}
            <div className="space-y-3">
              {topRepos.length === 0 ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-2 px-2 py-2">
                      <div className="h-4 w-4 bg-zinc-800 rounded"></div>
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-3/4 bg-zinc-800 rounded"></div>
                        <div className="h-3 w-1/2 bg-zinc-800/60 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                topRepos.map((repo, index) => (
                  <div
                    key={repo.gitea_id}
                    className="group pb-3 border-b border-zinc-800/40 last:border-0 last:pb-0 hover:bg-zinc-800/30 cursor-pointer rounded px-2 -mx-2 py-2 transition-all duration-300"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-bold text-zinc-600 mt-0.5 min-w-[1.5rem]">
                        {index + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-zinc-200 group-hover:text-glass-blue-400 transition-colors truncate">
                          {repo.repo_name}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                          @{repo.owner_username}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <svg
                            className="w-3 h-3 text-glass-cyan-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-xs font-medium text-glass-cyan-500">
                            {repo.stars_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
