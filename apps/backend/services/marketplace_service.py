"""
Marketplace business logic (Phases 5 & 7).

Routers are thin FastAPI handlers; all DB queries, Stripe Connect calls, and
validation live here. Routers MUST call these methods via `MarketplaceService`
instead of talking to SQLAlchemy directly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from config import settings
from logging_config import get_logger
from models.marketplace_models import (  # noqa: I001 — ordered to avoid circular import
    CollabApplication,
    CollabListing,
    MusicianProfile,
    SampleListing,
    SamplePurchase,
)

logger = get_logger(__name__)


class MarketplaceService:
    """Facade for Sample + Collaboration marketplace operations."""

    # ── Sample listings ────────────────────────────────────────────────────

    def list_samples(
        self,
        db: Session,
        *,
        status: str = "active",
        limit: int = 20,
        offset: int = 0,
        tag: str | None = None,
    ) -> list[SampleListing]:
        q = db.query(SampleListing).filter(SampleListing.status == status)
        if tag:
            # Postgres ARRAY contains
            q = q.filter(SampleListing.tags.any(tag))  # type: ignore[attr-defined]
        return q.order_by(SampleListing.created_at.desc()).offset(offset).limit(limit).all()

    def create_sample(
        self,
        db: Session,
        seller_id: str,
        *,
        title: str,
        description: str | None,
        price_cents: int,
        r2_object_key: str,
        preview_r2_object_key: str | None = None,
        waveform_peaks_json: str | None = None,
        duration_seconds: float | None = None,
        bpm: int | None = None,
        key_sig: str | None = None,
        tags: list[str] | None = None,
    ) -> SampleListing:
        if price_cents < 0:
            raise ValueError("price_cents must be >= 0")
        if not title.strip():
            raise ValueError("title is required")

        listing = SampleListing(
            seller_id=seller_id,
            title=title.strip(),
            description=description,
            price_cents=price_cents,
            r2_object_key=r2_object_key,
            preview_r2_object_key=preview_r2_object_key,
            waveform_peaks_json=waveform_peaks_json,
            duration_seconds=duration_seconds,
            bpm=bpm,
            key_sig=key_sig,
            tags=tags,
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)
        return listing

    def record_sample_purchase(
        self,
        db: Session,
        *,
        listing_id: str,
        buyer_id: str,
        amount_cents: int,
        platform_fee_cents: int,
        payment_intent_id: str,
    ) -> SamplePurchase:
        listing = db.query(SampleListing).filter(SampleListing.id == listing_id).first()
        if listing is None:
            raise ValueError("listing not found")

        purchase = SamplePurchase(
            listing_id=listing_id,
            buyer_id=buyer_id,
            amount_cents=amount_cents,
            platform_fee_cents=platform_fee_cents,
            payment_intent_id=payment_intent_id,
            status="pending",
        )
        db.add(purchase)
        db.commit()
        db.refresh(purchase)
        return purchase

    def mark_purchase_paid(self, db: Session, payment_intent_id: str) -> SamplePurchase | None:
        purchase = (
            db.query(SamplePurchase)
            .filter(SamplePurchase.payment_intent_id == payment_intent_id)
            .first()
        )
        if purchase is None or purchase.status == "paid":
            return purchase
        purchase.status = "paid"
        listing = db.query(SampleListing).filter(SampleListing.id == purchase.listing_id).first()
        if listing:
            listing.purchase_count = (listing.purchase_count or 0) + 1
        db.commit()
        return purchase

    # ── Musician profiles (Phase 7) ────────────────────────────────────────

    def upsert_musician_profile(
        self,
        db: Session,
        user_id: str,
        *,
        headline: str | None = None,
        bio_md: str | None = None,
        hourly_rate_cents: int | None = None,
        skills: list[str] | None = None,
        portfolio_repo_ids: list[str] | None = None,
        accepting_work: bool | None = None,
    ) -> MusicianProfile:
        prof = db.query(MusicianProfile).filter(MusicianProfile.user_id == user_id).first()
        if prof is None:
            prof = MusicianProfile(user_id=user_id)
            db.add(prof)

        if headline is not None:
            prof.headline = headline
        if bio_md is not None:
            prof.bio_md = bio_md
        if hourly_rate_cents is not None:
            prof.hourly_rate_cents = max(0, hourly_rate_cents)
        if skills is not None:
            prof.skills = skills
        if portfolio_repo_ids is not None:
            prof.portfolio_repo_ids = portfolio_repo_ids
        if accepting_work is not None:
            prof.accepting_work = accepting_work

        db.commit()
        db.refresh(prof)
        return prof

    # ── Collaboration listings (bounties) ──────────────────────────────────

    def create_collab_listing(
        self,
        db: Session,
        buyer_id: str,
        *,
        title: str,
        description_md: str,
        budget_cents: int,
        currency: str = "USD",
        skills_wanted: list[str] | None = None,
        deadline_at: datetime | None = None,
    ) -> CollabListing:
        if budget_cents < 0:
            raise ValueError("budget_cents must be >= 0")
        listing = CollabListing(
            buyer_id=buyer_id,
            title=title.strip(),
            description_md=description_md,
            budget_cents=budget_cents,
            currency=currency.upper(),
            skills_wanted=skills_wanted,
            deadline_at=deadline_at,
        )
        db.add(listing)
        db.commit()
        db.refresh(listing)
        return listing

    def list_collab_listings(
        self,
        db: Session,
        *,
        status: str = "open",
        limit: int = 20,
        offset: int = 0,
    ) -> list[CollabListing]:
        return (
            db.query(CollabListing)
            .filter(CollabListing.status == status)
            .order_by(CollabListing.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def apply_to_listing(
        self,
        db: Session,
        listing_id: str,
        musician_id: str,
        *,
        cover_letter_md: str | None,
        proposed_rate_cents: int | None,
    ) -> CollabApplication:
        listing = db.query(CollabListing).filter(CollabListing.id == listing_id).first()
        if listing is None:
            raise ValueError("listing not found")
        if listing.status != "open":
            raise ValueError("listing is not accepting applications")

        # One application per musician per listing
        existing = (
            db.query(CollabApplication)
            .filter(
                CollabApplication.listing_id == listing_id,
                CollabApplication.musician_id == musician_id,
            )
            .first()
        )
        if existing is not None:
            return existing

        app = CollabApplication(
            listing_id=listing_id,
            musician_id=musician_id,
            cover_letter_md=cover_letter_md,
            proposed_rate_cents=proposed_rate_cents,
            status="submitted",
        )
        db.add(app)
        db.commit()
        db.refresh(app)
        return app

    def accept_application(
        self,
        db: Session,
        application_id: str,
        *,
        payment_intent_id: str,
    ) -> CollabApplication:
        """Mark application accepted + funds held in escrow (PI created upstream)."""
        app = db.query(CollabApplication).filter(CollabApplication.id == application_id).first()
        if app is None:
            raise ValueError("application not found")

        listing = db.query(CollabListing).filter(CollabListing.id == app.listing_id).first()
        if listing is None:
            raise ValueError("listing vanished")
        if listing.status != "open":
            raise ValueError("listing not open")

        app.status = "accepted"
        app.payment_intent_id = payment_intent_id
        app.escrow_status = "held"
        listing.status = "in_progress"
        listing.accepted_application_id = app.id
        db.commit()
        db.refresh(app)
        return app

    def deliver_application(
        self,
        db: Session,
        application_id: str,
        musician_id: str,
        *,
        delivery_repo_id: str,
        delivery_note_md: str | None,
    ) -> CollabApplication:
        app = db.query(CollabApplication).filter(CollabApplication.id == application_id).first()
        if app is None:
            raise ValueError("application not found")
        if app.musician_id != musician_id:
            raise PermissionError("only the hired musician can deliver")
        if app.status != "accepted":
            raise ValueError("application must be accepted first")

        app.status = "delivered"
        app.delivery_repo_id = delivery_repo_id
        app.delivery_note_md = delivery_note_md
        app.delivered_at = datetime.now(UTC)
        db.commit()
        db.refresh(app)
        return app

    def approve_deliverable(
        self,
        db: Session,
        application_id: str,
        buyer_id: str,
    ) -> CollabApplication:
        """Buyer accepts deliverable; caller is expected to capture the PI."""
        app = db.query(CollabApplication).filter(CollabApplication.id == application_id).first()
        if app is None:
            raise ValueError("application not found")
        listing = db.query(CollabListing).filter(CollabListing.id == app.listing_id).first()
        if listing is None or listing.buyer_id != buyer_id:
            raise PermissionError("only the listing buyer can approve")
        if app.status != "delivered":
            raise ValueError("application must be delivered first")

        app.status = "approved"
        app.escrow_status = "captured"
        app.approved_at = datetime.now(UTC)
        listing.status = "approved"
        db.commit()
        db.refresh(app)
        return app


marketplace_service = MarketplaceService()


# ── Stripe Connect escrow helpers ───────────────────────────────────────────
#
# Escrow is implemented with **manual-capture PaymentIntents on a Connect
# destination charge**:
#
#     1. Accept application      -> PaymentIntent(capture_method='manual')
#                                   authorizes card, funds marked "held"
#     2. Musician delivers       -> no-op on Stripe side
#     3. Buyer approves          -> PaymentIntent.capture() releases funds
#                                   to the musician's connected account
#                                   minus the platform fee
#     4. Buyer disputes/refunds  -> PaymentIntent.cancel()
#
# Stripe holds the money; Soundhaus is not a money transmitter.


def stripe_configured() -> bool:
    return bool(settings.stripe_secret_key)


def _stripe():
    if not settings.stripe_secret_key:
        raise RuntimeError("Stripe not configured (set STRIPE_SECRET_KEY)")
    import stripe  # type: ignore[import-untyped]

    stripe.api_key = settings.stripe_secret_key
    return stripe


class ConnectService:
    """Thin Stripe Connect wrapper used by both the router and worker jobs."""

    def ensure_connect_account(self, db: Session, user_id: str, email: str | None) -> str:
        """Return a Stripe Connect account id for this musician, creating
        one on first call. Persists the id on the MusicianProfile row.
        """
        prof = db.query(MusicianProfile).filter(MusicianProfile.user_id == user_id).first()
        if prof is None:
            prof = MusicianProfile(user_id=user_id)
            db.add(prof)
            db.flush()
        if prof.stripe_connect_account_id:
            return prof.stripe_connect_account_id

        stripe = _stripe()
        acct = stripe.Account.create(type="standard", email=email)
        prof.stripe_connect_account_id = acct["id"]
        db.commit()
        return acct["id"]

    def build_onboarding_link(self, account_id: str, return_url: str) -> str:
        stripe = _stripe()
        link = stripe.AccountLink.create(
            account=account_id,
            refresh_url=return_url,
            return_url=return_url,
            type="account_onboarding",
        )
        return link["url"]

    def create_escrow_payment_intent(
        self,
        *,
        amount_cents: int,
        currency: str,
        connected_account_id: str,
        platform_fee_cents: int,
        metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Authorize but do not capture. Returns the PI object."""
        stripe = _stripe()
        return stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency.lower(),
            capture_method="manual",
            application_fee_amount=platform_fee_cents,
            transfer_data={"destination": connected_account_id},
            metadata=metadata or {},
        )

    def capture_escrow_payment(self, payment_intent_id: str) -> dict[str, Any]:
        stripe = _stripe()
        return stripe.PaymentIntent.capture(payment_intent_id)

    def refund_escrow_payment(self, payment_intent_id: str, reason: str = "requested_by_customer") -> dict[str, Any]:
        stripe = _stripe()
        return stripe.PaymentIntent.cancel(payment_intent_id, cancellation_reason=reason)


connect_service = ConnectService()


def build_connect_account_link_request(_account_id: str, _return_url: str) -> dict[str, Any]:
    """Deprecated shim kept for backwards compat; prefer `connect_service`."""
    return {
        "account": _account_id,
        "refresh_url": _return_url,
        "return_url": _return_url,
        "type": "account_onboarding",
    }
