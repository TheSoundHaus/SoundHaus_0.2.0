"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Music,
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import {
  generateStemsAction,
  pollStemJobAction,
  confirmStemsAction,
} from "@/actions/stems";
import type {
  StemFile,
  StemType,
  SnippetVersion,
  StemJobStatus,
} from "@/lib/types/api";

// ── Constants ───────────────────────────────────────────────────────────────

const STEM_ORDER: StemType[] = ["vocals", "drums", "bass", "other"];

const STEM_META: Record<StemType, { label: string; color: string; waveColor: string; progressColor: string }> = {
  vocals: { label: "Vocals",  color: "text-rose-400",   waveColor: "#fb7185", progressColor: "#e11d48" },
  drums:  { label: "Drums",   color: "text-amber-400",  waveColor: "#fbbf24", progressColor: "#d97706" },
  bass:   { label: "Bass",    color: "text-emerald-400", waveColor: "#34d399", progressColor: "#059669" },
  other:  { label: "Other",   color: "text-sky-400",     waveColor: "#38bdf8", progressColor: "#0284c7" },
};

const POLL_INTERVAL_MS = 3000;

// ── Sub-component: individual stem track ────────────────────────────────────

interface StemTrackProps {
  stemFile: StemFile;
  /** Whether this track is currently solo'd */
  isSolo: boolean;
  /** Whether ANY track is solo'd (if so, non-solo tracks are muted) */
  anySolo: boolean;
  /** Whether the user explicitly muted this track */
  isMuted: boolean;
  onToggleSolo: () => void;
  onToggleMute: () => void;
  /** Called once WaveSurfer is ready — parent can sync playback */
  onReady: (ws: WaveSurfer) => void;
}

function StemTrack({
  stemFile,
  isSolo,
  anySolo,
  isMuted,
  onToggleSolo,
  onToggleMute,
  onReady,
}: StemTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const meta = STEM_META[stemFile.stem_type];

  // Effective mute: explicit mute, or another track is solo'd and this isn't
  const effectiveMute = isMuted || (anySolo && !isSolo);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: meta.waveColor,
      progressColor: meta.progressColor,
      cursorColor: "rgba(255,255,255,0.6)",
      cursorWidth: 1,
      height: 48,
      barWidth: 2,
      barGap: 2,
      normalize: true,
      interact: false,        // parent controls seek
    });

    ws.load(stemFile.public_url).catch((err) => {
      if (err.name !== "AbortError") console.error("WaveSurfer load:", err);
    });

    ws.on("ready", () => onReady(ws));

    wsRef.current = ws;

    return () => {
      try { ws.unAll(); ws.destroy(); } catch (err) { console.debug("StemTrack cleanup error:", err); }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemFile.public_url]);

  // Apply mute state to the WaveSurfer instance
  useEffect(() => {
    wsRef.current?.setMuted(effectiveMute);
  }, [effectiveMute]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      {/* Label */}
      <span className={`w-16 shrink-0 text-sm font-semibold ${meta.color}`}>
        {meta.label}
      </span>

      {/* Solo / Mute buttons */}
      <button
        onClick={onToggleSolo}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold transition-colors ${
          isSolo
            ? "bg-amber-500 text-zinc-900"
            : "border border-zinc-700 text-zinc-400 hover:text-zinc-100"
        }`}
        title="Solo"
      >
        S
      </button>
      <button
        onClick={onToggleMute}
        className="shrink-0 text-zinc-400 transition-colors hover:text-zinc-100"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {effectiveMute ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Waveform */}
      <div ref={containerRef} className="flex-1 min-h-[48px]" />
    </div>
  );
}

// ── Main StemPlayer component ───────────────────────────────────────────────

interface StemPlayerProps {
  owner: string;
  repo: string;
  /** Current snippet URL (needed to kick off stem generation) */
  snippetUrl: string | null;
  /** Initially fetched latest stems (server-side) */
  initialStems: SnippetVersion | null;
}

export default function StemPlayer({
  owner,
  repo,
  snippetUrl,
  initialStems,
}: StemPlayerProps) {
  // ── State ───────────────────────────────────────────────────────
  const [stems, setStems] = useState<SnippetVersion | null>(initialStems);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<StemJobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Solo / mute maps keyed by stem_type
  const [soloMap, setSoloMap] = useState<Record<string, boolean>>({});
  const [muteMap, setMuteMap] = useState<Record<string, boolean>>({});

  // WaveSurfer instances keyed by stem_type
  const wsMapRef = useRef<Record<string, WaveSurfer>>({});
  const readyCount = useRef(0);
  const totalStems = stems?.stem_files.length ?? 0;
  const [stemsReady, setStemsReady] = useState(false);

  // Reset readyCount and wsMap when stems change (e.g., regeneration)
  useEffect(() => {
    readyCount.current = 0;
    wsMapRef.current = {};
    setStemsReady(false);
  }, [stems]);

  const anySolo = Object.values(soloMap).some(Boolean);

  // ── Sync playback across all stems ────────────────────────────────

  // Synchronise all WaveSurfer instances to the position of the first one
  const syncPositions = useCallback(() => {
    const allWs = Object.values(wsMapRef.current);
    if (allWs.length < 2) return;
    const ref = allWs[0];
    const pos = ref.getCurrentTime() / ref.getDuration();
    for (let i = 1; i < allWs.length; i++) {
      allWs[i].seekTo(pos);
    }
  }, []);

  // Re-sync when solo/mute state changes during playback
  useEffect(() => {
    if (playing && stemsReady) {
      syncPositions();
    }
  }, [soloMap, muteMap, playing, stemsReady, syncPositions]);

  const handleReady = useCallback(
    (stemType: string, ws: WaveSurfer) => {
      wsMapRef.current[stemType] = ws;
      readyCount.current += 1;

      // Once all stems loaded, grab duration from first
      if (readyCount.current === totalStems) {
        const first = Object.values(wsMapRef.current)[0];
        if (first) setDuration(first.getDuration());
        setStemsReady(true);
      }
    },
    [totalStems],
  );

  // Forward time updates from the first stem (they all advance together)
  useEffect(() => {
    if (!stemsReady) return;
    const first = Object.values(wsMapRef.current)[0];
    if (!first) return;

    const onTimeUpdate = () => setCurrentTime(first.getCurrentTime());
    const onFinish = () => {
      setPlaying(false);
      setCurrentTime(0);
      // Reset all waveform cursors to start
      Object.values(wsMapRef.current).forEach((ws) => ws.seekTo(0));
    };

    first.on("timeupdate", onTimeUpdate);
    first.on("finish", onFinish);

    return () => {
      first.un("timeupdate", onTimeUpdate);
      first.un("finish", onFinish);
    };
  }, [stemsReady]);

  const togglePlay = useCallback(() => {
    const allWs = Object.values(wsMapRef.current);
    if (allWs.length === 0) return;
    if (playing) {
      allWs.forEach((ws) => ws.pause());
    } else {
      // Sync all positions to the first stem before resuming
      syncPositions();
      allWs.forEach((ws) => ws.play());
    }
    setPlaying(!playing);
  }, [playing, syncPositions]);

  const seekAll = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      Object.values(wsMapRef.current).forEach((ws) => {
        ws.seekTo(t / ws.getDuration());
      });
      setCurrentTime(t);
    },
    [],
  );

  // ── Generate stems ────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!snippetUrl) return;
    setActionError(null);
    setJobError(null);

    const res = await generateStemsAction(owner, repo, snippetUrl);
    if (!res.success) {
      setActionError(res.error);
      return;
    }

    // If duplicate detection returned an already-succeeded job, reload immediately
    if (res.status === "succeeded") {
      window.location.reload();
      return;
    }

    setJobId(res.jobId);
    setJobStatus(res.status);
  }, [owner, repo, snippetUrl]);

  // ── Poll job status ───────────────────────────────────────────────

  useEffect(() => {
    if (!jobId || jobStatus === "succeeded" || jobStatus === "failed") return;

    const interval = setInterval(async () => {
      const res = await pollStemJobAction(owner, repo, jobId);
      if (!res.success) {
        setActionError(res.error ?? "Failed to check job status");
        return;
      }

      setJobStatus(res.status);

      if (res.status === "failed") {
        setJobError(res.errorMessage ?? "Unknown error");
        clearInterval(interval);
      }

      if (res.status === "succeeded") {
        clearInterval(interval);
        // Reload the page to get new stems via server fetch
        window.location.reload();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, owner, repo]);

  // ── Confirm stems ─────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!stems) return;
    setActionError(null);
    const res = await confirmStemsAction(owner, repo, stems.id);
    if (!res.success) {
      setActionError(res.error);
      return;
    }
    setStems({ ...stems, is_confirmed: true });
  }, [owner, repo, stems]);

  // ── Helpers ───────────────────────────────────────────────────────

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Sort stem files by STEM_ORDER
  const sortedStems = stems?.stem_files
    .slice()
    .sort((a, b) => STEM_ORDER.indexOf(a.stem_type) - STEM_ORDER.indexOf(b.stem_type))
    ?? [];

  // ── Render ────────────────────────────────────────────────────────

  // --- No snippet uploaded yet ---
  if (!snippetUrl) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="mb-2 text-lg font-semibold">Stem Separation</h3>
        <p className="text-sm text-zinc-400">
          Upload an audio snippet first to generate stems.
        </p>
      </div>
    );
  }

  // --- Job in progress ---
  if (jobId && jobStatus && jobStatus !== "succeeded" && jobStatus !== "failed") {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="mb-4 text-lg font-semibold">Stem Separation</h3>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <Loader2 size={18} className="animate-spin text-sky-400" />
          <span>
            {jobStatus === "queued" && "Waiting in queue…"}
            {jobStatus === "processing" && "Separating stems with Demucs…"}
          </span>
        </div>
      </div>
    );
  }

  // --- Job failed ---
  if (jobStatus === "failed") {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="mb-4 text-lg font-semibold">Stem Separation</h3>
        <div className="mb-4 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle size={16} />
          <span>Stem generation failed: {jobError ?? "Unknown error"}</span>
        </div>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  // --- No stems yet — show generate button ---
  if (!stems) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
        <h3 className="mb-4 text-lg font-semibold">Stem Separation</h3>
        <p className="mb-4 text-sm text-zinc-400">
          Split your snippet into vocals, drums, bass, and other using AI.
        </p>
        {actionError && (
          <p className="mb-3 text-sm text-red-400">{actionError}</p>
        )}
        <button
          onClick={handleGenerate}
          className="btn btn-primary btn-sm"
        >
          <Music size={14} /> Generate Stems
        </button>
      </div>
    );
  }

  // --- Stems available: show waveforms + controls ---
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Stem Separation</h3>

        <div className="flex items-center gap-2">
          {/* Confirm button (if not yet confirmed) */}
          {!stems.is_confirmed && (
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
            >
              <CheckCircle size={13} /> Confirm
            </button>
          )}
          {stems.is_confirmed && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle size={13} /> Confirmed
            </span>
          )}

          {/* Regenerate */}
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw size={13} /> Regenerate
          </button>
        </div>
      </div>

      {actionError && (
        <p className="mb-3 text-sm text-red-400">{actionError}</p>
      )}

      {/* Transport bar — only show when waveforms are loaded */}
      {stemsReady ? (
        <div className="relative z-10 mb-4 flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:bg-zinc-200"
          >
            {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>

          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={currentTime}
            onChange={seekAll}
            className="audio-range flex-1"
            style={{
              background: duration
                ? `linear-gradient(to right, var(--brand-primary) ${(currentTime / duration) * 100}%, var(--background-depth, #27272a) ${(currentTime / duration) * 100}%)`
                : 'var(--background-depth, #27272a)',
            }}
          />

          <span className="shrink-0 font-mono text-sm text-zinc-400">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 size={14} className="animate-spin" />
          <span>Loading waveforms…</span>
        </div>
      )}

      {/* Individual stem tracks */}
      <div className="space-y-2">
        {sortedStems.map((sf) => (
          <StemTrack
            key={sf.id}
            stemFile={sf}
            isSolo={!!soloMap[sf.stem_type]}
            anySolo={anySolo}
            isMuted={!!muteMap[sf.stem_type]}
            onToggleSolo={() =>
              setSoloMap((prev) => ({ ...prev, [sf.stem_type]: !prev[sf.stem_type] }))
            }
            onToggleMute={() =>
              setMuteMap((prev) => ({ ...prev, [sf.stem_type]: !prev[sf.stem_type] }))
            }
            onReady={(ws) => handleReady(sf.stem_type, ws)}
          />
        ))}
      </div>
    </div>
  );
}
