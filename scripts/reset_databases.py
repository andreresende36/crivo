#!/usr/bin/env python3
"""
Crivo — Reset Databases Script
Limpa todas as tabelas do Supabase mantendo o schema intacto.

Uso:
    python scripts/reset_databases.py --truncate
    python scripts/reset_databases.py --truncate --include-storage
"""

import sys
import asyncio
from pathlib import Path

# Adiciona packages/backend e packages/py-types ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "backend"))
sys.path.insert(0, str(Path(__file__).parent.parent / "packages" / "py-types"))

from crivo.database.supabase_client import SupabaseClient  # noqa: E402
import structlog  # noqa: E402

logger = structlog.get_logger(__name__)

# Tabelas a truncar (ordem respeita FKs — dependentes primeiro)
TABLES_TO_TRUNCATE = [
    # 1. Tabelas que dependem de outras (Nível 3)
    "scored_offer_transitions",  # FK: scored_offer_id
    "sent_offers",  # FK: scored_offer_id
    "user_secrets",  # FK: user_id
    # 2. Tabelas intermediárias (Nível 2)
    "scored_offers",  # FK: product_id
    "price_history",  # FK: product_id
    "affiliate_links",  # FK: product_id, user_id
    # 3. Tabelas base com dependências leves (Nível 1)
    "products",  # FK: badge_id, category_id, marketplace_id, brand_id
    # 4. Entidades "Raiz" e Lookups (Nível 0)
    "users",
    "system_logs",
    "badges",
    "categories",
    "marketplaces",
    "brands",
    "title_examples",  # (Opcional)
    "admin_settings",  # (Opcional)
]


async def truncate_supabase() -> None:
    """Trunca todas as tabelas do Supabase."""
    supabase = SupabaseClient()

    try:
        await supabase.connect()
        ok = await supabase.ping()

        if not ok:
            logger.warning("supabase_not_available")
            return

        logger.info("supabase_truncating")

        # No Supabase, usa DELETE sem WHERE clause
        # Acessa via _db que retorna o AsyncClient conectado
        for table in TABLES_TO_TRUNCATE:
            try:
                # Delete sem where = truncate (deleta todas as linhas)
                await supabase._db.table(table).delete().neq(
                    "id", "00000000-0000-0000-0000-000000000000"
                ).execute()
                logger.info("supabase_table_truncated", table=table)
            except Exception as e:
                logger.error("supabase_table_delete_failed", table=table, error=str(e))

        logger.info("supabase_truncate_success")

    except Exception as e:
        logger.error("supabase_connect_failed", error=str(e))
    finally:
        supabase.close()


async def _list_all_storage_paths(
    client: object, bucket: str, folder: str
) -> list[str]:
    """Lista recursivamente todos os caminhos de arquivos em uma pasta do Storage."""
    subdirs = await client.storage.from_(bucket).list(folder)
    if not subdirs:
        return []

    all_paths: list[str] = []
    for subdir in subdirs:
        subdir_name = subdir.get("name", "")
        if not subdir_name:
            continue
        subdir_path = f"{folder}/{subdir_name}"
        files = await client.storage.from_(bucket).list(subdir_path)
        if files:
            all_paths.extend(
                f"{subdir_path}/{f['name']}" for f in files if f.get("name")
            )
    return all_paths


async def clear_supabase_storage(
    bucket: str = "images", folder: str = "products"
) -> int:
    """
    Apaga todos os arquivos de uma pasta no Supabase Storage.
    Itera recursivamente pelas subpastas (products/{uuid}/enhanced.jpg).
    Retorna o número de arquivos deletados.
    """
    supabase = SupabaseClient()
    deleted = 0

    try:
        await supabase.connect()
        client = supabase._db

        all_paths = await _list_all_storage_paths(client, bucket, folder)
        if not all_paths:
            logger.info("storage_folder_empty", bucket=bucket, folder=folder)
            return 0

        batch_size = 100
        for i in range(0, len(all_paths), batch_size):
            batch = all_paths[i : i + batch_size]
            await client.storage.from_(bucket).remove(batch)
            deleted += len(batch)
            logger.info("storage_batch_deleted", count=len(batch))

        logger.info("storage_cleared", bucket=bucket, folder=folder, total=deleted)
        return deleted

    except Exception as e:
        logger.error("storage_clear_failed", bucket=bucket, folder=folder, error=str(e))
        raise
    finally:
        supabase.close()


async def main(truncate: bool = False, clear_storage: bool = False) -> None:
    """Executa o reset."""
    print("\n" + "=" * 70)
    print("Crivo — Reset Supabase (Truncate)")
    print("=" * 70)
    print(f"\nTabelas a truncar: {', '.join(TABLES_TO_TRUNCATE)}")
    print("Schema será PRESERVADO\n")

    if clear_storage:
        print("Storage: SIM (vai apagar images/products do Supabase Storage)")
    else:
        print("Storage: NAO (imagens serao mantidas)")

    print("\n" + "-" * 70)
    response = (
        await asyncio.to_thread(input, "Tem certeza? (digite 'SIM' para confirmar): ")
    ).strip()

    if response.upper() != "SIM":
        print("\nOperacao cancelada.")
        return

    print("\nTruncando Supabase...")
    try:
        await truncate_supabase()
        print("Supabase truncado com sucesso!\n")
    except Exception as e:
        print(f"Erro ao truncar Supabase: {e}\n")
        sys.exit(1)

    if clear_storage:
        print("Apagando imagens do Supabase Storage (images/products)...")
        try:
            count = await clear_supabase_storage(bucket="images", folder="products")
            print(f"{count} arquivo(s) deletado(s) do Storage!\n")
        except Exception as e:
            print(f"Erro ao limpar Storage: {e}\n")

    print("=" * 70)
    print("Reset concluido! Banco zerado e pronto para novos dados.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Reset Supabase (truncate mode)"
    )
    parser.add_argument(
        "--truncate", action="store_true", help="Trunca as tabelas (mantém schema)"
    )
    parser.add_argument(
        "--clear-storage",
        action="store_true",
        help="Apaga todos os arquivos em images/products no Supabase Storage",
    )
    args = parser.parse_args()

    if not args.truncate:
        print("Use: python scripts/reset_databases.py --truncate")
        sys.exit(1)

    asyncio.run(main(truncate=args.truncate, clear_storage=args.clear_storage))
