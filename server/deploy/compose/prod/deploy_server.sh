#!/usr/bin/env sh
set -eu

# 设计意图：只更新目标服务容器，避免误停 postgres/jaeger 等依赖服务。
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/compose.yml}"
PROJECT_SLUG="${PROJECT_SLUG:-plush-toy-erp}"
SERVICE_NAME="${SERVICE_NAME:-app-server}"
SERVICE_CONTAINER_NAME="${SERVICE_CONTAINER_NAME:-${PROJECT_SLUG}-server}"
IMAGE_TAR="${1:-app-server.tar}"

usage() {
	cat <<'USAGE_EOF'
用法:
  sh deploy_server.sh [image_tar_path]

示例:
  sh deploy_server.sh
  sh deploy_server.sh /data/release/app-server.tar

可选环境变量:
  COMPOSE_FILE            compose 文件路径（默认同目录 compose.yml）
  PROJECT_SLUG            项目标识（默认 plush-toy-erp，用于推导容器名）
  SERVICE_NAME            需要更新的服务名（默认 app-server）
  SERVICE_CONTAINER_NAME  业务容器名（默认 ${PROJECT_SLUG}-server）
USAGE_EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
	usage
	exit 0
fi

if [ ! -f "$COMPOSE_FILE" ]; then
	echo "ERROR: compose 文件不存在: $COMPOSE_FILE" >&2
	exit 1
fi

if [ ! -f "$IMAGE_TAR" ]; then
	echo "ERROR: 镜像包不存在: $IMAGE_TAR" >&2
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

echo "==> [1/3] 导入镜像: $IMAGE_TAR"
docker load -i "$IMAGE_TAR"

echo "==> [2/3] 停止并移除旧容器: $SERVICE_NAME"
compose stop "$SERVICE_NAME" >/dev/null 2>&1 || true
compose rm -f "$SERVICE_NAME" >/dev/null 2>&1 || true
docker stop "$SERVICE_CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm -f "$SERVICE_CONTAINER_NAME" >/dev/null 2>&1 || true

echo "==> [3/3] 启动新容器: $SERVICE_NAME"
compose up -d --no-deps "$SERVICE_NAME"

echo "==> 部署完成，当前状态:"
compose ps "$SERVICE_NAME"
