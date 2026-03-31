"""
Crivo — Sender (Style Guide v3)
Envia a próxima oferta da fila (FIFO por approved_at, com override por queue_priority).

Fluxo:
  1. Consulta próxima oferta não enviada (view vw_approved_unsent)
  2. Se conteúdo curado pelo admin (custom_title/offer_body): usa diretamente
  3. Senão: gera título catchy via IA + formata automaticamente
  4. Obtém/cria link de afiliado
  5. Publica via Telegram
  6. Marca como enviada
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING, TypedDict

import structlog

from src.config import settings
from src.scraper.base_scraper import ScrapedProduct
from src.distributor.affiliate_links import AffiliateLinkBuilder
from src.distributor.message_formatter import MessageFormatter
from src.distributor.telegram_bot import TelegramBot

if TYPE_CHECKING:
    from src.database.storage_manager import StorageManager

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Tipagem da linha retornada pela view vw_approved_unsent
# ---------------------------------------------------------------------------


class UnsentOfferRow(TypedDict):
    product_id: str
    scored_offer_id: str
    ml_id: str
    title: str
    product_url: str
    current_price: float
    original_price: float | None
    pix_price: float | None
    discount_percent: float
    discount_type: str | None
    rating_stars: float | None
    rating_count: int | None
    category: str | None
    thumbnail_url: str | None
    free_shipping: bool
    full_shipping: bool
    brand: str | None
    installments_without_interest: bool
    installment_count: int | None
    installment_value: float | None
    badge: str | None
    final_score: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _safe_number(value: object, default: float = 0) -> float:
    """Extract a numeric value, handling lists returned by Supabase JOINs."""
    if value is None:
        return default
    if isinstance(value, list):
        return float(value[0]) if value else default
    return float(value)


def _offer_to_product(offer: UnsentOfferRow) -> ScrapedProduct:
    """Converte a linha da view vw_approved_unsent em ScrapedProduct."""
    pix_price_raw = offer.get("pix_price")
    orig_price_raw = offer.get("original_price")
    inst_value_raw = offer.get("installment_value")
    inst_count_raw = offer.get("installment_count")
    return ScrapedProduct(
        ml_id=offer["ml_id"],
        url=offer["product_url"],
        title=offer["title"],
        price=_safe_number(offer["current_price"]),
        original_price=(
            _safe_number(orig_price_raw) if orig_price_raw is not None else None
        ),
        pix_price=_safe_number(pix_price_raw) if pix_price_raw else None,
        discount_pct=_safe_number(offer.get("discount_percent")),
        discount_type=offer.get("discount_type"),
        rating=_safe_number(offer.get("rating_stars")),
        review_count=int(_safe_number(offer.get("rating_count"))),
        category=offer.get("category") or "",
        image_url=offer.get("thumbnail_url") or "",
        free_shipping=bool(offer.get("free_shipping", False)),
        full_shipping=bool(offer.get("full_shipping", False)),
        brand=offer.get("brand"),
        installments_without_interest=bool(
            offer.get("installments_without_interest", False)
        ),
        installment_count=int(inst_count_raw) if inst_count_raw else None,
        installment_value=(
            float(inst_value_raw) if inst_value_raw else None
        ),
        badge=offer.get("badge") or "",
    )


    # TODO: reativar quando image enhancement for reintegrado
    # async def _select_and_upload_image(...) foi removido.
    # O sistema usa a imagem padrão do Mercado Livre (thumbnail_url) por enquanto.


# ---------------------------------------------------------------------------
# Helpers de envio
# ---------------------------------------------------------------------------


async def _get_affiliate_url(
    storage: StorageManager,
    offer: UnsentOfferRow,
    product_id: str,
    ml_id: str,
) -> str:
    """Obtém ou cria link de afiliado; retorna URL original como fallback."""
    short_url = offer["product_url"]
    try:
        ml_cfg = settings.mercado_livre
        user_id = await storage.get_or_create_user(
            name=ml_cfg.user_name or ml_cfg.affiliate_tag,
            affiliate_tag=ml_cfg.affiliate_tag,
            email=ml_cfg.user_email or None,
            password=ml_cfg.user_password or None,
        )
        if user_id:
            aff_builder = AffiliateLinkBuilder(storage, user_id=user_id)
            aff_url = await aff_builder.get_or_create(offer["product_url"], product_id)
            short_url = aff_url or offer["product_url"]
    except Exception as exc:
        logger.warning("affiliate_link_failed", ml_id=ml_id, error=str(exc))
    return short_url


async def _publish_telegram(
    bot: TelegramBot,
    msg: Any,
    storage: StorageManager,
    scored_offer_id: str,
    ml_id: str,
    offer: UnsentOfferRow,
    short_url: str,
    catchy_title: str | None,
    enhanced_image_url: str | None,
) -> bool:
    """Publica mensagem no Telegram e marca a oferta como enviada."""
    results = await bot.publish(msg)
    sent_ok = any(r["success"] for r in results)

    if sent_ok:
        try:
            await storage.mark_as_sent(scored_offer_id, channel="telegram")
        except Exception as exc:
            logger.warning("mark_as_sent_failed", ml_id=ml_id, error=str(exc))
        logger.info(
            "offer_sent",
            ml_id=ml_id,
            score=offer["final_score"],
            image_source=enhanced_image_url is not None,
            catchy_title=catchy_title or "(fallback)",
            link=short_url[:60],
        )
    else:
        logger.error("offer_send_failed", ml_id=ml_id, results=results)
    return sent_ok


# ---------------------------------------------------------------------------
# Interface pública
# ---------------------------------------------------------------------------


async def send_next_offer(
    storage: StorageManager,
    telegram_bot: TelegramBot | None = None,
) -> bool:
    """
    Envia a próxima oferta da fila.

    Se a oferta tem conteúdo curado pelo admin (custom_title/offer_body),
    usa diretamente. Caso contrário, gera título e formata automaticamente.

    Args:
        storage: StorageManager compartilhado com o pipeline.
        telegram_bot: Instância injetável (criada internamente se None).

    Returns:
        True se uma oferta foi enviada, False se a fila está vazia.
    """
    raw_offer = await storage.get_next_unsent_offer()
    if not raw_offer:
        logger.debug("send_queue_empty")
        return False
    offer: UnsentOfferRow = raw_offer  # type: ignore[assignment]

    product_id = offer["product_id"]
    scored_offer_id = offer["scored_offer_id"]
    ml_id = offer["ml_id"]
    product_title = offer["title"]
    category = offer.get("category") or ""

    logger.info("sending_offer", ml_id=ml_id, title=product_title[:50], score=offer["final_score"])

    # 1. Link de afiliado
    short_url = await _get_affiliate_url(storage, offer, product_id, ml_id)

    product = _offer_to_product(offer)
    formatter = MessageFormatter()

    # 2. Conteúdo curado pelo admin (prioridade) ou auto-gerado
    custom_title = offer.get("custom_title")
    custom_body = offer.get("offer_body")
    extra_notes = offer.get("extra_notes")

    if custom_body:
        # Admin curou o corpo da mensagem — usar diretamente
        # Substituir placeholder {LINK} pelo link de afiliado
        telegram_text = custom_body.replace("{LINK}", short_url)
        if extra_notes:
            telegram_text = telegram_text.rstrip() + "\n\n" + extra_notes

        from src.distributor.message_formatter import FormattedMessage
        msg = FormattedMessage(
            telegram_text=telegram_text,
            whatsapp_text=telegram_text,  # mesmo conteúdo
            image_url=offer.get("thumbnail_url") or None,
            short_link=short_url,
            product_ml_id=ml_id,
        )
        catchy_title = custom_title
    else:
        # Fluxo auto: gerar título via IA se não curado
        catchy_title = custom_title
        if not catchy_title and settings.openrouter.api_key:
            from src.distributor.title_generator import generate_catchy_title
            try:
                catchy_title = await generate_catchy_title(
                    product_title=product_title,
                    category=category,
                    price=float(offer["current_price"]),
                    original_price=float(offer["original_price"]) if offer.get("original_price") else None,
                )
            except Exception as exc:
                logger.warning("title_generation_failed", ml_id=ml_id, error=str(exc))

        enhanced_image_url: str | None = None
        msg = formatter.format(
            product,
            short_link=short_url,
            catchy_title=catchy_title,
            enhanced_image_url=enhanced_image_url,
        )

        if extra_notes:
            # Inserir notas antes do rodapé
            msg.telegram_text = msg.telegram_text.rstrip() + "\n\n" + extra_notes
            msg.whatsapp_text = msg.whatsapp_text.rstrip() + "\n\n" + extra_notes

    # Validar mensagem (soft — loga mas não bloqueia)
    from src.distributor.message_validator import validate_message
    validate_message(
        whatsapp_text=msg.whatsapp_text,
        free_shipping=product.free_shipping,
        rating=product.rating,
        review_count=product.review_count,
        has_image=msg.image_url is not None,
    )

    # Publicar no Telegram
    if not settings.telegram.bot_token or not settings.telegram.group_ids:
        logger.warning("telegram_not_configured")
        return False

    bot = telegram_bot or TelegramBot()
    return await _publish_telegram(
        bot, msg, storage, scored_offer_id, ml_id, offer, short_url, catchy_title, None
    )
