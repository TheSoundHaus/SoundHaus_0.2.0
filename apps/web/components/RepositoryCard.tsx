"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect, useRef } from "react";
import {
  Star,
  Music,
  Users,
  GitCommit,
  Lock,
  MoreVertical,
  Trash2,
  Pencil,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import CloneModal from "@/components/CloneModal";
import RemixIcon from "@/components/RemixIcon";
import {
  extractYouTubeVideoId,
  youtubeThumbnailHq,
  youtubeNoCookieEmbedUrl,
} from "@/lib/utils/youtube";

import WaveSurfer from "wavesurfer.js";

class AudioSnippetsManager {
  static currentSurfer: WaveSurfer | null = null;
  static surfers = new Set<WaveSurfer>();
  static isMuted = false;
  static listeners = new Set<() => void>();

  static subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  static notify() {
    this.listeners.forEach((cb) => cb());
  }

  static register(surfer: WaveSurfer) {
    this.surfers.add(surfer);
    surfer.setMuted(this.isMuted);

    surfer.on("play", () => {
      if (this.currentSurfer && this.currentSurfer !== surfer) {
        this.currentSurfer.pause();
      }
      this.currentSurfer = surfer;
      this.notify();
    });

    surfer.on("pause", () => {
      this.notify();
    });

    surfer.on("finish", () => {
      surfer.seekTo(0);
      surfer.pause();
      this.notify();
    });
  }

  static unregister(surfer: WaveSurfer) {
    this.surfers.delete(surfer);
    if (this.currentSurfer === surfer) {
      this.currentSurfer = null;
    }
  }

  static toggleMute() {
    this.isMuted = !this.isMuted;
    this.surfers.forEach((s) => s.setMuted(this.isMuted));
    this.notify();
  }

  static isPlaying(surfer: WaveSurfer | null) {
    return surfer ? surfer.isPlaying() : false;
  }
}

function useAudioSnippet(src?: string | null, shouldLoad?: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [surfer, setSurfer] = useState<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(AudioSnippetsManager.isMuted);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Only mount WaveSurfer after the user intention exists, saving massive memory
    // and rendering overhead when there are 50 clips on the page
    if (!src || !containerRef.current || !shouldLoad) return;

    setIsLoading(true);
    setHasError(false);

    // Give the DOM exactly one tick to ensure CSS grid/flex bounds are applied
    // because WaveSurfer requires a non-zero layout width to draw the peaks.
    const runLayoutFrame = setTimeout(() => {
      if (!containerRef.current) return;

      const ws = WaveSurfer.create({
        container: containerRef.current,
        url: src,
        waveColor: "rgba(255, 255, 255, 0.4)",
        progressColor: "rgba(167, 199, 231, 0.8)", // glass-blue-400 ish
        height: 32,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        hideScrollbar: true,
        cursorWidth: 0,
        interact: false,
      });

      ws.on("error", (err) => {
        console.error("WaveSurfer setup error:", err);
        setHasError(true);
        setIsLoading(false);
      });

      ws.on("ready", () => {
        setIsLoading(false);
      });

      AudioSnippetsManager.register(ws);
      setSurfer(ws);

      const update = () => {
        setIsPlaying(AudioSnippetsManager.isPlaying(ws));
        setIsMuted(AudioSnippetsManager.isMuted);
      };

      const unsubscribe = AudioSnippetsManager.subscribe(update);
      update();

      return () => {
        unsubscribe();
        AudioSnippetsManager.unregister(ws);
        ws.destroy();
      };
    }, 50);

    return () => clearTimeout(runLayoutFrame);
  }, [src, shouldLoad]);

  return { containerRef, surfer, isPlaying, isMuted, isLoading, hasError };
}

function YouTubeEmbed({ url, title, hovered }: { url: string; title: string, hovered: boolean }) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  return (
    <div className="absolute inset-0 w-full h-full bg-zinc-900">
      {hovered ? (
        <iframe
          src={youtubeNoCookieEmbedUrl(videoId, true)}
          className="w-full h-full"
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

function MediaPreview({
  title,
  thumbnailUrl,
  thumbnailType,
  audioSnippet,
  stars = 0,
}: {
  title: string;
  thumbnailUrl?: string | null;
  thumbnailType?: "image" | "youtube" | null;
  audioSnippet?: string | null;
  stars?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [hasHoveredOnce, setHasHoveredOnce] = useState(false);

  useEffect(() => {
    if (hovered && !hasHoveredOnce) {
      setHasHoveredOnce(true);
    }
  }, [hovered, hasHoveredOnce]);

  const { containerRef, surfer, isPlaying, isMuted, isLoading, hasError } = useAudioSnippet(audioSnippet, hasHoveredOnce);

  const handlePlayPause = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!surfer || isLoading || hasError) return;
    if (isPlaying) {
      surfer.pause();
    } else {
      surfer.play();
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    AudioSnippetsManager.toggleMute();
  };

  const hasImage = thumbnailUrl && thumbnailType === "image";
  const hasYoutube = thumbnailUrl && thumbnailType === "youtube";

  return (
    <div
      className="group/media relative w-full h-40 mb-4 rounded-xl overflow-hidden cursor-pointer border border-zinc-700/60 bg-gradient-to-br from-zinc-800 via-zinc-800/80 to-zinc-900"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={audioSnippet ? handlePlayPause : undefined}
    >
      {/* 1. Underlying Media / Background */}
      {hasYoutube && !audioSnippet ? (
        <YouTubeEmbed url={thumbnailUrl} title={title} hovered={hovered} />
      ) : hasImage ? (
        <img
          src={thumbnailUrl}
          alt={`${title} thumbnail`}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/media:scale-[1.02]"
        />
      ) : (
        /* Placeholder styling reused */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-600">
          <Music size={32} className="opacity-40" />
          {/* Default wave bars if no audio snippet just to look nice like before */}
          {!audioSnippet && (
             <div className="absolute inset-x-4 bottom-3 flex items-end justify-center gap-[1px] opacity-20">
              {Array.from({ length: 32 }).map((_, i) => {
                const h = Math.round(Math.max(15 + Math.sin(i * 0.4 + stars) * 28 + Math.cos(i * 0.8) * 18, 8));
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-glass-blue-400"
                    style={{ height: `${h}%` }}
                  />
                );
              })}
             </div>
          )}
        </div>
      )}

      {/* 2. Play Button Layer (only if snippet present) */}
      {audioSnippet && (
        <div
          className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300 ${
            hovered || isPlaying ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className={`pointer-events-auto flex items-center justify-center drop-shadow-md text-white transition-all duration-300 hover:scale-110 active:scale-95 ${
              hovered ? "scale-100" : "scale-90"
            } ${isLoading ? "opacity-50 cursor-wait" : ""}`}
          >
            {isPlaying ? (
              <Pause fill="currentColor" size={24} className="" strokeWidth={0} />
            ) : (
              <Play fill="currentColor" size={24} className="ml-1" strokeWidth={0} />
            )}
          </div>
        </div>
      )}

      {/* 3. Waveform Overlay (only fully visible when hovering) */}
      {audioSnippet && (
        <div
          className={`absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-zinc-950/90 via-zinc-900/60 to-transparent flex items-end px-4 pb-3 gap-3 transition-all duration-300 ${
            hovered ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-4 opacity-0 pointer-events-none"
          }`}
          onClick={() => {
            // Prevent clicks in the overlay from pausing/playing unless clicking specifically overlay background?
            // Actually instructions say: "anywhere on the thumbnail should pause or play". 
            // We just stop propagation for the mute button specifically.
          }}
        >
          {/* Actual WaveSurfer instance wrapper */}
          <div 
            className="flex-1 w-full min-w-0 block h-8 relative z-10" 
            ref={containerRef} 
          />
          
          {/* Fallback styling for loading or CORS error state */}
          {(isLoading || hasError) && (
            <div className="absolute left-4 right-12 bottom-3 flex items-end justify-center gap-[1px] opacity-20 pointer-events-none z-0">
              {Array.from({ length: 32 }).map((_, i) => {
                const h = Math.round(Math.max(15 + Math.sin(i * 0.4 + stars) * 28 + Math.cos(i * 0.8) * 18, 8));
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-glass-blue-400"
                    style={{ height: `${h}%` }}
                  />
                );
              })}
            </div>
          )}

          {/* Mute Button */}
          <button
            onClick={handleMuteToggle}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
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

      {/* Media Preview (Thumbnails & Audio Playback) */}
      <MediaPreview
        title={title}
        thumbnailUrl={thumbnailUrl}
        thumbnailType={thumbnailType}
        audioSnippet={audioSnippet}
        stars={stats?.stars}
      />

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
