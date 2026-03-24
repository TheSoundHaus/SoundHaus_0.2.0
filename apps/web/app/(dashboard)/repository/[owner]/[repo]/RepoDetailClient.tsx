"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Lock,
  GitCommit,
  Download,
  Music,
  Calendar,
  GitBranch,
  Activity,
  Settings,
  FileText,
  Clock,
  Trash2,
  Save,
} from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import SnippetUploader from "@/components/SnippetUploader";
import GenreEditor from "@/components/GenreEditor";
import { deleteRepoAction, renameRepoAction } from "@/actions/repos";
import type {
  RepoStats,
  RepoActivity,
  RepoEvents,
  Snippet,
  PushActivity,
  RepoEvent,
  Genre,
} from "@/lib/types/api";

interface RepoDetailClientProps {
  owner: string;
  repo: string;
  stats: RepoStats | null;
  activity: RepoActivity | null;
  events: RepoEvents | null;
  snippet: Snippet | null;
  allGenres: Genre[];
}

export default function RepoDetailClient({
  owner,
  repo,
  stats,
  activity,
  events,
  snippet,
  allGenres,
}: RepoDetailClientProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "commits" | "events" | "settings"
  >("overview");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Settings form state
  const [newName, setNewName] = useState(repo);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const pushes: PushActivity[] = activity?.activity ?? [];
  const repoEvents: RepoEvent[] = events?.events ?? [];
  const genres = stats?.genres ?? [];
  const cloneCount = stats?.clone_count ?? 0;

  function handleDelete() {
    if (!confirm(`Delete "${repo}"? This cannot be undone.`)) return;
    setSettingsError(null);
    startTransition(async () => {
      const result = await deleteRepoAction(owner, repo);
      if (result.success) {
        router.push("/repositories");
      } else {
        setSettingsError(result.error);
      }
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || newName === repo) return;
    setSettingsError(null);
    startTransition(async () => {
      const result = await renameRepoAction(owner, repo, newName.trim());
      if (result.success) {
        router.push(`/repository/${owner}/${newName.trim()}`);
        router.refresh();
      } else {
        setSettingsError(result.error);
      }
    });
  }

  // Format relative time
  function timeAgo(iso: string | null | undefined): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days < 30) return `${days}d ago`;
      return d.toLocaleDateString();
    } catch {
      return iso ?? "—";
    }
  }

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: FileText },
    { key: "commits" as const, label: "Commits", icon: GitCommit },
    { key: "events" as const, label: "Events", icon: Activity },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/repositories" className="hover:text-zinc-100 transition-colors">
          Repositories
        </Link>
        <span>/</span>
        <span className="text-zinc-200">{repo}</span>
      </div>

      {/* Repository Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight">{repo}</h1>
          {stats && (
            <p className="mb-3 text-lg text-zinc-400">
              {stats.audio_snippet ? "Audio snippet available" : "No audio snippet"}
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <User size={14} /> {owner}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Lock size={14} /> Private
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Download size={14} /> {cloneCount} clones
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="rounded-md bg-zinc-100 px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200">
            Open in Desktop
          </button>
          <button className="rounded-md border border-zinc-700 px-6 py-3 font-medium transition-colors hover:bg-zinc-800">
            Clone
          </button>
        </div>
      </div>

      {/* Audio Player */}
      {snippet?.url && (
        <div className="mb-8">
          <AudioPlayer src={snippet.url} />
        </div>
      )}

      {/* Genre tags */}
      {genres.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {genres.map((g) => (
            <span
              key={g.genre_id}
              className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300"
            >
              {g.genre_name}
            </span>
          ))}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-8 border-b border-zinc-800">
        <nav className="flex gap-8">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 border-b-2 pb-4 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "border-glass-cyan-500 text-zinc-100"
                  : "border-transparent text-zinc-400 hover:text-zinc-100"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Overview Tab ────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {/* Stats grid */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">Project Stats</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold">{cloneCount}</div>
                  <div className="flex items-center gap-1 text-sm text-zinc-400">
                    <Download size={12} /> Clones
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{pushes.length}</div>
                  <div className="flex items-center gap-1 text-sm text-zinc-400">
                    <GitCommit size={12} /> Pushes
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{genres.length}</div>
                  <div className="flex items-center gap-1 text-sm text-zinc-400">
                    <Music size={12} /> Genres
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Push Activity */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">Recent Activity</h2>
              {pushes.length === 0 ? (
                <p className="text-sm text-zinc-500">No push activity recorded yet.</p>
              ) : (
                <div className="space-y-4">
                  {pushes.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-4 border-b border-zinc-800 pb-4 last:border-0"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                        <GitBranch size={16} />
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 font-medium">
                          {p.commit_count} commit{p.commit_count !== 1 ? "s" : ""} to{" "}
                          <span className="text-glass-cyan-500">
                            {p.ref?.replace("refs/heads/", "") ?? "unknown"}
                          </span>
                        </div>
                        <div className="text-sm text-zinc-400">
                          {p.pusher} pushed {timeAgo(p.pushed_at)}
                        </div>
                      </div>
                      <div className="font-mono text-sm text-zinc-500">
                        {p.after_sha ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Recent Clones */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h3 className="mb-4 text-lg font-semibold">Recent Clones</h3>
              {stats && stats.recent_clones.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_clones.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <User size={14} /> {c.user_id.slice(0, 8)}…
                      </span>
                      <span className="text-zinc-500">{timeAgo(c.cloned_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No clones yet.</p>
              )}
            </div>

            {/* Snippet info */}
            {snippet && (
              <div className="rounded-lg border border-zinc-800 p-6">
                <h3 className="mb-4 text-lg font-semibold">Audio Snippet</h3>
                <div className="space-y-2 text-sm">
                  {snippet.format && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Format</span>
                      <span>{snippet.format.toUpperCase()}</span>
                    </div>
                  )}
                  {snippet.duration != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Duration</span>
                      <span>{Math.round(snippet.duration)}s</span>
                    </div>
                  )}
                  {snippet.sample_rate != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Sample Rate</span>
                      <span>{snippet.sample_rate} Hz</span>
                    </div>
                  )}
                  {snippet.channels != null && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Channels</span>
                      <span>{snippet.channels === 1 ? "Mono" : "Stereo"}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Repo Info */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h3 className="mb-4 text-lg font-semibold">Repository Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Calendar size={12} /> ID
                  </span>
                  <span className="font-mono text-xs">{owner}/{repo}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Commits Tab ────────────────────────────────────────────── */}
      {activeTab === "commits" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Push History</h2>
          {pushes.length === 0 ? (
            <p className="text-zinc-500">No push activity recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {pushes.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-4 border-b border-zinc-800 pb-4 last:border-0"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                    <GitCommit size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 font-medium">
                      {p.commit_count} commit{p.commit_count !== 1 ? "s" : ""} pushed to{" "}
                      <span className="text-glass-cyan-500">
                        {p.ref?.replace("refs/heads/", "") ?? "unknown"}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      <span className="flex items-center gap-1">
                        <User size={12} /> {p.pusher} • <Clock size={12} /> {timeAgo(p.pushed_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-sm text-zinc-400">{p.after_sha ?? "—"}</span>
                    <span className="font-mono text-xs text-zinc-600">{p.before_sha ?? ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Events Tab ─────────────────────────────────────────────── */}
      {activeTab === "events" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Repository Events</h2>
          {repoEvents.length === 0 ? (
            <p className="text-zinc-500">No events recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {repoEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-4 border-b border-zinc-800 pb-4 last:border-0"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                    <Activity size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 font-medium">
                      {ev.event_type.replaceAll("_", " ")}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-zinc-400">
                      <User size={12} /> {ev.actor} • <Clock size={12} /> {timeAgo(ev.occurred_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ───────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Repository Settings</h2>

          {/* Settings error banner */}
          {settingsError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {settingsError}
            </div>
          )}

          <div className="space-y-6">
            {/* Rename */}
            <form onSubmit={handleRename}>
              <label className="mb-2 block text-sm font-medium">
                Repository Name
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 focus:border-glass-blue focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isPending || newName === repo || !newName.trim()}
                  className="flex items-center gap-2 rounded-md bg-zinc-100 px-5 py-2 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} /> Rename
                </button>
              </div>
            </form>

            {/* Genre Editor */}
            <GenreEditor
              owner={owner}
              repo={repo}
              allGenres={allGenres}
              currentGenres={stats?.genres ?? []}
            />

            {/* Audio Snippet Upload */}
            <SnippetUploader
              owner={owner}
              repo={repo}
              existingUrl={snippet?.url ?? null}
              existingMetadata={
                snippet
                  ? {
                      duration: snippet.duration,
                      file_size: snippet.file_size,
                      format: snippet.format,
                      sample_rate: snippet.sample_rate,
                      channels: snippet.channels,
                    }
                  : null
              }
            />

            {/* Delete repository */}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-2 rounded-md border border-red-500/30 px-6 py-3 font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 size={16} /> Delete Repository
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
