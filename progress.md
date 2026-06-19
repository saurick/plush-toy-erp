# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-17-before-related-actions.md`：写入关联按钮前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。
- `docs/archive/progress-2026-06-18-before-formal-preview-action-cleanup.md`：清理 formal-shell 预览页假动作前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。
- `docs/archive/progress-2026-06-19-before-shipping-release-task-filter.md`：本轮出货放行 task_group 过滤收口前，因 `progress.md` 达到 396 行 / 81338 字节超过 80KB 阈值而归档的完整过程流水快照。

## 当前活跃事项

- 当前工作区仍可能存在非本轮并行改动；每轮收口必须按本轮允许路径精确说明和验证，不得回退或整理非本轮现场。
- 已接正式 V1 的销售订单、采购订单、采购入库、来料质检、库存台账、出货 / 预留和财务事实页面应保持 Workflow / Fact 边界：关联入口只提供上下文跳转或已有打印 / 生成动作，不代表下游事实自动过账。
- `/erp/warehouse/shipping-release` 仍是 formal-shell 字段预览壳加 Workflow 协同入口；它只处理 `source_type=shipping-release + task_group=shipment_release` 的协同任务，不代表 shipment source document 或 `SHIPPED` fact。
- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；后续拆分应继续保持 Workflow 任务完成不写库存、出货、财务或付款事实。

## 2026-06-19 出货放行任务过滤与刷新状态收口

- 完成：按 `plush-page-design-governance` 复核截图中的缺口，确认旧评审对 L1 场景路径的判断已过期；当前场景已拆到 `web/scripts/style-l1/businessFormalScenarios.mjs`，由 `web/scripts/styleL1.mjs` 入口组装执行。
- 完成：将 Workflow `list_tasks` 主路径补齐 `task_group` 过滤：`WorkflowTaskFilter`、JSON-RPC 参数映射、repo Ent 查询和测试都支持 `source_type + task_group` 组合过滤；未改 Ent schema、migration、RBAC 码位或 Workflow / Fact 状态规则。
- 完成：`/erp/warehouse/shipping-release` 页面读取任务时传入 `task_group=shipment_release`，并在前端防御性过滤非 `shipment_release` 任务；无 `workflow.task.read` 或加载失败时不再显示“出货放行协同任务已刷新”，避免无权限 / 失败态被误解为刷新成功。
- 完成：L1 mock 的 `list_tasks` 支持 `task_group`，`business-formal-module-shells-desktop` 同时创建同 `source_type=shipping-release` 的非放行任务并断言不出现在出货放行页协同面板；继续断言出货放行页面打开、展开本页协同和刷新提示正确。
- 完成：按 `plush-docs-governance` 将当前真源与 `web/README.md` 的出货放行口径收窄为 `source_type=shipping-release + task_group=shipment_release`；新增 archive 快照并同步 `docs/文档清单.md`。`AGENTS.md` 只读未改，不新增 frontmatter、metadata 或 Mermaid。
- 验证：归档前 `progress.md` 为 396 行、81338 字节，已复制到 `docs/archive/progress-2026-06-19-before-shipping-release-task-filter.md` 后收缩当前文件；`gofmt` 已覆盖本轮 Go 文件；`node --check` 覆盖 `businessFormalScenarios.mjs`、`factRpcMocks.mjs`、`scenarios.mjs` 通过；`go test ./internal/biz -run 'TestWorkflowUsecase_ListTasks' -count=1`、`go test ./internal/data -run 'TestWorkflowRepo_(GetWorkflowTaskByID|ListWorkflowTasksFiltersByTaskGroup)' -count=1`、`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowListTasksPassesTaskGroupFilter|TestJsonrpcDispatcher_WorkflowUrgeTaskRecordsEventIntent' -count=1` 通过；`pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；定向 ESLint 覆盖本轮前端页面、测试和 L1 脚本通过；`STYLE_L1_PORT=4351 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景。
- 下一步：若继续推进出货放行正式化，需要单独评审 shipment source / fact usecase、API、RBAC、审计、导出 / 删除 / 回收站语义和更大范围 L1；不能把当前 Workflow 协同入口当作真实出货事实完成。
- 阻塞/风险：本轮未跑全量 `pnpm --dir web test`、全量 `pnpm --dir web css`、全量 `go test ./...` 或全量 `style:l1`；未改 schema、migration、RBAC 码位、菜单、客户配置、部署、原型状态、库存 / 出货 / 财务事实或 `WorkflowUsecase` 的第七条状态规则。

## 2026-06-19 yoyoosun 客户菜单显隐收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 收口“入口太重”问题的客户显隐层，只改 yoyoosun 客户菜单配置和正式文档口径；`config/customers/yoyoosun/menuConfig.mjs` 通过 `hiddenItemKeys` 隐藏 `business-dashboard`、`exception-flow`、`production-scheduling`、`production-exceptions` 和 `shipping-release`，保留 `工作台`、`任务看板` 和已接入的正式 / 收窄 V1 业务入口。
- 完成：更新 `seedData.test.mjs`，断言 yoyoosun 仍可进入 `任务看板`、`生产进度`、`出库管理`、`出货单`，且不再显示业务看板、异常闭环、生产排程、生产异常和出货放行；实际菜单检查显示默认菜单 13 组 / 29 项，yoyoosun 菜单 13 组 / 23 项。
- 完成：同步 `docs/product/正式菜单运行时实施拆分清单.md`、`docs/product/正式产品入口与菜单配置计划.md`、`docs/product/菜单映射评审表.md`、`docs/当前真源与交接顺序.md`、yoyoosun 试用培训说明、账号角色菜单核对清单和客户差异台账，明确客户侧入口隐藏不改变产品默认菜单、后端 RBAC、路由、Workflow / Fact usecase、schema 或 migration；任务替代路径为 `任务看板`、岗位任务端和业务页协同入口。
- 验证：`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs src/erp/config/devCustomerConfig.test.mjs` 通过，24 项；`pnpm --dir web lint` 通过；实际菜单生成脚本确认 yoyoosun 隐藏目标入口；`git diff --check -- config/customers/yoyoosun/menuConfig.mjs web/src/erp/config/seedData.test.mjs docs/product/正式菜单运行时实施拆分清单.md docs/product/正式产品入口与菜单配置计划.md docs/product/菜单映射评审表.md docs/当前真源与交接顺序.md docs/customers/yoyoosun/试用账号角色菜单核对清单.md docs/customers/yoyoosun/试用培训说明.md docs/customers/yoyoosun/客户差异台账.md` 通过。
- 下一步：若继续治理正式菜单，应按具体页面做单页闭环；优先检查库存台账、财务事实页和 formal-shell 是否仍有 tab、动作或按钮误导事实写入。
- 阻塞/风险：本轮未改 Product Core、默认菜单、后端内置菜单、RBAC 权限码、路由、页面结构、schema、migration、Workflow / Fact usecase 或原型状态；未跑浏览器 L1、全量 `pnpm --dir web test`、全量 `pnpm --dir web lint`、全量 `pnpm --dir web css` 或 Go 测试，因为本轮只触达客户菜单配置、菜单单测和正式文档口径。

## 2026-06-19 page/docs governance 编号话术收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将正式菜单运行时实施清单从编号式任务组织改为“已完成检查项 / 当前剩余问题 / 下一步单页闭环”；同步清理 yoyoosun 试用培训说明、客户差异台账和本文件中的编号话术。
- 完成：保留真实业务边界：formal-shell 仍只剩生产排程、生产异常和出货放行；出货放行是 Workflow 协同入口，不等于 `SHIPPED`；菜单隐藏不是 RBAC / usecase 安全边界；页面存在不等于库存、出货或财务事实闭环完成。
- 下一步：库存台账单页检查余额 / lot / 流水 tab 和动作；财务事实页单页检查应收 / 应付 / 发票 / 对账是否误导完整核销、税控或总账；formal-shell 单页检查创建、导出、删除、打印和事实写入提示是否仍足够克制。
- 阻塞/风险：本轮是 docs-only 口径清理，未改 schema、migration、RBAC、route、Workflow / Fact usecase、客户配置、部署或 runtime；库存 lot 相关表述只保留业务语义，不作为任务组织方式。

## 2026-06-19 列顺序弹窗保存时机收口

- 完成：按 `plush-page-design-governance` 复核截图问题，确认旧实现里列顺序面板的“上移 / 下移 / 移到最前 / 移到最后”直接调用页面 `persistColumnOrder`，会立即写入 localStorage 并请求 `set_erp_column_order`；“完成”按钮实际上只是关闭弹窗，和用户预期不一致。
- 完成：将共享 `ColumnOrderModal` 改为面板内草稿调整：移动按钮和“恢复默认”只改弹窗 draft order；点击“完成”后才调用原保存回调并关闭；关闭 X 会放弃未保存草稿。表头列菜单的快捷调整仍保留直接保存语义，因为它没有二次确认面板。
- 完成：移除各页面传入的旧 `onReset` 保存回调，避免后续维护者误判“恢复默认”仍是即时保存；销售订单、采购订单、BOM、主数据、来料质检、委外订单和 formal-shell 共享弹窗都走同一组件语义。
- 完成：更新 `style:l1` 列顺序回归，断言面板移动后完成前不写本地缓存，点击完成后才写入本地缓存并可重新打开读取保存后的边界列；同时修正 AntD 完成按钮文本含空白时的定位。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/components/business-list/ColumnOrderModal.jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1PurchaseOrdersPage.jsx src/erp/pages/BOMVersionsPage.jsx src/erp/pages/V1MasterDataPage.jsx src/erp/pages/V1QualityInspectionsPage.jsx src/erp/pages/V1OutsourcingOrdersPage.jsx` 通过；`pnpm --dir web css` 通过；`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4178 STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm --dir web style:l1` 通过，1 个场景；`git diff --check` 覆盖本轮文件通过。
- 下一步：若后续继续治理列顺序偏好，可单独评审是否需要“取消”按钮、保存失败时是否保持弹窗不关闭，以及表头快捷菜单是否需要提示“已直接保存”。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或列顺序后端真源；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 曾在列顺序步骤后进入其它 Drawer 流程失败，失败点是 Drawer mask 拦截“刷新当前页”并伴随重试端口占用，不属于本轮列顺序保存时机改动。

## 2026-06-19 出货放行边界态 L1 补强

- 完成：继续按 `plush-page-design-governance` 和 `plush-docs-governance` 补出货放行 formal-shell 边界态；共享 `CollaborationTaskPanel` 在当前任务列表刷新后如果处理抽屉里的任务已不在 `tasks / selectedTasks` 中，会自动关闭抽屉并清空动作状态，避免 stale Workflow 任务继续被处理。
- 完成：`business-formal-module-shells-desktop` 追加出货放行请求失败和 stale 任务回归：`list_tasks` 失败时显示“加载出货放行协同任务失败”并清空旧任务；任务抽屉打开后若刷新返回空任务集，抽屉关闭且可见任务项不再保留旧任务。
- 完成：同步修正 L1 列顺序弹窗测试等待层；表头快捷菜单仍等待 `set_erp_column_order` 响应，弹窗内部移动保持 draft，点击“完成”后用 DOM 断言确认按钮存在且可用再触发保存，前一条记录中的 formal-shell L1 失败已复跑通过。
- 验证：追加前 `progress.md` 为 56 行、11412 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs`、`node --check web/scripts/style-l1/businessFormalScenarios.mjs` 通过；定向 ESLint 覆盖 `BusinessListLayout.jsx`、`FormalBusinessModulePage.jsx`、`styleL1.mjs`、`businessFormalScenarios.mjs`、`factRpcMocks.mjs` 和 `businessModuleNavigation.test.mjs` 通过；`pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；Go 定向 `workflow` biz/data/service 测试通过；`STYLE_L1_PORT=4366 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`git diff --check` 通过。
- 下一步：剩余高优先级仍是 disabled 用户 / 非管理员 / 无角色权限的浏览器级边界态，以及 formal-shell 在更小移动暗色组合下的错误提示对比度；这些应单独按真实 auth/RBAC mock 做回归，不把出货放行升级为 `SHIPPED`。
- 阻塞/风险：本轮未跑全量 `pnpm --dir web test`、全量 `pnpm --dir web css`、全量 `go test ./...` 或全量 `style:l1`；未改 schema、migration、RBAC 码位、菜单、客户配置、部署、Shipment / Inventory / Finance fact usecase 或 `WorkflowUsecase` 第七条状态规则。

## 2026-06-19 任务看板当前选中任务降级

- 完成：按 `plush-page-design-governance` 将 `/erp/task-board` 顶部“当前任务”从自动展示筛选结果第一条改为“当前选中任务”；未显式选择任务时显示“从下方任务卡选择一条任务”，避免页面替用户指定当前处理对象。
- 完成：任务泳道卡片支持点击 / 聚焦选中，并增加选中高亮；顶部快速处理区仍保留 `处理完成`、`标记阻塞`、`查看上下文` 和 `关联对象` 等 Workflow 动作入口，只服务当前页显式选中的协同任务。
- 完成：同步补 `style:l1` 任务看板回归，断言默认空态、选中任务卡后顶部快速处理区出现目标任务，并覆盖桌面、暗色宽屏和移动任务看板场景；原型索引只把任务中心样板口径从“当前任务”同步为“当前选中任务”，仍保持 To Implement。
- 验证：追加前 `progress.md` 为 65 行、13695 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .jsx src/erp/pages/DashboardPage.jsx` 通过；`pnpm --dir web css` 通过；`node --check web/scripts/style-l1/scenarios.mjs` 通过；`STYLE_L1_PORT=4369 STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-dark-wide-desktop,erp-task-board-mobile pnpm --dir web style:l1` 通过，3 个场景；限定路径 `git diff --check` 通过。
- 下一步：如继续治理看板中心，优先检查任务看板指标卡文案、泳道任务卡按钮密度和异常闭环入口归属；若要改菜单归属需单独做菜单 / RBAC / seed 评审。
- 阻塞/风险：本轮未改 schema、migration、RBAC、正式菜单、客户配置、WorkflowUsecase、Shipment / Inventory / Finance fact usecase、部署或原型状态；未跑全量 `pnpm --dir web test`、全量 `pnpm --dir web lint` 或全量 `style:l1`。

## 2026-06-19 任务看板待办命名收口

- 完成：按 `plush-page-design-governance` 复核 `/erp/task-board` 当前页面语义，将四泳道里的“本页待办”改为“可推进任务”，描述明确为当前筛选下待处理、可执行和处理中任务；顶部关键筛选同步从“待我处理”改为“可推进任务”，避免前端 active 状态计数被误读成按当前管理员精确归属过滤。
- 完成：同步 `workflowTaskBoard` 单测、任务看板 L1 文案断言和 `web/README.md` 当前前端边界口径；未改任务筛选规则、WorkflowUsecase、RBAC、菜单、schema、migration、客户配置、部署或事实层写入。
- 验证：追加前 `progress.md` 为 65 行、13695 字节，未达到归档阈值；`pnpm --dir web exec node --test src/erp/utils/workflowTaskBoard.test.mjs` 通过，9 项；定向 ESLint 覆盖 `DashboardPage.jsx`、`workflowTaskBoard.mjs`、`workflowTaskBoard.test.mjs` 和 `scenarios.mjs` 通过；`node --check web/scripts/style-l1/scenarios.mjs` 通过；`STYLE_L1_PORT=4371 STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1` 通过，3 个场景；限定路径 `git diff --check` 通过。
- 下一步：如果继续治理任务看板，可单独评审“当前任务”右侧面板和四泳道之间是否仍重复；不要把 Workflow 协同任务完成写成库存、出货、财务或发票事实过账。
- 阻塞/风险：本轮未跑全量 `pnpm --dir web test`、全量 `pnpm --dir web css` 或全量 `style:l1`；当前工作区仍有大量非本轮并行改动，本轮只声明任务看板命名、定向测试和过程记录。

## 2026-06-19 提交前回归补跑与 L1 空态修正

- 完成：提交前复跑当前工作树相关定向验证，并修正 `business-formal-module-shells-desktop` 中库存余额与来料质检空态 mock 的竞态；L1 现在按页面真实加载节奏启用页面级空结果模式，避免 Enter 后旧记录回刷导致 stale 断言漂移。
- 完成：补齐 L1 场景级 admin profile override，并让 formal-shell 等待 `me` 同步完成后再判断 `workflow.task.read`，避免本地旧权限残值导致出货放行页先发一次 `list_tasks`；新增无权限边界回归，确认页面只显示缺权提示，不调用 `list_tasks`，也不显示刷新成功或协同确认。
- 完成：`pnpm --dir web lint` 自动收口任务看板选中态 CSS 与暗色覆盖，未新增 `!important`；`pnpm --dir web css` 通过。
- 验证：`gofmt` 覆盖本轮 Go 文件；`go test ./internal/biz -run 'TestWorkflowUsecase_ListTasks' -count=1`、`go test ./internal/data -run 'TestWorkflowRepo_(GetWorkflowTaskByID|ListWorkflowTasksFiltersByTaskGroup)' -count=1`、`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowListTasksPassesTaskGroupFilter|TestJsonrpcDispatcher_WorkflowUrgeTaskRecordsEventIntent' -count=1` 通过；`pnpm --dir web exec node --test src/erp/utils/workflowTaskBoard.test.mjs src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs src/erp/config/devCustomerConfig.test.mjs src/erp/utils/businessModuleNavigation.test.mjs` 通过，37 项；`node --check` 覆盖 `styleL1.mjs`、`adminRpcMocks.mjs`、`businessFormalScenarios.mjs`、`factRpcMocks.mjs`、`scenarios.mjs` 通过；`pnpm --dir web exec eslint --ext .mjs scripts/styleL1.mjs scripts/style-l1/adminRpcMocks.mjs scripts/style-l1/businessFormalScenarios.mjs` 通过；`pnpm --dir web exec eslint --ext .jsx src/erp/components/ERPLayout.jsx src/erp/pages/FormalBusinessModulePage.jsx` 通过；`STYLE_L1_PORT=4385 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`STYLE_L1_PORT=4386 STYLE_L1_SCENARIOS=business-menu-groups-desktop,erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1` 通过，4 个场景；`STYLE_L1_PORT=4387 STYLE_L1_SCENARIOS=business-formal-shipping-release-no-permission-desktop pnpm --dir web style:l1` 通过，1 个场景。
- 下一步：无提交前阻塞；后续若继续推进，需要按单页或单能力继续补 disabled 管理员、非管理员、事实 usecase 和更大范围浏览器回归。
- 阻塞/风险：本轮未跑全量 `go test ./...`、全量 `pnpm --dir web test` 或全量 `style:l1`；全局 Codex skill 文件位于 `/Users/simon/.codex/skills`，当前不是 git 仓库，无法随本项目提交推送。

## 2026-06-19 推送后 L1 工序下拉等待稳定化

- 完成：`git push` 的 pre-push 全量 QA 通过后，钩子留下 `styleL1.mjs` 中委外工序下拉断言的稳定化改动；现在等待行业默认工序候选全部出现后再断言，避免 AntD 下拉内容异步填充时被误判缺项。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .mjs scripts/styleL1.mjs` 通过；`git diff --check` 通过。
- 下一步：无。
- 阻塞/风险：该补丁只影响 L1 断言等待逻辑，不改变运行时页面、后端 usecase、schema、migration、RBAC、菜单或客户配置。

## 2026-06-19 目录 README 薄入口收口

- 完成：按 `plush-docs-governance` 和 `plush-page-design-governance` 新增 `web/scripts/README.md`，把前端本地服务、`style:l1`、真实登录 smoke、采购入库真实写入 e2e、字段联动报告和输出 / 写入边界收口到脚本目录入口；避免继续把 `web/scripts` 误写成单一“样式回归脚本”。
- 完成：新增 `config/README.md`，以薄路由方式说明 `customers/<customer-key>`、`industry-templates/plush` 和 `private-deployment-template` 的职责与边界；明确这些配置不代表 SaaS tenant、runtime loader、第二套部署主路径、schema / migration、RBAC 或 Workflow / Fact 规则。
- 完成：同步 `README.md`、`web/README.md` 和 `docs/文档清单.md` 的入口描述；未新增 frontmatter、Mermaid、测试策略、运行时配置或产品能力状态。
- 下一步：若后续新增正式客户配置包或新的前端脚本类别，继续按对应目录 README 和 `docs/文档清单.md` 做最小同步；不要机械给源码子目录补 README。
- 阻塞/风险：本轮是 docs-only 目录入口收口，未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户真实资料、部署脚本或前端运行时代码；未跑前端 / 后端自动化测试。

## 2026-06-19 提交推送全量补验

- 完成：提交推送时继续补跑出货放行无权限 L1、`business-formal-module-shells-desktop`、任务看板 / 菜单相关 L1，以及 pre-push `qa:full`；本轮不把出货放行升级为 shipment source document 或 `SHIPPED` fact。
- 验证：`STYLE_L1_PORT=4385 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`STYLE_L1_PORT=4386 STYLE_L1_SCENARIOS=business-menu-groups-desktop,erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1` 通过，4 个场景；`STYLE_L1_PORT=4387 STYLE_L1_SCENARIOS=business-formal-shipping-release-no-permission-desktop pnpm --dir web style:l1` 通过，1 个场景；pre-push `qa:full` 两次通过，覆盖 web lint / css / test / build、server `go test ./...`、Go build、secrets、govulncheck、客户配置和部署资料包守卫。
- 下一步：若继续声明“页面治理完全闭环”，还需要按单页或单能力补 disabled 管理员、非管理员、加载慢和更多暗色 / 移动组合；正式 shipment source/fact 仍需另开 usecase/API/RBAC/审计/导出/删除语义评审。
- 阻塞/风险：当前只补页面读取权限、任务看板和 L1 回归证据；未改 schema、migration、RBAC 码位、菜单、客户配置、部署、Shipment / Inventory / Finance fact usecase 或 `WorkflowUsecase` 第七条状态规则。

## 2026-06-19 权限与禁用账号边界 L1

- 完成：按 `plush-page-design-governance` 补管理员禁用会话 L1，新增 `admin-disabled` mock，仅覆盖 `/rpc/admin` 的 `me` 返回 `ADMIN_DISABLED`，让 `ERPLayout` / `adminProfileSync` / `authBus` 主路径显示“登录状态已失效 / 管理员已禁用 / 重新登录”，不渲染 ERP dashboard 内容。
- 完成：复核已有 `business-formal-shipping-release-no-permission-desktop`，确认无 `workflow.task.read` 时仍停留业务页缺权提示，不调用出货放行 `list_tasks`，不显示协同任务、刷新成功或 false success。
- 验证：追加前 `progress.md` 为 113 行、23462 字节，未达到归档阈值；`node --check` 覆盖 `styleL1.mjs`、`adminRpcMocks.mjs`、`scenarios.mjs`、`businessFormalScenarios.mjs` 通过；定向 ESLint 覆盖 `styleL1.mjs`、`adminRpcMocks.mjs`、`scenarios.mjs`、`businessFormalScenarios.mjs`、`factRpcMocks.mjs` 通过；`pnpm --dir web exec node --test src/erp/utils/adminProfileSync.test.mjs src/common/consts/errorCodes.test.mjs` 通过，7 项；`STYLE_L1_PORT=4368 STYLE_L1_SCENARIOS=business-formal-shipping-release-no-permission-desktop,auth-disabled-alert-desktop pnpm --dir web style:l1` 通过，2 个场景；`git diff --check` 通过。
- 下一步：继续补“有读取权限但缺更新 / 完成权限”的动作只读态，以及暗色 / 移动端错误提示对比度；不要改 schema、migration、RBAC 码位、菜单、客户配置、WorkflowUsecase 或 Fact usecase。
- 阻塞/风险：本轮未跑全量 `pnpm --dir web test`、全量 `pnpm --dir web lint`、全量 `style:l1` 或全量 `go test ./...`；未改运行时业务代码、schema、migration、RBAC、菜单、Workflow / Fact usecase、部署或正式能力文档。

## 2026-06-19 页面动作边界与正式菜单治理收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 收口库存台账、财务事实页和 formal-shell 页面文案 / 动作边界；formal-shell 入口改为“查看字段边界”，导出按钮改为禁用的“不导出业务数据”，并在表单边界中明确不提供真实创建、保存、删除、打印、业务数据导出或领域事实写入。
- 完成：库存台账选择条明确余额、批次和流水只读查询 / 追溯，动作从“关联”改为“查看关联”；财务事实页将应收、应付、发票、对账的主动作改为“登记事实”，并分别写清不代表收款 / 付款核销、税控、查验、纳税、总账或多账簿能力。
- 完成：同步 `docs/product/正式菜单运行时实施拆分清单.md`，把库存台账、财务事实页和 formal-shell 从当前剩余问题转为本轮已完成检查项；后续只保留新能力入口和行为接入升级的单页闭环条件。
- 验证：追加前 `progress.md` 为 121 行、25259 字节，未达到归档阈值；旧误导按钮 / R 编号话术扫描无命中；`pnpm --dir web exec eslint --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/pages/V1InventoryLedgerPage.jsx src/erp/pages/V1OperationalFactPage.jsx src/erp/pages/OperationalFactsPage.jsx` 通过；`pnpm --dir web exec eslint --ext .mjs scripts/style-l1/businessFormalScenarios.mjs` 通过；`node --check web/scripts/style-l1/businessFormalScenarios.mjs` 通过；`STYLE_L1_PORT=4392 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`STYLE_L1_PORT=4393 STYLE_L1_SCENARIOS=business-formal-shipping-release-no-permission-desktop pnpm --dir web style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过。
- 下一步：如果后续要接库存写入、完整财务核销、税控、总账、formal-shell 真实保存、打印、删除或业务数据导出，必须按具体页面单独做 usecase / API / RBAC / 审计 / 测试闭环，不用编号组织。
- 阻塞/风险：本轮只改前端页面文案 / 动作标签、L1 断言和正式文档口径；未改 schema、migration、RBAC、route、WorkflowUsecase、Inventory / Shipment / Finance fact usecase、客户配置或部署。

## 2026-06-19 页面治理剩余验证闭环

- 完成：继续收口上一条之后的剩余验证盲区；修正 `business-formal-shipping-release-readonly-actions-desktop` 的 L1 fixture 安装方式，专用场景先接管 `/rpc/workflow`，再返回只读账号可见的出货放行协同任务，避免通用 workflow mock 吃掉请求导致只读任务未出现。
- 完成：正式文档从“当前剩余问题 / 剩余风险”改为“行为接入门禁 / 当前边界”；同步 `web/README.md` 和 `docs/当前真源与交接顺序.md` 中过时的 `导出待接入提示` 口径为“不导出业务数据”。
- 完成：页面 governance 当前已覆盖库存台账、财务事实页、formal-shell 默认态、交互态、暗色、移动、无读取权限和只读动作权限；后续不再把这些页面边界当作待追问事项。
- 验证：追加前 `progress.md` 为 148 行、31520 字节，未达到归档阈值；`STYLE_L1_PORT=4395 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-formal-shipping-release-no-permission-desktop,business-formal-shipping-release-readonly-actions-desktop pnpm --dir web style:l1` 通过，3 个场景；`pnpm --dir web exec node --test src/erp/utils/businessCollaborationTasks.test.mjs src/erp/utils/workflowTaskBoard.test.mjs src/erp/utils/businessModuleNavigation.test.mjs` 通过，20 项；定向 ESLint 覆盖 `BusinessListLayout.jsx`、formal-shell、库存台账、财务事实页、`businessModuleNavigation.test.mjs` 和 L1 场景通过；`node --check web/scripts/style-l1/businessFormalScenarios.mjs` 通过；限定路径 `git diff --check` 通过。
- 下一步：无页面治理待追问项；只有新增真实行为或正式入口时，才按具体页面单独评审 usecase / API / RBAC / 审计 / 测试闭环。
- 阻塞/风险：本轮仍未改 schema、migration、RBAC、route、WorkflowUsecase、Inventory / Shipment / Finance fact usecase、客户配置或部署；旧 `progress.md` 条目中的“下一步”是历史过程记录，不作为当前正式待办真源。

## 2026-06-19 协同动作只读态与禁用账号暗色移动回归

- 完成：按 `plush-page-design-governance` 将 `CollaborationTaskPanel` 的动作显示收口到共享 `workflowTaskBoard` 权限 helper：同时满足页面传入 handler、任务未终态、当前账号具备对应 `workflow.task.*` 权限且符合责任角色 / 指派人边界时才显示“完成 / 阻塞 / 催办”；只读任务显示原因，不打开任务处理抽屉，也不触发 workflow 写接口。
- 完成：`FormalBusinessModulePage`、采购订单和委外订单协同面板传入当前 `adminProfile`；出货放行新增“有 `workflow.task.read` 但无 update / complete”的 L1，确认能读任务但只能看只读原因；补 `auth-disabled-alert-mobile-dark`，复用通用弹窗布局断言覆盖暗色移动端宽高、居中、对比度、横向溢出和重叠。
- 完成：`style:l1` 增加 `beforeNavigate` 场景钩子，供进入页面前挂定向 mock route；该钩子只服务浏览器回归脚本，不改变运行时应用。
- 验证：追加前 `progress.md` 为 130 行、27602 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .jsx,.mjs ...` 覆盖本轮页面和 L1 脚本通过；`node --check` 覆盖本轮 `.mjs` 脚本通过；`pnpm --dir web exec node --test src/erp/utils/workflowTaskBoard.test.mjs src/erp/utils/businessCollaborationTasks.test.mjs src/erp/utils/adminProfileSync.test.mjs src/common/consts/errorCodes.test.mjs` 通过，23 项；`STYLE_L1_PORT=4371 STYLE_L1_SCENARIOS=business-formal-shipping-release-no-permission-desktop,business-formal-shipping-release-readonly-actions-desktop,auth-disabled-alert-desktop,auth-disabled-alert-mobile-dark pnpm --dir web style:l1` 通过，4 个场景。
- 下一步：页面边界态当前已覆盖无读取权限、只读动作、disabled 会话、请求失败和 stale selected row；若继续做更高等级，只剩全量 `style:l1`、更大范围 `pnpm --dir web test` / `pnpm --dir web lint`、以及实际后端 RBAC / Workflow API 集成环境回归。
- 阻塞/风险：本轮未改 schema、migration、RBAC 码位、菜单、客户配置、WorkflowUsecase、Shipment / Inventory / Finance fact usecase、部署或正式能力文档；当前工作树存在非本轮并行改动，收口和提交时需要按路径精确区分。

## 2026-06-19 客户 / 供应商联系人弹窗宽度收口

- 完成：按 `plush-page-design-governance` 将客户 / 供应商这种“主数据主体 + 联系人子项”的聚合表单切到共享 `BusinessFormModal` 的新 `masterDataItems` 尺寸档；普通材料、工序等主数据仍保留原 `masterData` 标准宽度。
- 完成：新增 `ERP_MODAL_WIDTHS.masterDataItemsForm = min(1280px, calc(100vw - 48px))`，避免联系人区在桌面只露出三列半；联系人条目仍在同一业务弹窗内横向滚动，不拆抽屉、不新增局部页面兜底。
- 完成：补 `style:l1` 联系人聚合表单断言，覆盖弹窗宽度、body 无横向溢出、联系人 grid 内部横滚、字段最小宽度和供应商备注 show-count 场景。
- 验证：追加前 `progress.md` 为 139 行、29941 字节，未达到归档阈值；`pnpm --dir web lint` 通过；`pnpm --dir web css` 通过；`pnpm --dir web exec node --test src/erp/utils/modalSizes.test.mjs` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,textarea-show-count-layout-desktop pnpm --dir web style:l1` 通过，2 个场景。
- 下一步：若继续做更高等级页面验收，可补全量 `style:l1` 或窄屏客户 / 供应商创建表单专项；本轮不需要改原型状态。
- 阻塞/风险：一次误用 `pnpm --dir web test -- modalSizes` 触发了全量单测，其中既有 `businessModuleNavigation.test.mjs` 文案断言仍失败；本轮未改 schema、migration、RBAC、菜单、客户配置、Workflow / Fact usecase、部署或正式文档口径。

## 2026-06-19 可添加 item 弹窗整体横向滚动收口

- 完成：按 `plush-page-design-governance` 将 `.erp-master-contact-list` 系列可添加 item 区从“每行 grid 各自横向滚动”改为“外层 `.erp-master-contact-list__items` 统一横向滚动”；客户 / 供应商联系人、出货明细、采购入库明细等复用该结构的弹窗同步继承，不改保存逻辑、字段真源、schema、RBAC、菜单或 Workflow / Fact 边界。
- 完成：同步 `style:l1` 联系人聚合表单和采购入库创建 / 加行 / 移动端断言，明确外层列表持有 `overflow-x`，每行宽度一致，子 grid 不再各自横向滚动。
- 验证：追加前 `progress.md` 为 157 行、33595 字节，未达到归档阈值；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`STYLE_L1_PORT=4184 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop,purchase-receipt-add-item-modal-draft-desktop,purchase-receipt-create-modal-mobile pnpm --dir web style:l1` 通过，3 个场景；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`node --check web/scripts/style-l1/purchaseReceiptAssertions.mjs` 均通过。
- 下一步：如继续扩展同类 item 弹窗，优先复用 `.erp-master-contact-list__items` 或 `.erp-sales-order-lines-form__list` 作为唯一横向滚动面，不再把 `overflow-x:auto` 放回每行 grid。
- 阻塞/风险：完整 `STYLE_L1_PORT=4185 pnpm --dir web style:l1` 在 `business-module-dark-customers-desktop` 失败，失败点是协同面板收起态缺当前记录摘要，属于本轮开始前已有协同面板 / business list 现场改动链路，不是 item 弹窗滚动链路；本轮未改原型状态、正式文档清单、schema、migration、RBAC、菜单、客户配置、部署或后端 usecase。
