# yoyoosun Backup Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId | plush-yoyoosun-20260703T1315-c298a2a3-pre-migration |
| backupTime | 2026-07-03T05:13:53Z |
| backupPurpose | pre-migration |
| environment | customer-trial-133 |
| operatorRole | codex-local-build-133-deploy |
| releaseVersion | yoyoosun-20260703-c298a2a3-amd64 |
| migrationVersion | 20260612112337 |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | 169059 |
| databaseBackupHash | sha256:15169b008570792670d420a2c66caa978bf8064a087fcda61e76f76c4cd63b68 |
| attachmentSnapshot | not-included-db-only-pre-migration-backup |
| storageLocationAlias | 133-compose-backups/plush-yoyoosun-20260703T1315-c298a2a3-pre-migration |
| encryptionEnabled | host-managed |
| retentionPolicy | retain-for-release-rollback-window |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | passed |
| restoreTarget | isolated-postgres-db-plush_restore_c298a2a3_051446 |
| restoreMigrationVersion | 20260701152057 |
| smokeQueryStatus | passed |
| webSmokeStatus | passed |
| verifiedAt | 2026-07-03T05:15:00Z |
