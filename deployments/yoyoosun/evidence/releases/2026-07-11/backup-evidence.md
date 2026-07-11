# yoyoosun Backup Evidence / 备份证据

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId | predeploy-20c96d38-20260711T052623Z |
| backupTime | 2026-07-11T05:26:23Z |
| backupPurpose | pre-deploy |
| environment | customer-trial-133 |
| operatorRole | codex-local-build-133-deploy |
| releaseVersion | yoyoosun-20260711-20c96d38-amd64 |
| migrationVersion | 20260710150001 |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | 337813 |
| databaseBackupHash | sha256:2b3fe0e0eb5677ec2db9ffab91e09caaf81a3378262b30ccb0800a9ab2c6fef3 |
| attachmentSnapshot | not-included-db-only-pre-deploy-backup |
| storageLocationAlias | plush-133:/opt/plush-toy-erp/backups/predeploy-20c96d38-20260711T052623Z.dump |
| encryptionEnabled | host-managed |
| retentionPolicy | retain-through-customer-trial-rollback-window |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | passed |
| restoreTarget | isolated-postgres-db-plush_restore_20c96d38-removed |
| restoreMigrationVersion | 20260710150001 |
| smokeQueryStatus | passed |
| webSmokeStatus | passed |
| verifiedAt | 2026-07-11T05:44:00Z |
