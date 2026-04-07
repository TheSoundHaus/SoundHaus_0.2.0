/**
 * Diff Engine — Barrel Export
 *
 * Import all diff components from this single entry point:
 *   import { DiffTimeline, PianoRollTrack, WaveformTrack } from "@/components/diff";
 */

export { DiffTimeline } from "./DiffTimeline";
export { PianoRollTrack } from "./PianoRollTrack";
export { WaveformTrack } from "./WaveformTrack";
export { ChangeOverlay } from "./ChangeOverlay";
export { TrackLabel } from "./TrackLabel";
export { TimeRuler } from "./TimeRuler";
export { DiffSummaryPanel } from "./DiffSummaryPanel";
export { ABComparisonView } from "./ABComparisonView";

// Hooks
export { TimelineZoomProvider, useTimelineZoom } from "./hooks/useTimelineZoom";
export { useWaveformPeaks } from "./hooks/useWaveformPeaks";
export { usePianoRollRenderer } from "./hooks/usePianoRollRenderer";
export { useSyncedPlayback } from "./hooks/useSyncedPlayback";

// Re-export types for convenience
export type {
    ProjectDiff,
    TrackDiff,
    MidiNote,
    MidiClipDiff,
    AudioClipDiff,
    ParameterChange,
    DeviceChange,
    WaveformPeaks,
    EnrichedAlsDiff,
} from "./types/diff";
