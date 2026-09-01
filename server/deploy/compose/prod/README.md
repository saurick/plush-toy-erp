# Compose 部署说明

本目录是仓库内唯一的单宿主机 Compose 部署真源：

- `compose.yml`：PostgreSQL、Jaeger、业务服务与单一 Web 入口。
- `compose.demo-133.yml`：`demo-133` 的固定 Compose project 覆盖。
- `compose.customer-test-133.yml`：`customer-test-133` 的固定 Compose project 覆盖。
- `.env.example`：运行环境变量示例，不保存真实凭据。
- `migrate_online.sh`：按登记目标执行受控 Atlas migration。

当前可执行环境只有 `demo-133` 与 `customer-test-133`。`erp` 是未来生产环境，尚未启用；根域临时跳转到 `erp.yoyoosun.net` 不会把它变成可执行 target。`admin.yoyoosun.net` 退役后仍不能进入 target、Compose、migration、清理、健康检查、发布或回滚矩阵。

## 目标矩阵

所有精确身份以 [`scripts/deploy/deployment-targets.json`](../../../../scripts/deploy/deployment-targets.json) 为唯一真源，浏览器或命令行不能临时覆盖。

| target | 业务用途 | 公网入口 | Compose project | 数据库 | PostgreSQL / API / Web |
| --- | --- | --- | --- | --- | --- |
| `demo-133` | 项目方造数、演练、培训与回归；允许受控重建 | `demo.yoyoosun.net` | `plush-toy-erp-demo-v1` | `plush_erp_demo_v1` | `55436 / 8325 / 5195` |
| `customer-test-133` | 甲方测试与验收；普通部署保留数据，需要时独立重建 | `test.yoyoosun.net` | `plush-toy-erp-test-v1` | `plush_erp_customer_test_v1` | `55437 / 8335 / 5205` |

两个环境部署同一不可变 release digest，但数据库、上传、Compose project、端口、runtime env、数据目录、migration 锁、备份、回滚点、operation 与 smoke 必须完全独立。demo 造数不能进入 test；test 的普通 promotion 保留数据，显式重建或清理不能影响 demo。

`customer-trial-133` 仍是 demo 内部模拟数据合同的 target key，不是第三个部署环境。它只能在 `demo-133` 的受控数据准备链中使用。

## 快速开始（仅本地或新建隔离环境）

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
cp .env.example .env
${EDITOR:-vi} .env

cd /Users/simon/projects/plush-toy-erp
bash scripts/deploy/production-preflight.sh \
  --env-file server/deploy/compose/prod/.env

cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
docker compose --env-file .env -f compose.yml up -d
```

不得把这段本地命令用于绕过登记 target。远端 promotion、rollback、数据库重建和 smoke 必须通过 `scripts/deploy` 的 controller / executor 主路径。

## 运行环境边界

首次启动前至少设置：

- 固定版本的 `POSTGRES_IMAGE`、`JAEGER_IMAGE`、`APP_IMAGE`、`WEB_IMAGE`，不得使用 `latest` 或 `dev`。
- 互不复用的 PostgreSQL 管理、迁移、备份和应用凭据。
- `APP_JWT_SECRET` 与按目标登记的管理员初始化输入。
- `POSTGRES_DATA_DIR`、`MIGRATION_LOCK_FILE`、宿主端口和 `PROJECT_SLUG` 必须与目标 registry 一致。
- `POSTGRES_BIND_ADDR=127.0.0.1`、`APP_HTTP_BIND_ADDR=127.0.0.1`、`JAEGER_BIND_ADDR=127.0.0.1`。
- `WEB_DESKTOP_BIND_ADDR=127.0.0.1`；公网流量只经各目标的独立、受控 Web 入口。
- `BOOTSTRAP_ADMIN_ONCE=false`；仅新库的受控一次性管理员初始化窗口可临时开启。
- `ERP_DEBUG_ENV=prod`，所有 debug seed / cleanup / business clear 开关保持关闭。

生产 Compose 不持久注入 `APP_ADMIN_PASSWORD`。初始化成功后必须回到无密码的 steady env，并单独完成客户配置、health、ready、smoke 与目标读回。

运行 env 必须是目标用户拥有的普通文件、权限精确为 `0600`，文件与父路径都不得是符号链接。preflight 使用私有快照读取并在结束前复核原文件身份；冲突只报告键名，不输出值。

## 一次性管理员 bootstrap

全新库先完成 migration，并保持常驻 `app-server` 停止。再从仓库根目录运行受控入口：

```bash
APP_ADMIN_PASSWORD='<ephemeral-secret>' \
  bash scripts/deploy/bootstrap-production-admin.sh \
    --deployment-target '<demo-133|customer-test-133>' \
    --env-file '<absolute-runtime-env>' \
    --expected-database '<exact-database>' \
    --expected-migration '<14-digit-atlas-version>' \
    --expected-release '<40-character-lowercase-git-sha>' \
    --confirm 'BOOTSTRAP_PRODUCTION_ADMIN:<project>:<database>:<username>:<migration>:<release>'
```

脚本成功只证明管理员、marker、audit 与内置 RBAC 已读回；它不替代客户配置、数据准备、目标 smoke 或验收。

## demo 模拟数据

只有 `demo-133` 可以启用内部 `customer-trial-133` 模拟数据合同：

- 数据库固定为 `plush_erp_demo_v1`。
- Compose project 固定为 `plush-toy-erp-demo-v1`。
- 运行根目录固定为 `/home/simon/plush-toy-erp-demo-v1`。
- 稳态仍必须 `BOOTSTRAP_ADMIN_ONCE=false`，不得持久保存 bootstrap 密码。
- 造数只走正式 JSON-RPC / usecase，不复制数据库行，不用 Workflow payload 冒充 Fact。
- 凭据轮换、完整账号矩阵、PDF 与业务页面验收均是独立证据。

模拟数据可以通过受控 rebuild operation 重建，但执行器必须先创建并恢复校验备份、保存旧物理数据代和精确回滚身份。禁止裸清表、volume 删除、临时 SQL 或跨环境复制。

## customer-test 干净基线

`customer-test-133` 用于甲方自行录入真实测试数据。它不执行 demo 的 seed / fixture / 模拟业务造数。需要恢复干净基线时，只能走正式 database rebuild 主路径：

1. 绑定当前不可变 release、目标身份与未结束 operation。
2. 创建并恢复校验备份，记录精确 rollback point。
3. 保存旧 PostgreSQL 物理数据代，再创建 fresh 物理代。
4. 执行 migration、一次性管理员 bootstrap 和空业务基线读回。
5. 读回 release、migration、health、ready、登录入口与备份/回滚身份。

本轮环境登记不代表现在立即清理 test。没有现状分类、保留/删除合同和恢复验证时，任何数据清理都必须停止。

## 公网入口

`demo.yoyoosun.net` 与 `test.yoyoosun.net` 各自绑定其登记 Web 入口。切换只允许使用 `deployments/yoyoosun/scripts/cutover-public-web.sh`，并要求：

- target、容器前缀、Docker network 和宿主端口与 registry 精确一致；
- 镜像 release、健康、ready、Provider 能力和公网 exact SHA 可读回；
- 失败恢复原入口，不修改数据库、后端或 Jaeger 的 loopback 边界。

DNS、TLS 和反向代理是目标运行证据，不是 Compose 文件中的第二套环境真源。

## 迁移脚本

登记目标只使用：

```bash
DEPLOYMENT_TARGET_KEY='<demo-133|customer-test-133>' \
  sh server/deploy/compose/prod/migrate_online.sh --status-only

DEPLOYMENT_TARGET_KEY='<demo-133|customer-test-133>' \
  sh server/deploy/compose/prod/migrate_online.sh
```

写入前仍需项目既有的 prepare / confirmation / maintenance 门禁。脚本固定使用目标 release 内 migration、目标根目录登记的 Atlas、`psql` 和独立 `flock`；宿主或 env 不能覆盖工具/路径键。`status-only` 是只读证据，不等于 migration 已执行。

## PDF 与可观测性

- 服务端镜像内置固定 Chromium 与 CJK 字体；浏览器版本、warmup、sandbox、内存与并发由 preflight 和 smoke 守住。
- Jaeger 仅绑定 loopback，不直接暴露到公网或办公网。
- 应用连接池预算必须与 PostgreSQL `max_connections`、migration、备份和运维保留量一起计算。
- 日志、回执和 evidence 不保存密码、token、客户正文、原始配置或 PDF 正文。

## 发布与回滚

目标机不构建源码，只 load / pull 已发布的不可变制品。promotion 必须绑定同一 Git SHA、image digest、migration 序列、客户配置源指纹和 release rehearsal；成功后分别读回 Compose、容器 image/content identity、`GIT_SHA`、health、ready、公网入口和 rollback point。

代码回滚只允许 migration 序列与客户配置源指纹兼容的旧 manifest；不自动 down migration，也不把数据库恢复隐藏在代码回滚中。任何结果为 `not_proven` 时先只读核对目标，禁止重试。

## 最小检查

```bash
bash -n scripts/deploy/production-preflight.sh
bash -n server/deploy/compose/prod/migrate_online.sh
node --test scripts/deploy/deployment-targets.test.mjs \
  scripts/deploy/production-preflight.test.mjs \
  scripts/deploy/migrate-online.test.mjs
git diff --check
```

自动化绿色不替代目标 DNS/TLS、备份恢复、运行 SHA、数据身份和业务 smoke 的实时读回。
