"use client";

/**
 * DiffView — Arrangement-style diff visualization for ALS projects.
 *
 * Renders a simplified Ableton-inspired arrangement view on the web:
 *   - Track labels on the left (name, type badge, instrument, change indicator)
 *   - Horizontal timeline on the right with colored clip bars
 *   - Green = added, Blue = modified, Red = removed
 *   - Hover tooltips with human-readable descriptions
 *   - Commit metadata header
 *
 * DATA FLOW:
 *   1. RepoDetailClient fetches diff via getCommitDiff(owner, repo, sha)
 *   2. AlsDiffData is passed as prop to <DiffView />
 *   3. Component transforms diff_data based on diff_type into renderable tracks
 *
 * FUTURE:
 *   When MIDI-note-level parsing is added, the clip blocks will show
 *   note summaries (count, velocity range, pitch range) in tooltips.
 */

import { useState, useCallback, useRef } from "react";
import {
    GitCommit,
    Volume2,
    Plus,
    Minus,
    RefreshCw,
} from "lucide-react";
import type { AlsDiffData, CommitSummary } from "@/lib/api/commits";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single track row in the diff view. */
interface DiffTrack {
    id: string | number;
    name: string;
    type: "MIDI" | "Audio";
    instrument?: string | null;
    changeType: "added" | "modified" | "removed" | "unchanged";
    clips: DiffClip[];
}

/** A clip region on the timeline. */
interface DiffClip {
    id: string;
    name: string;
    startBeat: number;
    endBeat: number;
    changeType: "added" | "modified" | "removed";
    description: string;
}

/** Tooltip hover state. */
interface TooltipState {
    trackIdx: number;
    clipIdx: number;
    x: number;
    y: number;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface DiffViewProps {
    /** The raw diff data from the backend. Null = no diff available. */
    diffData: AlsDiffData | null;
    /** Commit metadata for the header display. */
    commit?: CommitSummary | null;
    /** Show loading state. */
    isLoading?: boolean;
    /** Error message to display. */
    error?: string | null;
}

// ── Data transformer ───────────────────────────────────────────────────────

/**
 * Transforms backend AlsDiffData into renderable DiffTrack[] based on diff_type.
 *
 * Supports three diff_type values:
 *   "xml"        — System A output: { summary, project: { Tracks: [...] } }
 *   "structural" — System B output: { ok: true, changes: AlsChange[] }
 *   "combined"   — Both: { xml: {...}, structural: {...} }
 */
function transformDiffData(diffData: AlsDiffData): {
    tracks: DiffTrack[];
    totalBeats: number;
    summary: string | null;
} {
    const summary = diffData.diff_summary;
    const data = diffData.diff_data as Record<string, any>;

    // Determine which sub-payloads we have
    const xmlData =
        diffData.diff_type === "xml"
            ? data
            : diffData.diff_type === "combined"
              ? data?.xml
              : null;

    const structData =
        diffData.diff_type === "structural"
            ? data
            : diffData.diff_type === "combined"
              ? data?.structural
              : null;

    // Index structural changes by track name for cross-referencing
    const changesByName = new Map<string, any>();
    if (structData?.ok && Array.isArray(structData.changes)) {
        for (const change of structData.changes) {
            changesByName.set(change.trackName, change);
        }
    }

    const tracks: DiffTrack[] = [];

    // Build tracks from XML output (System A gives us the full track list)
    const xmlTracks: any[] = xmlData?.project?.Tracks ?? [];
    for (let idx = 0; idx < xmlTracks.length; idx++) {
        const rt = xmlTracks[idx];
        const trackName =
            rt.EffectiveName || rt.UserName || `Track ${idx + 1}`;
        const trackType: "MIDI" | "Audio" =
            rt.Type === "MidiTrack" || rt.Type === "MIDI" ? "MIDI" : "Audio";
        const trackId = rt.Id ?? idx;

        // Check structural compare for changes on this track
        const structChange = changesByName.get(trackName);
        let changeType: DiffTrack["changeType"] = "unchanged";
        let instrument: string | null = null;
        const clips: DiffClip[] = [];

        if (structChange) {
            const beforeDevice = structChange.before?.name ?? null;
            const afterDevice = structChange.after?.name ?? null;

            if (!beforeDevice && afterDevice) changeType = "added";
            else if (beforeDevice && !afterDevice) changeType = "removed";
            else changeType = "modified";

            instrument = afterDevice ?? beforeDevice ?? null;

            clips.push({
                id: `${trackId}-change-0`,
                name: structChange.afterTrackName ?? trackName,
                startBeat: 0,
                endBeat: 4,
                changeType,
                description: buildChangeDescription(structChange),
            });

            changesByName.delete(trackName);
        }

        tracks.push({
            id: trackId,
            name: trackName,
            type: trackType,
            instrument,
            changeType,
            clips,
        });
    }

    // Add any structural-only changes not in the XML track list
    for (const [trackName, change] of changesByName.entries()) {
        tracks.push({
            id: change.trackId ?? trackName,
            name: trackName,
            type: "MIDI",
            instrument: change.after?.name ?? change.before?.name ?? null,
            changeType: "modified",
            clips: [
                {
                    id: `extra-${trackName}-0`,
                    name: trackName,
                    startBeat: 0,
                    endBeat: 4,
                    changeType: "modified",
                    description: buildChangeDescription(change),
                },
            ],
        });
    }

    // Default 32 beats (8 bars) for timeline
    // TODO: Extract from ALS XML when parser supports it
    return { tracks, totalBeats: 32, summary };
}

/** Builds a human-readable description from a structural change entry. */
function buildChangeDescription(change: any): string {
    const parts: string[] = [];

    if (
        change.beforeTrackName &&
        change.afterTrackName &&
        change.beforeTrackName !== change.afterTrackName
    ) {
        parts.push(
            `Track renamed: "${change.beforeTrackName}" → "${change.afterTrackName}"`
        );
    }

    const beforeDevice = change.before?.name ?? null;
    const afterDevice = change.after?.name ?? null;

    if (beforeDevice && afterDevice && beforeDevice !== afterDevice) {
        parts.push(`Instrument changed: ${beforeDevice} → ${afterDevice}`);
    } else if (!beforeDevice && afterDevice) {
        parts.push(`Instrument added: ${afterDevice}`);
    } else if (beforeDevice && !afterDevice) {
        parts.push(`Instrument removed: ${beforeDevice}`);
    }

    return parts.length > 0 ? parts.join(" · ") : "Track contents changed";
}

// ── Change type color mappings ─────────────────────────────────────────────

const clipColors = {
    added: "bg-success/80 border-success",
    modified: "bg-glass-blue-500/60 border-glass-blue-500",
    removed: "bg-error/60 border-error",
} as const;

const indicatorColors = {
    added: "bg-success",
    modified: "bg-glass-blue-500",
    removed: "bg-error",
    unchanged: "bg-zinc-600",
} as const;

// ── Sub-components ─────────────────────────────────────────────────────────

/** Snapshot header bar showing SHA, message, and author. */
function CommitHeader({ commit }: { commit?: CommitSummary | null }) {
    if (!commit) return null;

    return (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-center gap-3">
                <GitCommit size={16} className="text-glass-cyan-500" />
                <span className="font-mono text-sm text-glass-cyan-500">
                    {commit.short_sha}
                </span>
                <span className="max-w-md truncate text-sm text-zinc-300">
                    {commit.message.split("\n")[0]}
                </span>
            </div>
            <span className="text-xs text-zinc-500">
                {commit.author_name}
                {commit.timestamp ? ` · ${new Date(commit.timestamp).toLocaleDateString()}` : ""}
            </span>
        </div>
    );
}

/** Beat/bar ruler along the top of the timeline. */
function TimeRuler({ totalBeats }: { totalBeats: number }) {
    const totalBars = Math.ceil(totalBeats / 4);
    const bars = Array.from({ length: totalBars + 1 }, (_, i) => i);

    return (
        <div className="flex h-6 items-end border-b border-zinc-800">
            {/* Spacer for track label column */}
            <div className="w-48 shrink-0" />
            {/* Timeline ruler */}
            <div className="relative min-w-0 flex-1">
                {bars.map((barNum) => {
                    const leftPct = ((barNum * 4) / totalBeats) * 100;
                    return (
                        <span
                            key={barNum}
                            className="absolute -translate-x-1/2 text-[10px] text-zinc-600"
                            style={{ left: `${leftPct}%` }}
                        >
                            {barNum > 0 ? barNum : ""}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

/** Track label — left column showing name, type badge, instrument. */
function TrackLabel({ track }: { track: DiffTrack }) {
    return (
        <div className="flex w-48 shrink-0 items-center gap-2 border-r border-zinc-800 px-3 py-2">
            {/* Change indicator bar */}
            <div
                className={`h-6 w-1 rounded-full ${indicatorColors[track.changeType]}`}
            />
            {/* Type badge */}
            <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    track.type === "MIDI"
                        ? "bg-violet-500/20 text-violet-400"
                        : "bg-glass-cyan-500/20 text-glass-cyan-500"
                }`}
            >
                {track.type}
            </span>
            {/* Name & instrument */}
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">
                    {track.name}
                </div>
                {track.instrument && (
                    <div className="truncate text-[10px] text-zinc-500">
                        {track.instrument}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Single clip block on the timeline. */
function ClipBlock({
    clip,
    totalBeats,
    onMouseEnter,
    onMouseLeave,
}: {
    clip: DiffClip;
    totalBeats: number;
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseLeave: () => void;
}) {
    const leftPct = (clip.startBeat / totalBeats) * 100;
    const widthPct = ((clip.endBeat - clip.startBeat) / totalBeats) * 100;

    return (
        <div
            className={`absolute top-1 bottom-1 flex items-center overflow-hidden rounded border px-1.5 text-[10px] text-white/90 transition-opacity hover:opacity-100 ${clipColors[clip.changeType]}`}
            style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 1.5)}%`,
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {widthPct > 6 ? clip.name : ""}
        </div>
    );
}

/** Timeline area for a single track — contains clip blocks + change hint. */
function TimelineRow({
    track,
    trackIdx,
    totalBeats,
    onClipHover,
    onClipLeave,
}: {
    track: DiffTrack;
    trackIdx: number;
    totalBeats: number;
    onClipHover: (
        trackIdx: number,
        clipIdx: number,
        e: React.MouseEvent
    ) => void;
    onClipLeave: () => void;
}) {
    return (
        <div className="relative min-w-0 flex-1 py-1">
            {/* Hint when no clips but track has a change */}
            {track.clips.length === 0 && track.changeType !== "unchanged" && (
                <span className="flex h-full items-center text-[11px] italic text-zinc-500">
                    {track.changeType === "added" && (
                        <>
                            <Plus size={10} className="mr-1 text-success" /> Track
                            added
                        </>
                    )}
                    {track.changeType === "modified" && (
                        <>
                            <RefreshCw size={10} className="mr-1 text-glass-blue-500" />{" "}
                            Instrument / device changed
                        </>
                    )}
                    {track.changeType === "removed" && (
                        <>
                            <Minus size={10} className="mr-1 text-error" /> Track
                            removed
                        </>
                    )}
                </span>
            )}

            {track.clips.map((clip, clipIdx) => (
                <ClipBlock
                    key={clip.id}
                    clip={clip}
                    totalBeats={totalBeats}
                    onMouseEnter={(e) => onClipHover(trackIdx, clipIdx, e)}
                    onMouseLeave={onClipLeave}
                />
            ))}
        </div>
    );
}

/** Tooltip popover shown on clip hover. */
function DiffTooltip({
    clip,
    x,
    y,
}: {
    clip: DiffClip;
    x: number;
    y: number;
}) {
    return (
        <div
            className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl"
            style={{ left: x + 12, top: y - 8 }}
        >
            <div className="mb-1 text-sm font-medium text-zinc-200">
                {clip.name}
            </div>
            <div className="text-xs text-zinc-400">{clip.description}</div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DiffView({
    diffData,
    commit,
    isLoading = false,
    error = null,
}: DiffViewProps) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleClipHover = useCallback(
        (trackIdx: number, clipIdx: number, e: React.MouseEvent) => {
            if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
            setTooltip({ trackIdx, clipIdx, x: e.clientX, y: e.clientY });
        },
        []
    );

    const handleClipLeave = useCallback(() => {
        tooltipTimerRef.current = setTimeout(() => setTooltip(null), 100);
    }, []);

    // ── Loading state ──────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-glass-cyan-500" />
                <span className="ml-3 text-sm text-zinc-400">
                    Analyzing changes…
                </span>
            </div>
        );
    }

    // ── Error state ────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
            </div>
        );
    }

    // ── No diff available ──────────────────────────────────────────────
    if (!diffData) {
        return (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
                <Volume2
                    size={24}
                    className="mx-auto mb-2 text-zinc-600"
                />
                No ALS diff data available for this snapshot.
            </div>
        );
    }

    // ── Transform data ─────────────────────────────────────────────────
    const { tracks, totalBeats, summary } = transformDiffData(diffData);

    if (tracks.length === 0) {
        return (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center text-sm text-zinc-500">
                No track changes detected in this diff.
            </div>
        );
    }

    // Resolve hovered clip for tooltip
    const hoveredClip: DiffClip | null = tooltip
        ? tracks[tooltip.trackIdx]?.clips[tooltip.clipIdx] ?? null
        : null;

    return (
        <div className="space-y-3">
            {/* Commit header */}
            <CommitHeader commit={commit} />

            {/* Summary text */}
            {summary && (
                <div className="rounded-md bg-zinc-800/50 px-3 py-2 text-sm text-zinc-400">
                    {summary}
                </div>
            )}

            {/* Arrangement area */}
            <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
                {/* Time ruler */}
                <TimeRuler totalBeats={totalBeats} />

                {/* Track rows */}
                {tracks.map((track, trackIdx) => (
                    <div
                        key={track.id ?? trackIdx}
                        className="flex min-h-[36px] border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors"
                    >
                        <TrackLabel track={track} />
                        <TimelineRow
                            track={track}
                            trackIdx={trackIdx}
                            totalBeats={totalBeats}
                            onClipHover={handleClipHover}
                            onClipLeave={handleClipLeave}
                        />
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-5 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />
                    Added
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-glass-blue-500" />
                    Modified
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-error" />
                    Removed
                </span>
            </div>

            {/* Tooltip */}
            {tooltip && hoveredClip && (
                <DiffTooltip
                    clip={hoveredClip}
                    x={tooltip.x}
                    y={tooltip.y}
                />
            )}
        </div>
    );
}
