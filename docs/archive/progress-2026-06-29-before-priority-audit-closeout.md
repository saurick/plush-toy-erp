# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排仍按 `docs/product/多甲方角色能力流程编排优先级.md` 推进；参考文档只作为输入，当前真源仍回到代码、migration、测试和正式文档。
- 客户配置主路径已分层为 raw 客户包预检、runtime manifest 编译、后端 `customer_config` validate / publish / activate / rollback / effective session。
- 真实客户数据导入、任意文件 upload、生产发布 preflight、备份恢复、回滚演练和目标环境 migration 仍未执行，不能被本地 dry-run 或 manifest 编译替代。

## 2026-06-29 readiness 强制目标 smoke 投影证据

- 完成：`customer-config-release-readiness` 在 `--require-activated` 或 `--require-rollback` 时，除执行器报告的 `effectiveSessionVerification` 外，还会读取 release evidence 目录里的 `smoke-test-report.json`，强制要求存在通过态 `customer-config-effective-session` 检查。
- 完成：目标 smoke 检查必须满足 `target=jsonrpc:customer_config.get_effective_session`、`expectedRevision` 等于当前 manifest revision、记录 `tokenSourceEnv` 且 `responseBodyStored=false`；缺失检查或 revision 不匹配都会拒绝 activated / rollback readiness。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，把 target smoke 从“建议补跑”提升为 activated / rollback readiness 的强证据。
- 验证：追加前已检查 `progress.md` 为 348 行 / 64657 字节，未达归档阈值；`node --test scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/run-smoke-script.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke report、backup restore 和 rollback / forward-fix 演练；readiness 现在会拒绝缺少 target smoke 的 activated / rollback 声明，但仍需要实际目标环境执行生成证据。
- 阻塞/风险：本轮不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；强校验只防止证据包漏填，不代表当前已有目标环境证据。

## 2026-06-29 rollback rehearsal 绑定客户配置读回证据

- 完成：`rollback-rehearsal-report.mjs` 增加 `--customer-config-revision` 防呆，显式传入时必须是非占位 revision；post-smoke report 必须包含通过态 `customer-config-effective-session`，且 `target=jsonrpc:customer_config.get_effective_session`、`expectedRevision` 匹配、记录 token 来源 env 名并声明 `responseBodyStored=false`。
- 完成：`release-evidence-gate` 在 smoke report 含客户配置读回检查时，会要求 `rollback-rehearsal-report.json` 同步带 `postCheck.customerConfigEffectiveSession`，并校验 target 与 expectedRevision 一致，避免只做发布后 smoke、但回滚 / 前向修复演练没有读回 active revision 证据。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`deployments/yoyoosun/evidence/releases/rollback-forward-fix-plan-template.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 357 行 / 66625 字节，未达归档阈值；`node --test scripts/deploy/rollback-rehearsal-report.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --test scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/rollback-rehearsal-report.test.mjs scripts/deploy/run-smoke-script.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`node --test scripts/deploy/deployment-package-lint.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；新增 gate 只防止 release evidence 和 rollback rehearsal 漏证据，不代表真实目标环境已有通过报告。

## 2026-06-29 rollback rehearsal post-smoke 可追溯性

- 完成：`release-evidence-gate` 要求 `rollback-rehearsal-report.json` 的 `postCheck.smokeReport` 非占位、`postCheck.smokeCheckCount` 为正数，并且 `smokeCheckCount` 必须等于同目录 `smoke-test-report.json` 的 checks 数量，避免手写 `smokeStatus=passed` 但没有可追溯 post-smoke report。
- 完成：同步 release evidence gate、customer config readiness 测试 fixture，并补负向用例覆盖缺少 `postCheck.smokeReport` 和 smoke 数量不一致；同步 `scripts/README.md`、yoyoosun evidence README、release evidence README、优先级文档和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 366 行 / 68717 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/rollback-rehearsal-report.test.mjs` 通过。
- 下一步：继续跑 docs inventory、diff check 和 fast；之后继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；该门禁只证明证据包字段互相一致，不代表目标环境已经完成演练。

## 2026-06-29 rollback rehearsal smoke report 路径绑定

- 完成：`release-evidence-gate` 进一步要求 `rollback-rehearsal-report.json` 的 `postCheck.smokeReport` 必须指向同一 release evidence 目录内的 `smoke-test-report.json`，并继续要求 `postCheck.smokeCheckCount` 与该文件 checks 数量一致，避免复用其他批次 post-smoke report。
- 完成：补负向测试覆盖 rollback rehearsal 指向其他 release 目录 smoke report 被拒绝；同步 `scripts/README.md`、yoyoosun evidence README、release evidence README、优先级文档和当前真源补充口径。
- 验证：追加前已检查 `progress.md` 为 374 行 / 70071 字节，未达归档阈值；追加后复核为 382 行 / 71411 字节，仍未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/rollback-rehearsal-report.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；路径绑定只证明脱敏证据属于同一 release evidence 目录，不代表目标环境已完成演练。

## 2026-06-29 rollback rehearsal 生成器路径提前防呆

- 完成：`rollback-rehearsal-report.mjs` 在生成报告前提前拒绝绝对 `--post-smoke-report`、非 `smoke-test-report.json` 文件名，以及无法解析到输出目录同层 `smoke-test-report.json` 的路径，避免生成后才被 release evidence gate 拒绝。
- 完成：补测试覆盖绝对路径、错误文件名和跳出输出目录的 post-smoke 路径；同步 `scripts/README.md`，明确生成器本身也会执行这层路径防呆。
- 验证：追加前已检查 `progress.md` 为 382 行 / 71466 字节，未达归档阈值；追加后复核为 390 行 / 72619 字节，仍未达归档阈值；`node --test scripts/deploy/rollback-rehearsal-report.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / migration / restore / rollback；生成器路径防呆只减少错误证据写入，不代表目标环境已有演练结果。

## 2026-06-29 backup restore rehearsal migration 合同收口

- 完成：`run-backup-restore-rehearsal.sh` 默认 `--backup-purpose` 改为 `pre-migration`，并提前拒绝非 pre-migration / pre-deploy / 发布前 / migration 前语义，避免生成后被 release evidence gate 判为非发布前备份。
- 完成：恢复演练脚本在隔离库恢复 dump 后先记录 `migration-status-before-apply.txt` 和 migrationBefore，再执行 `atlas migrate apply`，最后生成 release gate 使用的 `migration-status.txt` 和 restore migrationAfter；`backup-evidence.md` 记录 migrationBefore，`backup-restore-report.json` 记录 migrationAfter。
- 完成：补脚本轻量测试覆盖非法 backup purpose、`atlas migrate apply` 主路径和新增 migrationBefore / migrationAfter 字段；同步 yoyoosun 部署脚本 README、备份恢复 runbook 和仓库脚本说明。
- 验证：追加前已检查 `progress.md` 为 390 行 / 72760 字节，未达归档阈值；追加后复核为 399 行 / 74487 字节，仍未达归档阈值；`node --test scripts/deploy/backup-restore-rehearsal-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`bash -n deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实 pg_dump / Docker restore / atlas apply / 发布 / activate；脚本合同收口只保证未来真实演练输出更接近 release gate 口径，不代表目标环境已有恢复演练结果。

## 2026-06-29 backup restore pre-apply evidence gate

- 完成：`release-evidence-gate` 将 `migration-status-before-apply.txt` 升级为 backup restore 必要 artifact，要求 `backup-restore-report.json artifacts.preMigrationStatus` 指向当前 release evidence 目录内真实存在的相对路径，并解析其中 `Current Version` 匹配 release `migrationBefore`。
- 完成：gate 进一步要求 `backup-restore-report.json backup.migrationVersion` 和 `restore.migrationBeforeApply` 都等于 release `migrationBefore`，同时保持 `restore.restoreMigrationVersion=migrationAfter`，避免只用迁移后状态证明恢复演练。
- 完成：同步 `collect-evidence.sh` 草稿、release evidence 模板、部署包 lint、备份恢复 checklist、yoyoosun evidence README、runbook、脚本 README、优先级文档和当前真源摘要。
- 验证：追加前已检查 `progress.md` 为 399 行 / 74542 字节，未达归档阈值；追加后复核为 408 行 / 76179 字节，仍未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/backup-restore-rehearsal-script.test.mjs`、`node --test scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`bash -n deployments/yoyoosun/scripts/collect-evidence.sh deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实 pg_dump / Docker restore / atlas apply / 发布 / activate；新增 gate 只防止 release evidence 漏 pre-apply migration 证据，不代表目标环境已有恢复演练结果。

## 2026-06-29 backup restore artifact 内容一致性

- 完成：`release-evidence-gate` 现在会扫描 backup restore artifact 文件内容，拒绝完整 DSN / secret，并解析 `artifacts.migrationStatus`，要求 `Current Version=migrationAfter` 且 `Pending Files=0`。
- 完成：补负向测试覆盖 post-apply migration artifact 版本不一致、pending 不为 0、command summary 泄露完整 DSN；同步 yoyoosun evidence README、脚本 README、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 408 行 / 76720 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-release-execute.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / pg_dump / Docker restore / atlas apply；门禁增强只证明证据包自洽，不代表真实目标环境已有恢复演练结果。

## 2026-06-29 command summary 身份与步骤门禁

- 完成：`release-evidence-gate` 现在解析 `artifacts.commandSummary` 的 `backupId / releaseVersion / sourceAlias / restoreTarget / steps`，要求命令摘要绑定同一 release、备份、来源和恢复目标，并包含 pg_dump、restore、atlas、smoke 脱敏步骤。
- 完成：`run-backup-restore-rehearsal.sh` 生成结构化 `command-summary.txt`，相关 release / customer config 测试 fixture 和部署 runbook、evidence README、脚本 README、优先级文档、当前真源摘要已同步。
- 验证：追加前 `progress.md` 为 416 行 / 78103 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/backup-restore-rehearsal-script.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-release-execute.test.mjs`、`bash -n deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh deployments/yoyoosun/scripts/collect-evidence.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / pg_dump / Docker restore / atlas apply / rollback；命令摘要门禁只证明脱敏证据包自洽，不代表目标环境已有恢复演练结果。

## 2026-06-29 release execute 与目标 smoke endpoint 绑定

- 完成：`customer-config-release-execute` 拒绝带账号密码的 `--backend-url`，并把脱敏 `backendEndpointAlias` 写入执行报告；`customer-config-release-readiness --require-executed / --require-activated / --require-rollback` 会要求执行报告带 backend endpoint，且激活 / 回滚后与目标 smoke report 的 `backendEndpointAlias` 一致。
- 完成：补负向测试覆盖执行报告与目标 smoke backend 不一致；同步 yoyoosun evidence README、release evidence README、脚本 README、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 424 行 / 79748 字节，未达归档阈值；`node --test scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/run-smoke-script.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs` 和 `git diff --check` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / rollback；endpoint 绑定只防止跨环境拼接证据，不代表目标环境已经完成发布或演练。

## 2026-06-29 progress 超阈值归档

- 完成：按项目规则将早期 2026-06-29 release evidence / 导入恢复 / 文档清单 / 恢复与回滚门禁硬化流水归档到 `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`，`progress.md` 仅保留活跃事项、归档索引和最近目标环境证据绑定相关记录。
- 验证：归档前 `progress.md` 为 432 行 / 81058 字节，已超过 80KB 阈值；归档后需重新运行 docs inventory 和 diff check。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本或正式业务真源。

## 2026-06-29 目标 smoke URL 凭据门禁

- 完成：`deployments/yoyoosun/scripts/run-smoke.sh` 在生成 smoke report 前拒绝带 URL 账号密码的 `--endpoint` / `--backend-url`；`release-evidence-gate` 要求 `smoke-test-report.json endpointAlias` 非空，并会拒绝 `endpointAlias`、`backendEndpointAlias` 或 URL check target 中出现 basic-auth userinfo，避免目标环境 smoke 证据保存凭据或丢失目标入口 alias。
- 完成：`deployment-package-lint` 同步要求 smoke 示例包含 endpoint alias、URL / path target 的 httpCode、无 URL 账号密码和脱敏声明，防止模板 / 样例落后于 release gate；同步 yoyoosun 部署脚本 README、release evidence README、仓库脚本说明、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 106 行 / 18661 字节，未达归档阈值；`node --test scripts/deploy/deployment-package-lint.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/run-smoke-script.test.mjs`、`node --test scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`bash -n deployments/yoyoosun/scripts/run-smoke.sh`、`node --check scripts/deploy/deployment-package-lint.mjs`、`node --check scripts/deploy/release-evidence-gate.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / rollback / restore；URL 凭据门禁只防止证据泄密和错误脱敏，不代表目标环境已经完成发布或演练。

## 2026-06-29 image digest artifact 证据绑定

- 完成：`release-evidence-gate` 新增必需 `image-digests.txt`，要求其中 `serverImageDigest` / `webImageDigest` 是 `sha256:<64-hex>`，并与 `release-evidence.md` 的 server / web image digest 完全一致，避免只在 release 表里手填 digest 而没有独立构建 / registry 摘要证据。
- 完成：`collect-evidence.sh` 草稿、release evidence 模板、部署资料包 lint、相关 release / activation / readiness / collect evidence 测试 fixture 已同步；yoyoosun evidence README、release evidence README、`scripts/README.md`、优先级文档和当前真源摘要已补充 image digest artifact 绑定口径。
- 验证：追加前 `progress.md` 为 114 行 / 20634 字节，未达归档阈值；待本轮 targeted release gate、docs inventory、diff check 和 fast QA 复跑。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布 / activate / rollback / restore；image digest artifact 门禁只证明脱敏 release evidence 内部 digest 一致，不代表镜像已经在目标环境部署或完成 smoke。

## 2026-06-29 image digest evidence 生成器

- 完成：新增 `scripts/deploy/image-digests-evidence.mjs`，用已确认的 server / web image ref 和 `sha256:<64-hex>` digest 生成 release gate 可读取的 `image-digests.txt`；如果同目录 `release-evidence.md` 已填 digest，会校验两处一致，避免后续真实发布仍靠手工拼 artifact。
- 完成：新增 `image-digests-evidence.test.mjs` 并接入 `fast.sh`；同步 yoyoosun release evidence README、部署脚本 README、`collect-evidence.sh` 占位提示、`scripts/README.md`、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 122 行 / 21899 字节，未达归档阈值；`node --test scripts/deploy/image-digests-evidence.test.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/collect-evidence-script.test.mjs`、`node --check scripts/deploy/image-digests-evidence.mjs`、`bash -n deployments/yoyoosun/scripts/collect-evidence.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：生成器不构建镜像、不访问 registry、不读取 `.env`，只生成脱敏 artifact；它不能证明镜像已部署到目标环境，也不替代真实目标环境 smoke。

## 2026-06-29 backup restore rehearsal artifact 落盘

- 完成：`run-backup-restore-rehearsal.sh` 新增 `--evidence-dir`，真实恢复演练仍把 dump 留在 ignored `output/`，但会把 `backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json` 复制到指定 release evidence 目录，减少人工复制相对路径和批次身份的错误。
- 完成：补测试覆盖 `--evidence-dir` 帮助文案、目录不存在提前拒绝、只复制脱敏 artifact 且不复制 dump；同步 yoyoosun 恢复 runbook、release evidence README、部署脚本 README、`scripts/README.md`、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 130 行 / 23276 字节，未达归档阈值；`node --test scripts/deploy/backup-restore-rehearsal-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`bash -n deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不执行真实 `pg_dump`、Docker restore、Atlas apply 或目标环境 smoke；`--evidence-dir` 只降低真实演练后 evidence 归档错误，不代表恢复演练已经发生。

## 2026-06-29 rollback rehearsal report artifact 落盘

- 完成：`rollback-rehearsal-report.mjs` 新增 `--evidence-dir`，真实 rollback / forward-fix 演练和 post-smoke 后可默认写入同目录 `rollback-rehearsal-report.json`，并继续校验 post-smoke report 与输出目录绑定。
- 完成：补测试覆盖默认输出路径、CLI 写入 evidence dir、缺失 evidence dir 提前拒绝；同步 yoyoosun release evidence README、`scripts/README.md`、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 138 行 / 24680 字节，未达归档阈值；`node --test scripts/deploy/rollback-rehearsal-report.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --check scripts/deploy/rollback-rehearsal-report.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不执行真实回滚、恢复、migration 或后端调用；`--evidence-dir` 只降低已完成演练后的 evidence 落盘错误，不代表回滚 / 前向修复演练已经发生。

## 2026-06-29 production preflight report 落盘

- 完成：`production-preflight.sh` 新增 `--out`，真实运行时 `.env` preflight 可直接把脱敏检查输出写入 release evidence 目录的 `production-preflight-report.txt`，不再依赖调用者手工重定向。
- 完成：补测试覆盖 `--out` 成功写入、报告不包含 fixture password、输出目录不存在提前拒绝；同步 yoyoosun evidence README、release evidence README、`collect-evidence.sh` 草稿、`scripts/README.md`、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 146 行 / 25884 字节，未达归档阈值；追加后为 154 行 / 27296 字节，仍未达归档阈值；`node --test scripts/deploy/production-preflight.test.mjs scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`bash -n scripts/deploy/production-preflight.sh deployments/yoyoosun/scripts/collect-evidence.sh`、`node --check scripts/deploy/rollback-rehearsal-report.mjs scripts/deploy/image-digests-evidence.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：`--out` 只落盘当前 preflight 的脱敏结果，不保存 `.env`、secret 或完整 DSN；它不能证明目标环境已经发布、迁移、smoke 或完成恢复 / 回滚演练。

## 2026-06-29 release evidence status 只读检查

- 完成：新增 `release-evidence-status.mjs`，只读检查 release evidence 目录，输出 `missing / incomplete / draft / ready`、缺失 artifact、gate 错误数量和下一步命令；支持 `--json` 和 `--fail-on-not-ready`，但不执行发布、preflight、恢复、migration、后端调用、smoke 或 rollback。
- 完成：导出 `release-evidence-gate` 的必需 artifact 清单供 status 复用，避免 status 和 gate 分叉；新增测试覆盖缺目录、草稿 evidence、缺失 artifact、JSON 输出和 not-ready 非 0；接入 `fast.sh` / `strict.sh`，同步 yoyoosun evidence README、release evidence README、`scripts/README.md`、优先级文档和当前真源摘要。
- 验证：追加前 `progress.md` 为 154 行 / 27634 字节，未达归档阈值；追加后为 162 行 / 29226 字节，仍未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs scripts/deploy/release-evidence-gate.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：status 只提高证据目录的可判定性；`ready` 只能表示脱敏 evidence gate 通过，仍不替代真实目标环境发布、migration、smoke、恢复演练或回滚 / 前向修复演练本身。

## 2026-06-29 多甲方角色能力优先级落地证据审计

- 完成：新增 `scripts/qa/multi-client-role-workflow-priority-audit.mjs` 和测试，把 `docs/product/多甲方角色能力流程编排优先级.md` 的关键落地点收口成只读审计：Workflow action 合同、责任池可见性、engineering 最小入口、客户配置 Ent / Atlas / JSON-RPC / 前端投影必须找到当前代码证据；领域命令闭环保持 guarded；目标环境发布仍标记为 evidence-required。
- 完成：`fast.sh` / `strict.sh` 接入该审计；`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md` 同步说明该审计只读，不调用后端、不执行 migration、不发布客户配置、不导入真实数据、不跑目标环境 smoke，也不证明领域事实过账已经完成。
- 验证：追加前 `progress.md` 为 162 行 / 29353 字节，未达归档阈值；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/docs-inventory.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`bash -n scripts/qa/fast.sh scripts/qa/strict.sh`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续按优先级文档推进时，先跑该审计确认文档和代码证据没有漂移；真正进入领域命令或发布执行时，仍要按对应领域 usecase / RBAC / 审计 / 幂等 / 目标环境 evidence 单独闭环。
- 阻塞/风险：该审计只证明“当前仓库已有落点和边界仍匹配”，不替代真实业务事实写入、目标环境发布、备份恢复、migration、smoke 或 rollback / forward-fix 演练。

## 2026-06-29 full QA 主路径收口

- 完成：`scripts/qa/full.sh` 改为先执行 `scripts/qa/fast.sh`，再补 secrets / govulncheck、前端 test / build 和服务端 `go test ./...` / `make build`，避免 full 与 fast 各维护一套检查清单导致 priority audit、release evidence status、客户配置和发布门禁在提交前路径漏跑。
- 完成：同步 `scripts/README.md` 的 full 描述，明确 full 包含 fast，并把额外检查收口为 secrets / govulncheck、前端测试构建和服务端全量构建；不再写不存在的 shell / YAML 额外检查。
- 验证：追加前 `progress.md` 为 170 行 / 31203 字节，未达归档阈值；`bash -n scripts/qa/full.sh scripts/qa/fast.sh scripts/qa/strict.sh`、`bash scripts/qa/full.sh --help`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/docs-inventory.test.mjs`、`git diff --check`、`PATH=/usr/local/bin:$PATH bash scripts/qa/full.sh` 和追加后 `node --test scripts/qa/docs-inventory.test.mjs` 已通过。
- 下一步：后续提交前直接以 `full.sh` 作为包含 fast 的主路径；发版前仍用 `strict.sh` 加目标环境 release evidence / smoke / 备份恢复 / rollback 证据。
- 阻塞/风险：full 通过仍是本地 / 构建级证据，不替代真实目标环境发布、migration、smoke、备份恢复或回滚 / 前向修复演练。

## 2026-06-29 release evidence status 范围声明强化

- 完成：`release-evidence-status.mjs` 的 JSON 和文本输出新增 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisHelper`，明确 `ready` 只表示当前 evidence 目录通过 release evidence gate，不证明 status 脚本执行过目标环境发布、migration、smoke、恢复演练、回滚 / 前向修复或客户配置激活 / 回滚。
- 完成：补测试锁住 JSON scope 和 CLI 文本输出；同步 `scripts/README.md`、yoyoosun evidence README 和 release evidence README，避免后续把只读 status 误当成目标环境执行证据。
- 验证：追加前 `progress.md` 为 178 行 / 32597 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；status 现在能更清楚列出证据状态，但真实执行仍必须另跑发布 / 恢复 / smoke / 回滚流程。
- 阻塞/风险：本轮不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate；新增 scope 只是降低误读风险，不产生目标环境证据。

## 2026-06-29 customer config readiness 范围声明强化

- 完成：`customer-config-release-readiness.mjs` 新增 `--json`，返回 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`；默认文本输出也会明确 readiness 只证明 manifest、manifest evidence、release evidence、activation gate 和请求的执行报告证据通过，不代表该 gate 执行过目标发布、migration、恢复、smoke、回滚或 Workflow / Fact 写入。
- 完成：补测试覆盖 parse 参数、函数返回 scope、CLI JSON 和文本范围声明；同步 `scripts/README.md`、yoyoosun evidence README 和 release evidence README。
- 验证：追加前 `progress.md` 为 186 行 / 34052 字节，未达归档阈值；`node --test scripts/deploy/customer-config-release-readiness.test.mjs`、`node --check scripts/deploy/customer-config-release-readiness.mjs scripts/deploy/customer-config-release-readiness.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；若要声明已激活或已回滚，仍必须用执行器报告和目标 smoke evidence 触发 `--require-activated / --require-rollback`。
- 阻塞/风险：本轮不连接目标环境、不调用后端、不执行真实 publish / activate / rollback / migration / restore / smoke；新增 JSON/scope 只降低 readiness 被误读成执行动作的风险。

## 2026-06-29 release evidence gate 范围声明强化

- 完成：`release-evidence-gate.mjs` 新增 `--json`，返回 `scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`；默认文本输出也会明确 gate 只校验脱敏证据目录的一致性、脱敏和占位检查，不执行目标环境发布、migration、smoke、恢复演练、回滚 / 前向修复或客户配置激活。
- 完成：补 CLI JSON / text 测试和函数返回 scope 断言；同步 `scripts/README.md`、yoyoosun evidence README 和 release evidence README。
- 验证：追加前 `progress.md` 为 194 行 / 35631 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs`、`node --check scripts/deploy/release-evidence-gate.mjs scripts/deploy/release-evidence-gate.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；后续自动化读取底层 gate 时应优先使用 `--json` 并保留 scope 说明。
- 阻塞/风险：本轮不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate；新增 JSON / scope 只降低 gate 被误读成执行动作的风险，不产生目标环境证据。

## 2026-06-29 priority audit 范围声明强化

- 完成：`multi-client-role-workflow-priority-audit.mjs` 新增 `scope.readOnly`、`scope.executableEvidenceOnly`、`readyMeaning` 和 `notProvenByThisAudit`；默认文本输出和 `--json` 都明确 audit 只证明优先级文档里的 ready / guarded / evidence-required 项与当前仓库证据对齐，不执行目标环境发布、migration、smoke、恢复 / 回滚演练、客户配置激活 / 回滚、真实客户导入或领域事实过账。
- 完成：补函数返回、CLI JSON 和默认文本输出测试；同步 `scripts/README.md`、`docs/product/自动化测试策略.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：追加前 `progress.md` 为 202 行 / 37051 字节，未达归档阈值；追加后为 210 行 / 38653 字节，仍未达归档阈值；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；后续机器消费优先级审计时应读取 `scope`，不能只看 `ok=true`。
- 阻塞/风险：本轮不连接目标环境、不执行真实发布、migration、restore、smoke、rollback、customer config activate / rollback 或真实客户导入；新增 scope 只降低 priority audit 被误读成全量完成的风险。

## 2026-06-29 release evidence status smoke 命令修正

- 完成：修正 `release-evidence-status.mjs` 在缺少 `smoke-test-report.json` 时给出的下一步命令，把不存在的 `run-smoke.sh --out` 改为真实脚本支持的 `--report`。
- 完成：补测试锁住 next command 必须包含 `--report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json`，并明确不允许 `run-smoke.sh ... --out` 回退。
- 验证：追加前 `progress.md` 为 210 行 / 38738 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；status helper 的 next command 现在可直接作为 smoke report 落盘入口。
- 阻塞/风险：本轮不运行真实 target smoke，不连接目标环境；只是修正本地只读 helper 的执行提示，避免后续真实 smoke 执行前被错误参数卡住。

## 2026-06-29 release evidence status 支撑 artifact 缺失提示

- 完成：`release-evidence-status.mjs` 把恢复演练支撑 artifact `migration-status-before-apply.txt` 和 `command-summary.txt` 纳入缺失判断；缺少这些文件时，下一步命令会提示重新执行恢复演练，而不是只给出最终 gate 命令。
- 完成：恢复演练 next command 显式包含 `--backup-purpose pre-migration`，与 release gate 要求的 pre-migration backup / restore 语义一致；补测试锁住支撑 artifact 缺失、`--backup-purpose pre-migration` 和 `--evidence-dir` 提示。
- 完成：同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，说明 status helper 会检查这两个支撑 artifact，但仍只读、不执行恢复、migration、smoke、回滚或发布。
- 验证：追加前 `progress.md` 为 218 行 / 39996 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；status helper 现在能更早提示恢复演练 evidence 缺口。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实恢复、migration、smoke、rollback 或 customer config activate；status 的 `ready` 依旧只表示脱敏 evidence gate 通过，不代表真实发布动作已经发生。

## 2026-06-29 release evidence status 模板型缺失提示

- 完成：`release-evidence-status.mjs` 在缺少 `rollback-forward-fix-plan.md` 或 `release-signoff-checklist.md` 时，新增从对应模板复制草稿的 next command，不再只提示最终 release evidence gate。
- 完成：补测试覆盖单独缺回滚 / 前向修复计划和发布签收清单时的 missingFiles 与模板复制命令；同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，明确复制模板后仍要人工补真实 release、environment、backupId、处置计划、签收结论和勾选项。
- 验证：追加前 `progress.md` 为 227 行 / 41672 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；status helper 现在能把缺模板、缺恢复演练、缺 smoke 分流到更具体的下一步。
- 阻塞/风险：模板复制只生成草稿入口，不是签收或回滚计划通过；本轮仍不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate。

## 2026-06-29 release evidence status 主证据模板提示

- 完成：`release-evidence-status.mjs` 在已有 evidence 目录单独缺少 `release-evidence.md` 时，新增从 `release-evidence-template.md` 复制草稿的 next command，避免只提示最终 release evidence gate。
- 完成：补测试覆盖缺 `release-evidence.md` 时的 missingFiles 和模板复制命令；同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，明确复制后仍要人工补真实 release、environment、git commit、image digest、migration、backupId 和结论字段。
- 验证：追加前 `progress.md` 为 235 行 / 43148 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据；status helper 现在能把缺主证据、缺模板、缺恢复演练和缺 smoke 分流到更具体的下一步。
- 阻塞/风险：模板复制只生成草稿入口，不是发布证据通过；本轮仍不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate。

## 2026-06-29 release evidence status 客户配置 smoke 提示

- 完成：`release-evidence-status.mjs` 读取同目录可选 `customer-config-manifest-evidence.json` 的 `revision`；当缺少 `smoke-test-report.json` 时，next command 会带 `--backend-url <backend-endpoint>`、`--customer-config-revision <revision>`、`--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN`，提醒真实目标 smoke 读回 `customer_config.get_effective_session`。
- 完成：补测试覆盖有 manifest evidence 且缺 smoke 的 next command；同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`。
- 验证：追加前 `progress.md` 为 243 行 / 44611 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、针对本轮文件的 `git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮不连接目标环境、不执行真实 smoke / 后端调用；status 只生成更准确的下一步命令，不证明 active revision 已生效。

## 2026-06-29 release evidence status manifest evidence warning

- 完成：`release-evidence-status.mjs` 在同目录 `customer-config-manifest-evidence.json` 存在但 JSON 损坏或缺少 `revision` 时输出 `warnings`，并把重新运行 `customer-config-manifest-evidence.mjs` 加入 next commands，避免静默把客户配置发布降级成普通 smoke。
- 完成：补测试覆盖 manifest evidence 无法解析和缺 revision 两种场景；同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`。
- 验证：追加前 `progress.md` 为 251 行 / 45965 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs` 和 `node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs` 已通过。
- 下一步：继续跑 docs inventory、diff check 和 fast；之后继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：warning 只证明本地 status helper 能识别坏证据文件，不执行 manifest 生成、后端激活、目标 smoke 或回滚演练。

## 2026-06-29 release evidence status smoke 与 manifest evidence 交叉检查

- 完成：`release-evidence-status.mjs` 解析同目录 `smoke-test-report.json` 的 `customer-config-effective-session` 检查；一旦目标 smoke 已声明客户配置读回，就会反查 `customer-config-manifest-evidence.json` 是否存在，且 revision 是否匹配 smoke 的 `expectedRevision`。
- 完成：缺 manifest evidence 或 revision 不一致时输出 `warnings`，并把重新运行 `customer-config-manifest-evidence.mjs` 加入 next commands；补测试覆盖 smoke 已含客户配置读回但 manifest evidence 缺失、以及 manifest revision 与 smoke expectedRevision 不一致。
- 完成：同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，说明 status 不会把已有客户配置目标 smoke 与缺失 / 不一致 manifest evidence 静默视为普通发布证据。
- 验证：追加前 `progress.md` 为 259 行 / 47134 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs` 和 `node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs` 已通过。
- 下一步：继续跑 docs inventory、diff check 和 fast；之后继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：该交叉检查只提高本地 status helper 的证据提示准确性，不生成 manifest evidence，不执行目标 smoke、后端激活、恢复或回滚演练。

## 2026-06-29 release evidence status attention 状态

- 完成：`release-evidence-status.mjs` 新增 `attention` 状态；当 release evidence gate 已通过但 status 发现额外 warning 时，`status=attention`、`gateReady=true`、`ready=false`。
- 完成：`--fail-on-not-ready` 现在会对 `attention` 返回非 0，避免机器只看 exit code 时把“gate 通过但客户配置 manifest / smoke 交叉证据有 warning”的目录当成 ready。
- 完成：补 gate-passed fixture 测试，覆盖 smoke 已包含 `customer-config-effective-session` 但缺 manifest evidence 时，status 不再 ready；同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`。
- 验证：追加前 `progress.md` 为 268 行 / 48703 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs` 和 `node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs` 已通过。
- 下一步：继续跑 docs inventory、diff check 和 fast；之后继续补真实目标环境 active revision 激活、真实 target smoke、backup restore 和 rollback / forward-fix 演练证据。
- 阻塞/风险：`attention` 仍是本地只读状态，不执行真实发布、目标 smoke、恢复演练或客户配置激活。

## 2026-06-29 release evidence gate 客户配置 manifest evidence 强制绑定

- 完成：`release-evidence-gate.mjs` 在 `smoke-test-report.json` 出现 `customer-config-effective-session` 时，强制要求同目录 `customer-config-manifest-evidence.json` 存在，并校验 customer key、revision、manifest sha256、approved 审查状态和脱敏声明。
- 完成：补测试覆盖客户配置 smoke 缺 manifest evidence、manifest revision 与 smoke `expectedRevision` 不一致、以及补齐后通过；同步 status 的 gate-passed warning 用例，使 `attention` 继续覆盖“gate 通过但存在额外 warning”的真实场景。
- 完成：同步 `customer-config-release-readiness.test.mjs` 的负例断言，接受目标 smoke revision 不匹配现在会被 activation / release gate 更早拦截的错误文案。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md` 和 `docs/当前真源与交接顺序.md`，明确 gate 本身会拒绝缺失、不匹配或未脱敏审查通过的客户配置 manifest evidence，不再只依赖 status warning。
- 验证：追加前 `progress.md` 为 277 行 / 50010 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/deploy/customer-config-release-readiness.test.mjs`、`node --check scripts/deploy/release-evidence-gate.mjs scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 active revision、目标 smoke、备份恢复和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍只强化本地脱敏 evidence gate，不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate。

## 2026-06-29 release evidence status closeout checklist

- 完成：`release-evidence-status.mjs` 新增 `closeoutChecklist`，按不可变版本、production preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复、签收，以及需要时的客户配置 active revision 读回分组，输出 `missing / present-unverified / attention / gate-verified`。
- 完成：文本输出新增 `closeout evidence checklist` 小节，JSON 输出新增同名结构化字段；补测试覆盖缺 evidence 目录时的分组缺口、完整 gate 通过时的 `gate-verified` 分组，以及 CLI 文本输出。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，说明 checklist 只读分组证据，不执行目标环境动作。
- 验证：追加前 `progress.md` 为 287 行 / 52040 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过；实际 `deployments/yoyoosun/evidence/releases/2026-06-16` 目录当前不存在，status JSON 已按 6 组 closeout checklist 标出 missing。
- 下一步：仍需真实目标环境 release evidence 目录填充、目标 smoke、备份恢复和 rollback / forward-fix 演练。
- 阻塞/风险：checklist 只整理 evidence 状态，不执行 preflight、备份恢复、migration、smoke、rollback、发布或客户配置激活；真实目标环境证据仍未生成。

## 2026-06-29 多甲方优先级审计绑定 release closeout checklist

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `release-evidence-target-remains-evidence-required` 检查不再只确认 release status/gate 文件存在，还要求 status helper 包含 `closeoutChecklist`、备份恢复 / migration、目标 smoke、客户配置读回和 not-proven scope。
- 完成：补测试明确 release evidence 项仍是 `evidence-required`，并引用 `scripts/deploy/release-evidence-status.mjs` 作为证据，避免把目标环境缺口误归为 ready。
- 验证：追加前 `progress.md` 为 296 行 / 53882 字节，未达归档阈值；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/deploy/release-evidence-status.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：真实目标环境 release evidence、target smoke、备份恢复和 rollback / forward-fix 演练仍需后续执行。
- 阻塞/风险：该审计仍是 read-only executable evidence audit，不调用后端、不执行 migration、不发布客户配置、不跑目标环境 smoke、不恢复备份。

## 2026-06-29 release evidence status closeout summary

- 完成：`release-evidence-status.mjs` 新增 `closeoutSummary`，从 `closeoutChecklist` 派生总项、missing、present-unverified、attention、gate-verified、blockers 和 ready，文本输出同步显示 `closeout: x/y gate-verified; blockers=n`。
- 完成：`multi-client-role-workflow-priority-audit.mjs` 现在要求 release status helper 同时具备 `closeoutChecklist` 和 `closeoutSummary`，确保“按优先级继续做”时能机器可读地区分 ready / guarded / evidence-required。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 summary 只用于判断 evidence 下一步，不替代真实目标环境发布、migration、smoke、恢复或回滚演练。
- 验证：追加前 `progress.md` 为 304 行 / 55428 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/deploy/release-evidence-status.mjs --evidence-dir deployments/yoyoosun/evidence/releases/2026-06-16 --json`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：当前 `deployments/yoyoosun/evidence/releases/2026-06-16` 仍不存在，`closeoutSummary` 显示 6 个证据组全是 missing；后续需要真实目标环境 release evidence、target smoke、备份恢复和 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮仍不连接目标环境、不执行真实发布、migration、restore、smoke、rollback 或 customer config activate；`closeoutSummary.ready=true` 未来也只表示脱敏证据包通过 gate 与 status warning 检查，不表示脚本执行过真实目标动作。

## 2026-06-29 正式前端客户配置投影边界守卫

- 完成：新增 `scripts/qa/formal-frontend-customer-config-boundary.test.mjs`，扫描 `web/src/erp` 正式运行时代码，禁止业务页面、layout、组件和工具直接消费 `config/customers/<customer-key>` raw 客户包；raw 客户包只允许 dev-only 客户配置预检页和 QA 脚本读取。
- 完成：守卫同时锁住 `ERPLayout` 必须读取 `get_effective_session`，`adminProfileSync` 必须承接页面 / 动作 / 字段策略投影，`hasActionPermission` 必须在 RBAC 基础上继续受 effective session 收窄，客户 / 供应商 / 销售订单列必须走 `filterColumnsByEffectiveFieldPolicy`。
- 完成：`fast.sh` / `strict.sh` 接入该守卫；`multi-client-role-workflow-priority-audit.mjs` 的 `customer-config-frontend-projection` 检查也绑定该测试文件，避免只凭源码里有字符串就把正式前端投影误判为 ready。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确正式前端只能通过后端 effective session 投影消费客户配置，不把 raw 客户包变成运行时真源。
- 验证：追加前 `progress.md` 为 313 行 / 57655 字节，未达归档阈值；`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/formal-frontend-customer-config-boundary.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`bash -n scripts/qa/fast.sh scripts/qa/strict.sh`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过。
- 下一步：继续补真实目标环境 release evidence、target smoke、备份恢复和 rollback / forward-fix 演练；正式前端投影守卫已覆盖 raw 包误接入风险，但不替代真实后端 active revision、RBAC、release readiness 或目标环境 smoke。
- 阻塞/风险：本轮只新增静态 QA 守卫和文档口径，不连接目标环境、不执行客户配置 activate / rollback、不生成真实 release evidence，也不做浏览器级可视回归。

## 2026-06-29 正式前端客户配置投影浏览器回归绑定

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `customer-config-frontend-projection` 检查新增 `web/scripts/style-l1/scenarios.mjs` 证据，要求存在 `erp-effective-session-direct-url-redirect` 和 `erp-effective-session-empty-pages-blocks-outlet`，并锁住空页面清单提示文案。
- 完成：`multi-client-role-workflow-priority-audit.test.mjs` 同步断言前端投影证据包含 style:l1 场景文件，避免优先级审计只停留在源码静态守卫。
- 完成：`scripts/README.md` 补充可复制的目标回归命令：`STYLE_L1_SCENARIOS=erp-effective-session-direct-url-redirect,erp-effective-session-empty-pages-blocks-outlet pnpm style:l1`；`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md` 同步说明正式前端投影 ready 状态包含静态边界测试和页面级重定向 / 空清单拦截回归。
- 验证：追加前 `progress.md` 为 323 行 / 59966 字节，未达归档阈值；`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`STYLE_L1_SCENARIOS=erp-effective-session-direct-url-redirect,erp-effective-session-empty-pages-blocks-outlet pnpm style:l1`、`node --test scripts/qa/docs-inventory.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过；style:l1 只出现既有 ESM package warning。
- 下一步：运行 `multi-client-role-workflow-priority-audit` 目标测试、目标 `style:l1` 场景、docs inventory 和 diff 检查；若 style:l1 暴露页面真实行为不一致，则回到 `ERPLayout` / admin profile 投影链路修正。
- 阻塞/风险：该绑定仍只覆盖本地浏览器级 mock effective session 场景，不证明目标环境 active revision 已发布、读回或通过目标 smoke。

## 2026-06-29 release evidence 草稿入口

- 完成：执行 `deployments/yoyoosun/scripts/collect-evidence.sh`，创建 `deployments/yoyoosun/evidence/releases/2026-06-29/` 草稿目录，包含 release evidence、production preflight、image digest、backup、backup restore、migration、smoke、rollback / forward-fix、rollback rehearsal、sign-off 和 acceptance checklist 入口。
- 完成：同步 `docs/文档清单.md`，登记该目录下 6 个 Markdown 草稿文件，明确它们是 Draft Evidence，不是目标环境 ready 证明。
- 验证：追加前 `progress.md` 为 332 行 / 62204 字节，未达归档阈值；`node --test scripts/deploy/collect-evidence-script.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs` 已通过；`node scripts/deploy/release-evidence-status.mjs --evidence-dir deployments/yoyoosun/evidence/releases/2026-06-29 --json` 显示 `status=draft`、`ready=false`、12/12 required files present、6 组 closeout 全部 `present-unverified`、`blockers=6`；release evidence gate 对该目录按预期失败，主要缺真实 environment、image digest、production preflight、backup、migration、smoke、rollback rehearsal 和 sign-off 字段。
- 下一步：按 status 输出继续补真实不可变版本、production preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复演练和签收；如果本次包含客户配置激活，还要生成 manifest evidence 并在目标 smoke 里读回 `customer_config.get_effective_session`。
- 阻塞/风险：本轮只生成脱敏草稿入口，不连接目标环境、不构建镜像、不执行 production preflight、不恢复备份、不跑 migration / smoke、不执行 rollback / forward-fix，也不激活或回滚客户配置 revision。

## 2026-06-29 客户配置 manifest release evidence 绑定

- 完成：因 `server/deploy/compose/prod/.env` 不存在，无法生成真实 production preflight 脱敏报告；只继续推进不需要目标环境的客户配置证据链。
- 完成：生成 `output/customers/yoyoosun/customer-config-runtime-manifest.json`，再用 `customer-config-release-execute.mjs` 生成 report-only `output/customers/yoyoosun/customer-config-release/customer-config-release-report.json`，未使用 `--execute`，未访问后端。
- 完成：向 `deployments/yoyoosun/evidence/releases/2026-06-29/customer-config-manifest-evidence.json` 写入 manifest sha256 绑定证据，revision 为 `yoyoosun-customer-package-v1.runtime-manifest-v1`，声明不含 secret / raw customer rows / raw customer files，不上传 raw 文件、不直写数据库、不导入业务数据、不写 Workflow / Fact runtime。
- 验证：追加前 `progress.md` 为 340 行 / 64030 字节，未达归档阈值；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs`、report-only release executor、manifest evidence generator 已通过；`release-evidence-status` 显示该目录仍为 `status=draft`、`ready=false`，但 `customerConfigManifestEvidence.exists=true`，closeout 变为 7 组 `present-unverified`、`blockers=7`；`customer-config-activation-gate` 和 `customer-config-release-readiness` 对该草稿目录按预期失败，因为 release evidence 仍缺真实 preflight、镜像 digest、backup、migration、smoke、rollback rehearsal 和 sign-off。
- 下一步：若要继续向激活 ready 推进，必须先补真实 production `.env` preflight、不可变镜像 digest、pre-migration backup + 恢复 / migration 演练、目标 smoke，并在 smoke 中加入 `customer-config-effective-session` 读回同一 revision；否则不能执行 activate / rollback。
- 阻塞/风险：当前只完成 manifest 指纹绑定和本地 report-only 计划，不证明客户配置已 publish / activate，也不证明目标环境 active revision、目标 smoke 或恢复演练完成。

## 2026-06-29 release evidence 客户配置 smoke 指引

- 完成：`release-evidence-status.mjs` 在同目录已有 `customer-config-manifest-evidence.json` 且可读到 revision、同时 `smoke-test-report.json` 已存在但缺少 `customer-config-effective-session` 时，会输出 warning，并把带 `--backend-url <backend-endpoint>`、`--customer-config-revision <revision>`、`--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN` 和 `--report <evidence-dir>/smoke-test-report.json` 的 `run-smoke.sh` 命令加入 next commands。
- 完成：补测试锁住上述场景，避免“有 smoke 文件”被误判为客户配置 active revision 已在目标环境读回。
- 完成：同步 `scripts/README.md` 和 `deployments/yoyoosun/evidence/releases/README.md`，明确缺 smoke 或已有 smoke 但缺 `customer-config-effective-session` 都需要按同一 revision 重跑目标 smoke。
- 验证：追加前 `progress.md` 为 349 行 / 66391 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过；`node scripts/deploy/release-evidence-status.mjs --evidence-dir deployments/yoyoosun/evidence/releases/2026-06-29 --json` 显示 `status=draft`、`ready=false`，并给出重跑目标 smoke 的客户配置 revision 参数。
- 下一步：补真实目标环境 production preflight、image digest、pre-migration backup + 恢复 / migration 演练、目标 smoke、rollback / forward-fix 演练和签收；其中目标 smoke 必须包含同一 revision 的 `customer-config-effective-session`。
- 阻塞/风险：本轮只补 evidence status 的下一步指引和文档，不连接目标环境、不执行 smoke、不激活或回滚客户配置 revision；当前 release evidence 仍是 draft。

## 2026-06-29 release evidence 分组 next actions

- 完成：`release-evidence-status.mjs` 新增 `closeoutNextActions`，按未 gate-verified 的 closeout 证据组输出下一条命令和人工核对项；即使草稿 evidence 目录里文件都存在但仍未通过 gate，也会分别提示不可变版本 / image digest、production preflight、备份恢复 / migration 演练、目标 smoke、rollback / forward-fix、sign-off 和客户配置读回的下一步。
- 完成：文本输出同步增加 `closeout next actions`；JSON 输出可供人或后续工具直接按证据组排序执行。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 `closeoutNextActions` 只是下一步指引，不替代真实目标环境动作。
- 验证：追加前 `progress.md` 为 358 行 / 68377 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-status.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`git diff --check` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 已通过；`release-evidence-status --json` 对 `deployments/yoyoosun/evidence/releases/2026-06-29` 显示 `status=draft`、`ready=false`、`blockers=7`，并输出 7 个 closeout next actions。
- 下一步：按 `closeoutNextActions` 先补真实 runtime `.env` preflight、不可变 image digest、pre-migration backup + restore/migration 演练和目标 smoke；目标 smoke 再绑定客户配置 revision。
- 阻塞/风险：当前仍不具备真实目标环境 `.env`、镜像 digest、生产备份、目标 endpoint 或签收证据；本轮没有执行发布、migration、restore、smoke、activate、rollback 或 sign-off。

## 2026-06-29 customer config readiness 失败诊断

- 完成：`customer-config-release-readiness.mjs --json` 成功输出新增 `ok=true`；当 activation gate / release evidence 失败时，JSON 输出新增 `ok=false`、错误列表、readiness scope 和 `releaseEvidenceStatus`，可直接读取 `closeoutSummary` / `closeoutNextActions` 继续补 release evidence。
- 完成：补 CLI 失败测试，锁住缺少 production preflight 时 readiness JSON 会非 0 退出，并返回 production preflight 的 next action 命令和人工核对项。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 readiness 失败输出只是诊断和下一步指引，不替代真实目标环境动作。
- 验证：追加前 `progress.md` 为 367 行 / 70288 字节，未达归档阈值；`node --test scripts/deploy/customer-config-release-readiness.test.mjs`、`node --check scripts/deploy/customer-config-release-readiness.mjs scripts/deploy/customer-config-release-readiness.test.mjs` 已通过；对 `deployments/yoyoosun/evidence/releases/2026-06-29` 运行 readiness JSON 显示 `ok=false`、`releaseEvidenceStatus.status=draft`、`blockers=7`、`closeoutNextActions=7`。
- 下一步：继续按 readiness 失败输出里的 `releaseEvidenceStatus.closeoutNextActions` 补真实 target evidence；不能把 `ok=false` 的诊断输出当 release ready。
- 阻塞/风险：当前仍没有真实目标环境 `.env`、镜像 digest、备份恢复、目标 smoke、客户配置 active revision 读回、rollback rehearsal 或签收；本轮没有调用后端、不执行发布或激活。

## 2026-06-29 customer config activation gate JSON 诊断

- 完成：`customer-config-activation-gate.mjs --json` 成功时输出 `ok=true` 和 activation scope；失败时输出 `ok=false`、错误列表、activation scope 和 `releaseEvidenceStatus`，可直接读取 `closeoutSummary` / `closeoutNextActions` 继续补 release evidence。
- 完成：补 CLI 成功 / 失败测试，锁住 JSON scope，以及缺少 production preflight 时返回 production preflight next action 命令。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 activation gate 与 readiness 一样只聚合证据，不执行发布、migration、smoke、备份恢复、激活或回滚。
- 验证：追加前 `progress.md` 为 376 行 / 71976 字节，未达归档阈值；`node --test scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/customer-config-activation-gate.mjs scripts/deploy/customer-config-activation-gate.test.mjs` 已通过；对 `deployments/yoyoosun/evidence/releases/2026-06-29` 运行 activation gate JSON 显示 `ok=false`、`releaseEvidenceStatus.status=draft`、`blockers=7`、`closeoutNextActions=7`。
- 下一步：继续按 `releaseEvidenceStatus.closeoutNextActions` 补真实 target evidence；activation gate 仍不能在 `ok=false` 时作为激活前 ready 证明。
- 阻塞/风险：当前仍没有真实目标环境 `.env`、镜像 digest、备份恢复、目标 smoke、客户配置 active revision 读回、rollback rehearsal 或签收；本轮没有调用后端、不执行发布或激活。

## 2026-06-29 release evidence closeout plan 前置条件

- 完成：新增 `release-evidence-closeout-plan.mjs`，只读消费 `release-evidence-status.mjs` 的 `closeoutNextActions`，把每组下一步转成执行前置条件检查；缺少 image ref / digest、真实 runtime `.env`、`SOURCE_POSTGRES_DSN`、目标 endpoint、backend URL、admin token、rollback target / trigger 时会标为 blocked。
- 完成：补测试锁住 read-only scope、`--fail-on-blocked`、通用 draft 缺输入、输入齐全时机器步骤 runnable、客户配置 effective-session 额外要求 backend URL 和 admin token；CLI 文档改用 `--runtime-env-file`，避免 Node 24 把 `--env-file` 当作 Node 自身参数提前拦截。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`；`fast.sh` 接入 closeout plan 测试。
- 验证：追加前 `progress.md` 为 385 行 / 73732 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-closeout-plan.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-closeout-plan.mjs scripts/deploy/release-evidence-closeout-plan.test.mjs` 已通过；对 `deployments/yoyoosun/evidence/releases/2026-06-29` 运行 closeout plan JSON 显示 `status=draft`、`blocked=6`、`manualOnly=1`、production preflight 缺 `prod-env-file`；追加 `--fail-on-blocked` 会返回 exit 1。
- 下一步：补真实 production `.env`、image ref / digest、source DSN、目标 endpoint / backend URL、admin token 和 rollback 信息后，才能逐组执行 next actions 并生成真实 target evidence。
- 阻塞/风险：该 plan 仍不写 evidence、不执行 preflight、备份恢复、migration、smoke、回滚 / 前向修复、客户配置激活或签收；当前真实目标 evidence 仍未完成。

## 2026-06-29 release evidence closeout runner 受控执行入口

- 完成：新增 `release-evidence-closeout-runner.mjs`，复用 closeout plan，只 materialize `canRun=true` 且非人工的 next actions；默认 report-only，不写 evidence，显式 `--execute` 还必须设置 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT`。
- 完成：runner 支持 `--only <action-id>`，可先单组执行；执行模式会拒绝 blocked action 和人工 sign-off，不绕过 release evidence gate。当前已覆盖 image digest 生成、preflight、备份恢复、目标 smoke、rollback rehearsal、customer config manifest evidence 等命令 materialize。
- 完成：补测试锁住 report-only 默认不写入、缺确认短语拒绝、只执行 `immutable-version` 会在临时 evidence 写入 `image-digests.txt`、blocked action 执行拒绝、CLI JSON 默认 report-only 和未知 action 拒绝；`fast.sh` 接入 runner 测试。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 runner 是受控执行入口，不是 ready 证明，也不自动签收。
- 验证：追加前 `progress.md` 为 394 行 / 75679 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/deploy/release-evidence-closeout-plan.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --check scripts/deploy/release-evidence-closeout-runner.mjs scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/deploy/release-evidence-closeout-plan.mjs` 已通过；对 `deployments/yoyoosun/evidence/releases/2026-06-29` 运行 runner JSON 显示 `executed=false`、`executeReady=false`、`selected=7`；显式执行 blocked 的 `production-preflight` 会返回 `ok=false` 和 `selected closeout actions are not all runnable`。
- 下一步：给齐真实 production `.env`、image ref / digest、source DSN、目标 endpoint / backend URL、admin token 和 rollback 信息后，用 runner 按组执行，再回到 status / gate 复核。
- 阻塞/风险：当前仍缺真实目标输入；本轮没有执行目标 preflight、备份恢复、migration、smoke、回滚 / 前向修复、客户配置激活或签收。

## 2026-06-29 release evidence runner 脱敏报告与 URL 前置拦截

- 完成：`release-evidence-closeout-plan.mjs` 对 `SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 增加 http(s) 且无 URL 账号密码检查；带 `user:pass@` 或非 URL 的 smoke 输入会让对应 action 保持 blocked，避免凭据进入命令、alias 或 evidence。
- 完成：`release-evidence-closeout-runner.mjs` 增加 `--report`，可写入脱敏 runner 报告；JSON / report 只暴露 display command、env key 名和 stdout / stderr 行数，执行用 env 作为不可枚举内部字段，不把 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或命令原始输出写进报告。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确 runner report 仍不是 target ready 证明，执行后还要回到 status / gate。
- 验证：追加前 `progress.md` 为 404 行 / 78004 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/deploy/release-evidence-closeout-plan.test.mjs scripts/deploy/release-evidence-status.test.mjs`、`node --test scripts/qa/docs-inventory.test.mjs`、`node --check scripts/deploy/release-evidence-closeout-runner.mjs scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/deploy/release-evidence-closeout-plan.mjs scripts/deploy/release-evidence-closeout-plan.test.mjs` 已通过；对当前草稿 evidence 运行 runner `--report` 验证 `executed=false`、`selected=7` 且报告不含 DSN / token 赋值。
- 下一步：给齐真实 production `.env`、image ref / digest、source DSN、目标 endpoint / backend URL、admin token 和 rollback 信息后，用 plan 确认 runnable，再用 runner 按证据组执行并重新跑 status / gate。
- 阻塞/风险：当前仍没有真实目标输入；本轮没有执行目标 preflight、备份恢复、migration、smoke、回滚 / 前向修复、客户配置激活或签收。
