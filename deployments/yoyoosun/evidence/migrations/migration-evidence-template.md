# yoyoosun Migration Evidence / 迁移证据模板

## 基本信息

| 字段 | 值 |
| --- | --- |
| releaseVersion |  |
| gitCommit |  |
| environment |  |
| operatorRole |  |
| startedAt |  |
| finishedAt |  |

## 版本

| 项目 | 值 |
| --- | --- |
| migrationBefore |  |
| migrationAfter |  |
| currentVersion |  |
| pendingFiles |  |
| dirtyState |  |

## Release Gate 摘要

下面两行必须与本次 `release-evidence.md` 的 `migrationAfter` 对齐，并可复制为同批次 `migration-status.txt`：

```text
Current Version: 待填写，必须等于 release evidence 的 migrationAfter
Pending Files: 待填写，发布后必须为 0
```

## 命令摘要

```text
sh migrate_online.sh --status-only
sh migrate_online.sh --apply
```

不要记录完整 DSN、密码、migration SQL 全文、客户业务数据明细或 raw rows。

## 输出摘要

```text

```

## 失败与回滚

| 项目 | 值 |
| --- | --- |
| failed |  |
| errorSummary |  |
| rollbackRequired |  |
| backupId |  |
| rollbackEvidence |  |
