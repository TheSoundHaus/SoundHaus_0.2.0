"use client";

import Link from "next/link";
import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Users,
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
  ChevronDown,
  FilePlus,
  FileEdit,
  FileMinus,
  Eye,
  Search,
  Send,
  X,
  UserPlus,
  UserMinus,
} from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import SnippetUploader from "@/components/SnippetUploader";
import StemPlayer from "@/components/StemPlayer";
import GenreEditor from "@/components/GenreEditor";
import DiffView from "@/components/DiffView";
import UserAvatar from "@/components/UserAvatar";
import { deleteRepoAction, renameRepoAction, updateDescriptionAction } from "@/actions/repos";
import { inviteCollaboratorAction, cancelInvitationAction, removeCollaboratorAction } from "@/actions/invitations";
import { getCommits, getCommitDiff } from "@/lib/api/commits";
import { getRepoInvitations, listCollaborators, searchUsers } from "@/lib/api/invitations";
import type {
  RepoStats,
  RepoActivity,
  RepoEvents,
  Snippet,
  PushActivity,
  RepoEvent,
  Genre,
  SentInvitation,
  Collaborator,
  UserSearchResult,
  SnippetVersion,
} from "@/lib/types/api";
import type { CommitListResponse, CommitSummary, AlsDiffData } from "@/lib/api/commits";

interface RepoDetailClientProps {
  owner: string;
  repo: string;
  stats: RepoStats | null;
  activity: RepoActivity | null;
  events: RepoEvents | null;
  snippet: Snippet | null;
  allGenres: Genre[];
  initialCommits: CommitListResponse | null;
  initialStems: SnippetVersion | null;
}

export default function RepoDetailClient({
  owner,
  repo,
  stats,
  activity,
  events,
  snippet,
  allGenres,
  initialCommits,
  initialStems,
}: RepoDetailClientProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "commits" | "events" | "collaborators" | "settings"
  >("overview");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Track current snippet URL (updates after upload without full page reload)
  const [currentSnippetUrl, setCurrentSnippetUrl] = useState(snippet?.url ?? null);

  // Settings form state
  const [newName, setNewName] = useState(repo);
  const [description, setDescription] = useState(stats?.description ?? "");
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Commits state — deduplicate by SHA on init to guard against backend duplicates
  const [commits, setCommits] = useState<CommitSummary[]>(() => {
    const raw = initialCommits?.commits ?? [];
    const seen = new Set<string>();
    return raw.filter((c) => { if (seen.has(c.sha)) return false; seen.add(c.sha); return true; });
  });
  const [commitTotal, setCommitTotal] = useState(initialCommits?.total ?? 0);
  const [commitPage, setCommitPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Expanded commit (shows diff) — keyed by SHA
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, AlsDiffData | null>>({});
  const [diffLoading, setDiffLoading] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  const pushes: PushActivity[] = activity?.activity ?? [];
  const repoEvents: RepoEvent[] = events?.events ?? [];
  const genres = stats?.genres ?? [];
  const cloneCount = stats?.clone_count ?? 0;

  // Collaborators tab state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [repoInvitations, setRepoInvitations] = useState<SentInvitation[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [collabError, setCollabError] = useState<string | null>(null);
  const [expandedCollab, setExpandedCollab] = useState<string | null>(null);
  const [invitePermission, setInvitePermission] = useState<"write" | "admin">("write");

  // Fetch collaborators & invitations when tab is active
  const loadCollaboratorsData = useCallback(async () => {
    setCollabLoading(true);
    setCollabError(null);
    const [collabRes, invRes] = await Promise.all([
      listCollaborators(owner, repo),
      getRepoInvitations(repo),
    ]);
    if (collabRes.success) setCollaborators(collabRes.data ?? []);
    else setCollabError(collabRes.error);
    if (invRes.success) setRepoInvitations(invRes.data ?? []);
    setCollabLoading(false);
  }, [owner, repo]);

  useEffect(() => {
    if (activeTab === "collaborators") {
      loadCollaboratorsData();
    }
  }, [activeTab, loadCollaboratorsData]);

  // User search with debounce
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const res = await searchUsers(searchQuery);
      if (res.success) setSearchResults(res.data ?? []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Invite handler
  const handleInvite = useCallback(async (email: string) => {
    setInviteError(null);
    setInviteSuccess(null);
    startTransition(async () => {
      const result = await inviteCollaboratorAction(repo, email, invitePermission);
      if (result.success) {
        setInviteSuccess(`Invitation sent to ${email} as ${invitePermission === "admin" ? "Admin" : "Contributor"}`);
        setSearchQuery("");
        setSearchResults([]);
        loadCollaboratorsData();
      } else {
        setInviteError(result.error);
      }
    });
  }, [repo, invitePermission, loadCollaboratorsData]);

  // Cancel invite handler
  const handleCancelInvite = useCallback(async (invitationId: string) => {
    setInviteError(null);
    startTransition(async () => {
      const result = await cancelInvitationAction(invitationId);
      if (result.success) {
        loadCollaboratorsData();
      } else {
        setCollabError(result.error);
      }
    });
  }, [loadCollaboratorsData]);

  // Remove collaborator handler
  const handleRemoveCollaborator = useCallback(async (username: string) => {
    if (!confirm(`Remove ${username} from this project?`)) return;
    startTransition(async () => {
      const result = await removeCollaboratorAction(repo, username);
      if (result.success) {
        loadCollaboratorsData();
      } else {
        setCollabError(result.error);
      }
    });
  }, [repo, loadCollaboratorsData]);

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

  function handleSaveDescription(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    startTransition(async () => {
      const result = await updateDescriptionAction(owner, repo, description);
      if (result.success) {
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

  // Load more commits (pagination)
  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextPage = commitPage + 1;
    const result = await getCommits(owner, repo, nextPage, 20);
    if (result.success && result.data) {
      setCommits((prev) => {
        const seen = new Set(prev.map((c) => c.sha));
        const fresh = result.data.commits.filter((c) => !seen.has(c.sha));
        return [...prev, ...fresh];
      });
      setCommitTotal(result.data.total);
      setCommitPage(nextPage);
    }
    setLoadingMore(false);
  }, [owner, repo, commitPage]);

  // Toggle diff expansion for a commit
  const handleToggleDiff = useCallback(async (sha: string) => {
    // Collapse if already expanded
    if (expandedSha === sha) {
      setExpandedSha(null);
      setDiffError(null);
      return;
    }

    setExpandedSha(sha);
    setDiffError(null);

    // Return cached diff if available
    if (sha in diffCache) return;

    // Fetch diff from backend
    setDiffLoading(sha);
    const result = await getCommitDiff(owner, repo, sha);
    if (result.success && result.data) {
      setDiffCache((prev) => ({ ...prev, [sha]: result.data.diff }));
    } else {
      setDiffCache((prev) => ({ ...prev, [sha]: null }));
      if (!result.success) {
        setDiffError(result.error);
      }
    }
    setDiffLoading(null);
  }, [owner, repo, expandedSha, diffCache]);

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: FileText },
    { key: "commits" as const, label: "Snapshots", icon: GitCommit },
    { key: "events" as const, label: "Timeline", icon: Activity },
    { key: "collaborators" as const, label: "Collaborators", icon: Users },
    { key: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/repositories" className="hover:text-zinc-100 transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-zinc-200">{repo}</span>
      </div>

      {/* Repository Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-bold tracking-tight">{repo}</h1>
          {stats?.description && (
            <p className="mb-3 text-base text-zinc-400">{stats.description}</p>
          )}
          {stats && !stats.description && (
            <p className="mb-3 text-lg text-zinc-400">
              {stats.audio_snippet ? "Audio snippet available" : "No audio snippet"}
            </p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
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
      {currentSnippetUrl && (
        <div className="mb-8">
          <AudioPlayer src={currentSnippetUrl} />
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
                        <User size={14} /> User
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
              <h3 className="mb-4 text-lg font-semibold">Project Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Calendar size={12} /> Project
                  </span>
                  <span className="font-mono text-xs">{repo}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Commits Tab ────────────────────────────────────────────── */}
      {activeTab === "commits" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Snapshot History</h2>
            <span className="text-sm text-zinc-500">
              {commitTotal} snapshot{commitTotal !== 1 ? "s" : ""}
            </span>
          </div>

          {commits.length === 0 ? (
            <p className="text-zinc-500">No snapshots recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {commits.map((c) => {
                const isExpanded = expandedSha === c.sha;
                const fileCount =
                  (c.files_added?.length ?? 0) +
                  (c.files_modified?.length ?? 0) +
                  (c.files_removed?.length ?? 0);

                return (
                  <div key={c.sha} className="rounded-lg border border-zinc-800 overflow-hidden">
                    {/* Commit row */}
                    <div
                      className="flex items-start gap-4 px-4 py-3 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => c.has_diff && handleToggleDiff(c.sha)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 mt-0.5">
                        <GitCommit size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 font-medium text-zinc-200 truncate">
                          {c.message.split("\n")[0]}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <User size={11} /> {c.author_name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> {timeAgo(c.timestamp)}
                          </span>
                          {fileCount > 0 && (
                            <span className="flex items-center gap-1">
                              <FileText size={11} /> {fileCount} file{fileCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-zinc-500">
                          {c.short_sha}
                        </span>
                        {c.has_diff && (
                          <button
                            className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-glass-cyan-500 hover:text-glass-cyan-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleDiff(c.sha);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown size={12} />
                            ) : (
                              <Eye size={12} />
                            )}
                            {isExpanded ? "Hide Diff" : "View Changes"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded: file changes + diff view */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800 bg-zinc-900/30 px-4 py-4 space-y-4">
                        {/* File change lists */}
                        {(c.files_added?.length > 0 ||
                          c.files_modified?.length > 0 ||
                          c.files_removed?.length > 0) && (
                          <div className="grid gap-1 text-xs">
                            {c.files_added?.map((f) => (
                              <span
                                key={`a-${f}`}
                                className="flex items-center gap-1.5 text-success"
                              >
                                <FilePlus size={11} /> {f}
                              </span>
                            ))}
                            {c.files_modified?.map((f) => (
                              <span
                                key={`m-${f}`}
                                className="flex items-center gap-1.5 text-glass-blue-500"
                              >
                                <FileEdit size={11} /> {f}
                              </span>
                            ))}
                            {c.files_removed?.map((f) => (
                              <span
                                key={`r-${f}`}
                                className="flex items-center gap-1.5 text-error"
                              >
                                <FileMinus size={11} /> {f}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Diff view (arrangement visualization) */}
                        <DiffView
                          diffData={diffCache[c.sha] ?? null}
                          commit={c}
                          isLoading={diffLoading === c.sha}
                          error={diffError && expandedSha === c.sha ? diffError : null}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Load More button */}
              {commits.length < commitTotal && (
                <div className="pt-4 text-center">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="rounded-md border border-zinc-700 px-6 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-glass-cyan-500 hover:text-glass-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : `Load More (${commits.length} of ${commitTotal})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Events Tab ─────────────────────────────────────────────── */}
      {activeTab === "events" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Timeline</h2>
          {repoEvents.length === 0 ? (
            <p className="text-zinc-500">No activity recorded yet.</p>
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

      {/* ── Collaborators Tab ──────────────────────────────────────── */}
      {activeTab === "collaborators" && (
        <div className="space-y-8">
          {/* Error/Success banners */}
          {collabError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {collabError}
            </div>
          )}
          {inviteError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {inviteError}
            </div>
          )}
          {inviteSuccess && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              {inviteSuccess}
            </div>
          )}

          {/* Invite Collaborators Section */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <UserPlus size={18} /> Invite Collaborators
            </h2>

            {/* Single search bar with inline send button */}
            <div className="relative">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = searchQuery.trim();
                  if (value) handleInvite(value);
                }}
                className="flex gap-3"
              >
                <div className="relative flex-1">
                  <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2">
                    <Search size={16} className="text-zinc-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search by email or username…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 focus:outline-none text-sm"
                    />
                    {searchQuery && (
                      <button type="button" onClick={() => { setSearchQuery(""); setSearchResults([]); }}>
                        <X size={14} className="text-zinc-500 hover:text-zinc-300" />
                      </button>
                    )}
                  </div>

                  {/* Search results dropdown */}
                  {(searchResults.length > 0 || searchLoading) && searchQuery.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-lg max-h-48 overflow-y-auto">
                      {searchLoading ? (
                        <div className="px-4 py-3 text-sm text-zinc-500">Searching…</div>
                      ) : (
                        searchResults.map((u) => (
                          <div
                            key={u.username}
                            className="flex items-center justify-between px-4 py-2 hover:bg-zinc-800 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <UserAvatar src={u.avatar_url} alt={u.username} size={20} />
                              <div>
                                <div className="text-sm font-medium text-zinc-200">{u.username}</div>
                                <div className="text-xs text-zinc-500">{u.email}</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleInvite(u.email)}
                              disabled={isPending}
                              className="flex items-center gap-1 rounded border border-zinc-600 px-3 py-1 text-xs text-zinc-300 transition-colors hover:border-glass-cyan-500 hover:text-glass-cyan-500 disabled:opacity-50"
                            >
                              <Send size={11} /> Invite
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isPending || !searchQuery.trim()}
                  className="flex items-center gap-2 rounded-md bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
                >
                  <Send size={14} /> Send Invite
                </button>
              </form>

              {/* Role selector */}
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-zinc-400">Invite as:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInvitePermission("write")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      invitePermission === "write"
                        ? "border-glass-cyan-500 bg-glass-cyan-500/10 text-glass-cyan-500"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    Contributor
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvitePermission("admin")}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      invitePermission === "admin"
                        ? "border-amber-500 bg-amber-500/10 text-amber-400"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    Admin
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Invitations */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <Clock size={18} /> Pending Invitations
            </h2>
            {collabLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : repoInvitations.filter((i) => i.status === "pending").length === 0 ? (
              <p className="text-sm text-zinc-500">No pending invitations.</p>
            ) : (
              <div className="space-y-3">
                {repoInvitations
                  .filter((i) => i.status === "pending")
                  .map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-md border border-zinc-700/50 bg-zinc-800/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500">
                          <Send size={14} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-200">
                            {inv.invitee_email}
                          </div>
                          <div className="text-xs text-zinc-500">
                            Sent {timeAgo(inv.created_at)} · {inv.permission} access
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelInvite(inv.id)}
                        disabled={isPending}
                        className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Active Collaborators */}
          <div className="rounded-lg border border-zinc-800 p-6">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <Users size={18} /> Active Collaborators
            </h2>
            {collabLoading ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : collaborators.length === 0 ? (
              <p className="text-sm text-zinc-500">No collaborators yet. Invite someone above!</p>
            ) : (
              <div className="space-y-3">
                {collaborators.map((c) => {
                  const isExpanded = expandedCollab === c.login;
                  return (
                    <div
                      key={c.login}
                      className="rounded-md border border-zinc-700/50 bg-zinc-800/30 overflow-hidden"
                    >
                      {/* Main row */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedCollab(isExpanded ? null : c.login)}
                          className="flex items-center gap-3 text-left group"
                        >
                          <UserAvatar src={c.avatar_url} alt={c.username} size={40} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-white">{c.username}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  c.permission === "admin"
                                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                    : "bg-glass-cyan-500/10 text-glass-cyan-500 border border-glass-cyan-500/30"
                                }`}
                              >
                                {c.permission === "admin" ? "Admin" : "Contributor"}
                              </span>
                            </div>
                            <div className="text-sm text-zinc-500">{c.display_name || c.email || ""}</div>
                          </div>
                          <ChevronDown
                            size={14}
                            className={`ml-1 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                        <button
                          onClick={() => handleRemoveCollaborator(c.login)}
                          disabled={isPending}
                          className="flex items-center gap-1 rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                          <UserMinus size={11} /> Remove
                        </button>
                      </div>

                      {/* Expanded dropdown */}
                      {isExpanded && (
                        <div className="border-t border-zinc-700/50 bg-zinc-900/40 px-5 py-4 space-y-3">
                          {c.bio ? (
                            <div>
                              <div className="text-xs font-medium text-zinc-400 mb-1">Bio</div>
                              <p className="text-sm text-zinc-300 leading-relaxed">{c.bio}</p>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600 italic">No bio provided.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invitation History (accepted/declined) */}
          {repoInvitations.filter((i) => i.status !== "pending").length > 0 && (
            <div className="rounded-lg border border-zinc-800 p-6">
              <h2 className="mb-4 text-xl font-semibold">Invitation History</h2>
              <div className="space-y-3">
                {repoInvitations
                  .filter((i) => i.status !== "pending")
                  .map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between rounded-md border border-zinc-700/50 bg-zinc-800/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-full ${
                            inv.status === "accepted"
                              ? "bg-green-500/10 text-green-500"
                              : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          <User size={14} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-200">
                            {inv.invitee_email}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {inv.status === "accepted" ? "Accepted" : "Declined"}{" "}
                            {inv.responded_at ? timeAgo(inv.responded_at) : ""}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          inv.status === "accepted"
                            ? "bg-green-500/10 text-green-400"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ───────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <h2 className="mb-6 text-2xl font-semibold">Project Settings</h2>

          {/* Settings error banner */}
          {settingsError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {settingsError}
            </div>
          )}

          <div className="space-y-6">
            {/* 1. Project Name */}
            <form onSubmit={handleRename}>
              <label className="mb-2 block text-sm font-medium">
                Project Name
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

            {/* 2. Description */}
            <form onSubmit={handleSaveDescription}>
              <label className="mb-2 block text-sm font-medium">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your project…"
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-glass-blue focus:outline-none resize-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">{description.length}/500</span>
                <button
                  type="submit"
                  disabled={isPending || description === (stats?.description ?? "")}
                  className="flex items-center gap-2 rounded-md bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={14} /> Save Description
                </button>
              </div>
            </form>

            {/* 2. Genre Selector */}
            <GenreEditor
              owner={owner}
              repo={repo}
              allGenres={allGenres}
              currentGenres={stats?.genres ?? []}
            />

            {/* 3. Snippet History → 4. Stem Separation (middleContent) → 5. Replace Snippet drop zone */}
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
              onUpdate={(newUrl) => {
                setCurrentSnippetUrl(newUrl);
                router.refresh();
              }}
              middleContent={
                <StemPlayer
                  owner={owner}
                  repo={repo}
                  snippetUrl={currentSnippetUrl}
                  initialStems={initialStems}
                />
              }
            />

            {/* 6. Delete project — bottom right */}
            <div className="flex justify-end pt-4 border-t border-zinc-800">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete Project
              </button>
            </div>

            {/* 7. Quick Settings Bar */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Quick Settings
              </h3>
              <div className="flex flex-wrap gap-3">
                {/* Privacy toggle */}
                <div className="flex items-center gap-3 rounded-md border border-zinc-700 bg-zinc-800/60 px-4 py-2.5">
                  <Lock size={14} className="text-zinc-400" />
                  <span className="text-sm text-zinc-300">Private Project</span>
                  <span className="ml-1 rounded bg-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                    Always
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
