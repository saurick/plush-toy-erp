#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/full.sh
  bash scripts/qa/full.sh --ci-shard node|web|server|resource|browser|security
  bash scripts/qa/full.sh --ci-lane web-checks|web-build|server-core|server-postgres

作用:
  执行一次完整本地质量检查。high-risk 或发布候选由 prepare-push.sh --full 在建立远端连接前调用。

检查内容:
  shared: 复用 fast 的基础守卫，一次运行可安全并行的 scripts Node 显式测试组
  secrets: 严格扫描 prepare-push 计算的聚合范围；真实 push hook 仍逐 ref 重新严格扫描
  web: lint/css -> pnpm test + 非零执行/零 skip summary -> pnpm build，同轮各执行一次
  browser: 动态独立端口自启当前 worktree Vite，再运行 Chromium 无写入 smoke
  server: 存量数据真实升级 -> 真实 Chromium PDF 安全集成 -> go test JSON 非零执行/零 skip -> make build
  shared / web / server: 环境与 secrets 通过后并行运行；浏览器仍等待 Web 产物
  resource_sensitive_node: shared / web / server 汇合后单独运行资源敏感发布合同，不放宽超时
  critical_postgres: 汇合后单独运行当前完整 Schema 关键 PostgreSQL 矩阵（含采购退货），不放宽超时
  govulncheck: 最后执行 Go 漏洞扫描，避免外部网络扰动本地 PostgreSQL 并发门禁

环境变量:
  QA_BASE_RANGE=...    指定真实 push 聚合范围，供严格 secrets 使用
  QA_DB_GUARD_RANGE=... 指定数据库守卫范围；prepare-push 只在精确首次镜像场景收窄到已验证上游
  DISPOSABLE_DATABASE_BASE_URL=... 本地 PostgreSQL 管理连接基线；门禁派生唯一 disposable test 库，不写入基线库
  QA_BROWSER_SCENARIOS=...        追加浏览器诊断场景；不能替换正式门禁的工作台共享布局与新增页面治理场景

结果边界:
  full/strict 拒绝 SKIP_*、STRICT_SKIP_* 与调用者提供的 coverage 变量。
  full 不复跑会由 Web/Go 全量覆盖的 fast 子集，仍真实执行全部固定 gate；
  只有全部成功才输出 complete；它不读取或签发回执。
  只有 prepare-push.sh --full 能在 full 通过且 HEAD/tree/环境/远端范围未变化后签发 full 回执。
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

ci_shard=""
ci_lane=""
if [[ $# -eq 2 && "${1:-}" == "--ci-shard" ]]; then
  ci_shard="$2"
  shift 2
elif [[ $# -eq 2 && "${1:-}" == "--ci-lane" ]]; then
  ci_lane="$2"
  shift 2
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:full] 不支持的参数: $*"
  print_help
  exit 1
fi

case "$ci_shard" in
"" | node | web | server | resource | browser | security) ;;
*)
  echo "[qa:full] status=incomplete reason=invalid_ci_shard shard=$ci_shard"
  exit 2
  ;;
esac

case "$ci_lane" in
"" | web-checks | web-build | server-core | server-postgres) ;;
*)
  echo "[qa:full] status=incomplete reason=invalid_ci_lane lane=$ci_lane"
  exit 2
  ;;
esac

if [[ -n "$ci_shard" && -n "$ci_lane" ]]; then
  echo "[qa:full] status=incomplete reason=ambiguous_ci_partition"
  exit 2
fi

full_profile="${QA_FULL_PROFILE:-full}"
case "$full_profile" in
full | strict) ;;
*)
  echo "[qa:full] status=incomplete reason=invalid_profile profile=$full_profile"
  exit 2
  ;;
esac

test_gate_output_args=()
if [[ -n "$ci_shard" || -n "$ci_lane" ]]; then
  test_gate_output_args=(--output-mode summary)
fi

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

if [[ -n "$ci_shard" || -n "$ci_lane" ]]; then
  if [[ "${GITLAB_CI:-}" != "true" ||
    "${CI_PROJECT_PATH:-}" != "saurick/plush-toy-erp" ||
    "${CI_DEFAULT_BRANCH:-}" != "main" ||
    "${CI_COMMIT_BRANCH:-}" != "main" ||
    "${CI_COMMIT_REF_PROTECTED:-}" != "true" ||
    ! "${CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ||
    "$(git rev-parse HEAD)" != "${CI_COMMIT_SHA:-}" ||
    "$full_profile" != "strict" ]]; then
    if [[ -n "$ci_shard" ]]; then
      echo "[qa:full] status=incomplete reason=untrusted_ci_shard_context shard=$ci_shard"
    else
      echo "[qa:full] status=incomplete reason=untrusted_ci_lane_context lane=$ci_lane"
    fi
    exit 2
  fi
  if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    if [[ -n "$ci_shard" ]]; then
      echo "[qa:full] status=incomplete reason=dirty_ci_shard shard=$ci_shard"
    else
      echo "[qa:full] status=incomplete reason=dirty_ci_lane lane=$ci_lane"
    fi
    exit 2
  fi
fi

# ROOT_DIR pins the Bash toolchain helper used by this gate and its child scripts.
# shellcheck source=scripts/lib/bash.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/bash.sh"

DEFAULT_QA_BROWSER_SCENARIOS="root-redirect-desktop,dev-all-pages-mobile,dev-workbench-wide-layout,dev-hub-dark-desktop,dev-drill-recovery-desktop-light,dev-drill-recovery-mobile-dark,dev-business-usability-desktop-light,dev-business-usability-mobile-dark"

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
  require_project_bash "qa:full"
  node "$ROOT_DIR/scripts/qa/database-base-preflight.mjs"
  node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile "$full_profile"
}

qa_full_shared() {
  echo "[qa:full] 运行共享基础检查，不重复 Web/Go 全量稍后覆盖的 fast 子集"
  local node_test_profile=parallel_safe
  if [[ "$ci_shard" == "node" && "${QA_CI_NODE_LANES:-}" == "verified" ]]; then
    node_test_profile=ci_lanes
  fi
  QA_BASE_RANGE="${QA_DB_GUARD_RANGE:-${QA_BASE_RANGE:-}}" \
    QA_FAST_SCOPE=base QA_NODE_TEST_PROFILE="$node_test_profile" \
    QA_FAST_GATE_PROFILE="$full_profile" \
    bash "$ROOT_DIR/scripts/qa/fast.sh"
}

qa_full_resource_sensitive_node() {
  if [[ "$ci_shard" == "resource" && "${QA_CI_RESOURCE_LANES:-}" == "verified" ]]; then
    echo "[qa:full] 校验两个串行资源 lane 的 exact-once 回执"
    node "$ROOT_DIR/scripts/qa/ci-resource-test-lane.mjs" --aggregate
  else
    echo "[qa:full] 串行运行资源敏感的发布合同测试"
    node "$ROOT_DIR/scripts/qa/run-node-tests.mjs" --profile resource_sensitive
  fi
}

qa_full_secrets() {
  SECRETS_STRICT=1 bash "$ROOT_DIR/scripts/qa/secrets.sh"
}

qa_full_web_checks() {
  echo "[qa:full] 运行 web 静态检查与测试"
  cd "$ROOT_DIR/web"
  node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));if(typeof pkg?.scripts?.test!=='string'||!pkg.scripts.test.trim()){console.error('[qa:full] web/package.json 缺少 scripts.test');process.exit(1)}"
  if [[ "$full_profile" == "strict" ]]; then
    qa_run_substep "$full_profile" web eslint \
      "$PNPM_BIN" exec eslint --max-warnings=0 --ext .js --ext .jsx src/
    qa_run_substep "$full_profile" web stylelint \
      "$PNPM_BIN" exec stylelint "src/**/*.{css,scss,sass}" --max-warnings=0
  else
    qa_run_substep "$full_profile" web eslint "$PNPM_BIN" lint
    qa_run_substep "$full_profile" web stylelint "$PNPM_BIN" css
  fi
  qa_run_substep "$full_profile" web web_test \
    node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind node --label web-all "${test_gate_output_args[@]}" -- \
    "$PNPM_BIN" test --test-reporter=tap
}

qa_full_web_build() {
  echo "[qa:full] 运行 web 生产构建与边界检查"
  cd "$ROOT_DIR/web"
  qa_run_substep "$full_profile" web production_build \
    env NODE_ENV=production "$PNPM_BIN" build
  qa_run_substep "$full_profile" web production_boundary \
    node "$ROOT_DIR/scripts/qa/dev-workbench-production-boundary.mjs" \
    --build-dir "$ROOT_DIR/web/build"
}

qa_full_web() {
  qa_full_web_checks
  qa_full_web_build
}

qa_full_browser() {
  echo "[qa:full] 实际启动 Chromium 运行无写入浏览器 smoke"
  local browser_scenarios="$DEFAULT_QA_BROWSER_SCENARIOS"
  if [[ -n "${QA_BROWSER_SCENARIOS:-}" ]]; then
    browser_scenarios="${browser_scenarios},${QA_BROWSER_SCENARIOS}"
  fi
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
      STYLE_L1_SCENARIOS="$browser_scenarios" \
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
  ERP_PDF_CHROMIUM_INTEGRATION=1 \
    node "$ROOT_DIR/scripts/qa/run-test-gate.mjs" \
    --kind go --label server-all \
    --exclude-skip-pattern "$CRITICAL_POSTGRES_TEST_PATTERN" \
    "${test_gate_output_args[@]}" -- \
    go test -count=1 -json -skip "$CRITICAL_POSTGRES_TEST_PATTERN" ./...
  make build
}

qa_full_critical_postgres() {
  echo "[qa:full] 串行运行关键 PostgreSQL 合同"
  cd "$ROOT_DIR/server"
  node "$ROOT_DIR/scripts/qa/disposable-database-runner.mjs" \
    --profile ci \
    --workflow critical-postgres
}

qa_full_govulncheck() {
  # govulncheck 可能走外部网络，放在本地 PostgreSQL 门禁和编译之后，
  # 避免代理或系统网络异常占满本地端口时误报业务并发失败。
  GOVULNCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/govulncheck.sh"
}

if [[ -n "$ci_lane" ]]; then
  case "$ci_lane" in
  web-checks)
    qa_run_stage strict web qa_full_web_checks
    ;;
  web-build)
    qa_run_stage strict web qa_full_web_build
    ;;
  server-core)
    qa_run_stage strict environment_profile qa_full_environment_profile
    qa_run_stage strict server qa_full_server
    ;;
  server-postgres)
    qa_run_stage strict critical_postgres qa_full_critical_postgres
    ;;
  esac
  echo "[qa:full] profile=$full_profile lane=$ci_lane status=complete 全部门禁通过"
  exit 0
fi

case "$ci_shard" in
node)
  qa_run_stage strict secrets qa_full_secrets
  qa_run_stage strict shared qa_full_shared
  ;;
web)
  if [[ "${QA_CI_WEB_LANES:-}" == "verified" ]]; then
    node "$ROOT_DIR/scripts/qa/ci-quality-stage-lane.mjs" --aggregate --shard web
  else
    qa_run_stage strict web qa_full_web
  fi
  ;;
server)
  if [[ "${QA_CI_SERVER_LANES:-}" == "verified" ]]; then
    node "$ROOT_DIR/scripts/qa/ci-quality-stage-lane.mjs" --aggregate --shard server
  else
    qa_run_stage strict environment_profile qa_full_environment_profile
    qa_run_stage strict server qa_full_server
    qa_run_stage strict critical_postgres qa_full_critical_postgres
  fi
  ;;
resource)
  qa_run_stage strict resource_sensitive_node qa_full_resource_sensitive_node
  ;;
browser)
  qa_run_stage strict browser qa_full_browser
  ;;
security)
  qa_run_stage strict govulncheck qa_full_govulncheck
  ;;
"")
  qa_run_stage "$full_profile" environment_profile qa_full_environment_profile
  qa_run_stage "$full_profile" secrets qa_full_secrets
  qa_run_parallel_stages \
    "$full_profile" \
    shared qa_full_shared \
    web qa_full_web \
    server qa_full_server
  qa_run_stage \
    "$full_profile" \
    resource_sensitive_node \
    qa_full_resource_sensitive_node
  qa_run_stage "$full_profile" critical_postgres qa_full_critical_postgres
  qa_run_stage "$full_profile" browser qa_full_browser
  qa_run_stage "$full_profile" govulncheck qa_full_govulncheck
  ;;
esac

echo "[qa:full] profile=$full_profile shard=${ci_shard:-all} status=complete 全部门禁通过"
