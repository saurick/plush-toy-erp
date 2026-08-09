# 部署脚本 / Deploy Scripts

本文是 `scripts/deploy/` 的目录入口。部署主路径和目标环境边界仍以 [server/deploy/README.md](../../server/deploy/README.md)、[server/deploy/compose/prod/README.md](../../server/deploy/compose/prod/README.md) 和 [docs/部署约定.md](../../docs/部署约定.md) 为准。

## 目录职责

`scripts/deploy/` 放生产 preflight、release evidence、客户配置发布证据、closeout plan / runner 和部署资料包检查工具。多数脚本默认只读或 report-only；真实执行必须显式确认，并满足对应 evidence、备份、smoke、权限和脱敏前置。

## 常用入口

| 入口                                                          | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 是否执行目标动作                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `bash scripts/deploy/production-preflight.sh`                 | 检查生产 env、Compose、固定镜像 tag、migration、PDF warmup / Chromium 版本和低配部署边界；yoyoosun 还会加载不含密钥的 runtime contract，要求 env、容器和公开 `auth.capabilities` 三层均为 SMS provider；运行 env 必须由当前用户持有且精确 `0600`，无 symlink 父路径，并通过私有快照阻断 TOCTOU；133 V5 还要求受控 override、显式 `-p plush-toy-erp-v5` 并解析真实 project；release evidence 必须用 `--runtime --expected-release <40sha>` 复核四服务唯一容器、env image ref、image / container content ID、app / web `GIT_SHA`、容器名、project、端口、挂载、app 身份、warmup、包版本和 health / ready | 否，只检查                                                         |
| `bash scripts/deploy/bootstrap-production-admin.sh`           | 在已迁移的全新目标库中，用当前固定镜像的一次性 Compose 容器创建首个超级管理员，并精确读回数据库、release、migration、marker、audit 和内置 RBAC；密码只从当前进程环境临时注入                                                                                                                                                                                                                                                                                                                                                                                                                           | 是；仅允许全新库显式确认后执行一次                                 |
| `bash deployments/yoyoosun/scripts/rotate-credentials-133.sh` | 在已有备份且目标 release / migration / operation id 精确绑定后，从版本化凭据合同读取 133 固定测试密码，经 SSH stdin 原子轮换稳定 admin 与十个 demo；SMS 手机号仅在发布工作站 Keychain 已人工录入时绑定，持久 marker 使未知结果可按同 operation id 安全重放                                                                                                                                                                                                                                                                                                                                             | 是；仅允许精确 133 目标显式确认后执行                              |
| `node scripts/deploy/release-evidence-status.mjs`             | 只读汇总 release evidence 目录状态、缺口和下一步                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 否，只读                                                           |
| `node scripts/deploy/release-evidence-gate.mjs`               | 校验 release evidence 是否满足门禁                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 否，只校验证据                                                     |
| `node scripts/deploy/release-evidence-closeout-plan.mjs`      | 从 status 生成分组 closeout action 和缺失输入                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 否，只生成计划                                                     |
| `node scripts/deploy/release-evidence-closeout-runner.mjs`    | materialize closeout plan；默认 report-only，显式确认后才执行可运行机器步骤                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 默认否，`--execute` 才执行                                         |
| `node scripts/deploy/customer-config-release-readiness.mjs`   | 聚合客户配置 manifest、release evidence、activation gate 和读回证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 否，只聚合证据                                                     |
| `node scripts/deploy/customer-config-release-execute.mjs`     | 客户配置 validate / publish / activate / rollback 执行器                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 默认否，显式确认后才调用 JSON-RPC                                  |
| `node scripts/deploy/source-archive-release-check.mjs`        | 从指定 committed Git ref 构建临时源码包并检查构建输入闭包；`--light` 还在解包后校验活跃 Markdown 本地链接和客户 Web overlay，`--execute --docker` 以一次 Buildx Bake 共享图并行调度 `server/Dockerfile` 的两个 runtime target，Web 与 Go 各编译一次，并记录去重完成节点的缓存命中                                                                                                                                                                                                                                                                                                                      | 默认否；`--execute` 运行独立的发布、恢复与回滚验证（T8）源码包检查 |
| `node scripts/deploy/release-artifact-bundle.mjs`             | 从 clean current HEAD 的 committed archive 构建 `linux/amd64` Server / Web 镜像，固定 40 位 SHA tag，保存 loadable tar、content ID、checksum、CycloneDX 依赖 SBOM、migration 序列、客户配置源指纹，以及构建缓存与各镜像归档耗时；SBOM 只统计实际发布 Dockerfile 的基座，已存在输出目录拒绝覆盖                                                                                                                                                                                                                                                                                                         | 默认否；`--execute` 才构建本机制品                                 |
| `node scripts/deploy/release-artifact-verify.mjs`             | 校验制品 manifest、SBOM 和镜像 tar 的大小 / checksum；`--load` 进一步加载并读回 OCI config / manifest 双身份、平台和内置 `GIT_SHA`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 默认只读；`--load` 会加载本地镜像                                  |
| `node scripts/deploy/local-release-rehearsal.mjs`             | 使用上述同一不可变制品和唯一生产 Compose，在一次性 `plush_erp_release_<run-id>` 完成 migration、health / ready / runtime identity、管理员登录、本地测试配置 validate / publish / activate / effective readback、PDF、备份恢复和移除 bootstrap secret 后的重启恢复；本地配置写入额外绑定 exact run ID、同名数据库和启动前 PostgreSQL system identifier，并只在该临时库把配置所需审批岗位绑定到一次性超级管理员，以证明 fresh database 的 publish 门禁而不建立可复用试用账号；不复用 106 / 133 门禁，成功或失败均写脱敏回执并执行精确清理                                                                | 默认否；`--execute` 才启动本地隔离环境                             |

## GitHub 发布、固定目标与 Operation

| 入口                                                                | 职责                                                                                                                                                                                                                   | 写入边界                                                                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `node scripts/qa/exact-sha-gate.mjs`                                | 为默认分支可达的 clean exact SHA 计算 gate fingerprint，并运行或复用唯一 strict 终态                                                                                                                                   | `--run` 只运行 strict，不发布或部署                                                                        |
| `node scripts/deploy/github-release-publisher.mjs`                  | 读取已构建 bundle 与 strict 终态，推送固定 GHCR 镜像并生成 provider-neutral Release manifest                                                                                                                           | 只由固定 GitHub release workflow 使用                                                                      |
| `node scripts/deploy/github-delivery-provider.mjs`                  | 固定仓库、`release.yml`、API 版本、六项 Release assets 与下载根的 GitHub adapter；只读最近 CI / Release run 的 attempt、job、step 耗时、asset size，并仅为最新版本读取小型 manifest / artifact 以取得缓存命中和 digest | 不接受调用者 repo/workflow/path；错误不回显 CLI stderr；详情有大小上限并按 exact SHA 缓存，不触发 workflow |
| `node scripts/deploy/target-preflight.mjs --target test-133 --json` | 通过固定 SSH 目标只读检查容量、Compose、容器、端口、数据库、当前 SHA、锁、rollback point，以及 `admin.yoyoosun.net` 公网入口的容器、健康、Provider 能力和 SHA 一致性                                                   | 只读，不创建备份或切换版本；工作台使用异步有界 SSH，目标无响应时不阻塞 Vite 事件循环                       |
| `node scripts/deploy/database-rebuild-controller.mjs`               | 把已 promotion 且正在 133 运行的不可变 release、即时只读 preflight、固定逻辑库和 fresh 物理数据代绑定为数据库重建 operation                                                                                            | 只生成资格计划，不停服务、不备份、不迁移                                                                   |
| `node scripts/deploy/database-rebuild-executor.mjs`                 | 对 ready operation 再跑即时 preflight，以一次性确认串执行固定 133 数据库重建，并校验脱敏终态回执                                                                                                                       | 是；会停固定栈、备份并切换 PostgreSQL 数据目录                                                             |
| `node scripts/deploy/promotion-controller.mjs`                      | 校验不可变 manifest 与即时 preflight，创建或复用待确认 promotion operation                                                                                                                                             | 不执行目标写入                                                                                             |
| `node scripts/deploy/promotion-executor.mjs`                        | 对已 ready operation 重新核对身份，执行固定 133 promotion，并把公网入口切到同一不可变 Web 镜像后读回                                                                                                                   | 只接受 operation 绑定的确认串；公网切换失败会恢复旧入口并使 operation 失败关闭                             |
| `node scripts/deploy/rollback-controller.mjs`                       | 比较当前/目标 manifest；migration 序列和客户配置源指纹不同即阻断                                                                                                                                                       | 不执行目标写入                                                                                             |
| `node scripts/deploy/rollback-executor.mjs`                         | 对已 ready operation 执行 Compose 与公网入口的代码和镜像回滚；控制脚本取自当前 live exact SHA，目标旧版本只提供源码和制品                                                                                              | 不 down migration、不自动恢复数据库，也不重新导入旧版编排缺陷                                              |
| `node scripts/deploy/target-release-cache.mjs`                      | 按 release manifest SHA、归档 checksum、Server/Web registry digest、Docker content ID 和镜像内完整 `GIT_SHA` 只读探测 133 当前/回滚保留制品；身份全部一致才为 executor 预置 operation incoming                                                                                 | 不按 tag 或文件名宽松命中；无效缓存失败关闭，不构建、不 prune、不删除数据库或 volume                       |

`delivery-operation-store.mjs` 在 ignored `output/dev-workbench/delivery-operations/` 使用随机 UUID、幂等键、`0600` 文件和原子 rename 保存状态。Bridge 进程重启时，仍处于 `launching / running` 的目标写操作一律冻结为 `not_proven`，先读回目标，不能自动重试。`remote-promotion.sh` 与 `remote-code-rollback.sh` 的 v3 终态回执同时记录固定阶段顺序、每阶段耗时、内容缓存命中、避免传输字节、是否跳过 Docker load 和总耗时；失败时最后一项必须是实际失败阶段，passed 时不得缺阶段。`remote-promotion.sh`、`remote-database-rebuild.sh` 与 `remote-code-rollback.sh` 是对应 executor 传输后调用的固定目标实现，不是人工拼接参数的通用远程入口。

固定 `test-133` 的 promotion、rollback 和数据库重建包统一使用 `rsync 3.x over SSH` 传输到 operation 专属 `incoming` 目录。promotion / rollback 先只读探测正式 `release-cache/<manifest-sha>` 与历史 operation 保留制品；全部五项内容身份一致时只传控制文件并跳过重复 image tar，目标已有精确 Docker image 时再跳过 `docker load`，但 migration、Compose、health / ready、业务 smoke 和公网入口 exact-SHA 读回仍完整执行。缓存缺失走既有完整 checksum-bound rsync；存在同 manifest 但任一 checksum、digest、content ID 或 `GIT_SHA` 不一致时失败关闭。传输仍固定目标、端口、远端 `/usr/bin/rsync`、严格 host key、精确文件白名单、私有文件权限与十分钟超时，不启用 `--delete` 或无收益的压缩；不会全局 prune，也不删除数据库、volume、env、证书、当前及规定回滚版本。operation 记录实传字节、rsync 时长、有效吞吐、避免传输字节和按最近冷路径吞吐估算的节省时间；目标 preflight 会在缺少兼容 rsync 时阻断，不退回 SCP 或其他隐式路径。

DEV-only `/__dev/version-center` 只暴露五个动作：`dispatch-release`、`prepare-promotion`、`execute-promotion`、`prepare-rollback`、`execute-rollback`。浏览器不能提供 repo、workflow、target、路径、SSH、环境变量、shell、SQL 或 Docker 命令；同一时刻只允许一个 test-133 执行器。页面的 CI/CD 效能区按完整发布、相同 SHA 复用和 CI 分别展示中位数，以运行完成、制品发布和部署完成时间区分事件时间与统计读取时间，并默认展示 CI strict 可信复用、观测关键路径、最长环节、失败原因、BuildKit 命中、制品大小、133 缓存命中/依据、避免字节/估算时间、Docker load 结果及仍执行的 migration / health / ready / 公网读回；公网入口与 133 SHA 一致性位于首屏。完整 job / step 和 operation 阶段按需展开，job 初始收起并支持逐项或统一展开 / 收起；中文为主、原始英文仅用于追溯，不建立第二套流水线状态。

### 133 同逻辑库物理重建

数据库重建只用于已经完成不可变 release promotion、但需要从空业务基线重放 133 验收数据的受控窗口。它继续使用逻辑库 `plush_erp_uat_20260716_v5`，不新造运行时数据库别名：执行器先对旧库做 fresh `pg_dump` 和临时恢复校验，再停止固定 V5 栈，把旧 PostgreSQL 数据目录移到 operation 绑定的 rollback alias，初始化 fresh 物理数据目录，完成 migration、一次性管理员 bootstrap、空业务 SQL 基线和 release / health / ready 读回。旧数据目录和 dump 均保留，不自动删除，也不执行 down migration。

先运行 plan-only controller；只有 `operation.status=ready` 才能复制其 UUID 组成精确确认串：

```bash
node scripts/deploy/database-rebuild-controller.mjs \
  --release-manifest '<exact-release-manifest.json>' \
  --target test-133 \
  --idempotency-key 'rebuild-database:test-133:<release>:<change-id>' \
  --json

node scripts/deploy/database-rebuild-executor.mjs \
  --operation-id '<ready-operation-uuid>' \
  --release-manifest '<same-exact-release-manifest.json>' \
  --confirmation 'REBUILD_DATABASE:test-133:<40-character-release>:<ready-operation-uuid>' \
  --json
```

执行器返回 `failed` 只表示失败发生在已证明恢复的边界；返回 `not_proven` 表示服务恢复、物理切换或 migration 结果未被证明，必须先在目标读回数据目录、容器、migration 和运行 SHA，禁止自动重试或另起 operation 覆盖现场。`passed` 只证明 fresh 物理库、首个管理员、空业务基线和基础运行态；客户配置、core、九岗位数据、52 项浏览器/PDF、凭据轮换、11 账号 smoke 和客户 UAT 仍须逐层完成。成功回执返回的本地 bootstrap secret 文件只用于后续受控初始化，凭据轮换完成后必须删除，不能写入 steady env、日志或 evidence。

`source-archive-release-check.mjs` 始终从 committed tree 创建临时 archive，不把当前 dirty worktree 混入源码包。默认 plan 和 `--light` 只提供源码包结构诊断；`--light` 会直接扫描解包后的活跃 Markdown 本地链接，因此被 `export-ignore` 排除的客户资料不能继续被源码包内文档引用。`--execute` 仍要求 clean worktree，并通过 archive 内的 `scripts/lib/pnpm.sh` 解析与 `web/package.json` 锁定版本一致的 Node / pnpm，不直接信任 raw `PATH` 中的 pnpm。带 `--docker` 时只使用 `server/Dockerfile`：Buildx Bake 在同一调用中并行调度 `web-runtime` 与 `server-runtime`，共享同一个 `web-builder`，两个镜像均固定为 `linux/amd64` 并写入同一 40 位 `GIT_SHA`。GitHub Release 使用按 target 隔离的 GHA cache，本机默认使用当前 builder cache；缓存只缩短计算，不能替代 committed archive、checksum、平台或 SHA 校验。该入口是独立的发布、恢复与回滚验证（T8）源码包检查，不替代 `fast.sh` / `full.sh` / `strict.sh`，也不证明目标环境发布、migration、smoke、release evidence 或人工签收已经完成。

```bash
node scripts/deploy/source-archive-release-check.mjs --ref HEAD --json
node scripts/deploy/source-archive-release-check.mjs --light --ref HEAD --json
# 只在 clean worktree 且准备执行独立源码包构建检查时运行：
node scripts/deploy/source-archive-release-check.mjs --execute --ref HEAD
# 构建正式双 runtime 图并输出 BuildKit 命中统计：
RELEASE_BUILDKIT_CACHE_MODE=builder \
  node scripts/deploy/source-archive-release-check.mjs --execute --docker --ref HEAD --json
```

## 不可变制品与本地发布演练

正式 promotion 使用下面的串行路径；每一步失败都停在当前层，不能复用旧 SHA、旧镜像或历史回执拼接成功：

1. 在最终 clean HEAD 运行 `full`、`strict` 和 `prepare-push`，完成非强制 push，并等待同一 SHA 的远端 CI 绿色终态。
2. 从与远端一致的 clean HEAD 构建制品。manifest 记录 committed source archive、两个镜像 content ID / tar checksum、依赖 SBOM、migration 序列和客户配置源指纹；它不宣称目标 active revision。
3. 先校验并加载制品，再运行本地隔离发布演练。`contentId` 固定表示 OCI config digest；加载后 Docker `.Id` 只允许等于该 config digest 或同一已验 checksum tar 的唯一 OCI manifest digest，以兼容 classic / containerd image store，仍必须同时匹配 tag、`linux/amd64` 和内置 `GIT_SHA`。演练只使用 `server/deploy/compose/prod/compose.yml`，本地测试配置许可同时绑定 exact run ID、`plush_erp_release_<run-id>` 与现场 PostgreSQL system identifier；客户配置所需审批岗位只绑定到该临时库的一次性超级管理员，回执记录岗位与绑定数，不创建可复用账号、不写业务事实。演练不修改长期 `plush_erp`，也不保留一次性数据库、岗位绑定、门禁 identity 或 bootstrap secret。若 manifest 来自仓库外的 Release 下载目录，工作台槽位引用仓库内详细演练回执，禁止写入含 `..` 的外部路径。
4. 只有本地演练、远端 exact-SHA CI 和目标 rollback point 都通过后，才按目标正式 preflight、备份、migration 锁、Compose 和 smoke 推进 133；133 只 load / pull，不执行构建。

```bash
node scripts/deploy/release-artifact-bundle.mjs \
  --execute \
  --ref HEAD \
  --out "output/releases/$(git rev-parse HEAD)"

node scripts/deploy/release-artifact-verify.mjs \
  --manifest "output/releases/$(git rev-parse HEAD)/release-artifact.json" \
  --load

node scripts/deploy/local-release-rehearsal.mjs \
  --execute \
  --manifest "output/releases/$(git rev-parse HEAD)/release-artifact.json"
```

本地演练的详细 receipt 写入 ignored `output/dev-workbench/release-rehearsal/`，工作台固定槽位写入 `output/dev-workbench/receipts/release-rehearsal-latest.json`。passed 必须同时满足非零执行、零失败、零 skip、同一 SHA / content ID、migration readback、备份恢复、steady-state 重启和零残留；它仍不证明 133、客户 UAT 或签收。

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
node --test scripts/deploy/database-rebuild-manifest.test.mjs \
  scripts/deploy/database-rebuild-controller.test.mjs \
  scripts/deploy/database-rebuild-executor.test.mjs \
  scripts/deploy/remote-database-rebuild-script.test.mjs
```

涉及发布证据口径时，再补：

```bash
node --test scripts/deploy/release-evidence-gate.test.mjs
git diff --check
```
