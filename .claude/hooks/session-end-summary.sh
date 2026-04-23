#!/usr/bin/env bash
# =============================================================================
# 03-session-end-summary.sh — Session Close Guard
# =============================================================================
# Type:    Stop hook (runs when Claude tries to end the session)
# Purpose: Ensures wake-up.md is up to date before Claude stops, verifies a
#          journal entry was written, and shows a session activity summary.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "Stop": [
#       {
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/03-session-end-summary.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = OK to stop
#   2 = Block stop — wake-up.md or journal not updated
# =============================================================================

# Don't use set -euo pipefail here — we want graceful fallbacks throughout
# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

TODAY="$(date +%Y-%m-%d)"
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
ISSUES=()

echo -e "\n${BLUE}${BOLD}🏁 SESSION CLOSE CHECK${RESET}" >&2
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo -e "${DIM}  Timestamp: ${NOW}${RESET}" >&2
echo -e "${DIM}  Project:   ${PROJECT_ROOT}${RESET}" >&2
echo "" >&2

# =============================================================================
# CHECK 1: wake-up.md exists and was modified today
# =============================================================================
WAKEUP_FILE="${PROJECT_ROOT}/memory/wake-up.md"
echo -e "${CYAN}${BOLD}[1/3] Checking wake-up.md...${RESET}" >&2

if [[ ! -f "$WAKEUP_FILE" ]]; then
  echo -e "  ${RED}✗ wake-up.md does not exist${RESET}" >&2
  ISSUES+=("wake-up.md is missing — create it with current session context")
else
  # Check if modified today (cross-platform: try stat with Linux then macOS syntax)
  if stat --version &> /dev/null 2>&1; then
    # GNU stat (Linux/WSL)
    FILE_DATE="$(stat -c '%y' "$WAKEUP_FILE" 2> /dev/null | cut -d' ' -f1 || echo "unknown")"
  else
    # BSD stat (macOS)
    FILE_DATE="$(stat -f '%Sm' -t '%Y-%m-%d' "$WAKEUP_FILE" 2> /dev/null || echo "unknown")"
  fi

  if [[ "$FILE_DATE" == "$TODAY" ]]; then
    echo -e "  ${GREEN}✓ wake-up.md updated today (${FILE_DATE})${RESET}" >&2
    echo -e "  ${DIM}Preview:${RESET}" >&2
    tail -5 "$WAKEUP_FILE" 2> /dev/null | while IFS= read -r LINE; do
      echo -e "    ${DIM}${LINE}${RESET}" >&2
    done
  else
    echo -e "  ${YELLOW}⚠ wake-up.md last modified: ${FILE_DATE} (not today)${RESET}" >&2
    ISSUES+=("Update wake-up.md with today's session context and next steps")
  fi
fi

echo "" >&2

# =============================================================================
# CHECK 2: Journal entry for today (only required if real activity happened)
# =============================================================================
JOURNAL_DIR="${PROJECT_ROOT}/memory/journal"
JOURNAL_FILE="${JOURNAL_DIR}/${TODAY}.md"
echo -e "${CYAN}${BOLD}[2/3] Checking journal entry...${RESET}" >&2

# Find most recent session marker to use as baseline timestamp
SESSION_MARKER="$(find "${PROJECT_ROOT}/.claude" -maxdepth 1 -name "session_started_*" -type f 2> /dev/null | head -1)"

# Detect files modified during this session (excluding system/generated paths)
MODIFIED_FILES=()
if [[ -n "$SESSION_MARKER" && -f "$SESSION_MARKER" ]]; then
  while IFS= read -r -d '' FILE; do
    MODIFIED_FILES+=("$FILE")
  done < <(find "$PROJECT_ROOT" \
    \( -path "*/node_modules" -o -path "*/.git" -o -path "*/.claude" \
    -o -path "*/dist" -o -path "*/build" -o -path "*/memory/journal" \) -prune \
    -o -type f -newer "$SESSION_MARKER" -print0 2> /dev/null)
fi

ACTIVITY_COUNT="${#MODIFIED_FILES[@]}"

if [[ "$ACTIVITY_COUNT" -eq 0 ]]; then
  echo -e "  ${DIM}No file activity detected — journal not required${RESET}" >&2
elif [[ ! -f "$JOURNAL_FILE" ]]; then
  # Activity happened but no journal — auto-stub it and block
  mkdir -p "$JOURNAL_DIR"
  {
    echo "# Journal — ${TODAY}"
    echo ""
    echo "## Trabalho Realizado"
    echo ""
    echo "<!-- Descreva o que foi feito nesta sessão -->"
    echo ""
    echo "## Arquivos Modificados (${ACTIVITY_COUNT})"
    echo ""
    for F in "${MODIFIED_FILES[@]}"; do
      REL="$(echo "$F" | sed "s|${PROJECT_ROOT}/||")"
      echo "- \`${REL}\`"
    done
    echo ""
    echo "## Decisões / Bugs / TODO"
    echo ""
    echo "<!-- Preencha antes de encerrar a sessão -->"
  } > "$JOURNAL_FILE"

  echo -e "  ${YELLOW}⚠ ${ACTIVITY_COUNT} arquivo(s) modificado(s) nesta sessão${RESET}" >&2
  echo -e "  ${GREEN}✓ Stub de journal criado: ${JOURNAL_FILE}${RESET}" >&2
  ISSUES+=("Preencha o journal auto-gerado em journal/${TODAY}.md antes de encerrar")
else
  WORD_COUNT="$(wc -w < "$JOURNAL_FILE" 2> /dev/null || echo 0)"
  if [[ "$WORD_COUNT" -lt 20 ]]; then
    echo -e "  ${YELLOW}⚠ Journal exists but too short (${WORD_COUNT} words) — ${ACTIVITY_COUNT} arquivo(s) modificado(s)${RESET}" >&2
    ISSUES+=("Expand journal/${TODAY}.md — only ${WORD_COUNT} words written")
  else
    echo -e "  ${GREEN}✓ Journal OK: ${JOURNAL_FILE} (${WORD_COUNT} words, ${ACTIVITY_COUNT} arquivo(s) modificado(s))${RESET}" >&2
  fi
fi

echo "" >&2

# =============================================================================
# CHECK 3: Git activity summary for this session
# =============================================================================
echo -e "${CYAN}${BOLD}[3/3] Session activity summary...${RESET}" >&2

if git -C "$PROJECT_ROOT" rev-parse HEAD &> /dev/null 2>&1; then
  CHANGED="$(git -C "$PROJECT_ROOT" diff --stat HEAD 2> /dev/null || true)"
  STAGED="$(git -C "$PROJECT_ROOT" diff --cached --stat 2> /dev/null || true)"
  UNTRACKED_COUNT="$(git -C "$PROJECT_ROOT" ls-files --others --exclude-standard 2> /dev/null | wc -l | tr -d ' ')"

  if [[ -n "$CHANGED" ]]; then
    echo -e "  ${BOLD}Modified files (vs HEAD):${RESET}" >&2
    echo "$CHANGED" | head -20 | while IFS= read -r LINE; do
      echo -e "    ${DIM}${LINE}${RESET}" >&2
    done
  fi

  if [[ -n "$STAGED" ]]; then
    echo -e "  ${BOLD}Staged files:${RESET}" >&2
    echo "$STAGED" | head -10 | while IFS= read -r LINE; do
      echo -e "    ${GREEN}${LINE}${RESET}" >&2
    done
  fi

  if [[ "$UNTRACKED_COUNT" -gt 0 ]]; then
    echo -e "  ${YELLOW}New untracked files: ${UNTRACKED_COUNT}${RESET}" >&2
  fi

  if [[ -z "$CHANGED" && -z "$STAGED" && "$UNTRACKED_COUNT" -eq 0 ]]; then
    echo -e "  ${DIM}No git changes detected in this session${RESET}" >&2
  fi
else
  echo -e "  ${DIM}(Not a git repository or git not available)${RESET}" >&2
fi

echo "" >&2

# =============================================================================
# DECISION: Block or allow stop
# =============================================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2

if [[ ${#ISSUES[@]} -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}🚫 STOP BLOCKED — Complete these tasks first:${RESET}\n" >&2
  for i in "${!ISSUES[@]}"; do
    echo -e "  ${RED}$((i + 1)).${RESET} ${ISSUES[$i]}" >&2
  done
  echo -e "\n${YELLOW}These ensure you can resume this session effectively tomorrow.${RESET}\n" >&2
  exit 2
else
  echo -e "${GREEN}${BOLD}✅ All session checks passed — OK to stop${RESET}" >&2
  echo "" >&2
  exit 0
fi
