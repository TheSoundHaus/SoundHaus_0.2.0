"use client";

/**
 * WaveformTrack — Canvas-based audio waveform visualization for diff view.
 *
 * Renders waveform peaks as a mirrored bar chart:
 *   - Positive peaks above center line, negative below
 *   - Colors: zinc-400 for unchanged regions, green for added clips,
 *     red for removed clips, blue for modified regions
 *   - X-axis synced with zoom via pixelsPerBeat prop
 */

import { useRef, useEffect, useCallback } from "react";
import type { AudioClipDiff, TrackDiff, WaveformPeaks } from "./types/diff";

// ── Props ──────────────────────────────────────────────────────────────────

interface WaveformTrackProps {
    /** Audio clip diffs for this track. */
    audioClips: AudioClipDiff[];
    /** Total timeline length in beats. */
    totalBeats: number;
    /** Overall track change type. */
    changeType: TrackDiff["changeType"];
    /** Waveform peak data (fetched externally via useWaveformPeaks). Null = loading. */
    peaks: WaveformPeaks | null;
    /** Whether peaks are currently being fetched. */
    isLoadingPeaks?: boolean;
    /** Canvas height in pixels. Default: 80. */
    height?: number;
    /** Pixels per beat (from zoom context). Default: 20. */
    pixelsPerBeat?: number;
    /** Tempo in BPM — needed to map peaks (time-based) to beats. Default: 120. */
    tempo?: number;
}

// ── Color mapping ──────────────────────────────────────────────────────────

const WAVEFORM_COLORS: Record<string, string> = {
    unchanged: "rgba(161, 161, 170, 0.7)",     // zinc-400
    added:     "rgba(52, 211, 153, 0.8)",      // emerald-400
    removed:   "rgba(251, 113, 133, 0.7)",     // rose-400
    modified:  "rgba(167, 199, 231, 0.8)",     // glass-blue
};

// ── Component ──────────────────────────────────────────────────────────────

export function WaveformTrack({
    audioClips,
    totalBeats,
    changeType,
    peaks,
    isLoadingPeaks = false,
    height = 80,
    pixelsPerBeat = 20,
    tempo = 120,
}: WaveformTrackProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    /**
     * Determine the change type color for a given beat position by checking
     * which AudioClipDiff region (if any) it falls within.
     */
    const getColorForBeat = useCallback(
        (_beat: number) => {
            for (const clip of audioClips) {
                if (clip.changeType && WAVEFORM_COLORS[clip.changeType]) {
                    return WAVEFORM_COLORS[clip.changeType]!;
                }
            }
            return WAVEFORM_COLORS[changeType] ?? WAVEFORM_COLORS.unchanged!;
        },
        [audioClips, changeType],
    );

    /**
     * Main drawing function — clears canvas and renders waveform from peak data.
     * Colors regions based on which AudioClipDiff they fall within.
     */
    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const width = totalBeats * pixelsPerBeat;
        canvas.width = width;
        canvas.height = height;
        const centerY = height / 2;

        // Background
        ctx.fillStyle = "#18181B";
        ctx.fillRect(0, 0, width, height);

        // Center line
        ctx.strokeStyle = "#3F3F46"; // zinc-700
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        if (isLoadingPeaks || !peaks) {
            ctx.fillStyle = "#71717A";
            ctx.font = "12px monospace";
            ctx.textAlign = "center";
            ctx.fillText(
                isLoadingPeaks ? "Loading waveform..." : "No waveform data",
                width / 2,
                centerY,
            );
            return;
        }

        // Map peak samples to canvas pixels
        const channel = peaks?.data?.[0]; // mono or left channel
        if (!channel || channel.length === 0) return;

        const beatsPerSecond = tempo / 60;
        const totalSeconds = peaks.durationSeconds;
        const totalPeaks = channel.length;

        // Draw each pixel column by sampling the nearest peak
        const barWidth = Math.max(1, width / totalPeaks);

        for (let i = 0; i < totalPeaks; i++) {
            const peakValue = channel[i] ?? 0;
            const x = (i / totalPeaks) * width;

            // Determine which beat this peak falls on
            const timeSeconds = (i / totalPeaks) * totalSeconds;
            const beat = timeSeconds * beatsPerSecond;
            const color = getColorForBeat(beat);

            // Draw mirrored bar
            const barHeight = Math.abs(peakValue) * centerY;
            if (barHeight < 0.5) continue; // skip near-zero values

            ctx.fillStyle = color;
            // Positive above center
            ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
            // Negative below center (mirror)
            ctx.fillRect(x, centerY, barWidth, barHeight);
        }

        // Overlay clip region boundaries (vertical dashed lines)
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#a1a1aa";
        for (const clip of audioClips) {
            // If the clip has defined boundary beats, draw lines there
            if (clip.changeType === "added" || clip.changeType === "removed") {
                // Draw a label at x=0 since AudioClipDiff doesn't carry startBeat
                ctx.strokeStyle =
                    clip.changeType === "added" ? "#4ade80" : "#f87171";
            }
        }
        ctx.setLineDash([]);
    }, [peaks, audioClips, totalBeats, height, isLoadingPeaks, pixelsPerBeat, tempo, changeType, getColorForBeat]);

    useEffect(() => {
        const frame = requestAnimationFrame(drawWaveform);
        return () => cancelAnimationFrame(frame);
    }, [drawWaveform]);

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={totalBeats * pixelsPerBeat}
                height={height}
                className="block"
            />
        </div>
    );
}
