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
| backupId |  |

`gitCommit` 填 7-40 位 Git hash；`serverImageDigest` / `webImageDigest` 填 `sha256:<64-hex>`。
同目录必须保留 `image-digests.txt`，其中 `serverImageDigest` / `webImageDigest` 要与本表一致；该文件用于记录从构建、镜像仓库或 `docker image inspect` 得到的脱敏 digest 摘要，不保存 registry token。

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
| preflight |  | production-preflight-report.txt |
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

`backup-restore-report.json` 必须引用当前 release evidence 目录内真实存在的相对路径：

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
| previousReleaseVersion |  |
| previousServerImage |  |
| previousWebImage |  |
| backupId |  |
| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |

## 结论

- [ ] 可以继续客户试用。
- [ ] 只能内部验证，暂不交付客户使用。
- [ ] 必须回滚或 forward-fix。
