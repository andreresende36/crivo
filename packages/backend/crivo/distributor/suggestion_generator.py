"""
Crivo — Suggestion Generator
Gera 3 sugestoes de titulo + 3 sugestoes de corpo de mensagem para revisao no painel admin.
Usa Claude Haiku via OpenRouter em uma unica chamada.
"""


import asyncio
import json
import re
from typing import TYPE_CHECKING

import structlog

from crivo.config import settings
from crivo.utils.openrouter import (
    OPENROUTER_URL,
    call_openrouter_sync,
    extract_content,
    parse_llm_json,
)
from crivo.utils.prompts_loader import load_prompt
from crivo.utils.brands import extract_brand

if TYPE_CHECKING:
    from crivo.database.title_examples import TitleExample

logger = structlog.get_logger(__name__)

HAIKU_MODEL = "anthropic/claude-haiku-4-5"
SYSTEM_PROMPT = load_prompt("suggestion_system")

_USER_TEMPLATE = """\
Produto: {product_title}
Categoria: {category}
Preço atual: R$ {price:.2f}
{original_price_line}\
{discount_line}\
Frete grátis: {free_shipping}
{rating_line}\

Gere 3 títulos e 3 corpos de mensagem em JSON."""


def _build_user_prompt(
    product_title: str,
    category: str,
    price: float,
    original_price: float | None,
    discount_pct: float,
    free_shipping: bool,
    rating: float | None,
    review_count: int | None,
) -> str:
    original_price_line = ""
    if original_price and original_price > price:
        original_price_line = f"Preço original: R$ {original_price:.2f}\n"

    discount_line = ""
    if discount_pct > 0:
        discount_line = f"Desconto: {discount_pct:.0f}%\n"

    rating_line = ""
    if rating and review_count:
        rating_line = f"Avaliação: {rating}/5 ({review_count} avaliações)\n"

    return _USER_TEMPLATE.format(
        product_title=product_title,
        category=category,
        price=price,
        original_price_line=original_price_line,
        discount_line=discount_line,
        free_shipping="Sim" if free_shipping else "Não",
        rating_line=rating_line,
    )


def _build_system_prompt(examples: list[TitleExample] | None = None) -> str:
    if not examples:
        return SYSTEM_PROMPT

    examples_text = "\n\n## EXEMPLOS RECENTES APROVADOS PELO ADMIN\n"
    for ex in examples:
        label = "(editado)" if ex.action == "edited" else ""
        examples_text += f"\nProduto: {ex.product_title}\nTítulo: {ex.final_title} {label}\n"

    return SYSTEM_PROMPT + examples_text


def _clean_title(raw: str) -> str:
    title = raw.strip().strip("*").strip('"').strip("'").strip()
    title = re.sub("[\U0001F300-\U0001F9FF]", "", title).strip()
    return title.upper()


def _fallback_suggestions(
    product_title: str,
    price: float,
    original_price: float | None,
    discount_pct: float,
    free_shipping: bool,
) -> dict:
    """Gera sugestoes rule-based quando IA nao esta disponivel."""
    brand = extract_brand(product_title)
    if brand:
        title = f"{brand.upper()} COM PREÇÃO"[:35]
    else:
        title = "OFERTA IMPERDÍVEL"

    price_str = f"{price:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    orig_str = f"{original_price:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".") if original_price else price_str
    shipping = "\n✅ Frete Grátis" if free_shipping else ""

    body = (
        f"*{title}*\n\n"
        f"{product_title}\n\n"
        f"📉 {discount_pct:.0f}% OFF\n"
        f"*por R$ {price_str}* 🤘🏻\n"
        f"{shipping}\n\n"
        f"🛒 Comprar agora! {{LINK}}\n\n"
        f"━━━━━━━━━━━━━━━\n"
        f"Sempre Black — Aqui todo dia é Black Friday 🖤"
    )

    return {"titles": [title], "bodies": [body]}


def _generate_sync(
    product_title: str,
    category: str,
    price: float,
    original_price: float | None,
    discount_pct: float,
    free_shipping: bool,
    rating: float | None,
    review_count: int | None,
    examples: list[TitleExample] | None = None,
) -> dict:
    """Gera sugestoes via Haiku (sincrono)."""
    api_key = settings.openrouter.api_key
    if not api_key:
        return _fallback_suggestions(product_title, price, original_price, discount_pct, free_shipping)

    system_prompt = _build_system_prompt(examples)
    user_msg = _build_user_prompt(
        product_title, category, price, original_price,
        discount_pct, free_shipping, rating, review_count,
    )

    try:
        response = call_openrouter_sync(
            model=HAIKU_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            max_tokens=1024,
            temperature=0.9,
        )
    except Exception as exc:
        logger.warning("suggestion_api_error", error=str(exc))
        return _fallback_suggestions(product_title, price, original_price, discount_pct, free_shipping)

    raw = extract_content(response)
    result = parse_llm_json(raw, fallback=None)

    if not result or "titles" not in result or "bodies" not in result:
        logger.warning("suggestion_parse_failed", raw=raw[:200])
        return _fallback_suggestions(product_title, price, original_price, discount_pct, free_shipping)

    # Limpar titulos
    result["titles"] = [_clean_title(t) for t in result["titles"] if t]
    if not result["titles"]:
        return _fallback_suggestions(product_title, price, original_price, discount_pct, free_shipping)

    logger.info(
        "suggestions_generated",
        titles=result["titles"],
        body_count=len(result.get("bodies", [])),
        product=product_title[:40],
    )
    return result


async def generate_suggestions(
    product_title: str,
    category: str,
    price: float,
    original_price: float | None = None,
    discount_pct: float = 0,
    free_shipping: bool = False,
    rating: float | None = None,
    review_count: int | None = None,
    examples: list[TitleExample] | None = None,
) -> dict:
    """
    Gera 3 sugestoes de titulo + 3 sugestoes de corpo via Claude Haiku.
    Fallback rule-based se API falhar.

    Returns:
        {"titles": [str, str, str], "bodies": [str, str, str]}
    """
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None,
            _generate_sync,
            product_title,
            category,
            price,
            original_price,
            discount_pct,
            free_shipping,
            rating,
            review_count,
            examples,
        )
    except Exception as exc:
        logger.warning("suggestion_generation_error", error=str(exc))
        return _fallback_suggestions(product_title, price, original_price, discount_pct, free_shipping)
