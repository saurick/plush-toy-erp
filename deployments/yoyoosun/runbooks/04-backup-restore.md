# yoyoosun 备份恢复 / Backup And Restore Runbook

## 备份范围

| 范围 | 说明 | 是否提交到 Git |
| --- | --- | --- |
| PostgreSQL | 业务数据库 | 否 |
| 附件目录 | 上传文件、模板相关附件 | 否 |
| 受控 `.env` 指纹 | 只记录 hash，不记录明文 | 可记录 hash |
| release evidence | 发布审计资料 | 可入库，必须脱敏 |
| import / dry-run report | 导入报告摘要 | 可入库，不能含 raw rows |

## 备份频率

- 发布前：必须备份。
- migration apply 前：必须备份。
- 真实导入 apply 前：必须备份；当前 yoyoosun 真实导入未开放。
- 日常：按客户环境容量和业务节奏制定每日 / 每周策略。

## 备份步骤

1. 确认数据库和附件目录位置。
2. 生成数据库备份到受控备份目录。
3. 计算 hash、大小和时间。
4. 如启用加密，确认加密状态和 key alias。
5. 记录 backup evidence，不记录下载链接或 secret。
6. 定期抽样恢复到测试库。

本地 / 试用前最小恢复演练入口：

```bash
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version <release-version> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
```

该脚本会把 dump 放在 `output/` 下并恢复到临时隔离 PostgreSQL 容器；`output/` 不纳入 git。`--backup-purpose` 必须明确是 `pre-migration`、`pre-deploy`、发布前或 migration 前语义，方便 release evidence gate 证明这是 migration 前备份。脚本恢复 dump 后会先记录 `migration-status-before-apply.txt`，再对隔离库依次运行 populated upgrade 与 customer config cutover read-only audit；两项都通过后才执行 `atlas migrate apply`，最后生成 release gate 使用的 `migration-status.txt`。因此 `backup-evidence.md` 与 `backup-restore-report.json backup.migrationVersion / restore.migrationBeforeApply` 记录的是 migrationBefore，`backup-restore-report.json restore.restoreMigrationVersion` 记录的是恢复后 migrationAfter。跨越 `20260714055504` 时，四处 `populatedUpgradeAuditStatus` 必须为 `passed`；跨越 `20260714055825` 时，四处 `customerConfigCutoverAuditStatus` 必须为 `passed`；command summary 的步骤还必须包含对应 read-only audit。提供 `--evidence-dir` 时，脚本只把脱敏后的 `backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json` 复制到 release evidence 目录，不复制 dump。`backup-restore-report.json` 中的 artifact 路径必须保持为当前 release evidence 目录内的相对路径，不能指向 `output/`、绝对路径、完整 DSN 或不存在的文件；`command-summary.txt` 必须绑定同一 `backupId / releaseVersion / sourceAlias / restoreTarget`，并记录 pg_dump、restore、atlas、smoke 的脱敏步骤。

## 恢复步骤

1. 选择 backup id，并确认 hash。
2. 准备隔离恢复环境或明确恢复窗口。
3. 恢复数据库。
4. 恢复附件目录。
5. 记录恢复后的 migrationBefore。
6. 在隔离库执行 populated upgrade read-only audit；发现 blocker 时停止，不执行 apply。
7. 执行 customer config cutover read-only audit；发现遗留流程实例或任务配置 revision 锚点时停止，由人工治理，不执行自动 DML。
8. 两项审计通过后执行 migration apply，再执行 migration status，确认 migrationAfter 和 pending files。
9. 执行 smoke query、健康检查和关键页面 smoke。
10. 写入恢复演练报告。

恢复演练报告必须至少记录：

- `backupId`、备份大小和 hash。
- `restoreTarget` alias，不记录完整 DSN。
- `command-summary.txt` 的 backup、release、source、restore target 和脱敏执行步骤。
- `restoreTestStatus`、`restoreMigrationVersion`、`populatedUpgradeAuditStatus`、`customerConfigCutoverAuditStatus` 和 `smokeQueryStatus`。
- backend `healthz / readyz` 和 web 主路径 smoke 状态；如果未运行，必须明确写 `not-run`。
- 失败项和后续修复项。

## RPO / RTO

| 指标 | 当前建议 |
| --- | --- |
| RPO | 发布 / migration 前为 0；日常按客户备份策略确认 |
| RTO | 先以单机恢复演练结果为准，未演练前不得承诺固定时长 |

## 禁止

- 禁止把 `.dump`、`.sql`、`.tar`、附件原件或备份密钥提交到 Git。
- 禁止在 evidence 中写真实下载链接、真实 access key 或完整 DSN。
- 禁止用未验证备份执行破坏性操作。
