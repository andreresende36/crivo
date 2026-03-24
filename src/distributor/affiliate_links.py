"""
Crivo — Affiliate Link Builder
Gera links de afiliado oficiais do Mercado Livre via API createLink.

Fluxo:
  1. Verifica se o link ja existe no banco (cache)
  2. Se nao, chama a API createLink do ML
  3. Salva o link gerado no banco para reuso

Os links gerados (meli.la/xxx) sao permanentes e garantem atribuicao de comissao.
"""

from __future__ import annotations

import re

import structlog


from src.database.storage_manager import StorageManager
from src.distributor.ml_affiliate_api import MLAffiliateAPI

logger = structlog.get_logger(__name__)


class AffiliateLinkBuilder:
    """
    Gera links de afiliado oficiais via API do ML com cache no banco.

    Uso:
        async with StorageManager() as storage:
            builder = AffiliateLinkBuilder(storage, user_id="uuid-do-user")
            link = await builder.get_or_create("https://...mercadolivre.com.br/p/MLB123")
            print(link)  # https://meli.la/xxxxx
    """

    def __init__(self, storage: StorageManager, user_id: str) -> None:
        self._storage = storage
        self._user_id = user_id
        self._api = MLAffiliateAPI()

    async def get_or_create(self, product_url: str, product_id: str) -> str:
        """
        Retorna o link de afiliado para um produto.
        Usa cache do banco; se nao existir, gera via API.

        Args:
            product_url: URL original do produto no ML
            product_id: UUID do produto no banco

        Returns:
            short_url do afiliado (ex: https://meli.la/xxxxx)
            ou string vazia se nao conseguir gerar.
        """
        # 1. Cache hit?
        cached = await self._storage.get_affiliate_link(product_id, self._user_id)
        if cached:
            return cached["short_url"]

        # 2. Gera via API
        if not self._api.is_configured:
            logger.warning("affiliate_api_not_configured", product_id=product_id)
            return ""

        result = await self._api.create_link(product_url)
        if not result:
            return ""

        # 3. Salva no banco
        await self._storage.save_affiliate_link(
            product_id=product_id,
            user_id=self._user_id,
            short_url=result.short_url,
            long_url=result.long_url,
            ml_link_id=result.ml_link_id,
        )

        return result.short_url

    async def get_or_create_batch(
        self, products: dict[str, str]
    ) -> dict[str, str]:
        """
        Gera links de afiliado para multiplos produtos.

        Args:
            products: Dict mapeando product_id -> product_url

        Returns:
            Dict mapeando product_id -> short_url
        """
        if not products:
            return {}

        product_ids = list(products.keys())
        results: dict[str, str] = {}

        # 1. Busca quais ja tem link no banco
        missing = await self._storage.get_missing_affiliate_links(
            self._user_id, product_ids
        )

        # Links ja existentes: busca do banco
        cached_ids = [pid for pid in product_ids if pid not in missing]
        for pid in cached_ids:
            cached = await self._storage.get_affiliate_link(pid, self._user_id)
            if cached:
                results[pid] = cached["short_url"]

        if not missing:
            logger.info("affiliate_links_all_cached", count=len(results))
            return results

        # 2. Gera links faltantes via API
        if not self._api.is_configured:
            logger.warning(
                "affiliate_api_not_configured",
                missing=len(missing),
            )
            return results

        urls_to_generate = {pid: products[pid] for pid in missing}
        url_list = list(urls_to_generate.values())
        pid_by_url = {url: pid for pid, url in urls_to_generate.items()}

        api_results = await self._api.create_links_batch(url_list)

        # 3. Salva novos links no banco
        links_to_save: list[dict] = []
        for origin_url, link in api_results.items():
            pid = pid_by_url.get(origin_url)
            if not pid:
                continue
            results[pid] = link.short_url
            links_to_save.append(
                {
                    "product_id": pid,
                    "user_id": self._user_id,
                    "short_url": link.short_url,
                    "long_url": link.long_url,
                    "ml_link_id": link.ml_link_id,
                }
            )

        if links_to_save:
            await self._storage.save_affiliate_links_batch(links_to_save)

        logger.info(
            "affiliate_links_generated",
            cached=len(cached_ids),
            generated=len(links_to_save),
            failed=len(missing) - len(links_to_save),
        )

        return results

    @staticmethod
    def extract_ml_id(url: str) -> str:
        """Extrai o ID do produto da URL."""
        match = re.search(r"(MLB\d+)", url, re.IGNORECASE)
        return match.group(1) if match else ""
