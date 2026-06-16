#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/verify-env.sh --example
  bash deployments/yoyoosun/scripts/verify-env.sh --env-file /secure/path/yoyoosun/.env

作用:
  校验 yoyoosun env 样例或受控运行时 .env。

说明:
  --example 允许 placeholder。
  --env-file 会阻断 placeholder 和危险生产配置。
USAGE
}

mode=""
env_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --example)
    mode="example"
    env_file="deployments/yoyoosun/env/.env.example"
    shift
    ;;
  --env-file)
    mode="runtime"
    env_file="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[verify-env] 不支持的参数: $1"
    print_help
    exit 1
    ;;
  esac
done

if [[ -z "$mode" || -z "$env_file" ]]; then
  print_help
  exit 1
fi

root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root_dir"

if [[ ! -f "$env_file" ]]; then
  echo "[verify-env] 文件不存在: $env_file"
  exit 1
fi

required_keys=(
  PROJECT_SLUG
  APP_IMAGE
  WEB_IMAGE
  TZ
  POSTGRES_DSN
  POSTGRES_PASSWORD
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_DATA_DIR
  TRACE_ENDPOINT
  WEB_API_ORIGIN
  APP_JWT_SECRET
  APP_ADMIN_USERNAME
  BOOTSTRAP_ADMIN_ONCE
  ERP_DEBUG_ENV
  ERP_DEBUG_SEED_ENABLED
  ERP_DEBUG_CLEANUP_ENABLED
  ERP_DEBUG_CLEANUP_SCOPE
)

content="$(grep -vE '^[[:space:]]*(#|$)' "$env_file" || true)"

for key in "${required_keys[@]}"; do
  if ! grep -Eq "^${key}=" <<<"$content"; then
    echo "[verify-env] 缺少必需变量: $key"
    exit 1
  fi
done

if [[ "$mode" == "runtime" ]]; then
  if grep -Eiq '(change-this|<release-tag>|example\.invalid|placeholder)' "$env_file"; then
    echo "[verify-env] runtime env 仍包含 placeholder"
    exit 1
  fi

  declare -A values=()
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    values["$key"]="$value"
  done <<<"$content"

  if [[ "${values[ERP_DEBUG_ENV]:-}" != "prod" ]]; then
    echo "[verify-env] ERP_DEBUG_ENV 必须为 prod"
    exit 1
  fi
  if [[ "${values[ERP_DEBUG_SEED_ENABLED]:-}" != "false" ]]; then
    echo "[verify-env] ERP_DEBUG_SEED_ENABLED 必须为 false"
    exit 1
  fi
  if [[ "${values[ERP_DEBUG_CLEANUP_ENABLED]:-}" != "false" ]]; then
    echo "[verify-env] ERP_DEBUG_CLEANUP_ENABLED 必须为 false"
    exit 1
  fi
  if [[ "${values[BOOTSTRAP_ADMIN_ONCE]:-}" != "true" && "${values[BOOTSTRAP_ADMIN_ONCE]:-}" != "false" ]]; then
    echo "[verify-env] BOOTSTRAP_ADMIN_ONCE 必须为 true 或 false"
    exit 1
  fi
  if [[ -n "${values[APP_ADMIN_PASSWORD]:-}" && "${values[BOOTSTRAP_ADMIN_ONCE]:-}" != "true" ]]; then
    echo "[verify-env] APP_ADMIN_PASSWORD 只能在 BOOTSTRAP_ADMIN_ONCE=true 的首次初始化窗口临时注入"
    exit 1
  fi
  if [[ "${values[BOOTSTRAP_ADMIN_ONCE]:-}" == "true" && -z "${values[APP_ADMIN_PASSWORD]:-}" ]]; then
    echo "[verify-env] BOOTSTRAP_ADMIN_ONCE=true 时必须临时注入 APP_ADMIN_PASSWORD"
    exit 1
  fi
fi

echo "[verify-env] ok: $env_file ($mode)"
