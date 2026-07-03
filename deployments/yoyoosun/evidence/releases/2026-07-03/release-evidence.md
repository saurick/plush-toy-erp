# yoyoosun Release Evidence / 发布证据

## 基本信息

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion |  yoyoosun-20260703-c298a2a3-amd64|
| releaseDate | 2026-07-03T05:17:27Z |
| environment |  customer-trial-133|
| operatorRole |  codex-local-build-133-deploy|
| gitCommit |  c298a2a3ba0f13b0ce41a0fe82c9cf5623c4a2e5|
| serverImage |  plush-toy-erp-server:yoyoosun-20260703-c298a2a3-amd64|
| serverImageDigest |  sha256:55f2778c6a71ce10439abaa9e5b4a2f46c971f0f0999a8c28d0e45630304af1d|
| webImage |  plush-toy-erp-web:yoyoosun-20260703-c298a2a3-amd64|
| webImageDigest |  sha256:fe2237235a7585112b1f6041fa3f8b81d33fc5e4b25cfeff70c48667af3e0cbb|
| migrationBefore |  20260612112337|
| migrationAfter |  20260701152057|
| backupId |  plush-yoyoosun-20260703T1315-c298a2a3-pre-migration|

`gitCommit` 填 7-40 位 Git hash；`serverImageDigest` / `webImageDigest` 填 `sha256:<64-hex>`。
同目录必须保留 `image-digests.txt`，其中 `serverImageDigest` / `webImageDigest` 要与本表一致；该文件用于记录从构建、镜像仓库或 `docker image inspect` 得到的脱敏 digest 摘要，不保存 registry token。

## 配置指纹

| 项目 | Hash / 摘要 |
| --- | --- |
| envFingerprint | 133-runtime-env-redacted-preflight-passed |
| customerConfigFingerprint | yoyoosun-customer-config-js-present |
| menuConfigFingerprint | c298a2a3-web-build |
| permissionConfigFingerprint | c298a2a3-server-build |

只记录 hash 或脱敏摘要，不记录真实 secret。

## 执行结果

| 项目 | 结果 | Evidence |
| --- | --- | --- |
| preflight | passed | production-preflight-report.txt |
| image digests | passed | image-digests.txt |
| backup | passed | backup-evidence.md |
| migration | passed | migration-status.txt |
| seed |  |  |
| import dry-run / apply |  |  |
| smoke | passed | smoke-test-report.json |
| security scan |  |  |
| backup restore | passed | backup-restore-report.json |
| rollback rehearsal | passed | rollback-rehearsal-report.json |

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

- 目标 smoke 已验证 web root、客户静态配置、登录页、后端 healthz / readyz 和未登录 customer_config.get_effective_session 边界。
- 未执行 authenticated customer_config.get_effective_session active revision 读回，因为本轮没有提供 `CUSTOMER_CONFIG_ADMIN_TOKEN`；因此签收结论限定为 internal-only。

## 回滚信息

| 字段 | 值 |
| --- | --- |
| previousReleaseVersion | 133-previous-runtime-before-20260703T1312-c298a2a3-p5 |
| previousServerImage | plush-toy-erp-server:20260612T111023Z-6d2a491aaa01-trace-hardening-amd64 |
| previousWebImage | plush-toy-erp-web:20260611T022040-af97b4f-customer-config-amd64 |
| backupId | plush-yoyoosun-20260703T1315-c298a2a3-pre-migration |
| rollbackRunbook | `deployments/yoyoosun/runbooks/03-rollback.md` |

## 结论

- [ ] 可以继续客户试用。
- [x] 只能内部验证，暂不交付客户使用。
- [ ] 必须回滚或 forward-fix。
