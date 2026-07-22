# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本 | 用途 |
| --- | --- |
| `verify-env.sh` | 校验 env 样例或受控 `.env` 的必需变量和危险配置 |
| `run-smoke.sh` | 对指定 endpoint 执行 health / route / SMS provider capabilities / customer_config effective session 与真实最小 PDF smoke，并输出脱敏 JSON；支持 `--print-input-template` 只读输出目标 smoke 输入模板 |
| `rotate-credentials-133.sh` | 从 `credential.contract.json` 读取登记的固定测试密码；SMS 手机号仅在 Keychain 已人工录入时读取，经 SSH stdin 临时注入 133 镜像内轮换工具；要求发布 / migration / operation id / 备份 hash 精确绑定，只输出脱敏持久回执 |
| `cutover-public-web.sh` | yoyoosun 133 公网前端适配层的 plan-first 切流；先验证候选镜像 release、健康和 provider capabilities，失败自动恢复旧容器且保留回滚点 |
| `collect-evidence.sh` | 生成 release evidence 草稿目录和 backup restore artifact 占位，不采集 secret |
| `verify-backup-restore.sh` | 检查备份恢复 evidence 是否具备必要字段，不处理备份文件本体 |
| `run-backup-restore-rehearsal.sh` | 执行真实 dump -> 临时 PostgreSQL -> restore -> pre-apply status -> populated upgrade audit -> customer config cutover audit -> migration apply / status -> smoke query，并生成本地脱敏 evidence |

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template
bash deployments/yoyoosun/scripts/rotate-credentials-133.sh --help
bash deployments/yoyoosun/scripts/run-smoke.sh \
  --endpoint https://erp.example.invalid \
  --backend-url http://127.0.0.1:8300 \
  --release-version <release-version> \
  --environment customer-trial \
  --report output/yoyoosun-smoke.json \
  --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 \
  --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN
bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <release-version> --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
bash scripts/deploy/production-preflight.sh \
  --env-file server/deploy/compose/prod/.env \
  --runtime \
  --out deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.txt
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

133 凭据真源是 `deployments/yoyoosun/env/credential.contract.json`：该隔离测试目标明确登记 `admin/adminadmin`，固定十个 demo 共用 `12345678`，两者属于公开测试凭据而非 secret；其他 staging / UAT / 生产目标不得复用。SMS 手机号只在人工录入 Keychain 后参与轮换和读回，没有录入时不阻断密码登录矩阵。每次 fresh / restore / rollback 后先完成受控备份，再使用唯一的小写 UUID v4 `operation-id` 运行 `rotate-credentials-133.sh`；命令中断后必须复用同一 operation id，镜像内 durable marker 会返回同一回执而不重复轮换。随后执行正式 `run-smoke.sh`，少于 11/11 真实登录、已配置手机号不一致、合同 hash 漂移或 release gate 缺少 credential matrix 都会失败。

`--print-input-template` 只输出目标 smoke 所需 endpoint、backend URL、releaseVersion、environment、report、客户配置 revision 和 token env 名，不触网、不读取 token、不写 smoke report、不证明 active revision 已读回。

`--endpoint` 和 `--backend-url` 不允许携带 URL 账号密码；如果目标环境需要鉴权，必须走 token env 或受控网络入口，不能把 `https://user:pass@host` 写进 smoke evidence。`--backend-url` 用于目标环境后端 `/healthz`、`/readyz`、JSON-RPC 和 `/templates/render-pdf` 检查；未提供时脚本只检查公网 endpoint 的 web health、登录页和岗位端路由，这种 web-only 输出只是诊断证据，不能作为正式 release evidence。`--customer-config-revision` 只在本次发布已经激活客户配置 revision 时使用；脚本会用指定 token env 调用 `customer_config.get_effective_session`，确认 active revision、source、非空页面投影和 `customers.default / suppliers.default / sales_orders.default` 字段策略 surface 可读回，并调用正式 PDF 入口生成最小文档，校验 HTTP 200、`%PDF` 文件头和非空结果。生成的 smoke report 只记录检查目标、期望 revision、token 来源环境变量名、PDF 大小 / hash 和 `responseBodyStored=false`；临时响应随即删除，不保存 token、HTML 或 PDF 正文。正式 evidence 还必须搭配 `production-preflight.sh --runtime` 报告；release gate 会强制核对运行态 Compose / warmup / Chromium / health-ready 和 PDF 的 `200 / application/pdf / sha256 / sizeBytes / responseBodyStored=false`。

`image-digests-evidence.mjs` 只写脱敏 `image-digests.txt`，并在 `release-evidence.md` 已填 digest 时校验两处一致；它不构建镜像、不访问 registry、不读取 `.env`。恢复演练输出默认位于 `output/`，不纳入 git；脚本要求 `--backup-purpose` 明确是 `pre-migration` / `pre-deploy` / 发布前 / migration 前语义。恢复后会先记录 `migration-status-before-apply.txt`，依次对隔离库运行 populated upgrade 与 customer config cutover read-only audit，两项通过后才执行 `atlas migrate apply` 并生成 release gate 使用的 `migration-status.txt`。提供 `--evidence-dir` 时，脚本只会把脱敏后的 `backup-restore-report.json`、`backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt` 和 `command-summary.txt` 复制到 release evidence 目录，不复制 dump。`backup-restore-report.json` 中的 artifact 路径必须指向当前 release evidence 目录内真实存在的相对路径，并同时记录 `backup.migrationVersion`、`restore.migrationBeforeApply` 和 `restore.restoreMigrationVersion`；跨越 `20260714055504` 时四处 populated audit 状态必须通过，跨越 `20260714055825` 时四处 cutover audit 状态必须通过，步骤必须包含对应 read-only audit。发现 blocker 时必须由人工治理，脚本不自动清理生产数据。`command-summary.txt` 还必须绑定同一 `backupId / releaseVersion / sourceAlias / restoreTarget`，并记录 pg_dump、restore、atlas、smoke 的脱敏步骤。真实生产 `.env`、备份文件、证书私钥和 raw customer files 不得放入本目录。
