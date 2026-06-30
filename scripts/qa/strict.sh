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
  4) workflow-fact-boundary
  5) workflow-ui-action-boundary
  6) formal-frontend-customer-config-boundary
  7) multi-client-role-workflow-priority-audit
  8) docs-inventory
  9) industry-template-boundaries
  10) private-deployment-boundaries
  11) customer-web-config-overlay
  12) deployment-package-lint
  13) run-smoke-script
  14) immutable-version-evidence
  15) release-evidence-gate
  16) production-preflight
  17) backup-restore-rehearsal-script
  18) rollback-rehearsal-report
  19) customer-config-manifest-evidence
  20) customer-config-activation-gate
  21) customer-config-release-execute
  22) customer-config-release-readiness
  23) customer-config-boundaries
  24) customer-package-lint
  25) customer-config-runtime-manifest
  26) customer-import-tooling
  27) trial-simulated-data
  28) operational-fact-simulated-closure
  29) mobile-workflow-simulated-closure
  30) mvp-closure
  31) industry-template-closure
  32) private-deployment-package-closure
  33) shellcheck + shfmt（可选）
  34) govulncheck（可选）
  34) web: eslint --max-warnings=0 + stylelint --max-warnings=0 + (可选 test) + build
  35) server: go test ./... + make build

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

if [ -f "$ROOT_DIR/scripts/qa/workflow-fact-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行 Workflow / Fact 边界测试"
  node --test "$ROOT_DIR/scripts/qa/workflow-fact-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/workflow-ui-action-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行 Workflow UI action 边界测试"
  node --test "$ROOT_DIR/scripts/qa/workflow-ui-action-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/formal-frontend-customer-config-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行正式前端客户配置投影边界测试"
  node --test "$ROOT_DIR/scripts/qa/formal-frontend-customer-config-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/multi-client-role-workflow-priority-audit.test.mjs" ]; then
  echo "[qa:strict] 运行多甲方角色能力优先级落地证据审计"
  node --test "$ROOT_DIR/scripts/qa/multi-client-role-workflow-priority-audit.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/docs-inventory.test.mjs" ]; then
  echo "[qa:strict] 运行文档清单登记测试"
  node --test "$ROOT_DIR/scripts/qa/docs-inventory.test.mjs"
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

if [ -f "$ROOT_DIR/scripts/build/apply-customer-web-config.test.mjs" ]; then
  echo "[qa:strict] 运行客户前端配置 overlay 脚本测试"
  node --test "$ROOT_DIR/scripts/build/apply-customer-web-config.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" ]; then
  echo "[qa:strict] 运行客户私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs" ]; then
  echo "[qa:strict] 运行客户私有化部署资料包检查测试"
  node --test "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/run-smoke-script.test.mjs" ]; then
  echo "[qa:strict] 运行 smoke 脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/run-smoke-script.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/immutable-version-evidence.test.mjs" ]; then
  echo "[qa:strict] 运行 immutable version evidence 写入器测试"
  node --test "$ROOT_DIR/scripts/deploy/immutable-version-evidence.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs" ]; then
  echo "[qa:strict] 运行 yoyoosun 发布证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-status.test.mjs" ]; then
  echo "[qa:strict] 运行 release evidence 状态检查脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-status.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/production-preflight.test.mjs" ]; then
  echo "[qa:strict] 运行生产发布 preflight 测试"
  node --test "$ROOT_DIR/scripts/deploy/production-preflight.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/backup-restore-rehearsal-script.test.mjs" ]; then
  echo "[qa:strict] 运行备份恢复演练脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/backup-restore-rehearsal-script.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/rollback-rehearsal-report.test.mjs" ]; then
  echo "[qa:strict] 运行回滚演练报告生成器测试"
  node --test "$ROOT_DIR/scripts/deploy/rollback-rehearsal-report.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-manifest-evidence.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置 manifest evidence 生成器测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-manifest-evidence.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-activation-gate.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置激活证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-activation-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-release-execute.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置发布执行器测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-release-execute.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-release-readiness.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置发布就绪聚合门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-release-readiness.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs" ]; then
  echo "[qa:strict] 运行客户配置草案边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" ]; then
  echo "[qa:strict] 运行客户配置包结构检查"
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo --mode compile
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun --mode compile
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-lint.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置包结构检查测试"
  node --test "$ROOT_DIR/scripts/qa/customer-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" ]; then
  echo "[qa:strict] 运行客户配置运行时 manifest 检查"
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer demo
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer demo --mode compile
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun --mode compile
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.test.mjs" ]; then
  echo "[qa:strict] 运行客户配置运行时 manifest 测试"
  node --test "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.test.mjs"
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
