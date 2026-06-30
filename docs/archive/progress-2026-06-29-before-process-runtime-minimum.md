# progress archive 2026-06-29 before ProcessInstance runtime minimum

本文件归档 `progress.md` 中 2026-06-29 中段已完成、且已被后续 P3 记录覆盖的 adminProfileSync / P2 过程流水。归档不改变代码、migration、部署、release evidence 或当前正式真源。

## 2026-06-29 adminProfileSync 菜单投影文档口径复核

- 完成：按 review 发现只修正文档口径，补充 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 当前实现说明：正式普通账号由 RBAC 菜单路径与 active revision pages 交集强收窄，隐藏 URL 只能跳回第一个可见入口，无入口时阻止业务 Outlet 渲染。
- 完成：文档明确 local dev 例外只在 RBAC 已允许页面保留客户配置隐藏页或 sync failure 诊断入口；super admin 正常 active revision 下只额外保留 `permission-center` / `system-audit-logs`，只有 `effective_session_sync_failed` 时才保留全后台前端诊断路径。本轮追加前已确认 `progress.md` 为 341 行 / 56316 bytes，未达到归档阈值。
- 下一步：继续 review 或实现时，以 `web/src/erp/utils/adminProfileSync.mjs` 当前代码和测试为菜单投影判断依据，不把诊断例外写成正式客户可见能力。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不碰 release evidence、不提交不推送；只按用户要求运行 scoped `git diff --check`。

## 2026-06-29 P2 explain_module_status 只读解释闭环

- 完成：新增 `CustomerConfigUsecase.ExplainModuleStatus` 和 `customer_config.explain_module_status` JSON-RPC，只读解释 active revision 下模块的产品包含、成熟层、客户部署状态、依赖满足情况、角色 / 责任池 / 页面 / 流程引用、启用 / 关闭阻断原因；`customer_config.read` 权限控制访问，不提供 `install_module / uninstall_module / upload_plugin`。
- 完成：`customer_config` repo 新增只读 `ListWorkPools` 与按 pool 查询 membership，供 explain 返回当前模块关联责任池和角色；runtime count 暂未接 ProcessInstance / open task，返回 0 并标记 `runtime_count_source=not_connected`，关闭动作继续解释为 `runtime_counts_not_connected`。同步 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit` 锚点。本轮追加前已确认 `progress.md` 为 348 行 / 57462 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P2 剩余需要 schema/runtime 支撑的项应单独拆阶段，例如 `owner_pool_key / required_capability / entitlement_id`、真实 ProcessInstance / open task 计数和 break-glass 审计；不要在 explain_module_status 中伪造计数或模块关闭能力。
- 阻塞/风险：本轮不改 schema / migration、不改模块状态写入路径、不写 Workflow / Fact 事实、不触碰 release evidence、真实导入或部署；模块启停仍只能通过受审计的客户配置 publish / activate / rollback。

## 2026-06-29 adminProfileSync 菜单投影文档口径再纠偏

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影说明，使其与 `web/src/erp/utils/adminProfileSync.mjs` 和 `ERPLayout` 当前代码一致：正式普通账号按 RBAC 菜单路径与 active revision pages 交集强收窄，隐藏 URL 触发跳转，存在可见 fallback 时回到第一个可见入口，无入口时显示空入口提示并阻止业务 Outlet 渲染。
- 完成：文档补准 sync failure 诊断例外：effective session 同步失败且没有 cached effective_session 时才挂载 `effective_session_sync_failed` 空投影；已有 cached effective_session 时继续复用缓存投影，不退回 RBAC-only。local dev 仍只在 RBAC 已允许页面保留诊断入口；super admin 正常 active revision 下按 active pages 可见并额外保留系统诊断页，只有 sync failure 空投影时保留全后台前端诊断路径。本轮追加前已确认 `progress.md` 为 356 行 / 59252 bytes，未达到归档阈值。
- 下一步：继续 review 或实现菜单 / 客户配置投影时，以 `adminProfileSync` 与 `ERPLayout` 当前代码为准，不把 local dev / super admin / sync failure 诊断路径写成正式客户放开能力。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交不推送、不碰 release evidence；按用户要求只运行 scoped `git diff --check`。

## 2026-06-29 P2 entitlement capability + scope 同条匹配

- 完成：`CustomerConfigUsecase.WorkflowVisibleOwnerRoleKeys` 的责任池 owner role 扩展现在要求同一条 active revision entitlement 同时命中 role、当前 workflow required capability 和当前 customer scope；`customer` scope 必须匹配当前 customer key 或显式 `*`，`global` 只接受 `* / global`，未知 scope 不参与 Workflow 责任池授权。
- 完成：补 `customer_config_test.go`、`jsonrpc_workflow_test.go` 覆盖跨 customer scope 的 `workflow.task.read / complete` 不能与同 role 其他 scope 或其他 capability 拼接；同步 `multi-client-role-workflow-priority-audit`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md` 口径。本轮追加前已确认 `progress.md` 为 363 行 / 60696 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz ./internal/service -run 'TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeys|TestJsonrpcDispatcher_Workflow(ListTasksRequiresCustomerWorkPoolReadEntitlement|ActionRequiresCustomerWorkPoolActionEntitlement|ExplainActionAccessExplainsWorkPoolEntitlement)'`、`cd server && go test ./internal/biz ./internal/service`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。
- 下一步：P2 剩余更重的“任务候选人 = 责任池成员 + required_capability + 数据范围匹配”若要进入真实候选人/流程节点字段，需单独拆 `owner_pool_key / required_capability / entitlement_id` 或 ProcessInstance runtime 的 schema / migration 阶段；短期可先补 explain 中的 scope 命中解释字段。
- 阻塞/风险：本轮不改 schema / migration、不新增任务字段、不写 Workflow / Fact 事实、不触碰 release evidence、真实导入或部署；基础账号角色仍按既有 RBAC 可见，新增 scope 校验只限制由责任池扩出的 owner role。

## 2026-06-29 P2 explain scope 命中解释字段

- 完成：`explain_action_access` 现在在 action 解释中返回 `work_pool_entitlement_matched` 和 `work_pool_entitlement_scope_matched`，用于区分责任池 owner role 是否通过同 scope entitlement 命中；`explain_task_assignment` 增加 `action_work_pool_scope_matches`，按 complete / block / reject / urge 暴露每个动作是否命中责任池 scope。
- 完成：前端共享 `workflowTaskActionAccess` normalizer 保留后端返回的 work pool entitlement / scope 命中字段；同步 `multi-client-role-workflow-priority-audit`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md` 口径。本轮追加前已确认 `progress.md` 为 371 行 / 62687 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowExplain(ActionAccess|TaskAssignment)'`、`cd server && go test ./internal/biz ./internal/service`、`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`。Node 仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` warning，不影响本轮测试通过。
- 下一步：若继续 P2，可选择进入 `owner_pool_key / required_capability / entitlement_id` 等 schema / migration 设计，或先补只读候选人解释 / audit 输出，保持不写 Workflow / Fact 事实。
- 阻塞/风险：本轮不改变授权结果、不暴露 entitlement ID、不改 schema / migration、不触碰 release evidence、真实导入或部署；scope 命中解释只说明当前后端可见性计算结果，不证明目标环境客户配置已发布或激活。

## 2026-06-29 adminProfileSync 菜单投影文档口径补准

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 说明，把正式普通账号、local dev、super admin 和 sync failure 的前端菜单 / URL 诊断边界改为与当前代码一致：普通账号按 RBAC 菜单路径与 active revision pages 交集强收窄；local dev 只在 RBAC 已允许页面保留诊断入口；super admin 正常 active revision 下不依赖 `allowedMenuPaths`，但仍受 active pages 收窄，并只额外保留系统诊断页；sync failure 空投影时才保留 super admin 全后台前端诊断路径。本轮追加前已确认 `progress.md` 为 379 行 / 64453 bytes，未达到归档阈值。
- 下一步：后续菜单投影或客户配置文档继续以 `web/src/erp/utils/adminProfileSync.mjs` 和对应测试为准；不要把 local dev / super admin / sync failure 诊断路径写成正式客户业务能力放开。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交不推送、不碰 release evidence；按用户要求只运行 scoped `git diff --check`。

## 2026-06-29 P2 super admin / break-glass 业务处理边界

- 完成：收口 super admin 业务处理后门：`CanAdminHandleWorkflowTask` 不再因任务是 `shipment_release` 直接放行，JSON-RPC 解释也不再返回 `super_admin_shipment_release`；super admin 仍保留查看和催办类诊断边界，但普通 `complete_task_action` / 旧兼容 `update_task_status` 不能代办出货放行业务任务。
- 完成：补 `jsonrpc_workflow_test.go` 断言 super admin 无业务 owner role 时处理出货放行返回 permission denied，并在 `explain_task_assignment` 中只显示 can urge / can_urge_only；同步 `multi-client-role-workflow-priority-audit`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`。priority audit 现在把 `super-admin-break-glass-governance` 单列为 local guarded，避免把 P2 写成完整 ready。本轮追加前已确认 `progress.md` 为 385 行 / 65588 bytes，未达到归档阈值。
- 完成：验证通过：`cd server && go test ./internal/biz ./internal/service -run 'SuperAdmin|Workflow|JsonrpcDispatcher_Workflow'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；audit 摘要为 `ok=true`、`guarded=2`、`localGuardedRequirementIds=["super-admin-break-glass-governance"]`、`releaseReady=false`。
- 下一步：真正 break-glass 需单独阶段设计 runtime、原因、有效期、RBAC、审计和测试；不能把当前 super admin 诊断路径当作业务授权。
- 阻塞/风险：本轮不新增 schema / migration，不实现完整 break-glass，不触碰 release evidence、真实导入或部署；release evidence 仍是外部目标证据缺口，priority audit 仍显示 `external-release-evidence-required`。

## 2026-06-29 adminProfileSync 菜单投影文档口径按 review 再补准

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的 `adminProfileSync` 说明，把当前代码的两层判断写清：先用 `isSuperAdmin || allowedMenuPaths.has(path)` 做前端菜单路径可见性判断，再叠加 active revision pages；正式普通账号仍按 RBAC 菜单路径与 active pages 交集强收窄。
- 完成：补准隐藏 URL、local dev、super admin 和 sync failure 例外：隐藏 URL 有可见 fallback 时只 `replace` 到第一个可见入口，无可见入口时只显示空入口提示并阻止业务 Outlet；local dev 不放开 RBAC 未返回路径；super admin 的 `allowedMenuPaths` 例外只影响前端路径诊断，正常 active revision 下仍受 active pages 收窄，只有 sync failure 空投影才保留全后台前端诊断路径。本轮追加前已确认 `progress.md` 为 393 行 / 67457 bytes，未达到归档阈值。
- 下一步：后续菜单投影、客户配置或权限文档继续以 `web/src/erp/utils/adminProfileSync.mjs`、`ERPLayout` 和对应测试为准；不要把诊断例外写成正式客户业务能力放开。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交不推送、不碰 release evidence；按用户要求只运行 scoped `git diff --check`。

## 2026-06-29 P2 super admin 单次受控 break-glass

- 完成：把 P2 super admin / break-glass 从完全 guarded 推进为本地单次受控 runtime ready；`complete_task_action / block_task_action / reject_task_action` 只有显式 `break_glass=true`、非空 `break_glass_reason` 和不超过 2 小时的 `break_glass_expires_at` 时才允许 super admin 本次越过业务 owner role，且旧 `update_task_status` 仍不支持 break-glass。本轮追加前已确认 `progress.md` 为 400 行 / 68811 bytes，未达到归档阈值。
- 完成：break-glass 执行前写入 `workflow_task.break_glass` 高风险请求审计，记录 actor、任务、动作、原因、有效期和 `requested_next_status_key`；任务事件 actor role 固定为 `admin`，不把 super admin 诊断路径写成普通业务岗位能力，也不让 Workflow 写库存、出货、质检或财务 Fact。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `multi-client-role-workflow-priority-audit`；audit 现在显示 `super-admin-break-glass-governance` local ready、`localGuardedRequirementIds=[]`，整体仍因目标 release evidence 未齐保持 `external-release-evidence-required`。
- 完成：验证通过：`cd server && go test ./internal/service -run 'BreakGlass|SuperAdmin|Workflow'`、`cd server && go test ./internal/biz -run 'Audit|BreakGlass|SuperAdmin|Workflow'`、`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续按 `docs/product/多甲方角色能力流程编排优先级.md` 的执行队列推进；当前本地剩余不是 super admin guarded，而是领域命令进入条件仍 guarded，以及真实目标 release evidence、target smoke、备份恢复、回滚 / 前向修复和签收仍未完成。
- 阻塞/风险：本轮不新增 schema / migration，不触碰 release evidence、真实导入或部署，不实现长期 break-glass session / 审批流 / 生产演练；单次 break-glass 只是 Workflow 任务动作受控例外，不是客户可见岗位能力或生产上线证据。

## 2026-06-29 adminProfileSync 菜单投影文档口径 review 修正

- 完成：按 review 发现只修正 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的文档口径，使菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外与 `web/src/erp/utils/adminProfileSync.mjs` 和 `ERPLayout` 当前代码一致。本轮追加前已确认 `progress.md` 为 409 行 / 71018 bytes，未达到归档阈值。
- 完成：文档明确 `adminProfileSync` 先用 `isSuperAdmin || allowedMenuPaths.has(path)` 判断前端菜单路径可见性，再叠加 active revision pages；正式普通账号仍按 RBAC 菜单路径与 active pages 交集强收窄，隐藏 URL 有可见 fallback 时只 `replace` 到第一个可见入口，无入口时阻止业务 Outlet。
- 完成：文档补准诊断例外：local dev 对普通账号仍先要求 RBAC 菜单路径命中；super admin 的 `allowedMenuPaths` 例外只影响前端路径诊断，正常 active revision 下仍受 active pages 收窄，仅额外保留系统诊断页；只有 `effective_session_sync_failed` 空投影时才保留全后台前端诊断路径，已有 cached effective_session 时继续复用缓存投影。
- 下一步：后续菜单投影、客户配置或权限文档继续以 `adminProfileSync`、`ERPLayout` 和对应测试为准；不要把 local dev / super admin / sync failure 诊断路径写成正式客户可见能力或后端权限扩大。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交不推送、不碰 release evidence；按用户要求只运行 scoped `git diff --check`。
