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
  Clock,
  Trash2,
  Save,
  ChevronDown,
  FilePlus,
  FileEdit,
  Eye,
  Search,
  Send,
  X,
  UserPlus,
  UserMinus,
  BookOpen,
} from "lucide-react";
import AudioPlayerWithComments from "@/components/AudioPlayerWithComments";
import { getSnippetComments, addSnippetComment, deleteSnippetComment } from "@/lib/api/comments";
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
import { deleteRepoAction, renameRepoAction, updateVisibilityAction } from "@/actions/repos";
import { inviteCollaboratorAction, cancelInvitationAction, removeCollaboratorAction } from "@/actions/invitations";
import { getCommits, getCommitDiff, getDiffStatus } from "@/lib/api/commits";
import { getRepoInvitations, listCollaborators, searchUsers } from "@/lib/api/invitations";
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
  UserSearchResult,
  SnippetVersion,
  SnippetComment,
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
    "overview" | "commits" | "events" | "collaborators" | "about" | "settings"
  >("overview");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { user } = useUser();

  // Track current snippet URL (updates after upload without full page reload)
  const [currentSnippetUrl, setCurrentSnippetUrl] = useState(snippet?.url ?? null);

  // Snippet comment state
  const [snippetComments, setSnippetComments] = useState<SnippetComment[]>([]);

  // README editor state
  const [readmeContent, setReadmeContent] = useState("");
  const [readmeDraft, setReadmeDraft] = useState("");
  const [readmeTab, setReadmeTab] = useState<"edit" | "preview">("preview");
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [readmeSaving, setReadmeSaving] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const readmeLoadedRef = useRef(false);

  // Settings form state
  const [newName, setNewName] = useState(repo);
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
  const ownerDisplayName = stats?.owner_display_name || stats?.owner_username || owner;

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
    if (activeTab === "collaborators" || activeTab === "overview") {
      loadCollaboratorsData();
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
  }, [activeTab, loadCollaboratorsData, refreshEvents, owner, repo]);

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

  // Fetch snippet comments
  useEffect(() => {
    if (!currentSnippetUrl) return;
    let cancelled = false;
    (async () => {
      const res = await getSnippetComments(owner, repo);
      if (!cancelled && res.success) {
        setSnippetComments(res.data);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, currentSnippetUrl]);

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
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1">
              <User size={14} /> {ownerDisplayName}
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowCloneModal(true)}
            onMouseEnter={() => setRemixHovered(true)}
            onMouseLeave={() => setRemixHovered(false)}
            className="group relative flex items-center justify-center overflow-hidden rounded-lg bg-glass-blue px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-glass-blue/25 transition-all duration-300 hover:bg-glass-blue/90 hover:shadow-xl hover:shadow-glass-blue/40 active:scale-95"
            style={{ minWidth: "120px" }}
          >
            <span className="relative flex items-center justify-center w-full" style={{ height: "20px" }}>
              <span
                className="absolute inline-flex items-center justify-center"
                style={{
                  transform: remixHovered ? "translateX(26px)" : "translateX(-26px)",
                  transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <RemixIcon hovered={remixHovered} size={18} />
              </span>
              <span
                className="absolute inline-flex items-center justify-center whitespace-nowrap"
                style={{
                  transform: remixHovered ? "translateX(-14px)" : "translateX(14px)",
                  transition: "transform 500ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                Clone
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Clone Modal */}
      {showCloneModal && (
        <CloneModal
          owner={owner}
          repo={repo}
          onClose={() => setShowCloneModal(false)}
        />
      )}

      {/* Audio Player with Comment Markers */}
      {currentSnippetUrl && (
        <div className="mb-8" data-snippet-player>
          <AudioPlayerWithComments
            src={currentSnippetUrl}
            duration={snippet?.duration ?? undefined}
            comments={snippetComments}
            currentUserId={user?.id}
            isOwner={user?.username === owner}
            onAddComment={async (ts, text) => {
              const res = await addSnippetComment(owner, repo, {
                timestamp_seconds: ts,
                comment_text: text,
              });
              if (res.success) {
                setSnippetComments((prev) => [...prev, res.data].sort((a, b) => a.timestamp_seconds - b.timestamp_seconds));
              }
            }}
            onDeleteComment={async (commentId) => {
              const res = await deleteSnippetComment(owner, repo, commentId);
              if (res.success) {
                setSnippetComments((prev) => prev.filter((c) => c.id !== commentId));
              }
            }}
          />
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
            {stats?.thumbnail_url && (
              <div className="glass-card rounded-lg overflow-hidden">
                {stats.thumbnail_type === "youtube" ? (
                  <iframe
                    src={stats.thumbnail_url.replace("watch?v=", "embed/")}
                    className="w-full aspect-video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <img
                    src={stats.thumbnail_url}
                    alt={`${repo} thumbnail`}
                    className="w-full object-cover"
                  />
                )}
              </div>
            )}

            {/* Collaborators */}
            <div className="glass-card rounded-lg p-6">
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
                    <div key={c.login} className="flex items-center gap-3">
                      <UserAvatar src={c.avatar_url} alt={c.display_name || c.username || c.login} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">
                          {c.display_name || c.username || c.login}
                        </div>
                        <div className="text-xs text-zinc-500 capitalize">{c.permission}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No collaborators yet.</p>
              )}
            </div>

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
                  <span className="text-xs text-zinc-300">{ownerDisplayName}</span>
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
      {activeTab === "events" && (
        <div className="glass-card rounded-lg p-6">
          <h2 className="mb-6 text-2xl font-semibold">Timeline</h2>
          {repoEvents.length === 0 ? (
            <p className="text-zinc-400">No activity recorded yet.</p>
          ) : (
            <div className="relative pl-8">
              {/* Vertical connector line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-700" />

              <div className="space-y-6">
                {repoEvents.map((ev) => {
                  // Event-type icon and color mapping
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
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-8 top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full ${dotColor} ring-4 ring-zinc-900`}
                      >
                        <IconComponent size={8} className="text-white" />
                      </div>

                      {/* Avatar */}
                      <div className="shrink-0">
                        <UserAvatar src={null} alt={ev.actor} size={32} />
                      </div>

                      {/* Event details */}
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
          <div className="glass-card rounded-lg p-6">
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
                        <X size={14} className="text-zinc-400 hover:text-zinc-300" />
                      </button>
                    )}
                  </div>

                  {/* Search results dropdown */}
                  {(searchResults.length > 0 || searchLoading) && searchQuery.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-lg max-h-48 overflow-y-auto">
                      {searchLoading ? (
                        <div className="px-4 py-3 text-sm text-zinc-400">Searching…</div>
                      ) : (
                        searchResults.map((u) => (
                          <div
                            key={u.username || u.email}
                            className="flex items-center justify-between px-4 py-2 hover:bg-zinc-800 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <UserAvatar src={u.avatar_url} alt={u.display_name || u.username} size={20} />
                              <div>
                                <div className="text-sm font-medium text-zinc-200">{u.display_name || u.username}</div>
                                {u.email && <div className="text-xs text-zinc-400">{u.email}</div>}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleInvite(u.invite_email || u.email)}
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
          <div className="glass-card rounded-lg p-6">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <Clock size={18} /> Pending Invitations
            </h2>
            {collabLoading ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : repoInvitations.filter((i) => i.status === "pending").length === 0 ? (
              <p className="text-sm text-zinc-400">No pending invitations.</p>
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
                          <div className="text-xs text-zinc-400">
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
          <div className="glass-card rounded-lg p-6">
            <h2 className="mb-4 text-xl font-semibold flex items-center gap-2">
              <Users size={18} /> Active Collaborators
            </h2>
            {collabLoading ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : collaborators.length === 0 ? (
              <p className="text-sm text-zinc-400">No collaborators yet. Invite someone above!</p>
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
                            <div className="text-sm text-zinc-400">{c.display_name || c.email || ""}</div>
                          </div>
                          <ChevronDown
                            size={14}
                            className={`ml-1 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                            <p className="text-xs text-zinc-400 italic">No bio provided.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invitation History (accepted/declined/expired) */}
          {repoInvitations.filter((i) => i.status !== "pending").length > 0 && (
            <div className="glass-card rounded-lg p-6">
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
                              : inv.status === "expired"
                              ? "bg-yellow-500/10 text-yellow-500"
                              : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          <User size={14} />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-200">
                            {inv.invitee_email}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {inv.status === "accepted"
                              ? "Accepted"
                              : inv.status === "expired"
                              ? "Expired — repo deleted"
                              : "Declined"}{" "}
                            {inv.responded_at ? timeAgo(inv.responded_at) : ""}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          inv.status === "accepted"
                            ? "bg-green-500/10 text-green-400"
                            : inv.status === "expired"
                            ? "bg-yellow-500/10 text-yellow-400"
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
        <div className="glass-card rounded-lg p-6">
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

            {/* 2. Genre Selector */}
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


          </div>
        </div>
      )}
    </main>
  );
}
