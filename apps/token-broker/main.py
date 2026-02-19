"""SoundHaus token broker service."""

from __future__ import annotations

import subprocess
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from config import settings
from logging_config import get_logger

logger = get_logger("soundhaus.token_broker")
app = FastAPI(title="SoundHaus Token Broker", version="1.0.0")


class MintTokenRequest(BaseModel):
    username: str = Field(..., min_length=1)
    token_name: str = Field(..., min_length=1)
    scopes: list[str] = Field(default_factory=lambda: ["write:repository", "read:user", "write:user"])


class MintTokenResponse(BaseModel):
    success: bool
    token: dict[str, Any] | None = None
    message: str | None = None


def _validate_internal_api_key(x_internal_api_key: str | None) -> None:
    if not settings.broker_api_key:
        return
    if x_internal_api_key != settings.broker_api_key:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}


@app.post("/mint-token", response_model=MintTokenResponse)
def mint_token(
    payload: MintTokenRequest,
    x_internal_api_key: str | None = Header(default=None, alias="X-Internal-API-Key"),
) -> MintTokenResponse:
    _validate_internal_api_key(x_internal_api_key)

    scopes_str = ",".join(payload.scopes)
    docker_cmd = [
        "docker",
        "exec",
        "-u",
        "git",
        settings.gitea_container_name,
        "gitea",
        "admin",
        "user",
        "generate-access-token",
        "--username",
        payload.username,
        "--token-name",
        payload.token_name,
        "--scopes",
        scopes_str,
        "--raw",
    ]

    logger.info(
        "mint_token_request",
        username=payload.username,
        token_name=payload.token_name,
        scopes=scopes_str,
        container=settings.gitea_container_name,
    )

    try:
        result = subprocess.run(
            docker_cmd,
            capture_output=True,
            text=True,
            timeout=settings.docker_exec_timeout_seconds,
            check=False,
        )

        if result.returncode != 0:
            stderr = (result.stderr or "").strip()[:300]
            logger.warning(
                "mint_token_command_failed",
                username=payload.username,
                token_name=payload.token_name,
                return_code=result.returncode,
                stderr=stderr,
            )
            return MintTokenResponse(success=False, message="Unable to mint token")

        token = (result.stdout or "").strip()
        if not token:
            logger.error(
                "mint_token_empty_output",
                username=payload.username,
                token_name=payload.token_name,
            )
            return MintTokenResponse(success=False, message="Token generation returned empty output")

        logger.info(
            "mint_token_success",
            username=payload.username,
            token_name=payload.token_name,
            token_length=len(token),
        )
        return MintTokenResponse(
            success=True,
            token={"sha1": token, "name": payload.token_name},
        )

    except FileNotFoundError:
        logger.error("docker_binary_missing")
        return MintTokenResponse(success=False, message="Docker CLI not found")
    except subprocess.TimeoutExpired:
        logger.error("mint_token_timeout", timeout_seconds=settings.docker_exec_timeout_seconds)
        return MintTokenResponse(success=False, message="Token generation timeout")
    except Exception as error:
        logger.exception("mint_token_unexpected_error", error=str(error))
        return MintTokenResponse(success=False, message="Unexpected broker error")
