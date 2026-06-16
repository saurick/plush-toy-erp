# yoyoosun Evidence 说明 / Evidence Guide

本目录保存 yoyoosun 私有化部署的脱敏 evidence 模板和发布记录。Evidence 用于证明某次发布、migration、备份恢复或 smoke 的输入、输出和结果，而不是保存真实数据本体。

## 可以记录

- release version、Git commit、image digest。
- migration before / after version。
- env、客户配置和菜单配置 fingerprint。
- backup id、大小、hash、存储位置 alias。
- smoke 项目、状态、时间和脱敏失败原因。
- known limitations、acceptance checklist 和操作人角色。

## 禁止记录

- 真实 `.env`、密码、token、SSH key、证书私钥。
- 数据库 dump、备份文件、附件原件。
- 客户 raw Excel / PDF / JPG / PNG。
- 未脱敏截图、完整客户日志、客户敏感订单明细。
- 完整 DSN 或长期有效下载链接。

## 模板

- `releases/release-evidence-template.md`
- `releases/release-signoff-checklist-template.md`
- `migrations/migration-evidence-template.md`
- `backups/backup-evidence-template.md`
- `smoke/smoke-test-report.example.json`

真实发布记录建议放在 `evidence/releases/<YYYY-MM-DD>/`，提交前必须确认脱敏。

发布 evidence 草稿可用资料包脚本生成：

```bash
bash deployments/yoyoosun/scripts/collect-evidence.sh \
  --release-version <release-version> \
  --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

客户试用或交付前必须再运行 release evidence gate，确认 release、pre-migration backup、migration、smoke 和 sign-off 字段都不是模板占位：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```
