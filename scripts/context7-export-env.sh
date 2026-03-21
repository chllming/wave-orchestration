#!/usr/bin/env bash
# Load CONTEXT7_API_KEY from repo-root .env.local, then export it for child processes.
#
# Usage:
#   source scripts/context7-export-env.sh
#     — merges .env.local into the current shell (only CONTEXT7_* vars need to be present;
#       the whole file is sourced with set -a).
#
#   bash scripts/context7-export-env.sh run <command> [args...]
#     — loads .env.local, requires CONTEXT7_API_KEY, exports it, then execs the command.
#
# Examples:
#   pnpm context7:api-check
#   bash scripts/context7-export-env.sh run env | grep CONTEXT7

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ "${1:-}" == "run" ]]; then
  set -euo pipefail
  shift
  if [[ $# -lt 1 ]]; then
    echo "context7-export-env: run requires a command (e.g. bash scripts/context7-export-env.sh run curl ...)" >&2
    exit 1
  fi
  if [[ -z "${CONTEXT7_API_KEY:-}" ]]; then
    echo "context7-export-env: CONTEXT7_API_KEY is not set. Add it to ${ENV_FILE} at repo root." >&2
    exit 1
  fi
  export CONTEXT7_API_KEY
  exec "$@"
fi

# Invoked (not "run"): print hint; sourcing skips this when $0 is bash.
if [[ "${BASH_SOURCE[0]:-}" == "${0:-}" ]]; then
  echo "Usage: source scripts/context7-export-env.sh" >&2
  echo "   or: bash scripts/context7-export-env.sh run <command> [args...]" >&2
  exit 2
fi

# Sourced: export if set so subprocesses (e.g. codex) inherit it.
if [[ -n "${CONTEXT7_API_KEY:-}" ]]; then
  export CONTEXT7_API_KEY
fi
