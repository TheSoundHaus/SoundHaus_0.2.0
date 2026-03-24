"""
Tests for the commit and diff endpoints (routers/commits.py).

=============================================================================
WHAT'S BEING TESTED
=============================================================================

Four endpoints, each with success and edge-case scenarios:

  GET  /repos/{owner}/{repo}/commits        — paginated commit list
  GET  /repos/{owner}/{repo}/commits/{sha}  — single commit detail
  POST /repos/{owner}/{repo}/diff           — Desktop posts ALS diff
  GET  /repos/{owner}/{repo}/commits/{sha}/diff — retrieve diff for a commit

=============================================================================
TEST NAMING CONVENTION
=============================================================================

  test_<endpoint>_<scenario>

  Examples:
    test_get_commit_list_empty        — no commits exist → empty list
    test_get_commit_list_with_data    — commits exist → returns them
    test_get_commit_list_pagination   — page 2 returns next set
    test_get_commit_detail_full_sha   — full 40-char SHA lookup
    test_get_commit_detail_short_sha  — 8-char prefix lookup
    test_post_diff_success            — valid Desktop POST → creates row
    test_post_diff_web_jwt_rejected   — web JWT → 403

=============================================================================
HOW TO RUN
=============================================================================

    cd apps/backend
    pytest tests/test_commits.py -v

=============================================================================
"""

import pytest


# ══════════════════════════════════════════════════════════════════════════════
# GET /repos/{owner}/{repo}/commits
# ══════════════════════════════════════════════════════════════════════════════


class TestGetCommitList:
    """Tests for the paginated commit list endpoint."""

    def test_empty_repo(self, client, seed_repo):
        """
        A repo with zero commits should return an empty list, not an error.
        The response should still include pagination metadata (total=0).
        """
        response = client.get("/repos/testuser/test-beats/commits")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["total"] == 0
        assert data["commits"] == []
        assert data["page"] == 1

    def test_repo_not_found(self, client):
        """
        Requesting commits for a repo that doesn't exist should 404.
        This prevents exposing whether a repo exists.
        """
        response = client.get("/repos/nonexistent/repo/commits")
        assert response.status_code == 404

    def test_with_single_commit(self, client, seed_commit):
        """
        A repo with one commit should return it with all expected fields.
        """
        response = client.get("/repos/testuser/test-beats/commits")
        assert response.status_code == 200

        data = response.json()
        assert data["total"] == 1
        assert len(data["commits"]) == 1

        commit = data["commits"][0]
        assert commit["sha"] == "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        assert commit["short_sha"] == "a1b2c3d4"
        assert commit["message"] == "added drums and bass"
        assert commit["author_name"] == "Nathan"
        assert commit["files_added"] == ["Samples/kick.wav"]
        assert commit["files_modified"] == ["MyProject.als"]
        assert commit["files_removed"] == []
        assert commit["has_diff"] is False  # No AlsDiff row yet

    def test_has_diff_flag(self, client, seed_diff):
        """
        When an AlsDiff row exists for a commit's SHA, that commit's
        `has_diff` field should be True. This is how the web UI knows
        whether to show the "View Diff" button.
        """
        response = client.get("/repos/testuser/test-beats/commits")
        data = response.json()
        commit = data["commits"][0]
        assert commit["has_diff"] is True

    def test_pagination_defaults(self, client, seed_multiple_commits):
        """
        Default pagination: page=1, limit=20.
        With 5 commits and limit=20, all should be on page 1.
        """
        response = client.get("/repos/testuser/test-beats/commits")
        data = response.json()
        assert data["total"] == 5
        assert len(data["commits"]) == 5
        assert data["page"] == 1
        assert data["limit"] == 20

    def test_pagination_limit(self, client, seed_multiple_commits):
        """
        Setting limit=2 should return only 2 commits per page.
        Total still reports 5 (the full count).
        """
        response = client.get("/repos/testuser/test-beats/commits?limit=2")
        data = response.json()
        assert data["total"] == 5
        assert len(data["commits"]) == 2

    def test_pagination_page_2(self, client, seed_multiple_commits):
        """
        Page 2 with limit=2 should return the next 2 commits.
        The commits should be ordered by timestamp DESC (newest first).
        """
        response = client.get("/repos/testuser/test-beats/commits?page=2&limit=2")
        data = response.json()
        assert len(data["commits"]) == 2
        assert data["page"] == 2
        # Commits are ordered newest-first. With 5 commits (indices 4,3,2,1,0),
        # page 1 limit=2 gives indices 4,3. Page 2 gives indices 2,1.
        assert data["commits"][0]["message"] == "commit number 2"
        assert data["commits"][1]["message"] == "commit number 1"

    def test_pagination_beyond_last_page(self, client, seed_multiple_commits):
        """
        Requesting a page beyond the last should return an empty list.
        This should NOT error — the web UI relies on empty list to know
        it's reached the end.
        """
        response = client.get("/repos/testuser/test-beats/commits?page=100&limit=20")
        data = response.json()
        assert data["total"] == 5
        assert data["commits"] == []

    def test_timestamp_ordering(self, client, seed_multiple_commits):
        """
        Commits should be returned newest-first (DESC by timestamp).
        This matches how Git history displays commits.
        """
        response = client.get("/repos/testuser/test-beats/commits")
        data = response.json()
        commits = data["commits"]
        # Verify timestamps are in descending order
        timestamps = [c["timestamp"] for c in commits]
        assert timestamps == sorted(timestamps, reverse=True)


# ══════════════════════════════════════════════════════════════════════════════
# GET /repos/{owner}/{repo}/commits/{sha}
# ══════════════════════════════════════════════════════════════════════════════


class TestGetCommitDetail:
    """Tests for the single commit detail endpoint."""

    def test_full_sha(self, client, seed_commit):
        """
        Looking up a commit by its full 40-char SHA should work.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["commit"]["sha"] == sha
        assert data["commit"]["message"] == "added drums and bass"

    def test_short_sha(self, client, seed_commit):
        """
        Looking up a commit by its first 8 characters should also work.
        The endpoint uses startswith() to match partial SHAs.
        """
        response = client.get("/repos/testuser/test-beats/commits/a1b2c3d4")
        assert response.status_code == 200

        data = response.json()
        assert data["commit"]["sha"] == "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"

    def test_sha_too_short(self, client, seed_commit):
        """
        SHAs shorter than 7 characters should be rejected with 400.
        Short prefixes have high collision probability.
        """
        response = client.get("/repos/testuser/test-beats/commits/a1b2")
        assert response.status_code == 400
        assert "at least 7 characters" in response.json()["detail"]

    def test_commit_not_found(self, client, seed_repo):
        """Non-existent SHA should return 404."""
        response = client.get(
            "/repos/testuser/test-beats/commits/" + "f" * 40
        )
        assert response.status_code == 404

    def test_has_diff_true(self, client, seed_diff):
        """
        When an AlsDiff row exists for the commit, has_diff should be True.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}")
        data = response.json()
        assert data["commit"]["has_diff"] is True

    def test_has_diff_false(self, client, seed_commit):
        """
        When no AlsDiff row exists, has_diff should be False.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}")
        data = response.json()
        assert data["commit"]["has_diff"] is False

    def test_response_includes_file_changes(self, client, seed_commit):
        """
        Commit detail should include files_added, files_modified, files_removed.
        These are the JSON columns from the CommitDetail model.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}")
        data = response.json()
        commit = data["commit"]
        assert commit["files_added"] == ["Samples/kick.wav"]
        assert commit["files_modified"] == ["MyProject.als"]
        assert commit["files_removed"] == []


# ══════════════════════════════════════════════════════════════════════════════
# POST /repos/{owner}/{repo}/diff
# ══════════════════════════════════════════════════════════════════════════════


class TestPostDiff:
    """Tests for the Desktop ALS diff upload endpoint."""

    def test_success(self, client, seed_repo):
        """
        A valid POST with Desktop PAT auth should create an AlsDiff row
        and return { success: true, diff_id: "uuid" }.
        """
        response = client.post(
            "/repos/testuser/test-beats/diff",
            json={
                "commit_sha": "b" * 40,
                "before_sha": "0" * 40,
                "diff_type": "combined",
                "diff_summary": "1 track added",
                "diff_data": {"xml": {"summary": "1 track added"}, "structural": {"ok": True, "changes": []}},
                "desktop_version": "0.2.0",
            },
        )
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert "diff_id" in data
        assert isinstance(data["diff_id"], str)  # UUID string

    def test_upsert_existing(self, client, seed_diff):
        """
        POSTing a diff for a SHA that already has one should UPDATE the
        existing row (upsert), not create a duplicate. This handles the
        Desktop retrying after a network failure.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.post(
            "/repos/testuser/test-beats/diff",
            json={
                "commit_sha": sha,
                "diff_data": {"xml": {"summary": "updated data"}, "structural": {"ok": True, "changes": []}},
                "diff_type": "combined",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        # Should return the SAME diff_id as the seed (upsert, not new row)

    def test_web_jwt_rejected(self, client_web_auth, seed_repo):
        """
        The POST /diff endpoint requires a Desktop PAT (soundh_* prefix).
        Web users with a JWT token should be rejected with 403.
        """
        response = client_web_auth.post(
            "/repos/testuser/test-beats/diff",
            json={
                "commit_sha": "c" * 40,
                "diff_data": {"xml": {}},
            },
        )
        assert response.status_code == 403
        assert "Desktop PAT required" in response.json()["detail"]

    def test_missing_required_fields(self, client, seed_repo):
        """
        Missing commit_sha or diff_data should return 400.
        """
        # Missing diff_data
        response = client.post(
            "/repos/testuser/test-beats/diff",
            json={"commit_sha": "d" * 40},
        )
        assert response.status_code == 400
        assert "required" in response.json()["detail"].lower()

        # Missing commit_sha
        response = client.post(
            "/repos/testuser/test-beats/diff",
            json={"diff_data": {"xml": {}}},
        )
        assert response.status_code == 400

    def test_repo_not_found(self, client):
        """
        POSTing a diff to a non-existent repo should 404.
        """
        response = client.post(
            "/repos/ghost/nope/diff",
            json={"commit_sha": "e" * 40, "diff_data": {"xml": {}}},
        )
        assert response.status_code == 404

    def test_invalid_json_body(self, client, seed_repo):
        """
        Sending malformed JSON should return 400 (not 500).
        """
        response = client.post(
            "/repos/testuser/test-beats/diff",
            content=b"this is not json",
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 400

    def test_optional_fields_default(self, client, seed_repo):
        """
        Only commit_sha and diff_data are required. All other fields
        (before_sha, diff_type, diff_summary, desktop_version) should
        default gracefully.
        """
        response = client.post(
            "/repos/testuser/test-beats/diff",
            json={
                "commit_sha": "f" * 40,
                "diff_data": {"minimal": True},
            },
        )
        assert response.status_code == 200
        assert response.json()["success"] is True


# ══════════════════════════════════════════════════════════════════════════════
# GET /repos/{owner}/{repo}/commits/{sha}/diff
# ══════════════════════════════════════════════════════════════════════════════


class TestGetCommitDiff:
    """Tests for the diff retrieval endpoint."""

    def test_diff_exists(self, client, seed_diff):
        """
        When an AlsDiff row exists for the requested SHA, the full diff
        payload should be returned including diff_data, diff_type, etc.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}/diff")
        assert response.status_code == 200

        data = response.json()
        assert data["success"] is True
        assert data["diff"]["commit_sha"] == sha
        assert data["diff"]["diff_type"] == "combined"
        assert data["diff"]["diff_summary"] == "2 tracks added, 1 renamed"

        # Verify the JSON blob round-trips correctly
        diff_data = data["diff"]["diff_data"]
        assert "xml" in diff_data
        assert "structural" in diff_data
        assert diff_data["xml"]["project"]["Tracks"][0]["name"] == "Drums"

    def test_diff_not_found_graceful(self, client, seed_commit):
        """
        When no diff exists for a commit, the endpoint should return
        { success: false, error: "No ALS diff found..." } instead of 404.
        This lets the web UI gracefully show "No diff available" without
        triggering an error state.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}/diff")
        assert response.status_code == 200  # NOT 404

        data = response.json()
        assert data["success"] is False
        assert "No ALS diff found" in data["error"]

    def test_diff_by_short_sha(self, client, seed_diff):
        """
        Short SHA lookups should work for diffs too.
        """
        response = client.get("/repos/testuser/test-beats/commits/a1b2c3d4/diff")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["diff"]["commit_sha"].startswith("a1b2c3d4")

    def test_diff_sha_too_short(self, client, seed_diff):
        """
        SHAs shorter than 7 chars should be rejected with 400.
        """
        response = client.get("/repos/testuser/test-beats/commits/abc/diff")
        assert response.status_code == 400

    def test_diff_response_shape(self, client, seed_diff):
        """
        Verify the full response shape matches what the web DiffView
        component expects: diff.id, diff.commit_sha, diff.before_sha,
        diff.diff_type, diff.diff_summary, diff.diff_data, diff.created_at.
        """
        sha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
        response = client.get(f"/repos/testuser/test-beats/commits/{sha}/diff")
        diff = response.json()["diff"]

        expected_keys = {"id", "commit_sha", "before_sha", "diff_type",
                         "diff_summary", "diff_data", "created_at"}
        assert set(diff.keys()) == expected_keys


# ══════════════════════════════════════════════════════════════════════════════
# Cross-endpoint integration scenarios
# ══════════════════════════════════════════════════════════════════════════════


class TestCommitDiffIntegration:
    """
    Test the full workflow: post a diff via POST, then retrieve it via GET.
    Verifies the data roundtrips correctly through the database.
    """

    def test_post_then_get(self, client, seed_repo):
        """
        1. POST a new diff
        2. GET the diff by its SHA
        3. Verify the data matches
        """
        payload = {
            "commit_sha": "1" * 40,
            "before_sha": "0" * 40,
            "diff_type": "structural",
            "diff_summary": "Piano → Synth on Track 1",
            "diff_data": {
                "ok": True,
                "changes": [
                    {
                        "trackId": "1",
                        "trackName": "Lead",
                        "beforeTrackName": "Lead",
                        "afterTrackName": "Lead",
                        "before": {"name": "Grand Piano"},
                        "after": {"name": "Wavetable"},
                    }
                ]
            },
        }

        # POST
        post_response = client.post(
            "/repos/testuser/test-beats/diff",
            json=payload,
        )
        assert post_response.status_code == 200
        diff_id = post_response.json()["diff_id"]

        # GET
        get_response = client.get(
            f"/repos/testuser/test-beats/commits/{'1' * 40}/diff"
        )
        assert get_response.status_code == 200
        diff = get_response.json()["diff"]

        assert diff["id"] == diff_id
        assert diff["commit_sha"] == "1" * 40
        assert diff["diff_type"] == "structural"
        assert diff["diff_data"]["changes"][0]["after"]["name"] == "Wavetable"

    def test_has_diff_flag_after_post(self, client, seed_commit):
        """
        After POSTing a diff for a commit, the commit list endpoint should
        show has_diff=True for that commit. Tests the batch AlsDiff SHA
        lookup in get_commit_list.
        """
        sha = seed_commit.sha

        # Before posting diff: has_diff should be False
        list_response = client.get("/repos/testuser/test-beats/commits")
        commit_before = list_response.json()["commits"][0]
        assert commit_before["has_diff"] is False

        # POST diff
        client.post(
            "/repos/testuser/test-beats/diff",
            json={"commit_sha": sha, "diff_data": {"xml": {}}},
        )

        # After posting diff: has_diff should be True
        list_response = client.get("/repos/testuser/test-beats/commits")
        commit_after = list_response.json()["commits"][0]
        assert commit_after["has_diff"] is True
