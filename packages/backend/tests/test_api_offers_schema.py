"""Testes para OffersListQuery — validação de query params do GET /offers."""

import pytest
from pydantic import ValidationError

from crivo.api.schemas import OffersListQuery


def test_defaults():
    q = OffersListQuery()
    assert q.page == 1
    assert q.page_size == 25
    assert q.sort_by == "score"
    assert q.sort_dir == "desc"
    assert q.status is None


def test_valid_status():
    for s in ("approved", "rejected", "pending"):
        q = OffersListQuery(status=s)
        assert q.status == s


def test_invalid_status():
    with pytest.raises(ValidationError):
        OffersListQuery(status="invalid")


def test_min_score_bounds():
    OffersListQuery(min_score=0)
    OffersListQuery(min_score=100)
    with pytest.raises(ValidationError):
        OffersListQuery(min_score=-1)
    with pytest.raises(ValidationError):
        OffersListQuery(min_score=101)


def test_min_score_string_rejects():
    with pytest.raises(ValidationError):
        OffersListQuery(min_score="abc")  # type: ignore[arg-type]


def test_page_size_bounds():
    OffersListQuery(page_size=1)
    OffersListQuery(page_size=100)
    with pytest.raises(ValidationError):
        OffersListQuery(page_size=0)
    with pytest.raises(ValidationError):
        OffersListQuery(page_size=101)


def test_page_ge_1():
    with pytest.raises(ValidationError):
        OffersListQuery(page=0)


def test_price_range_valid():
    q = OffersListQuery(min_price=10.0, max_price=100.0)
    assert q.min_price == 10.0
    assert q.max_price == 100.0


def test_price_range_inverted():
    with pytest.raises(ValidationError, match="min_price"):
        OffersListQuery(min_price=200.0, max_price=100.0)


def test_sort_by_invalid():
    with pytest.raises(ValidationError):
        OffersListQuery(sort_by="unknown")


def test_sort_dir_invalid():
    with pytest.raises(ValidationError):
        OffersListQuery(sort_dir="up")


def test_date_from_parsed():
    q = OffersListQuery(date_from="2026-01-15")
    from datetime import date
    assert q.date_from == date(2026, 1, 15)


def test_min_discount_bounds():
    OffersListQuery(min_discount=0)
    OffersListQuery(min_discount=100)
    with pytest.raises(ValidationError):
        OffersListQuery(min_discount=-1)
    with pytest.raises(ValidationError):
        OffersListQuery(min_discount=101)
