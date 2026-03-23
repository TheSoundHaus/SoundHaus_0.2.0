/**
 * Diff Engine — TypeScript Interface Contract
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for the diff data format.
 * Share this with the desktop team — they POST data matching these types
 * to `POST /repos/{owner}/{repo}/diff` after each push.
 *
 * Data flow:
 *   1. Desktop Rust parser extracts MIDI notes, clips, and track metadata from .als XML
 *   2. Desktop POSTs a ProjectDiff JSON to the backend
 *   3. Backend stores it in the `als_diffs` table (diff_data column)
 *   4. Web fetches via `GET /repos/{owner}/{repo}/commits/{sha}/diff`
 *   5. DiffTimeline component renders it using PianoRollTrack / WaveformTrack
 */

// ── MIDI Data ──────────────────────────────────────────────────────────────

/** A single MIDI note event within a clip. */
export interface MidiNote {
    /** MIDI pitch (0-127). Middle C = 60. */
    pitch: number;
    /** Start position in beats relative to the clip start. */
    startBeat: number;
    /** Duration in beats. */
    durationBeats: number;
    /** Velocity (0-127). */
    velocity: number;
    /** MIDI channel (0-15). Optional, defaults to 0. */
    channel?: number;
}

/** Diff data for a single MIDI clip, comparing HEAD vs new version. */
export interface MidiClipDiff {
    /** Clip name as shown in Ableton. */
    clipName: string;
    /** Clip start position in beats (relative to arrangement start). */
    startBeat: number;
    /** Clip end position in beats. */
    endBeat: number;
    /** Notes present in the new version but not in HEAD. */
    addedNotes: MidiNote[];
    /** Notes present in HEAD but removed in the new version. */
    removedNotes: MidiNote[];
    /** Notes that exist in both but with changed properties (pitch, velocity, duration). */
    modifiedNotes: Array<{ before: MidiNote; after: MidiNote }>;
    /** Notes unchanged between versions (for context rendering). */
    unchangedNotes?: MidiNote[];
}

// ── Audio Data ─────────────────────────────────────────────────────────────

/** Diff data for a single audio clip. */
export interface AudioClipDiff {
    /** Clip name as shown in Ableton. */
    clipName: string;
    /** Start time in beats (arrangement position). */
    startBeat: number;
    /** End time in beats. */
    endBeat: number;
    /** What happened to this clip. */
    changeType: "added" | "removed" | "modified";
    /** Human-readable description of the change (e.g., "Gain changed +3dB"). */
    description: string;
    /** Path to the audio file in the repo (for waveform fetching). */
    audioFilePath?: string;
}

// ── Parameters / Devices ───────────────────────────────────────────────────

/** A parameter change on a track or device (e.g., volume, pan, effect knob). */
export interface ParameterChange {
    /** Parameter name (e.g., "Volume", "Pan", "Chorus Rate"). */
    name: string;
    /** Value in the HEAD version. Null if parameter was added. */
    beforeValue: number | string | null;
    /** Value in the new version. Null if parameter was removed. */
    afterValue: number | string | null;
    /** Human-readable description (e.g., "Volume: -6dB → -3dB"). */
    description: string;
}

/** A device (plugin/effect) change on a track. */
export interface DeviceChange {
    /** Device name (e.g., "Compressor", "Reverb", "Serum"). */
    deviceName: string;
    /** What happened to this device. */
    changeType: "added" | "removed" | "modified";
    /** Parameter changes within this device (only for "modified"). */
    parameterChanges?: ParameterChange[];
}

// ── Track-Level Diff ───────────────────────────────────────────────────────

/** Complete diff data for a single track. */
export interface TrackDiff {
    /** Unique track ID from the ALS file. */
    trackId: string;
    /** Track name as displayed in Ableton. */
    trackName: string;
    /** Track type from the ALS XML. */
    trackType: "midi" | "audio" | "return" | "group";
    /** Overall change status of this track. */
    changeType: "added" | "removed" | "modified" | "unchanged";
    /** Primary instrument/plugin name on this track. */
    instrument?: string;
    /** Color index from Ableton (0-69). Used for visual identity. */
    colorIndex?: number;

    // ── Type-specific clip diffs ──
    /** MIDI clip diffs (only present for midi tracks with changes). */
    midiClips?: MidiClipDiff[];
    /** Audio clip diffs (only present for audio tracks with changes). */
    audioClips?: AudioClipDiff[];

    // ── Device/parameter changes ──
    /** Device chain changes (plugins added/removed/modified). */
    deviceChanges?: DeviceChange[];
    /** Track-level parameter changes (volume, pan, sends). */
    parameterChanges?: ParameterChange[];

    // ── Routing changes ──
    /** Previous routing input. */
    routingBefore?: string;
    /** New routing input. */
    routingAfter?: string;
}

// ── Project-Level Diff ─────────────────────────────────────────────────────

/** Top-level diff for an entire ALS project — this is what gets POSTed and stored. */
export interface ProjectDiff {
    /** Tempo change. If no change, before === after. */
    tempo: { before?: number; after?: number };
    /** Time signature as [numerator, denominator]. E.g., [4, 4] for 4/4 time. */
    timeSignature: [number, number];
    /** Total arrangement length in beats. Used to size the timeline ruler. */
    totalBeats: number;
    /** All tracks in the project with their diff data. */
    tracks: TrackDiff[];
    /** Human-readable summary of all changes (auto-generated by desktop). */
    summary?: string;
    /** Ableton project version string. */
    abletonVersion?: string;
}

// ── Waveform Peak Data (returned by backend, not POSTed by desktop) ────────

/** Waveform peak data for rendering audio waveforms in the diff view. */
export interface WaveformPeaks {
    /** Sample rate of the source audio. */
    sampleRate: number;
    /** How many source samples each peak value represents. */
    samplesPerPixel: number;
    /** Number of audio channels (1 = mono, 2 = stereo). */
    channels: number;
    /** Duration of the audio in seconds. */
    durationSeconds: number;
    /**
     * Peak data arrays — one sub-array per channel.
     * Each value is a normalized float (-1.0 to 1.0).
     * For stereo, data[0] = left channel, data[1] = right channel.
     */
    data: number[][];
}

// ── API Response Types ─────────────────────────────────────────────────────

/** The shape of diff data as stored in the backend and returned by the API. */
export interface EnrichedAlsDiff {
    id: string;
    commit_sha: string;
    before_sha: string | null;
    diff_type: "enriched";
    diff_summary: string | null;
    diff_data: ProjectDiff;
    created_at: string;
    desktop_version?: string;
}

// ── Display Helpers ────────────────────────────────────────────────────────

/** Maps a MIDI pitch number (0-127) to a note name (e.g., 60 → "C4"). */
export function midiPitchToName(pitch: number): string {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(pitch / 12) - 1;
    const noteName = noteNames[pitch % 12];
    return `${noteName}${octave}`;
}

/** Converts beats to a time string using tempo (e.g., "1:32.5"). */
export function beatsToTimeString(beats: number, tempo: number): string {
    const seconds = (beats / tempo) * 60;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${minutes}:${remainingSeconds.padStart(4, "0")}`;
}

/** Returns the bar and beat position (e.g., "Bar 3, Beat 2"). */
export function beatsToBarPosition(
    beats: number,
    timeSignature: [number, number] = [4, 4],
): string {
    const beatsPerBar = timeSignature[0];
    const bar = Math.floor(beats / beatsPerBar) + 1;
    const beat = Math.floor(beats % beatsPerBar) + 1;
    return `Bar ${bar}, Beat ${beat}`;
}
