"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type FormEvent,
} from "react";
import { Play, Pause, Volume2, VolumeX, MessageCircle, X, Trash2 } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import type { SnippetComment } from "@/lib/types/api";

// ── Types ───────────────────────────────────────────────────────────────────

interface AudioPlayerWithCommentsProps {
  src: string;
  /** Duration of the snippet in seconds (used for marker positioning) */
  duration?: number;
  /** Existing comments to render as markers */
  comments?: SnippetComment[];
  /** Current user id — used to show delete on own comments */
  currentUserId?: string;
  /** Whether the current user is the repo owner */
  isOwner?: boolean;
  /** Callback when user submits a new comment */
  onAddComment?: (timestampSeconds: number, text: string) => Promise<void>;
  /** Callback when user deletes a comment */
  onDeleteComment?: (commentId: string) => Promise<void>;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AudioPlayerWithComments({
  src,
  duration: durationProp,
  comments = [],
  currentUserId,
  isOwner = false,
  onAddComment,
  onDeleteComment,
}: AudioPlayerWithCommentsProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationProp ?? 0);
  const [muted, setMuted] = useState(false);

  // Comment interaction state
  const [commentMode, setCommentMode] = useState(false);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hoveredComment, setHoveredComment] = useState<string | null>(null);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#64748b",
      progressColor: "#38bdf8",
      cursorColor: "#ffffff",
      height: 48,
      barWidth: 2,
      barGap: 2,
      normalize: true,
    });

    ws.load(src).catch((err) => {
      if (err.name !== "AbortError") {
        console.error("WaveSurfer load error:", err);
      }
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setDuration(ws.getDuration());
    });
    ws.on("audioprocess", () => setCurrent(ws.getCurrentTime()));
    ws.on("interaction", () => setCurrent(ws.getCurrentTime()));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => {
      try {
        ws?.unAll();
        ws?.destroy();
      } catch (error) {
        console.debug("WaveSurfer cleanup error:", error);
      } finally {
        if (waveformRef.current) {
          waveformRef.current.innerHTML = "";
        }
      }
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const toggleMute = useCallback(() => {
    if (!wavesurferRef.current) return;
    const newMuted = !muted;
    wavesurferRef.current.setMuted(newMuted);
    setMuted(newMuted);
  }, [muted]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Comment handlers ────────────────────────────────────────────────────

  const handleWaveformClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!commentMode || !duration) return;

      // Compute click position relative to waveform container
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      const ts = pct * duration;

      setPendingTimestamp(ts);
      setCommentText("");
    },
    [commentMode, duration]
  );

  const handleSubmitComment = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!onAddComment || pendingTimestamp == null || !commentText.trim()) return;

      setSubmitting(true);
      try {
        await onAddComment(pendingTimestamp, commentText.trim());
        setPendingTimestamp(null);
        setCommentText("");
        setCommentMode(false);
      } catch (err) {
        console.error("Failed to add comment:", err);
      } finally {
        setSubmitting(false);
      }
    },
    [onAddComment, pendingTimestamp, commentText]
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!onDeleteComment) return;
      try {
        await onDeleteComment(commentId);
      } catch (err) {
        console.error("Failed to delete comment:", err);
      }
    },
    [onDeleteComment]
  );

  // ── Marker positions ───────────────────────────────────────────────────

  const markerPositions = duration
    ? comments.map((c) => ({
        ...c,
        pct: Math.min((c.timestamp_seconds / duration) * 100, 100),
      }))
    : [];

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg bg-zinc-900/95 backdrop-blur border border-zinc-700/50 overflow-hidden">
      {/* Main player row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            togglePlay();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow transition-all hover:bg-sky-400"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        {/* Waveform with comment markers overlay */}
        <div
          className={`relative flex-1 ${commentMode ? "cursor-crosshair" : "cursor-pointer"}`}
          onClick={commentMode ? handleWaveformClick : undefined}
        >
          <div ref={waveformRef} className="w-full" />

          {/* Comment markers */}
          {markerPositions.map((c) => (
            <div
              key={c.id}
              className="absolute top-0 bottom-0 w-0.5 group z-10"
              style={{ left: `${c.pct}%` }}
              onMouseEnter={() => setHoveredComment(c.id)}
              onMouseLeave={() => setHoveredComment(null)}
            >
              {/* Marker line */}
              <div className="w-full h-full bg-amber-400/80 group-hover:bg-amber-300 transition-colors" />

              {/* Marker dot at top */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 group-hover:bg-amber-300 ring-2 ring-zinc-900" />

              {/* Tooltip on hover */}
              {hoveredComment === c.id && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 rounded-md bg-zinc-800 border border-zinc-600 p-2 shadow-xl z-50 pointer-events-auto">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-sky-400 truncate">
                      {c.username}
                    </span>
                    <span className="text-[10px] text-zinc-500 ml-2 shrink-0">
                      {fmt(c.timestamp_seconds)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 break-words leading-relaxed">
                    {c.comment_text}
                  </p>
                  {/* Delete button — only for own comments or repo owner */}
                  {(c.user_id === currentUserId || isOwner) && onDeleteComment && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteComment(c.id);
                      }}
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={10} />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Pending comment marker (during placement) */}
          {pendingTimestamp != null && duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-green-400 z-20"
              style={{ left: `${(pendingTimestamp / duration) * 100}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-green-400 ring-2 ring-zinc-900 animate-pulse" />
            </div>
          )}
        </div>

        <span className="shrink-0 font-mono text-sm text-zinc-400">
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        <button
          onClick={(e) => {
            e.preventDefault();
            toggleMute();
          }}
          className="text-zinc-400 transition-colors hover:text-white"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>

        {/* Comment mode toggle */}
        {onAddComment && (
          <button
            onClick={() => {
              setCommentMode((v) => !v);
              setPendingTimestamp(null);
              setCommentText("");
            }}
            className={`rounded-md p-1.5 transition-colors ${
              commentMode
                ? "bg-amber-500/20 text-amber-400"
                : "text-zinc-400 hover:text-white"
            }`}
            title={commentMode ? "Cancel commenting" : "Add a comment"}
          >
            {commentMode ? <X size={16} /> : <MessageCircle size={16} />}
          </button>
        )}
      </div>

      {/* Comment input bar (shown when a timestamp is selected) */}
      {commentMode && pendingTimestamp != null && (
        <form
          onSubmit={handleSubmitComment}
          className="flex items-center gap-2 border-t border-zinc-700/50 px-4 py-2 bg-zinc-800/50"
        >
          <span className="shrink-0 text-xs font-mono text-amber-400">
            @ {fmt(pendingTimestamp)}
          </span>
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Type your comment..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={submitting || !commentText.trim()}
            className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-zinc-900 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? "..." : "Post"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingTimestamp(null);
              setCommentText("");
            }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* Comment mode hint */}
      {commentMode && pendingTimestamp == null && (
        <div className="border-t border-zinc-700/50 px-4 py-2 bg-zinc-800/50">
          <p className="text-xs text-zinc-500">
            Click anywhere on the waveform to place a comment marker
          </p>
        </div>
      )}
    </div>
  );
}
