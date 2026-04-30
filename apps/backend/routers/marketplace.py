"""
Marketplace HTTP surface (Phases 5 & 7).

Two product lines share this router prefix to keep the URL tree shallow:

    /marketplace/samples/*       — Sample Marketplace (Phase 5)
    /marketplace/collab/*        — Collaboration Marketplace / hired musicians (Phase 7)
    /marketplace/musicians/*     — Musician profiles (Phase 7)

All handlers are thin: they authenticate, validate, then call into
`services.marketplace_service`. See models/marketplace_models.py for the
schema and services/marketplace_service.py for business logic.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from config import settings
from database import get_db
from dependencies import get_auth, user_limiter, verify_token
from fastapi import APIRouter, Depends, HTTPException, Request
from logging_config import get_logger
from models.marketplace_models import CollabApplication, CollabListing, MusicianProfile
from services.marketplace_service import (
    connect_service,
    marketplace_service,
    stripe_configured,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


# ── Pydantic models ─────────────────────────────────────────────────────────


class CreateSampleListingRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    price_cents: int = Field(..., ge=0)
    r2_object_key: str = Field(..., min_length=1)
    preview_r2_object_key: str | None = None
    waveform_peaks_json: str | None = None
    duration_seconds: float | None = None
    bpm: int | None = Field(default=None, ge=20, le=400)
    key_sig: str | None = None
    tags: list[str] | None = None


class UpsertMusicianProfileRequest(BaseModel):
    headline: str | None = Field(default=None, max_length=120)
    bio_md: str | None = None
    hourly_rate_cents: int | None = Field(default=None, ge=0)
    skills: list[str] | None = None
    portfolio_repo_ids: list[str] | None = None
    accepting_work: bool | None = None


class CreateCollabListingRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: str = Field(..., min_length=1)
    budget_cents: int = Field(..., ge=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    skills_wanted: list[str] | None = None
    deadline_at: datetime | None = None


class ApplyToListingRequest(BaseModel):
    cover_letter_md: str | None = None
    proposed_rate_cents: int | None = Field(default=None, ge=0)


class DeliverApplicationRequest(BaseModel):
    delivery_repo_id: str = Field(..., min_length=1)
    delivery_note_md: str | None = None


class AcceptApplicationRequest(BaseModel):
    """Buyer-side parameters when accepting a musician's application.

    `amount_cents` overrides the listing budget if the buyer agrees to the
    musician's proposed rate. Funds are authorized (not captured) on accept
    and captured only when the buyer approves delivery.
    """

    amount_cents: int = Field(..., ge=100, description="Escrow amount in cents")


# ── Helpers ─────────────────────────────────────────────────────────────────


async def _require_user(token: str) -> tuple[str, str | None]:
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Invalid session")
    u = user_res["user"]
    return str(u["id"]), u.get("email")


# Platform fee bps (basis points). 1000 bps = 10%. Configurable via env later.
PLATFORM_FEE_BPS = 1000


def _platform_fee(amount_cents: int) -> int:
    return max(1, (amount_cents * PLATFORM_FEE_BPS) // 10_000)


# ── Sample Marketplace ──────────────────────────────────────────────────────


@router.get("/samples")
@user_limiter.limit("120/minute")
async def list_samples(
    request: Request,
    tag: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Browse active sample listings. Public — no auth required."""
    rows = marketplace_service.list_samples(db, tag=tag, limit=min(limit, 100), offset=max(0, offset))
    return {
        "success": True,
        "samples": [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "price_cents": r.price_cents,
                "currency": r.currency,
                "seller_id": r.seller_id,
                "duration_seconds": r.duration_seconds,
                "bpm": r.bpm,
                "key_sig": r.key_sig,
                "tags": r.tags or [],
                "purchase_count": r.purchase_count,
                "preview_r2_object_key": r.preview_r2_object_key,
            }
            for r in rows
        ],
    }


@router.post("/samples")
@user_limiter.limit("30/minute")
async def create_sample_listing(
    request: Request,
    body: CreateSampleListingRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    seller_id, _ = await _require_user(token)
    try:
        listing = marketplace_service.create_sample(
            db,
            seller_id,
            title=body.title,
            description=body.description,
            price_cents=body.price_cents,
            r2_object_key=body.r2_object_key,
            preview_r2_object_key=body.preview_r2_object_key,
            waveform_peaks_json=body.waveform_peaks_json,
            duration_seconds=body.duration_seconds,
            bpm=body.bpm,
            key_sig=body.key_sig,
            tags=body.tags,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info("sample_listing_created", id=listing.id, seller=seller_id)
    return {"success": True, "listing_id": listing.id}


# ── Musician profiles ───────────────────────────────────────────────────────


@router.put("/musicians/me")
@user_limiter.limit("30/minute")
async def upsert_my_musician_profile(
    request: Request,
    body: UpsertMusicianProfileRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    user_id, _ = await _require_user(token)
    prof = marketplace_service.upsert_musician_profile(
        db,
        user_id,
        headline=body.headline,
        bio_md=body.bio_md,
        hourly_rate_cents=body.hourly_rate_cents,
        skills=body.skills,
        portfolio_repo_ids=body.portfolio_repo_ids,
        accepting_work=body.accepting_work,
    )
    return {
        "success": True,
        "profile": {
            "user_id": prof.user_id,
            "headline": prof.headline,
            "hourly_rate_cents": prof.hourly_rate_cents,
            "skills": prof.skills or [],
            "portfolio_repo_ids": prof.portfolio_repo_ids or [],
            "accepting_work": prof.accepting_work,
            "connect_onboarding_complete": prof.connect_onboarding_complete,
        },
    }


# ── Collaboration Marketplace ───────────────────────────────────────────────


@router.get("/collab/listings")
@user_limiter.limit("120/minute")
async def list_collab_listings(
    request: Request,
    status: str = "open",
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    rows = marketplace_service.list_collab_listings(
        db,
        status=status,
        limit=min(limit, 100),
        offset=max(0, offset),
    )
    return {
        "success": True,
        "listings": [
            {
                "id": r.id,
                "buyer_id": r.buyer_id,
                "title": r.title,
                "budget_cents": r.budget_cents,
                "currency": r.currency,
                "skills_wanted": r.skills_wanted or [],
                "deadline_at": r.deadline_at.isoformat() if r.deadline_at else None,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.post("/collab/listings")
@user_limiter.limit("20/minute")
async def create_collab_listing(
    request: Request,
    body: CreateCollabListingRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    buyer_id, _ = await _require_user(token)
    listing = marketplace_service.create_collab_listing(
        db,
        buyer_id,
        title=body.title,
        description_md=body.description_md,
        budget_cents=body.budget_cents,
        currency=body.currency,
        skills_wanted=body.skills_wanted,
        deadline_at=body.deadline_at,
    )
    return {"success": True, "listing_id": listing.id}


@router.post("/collab/listings/{listing_id}/apply")
@user_limiter.limit("30/minute")
async def apply_to_listing(
    request: Request,
    listing_id: str,
    body: ApplyToListingRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    musician_id, _ = await _require_user(token)
    try:
        app = marketplace_service.apply_to_listing(
            db,
            listing_id,
            musician_id,
            cover_letter_md=body.cover_letter_md,
            proposed_rate_cents=body.proposed_rate_cents,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "application_id": app.id, "status": app.status}


@router.post("/collab/applications/{application_id}/deliver")
@user_limiter.limit("30/minute")
async def deliver_application(
    request: Request,
    application_id: str,
    body: DeliverApplicationRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    musician_id, _ = await _require_user(token)
    try:
        app = marketplace_service.deliver_application(
            db,
            application_id,
            musician_id,
            delivery_repo_id=body.delivery_repo_id,
            delivery_note_md=body.delivery_note_md,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "status": app.status}


@router.post("/collab/applications/{application_id}/accept")
@user_limiter.limit("30/minute")
async def accept_application(
    request: Request,
    application_id: str,
    body: AcceptApplicationRequest,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Buyer accepts an application and funds the escrow.

    Creates a manual-capture Stripe PaymentIntent against the musician's
    Connect account. Funds are authorized only — they are captured on
    delivery approval.
    """
    buyer_id, _ = await _require_user(token)
    # Load application + musician profile for Connect account lookup
    app = db.query(CollabApplication).filter(CollabApplication.id == application_id).first()
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    listing = db.query(CollabListing).filter(CollabListing.id == app.listing_id).first()
    if listing is None or listing.buyer_id != buyer_id:
        raise HTTPException(status_code=403, detail="Only the listing buyer can accept")

    musician_prof = db.query(MusicianProfile).filter(MusicianProfile.user_id == app.musician_id).first()
    if musician_prof is None or not musician_prof.stripe_connect_account_id:
        raise HTTPException(
            status_code=409,
            detail="Musician has not finished Stripe Connect onboarding",
        )

    if not stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe not configured")

    fee = _platform_fee(body.amount_cents)
    try:
        pi = connect_service.create_escrow_payment_intent(
            amount_cents=body.amount_cents,
            currency=listing.currency,
            connected_account_id=musician_prof.stripe_connect_account_id,
            platform_fee_cents=fee,
            metadata={
                "application_id": app.id,
                "listing_id": listing.id,
                "buyer_id": buyer_id,
                "musician_id": app.musician_id,
            },
        )
    except Exception as exc:
        logger.warning("stripe_pi_create_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Failed to create escrow PaymentIntent") from exc

    try:
        updated = marketplace_service.accept_application(db, application_id, payment_intent_id=pi["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "success": True,
        "status": updated.status,
        "payment_intent_id": pi["id"],
        "client_secret": pi.get("client_secret"),
        "amount_cents": body.amount_cents,
        "platform_fee_cents": fee,
    }


@router.post("/collab/applications/{application_id}/approve")
@user_limiter.limit("30/minute")
async def approve_application(
    request: Request,
    application_id: str,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Approve a delivered application and capture the escrow PaymentIntent.

    Flow:
        1. Flip application/listing status via the service.
        2. Capture the PI on Stripe — funds transfer to the musician's Connect
           account minus the platform fee.
        3. On any Stripe failure we keep the status at `delivered` and return
           502, prompting the buyer to retry.
    """
    buyer_id, _ = await _require_user(token)
    app = db.query(CollabApplication).filter(CollabApplication.id == application_id).first()
    if app is None:
        raise HTTPException(status_code=404, detail="Application not found")
    pi_id = app.payment_intent_id

    try:
        updated = marketplace_service.approve_deliverable(db, application_id, buyer_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if pi_id and stripe_configured():
        try:
            connect_service.capture_escrow_payment(pi_id)
        except Exception as exc:
            logger.error("stripe_pi_capture_failed", pi=pi_id, error=str(exc))
            raise HTTPException(status_code=502, detail="Escrow capture failed — please retry") from exc

    return {"success": True, "status": updated.status, "payment_intent_id": pi_id}


# ── Stripe Connect onboarding ───────────────────────────────────────────────


@router.post("/musicians/connect/onboarding")
@user_limiter.limit("10/minute")
async def start_connect_onboarding(
    request: Request,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Return a Stripe Connect onboarding URL for the current musician.

    On first call creates the Connect account; returned URL expires in ~5min.
    """
    user_id, email = await _require_user(token)
    if not stripe_configured():
        raise HTTPException(status_code=503, detail="Stripe not configured")
    try:
        account_id = connect_service.ensure_connect_account(db, user_id, email)
        return_url = settings.stripe_connect_return_url or settings.stripe_portal_return_url
        url = connect_service.build_onboarding_link(account_id, return_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"success": True, "url": url, "account_id": account_id}
