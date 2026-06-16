#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/strict.sh

作用:
  执行严格质量检查（warning 也视为失败）

检查内容:
  1) db-guard + secrets
  2) phase-label-boundaries
  3) core-boundary
  4) industry-template-boundaries
  5) private-deployment-boundaries
  6) deployment-package-lint
  7) release-evidence-gate
  8) customer-config-boundaries
  9) customer-import-tooling
  10) trial-simulated-data
  11) operational-fact-simulated-closure
  12) mobile-workflow-simulated-closure
  13) mvp-closure
  14) industry-template-closure
  15) private-deployment-package-closure
  16) shellcheck + shfmt（可选）
  17) govulncheck（可选）
  18) web: eslint --max-warnings=0 + stylelint --max-warnings=0 + (可选 test) + build
  19) server: go test ./... + make build

环境变量:
  SKIP_DB_GUARD=1           跳过 DB 守卫
  SKIP_SECRETS_SCAN=1       跳过密钥扫描
  SECRETS_STRICT=1          secrets 命中时阻断
  STRICT_SKIP_SHELLCHECK=1  跳过 shellcheck
  STRICT_SKIP_SHFMT=1       跳过 shfmt
  STRICT_SKIP_GOVULNCHECK=1 跳过 govulncheck
  QA_BASE_RANGE=...         指定 diff 范围供 db-guard/secrets 使用
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:strict] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 pnpm，请先安装 pnpm"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 go，请先安装 Go"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/db-guard.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/db-guard.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/secrets.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/secrets.sh"
fi

if [ -f "$ROOT_DIR/scripts/qa/core-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行 core 边界测试"
  node --test "$ROOT_DIR/scripts/qa/core-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs" ]; then
  echo "[qa:strict] 运行活跃路径 Phase 标签边界检查"
  node "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs" ]; then
  echo "[qa:strict] 运行行业模板候选边界检查"
  node "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs" ]; then
  echo "[qa:strict] 运行多客户私有化复制边界检查"
  node "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" ]; then
  echo "[qa:strict] 运行客户私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs" ]; then
  echo "[qa:strict] 运行客户私有化部署资料包检查测试"
  node --test "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs" ]; then
  echo "[qa:strict] 运行 yoyoosun 发布证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs" ]; then
  echo "[qa:strict] 运行客户配置草案边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"
fi

if ls "$ROOT_DIR"/scripts/import/*.test.mjs >/dev/null 2>&1; then
  echo "[qa:strict] 运行客户导入工具测试"
  for test_file in "$ROOT_DIR"/scripts/import/*.test.mjs; do
    node --test "$test_file"
  done
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs" ]; then
  echo "[qa:strict] 运行试用模拟数据工具测试"
  node --test "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs" ]; then
  echo "[qa:strict] 运行 业务事实模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs" ]; then
  echo "[qa:strict] 运行岗位任务端模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs" ]; then
  echo "[qa:strict] 运行 ERP MVP 闭环验收工具测试"
  node --test "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs" ]; then
  echo "[qa:strict] 运行行业模板模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs" ]; then
  echo "[qa:strict] 运行多客户私有化复制模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs"
fi

if [[ "${STRICT_SKIP_SHELLCHECK:-0}" != "1" ]] && [ -x "$ROOT_DIR/scripts/qa/shellcheck.sh" ]; then
  SHELLCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/shellcheck.sh"
fi

if [[ "${STRICT_SKIP_SHFMT:-0}" != "1" ]] && [ -x "$ROOT_DIR/scripts/qa/shfmt.sh" ]; then
  SHFMT_STRICT=1 SHFMT_CHECK=1 bash "$ROOT_DIR/scripts/qa/shfmt.sh"
fi

if [[ "${STRICT_SKIP_GOVULNCHECK:-0}" != "1" ]] && [ -x "$ROOT_DIR/scripts/qa/govulncheck.sh" ]; then
  GOVULNCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/govulncheck.sh"
fi

echo "[qa:strict] 运行 web 严格检查"
(
  cd "$ROOT_DIR/web"
  pnpm exec eslint --max-warnings=0 --ext .js --ext .jsx src/
  pnpm exec stylelint "src/**/*.{css,scss,sass}" --max-warnings=0

  # 兼容仓库差异：只有定义了 test 脚本才执行前端测试。
  if node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg.scripts&&pkg.scripts.test?0:1)"; then
    pnpm test
  else
    echo "[qa:strict] web/package.json 未定义 test，跳过前端测试"
  fi

  pnpm build
)

echo "[qa:strict] 运行 server 严格检查"
(
  cd "$ROOT_DIR/server"
  go test ./...
  make build
)

echo "[qa:strict] 全部通过"
