#!/usr/bin/env bash
# =============================================================================
# 09-cost-estimator.sh — Session Token Cost Estimator
# =============================================================================
# Type:    Stop hook — displays token usage and cost estimate at session end
# Purpose: Reads Claude Code's token usage log, calculates costs based on
#          the detected model, and shows a friendly billing summary.
#          Non-blocking — always exits 0.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "Stop": [
#       {
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/09-cost-estimator.sh"}]
#       }
#     ]
#   }
# }
#
# Pricing reference (per million tokens, USD):
#   claude-sonnet-4-6: input $3.00  / output $15.00
#   claude-haiku-4-5:  input $0.80  / output $4.00
#   claude-opus-4-6:   input $15.00 / output $75.00
#
# Exit codes:
#   0 = always (non-blocking)
# =============================================================================

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
CLAUDE_DIR="${PROJECT_ROOT}/.claude"
USAGE_LOG="${CLAUDE_DIR}/token_usage.jsonl"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

echo -e "\n${BLUE}${BOLD}📊 SESSION COST ESTIMATOR${RESET}" >&2
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2

# =============================================================================
# STEP 1: Detect model from settings
# =============================================================================
DETECTED_MODEL="claude-sonnet-4-6" # default

if [[ -f "$SETTINGS_FILE" ]]; then
  if command -v jq &> /dev/null; then
    MODEL_SETTING="$(jq -r '.model // .defaultModel // ""' "$SETTINGS_FILE" 2> /dev/null)"
  else
    MODEL_SETTING="$(grep -o '"model":"[^"]*"' "$SETTINGS_FILE" | head -1 | cut -d'"' -f4 || true)"
  fi

  if [[ -n "$MODEL_SETTING" && "$MODEL_SETTING" != "null" ]]; then
    DETECTED_MODEL="$MODEL_SETTING"
  fi
fi

# =============================================================================
# STEP 2: Set pricing per model (cost per million tokens, in dollars)
# =============================================================================
case "$DETECTED_MODEL" in
  *"claude-sonnet-4-6"* | *"claude-4.6-sonnet"*)
    INPUT_COST_PER_MTOK=3.00
    OUTPUT_COST_PER_MTOK=15.00
    MODEL_DISPLAY="Claude Sonnet 4.6"
    ;;
  *"claude-haiku-4-5"* | *"claude-4.5-haiku"*)
    INPUT_COST_PER_MTOK=0.80
    OUTPUT_COST_PER_MTOK=4.00
    MODEL_DISPLAY="Claude Haiku 4.5"
    ;;
  *"claude-opus-4-6"* | *"claude-4.6-opus"*)
    INPUT_COST_PER_MTOK=15.00
    OUTPUT_COST_PER_MTOK=75.00
    MODEL_DISPLAY="Claude Opus 4.6"
    ;;
  *"claude-sonnet-4"* | *"claude-4-sonnet"*)
    INPUT_COST_PER_MTOK=3.00
    OUTPUT_COST_PER_MTOK=15.00
    MODEL_DISPLAY="Claude Sonnet 4 (legacy)"
    ;;
  *"claude-haiku-4"* | *"claude-4-haiku"*)
    INPUT_COST_PER_MTOK=0.80
    OUTPUT_COST_PER_MTOK=4.00
    MODEL_DISPLAY="Claude Haiku 4"
    ;;
  *)
    # Default to Sonnet 4.6 pricing
    INPUT_COST_PER_MTOK=3.00
    OUTPUT_COST_PER_MTOK=15.00
    MODEL_DISPLAY="Claude Sonnet 4.6 (default)"
    ;;
esac

echo -e "  ${DIM}Model: ${MODEL_DISPLAY}${RESET}" >&2
echo -e "  ${DIM}Pricing: \$${INPUT_COST_PER_MTOK}/MTok input, \$${OUTPUT_COST_PER_MTOK}/MTok output${RESET}" >&2
echo "" >&2

# =============================================================================
# STEP 3: Read and sum token usage
# =============================================================================
if [[ ! -f "$USAGE_LOG" ]]; then
  echo -e "  ${YELLOW}Token tracking not available${RESET}" >&2
  echo -e "  ${DIM}Expected log file: ${USAGE_LOG}${RESET}" >&2
  echo -e "  ${DIM}Claude Code writes token usage to this file when tracking is enabled.${RESET}" >&2
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
  echo "" >&2
  exit 0
fi

# Parse JSONL (one JSON object per line)
if command -v jq &> /dev/null; then
  TOTAL_INPUT="$(jq -rs '[.[].input_tokens  // 0] | add // 0' "$USAGE_LOG" 2> /dev/null || echo 0)"
  TOTAL_OUTPUT="$(jq -rs '[.[].output_tokens // 0] | add // 0' "$USAGE_LOG" 2> /dev/null || echo 0)"
  TOTAL_CACHE_READ="$(jq -rs '[.[].cache_read_input_tokens // 0] | add // 0' "$USAGE_LOG" 2> /dev/null || echo 0)"
  TOTAL_CACHE_WRITE="$(jq -rs '[.[].cache_creation_input_tokens // 0] | add // 0' "$USAGE_LOG" 2> /dev/null || echo 0)"
  API_CALLS="$(wc -l < "$USAGE_LOG" | tr -d ' ')"
else
  # Fallback: crude sum without jq
  TOTAL_INPUT="$(grep -o '"input_tokens":[0-9]*' "$USAGE_LOG" \
    | awk -F: '{s+=$2} END {print s+0}' 2> /dev/null || echo 0)"
  TOTAL_OUTPUT="$(grep -o '"output_tokens":[0-9]*' "$USAGE_LOG" \
    | awk -F: '{s+=$2} END {print s+0}' 2> /dev/null || echo 0)"
  TOTAL_CACHE_READ=0
  TOTAL_CACHE_WRITE=0
  API_CALLS="$(wc -l < "$USAGE_LOG" | tr -d ' ')"
fi

# Ensure integers
TOTAL_INPUT="${TOTAL_INPUT:-0}"
TOTAL_OUTPUT="${TOTAL_OUTPUT:-0}"
TOTAL_CACHE_READ="${TOTAL_CACHE_READ:-0}"
TOTAL_CACHE_WRITE="${TOTAL_CACHE_WRITE:-0}"

# =============================================================================
# STEP 4: Calculate costs (using awk for float math in bash)
# =============================================================================
INPUT_COST="$(awk "BEGIN {printf \"%.4f\", ${TOTAL_INPUT} * ${INPUT_COST_PER_MTOK} / 1000000}")"
OUTPUT_COST="$(awk "BEGIN {printf \"%.4f\", ${TOTAL_OUTPUT} * ${OUTPUT_COST_PER_MTOK} / 1000000}")"

# Cache pricing: cache reads at 10% of input price, cache writes at 125%
CACHE_READ_COST="$(awk "BEGIN {printf \"%.4f\", ${TOTAL_CACHE_READ} * ${INPUT_COST_PER_MTOK} * 0.10 / 1000000}")"
CACHE_WRITE_COST="$(awk "BEGIN {printf \"%.4f\", ${TOTAL_CACHE_WRITE} * ${INPUT_COST_PER_MTOK} * 1.25 / 1000000}")"

TOTAL_COST="$(awk "BEGIN {printf \"%.4f\", ${INPUT_COST} + ${OUTPUT_COST} + ${CACHE_READ_COST} + ${CACHE_WRITE_COST}}")"

# Format large numbers with commas
format_number() {
  echo "$1" | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta' 2> /dev/null || echo "$1"
}

INPUT_FMT="$(format_number "$TOTAL_INPUT")"
OUTPUT_FMT="$(format_number "$TOTAL_OUTPUT")"
CACHE_READ_FMT="$(format_number "$TOTAL_CACHE_READ")"

# Cost color based on total
if awk "BEGIN {exit !($TOTAL_COST > 5.0)}"; then
  COST_COLOR="${RED}"
elif awk "BEGIN {exit !($TOTAL_COST > 1.0)}"; then
  COST_COLOR="${YELLOW}"
else
  COST_COLOR="${GREEN}"
fi

# =============================================================================
# STEP 5: Display summary
# =============================================================================
echo -e "  ${CYAN}${BOLD}Token Usage:${RESET}" >&2
echo -e "    Input:       ${BOLD}${INPUT_FMT}${RESET} tokens  ${DIM}(~\$${INPUT_COST})${RESET}" >&2
echo -e "    Output:      ${BOLD}${OUTPUT_FMT}${RESET} tokens  ${DIM}(~\$${OUTPUT_COST})${RESET}" >&2

if [[ "$TOTAL_CACHE_READ" -gt 0 || "$TOTAL_CACHE_WRITE" -gt 0 ]]; then
  echo -e "    Cache read:  ${BOLD}${CACHE_READ_FMT}${RESET} tokens  ${DIM}(~\$${CACHE_READ_COST})${RESET}" >&2
  echo -e "    Cache write: ${BOLD}$(format_number "$TOTAL_CACHE_WRITE")${RESET} tokens  ${DIM}(~\$${CACHE_WRITE_COST})${RESET}" >&2
fi

echo "" >&2
echo -e "  ${BOLD}API calls this session: ${API_CALLS}${RESET}" >&2
echo "" >&2
echo -e "  ${BOLD}Total estimated cost: ${COST_COLOR}~\$${TOTAL_COST} USD${RESET}" >&2

# Show cost per API call
if [[ "$API_CALLS" -gt 0 ]]; then
  COST_PER_CALL="$(awk "BEGIN {printf \"%.4f\", $TOTAL_COST / $API_CALLS}")"
  echo -e "  ${DIM}Avg cost per API call: ~\$${COST_PER_CALL}${RESET}" >&2
fi

echo "" >&2

# Budget hints
if awk "BEGIN {exit !($TOTAL_COST > 3.0)}"; then
  echo -e "  ${YELLOW}💡 High usage detected — consider:${RESET}" >&2
  echo -e "     • Using prompt caching for repeated context" >&2
  echo -e "     • Switching to Claude Haiku for simpler tasks" >&2
  echo -e "     • Summarizing context instead of re-reading files" >&2
  echo "" >&2
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

exit 0
