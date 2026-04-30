"""
Stripe billing endpoints (Phase 6).

    POST /billing/checkout          — create a Checkout Session for a tier
    POST /billing/portal            — open the Stripe Customer Portal
    POST /billing/webhook           — receive Stripe webhooks (signature verified)
    GET  /billing/subscription      — current user's tier + status
    GET  /billing/storage           — current user's storage usage vs quota

All handlers are thin: they delegate to `services.billing_service`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import get_auth, limiter, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from services.billing_service import TIER_QUOTAS, billing_service

logger = get_logger(__name__)

router = APIRouter(prefix="/billing", tags=["billing"])


# ── Schemas ─────────────────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    tier: str = Field(..., description="Which tier to subscribe to: 'pro' or 'team'")


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _require_user(token: str) -> tuple[str, str | None]:
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Invalid session")
    user = user_res["user"]
    return str(user["id"]), user.get("email")


def _price_id_for(tier: str) -> str:
    if tier == "pro":
        pid = settings.stripe_price_pro
    elif tier == "team":
        pid = settings.stripe_price_team
    else:
        raise HTTPException(status_code=400, detail=f"Unknown tier '{tier}'")
    if not pid:
        raise HTTPException(status_code=503, detail=f"Tier '{tier}' not configured")
    return pid


# ── Endpoints ───────────────────────────────────────────────────────────────


@router.post("/checkout")
@user_limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    body: CheckoutRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a Stripe Checkout Session. Returns the hosted redirect URL."""
    user_id, email = await _require_user(token)
    price_id = _price_id_for(body.tier)
    try:
        out = billing_service.build_checkout_session(db, user_id, email, price_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, **out}


@router.post("/portal")
@user_limiter.limit("20/minute")
async def open_portal(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Open the Stripe Customer Portal — self-service subscription management."""
    user_id, _ = await _require_user(token)
    try:
        out = billing_service.build_portal_session(db, user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, **out}


@router.post("/webhook", include_in_schema=False)
@limiter.limit("120/minute")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Stripe -> Soundhaus event receiver. Signature verified via STRIPE_WEBHOOK_SECRET."""
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature") or request.headers.get("stripe-signature", "")
    try:
        res = billing_service.handle_webhook(db, payload, sig_header)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # Stripe raises ValueError/SignatureVerificationError subclasses
        logger.warning("stripe_webhook_invalid", error=str(exc))
        raise HTTPException(status_code=400, detail="Invalid webhook") from exc
    return res


@router.get("/subscription")
@user_limiter.limit("60/minute")
async def get_subscription(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id, _ = await _require_user(token)
    sub = billing_service.get_subscription(db, user_id)
    return {
        "success": True,
        "tier": sub.tier,
        "status": sub.status,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end": bool(sub.cancel_at_period_end),
    }


@router.get("/storage")
@user_limiter.limit("60/minute")
async def get_storage_usage(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id, _ = await _require_user(token)
    ok, info = billing_service.check_quota(db, user_id, want_bytes=0)
    info["within_quota"] = ok
    info["quotas"] = TIER_QUOTAS
    return {"success": True, **info}
