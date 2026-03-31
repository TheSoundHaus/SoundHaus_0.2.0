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

type Props = {
    noteDiff: NoteDiff | null;
};

const PianoRollCanvas: React.FC<Props> = ({ noteDiff }) => {
    const added = noteDiff?.added ?? [];
    const removed = noteDiff?.removed ?? [];
    const adjusted = noteDiff?.adjusted ?? [];

    const allNotes: SnapshotNote[] = [
        ...added,
        ...removed,
        ...adjusted.flatMap((a) => [a.from, a.to]),
    ];

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

    const yForPitch = (pitch: number) => {
        const relative = (pitch - minPitch) / pitchRange;
        return height - 20 - relative * (height - 30);
    };

    const xForBeat = (beat: number) => {
        return 10 + ((beat - minStart) / timeRange) * (width - 20);
    };

    const renderNote = (note: SnapshotNote, fill: string, key: string) => {
        const x = xForBeat(note.start_beat);
        const y = yForPitch(note.pitch);
        const w = Math.max(2, (note.duration_beats / timeRange) * (width - 20));
        const h = Math.max(4, (height - 30) / Math.min(18, pitchRange));
        return <rect key={key} x={x} y={y - h} width={w} height={h} fill={fill} rx={2} />;
    };

    return (
        <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, overflow: 'hidden' }}>
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
                {removed.map((n, i) => renderNote(n, '#d9534f', `removed-${i}`))}
                {added.map((n, i) => renderNote(n, '#5cb85c', `added-${i}`))}
                {adjusted.map((pair, i) => (
                    <g key={`adjusted-${i}`}>
                        {renderNote(pair.from, '#f0ad4e', `adjusted-from-${i}`)}
                        {renderNote(pair.to, '#337ab7', `adjusted-to-${i}`)}
                    </g>
                ))}
            </svg>
            <div style={{ display: 'flex', gap: 12, padding: '8px 12px', fontSize: 12, color: '#666' }}>
                <span>Added: {added.length}</span>
                <span>Removed: {removed.length}</span>
                <span>Adjusted: {adjusted.length}</span>
            </div>
        </div>
    );
};

export default PianoRollCanvas;
