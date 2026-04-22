"use client"
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, ArrowUpDown, Star, ChevronDown, Check, Music, Users, Waves } from "lucide-react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import RepositoryCard from "@/components/RepositoryCard";
import type { EnrichedRepo, Genre } from "@/lib/types/api";
import { starRepoAction, unstarRepoAction, deleteRepoAction, renameRepoAction } from "@/actions/repos";

type SortKey = "updated" | "alpha" | "created" | "stars" | "clones";
type RoleFilter = "all" | "owner" | "collaborator";

interface RepositoriesClientProps {
    repos: EnrichedRepo[];
    genres: Genre[];
}

export default function RepositoriesClient({ repos, genres }: RepositoriesClientProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [filterStarred, setFilterStarred] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const filteredRepos = useMemo(() => {
    let list = [...repos];
    if (roleFilter !== "all") {
      list = list.filter((r) => r.role === roleFilter);
    }
    if (filterStarred) {
      list = list.filter((r) => r.is_starred);
    }
    if (selectedGenres.size > 0) {
      list = list.filter((r) =>
        r.genres.some((g) => selectedGenres.has(g)),
      );
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "alpha":
          return a.name.localeCompare(b.name);
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "stars":
          return b.stars_count - a.stars_count;
        case "clones":
          return b.clone_count - a.clone_count;
        case "updated":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
    return list;
  }, [repos, sortBy, filterStarred, selectedGenres, roleFilter]);

  function toggleGenre(name: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Page Header */}
        <div className="mb-8">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">
              Your Projects
            </h1>
            <p className="text-zinc-400 text-base">
              Manage your remote Ableton projects
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-8 rounded-xl border border-zinc-800 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort */}
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <ArrowUpDown size={14} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
              >
                <option value="updated">Last Updated</option>
                <option value="alpha">Name (A-Z)</option>
                <option value="created">Date Created</option>
                <option value="stars">Stars</option>
                <option value="clones">Remixes</option>
              </select>
            </div>

            {/* Role filter */}
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Users size={14} />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className={`rounded-lg border px-3 py-1.5 text-sm focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all ${
                  roleFilter !== "all"
                    ? "border-glass-blue-500/40 bg-zinc-800 text-glass-blue-400"
                    : "border-zinc-700 bg-zinc-800 text-zinc-100"
                }`}
              >
                <option value="all">All Projects</option>
                <option value="owner">My Projects</option>
                <option value="collaborator">Collaborations</option>
              </select>
            </div>

            {/* Starred filter */}
            <button
              onClick={() => setFilterStarred(!filterStarred)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all duration-300 ${
                filterStarred
                  ? "border-amber-500/40 bg-amber-900/20 text-amber-400"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              }`}
            >
              <Star size={14} fill={filterStarred ? "currentColor" : "none"} />
              Starred
            </button>

            {/* Genre filter */}
            <Popover className="relative">
              <PopoverButton
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all duration-300 ${
                  selectedGenres.size > 0
                    ? "border-glass-blue-500/40 bg-zinc-800 text-glass-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                }`}
              >
                <Music size={14} />
                Genres
                {selectedGenres.size > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-glass-blue-500/20 text-xs font-medium text-glass-blue-400">
                    {selectedGenres.size}
                  </span>
                )}
                <ChevronDown size={14} className="ml-0.5" />
              </PopoverButton>

              <PopoverPanel className="absolute left-0 z-50 mt-2 w-56 rounded-xl border border-zinc-700 bg-zinc-800 p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Filter by Genre
                  </span>
                  {selectedGenres.size > 0 && (
                    <button
                      onClick={() => setSelectedGenres(new Set())}
                      className="text-xs text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {genres.map((g) => {
                    const isActive = selectedGenres.has(g.genre_name);
                    return (
                      <button
                        key={g.genre_id}
                        onClick={() => toggleGenre(g.genre_name)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-zinc-700"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${
                            isActive
                              ? "border border-glass-blue-400 bg-glass-blue-500"
                              : "border border-zinc-600 bg-zinc-700"
                          }`}
                        >
                          {isActive && <Check size={10} className="text-white" />}
                        </span>
                        <span className={isActive ? "text-zinc-100" : "text-zinc-400"}>
                          {g.genre_name}
                        </span>
                      </button>
                    );
                  })}
                  {genres.length === 0 && (
                    <p className="py-2 text-center text-xs text-zinc-500">No genres available</p>
                  )}
                </div>
              </PopoverPanel>
            </Popover>

            <div className="flex-1" />

            {/* Count + view toggle */}
            <span className="text-sm text-zinc-400">{filteredRepos.length} projects</span>
            <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
              <button
                onClick={() => setView("grid")}
                className={`rounded-md p-1.5 transition-all duration-300 ${
                  view === "grid"
                    ? "bg-zinc-700 text-glass-blue-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`rounded-md p-1.5 transition-all duration-300 ${
                  view === "list"
                    ? "bg-zinc-700 text-glass-blue-400"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Project Grid */}
        <div
          className={
            view === "grid"
              ? "grid gap-5 md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-4"
          }
        >
          {filteredRepos.length === 0 ? (
            <div className="col-span-3 flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800">
                <Waves size={24} className="text-zinc-500" />
              </div>
              <p className="text-sm text-zinc-400">
                {repos.length === 0
                  ? "No projects yet. Push from the desktop app to get started."
                  : "No projects match the current filters."}
              </p>
            </div>
          ) : (
              filteredRepos.map((repo) => {
                    const giteaOwner = repo.full_name.split("/")[0] ?? "";
                    return (
                    <RepositoryCard
                        key={repo.id}
                        id={`${repo.owner_username}/${repo.name}`}
                        title={repo.name}
                        author={
                          repo.owner_username ||
                          giteaOwner
                        }
                        cloneOwner={giteaOwner}
                        profileSlug={repo.owner_username || giteaOwner}
                        updatedAt={repo.updated_at}
                        isPublic={!repo.private}
                        audioSnippet={repo.audio_snippet}
                        thumbnailUrl={repo.thumbnail_url}
                        thumbnailType={repo.thumbnail_type}
                        cloneCount={repo.clone_count}
                        isStarred={repo.is_starred}
                        isOwner={repo.role === "owner"}
                        genres={repo.genres}
                        stats={{
                            stars: repo.stars_count,
                            commits: repo.total_commits ?? 0,
                        }}
                        onStar={async () => {
                          const parts = repo.full_name.split("/");
                          const o = parts[0] ?? "";
                          const n = parts[1] ?? "";
                          const result = repo.is_starred
                            ? await unstarRepoAction(o, n)
                            : await starRepoAction(o, n);
                          if (!result.success) {
                            setError(result.error);
                            return;
                          }
                          router.refresh();
                        }}
                        onDelete={async () => {
                          const parts = repo.full_name.split("/");
                          const result = await deleteRepoAction(parts[0] ?? "", parts[1] ?? "");
                          if (!result.success) {
                            setError(result.error);
                            return;
                          }
                          router.refresh();
                        }}
                        onRename={async (newName: string) => {
                          const parts = repo.full_name.split("/");
                          const result = await renameRepoAction(parts[0] ?? "", parts[1] ?? "", newName);
                          if (!result.success) {
                            setError(result.error);
                            return;
                          }
                          router.refresh();
                        }}
                    />
                );
              })
          )}
        </div>
      </main>
  );
}
