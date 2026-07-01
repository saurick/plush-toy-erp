#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/secrets.sh

作用:
  对变更文件或源码包文件做密钥泄露扫描，并始终拦截 npm registry token 明文配置

行为:
  git 仓库内: 扫描 diff/staged 候选文件，并额外检查 tracked npm/yarn 配置
  非 git 目录: 按脚本所在源码包根目录扫描文件；不支持 staged-only / diff range
  未安装 gitleaks: npm token 检查仍会执行；SECRETS_STRICT=1 时阻断
  检测到疑似泄露: 阻断

环境变量:
  SKIP_SECRETS_SCAN=1   跳过检查
  SECRETS_STRICT=1      命中或工具缺失时阻断
  SECRETS_STAGED_ONLY=1 仅扫描 staged 内容（用于 pre-commit）
  QA_BASE_RANGE=...     指定 diff 范围（例：origin/master...HEAD）
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:secrets] 不支持的参数: $*"
  print_help
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
fallback_root="$(cd "$script_dir/../.." && pwd -P)"

in_git_repo=0
if git_root="$(git -C "$fallback_root" rev-parse --show-toplevel 2>/dev/null)" &&
  git_root="$(cd "$git_root" && pwd -P)" &&
  [[ "$git_root" == "$fallback_root" ]]; then
  ROOT_DIR="$git_root"
  in_git_repo=1
else
  ROOT_DIR="$fallback_root"
fi

cd "$ROOT_DIR"

if [[ "${SKIP_SECRETS_SCAN:-0}" == "1" ]]; then
  echo "[qa:secrets] SKIP_SECRETS_SCAN=1，跳过"
  exit 0
fi

strict="${SECRETS_STRICT:-0}"
staged_only="${SECRETS_STAGED_ONLY:-0}"

if [[ "$in_git_repo" != "1" && "$staged_only" == "1" ]]; then
  echo "[qa:secrets] 非 git 目录不支持 SECRETS_STAGED_ONLY=1"
  exit 1
fi

has_gitleaks=1
if ! command -v gitleaks >/dev/null 2>&1; then
  has_gitleaks=0
  echo "[qa:secrets] 未安装 gitleaks，继续执行内置 npm token 检查"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

files=()
append_file() {
  local f="$1"
  [[ -n "$f" ]] && files+=("$f")
}

if [[ "$staged_only" == "1" ]]; then
  while IFS= read -r f; do
    append_file "$f"
  done < <(git diff --cached --name-only --diff-filter=ACMR)
elif [[ "$in_git_repo" == "1" ]]; then
  range="${QA_BASE_RANGE:-}"
  if [[ -z "$range" ]] && git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" >/dev/null 2>&1; then
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}")"
    range="${upstream}...HEAD"
  fi

  if [[ -n "$range" ]]; then
    while IFS= read -r f; do
      append_file "$f"
    done < <(git diff --name-only "$range")
  fi

  while IFS= read -r f; do
    append_file "$f"
  done < <(git diff --name-only)

  while IFS= read -r f; do
    append_file "$f"
  done < <(git diff --name-only --cached)
else
  if [[ -n "${QA_BASE_RANGE:-}" ]]; then
    echo "[qa:secrets] 非 git 目录忽略 QA_BASE_RANGE=${QA_BASE_RANGE}"
  fi

  while IFS= read -r f; do
    append_file "${f#./}"
  done < <(
    find . \
      \( -path "./.git" -o \
      -path "./node_modules" -o \
      -path "./web/node_modules" -o \
      -path "./server/bin" -o \
      -path "./output" -o \
      -path "./tmp" -o \
      -path "./build" -o \
      -path "./dist" \) -prune -o \
      -type f -print
  )
fi

for f in .npmrc .npmrc.local .yarnrc.yml web/.npmrc web/.npmrc.local web/.yarnrc.yml; do
  if [[ "$in_git_repo" == "1" ]]; then
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1 || [[ -f "$ROOT_DIR/$f" ]]; then
      append_file "$f"
    fi
  elif [[ -f "$ROOT_DIR/$f" ]]; then
    append_file "$f"
  fi
done

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "[qa:secrets] 未检测到待扫描变更，跳过"
  exit 0
fi

while IFS= read -r f; do
  [[ -z "$f" ]] && continue

  case "$f" in
  .git/* | node_modules/* | web/node_modules/* | server/bin/* | output/* | tmp/* | build/* | dist/*)
    continue
    ;;
  esac

  mkdir -p "$tmp_dir/$(dirname "$f")"

  if [[ "$staged_only" == "1" ]]; then
    if ! git cat-file -e ":$f" 2>/dev/null; then
      continue
    fi
    git show ":$f" >"$tmp_dir/$f" 2>/dev/null || true
  else
    [[ -f "$ROOT_DIR/$f" ]] || continue
    cp "$ROOT_DIR/$f" "$tmp_dir/$f"
  fi
done < <(printf "%s\n" "${files[@]}" | sort -u)

if [[ -z "$(find "$tmp_dir" -type f -print -quit)" ]]; then
  echo "[qa:secrets] 过滤后无可扫描文件，跳过"
  exit 0
fi

# shellcheck disable=SC2016
npm_token_hits="$(
  find "$tmp_dir" -type f \( -name ".npmrc" -o -name ".npmrc.local" -o -name ".yarnrc.yml" \) -print0 |
    xargs -0 awk '
      /_authToken[[:space:]]*=/ || /npmAuthToken[[:space:]]*:/ {
        value = $0
        sub(/^.*(_authToken[[:space:]]*=|npmAuthToken[[:space:]]*:)[[:space:]]*/, "", value)
        gsub(/["'\''`]/, "", value)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        if (value != "" && value !~ /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/ && value !~ /^<[^>]+>$/) {
          print FILENAME ":" FNR
        }
      }
    ' 2>/dev/null || true
)"

if [[ -n "$npm_token_hits" ]]; then
  echo "[qa:secrets] 检测到 npm registry token 明文配置:"
  printf "%s\n" "$npm_token_hits" | sed "s#^$tmp_dir/##"
  exit 1
fi

if [[ "$has_gitleaks" != "1" ]]; then
  if [[ "$strict" == "1" ]]; then
    echo "[qa:secrets] SECRETS_STRICT=1 且缺少 gitleaks，阻断"
    exit 1
  fi
  echo "[qa:secrets] npm token 检查通过；跳过 gitleaks（建议安装后启用）"
  exit 0
fi

# Git hooks export GIT_DIR/GIT_WORK_TREE. gitleaks scans a copied temp tree, so
# do not let hook git context leak into the temp source scan.
if env -u GIT_DIR -u GIT_WORK_TREE gitleaks detect --source "$tmp_dir" --no-banner --redact >/dev/null 2>&1; then
  echo "[qa:secrets] 通过"
  exit 0
fi

echo "[qa:secrets] 检测到疑似密钥泄露"
exit 1
