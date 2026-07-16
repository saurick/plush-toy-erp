#!/usr/bin/env bash
set -euo pipefail

CALLER_DIR="$(pwd -P)"
ROOT_DIR="$(git rev-parse --show-toplevel)"
if [[ -n "${GIT_INDEX_FILE:-}" && "$GIT_INDEX_FILE" != /* ]]; then
  export GIT_INDEX_FILE="$CALLER_DIR/$GIT_INDEX_FILE"
fi
cd "$ROOT_DIR"

STAGED_FILES=()
while IFS= read -r -d '' file; do
  STAGED_FILES+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACMRD -z)

if [[ "${#STAGED_FILES[@]}" -eq 0 ]]; then
  exit 0
fi

echo "[pre-commit] 检查暂存 diff"
git diff --cached --check

INDEX_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/plush-pre-commit-index.XXXXXX")"
INDEX_ROOT="$(cd "$INDEX_ROOT" && pwd -P)"
GIT_DIR_PATH="$(git rev-parse --absolute-git-dir)"
cleanup() {
  rm -rf "$INDEX_ROOT"
}
trap cleanup EXIT

# 所有后续检查都读取同一份 index 快照。这样其他 checker/config 的
# 未暂存 WIP 既不能放宽本次提交，也不会让 partial staging 被误检为 worktree 内容。
git checkout-index --all --prefix="$INDEX_ROOT/"
export GIT_DIR="$GIT_DIR_PATH"
export GIT_WORK_TREE="$INDEX_ROOT"
cd "$INDEX_ROOT"

echo "[pre-commit] 检查 required 文件的暂存状态与 executable bit"
node "$INDEX_ROOT/scripts/qa/gate-profiles.mjs" \
  --profile fast --source index-transition --baseline HEAD

echo "[pre-commit] 检查暂存 Ent schema 与 Atlas migration 同步"
SKIP_DB_GUARD=0 QA_BASE_RANGE=HEAD...HEAD \
  bash "$INDEX_ROOT/scripts/qa/db-guard.sh"

echo "[pre-commit] 检查错误码生成同步"
bash "$INDEX_ROOT/scripts/qa/error-code-sync.sh"

echo "[pre-commit] 检查暂存错误码"
ERROR_CODE_GUARD_STAGED_ONLY=1 bash "$INDEX_ROOT/scripts/qa/error-codes.sh"

echo "[pre-commit] 扫描暂存内容中的密钥"
SECRETS_STRICT=1 SECRETS_STAGED_ONLY=1 bash "$INDEX_ROOT/scripts/qa/secrets.sh"

SHELL_TARGETS=()
YAML_TARGETS=()
GO_TARGETS=()
RUN_GO_ALL=0

add_go_target() {
  local target="$1"
  local existing
  for existing in "${GO_TARGETS[@]:-}"; do
    [[ "$existing" == "$target" ]] && return
  done
  GO_TARGETS+=("$target")
}

for file in "${STAGED_FILES[@]}"; do
  case "$file" in
  scripts/*.sh | .githooks/pre-commit | .githooks/pre-push | .githooks/commit-msg)
    [[ -f "$file" ]] && SHELL_TARGETS+=("$file")
    ;;
  esac

  case "$file" in
  *.yml | *.yaml)
    case "$file" in
    web/pnpm-lock.yaml | web/node_modules/* | web/build/* | server/bin/* | .playwright-cli/*) ;;
    *) YAML_TARGETS+=("$file") ;;
    esac
    ;;
  esac

  case "$file" in
  server/go.mod | server/go.sum | .golangci.yml | .golangci.yaml | .golangci.toml | .golangci.json)
    RUN_GO_ALL=1
    ;;
  server/*.go)
    relative="${file#server/}"
    directory="$(dirname "$relative")"
    if [[ "$directory" == "." ]]; then
      add_go_target "./"
    else
      add_go_target "./$directory"
    fi
    ;;
  esac
done

if [[ "${#SHELL_TARGETS[@]}" -gt 0 ]]; then
  echo "[pre-commit] 检查暂存 shell 文件格式"
  SHFMT_STRICT=1 SHFMT_CHECK=1 bash "$INDEX_ROOT/scripts/qa/shfmt.sh" "${SHELL_TARGETS[@]}"

  echo "[pre-commit] 运行 shellcheck"
  SHELLCHECK_STRICT=1 bash "$INDEX_ROOT/scripts/qa/shellcheck.sh" "${SHELL_TARGETS[@]}"
fi

if [[ "$RUN_GO_ALL" -eq 1 || "${#GO_TARGETS[@]}" -gt 0 ]]; then
  if [[ "$RUN_GO_ALL" -eq 1 ]]; then
    GO_TARGETS=(./...)
  fi
  echo "[pre-commit] 检测到 Go 改动，运行 go vet"
  bash "$INDEX_ROOT/scripts/qa/go-vet.sh" "${GO_TARGETS[@]}"

  echo "[pre-commit] 检测到 Go 改动，运行 golangci-lint"
  GOLANGCI_STRICT=1 GOLANGCI_ONLY_NEW=1 \
    bash "$INDEX_ROOT/scripts/qa/golangci-lint.sh" "${GO_TARGETS[@]}"
fi

if [[ "${#YAML_TARGETS[@]}" -gt 0 ]]; then
  echo "[pre-commit] 检查暂存 YAML"
  YAMLLINT_STRICT=1 bash "$INDEX_ROOT/scripts/qa/yamllint.sh" "${YAML_TARGETS[@]}"
fi

echo "[pre-commit] 完成（check-only，未修改或重新暂存文件）"
