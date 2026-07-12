#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/fast.sh

作用:
  执行开发期高频快速检查

检查内容:
  agents-size: AGENTS.md 体积预警与阻断
  error-code-sync: 前端生成错误码同步检查
  error-codes: 统一错误码魔法数字检查
  affected-planner: 按改动影响面选择测试的映射、保守升级和 full 兜底测试
  phase-label-boundaries: 活跃实现路径禁止使用编号 Phase 标签
  core-boundary: server/internal/core 纯领域规则边界检查
  workflow-fact-boundary: Workflow 运行时禁止直接写领域事实
  workflow-ui-action-boundary: 正式前端任务动作禁止绕过 action 合同
  formal-frontend-customer-config-boundary: 正式前端客户配置只能消费 get_effective_session 投影
  customer-config-effective-session-probe: 无凭据 get_effective_session 探针边界测试，不证明 active revision
  admin-profile-sync: 前端菜单投影、sync failure 和 super admin 诊断边界
  frontend-role-menu-seed-contracts: 角色菜单、岗位入口、seedData 和前端状态配置合同
  dev-entry-config-contracts: /__dev 导航、测试入口、文档、原型、台账、客户配置和打印模板配置合同
  trial-role-entry-docs: 试用账号、岗位任务端路径和 README 口径覆盖当前角色集合
  trial-account-rbac: 试用账号真实 RBAC 无后端单测 + 浏览器 smoke 输入模板边界测试，不执行真实登录
  real-login-smoke-shared: 真实登录 smoke 共享 URL 凭据边界单测，不执行真实登录
  mobile-auth-login-route-smoke: 岗位任务端认证回跳 smoke 输入模板和 URL 凭据边界单测，不启动浏览器
  purchase-receipt-real-write-browser-e2e: 采购入库真实写入浏览器 e2e 输入模板和持久测试数据确认边界，不启动浏览器
  sales-order-field-chain-boundary: 销售订单列表 / 导出 / 打印字段边界一致性
  dev-entry-boundary: /__dev、测试入口和客户配置预检控制台边界
  frontend-error-message-boundary: 正式前端错误提示禁止透传底层 message
  docs-inventory: 当前维护 Markdown 必须登记到 docs/文档清单.md
  industry-template-boundaries: 行业模板候选边界检查
  private-deployment-boundaries: 多客户私有化复制边界检查
  customer-web-config-overlay: 客户前端配置 overlay 脚本测试
  deployment-package-lint: 客户私有化部署资料包结构和敏感文件检查
  run-smoke-script: smoke 脚本 CLI、输入模板和 release gate 兼容报告测试
  collect-evidence-script: release evidence 草稿目录结构和 backup restore artifact 占位测试
  image-digests-evidence: image-digests.txt 生成器和 release evidence digest 一致性测试
  immutable-version-evidence: release evidence 不可变版本字段和 image digest artifact 写入测试
  release-evidence-gate: yoyoosun 发布证据门禁工具测试
  release-evidence-closeout-plan: release evidence next actions 执行前置条件检查测试
  release-evidence-closeout-runner: release evidence next actions 受控执行入口测试
  production-preflight: 生产发布 preflight 配置和低配部署边界测试
  backup-restore-rehearsal-script: 备份恢复演练脚本 CLI、安全防呆和 evidence 字段测试
  rollback-rehearsal-report: 回滚 / 前向修复演练报告生成器测试
  customer-config-manifest-evidence: 客户配置 manifest fingerprint evidence 生成器测试
  customer-config-activation-gate: 客户配置激活前 manifest + release evidence 门禁
  customer-config-release-execute: 客户配置 JSON-RPC 发布 / 激活执行器测试
  customer-config-release-readiness: 客户配置发布就绪聚合门禁和输入模板测试
  customer-config-boundaries: 客户配置草案边界检查
  customer-package-lint: 客户配置包结构、流程预览和禁止项检查
  customer-package-preview-boundary: 客户配置包 preview-only 流程边界测试
  customer-config-runtime-manifest: 客户配置运行时 manifest 编译和门禁检查
  customer-import-tooling: 客户来源 manifest / extract / freeze / dry-run 测试
  test-data-isolation-boundary: 测试业务数据隔离边界守卫
  trial-simulated-data: 试用模拟数据工具测试
  operational-fact-simulated-closure: 业务事实模拟闭环工具测试
  mobile-workflow-simulated-closure: 岗位任务端模拟闭环工具测试
  mobile-workflow-runtime-browser-smoke: 岗位任务端真实浏览器模拟任务回归边界测试
  purchase-receipt-real-write-e2e: 采购入库服务层真实写入 e2e 输入模板边界测试，不运行 Go 测试
  mvp-closure: ERP MVP 闭环验收工具测试
  industry-template-closure: 行业模板模拟闭环工具测试
  private-deployment-package-closure: 多客户私有化复制模拟闭环工具测试
  web: pnpm lint -> pnpm css
  server: go test ./internal/... ./pkg/...（存在即测）

环境变量:
  SKIP_DB_GUARD=1  跳过 DB 迁移守卫
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:fast] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/qa/agents-size.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 node，请先安装 Node.js"
  exit 1
fi

source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 go，请先安装 Go"
  exit 1
fi

if [ -x "$ROOT_DIR/scripts/qa/db-guard.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/db-guard.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-code-sync.sh" ]; then
  bash "$ROOT_DIR/scripts/qa/error-code-sync.sh"
fi

if [ -x "$ROOT_DIR/scripts/qa/error-codes.sh" ]; then
  # 先拦截错误码魔法数字，避免在明显违规代码上继续跑后续检查。
  echo "[qa:fast] 运行错误码魔法数字检查"
  bash "$ROOT_DIR/scripts/qa/error-codes.sh"
fi

if [ -f "$ROOT_DIR/scripts/qa/affected.test.mjs" ]; then
  echo "[qa:fast] 运行受影响测试选择器合同测试"
  node --test "$ROOT_DIR/scripts/qa/affected.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/core-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行 core 边界测试"
  node --test "$ROOT_DIR/scripts/qa/core-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/workflow-fact-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行 Workflow / Fact 边界测试"
  node --test "$ROOT_DIR/scripts/qa/workflow-fact-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/workflow-ui-action-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行 Workflow UI action 边界测试"
  node --test "$ROOT_DIR/scripts/qa/workflow-ui-action-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/formal-frontend-customer-config-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行正式前端客户配置投影边界测试"
  node --test "$ROOT_DIR/scripts/qa/formal-frontend-customer-config-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.mjs" ]; then
  if [ -f "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.test.mjs" ]; then
    echo "[qa:fast] 运行客户配置 effective session 无凭据探针边界测试"
    node --test "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.test.mjs"
  fi
  echo "[qa:fast] 运行客户配置 effective session 无凭据探针语法检查"
  node --check "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs" ]; then
  echo "[qa:fast] 运行前端菜单投影同步边界测试"
  node --test "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs" ]; then
  echo "[qa:fast] 运行角色菜单与入口配置合同测试"
  node --test \
    "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/menuPermissions.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/seedData.test.mjs" \
    "$ROOT_DIR/web/src/erp/config/workflowStatus.test.mjs"
fi

if [ -f "$ROOT_DIR/web/src/erp/config/devTesting.test.mjs" ]; then
  echo "[qa:fast] 运行开发入口配置合同测试"
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
  echo "[qa:fast] 运行试用角色入口文档边界测试"
  node --test "$ROOT_DIR/scripts/qa/trial-role-entry-docs.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-account-rbac.mjs" ]; then
  if [ -f "$ROOT_DIR/scripts/qa/trial-account-rbac.test.mjs" ]; then
    echo "[qa:fast] 运行试用账号 RBAC 边界单测"
    node --test "$ROOT_DIR/scripts/qa/trial-account-rbac.test.mjs"
  fi
  echo "[qa:fast] 运行试用账号 RBAC 脚本语法检查"
  node --check "$ROOT_DIR/scripts/qa/trial-account-rbac.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.mjs" ]; then
  if [ -f "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs" ]; then
    echo "[qa:fast] 运行试用账号浏览器 smoke 输入模板边界测试"
    node --test "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs"
  fi
  echo "[qa:fast] 运行试用账号浏览器 smoke 脚本语法检查"
  node --check "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs" ]; then
  echo "[qa:fast] 运行真实登录 smoke 共享 URL 边界测试"
  node --test "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs" ]; then
  echo "[qa:fast] 运行岗位任务端认证回跳 smoke 边界测试"
  node --test "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs"
fi

if [ -f "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs" ]; then
  echo "[qa:fast] 运行采购入库真实写入浏览器 e2e 边界测试"
  node --test "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/sales-order-field-chain-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行销售订单字段链路边界测试"
  node --test "$ROOT_DIR/scripts/qa/sales-order-field-chain-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/dev-entry-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行开发验收入口边界测试"
  node --test "$ROOT_DIR/scripts/qa/dev-entry-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/frontend-error-message-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行正式前端错误提示边界测试"
  node --test "$ROOT_DIR/scripts/qa/frontend-error-message-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/docs-inventory.test.mjs" ]; then
  echo "[qa:fast] 运行文档清单登记测试"
  node --test "$ROOT_DIR/scripts/qa/docs-inventory.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs" ]; then
  echo "[qa:fast] 运行活跃路径 Phase 标签边界检查"
  node "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs" ]; then
  echo "[qa:fast] 运行行业模板候选边界检查"
  node "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs" ]; then
  echo "[qa:fast] 运行多客户私有化复制边界检查"
  node "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/build/apply-customer-web-config.test.mjs" ]; then
  echo "[qa:fast] 运行客户前端配置 overlay 脚本测试"
  node --test "$ROOT_DIR/scripts/build/apply-customer-web-config.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" ]; then
  echo "[qa:fast] 运行客户私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
fi

if [ -f "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs" ]; then
  echo "[qa:fast] 运行客户私有化部署资料包检查测试"
  node --test "$ROOT_DIR/scripts/deploy/deployment-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/run-smoke-script.test.mjs" ]; then
  echo "[qa:fast] 运行 smoke 脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/run-smoke-script.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/collect-evidence-script.test.mjs" ]; then
  echo "[qa:fast] 运行 release evidence 草稿生成脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/collect-evidence-script.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/image-digests-evidence.test.mjs" ]; then
  echo "[qa:fast] 运行 image digest evidence 生成器测试"
  node --test "$ROOT_DIR/scripts/deploy/image-digests-evidence.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/immutable-version-evidence.test.mjs" ]; then
  echo "[qa:fast] 运行 immutable version evidence 写入器测试"
  node --test "$ROOT_DIR/scripts/deploy/immutable-version-evidence.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs" ]; then
  echo "[qa:fast] 运行 yoyoosun 发布证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-status.test.mjs" ]; then
  echo "[qa:fast] 运行 release evidence 状态检查脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-status.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-closeout-plan.test.mjs" ]; then
  echo "[qa:fast] 运行 release evidence closeout plan 测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-closeout-plan.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/release-evidence-closeout-runner.test.mjs" ]; then
  echo "[qa:fast] 运行 release evidence closeout runner 测试"
  node --test "$ROOT_DIR/scripts/deploy/release-evidence-closeout-runner.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/production-preflight.test.mjs" ]; then
  echo "[qa:fast] 运行生产发布 preflight 测试"
  node --test "$ROOT_DIR/scripts/deploy/production-preflight.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/migrate-online.test.mjs" ]; then
  echo "[qa:fast] 运行线上 migration 整段串行锁测试"
  node --test "$ROOT_DIR/scripts/deploy/migrate-online.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/backup-restore-rehearsal-script.test.mjs" ]; then
  echo "[qa:fast] 运行备份恢复演练脚本测试"
  node --test "$ROOT_DIR/scripts/deploy/backup-restore-rehearsal-script.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/rollback-rehearsal-report.test.mjs" ]; then
  echo "[qa:fast] 运行回滚演练报告生成器测试"
  node --test "$ROOT_DIR/scripts/deploy/rollback-rehearsal-report.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-manifest-evidence.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置 manifest evidence 生成器测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-manifest-evidence.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-activation-gate.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置激活证据门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-activation-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-release-execute.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置发布执行器测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-release-execute.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/deploy/customer-config-release-readiness.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置发布就绪聚合门禁测试"
  node --test "$ROOT_DIR/scripts/deploy/customer-config-release-readiness.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs" ]; then
  echo "[qa:fast] 运行客户配置草案边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" ]; then
  echo "[qa:fast] 运行客户配置包结构检查"
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo --mode compile
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun --mode compile
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-lint.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置包结构检查测试"
  node --test "$ROOT_DIR/scripts/qa/customer-package-lint.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-package-preview-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置包 preview-only 边界测试"
  node --test "$ROOT_DIR/scripts/qa/customer-package-preview-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" ]; then
  echo "[qa:fast] 运行客户配置运行时 manifest 检查"
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer demo
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer demo --mode compile
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --customer yoyoosun --mode compile
fi

if [ -f "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.test.mjs" ]; then
  echo "[qa:fast] 运行客户配置运行时 manifest 测试"
  node --test "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.test.mjs"
fi

if ls "$ROOT_DIR"/scripts/import/*.test.mjs >/dev/null 2>&1; then
  echo "[qa:fast] 运行客户导入工具测试"
  for test_file in "$ROOT_DIR"/scripts/import/*.test.mjs; do
    node --test "$test_file"
  done
fi

if [ -f "$ROOT_DIR/scripts/qa/test-data-isolation-boundary.test.mjs" ]; then
  echo "[qa:fast] 运行测试业务数据隔离边界守卫"
  node --test "$ROOT_DIR/scripts/qa/test-data-isolation-boundary.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs" ]; then
  echo "[qa:fast] 运行试用模拟数据工具测试"
  node --test "$ROOT_DIR/scripts/qa/trial-simulated-data.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs" ]; then
  echo "[qa:fast] 运行 业务事实模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/operational-fact-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs" ]; then
  echo "[qa:fast] 运行岗位任务端模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/mobile-workflow-simulated-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs" ]; then
  echo "[qa:fast] 运行岗位任务端真实浏览器模拟任务回归边界测试"
  node --test "$ROOT_DIR/scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/purchase-receipt-real-write-e2e.test.mjs" ]; then
  echo "[qa:fast] 运行采购入库服务层真实写入 e2e 边界测试"
  node --test "$ROOT_DIR/scripts/qa/purchase-receipt-real-write-e2e.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/critical-postgres-gate.test.mjs" ]; then
  echo "[qa:fast] 运行 PostgreSQL 关键事务门禁合同测试"
  node --test "$ROOT_DIR/scripts/qa/critical-postgres-gate.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs" ]; then
  echo "[qa:fast] 运行 ERP MVP 闭环验收工具测试"
  node --test "$ROOT_DIR/scripts/qa/mvp-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs" ]; then
  echo "[qa:fast] 运行行业模板模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/industry-template-closure.test.mjs"
fi

if [ -f "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs" ]; then
  echo "[qa:fast] 运行多客户私有化复制模拟闭环工具测试"
  node --test "$ROOT_DIR/scripts/qa/private-deployment-package-closure.test.mjs"
fi

echo "[qa:fast] 运行 web 快速检查"
(
  cd "$ROOT_DIR/web"
  "$PNPM_BIN" lint
  "$PNPM_BIN" css
)

echo "[qa:fast] 运行 server 快速检查"
(
  cd "$ROOT_DIR/server"
  pkgs=()
  if [ -d internal ]; then
    pkgs+=("./internal/...")
  fi
  if [ -d pkg ]; then
    pkgs+=("./pkg/...")
  fi

  if [ "${#pkgs[@]}" -gt 0 ]; then
    go test "${pkgs[@]}"
  else
    echo "[qa:fast] 未发现 internal/pkg，跳过 Go 测试"
  fi
)

echo "[qa:fast] 完成"
