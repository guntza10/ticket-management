#!/usr/bin/env bash
# PostToolUse hook: enforce clean TypeScript on every edit.
# Reads the tool-call JSON on stdin; when a *.ts/*.tsx file under client/ or
# server/ was edited, runs that workspace's oxlint + tsc. On failure it exits 2
# so the errors are fed back to Claude to fix (the edit itself is not reverted).

set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

# Only TypeScript sources.
case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

# Which workspace does the file belong to? "e2e" and "core" are not npm
# workspaces — the Playwright config, the specs and the shared schemas all live
# at the repo root, gated by root-level scripts.
case "$file" in
  */client/* | client/*) ws=client ;;
  */server/* | server/*) ws=server ;;
  */core/* | core/*) ws=core ;;
  */e2e/* | e2e/* | */playwright.config.ts | playwright.config.ts) ws=e2e ;;
  *) exit 0 ;;
esac

# Repo root: prefer the value Claude Code provides, else derive from the file.
repo="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$repo" ] && cd "$repo" || exit 0

if [ "$ws" = "e2e" ]; then
  out=$(npm run --silent lint:e2e 2>&1 && npm run --silent typecheck:e2e 2>&1)
elif [ "$ws" = "core" ]; then
  # core/ is compiled by *both* workspaces, each with its own compilerOptions,
  # so a change here has to satisfy both — Node-native TS on the server and the
  # bundler on the client. The root oxlint config is the one that lints core
  # itself (client and server are in its ignorePatterns).
  out=$(npm run --silent lint:e2e 2>&1 \
    && npm run --silent typecheck --workspace server 2>&1 \
    && npm run --silent typecheck --workspace client 2>&1)
else
  out=$(npm run --silent lint --workspace "$ws" 2>&1 && npm run --silent typecheck --workspace "$ws" 2>&1)
fi
status=$?

if [ "$status" -ne 0 ]; then
  {
    echo "Clean-TypeScript check failed for '$ws' (edited: $file)."
    echo "Fix the lint/type errors below before continuing:"
    echo "$out"
  } >&2
  exit 2
fi
exit 0
