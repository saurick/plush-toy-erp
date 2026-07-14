#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/fast.sh

作用:
  执行开发期高频检查。scripts/ 下的 Node 测试由统一入口递归发现，
  新增 *.test.mjs / *.test.js / *.test.cjs 无需再维护 shell 文件清单。

检查内容:
  repository: AGENTS 体积、DB migration、错误码和项目边界守卫
  scripts: 全部 Node 测试 + 关键可执行脚本语法/运行时边界
  web: 关键配置与 smoke 合同测试 -> lint -> css
  server: go test ./internal/... ./pkg/...（存在即测）

环境变量:
  SKIP_DB_GUARD=1  跳过 DB migration 守卫
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

# ROOT_DIR pins the repository helper; ShellCheck cannot resolve this dynamic path.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:fast] 未找到 go，请先安装 Go"
  exit 1
fi

node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile fast

echo "[qa:fast] 运行 T0 diff whitespace 检查"
git diff --check
git diff --cached --check

bash "$ROOT_DIR/scripts/qa/db-guard.sh"

bash "$ROOT_DIR/scripts/qa/error-code-sync.sh"

echo "[qa:fast] 运行错误码魔法数字检查"
bash "$ROOT_DIR/scripts/qa/error-codes.sh"

echo "[qa:fast] 自动发现并运行 scripts Node 测试"
node "$ROOT_DIR/scripts/qa/run-node-tests.mjs"

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

echo "[qa:fast] 运行 web 关键合同测试"
web_tests=(
  "$ROOT_DIR/web/src/erp/utils/adminProfileSync.test.mjs"
  "$ROOT_DIR/web/src/erp/config/entryConfig.test.mjs"
  "$ROOT_DIR/web/src/erp/config/menuPermissions.test.mjs"
  "$ROOT_DIR/web/src/erp/config/seedData.test.mjs"
  "$ROOT_DIR/web/src/erp/config/workflowStatus.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devHub.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devTesting.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devDocs.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devGovernance.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devPrototypes.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devCapabilityLedger.test.mjs"
  "$ROOT_DIR/web/src/erp/config/devCustomerConfig.test.mjs"
  "$ROOT_DIR/web/src/erp/config/printTemplates.test.mjs"
  "$ROOT_DIR/web/scripts/trialDemoAccountBrowserSmoke.test.mjs"
  "$ROOT_DIR/web/scripts/realLoginSmokeShared.test.mjs"
  "$ROOT_DIR/web/scripts/mobileAuthLoginRouteSmoke.test.mjs"
  "$ROOT_DIR/web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs"
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
    --kind go --label server-quick -- \
    go test -count=1 -json \
    -skip '^(Test.*Postgres.*|TestTemplatePDFChromiumSecurityIntegration)$' \
    ./internal/... ./pkg/...
)

echo "[qa:fast] 完成"
