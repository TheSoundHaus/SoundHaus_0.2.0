"""
Personal Access Token Service
Handles creation, validation, and management of PATs
"""

import os
import secrets
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from models.pat_models import PersonalAccessToken
from logging_config import get_logger

logger = get_logger("soundhaus.pat")

class PATService:
    """Service for managing Personal Access Tokens"""
    
    @staticmethod
    def generate_token() -> tuple[str, str]:
        """
        Generate a secure random token.
        
        Returns:
            Tuple of (full_token, token_prefix)
        """
        # Generate 32-byte random token using secrets.token_urlsafe()
        random_bytes = secrets.token_urlsafe(32)
        # Format as "soundh_{random_bytes}"
        full_token = f"soundh_{random_bytes}"
        # Extract first 16 chars as prefix for identification
        token_prefix = full_token[:16]
        # Return tuple of (full_token, token_prefix)
        return (full_token, token_prefix)
    
    @staticmethod
    def hash_token(token: str) -> str:
        """
        Hash a token using bcrypt.
        
        Args:
            token: The plaintext token
            
        Returns:
            Bcrypt hash of the token
        """
        # Generate bcrypt salt with 12 rounds
        salt = bcrypt.gensalt(rounds=12)
        # Hash the token (encode to bytes first)
        token_bytes = token.encode('utf-8')
        token_hash = bcrypt.hashpw(token_bytes, salt)
        # Return hash as string (decode from bytes)
        return token_hash.decode('utf-8')
        
    
    @staticmethod
    def verify_token(plaintext_token: str, token_hash: str) -> bool:
        """
        Verify a token against its hash.
        
        Args:
            plaintext_token: The token to verify
            token_hash: The stored bcrypt hash
            
        Returns:
            True if token matches, False otherwise
        """
        # Use bcrypt.checkpw() to verify (both args need to be bytes)
        # Wrap in try/except and return False on error
        try:
            plaintext_bytes = plaintext_token.encode('utf-8')
            hash_bytes = token_hash.encode('utf-8')
            return bcrypt.checkpw(plaintext_bytes, hash_bytes)
        except Exception as e:
            logger.error("token_verification_error", error=str(e))
            return False

    
    @staticmethod
    async def create_pat(
        user_id: str,
        token_name: str,
        db: Session,
        expires_in_days: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new Personal Access Token.
        
        Args:
            user_id: Supabase user UUID
            token_name: User-friendly name for the token
            db: Database session
            expires_in_days: Optional expiration in days (None = never expires)
            
        Returns:
            Dict with success status and token details
        """
        try:
            # Call generate_token() to get full_token and token_prefix
            full_token, token_prefix = PATService.generate_token()
            # Hash the full_token using hash_token()
            token_hash = PATService.hash_token(full_token)
            
            # Calculate expires_at if expires_in_days is provided
            expires_at = None
            if expires_in_days is not None:
                expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
            
            # Create PersonalAccessToken instance
            pat = PersonalAccessToken(
                user_id=user_id,
                token_name=token_name,
                token_hash=token_hash,
                token_prefix=token_prefix,
                expires_at=expires_at,
                is_revoked=False,
                usage_count=0
            )
            
            # Add to database, commit, refresh
            db.add(pat)
            db.commit()
            db.refresh(pat)
            
            return {
                "success": True,
                "token": full_token,
                "token_id": pat.id,
                "token_name": pat.token_name,
                "token_prefix": pat.token_prefix,
                "created_at": pat.created_at.isoformat() if pat.created_at else None,
                "expires_at": pat.expires_at.isoformat() if pat.expires_at else None,
                "message": "Save this token now - you won't see it again!"
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "message": f"Personal Access Token generation failed due to error: {e}"}
    
    @staticmethod
    async def verify_pat(
        token: str,
        db: Session
    ) -> Optional[Dict[str, Any]]:
        """
        Verify a PAT and return user info if valid.
        
        Args:
            token: The plaintext token to verify
            db: Database session
            
        Returns:
            User info dict if valid, None if invalid
        """
        try:
            # Query all non-revoked tokens from database
            tokens = db.query(PersonalAccessToken).filter(
                PersonalAccessToken.is_revoked == False
            ).all()

            # Loop through each token and check if it matches
            for pat in tokens:
                if PATService.verify_token(token, pat.token_hash):
                    # Check if token is expired
                    if pat.expires_at is not None and datetime.now(timezone.utc) > pat.expires_at:
                        logger.info("pat_expired", token_prefix=pat.token_prefix)
                        return None
                    
                    # Update last_used and usage_count
                    pat.last_used = datetime.now(timezone.utc)
                    pat.usage_count += 1
                    db.commit()
                    
                    return {
                        "user_id": pat.user_id,
                        "pat_id": pat.id,
                        "token_name": pat.token_name,
                        "scopes": pat.scopes
                    }
            
            # No match found
            return None
            
        except Exception as e:
            logger.error("pat_verification_error", error=str(e))
            return None
    
    @staticmethod
    async def list_pats(user_id: str, db: Session) -> List[PersonalAccessToken]:
        """
        List all active PATs for a user.
        
        Args:
            user_id: Supabase user UUID
            db: Database session
            
        Returns:
            List of PersonalAccessToken objects (NO token hash values exposed!)
        """
        # Query PersonalAccessToken where user_id matches and is not revoked
        pats = db.query(PersonalAccessToken).filter(
            PersonalAccessToken.user_id == user_id,
            PersonalAccessToken.is_revoked == False
        ).all()
        
        return pats
    
    @staticmethod
    async def revoke_pat(token_id: str, user_id: str, db: Session) -> Dict[str, Any]:
        """
        Revoke a PAT (soft delete).
        
        Args:
            token_id: PAT ID to revoke
            user_id: User ID (for authorization check)
            db: Database session
            
        Returns:
            Success status dict
        """
        try:
            # Query PersonalAccessToken where id and user_id match (authorization check)
            pat = db.query(PersonalAccessToken).filter(
                PersonalAccessToken.id == token_id,
                PersonalAccessToken.user_id == user_id
            ).first()
            
            # If not found, return error
            if pat is None:
                return {
                    "success": False,
                    "message": "Token not found or unauthorized"
                }
            
            # Mark as revoked
            pat.is_revoked = True
            db.commit()
            
            return {
                "success": True,
                "message": f"Token '{pat.token_name}' revoked successfully"
            }
            
        except Exception as e:
            db.rollback()
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to revoke token"
            }
