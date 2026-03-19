"""
DealHunter — Offer Validator (validação abrangente pré-envio)

Avalia a oferta montada (imagem + texto formatado) usando um LLM com visão
antes da publicação.

Fail-open: se a API falhar ou parsing der erro, auto-aprova.
"""

from __future__ import annotations

import asyncio
import base64
import json
from dataclasses import dataclass, field
from io import BytesIO

import httpx
import structlog

from src.config import settings
from src.utils.openrouter import (
    OPENROUTER_URL,
    extract_content,
    openrouter_headers,
    parse_llm_json,
)

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Resultado da validação
# ---------------------------------------------------------------------------


@dataclass
class OfferValidationResult:
    """Resultado da validação de oferta."""

    approved: bool
    reasons: list[str] = field(default_factory=list)
    suggestions: dict = field(default_factory=dict)
    raw_response: str = ""


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

OFFER_VALIDATION_PROMPT = """\
Voce e um avaliador de qualidade para um canal de ofertas chamado "Sempre Black".
Recebeu uma oferta montada (imagem + texto). Avalie se esta oferta esta pronta \
para publicacao.

TEXTO DA OFERTA:
{offer_text}

Avalie os seguintes criterios e responda APENAS em JSON (sem markdown, sem backticks):
{{
  "approved": true ou false,
  "reasons": ["motivo1", "motivo2"],
  "suggestions": {{
    "image_issue": null ou "descricao do problema",
    "title_issue": null ou "descricao do problema",
    "price_issue": null ou "descricao do problema"
  }}
}}

CRITERIOS DE APROVACAO (TODOS devem passar):
1. IMAGEM: Mostra um produto real e reconhecivel? Qualidade minima aceitavel? \
Nao e uma imagem generica/placeholder?
2. COERENCIA: A imagem corresponde ao produto descrito no texto?
3. TITULO: O titulo (primeira linha em negrito) e atrativo e faz sentido?
4. PRECO: O preco e desconto parecem razoaveis (nao absurdos)?
5. APELO GERAL: A oferta como um todo e atraente para um grupo de WhatsApp \
de ofertas?

CRITERIOS DE REJEICAO (qualquer um reprova):
- Imagem completamente errada ou de baixissima qualidade
- Titulo sem sentido ou cortado no meio
- Preco claramente errado (ex: R$ 0,01 ou R$ 999.999)
- Texto mal formatado ou incompleto

Seja MODERADO: aprove ofertas razoaveis, rejeite apenas as claramente \
problematicas. Na duvida, APROVE."""


# ---------------------------------------------------------------------------
# Chamada síncrona (roda em executor)
# ---------------------------------------------------------------------------


def _validate_offer_sync(
    image_b64: str, offer_text: str
) -> OfferValidationResult:
    """Valida oferta montada com LLM Vision via OpenRouter (síncrono)."""
    model = settings.openrouter.offer_validation_model
    headers = openrouter_headers()
    prompt = OFFER_VALIDATION_PROMPT.format(offer_text=offer_text)

    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            OPENROUTER_URL,
            headers=headers,
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_b64}",
                                },
                            },
                            {"type": "text", "text": prompt},
                        ],
                    },
                ],
                "max_tokens": 256,
                "temperature": 0.1,
            },
        )
        if not resp.is_success:
            logger.warning(
                "offer_validation_api_error",
                status=resp.status_code,
                body=resp.text[:200],
            )
            return OfferValidationResult(
                approved=True, reasons=["api error, auto-approved"]
            )

    raw_text = extract_content(resp.json())
    fallback = {"approved": True}
    parsed = parse_llm_json(raw_text, fallback=fallback)

    if parsed is fallback:
        return OfferValidationResult(
            approved=True,
            reasons=["parse error, auto-approved"],
            raw_response=raw_text,
        )

    return OfferValidationResult(
        approved=bool(parsed.get("approved", True)),
        reasons=parsed.get("reasons", []),
        suggestions=parsed.get("suggestions", {}),
        raw_response=raw_text,
    )


# ---------------------------------------------------------------------------
# Interface pública (async)
# ---------------------------------------------------------------------------


async def validate_offer(
    image_bytes: bytes | None,
    whatsapp_text: str,
) -> OfferValidationResult:
    """
    Valida a oferta montada (imagem + texto) usando LLM com visão.

    Auto-aprova se:
    - Validação desabilitada (OFFER_VALIDATION_ENABLED=false)
    - Sem API key configurada
    - Sem bytes de imagem disponíveis
    - Qualquer erro na chamada (fail-open)
    """
    if not settings.openrouter.offer_validation_enabled:
        return OfferValidationResult(
            approved=True, reasons=["validation disabled"]
        )

    if not settings.openrouter.api_key:
        return OfferValidationResult(
            approved=True, reasons=["no API key, auto-approved"]
        )

    if not image_bytes:
        return OfferValidationResult(
            approved=True, reasons=["no image bytes, auto-approved"]
        )

    from src.utils.image_utils import resize_for_validation
    b64 = resize_for_validation(image_bytes)

    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, _validate_offer_sync, b64, whatsapp_text
        )
    except Exception as exc:
        logger.warning("offer_validation_error", error=str(exc))
        return OfferValidationResult(
            approved=True, reasons=[f"exception, auto-approved: {exc}"]
        )


# ---------------------------------------------------------------------------
# Validação de texto/título (sem imagem — usada após validação por camada)
# ---------------------------------------------------------------------------

TEXT_VALIDATION_PROMPT = """\
Voce e um avaliador de qualidade para um canal de ofertas chamado "Sempre Black".
Avalie APENAS o texto da oferta abaixo. A imagem ja foi validada previamente \
no pipeline de selecao de imagens.

TEXTO DA OFERTA:
{offer_text}

Responda APENAS em JSON (sem markdown, sem backticks):
{{
  "approved": true ou false,
  "reasons": ["motivo1", "motivo2"],
  "suggestions": {{
    "title_issue": null ou "descricao do problema",
    "price_issue": null ou "descricao do problema"
  }}
}}

CRITERIOS (somente texto):
1. TITULO: A primeira linha em negrito e atraente e faz sentido?
2. PRECO: O preco e desconto parecem razoaveis (nao absurdos)?
3. FORMATACAO: Texto completo, sem truncamentos, CTA presente?

CRITERIOS DE REJEICAO (qualquer um reprova):
- Titulo sem sentido ou cortado no meio
- Preco claramente errado (ex: R$ 0,01 ou R$ 999.999)
- Texto mal formatado ou incompleto

Seja MODERADO: aprove textos razoaveis, rejeite apenas os claramente \
problematicos. Na duvida, APROVE."""


def _validate_text_sync(offer_text: str) -> OfferValidationResult:
    """Valida apenas o texto da oferta via LLM (sem imagem)."""
    api_key = settings.openrouter.api_key
    model = settings.openrouter.offer_validation_model

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://dealhunter.ai",
        "X-Title": "DealHunter",
    }

    prompt = TEXT_VALIDATION_PROMPT.format(offer_text=offer_text)

    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            OPENROUTER_URL,
            headers=headers,
            json={
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": prompt}],
                    }
                ],
                "max_tokens": 256,
                "temperature": 0.1,
            },
        )
        if not resp.is_success:
            logger.warning(
                "text_validation_api_error",
                status=resp.status_code,
                body=resp.text[:200],
            )
            return OfferValidationResult(
                approved=True, reasons=["api error, auto-approved"]
            )

    data = resp.json()
    raw_text = data["choices"][0]["message"]["content"].strip()

    start = raw_text.find("{")
    end = raw_text.rfind("}") + 1
    if start == -1 or end == 0:
        logger.warning("text_validation_no_json", raw=raw_text[:200])
        return OfferValidationResult(
            approved=True,
            reasons=["parse error, auto-approved"],
            raw_response=raw_text,
        )

    try:
        parsed = json.loads(raw_text[start:end])
    except json.JSONDecodeError:
        logger.warning("text_validation_invalid_json", raw=raw_text[:200])
        return OfferValidationResult(
            approved=True,
            reasons=["parse error, auto-approved"],
            raw_response=raw_text,
        )

    return OfferValidationResult(
        approved=bool(parsed.get("approved", True)),
        reasons=parsed.get("reasons", []),
        suggestions=parsed.get("suggestions", {}),
        raw_response=raw_text,
    )


async def validate_text_only(whatsapp_text: str) -> OfferValidationResult:
    """
    Valida apenas o texto da oferta (título, preço, formatação).

    Valida apenas o texto, sem enviar imagem ao LLM — mais rápido e barato.

    Auto-aprova se:
    - Validação desabilitada (OFFER_VALIDATION_ENABLED=false)
    - Sem API key configurada
    - Qualquer erro na chamada (fail-open)
    """
    if not settings.openrouter.offer_validation_enabled:
        return OfferValidationResult(
            approved=True, reasons=["validation disabled"]
        )

    if not settings.openrouter.api_key:
        return OfferValidationResult(
            approved=True, reasons=["no API key, auto-approved"]
        )

    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(
            None, _validate_text_sync, whatsapp_text
        )
    except Exception as exc:
        logger.warning("text_validation_error", error=str(exc))
        return OfferValidationResult(
            approved=True, reasons=[f"exception, auto-approved: {exc}"]
        )
