#!/usr/bin/env sh
set -eu
umask 077

# 设计意图：低配生产服务器只调用宿主机 Atlas 二进制，避免迁移时拉起额外 Docker 镜像导致内存压力。
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.yml}"
SERVER_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/../../.." && pwd)
MIG_DIR="${MIG_DIR:-$SERVER_ROOT/internal/data/model/migrate}"
ATLAS_BIN="${ATLAS_BIN:-/usr/local/bin/atlas}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
MIGRATION_LOCK_FILE="${MIGRATION_LOCK_FILE:-/run/lock/plush-toy-erp/atlas-migrate.lock}"

APPLY_MODE=0
STATUS_ONLY=0

usage() {
	cat <<'EOF'
用法:
  sh migrate_online.sh [--apply] [--status-only] [--help]

行为:
  默认执行: status + dry-run
  --apply:  执行 status + dry-run + 正式 apply
  --status-only: 仅查看当前迁移状态

可选环境变量:
  COMPOSE_FILE   compose 文件路径（默认同目录 compose.yml）
  MIG_DIR        迁移目录（默认 server/internal/data/model/migrate）
  POSTGRES_SERVICE  compose 里的 Postgres 服务名（默认 postgres）
  ATLAS_BIN      宿主机 Atlas 二进制路径（默认 /usr/local/bin/atlas）
  POSTGRES_HOST  宿主机访问 PostgreSQL 的地址（默认 127.0.0.1）
  POSTGRES_HOST_PORT  宿主机映射的 PostgreSQL 端口（未设置时从容器端口绑定推导）
  MIGRATION_LOCK_FILE 迁移整段串行锁文件（默认 /run/lock/plush-toy-erp/atlas-migrate.lock）
                      必须使用绝对路径，其父目录专用于迁移锁且不得为符号链接
  DB_URL         手动覆盖数据库连接串（未设置时自动从 Postgres 容器和宿主机端口推导）
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

if [ ! -d "$MIG_DIR" ]; then
	echo "ERROR: 迁移目录不存在: $MIG_DIR" >&2
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
		docker compose -f "$COMPOSE_FILE" "$@"
		return
	fi

	if command -v docker-compose >/dev/null 2>&1; then
		docker-compose -f "$COMPOSE_FILE" "$@"
		return
	fi

	echo "ERROR: 未找到 docker compose / docker-compose" >&2
	exit 1
}

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

POSTGRES_CID=$(compose ps -q "$POSTGRES_SERVICE" 2>/dev/null | head -n1 || true)
if [ -z "${POSTGRES_CID:-}" ]; then
	echo "ERROR: 未找到 Postgres 服务容器（service=${POSTGRES_SERVICE}）" >&2
	echo "请确认当前项目 compose 已启动，或通过 POSTGRES_SERVICE 指定正确服务名。" >&2
	exit 1
fi

if [ -z "${DB_URL:-}" ]; then
	DB_NAME=$(docker exec "$POSTGRES_CID" sh -lc 'printf "%s" "$POSTGRES_DB"')
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

echo "==> 迁移目录: $MIG_DIR"
echo "==> compose 文件: $COMPOSE_FILE"
echo "==> Postgres 容器: $POSTGRES_CID"
echo "==> Atlas: $ATLAS_BIN"

echo "==> [1/3] 查看当前迁移状态"
atlas_run migrate status --dir "file://$MIG_DIR" --url "$DB_URL"

if [ "$STATUS_ONLY" -eq 1 ]; then
	exit 0
fi

echo "==> [2/3] dry-run 预演"
atlas_run migrate apply --dry-run --dir "file://$MIG_DIR" --url "$DB_URL"

if [ "$APPLY_MODE" -eq 1 ]; then
	echo "==> [3/3] 正式执行迁移"
	atlas_run migrate apply --dir "file://$MIG_DIR" --url "$DB_URL"
else
	echo "==> 未执行正式迁移。传入 --apply 可一键落库。"
fi
