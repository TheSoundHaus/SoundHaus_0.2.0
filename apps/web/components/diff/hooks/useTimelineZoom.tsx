/**
 * useTimelineZoom — Shared zoom/pan state for the diff timeline.
 *
 * Provides a React context + hook for managing:
 *   - pixelsPerBeat (zoom level)
 *   - horizontal scroll offset
 *   - zoom in/out/reset actions
 *   - Pinch-to-zoom gesture handling
 *   - Pan with mouse drag or scroll
 *
 * USAGE:
 *   Wrap <DiffTimeline> in <TimelineZoomProvider>, then any child
 *   component can call useTimelineZoom() to read/modify zoom state.
 *
 * WHY A CONTEXT:
 *   Multiple components (TimeRuler, PianoRollTrack, WaveformTrack,
 *   ChangeOverlay) all need the same pixelsPerBeat value, and zoom
 *   changes must update all of them simultaneously.
 *
 * IMPLEMENTATION NOTES:
 *   - Default pixelsPerBeat: 20 (matches PianoRollTrack constant)
 *   - Min zoom: 4 px/beat, Max zoom: 100 px/beat
 *   - Zoom centers on the cursor position (not viewport edge)
 *   - Cmd/Ctrl + scroll = zoom, plain scroll = horizontal pan
 */

"use client";

import {
    createContext,
    useContext,
    useState,
    useCallback,
    type ReactNode,
} from "react";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PIXELS_PER_BEAT = 20;
const MIN_PIXELS_PER_BEAT = 4;
const MAX_PIXELS_PER_BEAT = 100;
const ZOOM_STEP_FACTOR = 1.15; // 15% per scroll tick

// ── Types ──────────────────────────────────────────────────────────────────

interface TimelineZoomState {
    /** Pixels per beat — the core zoom metric */
    pixelsPerBeat: number;
    /** Horizontal scroll offset in pixels */
    scrollOffset: number;
    /** Zoom in by one step */
    zoomIn: () => void;
    /** Zoom out by one step */
    zoomOut: () => void;
    /** Reset to default zoom level */
    zoomReset: () => void;
    /** Set zoom to an exact value (clamped to min/max) */
    setZoom: (pxPerBeat: number) => void;
    /** Set horizontal scroll offset */
    setScrollOffset: (offset: number) => void;
    /**
     * Handle wheel events for zoom/pan.
     * Call this from the timeline container's onWheel handler.
     *
     * TODO: Implement these behaviors:
     *   - If event.metaKey or event.ctrlKey (Cmd/Ctrl held):
     *     → Zoom in/out based on event.deltaY
     *     → Adjust scrollOffset so zoom centers on cursor
     *   - Otherwise:
     *     → Update scrollOffset by event.deltaX (horizontal pan)
     */
    handleWheel: (event: React.WheelEvent) => void;
}

// ── Context ────────────────────────────────────────────────────────────────

const TimelineZoomContext = createContext<TimelineZoomState | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

interface TimelineZoomProviderProps {
    children: ReactNode;
    /** Optional initial zoom level */
    initialPixelsPerBeat?: number;
}

/**
 * Wraps children with zoom/pan state.
 *
 * TODO: Implement the zoom and pan logic described above.
 */
export function TimelineZoomProvider({
    children,
    initialPixelsPerBeat = DEFAULT_PIXELS_PER_BEAT,
}: TimelineZoomProviderProps) {
    const [pixelsPerBeat, setPixelsPerBeat] = useState(initialPixelsPerBeat);
    const [scrollOffset, setScrollOffset] = useState(0);

    /**
     * Clamps a zoom value to [MIN, MAX] range.
     */
    const clampZoom = (val: number): number =>
        Math.min(MAX_PIXELS_PER_BEAT, Math.max(MIN_PIXELS_PER_BEAT, val));

    const zoomIn = useCallback(() => {
        setPixelsPerBeat((prev) => clampZoom(prev * ZOOM_STEP_FACTOR));
    }, []);

    const zoomOut = useCallback(() => {
        setPixelsPerBeat((prev) => clampZoom(prev / ZOOM_STEP_FACTOR));
    }, []);

    const zoomReset = useCallback(() => {
        setPixelsPerBeat(DEFAULT_PIXELS_PER_BEAT);
        setScrollOffset(0);
    }, []);

    const setZoom = useCallback((pxPerBeat: number) => {
        setPixelsPerBeat(clampZoom(pxPerBeat));
    }, []);

    /**
     * Handles mouse wheel events for zoom (Cmd+scroll) or pan (plain scroll).
     * Cursor-centered zoom: the beat under the cursor stays in place.
     */
    const handleWheel = useCallback((event: React.WheelEvent) => {
        if (event.metaKey || event.ctrlKey) {
            // Zoom mode — cursor-centered
            event.preventDefault();
            const factor = event.deltaY > 0 ? 1 / ZOOM_STEP_FACTOR : ZOOM_STEP_FACTOR;

            // Get cursor X relative to the scrollable container
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const cursorX = event.clientX - rect.left;

            setPixelsPerBeat((prev) => {
                const newPPB = clampZoom(prev * factor);
                // Calculate which beat is under the cursor at the old zoom
                const beatAtCursor = (scrollOffset + cursorX) / prev;
                // Shift scroll so that same beat stays under the cursor
                const newOffset = Math.max(0, beatAtCursor * newPPB - cursorX);
                setScrollOffset(newOffset);
                return newPPB;
            });
        } else {
            // Pan mode — horizontal scroll via deltaX, vertical via deltaY
            setScrollOffset((prev) => Math.max(0, prev + (event.deltaX || event.deltaY)));
        }
    }, [scrollOffset]);

    const value: TimelineZoomState = {
        pixelsPerBeat,
        scrollOffset,
        zoomIn,
        zoomOut,
        zoomReset,
        setZoom,
        setScrollOffset,
        handleWheel,
    };

    return (
        <TimelineZoomContext.Provider value={value}>
            {children}
        </TimelineZoomContext.Provider>
    );
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Access the shared timeline zoom state.
 * Must be used inside a <TimelineZoomProvider>.
 */
export function useTimelineZoom(): TimelineZoomState {
    const ctx = useContext(TimelineZoomContext);
    if (!ctx) {
        throw new Error("useTimelineZoom must be used inside <TimelineZoomProvider>");
    }
    return ctx;
}
