"""
Crivo — Storage Manager
Wrapper sobre SupabaseClient com cache de lookup tables em memória.

Uso:
    async with StorageManager() as storage:
        product_id = await storage.upsert_product(product)
        await storage.add_price_history(product_id, price=299.90)
        await storage.log_event("scrape_success", {"count": 42})
"""


from collections.abc import Awaitable, Callable
from typing import Self

import crivo_types
import structlog

from crivo.scraper.base_scraper import ScrapedProduct
from .supabase_client import SupabaseClient
from .exceptions import SupabaseError
from .seeds import BADGES, CATEGORIES, MARKETPLACES

logger = structlog.get_logger(__name__)


class StorageManager:
    """
    Wrapper sobre SupabaseClient com cache de lookup tables em memória.

    Mantém caches de badge/category/marketplace/brand para evitar
    N+1 queries em cada produto processado.
    """

    def __init__(self) -> None:
        self._supabase = SupabaseClient()
        # Caches persistentes de lookup: {nome_canonico: uuid}
        self._badge_cache: dict[str, str] = {}
        self._category_cache: dict[str, str] = {}
        self._marketplace_cache: dict[str, str] = {}
        self._brand_cache: dict[str, str] = {}
        # Lookup de normalização: {nome_lower: nome_canonico}
        self._badge_canonical: dict[str, str] = {b.lower(): b for b in BADGES}
        self._category_canonical: dict[str, str] = {c.lower(): c for c in CATEGORIES}
        self._marketplace_canonical: dict[str, str] = {m.lower(): m for m in MARKETPLACES}

    # ------------------------------------------------------------------
    # Ciclo de vida
    # ------------------------------------------------------------------

    async def __aenter__(self) -> Self:
        await self._connect()
        return self

    async def __aexit__(self, *_) -> None:
        await self._supabase.close()

    async def _connect(self) -> None:
        await self._supabase.connect()
        await self._seed_supabase()
        await self._preload_caches()

    async def _seed_supabase(self) -> None:
        """Insere badges, categories e marketplaces canônicos (idempotente)."""
        try:
            for name in BADGES:
                await self._supabase.get_or_create_badge(name)
            for name in CATEGORIES:
                await self._supabase.get_or_create_category(name)
            for name in MARKETPLACES:
                await self._supabase.get_or_create_marketplace(name)
            logger.debug(
                "supabase_seeds_applied",
                badges=len(BADGES),
                categories=len(CATEGORIES),
                marketplaces=len(MARKETPLACES),
            )
        except SupabaseError as exc:
            logger.warning("supabase_seed_failed", error=str(exc))

    async def _preload_caches(self) -> None:
        """Carrega lookup tables em memória."""
        try:
            self._badge_cache = await self._supabase.get_all_badges()
            self._category_cache = await self._supabase.get_all_categories()
            self._marketplace_cache = await self._supabase.get_all_marketplaces()
            logger.debug(
                "caches_preloaded",
                badges=len(self._badge_cache),
                categories=len(self._category_cache),
                marketplaces=len(self._marketplace_cache),
            )
        except Exception as exc:
            logger.warning("cache_preload_failed", error=str(exc))

    # ------------------------------------------------------------------
    # Estado e health check
    # ------------------------------------------------------------------

    @property
    def backend(self) -> str:
        return "supabase"

    @property
    def is_healthy(self) -> bool:
        return True

    async def ping(self) -> dict[str, bool]:
        return {"supabase": await self._supabase.ping()}

    # ------------------------------------------------------------------
    # Normalização de nomes (case-insensitive → canônico)
    # ------------------------------------------------------------------

    def _normalize_badge(self, name: str) -> str:
        return self._badge_canonical.get(name.strip().lower(), "")

    def _normalize_category(self, name: str) -> str:
        return self._category_canonical.get(name.strip().lower(), name.strip())

    def _normalize_marketplace(self, name: str) -> str:
        return self._marketplace_canonical.get(name.strip().lower(), name.strip())

    # ------------------------------------------------------------------
    # Resolve lookup IDs
    # ------------------------------------------------------------------

    async def resolve_badge_id(self, name: str) -> str | None:
        if not name:
            return None
        name = self._normalize_badge(name)
        if name in self._badge_cache:
            return self._badge_cache[name]
        try:
            badge_id = await self._supabase.get_or_create_badge(name)
        except SupabaseError as exc:
            logger.warning("supabase_badge_resolve_failed", error=str(exc))
            return None
        if badge_id:
            self._badge_cache[name] = badge_id
        return badge_id

    async def resolve_category_id(self, name: str) -> str | None:
        if not name:
            return None
        name = self._normalize_category(name)
        if name in self._category_cache:
            return self._category_cache[name]
        try:
            cat_id = await self._supabase.get_or_create_category(name)
        except SupabaseError as exc:
            logger.warning("supabase_category_resolve_failed", error=str(exc))
            return None
        if cat_id:
            self._category_cache[name] = cat_id
        return cat_id

    async def resolve_marketplace_id(self, name: str) -> str | None:
        if not name:
            return None
        name = self._normalize_marketplace(name)
        if name in self._marketplace_cache:
            return self._marketplace_cache[name]
        try:
            mp_id = await self._supabase.get_or_create_marketplace(name)
        except SupabaseError as exc:
            logger.warning("supabase_marketplace_resolve_failed", error=str(exc))
            return None
        if mp_id:
            self._marketplace_cache[name] = mp_id
        return mp_id

    async def resolve_brand_id(self, name: str | None) -> str | None:
        if not name:
            return None
        name = name.strip()
        if not name:
            return None
        if name in self._brand_cache:
            return self._brand_cache[name]
        try:
            brand_id = await self._supabase.get_or_create_brand(name)
        except SupabaseError as exc:
            logger.warning("supabase_brand_resolve_failed", error=str(exc))
            return None
        if brand_id:
            self._brand_cache[name] = brand_id
        return brand_id

    # ------------------------------------------------------------------
    # products
    # ------------------------------------------------------------------

    async def upsert_product(self, product: ScrapedProduct) -> str:
        badge_id = await self.resolve_badge_id(product.badge)
        category_id = await self.resolve_category_id(product.category)
        marketplace_id = await self.resolve_marketplace_id(product.marketplace)
        brand_id = await self.resolve_brand_id(product.brand)
        result = await self._supabase.upsert_product(
            product,
            badge_id=badge_id,
            category_id=category_id,
            marketplace_id=marketplace_id,
            brand_id=brand_id,
        )
        return result or ""

    async def check_duplicate(self, ml_id: str) -> bool:
        return await self._supabase.check_duplicate(ml_id)

    async def get_product_id(self, ml_id: str) -> str | None:
        return await self._supabase.get_product_id(ml_id)

    # ------------------------------------------------------------------
    # Batch operations
    # ------------------------------------------------------------------

    async def check_duplicates_batch(self, ml_ids: list[str]) -> set[str]:
        return await self._supabase.check_duplicates_batch(ml_ids)

    async def _resolve_lookup_ids_batch(
        self,
        products: list[ScrapedProduct],
        attr: str,
        resolve_fn: Callable[[str], Awaitable[str | None]],
        require_value: bool = True,
    ) -> dict[str, str | None]:
        cache: dict[str, str | None] = {}
        id_map: dict[str, str | None] = {}
        for p in products:
            key: str | None = getattr(p, attr, None)
            if not key:
                continue
            if key not in cache:
                cache[key] = await resolve_fn(key)
            id_map[p.ml_id] = cache[key]
        return id_map

    async def upsert_products_batch(
        self, products: list[ScrapedProduct]
    ) -> dict[str, str]:
        if not products:
            return {}

        badge_ids = await self._resolve_lookup_ids_batch(products, "badge", self.resolve_badge_id)
        category_ids = await self._resolve_lookup_ids_batch(products, "category", self.resolve_category_id)
        marketplace_ids = await self._resolve_lookup_ids_batch(
            products, "marketplace", self.resolve_marketplace_id, require_value=False
        )
        brand_ids = await self._resolve_lookup_ids_batch(products, "brand", self.resolve_brand_id)

        return await self._supabase.upsert_products_batch(
            products,
            badge_ids=badge_ids,
            category_ids=category_ids,
            marketplace_ids=marketplace_ids,
            brand_ids=brand_ids,
        )

    async def add_price_history_batch(self, entries: list[dict]) -> bool:
        if not entries:
            return True
        try:
            await self._supabase.add_price_history_batch(entries)
            return True
        except SupabaseError as exc:
            logger.warning("supabase_price_history_batch_failed", error=str(exc))
            return False

    # ------------------------------------------------------------------
    # price_history
    # ------------------------------------------------------------------

    async def add_price_history(
        self,
        product_id: str,
        price: float,
        original_price: float | None = None,
    ) -> bool:
        try:
            return await self._supabase.add_price_history(product_id, price, original_price)
        except SupabaseError as exc:
            logger.warning("supabase_price_history_failed", error=str(exc))
            return False

    async def get_price_history(self, product_id: str, days: int = 30) -> list[dict]:
        return await self._supabase.get_price_history(product_id, days)

    # ------------------------------------------------------------------
    # scored_offers
    # ------------------------------------------------------------------

    async def save_scored_offer(
        self,
        product_id: str,
        rule_score: int,
        final_score: int,
        status: str,
        score_breakdown: dict | None = None,
    ) -> str:
        try:
            result = await self._supabase.save_scored_offer(
                product_id,
                rule_score,
                final_score,
                status,
                score_breakdown=score_breakdown,
            )
            return result or ""
        except SupabaseError as exc:
            logger.warning("supabase_scored_offer_failed", error=str(exc))
            return ""

    async def save_scored_offers_batch(self, entries: list[dict]) -> list[str]:
        if not entries:
            return []
        try:
            return await self._supabase.save_scored_offers_batch(entries)
        except SupabaseError as exc:
            logger.warning("supabase_scored_offers_batch_failed", error=str(exc))
            return []

    # ------------------------------------------------------------------
    # sent_offers
    # ------------------------------------------------------------------

    async def has_recent_sends(self, hours: int = 24) -> bool:
        return await self._supabase.has_recent_sends(hours)

    async def mark_as_sent(self, scored_offer_id: str, channel: str) -> bool:
        try:
            return await self._supabase.mark_as_sent(scored_offer_id, channel)
        except SupabaseError as exc:
            logger.warning("supabase_mark_sent_failed", error=str(exc))
            return False

    async def discard_offer(self, scored_offer_id: str, reason: str) -> bool:
        try:
            return await self._supabase.discard_offer(scored_offer_id, reason)
        except SupabaseError as exc:
            logger.warning("supabase_discard_failed", error=str(exc))
            return False

    async def revert_to_pending(self, scored_offer_id: str) -> bool:
        try:
            return await self._supabase.revert_to_pending(scored_offer_id)
        except SupabaseError as exc:
            logger.warning("supabase_revert_failed", error=str(exc))
            return False

    async def was_recently_sent(self, ml_id: str, hours: int = 24) -> bool:
        return await self._supabase.was_recently_sent(ml_id, hours)

    async def get_recently_sent_ids(self, hours: int = 24) -> set[str]:
        return await self._supabase.get_recently_sent_ids(hours)

    async def get_next_unsent_offer(self) -> dict | None:
        offers = await self._supabase.get_pending_scored_offers(limit=1)
        return offers[0] if offers else None

    async def get_scored_offer_by_id(
        self, scored_offer_id: str
    ) -> crivo_types.ScoredOffer | None:
        try:
            return await self._supabase.get_scored_offer_by_id(scored_offer_id)
        except SupabaseError:
            return None

    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------

    async def get_or_create_user(
        self,
        name: str,
        affiliate_tag: str,
        email: str | None = None,
        password: str | None = None,
        ml_cookies: dict | None = None,
    ) -> str:
        result = await self._supabase.get_or_create_user(name, affiliate_tag, email)
        return result or ""

    async def get_user_by_tag(self, affiliate_tag: str) -> dict | None:
        return await self._supabase.get_user_by_tag(affiliate_tag)

    # ------------------------------------------------------------------
    # affiliate_links
    # ------------------------------------------------------------------

    async def get_affiliate_link(self, product_id: str, user_id: str) -> dict | None:
        return await self._supabase.get_affiliate_link(product_id, user_id)

    async def save_affiliate_link(
        self,
        product_id: str,
        user_id: str,
        short_url: str,
        long_url: str = "",
        ml_link_id: str = "",
    ) -> str:
        try:
            result = await self._supabase.save_affiliate_link(
                product_id, user_id, short_url, long_url, ml_link_id
            )
            return result or ""
        except SupabaseError as exc:
            logger.warning("supabase_save_affiliate_link_failed", error=str(exc))
            return ""

    async def get_missing_affiliate_links(
        self, user_id: str, product_ids: list[str]
    ) -> list[str]:
        return await self._supabase.get_missing_affiliate_links(user_id, product_ids)

    async def save_affiliate_links_batch(self, links: list[dict]) -> list[str]:
        if not links:
            return []
        try:
            return await self._supabase.save_affiliate_links_batch(links)
        except SupabaseError as exc:
            logger.warning("supabase_save_affiliate_links_batch_failed", error=str(exc))
            return []

    # ------------------------------------------------------------------
    # title_examples
    # ------------------------------------------------------------------

    async def save_title_example(self, data: dict) -> str:
        try:
            result = await self._supabase.save_title_example(data)
            return result or ""
        except SupabaseError as exc:
            logger.warning("supabase_title_example_failed", error=str(exc))
            return ""

    async def get_recent_title_examples(self, limit: int = 10) -> list[dict]:
        return await self._supabase.get_recent_title_examples(limit)

    # ------------------------------------------------------------------
    # system_logs
    # ------------------------------------------------------------------

    async def log_event(self, event_type: str, details: dict | None = None) -> bool:
        try:
            return await self._supabase.log_event(event_type, details)
        except SupabaseError as exc:
            logger.warning("supabase_log_event_failed", error=str(exc))
            return False

    async def get_recent_logs(
        self, event_type: str | None = None, limit: int = 100
    ) -> list[dict]:
        return await self._supabase.get_recent_logs(event_type, limit)
