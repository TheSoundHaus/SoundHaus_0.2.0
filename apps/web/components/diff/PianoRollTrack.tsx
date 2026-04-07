"use client";

/**
 * PianoRollTrack — Canvas-based MIDI note visualization for diff view.
 *
 * Renders a piano roll grid showing MIDI notes as colored rectangles:
 *   - Y-axis: MIDI pitches (C2–C7, labeled at octave boundaries)
 *   - X-axis: beats (synced with zoom via pixelsPerBeat)
 *   - Note colors: green=added, red=removed, blue=modified, gray=unchanged
 *   - Velocity mapped to opacity (0.3 min, 1.0 max)
 *   - Hover tooltip: note name, beat position, velocity, change description
 *
 * Delegates all canvas rendering to the usePianoRollRenderer hook.
 */

import type { MidiClipDiff, TrackDiff } from "./types/diff";
import { midiPitchToName, beatsToBarPosition } from "./types/diff";
import { usePianoRollRenderer } from "./hooks/usePianoRollRenderer";
import type { MidiNote } from "./types/diff";

// ── Props ──────────────────────────────────────────────────────────────────

interface PianoRollTrackProps {
    /** MIDI clip diffs to render. */
    midiClips: MidiClipDiff[];
    /** Total timeline length in beats. */
    totalBeats: number;
    /** Overall track change type. */
    changeType: TrackDiff["changeType"];
    /** Canvas height in pixels. Default: 400 for expanded, 48 for collapsed. */
    height?: number;
    /** Pixels per beat (from zoom context). Default: 20. */
    pixelsPerBeat?: number;
    /** Ghost notes for comparison view ("before" state of modified notes). */
    ghostNotes?: MidiNote[];
    /** Whether the track is in collapsed (overview) mode. */
    isCollapsed?: boolean;
    /** Global pitch min (shared across all MIDI tracks for consistent note sizing). */
    globalPitchMin?: number;
    /** Global pitch max (shared across all MIDI tracks for consistent note sizing). */
    globalPitchMax?: number;
}

// ── Helper: build modification detail lines for tooltip ────────────────────

function getModificationDetails(
    afterNote: MidiNote,
    beforeNote?: MidiNote,
): string[] {
    if (!beforeNote) return ["modified"];
    const details: string[] = [];
    if (beforeNote.pitch !== afterNote.pitch) {
        details.push(`Pitch: ${midiPitchToName(beforeNote.pitch)} → ${midiPitchToName(afterNote.pitch)}`);
    }
    if (beforeNote.velocity !== afterNote.velocity) {
        const delta = afterNote.velocity - beforeNote.velocity;
        const sign = delta > 0 ? "+" : "";
        details.push(`Velocity: ${beforeNote.velocity} → ${afterNote.velocity} (${sign}${delta})`);
    }
    if (Math.abs(beforeNote.durationBeats - afterNote.durationBeats) > 0.001) {
        details.push(`Duration: ${beforeNote.durationBeats.toFixed(2)} → ${afterNote.durationBeats.toFixed(2)} beats`);
    }
    if (Math.abs(beforeNote.startBeat - afterNote.startBeat) > 0.001) {
        details.push(`Position: beat ${beforeNote.startBeat.toFixed(2)} → ${afterNote.startBeat.toFixed(2)}`);
    }
    return details.length > 0 ? details : ["modified"];
}

// ── Component ──────────────────────────────────────────────────────────────

export function PianoRollTrack({
    midiClips,
    totalBeats,
    changeType,
    height = 400,
    pixelsPerBeat = 20,
    ghostNotes,
    isCollapsed = false,
    globalPitchMin,
    globalPitchMax,
}: PianoRollTrackProps) {
    const { canvasRef, hoveredNote, handleMouseMove, handleMouseLeave } =
        usePianoRollRenderer({
            midiClips,
            totalBeats,
            pixelsPerBeat,
            height,
            changeType,
            ghostNotes,
            isCollapsed,
            globalPitchMin,
            globalPitchMax,
        });

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                width={totalBeats * pixelsPerBeat}
                height={height}
                className="block"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            {/* Tooltip overlay — follows cursor when a note is hovered */}
            {hoveredNote && (
                <div
                    className="pointer-events-none absolute z-50 rounded bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg border border-zinc-700"
                    style={{
                        left: hoveredNote.x + 12,
                        top: hoveredNote.y - 8,
                    }}
                >
                    <div className="font-medium">
                        {midiPitchToName(hoveredNote.note.pitch)}
                    </div>
                    <div className="text-zinc-400">
                        Beat {beatsToBarPosition(hoveredNote.note.startBeat)}
                    </div>
                    <div className="text-zinc-400">
                        Vel: {hoveredNote.note.velocity}
                    </div>
                    <div
                        className={
                            hoveredNote.changeType === "added"
                                ? "text-emerald-400"
                                : hoveredNote.changeType === "removed"
                                  ? "text-rose-400"
                                  : hoveredNote.changeType === "modified"
                                    ? "text-glass-blue-400"
                                    : "text-zinc-500"
                        }
                    >
                        {hoveredNote.changeType === "modified" ? (
                            <div className="space-y-0.5 mt-0.5 border-t border-zinc-700 pt-1">
                                {getModificationDetails(
                                    hoveredNote.note,
                                    hoveredNote.beforeNote,
                                ).map((line, i) => (
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                        ) : (
                            hoveredNote.changeType
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
