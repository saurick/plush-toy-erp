# 部署脚本 / Deploy Scripts

本文是 `scripts/deploy/` 的目录入口。部署主路径和目标环境边界仍以 [server/deploy/README.md](../../server/deploy/README.md)、[server/deploy/compose/prod/README.md](../../server/deploy/compose/prod/README.md) 和 [docs/部署约定.md](../../docs/部署约定.md) 为准。

## 目录职责

`scripts/deploy/` 放生产 preflight、release evidence、客户配置发布证据、closeout plan / runner 和部署资料包检查工具。多数脚本默认只读或 report-only；真实执行必须显式确认，并满足对应 evidence、备份、smoke、权限和脱敏前置。

## 常用入口

| 入口                                                        | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 是否执行目标动作                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `bash scripts/deploy/production-preflight.sh`               | 检查生产 env、Compose、固定镜像 tag、migration、PDF warmup / Chromium 版本和低配部署边界；运行 env 必须由当前用户持有且精确 `0600`，无 symlink 父路径，并通过私有快照阻断 TOCTOU；133 V5 还要求受控 override、显式 `-p plush-toy-erp-v5` 并解析真实 project；release evidence 必须用 `--runtime --expected-release <40sha>` 复核四服务唯一容器、env image ref、image / container content ID、app / web `GIT_SHA`、容器名、project、端口、挂载、app 身份、warmup、包版本和 health / ready | 否，只检查                                 |
| `bash scripts/deploy/bootstrap-production-admin.sh`         | 在已迁移的全新目标库中，用当前固定镜像的一次性 Compose 容器创建首个超级管理员，并精确读回数据库、release、migration、marker、audit 和内置 RBAC；密码只从当前进程环境临时注入                                                                                                                                                                                                                                                                                                             | 是；仅允许全新库显式确认后执行一次         |
| `node scripts/deploy/release-evidence-status.mjs`           | 只读汇总 release evidence 目录状态、缺口和下一步                                                                                                                                                                                                                                                                                                                                                                                                                                         | 否，只读                                   |
| `node scripts/deploy/release-evidence-gate.mjs`             | 校验 release evidence 是否满足门禁                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 否，只校验证据                             |
| `node scripts/deploy/release-evidence-closeout-plan.mjs`    | 从 status 生成分组 closeout action 和缺失输入                                                                                                                                                                                                                                                                                                                                                                                                                                            | 否，只生成计划                             |
| `node scripts/deploy/release-evidence-closeout-runner.mjs`  | materialize closeout plan；默认 report-only，显式确认后才执行可运行机器步骤                                                                                                                                                                                                                                                                                                                                                                                                              | 默认否，`--execute` 才执行                 |
| `node scripts/deploy/customer-config-release-readiness.mjs` | 聚合客户配置 manifest、release evidence、activation gate 和读回证据                                                                                                                                                                                                                                                                                                                                                                                                                      | 否，只聚合证据                             |
| `node scripts/deploy/customer-config-release-execute.mjs`   | 客户配置 validate / publish / activate / rollback 执行器                                                                                                                                                                                                                                                                                                                                                                                                                                 | 默认否，显式确认后才调用 JSON-RPC          |
| `node scripts/deploy/source-archive-release-check.mjs`      | 从指定 committed Git ref 构建临时源码包并检查构建输入闭包；`--light` 验证解包与客户 Web overlay，`--execute` 才执行 clean-worktree release 检查                                                                                                                                                                                                                                                                                                                                          | 默认否；`--execute` 运行独立 T8 源码包检查 |

`source-archive-release-check.mjs` 始终从 committed tree 创建临时 archive，不把当前 dirty worktree 混入源码包。默认 plan 和 `--light` 只提供源码包结构诊断；`--execute` 仍要求 clean worktree，并通过 archive 内的 `scripts/lib/pnpm.sh` 解析与 `web/package.json` 锁定版本一致的 Node / pnpm，不直接信任 raw `PATH` 中的 pnpm。该入口是独立的 T8 source-package 检查，不替代 `fast.sh` / `full.sh` / `strict.sh`，也不证明目标环境发布、migration、smoke、release evidence 或人工签收已经完成。

```bash
node scripts/deploy/source-archive-release-check.mjs --ref HEAD --json
node scripts/deploy/source-archive-release-check.mjs --light --ref HEAD --json
# 只在 clean worktree 且准备执行独立源码包构建检查时运行：
node scripts/deploy/source-archive-release-check.mjs --execute --ref HEAD
```

## 全新库首次管理员

全新生产形态数据库完成 Atlas migration 后、常驻 `app-server` 启动前，使用受控入口创建首个管理员。steady `.env` 必须保持 `BOOTSTRAP_ADMIN_ONCE=false`，也不得包含 `APP_ADMIN_PASSWORD`；密码只在当前命令环境中短暂存在。脚本拒绝本地开发默认密码 `adminadmin`，不会覆盖已有管理员，也不会在 marker 已提交后自动回滚或重跑。

```bash
APP_ADMIN_PASSWORD='<8-to-20-character-ephemeral-secret>' \
  bash scripts/deploy/bootstrap-production-admin.sh \
    --env-file server/deploy/compose/prod/.env \
    --expected-database '<exact-database>' \
    --expected-migration '<14-digit-atlas-version>' \
    --expected-release '<40-character-lowercase-git-sha>' \
    --confirm 'BOOTSTRAP_PRODUCTION_ADMIN:<project>:<database>:<username>:<migration>:<release>'
```

成功回执必须同时包含 `status=complete`、精确 database / migration / release、`admin_bootstrap.completed` marker、唯一 completed audit，以及非零内置 permission / role / role-permission 数量。该回执只证明首个管理员和 RBAC 初始化，不证明客户配置、模拟验收数据、health / ready 或页面验收。

## 客户配置读回 preflight

`customer-config-release-readiness.mjs --readback-preflight-report <path>` 只读取本地 manifest、执行器报告和目标 smoke 脱敏报告的结构，用于确认 `customer_config.get_effective_session` 读回证据还缺什么；它不调用后端、不读取管理员 token、不写 release evidence、不发布 / 激活 / rollback，也不导入业务数据。报告里的 `targetSmoke.customerConfigEffectiveSession.responseBodyStored` 表示目标 smoke 是否实际保存了响应正文，合规值应为 `false`；`responseBodyNotStored=true` 才表示 `responseBodyStored=false` 的脱敏证据已经存在。

## Release Evidence 主路径

1. 先用 `release-evidence-status.mjs` 看缺口。
2. 用 `release-evidence-closeout-plan.mjs` 判断本机输入是否足够。
3. 只在 action `canRun=true` 且已确认真实输入时，才用 `release-evidence-closeout-runner.mjs --execute`。
4. 每次写入证据后重新跑 status / gate。
5. release gate 通过只说明 evidence 文件满足门禁，不替代真实目标环境执行记录、人工签收或回滚演练。

正式 `production-preflight-report.txt` 必须在目标 Compose 服务启动后使用 `production-preflight.sh --runtime --expected-release <40sha> --out ...` 生成，并包含运行态 Compose、四服务镜像 / release 一致、`ERP_PDF_WARMUP=async`、Chromium / chromium-common exact pin 和 health / ready 通过记录。正式 `smoke-test-report.json` 还必须包含唯一 `template-pdf-render` 检查，记录 `200`、`application/pdf`、64 位 hex SHA-256、正数字节数和 `responseBodyStored=false`。`run-smoke.sh` 不带 backend / revision / token 时的 web-only 输出只用于快速诊断，不得作为 release evidence，release gate 会因缺少真实 PDF 证据而拒绝。

133 V5 是与旧栈并存的独立验收环境。其所有 preflight、一次性管理员、core bootstrap、`up`、`ps` 和 runtime 检查都必须同时使用 `compose.yml` 与受控 `compose.customer-trial-133.yml`，Compose 命令必须显式带 `-p plush-toy-erp-v5`；不得只改 `PROJECT_SLUG` 后仍落入 canonical `plush-toy-erp-prod` project。固定数据目录为 `/home/simon/plush-toy-erp-v5/data/postgres`，固定 migration 锁为 `/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock`；它们不接受相对路径、dot segment 或符号链接。Jaeger V5 独立端口组为 `45775 / 46831 / 46832 / 45778 / 46687 / 54268 / 54250 / 49411 / 44317 / 44318`。

133 上从固定 release 根目录执行，并使用 release 之外的绝对 env 路径：

```bash
cd /home/simon/plush-toy-erp-v5/current
bash scripts/deploy/production-preflight.sh \
  --env-file /home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133 \
  --compose-dir /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod \
  --compose-override /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.customer-trial-133.yml

docker compose \
  -p plush-toy-erp-v5 \
  --env-file /home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133 \
  -f /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.yml \
  -f /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.customer-trial-133.yml \
  config
```

preflight 与后续 Compose 使用同一个干净 shell。只要宿主已定义 env-file 中任一同名键，或 `COMPOSE_PROJECT_NAME / COMPOSE_FILE / COMPOSE_PROFILES / COMPOSE_ENV_FILES / COMPOSE_PATH_SEPARATOR / DOCKER_HOST / DOCKER_CONTEXT / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH`，preflight 就会只报键名并停止；先 `unset` 后再重试，不要把宿主值复制回 env-file。

133 V5 migration 必须从固定 release 的 Compose 目录调用，运行 env 仍位于 release 外。下面四步顺序不得跳过：

```bash
cd /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod
export COMPOSE_OVERRIDE_FILE=/home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.customer-trial-133.yml
export COMPOSE_ENV_FILE=/home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133

sh ./migrate_online.sh --status-only
sh ./migrate_online.sh
MIGRATION_MAINTENANCE_CONFIRMED=1 sh ./migrate_online.sh --apply
sh ./migrate_online.sh --status-only
```

apply 前必须用同一组显式 `-p / --env-file / -f / -f` Compose 参数只停止 V5 `app-server`，保持 V5 PostgreSQL 运行；不影响旧 `plush-toy-erp-prod` 栈。完整、可直接复制的 stop/apply 命令以 [Compose 部署说明](../../server/deploy/compose/prod/README.md#迁移脚本) 为唯一运维入口。133 V5 不允许用宿主环境或 env 文件覆盖 `MIG_DIR / ATLAS_BIN / PSQL_BIN / POPULATED_UPGRADE_PREFLIGHT`。

## 安全边界

- 不在低配目标服务器上构建镜像、前端包或 Go 二进制；目标服务器只负责加载制品、启动服务、执行 migration 和部署后检查。
- `--backend-url`、`--endpoint`、`SMOKE_ENDPOINT`、`SMOKE_BACKEND_URL` 不得包含 URL 账号密码。
- 报告只保存 repo-relative path、alias、hash、env key 名和脱敏摘要，不保存 token、完整 DSN、完整凭据 URL 或本机绝对路径。
- `--execute` 类操作必须有脚本要求的确认环境变量，且不得执行 blocked action 或人工签收步骤。

## 修改后验证

调整 deploy 脚本后，优先运行对应测试文件，例如：

```bash
node --test scripts/deploy/release-evidence-status.test.mjs
node --test scripts/deploy/release-evidence-closeout-plan.test.mjs
node --test scripts/deploy/production-preflight.test.mjs
node --test scripts/deploy/bootstrap-production-admin.test.mjs
node --test scripts/deploy/run-smoke-script.test.mjs
node --test scripts/deploy/customer-config-release-readiness.test.mjs
node --test scripts/deploy/source-archive-release-check.test.mjs
```

涉及发布证据口径时，再补：

```bash
node --test scripts/deploy/release-evidence-gate.test.mjs
git diff --check
```
