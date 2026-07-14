#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/strict.sh

作用:
  执行严格质量检查。strict 直接复用 full，保证是 full 的真实超集，
  再追加零 warning、shell / YAML 格式、扩展浏览器视口和严格漏洞扫描。

检查内容:
  full: 全部 full 门禁，浏览器覆盖桌面、手机与平板关键入口
  shell/yaml: shellcheck + shfmt + yamllint（严格模式）
  web: eslint + stylelint（零 warning）
  govulncheck: 严格模式，最后运行

环境变量:
  QA_BASE_RANGE=...         指定 diff 范围供 db-guard/secrets 使用

结果边界:
  strict 拒绝全部 SKIP_* / STRICT_SKIP_*，先真实完成 full 全部门禁，
  再执行严格附加项；不存在可由调用者自签的跳过或 coverage receipt。
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

if ! command -v node >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 node，请先安装 Node.js"
  exit 1
fi

# ROOT_DIR pins the repository helper; ShellCheck cannot resolve this dynamic path.
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/pnpm.sh"
require_project_node "$ROOT_DIR"
PNPM_BIN="$(resolve_project_pnpm "$ROOT_DIR")"

if ! command -v go >/dev/null 2>&1; then
  echo "[qa:strict] 未找到 go，请先安装 Go"
  exit 1
fi

node "$ROOT_DIR/scripts/qa/gate-profiles.mjs" --profile strict

echo "[qa:strict] 运行 full 超集基线与扩展浏览器场景"
QA_BROWSER_SCENARIOS="root-redirect-desktop,root-redirect-mobile,print-center-engineering-preview-tablet" \
  bash "$ROOT_DIR/scripts/qa/full.sh"

SHELLCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/shellcheck.sh"

SHFMT_STRICT=1 SHFMT_CHECK=1 bash "$ROOT_DIR/scripts/qa/shfmt.sh"

YAMLLINT_STRICT=1 YAMLLINT_ALL=1 bash "$ROOT_DIR/scripts/qa/yamllint.sh"

echo "[qa:strict] 运行 web 零 warning 检查"
(
  cd "$ROOT_DIR/web"
  "$PNPM_BIN" exec eslint --max-warnings=0 --ext .js --ext .jsx src/
  "$PNPM_BIN" exec stylelint "src/**/*.{css,scss,sass}" --max-warnings=0
)

# strict 末尾重复严格漏洞扫描，确保严格附加项完成后仍无漏洞阻断；
# full 自身已经真实执行其固定 govulncheck，未借此跳过任何 full gate。
GOVULNCHECK_STRICT=1 bash "$ROOT_DIR/scripts/qa/govulncheck.sh"

echo "[qa:strict] status=complete 全部门禁通过"
