# yoyoosun 备份恢复 / Backup And Restore Runbook

## 备份范围

| 范围                    | 说明                                                                          | 是否提交到 Git          |
| --- | --- | --- |
| PostgreSQL | 业务数据库和附件元数据；使用 custom-format dump | 否 |
| S3 业务附件 | 同一停写窗口用 `attachment-storage backup` 导出的文件与 manifest，绑定配套 PG dump | 否 |
| 受控 `.env` 指纹        | 只记录 hash，不记录明文                                                       | 可记录 hash             |
| release evidence        | 发布审计资料                                                                  | 可入库，必须脱敏        |
| import / dry-run report | 导入报告摘要                                                                  | 可入库，不能含 raw rows |

运行存储、工具参数和新 bucket 恢复步骤以 [附件备份与恢复合同](../../../server/deploy/compose/prod/README.md#附件存储与raid5) 为准。PG dump、文件备份、release / migration 身份必须成套保存；不能直接打包运行中的 SeaweedFS 数据目录。

## 备份频率

- 发布前：必须备份。
- migration apply 前：必须备份。
- 真实导入 apply 前：必须备份；当前 yoyoosun 真实导入未开放。
- 日常目标：每日整库备份到本地受控目录，通过 `age` 加密后复制到独立挂载的异地目录，保留 35 天；每周从异地加密副本做一次临时库真实恢复。

仓库已提供 `scripts/deploy/scheduled-postgres-backup.sh`、`scripts/deploy/verify-scheduled-postgres-backup.sh` 和 [`systemd` 安装模板](../systemd/README.md)。只有目标机已安装 timer、手工首跑通过、异地副本读回且恢复报告为 `passed`，才可宣称日常备份已启用；本地代码存在不等于目标机已安装。这组定时脚本只备份 PostgreSQL；附件外置后的完整系统备份还需要配套文件备份及恢复验证。

## 备份步骤

1. 确认数据库、本地备份目录、独立异地挂载目录和 `age` recipient；异地目录已按 systemd 安装说明写入固定挂载标记，且与本地目录不在同一文件系统。
2. 停止相关业务写入，使用只读 `erp_backup` 生成数据库备份，并按附件合同执行 `backup`；成功写出 manifest 后才结束该备份窗口。
3. 计算本地 dump 的 hash、大小和时间，并记录附件备份 manifest、数量、字节和校验结果。
4. 使用 `age` 公钥加密异地副本，并计算加密文件 hash；identity 不与异地副本同存。
5. 记录 backup evidence，不记录下载链接或 secret。
6. 在隔离目标恢复配套 PG dump 和附件备份，再逐对象 `verify`；PG 定时恢复报告只证明数据库这一部分。

本地 / 试用前最小恢复演练入口：

```bash
SOURCE_POSTGRES_DSN='<postgres://erp_backup:...@host:port/database?sslmode=...>' \
  bash scripts/deploy/run-backup-restore-rehearsal.sh \
    --release-id <release-id> \
    --environment <environment> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
```

该脚本会把 dump 放在 `output/` 下并恢复到临时隔离 PostgreSQL 容器；`output/` 不纳入 git。提供 `--evidence-dir` 时只复制脱敏报告和迁移状态，不复制 dump。`command-summary.txt` 必须绑定同一 `backupId / releaseId / sourceAlias / restoreTarget`。字段级检查由 release evidence gate 维护。

## 恢复步骤

1. 选择 backup id，并确认 hash。
2. 准备隔离恢复环境或明确恢复窗口。
3. 恢复数据库。
4. 按附件合同向新的 S3 endpoint / bucket 执行 `restore` 和 `verify`，核对配套 PG 元数据、原 key、附件 ID、大小与 SHA-256；旧对象和备份保留到回滚窗口结束。
5. 记录恢复后的 migrationBefore。
6. 在隔离库执行 populated upgrade read-only audit；发现 blocker 时停止，不执行 apply。
7. 执行 customer config cutover read-only audit；发现遗留流程实例或任务配置 revision 锚点时停止，由人工治理，不执行自动 DML。
8. 两项审计通过后执行 migration apply，再执行 migration status，确认 migrationAfter 和 pending files。
9. 完成 customer config active revision 读回，保持客户入口关闭。
10. 客户试用验收时按目标凭据合同恢复并撤销旧会话：`demo-133` 处理 admin 与 11 个 `uat_*`；`customer-test-133` 只处理 admin，并证明非管理员身份集合未变化。
11. 启动 steady 后端并运行适用登录矩阵：demo 共 12 个身份；test 只登录 admin。普通基础发布不要求这组验收专项证明。
12. 执行 smoke query、健康检查和关键页面 smoke。
13. 写入恢复演练报告。

恢复演练报告必须至少记录：

- `backupId`、备份大小和 hash，以及配套附件 manifest / 校验结果；数据库恢复通过不能代替附件恢复。
- `restoreTarget` alias，不记录完整 DSN。
- `command-summary.txt` 的 backup、release、source、restore target 和脱敏执行步骤。
- `restoreTestStatus`、`restoreMigrationVersion`、`populatedUpgradeAuditStatus`、`customerConfigCutoverAuditStatus` 和 `smokeQueryStatus`。
- backend `healthz / readyz` 和 web 主路径 smoke 状态；如果未运行，必须明确写 `not-run`。
- 失败项和后续修复项。

## RPO / RTO

| 指标 | 当前建议                                                                                                                          |
| --- | --- |
| RPO | 发布 / migration 前在停写窗口保存配套 PG 与附件备份；PG 日常名义周期为 24 小时，36 小时 freshness 只约束 PG 定时检查。系统实际 RPO 以两者共同且已验证的恢复点为准。 |
| RTO  | 先以单机恢复演练结果为准，未演练前不得承诺固定时长                                                                                |

## Mac 外接盘副本 / Mac Backup Replica

额外副本复用服务器已经生成的加密备份，不替换服务器本地及香港备份。Mac 主动经 SSH 拉取，按外盘 UUID 和专属目录标记确认介质，校验 SHA-256 后才原子落盘。来源主机及目录、外盘 UUID、保留期和时间表分别配置；SSH 使用已有主机密钥与登录配置，不关闭主机身份检查。

Mac 复用项目 Node 版本与内置 `lockf / plutil`，SSH 来源使用 POSIX Shell 和 GNU `stat / realpath / sha256sum`；Mac 恢复检查另需 `age`、Docker 和已加载的 `postgres:18.6` 镜像。

| 配置 / 模块 | 职责 |
| --- | --- |
| `env/backup-replica.example.json` | 私有目标配置的样例；实际配置由当前用户持有，权限为 0600，不入 Git |
| `source.id / host / directory` | 固定数据来源身份及 SSH 目录；来源目录须有 `.plush-backup-source`，内容为 `plush.backup-source/v1:<source.id>` |
| `destination.volumeUUID / relativeDirectory` | 已挂载且可写的外部卷及专属子目录；不自动挂载、不格式化、不创建替代的内盘目录 |
| `retentionDays` | 副本独立保留期，样例为 90 天；来源删除不会传播，仅清理本工具索引内已过期的数据库副本，初始配置 / 附件清单保留 |
| `restore` | 本机受保护的 age identity、固定 PostgreSQL 镜像、恢复检查间隔与单次时限，样例为 7 天 / 2700 秒 |
| `schedule` | macOS 本地时区的日常时间；安装后还会在用户登录和文件系统挂载时运行，不主动唤醒电脑 |

从仓库根目录执行：

1. 将样例复制到仓库外的私有配置文件，填写实际目标。确认外盘 UUID、可用空间、来源身份与 SSH 可读性，并单独保管恢复密钥。
2. 运行 `node scripts/deploy/backup-replica/cli.mjs init --config <private-config.json>`。只初始化专属空目录；已有非空目录而缺少匹配标记时拒绝接管。
3. 运行同一入口的 `sync --config <private-config.json>`，核对 copied / retained / latest backup 与来源身份。受管文件仅包括加密 `.age`；数据库文件必须有有效同名 checksum，未完成的传输不会成为最终文件。
4. 运行 `verify --config <private-config.json>`。它从外盘实际副本解密，恢复到无网络、无宿主端口的一次性 PostgreSQL，核对业务表与 Atlas migration；精确清理临时容器、其新建匿名卷及临时明文成功后才保存 passed 回执。首次镜像启动须等待 PID 1 已进入最终 PostgreSQL 进程，避免误用 initdb 的临时服务。
5. 相关模块提交并验证后运行 `install --config <private-config.json>`。安装器核对每个模块与提交内容一致，生成固定内容 hash 的独立运行目录及当前用户 launchd 任务；共享工作区后续变化不影响已安装版本。安装后读回 launchd 最后退出码和 `status --config <private-config.json>`，不能只凭安装成功宣称定时首跑通过。

`run` 执行同步及到期的恢复检查。缺盘时记录 `skipped / volume_not_mounted`；校验损坏、来源过期、介质不符或恢复失败记录 failed。外盘读取先在独立进程执行 15 秒限时预检；无法读取时记录 `destination_access_unavailable`，不开始传输或解密。首次后台访问外盘可能需要在 macOS 提示中允许 Node 访问可移动宗卷；前台运行继承终端 / App 权限，不能证明后台已获准。遇到预检失败须核对介质与系统授权，不能改为内盘目录或关闭系统保护。状态、最近成功及恢复回执保存在配置的 `stateDirectory`；副本索引在外盘专属目录。SIGTERM / SIGINT 进入同一清理路径；安装器拒绝中断仍在运行的旧备份任务。Mac 休眠 / 离线期间不会保证取得最新副本，服务器原有自动备份继续独立运行。

切换同一数据来源到另一台 SSH 主机时，先复制历史加密文件、checksum 和来源身份标记，修改私有配置的 host / directory，再依次执行 sync、verify 和定时首跑读回。更换外盘时填写新 UUID 并初始化 / 核验专属目录；恢复回执绑定卷 UUID，新介质会重新验证。新链路通过且保留窗口结束后再处理旧目标；不同业务来源使用新的 id 与目录。对象存储等新协议应扩展传输模块，不混入同步及恢复逻辑。

这组恢复检查只证明 PostgreSQL。初始空附件 manifest 和加密运行配置可以一并复制并独立核验；非空 S3 对象仍须执行本 runbook 的配套附件 restore / verify，不能因数据库恢复通过而省略。

## 禁止

- 禁止把 `.dump`、`.sql`、`.tar`、附件原件或备份密钥提交到 Git。
- 禁止在 evidence 中写真实下载链接、真实 access key 或完整 DSN。
- 禁止用未验证备份执行破坏性操作。
