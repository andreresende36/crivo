"""
Crivo — Módulo de Banco de Dados
Interface Supabase via StorageManager.

Uso típico:
    from crivo.database import StorageManager

    async with StorageManager() as storage:
        product_id = await storage.upsert_product(product)
        await storage.add_price_history(product_id, price=299.90)
"""

from .storage_manager import StorageManager
from .supabase_client import SupabaseClient
from .exceptions import StorageError, SupabaseError

__all__ = [
    "StorageManager",
    "SupabaseClient",
    "StorageError",
    "SupabaseError",
]
