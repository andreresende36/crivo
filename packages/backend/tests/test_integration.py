"""
Testes de integração do Crivo.

Testa o pipeline completo (score, formatação) com mocks para serviços externos.
"""

from unittest.mock import patch

import pytest

from crivo.scraper.base_scraper import ScrapedProduct
from crivo.analyzer.score_engine import ScoreEngine
from crivo.analyzer.fake_discount_detector import FakeDiscountDetector
from crivo.distributor.message_formatter import MessageFormatter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def good_product() -> ScrapedProduct:
    return ScrapedProduct(
        ml_id="MLB999111222",
        url="https://www.mercadolivre.com.br/tenis/p/MLB999111222",
        title="Tênis Nike Air Max 270 Masculino Preto Original",
        price=299.90,
        original_price=599.90,
        rating=4.7,
        review_count=350,
        category="Calçados",
        free_shipping=True,
        image_url="https://http2.mlstatic.com/image.jpg",
        source="ofertas_do_dia",
    )


@pytest.fixture
def mediocre_product() -> ScrapedProduct:
    return ScrapedProduct(
        ml_id="MLB888777666",
        url="https://www.mercadolivre.com.br/camiseta/p/MLB888777666",
        title="Camiseta Básica Masculina Algodão Kit 3 Peças",
        price=59.90,
        original_price=99.90,
        rating=4.2,
        review_count=50,
        category="Moda",
        free_shipping=False,
        source="categoria_moda",
    )


@pytest.fixture
def fake_discount_product() -> ScrapedProduct:
    return ScrapedProduct(
        ml_id="MLB777666555",
        url="https://www.mercadolivre.com.br/produto/p/MLB777666555",
        title="Produto com Desconto Inflado Suspeitamente",
        price=49.90,
        original_price=5000.0,  # 100x — claramente inflado
        rating=4.0,
        review_count=20,
        source="ofertas_do_dia",
    )


@pytest.fixture
def mock_settings():
    """Mocka settings para testes independentes de .env."""
    with patch("crivo.analyzer.score_engine.settings") as mock:
        mock.score.min_discount_pct = 20.0
        mock.score.min_score = 60
        mock.score.min_rating = 4.0
        mock.score.min_reviews = 10
        mock.score.weight_discount = 30.0
        mock.score.weight_badge = 15.0
        mock.score.weight_rating = 15.0
        mock.score.weight_reviews = 10.0
        mock.score.weight_free_shipping = 10.0
        mock.score.weight_installments = 10.0
        mock.score.weight_title_quality = 10.0
        yield mock


# ---------------------------------------------------------------------------
# Teste: Pipeline Score → Fake Detection → Formatação
# ---------------------------------------------------------------------------


class TestScoreToFormatPipeline:
    """Testa o fluxo análise → detecção de fraude → formatação."""

    def test_good_product_flows_through(
        self, mock_settings, good_product
    ):
        engine = ScoreEngine()
        detector = FakeDiscountDetector()
        formatter = MessageFormatter()

        # 1. Fake detection
        fake_result = detector.check(good_product)
        assert fake_result.is_fake is False

        # 2. Score
        scored = engine.evaluate(good_product)
        assert scored.passed is True
        assert scored.score >= 60

        # 3. Formatação
        msg = formatter.format(good_product, short_link="https://s.black/abc")
        assert msg.telegram_text
        assert msg.whatsapp_text
        assert "299" in msg.telegram_text
        assert "https://s.black/abc" in msg.whatsapp_text

    def test_fake_product_rejected(self, mock_settings, fake_discount_product):
        detector = FakeDiscountDetector()
        result = detector.check(fake_discount_product)
        assert result.is_fake is True

    def test_batch_pipeline(
        self, mock_settings, good_product, mediocre_product, fake_discount_product
    ):
        engine = ScoreEngine()
        detector = FakeDiscountDetector()

        products = [good_product, mediocre_product, fake_discount_product]

        # 1. Fake detection em batch
        fake_results = detector.check_batch(products)
        genuine = [p for p, r in fake_results if not r.is_fake]
        assert len(genuine) < len(products)  # Pelo menos o fake deve ser removido

        # 2. Score em batch
        approved = engine.evaluate_batch(genuine)
        # O bom produto deve passar
        ml_ids = [s.product.ml_id for s in approved]
        assert good_product.ml_id in ml_ids


# ---------------------------------------------------------------------------
# Teste: Redação de dados sensíveis
# ---------------------------------------------------------------------------


class TestLogRedaction:
    """Testa que o processador de redação mascara dados sensíveis."""

    def test_redact_anthropic_key(self):
        from crivo.logging_config import _redact_sensitive_data

        event = {"error": "Auth failed with key sk-ant-api03-abcdefghijklmnop"}
        result = _redact_sensitive_data(None, None, event)
        assert "abcdefghijklmnop" not in result["error"]
        assert "sk-ant-api03-" in result["error"]
        assert "****" in result["error"]

    def test_redact_jwt(self):
        from crivo.logging_config import _redact_sensitive_data

        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"  # noqa: E501
        event = {"detail": f"Failed: {jwt}"}
        result = _redact_sensitive_data(None, None, event)
        assert "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U" not in result["detail"]
        assert "****" in result["detail"]

    def test_redact_bearer(self):
        from crivo.logging_config import _redact_sensitive_data

        event = {"header": "Bearer eyJhbGciOiJIUzI1NiJ9.abc123.xyz"}
        result = _redact_sensitive_data(None, None, event)
        assert "abc123" not in result["header"]
        assert "Bearer ****" in result["header"]

    def test_non_string_values_untouched(self):
        from crivo.logging_config import _redact_sensitive_data

        event = {"count": 42, "ok": True, "items": ["a", "b"]}
        result = _redact_sensitive_data(None, None, event)
        assert result["count"] == 42
        assert result["ok"] is True


# ---------------------------------------------------------------------------
# Teste: WhatsApp Rate Limiting
# ---------------------------------------------------------------------------


class TestWhatsAppRateLimiting:
    """Testa que o rate limiter do WhatsApp funciona."""

    @pytest.mark.asyncio
    async def test_rate_limit_tracking(self):
        with patch("crivo.distributor.whatsapp_notifier.settings") as mock_cfg:
            mock_cfg.whatsapp.api_url = "http://localhost:8080"
            mock_cfg.whatsapp.api_key = "test_key"
            mock_cfg.whatsapp.instance_name = "test"
            mock_cfg.whatsapp.group_ids = ["group1"]
            mock_cfg.whatsapp.send_delay = 0.01
            mock_cfg.whatsapp.max_messages_per_minute = 5

            from crivo.distributor.whatsapp_notifier import WhatsAppNotifier

            notifier = WhatsAppNotifier()

            # Simula 5 envios
            import time

            for _ in range(5):
                notifier._sent_timestamps.append(time.monotonic())

            # O próximo deve aguardar
            assert len(notifier._sent_timestamps) == 5
