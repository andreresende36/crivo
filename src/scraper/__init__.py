"""
DealHunter — Módulo de Scraping
Coleta ofertas do Mercado Livre com técnicas de anti-bloqueio.
"""

from .base_scraper import BaseScraper, ScrapedProduct
from .ofertas_do_dia import OfertasDoDiaScraper
from .categoria_moda import CategoriaModaScraper

__all__ = [
    "BaseScraper",
    "ScrapedProduct",
    "OfertasDoDiaScraper",
    "CategoriaModaScraper",
]
