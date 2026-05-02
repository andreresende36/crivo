"""
Crivo — Exceções do módulo de banco de dados.

Hierarquia:
    StorageError
    └── SupabaseError     — falhas específicas do Supabase
"""


class StorageError(Exception):
    """Erro base para operações de armazenamento."""

    def __init__(self, message: str, operation: str = "", ml_id: str = "") -> None:
        self.operation = operation
        self.ml_id = ml_id
        super().__init__(message)


class SupabaseError(StorageError):
    """Falha em operação no Supabase."""
