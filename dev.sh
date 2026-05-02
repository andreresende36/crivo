#!/usr/bin/env bash
# =============================================================================
# dev.sh — Crivo: setup + 4 workers em terminais separados (macOS)
# Uso: ./dev.sh
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}▶${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1"; exit 1; }

# ---------------------------------------------------------------------------
# Pré-requisitos
# ---------------------------------------------------------------------------

command -v uv   &>/dev/null || err "uv não encontrado. Instale: brew install uv"
command -v pnpm &>/dev/null || err "pnpm não encontrado. Instale: brew install pnpm"

# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------

if [ ! -f "$ROOT/.env" ]; then
  warn ".env não encontrado. Copiando de .env.example..."
  cp "$ROOT/.env.example" "$ROOT/.env"
  warn "Configure as credenciais em .env antes de continuar."
  exit 1
fi

if [ ! -f "$ROOT/packages/admin/.env.local" ]; then
  warn "packages/admin/.env.local não encontrado. Copiando do exemplo..."
  cp "$ROOT/packages/admin/.env.local.example" "$ROOT/packages/admin/.env.local"
  warn "Configure as credenciais em packages/admin/.env.local antes de continuar."
  exit 1
fi

# ---------------------------------------------------------------------------
# Dependências Python
# ---------------------------------------------------------------------------

log "Sincronizando backend Python (uv sync)..."
uv sync --quiet

log "Instalando Playwright Chromium..."
uv run playwright install chromium --quiet 2>/dev/null || true

# ---------------------------------------------------------------------------
# Dependências Node
# ---------------------------------------------------------------------------

log "Instalando dependências Node (pnpm install)..."
pnpm install --silent

log "Build dos tipos TS (@crivo/types)..."
pnpm --filter "@crivo/types" build --silent 2>/dev/null || true

# ---------------------------------------------------------------------------
# Abre cada serviço em um terminal separado (macOS Terminal.app)
# ---------------------------------------------------------------------------

open_terminal() {
  local title="$1"
  local cmd="$2"
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  set w to do script "printf '\\\\033]0;${title}\\\\007'; cd '${ROOT}' && ${cmd}"
  delay 0.1
  set custom title of front window to "${title}"
end tell
APPLESCRIPT
  sleep 0.4
}

log "Abrindo terminais..."

open_terminal "crivo · api"     "uv run python -m crivo.workers.api_worker"
open_terminal "crivo · scraper" "uv run python -m crivo.workers.scraper_worker"
open_terminal "crivo · sender"  "uv run python -m crivo.workers.sender_worker"
open_terminal "crivo · admin"   "cd packages/admin && pnpm dev"

echo ""
log "Pronto! Serviços iniciados:"
echo "   API     → http://localhost:8000"
echo "   Docs    → http://localhost:8000/docs"
echo "   Admin   → http://localhost:3000"
