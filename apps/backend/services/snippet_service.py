"""
Snippet Service - Audio snippet management with Supabase Storage.

Each repository can have ONE audio snippet as a preview.
This service handles:
- Validating uploaded files are actually audio
- Extracting metadata (duration, sample rate, etc.) from uploaded audio files
- Cloud storage via Supabase Storage bucket 'snippets'
"""
from pathlib import Path
from typing import Optional, Dict, Any
import mimetypes
import io
from logging_config import get_logger
from supabase import create_client, Client
from config import settings

logger = get_logger(__name__)

# Allowed audio MIME types
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg",       # .mp3
    "audio/mp3",        # .mp3 (alt)
    "audio/wav",        # .wav
    "audio/x-wav",      # .wav (alt)
    "audio/flac",       # .flac
    "audio/aiff",       # .aiff
    "audio/x-aiff",     # .aiff (alt)
    "audio/ogg",        # .ogg
    "audio/mp4",        # .m4a
}

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".ogg", ".m4a"}

# Try to import mutagen for metadata extraction
try:
    from mutagen import File as MutagenFile
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False
    logger.warning("mutagen_not_available",
                   message="Install mutagen for audio metadata extraction")


class SnippetService:
    """
    Service for managing audio snippets (repository previews).

    Storage: Supabase Storage bucket 'snippets'
    Path structure: {owner}/{repo}/snippet.{ext}
    """

    def __init__(self):
        """Initialize Supabase client using service key (bypasses RLS for backend ops)."""
        # Use service key for storage operations - our API endpoints
        # handle auth/ownership checks, so the backend is trusted
        storage_key = settings.supabase_service_key or settings.supabase_pub_key
        self.supabase: Client = create_client(
            settings.supabase_url,
            storage_key
        )
        self.bucket_name = "snippets"
        logger.debug("snippet_service_init", bucket=self.bucket_name,
                     using_service_key=bool(settings.supabase_service_key))

    def _validate_audio_file(self, filename: str, content: bytes, content_type: Optional[str] = None) -> str:
        """
        Validate that the uploaded file is actually an audio file.

        Checks:
        1. File extension is an allowed audio format
        2. Content-type header (if provided) is an audio type
        3. File has content (not empty)

        Args:
            filename: Original filename
            content: File bytes
            content_type: MIME type from upload header (optional)

        Returns:
            Validated MIME type string

        Raises:
            ValueError: If file is not a valid audio file
        """
        if not content or len(content) == 0:
            raise ValueError("File is empty")

        # Check file extension
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(
                f"File extension '{ext}' is not allowed. "
                f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            )

        # Check content-type if provided
        if content_type and content_type not in ALLOWED_AUDIO_TYPES:
            raise ValueError(
                f"Content type '{content_type}' is not an audio type. "
                f"Allowed: {', '.join(sorted(ALLOWED_AUDIO_TYPES))}"
            )

        # Determine MIME type from extension (most reliable)
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type or not mime_type.startswith("audio/"):
            # Fall back to content_type if extension detection fails
            if content_type and content_type.startswith("audio/"):
                mime_type = content_type
            else:
                raise ValueError(
                    f"Could not determine audio type for '{filename}'. "
                    f"Ensure the file has a valid audio extension."
                )

        logger.debug("audio_file_validated",
                     filename=filename,
                     mime_type=mime_type,
                     size=len(content))

        return mime_type

    async def save_snippet(
        self,
        owner: str,
        repo: str,
        filename: str,
        content: bytes,
        content_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate, upload audio snippet to Supabase Storage, and extract metadata.

        Args:
            owner: Repository owner ID
            repo: Repository name
            filename: Original filename
            content: Audio file bytes
            content_type: MIME type from upload header (optional)

        Returns:
            Dict with url, duration, file_size, format, sample_rate, channels

        Raises:
            ValueError: If file is not a valid audio file
            Exception: If upload to Supabase fails
        """
        # Step 1: Validate the file is actually audio
        mime_type = self._validate_audio_file(filename, content, content_type)

        # Step 2: Determine storage path
        ext = Path(filename).suffix.lower() or ".mp3"
        format_name = ext.lstrip(".")
        storage_path = f"{owner}/{repo}/snippet{ext}"

        logger.info("snippet_upload_start",
                     owner=owner,
                     repo=repo,
                     file_size=len(content),
                     mime_type=mime_type,
                     storage_path=storage_path)

        # Step 3: Upload to Supabase Storage (upsert replaces existing)
        result = self.supabase.storage.from_(self.bucket_name).upload(
            path=storage_path,
            file=content,
            file_options={
                "content-type": mime_type,
                "upsert": "true"
            }
        )

        logger.debug("supabase_upload_response", result=str(result))

        # Step 4: Get public CDN URL
        public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(storage_path)

        # Step 5: Extract audio metadata
        metadata = self._extract_metadata(content)

        logger.info("snippet_upload_success",
                     owner=owner,
                     repo=repo,
                     url=public_url,
                     duration=metadata.get("duration"),
                     file_size=len(content))

        return {
            "url": public_url,
            "duration": metadata.get("duration"),
            "file_size": len(content),
            "format": format_name,
            "sample_rate": metadata.get("sample_rate"),
            "channels": metadata.get("channels"),
        }

    async def delete_snippet(self, owner: str, repo: str) -> bool:
        """
        Delete snippet from Supabase Storage.

        Args:
            owner: Repository owner
            repo: Repository name

        Returns:
            True if deleted successfully
        """
        try:
            folder_path = f"{owner}/{repo}"

            # List files in the repo folder
            files = self.supabase.storage.from_(self.bucket_name).list(folder_path)

            if not files:
                logger.warning("snippet_delete_not_found", owner=owner, repo=repo)
                return False

            # Delete all snippet files in the folder
            paths_to_delete = [f"{folder_path}/{f['name']}" for f in files]
            self.supabase.storage.from_(self.bucket_name).remove(paths_to_delete)

            logger.info("snippet_deleted", owner=owner, repo=repo, paths=paths_to_delete)
            return True

        except Exception as e:
            logger.error("snippet_delete_failed",
                         owner=owner,
                         repo=repo,
                         error=str(e),
                         exc_info=True)
            return False

    async def get_snippet_url(self, owner: str, repo: str) -> Optional[str]:
        """
        Get public CDN URL for a snippet.

        Args:
            owner: Repository owner
            repo: Repository name

        Returns:
            Public URL or None if not found
        """
        try:
            folder_path = f"{owner}/{repo}"
            files = self.supabase.storage.from_(self.bucket_name).list(folder_path)

            if not files:
                return None

            file_path = f"{folder_path}/{files[0]['name']}"
            return self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)

        except Exception as e:
            logger.error("get_snippet_url_failed",
                         owner=owner,
                         repo=repo,
                         error=str(e))
            return None

    def _extract_metadata(self, content: bytes) -> Dict[str, Any]:
        """
        Extract audio metadata from file bytes using mutagen.

        Args:
            content: Audio file bytes

        Returns:
            Dict with duration, sample_rate, channels
        """
        if not HAS_MUTAGEN:
            logger.warning("metadata_extraction_skipped", reason="mutagen_not_installed")
            return {}

        try:
            audio = MutagenFile(io.BytesIO(content))

            if audio is None:
                logger.warning("metadata_extraction_failed", reason="unsupported_format")
                return {}

            metadata = {
                "duration": round(audio.info.length, 2) if hasattr(audio.info, 'length') else None,
                "sample_rate": getattr(audio.info, 'sample_rate', None),
                "channels": getattr(audio.info, 'channels', None),
            }

            logger.debug("metadata_extracted", metadata=metadata)
            return metadata

        except Exception as e:
            logger.error("metadata_extraction_error", error=str(e), exc_info=True)
            return {}


# Singleton instance
snippet_service = SnippetService()
