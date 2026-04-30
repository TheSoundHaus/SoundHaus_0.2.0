"""
Unit tests for MarketplaceService escrow lifecycle (Phase 7).

These tests exercise the service layer directly — no Stripe calls; the
actual PI creation/capture is tested separately in the billing webhook
suite via the `mock_stripe` fixture.
"""

from __future__ import annotations

from models.marketplace_models import (
    CollabApplication,
    CollabListing,
    MusicianProfile,
)
from services.marketplace_service import marketplace_service


def test_create_and_apply_flow(db_session):
    buyer_id = "buyer-1"
    musician_id = "musician-1"

    listing = marketplace_service.create_collab_listing(
        db_session,
        buyer_id,
        title="Mix my indie track",
        description_md="Need a mix, 8 stems",
        budget_cents=25_000,
    )
    assert listing.id
    assert listing.status == "open"

    app = marketplace_service.apply_to_listing(
        db_session,
        listing.id,
        musician_id,
        cover_letter_md="I'll take it",
        proposed_rate_cents=20_000,
    )
    assert app.status == "submitted"

    # Duplicate apply is idempotent
    app2 = marketplace_service.apply_to_listing(
        db_session,
        listing.id,
        musician_id,
        cover_letter_md="again",
        proposed_rate_cents=None,
    )
    assert app.id == app2.id


def test_accept_and_deliver_and_approve(db_session):
    buyer_id = "buyer-2"
    musician_id = "musician-2"

    listing = marketplace_service.create_collab_listing(
        db_session, buyer_id, title="x", description_md="y", budget_cents=10_000
    )
    app = marketplace_service.apply_to_listing(
        db_session, listing.id, musician_id, cover_letter_md=None, proposed_rate_cents=None
    )

    # Accept (simulate escrow PI id from Stripe)
    accepted = marketplace_service.accept_application(db_session, app.id, payment_intent_id="pi_test_1")
    assert accepted.status == "accepted"
    assert accepted.escrow_status == "held"
    assert accepted.payment_intent_id == "pi_test_1"

    listing_refreshed = db_session.query(CollabListing).filter_by(id=listing.id).first()
    assert listing_refreshed.status == "in_progress"
    assert listing_refreshed.accepted_application_id == app.id

    # Musician delivers
    delivered = marketplace_service.deliver_application(
        db_session,
        app.id,
        musician_id,
        delivery_repo_id="musician-2/deliver-repo",
        delivery_note_md="Here you go",
    )
    assert delivered.status == "delivered"
    assert delivered.delivered_at is not None

    # Random user cannot approve
    try:
        marketplace_service.approve_deliverable(db_session, app.id, "someone-else")
        raise AssertionError("should have raised PermissionError")
    except PermissionError:
        pass

    approved = marketplace_service.approve_deliverable(db_session, app.id, buyer_id)
    assert approved.status == "approved"
    assert approved.escrow_status == "captured"


def test_musician_profile_upsert(db_session):
    prof = marketplace_service.upsert_musician_profile(
        db_session,
        "musician-3",
        headline="Session drummer",
        hourly_rate_cents=5_000,
        skills=["drums", "percussion"],
    )
    assert prof.headline == "Session drummer"
    assert prof.skills == ["drums", "percussion"]

    prof2 = marketplace_service.upsert_musician_profile(
        db_session, "musician-3", hourly_rate_cents=6_000
    )
    # Updated, not duplicated
    rows = db_session.query(MusicianProfile).filter_by(user_id="musician-3").all()
    assert len(rows) == 1
    assert prof2.hourly_rate_cents == 6_000
    # Previously-set fields are retained
    assert prof2.headline == "Session drummer"


def test_cannot_apply_to_nonopen_listing(db_session):
    listing = marketplace_service.create_collab_listing(
        db_session, "b", title="x", description_md="y", budget_cents=1_000
    )
    app = marketplace_service.apply_to_listing(
        db_session, listing.id, "m1", cover_letter_md=None, proposed_rate_cents=None
    )
    marketplace_service.accept_application(db_session, app.id, payment_intent_id="pi_x")

    # Now listing is in_progress — new apply should fail
    try:
        marketplace_service.apply_to_listing(
            db_session, listing.id, "m2", cover_letter_md=None, proposed_rate_cents=None
        )
        raise AssertionError("should have raised ValueError")
    except ValueError:
        pass

    # sanity: only one CollabApplication row survived
    n = db_session.query(CollabApplication).filter_by(listing_id=listing.id).count()
    assert n == 1
