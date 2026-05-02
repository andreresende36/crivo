#!/usr/bin/env bash
# =============================================================================
# kill.sh — Mata os workers do Crivo e o Admin Next.js
# Uso: ./kill.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

killed=0

kill_pattern() {
  local label="$1"
  local pattern="$2"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}⚠${NC}  $label — matando PID(s): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    killed=$((killed + 1))
  fi
}

kill_pattern "crivo · api_worker"     "crivo.workers.api_worker"
kill_pattern "crivo · scraper_worker" "crivo.workers.scraper_worker"
kill_pattern "crivo · sender_worker"  "crivo.workers.sender_worker"
kill_pattern "crivo · admin (next)"   "packages/admin"
kill_pattern "crivo · admin (next dev)" "next dev"

# Mata processo na porta 3000 (next dev default)
port3000=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$port3000" ]; then
  echo -e "${YELLOW}⚠${NC}  crivo · admin (:3000) — matando PID(s): $port3000"
  echo "$port3000" | xargs kill -9 2>/dev/null || true
  killed=$((killed + 1))
fi

if [ "$killed" -eq 0 ]; then
  echo -e "${GREEN}✓${NC}  Nenhum processo Crivo encontrado."
else
  echo -e "${GREEN}✓${NC}  $killed processo(s) encerrado(s)."
fi
