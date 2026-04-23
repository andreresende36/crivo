#!/usr/bin/env bash
# =============================================================================
# 02-promise-checker.sh — Empty Promise Detector
# =============================================================================
# Type:    PostToolUse hook (after Text/Message tool responses)
# Purpose: Detects when Claude says "I'll remember", "I've noted", etc.
#          without actually writing anything to disk. Forces real action
#          over empty acknowledgements.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": ".*",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/02-promise-checker.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = OK (no empty promises, or a real action was taken)
#   2 = Warning (empty promise detected — asks Claude to write the note)
# =============================================================================

# Colors
YELLOW='\033[1;33m'
ORANGE='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Read full stdin
INPUT="$(cat)"

# Extract fields using jq or fallback
if command -v jq &> /dev/null; then
  TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""')"
  TOOL_OUTPUT="$(echo "$INPUT" | jq -r '.tool_response // .tool_output // ""')"
  TOOL_INPUT="$(echo "$INPUT" | jq -r '.tool_input // {} | tostring')"
else
  TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TOOL_OUTPUT="$(echo "$INPUT" | grep -o '"tool_response":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TOOL_INPUT="$INPUT"
fi

# Only check text-generating tools
case "$TOOL_NAME" in
  "text" | "message" | "respond" | "assistant" | "chat" | "")
    : # continue
    ;;
  "Write" | "Edit" | "Bash" | "Read")
    # These are action tools — no problem
    exit 0
    ;;
esac

# Text to scan for promises (output from Claude)
RESPONSE_TEXT="$TOOL_OUTPUT"

# Also scan the raw input in case response is nested differently
if [[ -z "$(echo "$RESPONSE_TEXT" | tr -d '[:space:]')" ]]; then
  RESPONSE_TEXT="$INPUT"
fi

# =============================================================================
# Promise patterns — phrases Claude uses when just acknowledging without acting
# =============================================================================
PROMISE_PATTERNS=(
  "I'll remember"
  "I will remember"
  "I've noted"
  "I have noted"
  "I'll note"
  "I will note"
  "I'll keep that in mind"
  "I will keep that in mind"
  "I'll keep in mind"
  "noted\."
  "Got it\."
  "Understood\."
  "I'll write that down"
  "I will write that down"
  "I won't forget"
  "I will not forget"
  "I'll make a note"
  "I will make a note"
  "I'll bear that in mind"
  "duly noted"
  "I'll track that"
  "I'll make sure to remember"
)

# =============================================================================
# Action indicators — if these appear, a real action was taken
# =============================================================================
ACTION_PATTERNS=(
  "I've written"
  "I have written"
  "Created file"
  "Updated file"
  "Saved to"
  "Written to"
  "Added to"
  "Appended to"
  "I created"
  "I wrote"
  "I updated"
  "I saved"
)

# Check for promise patterns
FOUND_PROMISE=""
for PATTERN in "${PROMISE_PATTERNS[@]}"; do
  if echo "$RESPONSE_TEXT" | grep -qiE "$PATTERN" 2> /dev/null; then
    FOUND_PROMISE="$PATTERN"
    break
  fi
done

# No promise found — all good
[[ -z "$FOUND_PROMISE" ]] && exit 0

# Check if a real action was also taken
for ACTION in "${ACTION_PATTERNS[@]}"; do
  if echo "$RESPONSE_TEXT" | grep -qiE "$ACTION" 2> /dev/null; then
    # Real action detected alongside promise — acceptable
    exit 0
  fi
done

# Check if last tool used was Write/Edit (real action in tool chain)
if echo "$INPUT" | grep -qE '"tool_name"\s*:\s*"(Write|Edit|Create)"' 2> /dev/null; then
  exit 0
fi

# =============================================================================
# Empty promise detected — warn Claude
# =============================================================================
echo -e "\n${YELLOW}${BOLD}⚠️  PROMISE CHECKER: Empty Acknowledgement Detected${RESET}" >&2
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo -e "" >&2
echo -e "  ${ORANGE}Matched pattern:${RESET} \"${FOUND_PROMISE}\"" >&2
echo -e "" >&2
echo -e "  Claude said it would remember/note something, but no file" >&2
echo -e "  was written to persist this information." >&2
echo -e "" >&2
echo -e "${CYAN}${BOLD}Required action:${RESET}" >&2
echo -e "  Instead of just saying \"I'll remember\", Claude must:" >&2
echo -e "  1. Create or update a markdown note file (e.g., notes/, context/, wake-up.md)" >&2
echo -e "  2. Add the information to CLAUDE.md or a relevant context file" >&2
echo -e "  3. Write a journal entry in journal/YYYY-MM-DD.md" >&2
echo -e "" >&2
echo -e "  ${YELLOW}Memory without persistence = forgetting at session end.${RESET}" >&2
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

exit 2
