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
| beforeVersion |  |
| afterVersion |  |
| pendingBefore |  |
| pendingAfter |  |
| dirtyState |  |

## 命令摘要

```text
sh migrate_online.sh --status-only
sh migrate_online.sh --apply
```

不要记录完整 DSN、密码或客户业务数据明细。

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
