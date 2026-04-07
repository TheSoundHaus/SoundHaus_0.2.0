"""
Profile service — handles user profile CRUD and avatar uploads to Supabase Storage.
"""

import re
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from supabase import create_client, Client

from config import settings
from models.profile_models import Profile
from logging_config import get_logger

logger = get_logger(__name__)

# Avatar constraints
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
AVATARS_BUCKET = "avatars"

# Username constraints
USERNAME_MIN = 2
USERNAME_MAX = 40
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


class ProfileService:
    """Manages user profiles and avatar storage."""

    def __init__(self):
        storage_key = settings.supabase_service_key or settings.supabase_pub_key
        self.supabase: Client = create_client(settings.supabase_url, storage_key)

    # ── Profile CRUD ─────────────────────────────────────────────────────

    def get_profile(self, user_id: str, db: Session) -> Optional[Dict[str, Any]]:
        """Fetch a user profile by Supabase user ID."""
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        if not profile:
            return None
        return self._profile_to_dict(profile)

    def get_profile_by_username(self, username: str, db: Session) -> Optional[Dict[str, Any]]:
        """Fetch a user profile by username (falls back to display_name)."""
        profile = db.query(Profile).filter(Profile.username == username).first()
        if not profile:
            profile = db.query(Profile).filter(Profile.display_name == username).first()
        if not profile:
            return None
        return self._profile_to_dict(profile)

    def create_profile(
        self,
        user_id: str,
        username: str,
        email: str,
        display_name: Optional[str] = None,
        db: Session = None,
    ) -> Dict[str, Any]:
        """Create a new profile row at signup time."""
        self._validate_username(username)

        # Check uniqueness
        existing = db.query(Profile).filter(Profile.username == username).first()
        if existing:
            return {"success": False, "message": f"Username '{username}' is already taken"}

        profile = Profile(
            id=user_id,
            email=email,
            username=username,
            display_name=display_name or username,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        logger.info("profile_created", user_id=user_id, username=username)
        return {"success": True, "profile": self._profile_to_dict(profile)}

    def update_profile(
        self,
        user_id: str,
        updates: Dict[str, Any],
        db: Session,
    ) -> Dict[str, Any]:
        """Update display_name and/or bio for an existing profile."""
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        if not profile:
            return {"success": False, "message": "Profile not found"}

        if "display_name" in updates and updates["display_name"] is not None:
            profile.display_name = updates["display_name"].strip()[:100]
        if "bio" in updates and updates["bio"] is not None:
            profile.bio = updates["bio"].strip()[:500]
        if "is_public" in updates and updates["is_public"] is not None:
            profile.is_public = bool(updates["is_public"])
        if "social_instagram" in updates:
            profile.social_instagram = (updates["social_instagram"] or "")[:255] or None
        if "social_youtube" in updates:
            profile.social_youtube = (updates["social_youtube"] or "")[:255] or None
        if "social_spotify" in updates:
            profile.social_spotify = (updates["social_spotify"] or "")[:255] or None
        if "social_twitter" in updates:
            profile.social_twitter = (updates["social_twitter"] or "")[:255] or None
        if "social_website" in updates:
            profile.social_website = (updates["social_website"] or "")[:255] or None

        db.commit()
        db.refresh(profile)
        logger.info("profile_updated", user_id=user_id)
        return {"success": True, "profile": self._profile_to_dict(profile)}

    # ── Avatar Upload / Delete ───────────────────────────────────────────

    def upload_avatar(
        self,
        user_id: str,
        file_bytes: bytes,
        content_type: str,
        filename: str,
        db: Session,
    ) -> Dict[str, Any]:
        """
        Upload an avatar image to the Supabase 'avatars' bucket.
        Storage path: avatars/{user_id}/avatar.{ext}
        Old avatar is overwritten via upsert.
        """
        # Validate content type
        if content_type not in ALLOWED_IMAGE_TYPES:
            return {
                "success": False,
                "message": f"Invalid image type '{content_type}'. Allowed: JPEG, PNG, WebP, GIF.",
            }

        # Validate file size
        if len(file_bytes) > MAX_AVATAR_SIZE:
            return {
                "success": False,
                "message": f"Image too large. Max size: {MAX_AVATAR_SIZE // (1024*1024)} MB.",
            }

        if not file_bytes:
            return {"success": False, "message": "Empty file."}

        # Determine extension from content-type
        ext_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        }
        ext = ext_map.get(content_type, "jpg")
        storage_path = f"{user_id}/avatar.{ext}"

        try:
            # Upload to Supabase Storage (upsert replaces existing)
            self.supabase.storage.from_(AVATARS_BUCKET).upload(
                path=storage_path,
                file=file_bytes,
                file_options={"content-type": content_type, "upsert": "true"},
            )

            # Get public URL
            public_url = self.supabase.storage.from_(AVATARS_BUCKET).get_public_url(storage_path)

            # Update profile row
            profile = db.query(Profile).filter(Profile.id == user_id).first()
            if profile:
                profile.avatar_url = public_url
                db.commit()
                db.refresh(profile)

            logger.info("avatar_uploaded", user_id=user_id, path=storage_path)
            return {"success": True, "avatar_url": public_url}

        except Exception as e:
            logger.error("avatar_upload_failed", user_id=user_id, error=str(e))
            return {"success": False, "message": f"Upload failed: {e}"}

    def delete_avatar(self, user_id: str, db: Session) -> Dict[str, Any]:
        """Remove the user's avatar from storage and clear the URL on their profile."""
        try:
            # List files in the user's avatar folder
            files = self.supabase.storage.from_(AVATARS_BUCKET).list(user_id)
            if files:
                paths = [f"{user_id}/{f['name']}" for f in files]
                self.supabase.storage.from_(AVATARS_BUCKET).remove(paths)

            # Clear profile URL
            profile = db.query(Profile).filter(Profile.id == user_id).first()
            if profile:
                profile.avatar_url = None
                db.commit()

            logger.info("avatar_deleted", user_id=user_id)
            return {"success": True}

        except Exception as e:
            logger.error("avatar_delete_failed", user_id=user_id, error=str(e))
            return {"success": False, "message": f"Delete failed: {e}"}

    # ── Helpers ──────────────────────────────────────────────────────────

    def _validate_username(self, username: str) -> None:
        """Raise ValueError if username is invalid."""
        if not username or len(username) < USERNAME_MIN:
            raise ValueError(f"Username must be at least {USERNAME_MIN} characters")
        if len(username) > USERNAME_MAX:
            raise ValueError(f"Username must be at most {USERNAME_MAX} characters")
        if not USERNAME_PATTERN.match(username):
            raise ValueError("Username can only contain letters, numbers, hyphens, and underscores")

    @staticmethod
    def _profile_to_dict(profile: Profile) -> Dict[str, Any]:
        return {
            "id": profile.id,
            "email": profile.email,
            "username": profile.username,
            "display_name": profile.display_name,
            "avatar_url": profile.avatar_url,
            "bio": profile.bio,
            "is_public": profile.is_public if profile.is_public is not None else False,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
            "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
            "social_instagram": profile.social_instagram,
            "social_youtube": profile.social_youtube,
            "social_spotify": profile.social_spotify,
            "social_twitter": profile.social_twitter,
            "social_website": profile.social_website,
        }


# Singleton
profile_service = ProfileService()
