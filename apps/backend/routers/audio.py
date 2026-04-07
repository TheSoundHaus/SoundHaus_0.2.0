"""
Audio Router — Waveform peak data endpoint.

Provides waveform visualization data for audio files in repositories.
The web frontend's WaveformTrack component fetches peak data from here
to render audio waveforms in the diff timeline.

Endpoints:
    GET /repos/{owner}/{repo}/audio/waveform
        Query params: file_path, ref (commit SHA), resolution (default 1024)
        Returns: WaveformPeaksResponse { peaks, sampleRate, duration }

Architecture:
    1. Receive request with repo owner, name, file path, and commit ref
    2. Fetch the raw audio file from Gitea (via RepoService raw endpoint)
    3. Decode the audio using pydub
    4. Downsample to `resolution` peak values
    5. Return normalized peaks in [-1.0, 1.0] range
"""

import io
import requests

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from logging_config import get_logger
from config import settings
from dependencies import verify_token
from models.diff_schemas import WaveformPeaksResponse

logger = get_logger(__name__)

router = APIRouter(
    prefix="/repos",
    tags=["audio"],
)


def _fetch_raw_file(owner: str, repo: str, file_path: str, ref: str) -> bytes:
    """
    Fetch a raw file from Gitea, following the same pattern as
    RepoService._fetch_lfs_content but returning raw bytes.
    """
    raw_url = f"{settings.gitea_url}/api/v1/repos/{owner}/{repo}/raw/{file_path}"
    headers = {"Authorization": f"token {settings.gitea_admin_token}"}
    params = {"ref": ref} if ref else {}

    resp = requests.get(raw_url, headers=headers, params=params, timeout=60)

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Audio file not found: {file_path}")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gitea returned {resp.status_code}")

    return resp.content


@router.get(
    "/{owner}/{repo}/audio/waveform",
    response_model=WaveformPeaksResponse,
    summary="Get waveform peak data for an audio file",
    description=(
        "Returns downsampled waveform peak data for rendering audio "
        "visualizations in the diff timeline. The peaks are normalized "
        "to the [-1.0, 1.0] range."
    ),
)
async def get_waveform_peaks(
    owner: str,
    repo: str,
    file_path: str = Query(
        ...,
        description="Path to the audio file within the repository",
    ),
    ref: str = Query(
        "main",
        description="Git ref (branch, tag, or commit SHA) to read the file from",
    ),
    resolution: int = Query(
        1024,
        ge=64,
        le=8192,
        description="Number of peak samples to return (higher = more detail)",
    ),
    token_data: dict = Depends(verify_token),
) -> WaveformPeaksResponse:
    """
    Fetch an audio file from the repo and return its waveform peaks.
    """
    logger.info(
        "waveform_request",
        owner=owner,
        repo=repo,
        file_path=file_path,
        ref=ref,
        resolution=resolution,
    )

    # ── Validate file format ─────────────────────────────────────────
    SUPPORTED_FORMATS = {".wav", ".mp3", ".flac", ".aif", ".aiff", ".ogg"}
    file_ext = "." + file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    if file_ext not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {file_ext}. Supported: {', '.join(SUPPORTED_FORMATS)}",
        )

    # ── Fetch raw audio from Gitea ───────────────────────────────────
    try:
        raw_content = _fetch_raw_file(owner, repo, file_path, ref)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("waveform_fetch_error", error=str(e), owner=owner, repo=repo)
        raise HTTPException(status_code=502, detail=f"Failed to fetch audio file: {e}")

    # ── Decode audio and compute peaks ───────────────────────────────
    try:
        import numpy as np
        from pydub import AudioSegment

        audio = AudioSegment.from_file(io.BytesIO(raw_content))
        sample_rate = audio.frame_rate
        duration_seconds = audio.duration_seconds

        # Mix to mono
        audio = audio.set_channels(1)

        # Get raw samples as numpy float32 array, normalized to [-1, 1]
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
        max_val = float(np.iinfo(audio.array_type).max)
        if max_val > 0:
            samples /= max_val

        # Downsample to `resolution` peak values
        chunk_size = max(1, len(samples) // resolution)
        peaks: list[float] = []
        for i in range(0, len(samples), chunk_size):
            chunk = samples[i : i + chunk_size]
            # Use max absolute value as the peak for this chunk
            peaks.append(float(np.max(np.abs(chunk))))

        # Trim to exact resolution
        peaks = peaks[:resolution]

        logger.info(
            "waveform_computed",
            file_path=file_path,
            sample_rate=sample_rate,
            duration=round(duration_seconds, 2),
            num_peaks=len(peaks),
        )

        return WaveformPeaksResponse(
            peaks=peaks,
            sample_rate=sample_rate,
            duration=duration_seconds,
        )

    except Exception as e:
        logger.error("waveform_decode_error", error=str(e), file_path=file_path)
        raise HTTPException(
            status_code=422,
            detail=f"Failed to decode audio file: {e}",
        )
