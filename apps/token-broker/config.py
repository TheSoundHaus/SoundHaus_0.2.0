"""Token broker configuration."""

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Token broker settings with environment support."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: str = Field(default="production", description="Runtime environment")
    log_level: str = Field(default="INFO", description="Logging level")
    log_format: str = Field(default="auto", description="Log output format")

    broker_port: int = Field(default=9000, description="Port for broker HTTP server")
    broker_api_key: Optional[str] = Field(default=None, description="Optional internal API key")

    gitea_container_name: str = Field(default="gitea", description="Gitea Docker container name")
    docker_exec_timeout_seconds: int = Field(default=15, description="Timeout for docker exec commands")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
