# yoyoosun Release Evidence / 发布证据

## 基本信息

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | yoyoosun-20260711-20c96d38-amd64 |
| releaseDate | 2026-07-11T05:45:00Z |
| environment | customer-trial-133 |
| operatorRole | codex-local-build-133-deploy |
| gitCommit | 20c96d3819429361a35d2551b63b211f055de37e |
| serverImage | plush-toy-erp-server:yoyoosun-20260711-20c96d38-amd64 |
| serverImageDigest | sha256:dcd886ecae24e9b8abbdfee5b19e4d6261c1002ff18cebf9d3b823a600d11678 |
| webImage | plush-toy-erp-web:yoyoosun-20260711-20c96d38-amd64 |
| webImageDigest | sha256:53a926c1b64290b505e07049f362b9bc0300ed1bc8a4c775a718373c23740e91 |
| migrationBefore | 20260710150001 |
| migrationAfter | 20260710150001 |
| backupId | predeploy-20c96d38-20260711T052623Z |

## 配置指纹

| 项目 | Hash / 摘要 |
| --- | --- |
| envFingerprint | 133-runtime-env-redacted-production-preflight-passed |
| customerConfigFingerprint | sha256:2cf5289cc48eb2be17146ba3fed9281d0cd31a60c448f1783ec8efd908b953a7 |
| menuConfigFingerprint | git:20c96d3819429361a35d2551b63b211f055de37e |
| permissionConfigFingerprint | git:20c96d3819429361a35d2551b63b211f055de37e |

## 执行结果

| 项目 | 结果 | Evidence |
| --- | --- | --- |
| preflight | passed | production-preflight-report.txt |
| image digests | passed | image-digests.txt |
| backup | passed | backup-evidence.md |
| migration | passed | migration-status.txt |
| seed | not-run-existing-trial-data-preserved | data-lifecycle-counts.txt |
| import dry-run / apply | not-run-no-real-customer-import | known-limitations.md |
| smoke | passed | smoke-test-report.json |
| RBAC / browser | passed | trial-account-rbac-report.json / trial-demo-account-browser-smoke-report.json |
| PDF runtime | passed | pdf-second-runtime-smoke.json / production-preflight-report.txt |
| backup restore | passed | backup-restore-report.json |
| rollback rehearsal | passed | rollback-rehearsal-report.json |

## 已知限制

- 本结论是 customer-trial-approved / 133 技术试用 GO，不等于客户最终验收、真实客户数据导入完成或完整业务交付。
- 试用数据为一眼可懂的模拟业务数据；本次发布未导入客户真实数据，也未为验证新增无必要业务事实。
- 本次未重复发送真实短信，仅以运行态 capabilities 和受控配置确认阿里云 provider 已启用、mock=false、无 mock fallback。
- 未为多角色动作验证临时修改账号或流程配置；以固定 revision 自动化测试、10 账号真实 RBAC、9 岗位端浏览器 smoke、1 拒绝态和真实 sales 角色 Workflow smoke 收口。

## 回滚信息

| 字段 | 值 |
| --- | --- |
| previousReleaseVersion | yoyoosun-20260711-71144182-amd64 |
| previousServerImage | plush-toy-erp-server:yoyoosun-20260711-71144182-amd64 |
| previousWebImage | plush-toy-erp-web:yoyoosun-20260711-71144182-amd64 |
| backupId | predeploy-20c96d38-20260711T052623Z |
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |

## 结论

- [x] customer-trial-approved / 133 技术试用 GO。
- [ ] 客户最终验收完成。
- [ ] 真实客户数据导入完成。
- [ ] 必须回滚或 forward-fix。
