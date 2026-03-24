"""
Seed script — populate fake CommitDetail + AlsDiff rows for demo purposes.

Usage (from inside the fastapi container):
    python scripts/seed_commits.py

This creates realistic Ableton-style commit history for the first repo
found in repo_data, complete with ALS diff data so the DiffView component
has something to render.
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import uuid
import hashlib
from datetime import datetime, timezone, timedelta

from database import SessionLocal
from models.repo_models import RepoData
from models.webhook_models import PushEvent
from models.commit_models import CommitDetail
from models.diff_models import AlsDiff


def make_sha(seed: str) -> str:
    """Generate a deterministic 40-char hex SHA from a seed string."""
    return hashlib.sha256(seed.encode()).hexdigest()[:40]


# ── Fake commit data ─────────────────────────────────────────────────────────

FAKE_COMMITS = [
    {
        "seed": "initial-project",
        "message": "Initial project setup — created Ableton Live Set with default template",
        "author_name": "Nathan Hall",
        "author_email": "nathan@soundhaus.dev",
        "hours_ago": 72,
        "files_added": ["MyBeat.als", "Samples/kick_808.wav", "Samples/snare_tight.wav", "Samples/hihat_closed.wav"],
        "files_modified": [],
        "files_removed": [],
        "diff_data": {
            "diff_type": "xml",
            "project": {
                "Tracks": [
                    {
                        "name": "Drums - 808 Kit",
                        "type": "midi",
                        "instrument": "Drum Rack",
                        "clips": [
                            {"name": "Beat Pattern A", "start_beat": 0, "end_beat": 16, "color": "#FF6B35",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 4, "duration": 0.5, "velocity": 120},
                                 {"pitch": 36, "start": 8, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 12, "duration": 0.5, "velocity": 115},
                                 {"pitch": 38, "start": 4, "duration": 0.25, "velocity": 100},
                                 {"pitch": 38, "start": 12, "duration": 0.25, "velocity": 95},
                                 {"pitch": 42, "start": 0, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 2, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 4, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 6, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 8, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 10, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 12, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 14, "duration": 0.25, "velocity": 75},
                             ]},
                        ],
                    },
                    {
                        "name": "Bass - Sub",
                        "type": "midi",
                        "instrument": "Operator",
                        "clips": [
                            {"name": "Bass Line v1", "start_beat": 0, "end_beat": 16, "color": "#4ECDC4",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 3.5, "velocity": 110},
                                 {"pitch": 34, "start": 4, "duration": 3.5, "velocity": 105},
                                 {"pitch": 31, "start": 8, "duration": 3.5, "velocity": 110},
                                 {"pitch": 33, "start": 12, "duration": 3.5, "velocity": 100},
                             ]},
                        ],
                    },
                    {
                        "name": "Melody - Lead Synth",
                        "type": "midi",
                        "instrument": "Wavetable",
                        "clips": [],
                    },
                    {
                        "name": "Vocals",
                        "type": "audio",
                        "instrument": None,
                        "clips": [],
                    },
                ]
            }
        }
    },
    {
        "seed": "add-melody",
        "message": "Added lead melody and hi-hat variation pattern",
        "author_name": "Nathan Hall",
        "author_email": "nathan@soundhaus.dev",
        "hours_ago": 48,
        "files_added": ["Samples/clap_layer.wav"],
        "files_modified": ["MyBeat.als"],
        "files_removed": [],
        "diff_data": {
            "diff_type": "combined",
            "project": {
                "Tracks": [
                    {
                        "name": "Drums - 808 Kit",
                        "type": "midi",
                        "instrument": "Drum Rack",
                        "clips": [
                            {"name": "Beat Pattern A", "start_beat": 0, "end_beat": 16, "color": "#FF6B35",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 4, "duration": 0.5, "velocity": 120},
                                 {"pitch": 36, "start": 8, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 12, "duration": 0.5, "velocity": 115},
                                 {"pitch": 38, "start": 4, "duration": 0.25, "velocity": 100},
                                 {"pitch": 38, "start": 12, "duration": 0.25, "velocity": 95},
                                 {"pitch": 42, "start": 0, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 2, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 4, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 6, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 8, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 10, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 12, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 14, "duration": 0.25, "velocity": 75},
                             ]},
                            {"name": "Beat Pattern B", "start_beat": 16, "end_beat": 32, "color": "#FF6B35",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 2, "duration": 0.5, "velocity": 90},
                                 {"pitch": 36, "start": 4, "duration": 0.5, "velocity": 120},
                                 {"pitch": 36, "start": 8, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 12, "duration": 0.5, "velocity": 115},
                                 {"pitch": 38, "start": 4, "duration": 0.25, "velocity": 110},
                                 {"pitch": 38, "start": 12, "duration": 0.25, "velocity": 105},
                                 {"pitch": 39, "start": 14, "duration": 0.125, "velocity": 80},
                                 {"pitch": 39, "start": 14.5, "duration": 0.125, "velocity": 75},
                                 {"pitch": 42, "start": 0, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 1, "duration": 0.25, "velocity": 60},
                                 {"pitch": 42, "start": 2, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 3, "duration": 0.25, "velocity": 60},
                                 {"pitch": 42, "start": 4, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 5, "duration": 0.25, "velocity": 60},
                                 {"pitch": 46, "start": 6, "duration": 0.5, "velocity": 90},
                                 {"pitch": 42, "start": 8, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 10, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 12, "duration": 0.25, "velocity": 80},
                                 {"pitch": 46, "start": 14, "duration": 0.5, "velocity": 85},
                             ]},
                        ],
                    },
                    {
                        "name": "Bass - Sub",
                        "type": "midi",
                        "instrument": "Operator",
                        "clips": [
                            {"name": "Bass Line v1", "start_beat": 0, "end_beat": 16, "color": "#4ECDC4",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 3.5, "velocity": 110},
                                 {"pitch": 34, "start": 4, "duration": 3.5, "velocity": 105},
                                 {"pitch": 31, "start": 8, "duration": 3.5, "velocity": 110},
                                 {"pitch": 33, "start": 12, "duration": 3.5, "velocity": 100},
                             ]},
                        ],
                    },
                    {
                        "name": "Melody - Lead Synth",
                        "type": "midi",
                        "instrument": "Wavetable",
                        "clips": [
                            {"name": "Melody Hook", "start_beat": 0, "end_beat": 16, "color": "#FFE66D",
                             "notes": [
                                 {"pitch": 72, "start": 0, "duration": 1.0, "velocity": 100},
                                 {"pitch": 74, "start": 1, "duration": 0.5, "velocity": 90},
                                 {"pitch": 76, "start": 2, "duration": 2.0, "velocity": 105},
                                 {"pitch": 74, "start": 4, "duration": 1.0, "velocity": 95},
                                 {"pitch": 72, "start": 5, "duration": 0.5, "velocity": 90},
                                 {"pitch": 69, "start": 6, "duration": 2.0, "velocity": 100},
                                 {"pitch": 71, "start": 8, "duration": 1.0, "velocity": 100},
                                 {"pitch": 72, "start": 9, "duration": 0.5, "velocity": 85},
                                 {"pitch": 74, "start": 10, "duration": 2.0, "velocity": 105},
                                 {"pitch": 76, "start": 12, "duration": 1.5, "velocity": 110},
                                 {"pitch": 74, "start": 14, "duration": 2.0, "velocity": 95},
                             ]},
                        ],
                    },
                    {
                        "name": "Vocals",
                        "type": "audio",
                        "instrument": None,
                        "clips": [],
                    },
                ]
            },
            "changes": [
                {
                    "track": "Drums - 808 Kit",
                    "change_type": "modified",
                    "description": "Added Beat Pattern B clip (bars 5-8) with hi-hat variation and ghost notes",
                    "before": {"clip_count": 1},
                    "after": {"clip_count": 2}
                },
                {
                    "track": "Melody - Lead Synth",
                    "change_type": "modified",
                    "description": "Added Melody Hook clip with 11-note melodic phrase",
                    "before": {"clip_count": 0, "instrument": "Wavetable"},
                    "after": {"clip_count": 1, "instrument": "Wavetable"}
                },
            ]
        }
    },
    {
        "seed": "bass-rework",
        "message": "Reworked bass line — new sub pattern with slides, swapped Operator for Analog",
        "author_name": "Nathan Hall",
        "author_email": "nathan@soundhaus.dev",
        "hours_ago": 36,
        "files_added": [],
        "files_modified": ["MyBeat.als"],
        "files_removed": [],
        "diff_data": {
            "diff_type": "structural",
            "changes": [
                {
                    "track": "Bass - Sub",
                    "change_type": "modified",
                    "description": "Replaced bass line with new sliding pattern, changed synth from Operator to Analog",
                    "before": {"instrument": "Operator", "clip_count": 1, "clip_name": "Bass Line v1"},
                    "after": {"instrument": "Analog", "clip_count": 2, "clip_name": "Bass Slide v2"}
                },
            ]
        }
    },
    {
        "seed": "add-vocal-chops",
        "message": "feat: added vocal chop track with pitched samples and FX chain",
        "author_name": "DJ Collab",
        "author_email": "collab@soundhaus.dev",
        "hours_ago": 24,
        "files_added": ["Samples/vocal_chop_01.wav", "Samples/vocal_chop_02.wav", "Samples/vocal_chop_03.wav"],
        "files_modified": ["MyBeat.als"],
        "files_removed": [],
        "diff_data": {
            "diff_type": "combined",
            "project": {
                "Tracks": [
                    {
                        "name": "Drums - 808 Kit",
                        "type": "midi",
                        "instrument": "Drum Rack",
                        "clips": [
                            {"name": "Beat Pattern A", "start_beat": 0, "end_beat": 16, "color": "#FF6B35"},
                            {"name": "Beat Pattern B", "start_beat": 16, "end_beat": 32, "color": "#FF6B35"},
                        ],
                    },
                    {
                        "name": "Bass - Sub",
                        "type": "midi",
                        "instrument": "Analog",
                        "clips": [
                            {"name": "Bass Slide v2", "start_beat": 0, "end_beat": 16, "color": "#4ECDC4"},
                            {"name": "Bass Slide v2 (copy)", "start_beat": 16, "end_beat": 32, "color": "#4ECDC4"},
                        ],
                    },
                    {
                        "name": "Melody - Lead Synth",
                        "type": "midi",
                        "instrument": "Wavetable",
                        "clips": [
                            {"name": "Melody Hook", "start_beat": 0, "end_beat": 16, "color": "#FFE66D"},
                        ],
                    },
                    {
                        "name": "Vocal Chops",
                        "type": "audio",
                        "instrument": "Simpler",
                        "clips": [
                            {"name": "Chop Pattern 1", "start_beat": 0, "end_beat": 8, "color": "#C44DFF"},
                            {"name": "Chop Pattern 2", "start_beat": 8, "end_beat": 16, "color": "#C44DFF"},
                            {"name": "Chop Fill", "start_beat": 28, "end_beat": 32, "color": "#C44DFF"},
                        ],
                    },
                    {
                        "name": "Vocals",
                        "type": "audio",
                        "instrument": None,
                        "clips": [],
                    },
                ]
            },
            "changes": [
                {
                    "track": "Vocal Chops",
                    "change_type": "added",
                    "description": "New audio track with pitched vocal samples through Simpler, auto-filter and reverb FX chain",
                    "before": None,
                    "after": {"instrument": "Simpler", "clip_count": 3}
                },
            ]
        }
    },
    {
        "seed": "mixdown-prep",
        "message": "Mix prep — EQ on drums, sidechain compression on bass, master limiter added",
        "author_name": "Nathan Hall",
        "author_email": "nathan@soundhaus.dev",
        "hours_ago": 12,
        "files_added": [],
        "files_modified": ["MyBeat.als"],
        "files_removed": ["Samples/hihat_closed.wav"],
        "diff_data": {
            "diff_type": "structural",
            "changes": [
                {
                    "track": "Drums - 808 Kit",
                    "change_type": "modified",
                    "description": "Added EQ Eight (high-pass at 30Hz, cut at 8kHz) and Glue Compressor to drum bus",
                    "before": {"device_count": 1},
                    "after": {"device_count": 3}
                },
                {
                    "track": "Bass - Sub",
                    "change_type": "modified",
                    "description": "Added sidechain compressor keyed to kick drum, tightened low end with Utility",
                    "before": {"device_count": 1},
                    "after": {"device_count": 3}
                },
                {
                    "track": "Melody - Lead Synth",
                    "change_type": "modified",
                    "description": "Added Ping Pong Delay (1/8 note) and Reverb (Hall, 2.5s decay)",
                    "before": {"device_count": 1},
                    "after": {"device_count": 3}
                },
            ]
        }
    },
    {
        "seed": "final-arrangement",
        "message": "Final arrangement — intro, verse, chorus, bridge, outro sections with automation",
        "author_name": "Nathan Hall",
        "author_email": "nathan@soundhaus.dev",
        "hours_ago": 4,
        "files_added": ["Renders/MyBeat_v1_mixdown.wav"],
        "files_modified": ["MyBeat.als"],
        "files_removed": [],
        "diff_data": {
            "diff_type": "combined",
            "project": {
                "Tracks": [
                    {
                        "name": "Drums - 808 Kit",
                        "type": "midi",
                        "instrument": "Drum Rack",
                        "clips": [
                            {"name": "Intro Fill", "start_beat": 0, "end_beat": 8, "color": "#FF6B35"},
                            {"name": "Beat Pattern A", "start_beat": 8, "end_beat": 24, "color": "#FF6B35",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 4, "duration": 0.5, "velocity": 120},
                                 {"pitch": 36, "start": 8, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 12, "duration": 0.5, "velocity": 115},
                                 {"pitch": 38, "start": 4, "duration": 0.25, "velocity": 100},
                                 {"pitch": 38, "start": 12, "duration": 0.25, "velocity": 95},
                                 {"pitch": 42, "start": 0, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 2, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 4, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 6, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 8, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 10, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 12, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 14, "duration": 0.25, "velocity": 75},
                             ]},
                            {"name": "Beat Pattern B", "start_beat": 24, "end_beat": 40, "color": "#FF6B35",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 2, "duration": 0.5, "velocity": 90},
                                 {"pitch": 36, "start": 4, "duration": 0.5, "velocity": 120},
                                 {"pitch": 36, "start": 8, "duration": 0.5, "velocity": 127},
                                 {"pitch": 36, "start": 12, "duration": 0.5, "velocity": 115},
                                 {"pitch": 38, "start": 4, "duration": 0.25, "velocity": 110},
                                 {"pitch": 38, "start": 12, "duration": 0.25, "velocity": 105},
                                 {"pitch": 42, "start": 0, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 2, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 4, "duration": 0.25, "velocity": 80},
                                 {"pitch": 46, "start": 6, "duration": 0.5, "velocity": 90},
                                 {"pitch": 42, "start": 8, "duration": 0.25, "velocity": 80},
                                 {"pitch": 42, "start": 10, "duration": 0.25, "velocity": 75},
                                 {"pitch": 42, "start": 12, "duration": 0.25, "velocity": 80},
                                 {"pitch": 46, "start": 14, "duration": 0.5, "velocity": 85},
                             ]},
                            {"name": "Chorus Fill", "start_beat": 40, "end_beat": 48, "color": "#FF6B35"},
                            {"name": "Beat Pattern A (reprise)", "start_beat": 48, "end_beat": 60, "color": "#FF6B35"},
                            {"name": "Outro", "start_beat": 60, "end_beat": 64, "color": "#FF6B35"},
                        ],
                    },
                    {
                        "name": "Bass - Sub",
                        "type": "midi",
                        "instrument": "Analog",
                        "clips": [
                            {"name": "Bass Slide v2", "start_beat": 8, "end_beat": 24, "color": "#4ECDC4",
                             "notes": [
                                 {"pitch": 36, "start": 0, "duration": 3.0, "velocity": 110},
                                 {"pitch": 36, "start": 3, "duration": 0.5, "velocity": 70},
                                 {"pitch": 34, "start": 4, "duration": 3.0, "velocity": 105},
                                 {"pitch": 34, "start": 7, "duration": 0.5, "velocity": 65},
                                 {"pitch": 31, "start": 8, "duration": 3.5, "velocity": 110},
                                 {"pitch": 33, "start": 12, "duration": 3.5, "velocity": 100},
                             ]},
                            {"name": "Bass Slide v2 (copy)", "start_beat": 24, "end_beat": 40, "color": "#4ECDC4"},
                            {"name": "Bass Bridge", "start_beat": 40, "end_beat": 48, "color": "#4ECDC4"},
                            {"name": "Bass Slide v2 (reprise)", "start_beat": 48, "end_beat": 60, "color": "#4ECDC4"},
                        ],
                    },
                    {
                        "name": "Melody - Lead Synth",
                        "type": "midi",
                        "instrument": "Wavetable",
                        "clips": [
                            {"name": "Melody Hook", "start_beat": 8, "end_beat": 24, "color": "#FFE66D",
                             "notes": [
                                 {"pitch": 72, "start": 0, "duration": 1.0, "velocity": 100},
                                 {"pitch": 74, "start": 1, "duration": 0.5, "velocity": 90},
                                 {"pitch": 76, "start": 2, "duration": 2.0, "velocity": 105},
                                 {"pitch": 74, "start": 4, "duration": 1.0, "velocity": 95},
                                 {"pitch": 72, "start": 5, "duration": 0.5, "velocity": 90},
                                 {"pitch": 69, "start": 6, "duration": 2.0, "velocity": 100},
                                 {"pitch": 71, "start": 8, "duration": 1.0, "velocity": 100},
                                 {"pitch": 72, "start": 9, "duration": 0.5, "velocity": 85},
                                 {"pitch": 74, "start": 10, "duration": 2.0, "velocity": 105},
                                 {"pitch": 76, "start": 12, "duration": 1.5, "velocity": 110},
                                 {"pitch": 74, "start": 14, "duration": 2.0, "velocity": 95},
                             ]},
                            {"name": "Melody Variation", "start_beat": 24, "end_beat": 40, "color": "#FFE66D",
                             "notes": [
                                 {"pitch": 76, "start": 0, "duration": 1.5, "velocity": 105},
                                 {"pitch": 79, "start": 2, "duration": 1.0, "velocity": 100},
                                 {"pitch": 81, "start": 3, "duration": 2.0, "velocity": 110},
                                 {"pitch": 79, "start": 5, "duration": 1.0, "velocity": 95},
                                 {"pitch": 76, "start": 6, "duration": 2.0, "velocity": 100},
                                 {"pitch": 74, "start": 8, "duration": 1.0, "velocity": 95},
                                 {"pitch": 72, "start": 9, "duration": 0.5, "velocity": 85},
                                 {"pitch": 74, "start": 10, "duration": 2.0, "velocity": 100},
                                 {"pitch": 76, "start": 12, "duration": 2.0, "velocity": 110},
                                 {"pitch": 74, "start": 14, "duration": 2.0, "velocity": 95},
                             ]},
                            {"name": "Melody Hook (reprise)", "start_beat": 48, "end_beat": 60, "color": "#FFE66D"},
                        ],
                    },
                    {
                        "name": "Vocal Chops",
                        "type": "audio",
                        "instrument": "Simpler",
                        "clips": [
                            {"name": "Chop Pattern 1", "start_beat": 8, "end_beat": 16, "color": "#C44DFF"},
                            {"name": "Chop Pattern 2", "start_beat": 16, "end_beat": 24, "color": "#C44DFF"},
                            {"name": "Chop Pattern 1 (repeat)", "start_beat": 24, "end_beat": 32, "color": "#C44DFF"},
                            {"name": "Chop Fill", "start_beat": 38, "end_beat": 40, "color": "#C44DFF"},
                            {"name": "Chop Pattern 2 (repeat)", "start_beat": 48, "end_beat": 56, "color": "#C44DFF"},
                        ],
                    },
                    {
                        "name": "FX - Risers",
                        "type": "audio",
                        "instrument": None,
                        "clips": [
                            {"name": "Riser 8bar", "start_beat": 0, "end_beat": 8, "color": "#95E1D3"},
                            {"name": "Riser 4bar", "start_beat": 36, "end_beat": 40, "color": "#95E1D3"},
                            {"name": "Downlifter", "start_beat": 60, "end_beat": 64, "color": "#95E1D3"},
                        ],
                    },
                    {
                        "name": "Vocals",
                        "type": "audio",
                        "instrument": None,
                        "clips": [],
                    },
                ]
            },
            "changes": [
                {
                    "track": "FX - Risers",
                    "change_type": "added",
                    "description": "New FX track with riser, downlifter, and transition samples for arrangement sections",
                    "before": None,
                    "after": {"clip_count": 3}
                },
                {
                    "track": "Drums - 808 Kit",
                    "change_type": "modified",
                    "description": "Extended from 2 clips to 6 clips for full song arrangement (intro, verse, chorus, bridge, outro)",
                    "before": {"clip_count": 2},
                    "after": {"clip_count": 6}
                },
                {
                    "track": "Melody - Lead Synth",
                    "change_type": "modified",
                    "description": "Added Melody Variation clip and reprise for chorus/bridge sections",
                    "before": {"clip_count": 1},
                    "after": {"clip_count": 3}
                },
                {
                    "track": "Bass - Sub",
                    "change_type": "modified",
                    "description": "Arranged bass across full song with bridge section and slide variations",
                    "before": {"clip_count": 2},
                    "after": {"clip_count": 4}
                },
                {
                    "track": "Vocal Chops",
                    "change_type": "modified",
                    "description": "Arranged vocal chops across verse/chorus sections",
                    "before": {"clip_count": 3},
                    "after": {"clip_count": 5}
                },
            ]
        }
    },
]


def seed():
    db = SessionLocal()
    try:
        # Pick the first repo with push events, or the first repo
        repo = db.query(RepoData).first()
        if not repo:
            print("ERROR: No repos in repo_data. Create a repo first.")
            return

        repo_id = repo.gitea_id
        owner_id = repo.owner_id
        print(f"Seeding commits for repo: {repo_id}")

        # Check if we already seeded
        existing = db.query(CommitDetail).filter(CommitDetail.repo_id == repo_id).count()
        if existing > 0:
            print(f"  Already has {existing} commits — skipping (delete first to re-seed)")
            return

        # Find or create a PushEvent to attach commits to
        push_event = db.query(PushEvent).filter(PushEvent.repo_id == repo_id).first()
        if not push_event:
            push_event = PushEvent(
                repo_id=repo_id,
                pusher_id=owner_id,
                pusher_username=owner_id.split("-")[0] if "-" in owner_id else owner_id,
                ref="refs/heads/main",
                before_sha="0" * 40,
                after_sha=make_sha("final-arrangement"),
                commit_count=len(FAKE_COMMITS),
            )
            db.add(push_event)
            db.flush()
            print(f"  Created PushEvent id={push_event.id}")

        now = datetime.now(timezone.utc)

        for i, commit_data in enumerate(FAKE_COMMITS):
            sha = make_sha(commit_data["seed"])
            ts = now - timedelta(hours=commit_data["hours_ago"])

            cd = CommitDetail(
                id=str(uuid.uuid4()),
                push_event_id=push_event.id,
                repo_id=repo_id,
                sha=sha,
                short_sha=sha[:8],
                message=commit_data["message"],
                author_name=commit_data["author_name"],
                author_email=commit_data["author_email"],
                timestamp=ts,
                files_added=commit_data["files_added"],
                files_modified=commit_data["files_modified"],
                files_removed=commit_data["files_removed"],
            )
            db.add(cd)
            db.flush()
            print(f"  [{i+1}/{len(FAKE_COMMITS)}] CommitDetail sha={sha[:8]} — {commit_data['message'][:60]}")

            # Create AlsDiff if diff_data exists
            if commit_data.get("diff_data"):
                als_diff = AlsDiff(
                    id=str(uuid.uuid4()),
                    repo_id=repo_id,
                    commit_sha=sha,
                    diff_type=commit_data["diff_data"]["diff_type"],
                    diff_data=commit_data["diff_data"],
                )
                db.add(als_diff)
                print(f"         + AlsDiff ({commit_data['diff_data']['diff_type']}) attached")

        # Update repo stats
        repo.total_commits = (repo.total_commits or 0) + len(FAKE_COMMITS)
        repo.last_push_at = now
        repo.last_activity_at = now

        db.commit()
        print(f"\nDone! Seeded {len(FAKE_COMMITS)} commits + diffs for {repo_id}")

    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
