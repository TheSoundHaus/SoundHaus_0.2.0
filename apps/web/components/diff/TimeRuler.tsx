"use client";

/**
 * TimeRuler — Horizontal beat/bar ruler for the diff timeline.
 *
 * Renders a ruler along the top of the timeline showing:
 *   - Bar numbers (bold, every N beats based on time signature)
 *   - Beat subdivisions (lighter lines)
 *   - Tempo display (BPM badge at the left)
 *   - Time signature display
 *   - Responds to zoom level (from TimelineZoom context)
 *
 * PROPS:
 *   totalBeats     — Total arrangement length in beats
 *   tempo          — Current tempo in BPM (for time display)
 *   timeSignature  — [numerator, denominator] (e.g., [4, 4])
 *
 * IMPLEMENTATION NOTES:
 *   - Rendered as SVG for crisp lines at any zoom level
 *   - Bar lines are brighter than beat lines
 *   - At high zoom, show beat subdivisions (8th notes, 16th notes)
 *   - At low zoom, only show bar numbers
 *   - Desktop team can use this unchanged in Electron
 */

import type { FC } from "react";

// ── Props ──────────────────────────────────────────────────────────────────

interface TimeRulerProps {
    /** Total number of beats in the arrangement. */
    totalBeats: number;
    /** Tempo in BPM. Used for displaying time alongside beat numbers. */
    tempo?: number;
    /** Time signature as [numerator, denominator]. Default: [4, 4]. */
    timeSignature?: [number, number];
    /** Pixels per beat (controlled by zoom). Default: 20. */
    pixelsPerBeat?: number;
    /** Height of the ruler in pixels. Default: 32. */
    height?: number;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * Renders the beat/bar ruler.
 *
 * TODO: Implement these steps:
 *   1. Calculate total width: totalBeats * pixelsPerBeat
 *   2. Calculate beats per bar from timeSignature[0]
 *   3. Render SVG with width = total width, height = ruler height
 *   4. For each bar:
 *      - Draw a vertical line (zinc-500, 1px) at barIndex * beatsPerBar * pixelsPerBeat
 *      - Draw bar number text above the line
 *   5. For each beat (not on a bar line):
 *      - Draw a shorter, dimmer vertical line (zinc-700, 0.5px)
 *   6. At high zoom (pixelsPerBeat > 40): draw subdivision lines (16th notes)
 *   7. Render tempo badge at far left: "♩ = {tempo} BPM"
 *   8. Render time signature badge: "{num}/{denom}"
 */
export const TimeRuler: FC<TimeRulerProps> = ({
    totalBeats,
    tempo,
    timeSignature = [4, 4],
    pixelsPerBeat = 20,
    height = 32,
}) => {
    const beatsPerBar = timeSignature[0];
    const totalBars = Math.ceil(totalBeats / beatsPerBar);
    const totalWidth = totalBeats * pixelsPerBeat;

    return (
        <div className="border-b border-zinc-800 bg-zinc-900/80 sticky top-0 z-10 flex items-end">
            {/* Tempo + time sig badges */}
            <div className="w-52 shrink-0 border-r border-zinc-800 px-3 py-1 flex items-center gap-2">
                {tempo && (
                    <span className="text-xs text-zinc-400 font-mono">
                        ♩ = {Math.round(tempo)}
                    </span>
                )}
                <span className="text-xs text-zinc-500 font-mono">
                    {timeSignature[0]}/{timeSignature[1]}
                </span>
            </div>

            {/* Beat ruler */}
            <div className="flex-1 overflow-hidden">
                <svg width={totalWidth} height={height} className="block">
                    {/* Bar lines + bar numbers */}
                    {Array.from({ length: totalBars }, (_, barIdx) => {
                        const x = barIdx * beatsPerBar * pixelsPerBeat;
                        return (
                            <g key={`bar-${barIdx}`}>
                                <line
                                    x1={x}
                                    y1={0}
                                    x2={x}
                                    y2={height}
                                    stroke="#52525B"
                                    strokeWidth={1}
                                />
                                <text
                                    x={x + 4}
                                    y={height - 8}
                                    fill="#A1A1AA"
                                    fontSize={10}
                                    fontFamily="monospace"
                                >
                                    {barIdx + 1}
                                </text>
                            </g>
                        );
                    })}

                    {/* Beat lines (non-bar beats) */}
                    {Array.from({ length: Math.ceil(totalBeats) }, (_, beat) => {
                        if (beat % beatsPerBar === 0) return null; // already drawn as bar line
                        const x = beat * pixelsPerBeat;
                        return (
                            <line
                                key={`beat-${beat}`}
                                x1={x}
                                y1={height * 0.4}
                                x2={x}
                                y2={height}
                                stroke="#3F3F46"
                                strokeWidth={0.5}
                            />
                        );
                    })}

                    {/* At high zoom: 16th note subdivision lines */}
                    {pixelsPerBeat > 40 &&
                        Array.from({ length: Math.ceil(totalBeats) }, (_, beat) =>
                            [1, 2, 3].map((sub) => {
                                const x = (beat + sub / 4) * pixelsPerBeat;
                                return (
                                    <line
                                        key={`sub-${beat}-${sub}`}
                                        x1={x}
                                        y1={height * 0.7}
                                        x2={x}
                                        y2={height}
                                        stroke="#27272A"
                                        strokeWidth={0.5}
                                    />
                                );
                            }),
                        )}
                </svg>
            </div>
        </div>
    );
};
