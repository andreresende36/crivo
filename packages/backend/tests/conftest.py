"""
Fixtures compartilhados entre testes do backend.

Injeta builders de `crivo_types` (Pydantic) para validação consistente de
payloads em testes, conforme plano de migração para monorepo.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

import crivo_types


@pytest.fixture
def make_product():
    """Factory de `crivo_types.Product` com defaults válidos."""

    def _make(**overrides) -> crivo_types.Product:
        defaults: dict = {
            "id": "00000000-0000-0000-0000-000000000001",
            "ml_id": "MLB999999",
            "title": "Produto de Teste",
            "current_price": Decimal("99.90"),
            "original_price": Decimal("199.90"),
            "discount_percent": Decimal("50.0"),
            "rating_stars": Decimal("4.5"),
            "rating_count": 100,
            "image_url": "https://example.com/img.jpg",
            "affiliate_url": "https://example.com/p/MLB999999",
            "free_shipping": True,
            "installments_without_interest": True,
            "installment_count": 10,
            "gender": "gender_neutral",
        }
        defaults.update(overrides)
        return crivo_types.Product(**defaults)

    return _make


@pytest.fixture
def make_score_breakdown():
    """Factory de `crivo_types.ScoreBreakdown` com zeros como default."""

    def _make(**overrides) -> crivo_types.ScoreBreakdown:
        defaults = {
            "discount": 0.0,
            "badge": 0.0,
            "rating": 0.0,
            "reviews": 0.0,
            "free_shipping": 0.0,
            "installments": 0.0,
            "title_quality": 0.0,
        }
        defaults.update(overrides)
        return crivo_types.ScoreBreakdown(**defaults)

    return _make
