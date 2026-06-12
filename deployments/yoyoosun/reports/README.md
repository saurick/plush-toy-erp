# yoyoosun 运行报告 / Runtime Reports

本目录用于放可提交的脱敏报告或报告样例，例如：

- `latest-preflight-report.json`
- `latest-smoke-test-report.json`
- `latest-backup-restore-report.json`
- `latest-weekly-inspection-report.json`

真实报告提交前必须确认：

- 不包含真实 secret、完整 DSN、token、cookie 或 Authorization header。
- 不包含客户 raw rows、未脱敏截图、完整日志或备份文件。
- 只保留版本、hash、状态、数量摘要和脱敏失败原因。

本目录不保存数据库 dump、附件原件、真实 `.env` 或客户原始文件。
