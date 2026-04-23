#!/usr/bin/env bash
# =============================================================================
# 06-decision-logger.sh — Architectural Decision Auto-Logger
# =============================================================================
# Type:    PostToolUse hook (after any text/response)
# Purpose: Detects architectural decision language in Claude's responses
#          and automatically creates ADR (Architecture Decision Record) files
#          in the decisions/ directory. Non-blocking — always exits 0.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "PostToolUse": [
#       {
#         "matcher": ".*",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/06-decision-logger.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = always (non-blocking hook)
# =============================================================================

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Read stdin
INPUT="$(cat)"

# Extract response text
if command -v jq &> /dev/null; then
  RESPONSE_TEXT="$(echo "$INPUT" | jq -r '.tool_response // .tool_output // .result // ""' 2> /dev/null)"
  TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""' 2> /dev/null)"
else
  RESPONSE_TEXT="$(echo "$INPUT" | grep -o '"tool_response":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
  TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
fi

# Skip non-text tools — no decisions embedded in file writes
case "$TOOL_NAME" in
  "Write" | "Edit" | "Read" | "Bash" | "MultiEdit")
    exit 0
    ;;
esac

# Skip if response too short to contain decisions
if [[ ${#RESPONSE_TEXT} -lt 50 ]]; then
  exit 0
fi

# =============================================================================
# Decision detection patterns
# =============================================================================
declare -a DECISION_PATTERNS=(
  "instead of"
  "rather than"
  "we decided to use"
  "we decided to"
  "I decided to use"
  "the reason for"
  "trade-off between"
  "we chose"
  "I chose"
  "the advantage of"
  "the drawback of"
  "this approach"
  "the rationale"
  "because of the"
  "we're going with"
  "I'm going with"
  "the best approach"
  "preferred approach"
  "going forward"
  "architectural decision"
  "design decision"
  "we should use .* because"
  "use .* instead of"
  "switch from .* to"
  "migrate from .* to"
)

FOUND_PATTERN=""
for PATTERN in "${DECISION_PATTERNS[@]}"; do
  if echo "$RESPONSE_TEXT" | grep -qiE "$PATTERN" 2> /dev/null; then
    FOUND_PATTERN="$PATTERN"
    break
  fi
done

# No decision language detected
[[ -z "$FOUND_PATTERN" ]] && exit 0

# =============================================================================
# Extract decision context (sentences containing the pattern)
# =============================================================================
DECISION_SENTENCES=""
while IFS= read -r SENTENCE; do
  if echo "$SENTENCE" | grep -qiE "$FOUND_PATTERN" 2> /dev/null; then
    DECISION_SENTENCES="${DECISION_SENTENCES}${SENTENCE}
"
  fi
done <<< "$(echo "$RESPONSE_TEXT" | tr '.' '\n' | sed '/^[[:space:]]*$/d')"

# Limit to first 5 relevant sentences
DECISION_SNIPPET="$(echo "$DECISION_SENTENCES" | head -5)"

# =============================================================================
# Create slug from decision text
# =============================================================================
TODAY="$(date +%Y-%m-%d)"
NOW="$(date '+%Y-%m-%d %H:%M')"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
DECISIONS_DIR="${PROJECT_ROOT}/memory/decisions"

# Generate a slug from first relevant sentence
SLUG_SOURCE="$(echo "$DECISION_SNIPPET" | head -1 | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9 ]/ /g' | tr -s ' ' | sed 's/^ //;s/ $//' \
  | tr ' ' '-' | cut -c1-50 | sed 's/-*$//')"

# Fallback slug
if [[ -z "$SLUG_SOURCE" ]]; then
  SLUG_SOURCE="decision"
fi

ADR_FILE="${DECISIONS_DIR}/${TODAY}-${SLUG_SOURCE}.md"

# Avoid overwriting existing file — add timestamp suffix
if [[ -f "$ADR_FILE" ]]; then
  TIMESTAMP="$(date +%H%M%S)"
  ADR_FILE="${DECISIONS_DIR}/${TODAY}-${SLUG_SOURCE}-${TIMESTAMP}.md"
fi

# =============================================================================
# Create decisions directory and write ADR file
# =============================================================================
mkdir -p "$DECISIONS_DIR"

# Get session ID if available
SESSION_ID="$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4 || echo "unknown")"

cat > "$ADR_FILE" << MARKDOWN
# Decision: $(echo "$SLUG_SOURCE" | tr '-' ' ' | sed 's/\b\(.\)/\u\1/g')

**Date:** ${TODAY}
**Recorded at:** ${NOW}
**Session:** ${SESSION_ID}
**Detected pattern:** "${FOUND_PATTERN}"

## Context

$(echo "$DECISION_SNIPPET" | sed 's/^/> /')

## Status

Proposed

## Decision

<!-- Claude detected architectural decision language. Flesh out the decision here: -->

$(echo "$DECISION_SNIPPET")

## Rationale

<!-- Why was this approach chosen? -->

## Consequences

### Positive
- 

### Negative / Trade-offs
- 

## Alternatives Considered

<!-- What else was considered and rejected? -->

---
*Auto-generated by 06-decision-logger.sh hook*
MARKDOWN

# =============================================================================
# Report
# =============================================================================
echo -e "\n${CYAN}${BOLD}📋 DECISION LOGGER${RESET}" >&2
echo -e "  ${GREEN}✓ ADR auto-created:${RESET} ${DIM}${ADR_FILE}${RESET}" >&2
echo -e "  ${DIM}Pattern detected: \"${FOUND_PATTERN}\"${RESET}" >&2
echo -e "  ${YELLOW}Tip: Open ${ADR_FILE} and flesh out the full decision record.${RESET}" >&2
echo "" >&2

exit 0
