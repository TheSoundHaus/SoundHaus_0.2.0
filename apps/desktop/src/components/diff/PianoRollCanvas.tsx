import { useEffect, useState } from 'react';
import React from 'react';
import type { SnapshotNote, NoteDiff } from '../../types';

type TooltipState = {
    text: string;
    x: number;
    y: number;
};

type Props = {
    noteDiff: NoteDiff | null;
};

const EPSILON = 0.001;
const MIN_ROLL_WIDTH = 900;
const PIXELS_PER_BEAT = 72;
const ROLL_HEIGHT = 240;

const PianoRollCanvas: React.FC<Props> = ({ noteDiff }) => {
    const [hoveredPairKey, setHoveredPairKey] = useState<string | null>(null);
    const [selectedPairKey, setSelectedPairKey] = useState<string | null>(null);
    const [hoveredNoteKey, setHoveredNoteKey] = useState<string | null>(null);
    const [hoveredTooltip, setHoveredTooltip] = useState<TooltipState | null>(null);
    const [selectedTooltip, setSelectedTooltip] = useState<TooltipState | null>(null);
    const [expandedTracks, setExpandedTracks] = useState<Record<string, boolean>>({});

    const tracks = noteDiff?.tracks ?? [];
    const hasAnyNotes = tracks.some((track) => track.added.length + track.removed.length + track.adjusted.length > 0);
    const activePairKey = hoveredPairKey ?? selectedPairKey;
    const tooltip = hoveredTooltip ?? selectedTooltip;

    useEffect(() => {
        setExpandedTracks((prev) => {
            const next: Record<string, boolean> = {};
            for (const track of tracks) {
                next[track.trackId] = prev[track.trackId] ?? true;
            }
            return next;
        });
    }, [tracks]);

    if (!hasAnyNotes) {
        return <p style={{ color: 'rgba(160,160,160,0.6)' }}>No MIDI note changes in this commit.</p>;
    }

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

    const getNoteActionLabel = (action: 'added' | 'removed', note: SnapshotNote) => {
        return `${action} note ${formatPitchName(note.pitch)} at time ${formatBeats(note.start_beat)}`;
    };

    const buildPairHandlers = (pairKey: string, label: string) => ({
        onMouseEnter: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredPairKey(pairKey);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseMove: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredPairKey(pairKey);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseLeave: () => {
            setHoveredPairKey((current) => (current === pairKey ? null : current));
            setHoveredTooltip(null);
        },
        onClick: (event: React.MouseEvent<SVGRectElement>) => {
            const nextSelected = selectedPairKey === pairKey ? null : pairKey;
            setSelectedPairKey(nextSelected);
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

    const buildSingleNoteHandlers = (noteKey: string, label: string) => ({
        onMouseEnter: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredNoteKey(noteKey);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseMove: (event: React.MouseEvent<SVGRectElement>) => {
            setHoveredNoteKey(noteKey);
            setHoveredTooltip({ text: label, x: event.clientX, y: event.clientY });
        },
        onMouseLeave: () => {
            setHoveredNoteKey((current) => (current === noteKey ? null : current));
            setHoveredTooltip(null);
        },
    });

    const setAllTracksExpanded = (expanded: boolean) => {
        setExpandedTracks(() => {
            const next: Record<string, boolean> = {};
            for (const track of tracks) {
                next[track.trackId] = expanded;
            }
            return next;
        });
    };

    const toggleTrackExpanded = (trackId: string) => {
        setExpandedTracks((prev) => ({
            ...prev,
            [trackId]: !(prev[trackId] ?? true),
        }));
    };

    return (
        <div style={{ display: 'grid', gap: 12, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    onClick={() => setAllTracksExpanded(true)}
                    style={{
                        border: '1px solid rgba(167,199,231,0.2)',
                        background: 'rgba(167,199,231,0.08)',
                        color: '#A7C7E7',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'background 200ms ease',
                    }}
                >
                    Open all
                </button>
                <button
                    type="button"
                    onClick={() => setAllTracksExpanded(false)}
                    style={{
                        border: '1px solid rgba(167,199,231,0.2)',
                        background: 'rgba(167,199,231,0.08)',
                        color: '#A7C7E7',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'background 200ms ease',
                    }}
                >
                    Collapse all
                </button>
            </div>

            {tracks.map((track, trackIndex) => {
                const allTrackNotes: SnapshotNote[] = [
                    ...track.added,
                    ...track.removed,
                    ...track.adjusted.flatMap((pair) => [pair.from, pair.to]),
                ];

                if (allTrackNotes.length === 0) return null;

                const minPitch = Math.min(...allTrackNotes.map((n) => n.pitch));
                const maxPitch = Math.max(...allTrackNotes.map((n) => n.pitch));
                const minStart = Math.min(...allTrackNotes.map((n) => n.start_beat));
                const maxEnd = Math.max(...allTrackNotes.map((n) => n.start_beat + n.duration_beats));

                const pitchRange = Math.max(1, maxPitch - minPitch + 1);
                const timeRange = Math.max(1, maxEnd - minStart);
                const rollWidth = Math.max(MIN_ROLL_WIDTH, Math.ceil(timeRange * PIXELS_PER_BEAT) + 40);
                const noteHeight = Math.max(4, (ROLL_HEIGHT - 32) / Math.min(18, pitchRange));
                const adjustedPairs = track.adjusted.map((pair, pairIndex) => ({
                    ...pair,
                    pairKey: `${track.trackId}:pair:${pairIndex}`,
                }));
                const isExpanded = expandedTracks[track.trackId] ?? true;

                const yForPitch = (pitch: number) => {
                    const relative = (pitch - minPitch) / pitchRange;
                    return ROLL_HEIGHT - 22 - relative * (ROLL_HEIGHT - 34);
                };

                const xForBeat = (beat: number) => {
                    return 12 + ((beat - minStart) / timeRange) * (rollWidth - 24);
                };

                const renderRect = (
                    note: SnapshotNote,
                    fill: string,
                    key: string,
                    options?: {
                        noteKey?: string;
                        opacity?: number;
                        stroke?: string;
                        strokeWidth?: number;
                        dash?: string;
                        cursor?: string;
                        title?: string;
                        onMouseEnter?: (event: React.MouseEvent<SVGRectElement>) => void;
                        onMouseMove?: (event: React.MouseEvent<SVGRectElement>) => void;
                        onMouseLeave?: () => void;
                        onClick?: (event: React.MouseEvent<SVGRectElement>) => void;
                    }
                ) => {
                    const x = xForBeat(note.start_beat);
                    const y = yForPitch(note.pitch);
                    const widthPx = Math.max(2, (note.duration_beats / timeRange) * (rollWidth - 24));
                    const isHoveredSingle = options?.noteKey ? hoveredNoteKey === options.noteKey : false;
                    const strokeWidth = isHoveredSingle ? Math.max(1.5, options?.strokeWidth ?? 0) : options?.strokeWidth ?? 0;

                    return (
                        <rect
                            key={key}
                            x={x}
                            y={y - noteHeight}
                            width={widthPx}
                            height={noteHeight}
                            fill={fill}
                            rx={2}
                            opacity={isHoveredSingle ? 1 : options?.opacity ?? 1}
                            stroke={options?.stroke ?? 'transparent'}
                            strokeWidth={strokeWidth}
                            strokeDasharray={options?.dash}
                            style={{
                                cursor: options?.cursor ?? 'default',
                                transition: 'opacity 120ms ease, stroke 120ms ease, filter 120ms ease',
                                filter: strokeWidth > 0 ? 'drop-shadow(0 0 4px rgba(31, 41, 55, 0.22))' : 'none',
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

                return (
                    <div key={`${track.trackId}-${trackIndex}`} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden', background: 'rgba(20,20,20,0.55)', backdropFilter: 'blur(16px)' }}>
                        <button
                            type="button"
                            onClick={() => toggleTrackExpanded(track.trackId)}
                            aria-expanded={isExpanded}
                            style={{
                                width: '100%',
                                border: 'none',
                                background: 'rgba(255,255,255,0.025)',
                                borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                padding: '8px 12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'background 200ms ease',
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: 'rgba(167,199,231,0.5)', fontSize: 12 }}>{isExpanded ? '▾' : '▸'}</span>
                                <strong style={{ fontSize: 13, color: '#F0F0F0' }}>{track.trackName || 'Unnamed Track'}</strong>
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(160,160,160,0.6)' }}>
                                +{track.added.length} / -{track.removed.length} / ~{track.adjusted.length}
                            </span>
                        </button>

                        {isExpanded ? (
                        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                            <svg width={rollWidth} height={ROLL_HEIGHT} style={{ display: 'block', background: '#111' }}>
                                {Array.from({ length: Math.min(24, pitchRange) }).map((_, i) => {
                                    const pitch = minPitch + i;
                                    const y = yForPitch(pitch);
                                    return (
                                        <line
                                            key={`grid-${track.trackId}-${pitch}`}
                                            x1={0}
                                            y1={y}
                                            x2={rollWidth}
                                            y2={y}
                                            stroke="rgba(255,255,255,0.04)"
                                            strokeWidth={1}
                                        />
                                    );
                                })}

                                {adjustedPairs.map((pair) => {
                                    const samePitch = pair.from.pitch === pair.to.pitch;
                                    const label = getPairLabel(pair.from, pair.to);
                                    const handlers = buildPairHandlers(pair.pairKey, label);
                                    const active = activePairKey === pair.pairKey;

                                    const fromX = xForBeat(pair.from.start_beat);
                                    const fromWidth = Math.max(2, (pair.from.duration_beats / timeRange) * (rollWidth - 24));
                                    const toX = xForBeat(pair.to.start_beat);
                                    const toWidth = Math.max(2, (pair.to.duration_beats / timeRange) * (rollWidth - 24));
                                    const oldEndX = fromX + fromWidth;
                                    const newEndX = toX + toWidth;
                                    const deltaStart = Math.min(oldEndX, newEndX);
                                    const deltaWidth = Math.abs(newEndX - oldEndX);
                                    const extension = pair.to.duration_beats > pair.from.duration_beats + EPSILON;
                                    const shortening = pair.from.duration_beats > pair.to.duration_beats + EPSILON;

                                    return (
                                        <g key={pair.pairKey}>
                                            {samePitch ? (
                                                <>
                                                    {renderRect(pair.from, 'none', `${pair.pairKey}-from-outline`, {
                                                        opacity: 1,
                                                        stroke: '#f59e0b',
                                                        strokeWidth: active ? 2.5 : 1.5,
                                                        dash: '5 3',
                                                        cursor: 'pointer',
                                                        title: label,
                                                        ...handlers,
                                                    })}
                                                    {renderRect(pair.to, '#A7C7E7', `${pair.pairKey}-to-solid`, {
                                                        opacity: active ? 1 : 0.92,
                                                        stroke: active ? 'rgba(167,199,231,0.6)' : 'transparent',
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
                                                            fill="#60a5fa"
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
                                                            fill="#f59e0b"
                                                            opacity={0.45}
                                                            rx={2}
                                                        />
                                                    ) : null}
                                                </>
                                            ) : (
                                                <>
                                                    {renderRect(pair.from, '#f59e0b', `${pair.pairKey}-from`, {
                                                        opacity: active ? 0.95 : 0.72,
                                                        stroke: active ? 'rgba(167,199,231,0.6)' : 'transparent',
                                                        strokeWidth: active ? 2 : 0,
                                                        cursor: 'pointer',
                                                        title: label,
                                                        ...handlers,
                                                    })}
                                                    {renderRect(pair.to, '#A7C7E7', `${pair.pairKey}-to`, {
                                                        opacity: active ? 1 : 0.92,
                                                        stroke: active ? 'rgba(167,199,231,0.6)' : 'transparent',
                                                        strokeWidth: active ? 2 : 0,
                                                        cursor: 'pointer',
                                                        title: label,
                                                        ...handlers,
                                                    })}
                                                </>
                                            )}
                                        </g>
                                    );
                                })}

                                {track.removed.map((note, i) => {
                                    const noteKey = `${track.trackId}:removed:${i}`;
                                    const label = getNoteActionLabel('removed', note);
                                    return renderRect(note, '#ef4444', noteKey, {
                                        noteKey,
                                        opacity: 0.85,
                                        stroke: hoveredNoteKey === noteKey ? '#b91c1c' : 'transparent',
                                        strokeWidth: hoveredNoteKey === noteKey ? 2 : 0,
                                        cursor: 'pointer',
                                        title: label,
                                        ...buildSingleNoteHandlers(noteKey, label),
                                    });
                                })}

                                {track.added.map((note, i) => {
                                    const noteKey = `${track.trackId}:added:${i}`;
                                    const label = getNoteActionLabel('added', note);
                                    return renderRect(note, '#22c55e', noteKey, {
                                        noteKey,
                                        opacity: 0.9,
                                        stroke: hoveredNoteKey === noteKey ? '#15803d' : 'transparent',
                                        strokeWidth: hoveredNoteKey === noteKey ? 2 : 0,
                                        cursor: 'pointer',
                                        title: label,
                                        ...buildSingleNoteHandlers(noteKey, label),
                                    });
                                })}
                            </svg>
                        </div>
                        ) : null}
                    </div>
                );
            })}

            {tooltip ? (
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(tooltip.x + 14, window.innerWidth - 240),
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
                        maxWidth: 240,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {tooltip.text}
                </div>
            ) : null}
        </div>
    );
};

export default PianoRollCanvas;
