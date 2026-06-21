#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env
  bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --runtime
  bash scripts/deploy/production-preflight.sh --example

作用:
  生产发布前门禁。默认检查生产 .env、Compose、migration 脚本和低配部署边界；
  --runtime 会额外检查当前 Compose 服务和 /healthz /readyz。

参数:
  --env-file <path>      生产运行时 env 文件；该模式阻断 placeholder
  --compose-dir <path>   Compose 目录，默认 server/deploy/compose/prod
  --runtime              额外检查容器运行状态和健康检查
  --example              只检查 .env.example 结构，允许 placeholder，不能当生产放行
  --skip-compose-config  跳过 docker compose config -q
USAGE
}

fail() {
  echo "[production-preflight] ERROR: $*" >&2
  exit 1
}

warn() {
  echo "[production-preflight] WARN: $*" >&2
}

ok() {
  echo "[production-preflight] ok: $*"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf "%s" "$value"
}

root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
compose_dir="server/deploy/compose/prod"
env_file=""
mode="runtime-env"
runtime_check=0
skip_compose_config=0

while [[ $# -gt 0 ]]; do
  case "$1" in
  --env-file)
    env_file="${2:-}"
    shift 2
    ;;
  --compose-dir)
    compose_dir="${2:-}"
    shift 2
    ;;
  --runtime)
    runtime_check=1
    shift
    ;;
  --example)
    mode="example"
    env_file="$compose_dir/.env.example"
    shift
    ;;
  --skip-compose-config)
    skip_compose_config=1
    shift
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    fail "不支持的参数: $1"
    ;;
  esac
done

cd "$root_dir"

compose_file="$compose_dir/compose.yml"
migrate_script="$compose_dir/migrate_online.sh"

[[ -n "$env_file" ]] || fail "必须传入 --env-file，或使用 --example 只检查样例结构"
[[ -f "$env_file" ]] || fail "env 文件不存在: $env_file"
[[ -f "$compose_file" ]] || fail "compose 文件不存在: $compose_file"
[[ -f "$migrate_script" ]] || fail "migration 脚本不存在: $migrate_script"

required_keys=(
  PROJECT_SLUG
  APP_IMAGE
  WEB_IMAGE
  POSTGRES_IMAGE
  JAEGER_IMAGE
  TZ
  POSTGRES_DSN
  POSTGRES_PASSWORD
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_DATA_DIR
  POSTGRES_BIND_ADDR
  TRACE_ENDPOINT
  TRACE_RATIO
  WEB_API_ORIGIN
  APP_HTTP_BIND_ADDR
  APP_GRPC_BIND_ADDR
  APP_JWT_SECRET
  APP_AUTH_SMS_MODE
  APP_ADMIN_USERNAME
  BOOTSTRAP_ADMIN_ONCE
  ERP_DEBUG_ENV
  ERP_DEBUG_SEED_ENABLED
  ERP_DEBUG_CLEANUP_ENABLED
  ERP_DEBUG_CLEANUP_SCOPE
  JAEGER_BIND_ADDR
)

normalized_env="$(mktemp)"
trap 'rm -f "$normalized_env"' EXIT

while IFS='=' read -r raw_key raw_value; do
  key="$(trim "$(printf '%s' "$raw_key" | sed -E 's/^[[:space:]]*export[[:space:]]+//')")"
  value="$(trim "${raw_value:-}")"
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  printf '%s=%s\n' "$key" "$value" >>"$normalized_env"
done < <(grep -vE '^[[:space:]]*(#|$)' "$env_file" || true)

has_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { found = 1 } END { exit !found }' "$normalized_env"
}

value_of() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "")
      value = $0
    }
    END {
      print value
    }
  ' "$normalized_env"
}

for key in "${required_keys[@]}"; do
  has_value "$key" || fail "缺少必需变量: $key"
done
ok "env 必需变量齐全"

if [[ "$mode" == "example" ]]; then
  ok "example 模式仅检查结构，不作为生产放行"
else
  placeholder_pattern='(change-this|placeholder|replace-with|<release-tag>|example\.invalid)'
  for key in POSTGRES_DSN POSTGRES_PASSWORD APP_JWT_SECRET APP_IMAGE WEB_IMAGE POSTGRES_IMAGE JAEGER_IMAGE POSTGRES_DATA_DIR WEB_API_ORIGIN; do
    value="$(value_of "$key")"
    if grep -Eiq "$placeholder_pattern" <<<"$value"; then
      fail "$key 仍包含 placeholder"
    fi
  done

  app_jwt_secret="$(value_of APP_JWT_SECRET)"
  app_image="$(value_of APP_IMAGE)"
  web_image="$(value_of WEB_IMAGE)"
  postgres_image="$(value_of POSTGRES_IMAGE)"
  jaeger_image="$(value_of JAEGER_IMAGE)"
  app_auth_sms_mode="$(value_of APP_AUTH_SMS_MODE | tr '[:upper:]' '[:lower:]')"
  erp_debug_env="$(value_of ERP_DEBUG_ENV)"
  erp_debug_seed_enabled="$(value_of ERP_DEBUG_SEED_ENABLED)"
  erp_debug_cleanup_enabled="$(value_of ERP_DEBUG_CLEANUP_ENABLED)"
  jaeger_bind_addr="$(value_of JAEGER_BIND_ADDR)"
  postgres_bind_addr="$(value_of POSTGRES_BIND_ADDR)"
  app_http_bind_addr="$(value_of APP_HTTP_BIND_ADDR)"
  app_grpc_bind_addr="$(value_of APP_GRPC_BIND_ADDR)"
  postgres_dsn="$(value_of POSTGRES_DSN)"
  app_admin_password="$(value_of APP_ADMIN_PASSWORD)"
  bootstrap_admin_once="$(value_of BOOTSTRAP_ADMIN_ONCE)"
  trace_ratio="$(value_of TRACE_RATIO)"

  [[ "${#app_jwt_secret}" -ge 32 ]] || fail "APP_JWT_SECRET 至少需要 32 字符"
  [[ "$app_image" != *":dev" && "$app_image" != *":latest" ]] || fail "APP_IMAGE 不能使用 :dev 或 :latest"
  [[ "$web_image" != *":dev" && "$web_image" != *":latest" ]] || fail "WEB_IMAGE 不能使用 :dev 或 :latest"
  [[ "$postgres_image" != *":dev" && "$postgres_image" != *":latest" ]] || fail "POSTGRES_IMAGE 不能使用 :dev 或 :latest"
  [[ "$jaeger_image" != *":dev" && "$jaeger_image" != *":latest" ]] || fail "JAEGER_IMAGE 不能使用 :dev 或 :latest"
  [[ "$app_auth_sms_mode" != "mock" ]] || fail "APP_AUTH_SMS_MODE 生产环境不能使用 mock"
  if [[ "$app_auth_sms_mode" == "provider" ]]; then
    provider_required_keys=(
      APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID
      APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET
      APP_AUTH_SMS_ALIYUN_SIGN_NAME
      APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE
    )
    for key in "${provider_required_keys[@]}"; do
      has_value "$key" || fail "APP_AUTH_SMS_MODE=provider 时缺少必需变量: $key"
      value="$(value_of "$key")"
      [[ -n "$value" ]] || fail "APP_AUTH_SMS_MODE=provider 时 $key 不能为空"
      if grep -Eiq "$placeholder_pattern" <<<"$value"; then
        fail "$key 仍包含 placeholder"
      fi
    done
  fi
  [[ "$erp_debug_env" == "prod" ]] || fail "ERP_DEBUG_ENV 必须为 prod"
  [[ "$erp_debug_seed_enabled" == "false" ]] || fail "ERP_DEBUG_SEED_ENABLED 必须为 false"
  [[ "$erp_debug_cleanup_enabled" == "false" ]] || fail "ERP_DEBUG_CLEANUP_ENABLED 必须为 false"
  [[ "$postgres_bind_addr" == "127.0.0.1" ]] || fail "POSTGRES_BIND_ADDR 必须为 127.0.0.1，避免 PostgreSQL 暴露到公网或办公网"
  [[ "$app_http_bind_addr" == "127.0.0.1" ]] || fail "APP_HTTP_BIND_ADDR 必须为 127.0.0.1，外部流量应先进入前端 / 网关"
  [[ "$app_grpc_bind_addr" == "127.0.0.1" ]] || fail "APP_GRPC_BIND_ADDR 必须为 127.0.0.1，避免 gRPC 直接暴露到公网或办公网"
  [[ "$jaeger_bind_addr" == "127.0.0.1" ]] || fail "JAEGER_BIND_ADDR 必须为 127.0.0.1，避免 Jaeger 暴露到公网或办公网"
  [[ "$postgres_dsn" == postgres://* || "$postgres_dsn" == postgresql://* ]] || fail "POSTGRES_DSN 必须是 postgres/postgresql URL"
  [[ "$bootstrap_admin_once" == "true" || "$bootstrap_admin_once" == "false" ]] || fail "BOOTSTRAP_ADMIN_ONCE 必须为 true 或 false"

  if [[ -n "$app_admin_password" ]]; then
    if grep -Eiq "$placeholder_pattern" <<<"$app_admin_password"; then
      fail "APP_ADMIN_PASSWORD 仍包含 placeholder"
    fi
    [[ "${#app_admin_password}" -ge 8 ]] || fail "APP_ADMIN_PASSWORD 至少需要 8 字符"
    [[ "$bootstrap_admin_once" == "true" ]] || fail "APP_ADMIN_PASSWORD 只能在 BOOTSTRAP_ADMIN_ONCE=true 的首次初始化窗口临时注入"
  fi
  if [[ "$bootstrap_admin_once" == "true" && -z "$app_admin_password" ]]; then
    fail "BOOTSTRAP_ADMIN_ONCE=true 时必须临时注入 APP_ADMIN_PASSWORD"
  fi

  if ! awk -v ratio="$trace_ratio" 'BEGIN { exit !(ratio + 0 >= 0 && ratio + 0 <= 1) }'; then
    fail "TRACE_RATIO 必须在 0 到 1 之间"
  fi
  ok "生产 secret、镜像 tag、debug、后端端口和 PostgreSQL / Jaeger 暴露边界通过"
fi

if grep -Eq '^[[:space:]]+build:' "$compose_file"; then
  fail "生产 Compose 不允许包含 build:，低配服务器只 docker load / restart"
fi
if grep -Eq 'image:.*:latest' "$compose_file"; then
  fail "生产 Compose 不允许直接使用 :latest 镜像"
fi
grep -q 'JAEGER_BIND_ADDR:-127.0.0.1' "$compose_file" || fail "Compose Jaeger 端口必须默认绑定 127.0.0.1"
grep -q 'POSTGRES_BIND_ADDR:-127.0.0.1' "$compose_file" || fail "Compose PostgreSQL 端口必须默认绑定 127.0.0.1"
grep -q 'APP_HTTP_BIND_ADDR:-127.0.0.1' "$compose_file" || fail "Compose app HTTP 端口必须默认绑定 127.0.0.1"
grep -q 'APP_GRPC_BIND_ADDR:-127.0.0.1' "$compose_file" || fail "Compose app gRPC 端口必须默认绑定 127.0.0.1"
grep -q '/usr/local/bin/atlas' "$migrate_script" || fail "migration 脚本必须使用宿主机 /usr/local/bin/atlas"
grep -q 'flock' "$migrate_script" || fail "migration 脚本必须使用 flock 串行化"
[[ -x "$migrate_script" ]] || fail "migration 脚本不可执行: $migrate_script"
ok "Compose、低配部署边界和 migration 脚本通过"

if [[ "$skip_compose_config" -eq 0 ]]; then
  if docker compose version >/dev/null 2>&1; then
    docker compose --env-file "$env_file" -f "$compose_file" config -q
    ok "docker compose config -q 通过"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose --env-file "$env_file" -f "$compose_file" config -q
    ok "docker-compose config -q 通过"
  elif [[ "$mode" == "example" ]]; then
    warn "未找到 docker compose，example 模式跳过 compose config"
  else
    fail "未找到 docker compose / docker-compose"
  fi
fi

if [[ "$runtime_check" -eq 1 ]]; then
  command -v docker >/dev/null 2>&1 || fail "--runtime 需要 docker"
  if docker compose version >/dev/null 2>&1; then
    compose_cmd=(docker compose --env-file "$env_file" -f "$compose_file")
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_cmd=(docker-compose --env-file "$env_file" -f "$compose_file")
  else
    fail "--runtime 需要 docker compose / docker-compose"
  fi

  for service in postgres jaeger app-server web-desktop; do
    cid="$("${compose_cmd[@]}" ps -q "$service" 2>/dev/null | head -n1 || true)"
    [[ -n "$cid" ]] || fail "运行态缺少 Compose 服务: $service"
  done
  ok "Compose 运行服务存在"

  if command -v curl >/dev/null 2>&1; then
    app_port="$(value_of APP_HTTP_PORT)"
    app_port="${app_port:-8300}"
    curl -fsS "http://127.0.0.1:${app_port}/healthz" >/dev/null || fail "healthz 失败"
    curl -fsS "http://127.0.0.1:${app_port}/readyz" >/dev/null || fail "readyz 失败"
    ok "healthz / readyz 通过"
  else
    warn "未找到 curl，跳过 healthz / readyz"
  fi
fi

echo "[production-preflight] all checks passed"
