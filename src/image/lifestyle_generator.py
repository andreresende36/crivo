"""
DealHunter — Lifestyle Image Generator
Pipeline de 2 passos para transformar thumbnail de produto em imagem lifestyle.
Tudo via OpenRouter.

Passo 1: Claude Haiku 4.5 analisa a imagem e gera um prompt otimizado
Passo 2: Gemini 2.5 Flash Image gera a imagem lifestyle

Ambos os passos são síncronos (httpx) — o wrapper async roda em executor.
"""

from __future__ import annotations

import asyncio
import base64
import json
from io import BytesIO

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_HEADERS_BASE = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://dealhunter.ai",
    "X-Title": "DealHunter",
}

HAIKU_MODEL = "anthropic/claude-haiku-4-5-20251001"
GEMINI_MODEL = "google/gemini-2.5-flash-image"

ANALYSIS_SYSTEM_PROMPT = """\
Você é um especialista em fotografia de produto e marketing visual para e-commerce \
brasileiro. Sua tarefa é analisar uma foto de produto e gerar um prompt de geração \
de imagem otimizado para o Gemini 2.5 Flash Image (Nano Banana).

PROCESSO:
1. Identifique o produto: tipo, marca (se visível), cor, materiais, detalhes
2. Determine a categoria: calçado, eletrônico, roupa, acessório, brinquedo, \
   utensílio doméstico, etc.
3. Escolha o cenário ideal de uso real para esse produto
4. Gere o prompt em inglês otimizado para geração de imagem

REGRAS PARA O PROMPT:
- Escreva SEMPRE em inglês (melhor resultado no Gemini)
- Use linguagem descritiva de fotografia: mencione lente, iluminação, composição
- Descreva a cena de uso real com detalhes sensoriais (textura, luz, ambiente)
- Inclua "this exact product" para referenciar a imagem de entrada
- Use frases positivas (descreva o que QUER, não o que não quer)
- Especifique estilo fotográfico: editorial lifestyle, natural light photography
- Inclua detalhes de iluminação: golden hour, soft natural light, warm ambient
- Mencione profundidade de campo: shallow depth of field, f/2.8, bokeh
- Especifique que a imagem deve parecer uma foto real (não render 3D)

CENÁRIOS POR CATEGORIA (adapte criativamente):
- Calçado → pessoa caminhando em rua urbana, calçadão, parque
- Eletrônico → mesa de trabalho organizada, sala moderna, uso casual
- Roupa → pessoa usando em ambiente urbano, café, rua movimentada
- Acessório → close-up em uso, complementando um look
- Brinquedo → criança brincando em sala iluminada, parque, jardim
- Utensílio doméstico → cozinha moderna, bancada organizada
- Mochila/bolsa → pessoa em campus, trilha, viagem
- Produto de beleza → bancada de banheiro elegante, penteadeira

RESPONDA APENAS com um JSON válido (sem markdown, sem backticks):
{
  "product_name": "nome descritivo do produto",
  "category": "categoria identificada",
  "scene_description": "descrição breve da cena escolhida em português",
  "generation_prompt": "prompt completo em inglês para gerar a imagem"
}
"""


def _get_headers() -> dict[str, str]:
    return {
        **OPENROUTER_HEADERS_BASE,
        "Authorization": f"Bearer {settings.openrouter.api_key}",
    }


# ---------------------------------------------------------------------------
# Passo 1 — Análise com Haiku via OpenRouter
# ---------------------------------------------------------------------------
def _step1_analyze_product(image_b64: str, media_type: str) -> dict:
    """Envia imagem ao Haiku via OpenRouter e recebe prompt otimizado."""
    api_key = settings.openrouter.api_key
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada")

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            OPENROUTER_URL,
            headers=_get_headers(),
            json={
                "model": HAIKU_MODEL,
                "messages": [
                    {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_b64}",
                                },
                            },
                            {
                                "type": "text",
                                "text": "Analise este produto e gere o prompt de imagem lifestyle.",
                            },
                        ],
                    },
                ],
                "max_tokens": 1024,
                "temperature": 0.3,
            },
        )
        resp.raise_for_status()

    data = resp.json()
    raw_text = data["choices"][0]["message"]["content"].strip()

    # Remove possíveis backticks markdown
    cleaned = raw_text
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("haiku_invalid_json", raw=raw_text[:200], error=str(e))
        raise RuntimeError("Haiku não retornou JSON válido") from e

    logger.info(
        "haiku_analysis_done",
        product=result.get("product_name", "?"),
        category=result.get("category", "?"),
        prompt_len=len(result.get("generation_prompt", "")),
    )
    return result


# ---------------------------------------------------------------------------
# Passo 2 — Geração com Gemini via OpenRouter
# ---------------------------------------------------------------------------
def _step2_generate_image(prompt: str, image_b64: str, media_type: str) -> bytes:
    """
    Gera imagem lifestyle via Gemini 2.5 Flash Image no OpenRouter.
    Retorna JPEG bytes.
    """
    api_key = settings.openrouter.api_key
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada")

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            OPENROUTER_URL,
            headers=_get_headers(),
            json={
                "model": GEMINI_MODEL,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt,
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_b64}",
                                },
                            },
                        ],
                    },
                ],
            },
        )
        resp.raise_for_status()

    data = resp.json()
    message = data["choices"][0]["message"]
    content = message.get("content")

    # O OpenRouter pode retornar imagem de diferentes formas:
    # 1. content é uma lista com parts (multimodal)
    # 2. content é uma string com base64 inline
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                # Formato: {"type": "image_url", "image_url": {"url": "data:image/...;base64,..."}}
                if part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url.startswith("data:"):
                        b64_data = url.split(",", 1)[1]
                        image_bytes = base64.b64decode(b64_data)
                        logger.info("gemini_image_generated_from_parts")
                        return _ensure_jpeg(image_bytes)
    elif isinstance(content, str):
        # Pode ser base64 puro ou data URI
        if content.startswith("data:image"):
            b64_data = content.split(",", 1)[1]
            image_bytes = base64.b64decode(b64_data)
            logger.info("gemini_image_generated_from_data_uri")
            return _ensure_jpeg(image_bytes)
        # Tenta como base64 puro (sem prefixo)
        try:
            image_bytes = base64.b64decode(content)
            if len(image_bytes) > 1000:  # provavelmente é uma imagem
                logger.info("gemini_image_generated_from_raw_b64")
                return _ensure_jpeg(image_bytes)
        except Exception:
            pass
        # Se é texto, o Gemini não gerou imagem
        logger.warning("gemini_returned_text_instead", text=content[:200])

    raise RuntimeError(
        "Gemini não retornou imagem via OpenRouter. "
        "Verifique se o modelo suporta geração de imagem nesta rota."
    )


def _ensure_jpeg(image_bytes: bytes) -> bytes:
    """Converte quaisquer bytes de imagem para JPEG com quality 85."""
    from PIL import Image

    img = Image.open(BytesIO(image_bytes))
    if img.mode == "RGBA":
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    logger.info("image_converted_to_jpeg", size=f"{img.width}x{img.height}")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Pipeline sync completo
# ---------------------------------------------------------------------------
def _sync_generate(image_b64: str, media_type: str) -> bytes:
    """Pipeline completo síncrono: análise → geração. Retorna JPEG bytes."""
    analysis = _step1_analyze_product(image_b64, media_type)
    prompt = analysis["generation_prompt"]
    return _step2_generate_image(prompt, image_b64, media_type)


# ---------------------------------------------------------------------------
# API async para uso no sender
# ---------------------------------------------------------------------------
async def generate_lifestyle_image(thumbnail_url: str) -> bytes | None:
    """
    Baixa thumbnail do produto, gera imagem lifestyle via Haiku + Gemini.
    Tudo via OpenRouter.

    Args:
        thumbnail_url: URL da thumbnail do produto no ML.

    Returns:
        JPEG bytes da imagem gerada, ou None em caso de erro.
    """
    from src.image.image_storage import download_image_bytes

    # Baixa thumbnail
    image_bytes = await download_image_bytes(thumbnail_url)
    if not image_bytes:
        logger.error("lifestyle_thumbnail_download_failed", url=thumbnail_url[:80])
        return None

    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    media_type = "image/jpeg"  # thumbnails do ML são JPEG

    # Roda pipeline sync em thread (httpx sync)
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None,
            _sync_generate,
            image_b64,
            media_type,
        )
        return result
    except Exception as exc:
        logger.error("lifestyle_generation_failed", error=str(exc))
        return None
