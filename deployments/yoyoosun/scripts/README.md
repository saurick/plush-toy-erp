# yoyoosun 部署辅助脚本 / Deployment Helper Scripts

本目录只放 yoyoosun 部署资料包的薄脚本。通用部署、备份、恢复、导入和 QA 逻辑仍应放在仓库级 `scripts/` 或 `server/deploy/compose/prod` 主路径中。

| 脚本                              | 用途                                                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify-env.sh`                   | 校验 env 样例或受控 `.env` 的必需变量和危险配置                                                                                                                                                                                                                                             |
| `run-smoke.sh`                    | 按 profile 输出脱敏 JSON：`base-release` 只做运行身份、health / ready 和基础页面；`customer-trial-acceptance` 才增加账号、SMS、PDF 和客户配置读回；支持 `--print-input-template` 只读输出输入模板 |
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
  --profile customer-trial-acceptance \
  --endpoint https://erp.example.invalid \
  --backend-url http://127.0.0.1:8300 \
  --product-commit <40-character-lowercase-git-sha> \
  --migration-version <14-digit-atlas-version> \
  --credential-operation-id <lowercase-uuid-v4> \
  --deployment-target demo-133 \
  --environment demo-133 \
  --report output/yoyoosun-smoke.json \
  --admin-username admin \
  --admin-password-env MANUAL_ACCEPTANCE_ADMIN_PASSWORD \
  --uat-password-env MANUAL_ACCEPTANCE_UAT_PASSWORD \
  --customer-config-revision <approved-runtime-revision> \
  --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN
bash deployments/yoyoosun/scripts/collect-evidence.sh --deployment-target demo-133 --profile customer-trial-acceptance --release-id <release-id> --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
bash scripts/deploy/production-preflight.sh \
  --profile customer-trial-acceptance \
  --deployment-target demo-133 \
  --env-file /home/simon/plush-toy-erp-demo-v1/runtime/.env.demo-133 \
  --compose-dir server/deploy/compose/prod \
  --compose-override server/deploy/compose/prod/compose.demo-133.yml \
  --runtime \
  --expected-release <40-character-lowercase-git-sha> \
  --out deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.json
node scripts/deploy/image-digests-evidence.mjs \
  --server-image <server-image-ref> \
  --server-digest sha256:<64-hex> \
  --web-image <web-image-ref> \
  --web-digest sha256:<64-hex> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-id <release-id> \
    --environment <environment> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --deployment-target demo-133 --profile customer-trial-acceptance --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

133 凭据合同是 `deployments/yoyoosun/env/credential.contract.json`，只登记 `demo-133` 与 `customer-test-133`。两目标稳定 `admin` 使用同一份固定测试凭据；demo 另外轮换合同列出的 11 个 `uat_*` 岗位账号，验收登录矩阵共 12 个身份；test 只轮换并登录 admin，同时证明非管理员 `id/username` 集合未变化，不读取或改写其密码。该轮换和登录矩阵只属于 `customer-trial-acceptance`，普通 `base-release` 不执行。

`--print-input-template` 只输出目标 smoke 所需 endpoint、backend URL、`productCommit`、environment、report 及所选 profile 的输入名，不触网、不读取 token、不写 smoke report。

`--endpoint` 和 `--backend-url` 不允许携带 URL 账号密码。`base-release` 需要后端与 Web 的运行身份、health / ready 和基础页面；`customer-trial-acceptance` 在此基础上才读取合同账号、SMS、管理员 token，验证真实 PDF 与已激活客户配置 revision。报告不保存密码、token、手机号、HTML、PDF 正文或完整响应。

`image-digests-evidence.mjs` 只写脱敏 `image-digests.txt`，不构建镜像、不访问 registry、不读取 `.env`。恢复演练输出默认位于 `output/`；写入 evidence 时只复制脱敏报告和迁移状态，不复制 dump。`command-summary.txt` 绑定同一 `backupId / releaseId / sourceAlias / restoreTarget`。真实 `.env`、备份、证书私钥和 raw customer files 不得放入本目录。
