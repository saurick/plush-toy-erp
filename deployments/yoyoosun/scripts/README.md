# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本 | 用途 |
| --- | --- |
| `verify-env.sh` | 校验 env 样例或受控 `.env` 的必需变量和危险配置 |
| `run-smoke.sh` | 对指定 endpoint 执行轻量 health / route / customer_config effective session smoke，并输出脱敏 JSON |
| `collect-evidence.sh` | 生成 release evidence 草稿目录和 backup restore artifact 占位，不采集 secret |
| `verify-backup-restore.sh` | 检查备份恢复 evidence 是否具备必要字段，不处理备份文件本体 |
| `run-backup-restore-rehearsal.sh` | 执行真实 dump -> 临时 PostgreSQL -> restore -> migration apply / status -> smoke query，并生成本地脱敏 evidence |

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
bash deployments/yoyoosun/scripts/run-smoke.sh \
  --endpoint https://erp.example.invalid \
  --backend-url http://127.0.0.1:8300 \
  --release-version <release-version> \
  --environment customer-trial \
  --report output/yoyoosun-smoke.json \
  --customer-config-revision yoyoosun-customer-package-v1.runtime-manifest-v1 \
  --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN
bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <release-version> --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
node scripts/deploy/image-digests-evidence.mjs \
  --server-image <server-image-ref> \
  --server-digest sha256:<64-hex> \
  --web-image <web-image-ref> \
  --web-digest sha256:<64-hex> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version <release-version> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

`--endpoint` 和 `--backend-url` 不允许携带 URL 账号密码；如果目标环境需要鉴权，必须走 token env 或受控网络入口，不能把 `https://user:pass@host` 写进 smoke evidence。`--backend-url` 用于目标环境后端 `/healthz`、`/readyz` 和 JSON-RPC 检查；未提供时脚本只检查公网 endpoint 的 web health、登录页和岗位端路由。`--customer-config-revision` 只在本次发布已经激活客户配置 revision 时使用；脚本会用指定 token env 调用 `customer_config.get_effective_session`，确认 active revision、source、非空页面投影和 `customers.default / suppliers.default / sales_orders.default` 字段策略 surface 可读回。生成的 smoke report 只记录检查目标、期望 revision、token 来源环境变量名和 `responseBodyStored=false`，不保存 token 或响应正文。

`image-digests-evidence.mjs` 只写脱敏 `image-digests.txt`，并在 `release-evidence.md` 已填 digest 时校验两处一致；它不构建镜像、不访问 registry、不读取 `.env`。恢复演练输出默认位于 `output/`，不纳入 git；脚本要求 `--backup-purpose` 明确是 `pre-migration` / `pre-deploy` / 发布前 / migration 前语义。恢复后会先记录 `migration-status-before-apply.txt`，再对隔离库执行 `atlas migrate apply` 并生成 release gate 使用的 `migration-status.txt`。提供 `--evidence-dir` 时，脚本只会把脱敏后的 `backup-restore-report.json`、`backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt` 和 `command-summary.txt` 复制到 release evidence 目录，不复制 dump。`backup-restore-report.json` 中的 artifact 路径必须指向当前 release evidence 目录内真实存在的相对路径，并同时记录 `backup.migrationVersion`、`restore.migrationBeforeApply` 和 `restore.restoreMigrationVersion`；`command-summary.txt` 必须绑定同一 `backupId / releaseVersion / sourceAlias / restoreTarget`，并记录 pg_dump、restore、atlas、smoke 的脱敏步骤。真实生产 `.env`、备份文件、证书私钥和 raw customer files 不得放入本目录。
