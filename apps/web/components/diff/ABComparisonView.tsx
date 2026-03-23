"use client";

/**
 * ABComparisonView — Side-by-side or inline comparison of HEAD vs new commit.
 *
 * Provides two viewing modes:
 *   1. Side-by-side: Two DiffTimeline instances rendered next to each other
 *   2. Inline (unified): Single timeline with changes overlaid (default mode)
 *
 * Loads diff data for TWO commits and orchestrates synchronized scrolling/zooming.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Columns, Rows, Loader2 } from "lucide-react";
import type { ProjectDiff, TrackDiff } from "./types/diff";
import { DiffTimeline } from "./DiffTimeline";

// ── Types ──────────────────────────────────────────────────────────────────

type ComparisonMode = "side-by-side" | "inline";

interface ABComparisonViewProps {
    /** Repository owner username */
    owner: string;
    /** Repository name */
    repo: string;
    /** "Before" commit SHA */
    baseSha: string;
    /** "After" commit SHA */
    headSha: string;
    /** Active comparison mode */
    mode?: ComparisonMode;
    /** Called when user toggles mode */
    onModeChange?: (mode: ComparisonMode) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ABComparisonView({
    owner,
    repo,
    baseSha,
    headSha,
    mode: controlledMode,
    onModeChange,
}: ABComparisonViewProps) {
    const [internalMode, setInternalMode] = useState<ComparisonMode>("inline");
    const mode = controlledMode ?? internalMode;

    // Refs for synced scrolling in side-by-side mode
    const leftPanelRef = useRef<HTMLDivElement>(null);
    const rightPanelRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false);

    // Diff data state
    const [baseDiff, setBaseDiff] = useState<ProjectDiff | null>(null);
    const [headDiff, setHeadDiff] = useState<ProjectDiff | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Fetch diff data for both commits ───────────────────────────────

    useEffect(() => {
        let cancelled = false;

        async function fetchDiffs() {
            setIsLoading(true);
            setError(null);

            try {
                const [baseRes, headRes] = await Promise.all([
                    fetch(`/api/repos/${owner}/${repo}/diff/${baseSha}`),
                    fetch(`/api/repos/${owner}/${repo}/diff/${headSha}`),
                ]);

                if (!baseRes.ok || !headRes.ok) {
                    throw new Error(
                        `Failed to fetch diffs: base=${baseRes.status}, head=${headRes.status}`,
                    );
                }

                const baseData = await baseRes.json();
                const headData = await headRes.json();

                if (!cancelled) {
                    setBaseDiff(baseData as ProjectDiff);
                    setHeadDiff(headData as ProjectDiff);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to fetch comparison data");
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        fetchDiffs();
        return () => { cancelled = true; };
    }, [owner, repo, baseSha, headSha]);

    // ── Mode toggle ────────────────────────────────────────────────────

    const toggleMode = () => {
        const newMode = mode === "inline" ? "side-by-side" : "inline";
        if (onModeChange) {
            onModeChange(newMode);
        } else {
            setInternalMode(newMode);
        }
    };

    // ── Scroll sync for side-by-side mode ──────────────────────────────

    const syncScroll = useCallback((source: "left" | "right") => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;

        const sourceEl = source === "left" ? leftPanelRef.current : rightPanelRef.current;
        const targetEl = source === "left" ? rightPanelRef.current : leftPanelRef.current;

        if (sourceEl && targetEl) {
            targetEl.scrollTop = sourceEl.scrollTop;
            targetEl.scrollLeft = sourceEl.scrollLeft;
        }

        // Release the sync lock after a frame to prevent infinite loop
        requestAnimationFrame(() => {
            isSyncingRef.current = false;
        });
    }, []);

    // ── Merge two ProjectDiffs into one unified diff ───────────────────

    const mergeDiffs = useCallback(
        (base: ProjectDiff, head: ProjectDiff): ProjectDiff => {
            const baseTrackMap = new Map<string, TrackDiff>();
            for (const t of base.tracks) {
                baseTrackMap.set(t.trackId, t);
            }

            const mergedTracks: TrackDiff[] = [];

            // Process head tracks — mark as added or modified
            for (const headTrack of head.tracks) {
                const baseTrack = baseTrackMap.get(headTrack.trackId);
                if (!baseTrack) {
                    // Track exists in head but not base → added
                    mergedTracks.push({ ...headTrack, changeType: "added" });
                } else {
                    // Track exists in both → keep the head version (already annotated)
                    mergedTracks.push(headTrack);
                    baseTrackMap.delete(headTrack.trackId);
                }
            }

            // Remaining base tracks not in head → removed
            for (const removedTrack of baseTrackMap.values()) {
                mergedTracks.push({ ...removedTrack, changeType: "removed" });
            }

            return {
                tempo: head.tempo,
                timeSignature: head.timeSignature,
                totalBeats: Math.max(base.totalBeats, head.totalBeats),
                tracks: mergedTracks,
            };
        },
        [],
    );

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Toolbar */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 bg-zinc-900/80">
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span className="font-mono text-zinc-500">{baseSha.slice(0, 7)}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="font-mono text-zinc-300">{headSha.slice(0, 7)}</span>
                </div>

                <button
                    onClick={toggleMode}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                >
                    {mode === "inline" ? (
                        <>
                            <Columns size={14} />
                            <span>Side by Side</span>
                        </>
                    ) : (
                        <>
                            <Rows size={14} />
                            <span>Inline</span>
                        </>
                    )}
                </button>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-zinc-500" />
                    <span className="ml-2 text-sm text-zinc-500">Loading comparison…</span>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-red-400 text-sm">{error}</p>
                </div>
            )}

            {/* Main content */}
            {!isLoading && !error && (
                <div className="flex-1 flex overflow-hidden">
                    {mode === "inline" ? (
                        /* ── Inline Mode ── */
                        <div className="flex-1 overflow-auto">
                            <DiffTimeline
                                diffData={
                                    baseDiff && headDiff
                                        ? mergeDiffs(baseDiff, headDiff)
                                        : headDiff
                                }
                                commitSha={headSha}
                                repoOwner={owner}
                                repoName={repo}
                            />
                        </div>
                    ) : (
                        /* ── Side-by-Side Mode ── */
                        <>
                            <div
                                ref={leftPanelRef}
                                className="flex-1 overflow-auto border-r border-zinc-800"
                                onScroll={() => syncScroll("left")}
                            >
                                <div className="sticky top-0 z-10 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800">
                                    Base: {baseSha.slice(0, 7)}
                                </div>
                                <DiffTimeline
                                    diffData={baseDiff}
                                    commitSha={baseSha}
                                    repoOwner={owner}
                                    repoName={repo}
                                />
                            </div>
                            <div
                                ref={rightPanelRef}
                                className="flex-1 overflow-auto"
                                onScroll={() => syncScroll("right")}
                            >
                                <div className="sticky top-0 z-10 bg-zinc-900/90 px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800">
                                    Head: {headSha.slice(0, 7)}
                                </div>
                                <DiffTimeline
                                    diffData={headDiff}
                                    commitSha={headSha}
                                    repoOwner={owner}
                                    repoName={repo}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
