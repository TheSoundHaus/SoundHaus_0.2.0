"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Star,
  Music,
  Users,
  GitCommit,
  Lock,
  MoreVertical,
  Trash2,
  Pencil,
} from "lucide-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import AudioPlayer from "@/components/AudioPlayer";
import CloneModal from "@/components/CloneModal";
import RemixIcon from "@/components/RemixIcon";
import {
  extractYouTubeVideoId,
  youtubeThumbnailHq,
  youtubeNoCookieEmbedUrl,
} from "@/lib/utils/youtube";

function YouTubeHoverEmbed({ url, title }: { url: string; title: string }) {
  const [hovered, setHovered] = useState(false);
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <div
      className="relative w-full h-40 rounded-xl overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? (
        <iframe
          src={youtubeNoCookieEmbedUrl(videoId, true)}
          className="absolute inset-0 w-full h-full"
          allow="autoplay"
          title={title}
        />
      ) : (
        <img
          src={youtubeThumbnailHq(videoId)}
          alt={title}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}

function RemixCardButton({ count, onClick }: { count: number; onClick: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1 transition-colors hover:text-glass-blue-400"
    >
      <RemixIcon hovered={hovered} size={14} />
      {count} remixes
    </button>
  );
}

interface RepositoryCardProps {
  id: string;
  title: string;
  /** Shown next to the date (usually display name). */
  author: string;
  /** Gitea owner segment for clone links (defaults to first segment of id). */
  cloneOwner?: string;
  /** Path segment for /profile/[slug] (username or UUID). */
  profileSlug?: string;
  updatedAt: string;
  stats: {
    stars: number;
    tracks?: number;
    collaborators?: number;
    commits?: number;
  };
  isPublic?: boolean;
  audioSnippet?: string | null;
  thumbnailUrl?: string | null;
  thumbnailType?: "image" | "youtube" | null;
  cloneCount: number;
  isStarred?: boolean;
  isOwner?: boolean;
  genres?: string[];
  onStar?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onRename?: (newName: string) => Promise<void>;
}

export default function RepositoryCard({
  id,
  title,
  author,
  cloneOwner: cloneOwnerProp,
  profileSlug: profileSlugProp,
  updatedAt,
  stats,
  isPublic = true,
  audioSnippet,
  thumbnailUrl,
  thumbnailType,
  cloneCount,
  isStarred = false,
  isOwner = false,
  genres = [],
  onStar,
  onDelete,
  onRename,
}: RepositoryCardProps) {
  const router = useRouter();
  const giteaOwner = cloneOwnerProp ?? id.split("/")[0] ?? "";
  const profileSlug = profileSlugProp ?? author;
  const [starred, setStarred] = useState(isStarred);
  const [starCount, setStarCount] = useState(stats.stars);
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [, startTransition] = useTransition();
  const [showRemixModal, setShowRemixModal] = useState(false);

  function handleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onStar) return;
    const wasStarred = starred;
    setStarred(!wasStarred);
    setStarCount((c) => (wasStarred ? c - 1 : c + 1));
    startTransition(async () => {
      try {
        await onStar();
      } catch {
        setStarred(wasStarred);
        setStarCount((c) => (wasStarred ? c + 1 : c - 1));
      }
    });
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await onDelete();
    });
  }

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onRename || !renameValue.trim() || renameValue === title) {
      setShowRenameInput(false);
      return;
    }
    startTransition(async () => {
      await onRename(renameValue.trim());
      setShowRenameInput(false);
    });
  }

  const formattedDate = (() => {
    try {
      const d = new Date(updatedAt);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffDays === 0) return "today";
      if (diffDays === 1) return "yesterday";
      if (diffDays < 30) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return updatedAt;
    }
  })();

  return (
    <Link
      href={`/repository/${id}`}
      className="group relative block rounded-xl border border-white/[0.08] bg-[rgba(20,20,20,0.88)] backdrop-blur-xl p-6 transition-all duration-300 hover:border-glass-blue-500/40 hover:bg-[rgba(30,30,30,0.92)] hover:shadow-[0_0_20px_rgba(167,199,231,0.12)] no-underline">

      {/* Context menu (owner only) */}
      {isOwner && (
        <div className="absolute right-4 top-5 z-10">
          <Menu as="div" className="relative">
            <MenuButton
              onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              <MoreVertical size={16} />
            </MenuButton>
            <MenuItems className="absolute right-0 mt-1 w-40 origin-top-right rounded-xl border border-zinc-700 bg-zinc-800 p-1 shadow-2xl focus:outline-none">
              <MenuItem>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRenameInput(true); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-200 data-[focus]:bg-zinc-700"
                >
                  <Pencil size={14} /> Rename
                </button>
              </MenuItem>
              <MenuItem>
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 data-[focus]:bg-zinc-700"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      )}

      {/* Thumbnail / Audio snippet */}
      {thumbnailUrl && thumbnailType === "image" ? (
        <div className="mb-4 pr-6 overflow-hidden rounded-xl">
          <img
            src={thumbnailUrl}
            alt={`${title} thumbnail`}
            className="w-full h-40 object-cover rounded-xl border border-zinc-700 transition-transform duration-700 group-hover:scale-[1.02]"
          />
        </div>
      ) : thumbnailUrl && thumbnailType === "youtube" ? (
        <div className="mb-4 pr-6">
          <YouTubeHoverEmbed url={thumbnailUrl} title={title} />
        </div>
      ) : audioSnippet ? (
        <div className="mb-4 pr-6">
          <AudioPlayer src={audioSnippet} compact />
        </div>
      ) : (
        <div className="mb-4 pr-6">
          <div className="relative h-32 overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 via-zinc-800/80 to-zinc-900 border border-zinc-700">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-600">
              <Music size={20} className="opacity-40" />
            </div>
            <div className="absolute inset-x-4 bottom-3 flex items-end justify-center gap-[1px] opacity-20">
              {Array.from({ length: 32 }).map((_, i) => {
                const h = 15 + Math.sin(i * 0.4 + (stats?.stars ?? 0)) * 28 + Math.cos(i * 0.8) * 18;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-glass-blue-400"
                    style={{ height: `${Math.max(h, 8)}%` }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Rename input */}
      {showRenameInput ? (
        <form
          onSubmit={handleRenameSubmit}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="mb-3"
        >
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => setShowRenameInput(false)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-lg font-semibold text-zinc-100 focus:border-glass-blue-500 focus:ring-1 focus:ring-glass-blue-500 focus:outline-none transition-all"
          />
        </form>
      ) : (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="truncate text-base font-semibold text-zinc-100 group-hover:text-glass-blue-400 transition-colors duration-300">{title}</h3>
          {!isPublic && (
            <span className="flex items-center gap-1 shrink-0 text-[10px] text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">
              <Lock size={10} /> Private
            </span>
          )}
        </div>
      )}

      <p className="mb-3 text-sm text-zinc-400">
        <span
          role="link"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/profile/${encodeURIComponent(profileSlug)}`);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/profile/${encodeURIComponent(profileSlug)}`);
            }
          }}
          className="text-zinc-300 hover:text-glass-blue-400 transition-colors cursor-pointer"
        >{author}</span>
        <span className="mx-2 text-zinc-600">&middot;</span>
        <span suppressHydrationWarning>{formattedDate}</span>
      </p>

      {/* Genre tags */}
      {genres.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {genres.map((g) => (
            <span
              key={g}
              className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-glass-blue-400"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
        <button
          onClick={handleStar}
          className={`flex items-center gap-1 transition-colors duration-300 ${
            starred ? "text-amber-400" : "hover:text-amber-400"
          }`}
        >
          <Star size={14} fill={starred ? "currentColor" : "none"} /> {starCount}
        </button>
        <RemixCardButton
          count={cloneCount}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowRemixModal(true);
          }}
        />
        {stats.collaborators != null && stats.collaborators > 0 && (
          <span className="flex items-center gap-1">
            <Users size={14} /> {stats.collaborators}
          </span>
        )}
        {stats.commits != null && stats.commits > 0 && (
          <span className="flex items-center gap-1">
            <GitCommit size={14} /> {stats.commits}
          </span>
        )}
      </div>

      {/* Remix URL Modal */}
      {showRemixModal && (
        <CloneModal
          owner={giteaOwner}
          repo={title}
          onClose={() => setShowRemixModal(false)}
        />
      )}
    </Link>
  );
}
