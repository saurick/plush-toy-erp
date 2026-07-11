# yoyoosun Rollback / Forward-fix Plan / 回滚与前向修复计划

## 基本信息

| 字段 | 值 |
| --- | --- |
| rollbackDecision | rollback-or-forward-fix-ready |
| rollbackTrigger | health / readiness / migration / PDF / authenticated smoke / business confirmation failure |
| rollbackTargetRelease | yoyoosun-20260711-71144182-amd64 |
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |
| forwardFixOwner | codex-local-build-133-deploy |
| verificationAfterRollback | healthz / readyz / Chromium exact pin / authenticated PDF / RBAC / data lifecycle counts / evidence review |

## 必选确认

- [x] rollback target identified
- [x] forward-fix owner assigned
- [x] post-action smoke scope defined
- [x] previous server and web image IDs remain present on 133.
- [x] pre-deploy backup ID, hash and isolated restore have been verified.
- [x] rollback env change scope is limited to APP_IMAGE / WEB_IMAGE plus Compose restart.
- [x] no reverse migration is needed because migrationBefore equals migrationAfter (20260710150001).
- [x] post-action smoke and evidence review scope is defined.

## 边界

- 本计划只证明回滚点、受控步骤和验证范围就绪；本次发布健康，因此未实际切回旧版本。
- 禁止删除 volume、数据库目录、正式 env、上传目录、证书或当前与上一版镜像。
