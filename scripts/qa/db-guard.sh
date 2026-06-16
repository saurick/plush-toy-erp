#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/qa/db-guard.sh

作用:
  防止 Ent schema/ent 结构变更遗漏 migration 文件

触发规则:
  变更包含 server/internal/data/model/schema/* 中的字段、边、索引或注解等结构性变更
  但不包含 server/internal/data/model/migrate/* 时阻断
  仅新增 Ent Hook 等非 SQL 结构变更时不要求 migration

环境变量:
  SKIP_DB_GUARD=1    跳过检查
  QA_BASE_RANGE=...  指定 diff 范围（例：origin/master...HEAD）
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "[qa:db-guard] 不支持的参数: $*"
  print_help
  exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ "${SKIP_DB_GUARD:-0}" == "1" ]]; then
  echo "[qa:db-guard] SKIP_DB_GUARD=1，跳过"
  exit 0
fi

if [ ! -d "$ROOT_DIR/server/internal/data/model" ]; then
  echo "[qa:db-guard] 未发现 server/internal/data/model，跳过"
  exit 0
fi

range="${QA_BASE_RANGE:-}"
if [ -z "$range" ]; then
  if git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" >/dev/null 2>&1; then
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}")"
    range="${upstream}...HEAD"
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    range="HEAD~1...HEAD"
  fi
fi

changed_files=()
if [ -n "$range" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && changed_files+=("$f")
  done < <(git diff --name-only "$range")
fi

while IFS= read -r f; do
  [ -n "$f" ] && changed_files+=("$f")
done < <(git diff --name-only)

while IFS= read -r f; do
  [ -n "$f" ] && changed_files+=("$f")
done < <(git diff --name-only --cached)

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "[qa:db-guard] 未检测到变更，跳过"
  exit 0
fi

uniq_files=()
while IFS= read -r f; do
  [ -n "$f" ] && uniq_files+=("$f")
done < <(printf "%s\n" "${changed_files[@]}" | sort -u)

schema_change=0
ent_change=0
schema_requires_migration=0
has_migration_file=0

schema_change_requires_migration() {
  local file="$1"
  local diff_lines
  diff_lines="$(
    {
      if [ -n "$range" ]; then
        git diff --unified=0 "$range" -- "$file"
      fi
      git diff --unified=0 -- "$file"
      git diff --cached --unified=0 -- "$file"
    } | sed -n '/^[+-][^+-]/p'
  )"

  [ -n "$diff_lines" ] || return 1

  printf "%s\n" "$diff_lines" | grep -Eq '^[+-].*(field\.|edge\.|index\.|func \([^)]*\) (Fields|Edges|Indexes|Mixin|Annotations)\(|\.(Unique|Optional|Nillable|Default|DefaultFunc|UpdateDefault|MaxLen|MinLen|Positive|NonNegative|SchemaType|StorageKey|Comment|Annotations|Immutable|GoType|Enum|Values|NotEmpty|Match)\()'
}

for f in "${uniq_files[@]}"; do
  case "$f" in
  server/internal/data/model/schema/*)
    schema_change=1
    if schema_change_requires_migration "$f"; then
      schema_requires_migration=1
    fi
    ;;
  server/internal/data/model/ent/*)
    ent_change=1
    ;;
  esac

  case "$f" in
  server/internal/data/model/migrate/*)
    has_migration_file=1
    ;;
  esac
done

need_migration=0
if [ "$schema_requires_migration" -eq 1 ]; then
  need_migration=1
elif [ "$ent_change" -eq 1 ] && [ "$schema_change" -eq 0 ]; then
  need_migration=1
fi

if [ "$need_migration" -eq 1 ] && [ "$has_migration_file" -eq 0 ]; then
  echo "[qa:db-guard] 检测到 schema/ent 结构变更但未发现 migration 变更"
  echo "[qa:db-guard] 请先在 /server 执行 make data，并提交生成的迁移文件"
  exit 1
fi

echo "[qa:db-guard] 通过"
