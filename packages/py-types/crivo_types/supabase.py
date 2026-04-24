# GENERATED — do not edit manually. Run `pnpm codegen` to regenerate.
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Any
from pydantic import BaseModel, ConfigDict


class AdminSetting(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: dict[str, Any]
    updated_at: datetime | None = None

class AffiliateLink(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    user_id: str
    short_url: str
    long_url: str | None = None
    ml_link_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

class Badge(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

class Brand(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

class Category(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

class Marketplace(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None

class PriceHistory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    price: Decimal
    original_price: Decimal | None = None
    pix_price: Decimal | None = None
    recorded_at: datetime

class Product(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ml_id: str
    title: str
    current_price: Decimal
    original_price: Decimal | None = None
    discount_percent: Decimal | None = None
    rating_stars: Decimal | None = None
    rating_count: int | None = None
    free_shipping: bool | None = None
    thumbnail_url: str | None = None
    product_url: str
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    created_at: datetime | None = None
    badge_id: str | None = None
    category_id: str | None = None
    installments_without_interest: bool | None = None
    marketplace_id: str | None = None
    pix_price: Decimal | None = None
    gender: str | None = None
    full_shipping: bool | None = None
    variations: dict[str, Any] | None = None
    installment_count: int | None = None
    installment_value: Decimal | None = None
    discount_type: str | None = None
    brand_id: str | None = None
    deleted_at: datetime | None = None

class ScoredOfferTransition(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scored_offer_id: str
    from_status: str | None = None
    to_status: str
    changed_by: str | None = None
    notes: str | None = None
    created_at: datetime | None = None

class ScoredOffer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    rule_score: int
    final_score: int
    status: str
    scored_at: datetime | None = None
    queue_priority: int | None = None
    score_override: int | None = None
    admin_notes: str | None = None
    updated_at: datetime | None = None
    score_breakdown: dict[str, Any] | None = None
    approved_at: datetime | None = None
    custom_title: str | None = None
    offer_body: str | None = None
    extra_notes: str | None = None

class SentOffer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scored_offer_id: str
    channel: str
    sent_at: datetime | None = None
    triggered_by: str | None = None
    user_id: str | None = None

class SystemLog(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type: str
    details: dict[str, Any] | None = None
    created_at: datetime | None = None

class TitleExample(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scored_offer_id: str | None = None
    generated_title: str
    final_title: str
    action: str
    created_at: datetime | None = None
    category_id: str | None = None

class UserSecret(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    ml_cookies: dict[str, Any] | None = None
    updated_at: datetime | None = None
    created_at: datetime | None = None

class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    affiliate_tag: str
    created_at: datetime | None = None
    email: str | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
