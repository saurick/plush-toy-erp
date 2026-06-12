# yoyoosun 发布记录 / Release Evidence

每次发布创建一个日期目录：

```text
evidence/releases/<YYYY-MM-DD>/
```

建议包含：

- `release-evidence.md`
- `image-digests.txt`
- `migration-status.txt`
- `config-fingerprint.txt`
- `smoke-test-report.json`
- `security-scan-report.json`
- `backup-restore-report.json`
- `known-limitations.md`
- `acceptance-checklist.md`

所有内容必须脱敏；真实备份、真实 `.env` 和客户 raw files 不放本目录。
