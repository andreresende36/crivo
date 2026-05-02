"""
Testes para ProductParser — parsing puro, sem Playwright.
"""

import pytest
from bs4 import BeautifulSoup, Tag

from crivo.scraper.ml_parser import ProductParser
from crivo.scraper.ml_scraper import ScrapeSource


_DEFAULT_SOURCE = ScrapeSource(
    name="ofertas_do_dia",
    url="https://www.mercadolivre.com.br/ofertas",
    max_pages=2,
)


def _make_parser() -> ProductParser:
    return ProductParser()


# ---------------------------------------------------------------------------
# Fixtures HTML
# ---------------------------------------------------------------------------


@pytest.fixture
def html_poly_cards() -> str:
    return """
    <html><body>
    <div class="items-container">

      <div class="poly-card">
        <div class="poly-card__portada">
          <img data-src="https://http2.mlstatic.com/tenis-nike.webp"
               src="data:image/gif;base64,placeholder" />
        </div>
        <a class="poly-component__title"
           href="https://www.mercadolivre.com.br/tenis-nike-air-max/p/MLB111222333">
          Tênis Nike Air Max 270 Masculino
        </a>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__currency-symbol">R$</span>
            <span class="andes-money-amount__fraction">299</span>
            <span class="andes-money-amount__cents">,90</span>
          </span>
        </div>
        <s class="poly-price__original">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">599</span>
            <span class="andes-money-amount__cents">,90</span>
          </span>
        </s>
        <span class="poly-discount">50% OFF</span>
        <div class="poly-component__shipping">Frete grátis</div>
        <span class="poly-component__highlight">Oferta do dia</span>
      </div>

      <div class="poly-card">
        <a class="poly-component__title"
           href="/bolsa-feminina-couro/p/MLB444555666">
          Bolsa Feminina Couro Legítimo Premium
        </a>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">1.299</span>
          </span>
        </div>
        <s class="poly-price__original">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">2.599</span>
          </span>
        </s>
        <span class="poly-discount">50% OFF</span>
        <div class="poly-card__portada">
          <img data-src="https://http2.mlstatic.com/bolsa.webp" />
        </div>
      </div>

      <div class="poly-card">
        <a class="poly-component__title"
           href="https://produto.mercadolivre.com.br/MLB-777888999-relogio-casio-_JM">
          Relógio Casio Digital Vintage
        </a>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">189</span>
            <span class="andes-money-amount__cents">,99</span>
          </span>
        </div>
        <s class="poly-price__original">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">349</span>
          </span>
        </s>
        <div class="poly-component__shipping">Frete grátis</div>
        <span class="poly-component__highlight">Mais vendido</span>
      </div>

      <!-- sem link — deve ser ignorado -->
      <div class="poly-card">
        <p class="poly-component__title">Produto Sem Link</p>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">99</span>
          </span>
        </div>
      </div>

      <!-- sem título — deve ser ignorado -->
      <div class="poly-card">
        <a class="poly-component__title" href="/p/MLB000111222"></a>
        <div class="poly-price__current">
          <span class="andes-money-amount">
            <span class="andes-money-amount__fraction">50</span>
          </span>
        </div>
      </div>

    </div>
    </body></html>
    """


@pytest.fixture
def html_legacy_selectors() -> str:
    return """
    <html><body>
    <ul>
      <li class="promotion-item">
        <a href="https://www.mercadolivre.com.br/tenis/p/MLB999000111">
          <p class="promotion-item__title">Tênis Adidas Superstar Branco</p>
        </a>
        <span class="andes-money-amount__fraction">249</span>
        <del>
          <span class="andes-money-amount__fraction">499</span>
        </del>
        <span class="andes-money-amount__discount">50% OFF</span>
        <p class="promotion-item__free-shipping">Frete grátis</p>
      </li>
    </ul>
    </body></html>
    """


@pytest.fixture
def html_no_products() -> str:
    return """
    <html><body>
    <div class="empty-state"><p>Nenhuma oferta disponível no momento.</p></div>
    </body></html>
    """


# ===========================================================================
# ProductParser — price_from_andes
# ===========================================================================


class TestPriceFromAndes:
    def setup_method(self):
        self.parser = _make_parser()

    def _make_container(self, fraction: str, cents: str | None = None) -> Tag:
        cents_html = (
            f'<span class="andes-money-amount__cents">{cents}</span>'
            if cents is not None
            else ""
        )
        html = f"""
        <span class="andes-money-amount">
          <span class="andes-money-amount__fraction">{fraction}</span>
          {cents_html}
        </span>
        """
        soup = BeautifulSoup(html, "lxml")
        return soup.select_one(".andes-money-amount")  # type: ignore[return-value]

    def test_fraction_only(self):
        assert self.parser._price_from_andes(self._make_container("299")) == pytest.approx(299.0)

    def test_fraction_with_cents(self):
        assert self.parser._price_from_andes(self._make_container("299", ",90")) == pytest.approx(299.90)

    def test_fraction_with_thousands(self):
        assert self.parser._price_from_andes(self._make_container("1.299")) == pytest.approx(1299.0)

    def test_fraction_with_thousands_and_cents(self):
        assert self.parser._price_from_andes(self._make_container("1.299", ",90")) == pytest.approx(1299.90)

    def test_cents_without_comma(self):
        assert self.parser._price_from_andes(self._make_container("99", "50")) == pytest.approx(99.50)

    def test_no_fraction_returns_none(self):
        soup = BeautifulSoup('<span class="andes-money-amount"></span>', "lxml")
        container = soup.select_one(".andes-money-amount")
        assert self.parser._price_from_andes(container) is None  # type: ignore[arg-type]


# ===========================================================================
# ProductParser — parse_page (poly- selectors)
# ===========================================================================


class TestParsePagePoly:
    def setup_method(self):
        self.parser = _make_parser()

    def test_parse_extracts_valid_products(self, html_poly_cards):
        products = self.parser.parse_page(html_poly_cards, _DEFAULT_SOURCE)
        assert len(products) == 3

    def test_first_product_fields(self, html_poly_cards):
        products = self.parser.parse_page(html_poly_cards, _DEFAULT_SOURCE)
        p = products[0]
        assert p.ml_id == "MLB111222333"
        assert p.title == "Tênis Nike Air Max 270 Masculino"
        assert p.price == pytest.approx(299.90)
        assert p.original_price == pytest.approx(599.90)
        assert p.discount_pct == pytest.approx(50.0)
        assert p.free_shipping is True
        assert p.image_url == "https://http2.mlstatic.com/tenis-nike.webp"
        assert p.source == "ofertas_do_dia"

    def test_second_product_thousands(self, html_poly_cards):
        products = self.parser.parse_page(html_poly_cards, _DEFAULT_SOURCE)
        p = products[1]
        assert p.ml_id == "MLB444555666"
        assert p.price == pytest.approx(1299.0)
        assert p.original_price == pytest.approx(2599.0)
        assert p.free_shipping is False
        assert p.url.startswith("https://")

    def test_third_product_dash_in_id(self, html_poly_cards):
        products = self.parser.parse_page(html_poly_cards, _DEFAULT_SOURCE)
        p = products[2]
        assert p.ml_id == "MLB777888999"
        assert p.price == pytest.approx(189.99)
        assert p.original_price == pytest.approx(349.0)
        assert p.free_shipping is True

    def test_invalid_items_excluded(self, html_poly_cards):
        products = self.parser.parse_page(html_poly_cards, _DEFAULT_SOURCE)
        ml_ids = [p.ml_id for p in products]
        assert "MLB000111222" not in ml_ids
        assert len(products) == 3

    def test_empty_page(self, html_no_products):
        products = self.parser.parse_page(html_no_products, _DEFAULT_SOURCE)
        assert products == []


# ===========================================================================
# ProductParser — parse_page (seletores legados)
# ===========================================================================


class TestParsePageLegacy:
    def setup_method(self):
        self.parser = _make_parser()

    def test_legacy_selectors_work(self, html_legacy_selectors):
        products = self.parser.parse_page(html_legacy_selectors, _DEFAULT_SOURCE)
        assert len(products) == 1
        p = products[0]
        assert p.ml_id == "MLB999000111"
        assert p.title == "Tênis Adidas Superstar Branco"
        assert p.price == pytest.approx(249.0)
        assert p.original_price == pytest.approx(499.0)
        assert p.free_shipping is True


# ===========================================================================
# ProductParser — price extraction helpers
# ===========================================================================


class TestPriceExtraction:
    def setup_method(self):
        self.parser = _make_parser()

    def test_current_price_from_poly_container(self):
        html = """
        <div class="poly-card">
          <div class="poly-price__current">
            <span class="andes-money-amount__fraction">499</span>
            <span class="andes-money-amount__cents">,90</span>
          </div>
          <s class="poly-price__original">
            <span class="andes-money-amount__fraction">999</span>
          </s>
        </div>
        """
        soup = BeautifulSoup(html, "lxml")
        card = soup.select_one(".poly-card")
        card_price, _pix = self.parser._get_prices(card)  # type: ignore[arg-type]
        assert card_price == pytest.approx(499.90)
        assert self.parser._get_original_price(card) == pytest.approx(999.0)  # type: ignore[arg-type]

    def test_prices_from_del_tag(self):
        html = """
        <li class="promotion-item">
          <span class="andes-money-amount__fraction">249</span>
          <del>
            <span class="andes-money-amount__fraction">499</span>
          </del>
        </li>
        """
        soup = BeautifulSoup(html, "lxml")
        card = soup.select_one(".promotion-item")
        card_price, _pix = self.parser._get_prices(card)  # type: ignore[arg-type]
        assert card_price == pytest.approx(249.0)
        assert self.parser._get_original_price(card) == pytest.approx(499.0)  # type: ignore[arg-type]

    def test_no_original_price(self):
        html = """
        <div class="poly-card">
          <div class="poly-price__current">
            <span class="andes-money-amount__fraction">99</span>
          </div>
        </div>
        """
        soup = BeautifulSoup(html, "lxml")
        card = soup.select_one(".poly-card")
        card_price, _pix = self.parser._get_prices(card)  # type: ignore[arg-type]
        assert card_price == pytest.approx(99.0)
        assert self.parser._get_original_price(card) is None  # type: ignore[arg-type]


# ===========================================================================
# ProductParser — clean_price
# ===========================================================================


class TestCleanPrice:
    def setup_method(self):
        self.parser = _make_parser()

    def test_integer(self):
        assert self.parser._clean_price("299") == pytest.approx(299.0)

    def test_with_thousands_separator(self):
        assert self.parser._clean_price("1.299") == pytest.approx(1299.0)

    def test_with_decimal(self):
        assert self.parser._clean_price("99,90") == pytest.approx(99.90)

    def test_full_br_format(self):
        assert self.parser._clean_price("1.299,90") == pytest.approx(1299.90)

    def test_none_on_invalid(self):
        assert self.parser._clean_price("abc") is None

    def test_none_on_empty(self):
        assert self.parser._clean_price("") is None

    def test_strips_currency(self):
        assert self.parser._clean_price("R$ 299,90") == pytest.approx(299.90)


# ===========================================================================
# ProductParser — extract_ml_id
# ===========================================================================


class TestExtractMlIdParser:
    def setup_method(self):
        self.parser = _make_parser()

    def test_standard_url(self):
        assert self.parser._extract_ml_id(
            "https://www.mercadolivre.com.br/tenis/p/MLB111222333?param=1"
        ) == "MLB111222333"

    def test_url_with_dash(self):
        assert self.parser._extract_ml_id(
            "https://produto.mercadolivre.com.br/MLB-777888999-relogio-_JM"
        ) == "MLB777888999"

    def test_relative_url(self):
        assert self.parser._extract_ml_id("/produto-teste/p/MLB555666777") == "MLB555666777"

    def test_no_ml_id_returns_none(self):
        assert self.parser._extract_ml_id("https://google.com") is None

    def test_empty_url(self):
        assert self.parser._extract_ml_id("") is None
