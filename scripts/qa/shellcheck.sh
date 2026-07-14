#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/shellcheck.sh [shell 文件...]

作用:
  - 传入参数：仅检查指定 shell 文件
  - 不传参数：检查 scripts 与 .githooks 下的全部 shell 文件

环境变量:
  SKIP_SHELLCHECK=1     跳过检查
  SHELLCHECK_STRICT=1   shellcheck 未安装时阻断（默认仅提示）
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${SKIP_SHELLCHECK:-0}" == "1" ]]; then
  echo "[qa:shellcheck] SKIP_SHELLCHECK=1，跳过"
  exit 0
fi

strict="${SHELLCHECK_STRICT:-0}"
if ! command -v shellcheck >/dev/null 2>&1; then
  echo "[qa:shellcheck] 未安装 shellcheck，跳过（建议安装后启用）"
  if [[ "$strict" == "1" ]]; then
    exit 1
  fi
  exit 0
fi

files=()
if [[ $# -gt 0 ]]; then
  for f in "$@"; do
    [[ -f "$f" ]] || continue
    case "$f" in
    *.sh | .githooks/pre-commit | .githooks/pre-push | .githooks/commit-msg)
      files+=("$f")
      ;;
    *)
      echo "[qa:shellcheck] 不是受支持的 shell 文件: $f"
      exit 1
      ;;
    esac
  done
else
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find scripts .githooks -type f \( -name '*.sh' -o -name 'pre-commit' -o -name 'pre-push' -o -name 'commit-msg' \) -print0)
fi

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "[qa:shellcheck] 未发现可检查脚本"
  exit 0
fi

shellcheck "${files[@]}"

echo "[qa:shellcheck] 通过"
