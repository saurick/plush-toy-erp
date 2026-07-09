# yoyoosun 发布记录 / Release Evidence

每次发布创建一个日期目录：

```text
evidence/releases/<YYYY-MM-DD>/
```

建议包含：

- `release-evidence.md`
- `production-preflight-report.txt`
- `backup-evidence.md`
- `command-summary.txt`
- `migration-status-before-apply.txt`
- `image-digests.txt`
- `migration-status.txt`
- `config-fingerprint.txt`
- `smoke-test-report.json`
- `security-scan-report.json`
- `backup-restore-report.json`
- `customer-config-manifest-evidence.json`（仅当本次发布包含客户配置 revision）
- `known-limitations.md`
- `rollback-forward-fix-plan.md`
- `rollback-rehearsal-report.json`
- `release-signoff-checklist.md`
- `acceptance-checklist.md`

所有内容必须脱敏；真实备份、真实 `.env` 和客户 raw files 不放本目录。`release-evidence.md` 的 `gitCommit` 必须是 7-40 位 Git hash，`serverImageDigest` / `webImageDigest` 必须是 `sha256:<64-hex>`，并且同目录 `image-digests.txt` 必须记录同一组 server / web image digest，gate 会 cross-check 两处一致，避免只填分支名、镜像 tag 或人工备注。`production-preflight-report.txt` 应来自非 `--example` 模式的真实运行时 `.env` preflight 输出；优先用 `production-preflight.sh --out` 直接写入该文件，只保留检查结果，不保存 `.env`、secret、token 或完整 DSN。`backup-evidence.md` 必须绑定本次 `releaseVersion`、`environment` 和 `backupId`，并与 `release-evidence.md` 保持一致；其中 `backupTime` 必须是 ISO 时间戳，`databaseBackupSize` 必须为正数，`migrationVersion` 必须等于 `release-evidence.md` 的 `migrationBefore`，`restoreTestStatus` 和 `smokeQueryStatus` 必须是通过态，证明该备份来自 migration 前状态且已完成基本恢复 / smoke 验证。`migration-status-before-apply.txt` 必须记录恢复 dump 后、执行 `atlas migrate apply` 前的迁移状态，`Current Version` 要等于 `release-evidence.md` 的 `migrationBefore`；`migration-status.txt` 必须包含 `Current Version` 和 `Pending Files`，其中 `Current Version` 要等于 `release-evidence.md` 的 `migrationAfter`，`Pending Files` 必须为 `0`。`smoke-test-report.json` 必须包含非空 `checks`，`endpointAlias` 必须非空，`backendEndpointAlias` 可选但如存在也必须脱敏，`summary.total / passed` 要和 checks 数量一致，每条 check 状态必须为 `pass / passed / ok`，且必须带可复核 `target`；URL 或 path target 还必须带 100-599 的 `httpCode`，并且 endpoint alias 与每项 URL target 都不能包含 URL 账号密码。如果本次发布包含客户配置 revision 激活，smoke report 还应包含 `jsonrpc:customer_config.get_effective_session` 检查，证明目标环境已读回期望 active revision、`active_customer_config_revision` source、非空页面投影和当前运行时字段策略 surface；该检查只保存期望 revision、token 来源 env 名和 `responseBodyStored=false`，且 release gate 会要求同目录 `customer-config-manifest-evidence.json` 存在、revision 与 smoke `expectedRevision` 一致、manifest sha256 合法、审查状态为 approved，并声明未包含 secret / raw customer rows / raw customer files。空 smoke、skipped、带凭据 URL、缺少 manifest evidence 或没有检查目标的 pass 不能当通过。`backup-restore-report.json` 应来自一次真实恢复演练，至少证明备份已生成、已恢复到隔离库、migration status 正常、smoke query 通过，并包含脱敏的 `verifiedAt`、`sourceAlias`、`restoreTarget`、`artifacts.backupEvidence`、`artifacts.preMigrationStatus`、`artifacts.migrationStatus`、`artifacts.commandSummary`、正数 `backup.databaseBackupSize`、合法 `backup.databaseBackupHash`、`backup.migrationVersion=migrationBefore`、`restore.migrationBeforeApply=migrationBefore`、`restore.pendingFiles=0`、`restore.restoreMigrationVersion=migrationAfter` 和正数 `smoke.publicTableCount`；四个 `artifacts.*` 必须是当前 release evidence 目录内的相对路径，且引用文件真实存在，不能写绝对路径、外部目录、完整 DSN 或 secret。gate 还会解析 `artifacts.preMigrationStatus` 的 `Current Version=migrationBefore`、`artifacts.migrationStatus` 的 `Current Version=migrationAfter / Pending Files=0`，以及 `artifacts.commandSummary` 的 `backupId / releaseVersion / sourceAlias / restoreTarget / steps`，确保命令摘要绑定同一批次、同一 source alias 和同一恢复目标，并包含 pg_dump、restore、atlas、smoke 脱敏步骤。`rollback-forward-fix-plan.md` 记录脱敏的回滚 / 前向修复处置路径，不代表已经执行生产回滚；`rollback-rehearsal-report.json` 才记录本次 rollback / forward-fix 演练结果，必须包含非空且全通过的步骤、post-check smoke report 路径、正数 `postCheck.smokeCheckCount` 和脱敏声明，且 `postCheck.smokeReport` 必须指向同一 release evidence 目录内的 `smoke-test-report.json`，`smokeCheckCount` 必须与该文件 checks 数量一致；若演练覆盖客户配置激活或回滚，还必须带 `postCheck.customerConfigEffectiveSession`，证明 post-smoke 已用目标环境 `customer_config.get_effective_session` 读回期望 revision。

客户配置 revision 发布还必须提供 `customer-config-manifest-evidence.json`，用于把 release evidence 绑定到具体 runtime manifest：

```json
{
  "customerKey": "yoyoosun",
  "revision": "yoyoosun-customer-package-v3.runtime-manifest-v1",
  "manifestSha256": "sha256:<64-hex>",
  "manifestPath": "output/customers/yoyoosun/customer-config-runtime-manifest.json",
  "releaseReport": "output/customers/yoyoosun/customer-config-release/customer-config-release-report.json",
  "reviewStatus": "approved",
  "redaction": {
    "containsSecrets": false,
    "containsRawCustomerRows": false,
    "containsRawCustomerFiles": false
  }
}
```

`manifestPath` 和 `releaseReport` 只保存仓库相对路径，不保存本机绝对路径；草稿目录如果 release evidence、smoke 或 sign-off 尚未通过，不应把 `reviewStatus` 写成 `approved`。

推荐由脚本生成，避免手写哈希：

```bash
node scripts/deploy/customer-config-manifest-evidence.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --review-status approved \
  --reviewer <reviewer-name>
```

未传 `--review-status approved` 时脚本默认生成 `draft`，不能通过 activation gate；只有 manifest 已完成人工 review 并且目标 release evidence、smoke、sign-off 也能独立闭环时，才应显式写 approved。

镜像 digest artifact 也应优先由脚本生成，避免手写 `image-digests.txt`：

```bash
node scripts/deploy/image-digests-evidence.mjs \
  --server-image <server-image-ref> \
  --server-digest sha256:<64-hex> \
  --web-image <web-image-ref> \
  --web-digest sha256:<64-hex> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该脚本只写脱敏 `image-digests.txt`，不构建镜像、不访问 registry、不读取 `.env`；如果同目录 `release-evidence.md` 已经填了 server / web digest，会同时校验两处一致。

恢复演练可以直接把脱敏 artifact 写入本目录，避免人工复制错相对路径：

```bash
SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version <release-version> \
    --backup-purpose pre-migration \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp
```

`--evidence-dir` 只复制 `backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json`；dump、真实 `.env`、完整 DSN 和客户 raw files 仍留在受控外部位置或 ignored `output/`，不得进入本目录。

rollback / forward-fix 演练完成且同目录 `smoke-test-report.json` 已记录 post-check 后，用生成器写入本目录的 `rollback-rehearsal-report.json`：

```bash
node scripts/deploy/rollback-rehearsal-report.mjs \
  --environment customer-trial \
  --release-version <release-version> \
  --rehearsal-type rollback-forward-fix \
  --trigger-scenario "<trigger-scenario>" \
  --rollback-target-release <previous-release-version> \
  --step "identify rollback target=pass" \
  --step "verify rollback command path=pass" \
  --step "verify forward-fix owner path=pass" \
  --post-smoke-report smoke-test-report.json \
  --customer-config-revision yoyoosun-customer-package-v3.runtime-manifest-v1 \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该生成器只汇总已完成的演练步骤和 post-smoke report，不执行回滚、不恢复备份、不跑 migration、不调用后端；`--evidence-dir` 必须指向已存在 release evidence 目录，并默认输出同目录 `rollback-rehearsal-report.json`。

客户试用或交付前必须执行：

```bash
node scripts/deploy/release-evidence-status.mjs \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

status 只读当前目录，输出 `missing / incomplete / draft / attention / ready`、closeout evidence checklist / summary / next actions、缺失 artifact、gate 错误数量、下一步命令和 `scope.evidenceOnly / readyMeaning / notProvenByThisHelper` 范围声明；它不创建 evidence、不执行 preflight、不恢复备份、不跑 migration、不调用后端、不做 smoke、不执行 rollback / forward-fix。`attention` 表示 release evidence gate 已通过但 status 发现额外 warning，`ready=false`，`--fail-on-not-ready` 会返回非 0。closeout checklist 会把证据分成不可变版本、production preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复、签收，以及需要时的客户配置 active revision 读回，并标记 `missing / present-unverified / attention / gate-verified`；`closeoutSummary` 会同步统计总项、gate-verified 项、各类 blocker 数和 ready 布尔值，方便机器和人工直接判断还有几组证据未收口；`closeoutNextActions` 会为每个未 gate-verified 的证据组列出下一条命令和人工核对项，草稿 evidence 全部文件已存在但仍未通过 gate 时也会提示 image digest、production preflight、备份恢复 / migration 演练、目标 smoke、rollback / forward-fix、sign-off 和客户配置读回各自下一步；它只是读 evidence 文件，不能替代真实目标动作。status 会把 `migration-status-before-apply.txt` 和 `command-summary.txt` 这类恢复演练支撑 artifact 也纳入缺失判断；缺少这些文件时，下一步命令会提示重新执行带 `--backup-purpose pre-migration` 的恢复演练脚本；缺少 `release-evidence.md`、`rollback-forward-fix-plan.md` 或 `release-signoff-checklist.md` 时，会提示从模板复制草稿，复制后仍必须人工补齐真实 release、environment、git commit、image digest、migration、backupId、处置计划、签收结论和勾选项。若同目录已存在 `customer-config-manifest-evidence.json` 且可读到 revision，缺少 `smoke-test-report.json`，或已有 smoke 但缺少 `customer-config-effective-session` 时，status 会输出 warning，并把 `--customer-config-revision <revision>`、`--backend-url <backend-endpoint>` 和 `--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN` 加入 smoke next command，提醒目标环境 smoke 必须读回 `customer_config.get_effective_session`；如果该 manifest evidence 文件损坏或缺少 revision，status 会输出 warning 并提示重新运行 `customer-config-manifest-evidence.mjs`，不会静默把客户配置发布降级成普通 smoke。若 `smoke-test-report.json` 已经包含 `customer-config-effective-session`，status 还会反查同目录 manifest evidence 是否存在且 revision 与 smoke `expectedRevision` 一致；缺失或不一致时会 warning 并给出重新生成 manifest evidence 的命令，release evidence gate 本身也会拒绝缺失、不匹配或未脱敏审查通过的 `customer-config-manifest-evidence.json`。`ready` 只表示该目录通过 release evidence gate、status 没有发现 warning 且 checklist 已进入 gate-verified，不证明 status 脚本执行过真实目标环境发布、migration、smoke、恢复演练或回滚 / 前向修复演练。只有下面的 release evidence gate 通过且 status 为 ready，才表示脱敏证据包满足客户试用或交付前门禁。

按 `closeoutNextActions` 执行前，先用 closeout plan 检查当前本机是否具备真实输入：

```bash
node scripts/deploy/release-evidence-closeout-plan.mjs \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --runtime-env-file server/deploy/compose/prod/.env \
  --json \
  --fail-on-blocked
```

该 plan 仍是只读，不写 evidence，也不执行 preflight、备份恢复、migration、smoke、回滚 / 前向修复、客户配置激活或签收。它只把 status 的 `closeoutNextActions` 转成执行前置条件：image digest 需要 `SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST`；production preflight 需要真实 runtime `.env`；备份恢复需要 `SOURCE_POSTGRES_DSN`；目标 smoke 需要 `SMOKE_ENDPOINT`；客户配置 active revision 读回还需要 `SMOKE_BACKEND_URL` 和 `CUSTOMER_CONFIG_ADMIN_TOKEN`；rollback / forward-fix 需要 `ROLLBACK_TARGET_RELEASE`、`ROLLBACK_TRIGGER_SCENARIO` 和 post-smoke report；sign-off 始终是人工步骤。`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址，否则对应 action 保持 blocked，避免凭据进入命令、alias 或 evidence。`--fail-on-blocked` 只表示本机缺少执行前置条件，不表示 release evidence gate 通过或失败。命令使用 `--runtime-env-file`，避免 Node 24 把 `--env-file` 当作 Node 自身参数提前拦截。

如果 closeout plan 已显示某些机器步骤 `canRun=true`，可以用 runner 先 report-only 预览将要执行的命令：

```bash
node scripts/deploy/release-evidence-closeout-runner.mjs \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --runtime-env-file server/deploy/compose/prod/.env \
  --only immutable-version,target-smoke \
  --report output/release-evidence-closeout/<YYYY-MM-DD>/closeout-runner-report.json \
  --json
```

真正执行前必须显式确认；runner 只执行选中的、plan 判定可运行的机器步骤，不执行 blocked action，也不执行人工 sign-off：

```bash
RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT \
  node scripts/deploy/release-evidence-closeout-runner.mjs \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --runtime-env-file server/deploy/compose/prod/.env \
    --only immutable-version,target-smoke \
    --report output/release-evidence-closeout/<YYYY-MM-DD>/closeout-runner-report.json \
    --execute
```

runner 不替代 release evidence gate；每组 evidence 写入后仍要回到 `release-evidence-status.mjs` / `release-evidence-gate.mjs` 复核。`--report` 写出的 runner 报告只保存执行时间、display command、env key 名和 stdout / stderr 行数，不保存 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN`、真实 `.env`、完整 DSN、token 或命令原始输出；runner 会拒绝把 `--report` 写到 `deployments/<customer>/evidence/**`，report-only 留痕统一放 `output/release-evidence-closeout/<release>/`，不进入 release evidence gate 真源。

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该 gate 只检查已脱敏 evidence 是否填齐、`release-evidence.md` 的 Git commit 和镜像 digest 是否可追溯、`image-digests.txt` 的 server / web digest 是否与 `release-evidence.md` 一致、`production-preflight-report.txt` 声明真实运行时 `.env` preflight 通过、`backup-evidence.md` 绑定本次 releaseVersion、environment、backupId、migration 前版本、ISO 备份时间、正数备份大小和通过态恢复 / smoke 结果、`migration-status-before-apply.txt` 声明恢复 dump 后的版本与 `migrationBefore` 一致、`migration-status.txt` 声明 apply 后当前版本与 `migrationAfter` 一致且无 pending files、`smoke-test-report.json` 声明非空 smoke checks 全部通过且每项带 target，URL / path 检查还带合法 HTTP status，客户配置激活发布还应包含 `jsonrpc:customer_config.get_effective_session` target、`backup-restore-report.json` 声明真实恢复演练通过且带恢复目标、当前 evidence 目录内真实存在且不含完整 DSN / secret 的 artifact 相对路径、命令摘要、备份大小 / hash、`backup.migrationVersion=migrationBefore`、`restore.migrationBeforeApply=migrationBefore`、无 pending migration、restore migration version 与 `migrationAfter` 一致和 smoke 表数量，并额外解析 `artifacts.preMigrationStatus` 与 `artifacts.migrationStatus` 的迁移版本和 pending 数，以及 `artifacts.commandSummary` 的批次身份、source alias、恢复目标和步骤摘要；`rollback-forward-fix-plan.md` 已记录回滚 / 前向修复处置路径、`rollback-rehearsal-report.json` 声明 rollback / forward-fix 演练步骤和 post-check 已通过，并要求 `postCheck.smokeReport` 指向同一 release evidence 目录内的 `smoke-test-report.json`，`postCheck.smokeCheckCount` 与该文件 checks 数量一致；若本次演练提供客户配置 revision，还会要求 rollback rehearsal report 的 `postCheck.customerConfigEffectiveSession` 绑定同一 revision、`jsonrpc:customer_config.get_effective_session` target 和不保存响应正文的脱敏约束。`release-signoff-checklist.md` 绑定本次 releaseVersion、environment 和 backupId，并强制 release / backup / backup restore / smoke / rollback rehearsal / sign-off 的 `releaseVersion` 和 environment 一致、release / backup / backup restore / sign-off 的 `backupId` 一致、backup / backup restore 的 databaseBackupHash 一致，且 backup `migrationVersion` 必须等于 release `migrationBefore`；不会读取真实备份文件、真实 `.env` 或客户原始数据。

需要机器读取时追加 `--json`，输出会包含 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`。`release evidence gate ok` 只表示当前脱敏证据目录通过一致性、脱敏和占位检查，不表示该 gate 执行过目标环境发布、migration、smoke、恢复演练、回滚 / 前向修复或客户配置激活。

若发布内容包含客户配置 runtime revision 激活，还需在激活前执行：

```bash
node scripts/deploy/customer-config-activation-gate.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

release evidence 中只记录 manifest revision、哈希或人工 review 结论；不要放真实 `.env`、真实备份、客户原始文件、secret 或未脱敏导入数据。该 gate 不替代真实后端激活、migration、备份恢复或 smoke。

声明本目录对客户配置 revision “发布就绪”前，还必须跑 readiness 聚合门禁：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

如果已经生成执行器报告，应追加 report 校验；执行后声明 publish 已完成时追加 `--require-executed`，声明 active revision 已生效时追加 `--require-activated`。`--require-activated` 会要求执行器报告中的 `effectiveSessionVerification` 通过，证明 activate 后已读回 `get_effective_session`，且 active revision、非空页面投影和字段策略 surface 与当前 manifest 对齐；同时要求本目录的 `smoke-test-report.json` 已包含目标环境 `customer-config-effective-session` 检查，且 `expectedRevision` 匹配当前 manifest；执行器报告的 `backendEndpointAlias` 还必须与目标 smoke report 的 `backendEndpointAlias` 一致：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --require-activated
```

readiness gate 复用 activation gate，并额外校验执行报告的客户 key、revision、manifest hash、evidence dir、执行状态、安全声明、执行 backend endpoint、activate / rollback 后的 effective session 投影验证，以及 release evidence 里的同 endpoint 目标 smoke effective session 证据；它不调用后端、不执行 migration、不恢复备份、不导入业务数据。需要机器读取时追加 `--json`，输出会包含 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`，明确 readiness 通过不代表该 gate 执行过目标发布、migration、恢复、smoke、回滚或 Workflow / Fact 写入。

发布 / 激活执行报告由下面命令生成，并可把 `customer-config-release-report.json` 的结论摘入本目录的脱敏证据：

```bash
node scripts/deploy/customer-config-release-execute.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --out output/customers/yoyoosun/customer-config-release
```

真实 `--execute` 执行时不要把 admin token、完整请求体、真实 `.env` 或客户 raw files 写入本目录，也不要在 `--backend-url` 中携带账号密码。`customer-config-release-report.json` 会输出 `manifestSha256` 和脱敏 `backendEndpointAlias`，必须分别与 `customer-config-manifest-evidence.json` 和目标 smoke report 一致；activate / rollback 执行成功后还会写入脱敏的 `effectiveSessionVerification` 摘要，用于证明正式前端可读回当前 active revision 投影。

若 publish 已完成、只重试激活，执行器应使用 `--activate-only`，release evidence 中记录本次只执行 activate，不重复记录 publish 已完成的请求体。
