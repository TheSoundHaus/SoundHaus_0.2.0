/**
 * useWaveformPeaks — Fetches and caches waveform peak data from the backend.
 *
 * Takes an audio file path + repo info, fetches pre-computed waveform
 * peaks from the backend's audio router, caches them by file path,
 * and returns the peak data for rendering.
 *
 * ENDPOINT (to be created on backend):
 *   GET /repos/{owner}/{repo}/audio/{path}/waveform?resolution=1024
 *   Returns: { peaks: number[], sampleRate: number, duration: number }
 *
 * CACHE STRATEGY:
 *   - In-memory Map keyed by `${owner}/${repo}/${path}@${commitSha}`
 *   - Peaks are immutable for a given commit, so cache is reliable
 *   - Clear cache on component unmount to prevent memory leaks
 *
 * RETURN VALUE:
 *   { peaks, isLoading, error, refetch }
 *
 * IMPLEMENTATION NOTES:
 *   - Uses fetch() with abort controller for cleanup
 *   - Debounces rapid file switches (300ms)
 *   - Returns null peaks while loading
 *   - Normalizes peaks to [-1, 1] range if backend returns raw PCM values
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { WaveformPeaks } from "../types/diff";

// ── Types ──────────────────────────────────────────────────────────────────

interface UseWaveformPeaksArgs {
    /** Repository owner */
    owner: string;
    /** Repository name */
    repo: string;
    /** Path to the audio file within the repository */
    filePath: string;
    /** Commit SHA for cache keying */
    commitSha: string;
    /** Number of peak samples to request (default: 1024) */
    resolution?: number;
    /** Whether to actually fetch (set false to defer loading) */
    enabled?: boolean;
}

interface UseWaveformPeaksResult {
    /** The peak data, or null if not yet loaded */
    peaks: WaveformPeaks | null;
    /** Whether the fetch is in progress */
    isLoading: boolean;
    /** Error message if fetch failed */
    error: string | null;
    /** Manually re-fetch the waveform data */
    refetch: () => void;
}

// ── In-memory cache ────────────────────────────────────────────────────────

const peaksCache = new Map<string, WaveformPeaks>();

/**
 * Builds a cache key for a specific audio file at a specific commit.
 */
function cacheKey(owner: string, repo: string, filePath: string, sha: string): string {
    return `${owner}/${repo}/${filePath}@${sha}`;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetches waveform peak data for an audio file.
 *
 * TODO: Implement these steps:
 *   1. Check in-memory cache first → if hit, return immediately
 *   2. If not cached and `enabled`, start fetch:
 *      - Build URL: `/api/repos/${owner}/${repo}/audio/${encodeURIComponent(filePath)}/waveform?resolution=${resolution}`
 *      - Pass auth headers (session token from auth context)
 *      - Use AbortController for cleanup on unmount or file change
 *   3. On success:
 *      - Parse response as JSON
 *      - Validate peaks array is present
 *      - Normalize peaks if needed (ensure values are in [-1, 1])
 *      - Store in cache and set state
 *   4. On error:
 *      - Set error message
 *      - Log to console for debugging
 *   5. On cleanup:
 *      - Abort in-flight request
 *      - Clear debounce timer
 */
export function useWaveformPeaks({
    owner,
    repo,
    filePath,
    commitSha,
    resolution = 1024,
    enabled = true,
}: UseWaveformPeaksArgs): UseWaveformPeaksResult {
    const [peaks, setPeaks] = useState<WaveformPeaks | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const key = cacheKey(owner, repo, filePath, commitSha);

    const fetchPeaks = useCallback(async () => {
        // Check cache first
        const cached = peaksCache.get(key);
        if (cached) {
            setPeaks(cached);
            setIsLoading(false);
            setError(null);
            return;
        }

        // Abort any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setIsLoading(true);
        setError(null);

        try {
            const url = `/api/repos/${owner}/${repo}/audio/waveform?file_path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(commitSha)}&resolution=${resolution}`;

            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!res.ok) {
                throw new Error(`Failed to fetch waveform: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            // Transform backend response into WaveformPeaks shape.
            // Backend returns { peaks: number[], sampleRate: number, duration: number }
            // Frontend type is { sampleRate, samplesPerPixel, channels, durationSeconds, data: number[][] }
            const rawPeaks: number[] = data.peaks ?? [];
            const sampleRate = data.sampleRate ?? data.sample_rate ?? 44100;
            const duration = data.duration ?? 0;

            // Normalize peaks into [-1, 1] if any exceed that range
            let maxAbs = 0;
            for (const p of rawPeaks) {
                const abs = Math.abs(p);
                if (abs > maxAbs) maxAbs = abs;
            }
            const normalizedPeaks =
                maxAbs > 1 ? rawPeaks.map((p) => p / maxAbs) : rawPeaks;

            const waveformPeaks: WaveformPeaks = {
                sampleRate,
                samplesPerPixel: Math.max(1, Math.floor((sampleRate * duration) / rawPeaks.length)),
                channels: 1,
                durationSeconds: duration,
                data: [normalizedPeaks], // mono
            };

            // Store in cache
            peaksCache.set(key, waveformPeaks);
            setPeaks(waveformPeaks);
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
                return; // Ignore aborted requests
            }
            const message = err instanceof Error ? err.message : "Unknown error";
            setError(message);
            console.error("[useWaveformPeaks]", message);
        } finally {
            setIsLoading(false);
        }
    }, [key, owner, repo, filePath, commitSha, resolution]);

    useEffect(() => {
        // Skip fetch if disabled or if the file path is empty (no real audio file)
        if (!enabled || !filePath) return;

        // Debounce: wait 300ms before fetching (handles rapid file switches)
        const timer = setTimeout(fetchPeaks, 300);

        return () => {
            clearTimeout(timer);
            abortRef.current?.abort();
        };
    }, [fetchPeaks, enabled, filePath]);

    return { peaks, isLoading, error, refetch: fetchPeaks };
}
