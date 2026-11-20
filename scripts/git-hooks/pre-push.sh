#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" ]]; then
  echo "[pre-push] status=incomplete reason=missing_receipt_reader"
  exit 1
fi

remote_name="${1:-origin}"
remote_location="${2:-}"
args=(verify-hook --remote "$remote_name")
if [[ -n "$remote_location" ]]; then
  args+=(--remote-location "$remote_location")
fi

# Git 已经打开 receive-pack 连接后才调用本 hook。昂贵 full 必须由
# scripts/qa/prepare-push.sh 在连接建立前完成；这里仅消费真实 stdin，
# 复核短期回执并执行每个实际 push range 的实时门禁。
exec node "$ROOT_DIR/scripts/qa/pre-push-receipt.mjs" "${args[@]}"
