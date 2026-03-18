"""
DealHunter — Mercado Livre Affiliate API Client
Gera links de afiliado oficiais via API interna do ML.

A API requer cookies de sessao do navegador (nao ha API publica).
Os cookies devem ser configurados via ML_SESSION_COOKIES no .env.

Uso:
    api = MLAffiliateAPI()
    result = await api.create_link("https://www.mercadolivre.com.br/p/MLB123")
    print(result.short_url)  # https://meli.la/xxxxx
"""

from __future__ import annotations


from dataclasses import dataclass
from urllib.parse import parse_qs, unquote, urlparse

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)

CREATE_LINK_URL = (
    "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink"
)


@dataclass
class AffiliateLink:
    """Resultado da criacao de um link de afiliado."""

    short_url: str  # https://meli.la/xxxxx
    long_url: str  # URL completa com ref encrypted
    ml_link_id: str  # ID curto (ex: "21GQRjp")
    tag: str  # Tag do afiliado


class MLAffiliateAPI:
    """
    Cliente para a API createLink do programa de afiliados do ML.

    Requer cookies de sessao validos do navegador.
    O JWT (nsa_rotok) expira em ~30 dias.
    """

    def __init__(self) -> None:
        self.cfg = settings.mercado_livre
        self._cookies = self._parse_cookies()
        self._csrf_token = self.cfg.csrf_token

    def _parse_cookies(self) -> dict[str, str]:
        """Parse cookie string (formato 'key=value; key2=value2') para dict."""
        raw = self.cfg.session_cookies
        if not raw:
            return {}
        cookies: dict[str, str] = {}
        for pair in raw.split(";"):
            pair = pair.strip()
            if "=" in pair:
                key, _, value = pair.partition("=")
                cookies[key.strip()] = value.strip()
        return cookies

    @property
    def is_configured(self) -> bool:
        """Verifica se os cookies e CSRF token estao configurados."""
        return bool(self._cookies and self._csrf_token)

    async def create_link(self, product_url: str) -> AffiliateLink | None:
        """
        Gera um link de afiliado para uma URL de produto do ML.

        Args:
            product_url: URL do produto no ML

        Returns:
            AffiliateLink com short_url e long_url, ou None se falhar.
        """
        if not self.is_configured:
            logger.warning("ml_affiliate_api_not_configured")
            return None

        return await self._call_create_link([product_url])

    async def create_links_batch(
        self, product_urls: list[str]
    ) -> dict[str, AffiliateLink]:
        """
        Gera links de afiliado para multiplas URLs em uma unica chamada.

        A API do ML aceita multiplas URLs no array.

        Args:
            product_urls: Lista de URLs de produtos

        Returns:
            Dict mapeando url_original -> AffiliateLink
        """
        if not self.is_configured:
            logger.warning("ml_affiliate_api_not_configured")
            return {}

        if not product_urls:
            return {}

        results: dict[str, AffiliateLink] = {}

        # A API aceita batch, mas limitamos a 10 por chamada por seguranca
        batch_size = 10
        for i in range(0, len(product_urls), batch_size):
            batch = product_urls[i:i + batch_size]
            batch_result = await self._call_create_link_batch(batch)
            results.update(batch_result)

        return results

    async def _call_create_link(self, urls: list[str]) -> AffiliateLink | None:
        """Chamada unica a API createLink. Retorna o primeiro resultado."""
        results = await self._call_create_link_batch(urls)
        if results:
            return next(iter(results.values()))
        return None

    @staticmethod
    def _clean_product_url(url: str) -> str:
        """Extrai a URL limpa do produto a partir de URLs de tracking do ML.

        URLs de tracking (click1.mercadolivre.com.br/mclics/...) contém a URL
        real do produto no parâmetro 'url' da query string.
        Remove fragmentos e parâmetros de tracking (#polycard_client, etc.).
        """
        parsed = urlparse(url)
        if "click1.mercadolivre.com.br" in parsed.netloc:
            qs = parse_qs(parsed.query)
            if "url" in qs:
                url = unquote(qs["url"][0])
                parsed = urlparse(url)

        # Remove fragment (#polycard_client=...) e parâmetros de tracking
        clean = parsed._replace(fragment="").geturl()
        return clean

    async def _call_create_link_batch(
        self, urls: list[str]
    ) -> dict[str, AffiliateLink]:
        """Chamada a API createLink com multiplas URLs."""
        # Limpa URLs de tracking para URLs de produto
        clean_to_original: dict[str, str] = {}
        clean_urls: list[str] = []
        for url in urls:
            clean = self._clean_product_url(url)
            clean_to_original[clean] = url
            clean_urls.append(clean)

        tag = self.cfg.affiliate_tag
        payload = {"urls": clean_urls, "tag": tag}

        headers = {
            "accept": "application/json, text/plain, */*",
            "content-type": "application/json",
            "origin": "https://www.mercadolivre.com.br",
            "referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
            "x-csrf-token": self._csrf_token,
            "user-agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/145.0.0.0 Safari/537.36"
            ),
        }

        try:
            async with httpx.AsyncClient(cookies=self._cookies, timeout=30) as client:
                resp = await client.post(
                    CREATE_LINK_URL, json=payload, headers=headers
                )

            if resp.status_code == 401:
                logger.error(
                    "ml_affiliate_api_auth_failed",
                    status=resp.status_code,
                    hint="Cookies expirados. Atualize ML_SESSION_COOKIES e ML_CSRF_TOKEN no .env",
                )
                return {}

            if resp.status_code != 200:
                logger.error(
                    "ml_affiliate_api_error",
                    status=resp.status_code,
                    body=resp.text[:500],
                )
                return {}

            data = resp.json()
            results: dict[str, AffiliateLink] = {}

            for item in data.get("urls", []):
                if not item.get("created") and not item.get("short_url"):
                    logger.warning(
                        "ml_affiliate_link_failed",
                        origin_url=item.get("origin_url"),
                        error=item,
                    )
                    continue

                link = AffiliateLink(
                    short_url=item["short_url"],
                    long_url=item.get("long_url", ""),
                    ml_link_id=item.get("id", ""),
                    tag=item.get("tag", tag),
                )
                origin = item.get("origin_url", "")
                # Mapeia de volta para a URL original (tracking)
                original_url: str = clean_to_original.get(origin, origin) or origin
                results[original_url] = link

            logger.info(
                "ml_affiliate_links_created",
                requested=len(urls),
                created=len(results),
            )
            return results

        except httpx.TimeoutException:
            logger.error("ml_affiliate_api_timeout")
            return {}
        except Exception as exc:
            logger.error("ml_affiliate_api_error", error=str(exc))
            return {}

    async def check_auth(self) -> bool:
        """Testa se os cookies estao validos fazendo uma chamada de teste."""
        if not self.is_configured:
            return False

        # Usa uma URL de teste qualquer
        test_url = "https://www.mercadolivre.com.br/p/MLB21555776"
        result = await self.create_link(test_url)
        return result is not None
