#!/usr/bin/env bash
# Pre-commit hook: regenera tipos se migrations mudaram.
# Instalação automática via `pnpm install` (postinstall em package.json).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"

# Verifica se alguma migration está staged
MIGRATIONS_CHANGED=$(git diff --cached --name-only | grep '^supabase/migrations/' || true)

if [[ -z "$MIGRATIONS_CHANGED" ]]; then
  exit 0  # nenhuma migration staged — hook não precisa fazer nada
fi

echo "⚠️  Migrations staged — regenerando tipos..."
cd "$ROOT"

# Checa se as variáveis necessárias estão disponíveis
if [[ -z "${SUPABASE_PROJECT_ID:-}" ]] && [[ -f "$ROOT/.env" ]]; then
  set -a; source "$ROOT/.env"; set +a
fi

if [[ -z "${SUPABASE_PROJECT_ID:-}" ]] || [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "⚠️  SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN não definidos — pulando codegen."
  echo "   Execute 'pnpm codegen' manualmente antes de commitar."
  exit 0  # warn but don't block commit (CI valida)
fi

pnpm codegen

# Re-adiciona os arquivos gerados ao stage
git add packages/types-ts/src/supabase.ts
git add packages/py-types/crivo_types/supabase.py

echo "✅ Tipos regenerados e staged."
