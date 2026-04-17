# Compose 部署说明

本目录是当前仓库唯一部署主路径，默认提供：

- `compose.yml`：PostgreSQL + Jaeger + 业务服务
- `.env.example`：推荐环境变量
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
export POSTGRES_DSN='postgres://postgres:***@postgres:5432/plush_toy_erp?sslmode=disable'
export TRACE_ENDPOINT=jaeger:4318
```

说明：

- 宿主机本地调试 `make run` 默认走 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml` 里的 `192.168.0.106:4318`
- 宿主机线上进程默认走 `server/configs/prod/config.yaml` 里的 `127.0.0.1:4318`
- 当前 Compose 容器内默认走 `jaeger:4318`，因为容器内不能把宿主机的 `127.0.0.1` 当成 Jaeger 地址

## 常用操作

### 本地启动

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
```

### 更新业务容器

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml up -d app-server
```

如果镜像标签已经更新，先执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml pull app-server
docker compose -f compose.yml up -d app-server
```

### 查看 Jaeger

```bash
open http://127.0.0.1:16687
```

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
docker compose -f compose.yml ps
```
