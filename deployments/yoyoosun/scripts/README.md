# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本                              | 用途                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-env.sh`                   | 校验 env 样例或受控 `.env` 的必需变量和危险配置                                                                                                                                                                                                                                             |
| `run-smoke.sh`                    | 对指定 endpoint 执行 health / route / SMS provider capabilities / customer_config effective session 与真实最小 PDF smoke，并输出脱敏 JSON；支持 `--print-input-template` 只读输出目标 smoke 输入模板                                                                                        |
| `rotate-credentials-133.sh`       | 按 `demo-133` / `customer-test-133` 从 registry 绑定数据库、根目录、Compose 与 runtime env；持有目标锁后先自行生成、隔离恢复校验并原子保留 operation-bound 备份，再执行目标特定轮换；两目标 admin 使用同一合同凭据，demo 另轮换精确 `uat_*` allowlist 并按需绑定 SMS，test 只轮换 admin 并读回其余账号不变；只经 SSH stdin 注入所需变量并输出脱敏回执 |
| `cutover-public-web.sh`           | yoyoosun 133 公网前端适配层的 plan-first 切流；先验证候选镜像 release、健康和 provider capabilities，失败自动恢复旧容器且保留回滚点                                                                                                                                                         |
| `collect-evidence.sh`             | 生成 release evidence 草稿目录和 backup restore artifact 占位，不采集 secret                                                                                                                                                                                                                |
| `verify-backup-restore.sh`        | 检查备份恢复 evidence 是否具备必要字段，不处理备份文件本体                                                                                                                                                                                                                                  |
| `run-backup-restore-rehearsal.sh` | 执行真实 dump -> 临时 PostgreSQL -> restore -> pre-apply status -> populated upgrade audit -> customer config cutover audit -> migration apply / status -> smoke query，并生成本地脱敏 evidence                                                                                             |

日常备份不在客户目录复制通用实现：使用仓库级 `scripts/deploy/scheduled-postgres-backup.sh` 每日生成校验过的本地与异地副本，再用 `scripts/deploy/verify-scheduled-postgres-backup.sh` 每周从异地目录恢复到临时 PostgreSQL。目标机安装入口见 [`../systemd/README.md`](../systemd/README.md)。业务附件正文当前存于 PostgreSQL，不需要另备份一个不存在的运行时附件目录。

示例：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --example
bash deployments/yoyoosun/scripts/run-smoke.sh --print-input-template
bash deployments/yoyoosun/scripts/rotate-credentials-133.sh --help
bash deployments/yoyoosun/scripts/run-smoke.sh \
  --endpoint https://erp.example.invalid \
  --backend-url http://127.0.0.1:8300 \
  --release-version <40-character-lowercase-git-sha> \
  --migration-version <14-digit-atlas-version> \
  --credential-operation-id <lowercase-uuid-v4> \
  --deployment-target demo-133 \
  --environment demo-133 \
  --report output/yoyoosun-smoke.json \
  --admin-username admin \
  --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD \
  --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD \
  --customer-config-revision yoyoosun-customer-package-v7.runtime-manifest-v1 \
  --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN
bash deployments/yoyoosun/scripts/collect-evidence.sh --deployment-target demo-133 --release-version <release-version> --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
bash scripts/deploy/production-preflight.sh \
  --deployment-target demo-133 \
  --env-file /home/simon/plush-toy-erp-demo-v1/runtime/.env.demo-133 \
  --compose-dir server/deploy/compose/prod \
  --compose-override server/deploy/compose/prod/compose.demo-133.yml \
  --runtime \
  --expected-release <40-character-lowercase-git-sha> \
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
    --environment <environment> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --deployment-target demo-133 --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

133 凭据合同是 `deployments/yoyoosun/env/credential.contract.json`，只登记 `demo-133` 与 `customer-test-133`。两目标稳定 `admin` 使用同一份固定测试凭据；demo 另外轮换合同精确列出的十个 `uat_*` 岗位账号，test 不接收岗位密码并在同一事务锁内证明非管理员 `id/username` 身份集合在 admin 轮换前后完全不变。凭据不进入服务器 steady `.env`，也不接受外部密码覆盖。SMS 身份只属于 demo，且仅在发布工作站 Keychain 已人工录入时参与轮换和读回。每次 create / restore / promotion / rollback 后，使用唯一的小写 UUID v4 `operation-id` 和绑定 deployment target 的确认串运行 `rotate-credentials-133.sh`；该闭包在 mutation 前自行创建 `pre-credential-rotation-<sha12>-<operation-id>` 备份，完成 archive list、隔离恢复、migration 与非空表校验后才原子发布并轮换。调用者不能传入备份路径或 hash；脱敏回执只保留 exact alias、SHA-256、正数 size 与 `restoreChecked=true`。只有 exact 备份与 durable marker 已成对存在时，才允许复用同一 operation id，并重新完成恢复校验后由 marker 返回同一脱敏回执而不重复轮换。如果中断只留下备份而没有 marker，必须保留该备份并用新 UUID 发起新的受控操作，让新备份绑定当下 live state；marker 存在但 exact 备份缺失则停止并先恢复 operation evidence，禁止猜测续跑或删除半状态。demo 后续执行 admin + 十岗位真实登录矩阵；test 只验证 admin 登录及非管理员账号保持不变，不读取、猜测或改写 test 非管理员密码。

`--print-input-template` 只输出目标 smoke 所需 endpoint、backend URL、releaseVersion、environment、report、客户配置 revision 和 token env 名，不触网、不读取 token、不写 smoke report、不证明 active revision 已读回。

`--endpoint` 和 `--backend-url` 不允许携带 URL 账号密码；如果目标环境需要鉴权，必须走 token env 或受控网络入口，不能把 `https://user:pass@host` 写进 smoke evidence。公网 endpoint 会同时检查 Web `/healthz` 和 `/readyz`；`--backend-url` 用于目标环境后端 `/healthz`、`/readyz`、JSON-RPC 和 `/templates/render-pdf` 检查。未提供后端地址时，脚本只能得到 Web 进程、Web 到后端的就绪联动、登录页和岗位端路由证据，这种 web-only 输出仍只是诊断证据，不能作为正式 release evidence。管理员 token 与客户配置 revision 分开控制两项证据：只提供 `--admin-token-env` 时可在激活前独立生成最小 PDF，校验 HTTP 200、`%PDF` 文件头和非空结果，但不得冒充 candidate revision 已生效；`--customer-config-revision` 只在本次发布已经激活该 revision 后使用，脚本再用同一 token 调用 `customer_config.get_effective_session`，确认 active revision、source、非空页面投影和 `customers.default / suppliers.default / sales_orders.default` 字段策略 surface 可读回。生成的 smoke report 只记录检查目标、期望 revision、token 来源环境变量名、PDF 大小 / hash 和 `responseBodyStored=false`；临时响应随即删除，不保存 token、HTML 或 PDF 正文。正式 evidence 还必须搭配 `production-preflight.sh --runtime` 报告；release gate 会强制核对运行态 Compose / warmup / Chromium / health-ready 和 PDF 的 `200 / application/pdf / sha256 / sizeBytes / responseBodyStored=false`。

`image-digests-evidence.mjs` 只写脱敏 `image-digests.txt`，并在 `release-evidence.md` 已填 digest 时校验两处一致；它不构建镜像、不访问 registry、不读取 `.env`。恢复演练输出默认位于 `output/`，不纳入 git；脚本要求 `--backup-purpose` 明确是 `pre-migration` / `pre-deploy` / 发布前 / migration 前语义。恢复后会先记录 `migration-status-before-apply.txt`，依次对隔离库运行 populated upgrade 与 customer config cutover read-only audit，两项通过后才执行 `atlas migrate apply` 并生成 release gate 使用的 `migration-status.txt`。提供 `--evidence-dir` 时，脚本只会把脱敏后的 `backup-restore-report.json`、`backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt` 和 `command-summary.txt` 复制到 release evidence 目录，不复制 dump。`backup-restore-report.json` 中的 artifact 路径必须指向当前 release evidence 目录内真实存在的相对路径，并同时记录 `backup.migrationVersion`、`restore.migrationBeforeApply` 和 `restore.restoreMigrationVersion`；跨越 `20260714055504` 时四处 populated audit 状态必须通过，跨越 `20260714055825` 时四处 cutover audit 状态必须通过，步骤必须包含对应 read-only audit。发现 blocker 时必须由人工治理，脚本不自动清理生产数据。`command-summary.txt` 还必须绑定同一 `backupId / releaseVersion / sourceAlias / restoreTarget`，并记录 pg_dump、restore、atlas、smoke 的脱敏步骤。真实生产 `.env`、备份文件、证书私钥和 raw customer files 不得放入本目录。
