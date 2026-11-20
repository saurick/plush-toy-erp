#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
exec node "$ROOT_DIR/scripts/qa/db-guard.mjs" "$@"
