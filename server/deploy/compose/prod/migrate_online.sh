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
ATLAS_REQUIRED_VERSION="${ATLAS_REQUIRED_VERSION:-v1.2.0}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
APP_SERVICE="${APP_SERVICE:-app-server}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
MIGRATION_LOCK_FILE="${MIGRATION_LOCK_FILE:-/run/lock/plush-toy-erp/atlas-migrate.lock}"
EXPECTED_MIGRATION_SEQUENCE_SHA256=$(printenv EXPECTED_MIGRATION_SEQUENCE_SHA256 2>/dev/null || true)
RELEASE_SHA=$(printenv RELEASE_SHA 2>/dev/null || true)
APPLICATION_IMAGE_DIGEST=$(printenv APPLICATION_IMAGE_DIGEST 2>/dev/null || true)

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
RECONCILE_PERMISSIONS=0
TRIAL_MODE=0
TRIAL_COMPOSE_PROJECT=plush-toy-erp-v5
TRIAL_POSTGRES_DB=plush_erp_uat_20260716_v5
TRIAL_POSTGRES_DATA_DIR=/home/simon/plush-toy-erp-v5/data/postgres
TRIAL_MIGRATION_LOCK_FILE=/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock
TRIAL_COMPOSE_OVERRIDE_FILE=$SCRIPT_DIR/compose.customer-trial-133.yml
TRIAL_COMPOSE_ENV_FILE=/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133
TRIAL_MIG_DIR=$SERVER_ROOT/internal/data/model/migrate
TRIAL_ATLAS_BIN=/home/simon/plush-toy-erp-v5/tools/atlas/v1.2.0/atlas
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
  sh migrate_online.sh [--apply] [--status-only] [--reconcile-permissions] [--help]

行为:
  默认执行: 目录冻结/校验 + status + 三项只读审计 + dry-run + 事务回滚预演
  --apply:  在停写确认后 reconcile 权限，再执行上述检查 + tx-mode=all apply + 完整读回
  --status-only: 仅查看当前迁移状态
  --reconcile-permissions: 停写窗口内先对账角色/Owner/Grant，再执行所选只读或 apply 流程

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
  ATLAS_BIN      宿主机 Atlas 二进制路径（普通部署默认 /usr/local/bin/atlas；
                 customer-trial-133 固定使用目标根目录内的 v1.2.0，拒绝覆盖）
  ATLAS_REQUIRED_VERSION
                 固定 Atlas 版本（默认 v1.2.0）
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
  EXPECTED_MIGRATION_SEQUENCE_SHA256
                 Release manifest 中的 migration sequence hash；提供时必须与冻结目录一致
  RELEASE_SHA / APPLICATION_IMAGE_DIGEST
                 可选的固定发布身份，只写入脱敏 migration receipt
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
  --reconcile-permissions)
    RECONCILE_PERMISSIONS=1
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

if [ "$APPLY_MODE" -eq 1 ] && [ "$STATUS_ONLY" -eq 1 ]; then
  fail "--apply 与 --status-only 不能同时使用"
fi

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
  trial_admin_password=$(trial_env_value POSTGRES_PASSWORD)
  trial_app_password=$(trial_env_value POSTGRES_APP_PASSWORD)
  trial_migrator_password=$(trial_env_value POSTGRES_MIGRATOR_PASSWORD)
  trial_backup_password=$(trial_env_value POSTGRES_BACKUP_PASSWORD)
  for role_password in "$trial_app_password" "$trial_migrator_password" "$trial_backup_password"; do
    case "$role_password" in
    "" | *[!A-Za-z0-9._~-]*) fail "customer-trial-133 数据库角色密码必须是 20-128 位 URL-safe 值" ;;
    esac
    [ "${#role_password}" -ge 20 ] && [ "${#role_password}" -le 128 ] ||
      fail "customer-trial-133 数据库角色密码必须是 20-128 位 URL-safe 值"
  done
  [ "$trial_app_password" != "$trial_migrator_password" ] &&
    [ "$trial_app_password" != "$trial_backup_password" ] &&
    [ "$trial_migrator_password" != "$trial_backup_password" ] &&
    [ "$trial_admin_password" != "$trial_app_password" ] &&
    [ "$trial_admin_password" != "$trial_migrator_password" ] &&
    [ "$trial_admin_password" != "$trial_backup_password" ] ||
    fail "customer-trial-133 管理员、应用、迁移和备份密码必须彼此不同"
  require_trial_env_value POSTGRES_BIND_ADDR 127.0.0.1
  require_trial_env_value APP_HTTP_BIND_ADDR 127.0.0.1
  require_trial_env_value WEB_DESKTOP_BIND_ADDR 127.0.0.1
  for port_contract in \
    POSTGRES_PORT=55435 \
    APP_HTTP_PORT=8315 \
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
  if [ "$TRIAL_MODE" -eq 1 ]; then
    echo "请先通过正式发布流程准备 customer-trial-133 固定 Atlas v1.2.0，不要覆盖系统 Atlas 或使用容器执行线上迁移。" >&2
  else
    echo "请先在服务器安装 Atlas 到 /usr/local/bin/atlas，不要使用 arigaio/atlas 容器执行线上迁移。" >&2
  fi
  exit 1
fi

ATLAS_VERSION_OUTPUT=$("$ATLAS_BIN" version 2>&1) || fail "无法读取 Atlas 版本"
printf '%s\n' "$ATLAS_VERSION_OUTPUT" |
  grep -Eq "(^|[[:space:]])${ATLAS_REQUIRED_VERSION}([[:space:]]|$)" ||
  fail "Atlas 版本必须固定为 ${ATLAS_REQUIRED_VERSION}"

for required_command in "$PSQL_BIN" jq; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "缺少 migration 必需命令: $required_command"
done

if command -v sha256sum >/dev/null 2>&1; then
  SHA256_TOOL=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  SHA256_TOOL="shasum -a 256"
else
  fail "缺少 sha256sum 或 shasum"
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
  /tmp/* | /var/tmp/* | /dev/shm/*)
    echo "ERROR: MIGRATION_LOCK_FILE 不得位于共享临时目录: $MIGRATION_LOCK_FILE" >&2
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

[ -z "$EXPECTED_MIGRATION_SEQUENCE_SHA256" ] ||
  printf '%s' "$EXPECTED_MIGRATION_SEQUENCE_SHA256" | grep -Eq '^[0-9a-f]{64}$' ||
  fail "EXPECTED_MIGRATION_SEQUENCE_SHA256 格式非法"
[ -z "$RELEASE_SHA" ] || printf '%s' "$RELEASE_SHA" | grep -Eq '^[0-9a-f]{40}$' ||
  fail "RELEASE_SHA 必须是 40 位小写 Git SHA"
[ -z "$APPLICATION_IMAGE_DIGEST" ] ||
  printf '%s' "$APPLICATION_IMAGE_DIGEST" | grep -Eq '^sha256:[0-9a-f]{64}$' ||
  fail "APPLICATION_IMAGE_DIGEST 必须是 sha256 digest"

hash_stdin() {
  if [ "$SHA256_TOOL" = "sha256sum" ]; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

hash_file() {
  if [ "$SHA256_TOOL" = "sha256sum" ]; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

MIGRATION_RUN_DIR=$(mktemp -d "$lock_dir/migration-run.XXXXXX") ||
  fail "无法创建私有 migration 工作目录"
chmod 700 "$MIGRATION_RUN_DIR"
MIGRATION_SNAPSHOT_DIR=$MIGRATION_RUN_DIR/migrations
mkdir -m 700 "$MIGRATION_SNAPSHOT_DIR"
RECEIPT_DIR=$lock_dir/receipts
mkdir -p "$RECEIPT_DIR"
chmod 700 "$RECEIPT_DIR"
RECEIPT_FILE=$RECEIPT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.receipt
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

MIGRATION_OUTCOME=not_applied
MIGRATION_SEQUENCE_SHA256=unknown
ATLAS_SUM_SHA256=unknown
PRE_VERSION=unknown
POST_VERSION=unknown
PENDING_COUNT=unknown
DATABASE_SYSTEM_IDENTIFIER=unknown
DATABASE_NAME_RECEIPT=unknown
DATABASE_USER_RECEIPT=unknown
DATABASE_SERVER_ADDRESS=unknown
DATABASE_SERVER_PORT=unknown
POSTGRES_VERSION_RECEIPT=unknown
PREFLIGHT_RESULT=not_run
ROLLBACK_REHEARSAL_RESULT=not_run
APPLY_RESULT=not_run
SCHEMA_READBACK_RESULT=not_run
PROGRAMMABILITY_RESULT=not_run
PERMISSION_RESULT=not_run

finalize_migration_run() {
  exit_code=$?
  trap - EXIT INT TERM
  set +e
  FINISHED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  RECEIPT_TMP=$RECEIPT_FILE.tmp
  cat >"$RECEIPT_TMP" <<EOF
schema_version=plush.migration-receipt/v1
outcome=$MIGRATION_OUTCOME
release_sha=${RELEASE_SHA:-unknown}
application_image_digest=${APPLICATION_IMAGE_DIGEST:-unknown}
database_system_identifier=$DATABASE_SYSTEM_IDENTIFIER
database_name=$DATABASE_NAME_RECEIPT
database_user=$DATABASE_USER_RECEIPT
server_address=$DATABASE_SERVER_ADDRESS
server_port=$DATABASE_SERVER_PORT
atlas_version=$ATLAS_REQUIRED_VERSION
postgresql_version=$POSTGRES_VERSION_RECEIPT
migration_sequence_sha256=$MIGRATION_SEQUENCE_SHA256
atlas_sum_sha256=$ATLAS_SUM_SHA256
pre_version=$PRE_VERSION
post_version=$POST_VERSION
pending_count=$PENDING_COUNT
preflight_result=$PREFLIGHT_RESULT
rollback_rehearsal_result=$ROLLBACK_REHEARSAL_RESULT
apply_result=$APPLY_RESULT
schema_readback_result=$SCHEMA_READBACK_RESULT
programmability_result=$PROGRAMMABILITY_RESULT
permission_result=$PERMISSION_RESULT
started_at=$STARTED_AT
finished_at=$FINISHED_AT
EOF
  chmod 600 "$RECEIPT_TMP"
  mv "$RECEIPT_TMP" "$RECEIPT_FILE"
  rm -rf -- "$MIGRATION_RUN_DIR"
  printf '==> migration receipt: %s\n' "$RECEIPT_FILE"
  exit "$exit_code"
}
trap finalize_migration_run EXIT INT TERM

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
elif [ "$APPLY_MODE" -eq 1 ] || [ "$RECONCILE_PERMISSIONS" -eq 1 ]; then
  APP_CID=$(compose ps -q "$APP_SERVICE" 2>/dev/null | head -n1 || true)
fi

if [ "$APPLY_MODE" -eq 1 ] || [ "$RECONCILE_PERMISSIONS" -eq 1 ]; then
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

if [ "$APPLY_MODE" -eq 1 ] || [ "$RECONCILE_PERMISSIONS" -eq 1 ]; then
  echo "==> 对账数据库角色、Owner 和 Grant"
  docker exec "$POSTGRES_CID" /usr/local/bin/plush-database-roles reconcile
else
  docker exec "$POSTGRES_CID" /usr/local/bin/plush-database-roles verify
fi
PERMISSION_RESULT=verified

if [ -z "${DB_URL:-}" ]; then
  if [ "$TRIAL_MODE" -eq 1 ]; then
    DB_NAME=$TRIAL_RUNTIME_DB_NAME
  else
    DB_NAME=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_DB"')
  fi
  DB_PASS_RAW=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_MIGRATOR_PASSWORD"')
  DB_USER=erp_migrator

  if [ -z "${DB_NAME:-}" ] || [ -z "${DB_PASS_RAW:-}" ] || [ -z "${DB_USER:-}" ]; then
    echo "ERROR: 无法从 Postgres 容器读取 POSTGRES_DB / POSTGRES_MIGRATOR_PASSWORD" >&2
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

psql_target() {
  if [ "$DB_URL_PROVIDED" -eq 1 ]; then
    PGDATABASE="$DB_URL" "$PSQL_BIN" "$@"
    return
  fi

  PGHOST="$POSTGRES_HOST" \
    PGPORT="$POSTGRES_HOST_PORT" \
    PGDATABASE="$DB_NAME" \
    PGUSER="$DB_USER" \
    PGPASSWORD="$DB_PASS_RAW" \
    PGSSLMODE=disable \
    "$PSQL_BIN" "$@"
}

if find "$MIG_DIR" -maxdepth 1 -type l -print -quit | grep -q .; then
  fail "migration 目录不得包含符号链接"
fi
cp "$MIG_DIR"/*.sql "$MIGRATION_SNAPSHOT_DIR/"
cp "$MIG_DIR/atlas.sum" "$MIGRATION_SNAPSHOT_DIR/atlas.sum"

MIGRATION_SEQUENCE_SHA256=$(
  find "$MIGRATION_SNAPSHOT_DIR" -maxdepth 1 -type f -name '*.sql' -print |
    LC_ALL=C sort |
    while IFS= read -r migration_file; do
      relative_path=server/internal/data/model/migrate/$(basename -- "$migration_file")
      printf '%s\0' "$relative_path"
      cat "$migration_file"
      printf '\0'
    done |
    hash_stdin
)
ATLAS_SUM_SHA256=$(hash_file "$MIGRATION_SNAPSHOT_DIR/atlas.sum")
if [ -n "$EXPECTED_MIGRATION_SEQUENCE_SHA256" ] &&
  [ "$MIGRATION_SEQUENCE_SHA256" != "$EXPECTED_MIGRATION_SEQUENCE_SHA256" ]; then
  fail "冻结 migration 序列与 Release manifest 不一致"
fi

ATLAS_CONFIG_FILE=$MIGRATION_RUN_DIR/atlas.hcl
cat >"$ATLAS_CONFIG_FILE" <<EOF
env "runtime" {
  url = getenv("ATLAS_DATABASE_URL")
  migration {
    dir = "file://$MIGRATION_SNAPSHOT_DIR"
  }
}
EOF
chmod 600 "$ATLAS_CONFIG_FILE"

atlas_migrate() {
  ATLAS_DATABASE_URL="$DB_URL" "$ATLAS_BIN" migrate "$@" \
    --config "file://$ATLAS_CONFIG_FILE" --env runtime \
    --dir "file://$MIGRATION_SNAPSHOT_DIR"
}

atlas_schema_inspect() {
  ATLAS_DATABASE_URL="$DB_URL" "$ATLAS_BIN" schema inspect \
    --config "file://$ATLAS_CONFIG_FILE" --env runtime \
    --exclude atlas_schema_revisions --format '{{ sql . }}'
}

EXPECTED_DB_NAME=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_DB"')
IDENTITY_ROW=$(
  psql_target -X --no-psqlrc -A -t -F '|' \
    --set ON_ERROR_STOP=1 -c "
SELECT
  current_database(),
  current_user,
  COALESCE(inet_server_addr()::text, 'local'),
  COALESCE(inet_server_port()::text, 'local'),
  current_setting('server_version_num'),
  role.rolsuper,
  role.rolcreatedb,
  role.rolcreaterole,
  role.rolbypassrls
FROM pg_roles AS role
WHERE role.rolname = current_user;"
)
[ "$(printf '%s\n' "$IDENTITY_ROW" | wc -l | awk '{print $1}')" = "1" ] ||
  fail "目标数据库身份输出无法识别"
DATABASE_NAME_RECEIPT=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $1}')
DATABASE_USER_RECEIPT=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $2}')
DATABASE_SERVER_ADDRESS=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $3}')
DATABASE_SERVER_PORT=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $4}')
POSTGRES_VERSION_RECEIPT=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $5}')
ROLE_FLAGS=$(printf '%s' "$IDENTITY_ROW" | awk -F'|' '{print $6 "|" $7 "|" $8 "|" $9}')
[ "$DATABASE_NAME_RECEIPT" = "$EXPECTED_DB_NAME" ] ||
  fail "目标数据库名称与 Compose 合同不一致"
[ "$DATABASE_USER_RECEIPT" = "erp_migrator" ] ||
  fail "migration 必须使用 erp_migrator"
[ "$ROLE_FLAGS" = "f|f|f|f" ] ||
  fail "erp_migrator 不得拥有 superuser/createdb/createrole/bypassrls"
printf '%s' "$POSTGRES_VERSION_RECEIPT" | grep -Eq '^18[0-9]{4}$' ||
  fail "目标 PostgreSQL major 必须是 18"
DATABASE_SYSTEM_IDENTIFIER=$(docker exec "$POSTGRES_CID" sh -ceu \
  'psql -X --no-psqlrc -A -t -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT system_identifier FROM pg_control_system()"')
printf '%s' "$DATABASE_SYSTEM_IDENTIFIER" | grep -Eq '^[0-9]+$' ||
  fail "无法读取目标 PostgreSQL system_identifier"

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

read_status_json() {
  status_file=$1
  atlas_migrate status --format '{{ json . }}' >"$status_file"
  jq -e '
    (.Status | type == "string") and
    (.Current | type == "string") and
    (.Next | type == "string") and
    (.Available | type == "array") and
    (
      (.Applied | type == "array") or
      (
        .Applied == null and
        .Status == "PENDING" and
        .Current == "No migration applied yet"
      )
    )
  ' "$status_file" >/dev/null || fail "Atlas migration status JSON 无法识别"
}

status_current_version() {
  jq -r '.Current // ""' "$1"
}

status_pending_count() {
  jq -r '((.Available // []) | length) - ((.Applied // []) | length)' "$1"
}

print_status_summary() {
  status_file=$1
  status_value=$(jq -r '.Status' "$status_file")
  current_value=$(status_current_version "$status_file")
  pending_value=$(status_pending_count "$status_file")
  [ -n "$current_value" ] || current_value=none
  printf 'Migration Status: %s\n' "$status_value"
  printf '  -- Current Version: %s\n' "$current_value"
  printf '  -- Pending Files:   %s\n' "$pending_value"
}

write_pending_versions() {
  jq -r '
    (.Applied // [] | map(.Version)) as $applied
    | (.Available // [])[]?.Version as $version
    | select(($applied | index($version)) == null)
    | $version
  ' "$1" >"$2"
  while IFS= read -r version; do
    printf '%s' "$version" | grep -Eq '^[0-9]{14}$' ||
      fail "Atlas pending migration version 格式非法"
  done <"$2"
}

assert_rehearsal_safe() {
  migration_file=$1
  visible_sql=$MIGRATION_RUN_DIR/visible-sql.tmp
  sed -E '/^[[:space:]]*--/d; s/--.*$//' "$migration_file" >"$visible_sql"
  if grep -Eiq '\b(CREATE|DROP)[[:space:]]+INDEX[[:space:]]+CONCURRENTLY\b' "$visible_sql"; then
    fail "pending migration 包含 concurrent index，必须走独立非事务 runbook"
  fi
  if grep -Eiq '\b(VACUUM|ALTER[[:space:]]+SYSTEM)\b|\b(CREATE|DROP)[[:space:]]+DATABASE\b|\bCOPY\b.*\bPROGRAM\b' "$visible_sql"; then
    fail "pending migration 含不能安全回滚预演的数据库操作"
  fi
  if grep -Eiq '^[[:space:]]*(COMMIT|ROLLBACK|END[[:space:]]+TRANSACTION)\b' "$visible_sql"; then
    fail "pending migration 不得自行控制事务"
  fi
}

run_rollback_rehearsal() {
  pending_versions_file=$1
  rehearsal_sql=$MIGRATION_RUN_DIR/rollback-rehearsal.sql
  : >"$rehearsal_sql"
  chmod 600 "$rehearsal_sql"
  {
    printf '%s\n' 'BEGIN;'
    printf "%s\n" "SET LOCAL lock_timeout = '5s';"
    printf "%s\n" "SET LOCAL statement_timeout = '120s';"
    while IFS= read -r version; do
      matches=$(find "$MIGRATION_SNAPSHOT_DIR" -maxdepth 1 -type f -name "${version}_*.sql" -print)
      [ "$(printf '%s\n' "$matches" | awk 'NF {count++} END {print count + 0}')" = "1" ] ||
        fail "pending migration 未唯一匹配冻结 SQL: $version"
      assert_rehearsal_safe "$matches"
      printf '\n-- rehearsal: %s\n' "$(basename -- "$matches")"
      cat "$matches"
      printf '\n'
    done <"$pending_versions_file"
    cat <<'SQL'
SELECT
  'database_programmability='
  || count(*) FILTER (WHERE object_kind = 'function')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'procedure')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'trigger')::text
FROM (
  SELECT CASE routine.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_kind
  FROM pg_proc AS routine
  JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND routine.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'trigger'
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND NOT trigger.tgisinternal
) AS forbidden_object;
ROLLBACK;
SQL
  } >"$rehearsal_sql"

  rehearsal_output=$MIGRATION_RUN_DIR/rollback-rehearsal.out
  psql_target -X --no-psqlrc --set ON_ERROR_STOP=1 \
    --file "$rehearsal_sql" >"$rehearsal_output"
  grep -Eq '^ROLLBACK$' "$rehearsal_output" ||
    fail "migration 事务预演没有取得 ROLLBACK 回执"
  grep -Eq 'database_programmability=0\|0\|0' "$rehearsal_output" ||
    fail "migration 事务预演产生了禁止的数据库可编程对象"
  ROLLBACK_REHEARSAL_RESULT=passed
}

verify_programmability() {
  result=$(
    psql_target -X --no-psqlrc -A -t \
      --set ON_ERROR_STOP=1 -c "
SELECT
  count(*) FILTER (WHERE object_kind = 'function')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'procedure')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'trigger')::text
FROM (
  SELECT CASE routine.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_kind
  FROM pg_proc AS routine
  JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND routine.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'trigger'
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND NOT trigger.tgisinternal
) AS forbidden_object;"
  )
  [ "$result" = "0|0|0" ] || fail "数据库含自定义 Function、Procedure 或非内部 Trigger"
  PROGRAMMABILITY_RESULT=passed
}

capture_schema_readback() {
  schema_file=$MIGRATION_RUN_DIR/schema-readback.sql
  atlas_schema_inspect >"$schema_file"
  [ -s "$schema_file" ] || fail "数据库 schema readback 为空"
  schema_hash=$(hash_file "$schema_file")
  SCHEMA_READBACK_RESULT="captured:$schema_hash"
}

echo "==> 迁移目录: $MIG_DIR"
echo "==> compose 文件: $COMPOSE_FILE"
if [ "$TRIAL_MODE" -eq 1 ]; then
  echo "==> compose 验收覆盖: $COMPOSE_OVERRIDE_FILE"
  echo "==> compose 验收环境: $COMPOSE_ENV_FILE"
  echo "==> compose project: $TRIAL_COMPOSE_PROJECT"
fi
echo "==> Postgres 容器: $POSTGRES_CID"
echo "==> Atlas: $ATLAS_BIN ($ATLAS_REQUIRED_VERSION)"
echo "==> migration sequence: $MIGRATION_SEQUENCE_SHA256"

echo "==> [1/8] 校验冻结 migration 目录"
"$ATLAS_BIN" migrate validate --dir "file://$MIGRATION_SNAPSHOT_DIR"

echo "==> [2/8] 查看当前迁移状态"
PRE_STATUS_FILE=$MIGRATION_RUN_DIR/pre-status.json
read_status_json "$PRE_STATUS_FILE"
print_status_summary "$PRE_STATUS_FILE"
PRE_VERSION=$(status_current_version "$PRE_STATUS_FILE")
[ -n "$PRE_VERSION" ] || PRE_VERSION=none
PENDING_COUNT=$(status_pending_count "$PRE_STATUS_FILE")
printf '%s' "$PENDING_COUNT" | grep -Eq '^[0-9]+$' || fail "pending migration 数量非法"
APPLY_NEEDED=0
[ "$PENDING_COUNT" -eq 0 ] || APPLY_NEEDED=1
PENDING_VERSIONS_FILE=$MIGRATION_RUN_DIR/pending-versions.txt
write_pending_versions "$PRE_STATUS_FILE" "$PENDING_VERSIONS_FILE"

if [ "$STATUS_ONLY" -eq 1 ]; then
  verify_programmability
  capture_schema_readback
  POST_VERSION=$PRE_VERSION
  exit 0
fi

PREFLIGHT_RESULT=failed
echo "==> [3/8] 只读审计 20260714055504 存量升级边界"
run_migration_preflight populated-upgrade

echo "==> [4/8] 只读审计 20260714055825 客户配置切换边界"
run_migration_preflight customer-config-cutover

echo "==> [5/8] 只读审计关键数据库约束存量边界"
run_migration_preflight database-constraints
PREFLIGHT_RESULT=passed

echo "==> [6/8] tx-mode=all dry-run"
DRY_RUN_FILE=$MIGRATION_RUN_DIR/dry-run.sql
atlas_migrate apply --dry-run --tx-mode all >"$DRY_RUN_FILE"
cat "$DRY_RUN_FILE"

if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "==> [7/8] pending SQL 事务回滚预演"
  run_rollback_rehearsal "$PENDING_VERSIONS_FILE"
  MIGRATION_OUTCOME=rolled_back
else
  echo "==> [7/8] 无 pending migration，跳过事务回滚预演"
  ROLLBACK_REHEARSAL_RESULT=not_required
fi

if [ "$APPLY_MODE" -eq 1 ]; then
  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "==> [8/8] tx-mode=all 正式执行迁移"
    MIGRATION_OUTCOME=committed_unverified
    APPLY_RESULT=attempted_once
    PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c lock_timeout=5s -c statement_timeout=120s" \
      atlas_migrate apply --lock-timeout 10s --tx-mode all
    APPLY_RESULT=executed_once
  else
    echo "==> [8/8] 数据库已是最新版本，不重复 apply"
    APPLY_RESULT=not_required
  fi

  POST_STATUS_FILE=$MIGRATION_RUN_DIR/post-status.json
  read_status_json "$POST_STATUS_FILE"
  print_status_summary "$POST_STATUS_FILE"
  POST_VERSION=$(status_current_version "$POST_STATUS_FILE")
  POST_PENDING_COUNT=$(status_pending_count "$POST_STATUS_FILE")
  POST_STATUS=$(jq -r '.Status' "$POST_STATUS_FILE")
  POST_NEXT=$(jq -r '.Next' "$POST_STATUS_FILE")
  POST_LATEST=$(jq -r '.Available[-1].Version // ""' "$POST_STATUS_FILE")
  [ "$POST_STATUS" = "OK" ] && [ "$POST_PENDING_COUNT" = "0" ] &&
    [ "$POST_VERSION" = "$POST_LATEST" ] &&
    [ "$POST_NEXT" = "Already at latest version" ] ||
    fail "migration apply 后 status 未证明 pending=0"
  PENDING_COUNT=0

  docker exec "$POSTGRES_CID" /usr/local/bin/plush-database-roles reconcile
  PERMISSION_RESULT=verified
  verify_programmability
  capture_schema_readback
  if [ "$APPLY_NEEDED" -eq 1 ]; then
    MIGRATION_OUTCOME=committed_verified
    echo "==> migration committed_verified current=$POST_VERSION pending=0"
  else
    MIGRATION_OUTCOME=not_applied
    echo "==> migration not_applied current=$POST_VERSION pending=0"
  fi
else
  POST_VERSION=$PRE_VERSION
  verify_programmability
  capture_schema_readback
  echo "==> 未执行正式迁移；dry-run 与事务回滚预演已完成。"
fi
