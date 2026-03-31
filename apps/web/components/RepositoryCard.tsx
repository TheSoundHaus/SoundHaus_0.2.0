"use client";

import Link from "next/link";
import { useState, useTransition, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Star,
  Music,
  Users,
  GitCommit,
  Lock,
  Download,
  MoreVertical,
  Trash2,
  Pencil,
} from "lucide-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import AudioPlayer from "@/components/AudioPlayer";
import CloneModal from "@/components/CloneModal";
import RemixIcon from "@/components/RemixIcon";

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w\-]{11})/);
  return m ? m[1] : null;
}

function YouTubeHoverEmbed({ url, title }: { url: string; title: string }) {
  const [hovered, setHovered] = useState(false);
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  return (
    <div
      className="relative w-full h-40 rounded-card overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay"
          title={title}
        />
      ) : (
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
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
      className="flex items-center gap-1 transition-colors hover:text-glass-blue"
    >
      <RemixIcon hovered={hovered} size={14} />
      {count} remixes
    </button>
  );
}

const MiniAudioPreview = dynamic(() => import("@/components/MiniAudioPreview"), {
  ssr: false,
});

/**
 * RepositoryCard Component - Displays repository overview information
 * Used in Explore and Personal Repositories pages
 *
 * @param id - Repository full_name for routing (owner/repo)
 * @param title - Repository name
 * @param author - Repository owner username
 * @param updatedAt - Last update timestamp
 * @param stats - Object containing repository statistics
 * @param isPublic - Whether repository is public or private
 * @param audioSnippet - CDN URL to audio snippet (if any)
 * @param cloneCount - Number of times this repo has been cloned
 * @param isStarred - Whether the current user has starred this repo
 * @param isOwner - Whether the current user owns this repo
 * @param genres - Array of genre name strings
 * @param onStar - Callback when star/unstar is triggered
 * @param onDelete - Callback when delete is triggered
 * @param onRename - Callback when rename is triggered
 */

interface RepositoryCardProps {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
  stats: {
    stars: number;
    tracks?: number;         // Not yet available from API — wire up when endpoint provides it
    collaborators?: number;  // Not yet available from API — wire up when endpoint provides it
    commits?: number;        // Not yet available from API — wire up when endpoint provides it
  };
  isPublic?: boolean;
  audioSnippet?: string | null;
  thumbnailUrl?: string | null;
  thumbnailType?: "image" | "youtube" | null;
  cloneCount: number;
  cloneUrl?: string;
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
  updatedAt,
  stats,
  isPublic = true,
  audioSnippet,
  thumbnailUrl,
  thumbnailType,
  cloneCount,
  cloneUrl,
  isStarred = false,
  isOwner = false,
  genres = [],
  onStar,
  onDelete,
  onRename,
}: RepositoryCardProps) {
  const [starred, setStarred] = useState(isStarred);
  const [starCount, setStarCount] = useState(stats.stars);
  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState(title);
  const [, startTransition] = useTransition();
  const [showRemixModal, setShowRemixModal] = useState(false);

  // Audio preview on hover (debounced)
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (!audioSnippet) return;
    hoverTimerRef.current = setTimeout(() => setShowPreview(true), 300);
  }, [audioSnippet]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowPreview(false);
  }, []);

  function handleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onStar) return;
    const wasStarred = starred;
    // Optimistic update
    setStarred(!wasStarred);
    setStarCount((c) => (wasStarred ? c - 1 : c + 1));
    startTransition(async () => {
      try {
        await onStar();
      } catch {
        // Revert on failure
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

  // Format the updatedAt timestamp
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
      className="group relative block rounded-card border border-white/10 bg-zinc-900 p-6 transition-all hover:border-white/20 hover:bg-zinc-800/60">
      {/* 3-dot context menu (owner only) — positioned beside the audio player */}
      {isOwner && (
        <div className="absolute right-3 top-6 z-10">
          <Menu as="div" className="relative">
            <MenuButton
              onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }}
              className="rounded-md p-1 text-muted transition-colors hover:bg-charcoal hover:text-soft-white"
            >
              <MoreVertical size={16} />
            </MenuButton>
            <MenuItems className="absolute right-0 mt-1 w-40 origin-top-right rounded-md border border-white/10 bg-midnight/95 backdrop-blur-glass p-1 shadow-xl focus:outline-none">
              <MenuItem>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRenameInput(true); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-soft-white data-[focus]:bg-charcoal"
                >
                  <Pencil size={14} /> Rename
                </button>
              </MenuItem>
              <MenuItem>
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 data-[focus]:bg-charcoal"
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
        <div className="mb-4 pr-6 overflow-hidden rounded-card">
          <img
            src={thumbnailUrl}
            alt={`${title} thumbnail`}
            className="w-full h-40 object-cover rounded-card"
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
        // 1. Give the outer wrapper the margin and padding (just like the true branch)
        <div className="mb-4 pr-6">
          <div className="flex items-center gap-2 rounded-card bg-midnight/80 backdrop-blur-glass border border-white/10 px-3 py-2 text-muted">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-charcoal">
              <Music size={14} />
            </div>
            <span className="text-xs">No audio snippet</span>
          </div>
        </div>
      )}

      {/* Rename inline input */}
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
            className="w-full rounded-md border border-white/10 bg-charcoal px-2 py-1 text-lg font-semibold text-soft-white focus:border-glass-blue-500 focus:outline-none"
          />
        </form>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="truncate text-lg font-semibold text-soft-white">{title}</h3>
          <div className="flex items-center gap-2">
            {!isPublic && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Lock size={12} /> Private
              </span>
            )}
          </div>
        </div>
      )}

      <p className="mb-3 text-sm text-muted">
        By <span
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/profile/${author}`; }}
          className="text-zinc-300 hover:text-glass-blue transition-colors cursor-pointer"
        >{author}</span> • {formattedDate}
      </p>

      {/* Genre tags */}
      {genres.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {genres.map((g) => (
            <span
              key={g}
              className="rounded-full bg-charcoal px-2 py-0.5 text-xs text-muted"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-sm text-muted">
        <button
          onClick={handleStar}
          className={`flex items-center gap-1 transition-colors ${
            starred ? "text-amber-400" : "hover:text-amber-400"
          }`}
        >
          <Star size={14} fill={starred ? "currentColor" : "none"} /> {starCount}
        </button>
        {cloneUrl ? (
          <RemixCardButton
            count={cloneCount}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowRemixModal(true);
            }}
          />
        ) : (
          <span className="flex items-center gap-1">
            <Download size={14} /> {cloneCount} remixes
          </span>
        )}
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
      {showRemixModal && cloneUrl && (
        <CloneModal
          cloneUrl={cloneUrl}
          onClose={() => setShowRemixModal(false)}
        />
      )}
    </Link>
  );
}
