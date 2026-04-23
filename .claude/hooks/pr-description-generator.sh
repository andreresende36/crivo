#!/usr/bin/env bash
# =============================================================================
# 08-pr-description-generator.sh — Auto PR Description Generator
# =============================================================================
# Type:    Stop hook — generates a PR description draft when staged changes exist
# Purpose: Before session ends, if there are staged git changes, automatically
#          gathers branch info, changed files, and commit history, then writes
#          a filled PR description template to .claude/pr_draft.md.
#          Non-blocking — always exits 0.
#
# Configure in .claude/settings.json:
# {
#   "hooks": {
#     "Stop": [
#       {
#         "hooks": [{"type": "command", "command": "bash .claude/hooks/08-pr-description-generator.sh"}]
#       }
#     ]
#   }
# }
#
# Exit codes:
#   0 = always (non-blocking)
# =============================================================================

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

PROJECT_ROOT="$(git rev-parse --show-toplevel 2> /dev/null || pwd)"
CLAUDE_DIR="${PROJECT_ROOT}/.claude"

# Verify this is a git repo
if ! git -C "$PROJECT_ROOT" rev-parse HEAD &> /dev/null 2>&1; then
  exit 0
fi

# =============================================================================
# Check for staged changes
# =============================================================================
STAGED_STAT="$(git -C "$PROJECT_ROOT" diff --cached --stat 2> /dev/null || true)"

if [[ -z "$STAGED_STAT" ]]; then
  # No staged changes — check for unstaged but modified files
  UNSTAGED="$(git -C "$PROJECT_ROOT" diff --stat 2> /dev/null || true)"
  if [[ -z "$UNSTAGED" ]]; then
    exit 0
  fi
  # Use unstaged if nothing staged
  STAGED_STAT="$UNSTAGED"
  USING_UNSTAGED=true
else
  USING_UNSTAGED=false
fi

# =============================================================================
# Gather PR context
# =============================================================================
NOW="$(date '+%Y-%m-%d %H:%M:%S')"
BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2> /dev/null || echo "unknown")"

# Changed files list (clean, no summary line)
CHANGED_FILES="$(git -C "$PROJECT_ROOT" diff --cached --name-only 2> /dev/null \
  || git -C "$PROJECT_ROOT" diff --name-only 2> /dev/null || true)"
CHANGED_COUNT="$(echo "$CHANGED_FILES" | grep -c . || echo 0)"

# Find last merge/tag to use as baseline for commit log
LAST_MERGE="$(git -C "$PROJECT_ROOT" log --merges --format="%H" -1 2> /dev/null || true)"
if [[ -n "$LAST_MERGE" ]]; then
  COMMIT_LOG="$(git -C "$PROJECT_ROOT" log --oneline "${LAST_MERGE}..HEAD" 2> /dev/null | head -20 || true)"
else
  COMMIT_LOG="$(git -C "$PROJECT_ROOT" log --oneline -10 2> /dev/null || true)"
fi

# Detect main/master branch name
if git -C "$PROJECT_ROOT" show-ref --quiet refs/heads/main 2> /dev/null; then
  BASE_BRANCH="main"
elif git -C "$PROJECT_ROOT" show-ref --quiet refs/heads/master 2> /dev/null; then
  BASE_BRANCH="master"
else
  BASE_BRANCH="main"
fi

# File type summary (group by extension)
TYPE_SUMMARY="$(echo "$CHANGED_FILES" | grep -v '^$' \
  | sed 's/.*\.//' | sort | uniq -c | sort -rn \
  | awk '{printf "  %s× .%s\n", $1, $2}' | head -8 || true)"

# Detect likely change type from file names
CHANGE_TYPE="chore"
if echo "$CHANGED_FILES" | grep -qiE '(feature|feat|add|new|implement)' 2> /dev/null; then
  CHANGE_TYPE="feat"
elif echo "$CHANGED_FILES" | grep -qiE '(fix|bug|patch|correct)' 2> /dev/null; then
  CHANGE_TYPE="fix"
elif echo "$CHANGED_FILES" | grep -qiE '(test|spec)' 2> /dev/null; then
  CHANGE_TYPE="test"
elif echo "$CHANGED_FILES" | grep -qiE '(doc|readme|changelog|\.md)' 2> /dev/null; then
  CHANGE_TYPE="docs"
elif echo "$CHANGED_FILES" | grep -qiE '(refactor|clean|rename|move)' 2> /dev/null; then
  CHANGE_TYPE="refactor"
fi

# Detect scope from most-changed directory
SCOPE="$(echo "$CHANGED_FILES" | grep -v '^$' \
  | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn \
  | head -1 | awk '{print $2}' | sed 's|.*/||' || echo "")"

# =============================================================================
# Write PR draft
# =============================================================================
mkdir -p "$CLAUDE_DIR"
PR_DRAFT_FILE="${CLAUDE_DIR}/pr_draft.md"

# Conventional commit title suggestion
if [[ -n "$SCOPE" && "$SCOPE" != "." ]]; then
  SUGGESTED_TITLE="${CHANGE_TYPE}(${SCOPE}): <!-- describe what changed -->"
else
  SUGGESTED_TITLE="${CHANGE_TYPE}: <!-- describe what changed -->"
fi

cat > "$PR_DRAFT_FILE" << MARKDOWN
# PR Description (Auto-generated)

> Generated at: ${NOW}
> Branch: \`${BRANCH}\` → \`${BASE_BRANCH}\`
> ${USING_UNSTAGED:+"⚠️  Note: Based on unstaged changes (nothing staged yet)"}

---

## Title

\`\`\`
${SUGGESTED_TITLE}
\`\`\`

## Summary

<!-- TODO: Fill in — what does this PR accomplish? -->

## Changes (${CHANGED_COUNT} files)

\`\`\`
${STAGED_STAT}
\`\`\`

**By file type:**
${TYPE_SUMMARY}

## Detailed File List

\`\`\`
$(echo "$CHANGED_FILES" | head -30)
$([ "$(echo "$CHANGED_FILES" | wc -l)" -gt 30 ] && echo "... and $(($(echo "$CHANGED_FILES" | wc -l) - 30)) more files")
\`\`\`

## Recent Commits

\`\`\`
${COMMIT_LOG:-"(no commits yet)"}
\`\`\`

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Refactoring (no functional changes)
- [ ] Documentation update
- [ ] Tests added or updated
- [ ] Build/CI/CD changes

## Testing

<!-- TODO: Describe how to test this PR -->

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manually tested on: <!-- environment -->

## Screenshots / Demo

<!-- TODO: Add screenshots if UI changes were made -->

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests written/updated
- [ ] No secrets or credentials committed
- [ ] Breaking changes documented

## Related Issues

Closes #<!-- issue number -->

---
*Auto-generated by 08-pr-description-generator.sh (Claude Code hook)*
MARKDOWN

# =============================================================================
# Report
# =============================================================================
echo -e "\n${BLUE}${BOLD}📝 PR DESCRIPTION GENERATOR${RESET}" >&2
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo -e "  ${GREEN}✓ PR draft written to:${RESET} ${DIM}${PR_DRAFT_FILE}${RESET}" >&2
echo -e "  ${CYAN}Branch:${RESET} ${BRANCH} → ${BASE_BRANCH}" >&2
echo -e "  ${CYAN}Files changed:${RESET} ${CHANGED_COUNT}" >&2
if [[ -n "$SCOPE" && "$SCOPE" != "." ]]; then
  echo -e "  ${CYAN}Primary scope:${RESET} ${SCOPE}" >&2
fi
echo "" >&2
echo -e "  ${YELLOW}Open .claude/pr_draft.md, fill in the TODOs, then copy to GitHub/GitLab.${RESET}" >&2
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}" >&2
echo "" >&2

exit 0
