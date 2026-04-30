"""
Marketplace models — Phases 5 & 7.

Phase 5 — Sample Marketplace (sellers upload loops / stems / one-shots for sale):
    SampleListing:    ownable digital-good listing.
    SamplePurchase:   record of a paid download (Stripe PaymentIntent id).

Phase 7 — Collaboration Marketplace (hire a musician):
    CollabListing:    a "project request" / bounty posted by a buyer.
    CollabApplication: a musician's response + escrow reference.
    MusicianProfile:  seller-facing profile extending the core `profiles` row.

All monetary fields are stored as integer cents to avoid FP drift.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base

# ── Phase 5: Sample Marketplace ─────────────────────────────────────────────


class SampleListing(Base):
    """A single sample / loop / stem listed for sale."""

    __tablename__ = "sample_listings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    seller_id = Column(String(255), nullable=False, index=True)  # Supabase UUID
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    price_cents = Column(Integer, nullable=False, default=0)  # 0 = free
    currency = Column(String(3), nullable=False, default="USD")

    # Storage reference — Cloudflare R2 object key (Phase 5 migration target).
    r2_object_key = Column(String(500), nullable=False)
    preview_r2_object_key = Column(String(500), nullable=True)  # low-bitrate watermarked preview
    waveform_peaks_json = Column(Text, nullable=True)  # JSON-encoded peak array for preview

    # Derived metadata
    duration_seconds = Column(Float, nullable=True)
    bpm = Column(Integer, nullable=True)
    key_sig = Column(String(8), nullable=True)  # e.g. "Am", "F#"
    tags = Column(ARRAY(String), nullable=True)

    status = Column(String(16), nullable=False, default="active")  # active / paused / removed
    purchase_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    purchases = relationship("SamplePurchase", back_populates="listing", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_sample_listings_status_created_at", "status", "created_at"),
    )


class SamplePurchase(Base):
    """A single paid download of a SampleListing.

    Payment goes through Stripe Connect (destination=seller_connect_account_id)
    with the platform taking an application_fee. The `payment_intent_id` field
    is the source of truth — Stripe webhooks flip `status` between
    `pending` -> `paid` / `refunded`.
    """

    __tablename__ = "sample_purchases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id = Column(String(36), ForeignKey("sample_listings.id", ondelete="CASCADE"), nullable=False, index=True)
    buyer_id = Column(String(255), nullable=False, index=True)

    amount_cents = Column(Integer, nullable=False)
    platform_fee_cents = Column(Integer, nullable=False, default=0)

    payment_intent_id = Column(String(255), unique=True, nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    refunded_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    listing = relationship("SampleListing", back_populates="purchases")


# ── Phase 7: Collaboration Marketplace ──────────────────────────────────────


class MusicianProfile(Base):
    """Seller-facing profile. Extends `profiles` 1:1 via `user_id`.

    Links to existing Soundhaus repos via `portfolio_repo_ids` so a buyer can
    preview the musician's MIDI/audio work from the same metadata system.
    """

    __tablename__ = "musician_profiles"

    user_id = Column(String(255), primary_key=True)  # -> profiles.id
    headline = Column(String(120), nullable=True)  # e.g. "Session drummer · trap/r&b"
    bio_md = Column(Text, nullable=True)
    hourly_rate_cents = Column(Integer, nullable=True)
    skills = Column(ARRAY(String), nullable=True)  # e.g. ["mixing", "drum programming"]
    portfolio_repo_ids = Column(ARRAY(String), nullable=True)  # repo_data.gitea_id strings

    # Stripe Connect
    stripe_connect_account_id = Column(String(255), nullable=True, unique=True)
    connect_onboarding_complete = Column(Boolean, default=False, nullable=False)

    accepting_work = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CollabListing(Base):
    """A 'project request' / bounty posted by a buyer."""

    __tablename__ = "collab_listings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    buyer_id = Column(String(255), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description_md = Column(Text, nullable=False)
    budget_cents = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    skills_wanted = Column(ARRAY(String), nullable=True)
    deadline_at = Column(DateTime(timezone=True), nullable=True)

    # Lifecycle: open / in_progress / delivered / approved / cancelled / disputed
    status = Column(String(16), nullable=False, default="open", index=True)

    # Which application was accepted (one hire per listing)
    accepted_application_id = Column(String(36), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    applications = relationship("CollabApplication", back_populates="listing", cascade="all, delete-orphan")


class CollabApplication(Base):
    """A musician's response to a CollabListing.

    Escrow model: on accept, we create a Stripe PaymentIntent with
    `capture_method=manual` against the buyer's card. The PI sits uncaptured
    (funds held). On `approve_deliverable` we capture; on dispute we cancel
    (funds released to the buyer).
    """

    __tablename__ = "collab_applications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id = Column(String(36), ForeignKey("collab_listings.id", ondelete="CASCADE"), nullable=False, index=True)
    musician_id = Column(String(255), nullable=False, index=True)

    cover_letter_md = Column(Text, nullable=True)
    proposed_rate_cents = Column(Integer, nullable=True)

    # Lifecycle: submitted / accepted / delivered / approved / rejected
    status = Column(String(16), nullable=False, default="submitted")

    # Escrow
    payment_intent_id = Column(String(255), nullable=True, unique=True)
    escrow_status = Column(String(16), nullable=True)  # held / captured / refunded

    # Deliverable — a pointer to the musician's private delivery repo (a branch
    # or fork of the buyer's project) so the buyer can review using the existing
    # DiffView machinery instead of file uploads.
    delivery_repo_id = Column(String(255), nullable=True)
    delivery_note_md = Column(Text, nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    listing = relationship("CollabListing", back_populates="applications")
