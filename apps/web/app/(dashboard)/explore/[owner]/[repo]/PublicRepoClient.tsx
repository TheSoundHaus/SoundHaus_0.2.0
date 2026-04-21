"use client";

import Link from "next/link";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  User,
  GitCommit,
  Download,
  Music,
  Calendar,
  GitBranch,
  GitFork,
  Activity,
  FileText,
  Clock,
  ChevronDown,
  FilePlus,
  Eye,
  BookOpen,
  Trash2,
  UserPlus,
  Send,
} from "lucide-react";
import AudioPlayerWithComments from "@/components/AudioPlayerWithComments";
import { DiffTimeline } from "@/components/diff/DiffTimeline";
import { ABComparisonView } from "@/components/diff/ABComparisonView";
import RemixIcon from "@/components/RemixIcon";
import CloneModal from "@/components/CloneModal";
import UserAvatar from "@/components/UserAvatar";
import Markdown from "react-markdown";
import { useUser } from "@/lib/context/UserContext";
import { forkRepoAction, requestCollaborationAction } from "@/actions/repos";
import { getCommits, getCommitDiff } from "@/lib/api/commits";
import { getRepoEvents } from "@/lib/api/webhooks";
import type {
  RepoStats,
  RepoActivity,
  RepoEvents,
  Snippet,
  PushActivity,
  RepoEvent,
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
  type TabKey = "overview" | "commits" | "events";
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showActionMenu, setShowActionMenu] = useState(false);
  const router = useRouter();
  const { user } = useUser();

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

  // Clone/Remix button
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [collabRequestBusy, setCollabRequestBusy] = useState(false);
  const [collabRequestNotice, setCollabRequestNotice] = useState<string | null>(null);
  const remixMenuRef = useRef<HTMLDivElement>(null);

  // Events
  const [repoEvents, setRepoEvents] = useState<RepoEvent[]>(events?.events ?? []);

  // Fork state
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const handleFork = useCallback(async () => {
    setForking(true);
    setForkError(null);
    const result = await forkRepoAction(owner, repo);
    setForking(false);
    if (result.success && result.fork) {
      router.push(`/repository/${result.fork.owner}/${result.fork.name}`);
    } else if (!result.success) {
      setForkError(result.error);
    }
  }, [owner, repo, router]);

  const pushes: PushActivity[] = activity?.activity ?? [];
  const genres = stats?.genres ?? [];
  const cloneCount = stats?.clone_count ?? 0;
  const profileSlug = encodeURIComponent(stats?.owner_username || owner);
  const ownerLabel =
    stats?.owner_username || owner;

  // Thumbnail / YouTube
  const thumbnailUrl = stats?.thumbnail_url ?? null;
  const thumbnailType = stats?.thumbnail_type ?? null;
  const [ytPlaying, setYtPlaying] = useState(false);

  function extractYtId(url: string): string | null {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w\-]{11})/);
    return m ? m[1] ?? null : null;
  }
  const ytVideoId = thumbnailType === "youtube" && thumbnailUrl ? extractYtId(thumbnailUrl) : null;

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

  useEffect(() => {
    if (activeTab === "events") {
      getRepoEvents(owner, repo).then((res) => {
        if (res.success) setRepoEvents(res.data?.events ?? []);
      });
    }
  }, [activeTab, owner, repo]);

  useEffect(() => {
    if (!showActionMenu) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (remixMenuRef.current && !remixMenuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [showActionMenu]);

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

  const ownerIsSelf =
    !!user?.username &&
    (user.username === owner || user.username === stats?.owner_username);
  const canClone = !!stats?.viewer_can_clone;
  const pendingInvite = !!stats?.viewer_pending_invite;

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: FileText },
    { key: "commits" as const, label: "Snapshots", icon: GitCommit },
    { key: "events" as const, label: "Timeline", icon: Activity },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
        <Link href="/explore" className="hover:text-zinc-100 transition-colors">
          Explore
        </Link>
        <span>/</span>
        <Link href={`/profile/${profileSlug}`} className="text-zinc-200 hover:text-glass-blue transition-colors">{ownerLabel}</Link>
        <span>/</span>
        <span className="text-zinc-200">{repo}</span>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-bold">{repo}</h1>
          <p className="text-sm text-zinc-400">by <Link href={`/profile/${profileSlug}`} className="text-zinc-300 hover:text-glass-blue transition-colors">{ownerLabel}</Link></p>
        </div>
        <div className="flex max-w-md flex-col items-end gap-2 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {user && ownerIsSelf && (
              <button
                type="button"
                onClick={() => setShowCloneModal(true)}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-zinc-200 transition-all duration-300 hover:bg-white/[0.1] hover:border-white/20"
              >
                <Download size={16} />
                Clone
              </button>
            )}
            {user && !ownerIsSelf && (
              <div className="relative" ref={remixMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowActionMenu((p) => !p)}
                  className="flex items-center gap-2 rounded-lg bg-glass-blue px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-glass-blue/25 transition-all duration-300 hover:bg-glass-blue/90"
                >
                  <RemixIcon hovered={showActionMenu} size={18} />
                  Remix
                  <ChevronDown size={16} className="opacity-90" />
                </button>
                {showActionMenu && (
                  <div className="absolute right-0 top-full z-20 mt-1 min-w-[220px] rounded-md border border-zinc-700 bg-zinc-900 py-1 text-left shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        handleFork();
                        setShowActionMenu(false);
                      }}
                      disabled={forking}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <GitFork size={14} />
                      {forking ? "Forking…" : "Fork"}
                    </button>
                    {stats?.open_to_collab && (
                      <button
                        type="button"
                        disabled={collabRequestBusy}
                        onClick={async () => {
                          setCollabRequestBusy(true);
                          setCollabRequestNotice(null);
                          const res = await requestCollaborationAction(owner, repo);
                          setCollabRequestBusy(false);
                          setShowActionMenu(false);
                          if (res.success) {
                            setCollabRequestNotice(res.message);
                          } else {
                            setCollabRequestNotice(res.error);
                          }
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
                      >
                        <UserPlus size={14} />
                        Request invite
                      </button>
                    )}
                    {canClone && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCloneModal(true);
                          setShowActionMenu(false);
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                      >
                        <Download size={14} />
                        Clone
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {collabRequestNotice && (
            <p className="text-sm text-zinc-400">{collabRequestNotice}</p>
          )}
          {pendingInvite && !ownerIsSelf && user && (
            <p className="text-sm text-amber-400/90">
              You have a pending invitation for this project. Accept it from your dashboard notifications.
            </p>
          )}
        </div>
      </div>

      {/* Fork error banner */}
      {forkError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {forkError}
        </div>
      )}

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

      {/* Clone Modal */}
      {showCloneModal && (
        <CloneModal
          owner={owner}
          repo={repo}
          cloneUrl={stats?.clone_url}
          onClose={() => setShowCloneModal(false)}
        />
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

      {/* YouTube Player / Thumbnail */}
      {ytVideoId && (
        <div className="mb-8 overflow-hidden glass-card rounded-xl">
          {ytPlaying ? (
            <div className="relative" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                title="YouTube video"
              />
            </div>
          ) : (
            <button onClick={() => setYtPlaying(true)} className="relative block w-full group">
              <img
                src={`https://img.youtube.com/vi/${ytVideoId}/maxresdefault.jpg`}
                alt="Video thumbnail"
                className="w-full aspect-video object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/15">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-lg shadow-black/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-white/15">
                  <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6 ml-0.5 drop-shadow-sm"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div className="absolute bottom-3 right-3">
                <a
                  href={thumbnailUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm hover:text-white transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Watch on YouTube
                </a>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Static thumbnail */}
      {thumbnailUrl && thumbnailType === "image" && (
        <div className="mb-8 overflow-hidden glass-card rounded-xl">
          <img
            src={thumbnailUrl}
            alt={repo}
            className="w-full aspect-video object-cover"
          />
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

            {/* README */}
            <div className="glass-card rounded-lg p-6">
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-8">
            {/* Thumbnail preview in sidebar */}
            {thumbnailUrl && (
              <div className="glass-card rounded-lg overflow-hidden">
                {thumbnailType === "image" ? (
                  <img src={thumbnailUrl} alt={repo} className="w-full aspect-video object-cover" />
                ) : ytVideoId ? (
                  <div className="relative">
                    <img src={`https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`} alt="" className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/90">
                        <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4 ml-0.5"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </div>
                ) : null}
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
                  <Link href={`/profile/${profileSlug}`} className="text-xs text-zinc-300 hover:text-glass-blue transition-colors">{ownerLabel}</Link>
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
                        {c.author_avatar_url ? (
                          <img
                            src={c.author_avatar_url}
                            alt={c.author_name}
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                            <GitCommit size={14} className="text-zinc-400" />
                          </div>
                        )}
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
                      <div className="border-t border-zinc-800/50 bg-zinc-900/20 px-2 py-3 space-y-3">
                        {/* Track change summary */}
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
            actorAvatar: (p as any).pusher_avatar ?? null,
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
            actorAvatar: (ev as any).actor_avatar ?? null,
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

    </main>
  );
}
