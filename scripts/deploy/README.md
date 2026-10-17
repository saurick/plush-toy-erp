# 部署脚本 / Deploy Scripts

本文是 `scripts/deploy/` 的入口。Compose、环境与运行边界以 [server/deploy/README.md](../../server/deploy/README.md)、[Compose 部署说明](../../server/deploy/compose/prod/README.md) 和 [部署约定](../../docs/部署约定.md) 为准。

存储查看入口为 `node scripts/deploy/attachment-console.mjs --target demo-133|customer-test-133|production-133`：只核对登记目标并建立本机 SSH 通道，使用 SeaweedFS 原生只读账号，不启动或部署远端服务。凭据与访问边界见 [只读查看存储](../../server/deploy/compose/prod/README.md#只读查看存储)。

## 当前环境合同

部署 target 的唯一真源是 `deployment-targets.json`：

三个目标均登记在 `r740xd` 宿主机；只读预检及部署、回滚、重建、初始化执行器均校验同一主机名和操作用户。

| target | 用途 | 公网入口 | 数据规则 |
| --- | --- | --- | --- |
| `demo-133` | 项目方造数、演练、培训与回归 | `demo.yoyoosun.net` | 可经受控 rebuild 恢复 seed / fixture / 模拟数据 |
| `customer-test-133` | 甲方测试与验收 | `test.yoyoosun.net` | 普通部署不 rebuild、不 seed，默认保留现有数据；可显式准备最小基础资料，新一轮测试前可独立重建 |
| `production-133` | 正式业务，必须显式选择 | `erp.yoyoosun.net` | 独立数据与凭据；禁止测试数据重建和固定测试密码 |

`production-133` 对应 `erp.yoyoosun.net`，仓库已支持独立初始化、预检、发布和代码回滚，但不能据此宣称服务器已启用。首次生产初始化前须准备独立凭据及异机恢复前提，完整上线清单见 [首次部署](../../deployments/yoyoosun/runbooks/01-first-deploy.md)。根域跳转不是生产启用证明；退役 `admin.yoyoosun.net` 不进入任何目标矩阵。

生产目标 Compose override 固定使用 `10.254.244.0/28` 默认网络与 `10.254.244.16/28` 附件内部网络；附件网络继续继承 `internal: true`。首次创建前核对宿主路由及现有 Docker IPAM 无重叠，避免依赖宿主已耗尽的自动地址池。其它应用、测试及演示网络不由该配置调整，不通过清理他人网络或修改 Docker daemon 地址池取得容量。

预检、迁移和管理员初始化共用 Compose 目录内的 `validate_target_compose_override.sh`。它只允许生产 override 声明登记 project 与两类不重叠的私有 `/28` IPAM 配置，CIDR 数值保留在版本化 override 这一处；服务、端口、权限及其它网络属性不能通过该文件覆盖。测试夹具读取真实目标文件并显式指定目标，避免未进入登记目标分支的绿色结果。

运行与初始化的只读预检共用 `target-readonly-execution.mjs`。只有 Linux 平台、短主机名、运行用户和本机 IPv4 地址同时匹配 target registry，才在登记宿主机直接执行同一份固定 stdin 脚本；其它入口使用 `BatchMode`、固定地址/端口和 `StrictHostKeyChecking` 的 SSH。SSH 失败不切换本地执行。此选择不改变部署、迁移、重建或恢复写操作的执行合同。

## 常用入口

| 入口 | 职责 | 写入边界 |
| --- | --- | --- |
| `deployment-targets.mjs` | 读取三个固定 target 的脱敏投影 | 只读 |
| `target-preflight.mjs` | 读回容量、Compose、端口、数据库、当前 SHA、锁、rollback point 与对应公网入口 | 只读，不创建备份或切换版本 |
| `target-readonly-execution.mjs` | 按登记身份选择同机只读执行或严格 SSH；由运行与初始化预检共用 | 不执行部署、迁移、初始化或恢复写入 |
| `production-preflight.sh` | 校验 runtime env、固定镜像、Compose、migration、健康与目标身份；验收档追加 SMS、PDF、Chromium | 默认只读；`--runtime` 仍只核对 |
| `release-artifact-bundle.mjs` | 从 clean committed archive 构建一次 `linux/amd64` Server/Web 制品、SBOM 与 manifest | `--execute` 才构建本机制品 |
| `release-artifact-verify.mjs` | 校验 manifest、SBOM、image tar 与内置 release identity | 默认只读；`--load` 会加载本地镜像 |
| `local-release-rehearsal.mjs` | 用同一不可变 bytes 在一次性环境完成 migration、health/ready、登录、PDF、备份恢复与零残留 | `--execute` 才启动隔离环境 |
| `promotion-controller.mjs` | 校验 v2 七资产、rehearsal、即时 target preflight；工作台在最终传输资格核对后才创建 ready operation | 不写目标 |
| `promotion-executor.mjs` | 执行已确认的固定 target promotion 并读回公网 exact SHA | 写单一目标；失败按 operation 回滚 |
| `rollback-controller.mjs` | 校验旧 manifest、migration 与客户配置兼容性 | 不写目标 |
| `rollback-executor.mjs` | 回滚 Compose / 公网入口到兼容旧版本 | 不 down migration，不自动恢复数据库 |
| `database-rebuild-controller.mjs` | 仅为 demo/test 生成备份、物理数据代和空基线资格计划 | 不停服务、不备份、不迁移 |
| `database-rebuild-executor.mjs` | 执行 ready rebuild operation | 会停单一 target、备份并切换其 PostgreSQL 数据目录 |
| `bootstrap-production-admin.sh` | 在已迁移 fresh 数据库创建首个管理员并读回 marker/audit/RBAC | 只允许 fresh target 的一次性确认窗口 |
| 镜像内 `bootstrap-manual-acceptance-core` | 为 demo 或 customer-test 准备精确 allowlist 的单位 / 仓库 | test 必须显式指定 target、release、migration 与确认串；不写业务对象、不退休既有 test 资料 |
| `release-evidence-status.mjs` / `release-evidence-gate.mjs` | 汇总并校验 release evidence | 只读 |

所有浏览器动作只传 operation intent、固定 target、版本和确认串；浏览器不能传 repo、路径、SSH、env、shell、SQL、Docker 命令或凭据。

## 共用检查与证据

以下脚本由发布流程、开发迁移入口和客户操作说明共用。客户配置与凭据规则继续读取 `deployments/yoyoosun/env/` 的合同，客户 env 校验、凭据轮换和公网切流见[运维适配](../../deployments/yoyoosun/scripts/README.md)。

| 入口 | 用途 | 执行边界 |
| --- | --- | --- |
| `run-smoke.sh`、`run-smoke-support.mjs` | 按固定 target 和 profile 检查运行身份、health / ready、页面及验收能力，输出脱敏 JSON | `base-release` 不读取验收凭据；`customer-trial-acceptance` 才增加合同账号、SMS、PDF 和客户配置读回；不创建业务事实 |
| `collect-evidence.sh`、`collect-evidence.mjs` | 生成绑定 target、profile 和 release 的 evidence 草稿及必要占位 | 只写显式输出目录，不采集 secret，不把占位写成真实演练结果 |
| `run-backup-restore-rehearsal.sh` | 在开发机或 CI 执行 dump、隔离 PostgreSQL restore、升级审计、migration 和恢复检查 | 使用明确的只读备份源与隔离恢复目标；默认输出到 `output/`，仅向 evidence 复制脱敏 artifact |
| `backup-set/cli.mjs` | 在同一停写窗口成套备份 PG 与全部登记附件，封装加密；从配套制品恢复到新建隔离 PG / S3 | `create` 要求精确 project / database 确认并恢复原应用；`restore-check` 验证后精确清理，`restore --keep` 仅保留新隔离资源，不覆盖生产或切流 |
| `verify-backup-restore.sh` | 检查备份恢复 evidence 的必要字段和脱敏边界 | 不读取、复制或恢复真实备份文件，不证明恢复成功 |
| `backup-replica/cli.mjs` | 将既有加密备份拉取到按 UUID 核对的 Mac 外盘，独立保留历史并在一次性 PostgreSQL 验证恢复 | 私有 JSON 配置选择来源与介质；不写生产库、不传播来源删除；定时安装只接受已提交模块 |

参数以各脚本 `--help` 为准，目标与证据要求见[备份恢复](../../deployments/yoyoosun/runbooks/04-backup-restore.md)和[发布证据](../../deployments/yoyoosun/evidence/releases/README.md)。`run-smoke.sh --print-input-template` 只输出输入模板，不触网、不读 token、不写报告；正式 smoke 的 URL 禁止携带账号密码，报告不保存密码、token、手机号、HTML、PDF 正文或完整响应。

恢复演练的 `command-summary.txt` 绑定同一 `backupId / releaseId / sourceAlias / restoreTarget`；dump 留在受控本地输出。`image-digests-evidence.mjs` 只写脱敏镜像证据，不构建镜像、不访问 registry、不读取 `.env`。

额外副本的接入、目标迁移、Mac 定时任务和恢复范围见[备份恢复中的 Mac 外接盘副本](../../deployments/yoyoosun/runbooks/04-backup-restore.md#mac-外接盘副本--mac-backup-replica)。配置样例为 `deployments/yoyoosun/env/backup-replica.example.json`；SSH 来源、介质校验、同步保留、恢复与安装各由独立 Node 标准库模块负责，来源地址和本机 UUID 不写入代码。该工具复用项目 Node 版本及 macOS 内置 `lockf / plutil`；恢复另需 `age`、Docker 和本机已有的 `postgres:18.6` 镜像。

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

同一动作、target、Exact-SHA、版本和发布输入通常只认领一个 operation；不同窗口对未因回滚改变的同一意图会合并。成功回滚后，同版前向部署以该回滚 operation ID 区分新意图，不复用回滚前的部署成功回执；复用已通过的部署回执前还须只读核对目标服务与公网入口确为该 SHA，否则失败关闭。`failed / blocked` 只能显式建立父子重试链；`launching / running` 在 Bridge 重启后冻结为 `not_proven`，必须先读回目标，不能自动重试。执行器子进程启动或过早退出时只把 4 KiB 以内的 stderr 转成 240 字符以内的脱敏诊断写入 operation，命令、参数、PID、凭据和真实路径仍不入库。数据库重建执行器只允许同一 operation、target、Exact-SHA、版本均匹配且通过合同校验的远端终态回执收敛这次冻结；该收敛不是重试，也不会再次写目标。

`/__dev/delivery` 首屏显示最近 operation、最严重阻断、最后核对时间和完整记录入口；`/__dev/version-center?view=history` 读取同一持久化 store，并明确显示加载、正常、空、失败和过期状态。

## 制品保留预览

`target-preflight.mjs` 将 `target-release-retention.sh` 嵌入同一固定目标只读脚本，目标宿主无需安装 Node.js。预览保护当前前后端与公网运行版本、仍在运行的入口容器、按成功回执完成时间选出的最近两个不同恢复版本，以及失败、运行中或结果尚未收敛的操作所引用的版本。恢复版本表示已有运行证据，代码回滚仍需通过迁移和客户配置兼容性校验。

历史成功操作、旧缓存和已停止入口容器不再永久锁住其全部历史版本；operation、备份、数据库、附件、env 和审计记录不进入清理候选。`retention` 分别返回源码目录候选数量 / 字节、`cacheCandidateCount / cacheCandidateBytes` 和 `stoppedPublicContainerCandidateCount`，字节是逻辑大小，不能直接当作实际可释放磁盘。`rollbackReleaseShas` 给出本次保护的恢复版本。

无法识别的源码目录与符号链接单独保留；保护信息不明、未知操作合同、损坏 / 多份 JSON、目标不符、缓存符号链接或盘点失败时，`protectionStatus=manual_review`，不输出可清理候选。预览不执行删除；实际清理前仍须逐项核对当前版本、恢复输入、容器 / 镜像引用与容量，并在授权范围内操作。

## Promotion 与传输

三个登记 target 的 promotion、rollback 和首次初始化使用固定 SSH 与 `rsync 3.x`，但 Mac 只向 operation 专属 `incoming` 目录传输 operation manifest、固定执行脚本、`target-release-fetch.json` 和控制校验表；legacy v1 代码回滚额外传输小型 `checksums.sha256` 作为既有目标缓存的校验目录。Mac 可以下载并校验有大小上限的 `checksums.sha256`、artifact/release/rehearsal JSON 与 fetch descriptor 控制证据，但 SBOM、两个 image tar 与 `source.tar` 大型 payload 不经过 Mac；目标宿主固定把 `gitlab.saurick.me` 解析到同机内网地址，经系统信任 TLS 直接从 `plush-release` 与 `plush-release-source` Package 取得，并在物化前逐项核对名称、大小、SHA-256、v2 manifest、rehearsal、source binding 和 image content ID。专用 `read_package_registry` deploy token 只保存在工作台进程内存，并且只注入确实可能冷取件的唯一 executor 子进程；子进程在任何预检前立即从环境移除，再仅通过唯一 SSH 标准输入进入已加锁的远端执行器。它不进入其他子进程、参数、控制包或目标 secret 文件；下载期间只允许存在 `0600` curl 配置，结束或失败清理后必须证明不存在。不存在静默回退到 Mac 大文件中转的路径。

正式 target cache v2 精确包含七资产与 `source.tar` 八项；legacy cache 只允许既有 v1 代码回滚按目标精确命中，缺失即阻断，禁止用于 promotion、远端补取、迁入 v2 或新建 legacy cache。operation 私有 incoming 可以包含控制文件，但只有逐项复核过的 payload 才能被物化或提升为对应正式 cache。允许按 manifest SHA、checksum、registry digest、Docker content ID 和镜像内完整 `GIT_SHA` 命中 package/image cache；正式 cache 不完整、存在额外项或符号链接，或任一 payload 身份不一致时失败关闭。工作台首次升级还要在 target write 前证明当前运行 SHA 的 direct-fetch 或同目标 legacy 回滚输入可用；这一核对完成前 operation 保持 `running`，只能从 `running` 直接进入最终 `ready / blocked`，避免新版本成功后才发现旧版本不可回取，也不暴露可误确认的中间 ready。

即使命中缓存，migration、Compose、health、ready、业务 smoke 与对应公网 exact-SHA 仍完整执行。promotion 在已创建权限为 `0600` 的 env 备份后，同时推进 release 固定的 PostgreSQL、Jaeger、Jaeger 内存预算和受管 SeaweedFS 版本；外部附件存储不在该动作中变更。固定的基础服务镜像须在执行前预置到目标，执行器使用 `--pull never`，并在创建新备份和进入维护窗口前核对所需镜像与 `linux/amd64` 平台，缺失时失败关闭。operation 分别记录 Mac 控制包字节/耗时、目标宿主内部取件期望与实际字节/耗时、校验与缓存命中，不把控制面等待伪装成制品传输。传输不使用 `--delete`，不全局 prune，不删除数据库、volume、env、证书、当前版本或规定回滚版本。

目标 source 在 `umask 077` 下解包，默认保持 owner 私有；只有容器必须读取的 `server/deploy/compose/prod/jaeger-v2.yml` 在校验为当前用户拥有的普通文件后改为 `0444`，`database_roles.sh` 则恢复为 `0755`。promotion、rollback 与首次初始化必须执行同一归一化合同，禁止通过 root 容器绕过文件权限。

## 数据库重建

数据库重建不是通用清库工具，也不是 promotion 的隐藏阶段。普通 promotion 默认保留数据库、附件、账号/RBAC、客户配置、基础资料与审计，也不得调用 core bootstrap；需要清空时必须由当前任务明确授权并另建 `rebuild-database` operation。没有新版本时可绑定目标当前 exact release 独立执行；同次既要新版本又要清空时，先完成保留数据的 promotion，再对同一已读回 release 独立重建。

执行前必须：

1. 目标已运行同一不可变 release。
2. controller 即时 preflight 为 `ready`。
3. fresh dump 已创建并在隔离恢复中验证。
4. 旧物理数据目录、dump 与 rollback identity 可读回。
5. 只停止目标自身的 app/web/PostgreSQL，不影响另一个环境。

`demo-133` 的受控重建可以随后重放 `customer-trial-133` 模拟数据。`customer-test-133` 的受控重建只建立甲方最小可登录的干净业务基线，不重放 demo seed/fixture；客户配置激活后，可在独立明确授权下运行一次性 core bootstrap 恢复 8 个标准单位和 4 个仓库。没有数据分类和恢复证明时不得执行重建；target 登记、普通 Goal 或一次 promotion 都不代表已授权或已完成清理。

fresh generation 允许迁移初始化的标准单位，但必须与该 release 的单位合同逐项匹配（代码、名称、精度和启用状态），额外、缺失或篡改的单位均阻断；仓库及所有业务对象仍必须为空。

fresh generation 的客户配置在 migration 和一次性管理员 bootstrap 之后才激活。因此 rebuild controller 只允许将 preflight 明确读回的 `customerConfigState=absent` 延后到重建后闭环；`invalid`、`unknown`、读取失败但未证明为空，以及磁盘、锁、运行版本、数据库身份等其他 blocker 仍全部失败关闭。普通 promotion 不使用这一例外。

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
    --deployment-target '<demo-133|customer-test-133|production-133>' \
    --env-file '<absolute-runtime-env>' \
    --expected-database '<exact-database>' \
    --expected-migration '<14-digit-atlas-version>' \
    --expected-release '<40-character-lowercase-git-sha>' \
    --confirm 'BOOTSTRAP_PRODUCTION_ADMIN:<project>:<database>:<username>:<migration>:<release>'
```

steady env 必须保持 `BOOTSTRAP_ADMIN_ONCE=false` 且不包含 `APP_ADMIN_PASSWORD`。成功只证明管理员、marker、audit 和 RBAC 初始化，不证明客户配置、数据、健康或验收。

首次初始化的短信配置来自目标宿主 root 持有的 `/etc/plush-toy-erp/sms-provider.env`（`0600`）。`initialization-sms-provider.sh` 是资格检查与初始化共用的数据读取器，只读取四个固定字段，不执行 env 内容，也不从历史容器复制配置。准备与轮换边界见[首次部署](../../deployments/yoyoosun/runbooks/01-first-deploy.md)。

首次初始化的失败回执使用独立 SSH 输出通道，不受迁移命令组的日志重定向影响。已加锁且归属明确的操作失败时，在清理新建目标前，将诊断日志保留到宿主 `/root/ops-backups/plush-target-initialization/<target>/<operation-id>/operation.log`；目录为 `0700`、文件为 `0600`，拒绝符号链接或覆盖已有日志。原始日志只供受控终端排障，不进入工作台回执或浏览器。

## Release Evidence

正式 evidence 逐层绑定：

- committed SHA、image content ID / registry digest、SBOM 与 migration 序列；
- 同 bytes release rehearsal；
- target preflight、backup/restore、migration、Compose、health、ready 与公网 exact SHA；
- smoke 的 HTTP、登录、客户配置 effective session 和 PDF 脱敏摘要；
- target-specific rollback point。

`release-evidence-gate.mjs` 通过只说明 evidence 文件满足合同，不替代目标实时运行、数据身份、客户 UAT 或签收。

客户配置激活、发布就绪和证据状态入口共用 `deployment-targets.mjs` 的目标合同，包含显式选择的 `production-133`。正式配置仍须完成 manifest 评审、发布证据、validate / publish、transition check、activate 和 effective-session 读回；生产只接受 `base-release`，不使用固定测试凭据验收档。

普通发布和客户验收使用两个 profile；无迁移且确认恢复流程未变的普通发布不重复要求恢复 / 回滚演练或客户签收，但保留当前备份和固定回滚路径。详细条件见 [发布证据](../../deployments/yoyoosun/evidence/releases/README.md)。目标机预检、能力核验和 JSON 回执复用已有 Shell、jq 与 SHA-256 工具，不需要宿主 Node.js、Go 或 Python；回执继续使用 `release-evidence-contract.json`，由本地 Node.js 合同测试核对结构、脱敏和原子写入。

## 安全边界

- 目标机只 load / pull 制品、migration、启动和检查，不从源码构建。
- endpoint 和 backend URL 不得携带账号密码。
- 报告不保存 token、完整 DSN、凭据、客户正文、本机绝对路径或原始错误。
- secret 只从受控进程环境、stdin 或凭据存储进入需要它的单一进程。
- 不把 demo/test 的数据库、上传、backup、operation 或 rollback point 交叉复用。
- 不把 `admin.yoyoosun.net` 作为环境别名或兼容 target。
- Chromium seccomp 校验固定的是经审查的权限语义，忽略 JSON 格式、注释和规则顺序；新增 syscall 权限、撤掉 capability 条件或改变 sandbox 参数仍会阻断，不能用“存在几个关键字段”代替完整安全边界。

## 修改后验证

发布脚本的静态 JSON-RPC envelope、条件方法与本地 transport wrapper 由 `node scripts/qa/public-contract-consumers.mjs` 对照服务端生成目录检查；动态操作重放仍运行执行器行为测试。检查不调用目标，也不要求发布脚本运行时加载 Web 模块，合同见[公共契约规范](../../docs/engineering/跨层公共契约与生成规范.md#自动守卫--gates)。

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


## 发布预检与存量审计

生产发布还必须使用准备好的运行时 `.env` 执行产品级 preflight；该命令不执行 migration，只确认配置、Compose、运行身份与健康边界：

```bash
bash scripts/deploy/production-preflight.sh \
  --profile base-release \
  --deployment-target <demo-133|customer-test-133> \
  --env-file server/deploy/compose/prod/.env
```

写入 release evidence 时只保存脱敏检查输出，不保存真实 `.env`：

```bash
bash scripts/deploy/production-preflight.sh \
  --profile <base-release|customer-trial-acceptance> \
  --deployment-target <demo-133|customer-test-133> \
  --env-file server/deploy/compose/prod/.env \
  --runtime \
  --out deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.json
```

不写 evidence 的 env-only 预检可以不带 `--runtime`。正式 evidence 必须在部署后带 `--runtime`；`--out` 写入稳定 JSON 检查 ID，中文日志只供操作人阅读，不参与 release gate 解析。`base-release` 只执行配置、隔离、镜像、迁移、运行身份和 health / ready 底线；`customer-trial-acceptance` 才追加 SMS provider、PDF warmup 与 Chromium exact pin，并把 profile 写入回执供 release gate 交叉验证。

产品级 production preflight 只核配置与部署边界，不读取业务行。现存数据库升级链在 apply 前必须依次完成两项独立只读审计：`populated-upgrade` 同时覆盖 `20260714055504_migrate.sql` 的存量边界和 WIP `20260717035245 -> 20260717043625` 委外关联切换，`customer-config-cutover` 覆盖 `20260714055825_customer_config_append_only_and_role_backfill.sql` 的切换边界。`migrate_online.sh` 的非 `--status-only` 路径会在 Atlas status 后按此顺序调用；任一失败都不会进入 dry-run 或 apply。需要单独复核时，使用固定 `--audit` 值，并通过容器模式或环境变量名传入 DSN，不能把连接串直接写进命令或报告：

```bash
sh scripts/qa/populated-upgrade-preflight.sh \
  --audit populated-upgrade \
  --docker-container <postgres-container> \
  --database <database> \
  --username <username>

sh scripts/qa/populated-upgrade-preflight.sh \
  --audit customer-config-cutover \
  --docker-container <postgres-container> \
  --database <database> \
  --username <username>

# POPULATED_UPGRADE_DATABASE_URL 先由受控运行环境注入，不在命令行赋值或输出
sh scripts/qa/populated-upgrade-preflight.sh \
  --audit populated-upgrade \
  --database-url-env POPULATED_UPGRADE_DATABASE_URL

sh scripts/qa/populated-upgrade-preflight.sh \
  --audit customer-config-cutover \
  --database-url-env POPULATED_UPGRADE_DATABASE_URL
```

两项审计都以 `BEGIN TRANSACTION READ ONLY` 执行，只报告 blocker。发现不兼容存量行、WIP 旧委外链接、切换后缺失 allocation、遗留流程实例或任务配置 revision 锚点后应停止 apply，由人工治理任务明确数据映射、审计、备份与回滚点；不得向审计、migration 或发布脚本补自动 `INSERT / UPDATE / DELETE`。fresh schema、静态 DDL、Ent 零漂移、Atlas validate 或空库迁移不能替代存量升级证明。备份恢复演练同样先恢复 dump、记录 pre-apply status、依次运行两项审计，再允许 Atlas apply。

## 回滚演练报告

rollback / forward-fix 演练完成并取得 post-smoke report 后，用报告生成器收口 release gate 需要的 JSON：

```bash
node scripts/deploy/rollback-rehearsal-report.mjs \
  --environment customer-trial \
  --release-id <release-id> \
  --rehearsal-type rollback-forward-fix \
  --trigger-scenario "smoke failed after activation" \
  --rollback-target-release <previous-release-version> \
  --step "identify rollback target=pass" \
  --step "verify rollback command path=pass" \
  --step "verify forward-fix owner path=pass" \
  --post-smoke-report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json \
  --customer-config-revision <approved-runtime-revision> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该生成器要求步骤非空且全部 `pass / passed / ok`，post-smoke report 的 checks 非空且全部通过，并声明不含 secret / raw customer rows；提供 `--evidence-dir` 时默认写入同目录 `rollback-rehearsal-report.json`。生成的 `postCheck` 会记录 `smokeReport` 和 `smokeCheckCount`，release gate 会要求 `smokeReport` 指向同一 release evidence 目录内的 `smoke-test-report.json`，且 `smokeCheckCount` 与该文件 checks 数量一致，避免只手写 `smokeStatus=passed` 或引用其他批次 smoke。生成器本身也会拒绝绝对路径、非 `smoke-test-report.json` 文件名，或无法解析到输出目录同层 `smoke-test-report.json` 的路径；使用仓库相对路径或 `smoke-test-report.json`。如果提供 `--customer-config-revision`，还会要求 post-smoke report 包含 `customer-config-effective-session`，且 `target=jsonrpc:customer_config.get_effective_session`、`expectedRevision` 匹配传入 revision、记录 token 来源 env 名并声明 `responseBodyStored=false`，生成的 `postCheck.customerConfigEffectiveSession` 才能作为回滚 / 前向修复后读回 active revision 的脱敏证据。它不执行回滚、不恢复备份、不跑 migration、不调用后端。
