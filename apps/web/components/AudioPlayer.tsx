
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import WaveSurfer from "wavesurfer.js";

interface AudioPlayerProps {
  src: string;
  compact?: boolean;
}

export default function AudioPlayer({ src, compact = false }: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#64748b",
      progressColor: "#38bdf8",
      cursorColor: "#ffffff",
      height: compact ? 30 : 48,
      barWidth: 2,
      barGap: 2,
      normalize: true,
    });

    // FIX 1: Catch the AbortError when loading is interrupted
    ws.load(src).catch((err) => {
      if (err.name !== "AbortError") {
        console.error("WaveSurfer load error:", err);
      }
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setDuration(ws.getDuration());
    });

    ws.on("audioprocess", () => {
      setCurrent(ws.getCurrentTime());
    });

    ws.on("interaction", () => {
      setCurrent(ws.getCurrentTime());
    });

    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    // Cleanup function
    return () => {
      try {
        if (ws) {
          ws.unAll();
          ws.destroy();
        }
      } catch (error) {
        console.debug('WaveSurfer cleanup error:', error);
      } finally {
        // FIX 2: Manually clear the container to prevent duplicate waveforms in Strict Mode
        if (waveformRef.current) {
          waveformRef.current.innerHTML = "";
        }
      }
    };
  }, [src, compact]);

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

  // Compact Mode
  if (compact) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg bg-clash-dark/80 backdrop-blur border border-clash-gold/20 px-3 py-2"
        onClick={(e) => e.preventDefault()}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            togglePlay();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-clash-gold text-clash-dark shadow transition-all hover:bg-clash-goldBorder"
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        <div ref={waveformRef} className="flex-1 cursor-pointer" />

        <span className="shrink-0 font-mono text-xs text-clash-light">
          {fmt(currentTime)}/{fmt(duration)}
        </span>
      </div>
    );
  }

  // Full Mode
  return (
    <div
      className="flex items-center gap-3 rounded-lg bg-zinc-900/95 backdrop-blur border border-zinc-700/50 px-4 py-3"
      onClick={(e) => e.preventDefault()}
    >
      <button
        onClick={(e) => {
          e.preventDefault();
          togglePlay();
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow transition-all"
        style={{ background: 'linear-gradient(135deg, #A7C7E7, #9BBFE6, #A7C7E7)', color: '#fff' }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <div ref={waveformRef} className="flex-1 cursor-pointer" />

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
    </div>
  );
}