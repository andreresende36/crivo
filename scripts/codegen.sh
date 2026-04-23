#!/usr/bin/env bash
# Regenerates @crivo/types (TS) and crivo-types (Python) from the live Supabase schema.
# Usage: pnpm codegen
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ Generating TypeScript types..."
npx supabase gen types typescript \
  --project-id "$SUPABASE_PROJECT_ID" \
  > "$ROOT/packages/types-ts/src/supabase.ts"
echo "  ✓ packages/types-ts/src/supabase.ts"

echo "▶ Generating Python (Pydantic) types..."
uv run python "$ROOT/scripts/gen_py_types.py"
echo "  ✓ packages/py-types/crivo_types/supabase.py"

echo "▶ Building @crivo/types..."
pnpm --filter "@crivo/types" build
echo "  ✓ packages/types-ts/dist/"

echo "✅ Codegen complete. Run 'git diff packages/types-ts packages/py-types' to review."
