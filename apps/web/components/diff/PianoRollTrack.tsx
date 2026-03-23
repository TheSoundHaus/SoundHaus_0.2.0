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
}

// ── Component ──────────────────────────────────────────────────────────────

export function PianoRollTrack({
    midiClips,
    totalBeats,
    changeType,
    height = 400,
    pixelsPerBeat = 20,
    ghostNotes,
}: PianoRollTrackProps) {
    const { canvasRef, hoveredNote, handleMouseMove, handleMouseLeave } =
        usePianoRollRenderer({
            midiClips,
            totalBeats,
            pixelsPerBeat,
            height,
            changeType,
            ghostNotes,
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
                    className="pointer-events-none absolute z-50 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 shadow-lg border border-zinc-700"
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
                        {hoveredNote.changeType}
                    </div>
                </div>
            )}
        </div>
    );
}
