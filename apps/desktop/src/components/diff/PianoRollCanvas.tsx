import { useState } from 'react';
import React from 'react';

type SnapshotNote = {
    pitch: number;
    start_beat: number;
    duration_beats: number;
    velocity: number;
    note_id?: string | null;
};

type NoteDiff = {
    added: SnapshotNote[];
    removed: SnapshotNote[];
    adjusted: Array<{ from: SnapshotNote; to: SnapshotNote }>;
};

type TooltipState = {
    text: string;
    x: number;
    y: number;
};

type Props = {
    noteDiff: NoteDiff | null;
};

const EPSILON = 0.001;

const PianoRollCanvas: React.FC<Props> = ({ noteDiff }) => {
    const [hoveredPairIndex, setHoveredPairIndex] = useState<number | null>(null);
    const [selectedPairIndex, setSelectedPairIndex] = useState<number | null>(null);
    const [hoveredTooltip, setHoveredTooltip] = useState<TooltipState | null>(null);
    const [selectedTooltip, setSelectedTooltip] = useState<TooltipState | null>(null);

    const added = noteDiff?.added ?? [];
    const removed = noteDiff?.removed ?? [];
    const adjusted = noteDiff?.adjusted ?? [];
    const adjustedPairs = adjusted.map((pair, index) => ({ ...pair, index }));

    const allNotes: SnapshotNote[] = [
        ...added,
        ...removed,
        ...adjustedPairs.flatMap((pair) => [pair.from, pair.to]),
    ];

    const activePairIndex = hoveredPairIndex ?? selectedPairIndex;
    const tooltip = hoveredTooltip ?? selectedTooltip;

    if (allNotes.length === 0) {
        return <p style={{ color: '#888' }}>No MIDI note changes in this commit.</p>;
    }

    const minPitch = Math.min(...allNotes.map((n) => n.pitch));
    const maxPitch = Math.max(...allNotes.map((n) => n.pitch));
    const minStart = Math.min(...allNotes.map((n) => n.start_beat));
    const maxEnd = Math.max(...allNotes.map((n) => n.start_beat + n.duration_beats));

    const pitchRange = Math.max(1, maxPitch - minPitch + 1);
    const timeRange = Math.max(1, maxEnd - minStart);

    const width = 900;
    const height = 260;
    const noteHeight = Math.max(4, (height - 30) / Math.min(18, pitchRange));

    const yForPitch = (pitch: number) => {
        const relative = (pitch - minPitch) / pitchRange;
        return height - 20 - relative * (height - 30);
    };

    const xForBeat = (beat: number) => {
        return 10 + ((beat - minStart) / timeRange) * (width - 20);
    };

    const formatPitchName = (pitch: number) => {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const clamped = Math.max(0, Math.min(127, pitch));
        const octave = Math.floor(clamped / 12) - 2;
        return `${notes[clamped % 12]}${octave}`;
    };

    const formatBeats = (beats: number) => {
        const rounded = Math.round(beats * 100) / 100;
        return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2)} beats`;
    };

    const getPairLabel = (from: SnapshotNote, to: SnapshotNote) => {
        if (from.pitch === to.pitch) {
            const delta = to.duration_beats - from.duration_beats;
            if (Math.abs(delta) < EPSILON) {
                return `${formatPitchName(to.pitch)} unchanged`;
            }
            const verb = delta > 0 ? 'Extended' : 'Shortened';
            const change = delta > 0 ? `+${formatBeats(delta)}` : `-${formatBeats(Math.abs(delta))}`;
            return `${verb}: ${formatPitchName(to.pitch)} ${change}`;
        }

        return `${formatPitchName(from.pitch)} -> ${formatPitchName(to.pitch)}`;
    };

    const pairStrokeColor = (pairIndex: number) => (activePairIndex === pairIndex ? '#1f2937' : 'transparent');

    const renderBaseRect = (
        note: SnapshotNote,
        fill: string,
        key: string,
        options?: {
            opacity?: number;
            stroke?: string;
            strokeWidth?: number;
            dash?: string;
            cursor?: string;
            onMouseEnter?: (event: React.MouseEvent<SVGRectElement>) => void;
            onMouseMove?: (event: React.MouseEvent<SVGRectElement>) => void;
            onMouseLeave?: () => void;
            onClick?: (event: React.MouseEvent<SVGRectElement>) => void;
            title?: string;
        }
    ) => {
        const x = xForBeat(note.start_beat);
        const y = yForPitch(note.pitch);
        const widthPx = Math.max(2, (note.duration_beats / timeRange) * (width - 20));

        return (
            <rect
                key={key}
                x={x}
                y={y - noteHeight}
                width={widthPx}
                height={noteHeight}
                fill={fill}
                rx={2}
                opacity={options?.opacity ?? 1}
                stroke={options?.stroke ?? 'transparent'}
                strokeWidth={options?.strokeWidth ?? 0}
                strokeDasharray={options?.dash}
                style={{
                    cursor: options?.cursor ?? 'default',
                    transition: 'opacity 120ms ease, stroke 120ms ease, filter 120ms ease',
                    filter: options?.strokeWidth ? 'drop-shadow(0 0 4px rgba(31, 41, 55, 0.20))' : 'none',
                }}
                onMouseEnter={options?.onMouseEnter}
                onMouseMove={options?.onMouseMove}
                onMouseLeave={options?.onMouseLeave}
                onClick={options?.onClick}
            >
                {options?.title ? <title>{options.title}</title> : null}
            </rect>
        );
    };

    const renderPairConnector = (pair: { from: SnapshotNote; to: SnapshotNote }, index: number) => {
        if (activePairIndex !== index) return null;

        const fromX = xForBeat(pair.from.start_beat) + Math.max(2, (pair.from.duration_beats / timeRange) * (width - 20)) / 2;
        const fromY = yForPitch(pair.from.pitch) - noteHeight / 2;
        const toX = xForBeat(pair.to.start_beat) + Math.max(2, (pair.to.duration_beats / timeRange) * (width - 20)) / 2;
        const toY = yForPitch(pair.to.pitch) - noteHeight / 2;

        return (
            <line
                key={`pair-connector-${index}`}
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke="#1f2937"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.55}
            />
        );
    };

    const buildPairHandlers = (index: number, label: string) => ({
        onMouseEnter: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredPairIndex(index);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseMove: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredPairIndex(index);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseLeave: () => {
            setHoveredPairIndex((current) => (current === index ? null : current));
            setHoveredTooltip(null);
        },
        onClick: (event: React.MouseEvent<SVGRectElement>) => {
            const nextSelected = selectedPairIndex === index ? null : index;
            setSelectedPairIndex(nextSelected);
            setSelectedTooltip(
                nextSelected === null
                    ? null
                    : {
                          text: label,
                          x: event.clientX,
                          y: event.clientY,
                      }
            );
        },
    });

    return (
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
            <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
                Piano Roll Diff
            </div>
            <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', background: '#fff' }}>
                {Array.from({ length: Math.min(24, pitchRange) }).map((_, i) => {
                    const pitch = minPitch + i;
                    const y = yForPitch(pitch);
                    return (
                        <line
                            key={`grid-p-${pitch}`}
                            x1={0}
                            y1={y}
                            x2={width}
                            y2={y}
                            stroke="#f3f3f3"
                            strokeWidth={1}
                        />
                    );
                })}

                {adjustedPairs.map((pair) => {
                    const samePitch = pair.from.pitch === pair.to.pitch;
                    const label = getPairLabel(pair.from, pair.to);
                    const handlers = buildPairHandlers(pair.index, label);
                    const active = activePairIndex === pair.index;
                    const fromX = xForBeat(pair.from.start_beat);
                    const fromWidth = Math.max(2, (pair.from.duration_beats / timeRange) * (width - 20));
                    const toX = xForBeat(pair.to.start_beat);
                    const toWidth = Math.max(2, (pair.to.duration_beats / timeRange) * (width - 20));
                    const oldEndX = fromX + fromWidth;
                    const newEndX = toX + toWidth;
                    const deltaStart = Math.min(oldEndX, newEndX);
                    const deltaWidth = Math.abs(newEndX - oldEndX);
                    const extension = pair.to.duration_beats > pair.from.duration_beats + EPSILON;
                    const shortening = pair.from.duration_beats > pair.to.duration_beats + EPSILON;

                    return (
                        <g key={`adjusted-${pair.index}`}>
                            {samePitch ? (
                                <>
                                    {renderBaseRect(pair.from, 'none', `adjusted-from-outline-${pair.index}`, {
                                        opacity: 1,
                                        stroke: '#f0ad4e',
                                        strokeWidth: active ? 2.5 : 1.5,
                                        dash: '5 3',
                                        cursor: 'pointer',
                                        title: label,
                                        ...handlers,
                                    })}
                                    {renderBaseRect(pair.to, '#337ab7', `adjusted-to-solid-${pair.index}`, {
                                        opacity: active ? 1 : 0.92,
                                        stroke: pairStrokeColor(pair.index),
                                        strokeWidth: active ? 2 : 0,
                                        cursor: 'pointer',
                                        title: label,
                                        ...handlers,
                                    })}
                                    {extension && deltaWidth > 0 ? (
                                        <rect
                                            x={oldEndX}
                                            y={yForPitch(pair.to.pitch) - noteHeight}
                                            width={deltaWidth}
                                            height={noteHeight}
                                            fill="#5b8def"
                                            opacity={0.95}
                                            rx={2}
                                        />
                                    ) : null}
                                    {shortening && deltaWidth > 0 ? (
                                        <rect
                                            x={deltaStart}
                                            y={yForPitch(pair.from.pitch) - noteHeight}
                                            width={deltaWidth}
                                            height={noteHeight}
                                            fill="#f0ad4e"
                                            opacity={0.45}
                                            rx={2}
                                        />
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    {renderBaseRect(pair.from, '#f0ad4e', `adjusted-from-${pair.index}`, {
                                        opacity: active ? 0.95 : 0.72,
                                        stroke: pairStrokeColor(pair.index),
                                        strokeWidth: active ? 2 : 0,
                                        cursor: 'pointer',
                                        title: label,
                                        ...handlers,
                                    })}
                                    {renderBaseRect(pair.to, '#337ab7', `adjusted-to-${pair.index}`, {
                                        opacity: active ? 1 : 0.92,
                                        stroke: pairStrokeColor(pair.index),
                                        strokeWidth: active ? 2 : 0,
                                        cursor: 'pointer',
                                        title: label,
                                        ...handlers,
                                    })}
                                </>
                            )}
                            {renderPairConnector(pair, pair.index)}
                        </g>
                    );
                })}

                {removed.map((n, i) =>
                    renderBaseRect(n, '#d9534f', `removed-${i}`, {
                        opacity: 0.85,
                    })
                )}
                {added.map((n, i) =>
                    renderBaseRect(n, '#5cb85c', `added-${i}`, {
                        opacity: 0.9,
                    })
                )}
            </svg>

            {tooltip ? (
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(tooltip.x + 14, window.innerWidth - 220),
                        top: Math.min(tooltip.y + 14, window.innerHeight - 56),
                        background: 'rgba(17, 24, 39, 0.96)',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        lineHeight: 1.2,
                        pointerEvents: 'none',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
                        zIndex: 20,
                        maxWidth: 220,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {tooltip.text}
                </div>
            ) : null}

            <div style={{ display: 'flex', gap: 12, padding: '8px 12px', fontSize: 12, color: '#666' }}>
                <span>Added: {added.length}</span>
                <span>Removed: {removed.length}</span>
                <span>Adjusted: {adjusted.length}</span>
            </div>
        </div>
    );
};

export default PianoRollCanvas;
