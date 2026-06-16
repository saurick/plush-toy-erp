# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本 | 用途 |
| --- | --- |
| `verify-env.sh` | 校验 env 样例或受控 `.env` 的必需变量和危险配置 |
| `run-smoke.sh` | 对指定 endpoint 执行轻量 health / route smoke，并输出脱敏 JSON |
| `collect-evidence.sh` | 生成 release evidence 草稿目录，不采集 secret |
| `verify-backup-restore.sh` | 检查备份恢复 evidence 是否具备必要字段，不处理备份文件本体 |
| `run-backup-restore-rehearsal.sh` | 执行真实 dump -> 临时 PostgreSQL -> restore -> migration status / smoke query，并生成本地脱敏 evidence |

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
bash deployments/yoyoosun/scripts/run-smoke.sh --endpoint https://erp.example.invalid --report output/yoyoosun-smoke.json
bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <release-version> --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version <release-version> \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

恢复演练输出默认位于 `output/`，不纳入 git；如需放入 release evidence，只复制脱敏后的 `backup-restore-report.json`、`backup-evidence.md` 和 `migration-status.txt`。真实生产 `.env`、备份文件、证书私钥和 raw customer files 不得放入本目录。
