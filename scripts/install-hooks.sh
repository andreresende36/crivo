#!/usr/bin/env bash
# Instala git hooks do projeto. Chamado automaticamente via `pnpm install` (postinstall).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$ROOT/.git/hooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "⚠️  .git/hooks não encontrado — não é um repositório git? Pulando."
  exit 0
fi

ln -sf "../../scripts/pre-commit-hook.sh" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ Git hooks instalados (pre-commit → scripts/pre-commit-hook.sh)"
