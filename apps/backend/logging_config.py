""" 
Structured Logging Configuration for SoundHaus API

Uses structlog for structured, JSON-formatted logs in production
and human-readable colored logs in development.

Usage:
    from logging_config import get_logger
    
    logger = get_logger(__name__)
    logger.info("user_signup", email="user@example.com", user_id="123")
    logger.error("database_error", error=str(e), query="SELECT...")
"""

import logging
import sys
from typing import Any

import structlog
from structlog.types import Processor

# Import settings (avoid circular import by using try/except)
try:
    from config import settings
    ENVIRONMENT = settings.environment
    LOG_LEVEL = settings.log_level
    LOG_FORMAT = settings.log_format
except ImportError:
    # Fallback if config not available during initial import
    import os
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FORMAT = os.getenv("LOG_FORMAT", "auto")
def determine_log_format() -> str:
    """Determine log format based on environment and settings."""
    if LOG_FORMAT != "auto":
        return LOG_FORMAT
    
    # Auto-detect: JSON in production, pretty console in development
    if ENVIRONMENT == "production":
        return "json"
    return "console"


def add_app_context(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Add application context to all log entries."""
    event_dict["app"] = "soundhaus-api"
    event_dict["environment"] = ENVIRONMENT
    return event_dict


def censor_sensitive_data(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """
    Censor sensitive data in logs.
    
    Redacts passwords, tokens, and other sensitive fields.
    """
    sensitive_keys = {
        "password", "token", "access_token", "refresh_token", 
        "api_key", "secret", "authorization", "pat", "credentials",
        "token_hash", "supabase_key", "gitea_token"
    }
    
    for key in list(event_dict.keys()):
        key_lower = key.lower()
        # Check if any sensitive key is a substring
        if any(s in key_lower for s in sensitive_keys):
            value = event_dict[key]
            if isinstance(value, str) and len(value) > 8:
                # Show first 4 and last 4 chars for debugging
                event_dict[key] = f"{value[:4]}...{value[-4:]}"
            else:
                event_dict[key] = "[REDACTED]"
    
    return event_dict


def configure_structlog() -> None:
    """Configure structlog with appropriate processors for the environment."""
    
    log_format = determine_log_format()
    
    # Common processors for all environments
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        add_app_context,
        censor_sensitive_data,
    ]
    
    if log_format == "json":
        # Production: JSON output for log aggregation (ELK, Datadog, etc.)
        shared_processors.extend([
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ])
    else:
        # Development: Pretty, colored console output
        shared_processors.extend([
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.dev.ConsoleRenderer(
                colors=True,
                exception_formatter=structlog.dev.plain_traceback,
            ),
        ])
    
    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    # Configure standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, LOG_LEVEL, logging.INFO),
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """
    Get a structured logger instance.
    
    Args:
        name: Logger name (typically __name__ of the calling module)
        
    Returns:
        A bound structlog logger
        
    Example:
        logger = get_logger(__name__)
        logger.info("request_received", method="POST", path="/api/auth/signup")
        logger.error("database_error", error=str(e), exc_info=True)
    """
    return structlog.get_logger(name)


# Initialize logging on module import
configure_structlog()


# Convenience loggers for common use cases
def log_request(
    logger: structlog.stdlib.BoundLogger,
    method: str,
    path: str,
    user_id: str | None = None,
    **kwargs: Any,
) -> None:
    """Log an incoming API request."""
    logger.info(
        "api_request",
        method=method,
        path=path,
        user_id=user_id,
        **kwargs,
    )


def log_response(
    logger: structlog.stdlib.BoundLogger,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float | None = None,
    **kwargs: Any,
) -> None:
    """Log an API response."""
    logger.info(
        "api_response",
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        **kwargs,
    )


def log_error(
    logger: structlog.stdlib.BoundLogger,
    error: Exception,
    context: str | None = None,
    **kwargs: Any,
) -> None:
    """Log an error with full context."""
    logger.error(
        "error",
        error_type=type(error).__name__,
        error_message=str(error),
        context=context,
        exc_info=True,
        **kwargs,
    )


def log_db_operation(
    logger: structlog.stdlib.BoundLogger,
    operation: str,
    table: str,
    success: bool = True,
    **kwargs: Any,
) -> None:
    """Log a database operation."""
    level = "info" if success else "error"
    getattr(logger, level)(
        "db_operation",
        operation=operation,
        table=table,
        success=success,
        **kwargs,
    )


def log_external_service(
    logger: structlog.stdlib.BoundLogger,
    service: str,
    operation: str,
    success: bool = True,
    status_code: int | None = None,
    **kwargs: Any,
) -> None:
    """Log an external service call (Gitea, Supabase, etc.)."""
    level = "info" if success else "warning"
    getattr(logger, level)(
        "external_service",
        service=service,
        operation=operation,
        success=success,
        status_code=status_code,
        **kwargs,
    )
