"""
DealHunter — Entry Point Principal (Scraper Pipeline)
Coleta ofertas do Mercado Livre, pontua e salva no banco.

Fluxo: scraping cards → dedup → fake discount filter → score → salvar.
"""

import asyncio
import time

import structlog

from src.logging_config import setup_logging
from src.config import settings
from src.scraper.ml_scraper import MLScraper
from src.analyzer.fake_discount_detector import FakeDiscountDetector
from src.analyzer.score_engine import ScoreEngine
from src.database.storage_manager import StorageManager
from src.monitoring.alert_bot import AlertBot
from src.monitoring.health_check import HealthCheck

setup_logging()
logger = structlog.get_logger(__name__)


async def run_pipeline() -> dict:
    """
    Executa o pipeline de scraping do DealHunter.

    Coleta ofertas dos cards de listagem, filtra duplicatas e descontos falsos,
    e salva no banco.

    Retorna dict com estatísticas da execução.
    """
    stats = {
        "scraped": 0,
        "new": 0,
        "scored": 0,
        "approved": 0,
        "rejected": 0,
        "saved": 0,
        "errors": 0,
    }
    timings: dict[str, float] = {}

    logger.info("pipeline_start", env=settings.env)

    fake_detector = FakeDiscountDetector()
    alert_bot = AlertBot()

    async with StorageManager() as storage:
        # 1. SCRAPING — Coleta ofertas de todas as fontes (scraper unificado)
        scraper = MLScraper()
        t0 = time.time()
        try:
            all_products = await scraper.scrape()
        except Exception as exc:
            all_products = []
            logger.error("scraper_failed", error=str(exc))
            stats["errors"] += 1
            try:
                await alert_bot.send_error(exc, context="MLScraper")
            except Exception:
                pass
        timings["scraping"] = round(time.time() - t0, 2)

        stats["scraped"] = len(all_products)

        if not all_products:
            logger.warning("no_products_scraped")
            return stats

        # 2. DEDUPLICAÇÃO — Remove produtos já publicados recentemente
        t0 = time.time()
        if await storage.has_recent_sends(hours=24):
            new_products = []
            for product in all_products:
                if not await storage.was_recently_sent(product.ml_id, hours=24):
                    new_products.append(product)
        else:
            new_products = all_products
        timings["dedup"] = round(time.time() - t0, 2)

        logger.info("dedup_done", total=len(all_products), new=len(new_products))

        # 3. FAKE DISCOUNT FILTER — Usa dados do card (pré-enrichment)
        t0 = time.time()
        fake_results = fake_detector.check_batch(new_products)
        genuine_products = [p for p, r in fake_results if not r.is_fake]
        stats["new"] = len(genuine_products)
        timings["fake_filter"] = round(time.time() - t0, 2)

        logger.info(
            "fake_filter_done",
            genuine=len(genuine_products),
            fake=len(new_products) - len(genuine_products),
        )

        # 4. SCORE — Avalia e filtra por pontuação mínima
        t0 = time.time()
        score_engine = ScoreEngine()
        scored_products = score_engine.evaluate_batch(genuine_products)
        stats["scored"] = len(genuine_products)
        stats["approved"] = len(scored_products)
        stats["rejected"] = len(genuine_products) - len(scored_products)
        timings["scoring"] = round(time.time() - t0, 2)

        # 5. SALVAR NO BANCO — Só produtos aprovados pelo score
        approved_products = [s.product for s in scored_products]

        t0 = time.time()
        if approved_products:
            try:
                ids = await storage.upsert_products_batch(approved_products)
                entries = [
                    {
                        "product_id": ids[p.ml_id],
                        "price": p.price,
                        "original_price": p.original_price,
                    }
                    for p in approved_products
                    if p.ml_id in ids
                ]
                await storage.add_price_history_batch(entries)
                stats["saved"] = len(ids)

                # Salva scored_offers em batch (1 transação)
                scored_entries = [
                    {
                        "product_id": ids[s.product.ml_id],
                        "rule_score": int(s.score),
                        "final_score": int(s.score),
                        "status": "pending",
                    }
                    for s in scored_products
                    if s.product.ml_id in ids
                ]
                if scored_entries:
                    try:
                        await storage.save_scored_offers_batch(scored_entries)
                    except Exception as exc_so:
                        logger.warning(
                            "scored_offers_batch_save_failed",
                            error=str(exc_so),
                        )

            except Exception as exc:
                logger.error("batch_save_failed", error=str(exc))
                # Fallback: salva individualmente
                for s in scored_products:
                    product = s.product
                    try:
                        product_id = await storage.upsert_product(product)
                        await storage.add_price_history(
                            product_id, product.price, product.original_price
                        )
                        await storage.save_scored_offer(
                            product_id=product_id,
                            rule_score=int(s.score),
                            final_score=int(s.score),
                            status="pending",
                        )
                        stats["saved"] += 1
                    except Exception as exc2:
                        logger.error(
                            "save_failed",
                            ml_id=product.ml_id,
                            error=str(exc2),
                        )
                        stats["errors"] += 1
        timings["saving"] = round(time.time() - t0, 2)

        # ── Build enriched stats for final banner ──
        score_stats = {}
        if scored_products:
            scores = [s.score for s in scored_products]
            score_stats["score_avg"] = round(sum(scores) / len(scores), 1)
            score_stats["score_min"] = round(min(scores), 1)
            score_stats["score_max"] = round(max(scores), 1)

        price_stats = {}
        if approved_products:
            prices = [p.price for p in approved_products]
            discounts = [
                p.discount_pct for p in approved_products if p.discount_pct > 0
            ]
            price_stats["price_min"] = min(prices)
            price_stats["price_max"] = max(prices)
            if discounts:
                price_stats["discount_avg"] = round(sum(discounts) / len(discounts), 1)

        stats["timings"] = timings
        stats["score_stats"] = score_stats
        stats["price_stats"] = price_stats

    return stats


async def main():
    """Entry point com health check inicial."""
    start_time = time.time()

    # Health check antes de começar
    checker = HealthCheck()
    report = await checker.run()

    if not report.overall_healthy:
        logger.warning("unhealthy_services", summary=report.summary())

    # Executa pipeline
    stats = await run_pipeline()

    elapsed_time = round(time.time() - start_time, 2)
    stats["elapsed_seconds"] = elapsed_time
    logger.info("pipeline_summary", **stats)


if __name__ == "__main__":
    asyncio.run(main())
