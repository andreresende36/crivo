"""
Crivo — Scraper Unificado do Mercado Livre
Coleta ofertas do Mercado Livre (Ofertas do Dia) com extração
padronizada de todos os campos dos cards de listagem.

Uso:
    scraper = MLScraper()
    products = await scraper.scrape()
"""


import asyncio
import time
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from crivo.database.storage_manager import StorageManager

import structlog
from bs4 import BeautifulSoup
from playwright.async_api import Page

from crivo.config import settings
from .base_scraper import BaseScraper, CaptchaError, RateLimitError, ScrapedProduct
from .ml_classifier import (
    classify_gender_with_ai,
    classify_with_ai,
    GENDER_RELEVANT_CATEGORIES,
)
from .ml_parser import SELECTORS, ProductParser

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Configuração de fonte de scraping
# ---------------------------------------------------------------------------


OFERTAS_URL = "https://www.mercadolivre.com.br/ofertas"


@dataclass
class ScrapeSource:
    """Configuração de uma fonte de scraping."""

    name: str
    url: str
    max_pages: int = 10


# ---------------------------------------------------------------------------
# Scraper Unificado
# ---------------------------------------------------------------------------


class MLScraper(BaseScraper):
    """
    Scraper unificado do Mercado Livre.

    Coleta ofertas do dia com extração padronizada de todos os campos
    disponíveis nos cards de listagem.
    """

    def __init__(
        self,
        sources: Optional[list[ScrapeSource]] = None,
        storage: Optional["StorageManager"] = None,
    ):
        super().__init__()
        self._storage = storage
        self.sources = sources or self._default_sources()
        self._parser = ProductParser()
        self.run_id: str = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.card_screenshots: dict[str, bytes] = {}

    def _default_sources(self) -> list[ScrapeSource]:
        """Carrega as fontes habilitadas do ml_categories.json via settings.sources."""
        import json
        from crivo.config import ROOT_DIR

        categories_file = ROOT_DIR / "ml_categories.json"
        with categories_file.open() as f:
            data = json.load(f)

        sources = []
        for section in data.values():
            for entry in section:
                if getattr(settings.sources, entry["source"], False):
                    sources.append(
                        ScrapeSource(
                            name=entry["source"],
                            url=entry["url"],
                            max_pages=settings.scraper.max_pages,
                        )
                    )

        if not sources:
            logger.warning(
                "no_sources_enabled",
                hint="Habilite ao menos uma fonte no .env (ex: SOURCE_OFERTA_DO_DIA=true)",
            )

        return sources

    async def _new_page(self) -> Page:
        """Cria nova página com playwright-stealth aplicado."""
        page = await super()._new_page()
        try:
            from playwright_stealth import stealth_async  # type: ignore[import-untyped]

            await stealth_async(page)
        except ImportError:
            logger.debug("playwright_stealth_not_installed")
        return page

    # ------------------------------------------------------------------
    # Método principal
    # ------------------------------------------------------------------

    async def scrape(self) -> list[ScrapedProduct]:
        """
        Coleta ofertas de todas as fontes configuradas.

        Retorna lista de ScrapedProduct com todos os campos extraídos.
        Se storage foi fornecido, classifica apenas produtos novos via AI.
        """
        start = time.monotonic()
        all_products: list[ScrapedProduct] = []
        total_existing = 0
        total_errors = 0

        async with self:
            sem = asyncio.Semaphore(settings.scraper.max_concurrent)

            async def scrape_source_sem(source: ScrapeSource):
                async with sem:
                    page = await self._new_page()
                    logger.info(
                        "scraping_source",
                        source=source.name,
                        max_pages=source.max_pages,
                    )
                    try:
                        products, existing, errors = await self._scrape_source(page, source)
                        logger.info("source_done", source=source.name, count=len(products))
                        return products, existing, errors
                    except CaptchaError:
                        logger.error("captcha_blocked", source=source.name)
                        if self._storage:
                            await self._storage.log_event(
                                "scrape_error", {"reason": "captcha", "source": source.name}
                            )
                        return [], 0, 1
                    except RateLimitError:
                        logger.error("rate_limited", source=source.name)
                        if self._storage:
                            await self._storage.log_event(
                                "scrape_error", {"reason": "rate_limit", "source": source.name}
                            )
                        return [], 0, 1
                    except Exception as exc:
                        logger.error("source_failed", source=source.name, error=str(exc))
                        return [], 0, 1
                    finally:
                        await page.close()

            results = await asyncio.gather(*[scrape_source_sem(s) for s in self.sources])
            for products, existing, errors in results:
                all_products.extend(products)
                total_existing += existing
                total_errors += errors

        # Dedup cross-page: mesmo ml_id pode aparecer em várias fontes
        seen: dict[str, ScrapedProduct] = {}
        for p in all_products:
            seen[p.ml_id] = p
        all_products = list(seen.values())

        elapsed = round(time.monotonic() - start, 1)
        logger.info(
            "scraping_done",
            total=len(all_products),
            existing_in_db=total_existing,
            ai_classification_skipped=total_existing,
            errors=total_errors,
            elapsed_seconds=elapsed,
        )

        if self._storage:
            await self._storage.log_event(
                "scrape_success",
                {
                    "total": len(all_products),
                    "sources": len(self.sources),
                    "existing_in_db": total_existing,
                    "elapsed_seconds": elapsed,
                },
            )

        return all_products

    # ------------------------------------------------------------------
    # Scraping por fonte
    # ------------------------------------------------------------------

    async def _scrape_source(
        self, page: Page, source: ScrapeSource
    ) -> tuple[list[ScrapedProduct], int, int]:
        """
        Coleta produtos de uma única fonte em até max_pages páginas.

        Retorna (products, existing_in_db, parse_errors).
        """
        products: list[ScrapedProduct] = []
        existing_in_db = 0
        parse_errors = 0
        url = self._build_url(source, 1)

        for page_num in range(1, source.max_pages + 1):
            logger.info("scraping_page", source=source.name, page=page_num, url=url)

            success = await self._goto(page, url)
            if not success:
                parse_errors += 1
                break

            if await self._is_blocked(page):
                raise CaptchaError(f"CAPTCHA detectado em {source.name}")

            try:
                await page.wait_for_selector(
                    "div.poly-card, li.promotion-item, li.ui-search-layout__item",
                    timeout=15_000,
                )
            except Exception:
                logger.warning("no_cards_found", source=source.name, page=page_num)
                break

            await self._human_scroll(page)

            html = await page.content()
            page_products = self._parse_page(html, source)

            if settings.scraper.debug_screenshots and page_products:
                await self._screenshot_cards(page, page_products)

            logger.info(
                "page_parsed",
                source=source.name,
                page=page_num,
                raw_count=len(page_products),
            )

            existing_ids: set[str] = set()
            if self._storage:
                try:
                    existing_ids = await self._storage.check_duplicates_batch(
                        [p.ml_id for p in page_products]
                    )
                except Exception as exc:
                    logger.warning("check_duplicates_failed", error=str(exc))

            new_page = [p for p in page_products if p.ml_id not in existing_ids]
            existing_page = [p for p in page_products if p.ml_id in existing_ids]

            if existing_page:
                logger.info(
                    "ai_classification_skipped",
                    reason="products_already_in_db",
                    count=len(existing_page),
                )

            new_page = await self._enrich_categories_with_ai(new_page)
            new_page = await self._enrich_gender(new_page)

            products.extend(new_page)
            products.extend(existing_page)
            existing_in_db += len(existing_page)

            if not page_products:
                break

            next_url = await self._resolve_next_page(page, source, page_num)
            if not next_url:
                logger.info("no_more_pages", source=source.name, stopped_at=page_num)
                break

            url = next_url
            await self._random_delay()

        return products, existing_in_db, parse_errors

    async def _save_page_products_batch(
        self, page_products: list[ScrapedProduct]
    ) -> tuple[list[ScrapedProduct], int]:
        """Deduplica e persiste produtos de uma página em batch."""
        if not self._storage or not page_products:
            return page_products, 0

        try:
            existing = await self._storage.check_duplicates_batch(
                [p.ml_id for p in page_products]
            )
            dupes = len(existing)
            new_products = [p for p in page_products if p.ml_id not in existing]

            if new_products:
                ids = await self._storage.upsert_products_batch(new_products)
                entries = [
                    {
                        "product_id": ids[p.ml_id],
                        "price": p.price,
                        "original_price": p.original_price,
                        "pix_price": p.pix_price,
                    }
                    for p in new_products
                    if p.ml_id in ids
                ]
                await self._storage.add_price_history_batch(entries)

            return new_products, dupes
        except Exception as exc:
            logger.warning("storage_batch_error", error=str(exc))
            return page_products, 0

    # ------------------------------------------------------------------
    # AI enrichment
    # ------------------------------------------------------------------

    async def _enrich_categories_with_ai(
        self, products: list[ScrapedProduct]
    ) -> list[ScrapedProduct]:
        """Runs the LLM classifier concurrently for products categorized as 'Outros'."""
        outros_products = [p for p in products if p.category == "Outros"]
        if not outros_products:
            return products

        logger.info("ai_enrichment_start", count=len(outros_products))

        async def _classify_and_update(p: ScrapedProduct):
            try:
                p.category = await classify_with_ai(p.title)
            except Exception as e:
                logger.warning("ai_enrichment_failed", title=p.title, error=str(e))

        await asyncio.gather(*[_classify_and_update(p) for p in outros_products])
        logger.info("ai_enrichment_done")
        return products

    async def _enrich_gender(
        self, products: list[ScrapedProduct]
    ) -> list[ScrapedProduct]:
        """Classifica o gênero de produtos em categorias relevantes."""
        from crivo.scraper.ml_classifier import get_product_gender

        needs_ai: list[ScrapedProduct] = []

        for p in products:
            result = get_product_gender(p.title, p.category)
            if result is None:
                needs_ai.append(p)
            else:
                p.gender = result

        if not needs_ai:
            return products

        logger.info("ai_gender_enrichment_start", count=len(needs_ai))

        async def _classify_gender_and_update(p: ScrapedProduct):
            try:
                p.gender = await classify_gender_with_ai(p.title)
            except Exception as e:
                logger.warning("ai_gender_enrichment_failed", title=p.title, error=str(e))
                p.gender = "Unissex"

        await asyncio.gather(*[_classify_gender_and_update(p) for p in needs_ai])
        logger.info(
            "ai_gender_enrichment_done",
            relevant_categories=list(GENDER_RELEVANT_CATEGORIES),
        )
        return products

    # ------------------------------------------------------------------
    # Parsing (delegates to ProductParser)
    # ------------------------------------------------------------------

    def _parse_page(self, html: str, source: ScrapeSource) -> list[ScrapedProduct]:
        return self._parser.parse_page(html, source)

    # ------------------------------------------------------------------
    # Paginação
    # ------------------------------------------------------------------

    def _build_url(self, source: ScrapeSource, _page_num: int) -> str:
        return source.url

    async def _resolve_next_page(
        self,
        page: Page,
        _source: ScrapeSource,
        _current_page: int,
    ) -> str | None:
        return await self._get_next_page_url(page)

    async def _get_next_page_url(self, page: Page) -> str | None:
        try:
            for selector in SELECTORS["next_page"].split(", "):
                el = await page.query_selector(selector)
                if el:
                    href = await el.get_attribute("href")
                    if href:
                        return self.full_url(href) if href.startswith("/") else href

            links = await page.query_selector_all(SELECTORS["pagination_links"])
            for link in links:
                text = (await link.inner_text()).strip().lower()
                if text in ("seguinte", "siguiente", "next", "próxima"):
                    href = await link.get_attribute("href")
                    if href:
                        return self.full_url(href) if href.startswith("/") else href

        except Exception as exc:
            logger.debug("pagination_check_error", error=str(exc))

        return None

    # ------------------------------------------------------------------
    # Debug: screenshot de cards (Playwright)
    # ------------------------------------------------------------------

    async def _screenshot_cards(
        self, page: Page, products: list[ScrapedProduct]
    ) -> None:
        """Tira screenshot de cada card enquanto a página está aberta."""
        html = await page.content()
        soup = BeautifulSoup(html, "lxml")
        items = soup.select(SELECTORS["card"])

        index_map: dict[str, int] = {}
        for enum_idx, item in enumerate(items):
            link_tag = item.select_one(SELECTORS["link"])
            if not link_tag:
                continue
            raw_url = str(link_tag.get("href", ""))
            mid = self._extract_ml_id(raw_url)
            if mid:
                index_map[mid] = enum_idx

        card_locator = page.locator(SELECTORS["card"])
        card_count = await card_locator.count()

        success = 0
        for product in products:
            if product.ml_id in self.card_screenshots:
                continue
            idx: int | None = index_map.get(product.ml_id)
            if idx is None or idx >= card_count:
                logger.debug("card_index_not_found", ml_id=product.ml_id)
                continue
            try:
                self.card_screenshots[product.ml_id] = await card_locator.nth(idx).screenshot()
                success += 1
            except Exception as exc:
                logger.debug("card_screenshot_failed", ml_id=product.ml_id, error=str(exc))

        logger.debug("cards_screenshotted", success=success, total=len(products))

    # ------------------------------------------------------------------
    # Regex helpers (kept here for _screenshot_cards + tests on BaseScraper)
    # ------------------------------------------------------------------

    def _extract_ml_id_re(self, url: str) -> str | None:
        """Alias local — delega ao BaseScraper._extract_ml_id."""
        return self._extract_ml_id(url)
