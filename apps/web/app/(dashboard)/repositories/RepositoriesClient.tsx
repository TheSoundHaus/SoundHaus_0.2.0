"use client"
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import RepositoryCard from "@/components/RepositoryCard"
import type { GiteaRepo } from "@/lib/types/api";
import { createRepoAction } from "@/actions/repos";

interface RepositoriesClientProps {
    repos: GiteaRepo[];
}


export default function RepositoriesClient({repos}: RepositoriesClientProps) {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
      router.refresh(); // re-run the server component to fetch updated list
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
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            + New Repository
          </button>
        </div>

        {/* View Toggle and Stats */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex gap-6 text-sm text-glass-cyan-500">
            <span>{repos.length} Repositories</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                view === "grid"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all duration-300 ${
                view === "list"
                  ? "btn btn-primary"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Repository Grid - Placeholder */}
        <div
          className={
            view === "grid"
              ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-4"
          }
        >
          {/* Placeholder cards - will be populated via API */}
          {repos.length === 0 ? (
            <p className="text-zinc-500 col-span-3 text-center py-12">
                No repositories yet. Create one to get started.
            </p>
          ) : (
              repos.map((repo) => (
                    <RepositoryCard
                        key={repo.id}
                        id={repo.full_name}
                        title={repo.name}
                        author={repo.owner.login}
                        updatedAt={repo.updated_at}
                        isPublic={!repo.private}
                        stats={{
                            stars: repo.stars_count,
                            tracks: 0,
                            collaborators: 0
                        }}
                    />
                ))              
          )}
        </div>
      </main>
    </>
  );
}
