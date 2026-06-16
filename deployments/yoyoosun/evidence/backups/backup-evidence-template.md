# yoyoosun Backup Evidence / 备份证据模板

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId |  |
| backupTime |  |
| backupPurpose |  |
| environment |  |
| operatorRole |  |
| releaseVersion |  |
| migrationVersion |  |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize |  |
| databaseBackupHash |  |
| attachmentSnapshot |  |
| storageLocationAlias |  |
| encryptionEnabled |  |
| retentionPolicy |  |

只记录 alias、hash、大小和状态；不要记录真实下载链接、access key、dump 内容或附件原件。

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus |  |
| restoreTarget |  |
| restoreMigrationVersion |  |
| smokeQueryStatus |  |
| webSmokeStatus |  |
| verifiedAt |  |

## 结论

- [ ] 备份可用于本次发布 / migration 回滚。
- [ ] 备份存在缺陷，不得作为唯一回滚依据。
