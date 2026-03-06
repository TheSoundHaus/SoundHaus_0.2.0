"""
Demucs Service – stem separation orchestration.

Downloads source audio, runs Demucs, uploads stems to Supabase Storage,
and updates the database with StemFile records.
"""
import os
import hashlib
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session
from supabase import create_client, Client

from config import settings
from logging_config import get_logger
from models.stem_models import SnippetVersion, StemFile, StemJobStatus, StemType

logger = get_logger("soundhaus.demucs")


class DemucsService:
    """Handles stem separation via Demucs CLI."""

    # Supabase bucket for stems (separate from snippets)
    STEMS_BUCKET = "stems"

    def __init__(self, db: Session):
        self.db = db
        self.model_name = os.getenv("DEMUCS_MODEL", "htdemucs")
        self.max_duration = int(os.getenv("MAX_AUDIO_DURATION", "600"))  # seconds

        # Supabase client for storage (service key bypasses RLS)
        storage_key = settings.supabase_service_key or settings.supabase_pub_key
        self.supabase: Client = create_client(settings.supabase_url, storage_key)

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def calculate_file_hash(file_path: Path) -> str:
        """Calculate SHA-256 hash of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256.update(chunk)
        return sha256.hexdigest()

    def check_duplicate(self, repo_gitea_id: str, source_hash: str) -> Optional[SnippetVersion]:
        """Return an existing succeeded version with the same hash, or None."""
        return (
            self.db.query(SnippetVersion)
            .filter(
                SnippetVersion.repo_gitea_id == repo_gitea_id,
                SnippetVersion.source_hash == source_hash,
                SnippetVersion.status == StemJobStatus.SUCCEEDED,
            )
            .first()
        )

    # ── Download ─────────────────────────────────────────────────────────

    async def download_source_audio(self, url: str) -> Path:
        """Download source snippet to a temp file and return its path."""
        tmp = Path(tempfile.gettempdir()) / f"source_{os.urandom(8).hex()}.wav"
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            tmp.write_bytes(resp.content)
        logger.info("source_downloaded", url=url, size=tmp.stat().st_size)
        return tmp

    # ── Demucs CLI ───────────────────────────────────────────────────────

    def run_demucs(self, input_file: Path, output_dir: Path) -> Path:
        """
        Run Demucs 4-stem separation.
        Uses --mp3 output (via lameenc) to avoid torchaudio/torchcodec issues.
        Returns the directory containing vocals.mp3, drums.mp3, bass.mp3, other.mp3.
        """
        cmd = [
            "python", "-m", "demucs",
            "-n", self.model_name,
            "--mp3",          # Use lameenc for output — avoids torchaudio torchcodec dep
            "-o", str(output_dir),
            str(input_file),
        ]

        logger.info("demucs_start", model=self.model_name, input=str(input_file))

        try:
            result = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                text=True,
                timeout=self.max_duration * 2,
            )
            logger.debug("demucs_stdout", stdout=result.stdout[-500:] if result.stdout else "")
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Demucs failed: {exc.stderr}") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Demucs timeout ({self.max_duration * 2}s)") from exc

        # Demucs outputs to: output_dir/<model>/<input_stem>/
        stem_dir = output_dir / self.model_name / input_file.stem
        if not stem_dir.is_dir():
            raise RuntimeError(f"Expected stem directory not found: {stem_dir}")
        logger.info("demucs_done", stem_dir=str(stem_dir))
        return stem_dir

    # ── Upload ───────────────────────────────────────────────────────────

    async def upload_stems_to_storage(
        self,
        owner: str,
        repo: str,
        version_id: int,
        stem_dir: Path,
    ) -> List[Tuple[StemType, str, str, int]]:
        """
        Upload stem WAVs to Supabase Storage.
        Returns list of (stem_type, storage_path, public_url, file_size_bytes).
        """
        results: List[Tuple[StemType, str, str, int]] = []

        for stem_type in StemType:
            stem_file = stem_dir / f"{stem_type.value}.mp3"
            if not stem_file.exists():
                logger.warning("stem_missing", stem=stem_type.value, dir=str(stem_dir))
                continue

            storage_path = (
                f"{owner}/{repo}/versions/{version_id}/stems/{stem_type.value}.mp3"
            )
            content = stem_file.read_bytes()
            file_size = len(content)

            self.supabase.storage.from_(self.STEMS_BUCKET).upload(
                path=storage_path,
                file=content,
                file_options={"content-type": "audio/mpeg", "upsert": "true"},
            )
            public_url = self.supabase.storage.from_(self.STEMS_BUCKET).get_public_url(
                storage_path
            )

            results.append((stem_type, storage_path, public_url, file_size))
            logger.info("stem_uploaded", stem=stem_type.value, size=file_size)

        return results

    # ── Main Job Processor ───────────────────────────────────────────────

    async def process_stems_job(
        self,
        snippet_version_id: int,
        repo_owner: str,
        repo_name: str,
    ):
        """
        End-to-end stem generation. Called by the worker loop.
        1. Download source audio
        2. Run Demucs
        3. Upload stems
        4. Create StemFile rows
        """
        version = self.db.query(SnippetVersion).get(snippet_version_id)
        if not version:
            raise ValueError(f"SnippetVersion {snippet_version_id} not found")

        tmp_dir = Path(tempfile.mkdtemp(prefix="demucs_"))

        try:
            # Mark processing
            version.status = StemJobStatus.PROCESSING
            self.db.commit()

            # 1. Download
            source_file = await self.download_source_audio(version.source_upload_url)

            # 2. Separate
            stem_dir = self.run_demucs(source_file, tmp_dir)

            # 3. Upload
            uploaded = await self.upload_stems_to_storage(
                repo_owner, repo_name, snippet_version_id, stem_dir
            )

            # 4. Persist StemFile records
            for stem_type, storage_path, public_url, file_size in uploaded:
                sf = StemFile(
                    snippet_version_id=snippet_version_id,
                    stem_type=stem_type,
                    storage_path=storage_path,
                    public_url=public_url,
                    file_size_bytes=file_size,
                    format="mp3",
                )
                self.db.add(sf)

            # Un-confirm any previous versions for this repo
            self.db.query(SnippetVersion).filter(
                SnippetVersion.repo_gitea_id == version.repo_gitea_id,
                SnippetVersion.id != version.id,
            ).update({"is_confirmed": False})

            version.status = StemJobStatus.SUCCEEDED
            version.is_confirmed = True
            self.db.commit()
            logger.info("job_succeeded", version_id=snippet_version_id)

        except Exception as exc:
            version.status = StemJobStatus.FAILED
            version.error_message = str(exc)[:1000]
            self.db.commit()
            logger.error("job_failed", version_id=snippet_version_id, error=str(exc))
            raise

        finally:
            # Clean up temp files
            shutil.rmtree(tmp_dir, ignore_errors=True)
            try:
                source_file.unlink(missing_ok=True)  # type: ignore[possibly-undefined]
            except (NameError, OSError) as cleanup_err:
                logger.debug("source_file cleanup skipped", reason=str(cleanup_err))