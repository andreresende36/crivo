"""
DealHunter — Scraper 2: Categoria Moda & Acessórios
Monitora produtos com desconto dentro da categoria Moda do ML.
Categoria MLB1430 = Moda e Acessórios
URL base: https://www.mercadolivre.com.br/c/moda#menu=categories
"""

import re
from typing import Optional
from urllib.parse import urlencode

import structlog
from bs4 import BeautifulSoup

from src.config import settings
from .base_scraper import BaseScraper, ScrapedProduct

logger = structlog.get_logger(__name__)

# Subcategorias de Moda com seus IDs no ML
SUBCATEGORIES = {
    "MLB1574": "Calçados",
    "MLB1577": "Roupas Masculinas",
    "MLB1578": "Roupas Femininas",
    "MLB1579": "Acessórios de Moda",
    "MLB1580": "Bolsas e Mochilas",
    "MLB1581": "Óculos e Lunetas",
    "MLB1582": "Relógios",
    "MLB1583": "Joias e Bijuterias",
}

# Filtros de busca para encontrar apenas ofertas com desconto real
SEARCH_FILTERS = {
    "sort": "relevance",  # Ordenar por relevância
    "discount": "10-100",  # Apenas com desconto (10% a 100%)
}


class CategoriaModaScraper(BaseScraper):
    """
    Scraper de categoria Moda & Acessórios do Mercado Livre.

    Estratégia:
    1. Itera sobre subcategorias de Moda configuradas
    2. Filtra por produtos com desconto
    3. Coleta dados de preço, avaliação e desconto
    4. Prioriza itens de lojas oficiais e frete grátis
    """

    def __init__(
        self,
        category_ids: Optional[list[str]] = None,
        max_pages_per_category: int = 2,
        min_discount_pct: float = 15.0,
    ):
        super().__init__()
        self.category_ids = category_ids or settings.mercado_livre.category_ids
        self.max_pages = max_pages_per_category
        self.min_discount_pct = min_discount_pct

    async def scrape(self) -> list[ScrapedProduct]:
        """Coleta produtos com desconto de todas as categorias configuradas."""
        all_products: list[ScrapedProduct] = []

        async with self:
            page = await self._new_page()

            for category_id in self.category_ids:
                category_name = SUBCATEGORIES.get(category_id, category_id)
                logger.info(
                    "scraping_category",
                    category_id=category_id,
                    category_name=category_name,
                )

                products = await self._scrape_category(page, category_id, category_name)
                all_products.extend(products)
                await self._random_delay(extra_min=1.0, extra_max=2.0)

            await page.close()

        # Filtra pelo desconto mínimo
        filtered = [p for p in all_products if p.discount_pct >= self.min_discount_pct]
        logger.info(
            "scraping_done",
            total_found=len(all_products),
            after_filter=len(filtered),
            min_discount=self.min_discount_pct,
        )
        return filtered

    async def _scrape_category(
        self, page, category_id: str, category_name: str
    ) -> list[ScrapedProduct]:
        """Coleta produtos de uma única categoria em múltiplas páginas."""
        products = []

        for page_num in range(1, self.max_pages + 1):
            url = self._build_url(category_id, page_num)
            success = await self._goto(page, url)
            if not success:
                logger.warning(
                    "category_page_failed", category_id=category_id, page=page_num
                )
                break

            await self._human_scroll(page)
            html = await page.content()
            page_products = self._parse_search_results(html, category_name)

            logger.debug(
                "category_page_scraped",
                category_id=category_id,
                page=page_num,
                found=len(page_products),
            )
            products.extend(page_products)

            if not page_products:
                break  # Sem mais resultados

            await self._random_delay()

        return products

    def _build_url(self, category_id: str, page_num: int) -> str:
        """Constrói URL de busca por categoria com filtros."""
        # Offset do ML: cada página tem 48 resultados
        offset = (page_num - 1) * 48
        base = f"{self.ML_BASE_URL}/c/{category_id.upper()}"

        params = {**SEARCH_FILTERS}
        if offset > 0:
            params["_from"] = str(offset)

        query = urlencode(params)
        return f"{base}?{query}" if query else base

    def _parse_search_results(
        self, html: str, category_name: str
    ) -> list[ScrapedProduct]:
        """Extrai produtos da página de resultados de busca por categoria."""
        soup = BeautifulSoup(html, "lxml")
        products = []

        # Seletores para a listagem de busca/categoria do ML
        # TODO: validar seletores com DevTools (ML atualiza com frequência)
        items = soup.select(
            "li.ui-search-layout__item, "
            "div.ui-search-result__wrapper, "
            "div.poly-card"
        )

        for item in items:
            product = self._parse_search_item(item, category_name)
            if product:
                products.append(product)

        return products

    def _parse_search_item(self, item, category_name: str) -> Optional[ScrapedProduct]:
        """Extrai dados de um item da listagem de busca."""
        try:
            # URL
            link_tag = item.select_one("a.ui-search-link, a.poly-component__title")
            if not link_tag:
                return None
            url = link_tag.get("href", "")
            ml_id = self._extract_ml_id(url)
            if not ml_id:
                return None

            # Título
            title_tag = item.select_one(
                "h2.ui-search-item__title, "
                "span.ui-search-item__title, "
                ".poly-component__title"
            )
            title = title_tag.get_text(strip=True) if title_tag else ""
            if not title:
                return None

            # Preço atual
            price = self._parse_price_search(item)
            if price is None:
                return None

            # Preço original
            original_price = self._parse_original_price(item)

            # Avaliação
            rating, review_count = self._parse_rating(item)

            # Vendedor / Loja oficial
            seller_tag = item.select_one(
                "span.ui-search-official-store-label, " "span[class*='official-store']"
            )
            is_official = seller_tag is not None
            seller_name_tag = item.select_one("span.ui-search-item__seller-name")
            seller = seller_name_tag.get_text(strip=True) if seller_name_tag else ""

            # Frete grátis
            free_shipping = bool(
                item.select_one(
                    "span.ui-search-item__shipping.ui-search-item__shipping--free, "
                    "span[class*='free-shipping']"
                )
            )

            # Imagem
            img_tag = item.select_one("img.ui-search-result-image__element")
            image_url = ""
            if img_tag:
                image_url = img_tag.get("data-src") or img_tag.get("src") or ""

            return ScrapedProduct(
                ml_id=ml_id,
                url=url,
                title=title,
                price=price,
                original_price=original_price,
                rating=rating,
                review_count=review_count,
                category=category_name,
                seller=seller,
                is_official_store=is_official,
                image_url=image_url,
                free_shipping=free_shipping,
                source="categoria_moda",
            )

        except Exception as exc:
            logger.debug("parse_search_item_error", error=str(exc))
            return None

    # ------------------------------------------------------------------
    # Helpers de parsing específicos para a página de busca
    # ------------------------------------------------------------------

    def _parse_price_search(self, item) -> Optional[float]:
        """Extrai preço atual da listagem de busca."""
        selectors = [
            "span.andes-money-amount__fraction",
            "span.price-tag-fraction",
            "span.ui-search-price__second-line span.andes-money-amount__fraction",
        ]
        for selector in selectors:
            tag = item.select_one(selector)
            if tag:
                return self._clean_price(tag.get_text(strip=True))
        return None

    def _parse_original_price(self, item) -> Optional[float]:
        """Extrai preço original (antes do desconto)."""
        selectors = [
            "del.ui-search-price__original-value span.andes-money-amount__fraction",
            "s span.andes-money-amount__fraction",
            "span.ui-search-price__original-value span.price-tag-fraction",
        ]
        for selector in selectors:
            tag = item.select_one(selector)
            if tag:
                return self._clean_price(tag.get_text(strip=True))
        return None

    def _parse_rating(self, item) -> tuple[float, int]:
        """Extrai avaliação e número de reviews."""
        rating = 0.0
        count = 0

        rating_tag = item.select_one("span.ui-search-reviews__rating-number")
        if rating_tag:
            try:
                rating = float(rating_tag.get_text(strip=True).replace(",", "."))
            except ValueError:
                pass

        count_tag = item.select_one("span.ui-search-reviews__amount")
        if count_tag:
            count_text = re.sub(r"[^\d]", "", count_tag.get_text())
            try:
                count = int(count_text)
            except ValueError:
                pass

        return rating, count
