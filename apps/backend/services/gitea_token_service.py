"""
Service for managing Gitea user tokens stored in database.
"""
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from models.gitea_token_models import GiteaToken
from services.gitea_service import GiteaAdminService
from logging_config import get_logger
import uuid

logger = get_logger(__name__)


class GiteaTokenService:
    """Service for managing Gitea Personal Access Tokens."""

    @staticmethod
    async def get_user_token(user_id: str, db: Session) -> Optional[str]:
        """
        Get active Gitea token for a user.

        Args:
            user_id: Supabase user UUID
            db: Database session

        Returns:
            Gitea token string if found and active, None otherwise
        """
        try:
            token_record = db.query(GiteaToken).filter(
                GiteaToken.user_id == user_id,
                GiteaToken.is_revoked == False
            ).first()

            if not token_record:
                logger.debug("get_user_token_not_found", user_id=user_id)
                return None

            # Update last_used timestamp
            token_record.last_used = datetime.now(timezone.utc)
            token_record.usage_count = (token_record.usage_count or 0) + 1
            db.commit()

            logger.debug("get_user_token_found", user_id=user_id)
            return token_record.token_hash

        except Exception as e:
            logger.error("get_user_token_error", user_id=user_id, error=str(e))
            db.rollback()
            return None

    @staticmethod
    async def create_and_store_token(
        user_id: str,
        token_name: str,
        db: Session,
        created_via: str = "web",
        scopes: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Create a new Gitea token and store it in database.

        Args:
            user_id: Supabase user UUID
            token_name: Name for the token
            db: Database session
            created_via: Origin of token creation ('web' or 'desktop')
            scopes: Gitea permission scopes

        Returns:
            {"success": True, "token": str} or {"success": False, "message": str}
        """
        try:
            # Create token via GiteaAdminService
            gitea_service = GiteaAdminService()
            result = gitea_service.create_or_get_user_token(
                username=user_id,
                token_name=token_name,
                scopes=scopes
            )

            if not result.get("success"):
                logger.error("create_token_gitea_failed", user_id=user_id, error=result.get("message"))
                return result

            token_data = result["token"]
            token_sha1 = token_data["sha1"]

            # Store in database
            token_record = GiteaToken(
                id=str(uuid.uuid4()),
                user_id=user_id,
                token_hash=token_sha1,  # Stored in plaintext (needs to be retrievable)
                token_prefix=token_sha1[:16],
                token_name=token_name,
                scopes=",".join(scopes) if scopes else None,
                created_via=created_via,
                is_revoked=False,
                usage_count=0
            )

            db.add(token_record)
            db.commit()

            logger.info("token_created_and_stored", user_id=user_id, token_name=token_name)
            return {"success": True, "token": token_sha1}

        except Exception as e:
            logger.error("create_and_store_token_error", user_id=user_id, error=str(e), exc_info=True)
            db.rollback()
            return {"success": False, "message": f"Failed to create token: {str(e)}"}

    @staticmethod
    async def get_or_create_token(
        user_id: str,
        db: Session,
        created_via: str = "web"
    ) -> Optional[str]:
        """
        Get existing token or create new one if none exists.

        Args:
            user_id: Supabase user UUID
            db: Database session
            created_via: Origin of token creation ('web' or 'desktop')

        Returns:
            Gitea token string, or None if creation failed
        """
        # Try to get existing token
        token = await GiteaTokenService.get_user_token(user_id, db)
        if token:
            return token

        # Create new token
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        token_name = f"SoundHaus {created_via.capitalize()} - {timestamp}"

        result = await GiteaTokenService.create_and_store_token(
            user_id=user_id,
            token_name=token_name,
            db=db,
            created_via=created_via
        )

        if result.get("success"):
            return result["token"]

        logger.error("get_or_create_token_failed", user_id=user_id)
        return None

    @staticmethod
    async def revoke_token(user_id: str, db: Session) -> bool:
        """
        Revoke a user's Gitea token.

        Args:
            user_id: Supabase user UUID
            db: Database session

        Returns:
            True if revoked successfully, False otherwise
        """
        try:
            token_record = db.query(GiteaToken).filter(
                GiteaToken.user_id == user_id,
                GiteaToken.is_revoked == False
            ).first()

            if not token_record:
                logger.warning("revoke_token_not_found", user_id=user_id)
                return False

            token_record.is_revoked = True
            db.commit()

            logger.info("token_revoked", user_id=user_id)
            return True

        except Exception as e:
            logger.error("revoke_token_error", user_id=user_id, error=str(e))
            db.rollback()
            return False
