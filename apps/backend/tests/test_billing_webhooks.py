"""
Integration tests for the Stripe webhook pipeline (Phase 6).

We bypass the real Stripe SDK via `mock_stripe` and drive
`billing_service.handle_webhook` directly with synthetic payloads. This is
the same surface Stripe hits in production — we just replace the lazy SDK
loader with the in-memory double.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest

from models.billing_models import Subscription
from services.billing_service import billing_service


@pytest.fixture(autouse=True)
def _configure_stripe(monkeypatch, mock_stripe):
    """Point billing_service at the in-memory Stripe double."""
    monkeypatch.setattr(billing_service, "_stripe", lambda: mock_stripe)
    # Avoid the "webhook secret not configured" guardrail.
    from config import settings

    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test", raising=False)
    monkeypatch.setattr(settings, "stripe_price_pro", "price_pro_monthly", raising=False)
    monkeypatch.setattr(settings, "stripe_price_team", "price_team_monthly", raising=False)
    yield


def _seed_subscription(db, user_id: str, customer_id: str) -> Subscription:
    sub = Subscription(
        user_id=user_id,
        stripe_customer_id=customer_id,
        tier="free",
        status="inactive",
    )
    db.add(sub)
    db.commit()
    return sub


def test_checkout_session_completed_activates_subscription(db_session):
    _seed_subscription(db_session, user_id="u1", customer_id="cus_1")
    payload = json.dumps(
        {
            "id": "evt_1",
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "client_reference_id": "u1",
                    "customer": "cus_1",
                    "subscription": "sub_1",
                }
            },
        }
    ).encode()

    billing_service.handle_webhook(db_session, payload, sig_header="test")

    db_session.expire_all()
    sub = db_session.query(Subscription).filter_by(user_id="u1").first()
    assert sub is not None
    assert sub.stripe_subscription_id == "sub_1"
    assert sub.status == "active"


def test_subscription_updated_sets_tier_from_price(db_session):
    _seed_subscription(db_session, user_id="u2", customer_id="cus_2")
    cpe_ts = int((datetime.now(UTC) + timedelta(days=30)).timestamp())

    payload = json.dumps(
        {
            "id": "evt_2",
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_2",
                    "customer": "cus_2",
                    "status": "active",
                    "cancel_at_period_end": False,
                    "current_period_end": cpe_ts,
                    "items": {"data": [{"price": {"id": "price_pro_monthly"}}]},
                }
            },
        }
    ).encode()

    billing_service.handle_webhook(db_session, payload, sig_header="test")

    db_session.expire_all()
    sub = db_session.query(Subscription).filter_by(user_id="u2").first()
    assert sub.tier == "pro"
    assert sub.status == "active"


def test_subscription_deleted_reverts_to_free(db_session):
    _seed_subscription(db_session, user_id="u3", customer_id="cus_3")
    db_session.query(Subscription).filter_by(user_id="u3").update({"tier": "team", "status": "active"})
    db_session.commit()

    payload = json.dumps(
        {
            "id": "evt_3",
            "type": "customer.subscription.deleted",
            "data": {"object": {"id": "sub_3", "customer": "cus_3"}},
        }
    ).encode()

    billing_service.handle_webhook(db_session, payload, sig_header="test")

    db_session.expire_all()
    sub = db_session.query(Subscription).filter_by(user_id="u3").first()
    assert sub.tier == "free"
    assert sub.status == "canceled"


def test_invoice_payment_failed_marks_past_due(db_session):
    _seed_subscription(db_session, user_id="u4", customer_id="cus_4")
    db_session.query(Subscription).filter_by(user_id="u4").update({"status": "active"})
    db_session.commit()

    payload = json.dumps(
        {
            "id": "evt_4",
            "type": "invoice.payment_failed",
            "data": {"object": {"customer": "cus_4"}},
        }
    ).encode()

    billing_service.handle_webhook(db_session, payload, sig_header="test")

    db_session.expire_all()
    sub = db_session.query(Subscription).filter_by(user_id="u4").first()
    assert sub.status == "past_due"


def test_tier_helpers(db_session):
    _seed_subscription(db_session, user_id="u5", customer_id="cus_5")
    db_session.query(Subscription).filter_by(user_id="u5").update(
        {"tier": "pro", "status": "active"}
    )
    db_session.commit()

    assert billing_service.user_tier(db_session, "u5") == "pro"
    assert billing_service.has_tier(db_session, "u5", "pro") is True
    assert billing_service.has_tier(db_session, "u5", "team") is False
    assert billing_service.has_tier(db_session, "u5", "free") is True
