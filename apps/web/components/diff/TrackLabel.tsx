"use client";

/**
 * TrackLabel — Left sidebar label for each track row in the diff timeline.
 *
 * Displays:
 *   - Track name (bold)
 *   - Type badge: "MIDI" (keyboard icon) or "Audio" (waveform icon)
 *   - Instrument name (if available, e.g., "Wavetable", "Simpler")
 *   - Change indicator badge: + (green, added), − (red, removed), ~ (blue, modified)
 *
 * PROPS:
 *   track — A TrackDiff object
 *   isHighlighted — Whether this track is currently focused in the summary panel
 *
 * IMPLEMENTATION NOTES:
 *   - Fixed width (~200px) to align as a left column
 *   - Should truncate long track names with ellipsis
 *   - Desktop team can use this unchanged in Electron
 */

import { ChevronRight, ChevronDown } from "lucide-react";
import type { TrackDiff } from "./types/diff";

// ── Props ──────────────────────────────────────────────────────────────────

interface TrackLabelProps {
    /** The track diff data. */
    track: TrackDiff;
    /** Whether to show a highlighted border (e.g., when focused from summary panel). */
    isHighlighted?: boolean;
    /** Whether this track row is expanded to full height. */
    isExpanded?: boolean;
    /** Callback to toggle expanded state. */
    onToggleExpand?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Text label + color for each change type — minimal, no icons. */
const CHANGE_LABELS = {
    added:     { text: "+", color: "#34d399" },   // emerald-400
    removed:   { text: "−", color: "#fb7185" },   // rose-400
    modified:  { text: "~", color: "#60a5fa" },   // blue-400
    unchanged: { text: "",  color: "" },
} as const;

/**
 * Ableton Live track color palette (70 colors, indices 0-69).
 * These match the color chips in Ableton's track header color picker.
 */
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

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Renders the label for a single track row.
 *
 * TODO: Implement layout:
 *   1. Fixed-width container (w-48 or w-52) with right border
 *   2. Top row: change badge + track name (truncated)
 *   3. Bottom row: type icon + type name + instrument name
 *   4. Highlighted state: left border accent color
 */
export function TrackLabel({ track, isHighlighted = false, isExpanded = false, onToggleExpand }: TrackLabelProps) {
    const label = CHANGE_LABELS[track.changeType];

    // Resolve track color from Ableton colorIndex
    const trackColor = track.colorIndex != null && track.colorIndex >= 0 && track.colorIndex < ABLETON_COLORS.length
        ? ABLETON_COLORS[track.colorIndex]
        : null;

    // Faint tinted background from track color
    const bgTint = trackColor
        ? `${trackColor}12` // ~7% opacity hex
        : undefined;

    const ExpandIcon = isExpanded ? ChevronDown : ChevronRight;

    return (
        <div
            className={`
                w-52 shrink-0 border-r border-zinc-700/60 px-3 py-2 flex items-stretch gap-0 cursor-pointer select-none
                transition-colors duration-100
                ${isHighlighted ? "border-l-2 border-l-glass-blue-400" : ""}
            `}
            style={{ backgroundColor: bgTint }}
            onClick={onToggleExpand}
        >
            {/* Track color stripe from Ableton colorIndex */}
            {trackColor && (
                <div
                    className="w-1 shrink-0 rounded-sm mr-2.5 self-stretch"
                    style={{ backgroundColor: trackColor }}
                />
            )}

            <div className="flex flex-col justify-center min-w-0 flex-1">
                {/* Track name + change badge */}
                <div className="flex items-center gap-1.5">
                    <ExpandIcon size={12} className="text-zinc-500 shrink-0" />
                    {label.text && (
                        <span
                            className="text-xs font-bold shrink-0"
                            style={{ color: label.color }}
                        >
                            {label.text}
                        </span>
                    )}
                    <span className="text-sm font-medium text-zinc-200 truncate">
                        {track.trackName}
                    </span>
                </div>

                {/* Track type badge for return/group tracks */}
                {(track.trackType === "return" || track.trackType === "group") && (
                    <div className="flex items-center gap-1.5 mt-0.5 pl-5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0 rounded ${
                            track.trackType === "return"
                                ? "bg-purple-900/40 text-purple-400 border border-purple-700/40"
                                : "bg-amber-900/30 text-amber-400 border border-amber-700/40"
                        }`}>
                            {track.trackType === "return" ? "Return" : "Group"}
                        </span>
                    </div>
                )}

                {/* Instrument (no type icon) */}
                {track.instrument && (
                    <div className="flex items-center gap-1.5 mt-0.5 pl-5">
                        <span className="text-xs text-zinc-400 truncate">{track.instrument}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
