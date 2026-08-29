#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/strict.sh
  bash scripts/qa/strict.sh --ci-shard static

作用:
  执行严格质量检查。先运行 strict 独有的 shell / YAML 静态检查，
  再以 strict profile 单次复用 full；零 warning、扩展浏览器视口与
  严格漏洞扫描均在这一次 full 中完成。

检查内容:
  shell/yaml: shellcheck + shfmt + yamllint（严格模式）
  full: 全部 full 门禁，浏览器覆盖桌面、手机与平板关键入口
  web/govulncheck: 零 warning 与严格漏洞扫描各执行一次

环境变量:
  QA_BASE_RANGE=...         指定 diff 范围供 db-guard/secrets 使用

结果边界:
  strict 拒绝全部 SKIP_* / STRICT_SKIP_*；不存在可由调用者自签的
  跳过或 coverage receipt，也不重复 full 已完成的 Web / Go / 漏洞门禁。
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

ci_shard=""
if [[ $# -eq 2 && "${1:-}" == "--ci-shard" ]]; then
  ci_shard="$2"
  shift 2
fi

if [[ $# -gt 0 || (-n "$ci_shard" && "$ci_shard" != "static") ]]; then
  echo "[qa:strict] 不支持的参数: $*"
  print_help
  exit 1
fi

for variable in \
  SKIP_DB_GUARD \
  SKIP_ERROR_CODE_SYNC \
  SKIP_ERROR_CODE_GUARD \
  ERROR_CODE_GUARD_STAGED_ONLY \
  SKIP_SECRETS_SCAN \
  SECRETS_STAGED_ONLY \
  SKIP_GOVULNCHECK \
  SKIP_SHELLCHECK \
  SKIP_SHFMT \
  SKIP_YAMLLINT \
  STRICT_SKIP_SHELLCHECK \
  STRICT_SKIP_SHFMT \
  STRICT_SKIP_GOVULNCHECK; do
  if [[ -n "${!variable:-}" && "${!variable}" != "0" ]]; then
    echo "[qa:strict] status=incomplete reason=forbidden_skip variable=$variable"
    exit 2
  fi
done

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ -n "$ci_shard" ]]; then
  if [[ "${GITLAB_CI:-}" != "true" ||
    "${CI_PROJECT_PATH:-}" != "saurick/plush-toy-erp" ||
    "${CI_DEFAULT_BRANCH:-}" != "main" ||
    "${CI_COMMIT_BRANCH:-}" != "main" ||
    "${CI_COMMIT_REF_PROTECTED:-}" != "true" ||
    ! "${CI_COMMIT_SHA:-}" =~ ^[0-9a-f]{40}$ ||
    "$(git rev-parse HEAD)" != "${CI_COMMIT_SHA:-}" ||
    -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "[qa:strict] status=incomplete reason=untrusted_ci_shard_context shard=$ci_shard"
    exit 2
  fi
fi

# ROOT_DIR pins the Bash toolchain helper used by this gate and its child scripts.
# shellcheck source=scripts/lib/bash.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/bash.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 node，请先安装 Node.js"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 go，请先安装 Go"
  exit 1
fi

# ROOT_DIR pins the timing helper; ShellCheck cannot resolve this dynamic path.
# shellcheck source=scripts/qa/lib/stage-timing.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/qa/lib/stage-timing.sh"

qa_strict_profile() {
  require_project_bash "qa:strict"
  node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile strict
}

qa_strict_shellcheck() {
  SHELLCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/shellcheck.sh"
}

qa_strict_shfmt() {
  SHFMT_STRICT=1 SHFMT_CHECK=1 bash "$ROOT_DIR/scripts/qa/shfmt.sh"
}

qa_strict_yamllint() {
  YAMLLINT_STRICT=1 YAMLLINT_ALL=1 bash "$ROOT_DIR/scripts/qa/yamllint.sh"
}

qa_run_stage strict strict_profile qa_strict_profile
qa_run_stage strict shellcheck qa_strict_shellcheck
qa_run_stage strict shfmt qa_strict_shfmt
qa_run_stage strict yamllint qa_strict_yamllint

if [[ "$ci_shard" == "static" ]]; then
  echo "[qa:strict] shard=static status=complete 严格静态门禁通过"
  exit 0
fi

echo "[qa:strict] 单次运行 full 超集基线、零 warning 与扩展浏览器场景"
QA_FULL_PROFILE=strict \
  QA_BROWSER_SCENARIOS="root-redirect-desktop,root-redirect-mobile,print-center-engineering-preview-tablet" \
  bash "$ROOT_DIR/scripts/qa/full.sh"

echo "[qa:strict] status=complete 全部门禁通过"
