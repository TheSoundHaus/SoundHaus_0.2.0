/**
 * DiffView component tests
 *
 * Tests the DiffView component's rendering across all states:
 *   - Loading → spinner
 *   - Error → error message
 *   - Null diffData → "no diff" placeholder
 *   - Empty tracks → "no track changes" message
 *   - Valid data → track labels, clip blocks, legend, commit header
 *   - Combined diff_type → cross-references XML + structural
 *   - Structural-only tracks → appended with "modified" badge
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DiffView from "@/components/DiffView";
import type { AlsDiffData, CommitSummary } from "@/lib/api/commits";

// ── Test fixtures ──────────────────────────────────────────────────────────

const MOCK_COMMIT: CommitSummary = {
    id: "uuid-123",
    sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    short_sha: "a1b2c3d4",
    message: "Added bass track and tweaked drums\nSecond line of message",
    author_name: "testuser",
    author_email: "test@example.com",
    timestamp: "2025-07-01T12:00:00Z",
    files_added: ["bass.wav"],
    files_modified: ["drums.wav"],
    files_removed: [],
    has_diff: true,
};

/** Combined diff with XML tracks + structural changes. */
const MOCK_COMBINED_DIFF: AlsDiffData = {
    id: "diff-uuid-1",
    commit_sha: MOCK_COMMIT.sha,
    before_sha: "0000000000000000000000000000000000000000",
    diff_type: "combined",
    diff_summary: "2 tracks modified, 1 track added",
    diff_data: {
        xml: {
            summary: "XML summary text",
            project: {
                Tracks: [
                    {
                        Id: 1,
                        EffectiveName: "Bass",
                        Type: "MidiTrack",
                    },
                    {
                        Id: 2,
                        EffectiveName: "Drums",
                        Type: "AudioTrack",
                    },
                    {
                        Id: 3,
                        EffectiveName: "Lead",
                        Type: "MidiTrack",
                    },
                ],
            },
        },
        structural: {
            ok: true,
            changes: [
                {
                    trackName: "Bass",
                    trackId: 1,
                    beforeTrackName: "Bass",
                    afterTrackName: "Bass",
                    before: { name: null },
                    after: { name: "Serum" },
                },
                {
                    trackName: "Drums",
                    trackId: 2,
                    beforeTrackName: "Drums",
                    afterTrackName: "Drums",
                    before: { name: "Drum Rack" },
                    after: { name: "Drum Rack v2" },
                },
            ],
        },
    },
    created_at: "2025-07-01T12:00:00Z",
};

/** Structural-only diff — track not in XML list should appear as extra row. */
const MOCK_STRUCTURAL_DIFF: AlsDiffData = {
    id: "diff-uuid-2",
    commit_sha: MOCK_COMMIT.sha,
    before_sha: null,
    diff_type: "structural",
    diff_summary: null,
    diff_data: {
        ok: true,
        changes: [
            {
                trackName: "Synth Lead",
                trackId: 10,
                beforeTrackName: "Synth Lead",
                afterTrackName: "Synth Lead",
                before: { name: "Analog" },
                after: { name: "Wavetable" },
            },
        ],
    },
    created_at: "2025-07-01T12:00:00Z",
};

/** XML-only diff — no structural changes. */
const MOCK_XML_DIFF: AlsDiffData = {
    id: "diff-uuid-3",
    commit_sha: MOCK_COMMIT.sha,
    before_sha: null,
    diff_type: "xml",
    diff_summary: "XML analysis complete",
    diff_data: {
        summary: "3 tracks found",
        project: {
            Tracks: [
                { Id: 1, EffectiveName: "Piano", Type: "MidiTrack" },
                { Id: 2, EffectiveName: "Vocals", Type: "AudioTrack" },
            ],
        },
    },
    created_at: "2025-07-01T12:00:00Z",
};

/** Diff whose project has no tracks → should show "no track changes". */
const MOCK_EMPTY_TRACKS_DIFF: AlsDiffData = {
    id: "diff-uuid-4",
    commit_sha: MOCK_COMMIT.sha,
    before_sha: null,
    diff_type: "xml",
    diff_summary: null,
    diff_data: {
        summary: "No changes",
        project: { Tracks: [] },
    },
    created_at: "2025-07-01T12:00:00Z",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("DiffView", () => {
    // ── State rendering ────────────────────────────────────────────────

    describe("Loading state", () => {
        it("shows a spinner and loading text", () => {
            render(<DiffView diffData={null} isLoading={true} />);
            expect(screen.getByText("Analyzing changes…")).toBeInTheDocument();
        });

        it("does not render tracks when loading", () => {
            render(
                <DiffView
                    diffData={MOCK_COMBINED_DIFF}
                    isLoading={true}
                />
            );
            // Loading takes priority — should show spinner, not tracks
            expect(screen.getByText("Analyzing changes…")).toBeInTheDocument();
            expect(screen.queryByText("Bass")).not.toBeInTheDocument();
        });
    });

    describe("Error state", () => {
        it("renders the error message", () => {
            render(
                <DiffView diffData={null} error="Something went wrong" />
            );
            expect(
                screen.getByText("Something went wrong")
            ).toBeInTheDocument();
        });

        it("takes priority over diffData", () => {
            render(
                <DiffView
                    diffData={MOCK_COMBINED_DIFF}
                    error="API Error"
                />
            );
            expect(screen.getByText("API Error")).toBeInTheDocument();
            expect(screen.queryByText("Bass")).not.toBeInTheDocument();
        });
    });

    describe("No diff data", () => {
        it("shows 'no diff' placeholder when diffData is null", () => {
            render(<DiffView diffData={null} />);
            expect(
                screen.getByText(
                    "No ALS diff data available for this commit."
                )
            ).toBeInTheDocument();
        });
    });

    describe("Empty tracks", () => {
        it("shows 'no track changes' when tracks array is empty", () => {
            render(<DiffView diffData={MOCK_EMPTY_TRACKS_DIFF} />);
            expect(
                screen.getByText("No track changes detected in this diff.")
            ).toBeInTheDocument();
        });
    });

    // ── Commit header ──────────────────────────────────────────────────

    describe("CommitHeader", () => {
        it("renders short SHA", () => {
            render(
                <DiffView diffData={MOCK_COMBINED_DIFF} commit={MOCK_COMMIT} />
            );
            expect(screen.getByText("a1b2c3d4")).toBeInTheDocument();
        });

        it("renders the first line of the commit message", () => {
            render(
                <DiffView diffData={MOCK_COMBINED_DIFF} commit={MOCK_COMMIT} />
            );
            expect(
                screen.getByText("Added bass track and tweaked drums")
            ).toBeInTheDocument();
        });

        it("renders author name", () => {
            render(
                <DiffView diffData={MOCK_COMBINED_DIFF} commit={MOCK_COMMIT} />
            );
            expect(
                screen.getByText(/testuser/)
            ).toBeInTheDocument();
        });

        it("does not render header when commit is null", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} commit={null} />);
            expect(screen.queryByText("a1b2c3d4")).not.toBeInTheDocument();
        });
    });

    // ── Combined diff rendering ────────────────────────────────────────

    describe("Combined diff_type", () => {
        it("renders all tracks from XML data", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} />);
            // Track names appear in both TrackLabel and ClipBlock, so use getAllByText
            expect(screen.getAllByText("Bass").length).toBeGreaterThanOrEqual(1);
            expect(screen.getAllByText("Drums").length).toBeGreaterThanOrEqual(1);
            expect(screen.getByText("Lead")).toBeInTheDocument();
        });

        it("shows type badges for MIDI and Audio tracks", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} />);
            // Bass = MidiTrack → MIDI badge, Drums = AudioTrack → Audio badge
            const midiBadges = screen.getAllByText("MIDI");
            const audioBadges = screen.getAllByText("Audio");
            expect(midiBadges.length).toBeGreaterThanOrEqual(1);
            expect(audioBadges.length).toBeGreaterThanOrEqual(1);
        });

        it("cross-references structural changes onto XML tracks", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} />);
            // Bass has structural change: instrument added → "Serum" should appear
            expect(screen.getByText("Serum")).toBeInTheDocument();
            // Drums has structural change: instrument changed → "Drum Rack v2"
            expect(screen.getByText("Drum Rack v2")).toBeInTheDocument();
        });

        it("renders the diff summary text", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} />);
            expect(
                screen.getByText("2 tracks modified, 1 track added")
            ).toBeInTheDocument();
        });

        it("renders the legend", () => {
            render(<DiffView diffData={MOCK_COMBINED_DIFF} />);
            expect(screen.getByText("Added")).toBeInTheDocument();
            expect(screen.getByText("Modified")).toBeInTheDocument();
            expect(screen.getByText("Removed")).toBeInTheDocument();
        });
    });

    // ── Structural-only diff rendering ─────────────────────────────────

    describe("Structural diff_type", () => {
        it("renders structural-only tracks", () => {
            render(<DiffView diffData={MOCK_STRUCTURAL_DIFF} />);
            // Track name appears in both TrackLabel and ClipBlock
            expect(screen.getAllByText("Synth Lead").length).toBeGreaterThanOrEqual(1);
        });

        it("shows instrument name from structural change", () => {
            render(<DiffView diffData={MOCK_STRUCTURAL_DIFF} />);
            // Instrument name "Wavetable" (or fallback "Analog") renders in TrackLabel
            expect(screen.getByText("Wavetable")).toBeInTheDocument();
        });
    });

    // ── XML-only diff rendering ────────────────────────────────────────

    describe("XML diff_type", () => {
        it("renders tracks without structural changes as unchanged", () => {
            render(<DiffView diffData={MOCK_XML_DIFF} />);
            expect(screen.getByText("Piano")).toBeInTheDocument();
            expect(screen.getByText("Vocals")).toBeInTheDocument();
        });

        it("renders the summary from diff_summary", () => {
            render(<DiffView diffData={MOCK_XML_DIFF} />);
            expect(
                screen.getByText("XML analysis complete")
            ).toBeInTheDocument();
        });
    });
});
