"use client";

/**
 * ChangeOverlay — Transparent overlay highlighting diff regions on tracks.
 *
 * Renders semi-transparent colored rectangles over track visualizations
 * to indicate where changes occurred. Each highlighted region shows:
 *   - A colored overlay (green=added, red=removed, blue=modified)
 *   - A hover popover with: change title, time range, description
 *   - Click to jump: scrolls and zooms the timeline to that region
 *
 * PROPS:
 *   changes      — Array of change regions to highlight
 *   totalBeats   — Total timeline length (for positioning)
 *   trackHeight  — Height of the underlying track visualizer
 *   onJumpTo     — Callback when user clicks a change region (scrolls parent)
 *
 * IMPLEMENTATION NOTES:
 *   - This is an absolutely-positioned div layered ON TOP of PianoRollTrack/WaveformTrack
 *   - Uses pointer-events: none for non-interactive areas, auto for change regions
 *   - Must respond to the same zoom/pan context as the underlying track
 */

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

/** A single change region to highlight on the overlay. */
export interface ChangeRegion {
    /** Unique ID for React key. */
    id: string;
    /** Start position in beats. */
    startBeat: number;
    /** End position in beats. */
    endBeat: number;
    /** Change type determines overlay color. */
    changeType: "added" | "removed" | "modified";
    /** Short title for the change (e.g., "New Clip", "Gain Changed"). */
    title: string;
    /** Longer description shown in popover. */
    description: string;
}

interface ChangeOverlayProps {
    /** Array of change regions to render. */
    changes: ChangeRegion[];
    /** Total timeline length in beats. */
    totalBeats: number;
    /** Height of the underlying track (to match overlay size). */
    trackHeight: number;
    /** Called when user clicks a change region. */
    onJumpTo?: (startBeat: number, endBeat: number) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const OVERLAY_COLORS = {
    added: "rgba(52, 211, 153, 0.18)",     // emerald-400
    removed: "rgba(251, 113, 133, 0.18)",   // rose-400
    modified: "rgba(167, 199, 231, 0.18)",  // glass-blue
} as const;

const BORDER_COLORS = {
    added: "rgba(52, 211, 153, 0.6)",
    removed: "rgba(251, 113, 133, 0.6)",
    modified: "rgba(167, 199, 231, 0.6)",
} as const;

const BADGE_COLORS = {
    added: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Added" },
    removed: { bg: "bg-rose-500/20", text: "text-rose-400", label: "Removed" },
    modified: { bg: "bg-glass-blue-500/20", text: "text-glass-blue-400", label: "Modified" },
} as const;

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Renders change highlight overlays.
 *
 * TODO: Implement these steps:
 *   1. Position this div absolutely over its parent track container
 *   2. For each change in changes[], render a colored rectangle:
 *      - Left position: change.startBeat * pixelsPerBeat (adjusted for zoom)
 *      - Width: (change.endBeat - change.startBeat) * pixelsPerBeat
 *      - Height: full trackHeight
 *      - Background: OVERLAY_COLORS[change.changeType]
 *      - Border-left and border-right: BORDER_COLORS[change.changeType]
 *   3. On hover: show a popover above the region with title + description + time range
 *   4. On click: call onJumpTo(startBeat, endBeat) to scroll/zoom parent to this region
 */
export function ChangeOverlay({
    changes,
    totalBeats,
    trackHeight,
    onJumpTo,
}: ChangeOverlayProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    return (
        <div
            className="absolute inset-0 pointer-events-none"
            style={{ height: trackHeight }}
        >
            {changes.map((change) => {
                const left = (change.startBeat / totalBeats) * 100;
                const width = ((change.endBeat - change.startBeat) / totalBeats) * 100;

                return (
                    <div
                        key={change.id}
                        className="absolute top-0 bottom-0 pointer-events-auto cursor-pointer transition-opacity"
                        style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            backgroundColor: OVERLAY_COLORS[change.changeType],
                            borderLeft: `2px solid ${BORDER_COLORS[change.changeType]}`,
                            borderRight: `2px solid ${BORDER_COLORS[change.changeType]}`,
                        }}
                        onMouseEnter={() => setHoveredId(change.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onClick={() => onJumpTo?.(change.startBeat, change.endBeat)}
                    >
                        {/* Hover tooltip when hoveredId === change.id */}
                        {hoveredId === change.id && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                                <div className="rounded-lg border border-zinc-700 bg-zinc-800/95 backdrop-blur-sm px-3 py-2.5 text-xs shadow-xl whitespace-nowrap">
                                    {/* Change type badge */}
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${BADGE_COLORS[change.changeType].bg} ${BADGE_COLORS[change.changeType].text}`}>
                                            {BADGE_COLORS[change.changeType].label}
                                        </span>
                                        <p className="font-medium text-zinc-100">{change.title}</p>
                                    </div>
                                    <p className="text-zinc-300">{change.description}</p>
                                    {change.startBeat > 0 && (
                                        <p className="text-zinc-500 mt-1 font-mono text-[10px]">
                                            Beat {change.startBeat.toFixed(1)} – {change.endBeat.toFixed(1)}
                                        </p>
                                    )}
                                </div>
                                {/* Tooltip arrow */}
                                <div className="flex justify-center">
                                    <div className="w-2 h-2 -mt-1 rotate-45 bg-zinc-800/95 border-r border-b border-zinc-700" />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
