"""Structured logging configuration for token broker."""

import logging
import sys
from typing import Any

import structlog
from structlog.types import Processor

try:
    from config import settings

    ENVIRONMENT = settings.environment
    LOG_LEVEL = settings.log_level
    LOG_FORMAT = settings.log_format
except ImportError:
    import os

    ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FORMAT = os.getenv("LOG_FORMAT", "auto")


def determine_log_format() -> str:
    if LOG_FORMAT != "auto":
        return LOG_FORMAT
    if ENVIRONMENT == "production":
        return "json"
    return "console"


def add_app_context(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    event_dict["app"] = "soundhaus-token-broker"
    event_dict["environment"] = ENVIRONMENT
    return event_dict


def censor_sensitive_data(
    logger: logging.Logger, method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    sensitive_keys = {
        "password",
        "token",
        "access_token",
        "refresh_token",
        "api_key",
        "secret",
        "authorization",
        "credentials",
        "sha1",
    }

    for key in list(event_dict.keys()):
        key_lower = key.lower()
        if any(s in key_lower for s in sensitive_keys):
            value = event_dict[key]
            if isinstance(value, str) and len(value) > 8:
                event_dict[key] = f"{value[:4]}...{value[-4:]}"
            else:
                event_dict[key] = "[REDACTED]"

    return event_dict


def configure_structlog() -> None:
    log_format = determine_log_format()

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
        shared_processors.extend(
            [
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.processors.JSONRenderer(),
            ]
        )
    else:
        shared_processors.extend(
            [
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.dev.ConsoleRenderer(
                    colors=True,
                    exception_formatter=structlog.dev.plain_traceback,
                ),
            ]
        )

    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, LOG_LEVEL, logging.INFO),
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


configure_structlog()
