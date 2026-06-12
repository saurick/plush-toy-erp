# yoyoosun Release Evidence / 发布证据模板

## 基本信息

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion |  |
| releaseDate |  |
| environment |  |
| operatorRole |  |
| gitCommit |  |
| serverImage |  |
| serverImageDigest |  |
| webImage |  |
| webImageDigest |  |
| migrationBefore |  |
| migrationAfter |  |

## 配置指纹

| 项目 | Hash / 摘要 |
| --- | --- |
| envFingerprint |  |
| customerConfigFingerprint |  |
| menuConfigFingerprint |  |
| permissionConfigFingerprint |  |

只记录 hash 或脱敏摘要，不记录真实 secret。

## 执行结果

| 项目 | 结果 | Evidence |
| --- | --- | --- |
| preflight |  |  |
| backup |  |  |
| migration |  |  |
| seed |  |  |
| import dry-run / apply |  |  |
| smoke |  |  |
| security scan |  |  |
| backup restore |  |  |

## 已知限制

- 待填写。

## 回滚信息

| 字段 | 值 |
| --- | --- |
| previousReleaseVersion |  |
| previousServerImage |  |
| previousWebImage |  |
| backupId |  |
| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |

## 结论

- [ ] 可以继续客户试用。
- [ ] 只能内部验证，暂不交付客户使用。
- [ ] 必须回滚或 forward-fix。
