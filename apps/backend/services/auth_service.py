"""
Supabase Authentication Service
Handles user authentication, registration, and session management using Supabase Auth.
"""

import os
import requests
from urllib.parse import quote
from typing import Optional, Dict, Any
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from .pat_service import PATService

# Load environment variables
load_dotenv()

class SupabaseAuthService:
    """Service for managing authentication with Supabase."""
    
    def __init__(self):
        """Initialize Supabase client with credentials from environment variables."""
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_PUB_KEY")
        service_key = os.getenv("SUPABASE_SERVICE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError(
                "Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_PUB_KEY in .env file"
            )
        
        self.client: Client = create_client(supabase_url, supabase_key)

    async def sign_up(self, email: str, password: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Register a new user with email and password.
        
        Args:
            email: User's email address
            password: User's password (min 6 characters)
            metadata: Optional user metadata (e.g., name, avatar_url)
        
        Returns:
            Dict containing user data and session information
        
        Raises:
            Exception: If signup fails
        """
        try:
            # Build sign up credentials
            credentials: Dict[str, Any] = {
                "email": email,
                "password": password,
            }
            
            # Add metadata if provided
            if metadata:
                credentials["options"] = {"data": metadata}
            
            print(f"[auth_service] sign_up credentials: {credentials}")
            
            response = self.client.auth.sign_up(credentials)
            
            print(f"[auth_service] sign_up response type: {type(response)}")
            print(f"[auth_service] sign_up response: {response}")
            
            # Check if response has user attribute
            if response and hasattr(response, 'user') and response.user:
                return {
                    "success": True,
                    "user": {
                        "id": response.user.id,
                        "email": response.user.email,
                        "created_at": str(response.user.created_at) if response.user.created_at else None,
                    },
                    "session": {
                        "access_token": response.session.access_token if response.session else None,
                        "refresh_token": response.session.refresh_token if response.session else None,
                    } if response.session else None
                }
            
            # If no user but no exception, might be email confirmation required
            print(f"[auth_service] sign_up - no user in response, checking for confirmation requirement")
            return {
                "success": True,
                "message": "Please check your email to confirm your account",
                "requires_confirmation": True
            }
            
        except Exception as e:
            # Log the full error for debugging
            print(f"[auth_service] sign_up error: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "message": f"Registration failed: {str(e)}"}

    async def sign_in(self, email: str, password: str) -> Dict[str, Any]:
        """
        Sign in an existing user with email and password.
        
        Args:
            email: User's email address
            password: User's password
        
        Returns:
            Dict containing user data and session tokens
        
        Raises:
            Exception: If sign in fails
        """
        try:
            response = self.client.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if response.user and response.session:
                return {
                    "success": True,
                    "user": {
                        "id": response.user.id,
                        "email": response.user.email,
                        "role": response.user.role,
                        "user_metadata": response.user.user_metadata,
                    },
                    "session": {
                        "access_token": response.session.access_token,
                        "refresh_token": response.session.refresh_token,
                        "expires_at": response.session.expires_at,
                        "token_type": response.session.token_type,
                    },
                    "message": "Login successful"
                }
            else:
                raise Exception("Invalid credentials")
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Login failed. Please check your credentials."
            }
    
    async def sign_out(self, access_token: str) -> Dict[str, Any]:
        """
        Sign out the current user and invalidate their session.
        
        Args:
            access_token: The user's current access token
        
        Returns:
            Dict indicating success or failure
        """
        try:
            # Set the session for this operation
            self.client.auth.set_session(access_token, refresh_token="")
            
            response = self.client.auth.sign_out()
            
            return {
                "success": True,
                "message": "Logged out successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Logout failed"
            }
    
    async def refresh_session(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh an expired access token using a refresh token.
        
        Args:
            refresh_token: The refresh token
        
        Returns:
            Dict containing new session tokens
        """
        try:
            response = self.client.auth.refresh_session(refresh_token)
            
            if response.session:
                return {
                    "success": True,
                    "session": {
                        "access_token": response.session.access_token,
                        "refresh_token": response.session.refresh_token,
                        "expires_at": response.session.expires_at,
                        "token_type": response.session.token_type,
                    },
                    "message": "Session refreshed successfully"
                }
            else:
                raise Exception("Failed to refresh session")
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Session refresh failed"
            }
    
    async def get_user(self, access_token: str) -> Dict[str, Any]:
        """
        Get the current user's information using their access token.
        
        Args:
            access_token: The user's access token
        
        Returns:
            Dict containing user information
        """
        try:
            print(f"[auth_service] get_user called with token: {access_token[:20]}...")
            # Get user directly with the token
            response = self.client.auth.get_user(access_token)
            print(f"[auth_service] get_user response: {response}")
            
            if response and hasattr(response, 'user') and response.user:
                user_data = {
                    "success": True,
                    "user": {
                        "id": response.user.id,
                        "email": response.user.email,
                        "role": response.user.role,
                        "email_confirmed_at": response.user.email_confirmed_at,
                        "created_at": response.user.created_at,
                        "updated_at": response.user.updated_at,
                        "user_metadata": response.user.user_metadata,
                    }
                }
                print(f"[auth_service] get_user success: {user_data['user']['email']}")
                return user_data
            else:
                print("[auth_service] get_user - no user in response")
                raise Exception("User not found")
                
        except Exception as e:
            print(f"[auth_service] get_user error: {e}")
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to retrieve user information"
            }
    
    async def update_user(self, access_token: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update user information.
        
        Args:
            access_token: The user's access token
            updates: Dict containing fields to update (e.g., email, password, data)
        
        Returns:
            Dict containing updated user information
        """
        try:
            # Set the session
            self.client.auth.set_session(access_token, refresh_token="")
            
            # Convert dict to proper format for update_user
            user_attributes: Dict[str, Any] = {}
            if "email" in updates:
                user_attributes["email"] = updates["email"]
            if "password" in updates:
                user_attributes["password"] = updates["password"]
            if "data" in updates:
                user_attributes["data"] = updates["data"]
            
            response = self.client.auth.update_user(user_attributes)  # type: ignore
            
            if response and hasattr(response, 'user') and response.user:
                return {
                    "success": True,
                    "user": {
                        "id": response.user.id,
                        "email": response.user.email,
                        "user_metadata": response.user.user_metadata,
                    },
                    "message": "User updated successfully"
                }
            else:
                raise Exception("Failed to update user")
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "User update failed"
            }
    
    async def reset_password_email(self, email: str) -> Dict[str, Any]:
        """
        Send a password reset email to the user.
        
        Args:
            email: User's email address
        
        Returns:
            Dict indicating success or failure
        """
        try:
            response = self.client.auth.reset_password_email(email)
            
            return {
                "success": True,
                "message": "Password reset email sent. Please check your inbox."
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": "Failed to send password reset email"
            }
    
    async def verify_token(self, access_token: str) -> bool:
        """
        Verify if an access token is valid.
        
        Args:
            access_token: The access token to verify
        
        Returns:
            True if token is valid, False otherwise
        """
        try:
            print(f"[auth_service] verify_token called with token: {access_token[:20]}...")
            # Get user directly with the token without setting full session
            response = self.client.auth.get_user(access_token)
            print(f"[auth_service] get_user response: {response}")
            is_valid = response is not None and hasattr(response, 'user') and response.user is not None
            print(f"[auth_service] token is_valid: {is_valid}")
            return is_valid
        except Exception as e:
            print(f"[auth_service] verify_token error: {e}")
            return False
    
    async def sign_in_with_oauth(self, provider: str) -> Dict[str, Any]:
        """
        Initiate OAuth sign in with a provider (Google, GitHub, etc.).
        
        Args:
            provider: OAuth provider name (e.g., 'google', 'github', 'discord')
        
        Returns:
            Dict containing the OAuth URL to redirect to
        """
        try:
            # Cast provider to Any to avoid type checking issues with literal types
            oauth_credentials: Dict[str, Any] = {"provider": provider}
            response = self.client.auth.sign_in_with_oauth(oauth_credentials)  # type: ignore
            
            return {
                "success": True,
                "url": response.url if hasattr(response, 'url') else "",
                "message": f"Redirect to {provider} for authentication"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to initiate {provider} OAuth"
            }
    
    async def verify_token_or_pat(self, authorization: Optional[str], db: Session) -> Optional[Dict[str, Any]]:
        """
        Verify either a Supabase JWT token or a Personal Access Token.
        This method enables dual authentication - web users with JWTs, desktop users with PATs.
        
        Args:
            authorization: The Authorization header value (e.g., "Bearer <jwt>" or "token <pat>")
            db: SQLAlchemy database session for PAT lookups
        
        Returns:
            Dict with user_id, email/pat_id, and auth_type if valid, None if invalid
        
        Example return values:
            JWT: {"user_id": "uuid", "email": "user@example.com", "auth_type": "jwt"}
            PAT: {"user_id": "uuid", "pat_id": "uuid", "token_name": "My Token", "auth_type": "pat"}
            Invalid: None
        """
        if authorization is None:
            return None
        
        # Check JWT first (for web users)
        jwt_prefix = "Bearer "
        if authorization.startswith(jwt_prefix):
            token = authorization.replace(jwt_prefix, "", 1)
            user_result = await self.get_user(token)
            if user_result and user_result.get("success"):
                user = user_result.get("user", {})
                return {
                    "user_id": user.get("id"),
                    "email": user.get("email"),
                    "auth_type": "jwt"
                }

        # If no JWT return, check for PAT (for desktop users)
        pat_prefix = "token "
        if authorization.startswith(pat_prefix):
            pat_token = authorization.replace(pat_prefix, "", 1)
            pat_service = PATService()
            pat_result = await pat_service.verify_pat(pat_token, db)
            if pat_result is not None:
                return {
                    "user_id": pat_result.get("user_id"),
                    "pat_id": pat_result.get("pat_id"),
                    "token_name": pat_result.get("token_name"),
                    "auth_type": "pat"
                }

        # If neither returns, invalid credentials
        return None
# Singleton instance
_auth_service: Optional[SupabaseAuthService] = None

def get_auth_service() -> SupabaseAuthService:
    """
    Get or create the singleton SupabaseAuthService instance.
    
    Returns:
        SupabaseAuthService instance
    """
    global _auth_service
    if _auth_service is None:
        _auth_service = SupabaseAuthService()
    return _auth_service
