# Compose 部署说明

本目录是当前仓库唯一部署主路径，默认提供：

- `compose.yml`：PostgreSQL + Jaeger + 业务服务 + 前端单入口静态服务
- `.env.example`：推荐环境变量
- `migrate_online.sh`：通过宿主机 `/usr/local/bin/atlas` 执行 migration

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
- `APP_JWT_SECRET`
- `APP_ADMIN_USERNAME`

如果不需要自带 tracing 存储，可以再按需移除 Jaeger 服务和对应环境变量。

生产 Compose 默认不注入 `APP_ADMIN_PASSWORD`，避免环境变量长期覆盖配置文件里的管理员初始化口径。只有明确需要通过环境变量覆盖首次初始化密码时才临时添加；如果 `admin` 已经存在，重启不会重置旧密码，应通过管理员改密或受控 SQL 更新密码哈希。

前端生产容器不运行 Vite dev server。`WEB_IMAGE` 是一个前端镜像，Compose 只启动 `web-desktop` 一个前端实例，并通过 `APP_ID=desktop`、`PORT=5175` 固定入口；岗位任务端统一走 `/m/<role>/tasks`，不再启动 8 个 `APP_ID=mobile-*` 生产容器。

## 关键环境变量

```bash
export PROJECT_SLUG=plush-toy-erp
export IMAGE_NAME=plush-toy-erp-server:dev
export WEB_IMAGE=plush-toy-erp-web:dev
export POSTGRES_DSN='postgres://postgres:***@postgres:5432/plush_erp?sslmode=disable'
export TRACE_ENDPOINT=jaeger:4318
export TRACE_RATIO=0.1
export WEB_API_ORIGIN=http://app-server:8300
export ERP_PDF_CHROME_PATH=/usr/bin/chromium
export ERP_PDF_RENDER_CONCURRENCY=2
export ERP_PDF_WARMUP_ENABLED=true
export APP_JWT_SECRET='replace-with-runtime-secret'
export APP_ADMIN_USERNAME=admin
export ERP_DEBUG_ENV=prod
export ERP_DEBUG_SEED_ENABLED=false
export ERP_DEBUG_CLEANUP_ENABLED=false
export JAEGER_BIND_ADDR=127.0.0.1
```

默认宿主机端口：

- PostgreSQL：`5435`
- HTTP：`8300`
- gRPC：`9300`
- 前端：`5175`

当前部署目标是内网服务器 `192.168.0.133`，Compose 入口位于：

```bash
/opt/plush-toy-erp/current/server/deploy/compose/prod
```

当前不再把 `8.218.4.199`、Cloudflare、`yoyoosun.net` 域名、Nginx 反代或 Let's Encrypt 证书作为本仓库的当前部署真源。阿里云服务器如曾经承载过镜像或网关配置，只能作为历史部署记录追溯，不能作为后续发布目标或当前运维口径。

说明：

- 宿主机本地开发 `make run` 默认连共享 PG `192.168.0.106:5432/plush_erp`
- 上面的 `5435` 只代表本仓库自带 Compose 的宿主机映射口径，不是日常开发默认 DSN
- 宿主机本地调试 `make run` 默认走 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml` 里的 `192.168.0.106:4318`
- 宿主机线上进程默认走 `server/configs/prod/config.yaml` 里的 `127.0.0.1:4318`
- 当前 Compose 容器内默认走 `jaeger:4318`，因为容器内不能把宿主机的 `127.0.0.1` 当成 Jaeger 地址
- 当前 Compose 默认 `TRACE_RATIO=0.1`，排障时可临时调高，`1` 表示全量采样；排障结束后应恢复低采样。
- Jaeger 宿主机端口默认通过 `JAEGER_BIND_ADDR=127.0.0.1` 只绑定本机 loopback；远程查看优先用 SSH tunnel，不要把 Jaeger UI 或 OTLP 端口直接暴露到公网或办公网。
- `POSTGRES_DSN` 是 URL，若 `POSTGRES_PASSWORD` 包含 `@`、`:`、`/`、`%`、`#` 等特殊字符，DSN 里的密码必须先 URL 编码；`POSTGRES_PASSWORD` 本身保持原值。
- 前端容器默认将 `/rpc` 和 `/templates` 反代到 `WEB_API_ORIGIN`，外部网关只需把前端流量映射到 `5175`
- 前端默认以根路径构建；如果网关使用路径前缀且不剥离前缀，需要先评审构建期 `VITE_BASE_URL`
- 如果后续要重新开放公网域名或网关入口，必须先补新的正式部署方案，再更新本 README、Compose 环境说明和对应 smoke；不要沿用已经撤销的阿里云 / Cloudflare 旧口径。
- PDF 运行依赖：服务端镜像内置 Debian `chromium` 与 `fonts-noto-cjk`，默认浏览器路径为 `/usr/bin/chromium`；如需自定义可通过 `ERP_PDF_CHROME_PATH` 覆盖。
- PDF 资源建议：默认 `APP_MEM_LIMIT=896m`、`ERP_PDF_RENDER_CONCURRENCY=2`、`ERP_PDF_WARMUP_ENABLED=true`，服务启动后异步预热共享 Chromium 和 CJK 字体，`/readyz` 在预热完成前保持未就绪，优先稳住在线 PDF 首次预览；如果同机项目较多或极低内存排障，先降低并发，必要时再临时关闭预热。

## 镜像构建

目标服务器配置较低，镜像构建必须在本地开发机或 CI 完成。服务器侧只负责接收镜像包、`docker load`、`docker compose up`、migration 和部署后检查；不要在服务器上执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
服务端 Dockerfile 已把 Go 依赖 / 编译缓存、Chromium 与 CJK 字体安装层分开；同一源码和依赖下重复构建时，应复用这些缓存层。

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f server/Dockerfile -t plush-toy-erp-server:dev .
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

前端容器也可以独立运行，例如：

```bash
docker run --rm \
  -e APP_ID=desktop \
  -e PORT=5175 \
  -e API_ORIGIN=http://host.docker.internal:8300 \
  -p 5175:5175 \
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

远程服务器默认只绑定 loopback。先建立 SSH tunnel：

```bash
ssh -L 16687:127.0.0.1:16687 <user>@<server>
```

再从本机浏览器打开：

```bash
open http://127.0.0.1:16687
```

## 迁移脚本

低配服务器上不要使用 `arigaio/atlas:*` 临时容器，也不要把 Atlas 写入 Compose。先把 Atlas 安装到宿主机 `/usr/local/bin/atlas`；脚本会通过宿主机映射端口访问 PostgreSQL，并用 `/tmp/atlas-migrate.lock` 串行化迁移。

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
sh migrate_online.sh --status-only
sh migrate_online.sh
sh migrate_online.sh --apply
```

常用覆盖项：

```bash
export COMPOSE_FILE=/path/to/compose.yml
export MIG_DIR=/path/to/server/internal/data/model/migrate
export POSTGRES_SERVICE=postgres
export POSTGRES_HOST=127.0.0.1
export POSTGRES_HOST_PORT=5435
export ATLAS_BIN=/usr/local/bin/atlas
```

## 最小校验

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml config
docker compose -f compose.yml ps
```
