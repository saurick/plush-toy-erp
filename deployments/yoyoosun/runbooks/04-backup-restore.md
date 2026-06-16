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
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
```

该脚本会把 dump 放在 `output/` 下并恢复到临时隔离 PostgreSQL 容器；`output/` 不纳入 git。发布 evidence 只复制脱敏后的 `backup-evidence.md`、`migration-status.txt` 和 `backup-restore-report.json`。

## 恢复步骤

1. 选择 backup id，并确认 hash。
2. 准备隔离恢复环境或明确恢复窗口。
3. 恢复数据库。
4. 恢复附件目录。
5. 执行 migration status。
6. 执行 smoke query、健康检查和关键页面 smoke。
7. 写入恢复演练报告。

恢复演练报告必须至少记录：

- `backupId`、备份大小和 hash。
- `restoreTarget` alias，不记录完整 DSN。
- `restoreTestStatus`、`restoreMigrationVersion` 和 `smokeQueryStatus`。
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
