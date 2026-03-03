"""
DealHunter — Entry Point Principal
Orquestra o fluxo completo: scraping → análise → publicação.
Pode ser chamado diretamente ou via APScheduler/n8n.
"""

import asyncio
import logging
import re

import structlog

from src.config import settings
from src.scraper.ofertas_do_dia import OfertasDoDiaScraper
from src.scraper.categoria_moda import CategoriaModaScraper
from src.analyzer.score_engine import ScoreEngine
from src.analyzer.fake_discount_detector import FakeDiscountDetector
from src.distributor.message_formatter import MessageFormatter
from src.distributor.affiliate_links import AffiliateLinkBuilder
from src.distributor.shlink_client import ShlinkClient
from src.distributor.telegram_bot import TelegramBot
from src.distributor.whatsapp_notifier import WhatsAppNotifier
from src.database.storage_manager import StorageManager
from src.monitoring.alert_bot import AlertBot
from src.monitoring.health_check import HealthCheck


# ---------------------------------------------------------------------------
# Processador de redação de dados sensíveis nos logs
# ---------------------------------------------------------------------------
_SENSITIVE_PATTERNS = [
    (re.compile(r"(sk-ant-api\w{2}-)[\w-]+"), r"\1****"),  # Anthropic API keys
    (re.compile(r"(eyJ[\w-]+\.eyJ[\w-]+)\.[\w-]+"), r"\1.****"),  # JWTs (Supabase keys)
    (re.compile(r"(Bearer\s+)[\w.-]+"), r"\1****"),  # Bearer tokens
    (re.compile(r"(apikey[=:\s]+)[\w-]+", re.I), r"\1****"),  # API keys genéricos
    (re.compile(r"(\d{6,}:[\w-]{30,})"), "****:****"),  # Telegram bot tokens
]


def _redact_sensitive_data(logger, method_name, event_dict):
    """Processador structlog que mascara dados sensíveis nos valores dos logs."""
    for key, value in event_dict.items():
        if not isinstance(value, str):
            continue
        for pattern, replacement in _SENSITIVE_PATTERNS:
            value = pattern.sub(replacement, value)
        event_dict[key] = value
    return event_dict


# Configura logging estruturado
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        _redact_sensitive_data,
        (
            structlog.dev.ConsoleRenderer()
            if not settings.is_production
            else structlog.processors.JSONRenderer()
        ),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level)
    ),
)

logger = structlog.get_logger(__name__)


async def run_pipeline() -> dict:
    """
    Executa o pipeline completo do DealHunter.

    Retorna dict com estatísticas da execução.
    """
    stats = {
        "scraped": 0,
        "approved": 0,
        "published": 0,
        "errors": 0,
    }

    logger.info("pipeline_start", env=settings.env)

    # Inicializa componentes
    score_engine = ScoreEngine()
    fake_detector = FakeDiscountDetector()
    formatter = MessageFormatter()
    affiliate_builder = AffiliateLinkBuilder()
    shlink = ShlinkClient()
    telegram = TelegramBot()
    whatsapp = WhatsAppNotifier()
    alert_bot = AlertBot()

    async with StorageManager() as storage:
        # 1. SCRAPING — Coleta ofertas de múltiplas fontes
        all_products = []
        scrapers = [
            OfertasDoDiaScraper(max_pages=2),
            CategoriaModaScraper(max_pages_per_category=1),
        ]

        for scraper in scrapers:
            try:
                products = await scraper.scrape()
                all_products.extend(products)
                logger.info(
                    "scraper_done",
                    source=scraper.__class__.__name__,
                    count=len(products),
                )
            except Exception as exc:
                logger.error(
                    "scraper_failed", source=scraper.__class__.__name__, error=str(exc)
                )
                stats["errors"] += 1
                try:
                    await alert_bot.send_error(exc, context=scraper.__class__.__name__)
                except Exception:
                    pass  # Alert bot may not be configured yet

        stats["scraped"] = len(all_products)

        if not all_products:
            logger.warning("no_products_scraped")
            return stats

        # 2. DEDUPLICAÇÃO — Remove produtos já publicados recentemente
        new_products = []
        for product in all_products:
            if not await storage.was_recently_sent(product.ml_id, hours=24):
                new_products.append(product)

        logger.info("dedup_done", total=len(all_products), new=len(new_products))

        # 3. ANÁLISE — Score engine + detector de desconto falso
        fake_results = fake_detector.check_batch(new_products)
        genuine_products = [p for p, r in fake_results if not r.is_fake]

        scored = score_engine.evaluate_batch(genuine_products)
        stats["approved"] = len(scored)

        logger.info(
            "analysis_done",
            approved=len(scored),
            rejected=len(genuine_products) - len(scored),
        )

        # 4. PUBLICAÇÃO — Para cada oferta aprovada
        for scored_product in scored:
            product = scored_product.product
            try:
                # Salva produto no banco e obtém o product_id
                product_id = await storage.upsert_product(product)

                # Registra histórico de preço
                await storage.add_price_history(
                    product_id, product.price, product.original_price
                )

                # Salva resultado da análise (scored offer)
                scored_offer_id = await storage.save_scored_offer(
                    product_id=product_id,
                    rule_score=int(scored_product.score),
                    final_score=int(scored_product.score),
                    status="approved",
                )

                # Constrói URL de afiliado e encurta
                affiliate_url = affiliate_builder.build(product.url)
                try:
                    short_url = await shlink.shorten(
                        affiliate_url,
                        tags=[
                            "dealhunter",
                            (
                                product.category.lower()[:20]
                                if product.category
                                else "moda"
                            ),
                        ],
                    )
                except Exception:
                    short_url = affiliate_url  # Fallback: usa URL de afiliado direta

                # Formata mensagem
                message = formatter.format(product, short_link=short_url)

                # Publica nos canais
                channels_published = []

                try:
                    tg_results = await telegram.publish(message)
                    if any(r.get("success") for r in tg_results):
                        channels_published.append("telegram")
                except Exception as tg_exc:
                    logger.warning("telegram_publish_failed", error=str(tg_exc))

                try:
                    wa_results = await whatsapp.publish(message)
                    if any(r.get("success") for r in wa_results):
                        channels_published.append("whatsapp")
                except Exception as wa_exc:
                    logger.warning("whatsapp_publish_failed", error=str(wa_exc))

                # Registra envio em cada canal
                for channel in channels_published:
                    await storage.mark_as_sent(
                        scored_offer_id=scored_offer_id,
                        channel=channel,
                        shlink_short_url=short_url,
                    )

                if channels_published:
                    stats["published"] += 1

                logger.info(
                    "offer_processed",
                    ml_id=product.ml_id,
                    score=scored_product.score,
                    channels=channels_published,
                )

            except Exception as exc:
                logger.error("publish_failed", ml_id=product.ml_id, error=str(exc))
                stats["errors"] += 1

    logger.info("pipeline_done", **stats)
    return stats


async def main():
    """Entry point com health check inicial."""
    # Health check antes de começar
    checker = HealthCheck()
    report = await checker.run()

    if not report.overall_healthy:
        logger.warning("unhealthy_services", summary=report.summary())

    # Executa pipeline
    stats = await run_pipeline()
    logger.info("execution_complete", **stats)


if __name__ == "__main__":
    asyncio.run(main())
