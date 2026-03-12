"""
Teste manual do AffiliateLinkBuilder.

Verifica se os parâmetros matt_* são gerados corretamente e se a URL
resultante é aceita pelo Mercado Livre (redirect 200/301/302).

Uso:
    python -m pytest tests/test_affiliate_link.py -v
    python tests/test_affiliate_link.py          # modo standalone com HTTP check
"""

import os
import sys
import urllib.request
from urllib.parse import parse_qs, urlparse

# Garante que src/ está no path ao rodar standalone
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from src.distributor.affiliate_links import AffiliateLinkBuilder

# URL de produto real para o teste HTTP (produto barato/qualquer)
SAMPLE_URL = (
    "https://www.mercadolivre.com.br/multivitaminico-120-caps-growth-supplements"
    "-sabor-neutro-nova-formula/p/MLB21555776"
)

EXPECTED_TAG = os.getenv("ML_AFFILIATE_TAG", "sempreblack")


# ---------------------------------------------------------------------------
# Testes unitários (pytest)
# ---------------------------------------------------------------------------


def test_build_adds_matt_params():
    """Todos os parâmetros matt_* devem estar presentes na URL gerada."""
    builder = AffiliateLinkBuilder()
    url = builder.build(SAMPLE_URL)
    params = parse_qs(urlparse(url).query)

    required = ["matt_tool", "matt_word", "matt_source", "matt_campaign", "matt_ad_type", "matt_creative_id"]
    for param in required:
        assert param in params, f"Parâmetro ausente: {param}"


def test_build_tag_matches_config():
    """O matt_word e matt_campaign devem usar a tag configurada."""
    builder = AffiliateLinkBuilder()
    url = builder.build(SAMPLE_URL)
    params = parse_qs(urlparse(url).query)

    assert params["matt_word"][0] == EXPECTED_TAG, (
        f"matt_word esperado '{EXPECTED_TAG}', obtido '{params['matt_word'][0]}'"
    )
    assert params["matt_campaign"][0] == EXPECTED_TAG


def test_build_preserves_original_path():
    """O path da URL original deve ser mantido."""
    builder = AffiliateLinkBuilder()
    url = builder.build(SAMPLE_URL)
    assert "/p/MLB21555776" in url


def test_build_invalid_url_returns_original():
    """URLs inválidas devem ser retornadas sem modificação."""
    builder = AffiliateLinkBuilder()
    invalid = "https://www.google.com/search?q=test"
    assert builder.build(invalid) == invalid


def test_build_empty_url_returns_original():
    builder = AffiliateLinkBuilder()
    assert builder.build("") == ""


def test_extract_ml_id():
    builder = AffiliateLinkBuilder()
    assert builder.extract_ml_id(SAMPLE_URL) == "MLB21555776"
    assert builder.extract_ml_id("https://outro.com/produto") == ""


# ---------------------------------------------------------------------------
# Teste HTTP (standalone) — verifica se o ML aceita a URL
# ---------------------------------------------------------------------------


def check_http(url: str) -> tuple[int, str]:
    """Faz HEAD request seguindo redirects e retorna (status, url_final)."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; DealHunterBot/1.0)"},
        method="HEAD",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, resp.url
    except urllib.error.HTTPError as e:
        return e.code, url


if __name__ == "__main__":
    builder = AffiliateLinkBuilder()
    affiliate_url = builder.build(SAMPLE_URL)

    print("=" * 60)
    print("URL original:")
    print(f"  {SAMPLE_URL}\n")
    print("URL com afiliado:")
    print(f"  {affiliate_url}\n")

    params = parse_qs(urlparse(affiliate_url).query)
    print("Parâmetros adicionados:")
    for k, v in sorted(params.items()):
        if k.startswith("matt_"):
            print(f"  {k} = {v[0]}")

    print("\nVerificando HTTP...")
    status, final_url = check_http(affiliate_url)
    print(f"  Status: {status}")
    print(f"  URL final: {final_url}")

    if status in (200, 301, 302):
        print("\n✓ ML aceitou a URL — link de afiliado deve estar ativo.")
    else:
        print(f"\n✗ Resposta inesperada ({status}) — verifique os parâmetros.")
