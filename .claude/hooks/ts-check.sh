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

# Which workspace does the file belong to?
case "$file" in
  */client/* | client/*) ws=client ;;
  */server/* | server/*) ws=server ;;
  *) exit 0 ;;
esac

# Repo root: prefer the value Claude Code provides, else derive from the file.
repo="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$repo" ] && cd "$repo" || exit 0

out=$(npm run --silent lint --workspace "$ws" 2>&1 && npm run --silent typecheck --workspace "$ws" 2>&1)
status=$?

if [ "$status" -ne 0 ]; then
  {
    echo "Clean-TypeScript check failed for workspace '$ws' (edited: $file)."
    echo "Fix the lint/type errors below before continuing:"
    echo "$out"
  } >&2
  exit 2
fi
exit 0
