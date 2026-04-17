# Compose 部署说明

本目录是当前仓库唯一部署主路径，默认提供：

- `compose.yml`：PostgreSQL + Jaeger + 业务服务
- `.env.example`：推荐环境变量
- `deploy_server.sh`：远端主机只重建业务容器
- `publish_server.sh`：本地构建、打包、上传、远端部署一条龙
- `migrate_online.sh`：通过临时 Atlas 容器执行 migration

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
cp .env.example .env
docker compose -f compose.yml up -d
```

首次启动前至少替换：

- `POSTGRES_PASSWORD`
- `POSTGRES_DSN`
- `POSTGRES_DATA_DIR`
- `APP_IMAGE`

如果不需要自带 tracing 存储，可以再按需移除 Jaeger 服务和对应环境变量。

## 关键环境变量

```bash
export PROJECT_SLUG=plush-toy-erp
export IMAGE_NAME=plush-toy-erp-server:dev
export REMOTE_HOST=deploy.example.internal
export REMOTE_USER=deploy
export REMOTE_DIR=~/deploy/plush-toy-erp
export POSTGRES_DSN='postgres://postgres:***@postgres:5432/plush_toy_erp?sslmode=disable'
export TRACE_ENDPOINT=jaeger:4318
export DB_MIGRATION_MODE=check
export AUTO_SMOKE=auto
```

## 常用操作

### 本地启动

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

### 远端只更新业务容器

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
sh deploy_server.sh
```

### 本地构建并远端发布

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
sh publish_server.sh
```

`publish_server.sh` 默认会：

1. 检查远端资源和 PostgreSQL 健康状态
2. 同步 migration 并检查是否存在 pending migration
3. 在 `server` 目录执行构建
4. 导出镜像包并上传到远端
5. 远端执行 `deploy_server.sh`
6. 运行基础 smoke 检查

## 迁移脚本

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
sh migrate_online.sh --status-only
sh migrate_online.sh
sh migrate_online.sh --apply
```

## 最小校验

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml config
```
