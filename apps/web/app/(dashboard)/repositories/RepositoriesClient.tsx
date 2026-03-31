"use client"
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, List, ArrowUpDown, Star, ChevronDown, Check, Music, Mail, Users } from "lucide-react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import RepositoryCard from "@/components/RepositoryCard";
import type { EnrichedRepo, Genre, Invitation } from "@/lib/types/api";
import { starRepoAction, unstarRepoAction, deleteRepoAction, renameRepoAction } from "@/actions/repos";
import { acceptInvitationAction, declineInvitationAction } from "@/actions/invitations";

type SortKey = "updated" | "alpha" | "created" | "stars" | "clones";
type RoleFilter = "all" | "owner" | "collaborator";

interface RepositoriesClientProps {
    repos: EnrichedRepo[];
    genres: Genre[];
    invitations: Invitation[];
}

export default function RepositoriesClient({ repos, genres, invitations }: RepositoriesClientProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showInvites, setShowInvites] = useState(false);
  const router = useRouter();

  // Sorting & filtering state
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [filterStarred, setFilterStarred] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  // Derive sorted + filtered list
  const filteredRepos = useMemo(() => {
    let list = [...repos];

    // Filter: role
    if (roleFilter !== "all") {
      list = list.filter((r) => r.role === roleFilter);
    }

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
  }, [repos, sortBy, filterStarred, selectedGenres, roleFilter]);

  function toggleGenre(name: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function handleAcceptInvite(invitationId: number) {
    startTransition(async () => {
      const result = await acceptInvitationAction(invitationId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDeclineInvite(invitationId: number) {
    startTransition(async () => {
      const result = await declineInvitationAction(invitationId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
    {/* Invitations Panel */}
    {showInvites && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-100">Pending Invitations</h2>
            <button
              onClick={() => setShowInvites(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {invitations.length === 0 ? (
            <p className="py-8 text-center text-zinc-500">No pending invitations</p>
          ) : (
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-zinc-100">{inv.repo_name}</p>
                      <p className="text-sm text-zinc-400">
                        from <span className="text-zinc-300">{inv.owner_username}</span>
                      </p>
                    </div>
                    <span className="rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs text-zinc-300 capitalize">
                      {inv.permission}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-zinc-500">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptInvite(inv.id)}
                      disabled={isPending}
                      className="rounded-lg bg-glass-blue px-4 py-1.5 text-sm font-semibold text-zinc-950
                                 hover:bg-glass-highlight transition-colors disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleDeclineInvite(inv.id)}
                      disabled={isPending}
                      className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-400
                                 hover:border-red-500/50 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

    <main className="mx-auto max-w-7xl px-6 py-12">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold tracking-tight">
              Your Projects
            </h1>
            <p className="text-lg text-zinc-400">
              Manage your remote Ableton projects
            </p>
          </div>
          <div className="relative inline-block">
            <button
              onClick={() => setShowInvites(true)}
              className="btn btn-primary flex items-center gap-2"
            >
              <Mail size={16} /> Invites
            </button>
            {invitations.length > 0 && (
              <span className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm">
                {invitations.length}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

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
              <option value="clones">Remixes</option>
            </select>
          </div>

          {/* Role filter dropdown */}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Users size={14} />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
              className={`rounded-md border px-3 py-1.5 text-sm focus:border-glass-blue focus:outline-none ${
                roleFilter !== "all"
                  ? "border-glass-blue-500/50 bg-glass-blue-500/10 text-glass-cyan-500"
                  : "border-zinc-700 bg-zinc-800 text-zinc-200"
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
          <span className="text-sm text-zinc-500">{filteredRepos.length} projects</span>
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

        {/* Project Grid */}
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
                  ? "No projects yet. Push from the desktop app to get started."
                  : "No projects match the current filters."}
            </p>
          ) : (
              filteredRepos.map((repo) => (
                    <RepositoryCard
                        key={repo.id}
                        id={repo.full_name}
                        title={repo.name}
                        author={repo.owner_username || repo.name}
                        updatedAt={repo.updated_at}
                        isPublic={!repo.private}
                        audioSnippet={repo.audio_snippet}
                        thumbnailUrl={repo.thumbnail_url}
                        thumbnailType={repo.thumbnail_type}
                        cloneCount={repo.clone_count}
                        cloneUrl={repo.clone_url}
                        isStarred={repo.is_starred}
                        isOwner={repo.role === "owner"}
                        genres={repo.genres}
                        stats={{
                            stars: repo.stars_count,
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
                ))              
          )}
        </div>
      </main>
    </>
  );
}
