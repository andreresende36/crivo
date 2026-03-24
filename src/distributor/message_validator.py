"""
Crivo — Message Validator (Style Guide v3)
Checklist de validação pré-envio para garantir conformidade com o template.

Validação soft: loga warnings mas não bloqueia o envio.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ValidationResult:
    """Resultado da validação de mensagem."""
    passed: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _validate_title(first_line: str, errors: list[str], warnings: list[str]) -> None:
    """Valida o título da mensagem (negrito + CAPS LOCK + tamanho)."""
    if not first_line.startswith("*") or not first_line.rstrip().endswith("*"):
        errors.append("Título não está em negrito (*...*)")
        return
    titulo = first_line.strip("* ")
    if titulo != titulo.upper():
        errors.append("Título não está em CAPS LOCK")
    if len(titulo) > 45:
        warnings.append(f"Título muito longo ({len(titulo)} chars, max 45)")
    if len(titulo) < 10:
        warnings.append(f"Título muito curto ({len(titulo)} chars, min 10)")


def _validate_required_elements(text: str, errors: list[str], warnings: list[str]) -> None:
    """Valida elementos obrigatórios do template (emojis, preço, CTA, rodapé)."""
    if "📉" not in text or "% OFF" not in text:
        errors.append("Falta 📉 XX% OFF")
    if "por R$" not in text:
        errors.append("Falta preço final (por R$)")
    if "🤘🏻" not in text:
        errors.append("Falta emoji 🤘🏻 após preço")
    if "🛒" not in text or "Comprar agora!" not in text:
        errors.append("Falta CTA com 🛒 Comprar agora!")
    if "━━━" not in text or "Sempre Black" not in text:
        errors.append("Falta rodapé da marca")
    if "Aqui todo dia é Black Friday" not in text:
        warnings.append("Rodapé não contém 'Aqui todo dia é Black Friday'")
    if "🔥" in text:
        errors.append("Emoji 🔥 presente (banido pelo style guide)")
    if "#" in text:
        warnings.append("Hashtags presentes (removidas no style guide v3)")


def _validate_conditional_fields(
    text: str,
    free_shipping: bool,
    rating: float,
    review_count: int,
    has_image: bool,
    errors: list[str],
    warnings: list[str],
) -> None:
    """Valida campos condicionais: frete, avaliação e imagem."""
    has_frete = "✅ Frete Grátis" in text
    if free_shipping and not has_frete:
        warnings.append("Produto tem frete grátis mas linha não incluída")
    if not free_shipping and has_frete:
        errors.append("Linha de frete grátis presente mas produto não tem frete grátis")

    has_rating = "⭐" in text
    should_show = rating >= 4.0 and review_count >= 50
    if should_show and not has_rating:
        warnings.append("Produto tem boa avaliação mas linha não incluída")
    if not should_show and has_rating:
        warnings.append("Linha de avaliação presente mas critérios não atingidos")

    if not has_image:
        warnings.append("Mensagem sem imagem anexada")


def validate_message(
    whatsapp_text: str,
    free_shipping: bool = False,
    rating: float = 0.0,
    review_count: int = 0,
    has_image: bool = True,
) -> ValidationResult:
    """
    Valida mensagem WhatsApp contra o checklist do Style Guide v3.

    Args:
        whatsapp_text: Texto formatado da mensagem WhatsApp.
        free_shipping: Se o produto tem frete grátis.
        rating: Nota de avaliação do produto.
        review_count: Número de avaliações.
        has_image: Se há imagem anexada.

    Returns:
        ValidationResult com erros e warnings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    lines = whatsapp_text.split("\n")
    first_line = lines[0] if lines else ""

    _validate_title(first_line, errors, warnings)
    _validate_required_elements(whatsapp_text, errors, warnings)
    _validate_conditional_fields(whatsapp_text, free_shipping, rating, review_count, has_image, errors, warnings)

    passed = len(errors) == 0
    result = ValidationResult(passed=passed, errors=errors, warnings=warnings)

    if not passed:
        logger.warning("message_validation_failed", errors=errors, warnings=warnings)
    elif warnings:
        logger.info("message_validation_warnings", warnings=warnings)

    return result
