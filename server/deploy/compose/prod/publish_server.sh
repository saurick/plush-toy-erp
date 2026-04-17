#!/usr/bin/env sh
set -eu

# 设计意图：把本地构建、打包、上传、远端发布串成固定流程，降低手工执行遗漏风险。
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../../.." && pwd)
SERVER_DIR="$REPO_ROOT/server"

PROJECT_SLUG="${PROJECT_SLUG:-plush-toy-erp}"
IMAGE_NAME="${IMAGE_NAME:-plush-toy-erp-server:dev}"
IMAGE_TAR="${IMAGE_TAR:-$REPO_ROOT/output/app-server.tar}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_USER="${REMOTE_USER:-deploy}"
REMOTE_DIR="${REMOTE_DIR:-~/deploy/plush-toy-erp}"
REMOTE_SCRIPT_NAME="${REMOTE_SCRIPT_NAME:-deploy_app_server.sh}"
REMOTE_COMPOSE_FILE_NAME="${REMOTE_COMPOSE_FILE_NAME:-compose.app-server.yml}"
REMOTE_MIGRATE_SCRIPT_NAME="${REMOTE_MIGRATE_SCRIPT_NAME:-migrate_online.sh}"
REMOTE_MIGRATE_DIR_NAME="${REMOTE_MIGRATE_DIR_NAME:-migrate}"
LOCAL_MIGRATE_SCRIPT="${LOCAL_MIGRATE_SCRIPT:-$SCRIPT_DIR/migrate_online.sh}"
LOCAL_MIGRATE_DIR="${LOCAL_MIGRATE_DIR:-$SERVER_DIR/internal/data/model/migrate}"
DB_MIGRATION_MODE="${DB_MIGRATION_MODE:-check}"
AUTO_SMOKE="${AUTO_SMOKE:-auto}"
SIM_HTTP_PORT="${SIM_HTTP_PORT:-8200}"
SIM_ADMIN_HTTP_PORT="${SIM_ADMIN_HTTP_PORT:-}"
HEALTH_PATH="${HEALTH_PATH:-/healthz}"
READY_PATH="${READY_PATH:-/readyz}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-8}"
SMOKE_CONTAINER_NAME="${SMOKE_CONTAINER_NAME:-${PROJECT_SLUG}-server}"
SMOKE_CHECK_ORIGIN="${SMOKE_CHECK_ORIGIN:-remote}"
PRE_DEPLOY_PREFLIGHT="${PRE_DEPLOY_PREFLIGHT:-on}"
PREFLIGHT_MIN_MEM_AVAILABLE_MB="${PREFLIGHT_MIN_MEM_AVAILABLE_MB:-640}"
PREFLIGHT_MAX_ROOT_USAGE_PCT="${PREFLIGHT_MAX_ROOT_USAGE_PCT:-90}"
PREFLIGHT_FAIL_ON_POSTGRES_UNHEALTHY="${PREFLIGHT_FAIL_ON_POSTGRES_UNHEALTHY:-1}"
PREFLIGHT_POSTGRES_CONTAINER_NAME="${PREFLIGHT_POSTGRES_CONTAINER_NAME:-${PROJECT_SLUG}-postgres}"

usage() {
	cat <<'EOF'
用法:
  sh publish_server.sh

默认流程:
  1) (cd server && make build_server)
  2) docker save -o output/app-server.tar plush-toy-erp-server:dev
  3) rsync -avz -e "ssh" output/app-server.tar deploy@deploy.example.internal:~/deploy/plush-toy-erp
  4) 上传 deploy_server.sh + compose.yml 到远端独立目录
  5) ssh 到远端执行项目专属部署脚本

可选环境变量:
  PROJECT_SLUG  项目标识（默认 plush-toy-erp，用于推导预检和 smoke 容器名）
  IMAGE_NAME    本地导出的镜像名（默认 plush-toy-erp-server:dev）
  IMAGE_TAR     本地镜像包路径（默认仓库根目录 output/app-server.tar）
  REMOTE_HOST   远端主机（必填，例如 deploy.example.internal）
  REMOTE_USER   远端用户（默认 deploy）
  REMOTE_DIR    远端上传目录（默认 ~/deploy/plush-toy-erp）
  REMOTE_SCRIPT_NAME 远端部署脚本文件名（默认 deploy_app_server.sh）
  REMOTE_COMPOSE_FILE_NAME 远端 compose 文件名（默认 compose.app-server.yml）
  REMOTE_MIGRATE_SCRIPT_NAME 远端迁移脚本文件名（默认 migrate_online.sh）
  REMOTE_MIGRATE_DIR_NAME 远端迁移目录名（默认 migrate）
  LOCAL_MIGRATE_SCRIPT 本地迁移脚本路径（默认 server/deploy/compose/prod/migrate_online.sh）
  LOCAL_MIGRATE_DIR 本地迁移目录（默认 server/internal/data/model/migrate）
  DB_MIGRATION_MODE 线上迁移策略（off/check/apply，默认 check）
  AUTO_SMOKE    部署后检查策略（off/basic/auto/strict，默认 auto）
  SIM_HTTP_PORT 业务 HTTP 端口（默认 8200）
  SIM_ADMIN_HTTP_PORT 管理 HTTP 端口（默认空，空值表示跳过管理口检查）
  HEALTH_PATH   健康检查路径（默认 /healthz）
  READY_PATH    就绪检查路径（默认 /readyz）
  SMOKE_TIMEOUT HTTP 检查超时秒数（默认 8）
  SMOKE_CONTAINER_NAME 严格检查读取日志的容器名（默认 plush-toy-erp-server）
  SMOKE_CHECK_ORIGIN smoke 检查来源（remote/local/both，默认 remote）
  PRE_DEPLOY_PREFLIGHT 是否执行远端资源预检（on/off，默认 on）
  PREFLIGHT_MIN_MEM_AVAILABLE_MB 远端最小可用内存 MB（默认 640）
  PREFLIGHT_MAX_ROOT_USAGE_PCT 远端根分区最大占用百分比（默认 90）
  PREFLIGHT_FAIL_ON_POSTGRES_UNHEALTHY postgres 非 healthy 时是否中断（1=中断，默认 1）
  PREFLIGHT_POSTGRES_CONTAINER_NAME 预检使用的 postgres 容器名（默认 ${PROJECT_SLUG}-postgres）
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
	usage
	exit 0
fi

check_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "ERROR: 未找到命令: $1" >&2
		exit 1
	fi
}

check_cmd make
check_cmd docker
check_cmd rsync
check_cmd ssh
if [ "$AUTO_SMOKE" != "off" ]; then
	check_cmd curl
fi

if [ ! -f "$SERVER_DIR/Makefile" ]; then
	echo "ERROR: 未找到 server/Makefile: $SERVER_DIR/Makefile" >&2
	exit 1
fi

# 兼容性兜底：目标主机改为显式传入，避免模板派生项目沿用过期宿主机地址。
if [ -z "$REMOTE_HOST" ]; then
	echo "ERROR: 请显式设置 REMOTE_HOST，例如 export REMOTE_HOST=deploy.example.internal" >&2
	exit 1
fi

REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"
REMOTE_IMAGE_TAR_NAME=$(basename "$IMAGE_TAR")

run_remote_preflight() {
	if [ "$PRE_DEPLOY_PREFLIGHT" = "off" ]; then
		echo "==> [0/8] 跳过远端资源预检（PRE_DEPLOY_PREFLIGHT=off）"
		return 0
	fi

	case "$PRE_DEPLOY_PREFLIGHT" in
	on) ;;
	*)
		echo "ERROR: PRE_DEPLOY_PREFLIGHT 仅支持 on/off，当前为 $PRE_DEPLOY_PREFLIGHT" >&2
		exit 1
		;;
	esac

	echo "==> [0/8] 远端资源预检"
	ssh "$REMOTE_TARGET" \
		"MIN_MEM_MB='${PREFLIGHT_MIN_MEM_AVAILABLE_MB}' MAX_ROOT_PCT='${PREFLIGHT_MAX_ROOT_USAGE_PCT}' FAIL_ON_POSTGRES='${PREFLIGHT_FAIL_ON_POSTGRES_UNHEALTHY}' POSTGRES_CONTAINER='${PREFLIGHT_POSTGRES_CONTAINER_NAME}' sh -s" <<'EOF'
set -eu

mem_available_kb=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
if [ -z "$mem_available_kb" ]; then
  echo "ERROR: 无法读取 /proc/meminfo 的 MemAvailable" >&2
  exit 11
fi
mem_available_mb=$((mem_available_kb / 1024))

root_usage_pct=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [ -z "$root_usage_pct" ]; then
  echo "ERROR: 无法读取根分区使用率" >&2
  exit 12
fi

postgres_status="missing"
if [ -n "$POSTGRES_CONTAINER" ] && docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  postgres_status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$POSTGRES_CONTAINER" 2>/dev/null || echo unknown)
fi

echo "  [INFO] MemAvailable=${mem_available_mb}MB"
echo "  [INFO] RootUsage=${root_usage_pct}%"
echo "  [INFO] ${POSTGRES_CONTAINER:-postgres}=${postgres_status}"

if [ "$mem_available_mb" -lt "$MIN_MEM_MB" ]; then
  echo "ERROR: 远端可用内存不足（${mem_available_mb}MB < ${MIN_MEM_MB}MB），中止部署。" >&2
  exit 21
fi

if [ "$root_usage_pct" -gt "$MAX_ROOT_PCT" ]; then
  echo "ERROR: 根分区占用过高（${root_usage_pct}% > ${MAX_ROOT_PCT}%），中止部署。" >&2
  exit 22
fi

if [ "$FAIL_ON_POSTGRES" = "1" ] && [ "$postgres_status" != "healthy" ] && [ "$postgres_status" != "missing" ]; then
  echo "ERROR: ${POSTGRES_CONTAINER} 当前不是 healthy（${postgres_status}），中止部署。" >&2
  exit 23
fi
EOF
}

sync_remote_migration_assets() {
	if [ ! -f "$LOCAL_MIGRATE_SCRIPT" ]; then
		echo "ERROR: 未找到本地迁移脚本: $LOCAL_MIGRATE_SCRIPT" >&2
		exit 1
	fi
	if [ ! -d "$LOCAL_MIGRATE_DIR" ]; then
		echo "ERROR: 未找到本地迁移目录: $LOCAL_MIGRATE_DIR" >&2
		exit 1
	fi

	ssh "$REMOTE_TARGET" "mkdir -p ${REMOTE_DIR}/${REMOTE_MIGRATE_DIR_NAME}"
	rsync -avz -e "ssh" "$LOCAL_MIGRATE_SCRIPT" "${REMOTE_TARGET}:${REMOTE_DIR}/${REMOTE_MIGRATE_SCRIPT_NAME}"
	rsync -avz -e "ssh" --delete --exclude '.DS_Store' "$LOCAL_MIGRATE_DIR/" "${REMOTE_TARGET}:${REMOTE_DIR}/${REMOTE_MIGRATE_DIR_NAME}/"
}

run_remote_migration_guard() {
	case "$DB_MIGRATION_MODE" in
	off | check | apply) ;;
	*)
		echo "ERROR: DB_MIGRATION_MODE 仅支持 off/check/apply，当前为 $DB_MIGRATION_MODE" >&2
		exit 1
		;;
	esac

	if [ "$DB_MIGRATION_MODE" = "off" ]; then
		echo "==> [1/8] 跳过线上迁移检查（DB_MIGRATION_MODE=off）"
		return 0
	fi

	echo "==> [1/8] 同步迁移脚本与目录: ${REMOTE_TARGET}:${REMOTE_DIR}"
	sync_remote_migration_assets

	if [ "$DB_MIGRATION_MODE" = "apply" ]; then
		echo "==> [2/8] 线上迁移检查并执行 apply"
		ssh "$REMOTE_TARGET" "cd ${REMOTE_DIR} && COMPOSE_FILE=./${REMOTE_COMPOSE_FILE_NAME} MIG_DIR=\$(pwd)/${REMOTE_MIGRATE_DIR_NAME} sh ./${REMOTE_MIGRATE_SCRIPT_NAME} --apply"
		return 0
	fi

	echo "==> [2/8] 线上迁移检查（存在 pending migration 时阻断发布）"
	migration_output=$(ssh "$REMOTE_TARGET" "cd ${REMOTE_DIR} && COMPOSE_FILE=./${REMOTE_COMPOSE_FILE_NAME} MIG_DIR=\$(pwd)/${REMOTE_MIGRATE_DIR_NAME} sh ./${REMOTE_MIGRATE_SCRIPT_NAME}" 2>&1) || {
		printf '%s\n' "$migration_output"
		echo "ERROR: 线上迁移检查失败，请先排查 migration 状态。" >&2
		exit 1
	}
	printf '%s\n' "$migration_output"
	if printf '%s\n' "$migration_output" | grep -Eq 'Pending Files:[[:space:]]*[1-9]'; then
		echo "ERROR: 检测到线上存在 pending migration；请先执行 DB_MIGRATION_MODE=apply 发布，或单独运行 migrate_online.sh --apply 后再继续。" >&2
		exit 1
	fi
}

collect_changed_files() {
	if ! command -v git >/dev/null 2>&1; then
		return 0
	fi

	if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
		return 0
	fi

	{
		if git -C "$REPO_ROOT" rev-parse --verify HEAD >/dev/null 2>&1 &&
			git -C "$REPO_ROOT" rev-parse --verify HEAD~1 >/dev/null 2>&1; then
			git -C "$REPO_ROOT" diff --name-only HEAD~1..HEAD || true
		fi
		git -C "$REPO_ROOT" status --porcelain 2>/dev/null | sed -E 's/^.. //'
	} | awk 'NF' | sort -u
}

resolve_smoke_mode() {
	changed_files="$1"
	case "$AUTO_SMOKE" in
	off | basic | strict)
		echo "$AUTO_SMOKE"
		return
		;;
	auto) ;;
	*)
		echo "ERROR: AUTO_SMOKE 仅支持 off/basic/auto/strict，当前为 $AUTO_SMOKE" >&2
		exit 1
		;;
	esac

	if printf '%s\n' "$changed_files" | grep -Eq '^(server/internal/|server/cmd/|server/configs/|server/api/|server/internal/data/model/migrate/|server/go\.mod$|server/go\.sum$|server/Dockerfile$|server/deploy/compose/prod/compose\.yml$)'; then
		echo "strict"
		return
	fi

	echo "basic"
}

run_http_check() {
	check_name="$1"
	check_url="$2"
	remote_url=$(printf '%s' "$check_url" | sed "s#^http://${REMOTE_HOST}#http://127.0.0.1#")

	case "$SMOKE_CHECK_ORIGIN" in
	remote)
		if ssh "$REMOTE_TARGET" "curl -fsS -m ${SMOKE_TIMEOUT} '${remote_url}' >/dev/null"; then
			echo "  [OK] ${check_name}: ${remote_url} (remote)"
			return 0
		fi
		;;
	local)
		if curl -fsS -m "$SMOKE_TIMEOUT" "$check_url" >/dev/null; then
			echo "  [OK] ${check_name}: ${check_url} (local)"
			return 0
		fi
		;;
	both)
		if ssh "$REMOTE_TARGET" "curl -fsS -m ${SMOKE_TIMEOUT} '${remote_url}' >/dev/null"; then
			echo "  [OK] ${check_name}: ${remote_url} (remote)"
			return 0
		fi
		if curl -fsS -m "$SMOKE_TIMEOUT" "$check_url" >/dev/null; then
			echo "  [OK] ${check_name}: ${check_url} (local)"
			return 0
		fi
		;;
	*)
		echo "ERROR: SMOKE_CHECK_ORIGIN 仅支持 remote/local/both，当前为 $SMOKE_CHECK_ORIGIN" >&2
		return 1
		;;
	esac

	echo "ERROR: 检查失败 -> ${check_name}: remote=${remote_url}, local=${check_url}" >&2
	return 1
}

run_smoke_check() {
	smoke_mode="$1"
	base_url="http://${REMOTE_HOST}"

	if [ "$smoke_mode" = "off" ]; then
		echo "==> [8/8] 跳过部署后检查（AUTO_SMOKE=off）"
		return 0
	fi

	echo "==> [8/8] 部署后检查（mode=${smoke_mode}）"
	run_http_check "业务 healthz" "${base_url}:${SIM_HTTP_PORT}${HEALTH_PATH}"
	run_http_check "业务 readyz" "${base_url}:${SIM_HTTP_PORT}${READY_PATH}"
	if [ -n "$SIM_ADMIN_HTTP_PORT" ]; then
		run_http_check "管理 healthz" "${base_url}:${SIM_ADMIN_HTTP_PORT}${HEALTH_PATH}"
		run_http_check "管理 readyz" "${base_url}:${SIM_ADMIN_HTTP_PORT}${READY_PATH}"
	fi

	echo "  [INFO] 远端容器状态:"
	ssh "$REMOTE_TARGET" "docker ps --filter name=^/${SMOKE_CONTAINER_NAME}$ --format '{{.Names}} {{.Image}} {{.Status}}'"

	if [ "$smoke_mode" != "strict" ]; then
		return 0
	fi

	run_http_check "业务首页" "${base_url}:${SIM_HTTP_PORT}/"
	if [ -n "$SIM_ADMIN_HTTP_PORT" ]; then
		run_http_check "管理首页" "${base_url}:${SIM_ADMIN_HTTP_PORT}/"
	fi

	container_started_at=$(ssh "$REMOTE_TARGET" "docker inspect -f '{{.State.StartedAt}}' ${SMOKE_CONTAINER_NAME} 2>/dev/null" || true)
	if [ -n "$container_started_at" ]; then
		remote_logs=$(ssh "$REMOTE_TARGET" "docker logs --since '${container_started_at}' ${SMOKE_CONTAINER_NAME} 2>&1" || true)
	else
		remote_logs=$(ssh "$REMOTE_TARGET" "docker logs --tail 200 ${SMOKE_CONTAINER_NAME} 2>&1" || true)
	fi
	if printf '%s\n' "$remote_logs" | grep -Eiq 'panic|fatal'; then
		echo "ERROR: 严格检查发现日志中包含 panic/fatal，请人工确认。" >&2
		printf '%s\n' "$remote_logs" | tail -n 40 >&2
		return 1
	fi
	echo "  [OK] 严格日志检查通过（tail 200 未发现 panic/fatal）"
}

run_remote_preflight
run_remote_migration_guard

echo "==> [3/8] 构建服务镜像"
(cd "$SERVER_DIR" && make build_server)

echo "==> [4/8] 导出镜像包: $IMAGE_NAME -> $IMAGE_TAR"
mkdir -p "$(dirname "$IMAGE_TAR")"
docker save -o "$IMAGE_TAR" "$IMAGE_NAME"

echo "==> [5/8] 上传镜像包到远端: ${REMOTE_TARGET}:${REMOTE_DIR}"
ssh "$REMOTE_TARGET" "mkdir -p ${REMOTE_DIR}"
rsync -avz -e "ssh" "$IMAGE_TAR" "${REMOTE_TARGET}:${REMOTE_DIR}"

echo "==> [6/8] 上传远端部署脚本与 compose: ${REMOTE_TARGET}:${REMOTE_DIR}"
rsync -avz -e "ssh" "$SCRIPT_DIR/deploy_server.sh" "${REMOTE_TARGET}:${REMOTE_DIR}/${REMOTE_SCRIPT_NAME}"
rsync -avz -e "ssh" "$SCRIPT_DIR/compose.yml" "${REMOTE_TARGET}:${REMOTE_DIR}/${REMOTE_COMPOSE_FILE_NAME}"

echo "==> [7/8] 远端执行部署脚本: ${REMOTE_SCRIPT_NAME}"
ssh "$REMOTE_TARGET" "cd ${REMOTE_DIR} && COMPOSE_FILE=./${REMOTE_COMPOSE_FILE_NAME} sh ./${REMOTE_SCRIPT_NAME} ${REMOTE_IMAGE_TAR_NAME}"

CHANGED_FILES=$(collect_changed_files || true)
CHANGED_COUNT=$(printf '%s\n' "$CHANGED_FILES" | awk 'NF{n++} END{print n+0}')
SMOKE_MODE=$(resolve_smoke_mode "$CHANGED_FILES")
if [ "$AUTO_SMOKE" = "auto" ]; then
	echo "==> 自动判定部署后检查模式: ${SMOKE_MODE}（变更文件 ${CHANGED_COUNT} 个）"
	if [ "$CHANGED_COUNT" -gt 0 ]; then
		printf '%s\n' "$CHANGED_FILES" | sed -n '1,20p' | sed 's/^/  - /'
		if [ "$CHANGED_COUNT" -gt 20 ]; then
			echo "  ...（其余省略）"
		fi
	fi
else
	echo "==> 使用指定部署后检查模式: ${SMOKE_MODE}"
fi
run_smoke_check "$SMOKE_MODE"

echo "==> 全部完成"
