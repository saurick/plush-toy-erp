#!/usr/bin/env sh
set -eu
umask 077

# 设计意图：低配生产服务器只调用宿主机 Atlas 二进制，避免迁移时拉起额外 Docker 镜像导致内存压力。
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
COMPOSE_FILE_WAS_SET=0
if printenv COMPOSE_FILE >/dev/null 2>&1; then
  COMPOSE_FILE_WAS_SET=1
fi
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.yml}"
COMPOSE_OVERRIDE_FILE=$(printenv COMPOSE_OVERRIDE_FILE 2>/dev/null || true)
COMPOSE_ENV_FILE=$(printenv COMPOSE_ENV_FILE 2>/dev/null || true)
SERVER_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/../../.." && pwd -P)
MIG_DIR="${MIG_DIR:-$SERVER_ROOT/internal/data/model/migrate}"
ATLAS_BIN="${ATLAS_BIN:-/usr/local/bin/atlas}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
APP_SERVICE="${APP_SERVICE:-app-server}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
MIGRATION_LOCK_FILE="${MIGRATION_LOCK_FILE:-/run/lock/plush-toy-erp/atlas-migrate.lock}"

POPULATED_UPGRADE_PREFLIGHT=$(printenv POPULATED_UPGRADE_PREFLIGHT 2>/dev/null || true)
[ -n "$POPULATED_UPGRADE_PREFLIGHT" ] ||
  POPULATED_UPGRADE_PREFLIGHT="$SERVER_ROOT/../scripts/qa/populated-upgrade-preflight.sh"
PSQL_BIN=$(printenv PSQL_BIN 2>/dev/null || true)
[ -n "$PSQL_BIN" ] || PSQL_BIN=psql
DB_URL_PROVIDED=0
if [ -n "$(printenv DB_URL 2>/dev/null || true)" ]; then
  DB_URL_PROVIDED=1
fi

APPLY_MODE=0
STATUS_ONLY=0
TRIAL_MODE=0
TRIAL_COMPOSE_PROJECT=plush-toy-erp-v5
TRIAL_POSTGRES_DB=plush_erp_uat_20260716_v5
TRIAL_POSTGRES_DATA_DIR=/home/simon/plush-toy-erp-v5/data/postgres
TRIAL_MIGRATION_LOCK_FILE=/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock
TRIAL_COMPOSE_OVERRIDE_FILE=$SCRIPT_DIR/compose.customer-trial-133.yml
TRIAL_COMPOSE_ENV_FILE=/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133
TRIAL_MIG_DIR=$SERVER_ROOT/internal/data/model/migrate
TRIAL_ATLAS_BIN=/usr/local/bin/atlas
TRIAL_PSQL_BIN=psql
TRIAL_POPULATED_UPGRADE_PREFLIGHT=$SERVER_ROOT/../scripts/qa/populated-upgrade-preflight.sh
TRIAL_RUNTIME_DB_NAME=""

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
用法:
  sh migrate_online.sh [--apply] [--status-only] [--help]

行为:
  默认执行: status + 055504 存量升级审计 + 055825 客户配置切换审计 + dry-run
  --apply:  执行上述两项只读审计 + dry-run + 正式 apply
  --status-only: 仅查看当前迁移状态

可选环境变量:
  COMPOSE_FILE   compose 文件路径（默认同目录 compose.yml）
  COMPOSE_OVERRIDE_FILE
                 133 V5 受控 override；必须是同目录 compose.customer-trial-133.yml
  COMPOSE_ENV_FILE
                 使用 133 V5 override 时必须精确指向
                 /home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133
  MIG_DIR        迁移目录（默认 server/internal/data/model/migrate）
  POSTGRES_SERVICE  compose 里的 Postgres 服务名（默认 postgres）
  APP_SERVICE    compose 里的后端服务名（默认 app-server）；正式 apply 时必须已停止
  ATLAS_BIN      宿主机 Atlas 二进制路径（默认 /usr/local/bin/atlas）
  POSTGRES_HOST  宿主机访问 PostgreSQL 的地址（默认 127.0.0.1）
  POSTGRES_HOST_PORT  宿主机映射的 PostgreSQL 端口（未设置时从容器端口绑定推导）
  MIGRATION_LOCK_FILE 迁移整段串行锁文件（默认 /run/lock/plush-toy-erp/atlas-migrate.lock）
                      必须使用绝对路径，其父目录专用于迁移锁且不得为符号链接
  DB_URL         手动覆盖数据库连接串（未设置时自动从 Postgres 容器和宿主机端口推导）
  PSQL_BIN       DB_URL 覆盖模式使用的宿主机 psql（默认 psql）
  POPULATED_UPGRADE_PREFLIGHT
                 migration 只读审计脚本（默认仓库 scripts/qa 入口）
  MIGRATION_MAINTENANCE_CONFIRMED
                 正式 apply 必须显式设为 1，确认已进入停写维护窗口
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
  --apply)
    APPLY_MODE=1
    ;;
  --status-only)
    STATUS_ONLY=1
    ;;
  --help | -h)
    usage
    exit 0
    ;;
  *)
    echo "ERROR: 未知参数: $1" >&2
    usage >&2
    exit 1
    ;;
  esac
  shift
done

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ERROR: compose 文件不存在: $COMPOSE_FILE" >&2
  exit 1
fi

trial_env_keys() {
  awk '
		{
			line = $0
			sub(/\r$/, "", line)
			sub(/^[[:space:]]+/, "", line)
			sub(/[[:space:]]+$/, "", line)
			if (line == "" || line ~ /^#/) next
			sub(/^export[[:space:]]+/, "", line)
			separator = index(line, "=")
			if (separator <= 1) exit 2
			key = substr(line, 1, separator - 1)
			sub(/^[[:space:]]+/, "", key)
			sub(/[[:space:]]+$/, "", key)
			if (key !~ /^[A-Za-z_][A-Za-z0-9_]*$/) exit 2
			print key
		}
	' "$COMPOSE_ENV_FILE"
}

trial_env_value() {
  wanted_key=$1
  awk -v wanted_key="$wanted_key" '
		{
			line = $0
			sub(/\r$/, "", line)
			sub(/^[[:space:]]+/, "", line)
			sub(/[[:space:]]+$/, "", line)
			if (line == "" || line ~ /^#/) next
			sub(/^export[[:space:]]+/, "", line)
			separator = index(line, "=")
			if (separator <= 1) next
			key = substr(line, 1, separator - 1)
			sub(/^[[:space:]]+/, "", key)
			sub(/[[:space:]]+$/, "", key)
			if (key != wanted_key) next
			value = substr(line, separator + 1)
			sub(/^[[:space:]]+/, "", value)
			sub(/[[:space:]]+$/, "", value)
			print value
		}
	' "$COMPOSE_ENV_FILE"
}

require_trial_env_value() {
  env_key=$1
  expected_value=$2
  actual_value=$(trial_env_value "$env_key")
  if [ "$actual_value" != "$expected_value" ]; then
    fail "customer-trial-133 必须在受控 env 中使用 ${env_key}=${expected_value}"
  fi
}

validate_trial_compose_inputs() {
  [ "$COMPOSE_FILE_WAS_SET" -eq 0 ] || fail "customer-trial-133 迁移禁止通过宿主环境覆盖 COMPOSE_FILE"
  [ ! -L "$COMPOSE_FILE" ] || fail "customer-trial-133 base Compose 不得是符号链接"
  [ "$(basename -- "$COMPOSE_FILE")" = "compose.yml" ] || fail "customer-trial-133 base Compose 必须是同目录 compose.yml"

  [ -n "$COMPOSE_ENV_FILE" ] || fail "customer-trial-133 必须显式设置 COMPOSE_ENV_FILE=$TRIAL_COMPOSE_ENV_FILE"
  [ "$(basename -- "$COMPOSE_OVERRIDE_FILE")" = "compose.customer-trial-133.yml" ] || fail "customer-trial-133 只能使用受控 Compose override"
  [ "$(basename -- "$COMPOSE_ENV_FILE")" = ".env.customer-trial-133" ] || fail "customer-trial-133 只能使用受控 .env.customer-trial-133"
  [ -f "$COMPOSE_OVERRIDE_FILE" ] && [ ! -L "$COMPOSE_OVERRIDE_FILE" ] || fail "customer-trial-133 Compose override 不存在、不是普通文件或是符号链接"
  [ -f "$COMPOSE_ENV_FILE" ] && [ ! -L "$COMPOSE_ENV_FILE" ] || fail "customer-trial-133 env 不存在、不是普通文件或是符号链接"

  compose_dir_real=$(CDPATH='' cd -- "$(dirname -- "$COMPOSE_FILE")" 2>/dev/null && pwd -P) || fail "无法解析 base Compose 目录"
  override_dir_real=$(CDPATH='' cd -- "$(dirname -- "$COMPOSE_OVERRIDE_FILE")" 2>/dev/null && pwd -P) || fail "无法解析 Compose override 目录"
  env_dir_real=$(CDPATH='' cd -- "$(dirname -- "$COMPOSE_ENV_FILE")" 2>/dev/null && pwd -P) || fail "无法解析 Compose env 目录"
  [ "$override_dir_real" = "$compose_dir_real" ] || fail "customer-trial-133 Compose override 必须与 base Compose 同目录"
  compose_override_real=$override_dir_real/$(basename -- "$COMPOSE_OVERRIDE_FILE")
  trusted_override_dir_real=$(CDPATH='' cd -- "$(dirname -- "$TRIAL_COMPOSE_OVERRIDE_FILE")" 2>/dev/null && pwd -P) || fail "无法解析受控 Compose override 目录"
  trusted_override_real=$trusted_override_dir_real/$(basename -- "$TRIAL_COMPOSE_OVERRIDE_FILE")
  [ "$compose_override_real" = "$trusted_override_real" ] || fail "customer-trial-133 只能使用当前 release 的受控 Compose override"
  compose_env_real=$env_dir_real/$(basename -- "$COMPOSE_ENV_FILE")
  [ "$compose_env_real" = "$TRIAL_COMPOSE_ENV_FILE" ] || fail "customer-trial-133 只能使用受控运行 env: $TRIAL_COMPOSE_ENV_FILE"

  env_owner_uid=$(stat -c '%u' "$COMPOSE_ENV_FILE" 2>/dev/null || stat -f '%u' "$COMPOSE_ENV_FILE" 2>/dev/null || true)
  env_mode=$(stat -c '%a' "$COMPOSE_ENV_FILE" 2>/dev/null || stat -f '%Lp' "$COMPOSE_ENV_FILE" 2>/dev/null || true)
  [ "$env_owner_uid" = "$(id -u)" ] || fail "customer-trial-133 env 必须归当前执行用户所有"
  [ "$env_mode" = "600" ] || fail "customer-trial-133 env 权限必须为 0600"

  override_contract=$(awk '
		{
			line = $0
			sub(/^[[:space:]]+/, "", line)
			sub(/[[:space:]]+$/, "", line)
			if (line != "" && line !~ /^#/) print line
		}
	' "$COMPOSE_OVERRIDE_FILE")
  [ "$override_contract" = "name: plush-toy-erp-v5" ] || fail "customer-trial-133 Compose override 只能声明 name: plush-toy-erp-v5"

  for ambient_key in \
    COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_PATH_SEPARATOR \
    DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH \
    DB_URL POSTGRES_HOST POSTGRES_HOST_PORT POSTGRES_SERVICE APP_SERVICE MIGRATION_LOCK_FILE \
    MIG_DIR ATLAS_BIN PSQL_BIN POPULATED_UPGRADE_PREFLIGHT; do
    if printenv "$ambient_key" >/dev/null 2>&1; then
      fail "customer-trial-133 迁移环境不得设置目标覆盖变量: $ambient_key"
    fi
  done

  if ! TRIAL_ENV_KEYS=$(trial_env_keys); then
    fail "customer-trial-133 env 包含非法行或变量名"
  fi
  [ -n "$TRIAL_ENV_KEYS" ] || fail "customer-trial-133 env 不得为空"
  duplicate_env_key=$(printf '%s\n' "$TRIAL_ENV_KEYS" | sort | uniq -d | head -n1 || true)
  [ -z "$duplicate_env_key" ] || fail "customer-trial-133 env 变量必须唯一: $duplicate_env_key"
  for env_key in $TRIAL_ENV_KEYS; do
    case "$env_key" in
    COMPOSE_* | DOCKER_* | DB_URL | POSTGRES_HOST | POSTGRES_HOST_PORT | POSTGRES_SERVICE | APP_SERVICE | MIG_DIR | ATLAS_BIN | PSQL_BIN | POPULATED_UPGRADE_PREFLIGHT)
      fail "customer-trial-133 env 不得声明目标覆盖变量: $env_key"
      ;;
    esac
    if printenv "$env_key" >/dev/null 2>&1; then
      fail "宿主环境不得覆盖 customer-trial-133 env 变量: $env_key"
    fi
  done

  require_trial_env_value PROJECT_SLUG plush-toy-erp-v5
  require_trial_env_value ERP_CUSTOMER_KEY yoyoosun
  require_trial_env_value POSTGRES_DB plush_erp_uat_20260716_v5
  require_trial_env_value ERP_ALLOW_CUSTOMER_TRIAL_CONFIG 1
  require_trial_env_value ERP_CUSTOMER_TRIAL_TARGET customer-trial-133
  require_trial_env_value POSTGRES_BIND_ADDR 127.0.0.1
  require_trial_env_value APP_HTTP_BIND_ADDR 127.0.0.1
  require_trial_env_value APP_GRPC_BIND_ADDR 127.0.0.1
  require_trial_env_value WEB_DESKTOP_BIND_ADDR 127.0.0.1
  for port_contract in \
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
    port_key=${port_contract%%=*}
    port_value=${port_contract#*=}
    require_trial_env_value "$port_key" "$port_value"
  done

  require_trial_env_value POSTGRES_DATA_DIR "$TRIAL_POSTGRES_DATA_DIR"
  require_trial_env_value MIGRATION_LOCK_FILE "$TRIAL_MIGRATION_LOCK_FILE"
  MIG_DIR=$TRIAL_MIG_DIR
  ATLAS_BIN=$TRIAL_ATLAS_BIN
  PSQL_BIN=$TRIAL_PSQL_BIN
  POPULATED_UPGRADE_PREFLIGHT=$TRIAL_POPULATED_UPGRADE_PREFLIGHT
  MIGRATION_LOCK_FILE=$TRIAL_MIGRATION_LOCK_FILE
  TRIAL_MODE=1
}

if [ -n "$COMPOSE_OVERRIDE_FILE" ] || [ -n "$COMPOSE_ENV_FILE" ]; then
  [ -n "$COMPOSE_OVERRIDE_FILE" ] || fail "COMPOSE_ENV_FILE 只能与 customer-trial-133 override 成对使用"
  validate_trial_compose_inputs
fi

if [ ! -d "$MIG_DIR" ]; then
  echo "ERROR: 迁移目录不存在: $MIG_DIR" >&2
  exit 1
fi

if [ ! -x "$POPULATED_UPGRADE_PREFLIGHT" ]; then
  echo "ERROR: populated upgrade 审计脚本不存在或不可执行: $POPULATED_UPGRADE_PREFLIGHT" >&2
  exit 1
fi

if ! command -v "$ATLAS_BIN" >/dev/null 2>&1; then
  echo "ERROR: 未找到宿主机 Atlas: $ATLAS_BIN" >&2
  echo "请先在服务器安装 Atlas 到 /usr/local/bin/atlas，不要使用 arigaio/atlas 容器执行线上迁移。" >&2
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "ERROR: 未找到 flock，无法串行化线上迁移。" >&2
  exit 1
fi

reject_symlink_components() {
  check_path=$1
  while [ "$check_path" != "/" ]; do
    if [ -L "$check_path" ]; then
      echo "ERROR: migration lock 路径不得包含符号链接: $check_path" >&2
      exit 1
    fi
    check_path=$(dirname -- "$check_path")
  done
}

path_owner_uid() {
  owner_uid=$(stat -c '%u' "$1" 2>/dev/null || true)
  if [ -z "$owner_uid" ]; then
    owner_uid=$(stat -f '%u' "$1" 2>/dev/null || true)
  fi
  if [ -z "$owner_uid" ]; then
    echo "ERROR: 无法读取 migration lock 路径所有者: $1" >&2
    exit 1
  fi
  printf '%s' "$owner_uid"
}

path_mode() {
  mode=$(stat -c '%a' "$1" 2>/dev/null || true)
  if [ -z "$mode" ]; then
    mode=$(stat -f '%Lp' "$1" 2>/dev/null || true)
  fi
  if [ -z "$mode" ]; then
    echo "ERROR: 无法读取 migration lock 路径权限: $1" >&2
    exit 1
  fi
  printf '%s' "$mode"
}

prepare_migration_lock() {
  case "$MIGRATION_LOCK_FILE" in
  /*) ;;
  *)
    echo "ERROR: MIGRATION_LOCK_FILE 必须是绝对路径: $MIGRATION_LOCK_FILE" >&2
    exit 1
    ;;
  esac
  case "$MIGRATION_LOCK_FILE" in
  */../* | */.. | */./* | */.)
    echo "ERROR: MIGRATION_LOCK_FILE 不得包含 . 或 .. 路径段: $MIGRATION_LOCK_FILE" >&2
    exit 1
    ;;
  esac

  lock_dir=$(dirname -- "$MIGRATION_LOCK_FILE")
  if [ "$lock_dir" = "/" ]; then
    echo "ERROR: MIGRATION_LOCK_FILE 必须放在专用私有目录中: $MIGRATION_LOCK_FILE" >&2
    exit 1
  fi

  reject_symlink_components "$lock_dir"
  if [ ! -e "$lock_dir" ]; then
    mkdir -p -- "$lock_dir" || {
      echo "ERROR: 无法创建 migration lock 目录: $lock_dir" >&2
      exit 1
    }
  fi
  reject_symlink_components "$lock_dir"
  if [ ! -d "$lock_dir" ]; then
    echo "ERROR: migration lock 父路径不是目录: $lock_dir" >&2
    exit 1
  fi
  current_uid=$(id -u)
  lock_dir_uid=$(path_owner_uid "$lock_dir")
  if [ "$lock_dir_uid" != "$current_uid" ]; then
    echo "ERROR: migration lock 目录必须归当前执行用户所有: $lock_dir" >&2
    exit 1
  fi
  lock_dir_mode=$(path_mode "$lock_dir")
  if [ "$lock_dir_mode" != "700" ]; then
    echo "ERROR: migration lock 目录权限必须是 0700: $lock_dir (mode=$lock_dir_mode)" >&2
    exit 1
  fi

  if [ -L "$MIGRATION_LOCK_FILE" ]; then
    echo "ERROR: MIGRATION_LOCK_FILE 不得是符号链接: $MIGRATION_LOCK_FILE" >&2
    exit 1
  fi
  if [ -e "$MIGRATION_LOCK_FILE" ] && [ ! -f "$MIGRATION_LOCK_FILE" ]; then
    echo "ERROR: MIGRATION_LOCK_FILE 必须是普通文件: $MIGRATION_LOCK_FILE" >&2
    exit 1
  fi
  : >>"$MIGRATION_LOCK_FILE"
  if [ -L "$MIGRATION_LOCK_FILE" ]; then
    echo "ERROR: MIGRATION_LOCK_FILE 不得是符号链接: $MIGRATION_LOCK_FILE" >&2
    exit 1
  fi
  lock_file_uid=$(path_owner_uid "$MIGRATION_LOCK_FILE")
  if [ "$lock_file_uid" != "$current_uid" ]; then
    echo "ERROR: migration lock 文件必须归当前执行用户所有: $MIGRATION_LOCK_FILE" >&2
    exit 1
  fi
  chmod 600 "$MIGRATION_LOCK_FILE" || {
    echo "ERROR: 无法将 migration lock 文件设为私有权限: $MIGRATION_LOCK_FILE" >&2
    exit 1
  }
}

prepare_migration_lock
echo "==> 等待 migration 串行锁: $MIGRATION_LOCK_FILE"
exec 9>>"$MIGRATION_LOCK_FILE"
flock 9
echo "==> 已取得 migration 串行锁"

compose() {
  if docker compose version >/dev/null 2>&1; then
    if [ "$TRIAL_MODE" -eq 1 ]; then
      docker compose --env-file "$COMPOSE_ENV_FILE" -p "$TRIAL_COMPOSE_PROJECT" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE_FILE" "$@"
    else
      docker compose -f "$COMPOSE_FILE" "$@"
    fi
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    if [ "$TRIAL_MODE" -eq 1 ]; then
      docker-compose --env-file "$COMPOSE_ENV_FILE" -p "$TRIAL_COMPOSE_PROJECT" -f "$COMPOSE_FILE" -f "$COMPOSE_OVERRIDE_FILE" "$@"
    else
      docker-compose -f "$COMPOSE_FILE" "$@"
    fi
    return
  fi

  echo "ERROR: 未找到 docker compose / docker-compose" >&2
  exit 1
}

validate_trial_container_identity() {
  container_id=$1
  expected_name=$2
  service_name=$3
  runtime_project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id" 2>/dev/null || true)
  [ "$runtime_project" = "$TRIAL_COMPOSE_PROJECT" ] || fail "customer-trial-133 ${service_name} 容器不属于 Compose project $TRIAL_COMPOSE_PROJECT"
  runtime_name=$(docker inspect --format '{{.Name}}' "$container_id" 2>/dev/null || true)
  runtime_name=${runtime_name#/}
  [ "$runtime_name" = "$expected_name" ] || fail "customer-trial-133 ${service_name} 容器名必须是 $expected_name"
}

APP_CID=""
if [ "$TRIAL_MODE" -eq 1 ]; then
  APP_CIDS=$(compose ps -q "$APP_SERVICE" 2>/dev/null || true)
  APP_CID_COUNT=$(printf '%s\n' "$APP_CIDS" | awk 'NF { count++ } END { print count + 0 }')
  [ "$APP_CID_COUNT" -le 1 ] || fail "customer-trial-133 app-server 必须唯一"
  APP_CID=$(printf '%s\n' "$APP_CIDS" | awk 'NF { print; exit }')
  if [ -n "$APP_CID" ]; then
    validate_trial_container_identity "$APP_CID" "plush-toy-erp-v5-server" app-server
  fi
elif [ "$APPLY_MODE" -eq 1 ]; then
  APP_CID=$(compose ps -q "$APP_SERVICE" 2>/dev/null | head -n1 || true)
fi

if [ "$APPLY_MODE" -eq 1 ]; then
  if [ "${MIGRATION_MAINTENANCE_CONFIRMED:-}" != "1" ]; then
    echo "ERROR: 正式 migration apply 必须先停止业务写入，并设置 MIGRATION_MAINTENANCE_CONFIRMED=1。" >&2
    exit 1
  fi
  if [ -n "${APP_CID:-}" ]; then
    echo "ERROR: 后端服务仍在运行（service=${APP_SERVICE}, container=${APP_CID}），拒绝 migration apply。" >&2
    echo "请先停止 app-server，保持 PostgreSQL 运行，再重新执行。" >&2
    exit 1
  fi
fi

urlencode() {
  input=$1
  output=""
  i=1
  # 边界兜底：对凭证做 URL 编码，避免 `%` 等字符导致 Atlas 解析失败。
  while [ "$i" -le "${#input}" ]; do
    ch=$(printf '%s' "$input" | cut -c "$i")
    case "$ch" in
    [a-zA-Z0-9.~_-])
      output="${output}${ch}"
      ;;
    *)
      hex=$(printf '%s' "$ch" | od -An -tx1 | tr -d ' \n')
      output="${output}%${hex}"
      ;;
    esac
    i=$((i + 1))
  done
  printf '%s' "$output"
}

if [ "$TRIAL_MODE" -eq 1 ]; then
  POSTGRES_CIDS=$(compose ps -q "$POSTGRES_SERVICE" 2>/dev/null || true)
  POSTGRES_CID_COUNT=$(printf '%s\n' "$POSTGRES_CIDS" | awk 'NF { count++ } END { print count + 0 }')
  [ "$POSTGRES_CID_COUNT" -eq 1 ] || fail "customer-trial-133 Postgres 服务必须精确存在一个容器"
  POSTGRES_CID=$(printf '%s\n' "$POSTGRES_CIDS" | awk 'NF { print; exit }')
  validate_trial_container_identity "$POSTGRES_CID" "plush-toy-erp-v5-postgres" postgres

  TRIAL_POSTGRES_BINDING=$(docker inspect --format '{{range (index .NetworkSettings.Ports "5432/tcp")}}{{printf "%s|%s\n" .HostIp .HostPort}}{{end}}' "$POSTGRES_CID" 2>/dev/null || true)
  [ "$TRIAL_POSTGRES_BINDING" = "127.0.0.1|55435" ] || fail "customer-trial-133 Postgres 必须唯一绑定 127.0.0.1:55435"
  TRIAL_POSTGRES_MOUNT=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{printf "%s|%s\n" .Type .Source}}{{end}}{{end}}' "$POSTGRES_CID" 2>/dev/null || true)
  [ "$TRIAL_POSTGRES_MOUNT" = "bind|$TRIAL_POSTGRES_DATA_DIR" ] || fail "customer-trial-133 Postgres 数据挂载与受控 env 不一致"
  TRIAL_RUNTIME_DB_NAME=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_DB"' 2>/dev/null || true)
  [ "$TRIAL_RUNTIME_DB_NAME" = "$TRIAL_POSTGRES_DB" ] || fail "customer-trial-133 Postgres 容器内 POSTGRES_DB 必须是 $TRIAL_POSTGRES_DB"
  POSTGRES_HOST_PORT=55435
else
  POSTGRES_CID=$(compose ps -q "$POSTGRES_SERVICE" 2>/dev/null | head -n1 || true)
fi
if [ -z "${POSTGRES_CID:-}" ]; then
  echo "ERROR: 未找到 Postgres 服务容器（service=${POSTGRES_SERVICE}）" >&2
  echo "请确认当前项目 compose 已启动，或通过 POSTGRES_SERVICE 指定正确服务名。" >&2
  exit 1
fi

if [ -z "${DB_URL:-}" ]; then
  if [ "$TRIAL_MODE" -eq 1 ]; then
    DB_NAME=$TRIAL_RUNTIME_DB_NAME
  else
    DB_NAME=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_DB"')
  fi
  DB_PASS_RAW=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_PASSWORD"')
  DB_USER=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_USER"')

  if [ -z "${DB_NAME:-}" ] || [ -z "${DB_PASS_RAW:-}" ] || [ -z "${DB_USER:-}" ]; then
    echo "ERROR: 无法从 Postgres 容器读取 POSTGRES_DB / POSTGRES_PASSWORD / POSTGRES_USER" >&2
    exit 1
  fi

  DB_PASS_ENC=$(urlencode "$DB_PASS_RAW")
  DB_USER_ENC=$(urlencode "$DB_USER")
  POSTGRES_HOST_PORT="${POSTGRES_HOST_PORT:-$(docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' "$POSTGRES_CID" 2>/dev/null || true)}"
  if [ -z "${POSTGRES_HOST_PORT:-}" ]; then
    echo "ERROR: 无法解析 PostgreSQL 宿主机端口。" >&2
    echo "请确认 compose 已发布 5432/tcp，或显式设置 DB_URL / POSTGRES_HOST_PORT。" >&2
    exit 1
  fi
  DB_URL="postgres://${DB_USER_ENC}:${DB_PASS_ENC}@${POSTGRES_HOST}:${POSTGRES_HOST_PORT}/${DB_NAME}?sslmode=disable"
fi

atlas_run() {
  "$ATLAS_BIN" "$@"
}

run_migration_preflight() {
  audit=$1
  if [ "$DB_URL_PROVIDED" -eq 1 ]; then
    POPULATED_UPGRADE_DATABASE_URL="$DB_URL" \
      sh "$POPULATED_UPGRADE_PREFLIGHT" \
      --audit "$audit" \
      --database-url-env POPULATED_UPGRADE_DATABASE_URL \
      --psql-bin "$PSQL_BIN"
    return
  fi

  sh "$POPULATED_UPGRADE_PREFLIGHT" \
    --audit "$audit" \
    --docker-container "$POSTGRES_CID" \
    --database "$DB_NAME" \
    --username "$DB_USER"
}

echo "==> 迁移目录: $MIG_DIR"
echo "==> compose 文件: $COMPOSE_FILE"
if [ "$TRIAL_MODE" -eq 1 ]; then
  echo "==> compose 验收覆盖: $COMPOSE_OVERRIDE_FILE"
  echo "==> compose 验收环境: $COMPOSE_ENV_FILE"
  echo "==> compose project: $TRIAL_COMPOSE_PROJECT"
fi
echo "==> Postgres 容器: $POSTGRES_CID"
echo "==> Atlas: $ATLAS_BIN"

echo "==> [1/5] 查看当前迁移状态"
atlas_run migrate status --dir "file://$MIG_DIR" --url "$DB_URL"

if [ "$STATUS_ONLY" -eq 1 ]; then
  exit 0
fi

echo "==> [2/5] 只读审计 20260714055504 存量升级边界"
run_migration_preflight populated-upgrade

echo "==> [3/5] 只读审计 20260714055825 客户配置切换边界"
run_migration_preflight customer-config-cutover

echo "==> [4/5] dry-run 预演"
atlas_run migrate apply --dry-run --dir "file://$MIG_DIR" --url "$DB_URL"

if [ "$APPLY_MODE" -eq 1 ]; then
  echo "==> [5/5] 正式执行迁移"
  atlas_run migrate apply --dir "file://$MIG_DIR" --url "$DB_URL"
else
  echo "==> 未执行正式迁移。传入 --apply 可一键落库。"
fi
