"""
Stripe billing service (Phase 6).

Responsibilities:
    - Map Stripe webhook events to Subscription row updates.
    - Build Checkout / Customer Portal sessions.
    - Enforce per-tier quotas (storage bytes, private repo count).

Routers (`routers/billing.py`) are thin — they delegate every operation here.

The module imports `stripe` lazily so existing `pip install -r requirements.txt`
users who haven't added stripe yet still get import success on cold start.
"""

from __future__ import annotations

from datetime import UTC
from typing import Any

from sqlalchemy.orm import Session

from config import settings
from logging_config import get_logger
from models.billing_models import StorageUsage, Subscription

logger = get_logger(__name__)


# ── Tier table ──────────────────────────────────────────────────────────────

TIER_QUOTAS: dict[str, dict[str, Any]] = {
    "free": {"storage_bytes": 1 * 1024**3, "private_repos": 1, "classroom_seats": 0},
    "pro": {"storage_bytes": 25 * 1024**3, "private_repos": 25, "classroom_seats": 0},
    "team": {"storage_bytes": 200 * 1024**3, "private_repos": 500, "classroom_seats": 100},
}

TIER_RANK = {"free": 0, "pro": 1, "team": 2}


def _tier_from_price_id(price_id: str | None) -> str:
    if price_id and settings.stripe_price_team and price_id == settings.stripe_price_team:
        return "team"
    if price_id and settings.stripe_price_pro and price_id == settings.stripe_price_pro:
        return "pro"
    return "free"


class BillingService:
    """Facade over Stripe + subscription bookkeeping."""

    def _stripe(self):
        """Lazy import the official Stripe SDK."""
        if not settings.stripe_secret_key:
            raise RuntimeError("Stripe not configured (set STRIPE_SECRET_KEY)")
        import stripe  # type: ignore[import-untyped]

        stripe.api_key = settings.stripe_secret_key
        return stripe

    # ── Repository lookups ────────────────────────────────────────────────

    def get_subscription(self, db: Session, user_id: str) -> Subscription:
        sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
        if sub is None:
            sub = Subscription(user_id=user_id, tier="free", status="inactive")
            db.add(sub)
            db.commit()
            db.refresh(sub)
        return sub

    def user_tier(self, db: Session, user_id: str) -> str:
        sub = self.get_subscription(db, user_id)
        # Expired? Fall back to free.
        if sub.status not in ("active", "trialing"):
            return "free"
        return sub.tier or "free"

    def has_tier(self, db: Session, user_id: str, required: str) -> bool:
        return TIER_RANK.get(self.user_tier(db, user_id), 0) >= TIER_RANK.get(required, 0)

    # ── Storage quota ─────────────────────────────────────────────────────

    def _usage(self, db: Session, user_id: str) -> StorageUsage:
        row = db.query(StorageUsage).filter(StorageUsage.user_id == user_id).first()
        if row is None:
            row = StorageUsage(user_id=user_id, bytes_used=0)
            db.add(row)
            db.commit()
            db.refresh(row)
        return row

    def add_usage(self, db: Session, user_id: str, delta_bytes: int) -> int:
        row = self._usage(db, user_id)
        row.bytes_used = max(0, (row.bytes_used or 0) + int(delta_bytes))
        db.commit()
        return int(row.bytes_used)

    def check_quota(self, db: Session, user_id: str, want_bytes: int = 0) -> tuple[bool, dict[str, Any]]:
        tier = self.user_tier(db, user_id)
        quota = TIER_QUOTAS[tier]["storage_bytes"]
        used = self._usage(db, user_id).bytes_used or 0
        ok = (used + want_bytes) <= quota
        return ok, {"tier": tier, "bytes_used": int(used), "quota_bytes": int(quota)}

    # ── Stripe Checkout / Portal ──────────────────────────────────────────

    def build_checkout_session(
        self,
        db: Session,
        user_id: str,
        email: str | None,
        price_id: str,
    ) -> dict[str, Any]:
        stripe = self._stripe()
        sub = self.get_subscription(db, user_id)

        # Create a Stripe Customer on first checkout (persist for portal reuse)
        if not sub.stripe_customer_id:
            customer = stripe.Customer.create(email=email, metadata={"soundhaus_user_id": user_id})
            sub.stripe_customer_id = customer["id"]
            db.commit()

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=sub.stripe_customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=settings.stripe_checkout_success_url,
            cancel_url=settings.stripe_checkout_cancel_url,
            client_reference_id=user_id,
            allow_promotion_codes=True,
        )
        return {"url": session["url"], "session_id": session["id"]}

    def build_portal_session(self, db: Session, user_id: str) -> dict[str, Any]:
        stripe = self._stripe()
        sub = self.get_subscription(db, user_id)
        if not sub.stripe_customer_id:
            raise ValueError("No Stripe customer on file — start with a Checkout first")
        portal = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=settings.stripe_portal_return_url,
        )
        return {"url": portal["url"]}

    # ── Webhook event dispatcher ──────────────────────────────────────────

    def handle_webhook(self, db: Session, payload: bytes, sig_header: str) -> dict[str, Any]:
        stripe = self._stripe()
        if not settings.stripe_webhook_secret:
            raise RuntimeError("Stripe webhook secret not configured")
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
        event_type = event["type"]
        data = event["data"]["object"]
        logger.info("stripe_event", event_type=event_type, event_id=event.get("id"))

        if event_type == "checkout.session.completed":
            self._apply_checkout_complete(db, data)
        elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
            self._apply_subscription_object(db, data)
        elif event_type == "customer.subscription.deleted":
            self._apply_subscription_deleted(db, data)
        elif event_type == "invoice.paid":
            self._apply_invoice_paid(db, data)
        elif event_type == "invoice.payment_failed":
            self._apply_invoice_failed(db, data)
        else:
            logger.debug("stripe_event_ignored", event_type=event_type)

        return {"ok": True, "event_type": event_type}

    def _sub_row_by_customer(self, db: Session, customer_id: str) -> Subscription | None:
        return (
            db.query(Subscription)
            .filter(Subscription.stripe_customer_id == customer_id)
            .first()
        )

    def _apply_checkout_complete(self, db: Session, session_obj: dict[str, Any]) -> None:
        user_id = session_obj.get("client_reference_id")
        customer_id = session_obj.get("customer")
        sub_id = session_obj.get("subscription")
        if not user_id or not customer_id:
            return
        sub = self.get_subscription(db, user_id)
        sub.stripe_customer_id = customer_id
        if sub_id:
            sub.stripe_subscription_id = sub_id
        sub.status = "active"
        db.commit()

    def _apply_subscription_object(self, db: Session, sub_obj: dict[str, Any]) -> None:
        from datetime import datetime

        sub_id = sub_obj.get("id")
        customer_id = sub_obj.get("customer")
        if not sub_id or not customer_id:
            return
        row = self._sub_row_by_customer(db, customer_id)
        if row is None:
            return
        items = (sub_obj.get("items") or {}).get("data") or []
        price_id = items[0].get("price", {}).get("id") if items else None
        row.stripe_subscription_id = sub_id
        row.stripe_price_id = price_id
        row.tier = _tier_from_price_id(price_id)
        row.status = sub_obj.get("status", "active")
        row.cancel_at_period_end = 1 if sub_obj.get("cancel_at_period_end") else 0
        cpe = sub_obj.get("current_period_end")
        if cpe is not None:
            row.current_period_end = datetime.fromtimestamp(cpe, tz=UTC)
        db.commit()

    def _apply_subscription_deleted(self, db: Session, sub_obj: dict[str, Any]) -> None:
        customer_id = sub_obj.get("customer")
        if not customer_id:
            return
        row = self._sub_row_by_customer(db, customer_id)
        if row is None:
            return
        row.status = "canceled"
        row.tier = "free"
        db.commit()

    def _apply_invoice_paid(self, db: Session, _invoice_obj: dict[str, Any]) -> None:
        # Stripe will emit a subsequent `customer.subscription.updated` that
        # actually moves status/period_end forward, so this is informational.
        return

    def _apply_invoice_failed(self, db: Session, invoice_obj: dict[str, Any]) -> None:
        customer_id = invoice_obj.get("customer")
        if not customer_id:
            return
        row = self._sub_row_by_customer(db, customer_id)
        if row is None:
            return
        # Keep whatever status Stripe sent via subscription.updated, but flag if needed.
        row.status = "past_due"
        db.commit()


billing_service = BillingService()
