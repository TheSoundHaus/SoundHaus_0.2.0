"""
Billing models (Phase 6).

One `subscriptions` row per Soundhaus user. Tier is resolved via the helper
`Subscription.effective_tier`, which falls back to 'free' when no active row
exists.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Column, DateTime, Integer, String
from sqlalchemy.sql import func

from database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    # One sub per user — user_id is the primary key.
    user_id = Column(String(255), primary_key=True)

    stripe_customer_id = Column(String(255), nullable=True, unique=True, index=True)
    stripe_subscription_id = Column(String(255), nullable=True, unique=True, index=True)
    stripe_price_id = Column(String(255), nullable=True)

    # "free" / "pro" / "team" — resolved from stripe_price_id at write time.
    tier = Column(String(16), nullable=False, default="free", index=True)
    # Stripe's `status` passthrough: active / trialing / past_due / canceled / unpaid
    status = Column(String(16), nullable=False, default="inactive")

    current_period_end = Column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end = Column(Integer, nullable=False, default=0)  # 0/1

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class StorageUsage(Base):
    """Tracks per-user storage footprint (snippets, stems, samples)."""

    __tablename__ = "storage_usage"

    user_id = Column(String(255), primary_key=True)
    bytes_used = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
