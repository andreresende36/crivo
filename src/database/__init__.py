"""
Crivo — Módulo de Banco de Dados
Supabase (principal) com SQLite como fallback e buffer local.

Uso típico:
    from src.database import StorageManager

    async with StorageManager() as storage:
        product_id = await storage.upsert_product(product)
        await storage.add_price_history(product_id, price=299.90)
"""

from .storage_manager import StorageManager
from .supabase_client import SupabaseClient
from .sqlite_fallback import SQLiteFallback
from .exceptions import StorageError, SupabaseError, SQLiteError, SyncError

__all__ = [
    "StorageManager",
    "SupabaseClient",
    "SQLiteFallback",
    "StorageError",
    "SupabaseError",
    "SQLiteError",
    "SyncError",
]
