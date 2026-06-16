# yoyoosun 发布记录 / Release Evidence

每次发布创建一个日期目录：

```text
evidence/releases/<YYYY-MM-DD>/
```

建议包含：

- `release-evidence.md`
- `backup-evidence.md`
- `image-digests.txt`
- `migration-status.txt`
- `config-fingerprint.txt`
- `smoke-test-report.json`
- `security-scan-report.json`
- `backup-restore-report.json`
- `known-limitations.md`
- `release-signoff-checklist.md`
- `acceptance-checklist.md`

所有内容必须脱敏；真实备份、真实 `.env` 和客户 raw files 不放本目录。

客户试用或交付前必须执行：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该 gate 只检查已脱敏 evidence 是否填齐；不会读取真实备份文件、真实 `.env` 或客户原始数据。
