"""
Centralized configuration management using pydantic-settings.
All environment variables are validated at startup.
"""
from functools import lru_cache
from typing import List, Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Application settings with validation."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # === Environment ===
    environment: str = Field(default="development", description="development, staging, or production")
    debug: bool = Field(default=False, description="Enable debug mode")
    
    # === Database ===
    database_url: str = Field(..., description="PostgreSQL connection string (Supabase)")
    
    # === Supabase ===
    supabase_url: str = Field(..., description="Supabase project URL")
    supabase_pub_key: str = Field(..., description="Supabase public key")
    supabase_service_key: Optional[str] = Field(default=None, description="Supabase service role key")
    
    # === Gitea ===
    gitea_url: str = Field(default="http://localhost:3000", description="Internal Gitea URL")
    gitea_public_url: str = Field(default="http://localhost:3000", description="Public-facing Gitea URL")
    gitea_admin_token: str = Field(..., description="Gitea admin API token")
    gitea_webhook_secret: str = Field(default="", description="Gitea webhook signing secret")
    gitea_container_name: str = Field(default="gitea", description="Docker container name for Gitea")
    gitea_ssh_host: Optional[str] = Field(default=None, description="SSH host for cloning")
    gitea_ssh_port: str = Field(default="22", description="SSH port for cloning")
    
    # === Rate Limiting ===
    rate_limit_enabled: bool = Field(default=True, description="Enable rate limiting")
    rate_limit_default: str = Field(default="100/minute", description="Default rate limit")
    rate_limit_auth: str = Field(default="10/minute", description="Auth endpoint rate limit")
    rate_limit_signup: str = Field(default="5/minute", description="Signup endpoint rate limit")
    
    # === CORS ===
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"],
        description="Allowed CORS origins"
    )
    
    # === Logging ===
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(default="auto", description="Log format: json, console, or auto")
    
    # === Webhook ===
    webhook_base_url: str = Field(default="http://localhost:8000", description="Base URL for webhook callbacks")
    
    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v.lower() not in allowed:
            raise ValueError(f"environment must be one of: {allowed}")
        return v.lower()
    
    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if v.upper() not in allowed:
            raise ValueError(f"log_level must be one of: {allowed}")
        return v.upper()
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == "production"
    
    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Settings are loaded once and cached for performance.
    Call get_settings.cache_clear() if you need to reload.
    """
    return Settings()


# Convenience export for easy access
settings = get_settings()