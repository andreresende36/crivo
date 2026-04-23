#!/usr/bin/env bash
# =============================================================================
# 04-typescript-guard.sh — TypeScript Compile Guard
# =============================================================================
# Type:    PostToolUse hook (after Write tool touching .ts/.tsx files)
# Purpose: Automatically runs `npx tsc --noEmit` after any TypeScript file
#          is written, catching type errors before they pile up.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": "Write",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/04-typescript-guard.sh"}]
#       },
#       {
#         "matcher": "Edit",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/04-typescript-guard.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = OK (no TS files, or tsc passed)
#   2 = Block (tsc found errors — shows them)
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Read stdin
INPUT="$(cat)"

# Extract the file path that was written
if command -v jq &> /dev/null; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""')"
  TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""')"
else
  FILE_PATH="$(echo "$INPUT" | grep -o '"path":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
fi

# Only proceed for Write/Edit tools
case "$TOOL_NAME" in
  "Write" | "Edit" | "MultiEdit" | "str_replace_editor" | "create_file" | "replace_string_in_file")
    : # continue
    ;;
  *)
    exit 0
    ;;
esac

# Check if the file is a TypeScript file
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

echo -e "\n${CYAN}${BOLD}🔷 TypeScript Guard — Checking: ${FILE_PATH}${RESET}" >&2

# Find the project root (where tsconfig.json lives)
FILE_DIR="$(dirname "$FILE_PATH")"
TSCONFIG_DIR=""
SEARCH_DIR="$FILE_DIR"

# Walk up directory tree to find tsconfig.json
for _ in 1 2 3 4 5 6 7 8; do
  if [[ -f "${SEARCH_DIR}/tsconfig.json" ]]; then
    TSCONFIG_DIR="$SEARCH_DIR"
    break
  fi
  # Stop at filesystem root
  PARENT="$(dirname "$SEARCH_DIR")"
  [[ "$PARENT" == "$SEARCH_DIR" ]] && break
  SEARCH_DIR="$PARENT"
done

if [[ -z "$TSCONFIG_DIR" ]]; then
  echo -e "  ${YELLOW}⚠ No tsconfig.json found in parent directories — skipping type check${RESET}" >&2
  exit 0
fi

echo -e "  ${DIM}tsconfig found at: ${TSCONFIG_DIR}${RESET}" >&2

# Check if tsc is available (via npx)
if ! command -v npx &> /dev/null; then
  echo -e "  ${YELLOW}⚠ npx not found — skipping TypeScript check${RESET}" >&2
  exit 0
fi

# Run tsc --noEmit from the project root
echo -e "  ${DIM}Running: npx tsc --noEmit${RESET}" >&2

TSC_OUTPUT="$(cd "$TSCONFIG_DIR" && npx tsc --noEmit 2>&1)"
TSC_EXIT="$?"

if [[ "$TSC_EXIT" -eq 0 ]]; then
  echo -e "  ${GREEN}✓ TypeScript: No type errors found${RESET}" >&2
  exit 0
fi

# TypeScript errors found
ERROR_COUNT="$(echo "$TSC_OUTPUT" | grep -c ' error TS' 2> /dev/null || echo "?")"
FILE_COUNT="$(echo "$TSC_OUTPUT" | grep -oE '^[^(]+' | sort -u | grep -v '^$' | wc -l | tr -d ' ')"

echo -e "\n${RED}${BOLD}❌ TYPESCRIPT GUARD: Type Errors Found${RESET}" >&2
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo -e "  Found ${BOLD}${ERROR_COUNT} error(s)${RESET} across ${BOLD}${FILE_COUNT} file(s)${RESET}" >&2
echo "" >&2

# Format and display errors (max 30 lines)
echo "$TSC_OUTPUT" | head -30 | while IFS= read -r LINE; do
  if echo "$LINE" | grep -q ' error TS'; then
    echo -e "  ${RED}${LINE}${RESET}" >&2
  elif echo "$LINE" | grep -q ' warning TS'; then
    echo -e "  ${YELLOW}${LINE}${RESET}" >&2
  else
    echo -e "  ${DIM}${LINE}${RESET}" >&2
  fi
done

TOTAL_LINES="$(echo "$TSC_OUTPUT" | wc -l | tr -d ' ')"
if [[ "$TOTAL_LINES" -gt 30 ]]; then
  REMAINING=$((TOTAL_LINES - 30))
  echo -e "  ${DIM}... and ${REMAINING} more lines${RESET}" >&2
fi

echo "" >&2
echo -e "${YELLOW}Fix these type errors before continuing.${RESET}" >&2
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

exit 2
