#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" --help
fi

if [[ -n "${DISPOSABLE_DATABASE_BASE_URL:-}" ]]; then
  exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" prepare "$@"
fi

prepare_mode="$(node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" prepare-mode "$@")"
if [[ "$prepare_mode" == "direct" ]]; then
  exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" prepare "$@"
fi
if [[ "$prepare_mode" != "managed" ]]; then
  echo "[qa:prepare-push] status=incomplete reason=invalid_prepare_mode" >&2
  exit 2
fi

operation_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
exec node "$ROOT_DIR/scripts/qa/run-gate-with-managed-database.mjs" \
  --prepare-push \
  --operation-id "$operation_id" \
  "$@"
