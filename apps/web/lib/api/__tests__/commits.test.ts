/**
 * Tests for the commits API functions (lib/api/commits.ts).
 *
 * These tests mock authFetch to validate:
 *   - Correct endpoint URL construction
 *   - Proper response unwrapping
 *   - Error propagation
 *   - Default parameter values
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the client module before importing the functions under test
vi.mock("@/lib/api/client", () => ({
    authFetch: vi.fn(),
}));

import { getCommits, getCommitDetail, getCommitDiff } from "@/lib/api/commits";
import { authFetch } from "@/lib/api/client";
import type { CommitSummary, CommitListResponse, AlsDiffData } from "@/lib/api/commits";

const mockAuthFetch = vi.mocked(authFetch);

// ── Fixtures ───────────────────────────────────────────────────────────────

const OWNER = "user-uuid-123";
const REPO = "my-beats";
const SHA = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

const MOCK_COMMIT: CommitSummary = {
    id: "uuid-1",
    sha: SHA,
    short_sha: "a1b2c3d4",
    message: "initial commit",
    author_name: "testuser",
    author_email: null,
    timestamp: "2025-07-01T12:00:00Z",
    files_added: [],
    files_modified: [],
    files_removed: [],
    has_diff: false,
};

const MOCK_LIST_RESPONSE: CommitListResponse = {
    repo: REPO,
    page: 1,
    limit: 20,
    total: 1,
    commits: [MOCK_COMMIT],
};

const MOCK_DIFF: AlsDiffData = {
    id: "diff-uuid-1",
    commit_sha: SHA,
    before_sha: null,
    diff_type: "structural",
    diff_summary: "1 change",
    diff_data: { ok: true, changes: [] },
    created_at: "2025-07-01T12:00:00Z",
};

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockAuthFetch.mockReset();
});

describe("getCommits", () => {
    it("calls authFetch with correct endpoint and default pagination", async () => {
        mockAuthFetch.mockResolvedValue({
            success: true,
            data: MOCK_LIST_RESPONSE,
        });

        const result = await getCommits(OWNER, REPO);

        expect(mockAuthFetch).toHaveBeenCalledWith(
            `/repos/${OWNER}/${REPO}/commits?page=1&limit=20`
        );
        expect(result).toEqual({
            success: true,
            data: MOCK_LIST_RESPONSE,
        });
    });

    it("passes custom page and limit to the endpoint", async () => {
        mockAuthFetch.mockResolvedValue({
            success: true,
            data: { ...MOCK_LIST_RESPONSE, page: 3, limit: 10 },
        });

        await getCommits(OWNER, REPO, 3, 10);

        expect(mockAuthFetch).toHaveBeenCalledWith(
            `/repos/${OWNER}/${REPO}/commits?page=3&limit=10`
        );
    });

    it("propagates errors from authFetch", async () => {
        mockAuthFetch.mockResolvedValue({
            success: false,
            error: "HTTP 500",
        });

        const result = await getCommits(OWNER, REPO);

        expect(result).toEqual({ success: false, error: "HTTP 500" });
    });
});

describe("getCommitDetail", () => {
    it("calls authFetch with correct endpoint", async () => {
        mockAuthFetch.mockResolvedValue({
            success: true,
            data: { commit: MOCK_COMMIT },
        });

        const result = await getCommitDetail(OWNER, REPO, SHA);

        expect(mockAuthFetch).toHaveBeenCalledWith(
            `/repos/${OWNER}/${REPO}/commits/${SHA}`
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.commit.sha).toBe(SHA);
        }
    });

    it("propagates errors from authFetch", async () => {
        mockAuthFetch.mockResolvedValue({
            success: false,
            error: "Not found",
        });

        const result = await getCommitDetail(OWNER, REPO, SHA);

        expect(result).toEqual({ success: false, error: "Not found" });
    });
});

describe("getCommitDiff", () => {
    it("calls authFetch with correct endpoint", async () => {
        mockAuthFetch.mockResolvedValue({
            success: true,
            data: { diff: MOCK_DIFF },
        });

        const result = await getCommitDiff(OWNER, REPO, SHA);

        expect(mockAuthFetch).toHaveBeenCalledWith(
            `/repos/${OWNER}/${REPO}/commits/${SHA}/diff`
        );
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.diff).toEqual(MOCK_DIFF);
        }
    });

    it("handles null diff gracefully", async () => {
        mockAuthFetch.mockResolvedValue({
            success: true,
            data: { diff: null },
        });

        const result = await getCommitDiff(OWNER, REPO, SHA);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.diff).toBeNull();
        }
    });

    it("propagates errors from authFetch", async () => {
        mockAuthFetch.mockResolvedValue({
            success: false,
            error: "Network error",
        });

        const result = await getCommitDiff(OWNER, REPO, SHA);

        expect(result).toEqual({ success: false, error: "Network error" });
    });
});
