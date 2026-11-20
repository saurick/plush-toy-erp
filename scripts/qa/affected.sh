#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:affected] 未找到 node，请先安装 Node.js" >&2
  exit 1
fi

source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"

exec node "$ROOT_DIR/scripts/qa/affected.mjs" "$@"
