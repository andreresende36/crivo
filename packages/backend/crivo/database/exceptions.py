"""
Crivo — Exceções do módulo de banco de dados.

Hierarquia:
    StorageError
    ├── SupabaseError     — falhas específicas do Supabase
    ├── SQLiteError       — falhas específicas do SQLite
    └── SyncError         — falhas na sincronização SQLite → Supabase
"""


class StorageError(Exception):
    """Erro base para operações de armazenamento."""

    def __init__(self, message: str, operation: str = "", ml_id: str = "") -> None:
        self.operation = operation
        self.ml_id = ml_id
        super().__init__(message)


class SupabaseError(StorageError):
    """Falha em operação no Supabase."""


class SQLiteError(StorageError):
    """Falha em operação no SQLite local."""


class SyncError(StorageError):
    """Falha na sincronização SQLite → Supabase."""

    def __init__(
        self, message: str, table: str = "", synced: int = 0, errors: int = 0
    ) -> None:
        self.table = table
        self.synced = synced
        self.errors = errors
        super().__init__(message, operation="sync")
