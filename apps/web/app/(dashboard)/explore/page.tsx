"use client";

import { useState, useMemo, useEffect } from "react";
import { useUser } from "@/lib/context/UserContext";
import { getPublicRepos } from "@/lib/api/repos";
import type { PublicRepo } from "@/lib/types/api";

/**
 * Explore Page - GitHub-inspired three-column layout
 * Left: User profile card with starred repos
 * Center (50%): Repository feed with search and filters
 * Right: Trending repositories sidebar
 *
 * API Call: GET /repos/public → returns array of public project overviews
 */
export default function ExplorePage() {
  const { user, loading } = useUser();
  const [sortBy, setSortBy] = useState<"top" | "recent" | "trending">("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [repos, setRepos] = useState<PublicRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch public repos from backend
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

  // Filter and sort repositories
  const filteredAndSortedRepos = useMemo(() => {
    let filtered = repos;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (repo) =>
          repo.repo_name.toLowerCase().includes(query) ||
          repo.owner.toLowerCase().includes(query)
      );
    }

    // Apply sorting
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
        // Trending: combination of stars and recency
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
  }, [repos, sortBy, searchQuery]);

  // Get top 5 trending repos (by stars)
  const trendingRepos = useMemo(() => {
    return [...repos]
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
      .slice(0, 5);
  }, [repos]);

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
            {loading ? (
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
                  { key: "trending", label: "Trending" },
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
            {reposLoading ? (
              <div className="text-center py-12 text-zinc-500">
                <div className="w-8 h-8 mx-auto mb-4 border-2 border-zinc-700 border-t-glass-blue-400 rounded-full animate-spin" />
                <p className="text-lg">Loading projects...</p>
              </div>
            ) : error ? (
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
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p className="text-lg">Failed to load projects</p>
                <p className="text-sm mt-1 text-zinc-600">{error}</p>
              </div>
            ) : filteredAndSortedRepos.length === 0 ? (
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
              filteredAndSortedRepos.map((repo) => (
                <article
                  key={repo.gitea_id}
                  className="group relative rounded-lg border border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 overflow-hidden backdrop-blur-sm transition-all duration-500 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_40px_rgba(167,199,231,0.15)] cursor-pointer"
                >
                  {/* Thumbnail */}
                  <div className="relative h-48 overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
                    {repo.thumbnail_url ? (
                      repo.thumbnail_type === "image" ? (
                        <img
                          src={repo.thumbnail_url}
                          alt={repo.repo_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <iframe
                          src={repo.thumbnail_url.replace("watch?v=", "embed/")}
                          className="w-full h-full"
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                        />
                      )
                    ) : (
                      <>
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
                      </>
                    )}
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
                        {repo.owner}
                      </span>
                      {repo.updated_at && (
                        <>
                          <span className="mx-2">•</span>
                          <span>Updated {formatRelativeTime(repo.updated_at)}</span>
                        </>
                      )}
                    </p>

                    {/* Genres */}
                    {repo.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {repo.genres.map((genre) => (
                          <span key={genre} className="text-[10px] text-glass-blue-400 bg-glass-blue-400/10 rounded-full px-2 py-0.5">
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
                        {repo.stars ?? 0}
                      </span>
                      <span className="flex items-center gap-1.5 text-glass-blue-400">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                        </svg>
                        {repo.clone_count} clones
                      </span>
                      {repo.audio_snippet && (
                        <span className="flex items-center gap-1.5 text-zinc-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                          </svg>
                          Audio
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
                Trending
              </h2>
            </div>

            {/* Trending list */}
            <div className="space-y-3">
              {trendingRepos.map((repo, index) => (
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
                        @{repo.owner}
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
                          {repo.stars ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
