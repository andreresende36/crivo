#!/usr/bin/env bash
# =============================================================================
# 07-context-request-optimizer.sh — File Read Deduplication Advisor
# =============================================================================
# Type:    PreToolUse hook (Read tool)
# Purpose: Tracks which files have been read during this session. If a file
#          is being read more than twice, suggests using an MCP context server
#          instead of re-reading. Non-blocking — always exits 0.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": "Read",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/07-context-request-optimizer.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = always (advisory only, non-blocking)
# =============================================================================

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Read stdin
INPUT="$(cat)"

# Extract file path being read
if command -v jq &> /dev/null; then
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.path // .tool_input.file_path // ""' 2> /dev/null)"
  SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // "default"' 2> /dev/null)"
else
  FILE_PATH="$(echo "$INPUT" | grep -o '"path":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  SESSION_ID="$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "default")"
fi

# Nothing to track
[[ -z "$FILE_PATH" ]] && exit 0

# =============================================================================
# Setup cache directory
# =============================================================================
PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
CLAUDE_DIR="${PROJECT_ROOT}/.claude"
mkdir -p "$CLAUDE_DIR"

# Cache file is per-session to avoid cross-session pollution
CACHE_FILE="${CLAUDE_DIR}/read_files_cache_${SESSION_ID:0:8}.txt"

# Auto-create cache file with timestamp for cleanup detection
if [[ ! -f "$CACHE_FILE" ]]; then
  echo "# File read cache — session: ${SESSION_ID}" > "$CACHE_FILE"
  echo "# Created: $(date '+%Y-%m-%d %H:%M:%S')" >> "$CACHE_FILE"
fi

# =============================================================================
# Normalize path (resolve ./ ../ and make absolute if possible)
# =============================================================================
if [[ -f "$FILE_PATH" ]]; then
  NORMALIZED_PATH="$(cd "$(dirname "$FILE_PATH")" && echo "$PWD/$(basename "$FILE_PATH")" 2> /dev/null || echo "$FILE_PATH")"
else
  NORMALIZED_PATH="$FILE_PATH"
fi

# =============================================================================
# Count how many times this file has been read this session
# =============================================================================
READ_COUNT="$(grep -cxF "$NORMALIZED_PATH" "$CACHE_FILE" 2> /dev/null || echo 0)"

# Record this read
echo "$NORMALIZED_PATH" >> "$CACHE_FILE"

NEW_COUNT=$((READ_COUNT + 1))

# =============================================================================
# Show advisory after 2+ reads of the same file
# =============================================================================
RELATIVE_PATH="$(echo "$NORMALIZED_PATH" | sed "s|${PROJECT_ROOT}/||g")"

if [[ "$NEW_COUNT" -gt 2 ]]; then
  echo -e "\n${YELLOW}${BOLD}💡 CONTEXT OPTIMIZER${RESET}" >&2
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
  echo -e "  File ${BOLD}${RELATIVE_PATH}${RESET} has been read ${BOLD}${NEW_COUNT}× this session${RESET}" >&2
  echo "" >&2
  echo -e "  ${CYAN}Suggestions to reduce redundant reads:${RESET}" >&2
  echo -e "    1. Ask Claude to reference the previous read from context" >&2
  echo -e "    2. Use an MCP context server (e.g., @context-intelligence)" >&2
  echo -e "    3. Ask Claude to summarize and save key parts to a note file" >&2
  echo -e "    4. Add relevant content to CLAUDE.md for persistent context" >&2
  echo "" >&2
  echo -e "  ${DIM}Each re-read consumes tokens. MCP servers cache content efficiently.${RESET}" >&2
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
  echo "" >&2
elif [[ "$NEW_COUNT" -eq 2 ]]; then
  # Gentle hint on second read
  echo -e "  ${DIM}[Context Optimizer] ${RELATIVE_PATH} read 2× — next time, consider MCP caching${RESET}" >&2
fi

# =============================================================================
# Show top repeatedly-read files (on every 5th call for overview)
# =============================================================================
TOTAL_READS="$(grep -v '^#' "$CACHE_FILE" 2> /dev/null | wc -l | tr -d ' ')"
if [[ "$((TOTAL_READS % 10))" -eq 0 && "$TOTAL_READS" -gt 0 ]]; then
  echo -e "\n${BLUE}${BOLD}📊 Session Read Stats (top files):${RESET}" >&2
  grep -v '^#' "$CACHE_FILE" 2> /dev/null \
    | sort | uniq -c | sort -rn | head -5 \
    | while read -r COUNT PATH; do
      SHORT_PATH="$(echo "$PATH" | sed "s|${PROJECT_ROOT}/||g")"
      echo -e "    ${BOLD}${COUNT}×${RESET}  ${DIM}${SHORT_PATH}${RESET}" >&2
    done
  echo "" >&2
fi

# =============================================================================
# Auto-cleanup stale cache files (older than 24h)
# =============================================================================
find "$CLAUDE_DIR" -name "read_files_cache_*.txt" -mtime +1 -delete 2> /dev/null || true

exit 0
