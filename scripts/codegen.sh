#!/usr/bin/env bash
# Regenerates @crivo/types (TS) and crivo-types (Python) from the live Supabase schema.
# Usage: pnpm codegen   (auto-loads .env from repo root)
#
# Requires env vars:
#   SUPABASE_PROJECT_ID    — project ref (last segment of Supabase URL)
#   SUPABASE_ACCESS_TOKEN  — personal access token from supabase.com/dashboard/account/tokens
#   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — for gen_py_types.py
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Auto-load .env if present and vars not already set
if [[ -f "$ROOT/.env" ]] && [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]]; then
  echo "ERROR: SUPABASE_PROJECT_ID is not set" >&2
  exit 1
fi
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set" >&2
  echo "  Get one at: https://supabase.com/dashboard/account/tokens" >&2
  exit 1
fi

# Optional: push pending migrations first (enable via CODEGEN_DB_PUSH=1)
if [[ "${CODEGEN_DB_PUSH:-0}" == "1" ]]; then
  echo "▶ Pushing pending migrations (CODEGEN_DB_PUSH=1)..."
  supabase db push --linked
  echo "  ✓ migrations pushed"
fi

echo "▶ Generating TypeScript types..."
supabase gen types typescript \
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
