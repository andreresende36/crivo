#!/usr/bin/env python3
"""
Generates packages/py-types/crivo_types/supabase.py from the live Supabase schema
via information_schema queries using the Supabase Python client.

Usage: uv run python scripts/gen_py_types.py
Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
"""
import os
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUTPUT = ROOT / "packages/py-types/crivo_types/supabase.py"

# Postgres → Python type mapping
PG_TYPE_MAP: dict[str, str] = {
    "uuid": "str",
    "text": "str",
    "character varying": "str",
    "varchar": "str",
    "numeric": "Decimal",
    "integer": "int",
    "int4": "int",
    "int2": "int",
    "smallint": "int",
    "bigint": "int",
    "int8": "int",
    "boolean": "bool",
    "bool": "bool",
    "timestamp with time zone": "datetime",
    "timestamptz": "datetime",
    "timestamp without time zone": "datetime",
    "timestamp": "datetime",
    "jsonb": "dict[str, Any]",
    "json": "dict[str, Any]",
    "date": "str",
    "time": "str",
}

# Tables to skip (partitions + low-value lookup)
SKIP_TABLES = {
    "price_history_default",
    "price_history_y2026m03",
    "price_history_y2026m04",
    "price_history_y2026m05",
    "price_history_y2026m06",
}

TABLE_CLASS_NAMES: dict[str, str] = {
    "admin_settings": "AdminSetting",
    "affiliate_links": "AffiliateLink",
    "badges": "Badge",
    "brands": "Brand",
    "categories": "Category",
    "marketplaces": "Marketplace",
    "price_history": "PriceHistory",
    "products": "Product",
    "scored_offer_transitions": "ScoredOfferTransition",
    "scored_offers": "ScoredOffer",
    "sent_offers": "SentOffer",
    "system_logs": "SystemLog",
    "title_examples": "TitleExample",
    "user_secrets": "UserSecret",
    "users": "User",
}


def fetch_schema() -> list[dict]:
    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package not installed. Run: uv add supabase", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)
    result = client.rpc(
        "json_agg",
        {
            "expression": """
                SELECT
                    t.table_name,
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default
                FROM information_schema.tables t
                JOIN information_schema.columns c
                    ON c.table_name = t.table_name AND c.table_schema = t.table_schema
                WHERE t.table_schema = 'public'
                    AND t.table_type = 'BASE TABLE'
                ORDER BY t.table_name, c.ordinal_position
            """
        }
    ).execute()
    return result.data


def pg_to_py(data_type: str) -> str:
    return PG_TYPE_MAP.get(data_type.lower(), "Any")


def class_name(table: str) -> str:
    return TABLE_CLASS_NAMES.get(table, "".join(w.capitalize() for w in table.split("_")))


def generate_models(rows: list[dict]) -> str:
    from itertools import groupby

    lines = [
        "# GENERATED — do not edit manually. Run `pnpm codegen` to regenerate.",
        "from __future__ import annotations",
        "from datetime import datetime",
        "from decimal import Decimal",
        "from typing import Any",
        "from pydantic import BaseModel, ConfigDict",
        "",
    ]

    by_table = {}
    for row in rows:
        tbl = row["table_name"]
        if tbl in SKIP_TABLES:
            continue
        by_table.setdefault(tbl, []).append(row)

    for table, cols in sorted(by_table.items()):
        cls = class_name(table)
        lines.append("")
        lines.append(f"class {cls}(BaseModel):")
        lines.append("    model_config = ConfigDict(from_attributes=True)")
        lines.append("")

        for col in cols:
            name = col["column_name"]
            py_type = pg_to_py(col["data_type"])
            nullable = col["is_nullable"] == "YES"
            has_default = col["column_default"] is not None

            if nullable:
                annotation = f"{py_type} | None = None"
            elif has_default:
                annotation = f"{py_type}"
                # Keep required fields required but note default exists
            else:
                annotation = py_type

            lines.append(f"    {name}: {annotation}")

    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    print(f"Fetching schema from Supabase...")
    rows = fetch_schema()
    print(f"  {len(rows)} columns across {len({r['table_name'] for r in rows})} tables")
    content = generate_models(rows)
    OUTPUT.write_text(content)
    print(f"  Written to {OUTPUT.relative_to(ROOT)}")
