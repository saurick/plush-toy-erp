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
  7) customer-config-effective-session-probe（无凭据 get_effective_session 探针边界测试，不执行真实登录）
  8) admin-profile-sync
  9) frontend-role-menu-seed-contracts
  10) dev-entry-config-contracts
  11) trial-role-entry-docs
  12) trial-account-rbac（无后端单测 + 浏览器 smoke 输入模板边界测试，不执行真实登录）
  13) real-login-smoke-shared（真实登录 smoke 共享 URL 凭据边界单测，不执行真实登录）
  14) mobile-auth-login-route-smoke（输入模板 + URL 凭据边界单测，不启动浏览器）
  15) purchase-receipt-real-write-browser-e2e（输入模板 + 持久测试数据确认边界，不启动浏览器）
  16) sales-order-field-chain-boundary
  17) dev-entry-boundary
  18) frontend-error-message-boundary
  19) multi-client-role-workflow-priority-audit
  20) docs-inventory
  21) industry-template-boundaries
  22) private-deployment-boundaries
  23) customer-web-config-overlay
  24) deployment-package-lint
  25) run-smoke-script（CLI + 输入模板 + release gate 兼容报告）
  26) immutable-version-evidence
  27) release-evidence-gate
  28) production-preflight
  29) backup-restore-rehearsal-script
  30) rollback-rehearsal-report
  31) customer-config-manifest-evidence
  32) customer-config-activation-gate
  33) customer-config-release-execute
  34) customer-config-release-readiness（聚合门禁 + 输入模板）
  35) customer-config-boundaries
  36) customer-package-lint
  37) customer-config-runtime-manifest
  38) customer-import-tooling
  39) test-data-isolation-boundary
  40) trial-simulated-data
  41) operational-fact-simulated-closure
  42) mobile-workflow-simulated-closure
  43) mobile-workflow-runtime-browser-smoke
  44) purchase-receipt-real-write-e2e（输入模板边界测试，不运行 Go 测试）
  45) mvp-closure
  46) industry-template-closure
  47) private-deployment-package-closure
  48) shellcheck + shfmt（可选）
  49) govulncheck（可选）
  50) web: eslint --max-warnings=0 + stylelint --max-warnings=0 + (可选 test) + build
  51) server: go test ./... + make build

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

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 node，请先安装 Node.js"
  exit 1
fi

source "$ROOT_DIR/scripts/lib/pnpm.sh"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

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

if [ -f "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.mjs" ]; then
  if [ -f "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.test.mjs" ]; then
    echo "[qa:strict] 运行客户配置 effective session 无凭据探针边界测试"
    node --test "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.test.mjs"
  fi
  echo "[qa:strict] 运行客户配置 effective session 无凭据探针语法检查"
  node --check "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs" ]; then
  echo "[qa:strict] 运行前端菜单投影同步边界测试"
  node --test "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs" ]; then
  echo "[qa:strict] 运行角色菜单与入口配置合同测试"
  node --test \
    "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/menuPermissions.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/seedData.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/workflowStatus.test.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/config/devTesting.test.mjs" ]; then
  echo "[qa:strict] 运行开发入口配置合同测试"
  node --test \
    "$ROOT_DIR/web/src/erp/config/devHub.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devTesting.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devDocs.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devGovernance.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devPrototypes.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devCapabilityLedger.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/devCustomerConfig.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/printTemplates.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-role-entry-docs.test.mjs" ]; then
  echo "[qa:strict] 运行试用角色入口文档边界测试"
  node --test "$ROOT_DIR/scripts/qa/trial-role-entry-docs.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-account-rbac.mjs" ]; then
  if [ -f "$ROOT_DIR/scripts/qa/trial-account-rbac.test.mjs" ]; then
    echo "[qa:strict] 运行试用账号 RBAC 边界单测"
    node --test "$ROOT_DIR/scripts/qa/trial-account-rbac.test.mjs"
  fi
  echo "[qa:strict] 运行试用账号 RBAC 脚本语法检查"
  node --check "$ROOT_DIR/scripts/qa/trial-account-rbac.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.mjs" ]; then
  if [ -f "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs" ]; then
    echo "[qa:strict] 运行试用账号浏览器 smoke 输入模板边界测试"
    node --test "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs"
  fi
  echo "[qa:strict] 运行试用账号浏览器 smoke 脚本语法检查"
  node --check "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs" ]; then
  echo "[qa:strict] 运行真实登录 smoke 共享 URL 边界测试"
  node --test "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs" ]; then
  echo "[qa:strict] 运行岗位任务端认证回跳 smoke 边界测试"
  node --test "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs" ]; then
  echo "[qa:strict] 运行采购入库真实写入浏览器 e2e 边界测试"
  node --test "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/sales-order-field-chain-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行销售订单字段链路边界测试"
  node --test "$ROOT_DIR/scripts/qa/sales-order-field-chain-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/dev-entry-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行开发验收入口边界测试"
  node --test "$ROOT_DIR/scripts/qa/dev-entry-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/frontend-error-message-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行正式前端错误提示边界测试"
  node --test "$ROOT_DIR/scripts/qa/frontend-error-message-boundary.test.mjs"
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

if [ -f "$ROOT_DIR/scripts/qa/test-data-isolation-boundary.test.mjs" ]; then
  echo "[qa:strict] 运行测试业务数据隔离边界守卫"
  node --test "$ROOT_DIR/scripts/qa/test-data-isolation-boundary.test.mjs"
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

if [ -f "$ROOT_DIR/scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs" ]; then
  echo "[qa:strict] 运行岗位任务端真实浏览器模拟任务回归边界测试"
  node --test "$ROOT_DIR/scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/purchase-receipt-real-write-e2e.test.mjs" ]; then
  echo "[qa:strict] 运行采购入库服务层真实写入 e2e 边界测试"
  node --test "$ROOT_DIR/scripts/qa/purchase-receipt-real-write-e2e.test.mjs"
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
  "$PNPM_BIN" exec eslint --max-warnings=0 --ext .js --ext .jsx src/
  "$PNPM_BIN" exec stylelint "src/**/*.{css,scss,sass}" --max-warnings=0

  # 兼容仓库差异：只有定义了 test 脚本才执行前端测试。
  if node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg.scripts&&pkg.scripts.test?0:1)"; then
    "$PNPM_BIN" test
  else
    echo "[qa:strict] web/package.json 未定义 test，跳过前端测试"
  fi

  "$PNPM_BIN" build
)

echo "[qa:strict] 运行 server 严格检查"
(
  cd "$ROOT_DIR/server"
  go test ./...
  make build
)

echo "[qa:strict] 全部通过"
