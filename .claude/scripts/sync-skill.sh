#!/usr/bin/env bash
# sync-skill.sh — mirror the initial-setup skill source + inject canonical
# project sources into ~/.claude/skills/initial-setup/.
#
# Run from anywhere. Idempotent. Uses rsync; fails loudly on errors.

set -euo pipefail

# --- Resolve repo root (script lives in .claude/scripts/) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SKILL_SRC="$REPO_ROOT/.claude/skills/initial-setup"
SKILL_DST="$HOME/.claude/skills/initial-setup"

# --- Colors ---
if [ -t 1 ]; then
  C_BOLD=$'\e[1m'; C_DIM=$'\e[2m'; C_GREEN=$'\e[32m'; C_RED=$'\e[31m'; C_RESET=$'\e[0m'
else
  C_BOLD=""; C_DIM=""; C_GREEN=""; C_RED=""; C_RESET=""
fi

info() { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
err()  { printf '%sERROR%s %s\n' "$C_RED" "$C_RESET" "$1" >&2; }

# --- Sanity ---
command -v rsync >/dev/null 2>&1 || { err "rsync not found (install it and retry)"; exit 127; }
[ -d "$SKILL_SRC" ]           || { err "skill source not found at $SKILL_SRC"; exit 1; }
[ -d "$REPO_ROOT/.claude" ]   || { err "repo root misdetected: $REPO_ROOT"; exit 1; }
[ -f "$REPO_ROOT/CLAUDE.md" ] || { err "missing $REPO_ROOT/CLAUDE.md"; exit 1; }

printf '%s→ initial-setup sync%s\n' "$C_BOLD" "$C_RESET"
printf '%s  source: %s%s\n' "$C_DIM" "$SKILL_SRC" "$C_RESET"
printf '%s  dest:   %s%s\n\n' "$C_DIM" "$SKILL_DST" "$C_RESET"

mkdir -p "$SKILL_DST/assets"

# --- Step 1: mirror skill source (everything except injection targets) ---
# Injection targets are created/filled in Step 2-4; excluding them here lets
# --delete prune stale entries without clobbering injected content.
INJECT_EXCLUDES=(
  "--exclude=/assets/CLAUDE.base.md"
  "--exclude=/assets/gitignore.base"
  "--exclude=/assets/package.json.template"
  "--exclude=/assets/inbox/"     "--exclude=/assets/inbox"
  "--exclude=/assets/context/"   "--exclude=/assets/context"
  "--exclude=/assets/templates/" "--exclude=/assets/templates"
  "--exclude=/assets/mcp-servers/" "--exclude=/assets/mcp-servers"
  "--exclude=/assets/commands/"  "--exclude=/assets/commands"
  "--exclude=/assets/hooks/"     "--exclude=/assets/hooks"
  "--exclude=/assets/scripts/"   "--exclude=/assets/scripts"
  "--exclude=/assets/skills/"    "--exclude=/assets/skills"
)
rsync -a --delete "${INJECT_EXCLUDES[@]}" "$SKILL_SRC/" "$SKILL_DST/"
info "mirrored skill source (SKILL.md, README.md, annexes, gitignore-snippets, readme-template, catalogs)"

# --- Step 2: inject canonical single-file assets ---
cp -f "$REPO_ROOT/CLAUDE.md"     "$SKILL_DST/assets/CLAUDE.base.md"
cp -f "$REPO_ROOT/.gitignore"    "$SKILL_DST/assets/gitignore.base"
cp -f "$REPO_ROOT/package.json"  "$SKILL_DST/assets/package.json.template"
info "injected CLAUDE.base.md · gitignore.base · package.json.template"

# --- Step 3: inject canonical directory sources ---
mkdir -p "$SKILL_DST/assets/inbox"
for dir in context templates mcp-servers commands hooks scripts; do
  if [ -d "$REPO_ROOT/.claude/$dir" ]; then
    mkdir -p "$SKILL_DST/assets/$dir"
    rsync -a --delete "$REPO_ROOT/.claude/$dir/" "$SKILL_DST/assets/$dir/"
    info "assets/$dir"
  else
    printf '  %s· skipping assets/%s (source missing)%s\n' "$C_DIM" "$dir" "$C_RESET"
  fi
done

# --- Step 4: inject skills (exclude initial-setup itself) ---
mkdir -p "$SKILL_DST/assets/skills"
rsync -a --delete \
  --exclude='initial-setup/' --exclude='initial-setup' \
  "$REPO_ROOT/.claude/skills/" "$SKILL_DST/assets/skills/"
info "assets/skills (excluded initial-setup self)"

printf '\n%s✅ Sync complete%s → %s\n' "$C_GREEN" "$C_RESET" "$SKILL_DST"
printf '   Invoke in any project with: %s/initial-setup%s\n' "$C_BOLD" "$C_RESET"
