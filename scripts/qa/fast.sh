#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/fast.sh

作用:
  执行开发期高频检查。scripts/ 下的 Node 测试按显式 fast/database/
  browser/release/resource_sensitive 分组登记；本入口只运行 fast 组。

检查内容:
  repository: AGENTS 体积、DB migration、错误码和项目边界守卫
  scripts: fast 显式测试组 + 关键可执行脚本语法/运行时边界
  web: 关键配置与 smoke 合同测试 -> lint -> css
  server: go test ./internal/... ./pkg/...（存在即测）

边界:
  本入口不接受 SKIP_*；database/browser/release/resource_sensitive 组由
  full/strict 或显式 profile 运行，避免开发期重复执行重型门禁。
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

fast_scope="${QA_FAST_SCOPE:-complete}"
node_test_profile="${QA_NODE_TEST_PROFILE:-fast}"
case "$fast_scope:$node_test_profile" in
complete:fast | base:parallel_safe) ;;
*)
  echo "[qa:fast] status=incomplete reason=invalid_composition scope=$fast_scope node_profile=$node_test_profile"
  exit 2
  ;;
esac

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

# ROOT_DIR pins the shared PostgreSQL contract; ShellCheck scans it separately.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/qa/critical-postgres-tests.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 node，请先安装 Node.js"
  exit 1
fi

# ROOT_DIR pins the repository helper; ShellCheck cannot resolve this dynamic path.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 go，请先安装 Go"
  exit 1
fi

# ROOT_DIR pins the timing helper; ShellCheck cannot resolve this dynamic path.
# shellcheck source=scripts/qa/lib/stage-timing.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/qa/lib/stage-timing.sh"

fast_gate_profile="${QA_FAST_GATE_PROFILE:-}"
case "$fast_gate_profile" in
"" | full | strict) ;;
*)
  echo "[qa:fast] status=incomplete reason=invalid_parent_gate profile=$fast_gate_profile"
  exit 2
  ;;
esac

qa_fast_run() {
  local substep_id="$1"
  shift
  if [[ -n "$fast_gate_profile" ]]; then
    qa_run_substep "$fast_gate_profile" shared "$substep_id" "$@"
  else
    "$@"
  fi
}

qa_fast_repository_guards() {
  bash "$ROOT_DIR/scripts/qa/agents-size.sh"

  echo "[qa:fast] 运行 T0 diff whitespace 检查"
  git diff --check
  git diff --cached --check

  bash "$ROOT_DIR/scripts/qa/db-guard.sh"

  bash "$ROOT_DIR/scripts/qa/error-code-sync.sh"

  echo "[qa:fast] 运行错误码魔法数字检查"
  bash "$ROOT_DIR/scripts/qa/error-codes.sh"
}

qa_fast_node_tests() {
  echo "[qa:fast] 运行 scripts Node 显式测试组 profile=$node_test_profile"
  node "$ROOT_DIR/scripts/qa/run-node-tests.mjs" --profile "$node_test_profile"
}

qa_fast_script_boundaries() {
  echo "[qa:fast] 运行关键脚本语法检查"
  for script in \
    "$ROOT_DIR/scripts/qa/customer-config-effective-session-probe.mjs" \
    "$ROOT_DIR/scripts/qa/trial-account-rbac.mjs" \
    "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.mjs"; do
    node --check "$script"
  done

  echo "[qa:fast] 运行活跃路径阶段编号命名边界检查"
  node "$ROOT_DIR/scripts/qa/phase-label-boundaries.mjs"

  echo "[qa:fast] 运行行业模板候选边界检查"
  node "$ROOT_DIR/scripts/qa/industry-template-boundaries.mjs"

  echo "[qa:fast] 运行多客户私有化复制边界检查"
  node "$ROOT_DIR/scripts/qa/private-deployment-boundaries.mjs"

  echo "[qa:fast] 运行 yoyoosun 私有化部署资料包检查"
  node "$ROOT_DIR/scripts/deploy/deployment-package-lint.mjs" --customer yoyoosun
}

qa_fast_customer_config() {
  echo "[qa:fast] 运行客户配置边界检查"
  node "$ROOT_DIR/scripts/qa/customer-config-boundaries.mjs"

  echo "[qa:fast] 运行客户配置包结构检查"
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer demo --mode compile
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun
  node "$ROOT_DIR/scripts/qa/customer-package-lint.mjs" --customer yoyoosun --mode compile

  echo "[qa:fast] 运行客户配置静态索引合同测试"
  node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind node --label customer-index -- \
    node --test --test-reporter=tap "$ROOT_DIR/config/customers/index.test.mjs"

  echo "[qa:fast] 运行全部登记客户配置的 preview manifest 检查"
  node "$ROOT_DIR/scripts/qa/customer-config-runtime-manifest.mjs" --all --mode preview
}

node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile fast
qa_fast_run repository_guards qa_fast_repository_guards
qa_fast_run node_tests qa_fast_node_tests
qa_fast_run script_boundaries qa_fast_script_boundaries
qa_fast_run customer_config qa_fast_customer_config

if [[ "$fast_scope" == "base" ]]; then
  echo "[qa:fast] scope=base status=component_complete Web 全量与 server 全量由 full 同轮覆盖"
  exit 0
fi

echo "[qa:fast] 运行 web 关键合同测试"
web_tests=(
  "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs"
  "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs"
  "$ROOT_DIR/web/src/erp/config/menuPermissions.test.mjs"
  "$ROOT_DIR/web/src/erp/config/seedData.test.mjs"
  "$ROOT_DIR/web/src/erp/config/workflowStatus.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devHub.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devCoverageOperation.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devTestingOperation.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devTesting.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devDocs.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devGovernance.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devPrototypes.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devCustomerConfig.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devDataPreparation.test.mjs"
  "$ROOT_DIR/web/src/dev-workbench/config/devDatabaseMigration.test.mjs"
  "$ROOT_DIR/web/src/erp/config/printTemplates.test.mjs"
  "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs"
  "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs"
  "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs"
  "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs"
  "$ROOT_DIR/web/dev-server/devServerSecurity.test.mjs"
  "$ROOT_DIR/web/dev-server/devWorkbenchPlugins.test.mjs"
  "$ROOT_DIR/web/dev-server/devQaCoveragePlugin.test.mjs"
  "$ROOT_DIR/web/dev-server/devQaTestingPlugin.test.mjs"
  "$ROOT_DIR/web/dev-server/devDataPreparationPlugin.test.mjs"
  "$ROOT_DIR/web/dev-server/devDatabaseMigrationRuntime.test.mjs"
  "$ROOT_DIR/web/dev-server/devDatabaseMigrationPlugin.test.mjs"
)
node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
  --kind node --label web-contracts -- \
  node --test --test-reporter=tap "${web_tests[@]}"

echo "[qa:fast] 运行 web 静态检查"
(
  cd "$ROOT_DIR/web"
  "$PNPM_BIN" lint
  "$PNPM_BIN" css
)

echo "[qa:fast] 运行 server 快速检查"
(
  cd "$ROOT_DIR/server"
  node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind go --label server-quick \
    --exclude-skip-pattern "${CRITICAL_POSTGRES_TEST_PATTERN}|^TestTemplatePDFChromiumSecurityIntegration$" -- \
    go test -count=1 -json \
    -skip "${CRITICAL_POSTGRES_TEST_PATTERN}|^TestTemplatePDFChromiumSecurityIntegration$" \
    ./internal/... ./pkg/...
)

echo "[qa:fast] 完成"
