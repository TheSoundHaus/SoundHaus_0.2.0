/**
 * usePianoRollRenderer — Ableton-quality Canvas MIDI note visualization.
 *
 * Renders a polished piano roll with:
 *   - Auto-detected pitch range (notes always fill the canvas)
 *   - Smooth anti-aliased grid with alternating pitch lane shading
 *   - HiDPI-aware rendering (2x device pixel ratio)
 *   - Velocity-mapped color saturation + brightness
 *   - Rounded rect notes with subtle glow/shadows
 *   - Ghost notes for "before" state in comparison mode
 *   - Hover tooltip with note name, velocity, position, duration
 *
 * USAGE:
 *   const { canvasRef, hoveredNote } = usePianoRollRenderer({
 *     midiClips, totalBeats, pixelsPerBeat, height, changeType
 *   });
 *   return <canvas ref={canvasRef} />;
 */

"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { MidiClipDiff, MidiNote } from "../types/diff";
import { midiPitchToName } from "../types/diff";

// ── Ableton-style color palette ────────────────────────────────────────────

// Background: Ableton-dark charcoal
const BG_COLOR = "#1a1a1f";
// Grid: very subtle, never distracting
const GRID_ROW_ALT   = "rgba(255,255,255,0.02)";  // alternating row tint
const GRID_LINE_FINE  = "rgba(255,255,255,0.04)";  // hairline pitch lines
const GRID_LINE_C     = "rgba(255,255,255,0.10)";  // C-note lane separator
const GRID_BEAT_FINE  = "rgba(255,255,255,0.05)";  // inner beat lines
const GRID_BAR_LINE   = "rgba(255,255,255,0.12)";  // bar boundaries
const GRID_SUBDIV     = "rgba(255,255,255,0.025)"; // 16th subdivisions

// Notes — punchy, saturated, high-contrast against dark BG
const NOTE_COLORS = {
    unchanged: { base: [140, 140, 150], glow: "rgba(140,140,150,0.15)" },  // dim zinc
    added:     { base: [0, 255, 135],   glow: "rgba(0,255,135,0.45)" },    // vivid green
    removed:   { base: [255, 70, 90],   glow: "rgba(255,70,90,0.45)" },    // vivid red
    modified:  { base: [60, 160, 255],  glow: "rgba(60,160,255,0.5)" },    // vivid blue
};

// Padding: extra semitones above/below actual note range
const PITCH_PADDING = 3;

// ── Internal Tagged Note ───────────────────────────────────────────────────

/** A note with its change type and arrangement-absolute position. */
interface TaggedNote {
    note: MidiNote;
    absoluteStart: number;
    absoluteEnd: number;
    changeType: "added" | "removed" | "modified" | "unchanged";
    /** For modified notes, the "before" state — used to show what changed in tooltips. */
    beforeNote?: MidiNote;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface UsePianoRollRendererArgs {
    midiClips: MidiClipDiff[];
    totalBeats: number;
    pixelsPerBeat: number;
    height: number;
    changeType: "added" | "removed" | "modified" | "unchanged";
    ghostNotes?: MidiNote[];
    /** When true, notes are rendered in a condensed overview — pitch labels hidden. */
    isCollapsed?: boolean;
}

export interface HoveredNoteInfo {
    note: MidiNote;
    changeType: "added" | "removed" | "modified" | "unchanged";
    x: number;
    y: number;
    /** For modified notes, the "before" state — enables rich tooltip showing what changed. */
    beforeNote?: MidiNote;
}

interface UsePianoRollRendererResult {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    hoveredNote: HoveredNoteInfo | null;
    handleMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => void;
    handleMouseLeave: () => void;
}

// ── Helper: flatten clips into tagged notes ────────────────────────────────

function flattenClips(
    clips: MidiClipDiff[],
    trackChangeType: "added" | "removed" | "modified" | "unchanged",
): TaggedNote[] {
    const tagged: TaggedNote[] = [];

    for (const clip of clips) {
        const offset = clip.startBeat;

        if (clip.unchangedNotes) {
            for (const n of clip.unchangedNotes) {
                tagged.push({
                    note: n,
                    absoluteStart: offset + n.startBeat,
                    absoluteEnd: offset + n.startBeat + n.durationBeats,
                    changeType: trackChangeType === "added" ? "added"
                              : trackChangeType === "removed" ? "removed"
                              : "unchanged",
                });
            }
        }

        for (const n of clip.addedNotes) {
            tagged.push({
                note: n,
                absoluteStart: offset + n.startBeat,
                absoluteEnd: offset + n.startBeat + n.durationBeats,
                changeType: "added",
            });
        }

        for (const n of clip.removedNotes) {
            tagged.push({
                note: n,
                absoluteStart: offset + n.startBeat,
                absoluteEnd: offset + n.startBeat + n.durationBeats,
                changeType: "removed",
            });
        }

        for (const mod of clip.modifiedNotes) {
            tagged.push({
                note: mod.after,
                absoluteStart: offset + mod.after.startBeat,
                absoluteEnd: offset + mod.after.startBeat + mod.after.durationBeats,
                changeType: "modified",
                beforeNote: mod.before,
            });
        }
    }

    return tagged;
}

// ── Helper: auto-detect pitch range from notes ─────────────────────────────

function detectPitchRange(
    tagged: TaggedNote[],
    ghosts: MidiNote[] | undefined,
): { pitchMin: number; pitchMax: number } {
    let lo = 127;
    let hi = 0;

    for (const tn of tagged) {
        if (tn.note.pitch < lo) lo = tn.note.pitch;
        if (tn.note.pitch > hi) hi = tn.note.pitch;
    }
    if (ghosts) {
        for (const n of ghosts) {
            if (n.pitch < lo) lo = n.pitch;
            if (n.pitch > hi) hi = n.pitch;
        }
    }

    // Fallback if empty
    if (lo > hi) { lo = 48; hi = 72; }

    // Add padding and snap to C boundaries for cleanliness
    lo = Math.max(0, Math.floor((lo - PITCH_PADDING) / 12) * 12);
    hi = Math.min(127, Math.ceil((hi + PITCH_PADDING + 1) / 12) * 12);

    // Ensure minimum 2 octaves for visual quality
    if (hi - lo < 24) {
        const mid = Math.round((lo + hi) / 2);
        lo = Math.max(0, mid - 12);
        hi = Math.min(127, mid + 12);
    }

    return { pitchMin: lo, pitchMax: hi };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePianoRollRenderer({
    midiClips,
    totalBeats,
    pixelsPerBeat,
    height,
    changeType,
    ghostNotes,
    isCollapsed = false,
}: UsePianoRollRendererArgs): UsePianoRollRendererResult {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [hoveredNote, setHoveredNote] = useState<HoveredNoteInfo | null>(null);
    const animFrameRef = useRef<number>(0);

    // Pre-flatten all clips
    const tagged = useMemo(
        () => flattenClips(midiClips, changeType),
        [midiClips, changeType],
    );

    // Auto-detect pitch range from actual notes
    const { pitchMin, pitchMax } = useMemo(
        () => detectPitchRange(tagged, ghostNotes),
        [tagged, ghostNotes],
    );
    const pitchRange = pitchMax - pitchMin;
    const pitchRowHeight = height / pitchRange;

    // ── Drawing helpers ────────────────────────────────────────────────

    const drawGrid = useCallback(
        (ctx: CanvasRenderingContext2D, width: number, h: number) => {
            // Alternating pitch rows — Ableton-style lane shading
            for (let i = 0; i < pitchRange; i++) {
                const y = i * pitchRowHeight;
                const pitch = pitchMax - i;
                const isBlackKey = [1, 3, 6, 8, 10].includes(pitch % 12);

                // Black keys get slightly darker bg
                if (isBlackKey) {
                    ctx.fillStyle = GRID_ROW_ALT;
                    ctx.fillRect(0, y, width, pitchRowHeight);
                }

                // C-note rows get a brighter separator
                const isC = pitch % 12 === 0;
                ctx.strokeStyle = isC ? GRID_LINE_C : GRID_LINE_FINE;
                ctx.lineWidth = isC ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            // Vertical beat/bar lines
            for (let beat = 0; beat <= totalBeats; beat++) {
                const x = beat * pixelsPerBeat;
                const isBar = beat % 4 === 0;
                ctx.strokeStyle = isBar ? GRID_BAR_LINE : GRID_BEAT_FINE;
                ctx.lineWidth = isBar ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }

            // At high zoom, draw 16th note subdivisions
            if (pixelsPerBeat > 40) {
                ctx.strokeStyle = GRID_SUBDIV;
                ctx.lineWidth = 0.5;
                for (let beat = 0; beat < totalBeats; beat++) {
                    for (let sub = 1; sub < 4; sub++) {
                        const x = (beat + sub / 4) * pixelsPerBeat;
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, h);
                        ctx.stroke();
                    }
                }
            }
        },
        [pixelsPerBeat, totalBeats, pitchRowHeight, pitchRange, pitchMax],
    );

    const drawNote = useCallback(
        (
            ctx: CanvasRenderingContext2D,
            absStart: number,
            absEnd: number,
            pitch: number,
            velocity: number,
            ct: "added" | "removed" | "modified" | "unchanged",
            isGhost: boolean,
        ) => {
            if (pitch < pitchMin || pitch >= pitchMax) return;

            const x = absStart * pixelsPerBeat;
            const w = Math.max((absEnd - absStart) * pixelsPerBeat, 3);
            const y = (pitchMax - pitch - 1) * pitchRowHeight;
            // Note fills entire row minus 1px gap for lane visibility
            // In collapsed view, enforce minimum note height for visibility
            const h = isCollapsed
                ? Math.max(pitchRowHeight - 0.5, 2)
                : Math.max(pitchRowHeight - 1, 6);

            const colorSpec = NOTE_COLORS[ct] ?? NOTE_COLORS.unchanged;
            const cr = colorSpec.base[0]!;
            const cg = colorSpec.base[1]!;
            const cb = colorSpec.base[2]!;

            // Velocity maps to both brightness and opacity — punchy Ableton style
            const velNorm = velocity / 127;
            const brightness = 0.65 + velNorm * 0.35; // 65%–100% brightness
            const opacity = isGhost ? 0.15
                : ct === "unchanged" ? 0.25 + velNorm * 0.25
                : ct === "removed" ? 0.55 + velNorm * 0.35
                : 0.7 + velNorm * 0.3; // changed notes rendered bolder

            const br = Math.round(cr * brightness);
            const bg2 = Math.round(cg * brightness);
            const bb = Math.round(cb * brightness);

            // Rounded rect radius — proportional to note height
            const radius = Math.min(3, h / 3);

            // Glow shadow for changed notes — stronger for visibility
            if (!isGhost && ct !== "unchanged") {
                ctx.shadowColor = colorSpec.glow;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            // Fill note body
            ctx.globalAlpha = opacity;
            ctx.fillStyle = `rgb(${br},${bg2},${bb})`;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();

            // Reset shadow
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;

            // Top edge highlight — gives 3D Ableton look
            if (!isGhost && h > 4) {
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = `rgba(255,255,255,0.3)`;
                ctx.fillRect(x + radius, y, w - radius * 2, Math.min(1.5, h * 0.15));
            }

            // Border for changed notes
            if (ct !== "unchanged" || isGhost) {
                ctx.globalAlpha = isGhost ? 0.25 : 0.7;
                ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
                ctx.lineWidth = isGhost || ct === "removed" ? 1 : 1.5;
                if (ct === "removed" || isGhost) {
                    ctx.setLineDash([4, 3]);
                } else {
                    ctx.setLineDash([]);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.globalAlpha = 1;
        },
        [pixelsPerBeat, pitchRowHeight, pitchMin, pitchMax, isCollapsed],
    );

    const drawGhostNotes = useCallback(
        (ctx: CanvasRenderingContext2D) => {
            if (!ghostNotes?.length) return;
            for (const note of ghostNotes) {
                drawNote(
                    ctx,
                    note.startBeat,
                    note.startBeat + note.durationBeats,
                    note.pitch,
                    note.velocity,
                    "removed",
                    true,
                );
            }
        },
        [ghostNotes, drawNote],
    );

    const drawPitchLabels = useCallback(
        (ctx: CanvasRenderingContext2D) => {
            // Skip labels in collapsed view — too cluttered at small heights
            if (isCollapsed) return;

            ctx.font = "bold 9px -apple-system, system-ui, sans-serif";
            ctx.textBaseline = "middle";
            for (let i = 0; i < pitchRange; i++) {
                const pitch = pitchMax - i;
                if (pitch % 12 === 0) {
                    const y = i * pitchRowHeight + pitchRowHeight / 2;
                    ctx.fillStyle = "rgba(255,255,255,0.25)";
                    ctx.fillText(midiPitchToName(pitch), 4, y);
                }
            }
        },
        [pitchRowHeight, pitchRange, pitchMax, isCollapsed],
    );

    // ── Main paint ─────────────────────────────────────────────────────

    const paint = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // HiDPI support — render at 2x for crisp display on Retina
        const dpr = window.devicePixelRatio || 1;
        const width = totalBeats * pixelsPerBeat;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);

        // Enable smooth rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // Background
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, width, height);

        drawGrid(ctx, width, height);
        drawGhostNotes(ctx);

        // Draw all notes — unchanged first, then changed on top
        const unchangedNotes = tagged.filter(t => t.changeType === "unchanged");
        const changedNotes = tagged.filter(t => t.changeType !== "unchanged");

        for (const tn of unchangedNotes) {
            drawNote(ctx, tn.absoluteStart, tn.absoluteEnd, tn.note.pitch, tn.note.velocity, tn.changeType, false);
        }
        for (const tn of changedNotes) {
            drawNote(ctx, tn.absoluteStart, tn.absoluteEnd, tn.note.pitch, tn.note.velocity, tn.changeType, false);
        }

        drawPitchLabels(ctx);
    }, [totalBeats, pixelsPerBeat, height, drawGrid, drawGhostNotes, drawNote, drawPitchLabels, tagged]);

    // Repaint on any input change
    useEffect(() => {
        animFrameRef.current = requestAnimationFrame(paint);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [paint]);

    // ── Hit testing ────────────────────────────────────────────────────

    const hitTest = useCallback(
        (mouseX: number, mouseY: number): HoveredNoteInfo | null => {
            const beat = mouseX / pixelsPerBeat;
            const pitch = pitchMax - 1 - Math.floor(mouseY / pitchRowHeight);
            if (pitch < pitchMin || pitch >= pitchMax) return null;

            for (const tn of tagged) {
                if (
                    tn.note.pitch === pitch &&
                    beat >= tn.absoluteStart &&
                    beat <= tn.absoluteEnd
                ) {
                    return {
                        note: tn.note,
                        changeType: tn.changeType,
                        x: mouseX,
                        y: mouseY,
                        beforeNote: tn.beforeNote,
                    };
                }
            }
            return null;
        },
        [pixelsPerBeat, pitchRowHeight, tagged, pitchMin, pitchMax],
    );

    const handleMouseMove = useCallback(
        (event: React.MouseEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            setHoveredNote(hitTest(x, y));
        },
        [hitTest],
    );

    const handleMouseLeave = useCallback(() => {
        setHoveredNote(null);
    }, []);

    return { canvasRef, hoveredNote, handleMouseMove, handleMouseLeave };
}
