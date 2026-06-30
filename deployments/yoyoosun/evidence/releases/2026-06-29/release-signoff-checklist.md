# yoyoosun Release Sign-off / 发布签收检查模板

## 结论字段

| 字段 | 值 |
| --- | --- |
| releaseVersion | 20260629T0802-draft |
| environment | 待填写，必须与 release-evidence.md 一致 |
| backupId | 待填写，必须与 release-evidence.md 和 backup-evidence.md 一致 |
| releaseConclusion | 待填写，可选 customer-trial-approved / internal-only / rollback-or-forward-fix |
| deploymentOperator | 待填写 |
| evidenceReviewer | 待填写 |
| customerOrBusinessConfirmation | 待填写；内部验证可写 not-required-internal-only，客户试用必须记录确认渠道或受控记录编号 |

## 必选确认

- [ ] pre-migration backup evidence verified
- [ ] known limitations reviewed
- [ ] migration status recorded and reviewed
- [ ] smoke report reviewed
- [ ] customer-visible scope reviewed

## 边界

- 本模板只记录发布 evidence 复核结论，不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图。
- customer-trial-approved 只表示本次 release 可继续客户试用，不等于客户最终验收、真实导入完成或完整业务交付。
- internal-only 表示只能内部验证，不能对客户开放。
- rollback-or-forward-fix 表示当前 release 不可继续使用，必须回滚或 forward-fix。
