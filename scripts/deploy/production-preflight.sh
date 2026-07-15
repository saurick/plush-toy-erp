#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env
  bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --runtime
  bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --out deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.txt
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
  --out <path>           同步写入脱敏检查报告；父目录必须已存在
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

sha256_file() {
  local path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
    return
  fi
  fail "缺少 sha256sum / shasum，无法校验 Chromium seccomp profile"
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
out_file=""

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
  --out)
    out_file="${2:-}"
    shift 2
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

if [[ -n "$out_file" ]]; then
  out_dir="$(dirname "$out_file")"
  [[ -d "$out_dir" ]] || fail "输出目录不存在: $out_dir"
  : >"$out_file"
  exec > >(tee "$out_file") 2>&1
fi

compose_file="$compose_dir/compose.yml"
migrate_script="$compose_dir/migrate_online.sh"
chromium_seccomp_profile="$compose_dir/chromium-seccomp.json"

[[ -n "$env_file" ]] || fail "必须传入 --env-file，或使用 --example 只检查样例结构"
[[ -f "$env_file" ]] || fail "env 文件不存在: $env_file"
[[ -f "$compose_file" ]] || fail "compose 文件不存在: $compose_file"
[[ -f "$migrate_script" ]] || fail "migration 脚本不存在: $migrate_script"

required_keys=(
  PROJECT_SLUG
  ERP_CUSTOMER_KEY
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
  MIGRATION_LOCK_FILE
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
  ERP_DEBUG_BUSINESS_CLEAR_ENABLED
  ERP_DEBUG_CLEANUP_SCOPE
  ERP_ALLOW_CUSTOMER_TRIAL_CONFIG
  ERP_CUSTOMER_TRIAL_TARGET
  ERP_PDF_WARMUP
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
  erp_debug_business_clear_enabled="$(value_of ERP_DEBUG_BUSINESS_CLEAR_ENABLED)"
  erp_allow_customer_trial_config="$(value_of ERP_ALLOW_CUSTOMER_TRIAL_CONFIG)"
  erp_customer_trial_target="$(value_of ERP_CUSTOMER_TRIAL_TARGET)"
  erp_pdf_warmup="$(value_of ERP_PDF_WARMUP | tr '[:upper:]' '[:lower:]')"
  jaeger_bind_addr="$(value_of JAEGER_BIND_ADDR)"
  postgres_bind_addr="$(value_of POSTGRES_BIND_ADDR)"
  app_http_bind_addr="$(value_of APP_HTTP_BIND_ADDR)"
  app_grpc_bind_addr="$(value_of APP_GRPC_BIND_ADDR)"
  postgres_dsn="$(value_of POSTGRES_DSN)"
  app_admin_password="$(value_of APP_ADMIN_PASSWORD)"
  bootstrap_admin_once="$(value_of BOOTSTRAP_ADMIN_ONCE)"
  trace_ratio="$(value_of TRACE_RATIO)"
  erp_customer_key="$(value_of ERP_CUSTOMER_KEY)"
  migration_lock_file="$(value_of MIGRATION_LOCK_FILE)"

  [[ "$erp_customer_key" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "ERP_CUSTOMER_KEY 必须是稳定小写 customer key"
  [[ "$erp_customer_key" != "current" ]] || fail "ERP_CUSTOMER_KEY 不能使用旧 current 别名"
  [[ "$migration_lock_file" == /* ]] || fail "MIGRATION_LOCK_FILE 必须是绝对路径"
  case "$migration_lock_file" in
  /tmp/* | /var/tmp/* | /dev/shm/*)
    fail "MIGRATION_LOCK_FILE 不得位于共享临时目录"
    ;;
  esac
  migration_lock_dir="$(dirname "$migration_lock_file")"
  [[ "$migration_lock_dir" != "/" && "$migration_lock_dir" != "/run/lock" ]] || fail "MIGRATION_LOCK_FILE 必须放在专用私有目录"
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
  [[ "$erp_debug_business_clear_enabled" == "false" ]] || fail "ERP_DEBUG_BUSINESS_CLEAR_ENABLED 必须为 false"
  [[ "$erp_allow_customer_trial_config" == "0" || "$erp_allow_customer_trial_config" == "1" ]] || fail "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG 必须为 0 或 1"
  if [[ "$erp_allow_customer_trial_config" == "1" ]]; then
    [[ "$erp_customer_trial_target" == "customer-trial-133" ]] || fail "远端验收客户配置只允许 target=customer-trial-133"
    [[ "$erp_customer_key" == "yoyoosun" ]] || fail "远端验收客户配置只允许 ERP_CUSTOMER_KEY=yoyoosun"
    [[ "$postgres_dsn" =~ ^postgres(ql)?://[^/@]+:[^@/]+@postgres:5432/plush_erp_uat_20260715\?sslmode=disable$ ]] || fail "远端验收客户配置 POSTGRES_DSN 必须精确指向单一 postgres:5432/plush_erp_uat_20260715，且只能使用 sslmode=disable"
  else
    [[ -z "$erp_customer_trial_target" ]] || fail "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0 时 ERP_CUSTOMER_TRIAL_TARGET 必须为空"
  fi
  [[ "$erp_pdf_warmup" == "async" ]] || fail "ERP_PDF_WARMUP 生产发布必须显式为 async；off 只允许故障隔离，不能作为 release-ready 配置"
  [[ "$postgres_bind_addr" == "127.0.0.1" ]] || fail "POSTGRES_BIND_ADDR 必须为 127.0.0.1，避免 PostgreSQL 暴露到公网或办公网"
  [[ "$app_http_bind_addr" == "127.0.0.1" ]] || fail "APP_HTTP_BIND_ADDR 必须为 127.0.0.1，外部流量应先进入前端 / 网关"
  [[ "$app_grpc_bind_addr" == "127.0.0.1" ]] || fail "APP_GRPC_BIND_ADDR 必须为 127.0.0.1，避免 gRPC 直接暴露到公网或办公网"
  [[ "$jaeger_bind_addr" == "127.0.0.1" ]] || fail "JAEGER_BIND_ADDR 必须为 127.0.0.1，避免 Jaeger 暴露到公网或办公网"
  [[ "$postgres_dsn" == postgres://* || "$postgres_dsn" == postgresql://* ]] || fail "POSTGRES_DSN 必须是 postgres/postgresql URL"
  [[ "$bootstrap_admin_once" == "true" || "$bootstrap_admin_once" == "false" ]] || fail "BOOTSTRAP_ADMIN_ONCE 必须为 true 或 false"

  if [[ -n "$app_admin_password" ]]; then
    [[ "$app_admin_password" != "adminadmin" ]] || fail "APP_ADMIN_PASSWORD 不得使用已知的本地开发默认密码"
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
  ok "PDF warmup=async 发布边界通过"
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
grep -Fq 'seccomp=./chromium-seccomp.json' "$compose_file" || fail "Compose app-server 必须使用固定 Chromium seccomp profile"
if grep -Eq 'seccomp[=:][[:space:]]*unconfined|apparmor[=:][[:space:]]*unconfined|privileged:[[:space:]]*true|SYS_ADMIN' "$compose_file"; then
  fail "Compose app-server 不得关闭 seccomp / AppArmor、启用 privileged 或授予 SYS_ADMIN"
fi
[[ -f "$chromium_seccomp_profile" ]] || fail "缺少 Chromium seccomp profile: $chromium_seccomp_profile"
chromium_seccomp_sha256="$(sha256_file "$chromium_seccomp_profile")"
[[ "$chromium_seccomp_sha256" == "31a5d2fa9743f7ae2461df9e47460d895daee2a575b3a577838e11560b52c4fc" ]] || fail "Chromium seccomp profile 已漂移，必须重新评审并更新门禁"
grep -q '/usr/local/bin/atlas' "$migrate_script" || fail "migration 脚本必须使用宿主机 /usr/local/bin/atlas"
grep -q 'flock' "$migrate_script" || fail "migration 脚本必须使用 flock 串行化"
grep -q '^umask 077$' "$migrate_script" || fail "migration 脚本必须使用 umask 077 创建私有锁"
grep -Fq '/run/lock/plush-toy-erp/atlas-migrate.lock' "$migrate_script" || fail "migration 脚本默认锁必须位于专用 /run/lock 子目录"
grep -Fq "[ -L \"\$MIGRATION_LOCK_FILE\" ]" "$migrate_script" || fail "migration 脚本必须拒绝符号链接锁文件"
grep -Fq "exec 9>>\"\$MIGRATION_LOCK_FILE\"" "$migrate_script" || fail "migration 脚本锁文件不得被截断"
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

  app_cid=""
  for service in postgres jaeger app-server web-desktop; do
    cid="$("${compose_cmd[@]}" ps -q "$service" 2>/dev/null | head -n1 || true)"
    [[ -n "$cid" ]] || fail "运行态缺少 Compose 服务: $service"
    if [[ "$service" == "app-server" ]]; then
      app_cid="$cid"
    fi
  done
  ok "Compose 运行服务存在"

  runtime_app_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_cid" 2>/dev/null || true)"
  runtime_pdf_warmup="$(printf '%s\n' "$runtime_app_env" | awk -F= '$1 == "ERP_PDF_WARMUP" { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
  runtime_pdf_warmup="$(trim "$runtime_pdf_warmup" | tr '[:upper:]' '[:lower:]')"
  [[ "$runtime_pdf_warmup" == "async" ]] || fail "app-server 运行态 ERP_PDF_WARMUP 必须为 async：runtime=${runtime_pdf_warmup:-missing}"
  ok "运行态 ERP_PDF_WARMUP=async"

  runtime_app_user="$(docker inspect --format '{{.Config.User}}' "$app_cid" 2>/dev/null || true)"
  runtime_app_user="$(trim "$runtime_app_user")"
  [[ -n "$runtime_app_user" ]] || fail "app-server 运行态未声明非 root 用户"
  if [[ "$runtime_app_user" == "0" || "$runtime_app_user" == 0:* || "$runtime_app_user" == "root" || "$runtime_app_user" == root:* ]]; then
    fail "app-server 运行态禁止使用 root: runtime_user=$runtime_app_user"
  fi
  runtime_app_uid="$(docker exec "$app_cid" id -u 2>/dev/null || true)"
  runtime_app_uid="$(trim "$runtime_app_uid")"
  [[ "$runtime_app_uid" =~ ^[1-9][0-9]*$ ]] || fail "app-server 运行态 uid 必须是非 root 数字：runtime_uid=${runtime_app_uid:-missing}"
  ok "运行态 app-server 使用非 root 用户: $runtime_app_user (uid=$runtime_app_uid)"

  runtime_security_opt="$(docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$app_cid" 2>/dev/null || true)"
  [[ "$runtime_security_opt" == *seccomp* ]] || fail "app-server 运行态未加载 Chromium seccomp profile"
  [[ "$runtime_security_opt" != *unconfined* ]] || fail "app-server 运行态禁止关闭 seccomp / AppArmor"
  ok "运行态 app-server 已加载受控 Chromium seccomp profile"

  chromium_dockerfile="$root_dir/server/Dockerfile"
  [[ -f "$chromium_dockerfile" ]] || fail "缺少 Chromium 版本真源: $chromium_dockerfile"
  expected_chromium_version="$(sed -nE 's/^ARG CHROMIUM_VERSION=([^[:space:]]+)$/\1/p' "$chromium_dockerfile" | head -n1)"
  [[ -n "$expected_chromium_version" ]] || fail "server/Dockerfile 缺少 CHROMIUM_VERSION exact pin"
  runtime_chromium_version="$(docker exec "$app_cid" dpkg-query -W '-f=${Version}' chromium 2>/dev/null || true)"
  runtime_chromium_version="$(trim "$runtime_chromium_version")"
  runtime_chromium_common_version="$(docker exec "$app_cid" dpkg-query -W '-f=${Version}' chromium-common 2>/dev/null || true)"
  runtime_chromium_common_version="$(trim "$runtime_chromium_common_version")"
  [[ -n "$runtime_chromium_version" ]] || fail "app-server 无法读取 Chromium dpkg 版本"
  [[ -n "$runtime_chromium_common_version" ]] || fail "app-server 无法读取 chromium-common dpkg 版本"
  [[ "$runtime_chromium_version" == "$expected_chromium_version" ]] || fail "app-server Chromium 版本不匹配：runtime=$runtime_chromium_version expected=$expected_chromium_version"
  [[ "$runtime_chromium_common_version" == "$expected_chromium_version" ]] || fail "app-server chromium-common 版本不匹配：runtime=$runtime_chromium_common_version expected=$expected_chromium_version"
  ok "运行态 Chromium / chromium-common 版本与 Docker exact pin 一致: $runtime_chromium_version"

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
