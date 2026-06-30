# progress archive 2026-06-29 before target evidence binding

本文件归档 `progress.md` 中 2026-06-29 发布证据、导入恢复、文档清单和恢复 / 回滚门禁早期硬化过程记录。归档内容只作为过程追溯，不是当前正式需求、数据模型或部署真源。

## 2026-06-29 smoke evidence target / httpCode 追踪门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 强化 `smoke-test-report.json` 校验，要求每条 smoke check 除全通过外还必须带可复核 `target`；URL 或 path target 必须带 100-599 的 `httpCode`，避免只有 pass 文案却无法追溯检查对象。
- 完成：`scripts/deploy/rollback-rehearsal-report.mjs` 对 post-smoke report 采用同一 target / httpCode 规则；补 release gate、rollback rehearsal report、deployment package lint 负向测试，并同步客户配置 release / activation / readiness 测试夹具。
- 完成：同步 smoke report example、smoke checklist、evidence README、release evidence README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要，明确没有检查目标的 smoke pass 不能作为发布证据。
- 验证：追加前已检查 `progress.md` 为 235 行 / 41054 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/rollback-rehearsal-report.test.mjs scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs && node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需由目标环境或等价演练环境实际运行 smoke，并把带 target / httpCode 的真实 `smoke-test-report.json` 放入 release evidence 后再跑 gate。
- 阻塞/风险：本轮只强化本地证据门禁、测试夹具和文档，不连接目标后端、不执行真实 smoke、不发布、不恢复备份、不执行 migration、不做真实 rollback / forward-fix 演练或客户导入。

## 2026-06-29 发布 evidence production preflight report 门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 新增 `production-preflight-report.txt` 必需证据，校验输出必须来自非 `--example` 模式的 `production-preflight.sh`，并包含 env 必需变量、生产 secret / 镜像 tag / debug / 暴露边界、Compose / 低配部署 / migration 脚本和 `all checks passed`。
- 完成：`deployments/yoyoosun/scripts/collect-evidence.sh` 生成 preflight report 占位文件，并同步复制 `rollback-forward-fix-plan.md` 模板，避免草稿生成器和 release gate 要求脱节；同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`release-evidence-template.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 261 行 / 46904 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 和 `for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file"; done` 已通过。
- 下一步：真实发布仍需用目标环境运行时 `.env` 生成真实 `production-preflight-report.txt`，并完成目标环境 migration、smoke、真实备份恢复演练和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮不读取真实 `.env`、不执行真实 production preflight、不连接目标 Docker、不执行 migration、不恢复备份；新增门禁只防止 release evidence 用手写文字或 example preflight 冒充真实 preflight。

## 2026-06-29 发布 evidence smoke report 内容门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 强化 `smoke-test-report.json` 校验，要求 `checks` 非空，`summary.total / passed` 与 checks 数量一致，`summary.failed=0`，且每条 check 状态必须为 `pass / passed / ok`。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖空 smoke checks 和 skipped / 非 pass check 会被拒绝；同步客户配置 activation / manifest evidence / release readiness / release execute 测试 helper 的 smoke checks 结构。
- 完成：同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`，明确空 smoke 或 skipped 不能当发布通过。
- 验证：追加前已检查 `progress.md` 为 269 行 / 48553 字节，未达归档阈值；`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file"; done` 已通过。
- 下一步：真实发布仍需在目标环境生成真实 smoke report，并覆盖 health / ready / Web 登录或岗位路由等 release scope 内的检查项。
- 阻塞/风险：本轮不执行真实目标环境 smoke、不连接目标后端或浏览器；新增门禁只拒绝空 smoke、数量不一致和非 pass check，不能替代实际 smoke 执行。

## 2026-06-29 发布 evidence backup restore 上下文门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 强化 `backup-restore-report.json` 校验，要求报告包含 `verifiedAt`、`sourceAlias`、`restoreTarget`、`artifacts.commandSummary`、正数备份大小、合法备份 hash、通过的恢复状态、非 unknown migration 版本、`restore.pendingFiles=0`、`smoke.smokeQueryStatus=passed` 和正数 `smoke.publicTableCount`，并拒绝 source / restore target 中出现完整 DSN。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖缺少恢复目标、非法备份 hash、存在 pending migration 会被拒绝；同步客户配置 activation / manifest evidence / release readiness / release execute 测试 helper 的 backup restore report 结构。
- 完成：同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`，明确 backup restore evidence 不能只写 summary 通过，必须带脱敏恢复上下文。
- 验证：追加前已检查 `progress.md` 为 278 行 / 49990 字节，未达归档阈值；`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需用目标环境备份执行恢复演练并保留脱敏 evidence。
- 阻塞/风险：本轮强化的是 evidence gate 和测试 fixture，不读取真实备份文件、不连接目标环境、不执行真实 restore、migration、smoke 或生产 rollback 演练。

## 2026-06-29 发布 evidence rollback rehearsal 门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 新增 `rollback-rehearsal-report.json` 必需证据，要求记录 `rehearsedAt`、`rehearsalType`、触发场景、回滚目标、runbook、非空且全通过的演练步骤、post-check smoke、summary 全通过和脱敏声明，避免把 `rollback-forward-fix-plan.md` 计划误当成真实演练证据。
- 完成：`deployments/yoyoosun/scripts/collect-evidence.sh` 和 `release-evidence-template.md` 新增 rollback rehearsal 占位；补 `release-evidence-gate.test.mjs` 覆盖缺少演练报告和演练步骤 skipped 会被拒绝；同步客户配置 activation / manifest evidence / release readiness / release execute 测试 helper。
- 完成：同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`，明确 rollback plan 和 rollback rehearsal report 是两类证据。
- 验证：追加前已检查 `progress.md` 为 287 行 / 51718 字节，未达归档阈值；`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需在目标环境或等价演练环境执行 rollback / forward-fix 演练并保留脱敏 report。
- 阻塞/风险：本轮只新增门禁、草稿占位和测试，不执行真实生产回滚，不连接目标后端或 Docker，不替代目标环境 migration / smoke / rollback 演练。

## 2026-06-29 真实导入 recovery plan 门禁

- 完成：`scripts/import/customerImportExecute.mjs` 新增 `--recovery-plan` 参数；真实 `--execute` 时必须提供 reviewed JSON，要求 `recoveryPlanApproved=true`、审批人、owner、backup evidence、rollback target、forward-fix path、failure triggers、post-recovery verification 和脱敏声明，并拒绝路径或内容含 fixture / sample / placeholder 的 recovery plan。
- 完成：补 `customerImportExecute.test.mjs` 覆盖参数解析、真实 execute 缺少 recovery plan 会拒绝、placeholder recovery plan 会拒绝；report-only 模式保持可用，不连接后端。
- 完成：同步 `scripts/README.md`、`docs/customers/yoyoosun/导入策略.md`、`docs/customers/yoyoosun/导入试跑计划.md`、`docs/customers/yoyoosun/导入试跑工具说明.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`，明确 backup evidence 和 recovery plan 都不能用样例 / 占位冒充真实导入恢复证据。
- 验证：追加前已检查 `progress.md` 为 296 行 / 53423 字节，未达归档阈值；`for test_file in scripts/import/*.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实导入仍需非 fixture 的客户 approval、dry-run package、目标环境 backup evidence、recovery plan、目标后端和管理员凭据。
- 阻塞/风险：本轮只强化真实导入执行前门禁，不连接目标后端，不执行真实导入，不验证真实失败恢复或数据对账。

## 2026-06-29 文档清单 reference / evidence 收口

- 完成：补 `docs/文档清单.md` 中缺失的 release sign-off 模板、rollback / forward-fix plan 模板，以及 2026-06-17、06-18、06-22、06-24、06-26 过程记录归档条目；第四批 reference 目录和 `docs/product/多甲方角色能力流程编排优先级.md` 已确认在清单中登记。
- 验证：追加前已检查 `progress.md` 为 305 行 / 55106 字节，未达归档阈值；用 `find + rg` 确认 `deployments/yoyoosun/evidence/**/*.md`、`docs/archive/*.md`、第四批 reference / 优先级文档均可在 `docs/文档清单.md` 找到。
- 下一步：继续按优先级推进真实环境证据、导入恢复和发布门禁；新增或重命名长期 Markdown 时继续同步清单。
- 阻塞/风险：本轮只修正文档索引，不改 runtime、schema、RBAC、菜单、部署执行或真实客户数据。

## 2026-06-29 文档清单自动守卫

- 完成：新增 `scripts/qa/docs-inventory.test.mjs`，扫描 tracked 和未跟踪但未被 ignore 的当前维护 Markdown，要求仓库根文档、`docs/`、`deployments/`、`config/`、`scripts/`、`server/` 和 `web/` 下的 Markdown 路径已登记到 `docs/文档清单.md`；`fast.sh` / `strict.sh` 已接入该守卫。
- 完成：补登记第三批 reference 的 3 篇漏登文档，并同步 `docs/文档清单.md` 使用规则、`docs/当前真源与交接顺序.md`、`docs/product/自动化测试策略.md` 和 `scripts/README.md`，明确清单守卫只证明路径登记，不替代当前 runtime truth。
- 验证：追加前已检查 `progress.md` 为 312 行 / 56012 字节，未达归档阈值；`node --test scripts/qa/docs-inventory.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按优先级推进真实目标环境 preflight / migration / smoke / restore / rollback 证据，以及真实导入恢复预案和对账证据。
- 阻塞/风险：本轮不执行真实目标环境发布、不连接目标后端或 Docker、不执行真实导入；文档清单守卫不判断文档内容是否为当前真源，只防止长期 Markdown 漏登记。

## 2026-06-29 备份恢复演练脚本轻量守卫

- 完成：新增 `scripts/deploy/backup-restore-rehearsal-script.test.mjs`，锁住 `deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh` 的 help 输出、缺少 `SOURCE_POSTGRES_DSN` 时提前拒绝、默认拒绝把 `192.168.0.133` 目标 / 测试库当本地 source，以及 `backup-restore-report.json` 中 release evidence gate 需要的脱敏字段。
- 完成：`scripts/qa/fast.sh` 和 `scripts/qa/strict.sh` 已接入该测试；同步 `scripts/README.md` 和 `docs/product/自动化测试策略.md`，说明该测试不启动 Docker、不执行 `pg_dump`、不恢复数据库，只防止恢复演练脚本被改坏。
- 验证：追加前已检查 `progress.md` 为 320 行 / 57271 字节，未达归档阈值；`node --test scripts/deploy/backup-restore-rehearsal-script.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：真实交付仍需用目标或等价演练环境实际执行 `run-backup-restore-rehearsal.sh`，并把脱敏 `backup-restore-report.json`、`backup-evidence.md`、`migration-status.txt` 放入对应 release evidence 后再跑 release gate。
- 阻塞/风险：本轮只补脚本测试和 QA 接入，不读取真实 `.env`、不运行 Docker / PostgreSQL 恢复、不连接目标后端、不证明任何真实备份已恢复。

## 2026-06-29 回滚 / 前向修复演练报告生成器

- 完成：新增 `scripts/deploy/rollback-rehearsal-report.mjs`，根据真实演练步骤和非空全通过的 post-smoke report 生成脱敏 `rollback-rehearsal-report.json`，字段对齐 release evidence gate 对 `rehearsalType`、触发场景、回滚目标、runbook、步骤、post-check、summary 和脱敏声明的要求。
- 完成：补 `scripts/deploy/rollback-rehearsal-report.test.mjs` 覆盖 help、参数解析、正常生成、失败步骤拒绝、空 / 失败 smoke 拒绝和 CLI 写出；`scripts/qa/fast.sh`、`scripts/qa/strict.sh` 已接入该测试，并同步 `scripts/README.md`、`docs/product/自动化测试策略.md`。
- 验证：追加前已检查 `progress.md` 为 328 行 / 58636 字节，未达归档阈值；`node --test scripts/deploy/rollback-rehearsal-report.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：真实发布仍需在目标或等价演练环境实际执行 rollback / forward-fix 演练，并把真实 post-smoke report 与生成的 `rollback-rehearsal-report.json` 放入 release evidence 后再跑 gate。
- 阻塞/风险：本轮只提供报告生成器、测试和文档入口，不执行真实回滚、不恢复备份、不运行 migration、不连接目标后端或 Docker；生成器不能替代真实环境演练。

## 2026-06-29 rollback rehearsal releaseVersion 一致性守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 将 `rollback-rehearsal-report.json` 纳入 release evidence 批次一致性校验，要求其 `releaseVersion` 与 `release-evidence.md` 匹配，避免把其他批次 rollback / forward-fix 演练报告拼入当前发布证据。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 rollback rehearsal releaseVersion 不一致会被拒绝；同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 336 行 / 60011 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 通过。
- 下一步：真实发布仍需目标环境生成本次 releaseVersion 对应的 preflight、backup restore、smoke、rollback rehearsal 和 sign-off evidence，并再跑 release evidence gate。
- 阻塞/风险：本轮只补 release evidence gate 一致性守卫，不执行真实目标环境发布、migration、smoke、备份恢复或 rollback / forward-fix 演练。

## 2026-06-29 release evidence 环境与备份 hash 一致性守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 进一步强制 backup evidence 的 `databaseBackupHash` 为 sha256，并要求 `backup-restore-report.json` 的 `environment`、`backup.databaseBackupHash`，`smoke-test-report.json` 的 `environment`，以及 `rollback-rehearsal-report.json` 的 `environment` 都与本次 release evidence 对齐。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖备份 hash 不一致和 smoke environment 不一致会被拒绝；同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 344 行 / 61265 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 通过。
- 下一步：真实发布仍需由目标或等价环境产出同一 releaseVersion、environment、backupId 和 databaseBackupHash 的 preflight、backup restore、smoke、rollback rehearsal 与 sign-off evidence。
- 阻塞/风险：本轮只补本地 release evidence gate 和文档口径，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 release sign-off 批次绑定守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `release-signoff-checklist.md` 填写 `releaseVersion`、`environment` 和 `backupId`，并与 `release-evidence.md` 一致，避免复用其他批次或其他环境的人工签收结论。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 sign-off releaseVersion 不一致会被拒绝；同步客户配置 activation / manifest evidence / release execute / release readiness 测试 fixture；更新 `release-signoff-checklist-template.md` 和 `collect-evidence.sh` 生成的 sign-off 草稿；同步 evidence README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 352 行 / 62663 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 和 `for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done` 通过。
- 下一步：真实发布仍需目标或等价环境生成本次 releaseVersion / environment / backupId 对应的 sign-off，并连同 preflight、restore、smoke、rollback rehearsal 一起通过 release evidence gate。
- 阻塞/风险：本轮只补本地证据门禁、模板和文档，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 migration evidence 版本一致性守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `migration-status.txt` 包含 `Current Version` 和 `Pending Files`，且 `Current Version` 必须等于 `release-evidence.md` 的 `migrationAfter`、`Pending Files` 必须为 `0`；同时要求 `backup-restore-report.json` 的 `restore.restoreMigrationVersion` 等于同一 `migrationAfter`。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 migration status 当前版本不一致和 restore migration version 不一致会被拒绝；同步 release evidence README、evidence 总 README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 360 行 / 64056 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 和 `for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done` 通过。
- 下一步：真实发布仍需目标或等价环境产出本次 `migrationAfter` 对应的真实 migration status 和 restore report，并与 preflight、backup、smoke、rollback rehearsal、sign-off 一起通过 release evidence gate。
- 阻塞/风险：本轮只补本地 release evidence gate 和文档口径，不执行真实 migration apply、目标环境 smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 backup evidence 批次与环境绑定守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `backup-evidence.md` 本体填写 `releaseVersion` 和 `environment`，并与 `release-evidence.md` 保持一致；原有 backupId、databaseBackupHash、backup restore、smoke、rollback rehearsal、sign-off 一致性校验继续保留。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 backup evidence releaseVersion 不一致和 environment 不一致会被拒绝；同步 customer config activation / manifest evidence / release execute / release readiness 测试夹具；同步 release evidence README、evidence 总 README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 368 行 / 65451 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs`、`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需目标或等价环境产出同一 releaseVersion / environment / backupId / databaseBackupHash 的 preflight、backup evidence、backup restore、migration status、smoke、rollback rehearsal 和 sign-off evidence。
- 阻塞/风险：本轮只补本地门禁、测试 fixture 和正式文档口径，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 backup evidence migrationBefore 绑定守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `backup-evidence.md` 填写 `migrationVersion`，并必须等于 `release-evidence.md` 的 `migrationBefore`，避免用 migration 后备份冒充 migration 前备份。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 backup evidence migrationVersion 不一致会被拒绝；同步 customer config activation / manifest evidence / release execute / release readiness 测试夹具；同步 release evidence README、evidence 总 README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 376 行 / 66980 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 和 `for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done` 通过。
- 下一步：真实发布仍需目标或等价环境产出 migration 前备份证据、migration 后状态、restore report、smoke、rollback rehearsal 和 sign-off evidence，并再跑 release evidence gate。
- 阻塞/风险：本轮只补本地门禁、测试 fixture 和正式文档口径，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 backup evidence 本体语义守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `backup-evidence.md` 的 `backupTime` 为 ISO 时间戳、`databaseBackupSize` 为正数，且 `restoreTestStatus` / `smokeQueryStatus` 必须表达通过态，避免字段非空但备份证据语义失败。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 backupTime 非 ISO、databaseBackupSize 非正数、restore / smoke 状态失败会被拒绝；同步 customer config activation / manifest evidence / release execute / release readiness 测试夹具；同步 release evidence README、evidence 总 README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 384 行 / 68306 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs` 和 `for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done` 通过。
- 下一步：真实发布仍需目标或等价环境产出真实备份时间、备份大小、恢复验证、smoke、migration、rollback rehearsal 和 sign-off evidence，并再跑 release evidence gate。
- 阻塞/风险：本轮只补本地门禁、测试 fixture 和正式文档口径，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 release evidence Git 与镜像 digest 追溯守卫

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `release-evidence.md` 的 `gitCommit` 必须是 7-40 位 Git hash，`serverImageDigest` / `webImageDigest` 必须是 `sha256:<64-hex>`，避免用分支名、镜像 tag 或人工备注冒充不可变发布输入。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 invalid git commit 和 invalid image digest 会被拒绝；同步 release evidence 模板、evidence README、release 目录 README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 392 行 / 69694 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs`、`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需目标或等价环境产出真实 Git commit、镜像 digest、preflight、备份恢复、migration、smoke、rollback rehearsal 和 sign-off evidence，并再跑 release evidence gate。
- 阻塞/风险：本轮只补本地门禁、模板和正式文档口径，不执行真实目标环境发布、migration、smoke、备份恢复、rollback / forward-fix 演练或真实导入。

## 2026-06-29 Workflow action explain stale guard 单测收口

- 完成：`web/src/erp/utils/workflowTaskActionAccess.mjs` 新增 `resolveWorkflowActionAccessRequestOutcome`，把 explain 请求的 stale response、AbortController 取消和当前请求成功 / 失败状态解析收口为可单测 helper；`useWorkflowTaskActionAccess` 改为复用该 helper，避免成功和失败分支各自维护一套 request guard。
- 完成：补 `workflowTaskActionAccess.test.mjs` 覆盖旧请求成功不覆盖当前状态、abort 失败不置 failed、当前请求成功 / 失败才更新状态；同步优先级文档和自动化测试策略，明确第 24 项 stale guard 已有 outcome helper 测试。
- 验证：追加前已检查 `progress.md` 为 400 行 / 71059 字节，未达归档阈值；`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs`、`node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按优先级推进真实环境证据、导入恢复和目标环境发布；页面级真实浏览器回归仍需在触达具体页面布局 / 交互时单独执行。
- 阻塞/风险：本轮不改页面布局、菜单、RBAC、schema、Workflow / Fact usecase 或目标环境发布流程；只补前端 action explain 请求生命周期守卫和测试。

## 2026-06-29 import execute 备份证据结构化守卫

- 完成：`scripts/import/customerImportExecute.mjs` 在真实 `--execute` 模式下要求 `--backup-evidence` 为结构化 key/value 文本，包含 `backupId`、`releaseVersion`、`databaseSnapshot`、ISO `backupTime`、正数 `databaseBackupSize`、sha256 `databaseBackupHash` 和 `operator`；同时要求 `recoveryPlan.backupEvidence` 必须匹配同一 `backupId`。
- 完成：补 `customerImportExecute.test.mjs` 覆盖缺少 backup hash 和 recovery plan 引用其他备份会被拒绝；同步 `scripts/README.md`、导入策略、导入试跑计划、导入试跑工具说明、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 408 行 / 72429 字节，未达归档阈值；`node --test scripts/import/customerImportExecute.test.mjs scripts/qa/docs-inventory.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实导入仍需非 fixture 的客户 approval、reviewed dry-run package、目标环境结构化 backup evidence、匹配同一备份的 recovery plan、目标后端和管理员凭据；当前不执行真实写入。
- 阻塞/风险：本轮只补真实执行前门禁和文档口径，不连接目标后端、不执行导入、不恢复备份、不跑目标环境 smoke。

## 2026-06-29 backup restore artifact 路径门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 要求 `backup-restore-report.json` 的 `artifacts.backupEvidence`、`artifacts.migrationStatus` 和 `artifacts.commandSummary` 必须是当前 evidence 目录内真实存在的相对路径，拒绝绝对路径、外部目录、完整 DSN 或不存在的 artifact。
- 完成：`deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh` 生成的 backup restore report 改为相对 artifact 路径；同步 release evidence gate、backup restore rehearsal、customer config activation / manifest evidence / release readiness / release execute 测试 fixture；同步 evidence README、release evidence README、`scripts/README.md`、优先级文档、自动化测试策略和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 416 行 / 73809 字节，未达归档阈值；`for test_file in scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/backup-restore-rehearsal-script.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-release-execute.test.mjs; do node --test "$test_file" || exit 1; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实 release evidence 仍需把恢复演练产生的 `backup-evidence.md`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json` 作为同一组脱敏 artifact 放入本次 release evidence 目录，再跑 release evidence gate。
- 阻塞/风险：本轮只补本地门禁、脚本输出合同、测试和文档，不执行真实备份恢复、目标环境 migration、smoke、rollback / forward-fix 演练或客户导入。

## 2026-06-29 collect evidence 草稿 artifact 占位收口

- 完成：`deployments/yoyoosun/scripts/collect-evidence.sh` 生成的 release evidence 草稿补齐 `command-summary.txt`，并让 `backup-restore-report.json` 预置 `sourceAlias`、`restoreTarget`、`artifacts.backupEvidence`、`artifacts.migrationStatus`、`artifacts.commandSummary`、backup / restore / smoke 结构字段；artifact 路径指向当前 evidence 目录内同级相对文件。
- 完成：新增 `scripts/deploy/collect-evidence-script.test.mjs`，锁住 help 可运行、草稿文件齐全、backup restore artifact 路径结构不会因文件缺失或跳出目录被 release gate 拒绝；接入 `scripts/qa/fast.sh`；同步 yoyoosun 脚本 README、备份恢复 runbook、`scripts/README.md`、优先级文档和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 424 行 / 75661 字节，未达归档阈值；`node --test scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/qa/docs-inventory.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需用真实 preflight、备份恢复演练、migration status、smoke、rollback / forward-fix 演练和 sign-off 替换草稿占位；草稿本身仍不能通过 release evidence gate。
- 阻塞/风险：本轮只补 release evidence 草稿结构、测试和文档，不执行真实目标环境备份恢复、migration、smoke、回滚演练或客户导入。

## 2026-06-29 release evidence 长期模板结构守卫

- 完成：`deployments/yoyoosun/evidence/releases/release-evidence-template.md` 补齐 release gate 需要的 `backupId`、backup / migration / smoke evidence 文件名，以及 backup restore artifact 字段说明，避免人工从长期模板复制时回到旧结构。
- 完成：`scripts/deploy/deployment-package-lint.mjs` 新增 release evidence template 结构检查，要求基本信息段包含 releaseVersion / environment / gitCommit / image digest / migrationBefore / migrationAfter / backupId，并要求模板包含 preflight、backup、migration、smoke、backup restore、rollback rehearsal 和 `artifacts.*` 路径字段；补负向测试覆盖缺少基本信息 `backupId` 会失败；同步 `scripts/README.md` 和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 432 行 / 77201 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/qa/docs-inventory.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实 release evidence 仍必须由真实 preflight、备份恢复演练、migration status、smoke、rollback / forward-fix 演练和 sign-off 产出；模板和草稿只提供结构，不构成放行证据。
- 阻塞/风险：本轮只补长期模板、部署包 lint、测试和文档，不执行真实目标环境发布、备份恢复、migration、smoke、回滚演练或客户导入。

## 2026-06-29 backup evidence 长期模板结构守卫

- 完成：`deployments/yoyoosun/evidence/releases/README.md` 的 release evidence 建议文件清单补 `command-summary.txt`，`deployments/yoyoosun/checklists/backup-restore-checklist.md` 补 command summary 和 backup restore artifact 相对路径检查项。
- 完成：`scripts/deploy/deployment-package-lint.mjs` 新增 `backup-evidence-template.md` 结构守卫，要求 backup id / time / purpose / environment / release / migration version / backup size / hash / storage alias / restore / smoke / verifiedAt 字段和脱敏边界说明；补 `deployment-package-lint.test.mjs` 负向测试覆盖缺少 `databaseBackupHash` 会失败；同步 `scripts/README.md` 和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 440 行 / 78798 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/qa/docs-inventory.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实 release evidence 仍需用目标环境真实 preflight、备份恢复演练、migration status、smoke、rollback / forward-fix 演练和 sign-off 替换模板；模板和 checklist 不构成放行证据。
- 阻塞/风险：本轮只补长期模板、checklist、部署包 lint、测试和文档，不执行真实目标环境发布、备份恢复、migration、smoke、回滚演练或客户导入。

## 2026-06-29 migration evidence 长期模板结构守卫

- 完成：`deployments/yoyoosun/evidence/migrations/migration-evidence-template.md` 的版本字段改为 `migrationBefore` / `migrationAfter` / `currentVersion` / `pendingFiles` / `dirtyState`，并新增可复制到 `migration-status.txt` 的 `Current Version:` / `Pending Files:` release gate 摘要和脱敏边界。
- 完成：`scripts/deploy/deployment-package-lint.mjs` 新增 migration evidence template 结构守卫，要求 migration 基本字段、release gate 摘要行和 DSN / SQL / secret / raw rows 脱敏说明；补 `deployment-package-lint.test.mjs` 负向测试覆盖缺少 `pendingFiles` 会失败；同步 `scripts/README.md` 和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 201 行 / 34720 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs && node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需由目标环境 migration status 输出 `Current Version=migrationAfter`、`Pending Files=0`，并与 release evidence、backup restore report 共同通过 release evidence gate。
- 阻塞/风险：本轮只补长期模板、部署包 lint、测试和文档，不执行真实 migration、目标环境 preflight、备份恢复、smoke、回滚演练或客户导入。

## 2026-06-29 sign-off / rollback plan 长期模板结构守卫

- 完成：`scripts/deploy/deployment-package-lint.mjs` 将 `evidence/releases/rollback-forward-fix-plan-template.md` 纳入 yoyoosun 部署资料包必需文件，并新增 release sign-off 与 rollback / forward-fix plan 模板结构守卫。
- 完成：release sign-off 模板现在由 lint 锁住 releaseVersion / environment / backupId / releaseConclusion / deploymentOperator / evidenceReviewer / customerOrBusinessConfirmation、允许结论值、必选确认项和脱敏边界；rollback / forward-fix plan 模板由 lint 锁住 rollbackDecision / trigger / target / runbook / owner / verification、允许处置值、必选确认项、rollback runbook 路径和脱敏边界。
- 完成：`deployment-package-lint.test.mjs` 补 release sign-off 缺少 `releaseConclusion`、rollback plan 缺少 `rollbackRunbook` 的负向测试；同步 `scripts/README.md` 和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 209 行 / 36171 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs && node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实 release evidence 仍需填写并签核真实 `release-signoff-checklist.md`、真实 rollback / forward-fix plan、rollback rehearsal report、preflight、backup、migration、smoke 和 backup restore evidence；模板结构守卫不等于目标环境放行。
- 阻塞/风险：本轮只补长期模板守卫、部署包 lint、测试和文档，不执行真实签核、生产回滚、forward-fix、目标环境发布、备份恢复、migration、smoke 或客户导入。

## 2026-06-29 smoke report example 结构守卫

- 完成：`scripts/deploy/deployment-package-lint.mjs` 新增 `evidence/smoke/smoke-test-report.example.json` 结构守卫，要求 JSON 可解析、customerCode / environment / releaseVersion / generatedAt / operatorRole 存在、checks 非空、summary total / passed / failed 与 checks 一致、每个 check 有 name / target 且状态为通过态，并声明不含 secret / raw customer rows。
- 完成：`deployment-package-lint.test.mjs` 补 smoke example summary 与 checks 数量不一致的负向测试；同步 `scripts/README.md` 和自动化测试策略。
- 验证：追加前已检查 `progress.md` 为 218 行 / 37939 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs && node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需在目标环境生成真实 `smoke-test-report.json`，覆盖 health / ready / Web 登录或岗位路由等 release scope 内检查项，并与 release evidence gate 的 releaseVersion / environment / backup / migration 证据一致。
- 阻塞/风险：本轮只补 smoke example 结构守卫、部署包 lint、测试和文档，不执行目标环境 smoke、不连接目标后端或浏览器、不执行发布、备份恢复、migration、回滚演练或客户导入。

## 2026-06-29 run-smoke release gate 输出合同

- 完成：`deployments/yoyoosun/scripts/run-smoke.sh` 新增必填 `--release-version` 和 `--environment` 参数，输出 JSON 补 `releaseVersion`、`environment`、`operatorRole` 和每个 check 的 `target`，并给 `curl` 增加 connect timeout 与 retry，避免短暂连接抖动直接生成失败报告。
- 完成：新增 `scripts/deploy/run-smoke-script.test.mjs`，用本地 HTTP server 验证 help、report 生成、summary 与 checks 数量一致、全通过状态、releaseVersion / environment / redaction 字段；接入 `scripts/qa/fast.sh` 和 `scripts/qa/strict.sh`。
- 完成：同步 `deployments/yoyoosun/scripts/README.md`、`scripts/README.md` 和自动化测试策略，明确 run-smoke 产物可以进入 release evidence gate 的跨文件一致性校验。
- 验证：追加前已检查 `progress.md` 为 226 行 / 39380 字节，未达归档阈值；`node --test scripts/deploy/run-smoke-script.test.mjs scripts/deploy/deployment-package-lint.test.mjs && node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需在目标环境运行 `run-smoke.sh` 并把生成的 `smoke-test-report.json` 放入本次 release evidence 目录，与真实 preflight、backup、migration、restore、rollback rehearsal 和 sign-off 一起通过 gate。
- 阻塞/风险：本轮只修 smoke 脚本输出合同、测试、QA 接入和文档，不连接目标环境、不执行真实 smoke、不发布、不恢复备份、不执行 migration、不做回滚演练或客户导入。

## 2026-06-29 effective session 前端页面投影守卫

- 完成：正式后台登录后在管理员 profile 上挂载 `customer_config.get_effective_session` 返回的 effective session；桌面侧栏菜单和当前路由重定向统一按 RBAC 菜单路径与 active revision 页面清单交集收窄，super admin 也不能越过 active revision 页面投影。
- 完成：`adminProfileSync` 新增 effective session attach、页面 / 动作 / 字段策略 helper、菜单过滤和当前路由重定向判断；`ERPLayout` 复用这些 helper，直接打开被客户有效配置隐藏的 URL 会跳转到第一个可见入口，不再只靠侧栏隐藏。
- 完成：补 `adminProfileSync.test.mjs` 覆盖 RBAC 基础字段不被覆盖、普通用户菜单交集、super admin 页面投影收窄、profile loading 不重定向和当前页面被 active revision 隐藏时需要跳转；同步优先级文档、当前真源索引、自动化测试策略和 `web/README.md`。
- 验证：追加前已检查 `progress.md` 为 244 行 / 42997 字节，未达归档阈值；`node --test web/src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`cd web && /usr/local/bin/pnpm lint`、`cd web && /usr/local/bin/pnpm css`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 readiness / release evidence / smoke / backup restore / rollback rehearsal，以及按优先级推进 remaining runtime / deploy gate，不把本地前端投影测试写成真实发布完成。
- 阻塞/风险：本轮只补正式前端投影守卫、单测和正式文档；未执行浏览器级 route 回归、目标环境发布、真实 active revision 激活、真实导入、备份恢复、migration、smoke 或回滚演练。

## 2026-06-29 effective session 直接 URL 浏览器回归

- 完成：`style:l1` 的 admin mock 新增 `customer_config.get_effective_session` 响应，场景可显式注入 active revision 页面清单，不影响默认无收窄场景。
- 完成：新增 `erp-effective-session-direct-url-redirect` 浏览器场景：以已登录管理员直接访问 `/erp/system/permissions`，当 effective session 只允许 `global-dashboard` 时，真实页面路由会跳回 `/erp/dashboard`，并确认权限中心内容没有渲染。
- 验证：追加前已检查 `progress.md` 为 253 行 / 44795 字节，未达归档阈值；`cd web && STYLE_L1_SCENARIOS=erp-effective-session-direct-url-redirect /usr/local/bin/pnpm style:l1`、`node --test web/src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`cd web && /usr/local/bin/pnpm lint`、`cd web && /usr/local/bin/pnpm css`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh`、`cd web && PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm test` 通过；裸 lifecycle 曾被 Codex runtime `pnpm 11.7.0` 抢占而失败，固定 PATH 后使用项目要求的 `pnpm 10.13.1` 通过。
- 下一步：继续跑前端 lint/css、相关单测、docs inventory、fast，并推进真实目标环境 release evidence / smoke / backup restore / rollback rehearsal 缺口。
- 阻塞/风险：本轮只补本地浏览器回归，不执行真实目标环境 active revision 激活、发布、导入、备份恢复、migration、smoke 或回滚演练。

## 2026-06-29 effective session 失败闭合

- 完成：`adminProfileSync` 将有 `effective_session` 对象但 `pages=[]` 的状态视为无页面可见，不再把空页面清单当成“不收窄”；新增 unavailable 投影 helper，客户有效配置同步失败且没有缓存投影时使用空页面投影，避免退回 RBAC-only 放开入口。
- 完成：`ERPLayout` 在 `get_effective_session` 同步失败时优先沿用上一份缓存投影，否则挂空投影；`visibleSections` 为空时不渲染业务 Outlet，super admin 也不能越过 active revision 空页面清单；无可见入口提示改为同时指向账号权限和当前客户有效配置。
- 完成：补 `adminProfileSync.test.mjs` 覆盖同步失败不按 RBAC 放开页面；补 `style:l1` 场景 `erp-effective-session-empty-pages-blocks-outlet`，验证空页面清单下直接访问权限中心不会渲染权限中心内容；同步优先级文档、当前真源索引、自动化测试策略和 `web/README.md`。
- 完成：`run-smoke-script.test.mjs` 从固定等待改为真实 `/healthz` readiness probe，修复 `fast.sh` 连跑时临时 HTTP server 偶发尚未可连接导致的 curl 失败。
- 验证：追加前已检查 `progress.md` 为 261 行 / 46324 字节，本次更新前为 270 行 / 48021 字节，均未达归档阈值；`node --test web/src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`node --test scripts/deploy/run-smoke-script.test.mjs`、`cd web && STYLE_L1_SCENARIOS=erp-effective-session-direct-url-redirect,erp-effective-session-empty-pages-blocks-outlet /usr/local/bin/pnpm style:l1`、`cd web && /usr/local/bin/pnpm lint`、`cd web && /usr/local/bin/pnpm css`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh`、`cd web && PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm test` 和 `git diff --check` 通过。
- 下一步：推进真实目标环境 release evidence / smoke / backup restore / rollback rehearsal 缺口；该部分必须用目标环境证据闭合，不能用本地 readiness / smoke 脚本测试替代。
- 阻塞/风险：本轮只补本地前端投影失败闭合和本地 smoke 测试稳定性，不执行真实目标环境 active revision 激活、发布、导入、备份恢复、migration、smoke 或回滚演练。

## 2026-06-29 effective session 动作与字段投影消费

- 完成：`adminProfileSync` 补 `effectiveSessionAllowsAction`、字段策略可见性和列过滤 helper；`hasActionPermission` 改为先过原 RBAC / super admin，再由 active session actions 继续收窄，无 active session 时保留旧 RBAC 行为。
- 完成：销售订单列定义补 `effectiveFieldKey`，销售订单页列表 / 导出列先接入 `sales_orders.default` 字段策略；`customer-config-runtime-manifest` 扩展各责任池 action entitlement，避免 active revision 投影后正式按钮被空 action 清单误隐藏；同步优先级文档、当前真源索引、自动化测试策略和 `web/README.md`。
- 完成：`run-smoke-script.test.mjs` 改为 PATH 注入 fake `curl` 验证报告合同，避免 `fast.sh` 在本机短时间端口压力下偶发依赖临时 HTTP server 连接时序。
- 验证：追加前已检查 `progress.md` 为 271 行 / 48637 字节，未达归档阈值；`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/docs-inventory.test.mjs`、`node --test scripts/deploy/run-smoke-script.test.mjs`、`cd web && /usr/local/bin/pnpm lint`、`cd web && /usr/local/bin/pnpm css`、`cd web && PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm test` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；manifest 编译结果为 15 个 modules、9 个 roles、345 条 entitlements。
- 下一步：继续推进真实目标环境 release evidence / smoke / backup restore / rollback rehearsal，以及真实 active revision 激活后的端到端验证。
- 阻塞/风险：本轮只补本地 runtime manifest 与正式前端消费链路，不执行真实目标环境激活、发布、导入、备份恢复、migration、smoke 或回滚演练；字段策略目前先覆盖销售订单列表 / 导出列，其他页面字段策略仍需按优先级逐步接入。

## 2026-06-29 effective session 主数据字段投影

- 完成：客户 / 供应商主数据已有正式列补 `effectiveFieldKey` 映射，客户编码、显示名、税号、供应商编码和供应商分类可被 active session field policies 收窄；未进入正式页面的 `settlement_note` 等候选字段不接入，避免伪装成已落地字段。
- 完成：`V1MasterDataPage` 在列顺序、导出和表格展示前复用 `filterColumnsByEffectiveFieldPolicy`，按 `${effectiveType}.default` 消费字段策略；无 active session 或无对应策略时保持旧列表行为。
- 验证：追加前已检查 `progress.md` 为 280 行 / 50759 字节，未达归档阈值；`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/moduleTableColumns.test.mjs`、`cd web && /usr/local/bin/pnpm lint`、`node --test scripts/qa/docs-inventory.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：继续按优先级补真实目标环境 release evidence / smoke / backup restore / rollback rehearsal，或在有明确字段真源后再扩展其他正式页面字段策略。
- 阻塞/风险：本轮不改 schema、RBAC、菜单、后端 customer_config、Workflow / Fact usecase 或真实导入；字段策略仍只覆盖已经有正式列和客户字段配置的页面。

## 2026-06-29 runtime manifest 字段策略白名单

- 完成：`customer-config-runtime-manifest` 的 field policy 编译改为显式 runtime surface 白名单，只发布当前前端已消费的 `customers.default`、`suppliers.default` 和 `sales_orders.default`；`sales_order_items` 的产品 / 款式 / 颜色尺码候选继续停留在导入 / 客户评审草案，不进入 active revision 字段策略。
- 完成：`validateRuntimeManifest` 新增字段策略结构守卫，要求三类已消费 surface 存在，并拒绝 `sales_order_items.default` 在未接页面前被发布；单测补充具体字段集合断言，锁住 `style_no` / `color_size` 不被编译为 active policy。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`web/README.md`、`scripts/README.md`、`config/README.md` 和 `config/customers/yoyoosun/README.md`，明确 runtime manifest 不全量发布 catalog fields，未进入页面的销售订单明细字段候选不伪装成已落地字段。
- 验证：追加前已检查 `progress.md` 为 288 行 / 52119 字节，未达归档阈值；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；manifest 编译结果仍为 15 个 modules、9 个 roles、345 条 entitlements。
- 下一步：继续按优先级补真实目标环境 release evidence / smoke / backup restore / rollback rehearsal，或在销售订单明细页面 / 表单字段策略有明确 UI surface 和字段真源后再新增 `sales_order_items.default`。
- 阻塞/风险：本轮不改 schema、RBAC、菜单、Workflow / Fact usecase、真实导入或目标环境激活；字段策略白名单只证明本地 manifest 生成输入不会扩大到未消费字段，不等于真实 active revision 已在目标环境生效。

## 2026-06-29 customer_config 字段策略后端白名单

- 完成：后端 `customer_config` usecase 增加 compiled snapshot field policy 白名单，`validate_customer_config / publish_customer_config` 只接受 `customers.default`、`suppliers.default` 和 `sales_orders.default` 里的已登记字段；`sales_order_items.default`、`style_no`、`color_size` 等未接正式页面的候选字段会被拒绝。
- 完成：`get_effective_session` 输出字段策略时也按同一白名单过滤，避免历史旧 revision 或绕过脚本的数据把非法 field policy 传给正式前端。
- 完成：补 `server/internal/biz/customer_config_test.go` 覆盖非法 surface / field key 被拒绝、旧 revision 非法字段策略被过滤；补 `server/internal/service/jsonrpc_customer_config_test.go` 覆盖 JSON-RPC `publish_customer_config` 拒绝 `sales_order_items.default`；同步优先级文档、当前真源、web / scripts / config README 和 yoyoosun 客户配置 README。
- 验证：追加前已检查 `progress.md` 为 297 行 / 54127 字节，未达归档阈值；`cd server && go test ./internal/biz ./internal/service`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs && node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile` 通过。
- 下一步：继续跑 `docs-inventory`、`git diff --check` 和 `fast.sh` 复核；之后仍需真实目标环境 release evidence / smoke / backup restore / rollback rehearsal 才能证明发布闭环。
- 阻塞/风险：本轮仍不执行真实目标环境 active revision 激活、发布、导入、备份恢复、migration、smoke 或回滚演练；后端白名单只约束 customer config 字段策略，不新增销售订单明细页面字段投影。

## 2026-06-29 customer_config 页面投影后端白名单

- 完成：后端 `customer_config` usecase 增加 compiled snapshot 页面白名单，`validate_customer_config / publish_customer_config` 要求 `compiled_snapshot.pages` 非空且每个 page key 来自 `BuiltinAdminMenus()` 对应正式菜单；缺失、空列表或未知页面会被拒绝。
- 完成：`get_effective_session` 对旧 active revision 的页面清单按同一白名单过滤；旧 revision 缺 pages 或无有效 pages 时不再回退 RBAC 全量页面，返回空页面清单交给正式前端阻断业务 Outlet。
- 完成：补 `server/internal/biz/customer_config_test.go` 覆盖缺 pages、未知 pages、旧 revision 缺 pages 不 fallback；补 `server/internal/service/jsonrpc_customer_config_test.go` 覆盖 JSON-RPC `publish_customer_config` 拒绝未知页面；同步优先级文档、当前真源、web / scripts / config README 和 yoyoosun 客户配置 README。
- 验证：追加前已检查 `progress.md` 为 306 行 / 55893 字节，未达归档阈值；`cd server && go test ./internal/biz ./internal/service`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs && node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、release evidence、smoke、backup restore 和 rollback rehearsal 证据；这些必须用目标环境证据闭合，不能用本地白名单测试替代。
- 阻塞/风险：本轮仍不执行真实目标环境发布、导入、备份恢复、migration、smoke 或回滚演练；页面白名单只证明 customer config 页面投影不会绕过正式菜单 key 或在旧 revision 缺 pages 时放开 RBAC-only 页面。

## 2026-06-29 runtime manifest 页面投影白名单

- 完成：`customer-config-runtime-manifest` 新增 runtime page key 白名单，编译出的 `compiled_snapshot.pages` 必须非空，且每个 page key 都来自正式菜单 key；未知页面会在本地 manifest 校验阶段被拒绝，不等到后端 publish 才失败。
- 完成：`customer-config-runtime-manifest.test.mjs` 补空 pages 和未知 page key 的负向测试；同步优先级文档、当前真源、web / scripts / config README 和 yoyoosun 客户配置 README，把页面投影口径改为 manifest 编译器与后端 validate / publish 双层拒绝。
- 验证：追加前已检查 `progress.md` 为 315 行 / 57788 字节，未达归档阈值；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs && node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、release evidence、smoke、backup restore 和 rollback rehearsal 证据；本地 manifest 白名单只证明上游 payload 形状收窄，不代表目标环境已发布或已激活。
- 阻塞/风险：本轮仍不执行真实目标环境发布、导入、备份恢复、migration、smoke 或回滚演练；manifest 页面白名单需要在后续新增正式页面时同步维护，避免 catalog 页面 key 与后端 `BuiltinAdminMenus()` 漂移。

## 2026-06-29 customer_config 执行后投影验证

- 完成：`customer-config-release-execute` 在 `--execute --activate`、`--execute --activate-only` 和 `--execute --rollback` 成功后追加调用 `get_effective_session`，验证 active revision、source、非空页面投影、页面属于 manifest、字段策略 surface 与 manifest 一致，并在 `customer-config-release-report.json` 写入脱敏 `effectiveSessionVerification`。
- 完成：`customer-config-release-readiness` 的 `--require-activated` 和 `--require-rollback` 不再只看 activate / rollback 返回 active，还要求执行报告里的 `effectiveSessionVerification.status=verified`、configRevision 匹配 manifest、页面投影非空、字段策略 surface 数量匹配；补测试覆盖缺失验证和 revision 不匹配被拒绝。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`scripts/README.md`、`deployments/yoyoosun/evidence/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，明确 activated / rollback ready 需要读回 effective session 投影。
- 验证：追加前已检查 `progress.md` 为 323 行 / 59328 字节，未达归档阈值；`node --test scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 release evidence、smoke、backup restore 和 rollback rehearsal；本轮只让执行报告与 readiness gate 能证明“目标后端 activate 后读回投影”，不替代真实目标环境实际执行。
- 阻塞/风险：本轮不连接目标环境、不执行真实 activate / rollback、不恢复备份、不执行 migration、不跑目标 smoke；effective session 验证使用执行用管理员身份，仍需目标环境 smoke / 浏览器回归证明正式用户入口可用。

## 2026-06-29 目标 smoke effective session 检查

- 完成：`deployments/yoyoosun/scripts/run-smoke.sh` 增加可选 `--customer-config-revision` / `--admin-token-env`，在发布包含客户配置激活时调用目标环境 `customer_config.get_effective_session`，验证期望 active revision、source、非空页面投影和 `customers.default / suppliers.default / sales_orders.default` 字段策略 surface。
- 完成：smoke report 新增脱敏 `customer-config-effective-session` 检查项，只记录 `jsonrpc:customer_config.get_effective_session` target、期望 revision、token 来源 env 名和 `responseBodyStored=false`，不保存 token 或响应正文；同步 smoke report 样例、部署脚本 README、smoke checklist、release evidence README、仓库脚本 README、优先级文档和当前真源索引。
- 验证：追加前已检查 `progress.md` 为 332 行 / 61356 字节，未达归档阈值；`bash -n deployments/yoyoosun/scripts/run-smoke.sh`、`node --test scripts/deploy/run-smoke-script.test.mjs scripts/deploy/deployment-package-lint.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、目标 smoke evidence、backup restore 和 rollback / forward-fix 演练；这些需要目标环境实际执行，不能由本地 fake curl 或 report-only gate 替代。
- 阻塞/风险：本轮仍未连接目标环境、不执行真实发布 / activate / migration / restore / rollback；新增 smoke 只提供目标环境执行时的检查能力和 evidence 口径。

## 2026-06-29 目标 smoke 后端健康检查

- 完成：`deployments/yoyoosun/scripts/run-smoke.sh` 增加可选 `--backend-url`，提供后会检查目标后端 `/healthz` 和 `/readyz`，并优先用该后端 URL 调用 `customer_config.get_effective_session`；未提供时保持原公网 endpoint-only smoke 形态。
- 完成：smoke report 现在可输出 `endpointAlias` 和 `backendEndpointAlias`，检查名统一为 `web-healthz / server-healthz / server-readyz / login-page / mobile-role-route / customer-config-effective-session`，与 smoke report 样例和 release evidence 测试口径对齐；同步部署脚本 README、evidence README、脚本总 README 和 smoke report example。
- 验证：追加前已检查 `progress.md` 为 340 行 / 63018 字节，未达归档阈值；`bash -n deployments/yoyoosun/scripts/run-smoke.sh`、`node --test scripts/deploy/run-smoke-script.test.mjs scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、目标 smoke evidence、backup restore 和 rollback / forward-fix 演练；目标 smoke 现在具备 web 入口、后端 health/ready 和 effective session 三类检查能力，但仍需要在真实目标环境执行。
- 阻塞/风险：本轮不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；新增 `--backend-url` 只让真实 smoke report 更完整，不替代目标环境实际证据。
