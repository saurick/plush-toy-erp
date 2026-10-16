# yoyoosun 首次部署 / First Deploy Runbook

首次上线沿用唯一 Compose 与固定目标发布链。仓库登记 `production-133` 只表示代码已支持该目标，不代表 133 已初始化、配置、发布或验收。所有命令从仓库根目录执行。

## 环境与职责

| 目标 | 入口 | 用途与数据 |
| --- | --- | --- |
| `demo-133` | `demo.yoyoosun.net` | 项目方模拟、演练和培训；受控重建 |
| `customer-test-133` | `test.yoyoosun.net` | 甲方测试及预发布验收；普通升级保留数据 |
| `production-133` | `erp.yoyoosun.net` | 正式业务；独立数据库、附件 bucket、凭据与恢复点 |

精确主机、目录、端口和 Compose 身份只取 [`deployment-targets.json`](../../../scripts/deploy/deployment-targets.json)。默认部署仍只覆盖 demo/test，生产必须显式选择；不另建 pre 环境或发布分支。

## 首次上线清单

| 顺序 | 事项 | 完成标准 |
| --- | --- | --- |
| 1 | 固定业务范围与版本 | test 对同一不可变发布包完成岗位主链、权限、异常恢复、附件及打印验收；已知限制明确 |
| 2 | 容量与资源 | 核对系统盘、Docker 盘、部署盘和附件盘；同机服务峰值预算为正式业务保留余量 |
| 3 | 生产资源与凭据 | registry 中的目录、数据库、端口均未占用；独立随机数据库、JWT、S3 和管理员凭据，不复制测试 env |
| 4 | 备份与恢复 | 异机挂载、加密 recipient、受控备份配置就绪；明确数据库与附件共同恢复点、保留策略、恢复窗口及负责人 |
| 5 | 候选制品 | 同 SHA 的 GitLab `CI Gate`、v2 七资产、SBOM、migration 与同 bytes 发布演练回执完整；服务器不构建 |
| 6 | 初始化计划 | 只读资格与计划通过；制品、目标、迁移和确认串可核对；未授权前不执行 |
| 7 | 初始化及读回 | 授权后由执行器生成独立资源、迁移、一次性管理员和 steady env；备份恢复检查先于公网切流 |
| 8 | 配置、数据与开用 | 正式客户配置走 publish / activate / effective-session 读回；岗位账号、主数据及期初范围经确认；不复制测试库 |
| 9 | 正式入口与运维 | DNS / TLS / 回源、正式登录、权限、附件、PDF、业务入口及告警通过；日常备份首跑和异机恢复有真实回执 |

生产首次初始化的只读资格检查会要求 `age`、权限为 `root:0600` 的 `/etc/plush-toy-erp/backup.env` 和 `/mnt/plush-toy-erp-offsite/database` 的独立文件系统及固定挂载标记；配置准备见 [systemd 安装说明](../systemd/README.md)。这些前提不证明备份任务已启用、异机真实归属或恢复已经演练，仍须完成清单第 9 项。

所有新目标还需要 `/etc/plush-toy-erp/sms-provider.env`，格式见 [`sms-provider.env.example`](../env/sms-provider.env.example)。由 root 在受控终端写入真实四项短信配置并设置 `0600`，不通过网页参数、命令行值或仓库传递秘密。资格检查与初始化共用同一数据读取器，拒绝缺项、重复项、占位值、符号链接和宽松权限；不依赖某个正在运行或已退役的业务容器。该文件只提供初始化配置，不热更新已运行目标；供应商凭据轮换须走各目标的运行配置流程。

容量预检按实际部署目录及其最近存在的父目录定位文件系统，另保留系统根盘原有安全线；两个磁盘都须达到 registry 的最低可用空间，不能用 RAID5 余量代替系统盘余量。

附件正文位于 S3，PG 只存元数据。新目标默认使用独立 managed SeaweedFS；使用已部署的 external 存储时也必须独立 bucket 与凭据，并按其维护窗口验证。存储和恢复步骤见 [附件合同](../../../server/deploy/compose/prod/README.md#附件存储与raid5)与[备份恢复](04-backup-restore.md)。

## 准备与执行

1. 从已验证的固定 release 准备计划；首次部署与普通升级复用同一个 controller，目标不存在时由只读资格检查判定是否可以初始化：

```bash
node scripts/deploy/promotion-controller.mjs \
  --release-manifest <已验证发布包目录>/release-manifest.json \
  --target production-133 \
  --idempotency-key <本次操作的稳定随机键> --json
```

2. 在本地版本中心 `/__dev/version-center` 核对目标、固定版本、备份与迁移计划。只有获得明确部署授权后才输入本次完整确认串执行；CLI 精确参数见 `promotion-executor.mjs --help`。执行器只接受 ready operation，目标机只取得、校验和加载原发布包。
3. 读取 operation 回执与 `target-preflight.mjs --target production-133 --json`。失败或 `not_proven` 时保留现场，不自动重试。初始化管理员密码仅保存在本机受控 access 文件；steady env 不保留 `APP_ADMIN_PASSWORD`。
4. `base-release` 记录基础发布证据；生产不使用 `customer-trial-acceptance` 的固定测试密码或 `uat_*` 登录矩阵。真实岗位与客户签收在固定版本上单独记录，基础健康通过不等于业务验收。

首次初始化后，正式客户配置仍须经过 manifest 编译与评审、发布证据门禁、validate / publish、transition check、activate 和 effective-session 读回；客户配置的激活、就绪和证据状态入口共用部署目标合同，接受显式指定的 `production-133`。生产只使用 `base-release`，不得套用测试账号或模拟数据验收档。

## 失败与恢复

首次初始化前没有“上一版生产”，必须保留本次资源、初始化回执和恢复身份。首次上线之后的代码回滚只接受 migration 序列和客户配置源指纹相同的已验证旧版本；不自动 down migration 或恢复数据库。结构不兼容时先评审 forward-fix 或配套数据库、附件恢复，见[回滚流程](03-rollback.md)。

仓库验证、目标部署、恢复演练和客户验收分别报告。测试数据重建、真实导入、提交、推送及上线仍各自授权；生产没有测试数据重建入口。
