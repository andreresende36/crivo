"""
DealHunter — Módulo de Análise de Ofertas
Avalia a qualidade das ofertas via regras determinísticas.
"""

from .score_engine import ScoreEngine, ScoredProduct
from .fake_discount_detector import FakeDiscountDetector

__all__ = [
    "ScoreEngine",
    "ScoredProduct",
    "FakeDiscountDetector",
]
