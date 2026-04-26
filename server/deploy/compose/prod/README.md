# Compose 部署说明

本目录是当前仓库唯一部署主路径，默认提供：

- `compose.yml`：PostgreSQL + Jaeger + 业务服务 + 前端固定端口静态服务
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
- `WEB_IMAGE`

如果不需要自带 tracing 存储，可以再按需移除 Jaeger 服务和对应环境变量。

前端生产容器不运行 Vite dev server。`WEB_IMAGE` 是一个前端镜像，Compose 会用同一镜像启动桌面端和 8 个移动端实例，并通过 `APP_ID` 与 `PORT` 固定每个入口。

## 关键环境变量

```bash
export PROJECT_SLUG=plush-toy-erp
export IMAGE_NAME=plush-toy-erp-server:dev
export WEB_IMAGE=plush-toy-erp-web:dev
export POSTGRES_DSN='postgres://postgres:***@postgres:5432/plush_erp?sslmode=disable'
export TRACE_ENDPOINT=jaeger:4318
export WEB_API_ORIGIN=http://app-server:8200
```

默认宿主机端口：

- PostgreSQL：`5435`
- HTTP：`8200`
- gRPC：`9200`
- 桌面后台：`5175`
- 老板移动端：`5186`
- 业务移动端：`5187`
- 采购移动端：`5188`
- 生产移动端：`5189`
- 仓库移动端：`5190`
- 财务移动端：`5191`
- PMC 移动端：`5192`
- 品质移动端：`5193`

说明：

- 宿主机本地开发 `make run` 默认连共享 PG `192.168.0.106:5432/plush_erp`
- 上面的 `5435` 只代表本仓库自带 Compose 的宿主机映射口径，不是日常开发默认 DSN
- 宿主机本地调试 `make run` 默认走 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml` 里的 `192.168.0.106:4318`
- 宿主机线上进程默认走 `server/configs/prod/config.yaml` 里的 `127.0.0.1:4318`
- 当前 Compose 容器内默认走 `jaeger:4318`，因为容器内不能把宿主机的 `127.0.0.1` 当成 Jaeger 地址
- 前端容器默认将 `/rpc` 和 `/templates` 反代到 `WEB_API_ORIGIN`，外部网关可以直接把入口流量映射到对应前端固定端口
- 前端默认以根路径构建；如果网关使用路径前缀且不剥离前缀，需要按入口重新设置构建期 `VITE_BASE_URL`

## 前端镜像

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

单入口容器也可以独立运行，例如：

```bash
docker run --rm \
  -e APP_ID=mobile-boss \
  -e PORT=5186 \
  -e API_ORIGIN=http://host.docker.internal:8200 \
  -p 5186:5186 \
  plush-toy-erp-web:dev
```

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
