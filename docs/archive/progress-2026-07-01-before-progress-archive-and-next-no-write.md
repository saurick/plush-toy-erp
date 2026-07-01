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
- `docs/archive/progress-2026-06-30-before-p5-input-checklist-followup.md`：归档 2026-06-30 P5 release closeout report-only、release evidence hardening、菜单投影纠偏和 input checklist JSON 自定义路径只读合同之前的过程记录。
- `docs/archive/progress-2026-06-30-before-outsourcing-order-api-gate.md`：归档 2026-06-30 P5 input checklist、adminProfileSync 文档纠偏、purchase / quality / shipment / stock reservation / production / outsourcing fact / sales / purchase order moduleStates 门禁等过程记录。

- `docs/archive/progress-2026-07-01-before-action-projection-l1.md`：归档 2026-06-30 outsourcing order API 门禁之后至 2026-07-01 动作投影浏览器回归扩展的过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本和 backup id 时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-07-01 progress 归档到动作投影 L1 回归前

- 完成：归档前 `progress.md` 为 390 行 / 81651 bytes，接近 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-07-01-before-action-projection-l1.md`。
- 完成：根 `progress.md` 收敛为归档索引、当前活跃事项和最近动作投影记录，避免下一轮继续在接近阈值的根流水上追加。
- 下一步：继续当前 goal 时按单个可验证闭环推进；涉及动作投影页面变化时优先补浏览器级回归。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、测试、发布脚本、目标环境状态或正式业务真源。

## 2026-07-01 源单生命周期事实边界提示
- 完成：调整销售订单、采购订单和加工合同关闭 / 取消确认文案，明确 Source Document / 源单生命周期动作只停止后续推进或终止源单，不自动写入、取消或冲正已生成 / 已登记的出货、入库、质检、发料、回货、库存、财务或 Workflow 事实。补充 `workflow-ui-action-boundary.test.mjs` 静态守卫，锁住三个源单页面关闭 / 取消确认必须暴露事实边界，避免页面动作误导用户以为源单生命周期等于下游事实写入或回滚。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过。
- 下一步：继续检查正式业务页生命周期动作是否存在类似“作废 / 冲正 / 归档”口径模糊，必要时优先补文案和静态守卫，不改后端事实语义。
- 阻塞/风险：本组不改 schema / RBAC / usecase / JSON-RPC / 菜单，不新增事实写入或冲正能力，也不验证真实页面点击；只收口用户可见确认文案和静态边界测试。
## 2026-07-01 采购与委外动作投影守卫
- 完成：扩展 `workflow-ui-action-boundary.test.mjs`，在销售订单动作投影守卫之外，新增采购订单和加工合同页面守卫，锁住创建、编辑、生命周期动作、采购入库草稿生成、附件上传 / 删除和协同任务动作都必须经过 `hasActionPermission` / Workflow action 投影与状态机判断，避免 super_admin、普通 admin 或 active customer config 场景下绕开动作收窄。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，新增采购 / 委外守卫已在 fast 中执行。
- 下一步：继续把同类动作投影守卫扩展到出货、采购入库、质检等 Fact 页面，或补对应浏览器级按钮禁用 / 隐藏回归。
- 阻塞/风险：本组只补静态接线守卫，不改页面行为、后端 RBAC、JSON-RPC、usecase、schema 或 migration；不调用真实后端、不写数据库、不证明目标环境 customer config 已激活。
## 2026-07-01 事实页动作投影守卫
- 完成：继续扩展 `workflow-ui-action-boundary.test.mjs`，锁住出货、采购入库和来料质检页面的创建、维护明细、过账 / 确认、取消 / 冲正、质检提交 / 判定以及附件动作必须同时受 action 投影和状态 guard 控制，并保留前端不本地写库存 / 批次事实的边界文案。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过。
- 下一步：如继续页面动作验收，优先补浏览器级 disabled / hidden 状态回归，而不是继续只加静态字符串守卫。
- 阻塞/风险：本组不改 UI 行为、后端 usecase、RBAC、JSON-RPC、schema 或 migration；不写数据库、不证明目标环境激活。
## 2026-07-01 动作投影浏览器回归扩展
- 完成：扩展 `erp-effective-session-action-projection-business-pages` L1 场景，在既有出货 / 质检 / 入库按钮禁用回归之外，加入销售订单、采购订单和加工合同页面，验证 active customer config 页面可见但 `actions=[]` 时，源单创建 / 编辑 / 生命周期 / 生成入库动作保持隐藏或禁用。
- 验证：`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5232 pnpm --dir web style:l1` 通过。
- 下一步：若继续改动作投影，先归档或压缩 `progress.md` 后再追加记录；后续可补移动端任务动作的同类浏览器回归。
- 阻塞/风险：本组运行在本地 DEV + Playwright mock，不调用真实后端、不写数据库、不证明目标环境 customer config 已激活。

## 2026-07-01 移动端任务动作原因提示回归
- 完成：校正岗位任务端详情原因输入文案，移除与当前必填校验和快捷原因不一致的“至少 5 个字”提示，并为原因输入框补稳定 `data-testid`；扩展移动端浏览器 smoke，阻塞和催办动作都会先断言空原因提示，再提交真实原因与现场留痕；同步扩展 `mobile-tasks-dark` L1 mock 详情回归，锁住原因面板定位和提示文案。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH pnpm --dir web test` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5233 pnpm --dir web style:l1` 通过。
- 下一步：继续按移动端任务端闭环补充真实浏览器回归或后端动作合同测试，优先覆盖退回动作和后端拒绝原因回读。
- 阻塞/风险：本组只改前端文案、测试定位和浏览器脚本断言，不改后端 reason 合同、Workflow / Fact 边界、RBAC、schema、migration，也不写真实客户数据。

## 2026-07-01 移动端任务完成反馈 smoke 扩展
- 完成：扩展 `mobileWorkflowRuntimeBrowserSmoke.mjs`，在既有阻塞和跨角色催办之外新增 `simulated_only` 老板完成任务；真实浏览器路径会点击自有任务“完成”、等待成功反馈、切到已办列表确认任务出现，并在后端回读中断言 `task_status_key=done`、`business_status_key=project_approved`、`mobile_action.action_key=done` 和完成留痕。同步 `web/README.md`、`scripts/README.md` 和静态测试说明。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：如有本地后端和演示账号密码，可运行 `MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD=... pnpm --dir web smoke:mobile-workflow-runtime-browser` 做真实浏览器 / 真实后端写入回归；继续目标时优先补后端动作合同 / 审计回读。
- 阻塞/风险：本组不改后端 usecase / RBAC / schema / migration，不写真实客户数据，不证明生产或目标环境；真实 smoke 需要本地后端和演示账号密码，当前未执行。

## 2026-07-01 移动端任务退回 smoke 扩展
- 完成：继续扩展 `mobileWorkflowRuntimeBrowserSmoke.mjs`，新增 `simulated_only` 老板退回任务；真实浏览器路径会点击“退回当前任务”、先断言空原因提示，再提交退回原因和现场留痕，并在后端回读中断言 `task_status_key=rejected`、`business_status_key=project_pending`、`mobile_action.action_key=rejected`、退回留痕和 `mobile_exception_report.reason`。同步 `web/README.md`、`scripts/README.md` 和静态测试说明。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：如具备本地后端和演示账号密码，可统一运行 `MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD=... pnpm --dir web smoke:mobile-workflow-runtime-browser` 验证阻塞、退回、完成和跨角色催办真实浏览器写入；继续目标时优先补后端动作合同 / 审计回读。
- 阻塞/风险：本组仍只覆盖本地/试用模拟 workflow 证据，不改后端 usecase / RBAC / schema / migration，不写真实客户数据，不证明生产或目标环境；真实 smoke 需要本地后端和演示账号密码，当前未执行。

## 2026-07-01 Workflow 任务动作后端读回合同
- 完成：新增 `TestWorkflowRepo_TaskStatusReasonEventAndCompletionCleanup`，在 repo 层锁住 blocked / rejected / done 三段任务状态写入合同：阻塞原因会持久化并写入 `workflow_task_events`，退回原因会替换旧阻塞原因并写入事件，完成任务会设置 `completed_at` 且清理旧阻塞 / 退回原因；事件同时断言 actor_id、actor_role_key 和 `mobile_action` payload。同步扩展 service 层 controlled action 成功路径断言，确认 `complete_task_action`、`block_task_action`、`reject_task_action` 不只由服务端推导状态与 actor role，也会把移动端 payload 留痕交给 usecase；补 `urge_task` 空原因 JSON-RPC 回归，锁住绕过前端时后端仍拒绝空催办原因且不写 repo。
- 验证：`go test ./internal/data -run 'TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup|CreateAndUpdateTaskStatus|UrgeWorkflowTaskWritesEventAndPayload)'`（在 `server/` 目录）通过；`go test ./internal/service -run 'TestJsonrpcDispatcher_Workflow(CompleteTaskAction|ControlledTaskActions)'`（在 `server/` 目录）通过；`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowUrgeTask'`（在 `server/` 目录）通过；`go test ./internal/biz -run 'TestWorkflowUsecase_UrgeTask'`（在 `server/` 目录）通过；`go test ./internal/service -run 'TestJsonrpcDispatcher_Workflow(ControlledTaskActions|CompleteTaskAction|BreakGlass|UpdateTaskStatus|Urge)'`（在 `server/` 目录）通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过；`git diff --check` 通过；敏感文本扫描无匹配。曾从仓库根目录直接运行 Go module 命令失败，原因是根目录不是 Go module。
- 下一步：继续按 goal 检查 service 层 controlled action 与 repo 事件读回是否还缺少 JSON-RPC 端到端断言；如继续扩展，应优先覆盖不增加 schema/RBAC 面的本地测试。
- 阻塞/风险：本组只补测试，不改后端实现、schema、RBAC、JSON-RPC 合同、migration 或真实客户数据；未运行真实浏览器 / 真实后端 mobile smoke，仍需本地后端和演示账号密码。

## 2026-07-01 Workflow 后端动作验证入口同步
- 完成：同步 `docs/product/自动化测试策略.md` 与 `scripts/README.md`，把任务动作合同、reason、事件 / actor role、payload 和岗位任务端后端读回的 Go 测试加入当前维护验收入口；扩展 `dev-entry-boundary.test.mjs`，锁住 `/__dev/testing` 的脚本来源能暴露这些本地验证命令，且不回退到 reference/archive 命令；在 `DEV_TESTING_COPY_PRESETS` 中新增 Workflow 后端动作合同固定复制预设，避免开发验收页只能靠全文检索找到命令。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；`go test ./internal/data -run 'TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup|CreateAndUpdateTaskStatus|UrgeWorkflowTaskWritesEventAndPayload)'`（在 `server/` 目录）通过；`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowUrgeTask|TestJsonrpcDispatcher_Workflow(CompleteTaskAction|ControlledTaskActions)'`（在 `server/` 目录）通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过；敏感词扫描只命中文档中的占位密码、token / env 名和 secret 规则说明，未发现新增真实密钥。
- 下一步：继续按 goal 优先补本地试用 / 岗位任务端可验证闭环；若触达真实浏览器写入，仍需本地后端和演示账号密码。
- 阻塞/风险：本组只改文档和 QA 静态守卫，不改 runtime、schema、RBAC、JSON-RPC 行为、部署脚本或真实客户数据；这些命令仍只证明本地后端合同，不证明目标环境发布或真实导入。

## 2026-07-01 Dev Testing 移动端与试用角色预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `trial-role-entries` 和 `mobile-workflow-smoke`，让开发验收页直接暴露试用角色入口静态守卫、移动端 Workflow 真实浏览器 smoke 前置静态守卫，以及需要本地后端和演示账号密码的真实浏览器命令；同步扩展 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住这些预设不退回到只靠文档全文检索。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-testing-light-desktop STYLE_L1_PORT=5234 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`git diff --check` 通过；敏感词扫描只命中占位密码环境变量名和既有文档说明，未发现新增真实密钥。
- 下一步：继续按 goal 检查本地试用 / 岗位任务端闭环是否还缺少不需要真实账号的静态或本地合同验证；真实浏览器写入仍需本地后端和演示账号密码。
- 阻塞/风险：本组只改 dev-only 测试入口配置和静态守卫，不改正式客户菜单、runtime、schema、RBAC、后端合同、客户数据、部署或 release evidence；真实 `smoke:mobile-workflow-runtime-browser` 命令仍未执行。

## 2026-07-01 Dev Testing 客户配置控制台预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `customer-config-dev-console`，直接暴露客户配置预检、moduleStates、导入 tooling 和 `/__dev/customer-config` 页面调整时的当前本地验证命令；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设必须复制 `devCustomerConfig.test.mjs`、`dev-entry-boundary`、priority audit 和 `dev-customer-config-dark-desktop` L1 命令。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devCustomerConfig.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-testing-light-desktop,dev-customer-config-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过；敏感词扫描只命中占位密码 / 测试字符串和既有说明，未发现新增真实密钥。
- 下一步：继续按 goal 检查 `/__dev` 原型、测试和客户配置控制台是否还有当前维护入口缺口；真实测试环境应用、目标环境发布、真实客户导入和 release evidence 仍需单独显式输入与门禁。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不改客户配置后端 usecase、schema、RBAC、正式菜单、真实客户数据、部署或 release evidence；`customer-config-dev-console` 预设中的命令只证明本地 dev-only 控制台和当前仓库证据对齐。

## 2026-07-01 Dev Testing 客户配置前端投影预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `frontend-customer-config-projection`，把正式前端 effective session、菜单交集、空页面诊断、action 投影和字段策略的当前验证命令收口到可复制入口；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设必须复制 `adminProfileSync.test.mjs`、`formal-frontend-customer-config-boundary.test.mjs`、priority audit 和 6 个 effective-session L1 场景。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/adminProfileSync.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,erp-effective-session-super-admin-system-diagnostic,erp-effective-session-direct-url-local-dev-diagnostic,erp-effective-session-sync-failure-local-dev-diagnostic,erp-effective-session-empty-pages-local-dev-diagnostic,erp-no-visible-menu-blocks-outlet,erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过。
- 下一步：继续按 goal 检查本地试用闭环中是否还有缺少固定验收入口的高频链路；如果转向真实浏览器写入或目标环境验证，需先补本地后端、演示账号密码或目标环境授权。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不改正式 runtime 行为、schema、RBAC、后端客户配置 usecase、真实客户数据、部署或 release evidence；该预设只证明本地前端投影合同和 `/__dev/testing` 复制入口可用。

## 2026-07-01 Dev Testing 前端错误提示预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `frontend-error-messages`，把正式页面、组件和岗位任务端用户可见错误提示边界测试收口为可复制入口；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设必须复制 `frontend-error-message-boundary.test.mjs`，避免后续前端改动只跑通用 lint/style 而漏掉错误提示不透传底层异常的守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/frontend-error-message-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过。
- 下一步：继续按 goal 检查本地试用闭环中其它高频风险入口是否仍缺少固定验收入口；涉及真实浏览器写入、目标环境或客户配置激活时仍需本地后端 / 演示账号密码 / 目标环境授权。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不改正式页面运行时、错误提示 helper、后端错误码、RBAC、schema、真实客户数据、部署或 release evidence；该预设只证明本地复制入口和现有错误提示边界测试可用。

## 2026-07-01 Dev Testing 业务动作与字段链路预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `business-action-field-boundaries`，把 Workflow 正式 UI 动作入口、Source Document 生命周期确认文案、销售订单字段策略、导出和打印边界的当前守卫收口为可复制入口；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设必须复制 `workflow-ui-action-boundary.test.mjs` 和 `sales-order-field-chain-boundary.test.mjs`。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过。
- 下一步：继续按 goal 检查本地试用 / 任务端 / 客户配置控制台是否还有缺少固定验收入口或本地静态守卫的高频链路；涉及真实后端写入或目标环境验证时需单独提供本地后端、演示账号密码或目标环境授权。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不改正式 runtime、Workflow usecase、Source Document usecase、销售订单字段 mapper、打印模板、RBAC、schema、真实客户数据、部署或 release evidence；该预设只证明本地边界测试入口可复制且当前守卫通过。

## 2026-07-01 Dev Testing 试用模拟数据预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `trial-simulated-data`，把试用模拟数据、业务事实模拟闭环和移动端 Workflow 模拟闭环三组现有测试收口为可复制入口；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设必须复制三条 simulated-only / no real import 边界测试。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/trial-simulated-data.test.mjs scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过。
- 下一步：继续按 goal 收口试用模拟环境的账号、菜单、任务端和后台业务页之间的可复制验收入口。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不执行 `--apply`、不导入真实客户数据、不写出货 / 库存 / 财务事实，也不证明目标环境发布或客户验收。

## 2026-07-01 Dev Testing MVP 本地闭环计划预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `mvp-local-closure`，把 MVP 主链路验收计划、默认 plan-only evidence 和带占位 ID 的 no-write report tools 命令收口为可复制入口；同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设不能被写成真实 E2E、真实客户验收或部署 smoke。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/mvp-closure.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure` 通过并只写本地 `output/**` plan-only evidence；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过。
- 下一步：
  - 继续按 goal 收口试用账号 / RBAC / 菜单投影和任务端真实浏览器验收入口之间的边界；如要运行 apply 或真实浏览器写入，必须具备本地后端与演示账号密码。
- 阻塞/风险：
  - 本组只改 dev-only 测试入口配置、静态守卫和 L1 断言；`mvp-closure` 仍是 plan-only / no-write evidence，不连接数据库、不调用后端、不替代领域测试、浏览器回归、目标环境 smoke 或客户验收。

## 2026-07-01 Dev Testing 试用账号 RBAC 预设同步
- 完成：在 `/__dev/testing` 固定复制预设中新增 `trial-account-rbac`，把试用账号 RBAC 只读校验、脚本语法检查和真实浏览器试用菜单 smoke 收口为可复制入口；命令明确要求本地后端和 `TRIAL_ACCOUNT_PASSWORD` 演示账号密码，并同步扩展 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing` L1 断言，锁住该预设不能被误写成 no-env 静态检查或真实客户导入。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过。
- 下一步：继续按 goal 收口本地试用账号、RBAC、菜单投影、岗位任务端和后台业务页之间的真实浏览器验收入口；如要执行真实登录 / RBAC / 浏览器 smoke，需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 dev-only 测试入口配置、静态守卫和 L1 断言，不改 schema、RBAC、后端 usecase、正式菜单、客户数据、部署或 release evidence；真实 `trial-account-rbac.mjs` 运行和 `smoke:trial-demo-browser` 未执行，因为当前轮没有提供本地演示账号密码。

## 2026-07-01 QA Fast 试用账号脚本语法守卫
- 完成：把 `scripts/qa/trial-account-rbac.mjs` 和 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 的无凭据 `node --check` 纳入 `scripts/qa/fast.sh`，并在 `trial-role-entry-docs.test.mjs` 中锁住快检必须引用这两个脚本；这样常规快检能发现试用账号真实 RBAC / 浏览器 smoke 入口的语法损坏，但不会在无密码环境误跑真实登录。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查本地试用账号、菜单投影、岗位任务端和后台业务页的可重复验收入口；如果要执行真实账号 RBAC 或浏览器 smoke，仍需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 QA 快检入口和静态守卫，不改账号 seed、RBAC、后端 usecase、前端运行时、schema、客户数据、部署或 release evidence；真实登录 / 浏览器 smoke 未执行。

## 2026-07-01 Trial Browser Smoke 账号覆盖静态守卫
- 完成：扩展 `trial-role-entry-docs.test.mjs`，把 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 纳入当前角色集合静态合同，锁住 9 个岗位角色都同时出现在桌面账号和岗位任务端账号清单中，并锁住 `demo_admin` 在岗位任务端走拒绝态提示。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影、岗位任务端和后台业务页之间的可重复验收入口；如要证明真实页面仍可登录和跳转，必须提供本地后端和演示账号密码后运行真实浏览器 smoke。
- 阻塞/风险：本组只补静态覆盖守卫，不改浏览器 smoke 行为、登录流程、RBAC、账号 seed、客户配置、schema、后端 usecase、客户数据、部署或 release evidence；真实浏览器 smoke 未执行。

## 2026-07-01 QA Strict 试用账号脚本语法守卫同步
- 完成：把 `scripts/qa/strict.sh` 与 `fast.sh` 对齐，严格 QA 同样执行 `scripts/qa/trial-account-rbac.mjs` 和 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 的无凭据 `node --check`；同步扩展 `trial-role-entry-docs.test.mjs`，锁住 fast / strict 两个 QA 入口都不能遗漏试用账号真实 RBAC 和浏览器 smoke 脚本语法守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查本地试用账号、菜单投影、岗位任务端和后台业务页的可重复验收入口；如要证明真实账号 / 真实浏览器路径，需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 QA 编排脚本和静态守卫，不执行完整 `strict.sh` 构建链路，不改账号 seed、RBAC、后端 usecase、前端运行时、schema、客户数据、部署或 release evidence；真实登录 / 浏览器 smoke 未执行。

## 2026-07-01 Scripts README 严格 QA 试用账号语法守卫口径同步
- 完成：同步 `scripts/README.md` 的 `strict.sh` 摘要，明确发版前严格 QA 已包含试用账号 RBAC / 浏览器 smoke 脚本语法守卫；扩展 `trial-role-entry-docs.test.mjs`，锁住 README、fast 和 strict 三处入口一致。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查本地试用账号、菜单投影、岗位任务端和后台业务页的可重复验收入口；如要执行真实登录 / RBAC / 浏览器 smoke，需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 README 口径和静态守卫，不执行真实登录、真实浏览器 smoke、完整 strict 构建链路，不改 RBAC、schema、后端 usecase、前端运行时、客户数据、部署或 release evidence。

## 2026-07-01 Scripts README Fast QA 试用账号语法守卫口径同步
- 完成：同步 `scripts/README.md` 的 `fast.sh` 摘要，明确日常快检也包含试用账号 RBAC / 浏览器 smoke 脚本语法守卫；扩展 `trial-role-entry-docs.test.mjs`，用 fast / strict 两条具体摘要片段锁住 README 与 QA 脚本一致。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影、岗位任务端和后台业务页之间是否还有可复制验收入口或文档口径缺口；真实登录 / RBAC / 浏览器 smoke 仍需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 README 口径和静态守卫，不执行真实登录、真实浏览器 smoke、完整 `fast.sh` / `strict.sh` 构建链路，不改 RBAC、schema、后端 usecase、前端运行时、客户数据、部署或 release evidence。

## 2026-07-01 Scripts README Fast QA 详细说明同步
- 完成：补齐 `scripts/README.md` 中 `fast.sh` 详细说明，明确试用账号真实 RBAC / 浏览器 smoke 入口在快检里只做 `node --check` 语法守卫、不触发真实登录；同步扩展 `trial-role-entry-docs.test.mjs` 锁住该详细说明，避免表格摘要和正文说明再次漂移。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影、岗位任务端和后台业务页之间是否还有可复制验收入口或文档口径缺口；真实登录 / RBAC / 浏览器 smoke 仍需要本地后端和演示账号密码。
- 阻塞/风险：本组只改 README 详细说明和静态守卫，不执行真实登录、真实浏览器 smoke、完整 `fast.sh` / `strict.sh` 构建链路，不改 RBAC、schema、后端 usecase、前端运行时、客户数据、部署或 release evidence。

## 2026-07-01 自动化测试策略试用账号 QA 边界同步
- 完成：同步 `docs/product/自动化测试策略.md` 的现有命令入口说明，明确 `fast.sh` / `strict.sh` 对试用账号真实 RBAC 与浏览器 smoke 脚本只做无凭据 `node --check` 语法守卫；扩展 `trial-role-entry-docs.test.mjs`，锁住测试策略必须说明真实登录 / 本地后端 / 演示账号密码的单独验证边界。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影、岗位任务端和后台业务页之间是否还有可复制验收入口或正式文档口径缺口；真实登录 / RBAC / 浏览器 smoke 仍需要本地后端和演示账号密码。
- 阻塞/风险：本组只改正式测试策略文档和静态守卫，不执行真实登录、真实浏览器 smoke、完整 `fast.sh` / `strict.sh` 构建链路，不改 RBAC、schema、后端 usecase、前端运行时、客户数据、部署或 release evidence。

## 2026-07-01 Trial Account RBAC 单角色边界守卫
- 完成：收紧 `scripts/qa/trial-account-rbac.mjs` 的账号形状校验，试用账号必须只有单一预期角色；岗位账号必须只有对应 `mobile.<role>.access`，`demo_admin` 不允许任何 mobile 权限，并继续拒绝 debug 权限、super admin 和 disabled 账号。新增 `trial-account-rbac.test.mjs` 做无后端单测，并接入 `fast.sh` / `strict.sh`；同步 `scripts/README.md`、`docs/product/自动化测试策略.md` 和 `trial-role-entry-docs.test.mjs`。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-account-rbac.test.mjs scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查真实账号登录、菜单投影和岗位任务端浏览器 smoke 的可执行前置；真实 `/rpc/auth` 登录与浏览器回归仍需要本地后端和演示账号密码。
- 阻塞/风险：本组只强化本地无后端 RBAC 检查形状和 QA 编排，不修改真实角色权限配置、账号 seed、后端 RBAC usecase、schema、客户数据、部署或 release evidence；真实登录 / 浏览器 smoke 未执行。

## 2026-07-01 Trial Browser Smoke 禁止菜单守卫
- 完成：强化 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 的桌面菜单断言，除 expected menu 和旧入口 / 客户隐藏菜单外，新增账号级禁止菜单：非 admin 试用账号不得看到权限管理，`demo_admin` 不得看到工作台、任务看板、业务看板、客户 / 供应商 / 销售 / 采购 / 打印 / 异常闭环等业务主入口。同步 `scripts/README.md` 和 `trial-role-entry-docs.test.mjs`，锁住该浏览器 smoke 的应见 / 不应见菜单边界。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/trial-account-rbac.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查真实账号登录、菜单投影和岗位任务端浏览器 smoke 的可执行前置；真实浏览器 smoke 仍需本地后端和演示账号密码后执行 `pnpm --dir web smoke:trial-demo-browser`。
- 阻塞/风险：本组只强化浏览器 smoke 断言和文档 / 静态守卫，不修改正式菜单配置、后端 RBAC、账号 seed、schema、客户数据、部署或 release evidence；未执行真实浏览器登录。

## 2026-07-01 Dev Testing 试用账号 RBAC 单测入口补齐
- 完成：补齐 `/__dev/testing` 的 `trial-account-rbac` 复制预设，在真实登录和浏览器 smoke 命令之前加入 `trial-account-rbac.test.mjs` 无后端 RBAC 形状单测；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住 dev-only 验收入口不能遗漏可本地执行的试用账号 RBAC 边界守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/trial-account-rbac.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`git diff --check` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；敏感词扫描只命中占位密码 env 名、测试 token 变量名和既有文档说明，未发现真实密钥。
- 下一步：继续按 goal 检查真实账号登录、菜单投影和岗位任务端浏览器 smoke 的可执行前置；具备本地后端和演示账号密码后再执行真实 `trial-account-rbac.mjs` 与 `pnpm --dir web smoke:trial-demo-browser`。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不修改正式菜单配置、后端 RBAC、账号 seed、schema、客户数据、部署或 release evidence；真实登录 / 浏览器 smoke 未执行。

## 2026-07-01 Mobile Workflow Browser Smoke URL 凭据拦截
- 完成：强化 `web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 的 URL 输入边界，`--base-url`、`--backend-url` 和 `MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL` 均拒绝包含 username / password 的 URL，避免试用岗位任务端真实浏览器 smoke 在 fetch、错误输出或成功摘要中携带可复用凭据。同步 `mobile-workflow-runtime-browser-smoke.test.mjs`，锁住凭据 URL 拒绝、health URL 同源检查和原有 simulated-only / Workflow-only 边界。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`git diff --check` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影和岗位任务端真实浏览器 smoke 的可执行前置；具备本地后端和演示账号密码后再执行 `pnpm --dir web smoke:mobile-workflow-runtime-browser`。
- 阻塞/风险：本组只改本地 / 试用模拟 smoke 的输入安全边界和无后端测试，不修改后端 RBAC、Workflow usecase、schema、真实任务数据、客户数据、部署或 release evidence；真实浏览器登录 / 写入未执行。

## 2026-07-01 Trial Smoke URL 凭据拦截统一
- 完成：将同一 URL 凭据拒绝边界补到 `scripts/qa/trial-account-rbac.mjs` 和 `web/scripts/trialDemoAccountBrowserSmoke.mjs`：试用账号 RBAC 的后端 URL、trial demo 浏览器 smoke 的前端 base URL 和后端 health URL 都不得包含 username / password。同步 `trial-account-rbac.test.mjs` 与 `trial-role-entry-docs.test.mjs`，锁住试用账号真实 RBAC、trial demo browser smoke 和 mobile workflow browser smoke 三类试用验收入口都拒绝 credentialed URL。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-account-rbac.test.mjs scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`git diff --check` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查试用账号、菜单投影、岗位任务端和后台业务页的真实浏览器验收入口；具备本地后端和演示账号密码后再执行真实登录 / 浏览器 smoke。
- 阻塞/风险：本组只改本地 / 试用模拟验收脚本的输入安全边界和无后端守卫，不修改账号 seed、正式 RBAC、后端 usecase、schema、客户数据、部署或 release evidence；真实登录 / 浏览器 smoke 未执行。

## 2026-07-01 Simulated Tool Backend URL 凭据拦截
- 完成：统一 `trial-simulated-data.mjs`、`operational-fact-simulated-closure.mjs` 和 `mobile-workflow-simulated-closure.mjs` 的 `--backend-url` 输入边界，拒绝包含 username / password 的 backend URL，避免 seed / fixture / simulated-only 本地写入工具在 JSON-RPC 请求、报告或错误输出中带出可复用凭据。同步三组无后端测试，锁住 trial simulated data、operational fact simulated closure 和 mobile workflow simulated closure 都保持 no-real-import / simulated-only 同时拒绝 credentialed backend URL。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-simulated-data.test.mjs scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-simulated-data.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/operational-fact-simulated-closure.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/qa/mobile-workflow-simulated-closure.mjs` 通过；`git diff --check` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查试用模拟数据、岗位任务端和后台业务页之间的本地可执行闭环；需要真实本地写入时仍必须显式提供本地后端、演示账号密码和对应 simulated confirm。
- 阻塞/风险：本组只改本地模拟工具的输入安全边界和无后端测试，不修改真实客户导入、后端 usecase、RBAC、schema、部署、release evidence 或业务事实语义；未执行 `--apply` 写入。

## 2026-07-01 Customer Import Execute Backend URL 凭据拦截
- 完成：强化 `scripts/import/customerImportExecute.mjs` 的 execute 后端 URL 输入边界，`--backend-url` / `CUSTOMER_IMPORT_BACKEND_URL` 均拒绝包含 username / password 的 URL，避免客户导入执行 loader 在 JSON-RPC 请求或错误路径中携带可复用凭据。同步 `customerImportExecute.test.mjs` reviewed execute 场景，并更新 `scripts/README.md` 的真实导入执行门禁说明。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/import/customerImportExecute.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check scripts/import/customerImportExecute.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：继续按 goal 检查客户配置包导入控制台、试用模拟数据和真实浏览器验收入口之间是否还有本地可验证的输入安全或文档口径缺口；真实导入仍必须另行评审并提供 reviewed approval、backup evidence、recovery plan、目标后端和显式确认。
- 阻塞/风险：本组只改导入执行 loader 的输入安全边界、无外部服务测试和脚本文档，不执行真实客户导入，不改导入映射、后端 usecase、RBAC、schema、客户数据、部署或 release evidence。

## 2026-07-01 Real Login Smoke URL 凭据拦截
- 完成：强化 `web/scripts/realLoginSmokeShared.mjs` 的真实登录 smoke URL 输入边界，`REAL_LOGIN_SMOKE_BASE_URL` 和 `REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL` 均拒绝包含 username / password 的 URL；采购合同、加工合同和采购入库真实写入浏览器脚本共享该 helper。新增 `realLoginSmokeShared.test.mjs` 无后端单测，并更新 `web/scripts/README.md` 的脚本安全边界。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/scripts/realLoginSmokeShared.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/scripts/realLoginSmokeShared.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/purchaseContractRealLoginSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/processingContractRealLoginSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：继续按 goal 检查真实浏览器验收入口和试用模拟工具是否还有本地可验证的输入安全缺口；具备本地后端、管理员账号和显式写入确认后，才能执行真实登录 smoke 或采购入库真实写入 e2e。
- 阻塞/风险：本组只改真实登录 smoke 共享 helper、无后端测试和脚本文档，不执行真实登录、不启动浏览器、不写数据库，不改后端 RBAC、usecase、schema、客户数据、部署或 release evidence。

## 2026-07-01 Real Login Smoke URL 边界纳入 QA 编排
- 完成：将 `web/scripts/realLoginSmokeShared.test.mjs` 纳入 `scripts/qa/fast.sh` 和 `scripts/qa/strict.sh`，确保日常快检和严格 QA 都会执行真实登录 smoke 共享 URL 凭据边界单测；同步 `scripts/README.md` 的 fast / strict 摘要、快检说明和 `trial-role-entry-docs.test.mjs` 静态守卫，明确该测试不触发真实登录。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs web/scripts/realLoginSmokeShared.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh && PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：继续按 goal 检查真实浏览器验收入口、试用账号和客户导入执行入口之间是否还有可纳入无后端 QA 的安全边界；真实登录 / 浏览器 / 写库仍需单独前置。
- 阻塞/风险：本组只改 QA 编排和脚本文档，不执行真实登录、不启动浏览器、不写数据库，不改后端 RBAC、usecase、schema、客户数据、部署或 release evidence。

## 2026-07-01 Dev Testing 真实登录 Smoke URL 边界预设
- 完成：在 `/__dev/testing` 常用复制预设中新增 `real-login-smoke-shared`，把 `web/scripts/realLoginSmokeShared.test.mjs` 暴露为可复制的本地无后端检查入口；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住该预设只证明 URL 凭据边界，不执行真实登录、不启动浏览器。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/scripts/realLoginSmokeShared.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查 `/__dev/testing`、试用账号、真实浏览器 smoke 和客户导入执行入口之间是否还有可本地复制的无写入验收缺口；真实登录 / 浏览器 / 写库仍需单独前置。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不修改正式菜单、RBAC、账号 seed、后端 usecase、schema、客户数据、部署或 release evidence；未执行真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 Dev Testing 客户导入 Tooling 预设
- 完成：在 `/__dev/testing` 常用复制预设中新增 `customer-import-tooling`，把 manifest check、source extract、snapshot freeze、dry-run 和 execute loader 的无后端测试组合成当前维护入口；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住该预设不执行真实客户导入、不连接目标环境。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/import/customerSourceManifestCheck.test.mjs scripts/import/customerSourceExtract.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs scripts/import/customerImportDryRun.test.mjs scripts/import/customerImportExecute.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查客户配置包导入控制台、试用模拟数据、真实浏览器 smoke 和 `/__dev/testing` 之间是否还有当前维护但未暴露的无写入验收入口；真实客户导入仍必须另行评审并提供目标环境、备份、reviewed recovery plan 和显式确认。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不修改导入映射、后端 usecase、RBAC、schema、客户数据、部署或 release evidence；未执行真实客户导入、真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 Dev Testing 客户配置包 Runtime 预设
- 完成：在 `/__dev/testing` 常用复制预设中新增 `customer-config-package-runtime`，把客户配置包结构检查、demo / yoyoosun validate / compile、runtime manifest validate / compile 和对应无后端单测收成当前维护入口；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住该预设只做本地检查，不发布、不激活、不调用后端。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer demo && PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer demo --mode compile && PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer yoyoosun && PATH=/usr/local/bin:$PATH node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile && PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer demo && PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode compile && PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun && PATH=/usr/local/bin:$PATH node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查客户配置包导入控制台、字段策略、菜单投影、试用账号和真实浏览器 smoke 之间是否还有当前维护但未暴露的无写入验收入口；真实发布 / 激活仍需 release evidence、目标环境和显式确认。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不修改 customer_config 后端 usecase、RBAC、schema、客户数据、部署、release evidence 或正式菜单；未执行发布、激活、后端调用、真实客户导入、真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 Dev Testing 试用模拟 Report-only 预设
- 完成：扩展 `/__dev/testing` 的 `trial-simulated-data` 常用复制预设，在原有三组无后端单测外补充试用模拟数据和移动端 workflow 的可直接运行 report-only 命令，并保留业务事实模拟闭环的 ID 占位 report-only 命令；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，锁住该预设仍是 simulated-only / no real import，report-only 不连接后端、不写库。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/trial-simulated-data.test.mjs scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --out output/customers/yoyoosun/trial-simulated-data-dev-testing-report` 通过；`PATH=/usr/local/bin:$PATH node scripts/qa/mobile-workflow-simulated-closure.mjs --run-id DEV-TESTING-REPORT --out output/customers/yoyoosun/mobile-workflow-simulated-closure-dev-testing-report` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查试用账号、seed / fixture、岗位任务端、客户配置包导入控制台和 `/__dev/testing` 之间是否还有当前维护但未暴露的本地无写入验收入口；业务事实模拟闭环 report-only 仍需先提供本地 product / unit / warehouse ID。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不执行 `--apply`、不调用后端、不写数据库、不修改 seed、RBAC、schema、后端 usecase、客户数据、部署或 release evidence；未执行真实浏览器 smoke。

## 2026-07-01 Dev Testing 原型查看器预设
- 完成：在 `/__dev/testing` 固定复制预设中新增 `dev-prototype-registry`，把 `docs/product/prototypes` 资产登记、`/__dev/prototypes` 查看器和 dev hub 路由的本地验证命令收口为可复制入口；同步 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing-dark-desktop` L1 断言，锁住原型入口只证明 dev-only 查看器和本地资产登记，不晋级 Current、不改正式菜单。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devPrototypes.test.mjs web/src/erp/config/devHub.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-prototypes-dark-desktop STYLE_L1_PORT=5236 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查 `/__dev` 其它 dev-only 页面、正式帮助入口和本地试用验收命令是否还有当前维护但未暴露的入口；若改原型资产状态或正式页面承诺，需要同步 prototype README / registry / 文档口径。
- 阻塞/风险：本组只改 dev-only 测试入口、静态守卫和 L1 断言，不修改原型资产状态、正式菜单、seedData、RBAC、schema、后端 usecase、客户数据、部署或 release evidence；未执行真实登录、真实浏览器写入或数据库写入。

## 2026-07-01 Dev Testing 文档治理与台账查看器预设
- 完成：在 `/__dev/testing` 固定复制预设中新增 `dev-doc-governance-ledger`，把 `/__dev/docs`、`/__dev/governance`、`/__dev/capability-ledger` 三类 dev-only 只读查看器的本地验证命令收口为可复制入口；同步 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing-dark-desktop` L1 断言，锁住该入口只证明 Markdown 查看器、项目治理地图和能力台账可视化，不改正式文档真源、不进入正式菜单。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devDocs.test.mjs web/src/erp/config/devGovernance.test.mjs web/src/erp/config/devCapabilityLedger.test.mjs web/src/erp/config/devHub.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-hub-dark-desktop,dev-docs-dark-desktop,dev-governance-dark-desktop STYLE_L1_PORT=5237 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查 `/__dev/testing` 之外的试用闭环入口是否还缺少与当前真源一致的无写入验收路径；如果后续改变正式文档真源、能力台账或客户交付矩阵，需要同步对应 Markdown、文档清单和 dev-only 查看器测试。
- 阻塞/风险：本组只改 dev-only 测试入口、静态守卫和 L1 断言，不修改正式 Markdown 内容、文档清单、正式菜单、RBAC、schema、后端 usecase、客户数据、部署或 release evidence；未执行真实登录、真实浏览器写入或数据库写入。

## 2026-07-01 Dev Testing 客户配置打印模板字段测试入口
- 完成：把 `printTemplates.test.mjs` 固定加入 `/__dev/testing` 的 `customer-config-dev-console` 预设，使客户配置控制台已有的打印模板字段只读预检、客户抬头 / 签章 / 固定文案边界和中性样例守卫能随控制台验证一起复制；同步 `devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`，防止后续触达打印字段时遗漏该本地测试入口。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devCustomerConfig.test.mjs web/src/erp/config/printTemplates.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-customer-config-dark-desktop STYLE_L1_PORT=5238 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查打印字段链路、客户配置控制台和业务页面之间是否还有可本地验证但未固定暴露的入口；如后续接通销售订单打印 mapper，需另行补字段真源、页面采集 / 回显、导出 / 打印和历史缺值测试。
- 阻塞/风险：本组只改 dev-only 测试复制预设和静态守卫，不修改打印模板实现、销售订单打印接入、客户配置 runtime、后端 usecase、RBAC、schema、客户数据、部署或 release evidence；未执行真实打印、真实登录或数据库写入。

## 2026-07-01 Dev Testing 角色菜单与入口真源预设
- 完成：在 `/__dev/testing` 固定复制预设中新增 `frontend-role-menu-seed-contracts`，把 `entryConfig.test.mjs`、`menuPermissions.test.mjs`、`seedData.test.mjs` 和 `workflowStatus.test.mjs` 收口为角色菜单、岗位任务端入口、seedData 与前端业务状态本地配置合同入口；同步 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `dev-testing-dark-desktop` L1 断言，明确该入口不替代后端 RBAC、customer config active revision 或真实登录。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs web/src/erp/config/workflowStatus.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5239 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：继续按 goal 检查角色菜单、客户配置投影、试用账号和真实浏览器验收之间是否还有本地可固定的无写入验证入口；若后续修改正式后端 RBAC 或 active customer config revision，需要另行补后端 / runtime 读回验证。
- 阻塞/风险：本组只改 dev-only 测试复制预设、静态守卫和 L1 断言，不修改正式菜单、seedData、后端 RBAC、customer config runtime、schema、客户数据、部署或 release evidence；未执行真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 Fast / Strict 角色菜单配置合同纳入
- 完成：把 `entryConfig.test.mjs`、`menuPermissions.test.mjs`、`seedData.test.mjs` 和 `workflowStatus.test.mjs` 纳入 `scripts/qa/fast.sh` 与 `scripts/qa/strict.sh` 的固定门禁，并同步 `docs/product/自动化测试策略.md`、`scripts/README.md` 和 `trial-role-entry-docs.test.mjs`，使角色菜单、岗位任务端入口、seedData 和前端状态配置不只停留在 `/__dev/testing` 复制预设或 `pnpm test` 里。
- 验证：`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh && PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs web/src/erp/config/workflowStatus.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过，输出确认新增“角色菜单与入口配置合同测试”段实际执行。
- 下一步：继续按 goal 检查真实登录、客户配置 active revision 读回和岗位任务端浏览器 smoke 的本地前置；如果后续触达后端 RBAC 或 customer_config runtime，需要另行补后端 / JSON-RPC / 浏览器读回验证。
- 阻塞/风险：本组只改 QA 编排、测试策略文档和静态守卫，不修改角色菜单运行时、seedData 内容、后端 RBAC、customer config runtime、schema、客户数据、部署或 release evidence；未执行真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 Fast / Strict 开发入口配置合同纳入
- 完成：把 `devHub.test.mjs`、`devTesting.test.mjs`、`devDocs.test.mjs`、`devGovernance.test.mjs`、`devPrototypes.test.mjs`、`devCapabilityLedger.test.mjs`、`devCustomerConfig.test.mjs` 和 `printTemplates.test.mjs` 纳入 `scripts/qa/fast.sh` 与 `scripts/qa/strict.sh` 固定门禁；同步 `docs/product/自动化测试策略.md`、`scripts/README.md` 和 `trial-role-entry-docs.test.mjs`，让 `/__dev` 导航、测试入口、文档 / 治理 / 原型 / 台账查看器、客户配置控制台和打印模板字段预检不只停留在 `pnpm test` 或手动复制预设里。
- 验证：`PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh && PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devHub.test.mjs web/src/erp/config/devTesting.test.mjs web/src/erp/config/devDocs.test.mjs web/src/erp/config/devGovernance.test.mjs web/src/erp/config/devPrototypes.test.mjs web/src/erp/config/devCapabilityLedger.test.mjs web/src/erp/config/devCustomerConfig.test.mjs web/src/erp/config/printTemplates.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/docs-inventory.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过，输出确认新增“开发入口配置合同测试”段实际执行；`git diff --check` 通过。
- 下一步：继续按 goal 检查客户配置 active revision 读回、试用账号真实 RBAC 和岗位任务端真实浏览器 smoke 的本地前置；若需要真实账号密码或目标环境写入，再按暂停条件停下。
- 阻塞/风险：本组只改 QA 编排、测试策略文档和静态守卫，不修改 `/__dev` 运行时页面行为、正式菜单、后端 RBAC、customer_config runtime、schema、客户数据、部署或 release evidence；未执行真实登录、浏览器 smoke 或数据库写入。

## 2026-07-01 试用账号与浏览器 Smoke 输入模板
- 完成：为 `scripts/qa/trial-account-rbac.mjs` 增加 `--print-input-template` 只读模式，输出试用账号 RBAC 真实核对所需 secret / optional 输入、10 个 demo 账号角色期望和后续真实命令；为 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 增加同名模板模式，输出桌面菜单、岗位任务端、后端健康检查和浏览器 smoke 所需输入。同步 `/__dev/testing` 的 `trial-account-rbac` 预设、`scripts/README.md`、`docs/product/自动化测试策略.md`、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `trial-role-entry-docs.test.mjs`，让缺少本地演示账号密码时也能先拿到 no-write 前置清单。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-account-rbac.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/trial-role-entry-docs.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --print-input-template` 通过，输出 `callsBackend=false`、`writesDatabase=false`；`PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template` 通过，输出 `callsBackend=false`、`startsBrowser=false`、`writesDatabase=false`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5240 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查客户配置 active revision 读回、试用账号真实 RBAC 和岗位任务端真实浏览器 smoke；具备本地后端和演示账号密码后再运行真实登录 / 浏览器 smoke。
- 阻塞/风险：本组只改输入模板、dev-only 复制预设、测试和文档口径，不创建账号、不改密码、不登录、不调用后端、不启动浏览器、不写数据库，不修改正式菜单、后端 RBAC、customer_config runtime、schema、客户数据、部署或 release evidence。

## 2026-07-01 移动端 Workflow Smoke 输入模板
- 完成：为 `web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 增加 `--print-input-template` 只读模式，输出移动端 workflow 真实浏览器回归所需密码、后端 / 前端地址、runId、模拟任务计划和后续真实命令；同步 `/__dev/testing` 的 `mobile-workflow-smoke` 复制预设、`scripts/README.md`、`web/README.md`、`web/scripts/README.md`、`docs/product/自动化测试策略.md`、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `mobile-workflow-runtime-browser-smoke.test.mjs`，避免缺少本地后端或演示密码时把占位命令误当作已验证证据。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template` 通过，输出 `callsBackend=false`、`startsBrowser=false`、`writesDatabase=false`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5241 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查客户配置 active revision 读回和真实后端 / 浏览器 smoke 前置；具备本地后端、前端 runtime 和演示账号密码后再运行 `pnpm --dir web smoke:mobile-workflow-runtime-browser` 证明老板任务阻塞 / 退回 / 完成反馈、仓库任务跨角色催办和内部提醒线索真实页面链路。
- 阻塞/风险：本组只改输入模板、dev-only 复制预设、静态守卫和文档口径；未登录、未调用后端、未创建 `simulated_only` workflow 任务、未启动浏览器、未写数据库，不修改正式菜单、后端 RBAC、customer_config runtime、schema、真实客户数据、部署或 release evidence。

## 2026-07-01 Customer Config Active Revision 读回输入模板
- 完成：为 `scripts/deploy/customer-config-release-execute.mjs` 增加 `--print-input-template` 只读模式，输出客户配置 publish / activate / rollback / `get_effective_session` 读回所需 manifest、evidence、后端 URL、管理员凭据、确认短语和后续 readiness 命令；同步 `/__dev/testing` 的 `customer-config-package-runtime` 预设、`scripts/README.md`、`docs/product/自动化测试策略.md`、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs` 和 `customer-config-release-execute.test.mjs`，让缺少目标后端或凭据时也能先拿到 active revision 读回前置清单。
- 验证：`PATH=/usr/local/bin:$PATH node --check scripts/deploy/customer-config-release-execute.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/deploy/customer-config-release-execute.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node scripts/deploy/customer-config-release-execute.mjs --print-input-template` 通过，输出 `callsBackend=false`、`writesDatabase=false`、`readsManifest=false`、`validatesReleaseEvidence=false`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5242 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查客户配置 active revision 目标读回、试用账号真实 RBAC 和本地业务闭环；具备目标后端、管理员凭据、release evidence 和显式确认后，才能执行 publish / activate / rollback 或 `get_effective_session` 读回。
- 阻塞/风险：本组只改输入模板、dev-only 复制预设、静态守卫和文档口径；未读取 manifest、未检查 release evidence、未调用后端、未 publish、未 activate、未 rollback、未调用 `get_effective_session`、未写数据库，不修改后端 RBAC、schema、真实客户数据、部署或 release evidence 证据形状。

## 2026-07-01 Real Login Smoke 共享输入模板
- 完成：为 `web/scripts/realLoginSmokeShared.mjs` 增加 `--print-input-template` 只读模式，输出真实登录 smoke 共享前置：后端健康检查 URL、可选前端 URL、本地管理员凭据来源、采购合同 / 加工合同 / 岗位任务端认证回跳和采购入库真实写入浏览器 e2e 命令；同步 `/__dev/testing` 的 `real-login-smoke-shared` 预设、`realLoginSmokeShared.test.mjs`、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs`、`scripts/README.md`、`web/scripts/README.md`、`web/README.md` 和 `docs/product/自动化测试策略.md`，把“输入模板不等于真实登录证据”和“采购入库 e2e 会按自身边界写本地 / 开发库模拟事实”写清。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/realLoginSmokeShared.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/scripts/realLoginSmokeShared.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --print-input-template` 通过，输出 `callsBackend=false`、`startsBrowser=false`、`writesDatabase=false`、`readsLocalConfig=false`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5243 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查本地后端、试用账号真实 RBAC、岗位任务端真实浏览器 smoke 和客户配置 active revision 读回；具备本地后端和真实开发账号后，才能运行 `smoke:purchase-contract-real-login`、`smoke:processing-contract-real-login`、`smoke:mobile-auth-login-route` 或采购入库真实写入浏览器 e2e。
- 阻塞/风险：本组只改共享输入模板、dev-only 复制预设、测试和文档口径；未读取本地配置、未校验账号、未调用后端 health/auth、未启动 Vite、未启动 Playwright、未登录、未写数据库，不修改后端 RBAC、schema、业务事实、客户数据、部署或 release evidence。

## 2026-07-01 Mobile Auth Route Smoke 输入模板
- 完成：为 `web/scripts/mobileAuthLoginRouteSmoke.mjs` 增加 `--print-input-template` 只读模式和 direct-run guard，输出岗位任务端认证回跳 smoke 的 9 个岗位、phone / iPad 视口、可选环境变量和真实回归命令；同步 `mobileAuthLoginRouteSmoke.test.mjs`、`fast.sh`、`strict.sh`、`/__dev/testing` 的 `real-login-smoke-shared` 预设、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs`、`scripts/README.md`、`web/scripts/README.md`、`web/README.md` 和 `docs/product/自动化测试策略.md`，并让 `MOBILE_AUTH_SMOKE_BASE_URL` 拒绝 URL 账号密码。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileAuthLoginRouteSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/mobileAuthLoginRouteSmoke.test.mjs && PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh && PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --test web/scripts/mobileAuthLoginRouteSmoke.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template` 通过，输出 `callsBackend=false`、`startsBrowser=false`、`startsDevServer=false`、`writesDatabase=false`、`usesMockRpc=true`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5244 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 检查真实后端试用账号 RBAC、岗位任务端真实 workflow 浏览器 smoke、客户配置 active revision 读回和本地业务闭环；具备真实本地后端、演示账号密码或显式写入确认后，才能运行真实登录或真实写入类 smoke。
- 阻塞/风险：本组只改输入模板、mock smoke 边界、dev-only 复制预设、静态守卫和文档口径；未启动 Vite、未启动 Playwright、未调用真实后端、未登录真实账号、未写数据库，不修改后端 RBAC、schema、业务事实、客户数据、部署或 release evidence。

## 2026-07-01 Purchase Receipt Browser E2E 输入模板
- 完成：为 `web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 增加 `--print-input-template` 只读模式、direct-run guard 和延迟 runtime 创建，输出采购入库页面真实写入 e2e 的管理员凭据来源、`PR-BROWSER-*` 持久测试记录边界、localhost / 外部开发环境防呆、`--accept-persistent-test-data`、`--seed-core-demo` 和真实命令；新增 `purchaseReceiptRealWriteBrowserE2E.test.mjs`，并同步 `realLoginSmokeShared.mjs`、`fast.sh`、`strict.sh`、`/__dev/testing` 的 `real-login-smoke-shared` 预设、`devTesting.test.mjs`、`dev-entry-boundary.test.mjs`、`scripts/README.md`、`web/scripts/README.md`、`web/README.md` 和 `docs/product/自动化测试策略.md`。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs && PATH=/usr/local/bin:$PATH bash -n scripts/qa/fast.sh && PATH=/usr/local/bin:$PATH bash -n scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH node --test web/scripts/purchaseReceiptRealWriteBrowserE2E.test.mjs web/scripts/realLoginSmokeShared.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 通过，输出 `writesDatabase=false`、`callsBackend=false`、`startsBrowser=false`、`startsDevServer=false`、`downstreamWritesDatabase=true`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=5245 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过并实际执行新增“采购入库真实写入浏览器 e2e 边界测试”；`rg` 锚点扫描通过。
- 下一步：继续按 goal 检查真实后端试用账号 RBAC、岗位任务端真实 workflow 浏览器 smoke、客户配置 active revision 读回和本地业务闭环；下次更新 `progress.md` 前应先归档，因为本次追加后文件已超过 80KB。
- 阻塞/风险：本组只改输入模板、真实写入脚本防误跑边界、dev-only 复制预设、静态守卫和文档口径；未启动 Vite、未启动 Playwright、未调用后端、未登录、未创建 / 过账 / 取消采购入库单、未写数据库，不修改后端 RBAC、schema、purchase usecase、库存事实逻辑、客户数据、部署或 release evidence。
