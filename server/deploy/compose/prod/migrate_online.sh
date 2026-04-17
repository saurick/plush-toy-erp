#!/usr/bin/env sh
set -eu

# 设计意图：在宿主机通过临时 Atlas 容器执行迁移，避免依赖业务容器内工具链。
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.yml}"
SERVER_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
MIG_DIR="${MIG_DIR:-$SERVER_ROOT/internal/data/model/migrate}"
ATLAS_IMAGE="${ATLAS_IMAGE:-arigaio/atlas:latest}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

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
  ATLAS_IMAGE    Atlas 镜像（默认 arigaio/atlas:latest）
  DB_URL         手动覆盖数据库连接串（未设置时自动从 Postgres 容器推导）
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

DB_NET=$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$POSTGRES_CID" | head -n1 | tr -d '\r')
if [ -z "${DB_NET:-}" ]; then
	echo "ERROR: 无法解析 Postgres 容器网络" >&2
	exit 1
fi

DB_HOST=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{"\n"}}{{end}}' "$POSTGRES_CID" | head -n1 | tr -d '\r')
if [ -z "${DB_HOST:-}" ]; then
	DB_HOST="$POSTGRES_SERVICE"
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
	DB_URL="postgres://${DB_USER_ENC}:${DB_PASS_ENC}@${DB_HOST}:5432/${DB_NAME}?sslmode=disable"
fi

atlas_run() {
	docker run --rm \
		--network "$DB_NET" \
		-v "$MIG_DIR:/migrate:ro" \
		"$ATLAS_IMAGE" "$@"
}

echo "==> 迁移目录: $MIG_DIR"
echo "==> compose 文件: $COMPOSE_FILE"
echo "==> Postgres 容器: $POSTGRES_CID"
echo "==> Atlas 镜像: $ATLAS_IMAGE"

echo "==> [1/3] 查看当前迁移状态"
atlas_run migrate status --dir "file:///migrate" --url "$DB_URL"

if [ "$STATUS_ONLY" -eq 1 ]; then
	exit 0
fi

echo "==> [2/3] dry-run 预演"
atlas_run migrate apply --dry-run --dir "file:///migrate" --url "$DB_URL"

if [ "$APPLY_MODE" -eq 1 ]; then
	echo "==> [3/3] 正式执行迁移"
	atlas_run migrate apply --dir "file:///migrate" --url "$DB_URL"
else
	echo "==> 未执行正式迁移。传入 --apply 可一键落库。"
fi
