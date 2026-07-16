#!/usr/bin/env bash
set -euo pipefail
umask 077

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
  --compose-override <path>
                         仅 133 V5 隔离验收栈使用的受控 Compose project override
  --runtime              额外检查容器运行状态和健康检查
  --expected-release <40sha>
                         runtime 期望的不可变 Git release；133 V5 必须显式传入
  --example              只检查 .env.example 结构，允许 placeholder，不能当生产放行
  --skip-compose-config  仅 example / 非 runtime 诊断可跳过 Compose config；133 V5 与 --runtime 禁止跳过
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
  fail "缺少 sha256sum / shasum，无法执行 SHA-256 完整性校验"
}

utf8_codepoint_count() {
  local value="$1"
  local utf32_bytes
  command -v iconv >/dev/null 2>&1 || fail "缺少 iconv，无法按 UTF-8 字符校验管理员密码"
  if ! utf32_bytes="$(printf "%s" "$value" | iconv -f UTF-8 -t UTF-32LE 2>/dev/null | wc -c | tr -d '[:space:]')"; then
    fail "APP_ADMIN_PASSWORD 必须是有效 UTF-8"
  fi
  [[ "$utf32_bytes" =~ ^[0-9]+$ && $((utf32_bytes % 4)) -eq 0 ]] || fail "APP_ADMIN_PASSWORD UTF-8 字符计数失败"
  printf "%s" "$((utf32_bytes / 4))"
}

byte_count() {
  LC_ALL=C printf "%s" "$1" | wc -c | tr -d '[:space:]'
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

validate_absolute_path_without_aliases() {
  local label="$1"
  local path="$2"
  local remaining=""
  local component=""
  local current=""

  [[ "$path" == /* ]] || fail "$label 必须是绝对路径"
  [[ "$path" != "/" && "$path" != */ ]] || fail "$label 必须指向专用路径"
  case "$path" in
  *//* | */./* | */../* | */. | */..)
    fail "$label 不得包含重复分隔符或 . / .. 路径段"
    ;;
  esac

  # macOS 本机只能静态审查 133 的 /home/simon 合同；它的 /home 是本机 automount，
  # 不是目标机文件系统证据。在 133/Linux 执行时仍会逐段检查所有已存在的父路径。
  if [[ "$(uname -s)" == "Darwin" && "$path" == /home/simon/plush-toy-erp-v5/* && ! -e /home/simon ]]; then
    return
  fi

  remaining="${path#/}"
  while [[ -n "$remaining" ]]; do
    if [[ "$remaining" == */* ]]; then
      component="${remaining%%/*}"
      remaining="${remaining#*/}"
    else
      component="$remaining"
      remaining=""
    fi
    current="$current/$component"
    [[ ! -L "$current" ]] || fail "$label 不得经过符号链接: $current"
    [[ -e "$current" ]] || break
  done
}

path_owner_uid() {
  local path="$1"
  local owner_uid=""
  owner_uid="$(stat -c '%u' "$path" 2>/dev/null || true)"
  if [[ -z "$owner_uid" ]]; then
    owner_uid="$(stat -f '%u' "$path" 2>/dev/null || true)"
  fi
  [[ -n "$owner_uid" ]] || fail "无法读取文件所有者"
  printf '%s' "$owner_uid"
}

path_mode() {
  local path="$1"
  local mode_value=""
  mode_value="$(stat -c '%a' "$path" 2>/dev/null || true)"
  if [[ -z "$mode_value" ]]; then
    mode_value="$(stat -f '%Lp' "$path" 2>/dev/null || true)"
  fi
  [[ -n "$mode_value" ]] || fail "无法读取文件权限"
  printf '%s' "$mode_value"
}

root_dir="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
compose_dir="server/deploy/compose/prod"
compose_override=""
env_file=""
mode="runtime-env"
runtime_check=0
skip_compose_config=0
out_file=""
expected_release=""
env_source_file=""
env_source_owner_uid=""
env_source_mode=""
env_source_sha256=""
env_snapshot=""
normalized_env=""

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
  --compose-override)
    compose_override="${2:-}"
    shift 2
    ;;
  --runtime)
    runtime_check=1
    shift
    ;;
  --expected-release)
    expected_release="${2:-}"
    shift 2
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
trial_compose_override="$compose_dir/compose.customer-trial-133.yml"
migrate_script="$compose_dir/migrate_online.sh"
chromium_seccomp_profile="$compose_dir/chromium-seccomp.json"

[[ -n "$env_file" ]] || fail "必须传入 --env-file，或使用 --example 只检查样例结构"
if [[ "$env_file" == /* ]]; then
  env_source_file="$env_file"
else
  env_source_file="$root_dir/$env_file"
fi
validate_absolute_path_without_aliases "env 文件" "$env_source_file"
[[ -f "$env_source_file" && ! -L "$env_source_file" ]] || fail "env 文件不存在、不是普通文件或是符号链接"
env_source_owner_uid="$(path_owner_uid "$env_source_file")"
env_source_mode="$(path_mode "$env_source_file")"
[[ "$env_source_owner_uid" == "$(id -u)" ]] || fail "env 文件必须归当前执行用户所有"
if [[ "$mode" != "example" ]]; then
  [[ "$env_source_mode" == "600" ]] || fail "生产 env 文件权限必须为 0600"
fi
env_source_sha256="$(sha256_file "$env_source_file")"
env_snapshot="$(mktemp)"
normalized_env="$(mktemp)"
trap 'rm -f "$env_snapshot" "$normalized_env"' EXIT
chmod 600 "$env_snapshot" "$normalized_env"
cp "$env_source_file" "$env_snapshot"
env_snapshot_sha256="$(sha256_file "$env_snapshot")"
env_source_sha256_after_copy="$(sha256_file "$env_source_file")"
[[ "$env_snapshot_sha256" == "$env_source_sha256" && "$env_source_sha256_after_copy" == "$env_source_sha256" ]] || fail "env 文件在快照期间发生变化"
[[ "$(path_owner_uid "$env_source_file")" == "$env_source_owner_uid" && "$(path_mode "$env_source_file")" == "$env_source_mode" ]] || fail "env 文件属性在快照期间发生变化"
env_file="$env_snapshot"

assert_env_source_unchanged() {
  validate_absolute_path_without_aliases "env 文件" "$env_source_file"
  [[ -f "$env_source_file" && ! -L "$env_source_file" ]] || fail "env 文件在检查期间被替换"
  [[ "$(path_owner_uid "$env_source_file")" == "$env_source_owner_uid" ]] || fail "env 文件所有者在检查期间发生变化"
  [[ "$(path_mode "$env_source_file")" == "$env_source_mode" ]] || fail "env 文件权限在检查期间发生变化"
  [[ "$(sha256_file "$env_source_file")" == "$env_source_sha256" ]] || fail "env 文件内容在检查期间发生变化"
}

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

while IFS='=' read -r raw_key raw_value; do
  key="$(trim "$(printf '%s' "$raw_key" | sed -E 's/^[[:space:]]*export[[:space:]]+//')")"
  value="$(trim "${raw_value:-}")"
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || fail "env 文件包含无效变量名"
  printf '%s=%s\n' "$key" "$value" >>"$normalized_env"
done < <(grep -vE '^[[:space:]]*(#|$)' "$env_file" || true)

duplicate_env_key="$(awk -F= '{ count[$1]++ } END { for (key in count) if (count[key] > 1) { print key; exit } }' "$normalized_env")"
[[ -z "$duplicate_env_key" ]] || fail "env 文件包含重复变量: $duplicate_env_key"

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

if [[ "$mode" != "example" ]]; then
  compose_docker_control_keys=(
    COMPOSE_PROJECT_NAME
    COMPOSE_FILE
    COMPOSE_PROFILES
    COMPOSE_ENV_FILES
    COMPOSE_PATH_SEPARATOR
    DOCKER_HOST
    DOCKER_CONTEXT
    DOCKER_TLS_VERIFY
    DOCKER_CERT_PATH
  )
  for key in "${compose_docker_control_keys[@]}"; do
    has_value "$key" && fail "运行 env 文件禁止定义 Compose / Docker 控制变量: $key"
    [[ -z "${!key+x}" ]] || fail "宿主环境变量会改写受控 Compose 运行身份，请 unset 后重试: $key"
  done

  ambient_env_conflict=""
  while IFS= read -r key; do
    if [[ -n "${!key+x}" ]]; then
      ambient_env_conflict="$key"
      break
    fi
  done < <(awk -F= '{ print $1 }' "$normalized_env")
  [[ -z "$ambient_env_conflict" ]] || fail "宿主环境变量会覆盖受控 env-file，请 unset 后重试: $ambient_env_conflict"
  ok "宿主环境无 env-file / Compose / Docker 同名覆盖"
fi

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
  postgres_data_dir="$(value_of POSTGRES_DATA_DIR)"
  postgres_database="$(value_of POSTGRES_DB)"
  project_slug="$(value_of PROJECT_SLUG)"

  [[ "$erp_customer_key" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "ERP_CUSTOMER_KEY 必须是稳定小写 customer key"
  [[ "$erp_customer_key" != "current" ]] || fail "ERP_CUSTOMER_KEY 不能使用旧 current 别名"
  validate_absolute_path_without_aliases "POSTGRES_DATA_DIR" "$postgres_data_dir"
  case "$migration_lock_file" in
  /tmp/* | /var/tmp/* | /dev/shm/*)
    fail "MIGRATION_LOCK_FILE 不得位于共享临时目录"
    ;;
  esac
  validate_absolute_path_without_aliases "MIGRATION_LOCK_FILE" "$migration_lock_file"
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
    [[ "$project_slug" == "plush-toy-erp-v5" ]] || fail "customer-trial-133 必须使用独立 PROJECT_SLUG=plush-toy-erp-v5"
    [[ "$postgres_database" == "plush_erp_uat_20260716_v5" ]] || fail "customer-trial-133 必须使用独立 POSTGRES_DB=plush_erp_uat_20260716_v5"
    [[ "$postgres_dsn" =~ ^postgres(ql)?://[^/@]+:[^@/]+@postgres:5432/plush_erp_uat_20260716_v5\?sslmode=disable$ ]] || fail "远端验收客户配置 POSTGRES_DSN 必须精确指向单一 postgres:5432/plush_erp_uat_20260716_v5，且只能使用 sslmode=disable"
    [[ "$postgres_data_dir" == "/home/simon/plush-toy-erp-v5/data/postgres" ]] || fail "customer-trial-133 必须使用独立 POSTGRES_DATA_DIR=/home/simon/plush-toy-erp-v5/data/postgres"
    [[ "$migration_lock_file" == "/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock" ]] || fail "customer-trial-133 必须使用独立 MIGRATION_LOCK_FILE=/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock"
    for trial_port in \
      POSTGRES_PORT=55435 \
      APP_HTTP_PORT=8315 \
      APP_GRPC_PORT=9315 \
      WEB_DESKTOP_PORT=5185 \
      JAEGER_5775_PORT=45775 \
      JAEGER_6831_PORT=46831 \
      JAEGER_6832_PORT=46832 \
      JAEGER_5778_PORT=45778 \
      JAEGER_UI_PORT=46687 \
      JAEGER_14268_PORT=54268 \
      JAEGER_14250_PORT=54250 \
      JAEGER_9411_PORT=49411 \
      JAEGER_OTLP_GRPC_PORT=44317 \
      JAEGER_OTLP_HTTP_PORT=44318; do
      trial_port_key="${trial_port%%=*}"
      trial_port_expected="${trial_port#*=}"
      trial_port_actual="$(value_of "$trial_port_key")"
      [[ "$trial_port_actual" == "$trial_port_expected" ]] || fail "customer-trial-133 必须使用独立 ${trial_port_key}=${trial_port_expected}"
    done

    [[ -n "$compose_override" ]] || fail "customer-trial-133 必须显式传入 --compose-override $trial_compose_override"
    [[ -f "$compose_override" ]] || fail "customer-trial-133 Compose override 不存在: $compose_override"
    [[ ! -L "$compose_override" ]] || fail "customer-trial-133 Compose override 不得是符号链接"
    compose_override_real="$(cd "$(dirname "$compose_override")" && printf '%s/%s' "$(pwd -P)" "$(basename "$compose_override")")"
    trial_compose_override_real="$(cd "$(dirname "$trial_compose_override")" && printf '%s/%s' "$(pwd -P)" "$(basename "$trial_compose_override")")"
    [[ "$compose_override_real" == "$trial_compose_override_real" ]] || fail "customer-trial-133 只能使用受控 Compose override: $trial_compose_override"
    compose_override_contract="$(awk '
      {
        line = $0
        sub(/^[[:space:]]+/, "", line)
        sub(/[[:space:]]+$/, "", line)
        if (line != "" && line !~ /^#/) print line
      }
    ' "$compose_override")"
    [[ "$compose_override_contract" == "name: plush-toy-erp-v5" ]] || fail "customer-trial-133 Compose override 只能声明 name: plush-toy-erp-v5"
  else
    [[ -z "$erp_customer_trial_target" ]] || fail "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0 时 ERP_CUSTOMER_TRIAL_TARGET 必须为空"
    [[ -z "$compose_override" ]] || fail "非 customer-trial-133 运行禁止传入 Compose override"
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
    app_admin_password_chars="$(utf8_codepoint_count "$app_admin_password")"
    app_admin_password_bytes="$(byte_count "$app_admin_password")"
    [[ "$app_admin_password_chars" -ge 8 && "$app_admin_password_chars" -le 20 ]] || fail "APP_ADMIN_PASSWORD 必须为 8 到 20 字符"
    [[ "$app_admin_password_bytes" -le 72 ]] || fail "APP_ADMIN_PASSWORD UTF-8 编码后不得超过 72 字节"
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

grep -Eq '^name:[[:space:]]+plush-toy-erp-prod[[:space:]]*$' "$compose_file" || fail "生产 Compose 必须保留 canonical project name=plush-toy-erp-prod"
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
if grep -Eq '^[[:space:]]+APP_ADMIN_PASSWORD[[:space:]]*:' "$compose_file"; then
  fail "Compose steady app-server 不得映射 APP_ADMIN_PASSWORD"
fi
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

if [[ "$runtime_check" -eq 1 ]]; then
  [[ "$mode" != "example" ]] || fail "--example 不得与 --runtime 同时使用"
  if [[ -z "$expected_release" ]]; then
    if [[ "${erp_allow_customer_trial_config:-0}" == "1" ]]; then
      fail "customer-trial-133 --runtime 必须显式传入 --expected-release <40sha>"
    fi
    expected_release="$(git rev-parse HEAD 2>/dev/null || true)"
  fi
  [[ "$expected_release" =~ ^[0-9a-f]{40}$ ]] || fail "--expected-release 必须是 40 位小写 Git SHA"
fi

compose_args=(--env-file "$env_file" -f "$compose_file")
if [[ "${erp_allow_customer_trial_config:-0}" == "1" ]]; then
  compose_args=(-p plush-toy-erp-v5 "${compose_args[@]}")
fi
if [[ -n "$compose_override" ]]; then
  compose_args+=(-f "$compose_override")
fi

if [[ "${erp_allow_customer_trial_config:-0}" == "1" && "$skip_compose_config" -eq 1 ]]; then
  fail "customer-trial-133 禁止 --skip-compose-config，必须解析真实 Compose project"
fi
if [[ "$runtime_check" -eq 1 && "$skip_compose_config" -eq 1 ]]; then
  fail "--runtime 禁止 --skip-compose-config"
fi

if [[ "$skip_compose_config" -eq 0 ]]; then
  compose_config_cmd=()
  if docker compose version >/dev/null 2>&1; then
    compose_config_cmd=(docker compose "${compose_args[@]}")
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_config_cmd=(docker-compose "${compose_args[@]}")
  elif [[ "$mode" == "example" ]]; then
    warn "未找到 docker compose，example 模式跳过 compose config"
  else
    fail "未找到 docker compose / docker-compose"
  fi

  if [[ ${#compose_config_cmd[@]} -gt 0 ]]; then
    if [[ "${erp_allow_customer_trial_config:-0}" == "1" ]]; then
      resolved_compose_config=""
      if ! resolved_compose_config="$("${compose_config_cmd[@]}" config 2>/dev/null)"; then
        fail "customer-trial-133 docker compose config 失败"
      fi
      resolved_compose_name="$(printf '%s\n' "$resolved_compose_config" | awk '
        /^name:[[:space:]]*/ {
          sub(/^name:[[:space:]]*/, "")
          gsub(/^["'\'' ]+|["'\'' ]+$/, "")
          print
          exit
        }
      ')"
      unset resolved_compose_config
      [[ "$resolved_compose_name" == "plush-toy-erp-v5" ]] || fail "customer-trial-133 解析后的 Compose project 必须是 plush-toy-erp-v5"
      ok "docker compose config 解析的 project=plush-toy-erp-v5"
    else
      "${compose_config_cmd[@]}" config -q >/dev/null
      ok "docker compose config -q 通过"
    fi
  fi
fi

if [[ "$runtime_check" -eq 1 ]]; then
  command -v docker >/dev/null 2>&1 || fail "--runtime 需要 docker"
  if docker compose version >/dev/null 2>&1; then
    compose_cmd=(docker compose "${compose_args[@]}")
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_cmd=(docker-compose "${compose_args[@]}")
  else
    fail "--runtime 需要 docker compose / docker-compose"
  fi

  declare -A runtime_cids=()
  for service in postgres jaeger app-server web-desktop; do
    runtime_service_cids="$("${compose_cmd[@]}" ps -q "$service" 2>/dev/null || true)"
    runtime_service_cid_count="$(printf '%s\n' "$runtime_service_cids" | awk 'NF { count++ } END { print count + 0 }')"
    [[ "$runtime_service_cid_count" == "1" ]] || fail "运行态 Compose 服务必须精确存在一个容器: $service"
    cid="$(printf '%s\n' "$runtime_service_cids" | awk 'NF { print; exit }')"
    case "$service" in
    postgres)
      runtime_service_key=postgres
      runtime_expected_image_ref="$postgres_image"
      ;;
    jaeger)
      runtime_service_key=jaeger
      runtime_expected_image_ref="$jaeger_image"
      ;;
    app-server)
      runtime_service_key=app_server
      runtime_expected_image_ref="$app_image"
      ;;
    web-desktop)
      runtime_service_key=web_desktop
      runtime_expected_image_ref="$web_image"
      ;;
    esac
    runtime_cids["$runtime_service_key"]="$cid"
    runtime_container_image_ref="$(docker inspect --format '{{.Config.Image}}' "$cid" 2>/dev/null || true)"
    runtime_container_image_ref="$(trim "$runtime_container_image_ref")"
    [[ "$runtime_container_image_ref" == "$runtime_expected_image_ref" ]] || fail "运行态服务 $service 的镜像引用与受控 env 不一致"

    runtime_expected_image_id="$(docker image inspect --format '{{.Id}}' "$runtime_expected_image_ref" 2>/dev/null || true)"
    runtime_expected_image_id="$(trim "$runtime_expected_image_id")"
    [[ "$runtime_expected_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "无法读取运行态服务 $service 的受控镜像 content id"
    runtime_container_image_id="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || true)"
    runtime_container_image_id="$(trim "$runtime_container_image_id")"
    [[ "$runtime_container_image_id" == "$runtime_expected_image_id" ]] || fail "运行态服务 $service 容器 content id 与受控镜像不一致"

    if [[ "$service" == "app-server" || "$service" == "web-desktop" ]]; then
      runtime_release_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" 2>/dev/null || true)"
      runtime_release_count="$(printf '%s\n' "$runtime_release_env" | awk -F= '$1 == "GIT_SHA" { count++ } END { print count + 0 }')"
      runtime_release="$(printf '%s\n' "$runtime_release_env" | awk -F= '$1 == "GIT_SHA" { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
      [[ "$runtime_release_count" == "1" && "$runtime_release" =~ ^[0-9a-f]{40}$ && "$runtime_release" == "$expected_release" ]] || fail "运行态服务 $service 的 GIT_SHA 与期望 release 不一致"
    fi
  done
  app_cid="${runtime_cids[app_server]}"
  postgres_cid="${runtime_cids[postgres]}"
  ok "Compose 四服务容器唯一，镜像引用 / content id 与 release=$expected_release 一致"

  runtime_cid_for_service() {
    case "$1" in
    postgres) printf '%s' "${runtime_cids[postgres]}" ;;
    jaeger) printf '%s' "${runtime_cids[jaeger]}" ;;
    app-server) printf '%s' "${runtime_cids[app_server]}" ;;
    web-desktop) printf '%s' "${runtime_cids[web_desktop]}" ;;
    *) fail "未知运行态 Compose 服务: $1" ;;
    esac
  }

  if [[ "${erp_allow_customer_trial_config:-0}" == "1" ]]; then
    for runtime_service_contract in \
      postgres=plush-toy-erp-v5-postgres \
      jaeger=plush-toy-erp-v5-jaeger \
      app-server=plush-toy-erp-v5-server \
      web-desktop=plush-toy-erp-v5-web-desktop; do
      service="${runtime_service_contract%%=*}"
      expected_container_name="${runtime_service_contract#*=}"
      cid="$(runtime_cid_for_service "$service")"
      runtime_container_name="$(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null || true)"
      runtime_container_name="$(trim "${runtime_container_name#/}")"
      [[ "$runtime_container_name" == "$expected_container_name" ]] || fail "customer-trial-133 运行态服务 $service 容器名不符合 V5 独立身份"
      runtime_compose_project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$cid" 2>/dev/null || true)"
      runtime_compose_project="$(trim "$runtime_compose_project")"
      [[ "$runtime_compose_project" == "plush-toy-erp-v5" ]] || fail "customer-trial-133 运行态服务 $service 不属于独立 Compose project plush-toy-erp-v5"
    done

    for runtime_port_contract in \
      postgres:5432/tcp=55435 \
      app-server:8300/tcp=8315 \
      app-server:9300/tcp=9315 \
      web-desktop:5175/tcp=5185 \
      jaeger:5775/udp=45775 \
      jaeger:6831/udp=46831 \
      jaeger:6832/udp=46832 \
      jaeger:5778/tcp=45778 \
      jaeger:16686/tcp=46687 \
      jaeger:14268/tcp=54268 \
      jaeger:14250/tcp=54250 \
      jaeger:9411/tcp=49411 \
      jaeger:4317/tcp=44317 \
      jaeger:4318/tcp=44318; do
      runtime_port_target="${runtime_port_contract%%=*}"
      runtime_expected_host_port="${runtime_port_contract#*=}"
      runtime_port_service="${runtime_port_target%%:*}"
      runtime_container_port="${runtime_port_target#*:}"
      runtime_port_cid="$(runtime_cid_for_service "$runtime_port_service")"
      runtime_host_binding="$(docker port "$runtime_port_cid" "$runtime_container_port" 2>/dev/null || true)"
      runtime_host_binding="$(trim "$runtime_host_binding")"
      [[ "$runtime_host_binding" == "127.0.0.1:$runtime_expected_host_port" ]] || fail "customer-trial-133 运行态服务 $runtime_port_service 端口 $runtime_container_port 未精确绑定 V5 独立宿主端口"
    done

    runtime_postgres_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Source}}{{println}}{{end}}{{end}}' "$postgres_cid" 2>/dev/null || true)"
    runtime_postgres_mount="$(trim "$runtime_postgres_mount")"
    [[ "$runtime_postgres_mount" == "/home/simon/plush-toy-erp-v5/data/postgres" ]] || fail "customer-trial-133 运行态 PostgreSQL 挂载源不符合 V5 独立数据目录"

    runtime_trial_app_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_cid" 2>/dev/null || true)"
    for runtime_app_contract in \
      ERP_CUSTOMER_KEY=yoyoosun \
      ERP_DEBUG_ENV=prod \
      ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1 \
      ERP_CUSTOMER_TRIAL_TARGET=customer-trial-133; do
      runtime_app_key="${runtime_app_contract%%=*}"
      runtime_app_expected="${runtime_app_contract#*=}"
      runtime_app_count="$(printf '%s\n' "$runtime_trial_app_env" | awk -F= -v key="$runtime_app_key" '$1 == key { count++ } END { print count + 0 }')"
      runtime_app_actual="$(printf '%s\n' "$runtime_trial_app_env" | awk -F= -v key="$runtime_app_key" '$1 == key { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
      [[ "$runtime_app_count" == "1" && "$runtime_app_actual" == "$runtime_app_expected" ]] || fail "customer-trial-133 运行态 app-server 试用身份变量不符合合同: $runtime_app_key"
    done
    runtime_app_dsn_count="$(printf '%s\n' "$runtime_trial_app_env" | awk -F= '$1 == "POSTGRES_DSN" { count++ } END { print count + 0 }')"
    runtime_app_dsn="$(printf '%s\n' "$runtime_trial_app_env" | awk -F= '$1 == "POSTGRES_DSN" { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
    [[ "$runtime_app_dsn_count" == "1" ]] || fail "customer-trial-133 运行态 app-server 必须只有一个 POSTGRES_DSN"
    [[ "$runtime_app_dsn" =~ ^postgres(ql)?://[^/@]+:[^@/]+@postgres:5432/plush_erp_uat_20260716_v5\?sslmode=disable$ ]] || fail "customer-trial-133 运行态 app-server POSTGRES_DSN 必须精确指向 V5 独立数据库"
    unset runtime_trial_app_env runtime_app_dsn
    ok "customer-trial-133 运行态容器名、project、端口、PostgreSQL 挂载和 app 试用身份一致"
  fi

  runtime_app_env="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$app_cid" 2>/dev/null || true)"
  runtime_bootstrap_admin_once="$(printf '%s\n' "$runtime_app_env" | awk -F= '$1 == "BOOTSTRAP_ADMIN_ONCE" { value = $0; sub(/^[^=]*=/, "", value) } END { print value }')"
  runtime_bootstrap_admin_once="$(trim "$runtime_bootstrap_admin_once" | tr '[:upper:]' '[:lower:]')"
  [[ "$runtime_bootstrap_admin_once" == "false" ]] || fail "app-server 稳态运行时 BOOTSTRAP_ADMIN_ONCE 必须为 false"
  if printf '%s\n' "$runtime_app_env" | awk -F= '$1 == "APP_ADMIN_PASSWORD" { found = 1 } END { exit !found }'; then
    fail "app-server 稳态运行时不得保留 APP_ADMIN_PASSWORD"
  fi
  ok "运行态 admin bootstrap secret 已清理且 once=false"

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

assert_env_source_unchanged
echo "[production-preflight] all checks passed"
