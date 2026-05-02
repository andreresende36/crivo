#!/usr/bin/env bash
# =============================================================================
# dev.sh — Crivo: setup + 4 workers em abas (iTerm2 → Terminal.app fallback)
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
# Abre cada serviço em uma aba — iTerm2 (primário) ou Terminal.app (fallback)
# ---------------------------------------------------------------------------

USE_ITERM=false
if osascript -e 'id of app "iTerm"' &>/dev/null 2>&1; then
  USE_ITERM=true
fi

_iterm_first=true

open_tab() {
  local title="$1"
  local cmd="$2"

  if $USE_ITERM; then
    if $_iterm_first; then
      osascript <<APPLESCRIPT
tell application "iTerm"
  activate
  set w to (create window with default profile)
  tell current session of w
    set name to "${title}"
    write text "cd '${ROOT}' && ${cmd}"
  end tell
end tell
APPLESCRIPT
      _iterm_first=false
    else
      osascript <<APPLESCRIPT
tell application "iTerm"
  tell current window
    set t to (create tab with default profile)
    tell current session of t
      set name to "${title}"
      write text "cd '${ROOT}' && ${cmd}"
    end tell
  end tell
end tell
APPLESCRIPT
    fi
  else
    # Fallback: Terminal.app — cada aba na mesma janela
    if $_iterm_first; then
      osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  set w to do script "printf '\\\\033]0;${title}\\\\007'; cd '${ROOT}' && ${cmd}"
  delay 0.1
  set custom title of front window to "${title}"
end tell
APPLESCRIPT
      _iterm_first=false
    else
      osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  tell application "System Events" to keystroke "t" using command down
  delay 0.3
  do script "printf '\\\\033]0;${title}\\\\007'; cd '${ROOT}' && ${cmd}" in front window
end tell
APPLESCRIPT
    fi
  fi
  sleep 0.4
}

log "Abrindo abas..."

open_tab "crivo · api"     "uv run python -m crivo.workers.api_worker"
open_tab "crivo · scraper" "uv run python -m crivo.workers.scraper_worker"
open_tab "crivo · sender"  "uv run python -m crivo.workers.sender_worker"
open_tab "crivo · admin"   "cd packages/admin && pnpm dev"

echo ""
log "Pronto! Serviços iniciados:"
echo "   API     → http://localhost:8000"
echo "   Docs    → http://localhost:8000/docs"
echo "   Admin   → http://localhost:3000"
