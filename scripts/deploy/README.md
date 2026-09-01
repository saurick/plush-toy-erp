# 部署脚本 / Deploy Scripts

本文是 `scripts/deploy/` 的入口。Compose、环境与运行边界以 [server/deploy/README.md](../../server/deploy/README.md)、[Compose 部署说明](../../server/deploy/compose/prod/README.md) 和 [部署约定](../../docs/部署约定.md) 为准。

## 当前环境合同

部署 target 的唯一真源是 `deployment-targets.json`：

| target | 用途 | 公网入口 | 数据规则 |
| --- | --- | --- | --- |
| `demo-133` | 项目方造数、演练、培训与回归 | `demo.yoyoosun.net` | 可经受控 rebuild 恢复 seed / fixture / 模拟数据 |
| `customer-test-133` | 甲方测试与验收 | `test.yoyoosun.net` | 普通部署默认保留现有数据；新一轮测试前可显式清空并重建干净基线 |

`erp` 是未来生产环境，尚未登记为可执行 target；`yoyoosun.net` 临时 `302` 跳转到 `https://erp.yoyoosun.net` 也不改变这一点。`admin.yoyoosun.net` 退役后仍不能进入 target registry、环境变量映射、数据清理、preflight、健康检查、release、promotion、smoke 或 rollback。`customer-trial-133` 只是 `demo-133` 内部模拟数据合同，不是第三个部署 target。

## 常用入口

| 入口 | 职责 | 写入边界 |
| --- | --- | --- |
| `deployment-targets.mjs` | 读取两个固定 target 的脱敏投影 | 只读 |
| `target-preflight.mjs` | 读回容量、Compose、端口、数据库、当前 SHA、锁、rollback point 与对应公网入口 | 只读，不创建备份或切换版本 |
| `production-preflight.sh` | 校验 runtime env、固定镜像、Compose、migration、PDF、健康与目标身份 | 默认只读；`--runtime` 仍只核对 |
| `release-artifact-bundle.mjs` | 从 clean committed archive 构建一次 `linux/amd64` Server/Web 制品、SBOM 与 manifest | `--execute` 才构建本机制品 |
| `release-artifact-verify.mjs` | 校验 manifest、SBOM、image tar 与内置 release identity | 默认只读；`--load` 会加载本地镜像 |
| `local-release-rehearsal.mjs` | 用同一不可变 bytes 在一次性环境完成 migration、health/ready、登录、PDF、备份恢复与零残留 | `--execute` 才启动隔离环境 |
| `promotion-controller.mjs` | 校验 v2 七资产、rehearsal、即时 target preflight，创建 ready operation | 不写目标 |
| `promotion-executor.mjs` | 执行已确认的固定 target promotion 并读回公网 exact SHA | 写单一目标；失败按 operation 回滚 |
| `rollback-controller.mjs` | 校验旧 manifest、migration 与客户配置兼容性 | 不写目标 |
| `rollback-executor.mjs` | 回滚 Compose / 公网入口到兼容旧版本 | 不 down migration，不自动恢复数据库 |
| `database-rebuild-controller.mjs` | 为指定 target 生成备份、物理数据代和空基线资格计划 | 不停服务、不备份、不迁移 |
| `database-rebuild-executor.mjs` | 执行 ready rebuild operation | 会停单一 target、备份并切换其 PostgreSQL 数据目录 |
| `bootstrap-production-admin.sh` | 在已迁移 fresh 数据库创建首个管理员并读回 marker/audit/RBAC | 只允许 fresh target 的一次性确认窗口 |
| `release-evidence-status.mjs` / `release-evidence-gate.mjs` | 汇总并校验 release evidence | 只读 |

所有浏览器动作只传 operation intent、固定 target、版本和确认串；浏览器不能传 repo、路径、SSH、env、shell、SQL、Docker 命令或凭据。

## GitLab 主链与不可变发布

`.gitlab-ci.yml` 是 canonical CI/CD：main 的 prepare cache writer 后，通过隔离 GitLab Job/DAG 并行执行七个固定质量分片；每个 Node job 内保持 `--test-concurrency=1`，`resource_sensitive` 串行。aggregate 与 `CI Gate` 绑定 exact SHA、strict/full、零 skip、security、receipt 和 evidence。

release pipeline 只复用同一 protected main push pipeline 的完整终态，不重跑 strict；随后：

1. 构建或恢复该 SHA 的唯一 `candidate.tar`。
2. 用候选包内同一 bytes 完成隔离 release rehearsal。
3. 推送同一镜像并取得 registry digest。
4. 登记 v2 七资产：checksums、artifact manifest、release manifest、SBOM、两个 image tar 与同一 `release-rehearsal.json`。
5. 在独立 `plush-release-source` Package 登记同 SHA 的唯一 `source.tar`，并在创建 Release 前读回 digest。
6. 由使用者显式发起 promotion；main push 不自动部署 demo 或 test。

旧 v1 六资产只读、展示和既有回滚兼容，`promotionEligible=false`。同版本异 SHA、digest、rehearsal 或资产内容一律失败关闭。

历史运行 SHA 只有在已有完整 v2 七资产时，才可通过 protected main 的 `backfill_release_source` job 补齐唯一 `source.tar`。该 job 在 Runner 内证明目标 SHA 是当前 main 的 ancestor，下载并校验四个小控制文件与服务端七资产目录，再由 `git archive` 生成并核对 source digest；它只写 `plush-release-source`，不改写七资产、GitLab Release、镜像或 public asset。旧 v1 不允许借 backfill 升格为 promotion 输入。

## Operation 真源

`delivery-operation-store.mjs` 在 ignored `output/dev-workbench/delivery-operations/` 使用 `0600` 原子文件保存工作台 operation。只有工作台发起的 release、promotion、database rebuild 和 rollback 才是“工作台操作记录”。

GitLab Pipeline、Generic Package 与 Release 属于“远端 CI/CD 活动”，由 GitLab Provider 单独读取；它们不会被伪造成 operation。Codex 聊天、普通 SSH、手工排障和没有正式回执的动作也不会进入 operation store。

同一动作、target、Exact-SHA、版本和发布输入只认领一个 operation；不同窗口的同一意图会合并。`failed / blocked` 只能显式建立父子重试链；`launching / running` 在 Bridge 重启后冻结为 `not_proven`，必须先读回目标，不能自动重试。

`/__dev/delivery` 首屏显示最近 operation、最严重阻断、最后核对时间和完整记录入口；`/__dev/version-center?view=history` 读取同一持久化 store，并明确显示加载、正常、空、失败和过期状态。

## Promotion 与传输

两个 target 的 promotion、rollback 和首次初始化使用固定 SSH 与 `rsync 3.x`，但 Mac 只向 operation 专属 `incoming` 目录传输 operation manifest、固定执行脚本、`target-release-fetch.json` 和控制校验表；legacy v1 代码回滚额外传输小型 `checksums.sha256` 作为既有目标缓存的校验目录。Mac 可以下载并校验有大小上限的 `checksums.sha256`、artifact/release/rehearsal JSON 与 fetch descriptor 控制证据，但 SBOM、两个 image tar 与 `source.tar` 大型 payload 不经过 Mac；R640 目标固定把 `gitlab.saurick.me` 解析到同机内网地址，经系统信任 TLS 直接从 `plush-release` 与 `plush-release-source` Package 取得，并在物化前逐项核对名称、大小、SHA-256、v2 manifest、rehearsal、source binding 和 image content ID。专用 `read_package_registry` deploy token 只保存在工作台进程内存，并且只注入确实可能冷取件的唯一 executor 子进程；子进程在任何预检前立即从环境移除，再仅通过唯一 SSH 标准输入进入已加锁的远端执行器。它不进入其他子进程、参数、控制包或目标 secret 文件；下载期间只允许存在 `0600` curl 配置，结束或失败清理后必须证明不存在。不存在静默回退到 Mac 大文件中转的路径。

正式 target cache v2 精确包含七资产与 `source.tar` 八项；legacy cache 只允许既有 v1 代码回滚按目标精确命中，缺失即阻断，禁止用于 promotion、远端补取、迁入 v2 或新建 legacy cache。operation 私有 incoming 可以包含控制文件，但只有逐项复核过的 payload 才能被物化或提升为对应正式 cache。允许按 manifest SHA、checksum、registry digest、Docker content ID 和镜像内完整 `GIT_SHA` 命中 package/image cache；正式 cache 不完整、存在额外项或符号链接，或任一 payload 身份不一致时失败关闭。首次升级还要在 target write 前证明当前运行 SHA 的 direct-fetch 或同目标 legacy 回滚输入可用，避免新版本成功后才发现旧版本不可回取。

即使命中缓存，migration、Compose、health、ready、业务 smoke 与对应公网 exact-SHA 仍完整执行。operation 分别记录 Mac 控制包字节/耗时、R640 内部取件期望与实际字节/耗时、校验与缓存命中，不把控制面等待伪装成制品传输。传输不使用 `--delete`，不全局 prune，不删除数据库、volume、env、证书、当前版本或规定回滚版本。

## 数据库重建

数据库重建不是通用清库工具，也不是 promotion 的隐藏阶段。普通 promotion 默认保留数据库、附件、账号/RBAC、客户配置与审计；需要清空时必须另建 `rebuild-database` operation。没有新版本时可绑定目标当前 exact release 独立执行；同次既要新版本又要清空时，先完成保留数据的 promotion，再对同一已读回 release 独立重建。

执行前必须：

1. 目标已运行同一不可变 release。
2. controller 即时 preflight 为 `ready`。
3. fresh dump 已创建并在隔离恢复中验证。
4. 旧物理数据目录、dump 与 rollback identity 可读回。
5. 只停止目标自身的 app/web/PostgreSQL，不影响另一个环境。

`demo-133` 的受控重建可以随后重放 `customer-trial-133` 模拟数据。`customer-test-133` 的受控重建只建立甲方最小可登录的干净业务基线，不重放 demo seed/fixture。没有数据分类和恢复证明时不得执行重建；target 登记、普通 Goal 或一次 promotion 都不代表已授权或已完成清理。

```bash
node scripts/deploy/database-rebuild-controller.mjs \
  --release-manifest '<exact-release-manifest.json>' \
  --target '<demo-133|customer-test-133>' \
  --idempotency-key 'rebuild-database:<target>:<release>:<change-id>' \
  --json

node scripts/deploy/database-rebuild-executor.mjs \
  --operation-id '<ready-operation-uuid>' \
  --release-manifest '<same-exact-release-manifest.json>' \
  --confirmation 'REBUILD_DATABASE:<target>:<40-character-release>:<ready-operation-uuid>' \
  --json
```

`failed` 只表示旧运行态已被证明恢复；`not_proven` 必须先只读核对目标，不得重试。

## 一次性管理员

fresh 数据库完成 Atlas migration 后、常驻 `app-server` 启动前，使用：

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

steady env 必须保持 `BOOTSTRAP_ADMIN_ONCE=false` 且不包含 `APP_ADMIN_PASSWORD`。成功只证明管理员、marker、audit 和 RBAC 初始化，不证明客户配置、数据、健康或验收。

## Release Evidence

正式 evidence 逐层绑定：

- committed SHA、image content ID / registry digest、SBOM 与 migration 序列；
- 同 bytes release rehearsal；
- target preflight、backup/restore、migration、Compose、health、ready 与公网 exact SHA；
- smoke 的 HTTP、登录、客户配置 effective session 和 PDF 脱敏摘要；
- target-specific rollback point。

`release-evidence-gate.mjs` 通过只说明 evidence 文件满足合同，不替代目标实时运行、数据身份、客户 UAT 或签收。

## 安全边界

- 目标机只 load / pull 制品、migration、启动和检查，不从源码构建。
- endpoint 和 backend URL 不得携带账号密码。
- 报告不保存 token、完整 DSN、凭据、客户正文、本机绝对路径或原始错误。
- secret 只从受控进程环境、stdin 或凭据存储进入需要它的单一进程。
- 不把 demo/test 的数据库、上传、backup、operation 或 rollback point 交叉复用。
- 不把 `admin.yoyoosun.net` 作为环境别名或兼容 target。

## 修改后验证

```bash
node --test scripts/deploy/deployment-targets.test.mjs \
  scripts/lib/file-digest.test.mjs \
  scripts/deploy/gitlab-delivery-provider.test.mjs \
  scripts/deploy/target-preflight.test.mjs \
  scripts/deploy/production-preflight.test.mjs \
  scripts/deploy/promotion-controller.test.mjs \
  scripts/deploy/promotion-executor.test.mjs \
  scripts/deploy/target-release-fetch.test.mjs \
  scripts/deploy/remote-release-acquire.test.mjs \
  scripts/deploy/target-release-cache.test.mjs \
  scripts/deploy/rollback-manifest.test.mjs \
  scripts/deploy/rollback-controller.test.mjs \
  scripts/deploy/rollback-executor.test.mjs \
  scripts/deploy/remote-code-rollback-script.test.mjs \
  scripts/deploy/database-rebuild-controller.test.mjs \
  scripts/deploy/database-rebuild-executor.test.mjs \
  web/dev-server/devDeliveryBridgePlugin.test.mjs

git diff --check
```

根据影响面再补 full、strict、真实浏览器、release 或目标 smoke；不要用局部绿色冒充完整交付。
