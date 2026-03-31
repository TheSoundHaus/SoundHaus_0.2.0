#!/usr/bin/env python3
"""
Seed script — creates a test user, repo, commits, and ALS diffs for testing
the diff viewer components.

Usage:
    cd apps/backend
    python scripts/seed_diff_test.py

Prerequisites:
    - Docker compose must be running  (docker compose up -d)
    - .env must exist with DATABASE_URL, SUPABASE_URL, etc.

This script:
    1. Creates a test user "testuser" in Supabase + Gitea (if not exists)
    2. Creates a test repo "test-diff-project"
    3. Inserts 5 fake commits with realistic ProjectDiff data
    4. Lets you view the diff viewer at:
       http://localhost:3001/repository/testuser/test-diff-project  (Snapshots tab)
"""

import sys
import os
import uuid
import requests
from datetime import datetime, timezone, timedelta

# Add backend root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from config import settings
from database import SessionLocal, init_db
from models.repo_models import RepoData
from models.commit_models import CommitDetail
from models.diff_models import AlsDiff
from models.profile_models import Profile
from models.webhook_models import PushEvent

# ── Constants ───────────────────────────────────────────────────────────────

TEST_USERNAME = "testuser"
TEST_EMAIL = "testuser@soundhaus.dev"
TEST_PASSWORD = "TestPass123!"
TEST_DISPLAY_NAME = "bingusblaster"
TEST_REPO = "test-diff-project"

# Fake SHAs (deterministic so reruns are idempotent via upsert)
SHAS = [
    "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1",
    "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2",
    "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3",
    "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0a1b2c3d4",
]

# ── Fake ProjectDiff payloads ───────────────────────────────────────────────

def make_commit_1_diff():
    """Initial project setup — new tracks, fresh MIDI + audio."""
    return {
        "tempo": {"before": None, "after": 120.0},
        "timeSignature": [4, 4],
        "totalBeats": 128,
        "summary": "Initial project: 3 tracks, 120 BPM, 32 bars",
        "abletonVersion": "11.3.4",
        "tracks": [
            {
                "trackId": "track-1",
                "trackName": "Lead Synth",
                "trackType": "midi",
                "changeType": "added",
                "instrument": "Serum",
                "colorIndex": 12,
                "midiClips": [
                    {
                        "clipName": "Lead Melody A",
                        "startBeat": 0,
                        "endBeat": 32,
                        "addedNotes": [
                            {"pitch": 60, "startBeat": 0, "durationBeats": 2, "velocity": 100},
                            {"pitch": 64, "startBeat": 2, "durationBeats": 2, "velocity": 95},
                            {"pitch": 67, "startBeat": 4, "durationBeats": 4, "velocity": 110},
                            {"pitch": 72, "startBeat": 8, "durationBeats": 1, "velocity": 80},
                            {"pitch": 71, "startBeat": 9, "durationBeats": 1, "velocity": 85},
                            {"pitch": 69, "startBeat": 10, "durationBeats": 2, "velocity": 90},
                            {"pitch": 67, "startBeat": 12, "durationBeats": 4, "velocity": 105},
                            {"pitch": 60, "startBeat": 16, "durationBeats": 2, "velocity": 100},
                            {"pitch": 65, "startBeat": 18, "durationBeats": 2, "velocity": 92},
                            {"pitch": 69, "startBeat": 20, "durationBeats": 4, "velocity": 108},
                            {"pitch": 72, "startBeat": 24, "durationBeats": 2, "velocity": 88},
                            {"pitch": 74, "startBeat": 26, "durationBeats": 2, "velocity": 95},
                            {"pitch": 76, "startBeat": 28, "durationBeats": 4, "velocity": 115},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                    {
                        "clipName": "Lead Melody B",
                        "startBeat": 64,
                        "endBeat": 96,
                        "addedNotes": [
                            {"pitch": 72, "startBeat": 0, "durationBeats": 4, "velocity": 100},
                            {"pitch": 74, "startBeat": 4, "durationBeats": 2, "velocity": 90},
                            {"pitch": 76, "startBeat": 6, "durationBeats": 2, "velocity": 95},
                            {"pitch": 79, "startBeat": 8, "durationBeats": 4, "velocity": 110},
                            {"pitch": 76, "startBeat": 12, "durationBeats": 2, "velocity": 88},
                            {"pitch": 74, "startBeat": 14, "durationBeats": 2, "velocity": 85},
                            {"pitch": 72, "startBeat": 16, "durationBeats": 8, "velocity": 120},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": None,
                        "afterValue": -6.0,
                        "description": "Volume set to -6 dB",
                    },
                ],
            },
            {
                "trackId": "track-2",
                "trackName": "Bass",
                "trackType": "midi",
                "changeType": "added",
                "instrument": "Massive X",
                "colorIndex": 5,
                "midiClips": [
                    {
                        "clipName": "Bass Pattern",
                        "startBeat": 0,
                        "endBeat": 64,
                        "addedNotes": [
                            {"pitch": 36, "startBeat": 0, "durationBeats": 4, "velocity": 120},
                            {"pitch": 36, "startBeat": 4, "durationBeats": 2, "velocity": 115},
                            {"pitch": 38, "startBeat": 6, "durationBeats": 2, "velocity": 118},
                            {"pitch": 41, "startBeat": 8, "durationBeats": 4, "velocity": 125},
                            {"pitch": 36, "startBeat": 12, "durationBeats": 4, "velocity": 120},
                            {"pitch": 36, "startBeat": 16, "durationBeats": 4, "velocity": 110},
                            {"pitch": 43, "startBeat": 20, "durationBeats": 4, "velocity": 122},
                            {"pitch": 41, "startBeat": 24, "durationBeats": 4, "velocity": 118},
                            {"pitch": 36, "startBeat": 28, "durationBeats": 4, "velocity": 120},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": None,
                        "afterValue": -3.0,
                        "description": "Volume set to -3 dB",
                    },
                ],
            },
            {
                "trackId": "track-3",
                "trackName": "Drums",
                "trackType": "audio",
                "changeType": "added",
                "instrument": None,
                "colorIndex": 1,
                "audioClips": [
                    {
                        "clipName": "Drum Loop 01",
                        "startBeat": 0,
                        "endBeat": 64,
                        "changeType": "added",
                        "description": "New drum loop added (8 bars)",
                    },
                    {
                        "clipName": "Drum Fill",
                        "startBeat": 60,
                        "endBeat": 64,
                        "changeType": "added",
                        "description": "Transition fill (1 bar)",
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": None,
                        "afterValue": 0.0,
                        "description": "Volume set to 0 dB",
                    },
                ],
            },
        ],
    }


def make_commit_2_diff():
    """Melody edits — notes modified, some added, velocity tweaks."""
    return {
        "tempo": {"before": 120.0, "after": 120.0},
        "timeSignature": [4, 4],
        "totalBeats": 128,
        "summary": "Reworked lead melody, adjusted velocities, extended bass line",
        "tracks": [
            {
                "trackId": "track-1",
                "trackName": "Lead Synth",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Serum",
                "colorIndex": 12,
                "midiClips": [
                    {
                        "clipName": "Lead Melody A",
                        "startBeat": 0,
                        "endBeat": 32,
                        "addedNotes": [
                            {"pitch": 62, "startBeat": 3, "durationBeats": 1, "velocity": 88},
                            {"pitch": 74, "startBeat": 30, "durationBeats": 2, "velocity": 100},
                        ],
                        "removedNotes": [
                            {"pitch": 72, "startBeat": 8, "durationBeats": 1, "velocity": 80},
                        ],
                        "modifiedNotes": [
                            {
                                "before": {"pitch": 67, "startBeat": 4, "durationBeats": 4, "velocity": 110},
                                "after": {"pitch": 67, "startBeat": 4, "durationBeats": 3, "velocity": 100},
                            },
                            {
                                "before": {"pitch": 76, "startBeat": 28, "durationBeats": 4, "velocity": 115},
                                "after": {"pitch": 77, "startBeat": 28, "durationBeats": 4, "velocity": 118},
                            },
                        ],
                        "unchangedNotes": [
                            {"pitch": 60, "startBeat": 0, "durationBeats": 2, "velocity": 100},
                            {"pitch": 64, "startBeat": 2, "durationBeats": 2, "velocity": 95},
                            {"pitch": 71, "startBeat": 9, "durationBeats": 1, "velocity": 85},
                            {"pitch": 69, "startBeat": 10, "durationBeats": 2, "velocity": 90},
                            {"pitch": 67, "startBeat": 12, "durationBeats": 4, "velocity": 105},
                            {"pitch": 60, "startBeat": 16, "durationBeats": 2, "velocity": 100},
                            {"pitch": 65, "startBeat": 18, "durationBeats": 2, "velocity": 92},
                            {"pitch": 69, "startBeat": 20, "durationBeats": 4, "velocity": 108},
                            {"pitch": 72, "startBeat": 24, "durationBeats": 2, "velocity": 88},
                            {"pitch": 74, "startBeat": 26, "durationBeats": 2, "velocity": 95},
                        ],
                    },
                ],
                "deviceChanges": [
                    {
                        "deviceName": "OTT",
                        "changeType": "added",
                        "parameterChanges": [
                            {
                                "name": "Depth",
                                "beforeValue": None,
                                "afterValue": 40,
                                "description": "OTT Depth set to 40%",
                            },
                        ],
                    },
                ],
            },
            {
                "trackId": "track-2",
                "trackName": "Bass",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Massive X",
                "colorIndex": 5,
                "midiClips": [
                    {
                        "clipName": "Bass Pattern",
                        "startBeat": 0,
                        "endBeat": 64,
                        "addedNotes": [
                            {"pitch": 36, "startBeat": 32, "durationBeats": 4, "velocity": 120},
                            {"pitch": 38, "startBeat": 36, "durationBeats": 4, "velocity": 118},
                            {"pitch": 41, "startBeat": 40, "durationBeats": 4, "velocity": 125},
                            {"pitch": 43, "startBeat": 44, "durationBeats": 8, "velocity": 122},
                            {"pitch": 36, "startBeat": 52, "durationBeats": 12, "velocity": 120},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [
                            {
                                "before": {"pitch": 36, "startBeat": 4, "durationBeats": 2, "velocity": 115},
                                "after": {"pitch": 36, "startBeat": 4, "durationBeats": 4, "velocity": 120},
                            },
                        ],
                        "unchangedNotes": [
                            {"pitch": 36, "startBeat": 0, "durationBeats": 4, "velocity": 120},
                            {"pitch": 38, "startBeat": 6, "durationBeats": 2, "velocity": 118},
                            {"pitch": 41, "startBeat": 8, "durationBeats": 4, "velocity": 125},
                            {"pitch": 36, "startBeat": 12, "durationBeats": 4, "velocity": 120},
                            {"pitch": 36, "startBeat": 16, "durationBeats": 4, "velocity": 110},
                            {"pitch": 43, "startBeat": 20, "durationBeats": 4, "velocity": 122},
                            {"pitch": 41, "startBeat": 24, "durationBeats": 4, "velocity": 118},
                            {"pitch": 36, "startBeat": 28, "durationBeats": 4, "velocity": 120},
                        ],
                    },
                ],
            },
            {
                "trackId": "track-3",
                "trackName": "Drums",
                "trackType": "audio",
                "changeType": "unchanged",
                "instrument": None,
                "colorIndex": 1,
            },
        ],
    }


def make_commit_3_diff():
    """Tempo change + new return track + FX chain modifications."""
    return {
        "tempo": {"before": 120.0, "after": 128.0},
        "timeSignature": [4, 4],
        "totalBeats": 128,
        "summary": "Tempo up to 128 BPM, added reverb return, tweaked drum gain and panning",
        "tracks": [
            {
                "trackId": "track-1",
                "trackName": "Lead Synth",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Serum",
                "colorIndex": 12,
                "parameterChanges": [
                    {
                        "name": "Send A",
                        "beforeValue": -60.0,
                        "afterValue": -12.0,
                        "description": "Send A (Reverb): -inf → -12 dB",
                    },
                ],
            },
            {
                "trackId": "track-2",
                "trackName": "Bass",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Massive X",
                "colorIndex": 5,
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": -3.0,
                        "afterValue": -5.0,
                        "description": "Volume: -3 dB → -5 dB (ducking for tempo boost)",
                    },
                ],
            },
            {
                "trackId": "track-3",
                "trackName": "Drums",
                "trackType": "audio",
                "changeType": "modified",
                "instrument": None,
                "colorIndex": 1,
                "audioClips": [
                    {
                        "clipName": "Drum Loop 01",
                        "startBeat": 0,
                        "endBeat": 64,
                        "changeType": "modified",
                        "description": "Warp mode changed: Beats → Complex Pro (for tempo adaptation)",
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Pan",
                        "beforeValue": 0,
                        "afterValue": -15,
                        "description": "Pan: Center → 15L",
                    },
                ],
            },
            {
                "trackId": "track-4",
                "trackName": "Reverb Return",
                "trackType": "return",
                "changeType": "added",
                "instrument": None,
                "colorIndex": 22,
                "deviceChanges": [
                    {
                        "deviceName": "Valhalla VintageVerb",
                        "changeType": "added",
                        "parameterChanges": [
                            {
                                "name": "Decay",
                                "beforeValue": None,
                                "afterValue": 3.5,
                                "description": "Decay set to 3.5s",
                            },
                            {
                                "name": "Mix",
                                "beforeValue": None,
                                "afterValue": 100,
                                "description": "Mix set to 100% (return track)",
                            },
                        ],
                    },
                ],
            },
        ],
    }


def make_commit_4_diff():
    """Major rework — removed a track, added a new one, heavy MIDI edits."""
    return {
        "tempo": {"before": 128.0, "after": 128.0},
        "timeSignature": [4, 4],
        "totalBeats": 192,
        "summary": "Extended arrangement to 48 bars, replaced drum loop, added pad track, heavy lead edits",
        "tracks": [
            {
                "trackId": "track-1",
                "trackName": "Lead Synth",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Serum",
                "colorIndex": 12,
                "midiClips": [
                    {
                        "clipName": "Lead Melody A",
                        "startBeat": 0,
                        "endBeat": 32,
                        "addedNotes": [
                            {"pitch": 79, "startBeat": 7, "durationBeats": 1, "velocity": 92},
                            {"pitch": 81, "startBeat": 15, "durationBeats": 1, "velocity": 88},
                        ],
                        "removedNotes": [
                            {"pitch": 62, "startBeat": 3, "durationBeats": 1, "velocity": 88},
                            {"pitch": 74, "startBeat": 30, "durationBeats": 2, "velocity": 100},
                        ],
                        "modifiedNotes": [
                            {
                                "before": {"pitch": 77, "startBeat": 28, "durationBeats": 4, "velocity": 118},
                                "after": {"pitch": 79, "startBeat": 28, "durationBeats": 4, "velocity": 122},
                            },
                        ],
                        "unchangedNotes": [
                            {"pitch": 60, "startBeat": 0, "durationBeats": 2, "velocity": 100},
                            {"pitch": 64, "startBeat": 2, "durationBeats": 2, "velocity": 95},
                            {"pitch": 67, "startBeat": 4, "durationBeats": 3, "velocity": 100},
                            {"pitch": 71, "startBeat": 9, "durationBeats": 1, "velocity": 85},
                            {"pitch": 69, "startBeat": 10, "durationBeats": 2, "velocity": 90},
                            {"pitch": 67, "startBeat": 12, "durationBeats": 4, "velocity": 105},
                            {"pitch": 60, "startBeat": 16, "durationBeats": 2, "velocity": 100},
                            {"pitch": 65, "startBeat": 18, "durationBeats": 2, "velocity": 92},
                            {"pitch": 69, "startBeat": 20, "durationBeats": 4, "velocity": 108},
                            {"pitch": 72, "startBeat": 24, "durationBeats": 2, "velocity": 88},
                            {"pitch": 74, "startBeat": 26, "durationBeats": 2, "velocity": 95},
                        ],
                    },
                    {
                        "clipName": "Lead Melody C (new section)",
                        "startBeat": 128,
                        "endBeat": 192,
                        "addedNotes": [
                            {"pitch": 84, "startBeat": 0, "durationBeats": 4, "velocity": 110},
                            {"pitch": 81, "startBeat": 4, "durationBeats": 4, "velocity": 105},
                            {"pitch": 79, "startBeat": 8, "durationBeats": 8, "velocity": 115},
                            {"pitch": 76, "startBeat": 16, "durationBeats": 4, "velocity": 100},
                            {"pitch": 79, "startBeat": 20, "durationBeats": 4, "velocity": 108},
                            {"pitch": 84, "startBeat": 24, "durationBeats": 8, "velocity": 120},
                            {"pitch": 81, "startBeat": 32, "durationBeats": 4, "velocity": 102},
                            {"pitch": 79, "startBeat": 36, "durationBeats": 4, "velocity": 98},
                            {"pitch": 76, "startBeat": 40, "durationBeats": 8, "velocity": 112},
                            {"pitch": 72, "startBeat": 48, "durationBeats": 16, "velocity": 125},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                ],
            },
            {
                "trackId": "track-2",
                "trackName": "Bass",
                "trackType": "midi",
                "changeType": "unchanged",
                "instrument": "Massive X",
                "colorIndex": 5,
            },
            {
                "trackId": "track-3",
                "trackName": "Drums",
                "trackType": "audio",
                "changeType": "removed",
                "instrument": None,
                "colorIndex": 1,
                "audioClips": [
                    {
                        "clipName": "Drum Loop 01",
                        "startBeat": 0,
                        "endBeat": 64,
                        "changeType": "removed",
                        "description": "Drum audio loop removed (replaced by MIDI drums)",
                    },
                    {
                        "clipName": "Drum Fill",
                        "startBeat": 60,
                        "endBeat": 64,
                        "changeType": "removed",
                        "description": "Transition fill removed",
                    },
                ],
            },
            {
                "trackId": "track-5",
                "trackName": "MIDI Drums",
                "trackType": "midi",
                "changeType": "added",
                "instrument": "Battery 4",
                "colorIndex": 3,
                "midiClips": [
                    {
                        "clipName": "Beat Pattern",
                        "startBeat": 0,
                        "endBeat": 128,
                        "addedNotes": [
                            # Kick pattern (C1 = 36)
                            {"pitch": 36, "startBeat": 0, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 4, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 8, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 10, "durationBeats": 0.5, "velocity": 110},
                            {"pitch": 36, "startBeat": 12, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 16, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 20, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 24, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 28, "durationBeats": 0.5, "velocity": 110},
                            # Snare pattern (D1 = 38)
                            {"pitch": 38, "startBeat": 4, "durationBeats": 0.5, "velocity": 120},
                            {"pitch": 38, "startBeat": 12, "durationBeats": 0.5, "velocity": 120},
                            {"pitch": 38, "startBeat": 20, "durationBeats": 0.5, "velocity": 120},
                            {"pitch": 38, "startBeat": 28, "durationBeats": 0.5, "velocity": 120},
                            # Hi-hat pattern (F#1 = 42)
                            {"pitch": 42, "startBeat": 0, "durationBeats": 0.25, "velocity": 80},
                            {"pitch": 42, "startBeat": 1, "durationBeats": 0.25, "velocity": 60},
                            {"pitch": 42, "startBeat": 2, "durationBeats": 0.25, "velocity": 80},
                            {"pitch": 42, "startBeat": 3, "durationBeats": 0.25, "velocity": 60},
                            {"pitch": 42, "startBeat": 4, "durationBeats": 0.25, "velocity": 80},
                            {"pitch": 42, "startBeat": 5, "durationBeats": 0.25, "velocity": 60},
                            {"pitch": 42, "startBeat": 6, "durationBeats": 0.25, "velocity": 80},
                            {"pitch": 42, "startBeat": 7, "durationBeats": 0.25, "velocity": 60},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                ],
            },
            {
                "trackId": "track-6",
                "trackName": "Ambient Pad",
                "trackType": "midi",
                "changeType": "added",
                "instrument": "Omnisphere",
                "colorIndex": 18,
                "midiClips": [
                    {
                        "clipName": "Pad Swell",
                        "startBeat": 64,
                        "endBeat": 192,
                        "addedNotes": [
                            # Long sustained chords
                            {"pitch": 60, "startBeat": 0, "durationBeats": 32, "velocity": 60},
                            {"pitch": 64, "startBeat": 0, "durationBeats": 32, "velocity": 55},
                            {"pitch": 67, "startBeat": 0, "durationBeats": 32, "velocity": 58},
                            {"pitch": 72, "startBeat": 0, "durationBeats": 32, "velocity": 50},
                            {"pitch": 62, "startBeat": 32, "durationBeats": 32, "velocity": 62},
                            {"pitch": 65, "startBeat": 32, "durationBeats": 32, "velocity": 58},
                            {"pitch": 69, "startBeat": 32, "durationBeats": 32, "velocity": 60},
                            {"pitch": 74, "startBeat": 32, "durationBeats": 32, "velocity": 52},
                            {"pitch": 64, "startBeat": 64, "durationBeats": 64, "velocity": 65},
                            {"pitch": 67, "startBeat": 64, "durationBeats": 64, "velocity": 60},
                            {"pitch": 71, "startBeat": 64, "durationBeats": 64, "velocity": 58},
                            {"pitch": 76, "startBeat": 64, "durationBeats": 64, "velocity": 48},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [],
                        "unchangedNotes": [],
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": None,
                        "afterValue": -12.0,
                        "description": "Volume set to -12 dB (background texture)",
                    },
                ],
            },
            {
                "trackId": "track-4",
                "trackName": "Reverb Return",
                "trackType": "return",
                "changeType": "modified",
                "instrument": None,
                "colorIndex": 22,
                "parameterChanges": [
                    {
                        "name": "Decay",
                        "beforeValue": 3.5,
                        "afterValue": 5.0,
                        "description": "Decay: 3.5s → 5.0s (longer tail for pads)",
                    },
                ],
            },
        ],
    }


def make_commit_5_diff():
    """Final mix — velocity polishing, device tweaks, no structural changes."""
    return {
        "tempo": {"before": 128.0, "after": 128.0},
        "timeSignature": [4, 4],
        "totalBeats": 192,
        "summary": "Final mix polish: velocity normalization, EQ adjustments, master limiter added",
        "tracks": [
            {
                "trackId": "track-1",
                "trackName": "Lead Synth",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Serum",
                "colorIndex": 12,
                "midiClips": [
                    {
                        "clipName": "Lead Melody A",
                        "startBeat": 0,
                        "endBeat": 32,
                        "addedNotes": [],
                        "removedNotes": [],
                        "modifiedNotes": [
                            {
                                "before": {"pitch": 60, "startBeat": 0, "durationBeats": 2, "velocity": 100},
                                "after": {"pitch": 60, "startBeat": 0, "durationBeats": 2, "velocity": 95},
                            },
                            {
                                "before": {"pitch": 67, "startBeat": 4, "durationBeats": 3, "velocity": 100},
                                "after": {"pitch": 67, "startBeat": 4, "durationBeats": 3, "velocity": 95},
                            },
                            {
                                "before": {"pitch": 69, "startBeat": 10, "durationBeats": 2, "velocity": 90},
                                "after": {"pitch": 69, "startBeat": 10, "durationBeats": 2, "velocity": 92},
                            },
                        ],
                        "unchangedNotes": [
                            {"pitch": 64, "startBeat": 2, "durationBeats": 2, "velocity": 95},
                            {"pitch": 79, "startBeat": 7, "durationBeats": 1, "velocity": 92},
                            {"pitch": 71, "startBeat": 9, "durationBeats": 1, "velocity": 85},
                            {"pitch": 67, "startBeat": 12, "durationBeats": 4, "velocity": 105},
                            {"pitch": 81, "startBeat": 15, "durationBeats": 1, "velocity": 88},
                            {"pitch": 60, "startBeat": 16, "durationBeats": 2, "velocity": 100},
                            {"pitch": 65, "startBeat": 18, "durationBeats": 2, "velocity": 92},
                            {"pitch": 69, "startBeat": 20, "durationBeats": 4, "velocity": 108},
                            {"pitch": 72, "startBeat": 24, "durationBeats": 2, "velocity": 88},
                            {"pitch": 74, "startBeat": 26, "durationBeats": 2, "velocity": 95},
                            {"pitch": 79, "startBeat": 28, "durationBeats": 4, "velocity": 122},
                        ],
                    },
                ],
                "deviceChanges": [
                    {
                        "deviceName": "Pro-Q 3",
                        "changeType": "added",
                        "parameterChanges": [
                            {
                                "name": "Band 1 Freq",
                                "beforeValue": None,
                                "afterValue": 200,
                                "description": "High-pass at 200 Hz",
                            },
                            {
                                "name": "Band 2 Freq",
                                "beforeValue": None,
                                "afterValue": 3000,
                                "description": "Presence boost at 3 kHz (+2 dB)",
                            },
                        ],
                    },
                ],
            },
            {
                "trackId": "track-2",
                "trackName": "Bass",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Massive X",
                "colorIndex": 5,
                "deviceChanges": [
                    {
                        "deviceName": "Saturator",
                        "changeType": "added",
                        "parameterChanges": [
                            {
                                "name": "Drive",
                                "beforeValue": None,
                                "afterValue": 12,
                                "description": "Saturation Drive: 12 dB",
                            },
                        ],
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": -5.0,
                        "afterValue": -4.5,
                        "description": "Volume: -5 dB → -4.5 dB",
                    },
                ],
            },
            {
                "trackId": "track-5",
                "trackName": "MIDI Drums",
                "trackType": "midi",
                "changeType": "modified",
                "instrument": "Battery 4",
                "colorIndex": 3,
                "midiClips": [
                    {
                        "clipName": "Beat Pattern",
                        "startBeat": 0,
                        "endBeat": 128,
                        "addedNotes": [
                            # Open hi-hat accents (A#1 = 46)
                            {"pitch": 46, "startBeat": 3.5, "durationBeats": 0.5, "velocity": 90},
                            {"pitch": 46, "startBeat": 11.5, "durationBeats": 0.5, "velocity": 85},
                            {"pitch": 46, "startBeat": 19.5, "durationBeats": 0.5, "velocity": 88},
                            {"pitch": 46, "startBeat": 27.5, "durationBeats": 0.5, "velocity": 82},
                        ],
                        "removedNotes": [],
                        "modifiedNotes": [
                            {
                                "before": {"pitch": 36, "startBeat": 10, "durationBeats": 0.5, "velocity": 110},
                                "after": {"pitch": 36, "startBeat": 10, "durationBeats": 0.5, "velocity": 100},
                            },
                        ],
                        "unchangedNotes": [
                            {"pitch": 36, "startBeat": 0, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 4, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 8, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 36, "startBeat": 12, "durationBeats": 0.5, "velocity": 127},
                            {"pitch": 38, "startBeat": 4, "durationBeats": 0.5, "velocity": 120},
                            {"pitch": 38, "startBeat": 12, "durationBeats": 0.5, "velocity": 120},
                        ],
                    },
                ],
                "parameterChanges": [
                    {
                        "name": "Volume",
                        "beforeValue": 0.0,
                        "afterValue": -1.5,
                        "description": "Volume: 0 dB → -1.5 dB (mix headroom)",
                    },
                ],
            },
            {
                "trackId": "track-6",
                "trackName": "Ambient Pad",
                "trackType": "midi",
                "changeType": "unchanged",
                "instrument": "Omnisphere",
                "colorIndex": 18,
            },
            {
                "trackId": "track-4",
                "trackName": "Reverb Return",
                "trackType": "return",
                "changeType": "unchanged",
                "instrument": None,
                "colorIndex": 22,
            },
        ],
    }


# ── Commit metadata ────────────────────────────────────────────────────────

COMMITS = [
    {
        "sha": SHAS[0],
        "message": "Initial project: Lead synth, bass, drum loop — 120 BPM",
        "files_added": ["SoundHaus Demo.als", "Samples/Drums/Loop 01.wav"],
        "files_modified": [],
        "files_removed": [],
        "diff_fn": make_commit_1_diff,
    },
    {
        "sha": SHAS[1],
        "message": "Rework lead melody, extend bass pattern, add OTT to lead",
        "files_added": [],
        "files_modified": ["SoundHaus Demo.als"],
        "files_removed": [],
        "diff_fn": make_commit_2_diff,
    },
    {
        "sha": SHAS[2],
        "message": "Tempo bump 120→128, add reverb return, adjust panning",
        "files_added": [],
        "files_modified": ["SoundHaus Demo.als"],
        "files_removed": [],
        "diff_fn": make_commit_3_diff,
    },
    {
        "sha": SHAS[3],
        "message": "Major rework: replace audio drums w/ MIDI, add ambient pad, extend to 48 bars",
        "files_added": [],
        "files_modified": ["SoundHaus Demo.als"],
        "files_removed": ["Samples/Drums/Loop 01.wav", "Samples/Drums/Fill.wav"],
        "diff_fn": make_commit_4_diff,
    },
    {
        "sha": SHAS[4],
        "message": "Final mix: velocity polish, EQ, saturation, open hi-hat accents",
        "files_added": [],
        "files_modified": ["SoundHaus Demo.als"],
        "files_removed": [],
        "diff_fn": make_commit_5_diff,
    },
]


# ── Seed logic ──────────────────────────────────────────────────────────────

def seed():
    print("🔧 Initializing database tables...")
    init_db()

    db = SessionLocal()
    try:
        # ── 1. Ensure Supabase auth user + profile exist ──────────────────
        profile = db.query(Profile).filter(Profile.username == TEST_USERNAME).first()
        if not profile:
            print(f"📝 Looking up Supabase auth user for {TEST_EMAIL}...")

            # Use Supabase Admin API to find or create user (requires service role key)
            service_key = settings.supabase_service_key
            if not service_key:
                print("   ⚠️  SUPABASE_SERVICE_KEY not set in .env — trying public signup instead...")
                from supabase import create_client
                sb = create_client(settings.supabase_url, settings.supabase_pub_key)
                res = sb.auth.sign_up({"email": TEST_EMAIL, "password": TEST_PASSWORD})
                user_id = res.user.id if res.user else None
                if not user_id:
                    print("   ❌ Could not create user via public signup. Set SUPABASE_SERVICE_KEY.")
                    return
            else:
                # Admin API — create confirmed user directly
                admin_url = f"{settings.supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json",
                }
                resp = requests.post(admin_url, json={
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {"username": TEST_USERNAME},
                }, headers=headers)

                if resp.status_code == 200:
                    user_id = resp.json()["id"]
                    print(f"   ✅ Supabase user created (id={user_id})")
                elif resp.status_code == 422 and "already been registered" in resp.text:
                    # User already exists — look them up
                    list_resp = requests.get(
                        f"{settings.supabase_url}/auth/v1/admin/users",
                        headers=headers,
                        params={"page": 1, "per_page": 50}
                    )
                    users = list_resp.json().get("users", [])
                    user_id = next((u["id"] for u in users if u.get("email") == TEST_EMAIL), None)
                    if not user_id:
                        print(f"   ❌ User exists in Supabase but couldn't find ID. Response: {resp.text}")
                        return
                    print(f"   ℹ️  User already in Supabase auth (id={user_id})")
                else:
                    print(f"   ❌ Supabase user creation failed ({resp.status_code}): {resp.text}")
                    return

            # Check if profile exists by ID (might have different username)
            profile = db.query(Profile).filter(Profile.id == user_id).first()
            if profile:
                print(f"   ℹ️  Profile already exists by ID (username={profile.username})")
                if profile.username != TEST_USERNAME:
                    print(f"   ⚠️  Username mismatch: expected '{TEST_USERNAME}', got '{profile.username}'")
                    print(f"   📝 Updating username to '{TEST_USERNAME}'...")
                    profile.username = TEST_USERNAME
                    db.commit()
                if profile.display_name != TEST_DISPLAY_NAME:
                    print(f"   📝 Updating display_name to '{TEST_DISPLAY_NAME}'...")
                    profile.display_name = TEST_DISPLAY_NAME
                    db.commit()
            else:
                # Create the profile
                print(f"📝 Creating profile for {TEST_USERNAME}...")
                profile = Profile(
                    id=user_id,
                    email=TEST_EMAIL,
                    username=TEST_USERNAME,
                    display_name=TEST_DISPLAY_NAME,
                )
                db.add(profile)
                db.commit()
                print(f"   ✅ Profile created (id={profile.id})")
        else:
            print(f"   ℹ️  Profile already exists (id={profile.id})")

        # ── REPO_ID is based on Supabase UUID (matches Gitea username) ─────
        user_id = str(profile.id)
        REPO_ID = f"{user_id}/{TEST_REPO}"

        # ── 2a. Create Gitea repo (if not exists) ──────────────────────────
        gitea_url = os.getenv("GITEA_URL", "http://localhost:3000")
        gitea_token = os.getenv("GITEA_ADMIN_TOKEN", "")
        if gitea_token:
            print(f"🔗 Ensuring Gitea repo {REPO_ID} exists...")
            # Check if repo already exists
            check_resp = requests.get(
                f"{gitea_url}/api/v1/repos/{REPO_ID}",
                params={"token": gitea_token},
                timeout=10,
            )
            if check_resp.status_code == 200:
                print(f"   ℹ️  Gitea repo already exists")
            elif check_resp.status_code == 404:
                # Ensure Gitea user exists first
                user_check = requests.get(
                    f"{gitea_url}/api/v1/users/{user_id}",
                    params={"token": gitea_token},
                    timeout=10,
                )
                if user_check.status_code == 404:
                    print(f"   📝 Creating Gitea user {user_id}...")
                    requests.post(
                        f"{gitea_url}/api/v1/admin/users",
                        params={"token": gitea_token},
                        json={
                            "username": str(user_id),
                            "email": f"testuser+soundhaus@soundhaus.dev",
                            "password": TEST_PASSWORD,
                            "must_change_password": False,
                            "full_name": str(user_id),
                        },
                        timeout=10,
                    )
                # Create repository under the UUID user
                create_resp = requests.post(
                    f"{gitea_url}/api/v1/admin/users/{user_id}/repos",
                    params={"token": gitea_token},
                    json={
                        "name": TEST_REPO,
                        "description": "Test repo for diff viewer with ProjectDiff data",
                        "private": False,
                        "auto_init": True,
                    },
                    timeout=10,
                )
                if create_resp.status_code in (201, 200):
                    print(f"   ✅ Gitea repo created: {REPO_ID}")
                else:
                    print(f"   ⚠️  Gitea repo creation returned {create_resp.status_code}: {create_resp.text}")
            else:
                print(f"   ⚠️  Gitea repo check returned {check_resp.status_code}")
        else:
            print("   ⚠️  No GITEA_ADMIN_TOKEN — skipping Gitea repo creation")

        # ── 2b. Ensure repo_data row exists ────────────────────────────────
        repo_row = db.query(RepoData).filter(RepoData.gitea_id == REPO_ID).first()
        if not repo_row:
            print(f"📦 Creating repo_data for {REPO_ID}...")
            repo_row = RepoData(
                gitea_id=REPO_ID,
                owner_id=str(profile.id),
            )
            db.add(repo_row)
            db.commit()
            print(f"   ✅ repo_data created")
        else:
            print(f"   ℹ️  repo_data already exists")

        # ── 3. Insert push events + commits ─────────────────────────────────
        base_time = datetime.now(timezone.utc) - timedelta(days=7)

        for i, cdata in enumerate(COMMITS):
            sha = cdata["sha"]
            existing = db.query(CommitDetail).filter(
                CommitDetail.repo_id == REPO_ID,
                CommitDetail.sha == sha,
            ).first()

            ts = base_time + timedelta(hours=i * 12)
            before_sha_val = SHAS[i - 1] if i > 0 else "0" * 40

            if existing:
                print(f"   ℹ️  Commit {sha[:8]} already exists, updating...")
                existing.message = cdata["message"]
                existing.files_added = cdata["files_added"]
                existing.files_modified = cdata["files_modified"]
                existing.files_removed = cdata["files_removed"]
                existing.timestamp = ts
            else:
                # Create a PushEvent first (CommitDetail requires push_event_id)
                push_event = PushEvent(
                    repo_id=REPO_ID,
                    pusher_id=str(profile.id),
                    pusher_username=TEST_USERNAME,
                    ref="refs/heads/main",
                    before_sha=before_sha_val,
                    after_sha=sha,
                    commit_count=1,
                    pushed_at=ts,
                )
                db.add(push_event)
                db.flush()  # Get the auto-increment id

                print(f"🔨 Creating commit {sha[:8]} (push_event={push_event.id})...")
                commit = CommitDetail(
                    push_event_id=push_event.id,
                    repo_id=REPO_ID,
                    sha=sha,
                    short_sha=sha[:7],
                    message=cdata["message"],
                    author_name=TEST_USERNAME,
                    author_email=TEST_EMAIL,
                    timestamp=ts,
                    files_added=cdata["files_added"],
                    files_modified=cdata["files_modified"],
                    files_removed=cdata["files_removed"],
                )
                db.add(commit)

            db.commit()

        # ── 4. Insert als_diffs ────────────────────────────────────────────
        for i, cdata in enumerate(COMMITS):
            sha = cdata["sha"]
            diff_data = cdata["diff_fn"]()
            before_sha = SHAS[i - 1] if i > 0 else None

            existing = db.query(AlsDiff).filter(
                AlsDiff.repo_id == REPO_ID,
                AlsDiff.commit_sha == sha,
            ).first()

            if existing:
                print(f"   ℹ️  AlsDiff for {sha[:8]} already exists, updating...")
                existing.diff_data = diff_data
                existing.before_sha = before_sha
                existing.diff_summary = diff_data.get("summary")
                existing.diff_type = "enriched"
            else:
                print(f"🎵 Creating AlsDiff for {sha[:8]}...")
                diff = AlsDiff(
                    repo_id=REPO_ID,
                    commit_sha=sha,
                    before_sha=before_sha,
                    diff_type="enriched",
                    diff_summary=diff_data.get("summary"),
                    diff_data=diff_data,
                    desktop_version="0.2.0-test",
                )
                db.add(diff)

            db.commit()

        print()
        print("=" * 60)
        print("✅ Seed complete!")
        print(f"   User:    {TEST_USERNAME} ({TEST_EMAIL})")
        print(f"   Repo:    {REPO_ID}")
        print(f"   Commits: {len(COMMITS)}")
        print(f"   Diffs:   {len(COMMITS)} (all with ProjectDiff data)")
        print()
        print("📋 To view in the web app:")
        print(f"   1. Sign up or log in as {TEST_EMAIL} / TestPass123!")
        print(f"   2. Navigate to: /repository/{REPO_ID}")
        print(f"   3. Click the 'Snapshots' tab")
        print(f"   4. Click any commit to expand — the diff viewer will render")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
