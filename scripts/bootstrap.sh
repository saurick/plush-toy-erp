#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/bootstrap.sh

作用:
  1) 安装 web/server 依赖
  2) 启用本地 Git hooks
  3) 执行一次 scripts/qa/fast.sh 快速自检
  4) 提示执行仓库占位与默认值扫描

环境变量:
  BOOTSTRAP_SKIP_INSTALL=1    跳过依赖安装
  BOOTSTRAP_SKIP_FAST_QA=1    跳过快速自检
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[bootstrap] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if ! command -v n >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
  echo "[bootstrap] 请先安装 n，并在仓库根目录执行 n auto；安装说明见 scripts/README.md#版本锁定"
  exit 1
fi

if ! command -v go >/dev/null 2>&1; then
  echo "[bootstrap] 未找到 go，请先安装 Go"
  exit 1
fi

echo "[bootstrap] 运行本机环境自检"
bash "$ROOT_DIR/scripts/doctor.sh"
# shellcheck source=scripts/lib/pnpm.sh
# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/pnpm.sh"
project_pnpm="$(resolve_project_pnpm "$ROOT_DIR")"

if [[ "${BOOTSTRAP_SKIP_INSTALL:-0}" != "1" ]]; then
  echo "[bootstrap] 安装 web 依赖"
  (
    cd "$ROOT_DIR/web"
    "$project_pnpm" install
  )

  echo "[bootstrap] 下载 server Go 依赖"
  (
    cd "$ROOT_DIR/server"
    go mod download
  )
else
  echo "[bootstrap] BOOTSTRAP_SKIP_INSTALL=1，跳过依赖安装"
fi

echo "[bootstrap] 启用 Git hooks"
bash "$ROOT_DIR/scripts/setup-git-hooks.sh"

if [[ "${BOOTSTRAP_SKIP_FAST_QA:-0}" != "1" ]]; then
  echo "[bootstrap] 运行快速自检"
  bash "$ROOT_DIR/scripts/qa/fast.sh"
else
  echo "[bootstrap] BOOTSTRAP_SKIP_FAST_QA=1，跳过快速自检"
fi

echo "[bootstrap] 如本轮涉及改名、默认配置替换或部署收口，建议继续执行: bash $ROOT_DIR/scripts/project-scan.sh"
echo "[bootstrap] 完成"
