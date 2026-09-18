# yoyoosun Release Evidence / 发布证据模板

## 基本信息

| 字段 | 值 |
| --- | --- |
| evidenceContract | plush.release-evidence/v1 |
| recoveryProcedureChanged | true |
| customerCode | yoyoosun |
| releaseId |  |
| releaseDate |  |
| environment |  |
| operatorRole |  |
| productCommit |  |
| serverImage |  |
| serverImageDigest |  |
| webImage |  |
| webImageDigest |  |
| migrationBefore |  |
| migrationAfter |  |
| backupId |  |

`productCommit` 填完整 40 位小写 Git SHA；`serverImageDigest` / `webImageDigest` 填 `sha256:<64-hex>`。
同目录必须保留 `image-digests.txt`，其中 `serverImageDigest` / `webImageDigest` 要与本表一致；该文件用于记录从构建、镜像仓库或 `docker image inspect` 得到的脱敏 digest 摘要，不保存 registry token。

普通发布仅在 `migrationBefore=migrationAfter` 且已确认备份 / 恢复 / 回滚流程及其配置未变时，将 `recoveryProcedureChanged` 填为 `false`，无需填写本轮恢复与回滚演练项。缺值、变更或客户验收仍要求演练；始终保留发布前备份和固定回滚路径。适用材料见 [发布记录](README.md)。

## 执行结果

| 项目 | 结果 | Evidence |
| --- | --- | --- |
| preflight |  | production-preflight-report.json |
| image digests |  | image-digests.txt |
| backup |  | backup-evidence.md |
| migration |  | migration-status.txt |
| seed |  |  |
| import dry-run / apply |  |  |
| smoke |  | smoke-test-report.json |
| security scan |  |  |
| backup restore |  | backup-restore-report.json |
| rollback rehearsal |  | rollback-rehearsal-report.json |

## Backup Restore Artifacts / 备份恢复证据

本轮需要恢复演练时，`backup-restore-report.json` 必须引用当前 release evidence 目录内真实存在的相对路径：

| Artifact 字段 | 文件 |
| --- | --- |
| `artifacts.backupEvidence` | `backup-evidence.md` |
| `artifacts.preMigrationStatus` | `migration-status-before-apply.txt` |
| `artifacts.migrationStatus` | `migration-status.txt` |
| `artifacts.commandSummary` | `command-summary.txt` |

`migration-status-before-apply.txt` 记录恢复 dump 后、执行 `atlas migrate apply` 前的状态，`migration-status.txt` 记录 apply 后状态。真实 dump、完整 DSN、`.env`、secret 和客户 raw rows 不进入 release evidence 目录。

## 已知限制

- 待填写。

## 回滚信息

| 字段 | 值 |
| --- | --- |
| previousReleaseId |  |
| previousServerImage |  |
| previousWebImage |  |
| backupId |  |
| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |

## 结论

- [ ] 可以继续客户试用。
- [ ] 只能内部验证，暂不交付客户使用。
- [ ] 必须回滚或 forward-fix。
