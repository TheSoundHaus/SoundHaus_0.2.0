"""
Application configuration management
Loads environment variables and provides centralized settings
"""
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables"""

    def __init__(self):
        # Gitea Configuration
        self.gitea_url: str = os.getenv("GITEA_URL", "http://localhost:3000")
        self.gitea_admin_token: Optional[str] = os.getenv("GITEA_ADMIN_TOKEN")

        # Supabase Configuration
        self.supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
        self.supabase_pub_key: Optional[str] = os.getenv("SUPABASE_PUB_KEY")
        self.supabase_service_key: Optional[str] = os.getenv("SUPABASE_SERVICE_KEY")
        self.supabase_jwt_secret: Optional[str] = os.getenv("SUPABASE_JWT_SECRET")

        # API Configuration
        self.api_url: str = os.getenv("API_URL", "http://localhost:8000")

        # Validate required settings
        self._validate()

    def _validate(self):
        """Validate that required environment variables are set"""
        required = {
            "GITEA_ADMIN_TOKEN": self.gitea_admin_token,
            "SUPABASE_URL": self.supabase_url,
            "SUPABASE_PUB_KEY": self.supabase_pub_key,
            "SUPABASE_SERVICE_KEY": self.supabase_service_key,
            "SUPABASE_JWT_SECRET": self.supabase_jwt_secret,
        }

        missing = [key for key, value in required.items() if not value]
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}"
            )


# Singleton settings instance
settings = Settings()
