/**
 * diffTransformer.ts
 *
 * Converts the Rust semantic-differ output (Change[] tree) into the
 * ProjectDiff shape expected by the backend POST /repos/{owner}/{repo}/diff
 * and the web DiffTimeline component.
 *
 * See: apps/web/components/diff/types/diff.ts for the canonical types.
 */

// ── Rust output types (from semantic-differ) ──

interface RustChange {
    type: string;               // 'Track' | 'Note' | 'Device' | 'Clip' | 'Parameter' | ...
    action: string;             // 'added' | 'removed' | 'adjusted' | 'value_change' | 'modified'
    label: string;
    id?: string;
    from?: string;              // JSON string or scalar
    to?: string;                // JSON string or scalar
    children?: RustChange[];
}

interface RustReport {
    schema_version?: number;
    changes: RustChange[];
    project?: {
        tracks?: Array<{
            id: string;
            label: string;
            track_type: string; // 'MIDI' | 'Audio' | 'Return' | 'Group'
        }>;
    };
}

// ── Web ProjectDiff types (matching apps/web/components/diff/types/diff.ts) ──

interface MidiNote {
    pitch: number;
    startBeat: number;
    durationBeats: number;
    velocity: number;
    channel?: number;
}

interface MidiClipDiff {
    clipName: string;
    startBeat: number;
    endBeat: number;
    addedNotes: MidiNote[];
    removedNotes: MidiNote[];
    modifiedNotes: Array<{ before: MidiNote; after: MidiNote }>;
    unchangedNotes?: MidiNote[];
}

interface AudioClipDiff {
    clipName: string;
    startBeat: number;
    endBeat: number;
    changeType: 'added' | 'removed' | 'modified';
    description: string;
    audioFilePath?: string;
}

interface ParameterChange {
    name: string;
    beforeValue: number | string | null;
    afterValue: number | string | null;
    description: string;
}

interface DeviceChange {
    deviceName: string;
    changeType: 'added' | 'removed' | 'modified';
    parameterChanges?: ParameterChange[];
}

interface TrackDiff {
    trackId: string;
    trackName: string;
    trackType: 'midi' | 'audio' | 'return' | 'group';
    changeType: 'added' | 'removed' | 'modified';
    instrument?: string;
    colorIndex?: number;
    midiClips?: MidiClipDiff[];
    audioClips?: AudioClipDiff[];
    deviceChanges?: DeviceChange[];
    parameterChanges?: ParameterChange[];
}

interface ProjectDiff {
    tempo: { before?: number; after?: number };
    timeSignature: [number, number];
    totalBeats: number;
    tracks: TrackDiff[];
    summary?: string;
    abletonVersion?: string;
}

// ── Converter ──

function parseNoteJson(raw: unknown): MidiNote | null {
    if (typeof raw !== 'string' || raw.length === 0) return null;
    try {
        const p = JSON.parse(raw);
        if (typeof p?.pitch !== 'number') return null;
        return {
            pitch: p.pitch,
            startBeat: typeof p.start_beat === 'number' ? p.start_beat : 0,
            durationBeats: typeof p.duration_beats === 'number' ? p.duration_beats : 0,
            velocity: typeof p.velocity === 'number' ? p.velocity : 100,
        };
    } catch {
        return null;
    }
}

function mapTrackType(rustType: string): TrackDiff['trackType'] {
    const lower = rustType?.toLowerCase() ?? '';
    if (lower.includes('midi')) return 'midi';
    if (lower.includes('audio')) return 'audio';
    if (lower.includes('return')) return 'return';
    if (lower.includes('group')) return 'group';
    return 'midi'; // default
}

function mapAction(action: string): TrackDiff['changeType'] {
    if (action === 'added') return 'added';
    if (action === 'removed') return 'removed';
    return 'modified'; // covers 'adjusted', 'value_change', etc.
}

/**
 * Convert the Rust semantic-differ report into the web's ProjectDiff format.
 */
export function changesToProjectDiff(report: RustReport, summary?: string): ProjectDiff {
    const trackMap = new Map<string, TrackDiff>();

    // Pre-populate from report.project.tracks so we have metadata
    const projectTracks = report.project?.tracks ?? [];
    for (const t of projectTracks) {
        trackMap.set(t.id, {
            trackId: t.id,
            trackName: t.label || 'Unnamed Track',
            trackType: mapTrackType(t.track_type),
            changeType: 'modified',
        });
    }

    function ensureTrack(id: string, name: string, type: string): TrackDiff {
        let track = trackMap.get(id);
        if (!track) {
            track = {
                trackId: id,
                trackName: name || 'Unnamed Track',
                trackType: mapTrackType(type),
                changeType: 'modified',
            };
            trackMap.set(id, track);
        }
        return track;
    }

    // Track which IDs were actually touched by the change tree
    const touchedTrackIds = new Set<string>();

    function visitChanges(nodes: RustChange[], currentTrack: TrackDiff | null) {
        for (const node of nodes) {
            let nextTrack = currentTrack;

            if (node.type === 'Track') {
                const trackId = node.id || `track:${node.label}`;
                const trackMeta = projectTracks.find(t => t.id === trackId);
                const track = ensureTrack(trackId, node.label, trackMeta?.track_type ?? 'MIDI');
                track.changeType = mapAction(node.action);
                touchedTrackIds.add(trackId);
                nextTrack = track;
            } else if (node.type === 'Note' && nextTrack) {
                // Aggregate notes into a single MidiClipDiff per track
                if (!nextTrack.midiClips || nextTrack.midiClips.length === 0) {
                    nextTrack.midiClips = [{
                        clipName: nextTrack.trackName,
                        startBeat: 0,
                        endBeat: 0,
                        addedNotes: [],
                        removedNotes: [],
                        modifiedNotes: [],
                    }];
                }
                const clip = nextTrack.midiClips[0];

                if (node.action === 'added') {
                    const note = parseNoteJson(node.to);
                    if (note) {
                        clip.addedNotes.push(note);
                        clip.endBeat = Math.max(clip.endBeat, note.startBeat + note.durationBeats);
                    }
                } else if (node.action === 'removed') {
                    const note = parseNoteJson(node.from);
                    if (note) {
                        clip.removedNotes.push(note);
                        clip.endBeat = Math.max(clip.endBeat, note.startBeat + note.durationBeats);
                    }
                } else if (node.action === 'adjusted') {
                    const before = parseNoteJson(node.from);
                    const after = parseNoteJson(node.to);
                    if (before && after) {
                        clip.modifiedNotes.push({ before, after });
                        clip.endBeat = Math.max(clip.endBeat, after.startBeat + after.durationBeats);
                    }
                }
            } else if (node.type === 'Device' && nextTrack) {
                if (!nextTrack.deviceChanges) nextTrack.deviceChanges = [];
                const device: DeviceChange = {
                    deviceName: node.label,
                    changeType: mapAction(node.action),
                };
                // Collect parameter changes from children
                if (node.children?.length) {
                    device.parameterChanges = node.children
                        .filter(c => c.type === 'Parameter' || c.action === 'value_change')
                        .map(c => ({
                            name: c.label,
                            beforeValue: c.from ?? null,
                            afterValue: c.to ?? null,
                            description: c.from && c.to ? `${c.label}: ${c.from} → ${c.to}` : `${c.label} ${c.action}`,
                        }));
                }
                nextTrack.deviceChanges.push(device);
            } else if ((node.type === 'Parameter' || node.action === 'value_change') && nextTrack) {
                if (!nextTrack.parameterChanges) nextTrack.parameterChanges = [];
                nextTrack.parameterChanges.push({
                    name: node.label,
                    beforeValue: node.from ?? null,
                    afterValue: node.to ?? null,
                    description: node.from && node.to ? `${node.label}: ${node.from} → ${node.to}` : `${node.label} ${node.action}`,
                });
            }

            if (Array.isArray(node.children) && node.children.length > 0) {
                visitChanges(node.children, nextTrack);
            }
        }
    }

    visitChanges(report.changes || [], null);

    // Filter to only tracks that appeared in the change tree
    const tracks = Array.from(trackMap.values()).filter(t => touchedTrackIds.has(t.trackId));

    return {
        tempo: {},
        timeSignature: [4, 4],
        totalBeats: 0,
        tracks,
        summary,
    };
}
