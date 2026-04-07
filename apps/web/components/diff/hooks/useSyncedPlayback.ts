/**
 * useSyncedPlayback — Synchronized audio playback across multiple tracks.
 *
 * Manages a shared playback cursor that keeps all tracks in sync.
 * When the user presses Play, all audio tracks start at the same beat
 * position, and the cursor advances in real-time.
 *
 * FEATURES:
 *   - Play / Pause / Stop controls
 *   - Seek to a specific beat (click on timeline)
 *   - Current beat position (for cursor rendering in all tracks)
 *   - Loop region support (optional)
 *   - Playback speed control (0.5x, 1x, 2x)
 *
 * AUDIO ARCHITECTURE:
 *   - Uses Web Audio API (AudioContext) for precise timing
 *   - Each track that has audio loads its own AudioBufferSourceNode
 *   - All sources share the same AudioContext so they stay in sync
 *   - MIDI tracks don't have audio — they just follow the cursor
 *
 * IMPLEMENTATION NOTES:
 *   - This is a STRETCH GOAL — basic diff view doesn't need playback
 *   - Start with cursor-only (no audio), add audio playback later
 *   - requestAnimationFrame updates currentBeat based on AudioContext.currentTime
 *   - Tempo is needed to convert seconds ↔ beats
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type PlaybackState = "stopped" | "playing" | "paused";

interface UseSyncedPlaybackArgs {
    /** Tempo in BPM — needed to convert between beats and seconds */
    tempo: number;
    /** Total beats in the project (to know when to stop/loop) */
    totalBeats: number;
    /** Optional: loop start beat (null = no loop) */
    loopStart?: number | null;
    /** Optional: loop end beat (null = no loop) */
    loopEnd?: number | null;
}

interface UseSyncedPlaybackResult {
    /** Current playback state */
    state: PlaybackState;
    /** Current beat position (updates every animation frame during playback) */
    currentBeat: number;
    /** Playback speed multiplier */
    playbackSpeed: number;
    /** Start or resume playback */
    play: () => void;
    /** Pause playback (retains position) */
    pause: () => void;
    /** Stop playback (resets to 0) */
    stop: () => void;
    /** Seek to a specific beat */
    seekTo: (beat: number) => void;
    /** Set playback speed */
    setPlaybackSpeed: (speed: number) => void;
    /**
     * Register an audio source for a track.
     * Returns a cleanup function.
     *
     * TODO: Implement:
     *   - Accept an AudioBuffer (decoded audio data)
     *   - Create an AudioBufferSourceNode connected to the shared AudioContext
     *   - Start/stop it in sync with the global play/pause/stop
     */
    registerAudioSource: (trackId: string, buffer: AudioBuffer) => () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Manages synchronized playback state.
 *
 * TODO: Implement these steps:
 *
 *   PHASE 1 — Cursor only (no audio):
 *     1. Track playbackState, currentBeat, playbackSpeed in state
 *     2. On play():
 *        - Record startTime = performance.now()
 *        - Record startBeat = currentBeat
 *        - Set state to "playing"
 *        - Start animation loop
 *     3. Animation loop (requestAnimationFrame):
 *        - elapsed = performance.now() - startTime
 *        - beatsElapsed = (elapsed / 1000) * (tempo / 60) * playbackSpeed
 *        - currentBeat = startBeat + beatsElapsed
 *        - If currentBeat > totalBeats: stop (or loop)
 *        - If loopEnd is set and currentBeat >= loopEnd: seek to loopStart
 *     4. On pause(): cancel animation, save currentBeat
 *     5. On stop(): cancel animation, reset currentBeat to 0
 *     6. On seekTo(beat): set currentBeat, if playing update startTime
 *
 *   PHASE 2 — Audio playback (stretch):
 *     7. Create shared AudioContext lazily (on first play)
 *     8. registerAudioSource:
 *        - Create AudioBufferSourceNode from the provided AudioBuffer
 *        - Connect to ctx.destination
 *        - Track in a Map<trackId, AudioBufferSourceNode>
 *     9. On play(): start all registered sources at AudioContext time
 *     10. On pause(): suspend AudioContext
 *     11. On stop(): close AudioContext, create new one on next play
 */
export function useSyncedPlayback({
    tempo,
    totalBeats,
    loopStart = null,
    loopEnd = null,
}: UseSyncedPlaybackArgs): UseSyncedPlaybackResult {
    const [state, setState] = useState<PlaybackState>("stopped");
    const [currentBeat, setCurrentBeat] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);

    const startTimeRef = useRef(0);
    const startBeatRef = useRef(0);
    const animFrameRef = useRef(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());

    /**
     * Converts seconds to beats at the current tempo.
     */
    const secondsToBeats = useCallback(
        (seconds: number) => (seconds * tempo) / 60,
        [tempo]
    );

    /**
     * Animation loop — updates currentBeat based on elapsed time.
     * TODO: Implement per description above.
     */
    const tick = useCallback(() => {
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        const beatsElapsed = secondsToBeats(elapsed) * playbackSpeed;
        let beat = startBeatRef.current + beatsElapsed;

        // Loop handling
        if (loopEnd !== null && loopStart !== null && beat >= loopEnd) {
            beat = loopStart + ((beat - loopStart) % (loopEnd - loopStart));
        }

        // End handling
        if (beat >= totalBeats) {
            setCurrentBeat(0);
            setState("stopped");
            return;
        }

        setCurrentBeat(beat);
        animFrameRef.current = requestAnimationFrame(tick);
    }, [secondsToBeats, playbackSpeed, totalBeats, loopStart, loopEnd]);

    const play = useCallback(() => {
        startTimeRef.current = performance.now();
        startBeatRef.current = currentBeat;
        setState("playing");
        animFrameRef.current = requestAnimationFrame(tick);

        // Resume AudioContext if it was suspended (paused)
        if (audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
        }

        // Start all registered source nodes at the correct offset
        if (audioCtxRef.current) {
            const beatsPerSecond = tempo / 60;
            const offsetSeconds = currentBeat / beatsPerSecond;
            for (const [trackId, source] of sourcesRef.current.entries()) {
                try {
                    source.start(0, offsetSeconds);
                } catch {
                    // Source already started — recreate it
                    const newSource = audioCtxRef.current.createBufferSource();
                    newSource.buffer = source.buffer;
                    newSource.connect(audioCtxRef.current.destination);
                    newSource.start(0, offsetSeconds);
                    sourcesRef.current.set(trackId, newSource);
                }
            }
        }
    }, [currentBeat, tick, tempo]);

    const pause = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current);
        setState("paused");
        // Suspend AudioContext so audio pauses in sync
        if (audioCtxRef.current?.state === "running") {
            audioCtxRef.current.suspend();
        }
    }, []);

    const stop = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current);
        setCurrentBeat(0);
        setState("stopped");
        // Stop all active sources and close the context
        for (const source of sourcesRef.current.values()) {
            try { source.stop(); } catch { /* already stopped */ }
        }
        sourcesRef.current.clear();
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
    }, []);

    const seekTo = useCallback(
        (beat: number) => {
            const clampedBeat = Math.max(0, Math.min(beat, totalBeats));
            setCurrentBeat(clampedBeat);
            if (state === "playing") {
                startTimeRef.current = performance.now();
                startBeatRef.current = clampedBeat;
            }
        },
        [totalBeats, state]
    );

    /**
     * Register an audio buffer for a track.
     * Returns a cleanup function that removes the source.
     *
     * Creates a shared AudioContext lazily on first registration, then
     * creates an AudioBufferSourceNode connected to the destination.
     * Sources are tracked in a map so play/pause/stop can control them.
     */
    const registerAudioSource = useCallback(
        (trackId: string, buffer: AudioBuffer): (() => void) => {
            // Lazily create shared AudioContext
            if (!audioCtxRef.current) {
                audioCtxRef.current = new AudioContext();
            }
            const ctx = audioCtxRef.current;

            // Create source node from the provided buffer
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);

            // Store for later control (play/stop)
            sourcesRef.current.set(trackId, source);

            // If we're already playing, start this source immediately at the right offset
            if (state === "playing") {
                const beatsPerSecond = tempo / 60;
                const offsetSeconds = currentBeat / beatsPerSecond;
                source.start(0, offsetSeconds);
            }

            return () => {
                try { source.stop(); } catch { /* already stopped */ }
                source.disconnect();
                sourcesRef.current.delete(trackId);
            };
        },
        [state, tempo, currentBeat],
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(animFrameRef.current);
            audioCtxRef.current?.close();
        };
    }, []);

    return {
        state,
        currentBeat,
        playbackSpeed,
        play,
        pause,
        stop,
        seekTo,
        setPlaybackSpeed,
        registerAudioSource,
    };
}
