"""
Crivo — Parser de cards do Mercado Livre

ProductParser extrai campos de ScrapedProduct a partir de HTML já carregado.
Sem I/O, sem Playwright — puro BeautifulSoup.
"""

import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

from crivo.scraper.base_scraper import ScrapedProduct
from crivo.scraper.ml_classifier import get_product_category

# ---------------------------------------------------------------------------
# Seletores CSS unificados (poly- + ui-search- + fallbacks)
# ---------------------------------------------------------------------------

SELECTORS: dict[str, str] = {
    "card": (
        "div.poly-card, "
        "li.promotion-item, "
        "li.ui-search-layout__item, "
        "div.ui-search-result__wrapper"
    ),
    "title": (
        "a.poly-component__title, "
        "h2.poly-box.poly-component__title, "
        "p.promotion-item__title, "
        "h2.ui-search-item__title, "
        "span.ui-search-item__title"
    ),
    "link": (
        "a.poly-component__title, a.ui-search-link, a[href*='mercadolivre']"
    ),
    "price_current_container": ".poly-price__current",
    "fraction": ".andes-money-amount__fraction",
    "cents": ".andes-money-amount__cents",
    "price_original_container": (
        "s.poly-price__original, "
        "s.andes-money-amount--previous"
    ),
    "price_original_search": (
        "del.ui-search-price__original-value "
        "span.andes-money-amount__fraction, "
        "s span.andes-money-amount__fraction, "
        "span.ui-search-price__original-value "
        "span.price-tag-fraction"
    ),
    "discount": (
        "span.poly-discount, "
        ".poly-price__percentage, "
        "span.andes-money-amount__discount, "
        "span[class*='discount']"
    ),
    "shipping": (
        "div.poly-component__shipping, "
        "p.promotion-item__free-shipping, "
        "span.ui-search-item__shipping.ui-search-item__shipping--free, "
        "span[class*='free-shipping']"
    ),
    "image": (
        "div.poly-card__portada img, "
        ".poly-component__picture img, "
        "img.ui-search-result-image__element, "
        "img[data-src]"
    ),
    "rating": ".poly-reviews__rating, span.ui-search-reviews__rating-number",
    "review_count": ".poly-reviews__total, span.ui-search-reviews__amount",
    "installments": ".poly-price__installments",
    "badge": "span.poly-component__highlight",
    "brand": ".poly-component__brand",
    "full_shipping_icon": "svg.poly-shipping__promise-icon--full",
    "variations": ".poly-component__variations-text",
    "discount_standard": ".poly-price__disc--pill",
    "discount_pix": ".poly-price__disc_label",
    "next_page": (
        "a.andes-pagination__link--next, li.andes-pagination__button--next a"
    ),
    "pagination_links": "a.andes-pagination__link",
}


# ---------------------------------------------------------------------------
# ProductParser — parsing puro (sem I/O)
# ---------------------------------------------------------------------------


class ProductParser:
    """Extrai ScrapedProduct de cards HTML do Mercado Livre."""

    ML_BASE_URL = "https://www.mercadolivre.com.br"

    def parse_page(self, html: str, source: object) -> list[ScrapedProduct]:
        """Extrai todos os produtos do HTML com seletores unificados."""
        soup = BeautifulSoup(html, "lxml")
        products: list[ScrapedProduct] = []
        for item in soup.select(SELECTORS["card"]):
            product = self._parse_item(item, source)
            if product:
                products.append(product)
        return products

    def _parse_item(self, item: Tag, source: object) -> Optional[ScrapedProduct]:
        """Extrai todos os campos de um card de produto."""
        try:
            link_tag = item.select_one(SELECTORS["link"])
            if not link_tag:
                return None
            url = str(link_tag.get("href", ""))
            if not url:
                return None

            ml_id = self._extract_ml_id(url)
            if not ml_id:
                return None

            url = self._resolve_tracking_url(url)
            if url.startswith("/"):
                url = self.full_url(url)

            title_tag = item.select_one(SELECTORS["title"])
            title = title_tag.get_text(strip=True) if title_tag else ""
            if not title:
                return None

            price, pix_price = self._get_prices(item)
            if price is None or price <= 0:
                return None

            original_price = self._get_original_price(item)
            explicit_discount, discount_type = self._parse_discount(item)
            rating = self._parse_rating(item)
            review_count = self._parse_review_count(item)
            free_shipping = self._parse_free_shipping(item)
            full_shipping = self._parse_full_shipping(item)
            sem_juros, inst_count, inst_value = self._parse_installments(item)
            image_url = self._parse_image_url(item)

            badge_tag = item.select_one(SELECTORS["badge"])
            badge = badge_tag.get_text(strip=True) if badge_tag else ""

            brand = self._parse_brand(item)
            variations = self._parse_variations(item)

            source_name: str = getattr(source, "name", str(source))

            product = ScrapedProduct(
                ml_id=ml_id,
                url=url,
                title=title,
                price=price,
                original_price=original_price,
                pix_price=pix_price,
                rating=rating,
                review_count=review_count,
                category=get_product_category(title),
                image_url=image_url,
                free_shipping=free_shipping,
                full_shipping=full_shipping,
                installments_without_interest=sem_juros,
                installment_count=inst_count,
                installment_value=inst_value,
                badge=badge,
                brand=brand,
                variations=variations,
                discount_type=discount_type,
                source=source_name,
            )

            if explicit_discount and not original_price:
                product.discount_pct = explicit_discount

            return product

        except Exception:
            return None

    # ------------------------------------------------------------------
    # URL helpers
    # ------------------------------------------------------------------

    def full_url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        return (
            f"{self.ML_BASE_URL}{path}"
            if path.startswith("/")
            else f"{self.ML_BASE_URL}/{path}"
        )

    def _resolve_tracking_url(self, url: str) -> str:
        if "click1.mercadolivre" in url or "/mclics/" in url:
            from urllib.parse import parse_qs, unquote, urlparse

            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            real_url = params.get("url", [None])[0]
            if real_url:
                return unquote(real_url)
        return url

    def _extract_ml_id(self, url: str) -> str | None:
        up_match = re.search(r"/up/(MLBU\d+)", url, re.IGNORECASE)
        if up_match:
            return up_match.group(1)

        wid_match = re.search(r"[?&#]wid=(MLB-?\d+)", url, re.IGNORECASE)
        if wid_match:
            return wid_match.group(1).replace("-", "")

        path = url.split("?")[0]
        path_match = re.search(r"\b(MLB-?\d+)\b", path, re.IGNORECASE)
        if path_match:
            return path_match.group(1).replace("-", "")

        match = re.search(r"(MLB-?\d+)", url, re.IGNORECASE)
        if match:
            return match.group(1).replace("-", "")

        return None

    # ------------------------------------------------------------------
    # Price extraction
    # ------------------------------------------------------------------

    def _get_prices(self, card: Tag) -> tuple[float | None, float | None]:
        container = card.select_one(SELECTORS["price_current_container"])
        if container:
            if self._is_payment_method_price(container):
                pix_price = self._price_from_andes(container)
                card_price = self._get_listed_price(card)
                if card_price and pix_price:
                    return card_price, pix_price
                if pix_price:
                    return pix_price, None

            price = self._price_from_andes(container)
            if price:
                return price, None

        for fraction in card.select(SELECTORS["fraction"]):
            if not fraction.find_parent(["s", "del"]):
                price = self._clean_price(fraction.get_text(strip=True))
                return price, None

        return None, None

    def _is_payment_method_price(self, container: Tag) -> bool:
        disc_el = container.select_one(
            ".andes-money-amount__discount, .poly-price__disc_label"
        )
        if not disc_el:
            return False
        text = disc_el.get_text(strip=True).lower()
        return any(kw in text for kw in ("pix", "boleto"))

    def _get_listed_price(self, card: Tag) -> float | None:
        installments = card.select_one(SELECTORS["installments"])
        if not installments:
            return None
        amounts = installments.select("span.andes-money-amount.poly-phrase-price")
        if amounts:
            return self._price_from_andes(amounts[0])
        return None

    def _get_original_price(self, card: Tag) -> float | None:
        for selector in SELECTORS["price_original_container"].split(", "):
            container = card.select_one(selector)
            if container:
                price = self._price_from_andes(container)
                if price:
                    return price

        for tag_name in ("s", "del"):
            parent = card.select_one(tag_name)
            if parent:
                price = self._price_from_andes(parent)
                if price:
                    return price

        for selector in SELECTORS["price_original_search"].split(", "):
            tag = card.select_one(selector)
            if tag:
                return self._clean_price(tag.get_text(strip=True))

        return None

    def _price_from_andes(self, container: Tag) -> float | None:
        fraction_el = container.select_one(SELECTORS["fraction"])
        if not fraction_el:
            return None

        fraction_text = fraction_el.get_text(strip=True)
        fraction_clean = fraction_text.replace(".", "")

        try:
            base = int(fraction_clean)
        except ValueError:
            return self._clean_price(fraction_text)

        cents_el = container.select_one(SELECTORS["cents"])
        if cents_el:
            cents_text = cents_el.get_text(strip=True).lstrip(",").strip()
            try:
                return float(base) + int(cents_text) / 100
            except ValueError:
                pass

        return float(base)

    def _clean_price(self, raw: str) -> float | None:
        try:
            cleaned = re.sub(r"[^\d,.]", "", raw)
            if not cleaned:
                return None
            cleaned = cleaned.replace(".", "").replace(",", ".")
            return float(cleaned)
        except (ValueError, AttributeError):
            return None

    # ------------------------------------------------------------------
    # Field parsers
    # ------------------------------------------------------------------

    def _parse_rating(self, item: Tag) -> float:
        tag = item.select_one(SELECTORS["rating"])
        if not tag:
            return 0.0
        try:
            text = tag.get_text(strip=True).replace(",", ".")
            rating = float(text)
            return rating if 0 <= rating <= 5 else 0.0
        except (ValueError, TypeError):
            return 0.0

    def _parse_review_count(self, item: Tag) -> int:
        tag = item.select_one(SELECTORS["review_count"])
        if not tag:
            return 0
        text = re.sub(r"[^\d]", "", tag.get_text())
        try:
            return int(text)
        except (ValueError, TypeError):
            return 0

    def _parse_free_shipping(self, item: Tag) -> bool:
        tag = item.select_one(SELECTORS["shipping"])
        if tag:
            text = tag.get_text(strip=True).lower()
            return "grátis" in text or "gratis" in text
        if item.select_one(SELECTORS["full_shipping_icon"]):
            return True
        return False

    def _parse_full_shipping(self, item: Tag) -> bool:
        return item.select_one(SELECTORS["full_shipping_icon"]) is not None

    def _parse_brand(self, item: Tag) -> str | None:
        tag = item.select_one(SELECTORS["brand"])
        return tag.get_text(strip=True) if tag else None

    def _parse_variations(self, item: Tag) -> str | None:
        tag = item.select_one(SELECTORS["variations"])
        return tag.get_text(strip=True) if tag else None

    def _parse_image_url(self, item: Tag) -> str:
        img_tag = item.select_one(SELECTORS["image"])
        if img_tag:
            return str(img_tag.get("data-src") or img_tag.get("src") or "")
        return ""

    def _parse_installments(
        self, item: Tag
    ) -> tuple[bool, int | None, float | None]:
        """Extrai dados de parcelamento.

        Padrões:
          A: "12x R$ 192,14"                              → (False, 12, 192.14)
          B: "10x R$ 107,90 sem juros"                    → (True, 10, 107.90)
          C: "ou R$ 687,78 em 10x R$ 68,78 sem juros"    → (True, 10, 68.78)
          D: "ou R$ 357,90 em outros meios"               → (False, None, None)
        """
        tag = item.select_one(SELECTORS["installments"])
        if not tag:
            return False, None, None

        text = tag.get_text(separator=" ", strip=True).lower()
        sem_juros = "sem juros" in text or "sin interés" in text

        if "em outros meios" in text:
            return False, None, None

        count_match = re.search(r"(\d+)\s*x\b", text)
        if not count_match:
            return sem_juros, None, None

        count = int(count_match.group(1))

        phrase_prices = tag.select("span.andes-money-amount.poly-phrase-price")
        if phrase_prices:
            value = self._price_from_andes(phrase_prices[-1])
            return sem_juros, count, value

        value_match = re.search(r"\d+\s*x\s*(?:r\$\s*)?([\d.]+[,]\d{2})", text)
        if value_match:
            value = self._clean_price(value_match.group(1))
            return sem_juros, count, value

        return sem_juros, count, None

    def _parse_discount(self, item: Tag) -> tuple[float, str | None]:
        """Extrai percentual e tipo de desconto (standard | pix | None)."""
        pill = item.select_one(SELECTORS["discount_standard"])
        if pill:
            pct = self._parse_discount_pct(pill.get_text(strip=True))
            if pct:
                return pct, "standard"

        pix_label = item.select_one(SELECTORS["discount_pix"])
        if pix_label:
            pct = self._parse_discount_pct(pix_label.get_text(strip=True))
            if pct:
                return pct, "pix"

        discount_tag = item.select_one(SELECTORS["discount"])
        if discount_tag:
            text = discount_tag.get_text(strip=True)
            pct = self._parse_discount_pct(text)
            if pct:
                dtype = "pix" if any(
                    kw in text.lower() for kw in ("pix", "boleto")
                ) else "standard"
                return pct, dtype

        return 0.0, None

    def _parse_discount_pct(self, text: str) -> float:
        match = re.search(r"(\d+)\s*%", text)
        return float(match.group(1)) if match else 0.0
