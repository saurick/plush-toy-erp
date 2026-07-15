# yoyoosun Evidence 说明 / Evidence Guide

本目录保存 yoyoosun 私有化部署的脱敏 evidence 模板和发布记录。Evidence 用于证明某次发布、migration、备份恢复或 smoke 的输入、输出和结果，而不是保存真实数据本体。

## 可以记录

- release version、Git commit、image digest。
- production preflight 脱敏结果，不保存真实 `.env` 或 secret。
- migration before / after version。
- env、客户配置和菜单配置 fingerprint。
- backup id、大小、hash、存储位置 alias。
- 备份恢复演练状态、恢复目标 alias、命令摘要 alias、备份大小 / hash、migration status、pending files 和 smoke query 状态。
- smoke 项目、状态、时间、公网 endpoint alias、后端 endpoint alias、可复核 target、URL / path 检查的 HTTP status 和脱敏失败原因；如本次发布激活客户配置 revision，smoke report 还应包含 `jsonrpc:customer_config.get_effective_session` 检查，记录期望 revision、token 来源 env 名和 `responseBodyStored=false`，不保存 token 或响应正文；真实 smoke report 必须有非空 checks，且每条 check 都通过。
- rollback / forward-fix 演练步骤、post-check smoke report 路径、post-check smoke 数量、目标 release alias 和脱敏结论；若本次演练覆盖客户配置激活或回滚，还应记录 post-check `customer-config-effective-session` 读回验证。
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
- `releases/rollback-forward-fix-plan-template.md`
- 每次 release 目录内的 `rollback-rehearsal-report.json` 由 `collect-evidence.sh` 生成占位，真实发布前必须替换为本次演练结果。
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

草稿生成后可以先跑只读 status，判断目录是 `missing / incomplete / draft / ready`，并查看缺失 artifact、gate 错误数量和下一步命令：

```bash
node scripts/deploy/release-evidence-status.mjs \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

status 不执行发布、不读取真实 `.env`、不恢复备份、不跑 migration、不调用后端、不做 smoke，也不执行 rollback / forward-fix；JSON 输出会带 `scope.evidenceOnly=true`、`readyMeaning` 和 `notProvenByThisHelper`，明确 `ready` 只表示该 evidence 目录通过 release evidence gate，不证明 status 脚本执行过真实目标环境发布、migration、smoke、恢复演练或回滚 / 前向修复演练。最终是否可进入客户试用或交付仍以 `release-evidence-gate.mjs` 通过为准。

客户试用或交付前必须先用真实运行时 `.env` 跑 production preflight，并完成一次真实恢复演练和 rollback / forward-fix 演练，再运行 release evidence gate，确认 release、production preflight、pre-migration backup、backup restore、migration、smoke、rollback / forward-fix plan、rollback rehearsal 和 sign-off 字段都不是模板占位，release evidence 的 `gitCommit` 是 7-40 位 Git hash，`serverImageDigest` / `webImageDigest` 是 `sha256:<64-hex>`，同目录 `image-digests.txt` 必须记录同一组 server / web digest 且与 release evidence 一致，backup evidence 本体绑定本次 releaseVersion、environment 和 backupId，且 `migrationVersion` 等于 release 的 `migrationBefore`、`backupTime` 是 ISO 时间、`databaseBackupSize` 是正数、`restoreTestStatus` / `smokeQueryStatus` 是通过态，`migration-status-before-apply.txt` 的 `Current Version` 等于 release 的 `migrationBefore`，migration status 的 `Current Version` 等于 release 的 `migrationAfter` 且 `Pending Files=0`，backup restore 带 `verifiedAt`、`sourceAlias`、`restoreTarget`、当前 evidence 目录内真实存在且不含完整 DSN / secret 的 `artifacts.backupEvidence` / `artifacts.preMigrationStatus` / `artifacts.migrationStatus` / `artifacts.commandSummary` 相对路径、备份大小 / hash、`backup.migrationVersion=migrationBefore`、`restore.migrationBeforeApply=migrationBefore`、`restore.pendingFiles=0`、`restore.restoreMigrationVersion=migrationAfter` 和 smoke 表数量，并且 gate 会解析 backup restore 的 pre / post migration artifact 内容与 release migrationBefore / migrationAfter 一致，也会解析 `artifacts.commandSummary` 的 `backupId / releaseVersion / sourceAlias / restoreTarget / steps`，确认命令摘要绑定同一批次、同一来源、同一恢复目标，并包含 pg_dump、restore、atlas、smoke 脱敏步骤；rollback rehearsal 带非空且全通过的 steps、post-check smoke report 路径和正数 `smokeCheckCount`，其中 `postCheck.smokeReport` 必须指向同一 release evidence 目录内的 `smoke-test-report.json`，且数量必须与该文件 checks 数量一致；如果本次演练覆盖客户配置激活或回滚，rollback rehearsal 还要带 `postCheck.customerConfigEffectiveSession`，证明 post-smoke 已用目标环境 `get_effective_session` 读回同一 revision；smoke checks 非空且全部通过，`endpointAlias` 必须非空，`backendEndpointAlias` 可选但如存在也必须脱敏，二者和每项 URL target 都不能包含 URL 账号密码；如果本次发布激活客户配置 revision，smoke 还要用目标环境 `get_effective_session` 证明 active revision 投影可读回；sign-off 绑定本次 releaseVersion、environment 和 backupId，并且 release / backup / backup restore / smoke / rollback rehearsal / sign-off 使用同一 `releaseVersion` 和 environment，release / backup / backup restore / sign-off 使用同一 `backupId`，backup / backup restore 使用同一 databaseBackupHash：

恢复链跨越 `20260714055504` 时，还必须先在 restored DB 完成 populated upgrade read-only audit；`backup-evidence.md`、backup restore 的 restore / summary 和 `command-summary.txt` 必须同时记录 `populatedUpgradeAuditStatus=passed`，步骤必须包含 read-only audit。release gate 会交叉核对这些字段，不能只靠迁移最终版本或人工备注补证。

恢复链跨越 `20260714055825` 时，还必须在 apply 前完成 customer config cutover read-only audit；上述四处必须同时记录 `customerConfigCutoverAuditStatus=passed`，步骤必须包含 customer config cutover read-only audit。发现遗留流程实例或任务配置 revision 锚点时必须停止并人工治理，恢复脚本不会自动清理生产数据。

```bash
bash scripts/deploy/production-preflight.sh \
  --env-file server/deploy/compose/prod/.env \
  --out deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.txt
```

```bash
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version <release-version> \
    --out output/customers/yoyoosun/backup-restore-rehearsal
```

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

需要给自动化或交接脚本读取 gate 结论时可追加 `--json`；输出会包含 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`，明确 gate 只校验已脱敏证据目录，不执行目标环境发布、migration、smoke、恢复演练、回滚 / 前向修复或客户配置激活。

如果本次发布包含客户配置 revision 激活，还必须用已生成的 runtime manifest 叠加同一份 release evidence 做激活前门禁：

```bash
node scripts/deploy/customer-config-activation-gate.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该门禁只检查 manifest 与发布证据是否可进入激活，不会连接后端、不执行 `activate_customer_config`、不跑 migration、不恢复备份、不导入业务数据；真实恢复演练和目标环境发布仍必须独立完成。

release evidence 目录还必须包含 `customer-config-manifest-evidence.json`，其中 `manifestSha256` 要等于当前 runtime manifest 的 `sha256:<64-hex>`，`manifestPath` / `releaseReport` 只保存仓库相对路径，并声明 `reviewStatus=approved`、`containsSecrets=false`、`containsRawCustomerRows=false`、`containsRawCustomerFiles=false`。这样激活门禁会证明“这份证据”绑定的是“这一份 manifest”，而不是复用一份泛化发布证据；草稿目录如果 release evidence、smoke 或 sign-off 尚未通过，不应写成 `approved`。

生成该文件时使用：

```bash
node scripts/deploy/customer-config-manifest-evidence.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --review-status approved \
  --reviewer <reviewer-name>
```

`--release-report` 可省略；提供时会额外校验 report 里的 `manifestSha256` 与当前 manifest 一致。未传 `--review-status approved` 时脚本默认生成 `draft`，不能通过 activation gate。

发布前或发布后声明“客户配置发布包 ready”时，必须再跑聚合 readiness gate。发布前不带执行报告即可证明 manifest、manifest evidence、release evidence 和 activation gate 同时通过：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

生成执行器报告后，追加 `--release-report`；如果要声明已经执行 publish，再追加 `--require-executed`；如果要声明 active revision 已生效，再追加 `--require-activated`。`--require-activated` 会要求执行器报告里的 `effectiveSessionVerification.status=verified`，也就是 activate 后已读回 `get_effective_session`，并确认 active revision、非空页面投影和字段策略 surface 与 manifest 对齐；同时还会要求本目录的 `smoke-test-report.json` 已包含目标环境 `customer-config-effective-session` 检查，且 revision 与当前 manifest 匹配；执行器报告的 `backendEndpointAlias` 必须与目标 smoke report 的 `backendEndpointAlias` 一致，避免用本地执行报告拼接目标环境 smoke 证据：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --require-activated
```

readiness gate 只聚合脱敏证据和 report，不访问后端、不执行 migration、不恢复备份、不导入业务数据；`--require-executed` 会要求执行器报告写有脱敏 `backendEndpointAlias`，`--require-activated / --require-rollback` 还要求该 endpoint 与目标 smoke report 一致。需要给自动化或交接脚本读取时可追加 `--json`，输出中的 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate` 会明确它没有执行目标发布、migration、恢复、smoke、回滚或 Workflow / Fact 写入。目标 smoke 证据已经存在也仍不能替代目标环境真实发布、恢复演练、smoke 或回滚 / forward-fix 判断。

证据和计划确认后，可用客户配置发布执行器生成 report-only 计划或显式执行 JSON-RPC：

```bash
node scripts/deploy/customer-config-release-execute.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --out output/customers/yoyoosun/customer-config-release
```

真实执行必须额外提供 `--execute`、`--backend-url`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或管理员账号密码，并设置 `CUSTOMER_CONFIG_CONFIRM=PUBLISH_YOYOOSUN_CONFIG` 或 `CUSTOMER_CONFIG_CONFIRM=ACTIVATE_YOYOOSUN_CONFIG`。如果 publish 已成功，只补跑激活时使用 `--activate-only`，避免重复 publish。activate / rollback 执行成功后，执行器会用同一管理员身份调用 `get_effective_session` 并把投影验证写入 report。执行器只走 `customer_config` JSON-RPC，不上传 raw 文件、不直写数据库、不导入业务数据、不替代 migration / smoke / rollback。
