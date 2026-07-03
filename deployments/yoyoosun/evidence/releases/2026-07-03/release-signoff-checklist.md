# yoyoosun Release Sign-off / 发布签收检查模板

## 结论字段

| 字段 | 值 |
| --- | --- |
| releaseVersion | yoyoosun-20260703-c298a2a3-amd64 |
| environment | customer-trial-133 |
| backupId | plush-yoyoosun-20260703T1315-c298a2a3-pre-migration |
| releaseConclusion | internal-only |
| deploymentOperator | codex-local-build-133-deploy |
| evidenceReviewer | codex-release-gate |
| customerOrBusinessConfirmation | not-required-internal-only |

## 必选确认

- [x] pre-migration backup evidence verified
- [x] known limitations reviewed
- [x] migration status recorded and reviewed
- [x] smoke report reviewed
- [x] customer-visible scope reviewed

## 边界

- 本模板只记录发布 evidence 复核结论，不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图。
- `customer-trial-approved` 只表示本次 release 可继续客户试用，不等于客户最终验收、真实导入完成或完整业务交付。
- `internal-only` 表示只能内部验证，不能对客户开放。
- `rollback-or-forward-fix` 表示当前 release 不可继续使用，必须回滚或 forward-fix。
