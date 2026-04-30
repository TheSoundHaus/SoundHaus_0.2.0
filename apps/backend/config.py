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

    # === Token Broker ===
    token_broker_enabled: bool = Field(default=True, description="Enable token broker for Gitea token minting")
    token_broker_url: str = Field(default="http://token-broker:9000", description="Internal token broker URL")
    token_broker_api_key: Optional[str] = Field(default=None, description="Optional shared key for token broker")
    
    # === Rate Limiting ===
    rate_limit_enabled: bool = Field(default=True, description="Enable rate limiting")
    rate_limit_default: str = Field(default="100/minute", description="Default rate limit")
    rate_limit_auth: str = Field(default="100/minute", description="Auth endpoint rate limit")
    rate_limit_signup: str = Field(default="100/minute", description="Signup endpoint rate limit")
    rate_limit_upload: str = Field(default="100/minute", description="Upload endpoint rate limit")
    
    # === Auth features ===
    password_reset_email_enabled: bool = Field(
        default=True,
        description="When false, POST /api/auth/reset-password is disabled (temporary pause); logged at startup and per request",
    )
    
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
    
    # === Redis ===
    redis_url: str = Field(default="redis://redis:6379/0", description="Redis connection URL")

    # === Encryption ===
    encryption_key: Optional[str] = Field(
        default=None,
        description="Symmetric key for pgcrypto column-level encryption (pgp_sym_encrypt/decrypt)",
    )

    # === Admin (X-Admin-Token guarded /admin/* endpoints) ===
    admin_token: Optional[str] = Field(
        default=None,
        description="Shared token for /admin/* endpoints. None disables the admin API entirely.",
    )

    # === Stripe (Phase 6 billing) ===
    # All Stripe fields are Optional; billing routes return 503 when unset, so
    # development environments without Stripe credentials still boot cleanly.
    stripe_secret_key: Optional[str] = Field(default=None, description="Stripe secret key (sk_test_... or sk_live_...)")
    stripe_webhook_secret: Optional[str] = Field(default=None, description="Stripe webhook signing secret (whsec_...)")
    stripe_price_pro: Optional[str] = Field(default=None, description="Stripe Price ID for Pro tier")
    stripe_price_team: Optional[str] = Field(default=None, description="Stripe Price ID for Team tier")
    stripe_checkout_success_url: str = Field(
        default="http://localhost:3000/settings/billing?status=success",
        description="Where Stripe Checkout returns the user on success",
    )
    stripe_checkout_cancel_url: str = Field(
        default="http://localhost:3000/settings/billing?status=cancelled",
        description="Where Stripe Checkout returns the user on cancel",
    )
    stripe_portal_return_url: str = Field(
        default="http://localhost:3000/settings/billing",
        description="Where the Stripe Customer Portal returns the user",
    )

    # === LTI 1.3 (Phase 8 classroom) ===
    # All LTI fields are Optional; LTI routes return 503 when unset.
    lti_client_id: Optional[str] = Field(default=None, description="Tool client_id registered in the LMS (Canvas, etc.)")
    lti_private_key_pem: Optional[str] = Field(
        default=None,
        description="RSA private key (PEM, multi-line) for signing LTI JWTs. Quote with triple-quotes in .env.",
    )
    lti_public_jwks_url: Optional[str] = Field(
        default=None,
        description="Public JWKS URL for tool key discovery; usually points back at our /.well-known/jwks.json",
    )
    lti_auth_login_url: Optional[str] = Field(
        default=None,
        description="Default OIDC auth login endpoint; per-deployment overrides live in lti_deployments.auth_login_url",
    )

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