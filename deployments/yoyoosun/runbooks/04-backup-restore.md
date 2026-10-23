# yoyoosun 备份恢复 / Backup And Restore Runbook

## 备份范围

| 范围                    | 说明                                                                          | 是否提交到 Git          |
| --- | --- | --- |
| PostgreSQL | 业务数据库和附件元数据；使用 custom-format dump | 否 |
| S3 业务附件 | 同一停写窗口用 `attachment-storage backup` 导出的文件与 manifest，绑定配套 PG dump | 否 |
| 受控 `.env` 指纹        | 只记录 hash，不记录明文                                                       | 可记录 hash             |
| release evidence        | 发布审计资料                                                                  | 可入库，必须脱敏        |
| import / dry-run report | 导入报告摘要                                                                  | 可入库，不能含 raw rows |

成套入口是 `node scripts/deploy/backup-set/cli.mjs`。一个 `plush-set-<UTC>-<UUID>.tar.age` 包含 PG custom-format dump、附件 manifest、全部登记文件，以及绑定它们的 SHA-256、镜像内容身份、release、migration、有效客户配置和运行 env 指纹。

包含已撤回附件，保留原 ID、key 与审计。运行存储边界见[附件合同](../../../server/deploy/compose/prod/README.md#附件存储与raid5)；不直接打包运行中的 SeaweedFS 数据目录。

包内不包含 env 明文、密码、age identity 或镜像本身。受控加密运行配置、解密身份和对应固定镜像必须另行保存；恢复端先加载该架构下的原应用镜像与固定 PG / SeaweedFS 镜像，工具不会临时拉取或构建制品。

## 备份频率

- 发布前：必须备份。
- migration apply 前：必须备份。
- 真实导入 apply 前：必须备份；当前 yoyoosun 真实导入未开放。
- 日常目标：每日在维护窗口生成一个 PG＋附件成套备份，本地和异地均只保留加密包及 checksum，保留 35 天且至少保护最近两套；每周从异地副本恢复到新建临时 PG / S3，验证后精确删除临时资源。

[`systemd` 模板](../systemd/README.md) 已指向成套入口；模板变化不修改已安装任务。升级时须同时核对固定工具版本、Node 路径、独占维护窗口、工作盘空间、异地挂载和恢复端镜像。只有首跑成功、异地同名包 / checksum 读回、恢复报告为 `passed` 且绑定同一 backupId，才可宣称该目标已启用成套日常备份。

旧 `scheduled-postgres-backup.sh` 和 `verify-scheduled-postgres-backup.sh` 仍为 PG 专用工具，旧报告不能升级为成套证明。

## 备份步骤

1. 确认 project、数据库、固定 release、私有 runtime env、本地备份盘、异地挂载及 age recipient。异地目录须有固定标记并位于不同文件系统；挂载缺失时直接失败。
2. 安排独占维护窗口，停止其它应用实例、发布 / 迁移 / 导入和对象清理。确认串表示已安排这一窗口。工具核对唯一运行 app-server / postgres 后只停止原 app-server，并拒绝数据库中的其它客户端；不会自行停止未知进程。
3. 从仓库根目录运行以下命令。工具用 `erp_backup` 生成 PG dump，再导出附件；前后核对附件完整行摘要、有效配置及迁移版本。成功、异常和 SIGTERM 均尝试启动原容器并等待健康，不运行 Compose up 或修改配置。
4. 应用恢复后再封包、加密、复制与读回 checksum；清理仅匹配本工具命名且校验通过的过期备份，不处理旧 PG 文件或其它备份。中断不能产生 passed；应用恢复失败时保留本次私有工作目录，先核对原容器再处理。
5. 核对 `latest-set-status.json` 中的 `status=passed`、`applicationResumed=true`、`offsiteCopied=true`、`offsiteEncrypted=true`，记录 backupId / release / migration / 附件数量与字节。执行下节恢复检查，不输出秘密。

```bash
node scripts/deploy/backup-set/cli.mjs create \
  --project plush-toy-erp-production --database plush_erp_production \
  --compose-file /root/deploy/plush-toy-erp-production/current/server/deploy/compose/prod/compose.yml \
  --env-file /root/deploy/plush-toy-erp-production/runtime/.env.production-133 \
  --backup-dir /root/deploy/plush-toy-erp-production/backups/scheduled \
  --offsite-dir /mnt/plush-toy-erp-offsite/database \
  --recipient-file /etc/plush-toy-erp/backup-age-recipient.txt \
  --confirm BACKUP_SET:plush-toy-erp-production:plush_erp_production
```

停写耗时取决于数据库与附件体积，须以演练实测安排窗口。辅助容器按宿主备份目录属主的数值 UID / GID 运行，配合只读根文件系统及去除 capabilities，以访问 0700 / 0600 私有文件；不依赖应用镜像的默认用户。

正常隔离验证运行 `node scripts/qa/backup-set-integration.mjs`：使用默认非 root 工具镜像、合成非空附件、真实 migration 和一次性 PG / SeaweedFS；显式本地加密模式 `--allow-local-only` 不提供异地证明。

工具链使用项目 Node、Docker、age，宿主锁在 Linux 使用 flock、Mac 使用 lockf。

仅做 PostgreSQL 升级审计时可使用旧的专项演练入口，不能代替成套恢复：

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

先用最新异地成套备份运行恢复检查：

```bash
node scripts/deploy/backup-set/cli.mjs restore-check \
  --offsite-dir /mnt/plush-toy-erp-offsite/database \
  --identity-file /etc/plush-toy-erp/backup-age-identity.txt \
  --work-dir /root/deploy/plush-toy-erp-production/backups/restore-work \
  --report /var/lib/plush-toy-erp/backup/latest-restore-check.json \
  --max-age-hours 36
```

恢复检查不连接现有 PG / bucket：在无宿主端口的 Docker internal 网络创建独立 PG 与 S3，先验密文 checksum、解密、拒绝 tar 链接 / 特殊文件 / 路径穿越，再逐文件校验。恢复 PG 后核对迁移、有效客户配置、附件整行摘要，向新 bucket 恢复文件并逐对象验大小与 SHA-256。

临时容器、该次匿名卷、网络及明文均清理成功才写 `plush.backup-set-restore/v1` passed。报告必须为 `sourceKind=offsite-backup-set`、同一 backupId、数量和字节相符、`restoreTarget=temporary-postgres-and-s3-removed`。失败会覆盖本次报告为 failed，不能沿用旧 passed。

需要验证恢复后的业务时，在 `restore-check` 增加 `--business-smoke`，由受控进程环境提供 `RESTORE_SMOKE_USERNAME`、`RESTORE_SMOKE_PASSWORD`。该选项在同一个无宿主端口、无外网出口的隔离网络中，按正式角色脚本重建并验证数据库最小权限，保留备份中的数据库名和网络内 `postgres` 别名，再启动备份绑定的原应用镜像。试用配置按备份中的有效产品标识恢复运行开关，仍由原应用执行完整边界检查；Chromium 使用正式 Compose 的 seccomp 策略并保留 sandbox。验证不更改原账号密码，不 bootstrap 或通过业务 API 写入业务事实；应用自身启动及登录审计只作用于临时副本。

业务检查包括 health / ready、真实登录、有效客户配置版本、单位和销售订单读取，以及最多三份未撤回附件的 API 下载与哈希核对；全部附件仍由前面的存储恢复逐对象校验。会话退出、应用容器及其余临时资源清理成功后，`businessSmoke.status=passed` 才能随同一 backupId / releaseSha 输出。未选择该选项仍为 `businessSmoke=not-run`，不能用数据库与附件成功代替业务验证。它不是完整岗位矩阵、业务写入或客户验收。

恢复页从固定的 `output/customers/<customer>/backup-restore-rehearsal/` 读取脱敏回执。成套报告保存为 `backup-set-restore-report.json`；旧专项数据库回执仍使用 `backup-restore-report.json`，两者保留各自证据范围。跨主机取回报告时保留原内容和 SHA-256，不复制 dump、私有资源清单或凭据。

灾难恢复可选择一套精确文件，以 `restore --file <absolute-set.tar.age> --identity-file <private-key> --work-dir <private-dir> --report <private-json> --keep` 保留新建隔离 PG / S3。资源名与私有配置目录只写入 0600 报告，仍无宿主端口。

该入口不接受已有数据库或 bucket，也不切生产入口；先核对资源和文件再按以下步骤完成业务恢复。`restore-check --file` 可用于指定副本演练，其报告明确为 `explicit-backup-set`，不证明异地来源。旧 PG-only 文件不被成套入口接受。

1. 选择 backup id，并确认 hash。
2. 准备隔离恢复环境或明确恢复窗口。
3. 恢复数据库，并按 [Compose 数据库角色合同](../../../server/deploy/compose/prod/README.md)使用受控恢复配置重新建立 / 核对应用、迁移及只读备份角色。dump 不携带角色密码和 owner / ACL；`restore --keep` 的隔离 PG 不能直接作为已就绪的业务服务。
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
| RPO | 成套日常备份名义周期为 24 小时，恢复检查 freshness 为 36 小时；以实际成功且已验证的完整恢复点为准。仅 PG 定时备份的历史记录不证明附件 RPO。 |
| RTO  | 先以单机恢复演练结果为准，未演练前不得承诺固定时长                                                                                |

## Mac 外接盘副本 / Mac Backup Replica

额外副本复用服务器已经生成的加密备份，不替换服务器本地及香港备份。Mac 主动经 SSH 拉取，按外盘 UUID 和专属目录标记确认介质，校验 SHA-256 后才原子落盘。来源主机及目录、外盘 UUID、保留期和时间表分别配置；SSH 使用已有主机密钥与登录配置，不关闭主机身份检查。

Mac 使用不低于项目最低版本的同一主版本 Node（允许兼容的 minor / patch 更新）与内置 `lockf / plutil`，SSH 来源使用 POSIX Shell 和 GNU `stat / realpath / sha256sum`；Mac 恢复检查另需 `age`、Docker 和已加载的 `postgres:18.6` 镜像。

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
5. 相关模块验证后运行 `install --config <private-config.json>`。安装器生成固定内容 SHA-256 的独立运行目录及当前用户 launchd 任务，并记录基础提交及真实来源状态；未提交内容记为 `content-snapshot`，不冒充提交版本，也不要求先提交共享工作区。每次运行重新校验制品完整性；共享工作区后续变化不影响已安装版本。安装后读回 launchd 最后退出码，再运行 `check --config <private-config.json>` 核验当前介质、最近同步 / 恢复及新鲜度，不能只凭安装成功或历史 `status` 宣称定时首跑通过。

`run` 执行同步及到期的恢复检查。`check` 只读核对当前介质、已复制文件和回执时效，失败不覆盖同步或恢复记录；`sync` 和 `verify` 才分别执行密码学完整性与真实恢复验证。运行版本不兼容等启动失败也会更新最近操作状态，保留最近成功回执。缺盘时记录 `skipped / volume_not_mounted`；校验损坏、来源过期、介质不符或恢复失败记录 failed。外盘读取先在独立进程执行 15 秒限时预检；无法读取时记录 `destination_access_unavailable`，不开始传输或解密。

首次后台访问外盘可能需要在 macOS 提示中允许 Node 访问可移动宗卷；前台运行继承终端 / App 权限，不能证明后台已获准。遇到预检失败须核对介质与系统授权，不能改为内盘目录或关闭系统保护。状态、最近成功及恢复回执保存在配置的 `stateDirectory`；最近恢复尝试单独记录，失败或中断后下次运行重新验证，历史成功回执保留。副本索引在外盘专属目录。SIGTERM / SIGINT 进入同一清理路径；安装器拒绝中断仍在运行的旧备份任务。

Mac 休眠 / 离线期间不会保证取得最新副本，服务器原有自动备份继续独立运行。

切换同一数据来源到另一台 SSH 主机时，先复制历史加密文件、checksum 和来源身份标记，修改私有配置的 host / directory，再依次执行 sync、verify 和定时首跑读回。更换外盘时填写新 UUID 并初始化 / 核验专属目录；恢复回执绑定卷 UUID，新介质会重新验证。新链路通过且保留窗口结束后再处理旧目标；不同业务来源使用新的 id 与目录。对象存储等新协议应扩展传输模块，不混入同步及恢复逻辑。

ERP 来源的 Mac 副本分支识别旧 PG 备份及既有初始化附件清单 / 加密配置，不会自动同步新的 `plush-set-*.tar.age`。其恢复检查只证明 PostgreSQL；接入新备份集须单独扩展传输、保留与成套恢复合同，不能因旧副本健康而宣称新的完整备份已到 Mac。

GitLab 使用同一运行器的独立来源、目录、状态和定时任务，按完整包保留最近 7 份；配置样例、64 GiB 空间余量、加密及完整隔离恢复见 [GitLab PD-SSD 自动副本](../../../server/deploy/gitlab/README.md#pd-ssd-自动加密副本--external-backup-replica)。两个来源的保留规则和恢复结论分别判断。

## 禁止

- 禁止把 `.dump`、`.sql`、`.tar`、附件原件或备份密钥提交到 Git。
- 禁止在 evidence 中写真实下载链接、真实 access key 或完整 DSN。
- 禁止用未验证备份执行破坏性操作。
