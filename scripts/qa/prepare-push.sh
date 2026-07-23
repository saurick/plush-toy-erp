#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" --help
fi
exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" prepare "$@"
