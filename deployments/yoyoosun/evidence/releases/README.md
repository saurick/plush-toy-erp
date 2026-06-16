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

所有内容必须脱敏；真实备份、真实 `.env` 和客户 raw files 不放本目录。`backup-restore-report.json` 应来自一次真实恢复演练，至少证明备份已生成、已恢复到隔离库、migration status 正常、smoke query 通过。

客户试用或交付前必须执行：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该 gate 只检查已脱敏 evidence 是否填齐且 `backup-restore-report.json` 声明真实恢复演练通过；不会读取真实备份文件、真实 `.env` 或客户原始数据。
