# yoyoosun Rollback / Forward-fix Plan / 回滚与前向修复计划模板

## 基本信息

| 字段 | 值 |
| --- | --- |
| rollbackDecision | 待填写，可选 `rollback-ready` / `forward-fix-ready` / `rollback-or-forward-fix-ready` |
| rollbackTrigger | 待填写，例如 health check failed / migration failed / smoke failed / business confirmation rejected |
| rollbackTargetRelease | 待填写，记录上一稳定 release 或可回退 revision |
| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |
| forwardFixOwner | 待填写 |
| verificationAfterRollback | 待填写，例如 healthz / readyz / web smoke / customer_config.get_effective_session / release evidence review |

## 必选确认

- [ ] rollback target identified
- [ ] forward-fix owner assigned
- [ ] post-action smoke scope defined

## 边界

- 本模板只记录脱敏的处置计划，不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图。
- `rollback-ready` 表示已识别可回退目标和回退 runbook，不等于已经执行生产回滚。
- `forward-fix-ready` 表示已明确前向修复责任人和验证范围，不等于缺陷已经修复。
- `rollback-or-forward-fix-ready` 表示两条处置路径都已具备最小计划，实际选择仍以目标环境证据和业务确认决定。
