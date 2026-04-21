"use client";

import Link from "next/link";
import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Users,
  Lock,
  LockOpen,
  GitCommit,
  Download,
  Music,
  Calendar,
  GitBranch,
  Activity,
  Settings,
  FileText,
  FileEdit,
  Clock,
  Trash2,
  Save,
  ChevronDown,
  FilePlus,
  Eye,
  Send,
  UserPlus,
  BookOpen,
} from "lucide-react";
import AudioPlayer from "@/components/AudioPlayer";
import SnippetUploader from "@/components/SnippetUploader";
import StemPlayer from "@/components/StemPlayer";
import GenreEditor from "@/components/GenreEditor";
import ThumbnailSettings from "@/components/ThumbnailSettings";
import { DiffTimeline } from "@/components/diff/DiffTimeline";
import { ABComparisonView } from "@/components/diff/ABComparisonView";
import UserAvatar from "@/components/UserAvatar";
import RemixIcon from "@/components/RemixIcon";
import CloneModal from "@/components/CloneModal";
import Markdown from "react-markdown";
import { useUser } from "@/lib/context/UserContext";
import { getReadme, updateReadme } from "@/lib/api/readme";
import {
  deleteRepoAction,
  updateVisibilityAction,
  forkRepoAction,
  toggleOpenToCollabAction,
  listCollaborationRequestsAction,
  dismissCollaborationRequestAction,
} from "@/actions/repos";
import type { CollaborationRequestRow } from "@/lib/api/repos";
import { inviteCollaboratorAction, cancelInvitationAction, removeCollaboratorAction } from "@/actions/invitations";
import { getCommits, getCommitDiff, getDiffStatus } from "@/lib/api/commits";
import { getRepoInvitations, listCollaborators } from "@/lib/api/invitations";
import { getRepoEvents } from "@/lib/api/webhooks";
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
  SnippetVersion,
} from "@/lib/types/api";
import type { CommitListResponse, CommitSummary, AlsDiffData, DiffStatus } from "@/lib/api/commits";

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
  ownerYoutube: string | null;
  ownerSpotify: string | null;
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
  ownerYoutube,
  ownerSpotify,
}: RepoDetailClientProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "commits" | "events" | "about" | "settings"
  >("overview");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { user } = useUser();

  // Track current snippet URL (updates after upload without full page reload)
  const [currentSnippetUrl, setCurrentSnippetUrl] = useState(snippet?.url ?? null);

  // README editor state
  const [readmeContent, setReadmeContent] = useState("");
  const [readmeDraft, setReadmeDraft] = useState("");
  const [readmeTab, setReadmeTab] = useState<"edit" | "preview">("preview");
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeSaving, setReadmeSaving] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const readmeLoadedRef = useRef(false);

  // Settings form state
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(stats?.private ?? true);

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

  // A/B Comparison state
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<[string | null, string | null]>([null, null]);
  const [showComparison, setShowComparison] = useState(false);

  // Clone/Remix
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [remixHovered, setRemixHovered] = useState(false);
  const [joinRequests, setJoinRequests] = useState<CollaborationRequestRow[]>([]);

  // Fork state
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  function handleCompareToggle() {
    if (compareMode) {
      // Exit compare mode
      setCompareMode(false);
      setCompareSelection([null, null]);
      setShowComparison(false);
    } else {
      setCompareMode(true);
      setExpandedSha(null); // close any expanded diff
    }
  }

  function handleCompareSelect(sha: string) {
    setCompareSelection((prev) => {
      if (prev[0] === sha) return [null, prev[1]];
      if (prev[1] === sha) return [prev[0], null];
      if (!prev[0]) return [sha, prev[1]];
      if (!prev[1]) return [prev[0], sha];
      // Both filled — replace the second
      return [prev[0], sha];
    });
    setShowComparison(false);
  }

  function handleRunComparison() {
    if (compareSelection[0] && compareSelection[1]) {
      setShowComparison(true);
    }
  }

  const pushes: PushActivity[] = activity?.activity ?? [];
  const [repoEvents, setRepoEvents] = useState<RepoEvent[]>(events?.events ?? []);
  const genres = stats?.genres ?? [];
  const cloneCount = stats?.clone_count ?? 0;
  const ownerDisplayName = stats?.owner_username || owner;

  // Refresh timeline events from the server
  const refreshEvents = useCallback(async () => {
    try {
      const res = await getRepoEvents(owner, repo);
      if (res.success && res.data) setRepoEvents(res.data.events ?? []);
    } catch { /* Network failure — stale data is fine */ }
  }, [owner, repo]);

  // Collaborators tab state
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [repoInvitations, setRepoInvitations] = useState<SentInvitation[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [collabError, setCollabError] = useState<string | null>(null);

  // Derive the current user's role relative to this repo
  const isOwner = !!(user?.id && stats?.owner_id && user.id === stats.owner_id);
  const isCollaborator =
    !isOwner &&
    collaborators.some(
      (c) =>
        c.login === user?.id ||
        (!!user?.username && (c.username === user.username || c.login === user.username)),
    );
  const canWrite = isOwner || isCollaborator;
  const pendingInvite = !!stats?.viewer_pending_invite;
  const [openToCollab, setOpenToCollab] = useState(stats?.open_to_collab ?? false);

  const loadCollaboratorsOnly = useCallback(async () => {
    const collabRes = await listCollaborators(owner, repo);
    if (collabRes.success) setCollaborators(collabRes.data ?? []);
    else setCollabError(collabRes.error);
  }, [owner, repo]);

  const loadOwnerInvitesAndRequests = useCallback(async () => {
    if (!isOwner) return;
    setCollabLoading(true);
    setCollabError(null);
    const [invRes, reqRes] = await Promise.all([
      getRepoInvitations(owner, repo),
      listCollaborationRequestsAction(owner, repo),
    ]);
    if (invRes.success) setRepoInvitations(invRes.data ?? []);
    else setCollabError(invRes.error);
    if (reqRes.success) setJoinRequests(reqRes.requests ?? []);
    else if (!reqRes.success) setCollabError(reqRes.error);
    setCollabLoading(false);
  }, [isOwner, owner, repo]);

  useEffect(() => {
    loadCollaboratorsOnly();
  }, [loadCollaboratorsOnly]);

  useEffect(() => {
    if (activeTab === "settings" && isOwner) {
      loadOwnerInvitesAndRequests();
    }
    if (activeTab === "events") {
      refreshEvents();
    }
    if ((activeTab === "overview" || activeTab === "settings") && !readmeLoadedRef.current) {
      readmeLoadedRef.current = true;
      setReadmeLoading(true);
      getReadme(owner, repo)
        .then((res) => {
          if (res.success) {
            setReadmeContent(res.data);
            setReadmeDraft(res.data);
          }
        })
        .finally(() => setReadmeLoading(false));
    }
  }, [activeTab, loadOwnerInvitesAndRequests, refreshEvents, owner, repo, isOwner]);

  const refreshCollabState = useCallback(async () => {
    await loadCollaboratorsOnly();
    await loadOwnerInvitesAndRequests();
  }, [loadCollaboratorsOnly, loadOwnerInvitesAndRequests]);

  // Invite handler
  const handleInvite = useCallback(async (email: string) => {
    setInviteError(null);
    setInviteSuccess(null);
    startTransition(async () => {
      const result = await inviteCollaboratorAction(owner, repo, email, "write");
      if (result.success) {
        setInviteSuccess(`Invitation sent to ${email}`);
        refreshCollabState();
      } else {
        setInviteError(result.error);
      }
    });
  }, [owner, repo, refreshCollabState]);

  // Cancel invite handler
  const handleCancelInvite = useCallback(async (invitationId: string) => {
    setInviteError(null);
    startTransition(async () => {
      const result = await cancelInvitationAction(invitationId);
      if (result.success) {
        refreshCollabState();
      } else {
        setCollabError(result.error);
      }
    });
  }, [refreshCollabState]);

  // Remove collaborator handler
  const handleRemoveCollaborator = useCallback(async (username: string) => {
    if (!confirm(`Remove ${username} from this project?`)) return;
    startTransition(async () => {
      const result = await removeCollaboratorAction(owner, repo, username);
      if (result.success) {
        loadCollaboratorsOnly();
      } else {
        setCollabError(result.error);
      }
    });
  }, [owner, repo, loadCollaboratorsOnly]);

  // Fork handler — creates a copy of the project in the user's namespace
  const handleFork = useCallback(async () => {
    setForking(true);
    setForkError(null);
    try {
      const result = await forkRepoAction(owner, repo);
      if (result.success && result.fork) {
        router.push(`/repository/${result.fork.owner}/${result.fork.name}`);
      } else if (!result.success) {
        setForkError(result.error);
      }
    } catch {
      setForkError("Something went wrong. Please try again.");
    } finally {
      setForking(false);
    }
  }, [owner, repo, router]);

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

  // Poll for pending diffs — when commits have diff_status="pending", poll the
  // lightweight /diff-status endpoint every 3s until they resolve to "ready".
  // Stop after 2 minutes to avoid infinite polling if diff never arrives.
  const pendingStartRef = useRef<number | null>(null);
  useEffect(() => {
    const pendingShas = commits
      .filter((c) => c.diff_status === "pending")
      .map((c) => c.sha);

    if (pendingShas.length === 0) {
      pendingStartRef.current = null;
      return;
    }

    if (pendingStartRef.current === null) {
      pendingStartRef.current = Date.now();
    }

    const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

    const interval = setInterval(async () => {
      // Stop polling after timeout
      if (pendingStartRef.current && Date.now() - pendingStartRef.current > POLL_TIMEOUT_MS) {
        setCommits((prev) =>
          prev.map((c) =>
            pendingShas.includes(c.sha)
              ? { ...c, diff_status: "none" as DiffStatus }
              : c
          )
        );
        pendingStartRef.current = null;
        return;
      }

      const result = await getDiffStatus(owner, repo, pendingShas);
      if (!result.success || !result.data) return;

      const { statuses } = result.data;
      const resolvedShas: string[] = [];
      const readyShas: string[] = [];

      for (const [sha, s] of Object.entries(statuses)) {
        if (s === "ready") { resolvedShas.push(sha); readyShas.push(sha); }
        else if (s === "none") { resolvedShas.push(sha); }
      }

      if (resolvedShas.length > 0) {
        setCommits((prev) =>
          prev.map((c) =>
            readyShas.includes(c.sha)
              ? { ...c, has_diff: true, diff_status: "ready" as DiffStatus }
              : resolvedShas.includes(c.sha)
              ? { ...c, diff_status: "none" as DiffStatus }
              : c
          )
        );
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [owner, repo, commits]);

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: FileText },
    { key: "commits" as const, label: "Snapshots", icon: GitCommit },
    { key: "about" as const, label: "About", icon: BookOpen },
    { key: "events" as const, label: "Timeline", icon: Activity },
    ...(isOwner ? [{ key: "settings" as const, label: "Settings", icon: Settings }] : []),
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
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <User size={14} />{" "}
              <Link href={`/profile/${stats?.owner_username || owner}`} className="hover:text-[#A7C7E7] transition-colors">{ownerDisplayName}</Link>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              {isPrivate ? <Lock size={14} /> : <LockOpen size={14} />} {isPrivate ? "Private" : "Public"}
            </span>
            {!isPrivate && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Download size={14} /> {cloneCount} remixes
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex max-w-md flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCloneModal(true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-300 hover:bg-white/[0.1] hover:border-white/20"
            >
              <Download size={16} />
              Clone
            </button>
            {!isPrivate && user && !isOwner && !isCollaborator && (
              <button
                type="button"
                onClick={() => void handleFork()}
                disabled={forking}
                onMouseEnter={() => setRemixHovered(true)}
                onMouseLeave={() => setRemixHovered(false)}
                className="group relative flex items-center justify-center overflow-hidden rounded-lg bg-glass-blue px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-glass-blue/25 transition-all duration-300 hover:bg-glass-blue/90 hover:shadow-xl hover:shadow-glass-blue/40 active:scale-95 disabled:opacity-50"
                style={{ minWidth: "120px" }}
              >
                <span className="relative flex w-full items-center justify-center" style={{ height: "20px" }}>
                  <span
                    className="absolute inline-flex items-center justify-center"
                    style={{
                      transform: remixHovered || forking ? "translateX(26px)" : "translateX(-26px)",
                      transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <RemixIcon hovered={remixHovered || forking} size={18} />
                  </span>
                  <span
                    className="absolute inline-flex items-center justify-center whitespace-nowrap"
                    style={{
                      transform: remixHovered || forking ? "translateX(-14px)" : "translateX(14px)",
                      transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    {forking ? "Remixing…" : "Remix"}
                  </span>
                </span>
              </button>
            )}

            {forkError && (
              <span className="self-center text-xs text-red-400">{forkError}</span>
            )}
          </div>
          {pendingInvite && !isOwner && !isCollaborator && user && (
            <p className="text-right text-sm text-amber-400/90">
              You have a pending invitation for this project.
            </p>
          )}
        </div>
      </div>

      {/* Remixed from banner */}
      {stats?.fork_parent && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-glass-blue/20 bg-glass-blue/5 px-4 py-2.5 text-sm text-zinc-300">
          <GitBranch size={14} className="text-glass-blue" />
          Remixed from{" "}
          <Link
            href={`/explore/${stats.fork_parent.owner}/${stats.fork_parent.repo}`}
            className="font-medium text-glass-blue hover:underline"
          >
            {stats.fork_parent.owner}/{stats.fork_parent.repo}
          </Link>
        </div>
      )}

      {/* Fork error banner */}
      {forkError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {forkError}
        </div>
      )}

      {/* Clone Modal */}
      {showCloneModal && (
        <CloneModal
          owner={owner}
          repo={repo}
          cloneUrl={stats?.clone_url}
          onClose={() => setShowCloneModal(false)}
        />
      )}

      {/* Audio Player */}
      {currentSnippetUrl && (
        <div className="mb-8" data-snippet-player>
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
            <div className="glass-card rounded-lg p-6">
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

            {/* Recent Push Activity */}
            <div className="glass-card rounded-lg p-6">
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
                      <div className="font-mono text-sm text-zinc-400">
                        {p.after_sha ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* README Preview */}
            <div className="glass-card rounded-lg p-6">
              <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
                <BookOpen size={16} /> About
              </h2>
              {readmeLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-3/4 rounded bg-zinc-800" />
                  <div className="h-4 w-1/2 rounded bg-zinc-800" />
                  <div className="h-4 w-5/6 rounded bg-zinc-800" />
                </div>
              ) : (
                <div className="prose prose-invert prose-zinc max-w-none">
                  {readmeContent ? (
                    <Markdown>{readmeContent}</Markdown>
                  ) : (
                    <p className="text-zinc-500 italic">
                      No README yet. Add a description in Settings.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Thumbnail */}
            {stats?.thumbnail_url && stats.thumbnail_type === "image" && (
              <div className="glass-card rounded-lg overflow-hidden">
                <img
                  src={stats.thumbnail_url}
                  alt={`${repo} thumbnail`}
                  className="w-full object-cover"
                />
              </div>
            )}

            {/* Social Links (YouTube / Spotify) */}
            {(ownerYoutube || ownerSpotify) && (
              <div className="flex items-center gap-3">
                {ownerYoutube && (
                  <a
                    href={ownerYoutube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all"
                    title="YouTube"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    YouTube
                  </a>
                )}
                {ownerSpotify && (
                  <a
                    href={ownerSpotify}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 hover:text-green-400 hover:border-green-500/30 transition-all"
                    title="Spotify"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    Spotify
                  </a>
                )}
              </div>
            )}

            {/* Recent Remixes — only shown on public repos */}
            {!isPrivate && (
            <div className="glass-card rounded-lg p-6">
              <h3 className="mb-4 text-lg font-semibold">Recent Remixes</h3>
              {stats && stats.recent_clones.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_clones.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-zinc-300">
                        <User size={14} /> User
                      </span>
                      <span className="text-zinc-400">{timeAgo(c.cloned_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No remixes yet.</p>
              )}
            </div>
            )}

            {/* Project Info */}
            <div className="glass-card rounded-lg p-6">
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
                  <span className="text-xs text-zinc-300">
                    <Link href={`/profile/${stats?.owner_username || owner}`} className="hover:text-[#A7C7E7] transition-colors">{ownerDisplayName}</Link>
                  </span>
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

      {/* ── Commits Tab ────────────────────────────────────────────── */}
      {activeTab === "commits" && (
        <div className="glass-card rounded-lg p-6">
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

          {/* Compare mode hint */}
          {compareMode && !showComparison && (
            <div className="mb-4 rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-xs text-zinc-400">
              Select two snapshots to compare.
              {compareSelection[0] && !compareSelection[1] && " Now select the second snapshot."}
              {compareSelection[0] && compareSelection[1] && " Press Compare to view differences."}
            </div>
          )}

          {/* AB Comparison View */}
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

                return (
                  <div key={c.sha} className="glass-card rounded-lg overflow-hidden transition-all duration-200 hover:border-white/[0.10]">
                    {/* Commit row */}
                    <div
                      className="flex items-start gap-4 px-4 py-3 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      onClick={() => compareMode ? handleCompareSelect(c.sha) : ((c.has_diff || c.diff_status === "ready") && handleToggleDiff(c.sha))}
                    >
                      {/* Compare checkbox */}
                      {compareMode && (
                        <div className="flex items-center pt-1">
                          <div
                            className={`h-4 w-4 rounded border transition-colors ${
                              compareSelection.includes(c.sha)
                                ? "border-glass-blue-500 bg-glass-blue-500"
                                : "border-zinc-600 hover:border-zinc-400"
                            }`}
                          >
                            {compareSelection.includes(c.sha) && (
                              <svg viewBox="0 0 16 16" className="h-4 w-4 text-white">
                                <path fill="currentColor" d="M6.5 11.5L3 8l1-1 2.5 2.5L11 5l1 1z" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}
                      {c.author_avatar_url ? (
                        <img
                          src={c.author_avatar_url}
                          alt={c.author_name}
                          className="h-9 w-9 shrink-0 rounded-full object-cover mt-0.5"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 mt-0.5">
                          <GitCommit size={15} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 font-medium text-zinc-200 truncate">
                          {c.message.split("\n")[0]}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
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
                        <span className="font-mono text-xs text-zinc-400">
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
                        {c.diff_status === "pending" && !c.has_diff && (
                          <span className="flex items-center gap-1.5 rounded border border-zinc-700/60 px-2 py-1 text-[11px] text-zinc-500">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400/70 animate-pulse" />
                            Processing…
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded: file changes + diff view */}
                    {isExpanded && (
                      <div className="border-t border-zinc-800/50 bg-zinc-900/20 px-2 py-3 space-y-3">
                        {/* Track change summary (derived from diff data) */}
                        {diffCache[c.sha]?.diff_data?.tracks && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {diffCache[c.sha]!.diff_data!.tracks
                              .filter((t) => t.changeType !== "unchanged")
                              .map((t) => (
                                <span
                                  key={t.trackId}
                                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                                    t.changeType === "added"
                                      ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                                      : t.changeType === "removed"
                                      ? "border-red-700/40 bg-red-900/20 text-red-400"
                                      : "border-blue-700/40 bg-blue-900/20 text-blue-400"
                                  }`}
                                >
                                  {t.changeType === "added" ? "+" : t.changeType === "removed" ? "−" : "~"}
                                  {" "}
                                  {t.instrument && /^\d+[-\s]/.test(t.trackName) ? t.instrument : t.trackName}
                                  <span className="text-zinc-500 text-[10px] uppercase">{t.trackType}</span>
                                </span>
                              ))}
                          </div>
                        )}

                        {/* Diff view (arrangement visualization) */}
                        <DiffTimeline
                          diffData={diffCache[c.sha]?.diff_data ?? null}
                          commitSha={c.sha}
                          commitMsg={c.message}
                          isLoading={diffLoading === c.sha}
                          error={diffError && expandedSha === c.sha ? diffError : null}
                          repoOwner={owner}
                          repoName={repo}
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
      {activeTab === "events" && (() => {
        // Build unified timeline from push activity + repo events
        type TimelineItem = {
          id: string;
          kind: "push" | "event";
          timestamp: string | null;
          actor: string;
          actorAvatar?: string | null;
          eventType: string;
          detail?: string | null;
          commitMessage?: string | null;
          commitCount?: number;
          afterSha?: string | null;
          ref?: string;
        };

        const items: TimelineItem[] = [];

        // Add push events
        for (const p of pushes) {
          items.push({
            id: `push-${p.id}`,
            kind: "push",
            timestamp: p.pushed_at,
            actor: p.pusher,
            actorAvatar: p.pusher_avatar ?? null,
            eventType: "push",
            commitMessage: p.commit_message,
            commitCount: p.commit_count,
            afterSha: p.after_sha,
            ref: p.ref,
          });
        }

        // Add repo events (branch/tag, collab, snippet)
        for (const ev of repoEvents) {
          items.push({
            id: `event-${ev.id}`,
            kind: "event",
            timestamp: ev.occurred_at,
            actor: ev.actor,
            actorAvatar: ev.actor_avatar ?? null,
            eventType: ev.event_type,
            detail: ev.detail,
          });
        }

        // Sort descending by timestamp
        items.sort((a, b) => {
          const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return tb - ta;
        });

        // Group by date bucket
        type DateGroup = { label: string; items: TimelineItem[] };
        const groups: DateGroup[] = [];
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(todayStart.getTime() - 86400000);
        const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

        function bucketLabel(iso: string | null): string {
          if (!iso) return "Earlier";
          const d = new Date(iso);
          if (d >= todayStart) return "Today";
          if (d >= yesterdayStart) return "Yesterday";
          if (d >= weekStart) return "This Week";
          return "Earlier";
        }

        for (const item of items) {
          const label = bucketLabel(item.timestamp);
          const last = groups[groups.length - 1];
          if (last && last.label === label) {
            last.items.push(item);
          } else {
            groups.push({ label, items: [item] });
          }
        }

        // Icon + color helpers
        function getEventStyle(eventType: string) {
          if (eventType === "push") return { color: "bg-sky-500", Icon: GitCommit };
          if (eventType.includes("create") || eventType === "repository_created") return { color: "bg-emerald-500", Icon: FilePlus };
          if (eventType.includes("delete")) return { color: "bg-red-500", Icon: Trash2 };
          if (eventType === "collaborator_joined") return { color: "bg-violet-500", Icon: UserPlus };
          if (eventType === "collaborator_invited") return { color: "bg-amber-500", Icon: Send };
          if (eventType === "snippet_updated") return { color: "bg-pink-500", Icon: Music };
          return { color: "bg-zinc-500", Icon: Activity };
        }

        function formatEventLabel(item: TimelineItem): string {
          if (item.kind === "push") {
            const branch = item.ref?.replace("refs/heads/", "") ?? "main";
            return `pushed ${item.commitCount ?? 1} commit${(item.commitCount ?? 1) > 1 ? "s" : ""} to ${branch}`;
          }
          return item.eventType.replaceAll("_", " ");
        }

        return (
          <div className="glass-card rounded-lg p-6">
            <h2 className="mb-6 text-2xl font-semibold">Timeline</h2>
            {items.length === 0 ? (
              <p className="text-zinc-400">No activity recorded yet.</p>
            ) : (
              <div className="space-y-8">
                {groups.map((group) => (
                  <div key={group.label}>
                    {/* Date group header */}
                    <div className="mb-4 flex items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-zinc-700/50" />
                    </div>

                    <div className="relative pl-8">
                      {/* Vertical connector line */}
                      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-700" />

                      <div className="space-y-5">
                        {group.items.map((item) => {
                          const { color, Icon } = getEventStyle(item.eventType);
                          return (
                            <div key={item.id} className="relative flex items-start gap-4">
                              {/* Timeline dot */}
                              <div
                                className={`absolute -left-8 top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full ${color} ring-4 ring-zinc-900`}
                              >
                                <Icon size={8} className="text-white" />
                              </div>

                              {/* Avatar */}
                              <div className="shrink-0">
                                <UserAvatar src={item.actorAvatar ?? null} alt={item.actor} name={item.actor} size={32} />
                              </div>

                              {/* Event details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="font-medium text-zinc-200">{item.actor}</span>
                                  <span className="text-sm text-zinc-400">
                                    {formatEventLabel(item)}
                                  </span>
                                  {item.afterSha && (
                                    <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-[#A7C7E7]">
                                      {item.afterSha}
                                    </code>
                                  )}
                                </div>

                                {/* Commit message preview */}
                                {item.commitMessage && (
                                  <p className="mt-1 truncate text-sm text-zinc-400 italic">
                                    &ldquo;{item.commitMessage}&rdquo;
                                  </p>
                                )}

                                {/* Detail line for collab/snippet events */}
                                {item.detail && (
                                  <p className="mt-0.5 text-xs text-zinc-500">{item.detail}</p>
                                )}

                                <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                                  <Clock size={10} />
                                  {timeAgo(item.timestamp)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── About Tab (README) ──────────────────────────────────────── */}
      {activeTab === "about" && (
        <div className="rounded-lg border border-zinc-800 p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">About</h2>

            {/* Edit/Preview toggle (only for owner or collaborator) */}
            {user && (
              <div className="flex rounded-md border border-zinc-700 overflow-hidden">
                <button
                  onClick={() => setReadmeTab("preview")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    readmeTab === "preview"
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Eye size={14} className="mr-1.5 inline" />
                  Preview
                </button>
                <button
                  onClick={() => setReadmeTab("edit")}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    readmeTab === "edit"
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <FileEdit size={14} className="mr-1.5 inline" />
                  Edit
                </button>
              </div>
            )}
          </div>

          {readmeError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {readmeError}
            </div>
          )}

          {readmeLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 w-3/4 rounded bg-zinc-800" />
              <div className="h-4 w-1/2 rounded bg-zinc-800" />
              <div className="h-4 w-5/6 rounded bg-zinc-800" />
              <div className="h-4 w-2/3 rounded bg-zinc-800" />
            </div>
          ) : readmeTab === "preview" ? (
            /* Markdown preview */
            <div className="prose prose-invert prose-zinc max-w-none">
              {readmeContent ? (
                <Markdown>{readmeContent}</Markdown>
              ) : (
                <p className="text-zinc-500 italic">
                  No README yet. Switch to Edit to add a description for this project.
                </p>
              )}
            </div>
          ) : (
            /* Edit mode */
            <div className="space-y-4">
              <textarea
                value={readmeDraft}
                onChange={(e) => setReadmeDraft(e.target.value)}
                placeholder="Write a description for your project using Markdown..."
                className="w-full min-h-[300px] rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500 resize-y"
                maxLength={50000}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {readmeDraft.length.toLocaleString()} / 50,000 characters · Markdown supported
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setReadmeDraft(readmeContent);
                      setReadmeTab("preview");
                    }}
                    className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={readmeSaving || readmeDraft === readmeContent}
                    onClick={async () => {
                      setReadmeSaving(true);
                      setReadmeError(null);
                      try {
                        const res = await updateReadme(owner, repo, readmeDraft);
                        if (res.success) {
                          setReadmeContent(res.data);
                          setReadmeTab("preview");
                        } else {
                          setReadmeError(res.error);
                        }
                      } catch {
                        setReadmeError("Failed to save README");
                      } finally {
                        setReadmeSaving(false);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
                  >
                    <Save size={14} />
                    {readmeSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ───────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div className="glass-card rounded-lg p-6">
          <h2 className="mb-6 text-2xl font-semibold">Project Settings</h2>

          {/* Settings error banner */}
          {settingsError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {settingsError}
            </div>
          )}
          {inviteSuccess && (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              {inviteSuccess}
            </div>
          )}
          {inviteError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {inviteError}
            </div>
          )}
          {collabError && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {collabError}
            </div>
          )}

          <div className="space-y-6">
            {/* 1. Genre Selector */}
            <GenreEditor
              owner={owner}
              repo={repo}
              allGenres={allGenres}
              currentGenres={stats?.genres ?? []}
            />

            {/* 2.5. Thumbnail Settings */}
            <ThumbnailSettings
              owner={owner}
              repo={repo}
              initialUrl={stats?.thumbnail_url ?? null}
              initialType={stats?.thumbnail_type ?? null}
            />

            {/* 2.6. Visibility Toggle */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Lock size={14} /> Visibility
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-200">
                    {isPrivate ? "Private" : "Public"} project
                  </p>
                  <p className="text-xs text-zinc-500">
                    {isPrivate
                      ? "Only you and collaborators can see this project."
                      : "Anyone can discover this project on the Explore page."}
                  </p>
                </div>
                <button
                  disabled={isPending}
                  onClick={() => {
                    const newPrivate = !isPrivate;
                    startTransition(async () => {
                      setSettingsError(null);
                      const result = await updateVisibilityAction(owner, repo, newPrivate);
                      if (result.success) {
                        setIsPrivate(newPrivate);
                      } else {
                        setSettingsError(result.error);
                      }
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isPrivate ? "bg-zinc-600" : "bg-glass-blue-500"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      isPrivate ? "translate-x-1" : "translate-x-6"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* 2.7. Open to invite requests */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Users size={14} /> Invite requests
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-200">
                    {openToCollab ? "Open to invite requests" : "Not open to invite requests"}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {openToCollab
                      ? "Experimental collaboration-request flows are enabled for this project."
                      : "Experimental collaboration-request flows are disabled for this project."}
                  </p>
                </div>
                <button
                  disabled={isPending}
                  onClick={() => {
                    const newVal = !openToCollab;
                    startTransition(async () => {
                      setSettingsError(null);
                      const result = await toggleOpenToCollabAction(owner, repo, newVal);
                      if (result.success) {
                        setOpenToCollab(newVal);
                      } else {
                        setSettingsError(result.error ?? "Failed to update collaboration setting.");
                      }
                    });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    openToCollab ? "bg-glass-blue-500" : "bg-zinc-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      openToCollab ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {isPrivate && collaborators.length > 0 && (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-200">Collaborators</h3>
                <ul className="space-y-2">
                  {collaborators.map((c) => (
                    <li
                      key={c.login}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300"
                    >
                      <span>{c.username || c.login}</span>
                      <button
                        type="button"
                        className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
                        onClick={() => handleRemoveCollaborator(c.login)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {repoInvitations.some((i) => i.status === "pending") && (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-200">Invitations you sent</h3>
                <ul className="space-y-2">
                  {repoInvitations
                    .filter((i) => i.status === "pending")
                    .map((inv) => (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300"
                      >
                        <span>{inv.invitee_email}</span>
                        <button
                          type="button"
                          className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
                          onClick={() => handleCancelInvite(inv.id)}
                        >
                          Cancel
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {openToCollab && (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-200">Pending access requests</h3>
                {collabLoading ? (
                  <p className="text-xs text-zinc-500">Loading…</p>
                ) : joinRequests.length === 0 ? (
                  <p className="text-xs text-zinc-500">No pending requests.</p>
                ) : (
                  <ul className="space-y-2">
                    {joinRequests.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-700/60 bg-zinc-900/40 px-3 py-2 text-sm"
                      >
                        <span className="text-zinc-300">
                          {r.requester_username || r.requester_id}
                          <span className="ml-2 text-xs text-zinc-500">{r.requester_email}</span>
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
                            onClick={() => {
                              startTransition(async () => {
                                const res = await dismissCollaborationRequestAction(owner, repo, r.id);
                                if (res.success) await loadOwnerInvitesAndRequests();
                              });
                            }}
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            className="rounded bg-glass-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-glass-blue-500"
                            onClick={() => handleInvite(r.requester_email)}
                          >
                            Invite
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 3. README / About Editor */}
            <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <BookOpen size={14} /> README / About
                </h3>
                <div className="flex rounded-md border border-zinc-700 overflow-hidden">
                  <button
                    onClick={() => setReadmeTab("preview")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      readmeTab === "preview"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Eye size={12} className="mr-1 inline" />
                    Preview
                  </button>
                  <button
                    onClick={() => setReadmeTab("edit")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      readmeTab === "edit"
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <FileEdit size={12} className="mr-1 inline" />
                    Edit
                  </button>
                </div>
              </div>

              {readmeError && (
                <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {readmeError}
                </div>
              )}

              {readmeLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 w-3/4 rounded bg-zinc-700" />
                  <div className="h-3 w-1/2 rounded bg-zinc-700" />
                </div>
              ) : readmeTab === "preview" ? (
                <div className="prose prose-invert prose-zinc prose-sm max-w-none">
                  {readmeContent ? (
                    <Markdown>{readmeContent}</Markdown>
                  ) : (
                    <p className="text-zinc-500 italic text-sm">
                      No README yet. Switch to Edit to add a description.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={readmeDraft}
                    onChange={(e) => setReadmeDraft(e.target.value)}
                    placeholder="Write a description for your project using Markdown..."
                    className="w-full min-h-[200px] rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500 resize-y"
                    maxLength={50000}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {readmeDraft.length.toLocaleString()} / 50,000 · Markdown supported
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setReadmeDraft(readmeContent);
                          setReadmeTab("preview");
                        }}
                        className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={readmeSaving || readmeDraft === readmeContent}
                        onClick={async () => {
                          setReadmeSaving(true);
                          setReadmeError(null);
                          try {
                            const res = await updateReadme(owner, repo, readmeDraft);
                            if (res.success) {
                              setReadmeContent(res.data);
                              setReadmeTab("preview");
                            } else {
                              setReadmeError(res.error);
                            }
                          } catch {
                            setReadmeError("Failed to save README");
                          } finally {
                            setReadmeSaving(false);
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-40"
                      >
                        <Save size={12} />
                        {readmeSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Snippet History → 5. Stem Separation (middleContent) → 6. Replace Snippet drop zone */}
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

            {/* 6. Delete project — owner only */}
            {isOwner && (
            <div className="flex justify-end pt-4 border-t border-zinc-800">
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-2 rounded-md bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete Project
              </button>
            </div>
            )}


          </div>
        </div>
      )}
    </main>
  );
}
