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

## 2026-06-19 协同面板当前记录摘要 L1 收口

- 完成：按 `plush-page-design-governance` 复查 `business-module-dark-customers-desktop` 失败点，确认 `CollaborationTaskPanel` 只在真实选中记录后显示“当前”摘要，运行时不应恢复默认选中第一行。
- 完成：修正 `style:l1` 场景前置条件：客户暗色场景、供应商桌面协同场景和供应商移动协同场景在断言 `expectCurrentRecord` 前先点选对应业务行；采购协同场景原本已点选采购订单行，无需调整。
- 验证：追加前 `progress.md` 为 165 行、35490 字节，未达到归档阈值；`node --check web/scripts/style-l1/scenarios.mjs` 通过；`STYLE_L1_PORT=4188 STYLE_L1_SCENARIOS=business-module-dark-customers-desktop,business-collaboration-supplier-desktop,business-collaboration-mobile pnpm --dir web style:l1` 通过，3 个场景；`STYLE_L1_PORT=4189 pnpm --dir web style:l1` 通过，67 个场景；限定路径 `git diff --check` 通过。
- 下一步：暂无同类协同面板 L1 失败；后续新增 `expectCurrentRecord` 场景时，必须先在脚本里明确选中真实业务记录。
- 阻塞/风险：本轮只改 L1 回归脚本和过程记录；未改页面运行时组件、schema、migration、RBAC、菜单、客户配置、Workflow / Fact usecase、部署或正式文档口径。

## 2026-06-19 三个 formal-shell 收口为 Workflow V1

- 完成：按 `plush-page-design-governance` 将 `生产排程`、`生产异常` 和 `出货放行` 从 `FormalBusinessModulePage` 退出，新增 `WorkflowBusinessModulePage` 承接三页的 `workflow_tasks` 读取、创建、完成、阻塞和催办；`businessModules` 标记三页为 `formal-v1`，router 显式路由到新页，`getFormalBusinessShellModules()` 清零。
- 完成：三页只写 Workflow 协同任务，不写生产、库存、出货、财务、应收、发票或收付款事实；出货放行仍限定 `source_type=shipping-release + task_group=shipment_release`，`shipping_released != shipped`。同步 `web/README.md`、当前真源、正式入口计划、菜单实施清单、能力证据和业务页原型 README 的当前口径。
- 完成：更新导航、表格排序和看板任务入口测试；目标 L1 从待接入预览页断言改为 Workflow V1 默认态、刷新、请求失败、stale task、暗色、移动、无读取权限和只读动作权限断言。
- 验证：追加前 `progress.md` 为 173 行、36852 字节，未达到归档阈值；定向 ESLint 覆盖本轮 JSX / MJS 通过；`cd web && node --test src/erp/utils/businessModuleNavigation.test.mjs src/erp/utils/moduleTableColumns.test.mjs src/erp/utils/workflowDashboardStats.test.mjs` 通过，24 项；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-formal-shipping-release-no-permission-desktop,business-formal-shipping-release-readonly-actions-desktop STYLE_L1_PORT=4297 pnpm --dir web style:l1` 通过，3 个场景；`pnpm --dir web test` 通过，360 项；限定路径 `git diff --check` 通过。
- 下一步：若继续把三页推进完整领域能力，应分别评审生产排程 source document、生产异常事实、ShipmentUsecase / 出货放行 source 或 fact 写入、RBAC、审计、schema / migration 和后端测试；不能把当前 Workflow V1 当成事实层完成。
- 阻塞/风险：本轮未改 schema、migration、RBAC 码位、WorkflowUsecase、Inventory / Shipment / Finance fact usecase、客户菜单显隐、部署或客户资料；旧 `FormalBusinessModulePage.jsx` 文件仍留在源码中但 router 不再暴露，后续可作为单独清理任务移除。

## 2026-06-19 财务收款维度进入 Product Core

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 评估永绅截图，将收款分类、币种、收款账期和发票类别作为通用财务维度进入 `finance_facts`；字段落在 Product Core 事实层，不写客户专属名称，也不引入 AR/AP、税控、总账或多账簿专表。
- 完成：`finance_facts` 增加 `collection_type`、`payment_term`、`payment_term_days`、`invoice_category`，保留 `USD/CNY/HKD` 币种与手续费；biz / repo / JSON-RPC / Ent 生成代码 / Atlas migration / 前端表单 / 列表列同步接入，`CASH_ON_SHIPMENT` 自动保留 0 天账期。
- 完成：同步财务第一版、当前真源、能力证据等正式文档；原型只校验当前 To Implement / reader boundary 口径，不提升状态，不新增文档清单条目。
- 验证：追加前 `progress.md` 为 201 行、43990 字节，未达到归档阈值；`cd server && make data` 生成 migration；`cd server && make migrate_status` 返回 pending 2 个 migration；`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端 360 项；`STYLE_L1_PORT=4193 pnpm --dir web style:l1` 通过，67 个场景；`git diff --check` 通过。
- 下一步：若后续要做真实收款核销、付款核销、发票查验、税控开票、总账凭证、账龄报表或完整 AR/AP 台账，必须单独评审 usecase、schema、RBAC、审计、迁移和 L2/L3 回归，不从当前字段直接外推。
- 阻塞/风险：当前目标库尚未应用新 migration；本轮没有执行 `atlas migrate apply`，也没有改 WorkflowUsecase、RBAC 码位、客户配置、部署脚本或客户专属资料目录。

## 2026-06-19 财务事实币种与手续费收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将 Finance Facts 的币种收口为 `美金 USD`、`人民币 CNY`、`港币 HKD` 三选一；新增同币种 `fee_amount` 手续费字段，前端金额与手续费都显示当前币种后缀，后端 JSON-RPC / biz / repo / Ent / migration 统一接入。
- 完成：Finance Fact schema 增加 `fee_amount numeric(20,6) NOT NULL DEFAULT 0`、非负约束和币种 allowlist；不引入单独手续费币种，也不接入本轮未请求的收款类型、账期或发票分类字段。
- 完成：同步当前真源、业务事实扩展评审、产品能力证据详情和 L1 mock；新增 `OperationalFactForms.test.mjs` 锁住币种选项、手续费提交和金额 / 手续费同币种展示。
- 验证：追加前 `progress.md` 为 182 行、39132 字节，未达到归档阈值；`make data` 显示 migration 目录已与 schema 同步；`make migrate_status` 显示本轮迁移 `20260619141220` 在 106 本地开发库 pending；`go test ./internal/biz -run 'TestNormalizeInventoryTxnCreateUsesCoreValueGuards|TestCreateFinanceFact' -count=1`、`go test ./internal/service -run 'TestJSONRPC|TestHandle|TestBusiness|TestFinanceFactCreateFromParamsParsesFeeAndCurrency' -count=1`、`go test ./internal/data -run 'TestOperationalFact|TestFinance' -count=1` 均通过；`pnpm --dir web exec node --test src/erp/components/operational-facts/OperationalFactForms.test.mjs`、定向 ESLint、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=4178 pnpm --dir web style:l1`、`git diff --check` 均通过。
- 下一步：发布或联调前需要在目标库执行 pending migration；若后续要扩展到账期、收款方式、税控发票分类，应作为独立 Finance Fact 字段链路评审，不和手续费同轮混入。
- 阻塞/风险：本轮未应用数据库 migration，未改 RBAC、菜单、WorkflowUsecase、库存 / 出货 / 总账事实、部署脚本或客户资料；当前工作树存在并行非本轮改动，提交时需要按本轮路径精确区分。

## 2026-06-19 12 个业务模块列表 toolbar shell 统一

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 抽出 `BusinessListToolbarActions` 共享工具栏，统一 `导出当前结果 / 列顺序 / 批量删除 / 回收站` 四个入口；批量删除和回收站只保留禁用边界提示，不新增后端删除、回收站、恢复 API，也不写前端本地删除。
- 完成：入库、库存台账、生产进度、出库、出货单、对账、应付、应收、发票接入当前已加载列表数据 CSV 真导出和共享列顺序；生产排程、生产异常、出货放行当前为 Workflow V1 协同页，导出禁用并提示“当前 Workflow V1 只处理协同任务，不导出业务数据。”，列顺序只作用于协同任务表，不伪造事实写入。
- 完成：修正新共享列顺序 hook 的 `set_erp_column_order` 参数为后端真源 `order`；修正财务事实金额 / 手续费输入去掉 deprecated `addonAfter`，避免受影响 L1 场景出现运行时 warning，同时保持表单值透传。
- 完成：更新 `businessFormalScenarios`、`purchaseReceiptScenarios` 和导航守卫断言，覆盖 12 个模块 toolbar 文案、禁用态、tooltip 边界、入库列顺序弹窗和 Workflow V1 不冒充事实能力。
- 验证：追加前 `progress.md` 为 182 行、39132 字节，未达到归档阈值；`pnpm --dir web lint` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，360 项；`node --test src/erp/components/operational-facts/OperationalFactForms.test.mjs src/erp/utils/businessModuleNavigation.test.mjs src/erp/utils/moduleTableColumns.test.mjs` 通过，14 项；`node --check web/scripts/style-l1/businessFormalScenarios.mjs && node --check web/scripts/style-l1/purchaseReceiptScenarios.mjs` 通过；`STYLE_L1_PORT=4301 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-formal-shipping-release-no-permission-desktop,business-formal-shipping-release-readonly-actions-desktop,purchase-receipts-table-control-columns-desktop pnpm --dir web style:l1` 通过，4 个场景；`git diff --check` 通过。
- 下一步：若要把生产排程、生产异常、出货放行推进为领域事实能力，需要单独评审 source document / usecase / API / RBAC / 审计 / schema / migration 和后端测试；本轮不把 toolbar shell 视为事实能力交付。
- 阻塞/风险：本轮未新增 schema、migration、RBAC、后端删除 / 回收站 API、tenant_id、多租户、license、客户专属逻辑或部署变更；导出为当前前端已加载结果，不代表服务端全量分页导出；工作区存在非本轮并行改动和 pending migration，提交时必须按路径精确区分。

## 2026-06-19 用户可见内部 ID 规则收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 判断截图中的普通业务表格 `ID` 列属于页面语义问题，不应让业务用户把数据库主键误认为业务编号；在 `AGENTS.md` 的“前端与样式”补项目级规则，要求用户可见业务列表、详情、表单、打印、导出和帮助文案默认展示业务编号 / 单据号 / 名称等可读字段，不把裸 `id / *_id` 当普通业务字段或首列。
- 完成：规则保留开发验收、内部调试、审计追溯和排障视图例外，但要求明确标注“内部 ID / 调试 ID / 主键 ID”，避免误伤 API hidden value、表单内部值和真实业务外部单号。
- 验证：追加前 `progress.md` 为 210 行、45810 字节，未达到归档阈值；`git diff --check -- AGENTS.md progress.md` 通过。
- 下一步：截图对应运行时页面还需按页面单独改列配置，优先删掉普通列表首列 `ID`，并用单据号、名称、批次号、流水号或字典映射替代明细里的裸外键。
- 阻塞/风险：本轮只补治理规则和过程记录；未改运行时代码、schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。

## 2026-06-19 用户可见内部 ID 全局扫描收口

- 完成：按 `plush-page-design-governance` 全局扫描 `web/src/erp` 和 `web/src/common` 的用户可见 `title / label / placeholder / fallback`，收口普通业务页面里的裸 `ID / *_id` 展示；`ShipmentsPage` 出货单首列改为出货单号优先，出货明细改用销售订单行、产品、SKU、仓库、批次和单位 option label；`V1PurchaseReceiptsPage` 去掉明细表 `行 ID`；`V1InventoryLedgerPage` 将库存余额 / 批次 / 流水中的对象、仓库、批次、单位等改为“引用 / 内部”口径；`OperationalFactsPage` 和 `OperationalFactForms` 将事实页内部关联字段改为“引用 / 来源记录”口径；Workflow 协同任务 fallback 改为 `内部来源 N`，不再显示 `source_type #id`。
- 完成：同步 `BusinessListLayout` 和移动端任务模型复用 `formatWorkflowTaskSource`，避免桌面协同面板和岗位任务端出现不同的内部来源 fallback；同步 `workflowDashboardStats.test.mjs` 和 L1 placeholder 断言。
- 验证：追加前 `progress.md` 为 227 行、48678 字节，未达到归档阈值；最终扫描仅剩 `DevCapabilityLedgerPage` 的“产品能力 ID”和 dev-only `devCustomerConfig` 里的 `tenant_id` 禁止说明，均非业务用户数据库主键展示；定向 ESLint 覆盖本轮页面、组件、utils 和 L1 脚本通过；`pnpm --dir web exec node --test src/erp/utils/moduleTableColumns.test.mjs src/erp/utils/workflowDashboardStats.test.mjs src/erp/components/operational-facts/OperationalFactForms.test.mjs src/erp/mobile/utils/mobileRoleTaskModel.test.mjs` 通过，26 项；`pnpm --dir web css` 通过；`STYLE_L1_PORT=4408 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-receipts-table-control-columns-desktop,business-formal-shipping-release-readonly-actions-desktop pnpm --dir web style:l1` 通过，3 个场景；限定路径 `git diff --check` 通过。
- 下一步：如果后端后续返回材料 / 产品 / 仓库 / 单位 / 批次的快照名称，库存台账和业务事实页可继续从“内部引用”升级为完全业务可读展示；当前不在前端伪造不存在的业务名称。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、WorkflowUsecase、Inventory / Shipment / Finance fact usecase、客户配置或部署；当前工作树仍有大量并行改动，提交时必须按路径精确区分。

## 2026-06-19 全局业务表格表头样式收口

- 完成：按 `plush-page-design-governance` 将 AntD 业务表格表头收口为默认单行、垂直居中、排序控件居中；业务主表列设置按钮默认隐藏，只在表头 hover / focus 时出现，避免每列表头常驻竖点挤压标题。
- 完成：收紧业务主表表头 padding 和排序 gap，保持入库这类短表头完整显示；列设置快捷菜单改为先 hover 表头再点击，保留键盘 focus 可见性和原列顺序能力。
- 完成：扩展 `style:l1` 业务主表排序断言，锁住表头单行 / 垂直居中、排序控件居中、默认态不铺开列设置按钮。
- 验证：追加前 `progress.md` 为 218 行、47084 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，360 项；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-receipts-table-control-columns-desktop,business-module-dark-customers-desktop STYLE_L1_PORT=4197 pnpm --dir web style:l1` 通过，3 个场景；`STYLE_L1_PORT=4198 pnpm --dir web style:l1` 通过，67 个场景。
- 下一步：暂无；后续新增业务主表列头动作时继续走 hover / focus 暴露，默认态不再把每列动作全部铺开。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；`pnpm lint` 未执行，因为该脚本会对整个 `src/` 执行 `--fix`，当前工作区存在大量非本轮未提交改动，避免批量改写现场。

## 2026-06-19 列顺序表头快捷入口默认可见修正

- 完成：按用户反馈修正上一条表头收口的交互语义：列顺序是可发现的配置入口，不再只靠 hover 暴露；每列表头快捷入口默认可见并可直接点击。
- 完成：继续通过更小的 14px 快捷按钮、业务主表 8px 表头内边距和 2px 排序 gap 控制密度，避免默认可见入口再次把短表头挤成省略号。
- 完成：更新 `style:l1`：表头快捷菜单直接点击，不再先 hover；业务主表断言改为默认展示列设置快捷入口且尺寸受控；入库场景新增短数据表头 `scrollWidth/clientWidth` 断言，锁住 `明细行数 / 入库数量` 等短表头不被挤压。
- 验证：追加前 `progress.md` 为 235 行、51124 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs && node --check web/scripts/style-l1/purchaseReceiptScenarios.mjs` 通过；`pnpm --dir web css` 通过；`STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop,business-formal-module-shells-desktop,business-module-dark-customers-desktop STYLE_L1_PORT=4200 pnpm --dir web style:l1` 通过，3 个场景；限定路径 `git diff --check` 通过。
- 下一步：暂无；默认口径是工具栏 `列顺序` 和表头每列快捷入口都可见，表头快捷入口用于当前列左移 / 右移 / 移到最前 / 移到最后。
- 阻塞/风险：全量 `STYLE_L1_PORT=4201/4203 pnpm --dir web style:l1` 本轮未形成稳定结论：第一次失败在 `print-workspace-material`，单独重跑该场景通过；第二次和随后的目标重跑期间 Vite 输出显示 `BusinessListToolbarActions.jsx`、`WorkflowBusinessModulePage.jsx`、`V1PurchaseReceiptsPage.jsx`、`V1MasterDataPage.jsx`、`router.jsx` 等非本轮文件发生 HMR 更新，场景失败在工具栏按钮等待，不是表头盒模型断言。本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、原型状态或正式文档清单。

## 2026-06-19 列表 toolbar 删除 / 回收站入口降噪

- 完成：按 `plush-page-design-governance` 复查列表工具栏语义，确认没有真实删除 / 回收站主路径的页面不应展示禁用占位按钮；`BusinessListToolbarActions` 只保留 `导出当前结果` 和 `列顺序` 两个共享入口。
- 完成：清理入库、库存台账、生产排程、生产进度、生产异常、出货放行、出库、出货单、对账、应付、应收、发票的共享 toolbar 删除 / 回收站占位；同步清理主数据、销售订单、采购订单、委外订单、BOM、来料质检等旧 V1 页面手写的列表级禁用占位按钮。表单明细内真实的删除行 / 删除明细按钮保留。
- 完成：更新 `businessFormalScenarios`、`purchaseReceiptScenarios` 和 `businessModuleNavigation.test.mjs`，把断言从“删除 / 回收站禁用”改为“没有真实逻辑时不展示”；正式页面源码扫描只剩反向断言和 dev prototype 参考说明。
- 验证：追加前 `progress.md` 为 244 行、53144 字节，未达到归档阈值；`pnpm --dir web lint` 通过；`node --test src/erp/utils/businessModuleNavigation.test.mjs src/erp/utils/moduleTableColumns.test.mjs` 通过，13 项；`STYLE_L1_PORT=4301 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-formal-shipping-release-no-permission-desktop,business-formal-shipping-release-readonly-actions-desktop,purchase-receipts-table-control-columns-desktop pnpm --dir web style:l1` 通过，4 个场景；`pnpm --dir web test` 通过，360 项；`git diff --check` 通过。
- 下一步：后续只有当某个页面真的接入后端软删除、回收站、恢复和审计 usecase 时，才把删除 / 回收站作为对应页面的真实动作重新加回。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、原型状态或正式文档清单；`AGENTS.md` 仅按 skill 要求读取，未编辑。

## 2026-06-19 业务主表选择列显式化

- 完成：按 `plush-page-design-governance` 全局检查业务主表选择语义；确认不是所有表格都应改成 checkbox，采购订单、BOM 等多选批量页保留 checkbox，委外订单、质检、出货等单条当前操作页保留 radio 单选。
- 完成：`BusinessDataTable` 为 radio 单选主表统一补默认 `选择` 列头和 52px 选择列宽，避免空表或表头场景看起来像前置选择列丢失；已有显式选择列配置的页面保持原配置。
- 完成：扩展 `style:l1` 业务主表断言：存在当前操作区的业务主表必须有选择列，且选择列表头不能是空白不可解释状态；继续保留表头单行、垂直居中、排序和列顺序快捷入口断言。
- 验证：追加前 `progress.md` 为 253 行、55141 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web css` 通过；`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/components/business-list/BusinessListLayout.jsx` 通过；`STYLE_L1_PORT=4210 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-receipts-table-control-columns-desktop pnpm --dir web style:l1` 通过，2 个场景；限定路径 `git diff --check` 通过。
- 下一步：暂无；后续新增业务主表若有当前操作区或批量语义，应显式传 `rowSelection`，由共享表格统一处理 radio 单选列头。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、删除 / 回收站 API 或正式文档清单；`node --check` 不能直接检查 `.jsx`，已改用定向 ESLint 校验组件。

## 2026-06-19 入库明细展开表显示完整性

- 完成：按 `plush-page-design-governance` 复查全局选择语义，保持“单条当前操作页用 radio，真实多对象动作页保留 checkbox”的口径；`V1PurchaseReceiptsPage` 改回共享 `BusinessDataTable` 主路径，由共享表格统一处理 radio 选择列头和列宽，库存台账直接 `Table` 场景显式补 `选择` 列头。
- 完成：修复入库展开明细表显示不全：去掉 920px 的窄滚动预算，按材料、仓库、单位、批次、数量、金额、来源和备注重新给列宽；备注不再省略，长文本在明细表单元格内换行，横向滚动收口在展开明细表内部，不撑开整页。
- 完成：扩展 `purchase-receipts-table-control-columns-desktop` L1 场景，断言入库主表选择控件是 radio，展开明细列头完整，内部横向滚动可到最右侧备注列，展开后页面无横向溢出。
- 验证：追加前 `progress.md` 为 244 行、53144 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/pages/V1InventoryLedgerPage.jsx src/erp/components/business-list/BusinessListLayout.jsx` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，360 项；`STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop pnpm --dir web style:l1` 通过，1 个场景。
- 下一步：若后续要把采购订单、BOM 等多选页改成单选，必须先移除或重做其现有多选摘要 / 批量动作语义，不能只换控件。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、原型状态或正式文档清单；全量 `pnpm lint` 未执行，因为该脚本会对整个 `src/` 执行 `--fix`，当前工作区有大量非本轮现场改动。

## 2026-06-19 客户默认付款条件与销售订单成交付款条件

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 实现客户档案默认付款条件入口：`customers` 新增 `default_payment_method / default_payment_term_days`，客户表单支持“现结 / 30天月结 / 60天月结 + 已保存历史值”的候选和手输，选择候选时自动带出账期天数，`0` 天用于现结且不会被过滤。
- 完成：销售订单主表新增 `payment_method / payment_term_days / price_condition_note`，选择客户时带出客户默认付款条件但允许本单修改；修改付款方式或账期且明细已有单价 / 金额时弹确认，用户可保留当前单价或清空明细单价重新报价；系统不自动按 30 / 60 天重算价格，也不把订单改动回写客户默认值。
- 完成：同步 Ent schema / generated code / Atlas migration、biz/data/service JSON-RPC、前端表单 / 列表 / CSV 导出 / 搜索占位、共享参数 helper、定向测试和正式文档口径；销售订单仍是 Source Document，不写出货、库存、应收、发票、收款或付款事实。
- 验证：追加前 `progress.md` 为 271 行、58699 字节，未达到归档阈值；`cd server && make print_db_url` 确认为 `192.168.0.106:5432/plush_erp`；`cd server && make data` 通过并生成 `20260619155648_migrate.sql`；`cd server && go test ./internal/biz ./internal/data ./internal/service` 通过；`cd web && node --test src/erp/utils/masterDataOrderView.test.mjs` 通过，10 项；`STYLE_L1_PORT=4312 STYLE_L1_SCENARIOS=business-module-dark-customers-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，2 个场景；`git diff --check` 通过。
- 下一步：如果后续要用订单付款条件生成应收到期日、对账或客户级价格规则，必须单独评审 Finance Fact 字段链路、价格规则真源和旧数据回补；不要从客户默认值直接派生财务事实。
- 阻塞/风险：`cd server && make migrate_status` 命令通过但当前 dev DB 仍显示 pending 3，Next Version 为既有 `20260619141220`，本轮新增迁移是第三个 pending；本轮未执行 migration apply，未改供应商结算条件、应收 / 应付 / 发票 / 收付款 fact、打印模板、真实客户导入、价格引擎、独立 payment_methods 字典表或全局配置 UI。

## 2026-06-19 弹窗 item 备注多行输入与计数器修正

- 完成：按 `plush-page-design-governance` 复查业务弹窗 item 备注语义，确认备注属于自由文本而非单行编号；修复联系人 item 中 `showCount + allowClear` 的 AntD wrapper 选择器，长连续文本不再压住字数统计或跑出输入框。
- 完成：采购订单和委外订单的单头备注、行备注统一改为 `Input.TextArea`，保持两行起步、可清空、显示字数和 255 长度限制；销售订单、联系人等已有多行备注沿用共享样式，不改变保存字段或后端语义。
- 完成：扩展 `textarea-show-count-layout-desktop` L1 场景，在供应商联系人备注里填充长连续数字，并修正盒模型断言读取真实 `ant-input-textarea-affix-wrapper` 边框节点。
- 验证：追加前 `progress.md` 为 271 行、58699 字节，未达到归档阈值；运行时 DOM 探针确认联系人备注 wrapper 不再是 36px 单行高度；截图 `web/output/playwright/style-l1/textarea-show-count-supplier-form-modal.png` 确认 `48 / 200` 位于右下角且不遮挡正文；`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、定向 ESLint、`pnpm --dir web test` 通过，361 项；`STYLE_L1_BASE_URL=http://127.0.0.1:4179 STYLE_L1_SCENARIOS=textarea-show-count-layout-desktop pnpm --dir web style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过。
- 下一步：暂无；后续新增业务弹窗 item 备注继续复用多行输入和共享计数器布局，不回到单行 `Input`。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、原型状态或正式文档清单；`AGENTS.md` 只读取 / 遵循，未编辑；全量 `pnpm --dir web lint` 仍受并行现场 `V1SalesOrdersPage.jsx` 未使用变量阻塞，非本轮备注改动引入。

## 2026-06-20 入库展开明细可读性修正

- 完成：按 `plush-page-design-governance` 复查截图中的入库展开明细，确认旧实现不是可参考的业务软件设计，而是把 AntD expandable nested table 机械套进单据明细；`V1PurchaseReceiptsPage` 去掉展开区内嵌表格和横向滚动预算，改为按“明细 N + 字段网格”展示材料、仓库、单位、批次、数量、金额、来源行号和备注。
- 完成：长字段材料、批次、备注使用更宽字段格并允许换行，短字段保持密度；同步补齐浅色和暗色主题样式，展开区不再依赖滚到最右才能看到备注。
- 完成：更新 `purchase-receipts-table-control-columns-desktop` 和暗色入库 L1 断言：展开区必须没有内嵌 `.ant-table`，字段标签完整，材料编号和备注直接可见，字段值不裁切，明细卡片和页面都不产生水平溢出。
- 验证：追加前 `progress.md` 为 289 行、62987 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx scripts/style-l1/purchaseReceiptScenarios.mjs` 通过；`pnpm --dir web css` 通过；`STYLE_L1_PORT=4175 STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop,purchase-receipt-create-modal-dark-desktop pnpm --dir web style:l1` 通过，2 个场景；`pnpm --dir web test` 通过，361 项。
- 下一步：如果其他页面也存在“展开区再塞一张宽表”的单据明细，应按相同口径迁移到可读明细卡片或结构化详情，不继续把横向滚动当成可读性验收。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或正式文档清单；当前工作树仍有大量并行改动，后续提交必须按路径精确区分。

## 2026-06-20 付款条件文案与成对校验

- 完成：按 trade-erp 既有文案收口客户主数据和销售订单表单，用户可见字段统一为“付款方式”和“付款周期(天)”；客户列表搜索和付款条件列同步去掉“默认”前缀，字段名仍保留 `default_payment_method / default_payment_term_days` 表达客户主档默认建议。
- 完成：付款条件采用成对完整校验而非全局必填；付款方式和付款周期都不填时允许保存，只填任一项时必须补齐另一项，`0` 天现结保持有效；销售订单沿用同一规则，仍不自动重算单价、不回写客户默认值。
- 完成：同步 `docs/product/产品能力证据详情.md` 和 `docs/architecture/客户供应商主数据评审.md` 的当前口径；历史 reference / prototype 资料未改，保留为归档证据。
- 验证：追加前 `progress.md` 为 298 行、64826 字节，未达到归档阈值；`cd web && node --test src/erp/utils/masterDataOrderView.test.mjs` 通过，11 项；`STYLE_L1_PORT=4313 STYLE_L1_SCENARIOS=business-module-dark-customers-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，2 个场景；`git diff --check` 通过。
- 下一步：若后续把付款条件用于应收到期日、价格规则或客户信用控制，需单独评审 Finance Fact 和价格真源，不从客户默认建议直接派生事实。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、供应商结算条件、打印导出或独立 payment_methods 字典表；旧 reference/prototype 中仍可能出现历史“默认付款方式”字样，不作为当前运行时口径。
