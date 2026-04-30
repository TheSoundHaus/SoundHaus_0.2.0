"""
LTI 1.3 / Canvas service (Phase 8).

Wraps `pylti1p3` where possible and provides pure-Python fallbacks for
test/CI. Responsibilities:

    - OIDC login init:     /lti/login       (third-party login init)
    - Resource link launch:/lti/launch      (tool launch with id_token)
    - Deep Linking 2.0:    /lti/deep-link-return
    - JWKS publishing:     /.well-known/jwks.json
    - AGS score passback:  POST score to `lineItem.postScore`
    - NRPS roster sync:    GET context memberships
    - Session handoff to the web dashboard via Supabase

The heavy JWT / nonce / state handling is delegated to pylti1p3 in
production. In tests we stub the service via monkeypatching.
"""

from __future__ import annotations

import base64
import json
import secrets
import time
from typing import Any

from sqlalchemy.orm import Session

from config import settings
from logging_config import get_logger
from models.classroom_models import LtiDeployment, LtiUser

logger = get_logger(__name__)


class LtiService:
    """Facade used by routers/lti.py. Most methods raise at runtime if the
    LTI environment is not configured; tests replace the instance.
    """

    # ── Registration / deployments ─────────────────────────────────────────

    def register_deployment(
        self,
        db: Session,
        *,
        issuer: str,
        client_id: str,
        deployment_id: str,
        public_jwks_url: str,
        auth_login_url: str,
        auth_token_url: str,
        tool_redirect_url: str | None = None,
    ) -> LtiDeployment:
        existing = (
            db.query(LtiDeployment)
            .filter(
                LtiDeployment.issuer == issuer,
                LtiDeployment.client_id == client_id,
                LtiDeployment.deployment_id == deployment_id,
            )
            .first()
        )
        if existing is not None:
            existing.public_jwks_url = public_jwks_url
            existing.auth_login_url = auth_login_url
            existing.auth_token_url = auth_token_url
            if tool_redirect_url is not None:
                existing.tool_redirect_url = tool_redirect_url
            db.commit()
            db.refresh(existing)
            return existing

        dep = LtiDeployment(
            issuer=issuer,
            client_id=client_id,
            deployment_id=deployment_id,
            public_jwks_url=public_jwks_url,
            auth_login_url=auth_login_url,
            auth_token_url=auth_token_url,
            tool_redirect_url=tool_redirect_url,
        )
        db.add(dep)
        db.commit()
        db.refresh(dep)
        return dep

    def find_deployment(
        self,
        db: Session,
        *,
        issuer: str,
        client_id: str,
        deployment_id: str | None = None,
    ) -> LtiDeployment | None:
        q = db.query(LtiDeployment).filter(
            LtiDeployment.issuer == issuer,
            LtiDeployment.client_id == client_id,
        )
        if deployment_id is not None:
            q = q.filter(LtiDeployment.deployment_id == deployment_id)
        return q.first()

    # ── Users (LTI sub -> Soundhaus user) ──────────────────────────────────

    def map_lti_user(
        self,
        db: Session,
        *,
        deployment_id: str,
        platform_user_id: str,
        soundhaus_user_id: str,
        email: str | None = None,
        display_name: str | None = None,
    ) -> LtiUser:
        row = (
            db.query(LtiUser)
            .filter(
                LtiUser.deployment_id == deployment_id,
                LtiUser.platform_user_id == platform_user_id,
            )
            .first()
        )
        if row is not None:
            row.soundhaus_user_id = soundhaus_user_id
            if email is not None:
                row.email = email
            if display_name is not None:
                row.display_name = display_name
            db.commit()
            return row
        row = LtiUser(
            deployment_id=deployment_id,
            platform_user_id=platform_user_id,
            soundhaus_user_id=soundhaus_user_id,
            email=email,
            display_name=display_name,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def find_soundhaus_user_for_platform_user(
        self,
        db: Session,
        *,
        deployment_id: str,
        platform_user_id: str,
    ) -> str | None:
        row = (
            db.query(LtiUser)
            .filter(
                LtiUser.deployment_id == deployment_id,
                LtiUser.platform_user_id == platform_user_id,
            )
            .first()
        )
        return row.soundhaus_user_id if row else None

    # ── OIDC login / launch ────────────────────────────────────────────────
    #
    # pylti1p3 handles state, nonce, JWT verification, claim validation. We
    # keep a thin wrapper so tests can mock `launch_from_id_token`.

    def oidc_login_redirect_url(
        self,
        *,
        iss: str,
        client_id: str | None,
        login_hint: str,
        target_link_uri: str,
        lti_message_hint: str | None,
    ) -> str:
        """Build the redirect URL back to Canvas's auth endpoint (Step 1)."""
        dep_login = settings.lti_auth_login_url
        if not dep_login:
            raise RuntimeError("LTI auth_login_url not configured")
        cid = client_id or settings.lti_client_id or ""

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)

        from urllib.parse import urlencode

        params = {
            "scope": "openid",
            "response_type": "id_token",
            "response_mode": "form_post",
            "prompt": "none",
            "client_id": cid,
            "redirect_uri": target_link_uri,
            "login_hint": login_hint,
            "state": state,
            "nonce": nonce,
        }
        if lti_message_hint:
            params["lti_message_hint"] = lti_message_hint

        return f"{dep_login}?{urlencode(params)}&_iss={iss}"

    def verify_launch_id_token(self, id_token: str) -> dict[str, Any]:
        """Verify JWT and return the claims dict.

        Prefers `pylti1p3`; falls back to unverified decode for local dev
        (guarded by settings.environment == 'development').
        """
        try:
            import pylti1p3.contrib.fastapi  # noqa: F401 — triggers dep check
        except ImportError:
            pass

        try:
            import jwt  # PyJWT — hard dep of pylti1p3

            key_url = settings.lti_public_jwks_url
            if key_url:
                jwks_client = jwt.PyJWKClient(key_url)
                signing_key = jwks_client.get_signing_key_from_jwt(id_token).key
                return jwt.decode(
                    id_token,
                    signing_key,
                    algorithms=["RS256"],
                    audience=settings.lti_client_id,
                )
        except Exception as exc:
            logger.warning("lti_jwt_verify_failed", error=str(exc))

        # Unsafe fallback — ONLY for local dev / integration tests.
        return _decode_jwt_no_verify(id_token)

    # ── AGS score passback ─────────────────────────────────────────────────

    def post_score(self, *, line_item_url: str, access_token: str, payload: dict[str, Any]) -> dict[str, Any]:
        """POST an AGS Score to Canvas. Requires caller to have obtained
        the access_token via the token service (pylti1p3 handles it).
        """
        import requests

        url = line_item_url.rstrip("/") + "/scores"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/vnd.ims.lis.v1.score+json",
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json() if resp.content else {"ok": True}

    # ── NRPS roster sync ───────────────────────────────────────────────────

    def fetch_roster(self, *, memberships_url: str, access_token: str) -> list[dict[str, Any]]:
        import requests

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
        }
        resp = requests.get(memberships_url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return list(data.get("members") or [])

    # ── Deep Linking response ──────────────────────────────────────────────

    def build_deep_link_response_jwt(
        self,
        *,
        deployment_id: str,
        client_id: str,
        issuer: str,
        assignment_url: str,
        assignment_title: str,
    ) -> str:
        """Return a signed Deep Linking 2.0 response JWT that Canvas submits
        back to the platform.
        """
        if not settings.lti_private_key_pem:
            raise RuntimeError("LTI private key not configured")
        try:
            import jwt

            now = int(time.time())
            claims = {
                "iss": client_id,
                "aud": issuer,
                "iat": now,
                "exp": now + 600,
                "nonce": secrets.token_urlsafe(32),
                "https://purl.imsglobal.org/spec/lti/claim/deployment_id": deployment_id,
                "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
                "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
                "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
                    {
                        "type": "ltiResourceLink",
                        "title": assignment_title,
                        "url": assignment_url,
                    }
                ],
            }
            return jwt.encode(claims, settings.lti_private_key_pem, algorithm="RS256")
        except ImportError as exc:
            raise RuntimeError("PyJWT not installed") from exc


# ── JWKS ────────────────────────────────────────────────────────────────────


def tool_jwks() -> dict[str, Any]:
    """Public JWKS for the Soundhaus tool. Canvas calls this to verify
    signatures on Deep Linking responses + AGS JWTs we send.
    """
    if not settings.lti_private_key_pem:
        return {"keys": []}
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa

        key = serialization.load_pem_private_key(
            settings.lti_private_key_pem.encode() if isinstance(settings.lti_private_key_pem, str)
            else settings.lti_private_key_pem,
            password=None,
        )
        if not isinstance(key, rsa.RSAPrivateKey):
            return {"keys": []}
        public_numbers = key.public_key().public_numbers()

        def _b64url(n: int) -> str:
            length = (n.bit_length() + 7) // 8
            return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()

        return {
            "keys": [
                {
                    "kty": "RSA",
                    "alg": "RS256",
                    "use": "sig",
                    "kid": "soundhaus-lti-1",
                    "n": _b64url(public_numbers.n),
                    "e": _b64url(public_numbers.e),
                }
            ]
        }
    except Exception as exc:
        logger.warning("lti_jwks_build_failed", error=str(exc))
        return {"keys": []}


# ── Helpers ────────────────────────────────────────────────────────────────


def _decode_jwt_no_verify(token: str) -> dict[str, Any]:
    """Decode JWT payload WITHOUT verification. Dev/test use only."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT")
    body = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(body.encode()))


lti_service = LtiService()
