from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class OffersListQuery(BaseModel):
    status: Literal["approved", "rejected", "pending"] | None = None
    category_id: str | None = None
    search: str | None = None
    min_price: float | None = Field(default=None, ge=0)
    max_price: float | None = Field(default=None, ge=0)
    min_discount: float | None = Field(default=None, ge=0, le=100)
    min_score: int | None = Field(default=None, ge=0, le=100)
    date_from: date | None = None
    date_to: date | None = None
    sort_by: Literal["score", "price", "discount", "date"] = "score"
    sort_dir: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)

    @model_validator(mode="after")
    def _price_range_consistent(self) -> "OffersListQuery":
        if self.min_price is not None and self.max_price is not None:
            if self.min_price > self.max_price:
                raise ValueError("min_price não pode ser maior que max_price")
        return self
