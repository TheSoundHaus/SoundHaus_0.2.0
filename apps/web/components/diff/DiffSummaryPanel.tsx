"use client";

/**
 * DiffSummaryPanel — Collapsible sidebar listing all changes in the diff.
 *
 * Renders a right-side panel containing:
 *   - Total change count badge
 *   - Filterable list of change cards (one per track that has changes)
 *   - Each card shows: track name, change type, brief description
 *   - Click a card → scrolls the main timeline to that track
 *   - Can be collapsed/expanded with a toggle button
 *
 * PROPS:
 *   tracks         — Array of TrackDiff objects from the ProjectDiff
 *   onFocusTrack   — Callback when a track card is clicked (parent scrolls to it)
 *   focusedTrackId — Currently focused track ID (for highlight state)
 *
 * IMPLEMENTATION NOTES:
 *   - Filter out unchanged tracks (only show tracks with changes)
 *   - Group by change type: Added → Modified → Removed
 *   - Responsive: on narrow screens, collapse to a floating button
 */

import { useState } from "react";
import { ChevronRight, ChevronLeft, Plus, Minus, RefreshCw } from "lucide-react";
import type { TrackDiff } from "./types/diff";

// ── Props ──────────────────────────────────────────────────────────────────

interface DiffSummaryPanelProps {
    /** All tracks from the diff. Unchanged tracks will be filtered out. */
    tracks: TrackDiff[];
    /** Called when user clicks a track card. Parent should scroll to that track. */
    onFocusTrack: (trackId: string) => void;
    /** Currently focused track ID for highlight styling. */
    focusedTrackId?: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Renders the summary sidebar.
 *
 * TODO: Implement these steps:
 *   1. Filter tracks to only those with changeType !== "unchanged"
 *   2. Group and sort: added first, then modified, then removed
 *   3. Count totals per category
 *   4. Render header with total count and collapse toggle
 *   5. Render list of change cards:
 *      - Icon: + (green), ~ (blue), − (red)
 *      - Track name
 *      - Brief description (e.g., "3 MIDI clips modified", "New audio track")
 *      - Click handler calls onFocusTrack(track.trackId)
 *   6. Highlight card if track.trackId === focusedTrackId
 *   7. Collapsed state: just show the count badge and expand button
 */
export function DiffSummaryPanel({
    tracks,
    onFocusTrack,
    focusedTrackId,
}: DiffSummaryPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Filter to changed tracks only, sorted: added → modified → removed
    const changeTypePriority: Record<string, number> = { added: 0, modified: 1, removed: 2 };
    const changedTracks = tracks
        .filter((t) => t.changeType !== "unchanged")
        .sort((a, b) => (changeTypePriority[a.changeType] ?? 3) - (changeTypePriority[b.changeType] ?? 3));
    const addedCount = changedTracks.filter((t) => t.changeType === "added").length;
    const modifiedCount = changedTracks.filter((t) => t.changeType === "modified").length;
    const removedCount = changedTracks.filter((t) => t.changeType === "removed").length;

    /**
     * Generates a brief description for a track change.
     * E.g., "2 MIDI clips added, volume changed" or "New audio track"
     */
    const getTrackDescription = (track: TrackDiff): string => {
        // TODO: Build description from track's midiClips, audioClips, deviceChanges, parameterChanges
        // For now, return a generic description based on change type
        switch (track.changeType) {
            case "added": return `New ${track.trackType} track`;
            case "removed": return `${track.trackType} track removed`;
            case "modified": {
                const parts: string[] = [];
                if (track.midiClips?.length) parts.push(`${track.midiClips.length} MIDI clip(s)`);
                if (track.audioClips?.length) parts.push(`${track.audioClips.length} audio clip(s)`);
                if (track.deviceChanges?.length) parts.push(`${track.deviceChanges.length} device(s)`);
                if (track.parameterChanges?.length) parts.push(`${track.parameterChanges.length} param(s)`);
                return parts.length > 0 ? parts.join(", ") : "Track modified";
            }
            default: return "";
        }
    };

    if (isCollapsed) {
        return (
            <div className="w-10 shrink-0 border-l border-zinc-800 flex flex-col items-center py-3">
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Expand summary"
                >
                    <ChevronLeft size={16} />
                </button>
                {changedTracks.length > 0 && (
                    <span className="mt-2 text-xs text-glass-blue-400 font-bold">
                        {changedTracks.length}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-zinc-900/95 border-b border-zinc-800 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">Changes</span>
                    <span className="text-xs text-glass-blue-400 bg-glass-blue-400/10 px-1.5 py-0.5 rounded">
                        {changedTracks.length}
                    </span>
                </div>
                <button
                    onClick={() => setIsCollapsed(true)}
                    className="text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Collapse summary"
                >
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Category counts */}
            <div className="px-3 py-2 flex gap-3 text-xs border-b border-zinc-800">
                {addedCount > 0 && <span className="text-emerald-400">+{addedCount} added</span>}
                {modifiedCount > 0 && <span className="text-glass-blue-400">~{modifiedCount} modified</span>}
                {removedCount > 0 && <span className="text-rose-400">−{removedCount} removed</span>}
            </div>

            {/* Change cards */}
            <div className="divide-y divide-zinc-800/50">
                {changedTracks.map((track) => (
                    <button
                        key={track.trackId}
                        onClick={() => onFocusTrack(track.trackId)}
                        className={`
                            w-full text-left px-3 py-2.5 transition-colors hover:bg-zinc-800/50
                            ${focusedTrackId === track.trackId ? "bg-zinc-800/70 border-l-2 border-l-glass-blue-400" : ""}
                        `}
                    >
                        <div className="flex items-center gap-2">
                            {/* Change icon */}
                            {track.changeType === "added" && <Plus size={12} className="text-emerald-400 shrink-0" />}
                            {track.changeType === "modified" && <RefreshCw size={12} className="text-glass-blue-400 shrink-0" />}
                            {track.changeType === "removed" && <Minus size={12} className="text-rose-400 shrink-0" />}
                            <span className="text-sm text-zinc-200 truncate">{track.trackName}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                            {getTrackDescription(track)}
                        </p>
                    </button>
                ))}

                {changedTracks.length === 0 && (
                    <div className="px-3 py-6 text-center text-zinc-600 text-sm">
                        No changes detected
                    </div>
                )}
            </div>
        </div>
    );
}
