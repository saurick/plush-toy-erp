#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:yoyoosun] 未找到 node，请先安装 Node.js"
  exit 1
fi

echo "[qa:yoyoosun] 运行永绅客户闭环测试"
node --test "$ROOT_DIR/scripts/qa/yoyoosun-customer-closure.test.mjs"

echo "[qa:yoyoosun] 运行永绅发布就绪边界测试"
node --test "$ROOT_DIR/scripts/qa/yoyoosun-release-readiness.test.mjs"

if [ -f "$ROOT_DIR/scripts/qa/customer-package-preview-boundary.test.mjs" ]; then
  echo "[qa:yoyoosun] 运行客户配置包 preview-only 边界测试"
  node --test "$ROOT_DIR/scripts/qa/customer-package-preview-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" ]; then
  echo "[qa:yoyoosun] 运行永绅客户配置包结构检查"
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun --mode compile
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" ]; then
  echo "[qa:yoyoosun] 运行永绅客户配置 runtime manifest 检查"
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun --mode compile
fi

echo "[qa:yoyoosun] 完成"
