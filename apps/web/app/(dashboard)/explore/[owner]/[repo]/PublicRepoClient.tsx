"use client";

import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
import {
  User,
  Users,
  GitCommit,
  Download,
  Music,
  Calendar,
  GitBranch,
  Activity,
  FileText,
  Clock,
  ChevronDown,
  FilePlus,
  FileEdit,
  FileMinus,
  Eye,
  BookOpen,
  Trash2,
} from "lucide-react";
import AudioPlayerWithComments from "@/components/AudioPlayerWithComments";
import { DiffTimeline } from "@/components/diff/DiffTimeline";
import { ABComparisonView } from "@/components/diff/ABComparisonView";
import UserAvatar from "@/components/UserAvatar";
import Markdown from "react-markdown";
import { getCommits, getCommitDiff } from "@/lib/api/commits";
import { listCollaborators } from "@/lib/api/invitations";
import { getRepoEvents } from "@/lib/api/webhooks";
import type {
  RepoStats,
  RepoActivity,
  RepoEvents,
  Snippet,
  PushActivity,
  RepoEvent,
  Collaborator,
} from "@/lib/types/api";
import type { CommitListResponse, CommitSummary, AlsDiffData } from "@/lib/api/commits";

interface Props {
  owner: string;
  repo: string;
  stats: RepoStats | null;
  activity: RepoActivity | null;
  events: RepoEvents | null;
  snippet: Snippet | null;
  initialCommits: CommitListResponse | null;
  readme: string;
}

export default function PublicRepoClient({
  owner,
  repo,
  stats,
  activity,
  events,
  snippet,
  initialCommits,
  readme,
}: Props) {
  type TabKey = "overview" | "commits" | "events" | "collaborators";
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  // Commits
  const [commits, setCommits] = useState<CommitSummary[]>(initialCommits?.commits ?? []);
  const [commitTotal, setCommitTotal] = useState(initialCommits?.total ?? 0);
  const [commitPage, setCommitPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, AlsDiffData | null>>({});
  const [diffLoading, setDiffLoading] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<[string | null, string | null]>([null, null]);
  const [showComparison, setShowComparison] = useState(false);

  // Collaborators
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);

  // Events
  const [repoEvents, setRepoEvents] = useState<RepoEvent[]>(events?.events ?? []);

  const pushes: PushActivity[] = activity?.activity ?? [];
  const genres = stats?.genres ?? [];
  const cloneCount = stats?.clone_count ?? 0;
  const displayName = stats?.owner_username || owner;

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

  // Load collaborators on tab switch
  useEffect(() => {
    if (activeTab === "collaborators" || activeTab === "overview") {
      setCollabLoading(true);
      listCollaborators(owner, repo).then((res) => {
        if (res.success) setCollaborators(res.data ?? []);
        setCollabLoading(false);
      });
    }
    if (activeTab === "events") {
      getRepoEvents(owner, repo).then((res) => {
        if (res.success) setRepoEvents(res.data?.events ?? []);
      });
    }
  }, [activeTab, owner, repo]);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextPage = commitPage + 1;
    const res = await getCommits(owner, repo, nextPage, 20);
    if (res.success && res.data) {
      setCommits((prev) => [...prev, ...res.data.commits]);
      setCommitTotal(res.data.total);
      setCommitPage(nextPage);
    }
    setLoadingMore(false);
  }, [owner, repo, commitPage]);

  const handleToggleDiff = useCallback(async (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null);
      setDiffError(null);
      return;
    }
    setExpandedSha(sha);
    setDiffError(null);
    if (sha in diffCache) return;
    setDiffLoading(sha);
    const result = await getCommitDiff(owner, repo, sha);
    if (result.success && result.data) {
      setDiffCache((prev) => ({ ...prev, [sha]: result.data.diff }));
    } else {
      setDiffCache((prev) => ({ ...prev, [sha]: null }));
      if (!result.success) setDiffError(result.error);
    }
    setDiffLoading(null);
  }, [owner, repo, expandedSha, diffCache]);

  function handleCompareToggle() {
    setCompareMode((prev) => !prev);
    setCompareSelection([null, null]);
    setShowComparison(false);
  }

  function handleCompareSelect(sha: string) {
    if (!compareMode) return;
    setCompareSelection((prev) => {
      if (!prev[0]) return [sha, null];
      if (prev[0] === sha) return [null, null];
      return [prev[0], sha];
    });
  }

  function handleRunComparison() {
    if (compareSelection[0] && compareSelection[1]) {
      setShowComparison(true);
    }
  }

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: FileText },
    { key: "commits" as const, label: "Snapshots", icon: GitCommit },
    { key: "events" as const, label: "Timeline", icon: Activity },
    { key: "collaborators" as const, label: "Collaborators", icon: Users },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/explore" className="hover:text-zinc-100 transition-colors">
          Explore
        </Link>
        <span>/</span>
        <Link href={`/profile/${displayName}`} className="text-zinc-200 hover:text-glass-blue transition-colors">{displayName}</Link>
        <span>/</span>
        <span className="text-zinc-200">{repo}</span>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-bold">{repo}</h1>
          <p className="text-sm text-zinc-400">by <Link href={`/profile/${displayName}`} className="text-zinc-300 hover:text-glass-blue transition-colors">{displayName}</Link></p>
        </div>
      </div>

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

      {/* Audio Player */}
      {snippet?.url && (
        <div className="mb-8">
          <AudioPlayerWithComments
            src={snippet.url}
            duration={snippet.duration ?? undefined}
          />
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

      {/* ── Overview Tab ──────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            {/* Stats */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">Project Stats</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold">{cloneCount}</div>
                  <div className="flex items-center gap-1 text-sm text-zinc-400">
                    <Download size={12} /> Remixes
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

            {/* README */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                <BookOpen size={16} /> About
              </h2>
              <div className="prose prose-invert prose-zinc max-w-none">
                {readme ? (
                  <Markdown>{readme}</Markdown>
                ) : (
                  <p className="text-zinc-500 italic">No description provided.</p>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">Recent Activity</h2>
              {pushes.length === 0 ? (
                <p className="text-sm text-zinc-400">No push activity recorded yet.</p>
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Collaborators */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h3 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Users size={16} /> Collaborators
              </h3>
              {collabLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-8 w-full rounded bg-zinc-800" />
                  <div className="h-8 w-full rounded bg-zinc-800" />
                </div>
              ) : collaborators.length > 0 ? (
                <div className="space-y-3">
                  {collaborators.map((c) => (
                    <Link key={c.login} href={`/profile/${c.username || c.login}`} className="flex items-center gap-3 hover:bg-zinc-800/50 rounded-md p-1 -m-1 transition-colors">
                      <UserAvatar src={c.avatar_url} alt={c.display_name || c.username || c.login} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate hover:text-glass-blue transition-colors">
                          {c.display_name || c.username || c.login}
                        </div>
                        <div className="text-xs text-zinc-500 capitalize">{c.permission}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No collaborators yet.</p>
              )}
            </div>

            {/* Project Info */}
            <div className="rounded-lg border border-zinc-800 p-6">
              <h3 className="mb-4 text-lg font-semibold">Project Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Calendar size={12} /> Project
                  </span>
                  <span className="font-mono text-xs">{repo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <User size={12} /> Owner
                  </span>
                  <Link href={`/profile/${displayName}`} className="text-xs text-zinc-300 hover:text-glass-blue transition-colors">{displayName}</Link>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <GitCommit size={12} /> Snapshots
                  </span>
                  <span className="text-xs text-zinc-300">{commitTotal}</span>
                </div>
                {genres.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800">
                    <span className="flex items-center gap-1 text-zinc-400 mb-2">
                      <Music size={12} /> Genres
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((g) => (
                        <span
                          key={g.genre_id}
                          className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300"
                        >
                          {g.genre_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Snapshots Tab ──────────────────────────────────────────── */}
      {activeTab === "commits" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold">Snapshot History</h2>
              <span className="text-sm text-zinc-400">
                {commitTotal} snapshot{commitTotal !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {compareMode && compareSelection[0] && compareSelection[1] && (
                <button
                  onClick={handleRunComparison}
                  className="flex items-center gap-1 rounded-md bg-glass-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-glass-blue-500"
                >
                  Compare
                </button>
              )}
              <button
                onClick={handleCompareToggle}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  compareMode
                    ? "border-glass-blue-500 bg-glass-blue-500/10 text-glass-blue-400"
                    : "border-zinc-700 text-zinc-400 hover:border-glass-blue-500 hover:text-glass-blue-400"
                }`}
              >
                <GitBranch size={12} />
                {compareMode ? "Cancel Compare" : "Compare Commits"}
              </button>
            </div>
          </div>

          {compareMode && !showComparison && (
            <div className="mb-4 rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-xs text-zinc-400">
              Select two snapshots to compare.
              {compareSelection[0] && !compareSelection[1] && " Now select the second snapshot."}
              {compareSelection[0] && compareSelection[1] && " Press Compare to view differences."}
            </div>
          )}

          {showComparison && compareSelection[0] && compareSelection[1] && (
            <div className="mb-4">
              <ABComparisonView
                owner={owner}
                repo={repo}
                baseSha={compareSelection[0]}
                headSha={compareSelection[1]}
              />
            </div>
          )}

          {commits.length === 0 ? (
            <p className="text-zinc-400">No snapshots recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {commits.map((c) => {
                const isExpanded = expandedSha === c.sha;
                const fileCount =
                  (c.files_added?.length ?? 0) +
                  (c.files_modified?.length ?? 0) +
                  (c.files_removed?.length ?? 0);
                const isBaseSelected = compareSelection[0] === c.sha;
                const isHeadSelected = compareSelection[1] === c.sha;

                return (
                  <div
                    key={c.sha}
                    className={`rounded-md border transition-colors ${
                      isBaseSelected || isHeadSelected
                        ? "border-glass-blue-500 bg-glass-blue-500/5"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div
                      className="flex cursor-pointer items-center justify-between px-4 py-3"
                      onClick={() =>
                        compareMode ? handleCompareSelect(c.sha) : handleToggleDiff(c.sha)
                      }
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                          <GitCommit size={14} className="text-zinc-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.message}</div>
                          <div className="text-xs text-zinc-400">
                            {c.author_name} · {timeAgo(c.timestamp)} ·{" "}
                            {fileCount > 0 && `${fileCount} file${fileCount !== 1 ? "s" : ""}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-zinc-400">{c.short_sha}</span>
                        {c.has_diff && (
                          <button
                            className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-glass-cyan-500 hover:text-glass-cyan-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleDiff(c.sha);
                            }}
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <Eye size={12} />}
                            {isExpanded ? "Hide Diff" : "View Changes"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-zinc-800 bg-zinc-900/30 px-4 py-4 space-y-4">
                        {(c.files_added?.length > 0 ||
                          c.files_modified?.length > 0 ||
                          c.files_removed?.length > 0) && (
                          <div className="grid gap-1 text-xs">
                            {c.files_added?.map((f) => (
                              <span key={`a-${f}`} className="flex items-center gap-1.5 text-success">
                                <FilePlus size={11} /> {f}
                              </span>
                            ))}
                            {c.files_modified?.map((f) => (
                              <span key={`m-${f}`} className="flex items-center gap-1.5 text-glass-blue-500">
                                <FileEdit size={11} /> {f}
                              </span>
                            ))}
                            {c.files_removed?.map((f) => (
                              <span key={`r-${f}`} className="flex items-center gap-1.5 text-error">
                                <FileMinus size={11} /> {f}
                              </span>
                            ))}
                          </div>
                        )}
                        <DiffTimeline
                          diffData={diffCache[c.sha]?.diff_data ?? null}
                          isLoading={diffLoading === c.sha}
                          error={diffError}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {commits.length < commitTotal && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-md border border-zinc-700 px-6 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-glass-cyan-500 hover:text-glass-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore
                      ? "Loading…"
                      : `Load More (${commits.length} of ${commitTotal})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Timeline Tab ─────────────────────────────────────────── */}
      {activeTab === "events" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Timeline</h2>
          {repoEvents.length === 0 ? (
            <p className="text-zinc-400">No activity recorded yet.</p>
          ) : (
            <div className="relative pl-8">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-700" />
              <div className="space-y-6">
                {repoEvents.map((ev) => {
                  const isCreate = ev.event_type.includes("create") || ev.event_type === "repository_created";
                  const isDelete = ev.event_type.includes("delete");
                  const isPush = ev.event_type.includes("push");
                  const dotColor = isDelete
                    ? "bg-red-500"
                    : isCreate
                    ? "bg-emerald-500"
                    : isPush
                    ? "bg-sky-500"
                    : "bg-zinc-500";
                  const IconComponent = isDelete
                    ? Trash2
                    : isCreate
                    ? FilePlus
                    : isPush
                    ? GitCommit
                    : Activity;

                  return (
                    <div key={ev.id} className="relative flex items-start gap-4">
                      <div
                        className={`absolute -left-8 top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full ${dotColor} ring-4 ring-zinc-900`}
                      >
                        <IconComponent size={8} className="text-white" />
                      </div>
                      <div className="shrink-0">
                        <UserAvatar src={null} alt={ev.actor} size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium text-zinc-200">{ev.actor}</span>
                          <span className="text-sm text-zinc-400">
                            {ev.event_type.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <Clock size={10} />
                          {timeAgo(ev.occurred_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Collaborators Tab ──────────────────────────────────────── */}
      {activeTab === "collaborators" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold flex items-center gap-2">
            <Users size={20} /> Collaborators
          </h2>
          {collabLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 rounded-lg bg-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : collaborators.length === 0 ? (
            <p className="text-zinc-400">No collaborators.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {collaborators.map((c) => (
                <div
                  key={c.login}
                  className="flex items-center gap-4 rounded-lg border border-zinc-800 p-4"
                >
                  <UserAvatar src={c.avatar_url} alt={c.display_name || c.username || c.login} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-200 truncate">
                      {c.display_name || c.username || c.login}
                    </div>
                    <div className="text-xs text-zinc-500 capitalize">{c.permission}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
