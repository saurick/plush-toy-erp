#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/doctor.sh

作用:
  检查本地开发环境是否满足仓库脚本与门禁运行要求

检查项:
  - 必需命令: git / node / pnpm / go
  - 可选命令: gitleaks / shellcheck / golangci-lint / yamllint / shfmt / govulncheck
  - hooks 路径与关键脚本存在性
  - Node 版本与版本文件（.n-node-version/.node-version/.nvmrc）一致性
  - pnpm 版本与 web/package.json packageManager 一致性
  - Go 版本满足 server/go.mod toolchain / go directive
  - 仓库扫描脚本存在性（scripts/project-scan.sh）
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[doctor] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"
source "$ROOT_DIR/scripts/lib/pnpm.sh"

missing=0
warns=0

print_cmd_version() {
  case "$1" in
  git)
    git --version
    ;;
  node)
    node -v
    ;;
  pnpm)
    pnpm -v
    ;;
  go)
    go version
    ;;
  gitleaks)
    gitleaks version 2>/dev/null | head -n 1 || true
    ;;
  shellcheck)
    shellcheck --version 2>/dev/null | head -n 1 || true
    ;;
  golangci-lint)
    golangci-lint version 2>/dev/null | head -n 1 || true
    ;;
  yamllint)
    yamllint --version 2>/dev/null | head -n 1 || true
    ;;
  shfmt)
    shfmt --version 2>/dev/null || true
    ;;
  govulncheck)
    govulncheck -version 2>/dev/null || true
    ;;
  esac
}

read_trimmed_file() {
  tr -d ' \t\r\n' <"$1"
}

normalize_version() {
  printf "%s" "$1" | sed -E 's/^(v|go)//; s/[^0-9.].*$//'
}

semver_ge() {
  local current expected
  current="$(normalize_version "$1")"
  expected="$(normalize_version "$2")"

  IFS='.' read -r c_major c_minor c_patch <<<"$current"
  IFS='.' read -r e_major e_minor e_patch <<<"$expected"

  c_major="${c_major:-0}"
  c_minor="${c_minor:-0}"
  c_patch="${c_patch:-0}"
  e_major="${e_major:-0}"
  e_minor="${e_minor:-0}"
  e_patch="${e_patch:-0}"

  if ((c_major != e_major)); then
    ((c_major > e_major))
    return
  fi
  if ((c_minor != e_minor)); then
    ((c_minor > e_minor))
    return
  fi
  ((c_patch >= e_patch))
}

echo "[doctor] 检查必需命令"
for cmd in git node pnpm go; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "  - [OK] %s: " "$cmd"
    print_cmd_version "$cmd"
  else
    echo "  - [缺失] $cmd"
    missing=1
  fi
done

echo "[doctor] 检查必需版本"
node_version_files=()
expected_node=""
for f in .n-node-version .node-version .nvmrc; do
  if [[ -f "$f" ]]; then
    node_version_files+=("$f")
    file_node="$(normalize_version "$(read_trimmed_file "$f")")"
    if [[ -z "$expected_node" ]]; then
      expected_node="$file_node"
    elif [[ "$file_node" != "$expected_node" ]]; then
      echo "  - [错误] Node 版本锁不一致：${f}=${file_node}，期望 ${expected_node}"
      missing=1
    fi
  fi
done

if [[ "${#node_version_files[@]}" -eq 0 ]]; then
  echo "  - [缺失] Node 版本锁文件（.n-node-version/.node-version/.nvmrc）"
  missing=1
elif command -v node >/dev/null 2>&1; then
  current_node="$(normalize_version "$(node -v)")"
  if [[ "$current_node" == "$expected_node" ]]; then
    echo "  - [OK] Node: ${current_node}（${node_version_files[*]}）"
  else
    echo "  - [错误] Node 当前 ${current_node}，版本锁期望 ${expected_node}（${node_version_files[*]}）"
    missing=1
  fi
fi

if [[ -f web/package.json ]] && command -v node >/dev/null 2>&1; then
  expected_pnpm="$(project_expected_pnpm_version "$ROOT_DIR")"
  if [[ -z "$expected_pnpm" ]]; then
    echo "  - [缺失] web/package.json packageManager 应固定为 pnpm@x.y.z"
    missing=1
  elif resolved_pnpm="$(resolve_project_pnpm "$ROOT_DIR" 2>/dev/null)"; then
    current_pnpm="$("$resolved_pnpm" -v)"
    echo "  - [OK] pnpm: ${current_pnpm}（${resolved_pnpm}，web/package.json packageManager）"
    if command -v pnpm >/dev/null 2>&1; then
      path_pnpm="$(command -v pnpm)"
      path_pnpm_version="$(pnpm -v 2>/dev/null || true)"
      if [[ "$path_pnpm" != "$resolved_pnpm" || "$path_pnpm_version" != "$expected_pnpm" ]]; then
        echo "  - [提示] PATH pnpm 当前 ${path_pnpm_version:-<未知>}（${path_pnpm}），脚本会使用匹配版本 ${resolved_pnpm}"
      fi
    fi
  else
    echo "  - [错误] 未找到 pnpm ${expected_pnpm}（web/package.json packageManager）"
    missing=1
  fi
fi

if [[ -f server/go.mod ]] && command -v go >/dev/null 2>&1; then
  expected_go="$(awk '$1 == "toolchain" { print $2 }' server/go.mod | head -n 1)"
  if [[ -z "$expected_go" ]]; then
    expected_go="$(awk '$1 == "go" { print $2 }' server/go.mod | head -n 1)"
  fi
  expected_go="$(normalize_version "$expected_go")"
  current_go="$(normalize_version "$(cd server && go version | awk '{ print $3 }')")"
  if [[ -n "$expected_go" ]] && semver_ge "$current_go" "$expected_go"; then
    echo "  - [OK] Go: ${current_go}（server/go.mod 要求 >= ${expected_go}）"
  else
    echo "  - [错误] Go 当前 ${current_go:-<未知>}，server/go.mod 要求 >= ${expected_go:-<未知>}"
    missing=1
  fi
fi

echo "[doctor] 检查可选命令"
for cmd in gitleaks shellcheck golangci-lint yamllint shfmt govulncheck; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf "  - [OK] %s: " "$cmd"
    print_cmd_version "$cmd"
  else
    echo "  - [可选缺失] $cmd"
    warns=1
  fi
done

hooks_path="$(git config --get core.hooksPath || true)"
if [[ "$hooks_path" == ".githooks" ]]; then
  echo "[doctor] hooksPath 正常：.githooks"
else
  echo "[doctor] hooksPath 当前为：${hooks_path:-<未设置>}（建议执行 scripts/setup-git-hooks.sh）"
  warns=1
fi

echo "[doctor] 检查关键脚本存在性"
required_files=(
  scripts/setup-git-hooks.sh
  scripts/bootstrap.sh
  scripts/project-scan.sh
  scripts/qa/fast.sh
  scripts/qa/full.sh
  scripts/qa/strict.sh
  scripts/qa/db-guard.sh
  scripts/qa/secrets.sh
  scripts/qa/shellcheck.sh
  scripts/qa/go-vet.sh
  scripts/qa/golangci-lint.sh
  scripts/qa/yamllint.sh
  scripts/qa/shfmt.sh
  scripts/qa/govulncheck.sh
  scripts/git-hooks/pre-commit.sh
  scripts/git-hooks/pre-push.sh
  scripts/git-hooks/commit-msg.sh
  .githooks/pre-commit
  .githooks/pre-push
  .githooks/commit-msg
  .n-node-version
  .node-version
  .nvmrc
  web/package.json
  server/go.mod
)

for f in "${required_files[@]}"; do
  if [[ -f "$f" ]]; then
    echo "  - [OK] $f"
  else
    echo "  - [缺失] $f"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  echo "[doctor] 存在缺失项，请先修复后再继续"
  exit 1
fi

if [[ "$warns" -ne 0 ]]; then
  echo "[doctor] 检查通过（含提示项）"
  exit 0
fi

echo "[doctor] 全部通过"
