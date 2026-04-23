#!/usr/bin/env bash
# =============================================================================
# 01-secret-scanner.sh — Secret & Credential Scanner
# =============================================================================
# Type:    PreToolUse hook (Bash + Write)
# Purpose: Intercepts commands and file writes to block accidental exposure
#          of secrets, API keys, tokens, and credentials.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "PreToolUse": [
#       {
#         "matcher": "Bash",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/01-secret-scanner.sh"}]
#       },
#       {
#         "matcher": "Write",
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/01-secret-scanner.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = allow (no secrets found)
#   2 = block (secrets detected)
# =============================================================================

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# Read stdin JSON (Claude Code passes hook data via stdin)
INPUT="$(cat)"

# Extract content to scan — works for both Bash (command field) and Write (content field)
if command -v jq &> /dev/null; then
  TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // ""')"
  COMMAND="$(echo "$INPUT" | jq -r '.tool_input.command // ""')"
  CONTENT="$(echo "$INPUT" | jq -r '.tool_input.content // ""')"
  FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.path // ""')"
else
  # Fallback: crude extraction via grep/sed
  TOOL_NAME="$(echo "$INPUT" | grep -o '"tool_name":"[^"]*"' | cut -d'"' -f4 || true)"
  COMMAND="$(echo "$INPUT" | grep -o '"command":"[^"]*"' | cut -d'"' -f4 || true)"
  CONTENT=""
  FILE_PATH="$(echo "$INPUT" | grep -o '"path":"[^"]*"' | cut -d'"' -f4 || true)"
fi

# Combine all text to scan
SCAN_TEXT="${COMMAND}
${CONTENT}"

# Skip if nothing to scan
if [[ -z "$(echo "$SCAN_TEXT" | tr -d '[:space:]')" ]]; then
  exit 0
fi

# =============================================================================
# Secret patterns (regex)
# =============================================================================
declare -A PATTERNS
PATTERNS["OpenAI API Key"]='sk-[a-zA-Z0-9]{20,}'
PATTERNS["OpenAI Project Key"]='sk-proj-[a-zA-Z0-9_-]{20,}'
PATTERNS["AWS Access Key"]='AKIA[0-9A-Z]{16}'
PATTERNS["AWS Secret Key"]='[Aa][Ww][Ss][_-]?[Ss][Ee][Cc][Rr][Ee][Tt][_-]?[Kk][Ee][Yy]\s*[=:]\s*[a-zA-Z0-9/+=]{20,}'
PATTERNS["GitHub Token (PAT)"]='ghp_[a-zA-Z0-9]{36}'
PATTERNS["GitHub OAuth Token"]='gho_[a-zA-Z0-9]{36}'
PATTERNS["GitHub Actions Token"]='ghs_[a-zA-Z0-9]{36}'
PATTERNS["Stripe Secret Key"]='sk_live_[a-zA-Z0-9]{24,}'
PATTERNS["Stripe Test Key"]='sk_test_[a-zA-Z0-9]{24,}'
PATTERNS["JWT Token"]='eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}'
PATTERNS["Bearer Token"]='Bearer [a-zA-Z0-9._\-]{20,}'
PATTERNS["Generic Password"]='[Pp][Aa][Ss][Ss][Ww][Oo][Rr][Dd]\s*[=:]\s*[^${\s"'"'"'][^\s"'"'"']{5,}'
PATTERNS["Generic Secret"]='[Ss][Ee][Cc][Rr][Ee][Tt]\s*[=:]\s*[^${\s"'"'"'][^\s"'"'"']{5,}'
PATTERNS["Anthropic API Key"]='sk-ant-[a-zA-Z0-9_-]{20,}'
PATTERNS["Slack Token"]='xox[baprs]-[a-zA-Z0-9-]{10,}'
PATTERNS["Twilio Auth Token"]='SK[a-fA-F0-9]{32}'
PATTERNS["Google API Key"]='AIza[a-zA-Z0-9_-]{35}'
PATTERNS["Private Key Header"]='-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'

FOUND_SECRETS=()
FOUND_TYPES=()

for SECRET_TYPE in "${!PATTERNS[@]}"; do
  PATTERN="${PATTERNS[$SECRET_TYPE]}"

  # Process line by line to allow skipping safe lines
  while IFS= read -r LINE; do
    # Skip comment lines
    [[ "$LINE" =~ ^[[:space:]]*# ]] && continue
    # Skip lines that only reference env vars (e.g., $SECRET or ${SECRET})
    [[ "$LINE" =~ ^\s*[A-Z_]+=\$\{ ]] && continue
    [[ "$LINE" =~ ^\s*[A-Z_]+=\$ ]] && continue
    # Skip lines with os.environ / process.env / getenv references
    [[ "$LINE" =~ (os\.environ|process\.env|getenv|env\.) ]] && continue
    # Skip lines that are clearly variable references for substitution
    [[ "$LINE" =~ \$\{?[A-Z_]+\}? ]] && continue

    if echo "$LINE" | grep -qE "$PATTERN" 2> /dev/null; then
      FOUND_SECRETS+=("$LINE")
      FOUND_TYPES+=("$SECRET_TYPE")
      break # One hit per pattern type is enough
    fi
  done <<< "$SCAN_TEXT"
done

# =============================================================================
# Also check for .env files being echoed/cated to stdout
# =============================================================================
if echo "$COMMAND" | grep -qE '(cat|echo|print|type)\s+.*\.env(\s|$)' 2> /dev/null; then
  if ! echo "$COMMAND" | grep -q '\.env\.example'; then
    FOUND_SECRETS+=("Potential .env file exposure")
    FOUND_TYPES+=(".env File Read")
  fi
fi

# =============================================================================
# Report & block if secrets found
# =============================================================================
if [[ ${#FOUND_SECRETS[@]} -gt 0 ]]; then
  echo -e "\n${RED}${BOLD}🚨 SECRET SCANNER: BLOCKED${RESET}" >&2
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
  echo -e "${YELLOW}Potential credentials detected in this operation:${RESET}" >&2
  echo "" >&2

  for i in "${!FOUND_TYPES[@]}"; do
    echo -e "  ${RED}✗${RESET} ${BOLD}${FOUND_TYPES[$i]}${RESET}" >&2
    # Redact the actual secret in output (show first 4 chars only)
    REDACTED="$(echo "${FOUND_SECRETS[$i]}" | sed 's/\(.\{4\}\).*/\1[REDACTED]/')"
    echo -e "    ${CYAN}→ ${REDACTED}${RESET}" >&2
  done

  echo "" >&2
  echo -e "${YELLOW}${BOLD}To fix:${RESET}" >&2
  echo -e "  1. Use environment variables: \$SECRET_NAME" >&2
  echo -e "  2. Reference .env file (never echo its contents)" >&2
  echo -e "  3. Use a secrets manager (AWS Secrets Manager, Vault, etc.)" >&2
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
  echo "" >&2

  # Exit 2 to block the operation
  exit 2
fi

exit 0
