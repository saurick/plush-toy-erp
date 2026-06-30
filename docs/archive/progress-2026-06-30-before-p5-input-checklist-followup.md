# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。
- `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`：归档 2026-06-29 target evidence binding 之后到 release evidence runner 脱敏报告与 URL 前置拦截的过程记录。
- `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`：归档 2026-06-29 adminProfileSync 菜单投影文档纠偏、P2 explain / entitlement / break-glass 中段过程记录。
- `docs/archive/progress-2026-06-29-before-linked-task-idempotency.md`：归档 2026-06-29 P3 ProcessRuntime expected_version 守卫之前至 linked task 幂等闭环前的过程记录。
- `docs/archive/progress-2026-06-30-before-inventory-post-inbound.md`：归档 2026-06-30 P3 / P4 前段、adminProfileSync 菜单投影文档多轮纠偏、sales_order_acceptance、material_supply definition evidence、`purchase_receipt.create` 和 `quality_inspection.decide` 领域命令 handler 过程记录。
- `docs/archive/progress-2026-06-30-before-p5-release-input-checklist.md`：归档 2026-06-30 P4-2 / P4-3、adminProfileSync 文档纠偏和进入 P5 release closeout 输入清单前的过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本和 backup id 时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-30 多甲方流程主线 implementationOrder 审计队列

- 完成：回到多甲方角色能力模块组合流程编排主线，按主 reference、`docs/product/多甲方角色能力流程编排优先级.md` 和当前真源复核后，在 `multi-client-role-workflow-priority-audit` 中新增 `implementationOrder`，按 P0-P5 输出阶段目标、本地 / 目标环境证据状态、禁止越界范围和下一条 release closeout 动作。
- 完成：`implementationOrder` 当前显示 P0 源码包/RBAC/Workflow 边界、P1 客户配置 runtime、P2 entitlement/责任池、P3 窄版 ProcessRuntime、P4 三条黄金闭环均为本地 `ready`；P5 测试部署 / 导入 / 第二客户验证为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。该输出只用于执行队列，不写 release evidence。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，明确机器可读执行队列以 audit JSON 的 `implementationOrder` 为准；当前没有正式生产环境时，P5 不能把本地 ready 或 report-only 命令写成目标 release evidence 已完成。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true / releaseReady=false` 且 P5 next action 为 `immutable-version`；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs docs/product/多甲方角色能力流程编排优先级.md progress.md`。
- 下一步：继续主线时应按 `implementationOrder` 进入 P5 的受控 release closeout 输入准备，优先使用 report-only / input-template 路径；若要写 release evidence、真实导入、部署或目标环境 smoke，必须先声明环境、风险、输入来源和验证方式。
- 阻塞/风险：本阶段不改业务逻辑、不改 schema / migration、不执行真实导入、部署或目标 smoke、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 P5 immutable-version report-only 输入快照

- 完成：按 `implementationOrder` 进入 P5 的第一条 blocked release closeout 动作 `immutable-version`，只运行 report-only 模式，生成 `output/release-evidence-closeout/2026-06-29/immutable-version-runner-report.json`。
- 完成：报告显示 `executed=false`、`immutable-version canRun=false`，只解析出既有 `RELEASE_VERSION / GIT_COMMIT`，仍缺 `RELEASE_ENVIRONMENT / OPERATOR_ROLE / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 等真实 release batch 输入。
- 验证：`node scripts/deploy/release-evidence-closeout-runner.mjs --evidence-dir deployments/yoyoosun/evidence/releases/2026-06-29 --runtime-env-file server/deploy/compose/prod/.env --only immutable-version --report output/release-evidence-closeout/2026-06-29/immutable-version-runner-report.json --json`；读取报告 JSON 确认 `ok=true / executed=false / selectedActionCount=1 / immutableCanRun=false`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 仍确认 `ok=true / releaseReady=false / p5State=target-evidence-required / firstBlocked=immutable-version`。
- 下一步：如要继续 P5，必须先获得真实目标环境、镜像 ref/digest、Atlas migration 前后版本和 backup id；仍应先用 input template 或 report-only 核对，再决定是否写 release evidence。
- 阻塞/风险：本阶段不执行 `--execute`，不填真实 env，不写 `deployments/yoyoosun/evidence/**`，不跑部署、目标 smoke、备份恢复、回滚演练、客户配置激活或真实导入；`deployments/yoyoosun/evidence/releases/2026-06-29/` 在工作区已有 untracked 现场，本阶段未把 report 写入该目录。

## 2026-06-30 P5 immutable-version 输入模板快照

- 完成：继续 P5 `immutable-version`，只运行 `immutable-version-evidence.mjs --print-input-template`，把同批次 release 输入模板保存到 ignored `output/release-evidence-closeout/2026-06-29/immutable-version-input-template.txt`。
- 验证：模板包含 `RELEASE_VERSION / RELEASE_ENVIRONMENT / OPERATOR_ROLE / GIT_COMMIT / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID` 和写入命令，并明确不构建镜像、不访问 registry、不读取 `.env`、不执行 migration / smoke / restore；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 仍为 `ok=true / releaseReady=false / p5State=target-evidence-required / firstBlocked=immutable-version`。
- 下一步：只有拿到真实 release batch 输入后，才可评审是否写入 `release-evidence.md` / `image-digests.txt`；写入前仍需声明目标环境、输入来源和验证方式。
- 阻塞/风险：本阶段不写 release evidence、不执行 `--execute`、不填真实 env、不部署、不导入真实数据；`deployments/yoyoosun/evidence/releases/2026-06-29/` 仍是既有 untracked 现场。

## 2026-06-30 P5 implementationOrder 输入清单合同

- 完成：增强 `multi-client-role-workflow-priority-audit` 的 P5 `implementationOrder[].nextAction`，直接输出 `inputChecklist`、report-only 报告路径、`reportOnlyWritesReleaseEvidence=false`、execute 确认短语和 gate 摘要；不改 release runner 执行逻辑。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，说明 P5 输入清单可直接从 `implementationOrder` 读取。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；审计 JSON 抽查 `ok=true / releaseReady=false / p5State=target-evidence-required / action=immutable-version`；`git diff --check` 与 touched untracked 文件 no-index check 通过。
- 下一步：继续 P5 时仍只能基于真实目标环境、镜像 digest、migration 版本和 backup id 决定是否写 release evidence；没有这些输入时只做 report-only / checklist。
- 阻塞/风险：不写 `deployments/**/evidence/**`、不执行 `--execute`、不部署、不导入客户数据；`progress.md` 更新前为 393 行、79495 字节，未达归档阈值。


## 2026-06-30 progress 归档到 P5 输入清单前

- 完成：归档前 `progress.md` 为 401 行 / 80649 bytes，接近 80KB 阈值；已将 P5 审计队列之前的旧流水复制到 `docs/archive/progress-2026-06-30-before-p5-release-input-checklist.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和最近 P5 记录，方便后续继续按阶段追加。
- 下一步：继续 P5 时仍从 `implementationOrder` 的 `p5-release-import-second-customer.nextAction` 读取输入清单；没有真实 release batch 输入时只做 report-only / checklist。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态、release evidence 或正式业务真源。

## 2026-06-30 P5 closeout 全队列 report-only 快照

- 完成：运行 release closeout runner 默认 report-only 模式，生成 ignored `output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json`，覆盖 7 个 closeout action。
- 验证：报告为 `ok=true / executed=false / selectedActionCount=7 / executeReady=false`；7 个 action 均未 ready，其中 `release-signoff` 为 manual，其余因真实 env/file/target 输入缺失 blocked；priority audit 仍为 `ok=true / releaseReady=false / p5State=target-evidence-required / first=immutable-version`。
- 下一步：继续 P5 时优先补真实 release batch 输入；没有输入时只保留 report-only/checklist，不写 release evidence。
- 阻塞/风险：未执行 `--execute`，未写 `deployments/**/evidence/**`，未部署、未跑 migration/smoke/restore/rollback/signoff，未导入客户数据。

## 2026-06-30 菜单投影文档口径复核

- 完成：按 review 结论复核 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中的菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外描述，确认已对齐 `adminProfileSync` 与 `ERPLayout` 当前代码口径。
- 验证：只运行用户指定的 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如后续修改 `adminProfileSync`、`ERPLayout` 或菜单 seed，需要同步更新两份文档与对应测试口径。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不写 release evidence；目标文档中存在本轮前已有的其他未提交差异，本轮未回退或整理。

## 2026-06-30 P5 全队列 report-only 合同

- 完成：继续多甲方角色能力流程编排主线 P5，在 `multi-client-role-workflow-priority-audit` 的 `releaseEvidenceProgress` 中补全整条 closeout 队列的默认 report-only 报告路径和带 `--report` 的命令，默认落到 ignored `output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json`。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，明确全队列和单 action report-only 报告只用于操作前留存计划，不写 release evidence，也不替代 preflight、target smoke、backup restore、rollback rehearsal 或 sign-off。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；审计 JSON 抽查 `ok=true / releaseReady=false / p5State=target-evidence-required / closeoutRunnerReportWritesReleaseEvidence=false`，且全队列 `closeoutRunnerReportFileCommand` 不带 `--execute` 或 env placeholder。
- 下一步：继续 P5 时仍应先补真实 release batch 输入和目标 evidence；没有正式环境时只能继续 report-only / checklist，不把本地 ready 写成 release complete。
- 阻塞/风险：未执行 release runner、未设置真实 env、未写 `deployments/**/evidence/**`、未部署、未跑 migration / target smoke / backup restore / rollback rehearsal / sign-off，未导入真实客户数据。

## 2026-06-30 P5 文本输出 report-only 可复制命令

- 完成：继续 P5 report-only / checklist 链路，把全队列 runner report path、report-only 命令、带 `--report` 的落盘命令和 `writes release evidence=false` 暴露到 `multi-client-role-workflow-priority-audit` 非 JSON 文本输出，方便人工不用解析 JSON 也能复制全队列快照命令。
- 完成：补 `multi-client-role-workflow-priority-audit.test.mjs` 文本输出断言，并同步 `docs/product/多甲方角色能力流程编排优先级.md` 的说明，明确文本输出也只提供 report-only 计划快照。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs | rg -n "release evidence closeout runner|all actions runner report"`；JSON 抽查仍为 `ok=true / releaseReady=false / p5State=target-evidence-required / reportWritesReleaseEvidence=false`，且 report file command 不带 `--execute` 或 env placeholder。
- 下一步：继续 P5 时优先补真实 target release 输入和目标 evidence；若仍无正式环境，只继续做只读检查、report-only 快照或输入清单收敛。
- 阻塞/风险：本轮未运行 runner report 命令本身，未写 `output/` 新文件，未写 release evidence，未部署、未 migration、未 target smoke、未备份恢复、未回滚演练、未 sign-off、未真实导入。

## 2026-06-30 P5 全队列 report-only 实跑快照

- 完成：使用 audit 文本输出中的全队列 report-only 命令刷新 ignored `output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json`，覆盖 7 个 closeout action。
- 验证：runner 输出与落盘 JSON 均为 `ok=true / executed=false / executeReady=false / selectedActionCount=7 / blockers=7 / firstAction=immutable-version / resultCount=0`；`git status --short -- deployments/yoyoosun/evidence/releases/2026-06-29 output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json` 只显示既有 untracked release evidence 目录，ignored `output/` 报告不进入 Git。
- 下一步：继续 P5 时仍需真实 release batch 输入、目标 smoke、backup restore、rollback rehearsal、sign-off 和客户配置读回 evidence；没有这些输入时只做 report-only / checklist。
- 阻塞/风险：未执行 `--execute`，未设置真实 env，未写 `deployments/**/evidence/**`，未部署、未 migration、未 target smoke、未备份恢复、未回滚演练、未 sign-off、未真实导入；该报告只是当前计划快照，不是 release gate 证据。

## 2026-06-30 菜单投影文档口径纠偏

- 完成：按 review 发现修正 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，明确 hidden URL 诊断例外不是后端授权或白名单，正式 / 非前端 DEV 构建 super admin 在正常 active revision 下只是在 active pages 之外额外保留系统诊断页。
- 完成：进一步把 sync failure 诊断例外主语收窄为正式 / 非前端 DEV 构建的 `super admin` 当前 profile 已挂载 `effective_session_sync_failed` 空投影，避免误读成普通账号或正式环境全量菜单放开。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若调整 `adminProfileSync`、`ERPLayout`、`resolveMenuPermissionKey` 或导航 seed，需要同步更新这两处文档和 `adminProfileSync.test.mjs` 断言。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；只按用户指定范围运行 diff whitespace 检查。

## 2026-06-30 P5 全队列输入清单聚合

- 完成：继续多甲方角色能力流程编排主线 P5，在 `multi-client-role-workflow-priority-audit` 的 `releaseEvidenceProgress.closeoutInputChecklist` 中聚合整条 release closeout 队列的缺失输入，输出 env / file / manual 分组、每个输入关联的 action、env 模板、operator checklist、secret 标记和 `writesReleaseEvidence=false` 边界。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，说明 `nextAction.inputChecklist` 是第一条 blocked action 清单，`closeoutInputChecklist` 是全队列输入清单，二者都不代表目标 release evidence 已完成。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；JSON 抽查为 `ok=true / releaseReady=false / state=target-evidence-required / writesReleaseEvidence=false`，文本输出包含 env / file / manual 缺口和 secret 输入列表。
- 下一步：继续 P5 时仍需真实 release batch 输入、目标 smoke、backup restore、rollback rehearsal、sign-off 和客户配置读回 evidence；没有这些输入时只做 report-only / checklist。
- 阻塞/风险：本轮未执行 `--execute`，未写 `deployments/**/evidence/**`，未写 `output/` 新报告，未部署、未 migration、未 target smoke、未备份恢复、未回滚演练、未 sign-off、未真实导入。

## 2026-06-30 P5 输入收集计划按 action 分组

- 完成：在 `releaseEvidenceProgress.closeoutInputChecklist.collectionPlan` 中按 release closeout action 顺序输出每组证据的缺失输入、kind 分组、secret 输入、operator checklist、report-only 命令和 execute 命令边界；文本输出同步增加 `collection plan by action`。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，区分全局输入聚合、按 action 收集计划和真实 release evidence 完成状态。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；JSON 抽查 `collectionPlan` 为 immutable-version、production-preflight、backup-restore-rehearsal、target-smoke、rollback-forward-fix、release-signoff、customer-config-effective-session 七组，且 `writesReleaseEvidence=false`；文本抽查包含 action 分组。
- 下一步：继续 P5 时可先按 collection plan 收集真实 release batch 输入；没有正式环境输入时仍只做 report-only / checklist，不写 release evidence。
- 阻塞/风险：本轮不执行 runner、不写 evidence、不部署、不跑目标 smoke、不做备份恢复 / 回滚演练 / sign-off / 真实导入；collection plan 只是输入收集视图，不是目标环境验证证据。

## 2026-06-30 P5 输入清单轻量 JSON 输出

- 完成：为 `multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 补专门 CLI 合同测试，锁住该模式只输出 read-only 状态、目标 evidence 路径、全队列输入清单和 `notProvenByThisAudit`，不输出完整 checks / reference coverage。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，说明 `--input-checklist-json` 只用于 P5 真实 release 输入收集，不写 release evidence、不保存 secret、不证明目标环境动作已完成。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 抽查 `ok=true / readOnly=true / releaseReady=false / collection=7 / reportOnly=true / writesReleaseEvidence=false`。
- 下一步：继续 P5 时可把该轻量 JSON 作为外部输入收集表的来源；只有真实 release batch 输入齐全并声明目标环境 / 风险 / 验证方式后，才评审写入 release evidence 或执行 runner。
- 阻塞/风险：本轮不改 release runner 逻辑，不写 `deployments/**/evidence/**`，不执行 `--execute`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 输入清单 Markdown 表格输出

- 完成：为 `multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 增加只读 Markdown 表格输出，复用现有 P5 `closeoutInputChecklist`，按输入和 closeout action 两个视角列出缺失项、secret 标记、真实来源提示、证据落点、校验规则和 report-only 命令。
- 完成：补 CLI 合同测试并同步 `docs/product/多甲方角色能力流程编排优先级.md`，说明 Markdown 输出只用于人工核对 / 交付沟通，不写 release evidence、不保存真实 secret、不替代目标环境 evidence。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 抽查包含 `SERVER_IMAGE`、`CUSTOMER_CONFIG_ADMIN_TOKEN`、`immutable-version`、`release-signoff`，且不输出 `SOURCE_POSTGRES_DSN=`。
- 下一步：继续 P5 时可把 `--input-checklist-markdown` 作为人工收集真实 release batch 输入的表格入口；写 release evidence 或执行 runner 前仍必须声明目标环境、输入来源、风险和验证方式。
- 阻塞/风险：本轮不改 runner 执行逻辑，不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 adminProfileSync 文档口径再纠偏

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，补清 `ERPLayout` 从未过滤前端菜单定义解析 `currentEntry?.key`、未命中菜单定义时落默认工作台 page key、`adminProfileSync` 不直接路由跳转的边界。
- 完成：补清 `local dev` 由 helper 默认读取前端 `import.meta.env.DEV`，`ERPLayout` 当前不显式传入 `isLocalDev`；本地开发、super admin 和 sync failure 均只是前端诊断例外，正式客户普通账号仍按 RBAC 菜单路径和 active revision pages 交集强收窄。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续修改 `adminProfileSync`、`ERPLayout`、导航 seed 或 `resolveMenuPermissionKey`，需同步更新这两处文档和对应测试口径。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；未运行测试或部署命令，只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 只读 closeout 输入合同复核

- 完成：回到多甲方角色能力流程编排主线，按机器审计确认 P0-P4 当前本地证据为 `ready`，最高优先剩余项是 P5 目标环境 release evidence；当前下一动作仍是 `immutable-version`，但缺真实 release batch 输入。
- 完成：复核 `multi-client-role-workflow-priority-audit` 的完整 JSON、轻量 JSON 和 Markdown 输入清单，确认 `readOnly=true`、`releaseReady=false`、`completionState=target-evidence-required`、`blockingCategory=external-release-evidence-required`、全队列缺失输入 17 项、collection plan 7 组，且 `writesReleaseEvidence=false`。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 抽查 implementationOrder；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 抽查轻量字段；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 抽查 Markdown 表格。
- 下一步：没有正式目标环境和真实 release batch 输入时，P5 只能继续停在 report-only / checklist；若进入真实 release closeout，必须先声明目标环境、输入来源、写 evidence 边界、风险和验证方式。
- 阻塞/风险：本轮不改业务逻辑、不改脚本、不执行 release runner、不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 report-only runner secret 脱敏测试

- 完成：为 `release-evidence-closeout-runner.test.mjs` 补 report-only backup restore 路径的脱敏断言，锁住 sanitized report 只显示 `SOURCE_POSTGRES_DSN=<redacted>` 和 `envKeys`，不写入真实 DSN、用户名或密码。
- 完成：复核 runner 仍是 report-only 默认、`--execute` 仍要求确认短语、blocked action 不执行，且本轮新增测试只使用临时目录 draft evidence，不写项目 `deployments/**/evidence/**`。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实推进仍需要正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；没有这些输入时只继续补 report-only 合同和本地 guard。
- 阻塞/风险：本轮不执行 `--execute`，不写 release evidence，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner report 路径 evidence 目录 guard

- 完成：收紧 `release-evidence-closeout-runner.mjs` 的 `--report` 合同，若报告路径位于当前 release evidence 目录或其子目录则直接拒绝；默认帮助和文档示例统一改为 `output/release-evidence-closeout/<release>/...`，避免 report-only 留痕污染 release evidence gate 真源。
- 完成：补 runner 单测覆盖 evidence 子目录 report path 拒绝，并同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md` 的口径。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/deploy/release-evidence-closeout-runner.mjs --help` 抽查 `--report output/release-evidence-closeout/...` 和 evidence 目录外约束。
- 下一步：P5 真实推进仍需要正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；report-only 报告只作为操作前审计留痕，不进入 release evidence。
- 阻塞/风险：本轮不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 adminProfileSync 诊断例外文档再收窄

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev、super admin、sync failure 的放开明确限定为前端诊断分支，不是正式客户普通账号放宽、后端授权、业务页面准入或隐藏 URL 白名单。
- 完成：补清正式 / 非前端 DEV 构建的 `super admin` 只有在正常 active revision 的系统诊断页，或已挂载 `effective_session_sync_failed` 空投影时才有额外前端诊断可见性；测试覆盖的是 helper reason 与 `ERPLayout` 跳转合同，不代表 release evidence 或 active revision 改变。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync`、`ERPLayout`、导航 seed 或 `resolveMenuPermissionKey`，需同步复核这两份文档和 `adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 runner report 禁止写 deployments evidence 树

- 完成：继续收紧 `release-evidence-closeout-runner.mjs --report` 合同，报告路径除当前 release evidence 目录外，也拒绝任何 `deployments/<customer>/evidence/**` 路径，防止 report-only 报告绕到 sibling evidence 目录污染 release evidence gate 真源。
- 完成：补 runner 单测覆盖当前 release evidence 子目录和 sibling evidence 树 report path 均拒绝，并同步 runner help、`scripts/README.md`、`deployments/yoyoosun/evidence/releases/README.md` 与当前真源 / 优先级文档已有口径。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/deploy/release-evidence-closeout-runner.mjs --help` 抽查 report 路径约束；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 抽查 P0-P4 local ready、P5 target evidence required、下一动作 `immutable-version`；限定 `git diff --check` / untracked `git diff --no-index --check`。
- 下一步：P5 真实推进仍需要正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；没有这些输入时继续停在 report-only / checklist / guard。
- 阻塞/风险：本轮不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 adminProfileSync 文档口径按 review 收窄

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev、super admin、sync failure 明确写成 `adminProfileSync` / `ERPLayout` 前端诊断路径内的有限例外，不是正式客户普通账号、后端授权或 release evidence 放宽。
- 完成：补清 `ERPLayout` 复用正常 cached effective session 时不进入 sync-failed 诊断例外；只有没有 cached effective session 时才挂载新的 `effective_session_sync_failed` 空投影。
- 验证：按用户要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync`、`ERPLayout`、导航 seed 或 `resolveMenuPermissionKey`，需同步复核这两份文档和 `adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；未运行测试、构建、部署或 release 证据命令。

## 2026-06-30 P5 priority audit runner report 路径合同

- 完成：继续推进多甲方角色能力流程编排 P5 本地 guard。新增 `multi-client-role-workflow-priority-audit.test.mjs` 合同断言，覆盖 all-actions、closeout action queue、第一 blocked action 和 input checklist collection plan 的 runner report path，要求 report-only 输出固定落到 `output/release-evidence-closeout/<release>/...`，且不得落入 `deployments/<customer>/evidence/**`。
- 完成：断言带 `--report` 的命令只解析 `--report` 参数路径，不误判合法的 `--evidence-dir deployments/yoyoosun/evidence/releases/...`；同时保留 `writesReleaseEvidence=false` 合同。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`git diff --check -- progress.md`；`git diff --no-index --check -- /dev/null scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 仍需正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；无正式环境时继续停在 report-only / checklist / guard。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 input checklist Markdown 报告路径列

- 完成：为 `multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 的 Collection Plan 增加 `Report Path` 列，把每组 report-only 建议落盘路径直接展示为 `output/release-evidence-closeout/<release>/<action>-runner-report.json`。
- 完成：补测试锁住 Markdown 表格标题、`immutable-version` 和 `release-signoff` 的 `Report Path`，并断言 Markdown 不出现 `--report deployments/<customer>/evidence/...` 或 evidence 树内 runner report 路径。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 抽查 `Report Path` 列。
- 下一步：P5 真实推进仍需要正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；无正式环境时继续停在 report-only / checklist / guard。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 adminProfileSync 隐藏 URL 文档口径纠偏

- 完成：按 review 只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，补清隐藏 URL 未解析出菜单权限 key 时不会仅因空 `currentMenuPath` 触发 RBAC 跳转，但仍继续用 `currentEntry?.key` 走 effective session pages 判定。
- 完成：再次确认正式客户 / 非前端 DEV 构建普通账号仍按 RBAC 菜单路径和 active revision pages 交集强收窄；local dev、super admin、sync failure 仍只是前端诊断例外，不扩大后端授权、业务页面准入或 release evidence。
- 验证：按用户要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync`、`ERPLayout`、导航 seed 或 `resolveMenuPermissionKey`，需同步复核这两份文档和 `adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；未运行测试、构建、部署或 release 证据命令。

## 2026-06-30 P5 input checklist Markdown report file command 测试收口

- 完成：回到多甲方角色能力流程编排主线，复核 `multi-client-role-workflow-priority-audit.mjs --json` 当前 P0-P4 本地 ready、P5 仍为 `target-evidence-required`，下一 release closeout action 仍是缺真实输入的 `immutable-version`。
- 完成：修正 `multi-client-role-workflow-priority-audit.test.mjs` 中 Markdown 输出测试的负断言范围，只检查 Collection Plan 的 `Report File Command` 单元格不包含执行占位值或 `--execute`，不再误伤 Missing Inputs 表中合法的校验格式说明。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 抽查 `Report File Command` 列。
- 下一步：P5 真实推进仍需要正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；当前只能继续保留 report-only / checklist / guard 证据。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 all-actions report-only 留痕

- 完成：按 priority audit 给出的 all-actions report file command 运行 `release-evidence-closeout-runner.mjs` report-only，把当前 closeout plan 脱敏报告写入 ignored `output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json`。
- 完成：报告验证为 `ok=true / executed=false / executeReady=false / actionCount=7 / results=0`，路径不在 `deployments/**/evidence/**` 下，不含 `--execute`、`RELEASE_CLOSEOUT_CONFIRM`、完整 DSN、`SOURCE_POSTGRES_DSN=` 或 admin token 值；报告只保留 env key 名、缺失前置、已解析非敏感输入和 operator checklist。
- 验证：`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`python3 -m json.tool output/release-evidence-closeout/2026-06-29/all-actions-runner-report.json`；Node 脚本复核报告脱敏和 report-only 状态。
- 下一步：P5 真实推进仍需正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；`output/` report 只作为操作前留痕，不进入 release evidence gate 真源。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据；当前 `deployments/yoyoosun/evidence/**` 本身已有非本轮脏现场，本轮只读该目录。

## 2026-06-30 P5 input checklist 输出留痕

- 完成：生成 ignored `output/release-evidence-closeout/2026-06-29/input-checklist.json` 和 `input-checklist.md`，用于后续人工收集真实 release batch 输入；当前清单仍显示 `releaseReady=false / completionState=target-evidence-required / blockingCategory=external-release-evidence-required`。
- 完成：JSON 清单保留 execute 模板和 `<redacted-...>` / `<target-...>` 占位值用于人工复核；Markdown 清单只保留 Missing Inputs 与 Collection Plan，不包含 `--execute` 或确认短语。两份输出都不写 release evidence，不保存真实 DSN、admin token 或 `.env` 内容。
- 验证：`python3 -m json.tool output/release-evidence-closeout/2026-06-29/input-checklist.json`；Node 脚本复核 `readOnly=true / writesReleaseEvidence=false / missingInputs=17 / collectionPlan=7`、无真实 postgres DSN、无未脱敏 `SOURCE_POSTGRES_DSN` 或 `CUSTOMER_CONFIG_ADMIN_TOKEN` 赋值、Markdown 不含 execute 模板；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实推进仍需把清单中的真实 release 环境、镜像 digest、migration 前后版本、backup id、runtime `.env`、source DSN、target endpoint、admin token、rollback 目标和人工签收补齐；补齐前不能写成目标环境 evidence 完成。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 input checklist JSON 脱敏合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs`，为 `--input-checklist-json` 输出补集中断言，锁住 `SOURCE_POSTGRES_DSN` 和 `CUSTOMER_CONFIG_ADMIN_TOKEN` 只能以 `<redacted-source-postgres-dsn>` / `<redacted-admin-token>` 占位进入清单和 execute 模板。
- 完成：补测 `target-smoke` collection plan 的 report-only / `writesReleaseEvidence=false` / report path 在 `output/release-evidence-closeout/<release>/...`，并断言 report file command 不含 redacted secret、`--execute` 或确认短语；JSON 文本不得出现真实 PostgreSQL DSN、非脱敏 admin token 或带 URL userinfo 的 endpoint。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实推进仍需正式目标环境、真实 release batch 输入、target smoke、backup restore、rollback rehearsal 和 sign-off；无这些输入时只能继续完善 report-only / checklist / guard。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 input checklist collection plan 命令合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs`，新增 report file command helper，并在 `--input-checklist-json` 输出中遍历 7 个 collection plan action，统一断言 `reportOnly=true`、`writesReleaseEvidence=false`、runner report path 只能落 `output/release-evidence-closeout/<release>/...`。
- 完成：补测每个 collection plan 的 `runnerReportFileCommand` 必须是 `--only <action> --report <output/...> --json` 的 report-only 命令，不得夹带 `--execute`、`RELEASE_CLOSEOUT_CONFIRM`、待填写 env 占位、redacted secret 或裸 `SOURCE_POSTGRES_DSN` / `CUSTOMER_CONFIG_ADMIN_TOKEN` 赋值；`runnerReportCommand` 也不得含 `--report` / `--execute` 或执行占位。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实推进仍需要正式目标环境和真实 release batch 输入；当前只是锁住 operator handoff 命令不会误导写 evidence 或执行目标动作。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner target-smoke report 脱敏合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补 `target-smoke` report-only 报告脱敏测试；即使测试 env 里传入 admin token 和 PostgreSQL DSN，写出的 runner report 也不得包含真实 token、DSN、密码或带 userinfo 的 URL。
- 完成：测试锁住 report-only 结果 `executed=false / results=[] / executeReady=true`，并确认 display command 只展示脱敏可审计的 `run-smoke.sh --endpoint https://erp.example.invalid` 路径，不保存 command env。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实 target smoke 仍必须在正式目标环境和真实 release batch 输入齐备后另行执行；本轮只证明 report-only 留痕不会泄露 secret 或误写 evidence。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner CLI report-only 脱敏合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补实际 CLI `--report <path> --json` 路径测试，覆盖 operator 从 priority audit 复制 report file command 后的真实行为。
- 完成：测试以 `backup-restore-rehearsal` 为样本，确认 stdout JSON 和写入的 report JSON 都是 `executed=false / results=[]`，并且只出现 `SOURCE_POSTGRES_DSN=<redacted>`，不泄露真实 DSN、用户名或密码。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实备份恢复演练仍必须在正式目标环境、真实 source DSN 和 release batch 输入齐备后另行执行；CLI report-only 只作为操作前脱敏留痕。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行 `--execute`，不写 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner CLI evidence report path 拒绝合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补实际 CLI `--report deployments/<customer>/evidence/... --json` 拒绝测试，防止 operator 把 report-only 留痕写进 release evidence tree。
- 完成：测试在临时目录构造 evidence tree，确认 CLI 以 status 2 返回 JSON 错误、错误信息提示 report 必须放在 evidence 目录外，并且不会创建 report 文件。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实 release evidence 仍只能由对应 closeout action 在真实输入齐备且显式 `--execute` 后按证据组写入；report-only 输出继续固定在 `output/release-evidence-closeout/<release>/...`。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行 `--execute`，不写仓库 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner CLI execute 确认短语合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补实际 CLI `--execute --json` 无正确 `RELEASE_CLOSEOUT_CONFIRM` 时的拒绝测试，覆盖 operator 误执行路径。
- 完成：测试在临时 evidence 目录选择 runnable 的 `immutable-version` action，确认 CLI 以 status 1 返回 JSON 错误、提示必须使用 `RUN_YOYOOSUN_RELEASE_CLOSEOUT`，并且 `image-digests.txt` 保持未变化。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实执行仍必须在目标环境输入齐备、release evidence 分组条件满足、且显式确认后逐项执行；没有确认短语时 CLI 不应写 release evidence。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行成功路径，不写仓库 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner CLI blocked action 拒绝合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补实际 CLI `--execute --report <path> --json` 选择 blocked action 时的拒绝测试，覆盖即使确认短语正确也不能执行 blocked action 的操作风险。
- 完成：测试在临时 evidence 目录选择缺生产 env 文件的 `production-preflight` action，确认 CLI 以 status 1 返回 JSON 错误、提示 `selected closeout actions are not all runnable`，并且不会创建 report 文件。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实 production preflight 仍必须等 runtime `.env` 和目标 release 输入齐备后执行；blocked 状态下 CLI 不应写 evidence 或 report。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行成功路径，不写仓库 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 P5 runner CLI unknown action 拒绝合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补实际 CLI `--only not-a-closeout-action --execute --report <path> --json` 拒绝测试，覆盖 operator 误填 closeout action id 的防误选路径。
- 完成：测试在临时 evidence 目录确认 CLI 以 status 2 返回 JSON 错误、提示 `Unknown or not-needed action id(s)`，并且不会创建 report 文件或进入执行流程。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实执行仍必须从 priority audit / closeout plan 产出的已知 action id 中选择，并在输入齐备后显式确认；未知 action 不应写 evidence 或 report。
- 阻塞/风险：本轮不改 runner 执行逻辑、不执行成功路径，不写仓库 `deployments/**/evidence/**`，不部署、不跑 migration / target smoke / backup restore / rollback rehearsal / sign-off、不导入真实客户数据。

## 2026-06-30 菜单投影文档口径纠偏

- 完成：按 review 结论只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` / `ERPLayout` 当前菜单投影口径收窄为两层判定：第一层 RBAC 菜单路径、第二层 `effective_session.pages` 合同和 helper 明确诊断例外。
- 完成：澄清隐藏 URL 跳转只由 helper 返回布尔判定并交给 `ERPLayout` 使用已过滤 fallback；空 `currentMenuPath` 只是 helper 行为，不是隐藏 URL 白名单；local dev 只放开 pages 层，普通账号仍受已解析菜单路径 RBAC 约束；super admin 在非 DEV 下只保留 active pages、系统诊断页和 sync failure 诊断例外。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如后续 `adminProfileSync` 代码再改，继续同步这两份正式文档口径。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不写 release evidence，不执行导入、部署、migration、target smoke、backup restore 或 rollback rehearsal。

## 2026-06-30 P5 priority audit 默认 release / completion gate 合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs`，补默认 `--json --fail-on-release-not-ready` 和 `--json --fail-on-completion-not-ready` CLI 路径测试，锁住当前默认 release evidence 目录在 P5 缺真实目标证据时必须非 0 退出。
- 完成：测试断言 P5 仍为 `target-evidence-required`、blocking category 仍为 `external-release-evidence-required`，第一条 blocked action 是 `immutable-version`，collection plan 保持 7 项且 `writesReleaseEvidence=false`，避免把 P0-P4 本地 ready 误判成整体完成。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 真实推进仍必须收集正式目标环境、镜像 digest、migration 前后版本、backup id、runtime env、source DSN、target smoke endpoint / token、rollback 场景和人工签收；无这些输入时只能继续强化 report-only / gate / checklist。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑，不写 `deployments/**/evidence/**`，不执行 `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist 人工签收与未证明范围合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs` 的 `--input-checklist-json` 断言，锁住 `release-signoff` collection plan 必须保持 `manual`、`executeCommand=""`、`reportOnly=true`、`writesReleaseEvidence=false`，并明确人工批准不能由 runner 生成。
- 完成：补充断言 input checklist 的 `notProvenByThisAudit` 必须继续列出目标环境发布、target migration、target smoke、backup restore、rollback / forward-fix、目标客户配置激活 / 回滚和真实客户数据导入均未被该审计证明。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P5 仍只能在真实目标环境与 release batch 输入齐备后逐组补 evidence；本地 checklist 只能作为输入收集和操作前审计，不替代 release evidence gate。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 或 audit 输出逻辑，不写 `deployments/**/evidence/**`，不执行 `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 runner 人工签收不可执行合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补 `release-signoff` plan 测试，锁住人工签收 action 必须 `manualOnly=true / canRun=false / executeReady=false`，且不生成 `commands` 或 `executionCommands`。
- 完成：补实际 CLI `--only release-signoff --execute --report <path> --json` 拒绝测试，即使确认短语正确也必须以 `selected closeout actions are not all runnable` 失败，并且不创建 runner report。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`。
- 下一步：P5 人工签收仍必须在人审 production preflight、备份恢复、target smoke、rollback / forward-fix 和已知限制后手工完成，runner 只可生成 report-only 状态。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑，不写 `deployments/**/evidence/**`，不执行成功路径、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 runner 全队列执行原子性合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，补无 `--only` 全队列 `execute=true` 拒绝测试，锁住队列中只要存在 blocked 或 manual action，就必须在执行前整体拒绝，不能先执行可运行的 `immutable-version`。
- 完成：补实际 CLI `--execute --report <path> --json` 全队列拒绝测试，确认即使确认短语正确，也以 `selected closeout actions are not all runnable` 失败，且不创建 runner report。
- 完成：两条测试都断言临时 evidence 目录中的 `image-digests.txt` 和 `release-evidence.md` 保持原样，避免半写 release evidence。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`。
- 下一步：P5 真实执行仍必须逐组补齐目标 release batch 输入和 evidence gate，再按已知 action id 显式执行；全队列 execute 不应成为跳过 blocked / manual action 的快捷方式。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑，不写仓库 `deployments/**/evidence/**`，不执行成功路径、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 runner 客户配置后端 smoke URL 凭据拒绝合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，在临时 evidence 目录补最小 `customer-config-manifest-evidence.json`，让 `customer-config-effective-session` action 进入 closeout 队列后验证 `SMOKE_BACKEND_URL` 不允许携带 username / password。
- 完成：补实际 CLI `--only customer-config-effective-session --json` report-only 路径断言，确认带凭据的后端 URL 只会让 plan `executeReady=false` 并标出 `SMOKE_BACKEND_URL` 缺口，不执行、不写 report、不保存 token 或 DSN。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`。
- 下一步：P5 真实 customer-config effective session smoke 仍必须由目标环境后端 URL、管理员 token、manifest evidence 和 release evidence gate 共同证明；runner 只负责拒绝不安全输入并生成脱敏 report-only 计划。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑，不写仓库 `deployments/**/evidence/**`，不执行 target smoke、部署、migration、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 runner 客户配置 readback token 脱敏合同

- 完成：继续收紧 `release-evidence-closeout-runner.test.mjs`，在临时 evidence 目录补最小 `customer-config-manifest-evidence.json` 后，验证 `customer-config-effective-session` report-only action 可生成包含 `run-smoke.sh --backend-url ... --customer-config-revision ... --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN` 的脱敏命令。
- 完成：测试断言 report 不包含真实 `CUSTOMER_CONFIG_ADMIN_TOKEN` 值，不包含带 userinfo 的 URL，命令只显示 `CUSTOMER_CONFIG_ADMIN_TOKEN=<redacted>`，并保持 `executed=false / results=[] / executeReady=true`。
- 验证：`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`。
- 下一步：P5 真实 customer-config effective session smoke 仍必须在目标环境后端 URL、管理员 token、manifest evidence 和 release evidence gate 齐备后执行；runner report-only 只证明命令可脱敏留痕。
- 阻塞/风险：本轮不改业务逻辑、不改 runner 执行逻辑，不写仓库 `deployments/**/evidence/**`，不执行 target smoke、部署、migration、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 immutable-version input template 边界合同

- 完成：继续收紧 `immutable-version-evidence.test.mjs`，锁住 `buildImmutableVersionInputTemplate` 只列不可变版本证据所需的 release batch 输入：release version、environment、operator role、git commit、server / web image 与 digest、migration before / after 和 backup id。
- 完成：补 CLI `--print-input-template` 断言，确认模板不会输出 `RELEASE_CLOSEOUT_CONFIRM`、`SOURCE_POSTGRES_DSN`、`SMOKE_ENDPOINT / SMOKE_BACKEND_URL` 或 `CUSTOMER_CONFIG_ADMIN_TOKEN`，并且不会在临时 evidence 目录创建 `release-evidence.md` 或 `image-digests.txt`。
- 验证：`node --check scripts/deploy/immutable-version-evidence.test.mjs`；`node --check scripts/deploy/immutable-version-evidence.mjs`；`node --test scripts/deploy/immutable-version-evidence.test.mjs`。
- 下一步：P5 第一条 blocked action 仍需要真实 release batch 输入后才能显式执行 immutable-version closeout；input template 只帮助 operator 收集字段，不替代 release evidence gate。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 immutable-version 失败不半写合同

- 完成：继续收紧 `immutable-version-evidence.test.mjs`，补实际 CLI 无效输入路径测试，确认 `--migration-after latest` 这类非法 Atlas 版本会以 status 2 拒绝。
- 完成：测试在临时 evidence 目录先生成草稿并记录 `release-evidence.md` 与 `image-digests.txt` 内容，失败后断言两个文件完全保持原样，避免 immutable-version action 因输入错误半写 release evidence。
- 验证：`node --check scripts/deploy/immutable-version-evidence.test.mjs`；`node --check scripts/deploy/immutable-version-evidence.mjs`；`node --test scripts/deploy/immutable-version-evidence.test.mjs`。
- 下一步：P5 真实 immutable-version 写入仍必须使用同一 release batch 的真实镜像 digest、migration 前后版本和 backup id，并在写入后重新跑 release evidence status / gate。
- 阻塞/风险：本轮不改业务逻辑、不改写入脚本逻辑，不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 image-digests 镜像引用脱敏边界合同

- 完成：继续收紧 `image-digests-evidence.test.mjs`，补 `buildImageDigestsEvidence` 对带 URL username / password 的 `serverImage` 和包含空白 / 换行的 `webImage` 的拒绝断言。
- 完成：补实际 CLI 失败路径测试，确认带凭据的 image ref 会以 status 2 拒绝，并且不会在临时 release evidence 目录创建 `image-digests.txt`。
- 验证：`node --check scripts/deploy/image-digests-evidence.test.mjs`；`node --check scripts/deploy/image-digests-evidence.mjs`；`node --test scripts/deploy/image-digests-evidence.test.mjs`。
- 下一步：P5 immutable-version 真实执行仍必须使用 registry / build 输出的无凭据 image ref 和 sha256 digest，并在写入后重新跑 release evidence status / gate。
- 阻塞/风险：本轮不改业务逻辑、不改写入脚本逻辑，不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 image-digests mismatch 不覆盖合同

- 完成：继续收紧 `image-digests-evidence.test.mjs`，补 `release-evidence.md` 中已填写的 `serverImageDigest` 与本次输入不一致时的拒绝测试，并额外构造已有 `image-digests.txt` 的临时 evidence 目录。
- 完成：测试断言 digest mismatch 会拒绝写入，且已有 `image-digests.txt` 内容完全保持原样，避免 P5 immutable-version 子证据在交叉校验失败时覆盖旧证据。
- 验证：`node --check scripts/deploy/image-digests-evidence.test.mjs`；`node --check scripts/deploy/image-digests-evidence.mjs`；`node --test scripts/deploy/image-digests-evidence.test.mjs`。
- 下一步：P5 真实 image-digests 写入仍必须与同一 release batch 的 `release-evidence.md` 字段一致，写入后重新跑 release evidence status / gate。
- 阻塞/风险：本轮不改业务逻辑、不改写入脚本逻辑，不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 image-digests CLI mismatch 不覆盖合同

- 完成：继续收紧 `image-digests-evidence.test.mjs`，把 digest mismatch 不覆盖合同扩展到实际 CLI 路径，确认命令行执行时也会拒绝与 `release-evidence.md` 不一致的 `serverImageDigest`。
- 完成：测试在临时 release evidence 目录中预置已有 `image-digests.txt`，CLI mismatch 以 status 1 退出后断言该 artifact 内容完全保持原样。
- 验证：`node --check scripts/deploy/image-digests-evidence.test.mjs`；`node --check scripts/deploy/image-digests-evidence.mjs`；`node --test scripts/deploy/image-digests-evidence.test.mjs`。
- 下一步：P5 真实 image-digests CLI 写入仍必须与同一 release batch 的 `release-evidence.md` 字段一致，写入后重新跑 release evidence status / gate。
- 阻塞/风险：本轮不改业务逻辑、不改写入脚本逻辑，不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 immutable-version malformed evidence 不半写合同

- 完成：继续收紧 `immutable-version-evidence.test.mjs`，补实际 CLI 遇到 malformed `release-evidence.md` 的拒绝测试：临时 evidence 模板缺少 `serverImageDigest` 字段时，命令以 status 1 失败并提示缺字段。
- 完成：测试在临时 evidence 目录记录 malformed `release-evidence.md` 与已有 `image-digests.txt`，失败后断言两者完全保持原样，避免 immutable-version action 因模板缺字段半写 release evidence。
- 验证：`node --check scripts/deploy/immutable-version-evidence.test.mjs`；`node --check scripts/deploy/immutable-version-evidence.mjs`；`node --test scripts/deploy/immutable-version-evidence.test.mjs`。
- 下一步：P5 真实 immutable-version 执行仍必须基于完整 release evidence 模板和同一 release batch 输入，写入后重新跑 release evidence status / gate。
- 阻塞/风险：本轮不改业务逻辑、不改写入脚本逻辑，不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 release gate image-digests 凭据拦截合同

- 完成：继续收紧 `release-evidence-gate.mjs` / `release-evidence-gate.test.mjs`，补 release gate 对 `image-digests.txt` 中带 URL username / password 的 image ref 拒绝测试。
- 完成：修正共享 `hasCredentialedUrl` 检测，使其能在 key-value 文件整段内容中发现 `https://user:pass@...`，而不是只在整段文本以 URL 开头时才命中；`image-digests.txt` 继续复用现有 `validateNoSecrets`。
- 验证：`node --check scripts/deploy/release-evidence-gate.mjs`；`node --check scripts/deploy/release-evidence-gate.test.mjs`；`node --test scripts/deploy/release-evidence-gate.test.mjs`。
- 下一步：P5 真实 release evidence gate 仍必须在目标 release batch 证据齐备后运行；本轮只证明 gate 会拒绝带凭据的 image ref。
- 阻塞/风险：本轮不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 菜单投影文档口径二次收窄

- 完成：按 review 只改 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，进一步明确空 `currentMenuPath`、hidden URL 和 sync-failed 诊断例外都不是新增授权来源。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如 `adminProfileSync` 或 `ERPLayout` 的菜单过滤 / fallback 逻辑变化，继续同步这两份文档。
- 阻塞/风险：不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence。

## 2026-06-30 P5 release status image-digests 凭据错误暴露合同

- 完成：继续推进 P5 本地 gate/status 闭环，只补 `release-evidence-status.test.mjs`，构造本来可通过 gate 的临时 evidence，再把 `image-digests.txt` 改成带 URL username / password 的 image ref，确认 status 会把 `immutable-version` 标为 `present-unverified` 并在 `closeoutGateSummary` 暴露 `image-digests.txt contains a credentialed URL`。
- 验证：`node --test scripts/deploy/release-evidence-status.test.mjs`；`node --check scripts/deploy/release-evidence-status.mjs`；`node --check scripts/deploy/release-evidence-status.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期以 status 1 保持 `releaseReady=false`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-completion-not-ready` 按预期以 status 1 保持 `completionAudit.state=target-evidence-required`。
- 下一步：P5 第一条真实 closeout 仍是 `immutable-version`，需要真实 release environment、operator role、server/web image ref + digest、migration before/after 和 backup id；没有这些输入时只能继续强化只读 status / report-only / gate 合同。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 release status CLI image-digests 凭据错误可见合同

- 完成：继续推进 P5 status 人机可见性，只补 `release-evidence-status.test.mjs`，把 `image-digests.txt` 带 URL username / password 的场景扩展到 CLI `--fail-on-not-ready` 路径，确认命令以 status 1 退出，并在 stdout 的 gate errors / closeout gate summary 中显示 `image-digests.txt contains a credentialed URL`。
- 验证：`node --test scripts/deploy/release-evidence-status.test.mjs`；`node --check scripts/deploy/release-evidence-status.mjs`；`node --check scripts/deploy/release-evidence-status.test.mjs`；`git diff --check -- scripts/deploy/release-evidence-status.test.mjs progress.md`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 保持 `releaseReady=false / completionState=target-evidence-required / firstBlocked=immutable-version`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：P5 仍要等真实 release batch 输入后才能执行 `immutable-version`；没有正式生产环境时继续只做 read-only status、report-only runner 和 gate 合同强化。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 菜单投影文档口径按 review 再纠偏

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，使正式客户普通账号强收窄、隐藏 / 未登记 URL 跳转判定、local dev / super admin / sync failure 诊断例外与当前 `adminProfileSync` 和 `ERPLayout` 代码一致。
- 完成：明确未解析出菜单权限 key 或未命中菜单定义的 URL 不会因此成为菜单入口、授权入口或业务页面准入；super admin 的 sync failure 例外只来自 `source=effective_session_sync_failed` 空投影的排障路径，不是正式 active revision 隐藏页授权。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续修改 `adminProfileSync`、`ERPLayout`、`seedData` 或 `menuPermissions` 的投影 / fallback 逻辑，继续同步这两份文档和对应测试口径。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence。

## 2026-06-30 P5 release status JSON 强门禁机器输出合同

- 完成：继续推进 P5 本地只读 status / gate 合同，只补 `release-evidence-status.test.mjs`，新增 `--json --fail-on-not-ready` 组合路径测试。
- 完成：测试构造本来可通过 gate 的临时 evidence，再把 `image-digests.txt` 改成带 URL username / password 的 image ref，确认 CLI 以 status 1 退出、stdout 仍是可解析 JSON、不退回文本格式，并且 JSON 不泄露 `deploy:secret` 或 userinfo。
- 验证：`node --test scripts/deploy/release-evidence-status.test.mjs`；`node --check scripts/deploy/release-evidence-status.mjs`；`node --check scripts/deploy/release-evidence-status.test.mjs`。
- 下一步：P5 仍要等真实 release batch 输入后才能执行 `immutable-version`；没有正式生产环境时继续只做 read-only status、report-only runner 和 gate 合同强化。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 closeout runner CLI 执行报告脱敏合同

- 完成：继续推进 P5 release closeout runner 合同，只补 `release-evidence-closeout-runner.test.mjs`，新增 CLI `--execute --report --json` 成功执行单个 runnable `immutable-version` action 的测试。
- 完成：测试只在临时 evidence 目录执行，确认 stdout 和落盘 report 都是结构化 JSON，执行结果只保留 `stdoutLineCount / stderrLineCount`，不保存原始 stdout / stderr，也不写 `RELEASE_CLOSEOUT_CONFIRM` 环境变量；公开 scope 仍保留确认短语说明。
- 验证：`node --test scripts/deploy/release-evidence-closeout-runner.test.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.mjs`；`node --check scripts/deploy/release-evidence-closeout-runner.test.mjs`。
- 下一步：P5 真实 closeout 仍必须等同一 release batch 的镜像 digest、migration、backup、target endpoint、admin token、rollback target 和人工签收输入齐备后再执行；当前继续只做本地 gate / runner 合同。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行真实 closeout、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist Markdown 敏感输入展示合同

- 完成：继续推进 P5 release closeout 输入清单合同，只补 `multi-client-role-workflow-priority-audit.test.mjs`，让 Markdown 输出测试显式锁住 `prod-env-file` 为 secret file、`SOURCE_POSTGRES_DSN` 为 secret env、`CUSTOMER_CONFIG_ADMIN_TOKEN` 为 secret env。
- 完成：补 Markdown 无泄漏断言，确认输出不包含 `SOURCE_POSTGRES_DSN=`、`CUSTOMER_CONFIG_ADMIN_TOKEN=`、Postgres DSN 或带 username / password 的 URL；report-only 命令仍不带 `--execute`、确认短语或 release evidence 目录 report 路径。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：P5 真实 closeout 仍从 `immutable-version` 开始，需要真实 target environment、operator role、server / web image ref 与 sha256 digest、migration before / after 和 backup id；其余 preflight、backup restore、target smoke、rollback / forward-fix、sign-off 与 customer config effective session 仍按 input checklist 收集。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist Markdown collection plan 顺序合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs` 的 Markdown 输出合同，解析 Collection Plan 表格并锁住 7 个 release closeout action 顺序：immutable-version、production-preflight、backup-restore-rehearsal、target-smoke、rollback-forward-fix、release-signoff、customer-config-effective-session。
- 完成：补每组 collection plan 的 Secret Inputs 列断言，确认 production preflight 标出 `prod-env-file`、backup restore 标出 `SOURCE_POSTGRES_DSN`、target smoke 和 customer config effective session 标出 `CUSTOMER_CONFIG_ADMIN_TOKEN`，release signoff 保持 `none`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist Markdown 自定义路径只读合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs` 的 Markdown checklist 输出，补 `--release-evidence-dir` 与 `--runtime-env-file` 自定义路径场景。
- 完成：确认 Markdown 摘要和 collection plan 使用自定义 evidence / runtime env 路径，但生成的 report 仍落在 `output/release-evidence-closeout/<date>/`，不回写 release evidence 目录，也不出现 `--execute` 或 `RELEASE_CLOSEOUT_CONFIRM`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.test.mjs progress.md`。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist JSON 自定义路径只读合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs`，补 `--input-checklist-json` 搭配自定义 `--release-evidence-dir` / `--runtime-env-file` 的只读输出合同。
- 完成：确认 JSON 输出使用自定义 evidence / runtime env 路径，基础 closeout collection plan 的 report 仍落在 `output/release-evidence-closeout/<date>/`，不回写自定义 release evidence 目录；report-only command 不带 `--execute`、确认短语或真实 secret。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 写入临时文件并可解析；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.test.mjs progress.md`。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。
