# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。
- `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`：归档 2026-06-29 target evidence binding 之后到 release evidence runner 脱敏报告与 URL 前置拦截的过程记录。
- `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`：归档 2026-06-29 adminProfileSync 菜单投影文档纠偏、P2 explain / entitlement / break-glass 中段过程记录。
- `docs/archive/progress-2026-06-29-before-linked-task-idempotency.md`：归档 2026-06-29 P3 ProcessRuntime expected_version 守卫之前至 linked task 幂等闭环前的过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前 P3 最小运行时已覆盖 ProcessInstance / ProcessNodeInstance 持久化、WorkflowTask 流程节点锚点、显式创建 linked 人工任务、显式完成 linked 节点、`complete_task_action` 受控触发当前节点完成、顺序激活紧邻 waiting 节点，以及 linked 任务创建的 active / expected_version / task_code 幂等守卫。
- 当前仍不自动扫描流程定义，不自动创建下一 linked WorkflowTask，不执行节点 handler，不做 fan-out / join / returnTo / wait_event，不执行 `domain_command`，不写库存 / 出货 / 质检 / 财务 Fact。
- 真实客户数据导入、任意文件 upload、生产发布 preflight、真实备份恢复、目标环境 smoke、目标 migration、回滚 / 前向修复演练和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-30 adminProfileSync 菜单投影文档口径纠偏

- 完成：只按当前 `adminProfileSync` / `ERPLayout` 代码和测试修正 `docs/当前真源与交接顺序.md` 与 `web/README.md` 的菜单投影说明，明确正式普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄，隐藏 URL 只返回跳转判定，实际 fallback replace 和无入口时阻止业务 Outlet 渲染由 `ERPLayout` 负责。
- 完成：补清 local dev / super admin / sync failure 诊断例外：local dev 只放开 pages 层，普通账号仍需 RBAC；正式 super admin 正常 active revision 下仍受 pages 收窄，仅保留系统诊断页，只有 `effective_session_sync_failed` 空投影才进入全后台前端诊断路径；cached effective session 与普通 cached profile 分开说明。
- 下一步：后续若 `adminProfileSync`、`ERPLayout` 或 `adminProfileSync.test.mjs` 的投影规则改变，同步更新这两处文档口径。
- 阻塞/风险：本轮不改业务逻辑、测试、schema、migration、RBAC、客户配置、部署脚本或 release evidence；只做文档同步。

## 2026-06-29 progress 超阈值归档

- 完成：归档前 `progress.md` 为 445 行 / 82773 bytes，已达到 80KB 阈值；已将完整原文移动到 `docs/archive/progress-2026-06-29-before-linked-task-idempotency.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和本轮记录，保留 P3 runtime 与目标 release evidence 的边界。
- 下一步：继续 P3 时应按可验证闭环单独拆 owner role 解析 / 自动创建下一 linked WorkflowTask、fan-out / join / returnTo / wait_event 或 domain_command；任何 release evidence、真实导入、部署、schema 大迁移或客户数据写入都必须另声明边界。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态或正式业务真源。

## 2026-06-29 P3 ProcessRuntime linked 任务创建 task_code 幂等守卫

- 完成：`ProcessRuntimeUsecase.CreateLinkedWorkflowTask` 在 `WorkflowTask.task_code` 唯一索引冲突时，会按 `task_code` 回读已有任务；若已有任务指向同一 `process_instance_id / process_node_instance_id`，视为同一节点重试并返回已有 linked WorkflowTask，不创建重复任务。
- 完成：如果相同 `task_code` 已属于其他流程节点，仍返回 `ErrWorkflowTaskExists`，避免把 task_code 碰撞误当幂等。同步 `WorkflowRepo.GetWorkflowTaskByTaskCode`、usecase 测试、priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|Workflow'`、`cd server && go test ./internal/data -run 'Workflow'`、`cd server && go test ./internal/service -run 'Workflow'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 当前 22/22 checks 通过，`releaseReady=false`，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：继续 P3 时先评审 owner role 解析规则，再决定是否让已激活的下一 `human_task / approval` 节点自动创建 linked WorkflowTask；不能为了自动任务生成硬编码岗位或绕过 active customer config 的责任池 / capability / customer scope 规则。
- 阻塞/风险：本轮不改 schema / migration，不改 JSON-RPC 对外合同，不自动创建下一 linked WorkflowTask，不执行节点 handler，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入。

## 2026-06-29 P3 ProcessRuntime linked 任务 owner role 唯一候选解析

- 完成：`CreateLinkedWorkflowTask` 在未显式传入 `owner_role_key` 时，会通过 `ProcessRuntimeOwnerRoleResolver` 调用 active customer config 的责任池候选解释，按 `owner_pool_key + required_capability_key + customer scope` 解析 owner role；只有唯一候选且 active config revision 与流程实例 `config_revision` 一致时才创建任务。
- 完成：候选为空、未接 resolver、多个候选或 revision 不一致时分别拒绝，不静默选默认岗位；显式传入 `owner_role_key` 的既有路径保持兼容。运行时 DI 已在 `wire_gen.go` 中把 `customerConfigUsecase` 传给 `ProcessRuntimeUsecase`。
- 完成：同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`；本轮追加前已确认 `progress.md` 为 34 行 / 5339 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`cd server && go test ./internal/service -run 'Workflow'`、`cd server && go test ./cmd/server`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 当前 22/22 checks 通过，`releaseReady=false`，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审“完成当前节点后，若紧邻下一节点已 active 且是 human_task / approval，是否由 ProcessRuntime 自动调用 linked task 创建”；自动创建前仍需明确任务命名、owner role 解析失败反馈、重复调用和部分失败边界。
- 阻塞/风险：本轮不改 schema / migration，不新增 JSON-RPC 对外合同，不自动创建下一 linked WorkflowTask，不执行节点 handler，不做 fan-out / join / returnTo / wait_event，不执行 `domain_command`，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入。

## 2026-06-29 菜单投影诊断例外文档口径修正

- 完成：按只读 review 发现，只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 口径，把 `effective_session_sync_failed` 与 active revision 正常返回空 pages 拆开说明；正式普通账号仍按 RBAC 菜单与 active pages 交集强收窄，sync failure 无缓存时不退回 RBAC-only。
- 完成：补清 local dev / super admin 诊断例外边界：local dev 只绕过 effective session pages 收窄且仍受 RBAC 菜单路径约束；super admin 只绕过 RBAC 菜单层，正常 active revision 下仍受 pages 收窄并仅额外保留系统诊断页，只有 sync failure 空投影才保留全后台前端诊断路径。
- 下一步：如继续做运行时或菜单投影改动，应先补对应代码测试或 style:l1 场景；本轮只修正式文档描述。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍存在其他并行改动，本轮未回退、未整理。

## 2026-06-29 ProcessRuntime 顺序下一人工任务闭环

- 完成：回到多甲方角色能力模块组合流程编排主线，按 20260627 部署导入版 reference、优先级文档和当前真源收敛目标顺序；本阶段只推进 P3 窄版流程运行时，不跨到 release evidence、真实导入、部署、schema 大迁移或客户数据写入。
- 完成：`CompleteLinkedWorkflowTask` 完成当前 linked 人工 / 审批节点后，仍只按同一流程实例内创建顺序激活紧邻的 `waiting` 节点；若该刚激活节点是 `human_task` 或 `approval`，复用 `CreateLinkedWorkflowTask` 创建下一 linked WorkflowTask，沿用 `expected_version`、task_code 幂等和 active customer config 唯一候选 owner role 解析。
- 完成：补充 usecase 测试覆盖下一审批节点自动创建 linked task、非人工 `domain_command` 节点只激活不建 WorkflowTask、非 waiting 相邻节点不跳过；同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`cd server && go test ./internal/service -run 'Workflow'`、`cd server && go test ./cmd/server`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 当前本地证据 `ok=true`，但 `releaseReady=false`，目标环境 evidence 仍保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审 `domain_command` 的只读 preflight 之后是否进入某一个领域 usecase 绑定；必须先选单一业务域和命令，不得把库存、质检、出货、财务混成一轮。
- 阻塞/风险：本轮不扫描流程定义、不跳过节点、不处理 fan-out / join / returnTo / wait_event，不为 `domain_command / wait_event / end` 创建 WorkflowTask，不执行节点 handler，不写 Workflow 外的库存 / 出货 / 质检 / 财务 Fact；若创建下一 linked task 在激活后失败，当前 usecase 会返回错误但不在本轮引入跨 repo 事务，后续若要生产化应单独评审事务边界或补偿策略。

## 2026-06-29 adminProfileSync 菜单投影口径二次修正

- 完成：按 review 结论只修正式文档，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 描述，把前端投影判断、`ERPLayout` 缓存复用和隐藏 URL fallback 跳转职责拆开。
- 完成：补清正式普通账号、local dev、super admin 和 sync failure 的边界：`pages` 数组存在时正式普通账号仍强收窄；local dev 只绕过 pages 层且普通账号仍受 RBAC 路径限制；super admin 只绕过 RBAC 层，正常 active revision 下仅额外保留系统诊断页，sync failure 空投影才保留全后台前端诊断路径。
- 下一步：若继续改菜单投影 runtime，应补对应代码测试或 style:l1 场景；本轮只同步文档口径。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍有并行改动，本轮只约束目标文档和 `progress.md`。

## 2026-06-29 ProcessRuntime domain_command 显式 handler guard

- 完成：继续多甲方角色能力模块组合流程编排主线，本阶段只推进 P3 窄版流程运行时：新增 `ExecuteDomainCommandNode`、`ProcessDomainCommandHandler` 和 handler 注册入口，`domain_command` 节点必须 active、`expected_version` 匹配、`policy_snapshot.command_key` 已声明、调用方提供非空 `idempotency_key` 且 handler 已注册后才执行。
- 完成：handler 成功后才完成当前 `domain_command` 节点、记录 outcome，并复用现有顺序推进逻辑激活紧邻下一 `waiting` 节点；若刚激活的是 `human_task / approval`，才继续创建 linked WorkflowTask。未注册 handler、command key 不匹配或缺幂等键都会拒绝，且不完成节点。
- 完成：同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径；本轮追加前已确认 `progress.md` 为 66 行 / 12059 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`cd server && go test ./internal/service -run 'Workflow'`、`cd server && go test ./cmd/server`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 当前本地证据 `ok=true`，新增 `process-runtime-domain-command-handler` 为 local ready；`releaseReady=false`，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审 `wait_event`、`end`、fan-out / join / returnTo 或选定单一领域命令绑定；若进入真实领域 usecase，必须先明确 source-of-truth 字段、状态机、幂等、RBAC、审计、重复提交和取消 / 冲正测试。
- 阻塞/风险：本轮不改 schema / migration，不新增 JSON-RPC 对外合同，不让 `complete_task_action` 自动调用 domain handler，不绑定库存 / 出货 / 质检 / 财务 usecase，不写任何 Workflow 外 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；ProcessRuntime handler 成功后完成节点与推进下一节点仍不是跨 repo 事务。

## 2026-06-29 adminProfileSync 正式客户菜单投影文档口径纠偏

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 描述，明确正式客户 / 生产运行态普通账号仍按 RBAC 菜单与 active revision pages 交集强收窄，不因 sync failure、local dev 或 super admin 诊断例外放宽。
- 完成：把隐藏 URL 跳转口径收敛到当前代码：`adminProfileSync` 只返回是否需要跳转，`ERPLayout` 只有存在 `visibleSections[0].items[0].path` 时才 `replace` 到第一个可见入口；没有 fallback 时不跳转，由空菜单态阻止业务 `Outlet`。
- 下一步：若后续改变菜单投影 runtime，需要同步补 `adminProfileSync` 单测或 `style:l1` 场景；本轮只改正式文档描述。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍有其他并行改动，本轮只约束目标文档和 `progress.md`。

## 2026-06-29 adminProfileSync 诊断例外文档再纠偏

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 super admin 菜单投影描述改为“第一层 RBAC 菜单路径绕过，第二层 active revision pages 仍收窄”，避免被误读成正式环境可访问所有客户配置隐藏页。
- 完成：补清 sync failure 诊断例外必须是无 cached effective session、已挂载 `effective_session_sync_failed` 空投影时才成立；local dev 仍只绕过 pages 层，普通账号仍要先命中 RBAC 路径。
- 下一步：若后续改变 `adminProfileSync` / `ERPLayout` runtime，需同步补单测或 style:l1 场景；本轮只修正式文档口径。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍有其他并行改动，本轮只约束目标文档和 `progress.md`。

## 2026-06-29 ProcessRuntime end 节点与流程实例完成

- 完成：继续多甲方角色能力模块组合流程编排主线，本阶段只补 P3 窄版 ProcessRuntime end 闭环证据链；当前实现会在完成当前 linked 人工 / 审批节点或显式 `domain_command` 节点后，若紧邻下一 `waiting` 节点是 `end`，先激活 end 节点，再用激活后的版本完成 end 节点，并把对应 ProcessInstance 标记为 `completed`。
- 完成：同步 `multi-client-role-workflow-priority-audit` CLI JSON 测试断言、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`；补齐 service 层 ProcessRuntime 测试 stub 的 `CompleteProcessInstance` 接口实现，避免接口扩展后 Workflow JSON-RPC 测试编译失败。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`cd server && go test ./internal/data -run 'ProcessRuntime'`、`cd server && go test ./internal/service -run 'Workflow'`、`cd server && go test ./cmd/server`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 本地 `ok=true`，`process-runtime-end-node-completion` 已进入 local ready；`releaseReady=false`，整体仍保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审 `wait_event` 唤醒或 fan-out / join / returnTo；若要绑定真实 `domain_command` 到领域 usecase，必须先选单一业务域并补 source-of-truth、状态机、幂等、RBAC、审计、重复提交和取消 / 冲正测试。
- 阻塞/风险：本轮不扫描流程定义、不跳过节点、不处理 fan-out / join / returnTo / wait_event，不为 `domain_command / wait_event / end` 创建 WorkflowTask，不让 `complete_task_action` 自动调用 domain handler，不绑定库存 / 出货 / 质检 / 财务 usecase，不写任何 Workflow 外 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；完成 end 节点和完成 ProcessInstance 仍不是跨 repo 事务，生产化补偿策略后续另评审。

## 2026-06-29 ProcessRuntime wait_event 显式唤醒

- 完成：继续多甲方角色能力模块组合流程编排主线，本阶段只补 P3 窄版 ProcessRuntime `wait_event` 唤醒闭环；新增 `WakeProcessWaitEventNode`，只允许 active 且 `expected_version` 匹配的 `wait_event` 节点在 `policy_snapshot.event_key` 与调用方事件 key 匹配、且调用方提供幂等键后完成。
- 完成：唤醒成功后会把当前 wait_event 节点标记为 `completed`，记录 outcome，并复用现有顺序推进逻辑激活紧邻下一 `waiting` 节点；若下一节点是 `end`，继续完成 end 节点和 ProcessInstance；若下一节点是 `human_task / approval`，仍复用 linked task 创建边界。
- 完成：同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`；本轮追加前已确认 `progress.md` 为 97 行 / 18718 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 本地 `ok=true`，`process-runtime-wait-event-wakeup` 已进入 local ready；`releaseReady=false`，整体仍保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审 fan-out / join / returnTo，或选择单一 `domain_command` 绑定到具体领域 usecase；若进入真实领域 usecase，必须先明确 source-of-truth、状态机、幂等、RBAC、审计、重复提交和取消 / 冲正测试。
- 阻塞/风险：本轮不改 schema / migration，不新增 JSON-RPC 对外合同，不提供事件订阅器，不扫描或跳过流程定义，不让 `complete_task_action` 自动唤醒事件，不为 `wait_event` 创建 WorkflowTask，不写库存 / 出货 / 质检 / 财务 Fact，不触碰 release evidence、部署、真实导入或客户数据写入。

## 2026-06-29 adminProfileSync 诊断例外文档口径归位

- 完成：按 review 发现继续只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 effective session 同步失败后的空投影挂载归位到 `ERPLayout` 调用 `adminProfileSync` helper，而不是写成 `adminProfileSync` 自行拉取或缓存。
- 完成：明确 `adminProfileSync` 当前代码的两层投影：普通账号先过 `allowedMenuPaths`，`local dev` 只绕过 `effective_session.pages`；`super admin` 只绕过第一层 RBAC 菜单路径，正式 active revision 下仍受 pages 收窄，只对系统诊断页和 `effective_session_sync_failed` 空投影有诊断例外。
- 下一步：若后续 runtime 改变缓存复用、跳转 fallback 或诊断例外，需要同步补 `adminProfileSync` 单测 / style:l1 场景后再改文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍有其他并行改动，本轮只约束目标文档和 `progress.md`。

## 2026-06-29 ProcessRuntime 命名 policy 分支

- 完成：继续多甲方角色能力模块组合流程编排主线，本阶段只补 P3 窄版 ProcessRuntime 命名 policy 分支；新增 `ProcessBranchPolicyHandler` 和 `RegisterBranchPolicyHandler`，节点完成后若当前节点 `policy_snapshot.branch_policy_key` 声明已注册 policy，则由 handler 返回下一节点 key，运行时只激活同一 ProcessInstance 内该 waiting 目标节点。
- 完成：命名 policy 分支激活后继续复用现有节点类型处理边界；目标是 `human_task / approval` 时才创建 linked WorkflowTask，目标是 `end` 时才完成流程实例；未注册 policy、空目标、目标不存在、目标重复或目标非 waiting 都拒绝推进。
- 完成：同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`；本轮追加前已确认 `progress.md` 为 113 行 / 21943 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz -run 'ProcessRuntime|WorkflowCandidateOwnerRoleKeys'`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 本地 `ok=true`，`process-runtime-named-policy-branch` 已进入 local ready；`releaseReady=false`，整体仍保持 `external-release-evidence-required`。
- 下一步：继续 P3 时可评审 fan-out / join / returnTo 或 blocked / due_at；若要绑定真实 `domain_command` 到领域 usecase，必须先选单一业务域并补 source-of-truth、状态机、幂等、RBAC、审计、重复提交和取消 / 冲正测试。
- 阻塞/风险：本轮不改 schema / migration，不新增 JSON-RPC 对外合同，不解析自由表达式、客户 JS / SQL 或任意脚本，不自动跳过或 settle 非选中分支，不处理 fan-out / join / returnTo，不绑定库存 / 出货 / 质检 / 财务 usecase，不写任何 Workflow 外 Fact，不触碰 release evidence、部署、真实导入或客户数据写入；ProcessRuntime 节点完成与后续推进仍不是跨 repo 事务。

## 2026-06-30 adminProfileSync 菜单投影文档口径再收窄

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 描述，使其与当前代码一致：前端投影先看 RBAC 菜单路径，再看 `effective_session.pages`；正式客户 / 生产运行态普通账号在 `pages` 为数组时仍强收窄，不退回 RBAC-only。
- 完成：补清诊断例外：`local dev` 只绕过 pages 层且普通账号仍需命中 RBAC 路径；`super admin` 只绕过 RBAC 路径层，正常 active revision 下仍受 pages 收窄，仅额外保留系统诊断页；只有 `effective_session_sync_failed` 空投影才保留全后台前端诊断路径。隐藏 URL 只由 `ERPLayout` 在存在可见 fallback 时跳转，否则显示空入口并阻止业务 `Outlet`。
- 下一步：若后续改变 `adminProfileSync`、`ERPLayout` 缓存复用或跳转 fallback runtime，需同步补对应单测或浏览器级场景后再改文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只约束目标文档和 `progress.md`。

## 2026-06-30 adminProfileSync 本地开发诊断例外文档归位

- 完成：按 review 发现继续只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `local dev`、`super admin` 和 `sync failure` 诊断例外改到与当前 `adminProfileSync` 判断顺序一致。
- 完成：明确正式 / 非本地运行态仍强收窄：普通账号必须同时命中 RBAC 菜单路径和 active revision pages；super admin 只绕过第一层 RBAC 菜单路径，正常 active revision 下仍受 pages 收窄，仅额外保留系统诊断页。明确本地开发态会绕过第二层 pages；普通账号仍需 RBAC 路径命中，super admin 因 RBAC 绕过叠加 local dev pages 诊断例外，可查看全后台前端路径用于排障。
- 下一步：若后续改变 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` fallback 行为，需先补对应单测 / 浏览器场景，再同步文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 129 行 / 25491 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 投影函数职责文档补清

- 完成：继续按 review 发现只修正文档口径，在 `docs/当前真源与交接顺序.md` 和 `web/README.md` 明确 `resolveEffectiveSessionPageAccess` 只判断第二层 `effective_session.pages`，RBAC 菜单路径交集由 `filterNavigationSectionsByAdminProfile` / `shouldRedirectFromCurrentNavigation` 组合 `allowedMenuPaths` 完成。
- 下一步：若后续调整 `adminProfileSync` 函数职责或 `ERPLayout` fallback 跳转，需要同步单测和文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 136 行 / 26761 bytes，未达到归档阈值。

## 2026-06-30 ProcessRuntime blocked / due_at 显式阻塞闭环

- 完成：按多甲方角色能力流程编排主线补齐 ProcessRuntime usecase / repo 层显式阻塞能力：`BlockProcessNodeInstance` 只允许 active 流程内 active 且版本匹配的节点带 reason 阻塞，`EscalateDueProcessNode` 只允许 due_at 已到达的 active 节点阻塞；两者都会把节点和 ProcessInstance 标记为 blocked，不写 completed_at、不推进后续节点、不创建 WorkflowTask、不写 Fact。
- 完成：补充 `process_runtime` usecase / repo 测试、priority audit 独立 `process-runtime-blocked-due-at` coverage、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径；JSON 审计已显示本地 `ok=true`，剩余非 ready 仅为 release evidence 目标环境证据。
- 下一步：后续若要做提醒升级通知、overdue 后台扫描、事件订阅器、JSON-RPC/RBAC 公开入口或具体领域命令绑定，需要另拆阶段并补对应测试与审计。
- 阻塞/风险：未改 schema / migration、未改 JSON-RPC / RBAC、未改前端页面、未触碰 release evidence、未执行真实导入 / 部署、未提交、未推送。本轮追加前已确认 `progress.md` 为 142 行 / 27551 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影诊断例外文档收口

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，补清 `adminProfileSync` / `ERPLayout` 当前代码的菜单投影、隐藏 URL fallback、`local dev`、`super admin` 和 sync failure 空投影边界。
- 完成：明确诊断例外不等于正式授权放开：正式客户 / 生产运行态普通账号仍按 RBAC 菜单路径和 active revision pages 交集强收窄；`local dev` 只绕过 pages 层；`super admin` 正常 active revision 下仍受 pages 收窄；只有无缓存 sync failure 空投影才保留全后台前端诊断路径。
- 下一步：若后续调整 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` fallback / 缓存复用，需要先补对应单测或浏览器级场景，再同步文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 149 行 / 28887 bytes，未达到归档阈值。

## 2026-06-30 sales_order.submit 显式领域命令入口

- 完成：按多甲方角色能力流程编排主线推进 P4 第一条黄金闭环起点，新增 `sales_order.submit` ProcessRuntime domain command handler，显式调用 `SalesOrderUsecase.SubmitSalesOrder` 提交销售订单 Source Document，并校验流程业务引用与 payload `sales_order_id` 一致。
- 完成：在 JSON-RPC dispatcher 初始化时注册 handler；补 `SalesOrder` + `ProcessRuntime` 集成单测、mismatch 拒绝单测、priority audit coverage、审计脚本测试快照，以及 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 下一步：继续 P4 第一条黄金闭环时，应另拆老板审批 / PMC 评审流程节点和前端串任务删除；采购入库、质检、出货、财务事实闭环必须单独阶段评审 source-of-truth、RBAC、幂等、审计、取消 / 冲正和测试。
- 阻塞/风险：本轮不让 `complete_task_action` 自动调用 handler，不写库存 / 出货 / 质检 / 财务 Fact，不改 schema / migration，不改前端页面，不触碰 release evidence，不执行真实导入 / 部署，未提交、未推送。本轮追加前已确认 `progress.md` 为 156 行 / 30079 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径对齐

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` 与 `ERPLayout` 当前代码的职责拆清：前者执行菜单 / URL 前端投影，后者负责 `get_effective_session` 拉取、缓存复用、空投影挂载和 fallback 跳转。
- 完成：明确正式客户 / 生产运行态普通账号仍按 RBAC 菜单路径和 active revision pages 交集强收窄；隐藏 URL 只有在已过滤 `visibleSections` 存在 fallback 时才跳转，否则显示空入口并阻止业务 `Outlet`。`local dev` 只放开 pages 层诊断；正式 / 非本地 `super admin` 正常 active revision 下仍受 pages 收窄，只有无缓存 sync failure 空投影才保留全后台前端诊断路径。
- 下一步：后续若改 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` 缓存 / fallback 行为，需要同步单测或浏览器场景后再改文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 163 行 / 31406 bytes，未达到归档阈值。

## 2026-06-30 销售订单接单最小流程链

- 完成：按多甲方角色能力流程编排 P4 第一条黄金闭环推进，新增 `TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview`，证明同一 ProcessInstance 内 `sales_order.submit` domain command 提交销售订单后，可顺序激活 `order_approval` 老板审批 linked task，并在老板任务完成后激活 `order_review` PMC 评审 linked task；owner role 均通过责任池候选解析，不直接硬写到流程节点。
- 完成：同步 `multi-client-role-workflow-priority-audit` 新增 `sales-order-acceptance-minimum-process-chain` 证据项，并更新 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md`，把口径从“只接 submit”推进为“后端最小流程链已验证”。
- 下一步：继续 P4 时应处理旧 `orderApprovalFlow` helper 的去留和正式 UI / 客户配置流程定义加载；采购收货、成品质检、财务放行、出货和应收线索仍必须单独阶段评审，不得和销售订单接单链混成一轮。
- 阻塞/风险：本轮未改 schema / migration、未改 JSON-RPC / RBAC、未改生产配置、未触碰 release evidence、未执行真实导入 / 部署、未提交、未推送；该链路不由普通 `complete_task_action` 自动调用提交命令，不写库存 / 出货 / 质检 / 财务 Fact。本轮追加前已确认 `progress.md` 为 170 行 / 32740 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径精修

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` 的职责限定为菜单过滤和当前 URL 是否应跳转的判断；`get_effective_session` 拉取、缓存复用、`effective_session_sync_failed` 空投影挂载和实际 `navigate(..., { replace: true })` fallback 跳转仍归 `ERPLayout`。
- 完成：补清正式客户 / 生产运行态普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；`local dev` 只放开 pages 诊断层，普通账号仍需 RBAC 路径命中；正式 / 非本地 `super admin` 在正常 active revision 返回 pages 数组时仍受 pages 收窄，仅额外保留系统诊断页，只有无缓存 sync failure 空投影才保留全后台前端诊断路径。
- 下一步：若后续改变 `adminProfileSync` 或 `ERPLayout` runtime，应同步补单测或 style:l1 场景后再改文档。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不碰 release evidence；只做文档口径同步。本轮追加前已确认 `progress.md` 为 177 行 / 34259 bytes，未达到归档阈值。

## 2026-06-30 销售订单接单前端串任务退场

- 完成：按 P4 “每迁移一条，删除对应前端串任务代码”要求，删除 `orderApprovalFlow` 中的老板审批、工程资料和退回补资料前端任务 builder，以及只服务这些 builder 的优先级 / due_at / source_no 派生 helper；正式运行时代码只保留订单审批相关任务识别和状态常量。
- 完成：更新 `orderApprovalFlow.test.mjs`、`multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`，把销售订单接单链路口径改为“后端最小流程链已验证 + 对应前端串任务 builder 已退场”。
- 验证：`node --check web/src/erp/utils/orderApprovalFlow.mjs`、`node --check web/src/erp/utils/orderApprovalFlow.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --test web/src/erp/utils/orderApprovalFlow.test.mjs`、`node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs`、`node --test scripts/qa/workflow-ui-action-boundary.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 均通过；priority audit JSON 中 `sales-order-acceptance-minimum-process-chain` 为 ready / pass=true，`releaseReady=false` 仍指向目标环境 release evidence 缺口。
- 下一步：继续 P4 时应评审客户配置流程定义加载和正式 UI 入口；采购收货、来料质检、仓库入库、成品质检、财务放行、仓库出货和应收线索仍必须拆成独立阶段。
- 阻塞/风险：本轮未改 schema / migration、JSON-RPC / RBAC、WorkflowUsecase、Fact usecase、生产配置、release evidence、真实导入、部署脚本、提交或推送；销售订单链路仍不由普通 `complete_task_action` 自动触发提交命令，不代表正式 UI 或目标环境 evidence 已闭环。本轮追加前已确认 `progress.md` 为 184 行 / 35478 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径再收敛

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` 当前职责限定为前端 profile 投影、菜单过滤和当前 URL 跳转判定；`get_effective_session` 拉取、缓存复用、空投影挂载和实际 fallback 跳转仍归 `ERPLayout`。
- 完成：明确正式客户 / 生产运行态普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；隐藏 URL 只有在过滤后存在可见 fallback 时才跳转，否则显示空入口并阻止业务 `Outlet`；`local dev` 只放开 pages 诊断层，正式 / 非本地 `super admin` 正常 active revision 下仍受 pages 收窄，仅额外保留系统诊断页，只有无缓存 sync failure 空投影才保留全后台前端诊断路径。
- 下一步：若后续改变 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` 的缓存 / fallback 行为，需要同步单测或浏览器场景后再改文档。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 192 行 / 37510 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance 客户配置流程定义 manifest evidence

- 完成：收口 P4 第一条黄金闭环的客户配置证据层，把已跟踪客户包 workflow 编译为 `sales_order_acceptance` manifest evidence only 流程定义；manifest 将 source pool 的 boss / pmc 映射到 runtime `order_approval` / `order_review` 责任池，锁住 `runtime_loader_enabled=false`、`fact_boundary=no_fact_posting`、`SalesOrderUsecase.SubmitSalesOrder` 白名单 handler 和 PMC `workflow.task.complete` 授权边界。
- 完成：更新 `customer-config-runtime-manifest`、priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`scripts/README.md` 和 `server/README.md`，明确当前只证明客户配置包可编译出受控流程定义证据，不启用 runtime loader、不发布 / 激活客户配置、不写 Workflow / Fact runtime 数据。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs`、`node --check scripts/qa/customer-config-runtime-manifest.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs`、`node --test scripts/qa/customer-package-lint.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 均通过；priority audit JSON 中 `customer-config-sales-order-process-definition-manifest` 为 ready / pass=true，`process-runtime-domain-command-handler` coverage 为 ready，`releaseReady=false` 仍指向目标环境 release evidence 缺口。
- 下一步：P4 后续应在独立阶段评审正式 UI 入口或 runtime loader 是否读取该流程定义；采购收货 -> 来料质检 -> 仓库入库，以及成品质检 -> 财务放行 -> 仓库出货 -> 应收线索仍不得和销售订单接单链混成一轮。
- 阻塞/风险：本轮未改 schema / migration、后端 usecase / JSON-RPC / RBAC、正式前端业务逻辑、release evidence、真实导入、部署脚本、提交或推送；manifest evidence 不是目标环境加载证据，也不是正式生产上线或客户数据写入证据。本轮追加前已确认 `progress.md` 为 199 行 / 38884 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance active config 受控 loader

- 完成：把上一阶段的 `sales_order_acceptance` 流程定义从 manifest evidence 推进为 `runtime_loader_ready` 的受控 loader 输入；`customer-config-runtime-manifest` 现在只对白名单销售订单接单流程标记 `runtime_loader_enabled=true`，仍锁住 `fact_boundary=no_fact_posting`、`SalesOrderUsecase.SubmitSalesOrder` 和 boss / PMC 责任池映射。
- 完成：新增 `BuildProcessInstanceCreateFromActiveCustomerConfig`，可从 active customer config revision 的 `compiled_snapshot.processDefinitions.sales_order_acceptance` 构造 `ProcessInstanceCreate`，并拒绝未启用 loader、Fact 边界变更或未知 command key；该 helper 只构造输入，不自动创建 / 启动 ProcessInstance，不开放 JSON-RPC / 正式 UI。
- 完成：同步 priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`scripts/README.md` 和 `server/README.md`，把当前口径改为“active config 可受控转换为流程实例创建输入”，并继续标明不自动启动、不写 Fact、不证明目标环境。
- 验证：`go test ./internal/biz -run 'TestCustomerConfigUsecase(BuildsProcessInstanceCreateFromActiveProcessDefinition|RejectsUnsafeActiveProcessDefinitionLoader)|TestProcessRuntimeUsecaseCreateNormalizesDefaults|TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview'`、`go test ./internal/biz`、`node --check scripts/qa/customer-config-runtime-manifest.mjs`、`node --check scripts/qa/customer-config-runtime-manifest.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs`、`node --test scripts/qa/customer-package-lint.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 均通过；priority audit JSON 中 `customer-config-sales-order-process-definition-manifest` 为 ready / pass=true，`process-runtime-domain-command-handler` coverage 为 ready，`releaseReady=false` 仍指向目标环境 release evidence 缺口。
- 下一步：P4 下一阶段应在正式 UI / API 层评审如何显式创建并启动该流程实例，或转入第二条黄金闭环 `采购收货 -> 来料质检 -> 仓库入库`；两者不能和目标环境 release evidence 混成一轮。
- 阻塞/风险：本轮未改 schema / migration、JSON-RPC / RBAC、正式前端业务逻辑、release evidence、真实导入、部署脚本、提交或推送；受控 loader helper 不是后台 scheduler，不会自动扫描流程定义、自动启动流程或把任务完成绑定到领域命令。本轮追加前已确认 `progress.md` 为 207 行 / 41224 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径代码对齐

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `pages` 非数组的 legacy 行为限定为未挂载 effective session pages 的历史 / 兼容 profile；已返回 effective session 缺 pages 会被归一为空数组，正式客户 / 生产运行态普通账号在 active session 下仍按 RBAC 菜单路径和 active revision pages 交集强收窄。
- 完成：同步隐藏 URL 和诊断例外口径：`adminProfileSync` 只返回过滤 / 跳转判定，实际 fallback 跳转由 `ERPLayout` 在存在可见入口时执行；`local dev` 只放开 pages 诊断层；正式 / 非本地 `super admin` 只有在 `source=effective_session_sync_failed` 空投影下才保留全后台前端诊断路径，正常 cached effective session 继续按缓存投影收窄。
- 下一步：若后续改 `adminProfileSync` 或 `ERPLayout` 的 effective session 缓存、空投影、菜单过滤、URL fallback 行为，需要同步测试后再改文档。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 216 行 / 44098 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync sync failure 诊断口径精修

- 完成：按 review 发现继续只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `source=effective_session_sync_failed` 空投影与正常 cached effective session 的关系写清：只有当前 profile 挂载空投影时，正式 / 非本地 `super admin` 才保留全后台前端诊断路径。
- 完成：明确首次空投影通常由 `get_effective_session` 同步失败且没有可用 cached effective session 时由 `ERPLayout` 挂载；后续同步失败若缓存本身已是该空投影则继续复用；已有正常 cached effective session 时继续按正常缓存投影收窄，不进入全后台诊断放开。
- 下一步：后续若改 `adminProfileSync` 或 `ERPLayout` 的缓存、空投影、菜单过滤或隐藏 URL fallback 行为，需要先同步测试，再更新文档口径。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 223 行 / 45428 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance 显式启动 API 证据收口

- 完成：回到多甲方角色能力流程编排 P4 第一条黄金闭环，核对当前代码已存在 `customer_config.start_sales_order_acceptance_process`，并把该显式创建 / 启动 ProcessInstance 的 JSON-RPC 入口纳入 `multi-client-role-workflow-priority-audit` 的 ready 检查与 ProcessRuntime domain command 参考覆盖。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径：API 要求 `sales_order.submit` 权限，可从 active customer config 受控创建并启动 `sales_order_acceptance` ProcessInstance 首节点；它不执行 `sales_order.submit` domain command、不写库存 / 出货 / 质检 / 财务 Fact、不代表正式 UI 或目标环境 evidence 已闭环。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(StartSalesOrderAcceptanceProcess|StartSalesOrderAcceptanceProcessRequiresSubmitPermission|PublishActivateAndEffectiveSession|ExplainModuleStatus)'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 均通过。
- 下一步：P4 第一条链路后续若要做正式 UI 入口或执行 `sales_order.submit` domain command，必须另拆阶段并补 UI/API/RBAC/幂等/审计测试；第二条黄金闭环 `采购收货 -> 来料质检 -> 仓库入库` 仍不能和本阶段混做。
- 阻塞/风险：本轮未改 schema / migration、正式前端 UI、Fact usecase、release evidence、真实导入、部署脚本、提交或推送；当前只收口 API evidence 和文档口径。本轮追加前已确认 `progress.md` 为 230 行 / 46590 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径定稿

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` 与 `ERPLayout` 的职责边界写清：前者负责 profile 投影、菜单过滤和当前 URL 跳转判定，后者负责 `get_effective_session` 拉取、缓存复用、空投影挂载和实际 fallback 跳转。
- 完成：明确正式客户 / 生产运行态普通账号仍按 RBAC 菜单路径和 active revision pages 交集强收窄；隐藏 URL 无可见 fallback 时只显示空入口并阻止业务 `Outlet`；`local dev` 只放开 pages 诊断层；正式 / 非本地 `super admin` 正常 active revision 下仍受 pages 收窄，只有 `effective_session_sync_failed` 空投影才保留全后台前端诊断路径。
- 下一步：后续若改变 `adminProfileSync`、`ERPLayout`、菜单过滤、缓存复用或 hidden URL fallback 行为，需要先同步测试，再更新当前真源和前端 README。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 245 行 / 49618 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance priority audit 精确口径修复

- 完成：回到多甲方角色能力模块组合流程编排主线，按 P4 第一条黄金闭环复核 `customer_config.start_sales_order_acceptance_process` 与 `customer_config.execute_sales_order_acceptance_submit` 当前代码和测试；Go service / biz 目标测试均已通过。
- 完成：修正 `docs/product/多甲方角色能力流程编排优先级.md` 的审计证据口径，把 start API 的边界明确为“不执行 `sales_order.submit` domain command”，与 submit API 的“显式执行 `sales_order.submit` domain command”分开，恢复 `multi-client-role-workflow-priority-audit` ready 检查。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(StartSalesOrderAcceptanceProcess|ExecuteSalesOrderAcceptanceSubmit|StartSalesOrderAcceptanceProcessRequiresSubmitPermission)'`、`cd server && go test ./internal/biz -run 'Test(SalesOrderProcessDomainCommandSubmitBindsUsecase|SalesOrderProcessDomainCommandSubmitRejectsMismatchedBusinessRef|SalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview|CustomerConfigUsecaseBuildsProcessInstanceCreateFromActiveProcessDefinition|CustomerConfigUsecaseRejectsUnsafeActiveProcessDefinitionLoader|ProcessRuntimeUsecaseExecuteDomainCommandNodeCompletesAndAdvances|ProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsMissingHandler|ProcessRuntimeUsecaseExecuteDomainCommandNodeRejectsCommandMismatch)'` 均通过；priority audit JSON 为 `ok=true`、`35/35`，但 `releaseReady=false`、`blocking=external-release-evidence-required` 仍正确指向目标环境证据缺口。
- 下一步：P4 若继续本地闭环，可另拆正式 UI 入口；若转入第二条黄金闭环 `采购收货 -> 来料质检 -> 仓库入库`，必须单独评审 Purchase / Quality / Inventory 真源、RBAC、幂等、审计、取消 / 冲正和测试。
- 阻塞/风险：本轮只改优先级文档和 `progress.md`，未改业务逻辑、schema / migration、正式 UI、release evidence、真实导入、部署脚本，未提交、未推送。本轮追加前已确认 `progress.md` 为 252 行 / 50890 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance 正式销售订单页入口

- 完成：将正式销售订单页已有“提交”生命周期动作改为调用 `submitSalesOrderAcceptanceProcess`，前端先调用 `customer_config.start_sales_order_acceptance_process` 创建 / 启动 `sales_order_acceptance` 流程，再调用 `execute_sales_order_acceptance_submit` 显式执行首个 `sales_order.submit` domain command；成功提示改为“销售订单已提交，已进入老板审批”。
- 完成：新增 `customerConfigApi` 组合 wrapper 和静态合同测试，锁住流程节点 ID、expected version 和幂等键只作为隐藏运行时参数，不在业务页面展示；`multi-client-role-workflow-priority-audit` 新增 `sales-order-acceptance-formal-ui-submit-entry` ready 检查，文档同步从“未开放正式 UI”更新为“正式销售订单页提交按钮已接入”。
- 验证：`node --test web/src/erp/api/customerConfigApi.test.mjs web/src/erp/api/masterDataOrderApi.test.mjs`、`corepack pnpm exec eslint --no-warn-ignored src/erp/api/customerConfigApi.mjs src/erp/api/customerConfigApi.test.mjs src/erp/components/sales-orders/salesOrderPageConfig.mjs src/erp/pages/V1SalesOrdersPage.jsx`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop corepack pnpm style:l1`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(StartSalesOrderAcceptanceProcess|ExecuteSalesOrderAcceptanceSubmit|StartSalesOrderAcceptanceProcessRequiresSubmitPermission)'` 均通过；priority audit JSON 为 `ok=true`、`36/36`，UI 检查 ready / pass=true，`releaseReady=false` 仍指向目标环境 release evidence 缺口。
- 下一步：P4 第一条链路若继续，应补真实浏览器级销售订单提交回归或继续评审老板审批 / PMC 评审在正式任务端的可见入口；第二条黄金闭环仍需另拆 Purchase / Quality / Inventory 阶段。
- 阻塞/风险：本轮未改后端业务逻辑、schema / migration、release evidence、真实导入、部署脚本、Inventory / Quality / Shipment / Finance Fact；未提交、未推送。浏览器回归已覆盖正式业务页销售订单场景的打开和页面壳，不等同于真实后端页面提交 smoke；当前真实提交仍由前端静态合同、后端 JSON-RPC 单测和 priority audit 证明。本轮追加前已确认 `progress.md` 为 260 行 / 53244 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影诊断例外文档复核

- 完成：按本次 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单投影结论收敛为 `adminProfileSync` 负责 profile 投影 / 菜单过滤 / 跳转判定，`ERPLayout` 负责 `get_effective_session` 拉取、缓存复用、空投影挂载和实际 fallback 跳转。
- 完成：补清 `local dev` 由 `import.meta.env.DEV` 决定；本地开发普通账号只放开 pages 诊断层且仍受 RBAC 菜单路径限制；本地开发 `super admin` 可查看全后台前端路径用于排障；正式 / 非本地 `super admin` 正常 active revision 下仍受 pages 收窄，只额外保留系统诊断页，只有 `effective_session_sync_failed` 空投影才保留全后台前端诊断路径。
- 下一步：后续若改 `adminProfileSync` 或 `ERPLayout` 的 pages 归一、缓存复用、sync failure 空投影、URL fallback 行为，需要先同步测试，再更新当前真源和前端 README。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 268 行 / 55808 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance UI 状态合同修复

- 完成：回到多甲方角色能力流程编排 P4 第一条黄金闭环，修复正式销售订单页提交入口的选中记录状态合同；`submit` 生命周期动作显式声明 `returnsRecord=false`，页面在流程 API 返回 ProcessRuntime payload 时保留原销售订单记录，避免把流程执行结果误当 `sales_order` 选中对象，随后仍由 `loadOrders()` 按列表真源刷新。
- 完成：同步静态合同测试和 `multi-client-role-workflow-priority-audit` 检查，锁住正式销售订单页提交入口继续走 `sales_order_acceptance` 两步 API，同时不把非记录 payload 写入 `selectedOrder`。
- 验证：`node --test web/src/erp/api/customerConfigApi.test.mjs web/src/erp/api/masterDataOrderApi.test.mjs`、`corepack pnpm exec eslint --no-warn-ignored src/erp/api/customerConfigApi.test.mjs src/erp/components/sales-orders/salesOrderPageConfig.mjs src/erp/pages/V1SalesOrdersPage.jsx`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 均通过；priority audit 仍为 `ok=true`，`releaseReady=false`，目标环境 release evidence 缺口未被误标完成。
- 下一步：P4-1 若继续，可补真实浏览器点击 submit 的 mock 回归；之后再另拆 P4-2 `采购收货 -> 来料质检 -> 仓库入库`，不得和 Purchase / Quality / Inventory 事实层混成一轮。
- 阻塞/风险：本轮未改后端业务逻辑、schema / migration、release evidence、真实导入、部署脚本、Purchase / Quality / Inventory / Finance / Shipment 事实层；未提交、未推送。`customerConfigApi.test.mjs` 和 `multi-client-role-workflow-priority-audit.mjs` 当前仍处在既有未跟踪文件现场，需保持不误删。本轮追加前已确认 `progress.md` 为 275 行 / 57096 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径再收窄

- 完成：按本次 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把正式客户 / 非本地运行态普通账号继续表述为 RBAC 菜单路径与 active revision pages 的交集强收窄，避免被理解成 `super admin` 或 sync failure 诊断例外会放开正式普通账号。
- 完成：补清隐藏 URL fallback 口径：`adminProfileSync` 只返回跳转判定，`ERPLayout` 仅在过滤后存在可见入口时 `replace` 到第一个可见入口；无 fallback 时不跳隐藏页、RBAC-only 页面或默认全量后台，只显示空入口并阻止业务 `Outlet`。
- 完成：补清诊断例外对应当前 helper 原因值：`local_dev_customer_config_diagnostic`、`local_dev_sync_failed_diagnostic`、`super_admin_system_diagnostic` 和 `super_admin_sync_failed_diagnostic` 只解释前端菜单 / URL 排障可见性，不扩大后端 RBAC、动作权限、active revision、Workflow / Fact usecase、schema、migration、真实导入或 release evidence。
- 下一步：后续若改 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` 的缓存 / fallback 行为，需要先同步测试，再更新当前真源和前端 README。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 283 行 / 59040 bytes，未达到归档阈值。

## 2026-06-30 sales_order_acceptance 浏览器点击回归收口

- 完成：回到多甲方角色能力流程编排 P4 第一条黄金闭环，收口正式销售订单页“提交”浏览器级回归；`sales-order-acceptance-submit-action-desktop` 在本地 `style:l1` mock 中点击正式销售订单页提交按钮，断言调用 `customer_config.start_sales_order_acceptance_process` 与 `customer_config.execute_sales_order_acceptance_submit`，并断言不回退旧 `sales_order.submit_sales_order`。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，把该证据定位为本地浏览器 mock 回归；它不等同真实后端页面提交 smoke，不代表目标环境 release evidence、真实客户配置加载或整条销售订单黄金闭环已在目标环境闭环。
- 验证：`STYLE_L1_SCENARIOS=sales-order-acceptance-submit-action-desktop corepack pnpm style:l1` 通过 1 个场景；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过 5 项；`corepack pnpm exec eslint --no-warn-ignored scripts/style-l1/businessFormalScenarios.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 为 `ok=true`、`readyChecks=34/36`、`releaseReady=false`，剩余仍是 guarded 领域命令入口和 external release evidence。
- 下一步：P4-1 本地 UI 点击证据已收口；下一阶段应进入 P4-2 `采购收货 -> 来料质检 -> 仓库入库` 的最小可验证切片，先核 Purchase / Quality / Inventory 现有 usecase、状态、RBAC、幂等和测试，不要直接把 Workflow 任务完成写成库存或质检事实。
- 阻塞/风险：本轮未改后端业务逻辑、schema / migration、release evidence、真实导入、部署脚本、Purchase / Quality / Inventory / Finance / Shipment 事实层；未提交、未推送。`multi-client-role-workflow-priority-audit.mjs` 与 `docs/product/多甲方角色能力流程编排优先级.md` 当前仍是既有未跟踪现场，需保持不误删。本轮追加前已确认 `progress.md` 为 291 行 / 60648 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影诊断例外文档最终收口

- 完成：按本次 review 发现只修正文档口径，核对 `adminProfileSync` 与 `ERPLayout` 当前代码后，仅更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把职责边界收敛为 `adminProfileSync` 只做 profile 投影、菜单过滤和当前 URL 跳转判定，`ERPLayout` 负责 `get_effective_session` 拉取、缓存复用、`effective_session_sync_failed` 空投影挂载和实际 fallback 跳转。
- 完成：明确正式客户 / 非本地运行态普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；隐藏 URL 只有存在已过滤可见 fallback 才 replace，没有 fallback 时阻止业务 `Outlet`；`local dev` 只放开 pages 诊断层，普通账号仍受 RBAC 菜单路径限制；正式 / 非本地 `super admin` 正常 active revision 下仍受 pages 收窄，只有 sync failure 空投影才保留全后台前端诊断路径。
- 验证：按本轮边界只运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若改 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` 的缓存 / fallback 行为，需要先同步测试，再更新当前真源和前端 README。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 299 行 / 62802 bytes，未达到归档阈值。

## 2026-06-30 material_supply definition evidence-only 收口

- 完成：回到多甲方角色能力流程编排 P4 第二条黄金闭环，确认当前 `scripts/qa/customer-config-runtime-manifest.mjs` 已编译 `material_supply` / `purchase_receipt_iqc_inbound` 的 `definition_evidence_only` 流程定义，并通过测试锁住 `purchase_receipt_source -> incoming_qc -> warehouse_inbound -> end`、采购 / 品质 / 仓库责任池、`runtime_loader_enabled=false`、`fact_boundary=no_fact_posting` 和 `purchase_receipt.create / quality_inspection.decide / inventory.post_inbound` 领域命令合同前置。
- 完成：新增 `multi-client-role-workflow-priority-audit` 的 `material-supply-definition-evidence-only` ready 检查与 `p4-material-supply-definition-evidence` reference coverage，并同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`，明确该阶段只证明 P4-2 责任池、能力和 Fact command contract 前置条件，不启用 runtime loader、不写采购 / 质检 / 库存事实。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs docs/当前真源与交接顺序.md progress.md`；`git diff --no-index --check /dev/null scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`git diff --no-index --check /dev/null scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`git diff --no-index --check /dev/null docs/product/多甲方角色能力流程编排优先级.md`。
- 下一步：P4-2 若继续实现，必须另拆 Purchase / Quality / Inventory 领域命令合同阶段，先评审 source-of-truth 字段、状态机、RBAC、幂等、审计、重复提交、取消 / 冲正和测试，再决定是否允许 `material_supply` runtime loader 进入真实流程运行时。
- 阻塞/风险：本轮未改后端业务逻辑、schema / migration、JSON-RPC / RBAC、正式前端页面、release evidence、真实导入、部署脚本；未提交、未推送。`material_supply` 仍是 evidence-only，不创建 `purchase_receipts`、不判定 `quality_inspections`、不写 `inventory_txns`，priority audit 当前 `ok=true` 但 `releaseReady=false`，目标环境 release evidence 仍未完成。本轮追加前已确认 `progress.md` 为 307 行 / 64414 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 测试覆盖口径文档补充

- 完成：按 review 发现继续只修正文档口径，核对 `adminProfileSync`、`ERPLayout` 和 `adminProfileSync.test.mjs` 当前代码后，仅更新 `docs/当前真源与交接顺序.md` 与 `web/README.md`，补清菜单投影、隐藏 URL 跳转、`local dev` / `super admin` / sync failure 诊断例外的测试覆盖说明。
- 完成：明确 `adminProfileSync.test.mjs` 已覆盖正式普通账号 sync failure 不退回 RBAC-only、`local dev` 普通账号只保留 RBAC 已允许诊断路径、`local dev` super admin 可查看全后台前端路径、正式 / 非本地 super admin 仅在 sync failure 空投影下放开全后台诊断路径，以及隐藏 URL 只返回跳转判定并交给 `ERPLayout` 使用已过滤 fallback。
- 验证：按本轮边界只运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若改 `resolveEffectiveSessionPageAccess`、`filterNavigationSectionsByAdminProfile`、`shouldRedirectFromCurrentNavigation` 或 `ERPLayout` 的缓存 / fallback 行为，需要先同步测试，再更新当前真源和前端 README。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 315 行 / 67396 bytes，未达到归档阈值。

## 2026-06-30 material_supply 领域命令合同预检

- 完成：回到多甲方角色能力流程编排 P4-2，新增 `MATERIAL_SUPPLY_FACT_COMMAND_CONTRACTS`，把 `purchase_receipt.create`、`quality_inspection.decide`、`inventory.post_inbound` 分别预映射到现有 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder`、`InventoryUsecase.PassQualityInspection / RejectQualityInspection`、`InventoryUsecase.PostPurchaseReceipt`，并记录对应 JSON-RPC、permission、稳定业务引用、幂等边界、测试锚点和 runtime loader blocker。
- 完成：`material_supply` 仍保持 `definition_evidence_only`、`runtime_loader_enabled=false`、`contract_preflight_only`、`writes_fact=false`；新增 validator 和测试，防止提前改成 runtime ready、移除测试锚点或让 manifest 声称写 Fact。
- 完成：`multi-client-role-workflow-priority-audit` 新增 `material-supply-domain-command-contract-preflight` ready 检查和 `p4-material-supply-domain-command-contract-preflight` reference coverage；同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md`，明确这是合同预检，不注册 ProcessRuntime handler、不启用 loader、不由任务完成写采购 / 质检 / 库存事实。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`go test ./internal/service -run 'TestJsonrpcDispatcher_(CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly|PurchaseReceiptAPIRequiresDomainPermissions|PurchaseReceiptAPIClosesInboundInventoryFact|QualityInspectionAPIChangesLotStatusWithoutInventoryTxn|QualityInspectionAPIRequiresDomainPermissions)'`；`go test ./internal/data -run 'TestInventoryRepo_(PurchaseReceiptLifecycle|QualityInspectionLifecycleAndLotStatus)'`；相关 `git diff --check` 和未跟踪文件 `git diff --no-index --check` 均通过。priority audit JSON 为 `ok=true`、`releaseReady=false`、`referenceCoverageLength=24`，新增 contract preflight check 为 ready/pass。
- 下一步：P4-2 若继续，应另拆 ProcessRuntime handler 注册和真实命令绑定阶段，先定义 command payload、幂等键、业务引用校验、RBAC/owner pool 约束、审计事件、重复提交和取消 / 冲正测试；不能直接让 `complete_task_action` 写采购 / 质检 / 库存 Fact。
- 阻塞/风险：本轮未改后端业务逻辑、schema / migration、JSON-RPC / RBAC 行为、正式前端页面、release evidence、真实导入、部署脚本；未提交、未推送。合同预检引用现有后端锚点，但不代表 `material_supply` runtime loader 已启用、handler 已注册、目标环境已验证或真实客户数据已导入。本轮追加前已确认 `progress.md` 为 323 行 / 68835 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync cached session 诊断例外口径纠偏

- 完成：按 review 发现只修正文档口径，核对 `web/src/erp/utils/adminProfileSync.mjs`、`web/src/erp/components/ERPLayout.jsx` 和 `web/src/erp/utils/adminProfileSync.test.mjs` 当前代码后，仅更新 `docs/当前真源与交接顺序.md` 与 `web/README.md`。
- 完成：明确 cached effective session 专指 `adminProfileRef.current.effective_session`，不是普通管理员 `me` profile；`get_effective_session` 同步失败时，有正常 cached effective session 会继续复用正常投影，缓存本身是 sync-failed 空投影才继续保留空投影诊断状态，无正常缓存时才挂载 `effective_session_sync_failed` 空投影。
- 完成：明确正式 / 非本地 `super admin` 在正常 active revision 下只额外保留 `permission-center` / `system-audit-logs` 系统诊断页，只有 sync failure 空投影下才放开全后台前端诊断路径；正式普通账号仍不退回 RBAC-only，隐藏 URL 仍只由 `ERPLayout` 在存在已过滤 fallback 时 replace。
- 验证：按本轮边界只运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync` 或 `ERPLayout` 的缓存、投影、跳转或诊断例外行为，应先同步 `adminProfileSync.test.mjs` 边界，再更新当前真源和 `web/README.md`。
- 阻塞/风险：本轮未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；只更新指定两份文档和 `progress.md`。本轮追加前已确认 `progress.md` 为 332 行 / 72136 bytes，未达到归档阈值。

## 2026-06-30 P4-2 quality_inspection.decide 领域命令 handler

- 完成：继续多甲方角色能力流程编排主线 P4-2，本阶段只实现 `quality_inspection.decide` 单命令闭环；新增 ProcessRuntime domain command handler，要求流程实例业务引用为 `purchase_receipt`，payload 必须提供 `quality_inspection_id` 或兼容 `id`，可选 `purchase_receipt_id / inventory_lot_id` 必须与当前质检单一致，并按 `PASS / CONCESSION / REJECT` 分流到 `InventoryUsecase.PassQualityInspection / RejectQualityInspection`。
- 完成：`quality_inspection.decide` 返回 `quality_inspection.passed / quality_inspection.concession_accepted / quality_inspection.rejected` outcome，并通过测试锁住不调用 `PostPurchaseReceipt`、不写库存过账；在 JSON-RPC dispatcher 构造时注册该 handler。`inventory.post_inbound` 仍不注册 handler，不启用 `material_supply` runtime loader，不新增 material supply start / execute API，不由 `complete_task_action` 自动调用采购、质检或库存 usecase。
- 完成：同步 `customer-config-runtime-manifest` 和 `multi-client-role-workflow-priority-audit`，把 `incoming_qc` 的 `runtime_binding_status` 调整为 `process_runtime_handler_registered`，并把剩余 blocker 收窄为 inventory handler、material_supply runtime API / loader 和目标环境 evidence；同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md`。
- 验证：`cd server && go test ./internal/biz -run 'Test(QualityInspectionProcessDomainCommand|PurchaseReceiptProcessDomainCommand|SalesOrderProcessDomainCommand|SalesOrderAcceptanceProcessSubmit)'`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_(CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly|PurchaseReceiptAPIRequiresDomainPermissions|QualityInspectionAPIChangesLotStatusWithoutInventoryTxn|QualityInspectionAPIRequiresDomainPermissions|SalesOrderAcceptance)'`；`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 为 `ok=true`、`releaseReady=false`，`material-supply-domain-command-contract-preflight` 为 ready/pass，剩余未证明项为 material_supply loader、inventory handler、material_supply start / execute API、任务完成写 Fact 和目标环境黄金闭环。
- 下一步：P4-2 下一阶段应单独实现 `inventory.post_inbound` handler 绑定，先核采购入库过账 payload、状态机、幂等、RBAC、冲正边界和重复提交测试；不要与 `material_supply` loader 启用或 start / execute API 混在同一不可审查大改里。
- 阻塞/风险：本轮未改 schema / migration、release evidence、真实导入、部署、正式前端 UI、material_supply runtime loader、material_supply JSON-RPC start / execute API 或 `inventory.post_inbound`；未提交、未推送。新 handler 只判定质检单，不代表采购收货 -> 来料质检 -> 仓库入库整条目标环境闭环已完成。本轮追加前已确认 `progress.md` 为 358 行 / 78606 bytes，未达到归档阈值。

## 2026-06-30 adminProfileSync 菜单投影文档口径纠偏

- 完成：按只读 review 发现，把 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中关于菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外的描述收窄到 `web/src/erp/utils/adminProfileSync.mjs` 与 `ERPLayout` 当前代码口径。正式客户 / 非本地普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；隐藏 URL 跳转限定为非诊断例外；非本地 `super admin` 正常 active revision 只保留系统诊断页例外，只有 sync failure 空投影才保留全后台前端诊断路径。
- 完成：本轮只改正式文档和过程记录，未改业务逻辑、测试、release evidence、schema、migration、客户配置包、部署脚本，未提交、未推送。
- 验证：待执行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续继续调整前端投影行为，应先改 `adminProfileSync` / `ERPLayout` 与对应测试，再同步修正文档口径。
- 阻塞/风险：本轮只校正文档描述，不新增自动化测试；诊断例外的真实行为仍以当前 helper、`ERPLayout` 和 `adminProfileSync.test.mjs` 为准。追加前确认 `progress.md` 为 350 行 / 77257 bytes，未达到归档阈值。

## 2026-06-30 P4-2 purchase_receipt.create 领域命令 handler

- 完成：回到多甲方角色能力流程编排主线，按 P4-2 `采购收货 -> 来料质检 -> 仓库入库` 的第一段只实现 `purchase_receipt.create` 单命令闭环；新增 ProcessRuntime domain command handler，要求流程实例业务引用为 `purchase_order`，payload `purchase_order_id` 如存在必须一致，并要求 `receipt_no / warehouse_id`，成功后调用 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder` 创建采购收货草稿。
- 完成：`purchase_receipt.create` 返回 `purchase_receipt.created` outcome，并通过测试锁住不调用 `PostPurchaseReceipt`、不写库存过账；在 JSON-RPC dispatcher 构造时注册该 handler。`quality_inspection.decide` 与 `inventory.post_inbound` 仍不注册 handler，不启用 `material_supply` runtime loader，不新增 material supply start / execute API，不由 `complete_task_action` 自动调用采购、质检或库存 usecase。
- 完成：同步 `customer-config-runtime-manifest` 和 `multi-client-role-workflow-priority-audit`，把 `purchase_receipt_source` 的 `runtime_binding_status` 调整为 `process_runtime_handler_registered`，并把剩余 blocker 收窄为 quality / inventory handler、material_supply runtime API / loader 和目标环境 evidence；同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md`。
- 验证：`cd server && go test ./internal/biz -run 'Test(PurchaseReceiptProcessDomainCommand|SalesOrderProcessDomainCommand|SalesOrderAcceptanceProcessSubmit)'`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_(CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly|PurchaseReceiptAPIRequiresDomainPermissions|SalesOrderAcceptance)'`；`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 为 `ok=true`、`releaseReady=false`，`material-supply-domain-command-contract-preflight` 为 ready/pass，剩余未证明项为 material_supply loader、quality / inventory handler、material_supply start / execute API、任务完成写 Fact 和目标环境黄金闭环。
- 下一步：P4-2 下一阶段应单独实现 `quality_inspection.decide` handler 绑定，先核质检判定 payload、状态机、幂等、RBAC、审计和重复提交测试；不要与 `inventory.post_inbound` 或 loader 启用混在同一不可审查大改里。
- 阻塞/风险：本轮未改 schema / migration、release evidence、真实导入、部署、正式前端 UI、material_supply runtime loader、material_supply JSON-RPC start / execute API、`quality_inspection.decide` 或 `inventory.post_inbound`；未提交、未推送。新 handler 只创建采购收货草稿，不代表采购收货 -> 来料质检 -> 仓库入库整条目标环境闭环已完成。本轮追加前已确认 `progress.md` 为 341 行 / 73808 bytes，未达到归档阈值。
