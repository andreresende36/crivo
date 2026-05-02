#!/usr/bin/env bash
# =============================================================================
# 05-test-gate.sh — Test Suite Gate (Stop Hook)
# =============================================================================
# Type:    Stop hook — prevents Claude from finishing if tests are failing
# Purpose: Auto-detects test framework, runs the test suite, and blocks
#          session close if any tests are failing. Skips silently if no
#          test files exist in the project.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "Stop": [
#       {
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/05-test-gate.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = OK (tests pass, or no tests found)
#   2 = Block (tests failing)
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

PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"

echo -e "\n${BLUE}${BOLD}🧪 TEST GATE — Checking test suite...${RESET}" >&2

# =============================================================================
# STEP 1: Detect if any test files exist
# =============================================================================
HAS_TESTS=false
TEST_FILES=()

# Check common test locations
while IFS= read -r -d '' FILE; do
  TEST_FILES+=("$FILE")
  HAS_TESTS=true
done < <(find "$PROJECT_ROOT" \
  \( -path "*/node_modules" -o -path "*/.git" -o -path "*/dist" -o -path "*/build" -o -path "*/.next" \) -prune \
  -o \( \
  -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.test.js" \
  -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.spec.js" \
  -o -name "*.test.py" -o -name "*.spec.py" \
  \) -print0 2> /dev/null)

# Also check test directories
for TEST_DIR in "test" "tests" "__tests__" "spec"; do
  if [[ -d "${PROJECT_ROOT}/${TEST_DIR}" ]]; then
    HAS_TESTS=true
  fi
done

if [[ "$HAS_TESTS" == "false" ]]; then
  echo -e "  ${DIM}No test files found — skipping test gate${RESET}" >&2
  exit 0
fi

echo -e "  ${DIM}Found ${#TEST_FILES[@]} test file(s)${RESET}" >&2

# =============================================================================
# STEP 2: Detect test framework and command
# =============================================================================
TEST_CMD=""
TEST_FRAMEWORK=""
PKG_JSON="${PROJECT_ROOT}/package.json"
PYPROJECT="${PROJECT_ROOT}/pyproject.toml"
SETUP_PY="${PROJECT_ROOT}/setup.py"

# Check package.json for JS/TS projects
if [[ -f "$PKG_JSON" ]]; then
  # Check for test script in package.json
  if command -v jq &> /dev/null; then
    PKG_TEST="$(jq -r '.scripts.test // ""' "$PKG_JSON" 2> /dev/null)"
    HAS_VITEST="$(jq -r '.devDependencies.vitest // .dependencies.vitest // ""' "$PKG_JSON" 2> /dev/null)"
    HAS_JEST="$(jq -r '.devDependencies.jest // .dependencies.jest // ""' "$PKG_JSON" 2> /dev/null)"
  else
    PKG_TEST="$(grep -o '"test":\s*"[^"]*"' "$PKG_JSON" | cut -d'"' -f4 || true)"
    HAS_VITEST="$(grep -q '"vitest"' "$PKG_JSON" && echo "yes" || true)"
    HAS_JEST="$(grep -q '"jest"' "$PKG_JSON" && echo "yes" || true)"
  fi

  if [[ -n "$HAS_VITEST" && "$HAS_VITEST" != "null" && "$HAS_VITEST" != "" ]]; then
    TEST_CMD="npx vitest run --reporter=verbose"
    TEST_FRAMEWORK="Vitest"
  elif [[ -n "$HAS_JEST" && "$HAS_JEST" != "null" && "$HAS_JEST" != "" ]]; then
    TEST_CMD="npx jest --no-coverage"
    TEST_FRAMEWORK="Jest"
  elif command -v bun &> /dev/null && [[ -f "${PROJECT_ROOT}/bun.lockb" ]]; then
    TEST_CMD="bun test"
    TEST_FRAMEWORK="Bun Test"
  elif [[ -n "$PKG_TEST" && "$PKG_TEST" != "null" && "$PKG_TEST" != "" && "$PKG_TEST" != "echo \"Error: no test specified\"" ]]; then
    TEST_CMD="npm test -- --passWithNoTests 2>/dev/null || npm test"
    TEST_FRAMEWORK="npm test"
  fi
fi

# Check for Python test frameworks
if [[ -z "$TEST_CMD" ]]; then
  if [[ -f "$PYPROJECT" ]]; then
    if grep -q "pytest" "$PYPROJECT" 2> /dev/null; then
      if command -v uv &> /dev/null && [[ -f "$PROJECT_ROOT/uv.lock" ]]; then
        if [[ -f "$PROJECT_ROOT/.env" ]]; then
          TEST_CMD="uv run --env-file .env pytest -v --tb=short"
        else
          TEST_CMD="uv run pytest -v --tb=short"
        fi
        TEST_FRAMEWORK="pytest"
      else
        TEST_CMD="python -m pytest -v --tb=short"
        TEST_FRAMEWORK="pytest"
      fi
    fi
  elif [[ -f "$SETUP_PY" ]] || find "$PROJECT_ROOT" -maxdepth 3 -name "test_*.py" -o -name "*_test.py" | grep -q . 2> /dev/null; then
    if command -v pytest &> /dev/null; then
      TEST_CMD="pytest -v --tb=short"
      TEST_FRAMEWORK="pytest"
    elif command -v python3 &> /dev/null; then
      TEST_CMD="python3 -m pytest -v --tb=short"
      TEST_FRAMEWORK="pytest (python3)"
    fi
  fi
fi

# Final fallback — try common commands
if [[ -z "$TEST_CMD" ]]; then
  if command -v npx &> /dev/null; then
    # Try to detect by checking what's installed
    if npx --yes vitest --version &> /dev/null 2>&1; then
      TEST_CMD="npx vitest run"
      TEST_FRAMEWORK="Vitest (detected)"
    else
      TEST_CMD="npx jest --passWithNoTests"
      TEST_FRAMEWORK="Jest (fallback)"
    fi
  fi
fi

if [[ -z "$TEST_CMD" ]]; then
  echo -e "  ${YELLOW}⚠ Could not determine test command — skipping test gate${RESET}" >&2
  echo -e "  ${DIM}Hint: Add a test script to package.json or install pytest${RESET}" >&2
  exit 0
fi

# =============================================================================
# STEP 3: Run tests
# =============================================================================
echo -e "  ${CYAN}Framework: ${BOLD}${TEST_FRAMEWORK}${RESET}" >&2
echo -e "  ${DIM}Command: ${TEST_CMD}${RESET}" >&2
echo "" >&2

# Run from project root, capture output and exit code
TEST_OUTPUT="$(cd "$PROJECT_ROOT" && eval "$TEST_CMD" 2>&1)"
TEST_EXIT="$?"

# =============================================================================
# STEP 4: Report results
# =============================================================================
if [[ "$TEST_EXIT" -eq 0 ]]; then
  # Extract pass summary if possible
  PASS_LINE="$(echo "$TEST_OUTPUT" | grep -iE '(passed|passing|✓|tests complete)' | tail -1 || true)"
  echo -e "${GREEN}${BOLD}✅ All tests passing${RESET}" >&2
  [[ -n "$PASS_LINE" ]] && echo -e "  ${DIM}${PASS_LINE}${RESET}" >&2
  echo "" >&2
  exit 0
fi

# Tests failed
FAIL_COUNT="$(echo "$TEST_OUTPUT" | grep -cE '(FAIL|failed|✗|Error|× )' 2> /dev/null || echo "?")"

echo -e "${RED}${BOLD}❌ TEST GATE: Tests Are Failing${RESET}" >&2
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

# Print last 40 lines of test output (most relevant part)
echo "$TEST_OUTPUT" | tail -40 | while IFS= read -r LINE; do
  if echo "$LINE" | grep -qiE '(FAIL|failed|✗|× |Error:)'; then
    echo -e "  ${RED}${LINE}${RESET}" >&2
  elif echo "$LINE" | grep -qiE '(PASS|passed|✓|✔)'; then
    echo -e "  ${GREEN}${LINE}${RESET}" >&2
  else
    echo -e "  ${DIM}${LINE}${RESET}" >&2
  fi
done

echo "" >&2
echo -e "${YELLOW}Fix the failing tests before ending this session.${RESET}" >&2
echo -e "${DIM}Tip: Run '${TEST_CMD}' locally to debug.${RESET}" >&2
echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

exit 2
