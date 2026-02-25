"use client"
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, Plus, ArrowUpDown, Star, ChevronDown, Check, Music } from "lucide-react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import RepositoryCard from "@/components/RepositoryCard";
import type { EnrichedRepo, Genre } from "@/lib/types/api";
import { createRepoAction, starRepoAction, unstarRepoAction, deleteRepoAction, renameRepoAction } from "@/actions/repos";

type SortKey = "updated" | "alpha" | "created" | "stars" | "clones";

interface RepositoriesClientProps {
    repos: EnrichedRepo[];
    genres: Genre[];
}

export default function RepositoriesClient({ repos, genres }: RepositoriesClientProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Sorting & filtering state
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [filterStarred, setFilterStarred] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());

  // Derive sorted + filtered list
  const filteredRepos = useMemo(() => {
    let list = [...repos];

    // Filter: starred only
    if (filterStarred) {
      list = list.filter((r) => r.is_starred);
    }

    // Filter: genres
    if (selectedGenres.size > 0) {
      list = list.filter((r) =>
        r.genres.some((g) => selectedGenres.has(g)),
      );
    }

    // Sort
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
  }, [repos, sortBy, filterStarred, selectedGenres]);

  function toggleGenre(name: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleCreate(formData: FormData) {
    const name = (formData.get("name") as string).trim();
    const description = (formData.get("description") as string || "").trim();
    const isPrivate = formData.get("visibility") === "private";

    if (!name) { setError("Repository name is required."); return; }

    setError(null);
    startTransition(async () => {
      const result = await createRepoAction(name, isPrivate, description);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setShowModal(false);
      router.refresh();
    });
  }

  return (
    <>
    {/* Create Repository Modal */}
    {showModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <h2 className="mb-4 text-xl font-semibold text-zinc-100">New Repository</h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form action={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="repo-name" className="mb-1 block text-sm font-medium text-zinc-300">Name</label>
              <input
                id="repo-name"
                name="name"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 placeholder-zinc-500
                           focus:border-glass-blue focus:outline-none focus:ring-1 focus:ring-glass-blue/50"
                placeholder="my-new-project"
              />
            </div>

            <div>
              <label htmlFor="repo-desc" className="mb-1 block text-sm font-medium text-zinc-300">Description</label>
              <input
                id="repo-desc"
                name="description"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 placeholder-zinc-500
                           focus:border-glass-blue focus:outline-none focus:ring-1 focus:ring-glass-blue/50"
                placeholder="Optional description"
              />
            </div>

            <fieldset className="flex gap-4 text-sm text-zinc-300">
              <legend className="mb-1 text-sm font-medium text-zinc-300">Visibility</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="visibility" value="public" defaultChecked className="accent-glass-blue" />
                Public
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="visibility" value="private" className="accent-glass-blue" />
                Private
              </label>
            </fieldset>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setError(null); }}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-glass-blue px-5 py-2 text-sm font-semibold text-zinc-950
                           hover:bg-glass-highlight transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Creating…" : "Create Repository"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">
              Your Repositories
            </h1>
            <p className="text-lg text-zinc-400">
              Manage your remote Ableton projects
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-2">
            <Plus size={16} /> New Repository
          </button>
        </div>

        {/* Toolbar: sort, filter, view toggle */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {/* Sort dropdown */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-glass-blue focus:outline-none"
            >
              <option value="updated">Last Updated</option>
              <option value="alpha">Name (A-Z)</option>
              <option value="created">Date Created</option>
              <option value="stars">Stars</option>
              <option value="clones">Clones</option>
            </select>
          </div>

          {/* Starred filter */}
          <button
            onClick={() => setFilterStarred(!filterStarred)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              filterStarred
                ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <Star size={14} fill={filterStarred ? "currentColor" : "none"} />
            Starred
          </button>

          {/* Genre filter dropdown */}
          <Popover className="relative">
            <PopoverButton
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                selectedGenres.size > 0
                  ? "border-glass-blue-500/50 bg-glass-blue-500/10 text-glass-cyan-500"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              <Music size={14} />
              Genres
              {selectedGenres.size > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-glass-blue-500/20 text-xs font-medium text-glass-cyan-500">
                  {selectedGenres.size}
                </span>
              )}
              <ChevronDown size={14} className="ml-0.5" />
            </PopoverButton>

            <PopoverPanel className="popover-panel absolute left-0 z-50 mt-2 w-56">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Filter by Genre
                </span>
                {selectedGenres.size > 0 && (
                  <button
                    onClick={() => setSelectedGenres(new Set())}
                    className="text-xs text-glass-cyan-500 hover:text-glass-highlight transition-colors"
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
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/5"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                          isActive
                            ? "border-glass-blue-500 bg-glass-blue-500"
                            : "border-white/10 bg-charcoal"
                        }`}
                      >
                        {isActive && <Check size={10} className="text-white" />}
                      </span>
                      <span className={isActive ? "text-soft-white" : "text-muted"}>
                        {g.genre_name}
                      </span>
                    </button>
                  );
                })}
                {genres.length === 0 && (
                  <p className="py-2 text-center text-xs text-muted">No genres available</p>
                )}
              </div>
            </PopoverPanel>
          </Popover>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Count + view toggle */}
          <span className="text-sm text-zinc-500">{filteredRepos.length} repos</span>
          <div className="flex gap-1">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md p-2 transition-colors ${
                view === "grid"
                  ? "bg-glass-blue/20 text-glass-cyan-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md p-2 transition-colors ${
                view === "list"
                  ? "bg-glass-blue/20 text-glass-cyan-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Repository Grid */}
        <div
          className={
            view === "grid"
              ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-4"
          }
        >
          {filteredRepos.length === 0 ? (
            <p className="text-zinc-500 col-span-3 text-center py-12">
                {repos.length === 0
                  ? "No repositories yet. Create one to get started."
                  : "No repositories match the current filters."}
            </p>
          ) : (
              filteredRepos.map((repo) => (
                    <RepositoryCard
                        key={repo.id}
                        id={repo.full_name}
                        title={repo.name}
                        author={repo.owner_id}
                        updatedAt={repo.updated_at}
                        isPublic={!repo.private}
                        audioSnippet={repo.audio_snippet}
                        cloneCount={repo.clone_count}
                        isStarred={repo.is_starred}
                        isOwner={true}
                        genres={repo.genres}
                        stats={{
                            stars: repo.stars_count,
                        }}
                        onStar={async () => {
                          const parts = repo.full_name.split("/");
                          const o = parts[0] ?? "";
                          const n = parts[1] ?? "";
                          if (repo.is_starred) {
                            await unstarRepoAction(o, n);
                          } else {
                            await starRepoAction(o, n);
                          }
                          router.refresh();
                        }}
                        onDelete={async () => {
                          const parts = repo.full_name.split("/");
                          await deleteRepoAction(parts[0] ?? "", parts[1] ?? "");
                          router.refresh();
                        }}
                        onRename={async (newName: string) => {
                          const parts = repo.full_name.split("/");
                          await renameRepoAction(parts[0] ?? "", parts[1] ?? "", newName);
                          router.refresh();
                        }}
                    />
                ))              
          )}
        </div>
      </main>
    </>
  );
}
