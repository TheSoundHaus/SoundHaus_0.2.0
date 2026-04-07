"""
Diff Schemas — Pydantic models for the enriched diff engine API.

These schemas mirror the TypeScript types in:
  apps/web/components/diff/types/diff.ts

They are used to:
  1. Validate diff data coming from the desktop app (via API POST)
  2. Serialize enriched diff data for the web frontend (via API GET)
  3. Type the response of the waveform peaks endpoint

Keep these schemas IN SYNC with the TypeScript types.
If you change one, change the other.

NOTE: The SQLAlchemy ORM model (AlsDiff) lives in diff_models.py.
      These are the request/response schemas only.
"""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


# ── Change Type Enum ─────────────────────────────────────────────────────────

class ChangeType(str, Enum):
    """Mirrors TypeScript: "added" | "removed" | "modified" | "unchanged" """
    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"
    UNCHANGED = "unchanged"


# ── Track Type Enum ──────────────────────────────────────────────────────────

class TrackType(str, Enum):
    """Mirrors TypeScript: "midi" | "audio" | "return" | "group" | "master" """
    MIDI = "midi"
    AUDIO = "audio"
    RETURN = "return"
    GROUP = "group"
    MASTER = "master"


# ── MIDI Models ──────────────────────────────────────────────────────────────

class MidiNoteSchema(BaseModel):
    """
    Single MIDI note event.
    Mirrors TypeScript MidiNote in diff.ts.

    Fields:
        pitch          — MIDI note number (0-127, typically 36-96 displayed)
        velocity       — Note velocity (1-127)
        start_beat     — When the note starts, in beats from clip start
        duration_beats — Note length in beats
        channel        — Optional MIDI channel
    """
    pitch: int = Field(..., ge=0, le=127)
    velocity: int = Field(..., ge=0, le=127)
    start_beat: float = Field(..., alias="startBeat")
    duration_beats: float = Field(..., alias="durationBeats")
    channel: Optional[int] = None

    model_config = {"populate_by_name": True}


class ModifiedNotePairSchema(BaseModel):
    """
    A pair of notes showing before/after state for a modified note.
    Mirrors TypeScript MidiClipDiff.modifiedNotes[].
    """
    before: MidiNoteSchema
    after: MidiNoteSchema


class MidiClipDiffSchema(BaseModel):
    """
    A MIDI clip with separately categorized note arrays.
    Mirrors TypeScript MidiClipDiff in diff.ts.

    Fields:
        clip_name       — Display name of the clip
        start_beat      — Where this clip sits on the track timeline
        end_beat        — Where this clip ends on the track timeline
        added_notes     — Notes present in new version but not old
        removed_notes   — Notes present in old version but not new
        modified_notes  — Notes present in both but changed (before/after pairs)
        unchanged_notes — Notes identical in both versions (optional context)
    """
    clip_name: Optional[str] = Field(None, alias="clipName")
    start_beat: float = Field(..., alias="startBeat")
    end_beat: float = Field(..., alias="endBeat")
    added_notes: list[MidiNoteSchema] = Field(default=[], alias="addedNotes")
    removed_notes: list[MidiNoteSchema] = Field(default=[], alias="removedNotes")
    modified_notes: list[ModifiedNotePairSchema] = Field(default=[], alias="modifiedNotes")
    unchanged_notes: Optional[list[MidiNoteSchema]] = Field(None, alias="unchangedNotes")

    model_config = {"populate_by_name": True}


# ── Audio Models ─────────────────────────────────────────────────────────────

class AudioClipDiffSchema(BaseModel):
    """
    An audio clip reference with change annotations.
    Mirrors TypeScript AudioClipDiff in diff.ts.

    Fields:
        change_type     — How this clip changed
        description     — Human-readable description of the change
        audio_file_path — Optional path to the audio file in the repo
    """
    change_type: ChangeType = Field(ChangeType.UNCHANGED, alias="changeType")
    description: Optional[str] = None
    audio_file_path: Optional[str] = Field(None, alias="audioFilePath")

    model_config = {"populate_by_name": True}


# ── Parameter & Device Models ────────────────────────────────────────────────

class ParameterChangeSchema(BaseModel):
    """
    A change to a track or device parameter (e.g., volume, pan).
    Mirrors TypeScript ParameterChange in diff.ts.

    Fields:
        name         — Display name of the parameter
        before_value — Previous value (null if parameter was added)
        after_value  — New value (null if parameter was removed)
        description  — Optional human-readable description
    """
    name: str
    before_value: Optional[str] = Field(None, alias="beforeValue")
    after_value: Optional[str] = Field(None, alias="afterValue")
    description: Optional[str] = None

    model_config = {"populate_by_name": True}


class DeviceChangeSchema(BaseModel):
    """
    A change to a device (plugin, effect, instrument) on a track.
    Mirrors TypeScript DeviceChange in diff.ts.

    Fields:
        device_name  — Display name of the device
        change_type  — How the device changed
        parameters   — List of changed parameters within this device
    """
    device_name: str = Field(..., alias="deviceName")
    change_type: ChangeType = Field(ChangeType.UNCHANGED, alias="changeType")
    parameters: list[ParameterChangeSchema] = []

    model_config = {"populate_by_name": True}


# ── Track Diff ───────────────────────────────────────────────────────────────

class TrackDiffSchema(BaseModel):
    """
    One track's complete diff — the main unit of the diff view.
    Mirrors TypeScript TrackDiff in diff.ts.
    """
    track_id: str = Field(..., alias="trackId")
    track_name: str = Field(..., alias="trackName")
    track_type: TrackType = Field(..., alias="trackType")
    change_type: ChangeType = Field(ChangeType.UNCHANGED, alias="changeType")
    instrument: Optional[str] = None
    midi_clips: Optional[list[MidiClipDiffSchema]] = Field(None, alias="midiClips")
    audio_clips: Optional[list[AudioClipDiffSchema]] = Field(None, alias="audioClips")
    device_changes: Optional[list[DeviceChangeSchema]] = Field(None, alias="deviceChanges")
    parameter_changes: Optional[list[ParameterChangeSchema]] = Field(None, alias="parameterChanges")

    model_config = {"populate_by_name": True}


# ── Tempo Model ──────────────────────────────────────────────────────────────

class TempoSchema(BaseModel):
    """
    Project tempo with optional before/after for diff comparison.
    Mirrors TypeScript ProjectDiff.tempo in diff.ts.
    """
    before: Optional[float] = None
    after: Optional[float] = None


# ── Project Diff ─────────────────────────────────────────────────────────────

class ProjectDiffSchema(BaseModel):
    """
    Top-level diff for an entire Ableton project.
    Mirrors TypeScript ProjectDiff in diff.ts.
    """
    tempo: TempoSchema = TempoSchema()
    time_signature: list[int] = Field([4, 4], alias="timeSignature")
    total_beats: float = Field(0.0, alias="totalBeats")
    tracks: list[TrackDiffSchema] = []

    model_config = {"populate_by_name": True}


# ── Waveform Peaks ───────────────────────────────────────────────────────────

class WaveformPeaksResponse(BaseModel):
    """
    Response schema for the waveform peaks endpoint.

    Fields:
        peaks       — Array of normalized peak values [-1.0, 1.0]
        sample_rate — Sample rate of the source audio (e.g., 44100)
        duration    — Total duration in seconds
    """
    peaks: list[float]
    sample_rate: int = Field(44100, alias="sampleRate")
    duration: float = 0.0

    model_config = {"populate_by_name": True}


# ── Enriched ALS Diff (full response) ───────────────────────────────────────

class EnrichedAlsDiffResponse(BaseModel):
    """
    Full enriched diff response sent to the web frontend.

    Extends ProjectDiff with commit metadata.

    Fields:
        commit_sha  — The commit this diff was generated for
        parent_sha  — The parent commit (for comparison)
        diff        — The actual project diff data
    """
    commit_sha: str = Field(..., alias="commitSha")
    parent_sha: Optional[str] = Field(None, alias="parentSha")
    diff: ProjectDiffSchema

    model_config = {"populate_by_name": True}
