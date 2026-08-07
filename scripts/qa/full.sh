#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/full.sh

作用:
  执行一次完整本地质量检查。最终推送准备由 prepare-push.sh 在建立远端连接前调用。

检查内容:
  shared: 复用 fast 的基础守卫，一次运行 scripts Node 的全部显式测试组
  secrets: 严格扫描 prepare-push 计算的聚合范围；真实 push hook 仍逐 ref 重新严格扫描
  web: lint/css -> pnpm test + 非零执行/零 skip summary -> pnpm build，同轮各执行一次
  browser: 动态独立端口自启当前 worktree Vite，再运行 Chromium 无写入 smoke
  server: 存量数据真实升级 -> 当前完整 Schema 关键 PostgreSQL 矩阵（含采购退货） -> 真实 Chromium PDF 安全集成 -> go test JSON 非零执行/零 skip -> make build
  govulncheck: 最后执行 Go 漏洞扫描，避免外部网络扰动本地 PostgreSQL 并发门禁

环境变量:
  QA_BASE_RANGE=...    指定 diff 范围供 db-guard/secrets 使用
  DISPOSABLE_DATABASE_BASE_URL=... 本地 PostgreSQL 管理连接基线；门禁派生唯一 disposable test 库，不写入基线库
  QA_BROWSER_SCENARIOS=...        浏览器诊断时覆盖默认场景；门禁始终至少运行一个场景

结果边界:
  full/strict 拒绝 SKIP_*、STRICT_SKIP_* 与调用者提供的 coverage 变量。
  full 不复跑会由 Web/Go 全量覆盖的 fast 子集，仍真实执行全部固定 gate；
  只有全部成功才输出 complete；它不读取或签发回执。
  只有 prepare-push.sh 能在 full 通过且 HEAD/tree/环境/远端范围未变化后签发本地回执。
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:full] 不支持的参数: $*"
  print_help
  exit 1
fi

full_profile="${QA_FULL_PROFILE:-full}"
case "$full_profile" in
full | strict) ;;
*)
  echo "[qa:full] status=incomplete reason=invalid_profile profile=$full_profile"
  exit 2
  ;;
esac

for variable in QA_GATE_COVERAGE_RECEIPT QA_GATE_ORCHESTRATOR; do
  if [[ -n "${!variable:-}" ]]; then
    echo "[qa:full] status=incomplete reason=forbidden_coverage variable=$variable"
    exit 2
  fi
done

for variable in \
  SKIP_DB_GUARD \
  SKIP_ERROR_CODE_SYNC \
  SKIP_ERROR_CODE_GUARD \
  ERROR_CODE_GUARD_STAGED_ONLY \
  SKIP_SECRETS_SCAN \
  SECRETS_STAGED_ONLY \
  SKIP_GOVULNCHECK \
  STRICT_SKIP_SHELLCHECK \
  STRICT_SKIP_SHFMT \
  STRICT_SKIP_GOVULNCHECK; do
  if [[ -n "${!variable:-}" && "${!variable}" != "0" ]]; then
    echo "[qa:full] status=incomplete reason=forbidden_skip variable=$variable"
    exit 2
  fi
done

if [[ -n "${STYLE_L1_BASE_URL:-}" ]]; then
  echo "[qa:full] status=incomplete reason=external_browser_target_forbidden variable=STYLE_L1_BASE_URL"
  exit 2
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

# ROOT_DIR pins the shared PostgreSQL contract; ShellCheck scans it separately.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/qa/critical-postgres-tests.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:full] 未找到 node，请先安装 Node.js"
  exit 1
fi

# ROOT_DIR pins the repository helper; ShellCheck cannot resolve this dynamic path.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:full] 未找到 go，请先安装 Go"
  exit 1
fi

# ROOT_DIR pins the timing helper; ShellCheck cannot resolve this dynamic path.
# shellcheck source=scripts/qa/lib/stage-timing.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/qa/lib/stage-timing.sh"

qa_full_environment_profile() {
  node "$ROOT_DIR/scripts/qa/database-base-preflight.mjs"
  node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile "$full_profile"
}

qa_full_shared() {
  echo "[qa:full] 运行共享基础检查，不重复 Web/Go 全量稍后覆盖的 fast 子集"
  QA_FAST_SCOPE=base QA_NODE_TEST_PROFILE=full \
    bash "$ROOT_DIR/scripts/qa/fast.sh"
}

qa_full_secrets() {
  SECRETS_STRICT=1 bash "$ROOT_DIR/scripts/qa/secrets.sh"
}

qa_full_web() {
  echo "[qa:full] 运行 web 测试与构建"
  cd "$ROOT_DIR/web"
  node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));if(typeof pkg?.scripts?.test!=='string'||!pkg.scripts.test.trim()){console.error('[qa:full] web/package.json 缺少 scripts.test');process.exit(1)}"
  if [[ "$full_profile" == "strict" ]]; then
    "$PNPM_BIN" exec eslint --max-warnings=0 --ext .js --ext .jsx src/
    "$PNPM_BIN" exec stylelint "src/**/*.{css,scss,sass}" --max-warnings=0
  else
    "$PNPM_BIN" lint
    "$PNPM_BIN" css
  fi
  node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind node --label web-all -- \
    "$PNPM_BIN" test --test-reporter=tap
  "$PNPM_BIN" build
  node "$ROOT_DIR/scripts/qa/dev-workbench-production-boundary.mjs" \
    --build-dir "$ROOT_DIR/web/build"
}

qa_full_browser() {
  echo "[qa:full] 实际启动 Chromium 运行无写入浏览器 smoke"
  # 同一 worktree 的浏览器证据必须串行；stale lock 保守失败，避免并发回收竞态。
  # shellcheck source=scripts/qa/browser-gate-lock.sh
  # shellcheck disable=SC1091
  source "$ROOT_DIR/scripts/qa/browser-gate-lock.sh"
  # shellcheck disable=SC2034
  BROWSER_GATE_LOCK_PATH="${TMPDIR:-/tmp}/plush-toy-erp-qa-browser.lock"
  trap browser_gate_lock_release EXIT
  browser_gate_lock_acquire
  browser_port="$(
    node "$ROOT_DIR/scripts/dev-ports.mjs" \
      --find-free-aux-port \
      --project-root "$ROOT_DIR"
  )"
  node "$ROOT_DIR/web/scripts/productionDevBoundaryBrowserSmoke.mjs" \
    --port "$browser_port" \
    --build-dir "$ROOT_DIR/web/build"
  (
    cd "$ROOT_DIR/web"
    # styleL1.mjs 会派生 pnpm 启动 Vite；确保使用项目锁定的 pnpm 所在 PATH。
    PNPM_BIN_DIR="$(dirname "$PNPM_BIN")"
    export PATH="$PNPM_BIN_DIR:$PATH"
    STYLE_L1_BASE_URL="" \
      STYLE_L1_PORT="$browser_port" \
      STYLE_L1_SCENARIOS="${QA_BROWSER_SCENARIOS:-root-redirect-desktop}" \
      "$PNPM_BIN" style:l1
  )
  browser_gate_lock_release
  trap - EXIT
}

qa_full_server() {
  echo "[qa:full] 运行 server 全量检查"
  cd "$ROOT_DIR/server"
  PURCHASE_RECEIPT_PG_DB_URL="$DISPOSABLE_DATABASE_BASE_URL" \
    make populated_upgrade_pg_test
  node "$ROOT_DIR/scripts/qa/disposable-database-runner.mjs" \
    --profile ci \
    --workflow critical-postgres
  ERP_PDF_CHROMIUM_INTEGRATION=1 \
    node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind go --label server-all -- \
    go test -count=1 -json -skip "$CRITICAL_POSTGRES_TEST_PATTERN" ./...
  make build
}

qa_full_govulncheck() {
  # govulncheck 可能走外部网络，放在本地 PostgreSQL 门禁和编译之后，
  # 避免代理或系统网络异常占满本地端口时误报业务并发失败。
  GOVULNCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/govulncheck.sh"
}

qa_run_stage "$full_profile" environment_profile qa_full_environment_profile
qa_run_stage "$full_profile" shared qa_full_shared
qa_run_stage "$full_profile" secrets qa_full_secrets
qa_run_stage "$full_profile" web qa_full_web
qa_run_stage "$full_profile" browser qa_full_browser
qa_run_stage "$full_profile" server qa_full_server
qa_run_stage "$full_profile" govulncheck qa_full_govulncheck

echo "[qa:full] profile=$full_profile status=complete 全部门禁通过"
