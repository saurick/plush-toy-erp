# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。
- `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`：归档 2026-06-29 target evidence binding 之后到 release evidence runner 脱敏报告与 URL 前置拦截的过程记录。
- `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`：归档 2026-06-29 adminProfileSync 菜单投影文档纠偏、P2 explain / entitlement / break-glass 中段过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前本地 audit 显示 10 项检查全部通过其对应口径：8 项 ready、1 项 guarded、1 项 evidence-required。`customer-config-runtime-schema` 只证明 Ent schema + Atlas migration；`customer-config-usecase-repo-api-rbac` 单独证明 usecase / repo / JSON-RPC / RBAC / 审计测试；`domain-command-entry-remains-guarded` 仍明确禁止把 Workflow task done 自动当 Fact posted；`release-evidence-target-remains-evidence-required` 仍需要真实目标环境 evidence。
- 客户配置主路径已分层为 raw 客户包预检、runtime manifest 编译、后端 `customer_config` validate / publish / activate / rollback / effective session、release evidence / readiness gate / runner 受控执行。
- 真实客户数据导入、任意文件 upload、生产发布 preflight、真实备份恢复、目标环境 smoke、目标 migration、回滚 / 前向修复演练和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-29 progress 超阈值归档

- 完成：归档前 `progress.md` 为 413 行 / 80064 字节，已达到 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和本轮归档记录，保留真实目标 evidence 仍未完成的下一步和风险边界。
- 下一步：继续按 priority audit 与 release evidence status 的输出推进真实目标 evidence；若继续修改正式文档或脚本，先保持 `progress.md` 简短，只记录当前闭环。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态或正式业务真源。

## 2026-06-29 priority audit 绑定 release evidence 进度

- 完成：`multi-client-role-workflow-priority-audit.mjs --json` 新增 `releaseEvidenceProgress`，只读摘出当前 `deployments/yoyoosun/evidence/releases/2026-06-29` 的 status、ready、gateReady、closeoutSummary、blockers 和 closeoutNextActions。
- 完成：文本输出新增 release evidence 状态行和未 ready 时的 next actions 列表；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：继续按 audit JSON 中的 `releaseEvidenceProgress.nextActions` 和 closeout plan 补真实目标环境 evidence；若 evidence 已 ready，audit 会保留状态但不再要求 next actions 非空。
- 阻塞/风险：该绑定仍只读取本地 release evidence status，不执行 preflight、备份恢复、migration、smoke、客户配置激活 / 回滚、rollback / forward-fix 或签收。

## 2026-06-29 priority audit 支持自定义 release evidence 目录

- 完成：`multi-client-role-workflow-priority-audit.mjs` 支持 `--release-evidence-dir <path>` 和 `--release-evidence-dir=<path>`；默认仍读取 `deployments/yoyoosun/evidence/releases/2026-06-29`，真实发布批次可显式指向对应目录。
- 完成：补测试覆盖函数参数、CLI 分离参数和 inline 参数，确认未创建目录会显示 `status=missing`，不会误用默认 evidence 目录。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：后续真实批次生成 release evidence 后，用 `multi-client-role-workflow-priority-audit.mjs --json --release-evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>` 直接读取对应 status / blockers / next actions。
- 阻塞/风险：该参数仍只读取本地 evidence status，不执行目标环境 preflight、备份恢复、migration、smoke、客户配置激活 / 回滚、rollback / forward-fix 或签收。

## 2026-06-29 priority audit 输出 closeout plan 命令

- 完成：修正 `multi-client-role-workflow-priority-audit.mjs` 文本输出中 release evidence next action 标题来源，避免 status action 使用 `label` 时显示 `undefined`。
- 完成：`releaseEvidenceProgress` 增加 `closeoutPlanCommand`，文本输出在 next actions 后直接给出 `release-evidence-closeout-plan.mjs --runtime-env-file server/deploy/compose/prod/.env --json`，方便从优先级审计进入发布证据前置检查；同步测试、`scripts/README.md` 和优先级正式文档。
- 下一步：继续按 priority audit 的 ready / guarded / evidence-required 分组推进；当前 2026-06-29 evidence 仍是 `draft`，真实发布前还要逐项补齐 closeout plan 显示的镜像 digest、真实 runtime env、source DSN、目标 endpoint、管理员 token、rollback 信息和人工签收。
- 阻塞/风险：该命令仍只读，不执行 preflight、备份恢复、migration、target smoke、客户配置激活 / 回滚、rollback / forward-fix 或签收。

## 2026-06-29 priority audit 汇总 closeout plan 前置缺口

- 完成：`multi-client-role-workflow-priority-audit.mjs --json` 复用 `buildReleaseEvidenceCloseoutPlan`，在 `releaseEvidenceProgress.closeoutPlanSummary` 中输出 runnable / blocked / manualOnly 数量、action ids 和第一条 blocked action 缺失的前置输入；文本输出同步展示 summary 和 first blocked。
- 完成：CLI 支持 `--runtime-env-file <path>` 和 `--runtime-env-file=<path>`，真实发布批次可用同一 audit 命令读取指定 evidence 目录和运行时 env 前置检查；同步测试、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：继续补真实目标 evidence；当前缺口仍应以 `closeoutPlanSummary.blockedActionIds` 和 `firstBlockedAction.missingPrerequisiteIds` 指向的输入为准，再进入 closeout runner 或人工签收。
- 阻塞/风险：summary 只来自只读 status / closeout plan，不执行目标动作，不保存 env 值、token、DSN 或命令原始输出，也不证明目标环境发布、smoke、恢复或回滚演练已完成。

## 2026-06-29 priority audit 增加 release-ready 门禁模式

- 完成：`multi-client-role-workflow-priority-audit.mjs` 新增 `releaseReady` 和 `--fail-on-release-not-ready`；默认仍用于优先级证据审计，显式带门禁参数时如果 release evidence 不是 ready 会返回非 0。
- 完成：补测试覆盖 release evidence 缺失目录时 `ok=true` 但 `releaseReady=false`、CLI 退出码为 1 的场景；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：发布前可用 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --release-evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> --fail-on-release-not-ready` 作为强门禁；当前 2026-06-29 evidence 仍会失败，因为缺不可变镜像版本等真实证据。
- 阻塞/风险：该门禁仍不执行发布、preflight、备份恢复、migration、target smoke、客户配置激活 / 回滚、rollback / forward-fix 或签收，只防止把 draft evidence 误读成 release-ready。

## 2026-06-29 priority audit 带出第一证据缺口命令

- 完成：`closeoutPlanSummary.firstBlockedAction` 增加 title、commands 和 manualChecks；文本输出同步展示第一条 blocked action 的首个 command。后续已由 `immutable-version-evidence.mjs` 替代早期只生成 `image-digests.txt` 的命令，避免 `release-evidence.md` 基本信息继续靠人工散填。
- 完成：补测试锁住第一缺口为 immutable-version，并同步 `scripts/README.md`、优先级文档和当前真源索引；后续测试已改为锁住 immutable writer 命令和同批次 release metadata。
- 下一步：真实发布批次补齐 `RELEASE_VERSION / RELEASE_ENVIRONMENT / OPERATOR_ROLE / GIT_COMMIT / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 后，通过 closeout runner 执行 immutable writer。
- 阻塞/风险：该输出仍只展示占位命令和人工核对项，不读取 registry、不构建镜像、不保存 secret，也不证明不可变版本证据已经真实存在。

## 2026-06-29 priority audit 衔接 closeout runner

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `releaseEvidenceProgress` 增加 `closeoutRunnerCommand`；第一条 blocked action 增加 `missingPrerequisites`、`requiredEnvExports`、`closeoutRunnerReportCommand` 和 `closeoutRunnerExecuteCommand`，可从优先级审计直接跳到 report-only runner 或显式确认执行选中 action。
- 完成：env 模板使用 `KEY='<placeholder>'` 形式，避免 `<...>` 被 shell 当成重定向；execute 模板仍要求 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT`。
- 完成：补测试覆盖 JSON 字段、文本输出、custom env file 透传和第一缺口 runner 命令；同步 `scripts/README.md`、优先级文档和当前真源索引。
- 下一步：真实发布批次补齐第一缺口 env 后，先用 audit 输出的 `first runner report` 复核 selected action 是否 runnable，再用 `first runner execute` 生成该组证据，随后重跑 release evidence status / gate。
- 阻塞/风险：runner 命令仍不填真实镜像 digest、source DSN、目标 endpoint、admin token 或 rollback 信息；本轮不执行目标发布、preflight、备份恢复、migration、target smoke、客户配置激活 / 回滚、rollback / forward-fix 或人工签收。

## 2026-06-29 priority audit 输出完整 closeout action 队列

- 完成：`releaseEvidenceProgress` 新增 `closeoutActionQueue`，按 release closeout 顺序列出全部证据组的 `runnable / blocked / manual` 状态、缺失 env / file / manual 前置、env 模板、人工核对项和该组 runner report / execute 命令；文本输出同步展示完整 action queue。
- 完成：`requiredEnvExports` 去重，避免 `customer-config-effective-session` 同时包含 smoke / rollback 前置时重复输出 `RELEASE_VERSION`、`RELEASE_ENVIRONMENT` 等 env 模板。
- 完成：补测试覆盖 `production-preflight` 的 runtime env file 缺口、`release-signoff` manual 状态、`customer-config-effective-session` 的 admin token 模板和 action queue 文本输出；同步 `scripts/README.md`、优先级文档和当前真源索引。
- 下一步：真实发布批次可直接按 `closeoutActionQueue` 顺序补不可变版本、生产 preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复、人工签收和客户配置读回证据。
- 阻塞/风险：该队列仍来自本地只读 status / closeout plan，不执行目标动作、不保存真实 secret，也不证明目标环境 evidence 已完成。

## 2026-06-29 priority audit 拆细客户配置与 preflight 证据

- 完成：`customer-config-runtime-schema` 收窄为只证明 Ent schema + Atlas migration；新增 `customer-config-usecase-repo-api-rbac`，单独核对 usecase、repo、JSON-RPC、RBAC 权限拒绝、active revision 读回和 runtime audit 测试证据。
- 完成：新增 `release-preflight-fast-gate`，核对 production preflight 测试已接入 `fast.sh` / `strict.sh`，并锁住脱敏报告、固定镜像 tag 和生产 Compose 禁止 `build:`。
- 完成：目标测试从粗略 8 项审计升级为 10 项审计；同步 `scripts/README.md`、优先级文档和当前真源索引，避免继续把参考图里的 schema / repo / API / RBAC / preflight 闭环混成一个 ready。
- 下一步：继续按 10 项 audit 与 release `closeoutActionQueue` 推进；真实目标 evidence 仍要从不可变镜像版本和生产 runtime env 开始补。
- 阻塞/风险：该拆分仍是本地可执行证据审计，不等于目标环境已发布、migration 已执行、客户配置已激活或真实客户数据已导入。

## 2026-06-29 release closeout plan 缺口去重

- 完成：`release-evidence-closeout-plan.mjs` 在生成 `missingPrerequisites` 时按 `kind:id` 去重，避免 `customer-config-effective-session` 这类组合动作重复列出 `RELEASE_VERSION`、`RELEASE_ENVIRONMENT` 等同一前置输入。
- 完成：补测试覆盖组合动作缺失前置唯一性；当前 2026-06-29 evidence 的 plan / runner JSON 输出已确认只列出唯一缺口：`RELEASE_VERSION`、`RELEASE_ENVIRONMENT`、`SMOKE_ENDPOINT`、`SMOKE_BACKEND_URL`、`CUSTOMER_CONFIG_ADMIN_TOKEN`、`ROLLBACK_TARGET_RELEASE`、`ROLLBACK_TRIGGER_SCENARIO`。
- 下一步：继续按去重后的 closeout queue 补真实目标 evidence，先从不可变镜像版本和真实生产 runtime env 开始。
- 阻塞/风险：该修正只提升执行清晰度，不执行发布、preflight、备份恢复、migration、target smoke、客户配置激活 / 回滚、rollback / forward-fix 或签收。

## 2026-06-29 priority audit 增加参考覆盖矩阵

- 完成：`multi-client-role-workflow-priority-audit.mjs --json` 新增 `referenceCoverage`，把参考图里的四类要求分别映射到当前 check ids、证据路径和 release action ids：schema / migration、usecase / repo / API / RBAC、正式前端 effective session 投影、release preflight / target evidence。
- 完成：文本输出新增 `reference coverage` 段；当前 schema / migration 与 usecase / repo / API / RBAC 为 `ready`，正式前端投影和 release evidence 因目标环境读回 / smoke / 恢复 / 回滚 / 签收未完成仍为 `evidence-required`。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，说明 `referenceCoverage` 不替代目标环境证据。
- 下一步：继续按 `referenceCoverage` 中的 release action ids 和 `closeoutActionQueue` 补真实不可变镜像、生产 preflight、备份恢复、目标 smoke、回滚 / 前向修复、签收和客户配置读回证据。
- 阻塞/风险：该矩阵只是本地审计索引，不调用后端、不执行 migration、不部署、不导入真实客户数据，也不证明目标环境发布已经完成。

## 2026-06-29 reference coverage 拆分本地与目标证据状态

- 完成：`referenceCoverage` 新增 `localState` / `targetState`，把当前仓库代码 / 测试 / 文档证据与目标环境 release evidence 分开表达；文本输出同步显示 `local=...` 和 `target=...`。
- 完成：当前审计显示 `runtime-schema-migration`、`usecase-repo-api-rbac` 为 `local=ready, target=not-applicable`；`frontend-effective-session-projection` 为 `local=ready, target=evidence-required`；`release-preflight-target-evidence` 为 `local=evidence-required, target=evidence-required`。
- 完成：同步 `scripts/README.md`、优先级文档和当前真源索引，避免把前端本地已落地误读成代码未完成，也避免把本地 ready 误读成目标环境 ready。
- 下一步：继续补目标环境 evidence；本地审计已经能说明缺的是目标环境读回、smoke、恢复 / 回滚演练和签收，不是前端投影链路本身。
- 阻塞/风险：该拆分仍只是只读审计输出，不执行目标动作、不保存真实 env / token / DSN，也不证明 release evidence 已 ready。

## 2026-06-29 priority audit 增加收口判断

- 完成：`multi-client-role-workflow-priority-audit.mjs` 新增 `completionAudit`，把优先级参考覆盖、本地 ready 要求、目标 evidence 缺口、剩余 release action、第一条 blocked release action 和外部输入缺口汇总为机器可读收口判断。
- 完成：文本输出新增 `completion audit` 和 `remaining priority work`；同步单测、`scripts/README.md`、优先级文档和当前真源索引，明确优先级文档可作为执行队列，但 `releaseReady=false` 时不能把本地审计通过解释为整体完成。
- 下一步：继续真实 release closeout 时按 `completionAudit.firstBlockedReleaseAction` 和 `releaseEvidenceProgress.closeoutActionQueue` 从 `immutable-version` 开始补真实镜像 digest、runtime `.env`、source DSN、目标 endpoint、admin token、rollback 信息和人工签收。
- 阻塞/风险：本轮仍只做只读审计和文档口径；没有执行目标环境发布、migration、smoke、备份恢复、回滚 / 前向修复或人工签收。

## 2026-06-29 release evidence gate 分组错误摘要

- 完成：`release-evidence-status.mjs` 新增 `closeoutGateSummary`，按不可变版本、production preflight、备份恢复 / migration、目标 smoke、回滚 / 前向修复、签收和客户配置读回分组输出 gate error / warning 数量与样例；文本输出新增 `closeout gate summary`。
- 完成：`multi-client-role-workflow-priority-audit.mjs` 消费 `closeoutGateSummary`，在优先级审计文本中同步展示 release evidence gate 分组摘要，让 present-unverified 的 evidence 能直接看到具体失败字段，而不是只看到总错误数或缺 env。
- 完成：补 `release-evidence-status.test.mjs` 和 `multi-client-role-workflow-priority-audit.test.mjs` 断言；同步 `scripts/README.md`、优先级文档和当前真源索引。
- 下一步：真实 release closeout 仍需先补 `immutable-version` 的真实 server / web image ref 和 sha256 digest，再继续 production preflight、备份恢复、目标 smoke、rollback / forward-fix、签收与客户配置 active revision 读回。
- 阻塞/风险：该摘要仍只读解析本地 evidence 和 gate 错误，不生成真实目标环境证据，不执行发布、migration、smoke、备份恢复、回滚 / 前向修复或人工签收。

## 2026-06-29 completion audit 带出第一 gate 缺口

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `completionAudit` 增加 `gateErrorTotals` 和 `firstUnverifiedGateGroup`，直接输出 release evidence gate error / warning 总数、第一组未验证 gate、第一条 gate error / warning。
- 完成：当前 2026-06-29 evidence 的第一组未验证 gate 为 `immutable-version`，首个错误是 `release-evidence.md missing or placeholder field: environment`；这与第一条 blocked release action 的镜像 digest 前置一起指向同一组不可变版本证据。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，并同步 `scripts/README.md`、优先级文档和当前真源索引。
- 下一步：真实补证据时先填同一 release batch 的 `releaseVersion / environment / gitCommit / serverImageDigest / webImageDigest / migrationBefore / migrationAfter / backupId`，同时生成匹配的 `image-digests.txt`。
- 阻塞/风险：该 completion audit 仍只读；没有生成镜像 digest、没有读取 registry、没有执行目标发布、migration、smoke、备份恢复、回滚 / 前向修复或签收。

## 2026-06-29 closeout plan action 带 gate 摘要

- 完成：`release-evidence-closeout-plan.mjs` 的每个 action 新增 `gateSummary`，直接带出该证据组当前 release gate error / warning 数量和样例；文本输出同步显示 gate 摘要。
- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `closeoutActionQueue` 和 `firstBlockedAction` 透传同一 `gateSummary`，让优先级审计 JSON 里每个 release action 同时可见缺失执行输入和证据文件 gate 错误。
- 完成：补 `release-evidence-closeout-plan.test.mjs`、`multi-client-role-workflow-priority-audit.test.mjs` 断言，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮更新前已确认 `progress.md` 为 137 行 / 19912 bytes，未达到归档阈值。
- 下一步：继续按 action queue 从 `immutable-version` 开始补真实 `SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST` 和同批次 release metadata；随后再进入 production preflight、备份恢复、目标 smoke、rollback / forward-fix、签收和客户配置读回。
- 阻塞/风险：该计划仍只读，不生成 evidence、不执行目标环境动作、不保存真实 env / token / DSN，也不证明 release evidence 已 ready。

## 2026-06-29 immutable version evidence 写入器

- 完成：新增 `scripts/deploy/immutable-version-evidence.mjs`，用显式 release batch 输入更新 `release-evidence.md` 基本信息并同步写入 `image-digests.txt`，避免不可变版本证据一半靠脚本、一半靠人工散填。
- 完成：`release-evidence-status.mjs` 的 `immutable-version` next action 改为调用 immutable writer；`release-evidence-closeout-plan.mjs` 对第一项新增 `RELEASE_VERSION / RELEASE_ENVIRONMENT / OPERATOR_ROLE / GIT_COMMIT / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 等前置检查；`release-evidence-closeout-runner.mjs` 可在显式确认后执行该写入器。
- 完成：补 `immutable-version-evidence.test.mjs`，并把测试接入 `fast.sh` / `strict.sh`；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 145 行 / 21377 bytes，未达到归档阈值。
- 下一步：真实发布批次仍需提供同批次的真实镜像 ref / digest、Atlas migrationBefore / migrationAfter、backupId 和环境信息；这些值齐全后再通过 closeout runner 执行 `immutable-version`。
- 阻塞/风险：脚本不构建镜像、不访问 registry、不读取 `.env`、不跑 migration、不跑 smoke、不恢复备份、不接触目标环境；不能替代真实 target evidence。

## 2026-06-29 closeout plan 复用 evidence 输入

- 完成：`release-evidence-closeout-plan.mjs` 和 `release-evidence-closeout-runner.mjs` 对 `immutable-version` 支持复用 `release-evidence.md` 里已有的非占位 `releaseVersion / gitCommit`，环境变量只补缺失的同批次字段。
- 完成：补 `release-evidence-closeout-plan.test.mjs` 和 `release-evidence-closeout-runner.test.mjs` 断言，确认 plan 输出 `resolvedInputs`，runner 在未传 `RELEASE_VERSION / GIT_COMMIT` 时仍能用 evidence-backed 输入执行 immutable writer；同步 `multi-client-role-workflow-priority-audit.test.mjs`、`scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 153 行 / 22742 bytes，未达到归档阈值。
- 下一步：按优先级队列继续补 `immutable-version` 缺失的真实 `RELEASE_ENVIRONMENT / OPERATOR_ROLE / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID`，再进入 preflight、备份恢复、目标 smoke、rollback / forward-fix、签收和客户配置读回。
- 阻塞/风险：该复用只降低重复输入，不证明 target release 已执行，也不替代真实镜像 digest、Atlas migration 状态、备份恢复、目标 smoke、回滚演练或人工签收。

## 2026-06-29 closeout 后续动作复用 release batch

- 完成：`release-evidence-closeout-plan.mjs` 把 `release-evidence.md` 中已有的非占位 release batch 字段扩展为通用 evidence-backed 输入，`backup-restore-rehearsal`、`target-smoke`、`rollback-forward-fix` 和 `customer-config-effective-session` 不再重复要求已存在的 `RELEASE_VERSION`，有 `environment` 时也可复用 `RELEASE_ENVIRONMENT`。
- 完成：`release-evidence-closeout-runner.mjs` 的 backup / smoke / rollback 命令改用 `requireInput`，优先环境变量、其次 evidence-backed 输入；仍然要求真实 `SOURCE_POSTGRES_DSN`、目标 endpoint、backend URL、admin token、rollback target / trigger 等外部输入。
- 完成：补 `release-evidence-closeout-plan.test.mjs`、`release-evidence-closeout-runner.test.mjs` 和 `multi-client-role-workflow-priority-audit.test.mjs` 断言；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 160 行 / 24071 bytes，未达到归档阈值。
- 下一步：真实 release closeout 仍从 `immutable-version` 缺失字段开始，补齐真实环境、operator、镜像 ref / digest、migrationBefore / migrationAfter 和 backupId 后，再按队列继续 production preflight、备份恢复、目标 smoke、rollback / forward-fix、签收和客户配置读回。
- 阻塞/风险：本轮没有执行目标发布、没有读取生产 `.env`、没有访问 registry、没有执行 backup restore、migration、smoke、rollback 或签收；目标 evidence 仍必须由真实发布批次提供。

## 2026-06-29 runner report 带 resolvedInputs

- 完成：`release-evidence-closeout-runner.mjs` 的 report-only / `--report` 输出增加每个 action 的 `resolvedInputs`，用于记录 release batch 字段来自 env 还是 `release-evidence.md`，方便后续执行者核对同批次输入。
- 完成：补 `release-evidence-closeout-runner.test.mjs` 断言，确认 report 包含 `RELEASE_VERSION`、`SERVER_IMAGE_DIGEST` 等非敏感 release batch resolved inputs，同时继续不输出 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或命令原始 stdout / stderr；同步 `scripts/README.md` 和优先级文档；本轮追加前已确认 `progress.md` 为 168 行 / 25681 bytes，未达到归档阈值。
- 下一步：继续按 priority audit 的 `firstBlockedReleaseAction=immutable-version` 补真实外部发布批次字段；本地 runner 报告只能帮助核对输入来源，不能替代目标环境证据。
- 阻塞/风险：`resolvedInputs` 只覆盖 release batch 字段，不保存 DSN、token、完整 `.env`、命令输出或目标环境响应；真实发布、preflight、备份恢复、migration、smoke、回滚演练和签收仍未执行。

## 2026-06-29 priority audit completion 强门禁

- 完成：`multi-client-role-workflow-priority-audit.mjs` 新增 `--fail-on-completion-not-ready`，以 `completionAudit.canCompleteLocally` 为准决定退出码，避免把本地证据对齐误判成参考实现整体闭环完成。
- 完成：保留 `--fail-on-release-not-ready` 作为 release evidence 专项强门禁；新增 completion gate 用于“一次做完整 / 整体收口”语境，release evidence draft 或目标 evidence 缺失时会返回非 0，但 JSON 仍保留 `ok=true` 表示优先级文档证据本身对齐。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 175 行 / 26860 bytes，未达到归档阈值。
- 下一步：真实收口仍需先补 `immutable-version` 外部字段，并继续 production preflight、备份恢复、目标 smoke、rollback / forward-fix、签收和客户配置读回。
- 阻塞/风险：该门禁只读，不执行目标环境动作，也不生成真实 evidence；它只防止误判完成。

## 2026-06-29 priority audit 输出 gate commands

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `releaseEvidenceProgress` 新增 `priorityAuditCommands`，结构化输出普通 JSON 审计、release evidence 强门禁和整体闭环强门禁三条可复制命令；文本输出同步展示 `priority audit gate commands`。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言默认 evidence 目录、自定义 evidence 目录和文本输出中的 gate 命令；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 183 行 / 28009 bytes，未达到归档阈值。
- 下一步：继续按输出的 `completionGate` 检查整体闭环；当前该门禁仍会返回非 0，因为 `releaseReady=false` 且第一缺口仍是 `immutable-version`。
- 阻塞/风险：这些命令只暴露审计 / 门禁入口，不执行目标发布、不生成真实镜像 digest、不读取生产 `.env`、不执行 migration / smoke / 备份恢复 / 回滚演练 / 签收。

## 2026-06-29 first blocked action 直出执行上下文

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `completionAudit.firstBlockedReleaseAction` 现在直接带出缺失 env 模板、该 action 的 gateSummary、runner report 命令和 runner execute 命令；文本输出同步新增 `first blocked env / gate / runner report / runner execute`。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，并把 CLI 测试 stdout 改为临时文件读取，避免大 JSON 输出被子进程 pipe 截断到约 64KB 后误报 JSON parse 失败；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 190 行 / 29064 bytes，未达到归档阈值。
- 下一步：继续按 first blocked action 补真实 `immutable-version` 外部输入；当前 completion gate 仍返回非 0，`releaseReady=false`，第一缺口仍是 `immutable-version`。
- 阻塞/风险：这些字段仍只是受控执行上下文，不生成真实镜像 digest、不读取 registry 或生产 `.env`、不执行 target migration / smoke / 备份恢复 / 回滚演练 / 签收。

## 2026-06-29 completion audit 剩余前置按类型分组

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `completionAudit` 新增 `remainingPrerequisites` 和 `remainingPrerequisitesByKind`，把剩余前置按 `env / file / manual / evidence` 分组，同时保留每个缺口关联的 release action ids。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，锁住 `SERVER_IMAGE` 属于 env、`prod-env-file` 属于 file、`manual-release-signoff` 属于 manual；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 197 行 / 30213 bytes，未达到归档阈值。
- 下一步：真实补证据时先处理 env 组里的 immutable-version 外部输入，再补 runtime `.env` 文件前置、source DSN、目标 endpoint、backend URL、admin token、rollback 信息和人工签收。
- 阻塞/风险：该分组只让缺口更可读，不提供真实 env 值、不创建 runtime `.env`、不执行目标环境发布、preflight、备份恢复、smoke、回滚演练或签收。

## 2026-06-29 first blocked action 带 resolvedInputs

- 完成：`completionAudit.firstBlockedReleaseAction` 现在透出该 action 的 `resolvedInputs` 和完整 `missingPrerequisites`，能直接看到当前 `immutable-version` 已从 `release-evidence.md` 解析到 `RELEASE_VERSION / GIT_COMMIT`，同时仍缺 9 个真实 release batch 输入。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 204 行 / 31297 bytes，未达到归档阈值。
- 下一步：继续补真实 `RELEASE_ENVIRONMENT / OPERATOR_ROLE / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 后，再进入后续 release closeout action。
- 阻塞/风险：`resolvedInputs` 只是显示当前 evidence 中已有的非敏感字段，不证明镜像 digest、migration 状态、目标 preflight、备份恢复、smoke、回滚演练或签收已经发生。

## 2026-06-29 priority audit 下一步输入清单

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `completionAudit` 新增 `blockingCategory / blockingReason` 和 `firstBlockedInputChecklist`，把第一条 blocked release action 的已解析输入、缺失输入、按类型分组、env 模板、runner report / execute 命令拆成稳定字段。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言 JSON 与文本输出，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 211 行 / 32340 bytes，未达到归档阈值。
- 下一步：继续按 `firstBlockedInputChecklist.actionId=immutable-version` 补真实同批次发布输入；当前 completion gate 仍应返回非 0，说明可以按优先级执行，但不能声明整体完成。
- 阻塞/风险：新增字段只改审计表达，不填真实 env、不生成镜像 digest、不读取生产 `.env`、不执行目标环境 preflight、备份恢复、migration、smoke、回滚演练、客户配置激活或签收。

## 2026-06-29 immutable-version 输入模板入口

- 完成：`immutable-version-evidence.mjs` 新增 `--print-input-template`，只读输出 immutable-version 所需 release batch 输入、shell 模板和写入命令；该模式不要求 evidence 目录存在，也不写 `release-evidence.md` 或 `image-digests.txt`。
- 完成：`multi-client-role-workflow-priority-audit.mjs` 的第一条 blocked action 和 `firstBlockedInputChecklist` 现在带出 `inputTemplateCommand / nextInputTemplateCommand`，可从 priority audit 直接跳到 immutable-version 专用输入模板；补测试并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 218 行 / 33423 bytes，未达到归档阈值。
- 下一步：用真实同批次 `RELEASE_ENVIRONMENT / OPERATOR_ROLE / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 执行写入后，重跑 release evidence status / priority completion gate，再继续 production preflight、备份恢复、target smoke、rollback / forward-fix 和 sign-off。
- 阻塞/风险：模板入口仍不生成或验证真实镜像 digest，不访问 registry，不读取 `.env`，不执行 migration、smoke、备份恢复、回滚演练、客户配置激活或签收；completion gate 仍应在目标 evidence 未补齐时返回非 0。

## 2026-06-29 closeout plan 带 inputTemplateCommand

- 完成：`release-evidence-closeout-plan.mjs` 的 `immutable-version` action 现在带出 `inputTemplateCommand`，文本输出也显示 `input template:`，指向 `immutable-version-evidence.mjs --print-input-template`。
- 完成：`multi-client-role-workflow-priority-audit.mjs` 优先复用 closeout plan action 自带模板命令，保持 plan 与 priority audit 的第一缺口入口一致；补 `release-evidence-closeout-plan.test.mjs` / priority audit 相关断言，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 225 行 / 34817 bytes，未达到归档阈值。
- 下一步：执行者先跑 plan 或 priority audit 获取 input template，再用真实 release batch 字段写入 immutable-version evidence；写入后必须重跑 release evidence status / gate，不得把模板输出当真实证据。
- 阻塞/风险：plan 仍是只读，不写 evidence、不执行 preflight、备份恢复、migration、smoke、rollback / forward-fix、客户配置激活或 sign-off；缺真实目标 evidence 时 completion gate 仍应非 0。

## 2026-06-29 closeout runner report 保留 inputTemplateCommand

- 完成：`release-evidence-closeout-runner.mjs` 的 report-only JSON、`--report` 脱敏报告和文本输出现在保留 action 的 `inputTemplateCommand`，blocked `immutable-version` 也能从 runner 输出跳到只读输入模板。
- 完成：补 `release-evidence-closeout-runner.test.mjs` 断言，确认 report / 文本输出包含 input template，且仍不输出 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或命令原始输出；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 232 行 / 35986 bytes，未达到归档阈值。
- 下一步：真实补 evidence 时先用 input template 核对同批次 release 输入，再执行 runner 的 runnable action；每组写入后继续重跑 status / gate / completion audit。
- 阻塞/风险：runner 仍不执行 blocked action、不执行人工 sign-off、不绕过 release evidence gate；input template 是只读上下文，不证明目标环境发布、preflight、备份恢复、migration、smoke、rollback / forward-fix 或客户配置激活已发生。

## 2026-06-29 priority audit 字段级 operator checklist

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 `closeoutActionQueue[*]`、`completionAudit.firstBlockedReleaseAction` 和 `firstBlockedInputChecklist` 新增 `operatorChecklist`，把 resolved / missing 输入拆成字段级来源、证据落点、校验规则和 secret 标记。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，锁住 `SERVER_IMAGE / SERVER_IMAGE_DIGEST / MIGRATION_BEFORE` 等第一阻塞输入的 checklist，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 239 行 / 37146 bytes，未达到归档阈值。
- 下一步：执行者按 `operatorChecklist` 收集真实 release batch、镜像 digest、Atlas migration、backupId、目标 endpoint、DSN / token 或人工签收输入，再重跑 report-only / completion gate。
- 阻塞/风险：`operatorChecklist` 只是安全收集真实输入的索引，不保存 DSN / token / `.env` 原文，不生成镜像、不访问 registry、不执行目标环境 preflight、备份恢复、migration、smoke、rollback / forward-fix、客户配置激活或签收。

## 2026-06-29 operator checklist 下沉到 closeout plan

- 完成：`release-evidence-closeout-plan.mjs` 现在统一生成 `operatorChecklist`，每个 closeout action 同时带出字段真实来源、证据落点、校验规则和 secret 标记；priority audit 改为透传 plan 输出，避免第二套字段指南。
- 完成：`release-evidence-closeout-runner.mjs` 的 report-only JSON、`--report` 脱敏报告和文本输出保留 plan action 的 `operatorChecklist`；补 plan / runner 测试断言，并同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 246 行 / 38345 bytes，未达到归档阈值。
- 下一步：继续用 closeout plan / runner 的同一份 checklist 收集真实 release batch 输入，再按 release evidence status 的下一组证据顺序推进。
- 阻塞/风险：本轮仍只收口本地工具链表达，不填真实 env、runtime `.env`、DSN、token、镜像 digest、migration 结果、目标 smoke、备份恢复、rollback / forward-fix 或 sign-off 证据；completion gate 仍应在目标 evidence 未补齐时返回非 0。

## 2026-06-29 priority audit 持久 runner report 路径

- 完成：`multi-client-role-workflow-priority-audit.mjs` 现在为每个 closeout action 带出默认脱敏 runner 报告路径 `output/release-evidence-closeout/<release>/<action-id>-runner-report.json`，并输出带 `--report` 的 report-only 命令。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 断言，锁住 JSON 与文本输出里的 report path / report file command；同步 `scripts/README.md`、优先级文档和当前真源索引，说明 `output/` 报告只作操作前审计留痕，不是 release evidence gate 证据；本轮追加前已确认 `progress.md` 为 253 行 / 39480 bytes，未达到归档阈值。
- 下一步：执行者可先写脱敏 report-only 报告确认计划和输入缺口，再按同一 release evidence 目录补真实 immutable-version、preflight、smoke、备份恢复、rollback / forward-fix 和签收证据。
- 阻塞/风险：本轮不写 release evidence 目录、不填真实 env / token / DSN / 镜像 digest、不执行目标环境动作；`releaseReady=false` 时 completion gate 仍应返回非 0。

## 2026-06-29 priority audit report-only 命令可直接落盘

- 完成：`multi-client-role-workflow-priority-audit.mjs` 的 runner report / report file 命令不再拼接待填写 env 模板，可直接调用 runner 写出当前 blocked / manual / runnable 状态报告；execute 命令仍保留 env 模板和确认短语。
- 完成：补 priority audit 测试断言，确认 report-only 命令不包含 `<target-environment>`、`<server-image-ref>` 或 `sha256:<64-hex>` 占位；同步 `scripts/README.md`、优先级文档和当前真源索引；本轮追加前已确认 `progress.md` 为 260 行 / 40623 bytes，未达到归档阈值。
- 下一步：执行者可先运行 `closeoutRunnerReportFileCommand` 生成 `output/release-evidence-closeout/<release>/<action-id>-runner-report.json`，再按报告里的 `operatorChecklist` 补真实 release evidence。
- 阻塞/风险：report-only 报告仍只是操作前计划和缺口留痕，不写 release evidence、不执行 target preflight / smoke / backup restore / rollback / sign-off；真实 env、digest、DSN、token 和目标动作仍需外部执行证据。

## 2026-06-29 effective session 菜单诊断路径最小纠偏

- 完成：按确认范围只调整 `effective_session.pages` 菜单收窄策略，正式普通账号仍按 RBAC 与 active customer config pages 取交集；本地开发可按 RBAC 查看客户配置隐藏页用于诊断；sync failure 在正式普通账号下继续 fail closed，但本地开发和 super admin 保留 RBAC 诊断路径；super admin 在正式 active config 下额外保留系统诊断页。
- 完成：补 `adminProfileSync.test.mjs` 覆盖正式普通账号强收窄、本地开发诊断、super admin 系统诊断、sync failure 诊断和 redirect 边界；同步 `style:l1` effective session 场景，避免旧断言继续要求 super admin 从系统诊断页跳走；本轮追加前已确认 `progress.md` 为 267 行 / 41750 bytes，未达到归档阈值。
- 下一步：继续原参考文档落地前，先按优先级表拆下一个最小可验证闭环；不要在菜单诊断纠偏之外继续扩 release evidence。
- 阻塞/风险：本轮不改后端 customer config active revision 语义、不改 release evidence、不提交不推送；本地开发放宽只服务诊断，正式普通账号客户配置收窄仍由测试锁住。

## 2026-06-29 effective session 菜单诊断口径文档同步

- 完成：同步 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 effective session 菜单投影说明，明确正式普通账号仍按 RBAC 与 active revision pages 强收窄；本地开发、super admin 和 sync failure 只保留前端诊断例外，不扩大后端 RBAC、动作权限或 Workflow / Fact usecase。
- 完成：本轮追加前已确认 `progress.md` 为 274 行 / 42980 bytes，未达到归档阈值；未改业务逻辑、脚本或 release evidence。
- 下一步：继续参考文档落地时，按当前菜单投影口径拆最小闭环，不把诊断例外写成正式客户可见能力。
- 阻塞/风险：本轮只改文档口径和 progress，不提交不推送；正式客户强收窄仍以 `adminProfileSync` 当前代码与测试为准。

## 2026-06-29 priority audit effective session 场景锚点同步

- 完成：读取 20260627 主参考、当前优先级文档、当前真源和 priority audit 代码后，确认本轮最高优先级先修源码包 / 审计自洽；`multi-client-role-workflow-priority-audit` 的正式前端投影证据锚点已从旧 `erp-effective-session-direct-url-redirect` 切到当前 `erp-effective-session-super-admin-system-diagnostic`，并保留 `erp-effective-session-empty-pages-blocks-outlet` 对正式普通账号空页面清单的拦截证明。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md` 的 style:l1 场景说明；本轮追加前已确认 `progress.md` 为 281 行 / 43828 bytes，未达到归档阈值。
- 下一步：继续按优先级审计输出推进，不把 release evidence 的外部缺口写成本地已完成；下一阶段优先复核 P0 源码包自洽和 Workflow/RBAC 入口是否还有本地可做缺口。
- 阻塞/风险：本轮不改业务逻辑、不改 release evidence、不执行发布 / 迁移 / 导入、不提交不推送；目标环境 smoke、备份恢复、回滚 / 前向修复和签收仍是外部 evidence-required。

## 2026-06-29 P0 源码包自洽与 Workflow/RBAC 边界复核

- 完成：P0 overlay / 客户包本地闭环复核通过，`scripts/build/apply-customer-web-config.mjs` 与 `web/Dockerfile` / `server/Dockerfile` 引用存在且一致；`node --test scripts/build/apply-customer-web-config.test.mjs scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs` 通过 16 项，`node scripts/qa/customer-config-boundaries.mjs` 输出 ok。
- 完成：P0 Workflow/RBAC 边界复核通过，`node --test scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/workflow-fact-boundary.test.mjs`、`cd server && go test ./internal/biz ./internal/data ./internal/service -run 'Test.*Workflow|Test.*CustomerConfig|Test.*RBAC|Test.*AdminRole|Test.*Engineering'`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/workflowTaskActionAccess.test.mjs src/erp/utils/adminProfileSync.test.mjs src/erp/utils/mobileRolePermissions.test.mjs src/erp/config/entryConfig.test.mjs` 均通过；本轮追加前已确认 `progress.md` 为 288 行 / 45063 bytes，未达到归档阈值。
- 下一步：继续按多甲方优先级主线查找本地可验证缺口；若下一阻塞落到 release evidence、真实导入、部署或目标环境 smoke，必须保持外部 evidence-required，不在本地伪造完成。
- 阻塞/风险：本阶段没有改业务逻辑、schema、release evidence 或客户数据；`web` node test 仍有现存 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响本次用例通过但不代表已完成 package metadata 治理。

## 2026-06-29 P1 demo 客户配置包最小闭环

- 完成：新增 `config/customers/demo/` 中性客户配置包和说明，覆盖 3 条 preview workflow、4 条业务流、3 个状态机和 3 个流程策略；demo 只用于本地 lint / compile / runtime manifest 验证，不代表真实客户、tenant、正式导入或生产发布。
- 完成：`customer-package-lint` 与 `customer-config-runtime-manifest` 现在登记 `demo` 与 `yoyoosun` 两个 tracked package，runtime manifest 会按当前 customer key 写 entitlement `scope_value`；fast / strict 客户包门禁同步跑 demo 与 yoyoosun；priority audit 新增 `demo-customer-package-compile` 本地 ready 检查。
- 完成：验证通过：`node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过 21 项；`node scripts/qa/customer-package-lint.mjs --customer demo`、`--mode compile`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer demo`、`--mode compile` 均通过；`bash -n scripts/qa/fast.sh && bash -n scripts/qa/strict.sh` 通过。本轮追加前已确认 `progress.md` 为 295 行 / 46649 bytes，未达到归档阈值。
- 下一步：继续推进 P1/P2 时优先做可验证的 catalog / schema / responsibility pool / entitlement 小闭环；仍不触碰 release evidence、真实导入或生产发布。
- 阻塞/风险：demo 包不进入后端 publish / activate，不写 DB，不证明第二客户黄金闭环或目标环境发布完成。

## 2026-06-29 P2 entitlement / work pool manifest 守卫

- 完成：`customer-config-runtime-manifest` 校验新增责任池 / 成员 / role profile / access entitlement 完整性守卫，要求每个 work pool 有成员、成员 role 存在、每个 role 有 entitlement、entitlement role 不孤儿、`scope_type=customer`、`scope_value` 匹配当前 customer key，且责任池成员 role 至少具备 `workflow.task.read` / `workflow.task.update`。
- 完成：补 `customer-config-runtime-manifest.test.mjs` 覆盖孤儿责任池、未知 role 成员、缺 entitlement、跨客户 scope 和缺 workflow task 能力；priority audit 同步把该守卫纳入 `demo-customer-package-compile` 本地证据。本轮追加前已确认 `progress.md` 为 303 行 / 48220 bytes，未达到归档阈值。
- 完成：验证通过：`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过 14 项；`node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode compile` 和 `--customer yoyoosun --mode compile` 均通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 仍为本地 `ok=true`、release evidence `target-evidence-required`。
- 下一步：继续围绕 P2 “capability + scope 同一 entitlement 校验”和任务候选人解释做更小闭环；进入后端行为前先确认是否需要 schema / migration 或仅补现有 usecase 测试。
- 阻塞/风险：本轮只加强 manifest 编译期守卫，不改变后端授权算法、不 publish / activate、不写数据库、不证明目标环境 release 或真实任务处理完成。

## 2026-06-29 adminProfileSync 菜单投影文档口径纠偏

- 完成：按 review 结果只同步 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，明确正式前端由 `adminProfileSync` 将 effective session active revision 页面清单与当前账号 RBAC 菜单取交集；隐藏 URL 优先跳回第一个可见入口，无可见入口时只显示空入口提示并阻止业务 Outlet 渲染。
- 完成：文档已把诊断例外收窄到当前代码语义：local dev 只在 RBAC 已允许页面保留客户配置隐藏页或 sync failure 诊断入口；super admin 在正常 active revision 下仅额外保留 `permission-center` / `system-audit-logs`，sync failure 时保留全后台前端诊断路径；正式普通账号仍 fail closed。本轮追加前已确认 `progress.md` 为 311 行 / 49890 bytes，未达到归档阈值。
- 下一步：继续 review 或实现时，按 `adminProfileSync` 当前代码和测试判断菜单可见性，不把诊断例外写成正式客户可见能力。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不碰 release evidence、不提交不推送；按用户要求只跑指定 `git diff --check`。

## 2026-06-29 P2 责任池候选人 entitlement 收口

- 完成：`CustomerConfigUsecase.WorkflowVisibleOwnerRoleKeys` 现在对 active customer config 中由责任池 membership 扩出的 owner role 增加同 revision entitlement 过滤；列表按 `workflow.task.read`，完成 / 阻塞 / 退回 / 催办按对应 action permission 计算可见 owner role，避免用一个角色的动作权限拼接另一个责任池成员关系来处理任务。
- 完成：JSON-RPC `list_tasks`、旧 `update_task_status`、`complete_task_action / block_task_action / reject_task_action`、`urge_task`、`explain_action_access` 和 `explain_task_assignment` 均改为按当前场景 required capability 取责任池可见 owner role；同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md` 口径。本轮追加前已确认 `progress.md` 为 318 行 / 51088 bytes，未达到归档阈值。
- 完成：补 `customer_config_test.go` 与 `jsonrpc_workflow_test.go` 覆盖 membership 存在但缺 `workflow.task.read` 不进入列表、缺 `workflow.task.complete` 不允许完成动作，以及同 role entitlement 命中后可见 / 可处理；验证通过：`cd server && go test ./internal/biz ./internal/service`，`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：继续 P2 时可在不改 schema 的范围内复核 explain 输出是否需要暴露命中的 entitlement / capability 说明；进入 owner_pool_key、required_capability 字段或流程实例 runtime 前必须单独拆 schema / migration 阶段。
- 阻塞/风险：本轮不改 schema / migration、不新增 `owner_pool_key`、不实现完整 scope matcher、不写 Workflow / Fact 事实、不触碰 release evidence、真实导入或部署；基础账号角色仍按既有 RBAC 可见，新增过滤只约束由 responsibility pool 扩出的 owner role。

## 2026-06-29 P2 priority audit 覆盖 required capability 过滤

- 完成：`multi-client-role-workflow-priority-audit` 的 `task-visibility-with-work-pools` 检查已从“存在责任池可见性”升级为同时要求服务端按 `requiredCapabilities` / `WorkflowStatusActionPermission` 过滤、usecase 读取 `access_entitlements`，并存在列表 read entitlement 与完成 action entitlement 的防跨角色拼接测试。
- 完成：验证通过：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`，以及 `git diff --check -- server/internal/biz/customer_config.go server/internal/biz/customer_config_test.go server/internal/service/jsonrpc_workflow_task.go server/internal/service/jsonrpc_workflow_test.go docs/当前真源与交接顺序.md docs/product/多甲方角色能力流程编排优先级.md server/README.md scripts/qa/multi-client-role-workflow-priority-audit.mjs progress.md`；本轮追加前已确认 `progress.md` 为 326 行 / 53027 bytes，未达到归档阈值。
- 下一步：继续 P2/P3 前，先判断是否只补 explain 可解释字段，还是需要进入 `owner_pool_key / required_capability` schema 阶段。
- 阻塞/风险：本轮只加强本地审计锚点，不证明目标环境 release、真实客户配置激活、真实导入或领域事实过账完成。

## 2026-06-29 P2 explain 合同责任池解释字段补强

- 完成：`explain_action_access` 现在在每个动作解释中返回 `owner_role_key`、`admin_role_keys`、`visible_owner_role_keys`、`owner_role_matched`、`work_pool_role_matched` 和服务端推导的 `actor_role_key`，让支持排障可以直接看出当前 action required permission 下责任池是否真的命中；`explain_task_assignment` 额外返回 `action_required_permissions`。
- 完成：前端共享 `workflowTaskActionAccess` normalizer 保留后端返回的 required permission、owner role、visible owner roles 和责任池命中字段，避免页面后续消费 explain 时丢掉责任池解释信息；同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit` 检查点。本轮追加前已确认 `progress.md` 为 333 行 / 54364 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowExplain'`、`cd server && go test ./internal/biz ./internal/service`、`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。Node 仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响本轮用例通过。
- 下一步：P2 剩余可本地推进项是评估 `explain_module_status` 是否能基于现有 module / customer config 状态做只读解释；如果进入 `owner_pool_key / required_capability / process_instance`，必须单独拆 Ent / Atlas migration 阶段。
- 阻塞/风险：本轮不改授权结果、不改 schema / migration、不写 Workflow / Fact 事实、不触碰 release evidence、真实导入或部署；目前 explain 仍无法返回真实 `entitlement_id`、流程 / 节点实例或配置版本字段，因为这些需要后续 schema / runtime 阶段支撑。

## 2026-06-29 P3 WorkflowTask 运行时解释锚点

- 完成：按多甲方角色能力流程编排主线推进 P3 前置小闭环，`workflow_tasks` 通过 Ent + Atlas 新增可空 `owner_pool_key / required_capability_key / config_revision` 和查询索引；`CreateTask` 默认把 owner role 写入 owner pool，并按当前完成动作推导 required capability，boss 审批任务默认为 `workflow.task.approve`，普通任务默认为 `workflow.task.complete`。
- 完成：后端派生任务会继承当前任务 `config_revision`，repo create / 派生任务刷新 / Ent 映射已持久化并返回这些字段，JSON-RPC `create_task`、任务返回、`explain_action_access` 和 `explain_task_assignment` 都会暴露只读解释锚点；同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`。本轮追加前已确认 `progress.md` 为 417 行 / 72638 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && make data`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；priority audit 现在把 `workflow-task-runtime-anchors` 列为 local ready，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：继续拆真正的 ProcessInstance / ProcessNodeInstance runtime 或候选人解释时，必须单独声明 schema / migration、权限、幂等和测试边界；领域命令过账仍需按对应 Fact usecase 另拆，不从 WorkflowUsecase 直接写事实。
- 阻塞/风险：本轮不触碰 release evidence、真实导入、部署或客户数据写入；新增字段只是 WorkflowTask runtime 解释锚点，旧任务可为空，当前授权过滤仍以 owner role / assignee / active revision entitlement scope 为主，不证明流程实例 runtime、owner_pool 直接候选人过滤、目标环境 migration 或领域事实过账已经完成。

## 2026-06-29 break-glass 请求审计语义治理

- 完成：将 `workflow_task.break_glass` runtime audit 的可读语义从“执行了”收窄为“发起请求”，payload 使用 `requested_next_status_key` 表达目标状态，避免任务状态更新失败时把审计误读为已经成功完成；同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md`。本轮追加前已确认 `progress.md` 为 425 行 / 74774 bytes，未达到归档阈值。
- 下一步：如后续需要证明 break-glass 请求与任务更新结果强一致，应单独评审事务化审计或结果审计，不在本轮扩展为长期 break-glass session、审批流或 outbox。
- 阻塞/风险：本轮不改 Workflow / Fact 事实边界，不触碰 release evidence、schema / migration、客户配置或前端页面；审计先写入仍表示“请求已记录”，任务成功结果继续以 `workflow_task_events` 和任务状态为准。

## 2026-06-29 P3 WorkflowTask 配置候选角色解释

- 完成：在不改变授权结果的前提下，新增 `WorkflowCandidateOwnerRoleKeys` 只读解释，按 active customer config 中同一 owner pool、action capability 和 customer scope 反查配置候选责任角色；只返回 role key、membership role、entitled role 和 source，不暴露 entitlement ID 或 user-level 候选人。本轮追加前已确认 `progress.md` 为 431 行 / 75796 bytes，未达到归档阈值。
- 完成：`explain_action_access` 增加 `configured_candidate_owner_role_keys / configured_membership_role_keys / configured_entitled_role_keys / configured_candidate_source`；`explain_task_assignment` 增加 `configured_read_candidate_owner_role_keys / action_configured_candidate_owner_role_keys / action_configured_candidate_sources`，并保持原 `candidate_owner_role_keys` 仍表示当前账号可见 owner role 集合。
- 完成：同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`；priority audit 新增 `workflow-task-configured-candidates` local ready，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'WorkflowCandidateOwnerRoleKeys|WorkflowVisibleOwnerRoleKeys'`、`cd server && go test ./internal/service -run 'WorkflowExplain(ActionAccess|TaskAssignment)'`、`cd server && go test ./internal/biz ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：若继续推进流程运行时，应单独拆 ProcessInstance / ProcessNodeInstance schema、候选人分配、幂等和权限验证；不要把当前只读配置候选解释写成 owner_pool 直接授权或任务过滤。
- 阻塞/风险：本轮不触碰 release evidence、真实导入、部署或客户数据写入；不改 Workflow / Fact 事实边界，不新增任务候选人用户清单，不证明目标环境客户配置或 release smoke 已完成。

## 2026-06-29 P3 领域命令进入条件只读解释

- 完成：`explain_action_access` 新增 `domain_command_entry`，`explain_task_assignment` 新增 `action_domain_command_entries`；当前所有 Workflow task action 均返回 `enabled=false`、`will_write_fact=false`，完成动作说明 `guarded_no_domain_command_contract`，并列出 command key、domain usecase binding、stable business ref、idempotency、RBAC、append-only audit、重复提交测试和取消 / 冲正策略等正式进入条件。本轮追加前已确认 `progress.md` 为 440 行 / 78142 bytes，未达到归档阈值。
- 完成：即使 workflow payload 中出现 `command_key` 或 `domain_command_key`，explain 也只标记 `workflow_payload_command_key_ignored`，不采信 payload 触发领域事实；`complete_task_action / block_task_action / reject_task_action` 仍只更新 Workflow 任务和协同状态，不调用库存、出货、质检、财务或其他 Fact usecase。
- 完成：同步 `scripts/qa/workflow-fact-boundary.test.mjs`、`scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md`；priority audit 新增 `domain-command-entry-preflight` local ready，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 完成：验证通过：`cd server && go test ./internal/service -run 'WorkflowExplain(ActionAccess|TaskAssignment)'`、`node --test scripts/qa/workflow-fact-boundary.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`cd server && go test ./internal/biz ./internal/service`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：真正开放某个任务的领域命令入口时，必须单独选择一个业务域和命令，先完成 source-of-truth 字段、状态机、幂等键、RBAC、审计、重复提交、取消 / 冲正和测试范围评审，再由对应领域 usecase 写事实。
- 阻塞/风险：本轮不触碰 schema / migration、release evidence、真实导入、部署或客户数据写入；不新增 ProcessInstance / ProcessNodeInstance，不证明任务完成会自动过账，也不证明目标环境已执行任何领域命令。

## 2026-06-29 P3 前端保留领域命令进入条件解释

- 完成：`workflowTaskActionAccess` normalizer 保留后端 `domain_command_entry`，统一转换为 `domainCommandEntry`，包含 `enabled / willWriteFact / source / commandKey / blockedReasons / requiredContract`；fallback 下也固定 `enabled=false / willWriteFact=false`，避免没有后端 explain 时前端误判可执行领域命令。本轮追加前已确认 `progress.md` 为 449 行 / 80610 bytes，未达到归档阈值。
- 完成：补 `workflowTaskActionAccess.test.mjs`，覆盖后端 explain 的 `guarded_no_domain_command_contract` 和 fallback 的 `fallback_no_domain_command_contract`；同步 `multi-client-role-workflow-priority-audit` 和 `docs/product/多甲方角色能力流程编排优先级.md`，把前端共享 helper 保留 domain command entry 纳入证据。
- 完成：验证通过：`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。Node 仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响测试通过。
- 下一步：如果继续本地推进，可选择正式 UI 层展示该解释字段，或进入 ProcessInstance / ProcessNodeInstance schema 前置评审；若跨 release evidence、真实导入、部署或 schema migration，必须单独声明阶段边界和验证方式。
- 阻塞/风险：本轮不改页面渲染、不改样式、不新增 UI 文案、不写 Fact、不改 schema / migration、不触碰 release evidence、真实导入、部署或客户数据写入；只保证共享前端 helper 能保留后端只读解释。

## 2026-06-29 P3 ProcessInstance / ProcessNodeInstance 最小运行时

- 完成：按 P3 最小运行时边界新增 `process_instances` 和 `process_node_instances` Ent schema / Atlas migration，记录 process key / version / variant / config revision / definition hash / module contract snapshot / business ref / idempotency，以及 node key / type / attempt / status / owner pool / required capability / form profile / action set / policy snapshot。本轮追加前已确认 `progress.md` 为 382 行 / 66191 bytes，已先归档旧流水到 `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`。
- 完成：新增 `ProcessRuntimeUsecase` 和 `ProcessRuntimeRepo`，支持创建 process instance、连同初始 node instances 持久化、按 id 读取实例、按 process id 列出节点；默认 status / attempt / JSON snapshot 只做最小规范化，不驱动 WorkflowTask、不执行 domain_command、不写库存 / 出货 / 质检 / 财务 Fact。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`；priority audit 新增 `process-runtime-minimum` local ready，同时保留 WorkflowTask 尚未链接 ProcessInstance / ProcessNodeInstance、节点推进 / fan-out / join / returnTo / wait_event / domain_command 仍未实现、目标 migration 未应用的未证明项。
- 完成：验证通过：`cd server && make data`、`cd server && go test ./internal/biz -run 'ProcessRuntime'`、`cd server && go test ./internal/data -run 'ProcessRuntime'`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：继续 P3 时应单独拆 WorkflowTask 与 ProcessNodeInstance 链接、节点状态推进、wait_event / fan-out / join / returnTo 和 domain_command 执行；任一领域事实过账必须回到对应 Fact usecase、幂等、RBAC、审计和取消 / 冲正测试。
- 阻塞/风险：本轮不触碰 release evidence、真实导入、部署、目标环境 migration 或客户数据写入；新增 runtime 只证明本地最小持久化与 repo/usecase 读写，不证明目标环境已迁移、不证明流程 runner 或任务候选人直接过滤已经完成。

## 2026-06-29 P3 WorkflowTask 流程节点关联字段

- 完成：`workflow_tasks` 新增可空 `process_instance_id / process_node_instance_id` 和查询索引，`WorkflowTaskCreate`、repo 持久化 / 回读、`create_task` 入参和任务 JSON 返回均保留这两个流程节点追踪锚点；`process_node_instance_id` 不能脱离 `process_instance_id` 单独写入。本轮追加前已确认 `progress.md` 为 391 行 / 68768 bytes，未达到归档阈值。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`；priority audit 新增 `workflow-task-process-link` local ready，并继续标记“流程运行时自动创建 linked WorkflowTask、linked task 完成后推进节点、目标 migration 已应用”未被证明。
- 完成：验证通过：`cd server && make data`、`cd server && go test ./internal/biz -run 'WorkflowUsecase_CreateTask(PreservesRuntimeAnchors|RejectsNodeLinkWithoutProcessLink)|ProcessRuntime'`、`cd server && go test ./internal/data -run 'WorkflowRepo_CreateAndUpdateTaskStatus|ProcessRuntime'`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P3 下一阶段可以选择“流程运行时从 human_task / approval 节点显式创建 linked WorkflowTask”或“linked task 完成后推进 ProcessNodeInstance 状态”；仍需单独声明 runner、幂等、RBAC、审计和回退边界。
- 阻塞/风险：本轮不实现流程 runner、claim、节点推进、wait_event、fan-out / join、returnTo 或 domain_command，不改 Fact usecase、不触碰 release evidence、真实导入、部署或客户数据写入；新增字段是本地 schema/API 锚点，不证明目标环境 migration 已应用。

## 2026-06-29 P3 ProcessRuntime 显式完成 linked 人工任务节点

- 完成：`ProcessRuntimeUsecase` 新增 `CompleteLinkedWorkflowTask`，只接受已 `done` 且带 `process_instance_id / process_node_instance_id` 的 linked `WorkflowTask`，校验节点归属、节点类型和 settled 状态后，显式把对应 `ProcessNodeInstance` 完成。本轮追加前已确认 `progress.md` 为 399 行 / 70900 bytes，未达到归档阈值。
- 完成：`ProcessRuntimeRepo` 新增 `CompleteProcessNodeInstance`，使用节点 `version` 做乐观锁，写入 `completed`、`completed_at`、outcome 并递增 version；旧 version 再写会返回冲突，避免重复完成覆盖节点状态。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`；priority audit 新增 `process-runtime-linked-task-completion` local ready，JSON 审计当前为 20/20 checks 通过、12 条 reference coverage，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime'`、`cd server && go test ./internal/data -run 'ProcessRuntime'`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：继续 P3 时可单独拆“`complete_task_action` 成功后受控调用 ProcessRuntime completion”或“完成当前节点后启动下一节点”；进入任一自动推进、fan-out / join / returnTo / wait_event 或 domain_command 前，必须另补 JSON-RPC/RBAC/幂等/审计测试。
- 阻塞/风险：本轮不接自动 runner，不改 Workflow action API 自动触发，不启动下一节点，不写 Fact usecase，不触碰 release evidence、真实导入、部署或客户数据写入；目标环境 migration、smoke、恢复 / 回滚和客户配置激活仍未由本轮证明。

## 2026-06-29 adminProfileSync 菜单投影文档口径纠偏

- 完成：按 `adminProfileSync` 当前代码口径，仅修正 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的补充说明：菜单过滤与当前 URL 路由守卫共用“RBAC 菜单路径层 + effective session pages 层”；正式普通账号必须同时命中两层，隐藏 URL 只允许前端跳转到可见 fallback 或显示空入口提示。
- 完成：明确 `local dev` 只绕过 effective session page 收窄，不能绕过普通账号 `allowedMenuPaths`；`super admin` 只在路径层绕过，正常 active revision 下仍受 pages 收窄，仅额外保留 `permission-center` / `system-audit-logs`，只有 `effective_session_sync_failed` 空投影时才保留全后台前端诊断路径；已有 cached effective_session 时继续复用缓存投影，不退回 RBAC-only。本轮追加前已确认 `progress.md` 为 408 行 / 73164 bytes，未达到归档阈值。
- 下一步：如后续改变 `adminProfileSync`、`ERPLayout` 路由守卫或 `get_effective_session` 同步策略，需要同步更新这两处文档并补对应前端测试 / style:l1 场景。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不碰 release evidence、部署、真实导入或客户数据写入；本轮只做文档口径纠偏，不能替代后端 RBAC、动作权限、customer_config active revision、Workflow / Fact usecase 或目标环境 evidence。

## 2026-06-29 P3 ProcessRuntime 顺序激活下一 waiting 节点

- 完成：`ProcessRuntimeUsecase.CompleteLinkedWorkflowTask` 在完成当前 linked `human_task / approval` 节点后，会按同一流程实例内节点创建顺序检查紧邻下一节点；只有下一节点仍为 `waiting` 时，才通过 `ActivateProcessNodeInstance` 将其置为 `active`、写入 started_at 并递增 version。本轮追加前已确认 `progress.md` 为 415 行 / 74614 bytes，未达到归档阈值。
- 完成：补 usecase / repo 测试锁住三条边界：当前节点完成后激活紧邻 waiting 节点；紧邻节点非 waiting 时不跳过到后续 waiting 节点；激活使用 version 乐观锁，旧 version 再激活返回冲突。同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`；priority audit 当前 22/22 checks 通过、14 条 reference coverage，新增 `process-runtime-sequential-next-node` local ready，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime'`、`cd server && go test ./internal/data -run 'ProcessRuntime'`、`cd server && go test ./internal/service -run 'Workflow(CompleteTaskAction|UpdateTaskStatusDoesNotAutoComplete)'`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：P3 后续可单独拆“active human_task / approval 节点自动创建下一 linked WorkflowTask”或“fan-out / join / returnTo / wait_event”；任何 `domain_command` 调用领域 usecase 必须另按对应业务域评审幂等、RBAC、审计、重复提交和取消 / 冲正测试。
- 阻塞/风险：本轮不改 schema / migration，不创建下一 WorkflowTask，不执行节点 handler，不扫描流程定义，不做 fan-out / join / returnTo / wait_event，不执行 `domain_command`，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；当前节点完成和下一节点激活不是同一数据库事务，若激活失败会返回错误但当前节点已完成，后续如需强一致要单独评审事务边界。

## 2026-06-29 P3 ProcessRuntime linked 任务创建 active 节点守卫

- 完成：`ProcessRuntimeUsecase.CreateLinkedWorkflowTask` 现在只允许从状态为 `active` 的 `human_task / approval` `ProcessNodeInstance` 显式创建 linked `WorkflowTask`；`waiting` 节点必须先由运行时激活，避免提前为尚未启动的节点生成任务。本轮追加前已确认 `progress.md` 为 423 行 / 77213 bytes，未达到归档阈值。
- 完成：新增 `ErrProcessNodeInstanceNotActive` 和 usecase 测试 `TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsInactiveNode`；happy path 改为 active 节点，`domain_command` 拒绝边界保持不变。同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`，明确该闭环只是 active 节点进入人工任务层，不自动扫描流程定义、不自动创建下一 linked WorkflowTask、不写 Fact。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime'`、`cd server && go test ./internal/service -run 'Workflow(CompleteTaskAction|UpdateTaskStatusDoesNotAutoComplete)'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`git diff --check -- server/internal/biz/process_runtime.go server/internal/biz/process_runtime_test.go scripts/qa/multi-client-role-workflow-priority-audit.mjs docs/product/多甲方角色能力流程编排优先级.md docs/当前真源与交接顺序.md server/README.md progress.md`；priority audit 当前 22/22 checks 通过、14 条 reference coverage，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：P3 后续可继续拆“active human_task / approval 节点自动创建下一 linked WorkflowTask”的 owner role 解析 / 幂等 / 重复任务边界，或进入 fan-out / join / returnTo / wait_event 设计；`domain_command` 仍必须另按领域 usecase、RBAC、幂等、审计和取消 / 冲正测试评审。
- 阻塞/风险：本轮不改 schema / migration，不改 JSON-RPC 合同，不自动创建任务，不执行节点 handler，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；服务层完成 linked 节点的桥接已回归，但没有跑全量后端测试。

## 2026-06-29 adminProfileSync 菜单投影文档复核

- 完成：按只读 review 结论和 `adminProfileSync` / `ERPLayout` 当前代码，再次只更新 `docs/当前真源与交接顺序.md` 与 `web/README.md` 的菜单投影口径，明确 RBAC 菜单路径层、effective session pages 层、隐藏 URL fallback / 空入口行为，以及 `local dev`、`super admin`、sync failure 诊断例外的精确边界。本轮追加前已确认 `progress.md` 为 431 行 / 79750 bytes，未达到归档阈值。
- 下一步：如后续改动 `adminProfileSync`、`ERPLayout` 路由守卫、`get_effective_session` 缓存 / 空投影策略或正式客户配置投影，需要同步更新这两份文档并补前端测试。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence、部署、真实导入或客户数据；文档只说明前端可见性和诊断路径，不扩大后端 RBAC、动作权限、`customer_config` active revision、Workflow / Fact usecase 或目标环境 evidence。

## 2026-06-29 P3 ProcessRuntime linked 任务创建 expected_version 守卫

- 完成：`ProcessRuntimeUsecase.CreateLinkedWorkflowTask` 新增 `ExpectedVersion` 输入校验，创建 linked `WorkflowTask` 前要求当前 `ProcessNodeInstance.Version` 与调用方 expected version 匹配；旧版本返回 `ErrProcessNodeInstanceConflict`，且不会创建任务。本轮追加前已确认 `progress.md` 为 437 行 / 80801 bytes，未达到归档阈值。
- 完成：补 `TestProcessRuntimeUsecaseCreateLinkedWorkflowTaskRejectsStaleNodeVersion`，happy path 显式传入 active node version；同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`，把 P3 linked 人工任务创建口径收窄为 active 且 expected_version 匹配。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 摘要为 22/22 checks 通过、14 条 reference coverage，`releaseReady=false`，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可进入“active human_task / approval 节点自动创建下一 linked WorkflowTask”的 owner role 解析、幂等 / 重复任务边界，或单独拆 fan-out / join / returnTo / wait_event；`domain_command` 仍必须另按领域 usecase、RBAC、幂等、审计和取消 / 冲正测试评审。
- 阻塞/风险：本轮不改 schema / migration，不改 JSON-RPC 对外合同，不自动创建任务，不执行节点 handler，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；未跑全量后端测试。
