#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PSQL_BIN=$(printenv PSQL_BIN 2>/dev/null || true)
[ -n "$PSQL_BIN" ] || PSQL_BIN=psql

AUDIT="populated-upgrade"
MODE=""
CONTAINER=""
DATABASE=""
USERNAME=""
DATABASE_URL_ENV=""

usage() {
  cat <<'EOF'
用法:
  sh scripts/qa/populated-upgrade-preflight.sh \
    --audit populated-upgrade \
    --docker-container <container> --database <database> --username <user>

  POPULATED_UPGRADE_DATABASE_URL='<postgres-dsn>' \
    sh scripts/qa/populated-upgrade-preflight.sh \
    --audit customer-config-cutover \
    --database-url-env POPULATED_UPGRADE_DATABASE_URL [--psql-bin <path>]

行为:
  只读检查:
  --audit populated-upgrade 检查 20260714055504 的目标约束、待删除字段，
                            以及 WIP 20260717035245 -> 20260717043625 委外关联切换。
  --audit customer-config-cutover 检查 20260714055825 的显式切换前置条件。
  audit 只接受上述固定值；默认 populated-upgrade。
  不修改业务数据、不执行 migration，也不输出数据库连接串。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
  --audit)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --audit 缺少值" >&2
      exit 1
    }
    AUDIT=$2
    shift 2
    ;;
  --docker-container)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --docker-container 缺少值" >&2
      exit 1
    }
    MODE="docker"
    CONTAINER=$2
    shift 2
    ;;
  --database)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --database 缺少值" >&2
      exit 1
    }
    DATABASE=$2
    shift 2
    ;;
  --username)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --username 缺少值" >&2
      exit 1
    }
    USERNAME=$2
    shift 2
    ;;
  --database-url-env)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --database-url-env 缺少值" >&2
      exit 1
    }
    MODE="url"
    DATABASE_URL_ENV=$2
    shift 2
    ;;
  --psql-bin)
    [ "$#" -ge 2 ] || {
      echo "ERROR: --psql-bin 缺少值" >&2
      exit 1
    }
    PSQL_BIN=$2
    shift 2
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
done

case "$AUDIT" in
populated-upgrade)
  SQL_FILE="$SCRIPT_DIR/populated-upgrade-20260714055504.sql"
  ;;
customer-config-cutover)
  SQL_FILE="$SCRIPT_DIR/customer-config-cutover-20260714055825.sql"
  ;;
*)
  echo "ERROR: --audit 仅支持 populated-upgrade 或 customer-config-cutover" >&2
  exit 1
  ;;
esac

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: migration preflight SQL 不存在: $SQL_FILE" >&2
  exit 1
fi

case "$MODE" in
docker)
  if [ -z "$CONTAINER" ] || [ -z "$DATABASE" ] || [ -z "$USERNAME" ]; then
    echo "ERROR: docker 模式需要 container、database 和 username" >&2
    exit 1
  fi
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: 未找到 docker，无法执行 populated upgrade 审计" >&2
    exit 1
  fi
  docker exec -i "$CONTAINER" \
    psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$USERNAME" --dbname "$DATABASE" <"$SQL_FILE"
  ;;
url)
  case "$DATABASE_URL_ENV" in
  "" | [0-9]* | *[!A-Za-z0-9_]*)
    echo "ERROR: --database-url-env 必须是合法环境变量名" >&2
    exit 1
    ;;
  *) ;;
  esac
  DATABASE_URL=$(printenv "$DATABASE_URL_ENV" 2>/dev/null || true)
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: 环境变量 $DATABASE_URL_ENV 未提供数据库连接串" >&2
    exit 1
  fi
  if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
    echo "ERROR: 未找到 psql: $PSQL_BIN" >&2
    exit 1
  fi
  "$PSQL_BIN" -X --no-psqlrc --set ON_ERROR_STOP=1 \
    --dbname "$DATABASE_URL" <"$SQL_FILE"
  ;;
*)
  echo "ERROR: 必须选择 docker 或 database URL 审计模式" >&2
  usage >&2
  exit 1
  ;;
esac

echo "[qa:migration-preflight] status=complete mode=read-only audit=$AUDIT"
