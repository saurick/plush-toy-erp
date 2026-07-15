# Compose 部署说明

本目录是当前仓库唯一部署主路径，默认提供：

- `compose.yml`：PostgreSQL + Jaeger + 业务服务 + 前端单入口静态服务
- `.env.example`：推荐环境变量
- `migrate_online.sh`：通过宿主机 `/usr/local/bin/atlas` 执行 migration，并用同一个 `flock` 锁住完整 `status -> 055504 存量升级审计 -> 055825 客户配置切换审计 -> dry-run -> apply` 序列

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
cp .env.example .env
${EDITOR:-vi} .env
cd /Users/simon/projects/plush-toy-erp
bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose --env-file .env -f compose.yml up -d
```

首次启动前至少替换：

- `POSTGRES_PASSWORD`
- `POSTGRES_DSN`
- `POSTGRES_DATA_DIR`
- `APP_IMAGE`
- `WEB_IMAGE`
- `POSTGRES_IMAGE` 和 `JAEGER_IMAGE` 使用固定版本 tag，不能使用 `latest` / `dev`
- `APP_JWT_SECRET`
- `APP_AUTH_SMS_MODE=disabled`；如启用 `provider`，必须同时配置阿里云 PNVS `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID`、`APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET`、`APP_AUTH_SMS_ALIYUN_SIGN_NAME` 和 `APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE`
- `APP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_ONCE=false`；只有新库首次初始化 bootstrap 管理员时才临时改为 `true`
- `POSTGRES_BIND_ADDR=127.0.0.1`，PostgreSQL 宿主机映射只允许 loopback，migration 从宿主机本地 `127.0.0.1:5435` 访问
- `APP_HTTP_BIND_ADDR=127.0.0.1` 和 `APP_GRPC_BIND_ADDR=127.0.0.1`，后端 HTTP / gRPC 宿主机映射只允许 loopback；浏览器业务流量通过前端容器反代 `/rpc`

如果不需要自带 tracing 存储，可以再按需移除 Jaeger 服务和对应环境变量。

生产启动会阻断 `POSTGRES_DSN`、`APP_JWT_SECRET` 或 bootstrap 管理员密码中的 `change-this` / placeholder，拒绝已知本地开发默认密码，并拒绝 SMS mock、未显式关闭的 debug seed / cleanup。生产 Compose 默认不注入 `APP_ADMIN_PASSWORD`，避免环境变量长期覆盖配置文件里的管理员初始化口径。只有新库首次初始化需要创建 bootstrap 管理员时，才允许同时临时设置 `BOOTSTRAP_ADMIN_ONCE=true` 和 `APP_ADMIN_PASSWORD`；初始化成功后会写入 runtime marker 和 runtime audit event，后续重复 bootstrap 会被拒绝。已有 `admin` 或同名管理员不会被启动逻辑自动提权，应通过管理员改密或受控 SQL 更新密码哈希。当前产品不提供公开自助注册 API 或前端路由。

前端生产容器不运行 Vite dev server。`WEB_IMAGE` 是一个前端镜像，Compose 只启动 `web-desktop` 一个前端实例，并通过 `APP_ID=desktop`、`PORT=5175` 固定入口；岗位任务端统一走 `/m/<role>/tasks`，不再启动 8 个 `APP_ID=mobile-*` 生产容器。

## 关键环境变量

```bash
export PROJECT_SLUG=plush-toy-erp
export APP_IMAGE=plush-toy-erp-server:dev
export WEB_IMAGE=plush-toy-erp-web:dev
export POSTGRES_IMAGE=postgres:18.1
export JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0
export POSTGRES_DSN='postgres://postgres:***@postgres:5432/plush_erp?sslmode=disable'
export TRACE_ENDPOINT=jaeger:4318
export TRACE_RATIO=0.1
export WEB_API_ORIGIN=http://app-server:8300
export ERP_PDF_CHROME_PATH=/usr/bin/chromium
export ERP_PDF_RENDER_CONCURRENCY=4
export ERP_PDF_WARMUP=async
export APP_JWT_SECRET='replace-with-runtime-secret'
export APP_AUTH_SMS_MODE=disabled
# export APP_AUTH_SMS_MODE=provider
# export APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID='replace-with-runtime-ak-id'
# export APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET='replace-with-runtime-ak-secret'
# export APP_AUTH_SMS_ALIYUN_SIGN_NAME='速通互联验证码'
# export APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE='100001'
# export APP_AUTH_SMS_ALIYUN_TEMPLATE_PARAM='{"code":"##code##","min":"5"}'
export APP_ADMIN_USERNAME=admin
export BOOTSTRAP_ADMIN_ONCE=false
export ERP_DEBUG_ENV=prod
export ERP_DEBUG_SEED_ENABLED=false
export ERP_DEBUG_CLEANUP_ENABLED=false
export ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false
export ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=0
export ERP_CUSTOMER_TRIAL_TARGET=
export POSTGRES_BIND_ADDR=127.0.0.1
export APP_HTTP_BIND_ADDR=127.0.0.1
export APP_GRPC_BIND_ADDR=127.0.0.1
export JAEGER_BIND_ADDR=127.0.0.1
```

默认宿主机端口：

- PostgreSQL：`127.0.0.1:5435`
- HTTP：`127.0.0.1:8300`
- gRPC：`127.0.0.1:9300`
- 前端：`5175`

当前部署目标是内网服务器 `192.168.0.133`，Compose 入口位于：

```bash
/opt/plush-toy-erp/current/server/deploy/compose/prod
```

当前不再把 `8.218.4.199`、Cloudflare、`yoyoosun.net` 域名、Nginx 反代或 Let's Encrypt 证书作为本仓库的当前部署真源。阿里云服务器如曾经承载过镜像或网关配置，只能作为历史部署记录追溯，不能作为后续发布目标或当前运维口径。

说明：

- 宿主机本地开发 `make run` 默认连共享 PG `192.168.0.106:5432/plush_erp`
- 上面的 `127.0.0.1:5435` 只代表本仓库自带 Compose 的宿主机本地映射口径，不是日常开发默认 DSN，也不对公网或办公网暴露。
- 宿主机本地调试 `make run` 默认走 `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml` 里的 `192.168.0.106:4318`
- 宿主机线上进程默认走 `server/configs/prod/config.yaml` 里的 `127.0.0.1:4318`
- 当前 Compose 容器内默认走 `jaeger:4318`，因为容器内不能把宿主机的 `127.0.0.1` 当成 Jaeger 地址
- 当前 Compose 默认 `TRACE_RATIO=0.1`，排障时可临时调高，`1` 表示全量采样；排障结束后应恢复低采样。
- Compose 第三方镜像默认固定为 `POSTGRES_IMAGE=postgres:18.1` 和 `JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0`；升级时显式改 tag、跑 preflight，再记录发布证据。
- Jaeger 宿主机端口默认通过 `JAEGER_BIND_ADDR=127.0.0.1` 只绑定本机 loopback；远程查看优先用 SSH tunnel，不要把 Jaeger UI 或 OTLP 端口直接暴露到公网或办公网。
- PostgreSQL 宿主机端口默认通过 `POSTGRES_BIND_ADDR=127.0.0.1` 只绑定本机 loopback；Atlas migration 使用宿主机本地端口访问，不需要把 PostgreSQL 暴露给外部网络。
- 后端 HTTP / gRPC 宿主机端口默认通过 `APP_HTTP_BIND_ADDR=127.0.0.1` 和 `APP_GRPC_BIND_ADDR=127.0.0.1` 只绑定本机 loopback；浏览器业务流量通过前端容器 `/rpc` 反代到 Docker 网络内的 `app-server:8300`。
- `POSTGRES_DSN` 是 URL，若 `POSTGRES_PASSWORD` 包含 `@`、`:`、`/`、`%`、`#` 等特殊字符，DSN 里的密码必须先 URL 编码；`POSTGRES_PASSWORD` 本身保持原值。
- `ERP_ALLOW_CUSTOMER_TRIAL_CONFIG` 默认必须为 `0`，同时 `ERP_CUSTOMER_TRIAL_TARGET` 必须为空。只有 133 的隔离验收库可临时使用 `1` + `customer-trial-133`；启动门禁还会核对 `ERP_DEBUG_ENV=prod`，并按最终解析后的 DSN 精确要求单一 `postgres:5432/plush_erp_uat_20260715?sslmode=disable`。该开关只允许带独立 `customer_trial_test_apply` 标记的试用配置走标准 validate / publish / transition / activate / effective-session 链，不是正式发布能力；关闭开关后，若库中仍有该试用 revision 为 active，服务会拒绝启动，回滚时必须连同数据库目标一起恢复。
- 前端容器默认将 `/rpc` 和 `/templates` 反代到 `WEB_API_ORIGIN`，外部网关只需把前端流量映射到 `5175`
- 前端默认以根路径构建；如果网关使用路径前缀且不剥离前缀，需要先评审构建期 `VITE_BASE_URL`
- 如果后续要重新开放公网域名或网关入口，必须先补新的正式部署方案，再更新本 README、Compose 环境说明和对应 smoke；不要沿用已经撤销的阿里云 / Cloudflare 旧口径。
- PDF 运行依赖：服务端镜像内置 Debian `chromium` 与 `fonts-noto-cjk`，默认浏览器路径为 `/usr/bin/chromium`。Chromium 包固定为已在目标宿主验证的 `150.0.7871.100-1~deb12u1`，构建时会校验实际安装版本；升级时必须显式修改 pin，并重新执行容器 CDP、warmup 和真实 PDF smoke，不能让 `apt-get` 静默漂移浏览器版本。
- PDF 容器安全：服务端镜像固定以 `app`（uid / gid `10001`）运行，Chrome 参数保留 sandbox。`chromium-seccomp.json` 以 Docker Engine 29.5.2 使用的 Moby seccomp v0.2.3 默认 profile 为基线，只额外放行 Chromium user-namespace sandbox 需要的 `clone`、`clone3`、`unshare`；不得改成 `seccomp=unconfined`、关闭 AppArmor、授予 `SYS_ADMIN` 或使用 `--no-sandbox`。`production-preflight.sh --runtime` 会拒绝 root app-server 和未加载受控 profile 的容器；目标环境还必须验证 Chromium 能在该容器安全上下文正常启动，不能仅凭 Dockerfile 静态断言判定完成。
- PDF 资源建议：通用 Compose 默认 `APP_MEM_LIMIT=2g`、`APP_MEM_RESERVATION=768m`、`ERP_PDF_RENDER_CONCURRENCY=4`；确认宿主机资源充足的客户实例可使用 `APP_MEM_LIMIT=4g`、`APP_MEM_RESERVATION=1g`、`ERP_PDF_RENDER_CONCURRENCY=8`。正式发布使用 `ERP_PDF_WARMUP=async`。服务启动后异步预热共享 Chromium 和 CJK 字体，日志使用 `template pdf warmup started / success / failed` 口径；`/readyz` 在预热完成前或预热失败后保持未就绪。`off` 只用于短时故障隔离，不是 release-ready 状态；正式 smoke 还必须用受控管理员 token 调真实 `/templates/render-pdf`，请求不得携带 `customer_key` / `base_url`，并校验非空 PDF。并发和内存必须成对调整，低配实例优先降低并发，不能只扩大请求预算。

## 镜像构建

目标服务器配置较低，镜像构建必须在本地开发机或 CI 完成。服务器侧只负责接收镜像包、`docker load`、`docker compose up`、migration 和部署后检查；不要在服务器上执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
服务端 Dockerfile 已把 Go 依赖 / 编译缓存、固定 Chromium 与 CJK 字体安装层分开；同一源码和依赖下重复构建时，应复用这些缓存层。若固定 Chromium 版本已退出当前 Debian 仓库，构建应明确失败并要求评审新版本，不能自动回退旧版或升级到未验证版本。

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f server/Dockerfile -t plush-toy-erp-server:dev .
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

默认构建产物是中性产品包。yoyoosun 客户试用 / 交付镜像必须在本地或 CI 构建时显式传入客户 key，Dockerfile 会把客户 `customer-config.js` 和 `customer-assets/yoyoosun/` 写入前端静态产物；低配目标机仍不执行构建。

```bash
docker build \
  --build-arg ERP_CUSTOMER_KEY=yoyoosun \
  -f server/Dockerfile \
  -t plush-toy-erp-server:yoyoosun-dev .

docker build \
  --build-arg ERP_CUSTOMER_KEY=yoyoosun \
  -f web/Dockerfile \
  -t plush-toy-erp-web:yoyoosun-dev .
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

### 发布前门禁

正式发布前先在准备好的运行时 `.env` 上执行 preflight；该命令只检查配置、Compose、migration 脚本和低配部署边界，不读取业务行、不执行 migration，也不替代 `20260714055504` 前的 populated upgrade 只读审计：

```bash
cd /Users/simon/projects/plush-toy-erp
bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env
```

等价 Make 入口：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make production_preflight
```

部署后可追加运行态检查：

```bash
cd /Users/simon/projects/plush-toy-erp
bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --runtime
```

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

低配服务器上不要使用 `arigaio/atlas:*` 临时容器，也不要把 Atlas 写入 Compose。先把 Atlas 安装到宿主机 `/usr/local/bin/atlas`；脚本会通过宿主机映射端口访问 PostgreSQL，并在同一个 `/run/lock/plush-toy-erp/atlas-migrate.lock` 锁内完成 `status -> 055504 存量升级审计 -> 055825 客户配置切换审计 -> dry-run -> apply`，锁由脚本进程持有到序列结束或失败退出。脚本使用 `umask 077` 创建 `0700 / 0600` 锁目录和文件；已有目录必须本来就是 `0700`，脚本不会修改其他目录的权限。相对路径、符号链接和非当前执行用户所有的路径会被拒绝，锁文件以追加方式打开，不截断已有内容。

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
sh migrate_online.sh --status-only
sh migrate_online.sh
MIGRATION_MAINTENANCE_CONFIRMED=1 sh migrate_online.sh --apply
```

三种调用的证据边界不同：

- `--status-only` 只输出 Atlas status，不运行存量审计、dry-run 或 apply。
- 默认调用在 status 后依次执行 `--audit populated-upgrade` 和 `--audit customer-config-cutover`，两项都通过才继续 Atlas dry-run，不执行正式 migration。
- `--apply` 仍要求停写、停止 `app-server` 并显式设置 `MIGRATION_MAINTENANCE_CONFIRMED=1`；只有 status、两项只读审计和 dry-run 全部成功才进入 apply。

升级链包含 `20260714055504_migrate.sql` 时，`populated-upgrade` 审计定位不满足目标 CHECK、外键、状态、版本、取消审计束或即将被删除时间字段的现存行；包含 `20260714055825_customer_config_append_only_and_role_backfill.sql` 时，`customer-config-cutover` 审计定位必须显式治理的流程运行态和任务配置锚点。两项事务都是 read-only，不自动修复数据。出现 blocker 时立即停止：需保留的正式记录必须进入单独评审的人工治理，明确映射、操作者、审计记录、备份、回滚点和失败条件；不得在迁移脚本或发布脚本中追加自动 DML。fresh schema、静态 DDL、Atlas validate 或空库从零迁移只能证明目标结构和迁移链，不证明 populated upgrade。

备份恢复演练遵循同一边界：dump 恢复到隔离 PostgreSQL 后，先记录 pre-apply status，再运行两项适用的只读审计；只有审计通过才允许 apply。恢复链跨越对应 revision 时，脚本会在 `backup-evidence.md`、`backup-restore-report.json` 和 `command-summary.txt` 中分别记录审计通过状态，release gate 会交叉核对字段、步骤和 migrationBefore / migrationAfter；任一缺失都不能作为完整证据。正式证据还必须绑定本次备份、release 和 migration version，不能由 fresh 结果替代。

常用覆盖项：

```bash
export COMPOSE_FILE=/path/to/compose.yml
export MIG_DIR=/path/to/server/internal/data/model/migrate
export POSTGRES_SERVICE=postgres
export POSTGRES_HOST=127.0.0.1
export POSTGRES_HOST_PORT=5435
export ATLAS_BIN=/usr/local/bin/atlas
export PSQL_BIN=/usr/bin/psql
export POPULATED_UPGRADE_PREFLIGHT=/path/to/scripts/qa/populated-upgrade-preflight.sh
export MIGRATION_LOCK_FILE=/run/lock/plush-toy-erp/atlas-migrate.lock
```

`MIGRATION_LOCK_FILE` 必须是绝对路径，父目录必须专用于迁移锁并归当前迁移执行用户所有。自定义路径时在调用脚本前显式 `export`；`migrate_online.sh` 不会 source Compose `.env`，避免把生产 secret 当作 shell 代码解析。

## 最小校验

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose -f compose.yml config
docker compose -f compose.yml ps
```
