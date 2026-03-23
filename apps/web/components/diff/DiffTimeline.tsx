"use client";

/**
 * DiffTimeline — Master layout for the full diff visualization engine.
 *
 * Renders a complete arrangement-style view of project changes:
 *   - TimeRuler across the top (beat/bar grid with zoom)
 *   - Scrollable list of track rows, each containing:
 *     - TrackLabel on the left (name, type, instrument, change badge)
 *     - PianoRollTrack (for MIDI) or WaveformTrack (for audio) on the right
 *     - ChangeOverlay on top highlighting modified regions
 *   - DiffSummaryPanel on the right (collapsible list of all changes)
 */

import { useState, useCallback, useMemo } from "react";
import type { ProjectDiff, TrackDiff } from "./types/diff";
import { TimeRuler } from "./TimeRuler";
import { TrackLabel } from "./TrackLabel";
import { PianoRollTrack } from "./PianoRollTrack";
import { WaveformTrack } from "./WaveformTrack";
// ChangeOverlay removed — note colors themselves indicate changes; overlay caused visual clutter
import { DiffSummaryPanel } from "./DiffSummaryPanel";
import { useWaveformPeaks } from "./hooks/useWaveformPeaks";

// ── Ableton track color palette (same as TrackLabel) ──────────────────────

const ABLETON_COLORS: string[] = [
    "#FF94A6", "#FF3636", "#CC0000", "#A65800", "#FF7C00",
    "#FFA600", "#CCA300", "#CCFF00", "#7ACC00", "#00CC00",
    "#00A600", "#00CC6E", "#00CCCC", "#0095CC", "#0059CC",
    "#0000CC", "#4700CC", "#7F00FF", "#A600CC", "#CC00CC",
    "#FF2EB5", "#FF6B6B", "#E66C00", "#D6BA00", "#A5D600",
    "#33CC33", "#00B38F", "#1A99CC", "#3D5CCC", "#8533CC",
    "#CC33CC", "#FF94C2", "#FF8080", "#FF9933", "#E6D400",
    "#BFFF00", "#66FF66", "#00E6B8", "#33CCFF", "#809FFF",
    "#B366FF", "#FF66FF", "#FFBFD4", "#FFB3B3", "#FFCC99",
    "#FFF0B3", "#E6FFB3", "#B3FFB3", "#B3FFE6", "#B3F0FF",
    "#B3CCFF", "#D4B3FF", "#FFB3FF", "#D6D6D6", "#B3B3B3",
    "#8C8C8C", "#666666", "#404040", "#262626", "#1A1A1A",
    "#FF5050", "#00CC44", "#2E7DFF", "#FFB300", "#FF33CC",
    "#99FF33", "#00E5FF", "#CC8800", "#7B61FF", "#E65C00",
];

/** Track heights: collapsed shows a thin strip, expanded shows full detail. */
const COLLAPSED_HEIGHT_MIDI = 48;
const COLLAPSED_HEIGHT_AUDIO = 48;
const EXPANDED_HEIGHT_MIDI = 400;
const EXPANDED_HEIGHT_AUDIO = 80;

// ── Props ──────────────────────────────────────────────────────────────────

interface DiffTimelineProps {
    /** The parsed project diff data. Null = no data available. */
    diffData: ProjectDiff | null;
    /** Commit SHA for header display. */
    commitSha?: string;
    /** Commit message for header display. */
    commitMsg?: string;
    /** Show skeleton loading state. */
    isLoading?: boolean;
    /** Error message to display instead of content. */
    error?: string | null;
    /** Repository owner (for audio fetching). */
    repoOwner?: string;
    /** Repository name (for audio fetching). */
    repoName?: string;
    /** Pixels per beat (zoom level). Default: 20. */
    pixelsPerBeat?: number;
}

// ── Waveform wrapper component ─────────────────────────────────────────────
// We need a separate component so each audio track can call useWaveformPeaks.

function AudioTrackRow({
    track,
    totalBeats,
    pixelsPerBeat,
    repoOwner,
    repoName,
    commitSha,
}: {
    track: TrackDiff;
    totalBeats: number;
    pixelsPerBeat: number;
    repoOwner?: string;
    repoName?: string;
    commitSha?: string;
}) {
    // Determine the audio file path from the first audio clip
    const audioPath = track.audioClips?.[0]?.audioFilePath ?? "";

    const { peaks, isLoading: isLoadingPeaks } = useWaveformPeaks({
        owner: repoOwner ?? "",
        repo: repoName ?? "",
        filePath: audioPath,
        commitSha: commitSha ?? "",
        resolution: 1024,
    });

    return (
        <WaveformTrack
            audioClips={track.audioClips ?? []}
            totalBeats={totalBeats}
            changeType={track.changeType}
            peaks={peaks}
            isLoadingPeaks={isLoadingPeaks}
            pixelsPerBeat={pixelsPerBeat}
        />
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DiffTimeline({
    diffData,
    commitSha,
    commitMsg,
    isLoading = false,
    error = null,
    repoOwner,
    repoName,
    pixelsPerBeat = 20,
}: DiffTimelineProps) {
    const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);
    // Tracks start collapsed; users click the label to expand
    const [expandedTracks, setExpandedTracks] = useState<Set<string>>(new Set());

    const handleFocusTrack = useCallback((trackId: string) => {
        setFocusedTrackId(trackId);
        const el = document.getElementById(`track-${trackId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, []);

    const toggleTrack = useCallback((trackId: string) => {
        setExpandedTracks((prev) => {
            const next = new Set(prev);
            if (next.has(trackId)) next.delete(trackId);
            else next.add(trackId);
            return next;
        });
    }, []);

    // Resolve tempo for display (prefer "after" value)
    const displayTempo = useMemo(() => {
        if (!diffData?.tempo) return undefined;
        return diffData.tempo.after ?? diffData.tempo.before;
    }, [diffData?.tempo]);

    // ── Loading state ──
    if (isLoading) {
        return (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-zinc-800 rounded w-1/3" />
                    <div className="h-4 bg-zinc-800 rounded w-full" />
                    <div className="h-32 bg-zinc-800 rounded w-full" />
                    <div className="h-32 bg-zinc-800 rounded w-full" />
                </div>
            </div>
        );
    }

    // ── Error state ──
    if (error) {
        return (
            <div className="rounded-lg border border-red-800/50 bg-red-900/10 p-6 text-red-400">
                <p className="font-medium">Failed to load diff</p>
                <p className="text-sm mt-1">{error}</p>
            </div>
        );
    }

    // ── Empty state ──
    if (!diffData) {
        return (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-500">
                <p>No diff data available for this commit.</p>
            </div>
        );
    }

    // ── Malformed data guard ──
    // Defensive: if diffData is truthy but lacks tracks, log the actual shape and
    // show a graceful error instead of crashing. Helps diagnose serialisation issues.
    if (!diffData.tracks) {
        console.error("[DiffTimeline] diffData is missing 'tracks' — actual value:", diffData);
        return (
            <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/10 p-6 text-yellow-400">
                <p className="font-medium">Diff data is malformed</p>
                <p className="text-sm mt-1">
                    The diff payload was received but is missing track data.
                    Check the browser console for details.
                </p>
            </div>
        );
    }

    // ── Main render ──
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            {/* Commit Header */}
            {(commitSha || commitMsg || displayTempo) && (
                <div className="border-b border-zinc-800 px-4 py-3 flex items-center gap-4">
                    {commitSha && (
                        <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                            {commitSha.slice(0, 7)}
                        </span>
                    )}
                    {commitMsg && (
                        <span className="text-sm text-zinc-300 truncate">{commitMsg}</span>
                    )}
                    {displayTempo && (
                        <span className="text-xs text-zinc-500 ml-auto">
                            ♩ = {Math.round(displayTempo)} BPM
                        </span>
                    )}
                </div>
            )}

            {/* Timeline Container */}
            <div className="flex">
                {/* Main content area */}
                <div className="flex-1 overflow-x-auto">
                    {/* TimeRuler */}
                    <TimeRuler
                        totalBeats={diffData.totalBeats}
                        tempo={displayTempo}
                        timeSignature={diffData.timeSignature}
                        pixelsPerBeat={pixelsPerBeat}
                    />

                    {/* Track rows — Ableton-style distinct colored rows */}
                    <div>
                        {diffData.tracks.map((track, idx) => {
                            const isExpanded = expandedTracks.has(track.trackId);

                            const trackHeight = track.trackType === "midi"
                                ? (isExpanded ? EXPANDED_HEIGHT_MIDI : COLLAPSED_HEIGHT_MIDI)
                                : (isExpanded ? EXPANDED_HEIGHT_AUDIO : COLLAPSED_HEIGHT_AUDIO);

                            // Collect ghost notes from modified clips (the "before" state)
                            const ghostNotes = track.midiClips
                                ?.flatMap((c) => c.modifiedNotes.map((m) => m.before))
                                ?? [];

                            // Resolve Ableton track color for row background tint
                            const trackColor = track.colorIndex != null
                                && track.colorIndex >= 0
                                && track.colorIndex < ABLETON_COLORS.length
                                ? ABLETON_COLORS[track.colorIndex]
                                : null;
                            // Faint tinted background: 5% opacity of track color
                            const rowBg = trackColor ? `${trackColor}0D` : undefined;

                            return (
                                <div
                                    key={track.trackId}
                                    id={`track-${track.trackId}`}
                                    className="flex"
                                    style={{
                                        minHeight: trackHeight,
                                        backgroundColor: rowBg,
                                        borderBottom: idx < diffData.tracks.length - 1
                                            ? `2px solid ${trackColor ?? "#3f3f46"}` // bold Ableton-style divider
                                            : undefined,
                                    }}
                                >
                                    <TrackLabel
                                        track={track}
                                        isHighlighted={focusedTrackId === track.trackId}
                                        isExpanded={isExpanded}
                                        onToggleExpand={() => toggleTrack(track.trackId)}
                                    />
                                    <div
                                        className={`flex-1 relative ${
                                            isExpanded ? "overflow-y-auto overflow-x-auto" : "overflow-hidden"
                                        }`}
                                        style={isExpanded ? { maxHeight: trackHeight } : { height: trackHeight }}
                                    >
                                        {track.trackType === "midi" ? (
                                            <PianoRollTrack
                                                midiClips={track.midiClips ?? []}
                                                totalBeats={diffData.totalBeats}
                                                changeType={track.changeType}
                                                height={trackHeight}
                                                pixelsPerBeat={pixelsPerBeat}
                                                ghostNotes={ghostNotes}
                                            />
                                        ) : (
                                            <AudioTrackRow
                                                track={track}
                                                totalBeats={diffData.totalBeats}
                                                pixelsPerBeat={pixelsPerBeat}
                                                repoOwner={repoOwner}
                                                repoName={repoName}
                                                commitSha={commitSha}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Panel */}
                <DiffSummaryPanel
                    tracks={diffData.tracks}
                    onFocusTrack={handleFocusTrack}
                    focusedTrackId={focusedTrackId}
                />
            </div>
        </div>
    );
}
