# yoyoosun 发布记录 / Release Evidence

每次发布创建一个日期目录：

```text
evidence/releases/<YYYY-MM-DD>/
```

新建的 `release-evidence.md` 必须声明 `evidenceContract=plush.release-evidence/v1`。该字段只标识整套发布证据的解析合同，不再叠加单独的 schema / gate 版本。没有该字段的既有目录按 `legacy` 历史记录保留，status 不会用当前门禁反向判它缺文件；不得为了通过新门禁改写旧证据，需要再次发布时创建新目录。声明未知合同的目录标记为 `unsupported-contract`，等待对应工具支持。

选择一个 profile，并在 collect、status、closeout、smoke 和 gate 全程保持一致：

| profile | 适用场景 | 额外门禁 |
| --- | --- | --- |
| `base-release` | 普通发布和客户配置激活前底线 | 保留当前备份和回滚路径；按迁移及恢复流程变更决定是否演练，不要求客户签收 |
| `customer-trial-acceptance` | 客户试用或交付前 | 恢复与回滚演练、签收、凭据轮换、岗位登录、SMS、PDF；`demo-133` 还要客户配置读回 |

`base-release` 始终必需七项：`release-evidence.md`、`production-preflight-report.json`、`image-digests.txt`、`backup-evidence.md`、`migration-status.txt`、`smoke-test-report.json`、`rollback-forward-fix-plan.md`。

只有确认本次没有迁移（`migrationBefore` 等于 `migrationAfter`），且备份、恢复、回滚流程及其运行配置均未改变，才把 `release-evidence.md` 的 `recoveryProcedureChanged` 从默认 `true` 改为 `false`，免去本轮重复演练。有迁移、流程变更或信息缺失时，仍要求 `backup-restore-report.json`、`rollback-rehearsal-report.json` 及恢复演练引用的 `migration-status-before-apply.txt`、`command-summary.txt`。免演练不免发布前备份、备份摘要、迁移状态、固定回滚版本和恢复路径。

`customer-trial-acceptance` 始终要求上述演练及 `release-signoff-checklist.md`、`credential-rotation-report.json`。发布包含客户配置 revision 时再提供 `customer-config-manifest-evidence.json`。`known-limitations.md`、`acceptance-checklist.md` 和 `security-scan-report.json` 可作为专项材料，但不是每次基础发布的硬依赖。草稿会保守生成演练占位；符合免演练条件后，status / plan / gate 不要求补齐这些占位。基础发布不生成验收清单或签收草稿。

所有内容必须脱敏。`release-evidence.md` 用 `releaseId` 表示本次操作批次，用完整 40 位 `productCommit` 表示产品代码；所有适用证据必须绑定同一批次与目标。`production-preflight-report.json` 是机器合同，不解析中文日志。验收档 preflight 回执可以用于基础发布或客户配置激活，但仍逐项校验运行身份和必需检查；基础回执不能反过来证明验收档通过。字段级校验以 `release-evidence-gate.mjs` 为唯一可执行真源，本 README 不复制解析逻辑。

恢复链跨越 `20260714055504` 时，restored DB 必须在 apply 前完成 populated upgrade read-only audit；`backup-evidence.md`、backup restore 的 restore / summary 和 `command-summary.txt` 必须同时记录 `populatedUpgradeAuditStatus=passed`，步骤必须包含 read-only audit。任何缺失都会被 release gate 拒绝。

恢复链跨越 `20260714055825` 时，restored DB 还必须在 apply 前完成 customer config cutover read-only audit；上述四处必须同时记录 `customerConfigCutoverAuditStatus=passed`，步骤必须包含 customer config cutover read-only audit。审计只报告 blocker，不自动治理或删除生产数据。

客户配置 revision 发布还必须提供 `customer-config-manifest-evidence.json`，用于把 release evidence 绑定到具体 runtime manifest：

```json
{
  "customerKey": "yoyoosun",
  "revision": "<approved-runtime-revision>",
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

`manifestPath` 和 `releaseReport` 只保存仓库相对路径，不保存本机绝对路径；草稿目录如果适用的 release evidence、smoke 或验收签收尚未通过，不应把 `reviewStatus` 写成 `approved`。

推荐由脚本生成，避免手写哈希：

```bash
node scripts/deploy/customer-config-manifest-evidence.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --review-status approved \
  --reviewer <reviewer-name>
```

未传 `--review-status approved` 时脚本默认生成 `draft`，不能通过 activation gate；只有 manifest 已完成人工 review 并且目标 release evidence、smoke 和适用的验收签收也能独立闭环时，才应显式写 approved。

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
    --release-id <release-id> \
    --environment <environment> \
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
  --release-id <release-id> \
  --rehearsal-type rollback-forward-fix \
  --trigger-scenario "<trigger-scenario>" \
  --rollback-target-release <previous-release-version> \
  --step "identify rollback target=pass" \
  --step "verify rollback command path=pass" \
  --step "verify forward-fix owner path=pass" \
  --post-smoke-report smoke-test-report.json \
  --customer-config-revision <approved-runtime-revision> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该生成器只汇总已完成的演练步骤和 post-smoke report，不执行回滚、不恢复备份、不跑 migration、不调用后端；`--evidence-dir` 必须指向已存在 release evidence 目录，并默认输出同目录 `rollback-rehearsal-report.json`。

客户试用或交付前必须执行：

```bash
node scripts/deploy/release-evidence-status.mjs \
  --deployment-target <demo-133|customer-test-133> \
  --profile <base-release|customer-trial-acceptance> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

status 只读当前目录并按 `--profile` 返回 `missing / legacy / unsupported-contract / incomplete / draft / attention / ready`、缺失材料和下一步命令。它不执行 preflight、备份恢复、migration、smoke、回滚、客户配置激活或签收；`ready` 只表示所选 profile 的脱敏证据通过门禁。旧目录没有 `evidenceContract` 时标记为 `legacy`，不会被新门禁要求补文件。

按 `closeoutNextActions` 执行前，先用 closeout plan 检查当前本机是否具备真实输入：

```bash
node scripts/deploy/release-evidence-closeout-plan.mjs \
  --profile <base-release|customer-trial-acceptance> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --runtime-env-file server/deploy/compose/prod/.env \
  --json \
  --fail-on-blocked
```

该 plan 仍是只读，不写 evidence，也不执行 preflight、备份恢复、migration、smoke、回滚 / 前向修复、客户配置激活或签收。它只把 status 的 `closeoutNextActions` 转成执行前置条件：image digest 需要 `SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST`；production preflight 需要真实 runtime `.env`；备份恢复需要 `SOURCE_POSTGRES_DSN`；目标 smoke 需要 `SMOKE_ENDPOINT`；客户配置 active revision 读回还需要 `SMOKE_BACKEND_URL` 和 `CUSTOMER_CONFIG_ADMIN_TOKEN`；rollback / forward-fix 需要 `ROLLBACK_TARGET_RELEASE`、`ROLLBACK_TRIGGER_SCENARIO` 和 post-smoke report；sign-off 始终是人工步骤。`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址，否则对应 action 保持 blocked，避免凭据进入命令、alias 或 evidence。`--fail-on-blocked` 只表示本机缺少执行前置条件，不表示 release evidence gate 通过或失败。命令使用 `--runtime-env-file`，避免 Node 24 把 `--env-file` 当作 Node 自身参数提前拦截。

如果 closeout plan 已显示某些机器步骤 `canRun=true`，可以用 runner 先 report-only 预览将要执行的命令：

```bash
node scripts/deploy/release-evidence-closeout-runner.mjs \
  --profile <base-release|customer-trial-acceptance> \
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
    --profile <base-release|customer-trial-acceptance> \
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
  --deployment-target <demo-133|customer-test-133> \
  --profile <base-release|customer-trial-acceptance> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该 gate 只检查所选 profile 的脱敏材料、身份一致性、占位与敏感信息边界。`base-release` 不要求凭据轮换、岗位登录、SMS、PDF 或客户配置读回；`customer-trial-acceptance` 才增加这些专项检查。它不读取真实备份、`.env` 或客户原始数据，也不执行任何目标环境动作。

如果 `migrationBefore < 20260714055504 <= migrationAfter`，gate 还会强制核对 backup evidence、restore report、summary 与 command summary 的 populated upgrade audit 通过状态及步骤摘要；即使最终 `Pending Files=0`，缺少该审计证据仍判定失败。

如果 `migrationBefore < 20260714055825 <= migrationAfter`，gate 同样强制核对四处 customer config cutover audit 通过状态及步骤摘要；任一字段缺失、非 `passed` 或步骤未明确记录该只读审计都会判定失败。

需要机器读取时追加 `--json`，输出会包含 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`。`release evidence gate ok` 只表示当前脱敏证据目录通过一致性、脱敏和占位检查，不表示该 gate 执行过目标环境发布、migration、smoke、恢复演练、回滚 / 前向修复或客户配置激活。

若发布内容包含客户配置 runtime revision 激活，还需在激活前执行：

```bash
node scripts/deploy/customer-config-activation-gate.mjs \
  --deployment-target <demo-133|customer-test-133> \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

release evidence 中只记录 manifest revision、哈希或人工 review 结论；不要放真实 `.env`、真实备份、客户原始文件、secret 或未脱敏导入数据。该 gate 不替代真实后端激活、migration、备份恢复或 smoke。

声明本目录对客户配置 revision “发布就绪”前，还必须跑 readiness 聚合门禁：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --deployment-target <demo-133|customer-test-133> \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

如果已经生成执行器报告，应追加 report 校验；执行后声明 publish 已完成时追加 `--require-executed`，声明 active revision 已生效时追加 `--require-activated`。`--require-activated` 会要求执行器报告中的 `effectiveSessionVerification` 通过，证明 activate 后已读回 `get_effective_session`，且 active revision、非空页面投影和字段策略 surface 与当前 manifest 对齐；同时要求本目录的 `smoke-test-report.json` 已包含目标环境 `customer-config-effective-session` 检查，且 `expectedRevision` 匹配当前 manifest；执行器报告的 `backendEndpointAlias` 还必须与目标 smoke report 的 `backendEndpointAlias` 一致：

```bash
node scripts/deploy/customer-config-release-readiness.mjs \
  --deployment-target <demo-133|customer-test-133> \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --require-activated
```

readiness gate 复用 activation gate，并额外校验执行报告的客户 key、revision、manifest hash、evidence dir、执行状态、安全声明、执行 backend endpoint、activate / rollback 后的 effective session 投影验证，以及 release evidence 里的同 endpoint 目标 smoke effective session 证据；它不调用后端、不执行 migration、不恢复备份、不导入业务数据。需要机器读取时追加 `--json`，输出会包含 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`，明确 readiness 通过不代表该 gate 执行过目标发布、migration、恢复、smoke、回滚或 Workflow / Fact 写入。

发布 / 激活执行报告由下面命令生成，并可把 `customer-config-release-report.json` 的结论摘入本目录的脱敏证据：

```bash
node scripts/deploy/customer-config-release-execute.mjs \
  --deployment-target <demo-133|customer-test-133> \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --out output/customers/yoyoosun/customer-config-release
```

真实 `--execute` 执行时不要把 admin token、完整请求体、真实 `.env` 或客户 raw files 写入本目录，也不要在 `--backend-url` 中携带账号密码。`customer-config-release-report.json` 会输出 `manifestSha256` 和脱敏 `backendEndpointAlias`，必须分别与 `customer-config-manifest-evidence.json` 和目标 smoke report 一致；activate / rollback 执行成功后还会写入脱敏的 `effectiveSessionVerification` 摘要，用于证明正式前端可读回当前 active revision 投影。

若 publish 已完成、只重试激活，执行器应使用 `--activate-only`，release evidence 中记录本次只执行 activate，不重复记录 publish 已完成的请求体。
