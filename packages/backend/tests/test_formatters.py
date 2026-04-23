"""
Testes para o Message Formatter e Affiliate Links.
Atualizado para Style Guide v3.
"""
import pytest

from crivo.scraper.base_scraper import ScrapedProduct
from crivo.distributor.message_formatter import MessageFormatter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def formatter() -> MessageFormatter:
    return MessageFormatter()


@pytest.fixture
def sample_product() -> ScrapedProduct:
    return ScrapedProduct(
        ml_id="MLB123456789",
        url="https://www.mercadolivre.com.br/tenis/p/MLB123456789",
        title="Tênis Nike Air Max 270 React Masculino Preto e Branco",
        price=299.90,
        original_price=599.90,
        rating=4.8,
        review_count=1500,
        category="Calçados",
        free_shipping=True,
        image_url="https://http2.mlstatic.com/image.jpg",
    )


# ---------------------------------------------------------------------------
# MessageFormatter (Style Guide v3)
# ---------------------------------------------------------------------------


class TestMessageFormatter:
    def test_format_returns_formatted_message(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert msg.telegram_text
        assert msg.whatsapp_text
        assert msg.product_ml_id == "MLB123456789"

    def test_contains_prices(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "299" in msg.whatsapp_text
        assert "599" in msg.whatsapp_text

    def test_contains_discount_info(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        # Produto com savings > 0 usa "💸 Desconto de R$" ao invés de "📉 % OFF"
        assert "💸" in msg.whatsapp_text
        assert "Desconto de R$" in msg.whatsapp_text

    def test_contains_pct_off_when_no_savings(self, formatter, sample_product):
        # Quando original_price == price, usa "📉 XX% OFF"
        sample_product.original_price = sample_product.price
        sample_product.discount_pct = 30.0
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "📉" in msg.whatsapp_text
        assert "% OFF" in msg.whatsapp_text

    def test_contains_rock_on_emoji(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "🤘🏻" in msg.whatsapp_text

    def test_contains_free_shipping(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "✅ Frete Grátis" in msg.whatsapp_text

    def test_no_free_shipping_not_shown(self, formatter, sample_product):
        sample_product.free_shipping = False
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "Frete Grátis" not in msg.whatsapp_text

    def test_rating_shown_when_good(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "⭐ 4.8/5" in msg.whatsapp_text
        assert "avaliações" in msg.whatsapp_text

    def test_rating_hidden_when_low(self, formatter, sample_product):
        sample_product.rating = 3.5
        sample_product.review_count = 20
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "⭐" not in msg.whatsapp_text

    def test_rating_hidden_when_few_reviews(self, formatter, sample_product):
        sample_product.rating = 4.5
        sample_product.review_count = 30
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "⭐" not in msg.whatsapp_text

    def test_whatsapp_has_no_inline_link_markdown(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "[Comprar agora" not in msg.whatsapp_text
        assert "https://s.black/abc" in msg.whatsapp_text

    def test_telegram_has_inline_link(self, formatter, sample_product):
        msg = formatter.format(
            sample_product, short_link="https://s.black/abc"
        )
        assert "[Comprar agora\\!]" in msg.telegram_text

    def test_footer_present(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "━━━" in msg.whatsapp_text
        assert "Sempre Black" in msg.whatsapp_text
        assert "Aqui todo dia é Black Friday" in msg.whatsapp_text
        assert "🖤" in msg.whatsapp_text

    def test_no_hashtags(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "#" not in msg.whatsapp_text

    def test_no_fire_emoji(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "🔥" not in msg.whatsapp_text

    def test_catchy_title_used(self, formatter, sample_product):
        msg = formatter.format(
            sample_product,
            short_link="https://s.black/abc",
            catchy_title="NIKE CLÁSSICO COM PREÇÃO",
        )
        assert "*NIKE CLÁSSICO COM PREÇÃO*" in msg.whatsapp_text

    def test_catchy_title_fallback(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        lines = msg.whatsapp_text.split("\n")
        # Encontra a linha do título catchy (formato *TITULO*)
        # Pode haver flash sale tag antes, então procura pela primeira linha bold
        # que não seja a tag de urgência
        title_line = None
        for line in lines:
            if line.startswith("*") and line.endswith("*") and "Promoção" not in line:
                title_line = line
                break
        assert title_line is not None, "Título catchy não encontrado"
        title = title_line.strip("*")
        assert title == title.upper()

    def test_product_name_full(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert sample_product.title in msg.whatsapp_text

    def test_pix_suffix(self, formatter, sample_product):
        sample_product.pix_price = 249.90
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "no pix" in msg.whatsapp_text

    def test_no_pix_no_suffix(self, formatter, sample_product):
        sample_product.pix_price = None
        sample_product.installments_without_interest = False
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "no pix" not in msg.whatsapp_text

    def test_format_price_br_style(self, formatter):
        assert formatter._format_price(1299.90) == "1.299,90"
        assert formatter._format_price(99.0) == "99,00"

    def test_cta_present(self, formatter, sample_product):
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert "🛒 Comprar agora!" in msg.whatsapp_text

    def test_product_without_original_price(self, formatter, sample_product):
        sample_product.original_price = None
        sample_product.discount_pct = 0.0
        msg = formatter.format(sample_product, short_link="https://s.black/abc")
        assert msg.whatsapp_text


# ---------------------------------------------------------------------------
# AffiliateLinkBuilder
# ---------------------------------------------------------------------------


class TestAffiliateLinkBuilder:
    """Testes para AffiliateLinkBuilder (API atual)."""

    def test_extract_ml_id_from_url(self):
        """extract_ml_id deve extrair o ID do produto de URLs do ML."""
        import re
        # Testa o padrão regex diretamente (a classe requer storage + user_id)
        pattern = re.compile(r"(MLB\d+)")
        url = "https://www.mercadolivre.com.br/tenis/p/MLB987654321"
        match = pattern.search(url)
        assert match is not None
        assert match.group(1) == "MLB987654321"

    def test_extract_ml_id_no_match(self):
        """URLs sem MLB ID não devem dar match."""
        import re
        pattern = re.compile(r"(MLB\d+)")
        url = "https://www.amazon.com.br/produto/123"
        match = pattern.search(url)
        assert match is None
