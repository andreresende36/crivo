#!/usr/bin/env bash
# =============================================================================
# 10-startup-context-loader.sh — Session Startup Context Report
# =============================================================================
# Type:    PostToolUse / Notification hook — runs once at session start
# Purpose: Runs when the first tool is used in a session. Loads and displays:
#          - Contents of wake-up.md (context for resuming work)
#          - New files in inbox/ folder (< 24h old)
#          - git status summary
#          - Unchecked TODO items from CLAUDE.md
#          Creates a .claude/session_started marker to only run once per session.
#          Non-blocking — always exits 0.
#
# Configure in .claude/settings.json — run on first Bash command:
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Bash",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/10-startup-context-loader.sh"}]
#       }
#     ],
#     "Notification": [
#       {
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/10-startup-context-loader.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = always (non-blocking, informational only)
# =============================================================================

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Read stdin (session_id used for per-session marker)
INPUT="$(cat 2> /dev/null || true)"

if command -v jq &> /dev/null; then
  SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // "default"' 2> /dev/null)"
else
  SESSION_ID="$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "default")"
fi

SESSION_SHORT="${SESSION_ID:0:8}"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
CLAUDE_DIR="${PROJECT_ROOT}/.claude"
mkdir -p "$CLAUDE_DIR"

# =============================================================================
# Only run once per session using a marker file
# =============================================================================
SESSION_MARKER="${CLAUDE_DIR}/session_started_${SESSION_SHORT}"

if [[ -f "$SESSION_MARKER" ]]; then
  # Already ran for this session
  exit 0
fi

# Create marker immediately to prevent duplicate runs
echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$SESSION_MARKER"

# Clean up old session markers (older than 2 days)
find "$CLAUDE_DIR" -name "session_started_*" -mtime +2 -delete 2> /dev/null || true

# =============================================================================
# BEGIN STARTUP REPORT
# =============================================================================
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
TODAY="$(date '+%Y-%m-%d')"
DOW="$(date '+%A')"

echo "" >&2
echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}" >&2
echo -e "${MAGENTA}${BOLD}║           🚀 CLAUDE CODE SESSION STARTUP                  ║${RESET}" >&2
echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}" >&2
echo -e "  ${DIM}${DOW}, ${NOW} | Session: ${SESSION_SHORT}${RESET}" >&2
echo -e "  ${DIM}Project: ${PROJECT_ROOT}${RESET}" >&2
echo "" >&2

# =============================================================================
# SECTION 1: wake-up.md
# =============================================================================
WAKEUP_FILE="${PROJECT_ROOT}/memory/wake-up.md"
echo -e "${CYAN}${BOLD}📋 WAKE-UP CONTEXT${RESET}" >&2
echo -e "${CYAN}──────────────────────────────────────────────────────────${RESET}" >&2

if [[ -f "$WAKEUP_FILE" ]]; then
  # Get file age
  if stat --version &> /dev/null 2>&1; then
    FILE_DATE="$(stat -c '%y' "$WAKEUP_FILE" 2> /dev/null | cut -d' ' -f1 || echo "unknown")"
  else
    FILE_DATE="$(stat -f '%Sm' -t '%Y-%m-%d' "$WAKEUP_FILE" 2> /dev/null || echo "unknown")"
  fi

  if [[ "$FILE_DATE" == "$TODAY" ]]; then
    AGE_LABEL="${GREEN}(updated today)${RESET}"
  else
    AGE_LABEL="${YELLOW}(last updated: ${FILE_DATE})${RESET}"
  fi

  echo -e "  📄 wake-up.md ${AGE_LABEL}" >&2
  echo "" >&2

  echo "Re-indexing project symbols..." >&2
  npm run claude:index --silent >&2 2> /dev/null || true

  # Print wake-up.md content with indentation
  while IFS= read -r LINE; do
    if [[ "$LINE" =~ ^#{1,2}\  ]]; then
      echo -e "  ${BOLD}${LINE}${RESET}" >&2
    elif [[ "$LINE" =~ ^#{3,}\  ]]; then
      echo -e "  ${CYAN}${LINE}${RESET}" >&2
    elif [[ "$LINE" =~ ^\-\  ]]; then
      echo -e "  ${DIM}${LINE}${RESET}" >&2
    elif [[ -z "$LINE" ]]; then
      echo "" >&2
    else
      echo -e "  ${LINE}" >&2
    fi
  done < "$WAKEUP_FILE"
else
  echo -e "  ${YELLOW}⚠  wake-up.md not found${RESET}" >&2
  echo -e "  ${DIM}Create wake-up.md to persist context between sessions.${RESET}" >&2
  echo -e "  ${DIM}Recommended sections: ## Status, ## Next Steps, ## Blockers${RESET}" >&2
fi

echo "" >&2

# =============================================================================
# SECTION 2: Inbox files (< 24h old)
# =============================================================================
INBOX_DIR="${PROJECT_ROOT}/inbox"
echo -e "${BLUE}${BOLD}📥 INBOX (files added in last 24h)${RESET}" >&2
echo -e "${BLUE}──────────────────────────────────────────────────────────${RESET}" >&2

if [[ -d "$INBOX_DIR" ]]; then
  # Find files in inbox newer than 24h
  NEW_FILES=()
  while IFS= read -r -d '' FILE; do
    NEW_FILES+=("$FILE")
  done < <(find "$INBOX_DIR" -maxdepth 2 -type f -newer "$SESSION_MARKER" -print0 2> /dev/null \
    || find "$INBOX_DIR" -maxdepth 2 -type f -mtime -1 -print0 2> /dev/null)

  if [[ ${#NEW_FILES[@]} -gt 0 ]]; then
    echo -e "  ${YELLOW}${BOLD}${#NEW_FILES[@]} new file(s) in inbox/:${RESET}" >&2
    for FILE in "${NEW_FILES[@]}"; do
      RELATIVE="$(echo "$FILE" | sed "s|${PROJECT_ROOT}/||g")"
      SIZE="$(du -sh "$FILE" 2> /dev/null | cut -f1 || echo "?")"
      echo -e "    ${GREEN}●${RESET} ${RELATIVE} ${DIM}(${SIZE})${RESET}" >&2
    done
  else
    TOTAL_FILES="$(find "$INBOX_DIR" -type f 2> /dev/null | wc -l | tr -d ' ')"
    echo -e "  ${DIM}No new inbox files (${TOTAL_FILES} total in inbox/)${RESET}" >&2
  fi
else
  echo -e "  ${DIM}No inbox/ directory found${RESET}" >&2
fi

echo "" >&2

# =============================================================================
# SECTION 3: Git status
# =============================================================================
echo -e "${GREEN}${BOLD}🌿 GIT STATUS${RESET}" >&2
echo -e "${GREEN}──────────────────────────────────────────────────────────${RESET}" >&2

if git -C "$PROJECT_ROOT" rev-parse HEAD &> /dev/null 2>&1; then
  BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2> /dev/null || echo "detached")"
  GIT_STATUS="$(git -C "$PROJECT_ROOT" status --short 2> /dev/null)"
  STASH_COUNT="$(git -C "$PROJECT_ROOT" stash list 2> /dev/null | wc -l | tr -d ' ')"
  AHEAD_BEHIND="$(git -C "$PROJECT_ROOT" status --branch --short 2> /dev/null | head -1 | grep -oE 'ahead [0-9]+|behind [0-9]+' || true)"

  echo -e "  ${BOLD}Branch:${RESET} ${GREEN}${BRANCH}${RESET}" >&2

  [[ -n "$AHEAD_BEHIND" ]] && echo -e "  ${YELLOW}⚡ ${AHEAD_BEHIND}${RESET}" >&2
  [[ "$STASH_COUNT" -gt 0 ]] && echo -e "  ${YELLOW}📦 ${STASH_COUNT} stash(es) saved${RESET}" >&2

  if [[ -n "$GIT_STATUS" ]]; then
    echo "" >&2
    echo "$GIT_STATUS" | head -20 | while IFS= read -r LINE; do
      PREFIX="${LINE:0:2}"
      case "$PREFIX" in
        "M " | " M") echo -e "    ${YELLOW}${LINE}${RESET}" >&2 ;;
        "A " | " A") echo -e "    ${GREEN}${LINE}${RESET}" >&2 ;;
        "D " | " D") echo -e "    ${RED}${LINE}${RESET}" >&2 ;;
        "??") echo -e "    ${DIM}${LINE}${RESET}" >&2 ;;
        *) echo -e "    ${LINE}" >&2 ;;
      esac
    done
    STATUS_COUNT="$(echo "$GIT_STATUS" | wc -l | tr -d ' ')"
    if [[ "$STATUS_COUNT" -gt 20 ]]; then
      echo -e "    ${DIM}... and $((STATUS_COUNT - 20)) more files${RESET}" >&2
    fi
  else
    echo -e "  ${DIM}Working tree clean${RESET}" >&2
  fi
else
  echo -e "  ${DIM}Not a git repository${RESET}" >&2
fi

echo "" >&2

# =============================================================================
# SECTION 4: Unchecked TODOs from CLAUDE.md
# =============================================================================
echo -e "${YELLOW}${BOLD}☑  TODO ITEMS (from CLAUDE.md)${RESET}" >&2
echo -e "${YELLOW}──────────────────────────────────────────────────────────${RESET}" >&2
CLAUDE_MD="${PROJECT_ROOT}/CLAUDE.md"

if [[ -f "$CLAUDE_MD" ]]; then
  UNCHECKED="$(grep -n '^\s*-\s*\[ \]' "$CLAUDE_MD" 2> /dev/null || true)"
  CHECKED_COUNT="$(grep -c '^\s*-\s*\[x\]' "$CLAUDE_MD" 2> /dev/null || echo 0)"

  if [[ -n "$UNCHECKED" ]]; then
    UNCHECKED_COUNT="$(echo "$UNCHECKED" | wc -l | tr -d ' ')"
    echo -e "  ${BOLD}${UNCHECKED_COUNT} open task(s)${RESET} ${DIM}(${CHECKED_COUNT} completed)${RESET}" >&2
    echo "" >&2
    echo "$UNCHECKED" | head -10 | while IFS= read -r LINE; do
      # Line format: "42:  - [ ] task description"
      LINE_NUM="$(echo "$LINE" | cut -d: -f1)"
      TASK="$(echo "$LINE" | cut -d: -f2- | sed 's/^\s*-\s*\[ \]\s*//')"
      echo -e "    ${YELLOW}☐${RESET}  ${TASK} ${DIM}(CLAUDE.md:${LINE_NUM})${RESET}" >&2
    done
    if [[ "$UNCHECKED_COUNT" -gt 10 ]]; then
      echo -e "    ${DIM}... and $((UNCHECKED_COUNT - 10)) more${RESET}" >&2
    fi
  else
    echo -e "  ${GREEN}✓ No open TODO items in CLAUDE.md${RESET}" >&2
    [[ "$CHECKED_COUNT" -gt 0 ]] && echo -e "  ${DIM}(${CHECKED_COUNT} completed tasks)${RESET}" >&2
  fi
else
  echo -e "  ${DIM}CLAUDE.md not found — no TODO tracking available${RESET}" >&2
fi

echo "" >&2

# =============================================================================
# CLOSING
# =============================================================================
echo -e "${MAGENTA}${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}" >&2
echo -e "${MAGENTA}${BOLD}║           Context loaded — ready to work! 🎯              ║${RESET}" >&2
echo -e "${MAGENTA}${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}" >&2
echo "" >&2

exit 0
