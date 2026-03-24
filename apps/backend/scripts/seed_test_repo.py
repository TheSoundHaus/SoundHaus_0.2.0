"""
Seed a test repository with commits and ALS diff data for DiffView testing.

Run from within the fastapi container:
    docker compose exec fastapi python scripts/seed_test_repo.py

Or locally (with GITEA_URL=http://localhost:3000 and DB access):
    cd apps/backend && python scripts/seed_test_repo.py
"""

import sys, os, json, base64, time, uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import SessionLocal, init_db

init_db()

from models.commit_models import CommitDetail
from models.diff_models import AlsDiff
from models.webhook_models import PushEvent
from models.repo_models import RepoData
import requests

# ── Config ──────────────────────────────────────────────────────────────────

GITEA_URL = os.getenv("GITEA_URL", "http://localhost:3000")
ADMIN_TOKEN = os.getenv("GITEA_ADMIN_TOKEN", "4b8c7bdf5b74b9793a504b070d00db346d889156")
OWNER = "a5107bf7-fc11-404d-87f2-df7b6bf1b336"
REPO = "test-diffview-project"
REPO_FULL = f"{OWNER}/{REPO}"
AUTHOR = {"name": OWNER, "email": "testuser+soundhaus@soundhaus.dev"}
HEADERS = {"Authorization": f"token {ADMIN_TOKEN}", "Content-Type": "application/json"}

# ── Helpers ─────────────────────────────────────────────────────────────────

def b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("utf-8")


def get_file_sha(path: str) -> str | None:
    """Get the blob SHA of an existing file (needed for updates)."""
    r = requests.get(f"{GITEA_URL}/api/v1/repos/{REPO_FULL}/contents/{path}", headers=HEADERS, timeout=10)
    if r.status_code == 200:
        return r.json().get("sha")
    return None


def create_file(path: str, content: str, message: str) -> dict | None:
    """Create a new file in the repo, return the commit info."""
    payload = {
        "content": b64(content),
        "message": message,
        "branch": "main",
        "author": AUTHOR,
        "committer": AUTHOR,
    }
    r = requests.post(f"{GITEA_URL}/api/v1/repos/{REPO_FULL}/contents/{path}",
                       json=payload, headers=HEADERS, timeout=20)
    if r.status_code in (200, 201):
        return r.json().get("commit")
    print(f"  ✗ create_file {path} failed: {r.status_code} {r.text[:200]}")
    return None


def update_file(path: str, content: str, message: str) -> dict | None:
    """Update an existing file, return the commit info."""
    sha = get_file_sha(path)
    if not sha:
        print(f"  ✗ update_file {path}: file not found, creating instead")
        return create_file(path, content, message)

    payload = {
        "content": b64(content),
        "message": message,
        "sha": sha,
        "branch": "main",
        "author": AUTHOR,
        "committer": AUTHOR,
    }
    r = requests.put(f"{GITEA_URL}/api/v1/repos/{REPO_FULL}/contents/{path}",
                      json=payload, headers=HEADERS, timeout=20)
    if r.status_code in (200, 201):
        return r.json().get("commit")
    print(f"  ✗ update_file {path} failed: {r.status_code} {r.text[:200]}")
    return None


# ── Commit definitions ──────────────────────────────────────────────────────
# Each entry creates a Gitea commit + CommitDetail + (optionally) AlsDiff.

COMMITS = [
    {
        "label": "Commit 2: Add initial project file structure",
        "action": "create",
        "path": "MyProject.als",
        "content": "<placeholder-binary-als-file>",
        "message": "Add initial Ableton project file",
        "files_added": ["MyProject.als"],
        "files_modified": [],
        "files_removed": [],
        "diff": {
            "diff_type": "combined",
            "diff_summary": "Initial project setup — 4 tracks created",
            "diff_data": {
                "xml": {
                    "summary": "Initial project setup — 4 tracks created",
                    "project": {
                        "Tracks": [
                            {"Id": "t1", "EffectiveName": "Drums", "Type": "MidiTrack"},
                            {"Id": "t2", "EffectiveName": "Bass", "Type": "MidiTrack"},
                            {"Id": "t3", "EffectiveName": "Lead Synth", "Type": "MidiTrack"},
                            {"Id": "t4", "EffectiveName": "Vocals", "Type": "AudioTrack"},
                        ]
                    },
                },
                "structural": {
                    "ok": True,
                    "changes": [
                        {
                            "trackId": "t1",
                            "trackName": "Drums",
                            "beforeTrackName": "",
                            "afterTrackName": "Drums",
                            "before": {"name": None},
                            "after": {"name": "Drum Rack"},
                        },
                        {
                            "trackId": "t2",
                            "trackName": "Bass",
                            "beforeTrackName": "",
                            "afterTrackName": "Bass",
                            "before": {"name": None},
                            "after": {"name": "Analog"},
                        },
                        {
                            "trackId": "t3",
                            "trackName": "Lead Synth",
                            "beforeTrackName": "",
                            "afterTrackName": "Lead Synth",
                            "before": {"name": None},
                            "after": {"name": "Wavetable"},
                        },
                        {
                            "trackId": "t4",
                            "trackName": "Vocals",
                            "beforeTrackName": "",
                            "afterTrackName": "Vocals",
                            "before": {"name": None},
                            "after": {"name": None},
                        },
                    ],
                },
            },
        },
    },
    {
        "label": "Commit 3: Add audio samples",
        "action": "create",
        "path": "Samples/kick.wav",
        "content": "<placeholder-audio-kick>",
        "message": "Add drum samples and configure kick pattern",
        "files_added": ["Samples/kick.wav", "Samples/snare.wav", "Samples/hihat.wav"],
        "files_modified": ["MyProject.als"],
        "files_removed": [],
        "diff": {
            "diff_type": "combined",
            "diff_summary": "Added drum samples, configured kick pattern on Drums track",
            "diff_data": {
                "xml": {
                    "summary": "Modified Drums track — samples loaded",
                    "project": {
                        "Tracks": [
                            {"Id": "t1", "EffectiveName": "Drums", "Type": "MidiTrack"},
                            {"Id": "t2", "EffectiveName": "Bass", "Type": "MidiTrack"},
                            {"Id": "t3", "EffectiveName": "Lead Synth", "Type": "MidiTrack"},
                            {"Id": "t4", "EffectiveName": "Vocals", "Type": "AudioTrack"},
                        ]
                    },
                },
                "structural": {
                    "ok": True,
                    "changes": [
                        {
                            "trackId": "t1",
                            "trackName": "Drums",
                            "beforeTrackName": "Drums",
                            "afterTrackName": "Drums",
                            "before": {"name": "Drum Rack"},
                            "after": {"name": "Drum Rack (3 samples loaded)"},
                        },
                    ],
                },
            },
        },
    },
    {
        "label": "Commit 4: Swap bass synth and add pad track",
        "action": "create",
        "path": "Samples/pad_loop.wav",
        "content": "<placeholder-audio-pad>",
        "message": "Replace Analog bass with Operator, add Pad track with Wavetable",
        "files_added": ["Samples/pad_loop.wav"],
        "files_modified": ["MyProject.als"],
        "files_removed": [],
        "diff": {
            "diff_type": "combined",
            "diff_summary": "Swapped bass synth from Analog to Operator. Added new Pad track with Wavetable.",
            "diff_data": {
                "xml": {
                    "summary": "Changed bass instrument, added Pad track",
                    "project": {
                        "Tracks": [
                            {"Id": "t1", "EffectiveName": "Drums", "Type": "MidiTrack"},
                            {"Id": "t2", "EffectiveName": "Sub Bass", "Type": "MidiTrack"},
                            {"Id": "t3", "EffectiveName": "Lead Synth", "Type": "MidiTrack"},
                            {"Id": "t4", "EffectiveName": "Vocals", "Type": "AudioTrack"},
                            {"Id": "t5", "EffectiveName": "Pad", "Type": "MidiTrack"},
                        ]
                    },
                },
                "structural": {
                    "ok": True,
                    "changes": [
                        {
                            "trackId": "t2",
                            "trackName": "Sub Bass",
                            "beforeTrackName": "Bass",
                            "afterTrackName": "Sub Bass",
                            "before": {"name": "Analog"},
                            "after": {"name": "Operator"},
                        },
                        {
                            "trackId": "t5",
                            "trackName": "Pad",
                            "beforeTrackName": "",
                            "afterTrackName": "Pad",
                            "before": {"name": None},
                            "after": {"name": "Wavetable"},
                        },
                    ],
                },
            },
        },
    },
    {
        "label": "Commit 5: Mix adjustments and remove unused vocal track",
        "action": "create",
        "path": "Presets/lead_patch_v2.adv",
        "content": "<placeholder-preset>",
        "message": "Mix adjustments: update lead preset, remove empty vocal track",
        "files_added": ["Presets/lead_patch_v2.adv"],
        "files_modified": ["MyProject.als"],
        "files_removed": [],
        "diff": {
            "diff_type": "combined",
            "diff_summary": "Removed unused Vocals track. Updated Lead Synth preset to v2. Adjusted Pad volume.",
            "diff_data": {
                "xml": {
                    "summary": "Removed 1 track, modified 2 tracks",
                    "project": {
                        "Tracks": [
                            {"Id": "t1", "EffectiveName": "Drums", "Type": "MidiTrack"},
                            {"Id": "t2", "EffectiveName": "Sub Bass", "Type": "MidiTrack"},
                            {"Id": "t3", "EffectiveName": "Lead Synth", "Type": "MidiTrack"},
                            {"Id": "t5", "EffectiveName": "Pad", "Type": "MidiTrack"},
                        ]
                    },
                },
                "structural": {
                    "ok": True,
                    "changes": [
                        {
                            "trackId": "t4",
                            "trackName": "Vocals",
                            "beforeTrackName": "Vocals",
                            "afterTrackName": "Vocals",
                            "before": {"name": "Audio In"},
                            "after": {"name": None},
                        },
                        {
                            "trackId": "t3",
                            "trackName": "Lead Synth",
                            "beforeTrackName": "Lead Synth",
                            "afterTrackName": "Lead Synth",
                            "before": {"name": "Wavetable"},
                            "after": {"name": "Wavetable (v2 preset)"},
                        },
                    ],
                },
            },
        },
    },
    {
        "label": "Commit 6: Final arrangement and master chain",
        "action": "create",
        "path": "Bounces/test-diffview-project_final.wav",
        "content": "<placeholder-audio-bounce>",
        "message": "Final arrangement polish, add master FX chain with Glue Compressor + Limiter",
        "files_added": ["Bounces/test-diffview-project_final.wav"],
        "files_modified": ["MyProject.als"],
        "files_removed": [],
        "diff": {
            "diff_type": "combined",
            "diff_summary": "Final arrangement — added master FX chain with Glue Compressor and Limiter. Bounced final mix.",
            "diff_data": {
                "xml": {
                    "summary": "Added master effects, final arrangement",
                    "project": {
                        "Tracks": [
                            {"Id": "t1", "EffectiveName": "Drums", "Type": "MidiTrack"},
                            {"Id": "t2", "EffectiveName": "Sub Bass", "Type": "MidiTrack"},
                            {"Id": "t3", "EffectiveName": "Lead Synth", "Type": "MidiTrack"},
                            {"Id": "t5", "EffectiveName": "Pad", "Type": "MidiTrack"},
                            {"Id": "t6", "EffectiveName": "FX Return", "Type": "AudioTrack"},
                        ]
                    },
                },
                "structural": {
                    "ok": True,
                    "changes": [
                        {
                            "trackId": "t6",
                            "trackName": "FX Return",
                            "beforeTrackName": "",
                            "afterTrackName": "FX Return",
                            "before": {"name": None},
                            "after": {"name": "Reverb → Delay"},
                        },
                        {
                            "trackId": "t1",
                            "trackName": "Drums",
                            "beforeTrackName": "Drums",
                            "afterTrackName": "Drums",
                            "before": {"name": "Drum Rack (3 samples loaded)"},
                            "after": {"name": "Drum Rack (sidechain comp added)"},
                        },
                    ],
                },
            },
        },
    },
]


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    db = SessionLocal()
    try:
        # Check the repo exists in Gitea
        r = requests.get(f"{GITEA_URL}/api/v1/repos/{REPO_FULL}", headers=HEADERS, timeout=10)
        if r.status_code != 200:
            print(f"✗ Repo {REPO_FULL} not found in Gitea (status {r.status_code}). Create it first.")
            return

        # Check/create RepoData row
        repo_data = db.query(RepoData).filter(RepoData.gitea_id == REPO_FULL).first()
        if not repo_data:
            repo_data = RepoData(gitea_id=REPO_FULL, owner_id=OWNER, clone_count=0)
            db.add(repo_data)
            db.commit()
            db.refresh(repo_data)
            print(f"  Created RepoData for {REPO_FULL}")

        # Get existing initial commit SHA
        commits_resp = requests.get(
            f"{GITEA_URL}/api/v1/repos/{REPO_FULL}/git/commits?limit=1&page=1",
            headers=HEADERS, timeout=10,
        )
        prev_sha = "0" * 40
        if commits_resp.status_code == 200:
            existing = commits_resp.json()
            if existing:
                prev_sha = existing[0]["sha"]
                print(f"  Existing HEAD: {prev_sha[:8]}")

        print(f"\nSeeding {len(COMMITS)} commits for {REPO_FULL}...\n")

        for i, c in enumerate(COMMITS):
            print(f"[{i+1}/{len(COMMITS)}] {c['label']}")

            # Create the file in Gitea
            if c["action"] == "create":
                commit_info = create_file(c["path"], c["content"], c["message"])
            else:
                commit_info = update_file(c["path"], c["content"], c["message"])

            if not commit_info:
                print("  ✗ Skipping (no commit returned)")
                continue

            sha = commit_info["sha"]
            ts_str = commit_info.get("created", commit_info.get("timestamp"))
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")) if ts_str else datetime.now(timezone.utc)
            except Exception:
                ts = datetime.now(timezone.utc)

            print(f"  ✓ SHA: {sha[:8]}  — {c['message'][:60]}")

            # Create PushEvent
            push_event = PushEvent(
                repo_id=REPO_FULL,
                ref="refs/heads/main",
                before_sha=prev_sha,
                after_sha=sha,
                pusher_id=OWNER,
                pusher_username=OWNER,
                commit_count=1,
            )
            db.add(push_event)
            db.flush()

            # Create CommitDetail
            cd = CommitDetail(
                push_event_id=push_event.id,
                repo_id=REPO_FULL,
                sha=sha,
                short_sha=sha[:8],
                message=c["message"],
                author_name=OWNER,
                author_email="testuser+soundhaus@soundhaus.dev",
                timestamp=ts,
                files_added=c.get("files_added", []),
                files_modified=c.get("files_modified", []),
                files_removed=c.get("files_removed", []),
            )
            db.add(cd)

            # Create AlsDiff if provided
            if c.get("diff"):
                als_diff = AlsDiff(
                    repo_id=REPO_FULL,
                    commit_sha=sha,
                    before_sha=prev_sha,
                    diff_type=c["diff"]["diff_type"],
                    diff_summary=c["diff"]["diff_summary"],
                    diff_data=c["diff"]["diff_data"],
                    desktop_version="seed-v1",
                )
                db.add(als_diff)

            # Update repo metadata
            repo_data.total_commits = (repo_data.total_commits or 0) + 1
            repo_data.last_push_at = ts
            repo_data.last_activity_at = ts
            repo_data.last_push_commit_sha = sha

            prev_sha = sha
            time.sleep(0.5)  # Small delay so timestamps differ

        db.commit()
        print(f"\n✓ Done! Seeded {len(COMMITS)} commits with diffs.")
        print(f"\n── Test Account Details ──")
        print(f"  Email:    testuser@soundhaus.dev")
        print(f"  Password: TestPass123!")
        print(f"  Repo:     {REPO_FULL}")
        print(f"  Web URL:  http://localhost:3000/{REPO_FULL}")
        print(f"  Commits:  {len(COMMITS) + 1} total (1 initial + {len(COMMITS)} seeded)")

    except Exception as e:
        db.rollback()
        print(f"\n✗ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
