# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。

## 当前活跃事项

- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；本轮只做前端结构拆分、样式拆分和验证脚本同步，不改变 Workflow / Fact 边界、schema、migration、后端 API、RBAC 或菜单。
- `MobileRoleTasksPage.jsx` 不再承接所有规则、样式和动作编排：展示页、动作 hook、纯规则 model、页面专属 CSS 已分层，后续继续拆分应优先沿这些边界推进。
- 当前工作区仍有大量非本轮并行改动；本轮未回退、删除、格式化或提交这些改动。

## 2026-06-16 23:03 CST 移动任务页可维护性二次拆分

- 完成：在上一轮纯规则和 CSS 拆分基础上，新增 `web/src/erp/mobile/hooks/useMobileRoleTaskActions.js`，把移动任务完成、阻塞、催办、财务跟进、委外回货、成品入库、出货财务和应付对账等动作编排从 `MobileRoleTasksPage.jsx` 中迁出。
- 完成：`MobileRoleTasksPage.jsx` 进一步收缩到 1330 行；动作 hook 850 行，纯规则 model 467 行，专属 CSS 658 行。页面现在主要负责加载任务、筛选态、布局和展示组合，动作副作用集中在 hook，任务展示规则集中在 model。
- 完成：同步调整 `purchaseInboundFlow.test.mjs`、`orderApprovalFlow.test.mjs`、`outsourceReturnFlow.test.mjs`、`finishedGoodsFlow.test.mjs` 的源码扫描断言，继续守住移动端不本地创建下游任务、状态映射和 Workflow / Fact 边界。
- 完成：为配合当前 dashboard 标题现场和构建验收，修正 `DashboardPage.jsx` 里现有 JSX 闭合残留，并把 `style:l1` 中 dashboard 初始标题断言同步到当前可见标题“工作台”；不改变 dashboard 业务语义。
- 验证：目标 ESLint（不带 fix）、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web test`（320 tests）、相关 `node --test`（44 tests）、`STYLE_L1_SCENARIOS=mobile-tasks-dark,mobile-tasks-browser-back-stays-mobile pnpm --dir web style:l1`、`pnpm --dir web build`、`git diff --check` 均通过。
- 下一步：如果继续压缩复杂度，优先把 `useMobileRoleTaskActions.js` 内的业务族动作拆成更小的 follow-up service/helper，例如 `shipmentFinance`、`payableReconciliation`、`outsourceReturn`、`finishedGoods`；不要在同一轮混入后端 usecase 或事实层行为改造。
- 阻塞/风险：`useMobileRoleTaskActions.js` 仍有 850 行，已经比页面大泥团更可维护，但还不是最终形态；当前只是前端结构拆分，未新增后端能力，也未执行部署或目标环境验证。`pnpm --dir web lint` 未直接执行，因为该脚本会全量 `eslint --fix` 且当前工作区已有大量并行未提交改动，本轮使用目标 ESLint 避免扩大 diff。

## 2026-06-17 09:46 CST 工作台业务对象脉搏移除

- 完成：移除 `/erp/dashboard` 工作台里的“业务对象脉搏”区域和对应 business dashboard stats 依赖；工作台只保留待处理、阻塞、等待交接三个任务判断指标，以及优先队列和当前任务详情 / 关联记录入口。
- 完成：清理对应 CSS、`style:l1` 断言和原型 README 口径，明确通用快捷入口不进入工作台运行态；业务对象总览继续收口到 `/erp/business-dashboard`。
- 完成：继续收口 `metric-card-interaction-standard-v1`、`admin-command-center-v1`、`formal-menu-candidate-v1`、原型总 README、静态原型查看器和 dev-only 原型登记文案；`/erp/dashboard` 不再作为通用业务对象入口或指标卡候选，只保留当前任务关联记录入口口径。
- 验证：`pnpm --dir web css`、`pnpm --dir web test`（320 tests）、`pnpm lint`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm --dir web style:l1`、`git diff --check` 均通过。曾尝试对 `web/scripts/styleL1.mjs` 单独执行 ESLint，但该脚本已有未使用 helper 等既有 lint 债，本轮以语法检查和 L1 场景回归覆盖脚本变更。
- 下一步：若后续还要压缩左侧菜单或常用入口，需要单独做正式菜单评审；若当前任务详情需要更强关联记录，应从 Workflow task source 派生，而不是恢复泛化快捷入口。
- 阻塞/风险：本轮不改菜单、RBAC、后端 API、schema、migration、Workflow / Fact 边界，也不改变业务看板自身的数据口径。

## 2026-06-17 09:55 CST 看板中心意义复审

- 完成：按“每块只回答一个问题”复审看板中心三页：工作台继续只回答今天先处理什么，去掉已归档队列；任务看板把顶部核心指标收敛为待我处理、阻塞交接、逾期任务，清空筛选回到筛选区工具位；业务看板把摘要和表格文案改为对象总量、推进中、需处理风险、业务对象健康、状态分布和当前风险。
- 完成：同步 `style:l1` 断言和原型 README，避免把“当前结果”“模块健康”“风险提醒”等泛称继续当成核心设计口径。
- 验证：`pnpm exec eslint --ext .jsx src/erp/pages/DashboardPage.jsx src/erp/pages/BusinessDashboardPage.jsx`、`pnpm --dir web css`、`pnpm --dir web test`（320 tests）、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop,erp-business-dashboard-desktop,erp-business-dashboard-dark-desktop,erp-business-dashboard-mobile pnpm --dir web style:l1`、本轮相关路径 `git diff --check` 均通过。
- 下一步：若继续减少心智负担，应单独评审正式左侧菜单和看板中心三入口是否合并或重命名；不要在本轮顺手改 RBAC / seed 菜单。
- 阻塞/风险：当前工作区已有非本轮原型 HTML、开发原型登记和审计日志页等改动，本轮不回退、不格式化、不纳入成果；本轮不改后端 API、schema、migration、菜单、RBAC、Workflow / Fact 边界。

## 2026-06-17 09:57 CST 来源选择器已选区位置与快照

- 完成：按截图复审结论微调共享 `SourceImportPickerModal`，把“已选 chip + 清空已选”从表格后移到搜索框和表格之间；已选区现在先于分页和表格扫描，符合 trade-erp 更顺手的候选选择路径。
- 完成：给来源选择器增加独立已选记录快照，不再只依赖当前 `rows` 映射；后续如果候选来源改成远程分页，跨页已选摘要和导入数据不会因为当前页 rows 切换而丢失。
- 完成：同步局部动作弹窗原型和 README，明确已选摘要优先放在搜索框与表格之间；出货“来源单 -> 明细行 / 数量”仍等待后端可出运余量、已出货扣减和库存预警真源，不在前端硬造。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`node --test web/src/erp/config/devPrototypes.test.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1PurchaseOrdersPage.jsx src/erp/pages/ShipmentsPage.jsx`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。
- 下一步：后续若后端补齐出货余量和库存预警 API，再在同一个第二层来源选择器内加“选择本次发货行 / 数量”分步，不新增第三层弹窗。
- 阻塞/风险：本轮不改后端 API、schema、migration、RBAC、Shipment Fact、库存预占或真实可出运余量校验。

## 2026-06-17 09:58 CST 审计日志定位体验重构

- 完成：参考 GitHub / Stripe / Microsoft Entra / Google Logs Explorer 的审计日志模式，将 `/erp/system/audit-logs` 从说明型筛选 + 横向表格重构为“总览摘要、筛选工具条、风险分段、常查动作、事件流、右侧详情”的低心智负担布局。
- 完成：事件流每条记录直接展示风险、操作者、动作、对象、时间、来源和变化摘要；右侧详情突出下一步核对建议、操作者、对象、来源、变化，并把 raw payload 收进可展开区域。
- 完成：优化字段展示口径，`disabled / password_reset / role_keys / permission_keys` 等 payload key 转为中文业务含义，密码重置和账号启停结论不再让用户读原始 key 才能理解。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/AuditLogsPage.jsx`、`pnpm --dir web css`、`pnpm --dir web test`（320 tests）、`git diff --check -- web/src/erp/pages/AuditLogsPage.jsx web/src/erp/styles/app.css progress.md` 通过；Browser 验证桌面默认态、密码重置快捷筛选、右侧详情和 390px 移动端盒模型，均无横向溢出、无 framework overlay、无 console error / warn。
- 下一步：如继续扩展审计，应优先补配置变更审计、导出或领域事实审计的正式边界，不把系统控制面审计页扩成通用业务流水。
- 阻塞/风险：Browser 截图接口仍在 `Page.captureScreenshot` 超时，本轮用 DOM 快照、交互状态、console 和盒模型指标作为视觉证据；本轮不改后端 audit API、schema、migration、RBAC 权限码或业务事实审计范围。

## 2026-06-17 10:20 CST 采购订单本页协同接入

- 完成：`/erp/purchase/accessories` 采购订单 V1 页面接入共享 `CollaborationTaskPanel`，按现有 workflow `source_type=accessories-purchase` 读取本页协同任务；选中单张采购订单时按 `source_id` 过滤当前记录协同。
- 完成：新增 `filterBusinessCollaborationTasksBySource` 纯工具函数和测试，过滤逻辑只读现有 workflow 任务，不创建任务，不写库存、质检、应付、发票、付款或其他事实。
- 完成：采购订单协同面板接入 `ROLE_DISPLAY_NAMES`，展开态责任岗位显示中文角色名，避免直接暴露 `warehouse` 等裸 key。
- 验证：`cd web && pnpm exec eslint --ext .jsx src/erp/pages/V1PurchaseOrdersPage.jsx`、`cd web && pnpm exec eslint --ext .mjs src/erp/utils/businessCollaborationTasks.mjs src/erp/utils/businessCollaborationTasks.test.mjs`、`node --test web/src/erp/utils/businessCollaborationTasks.test.mjs`、`pnpm --dir web test`（321 tests）、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过；Browser 验证采购订单页默认态、选中首行、展开本页协同、当前记录标签、岗位中文名、横向溢出和 console error/warn 均通过。
- 下一步：若后续要让采购订单生命周期自动产生采购跟进、IQC 或入库协同任务，需要单独评审 `purchase_orders / purchase_order_items` 与 workflow `source_type/source_id` 的来源映射，不在前端本地硬造。
- 阻塞/风险：本轮不改后端 WorkflowUsecase、schema、migration、RBAC、采购事实、库存事实或应付事实；当前只展示既有 workflow 任务，采购订单本身仍只表达采购承诺。

## 2026-06-17 10:13 CST 任务处理抽屉复审与实现

- 完成：复审任务中心样板后确认“任务处理抽屉”应归属 `task-command-center-v1`，不是普通局部动作弹窗；原型新增可打开的任务处理 side panel，包含任务摘要、处理步骤、Workflow / Fact 边界、完成 / 阻塞 / 催办三类动作和原因输入状态。
- 完成：`/erp/task-board` 与工作台共用的任务 Drawer 改为任务处理面板结构：顶部任务摘要、中段三步处理 rail、边界提示、动作确认区和底部固定动作；阻塞 / 催办要求原因，完成动作明确只关闭 Workflow 任务，不写库存、出货、财务、开票或付款事实。
- 完成：同步 `docs/product/prototypes/README.md`、`docs/product/prototypes/index.html` 和 `web/src/erp/config/devPrototypes.mjs`，让 `/__dev/prototypes` 搜“任务处理抽屉”命中任务中心样板；未把 To Implement 原型晋级为 Current。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`（321 tests）、`pnpm --dir web style:l1`（53 场景）、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-dark-wide-desktop pnpm --dir web style:l1`、`node -e` 校验 `task-command-center-v1/index.html` 内联脚本语法均通过。
- 下一步：如果后续继续优化任务处理动作，可单独评审是否把桌面任务抽屉抽成共享组件供业务页协同面板复用；不要把处理抽屉扩成业务事实编辑器。
- 阻塞/风险：本轮不改后端 WorkflowUsecase、schema、migration、RBAC、菜单或 Fact usecase；当前工作区存在其他并行改动，本轮未回退或纳入成果。

## 2026-06-17 10:24 CST 系统审计查询后端增强

- 完成：增强 `admin.audit_logs` / `runtime_audit_events` 查询链路，支持 `source / event_type / event_key / actor_key / target_type / target_key / keyword / created_from / created_to / limit / offset`，并保持 `system.audit.read` 权限门禁。
- 完成：后端在 biz 层为审计事件补 `risk_level / action_label / summary / actor_key / target_type / target_key`，前端审计页优先使用后端摘要字段，并新增开始 / 结束日期筛选；旧 payload 映射继续作为兼容兜底。
- 完成：同步 `server/README.md` 和 `docs/当前真源与交接顺序.md`，明确这只是系统控制面审计查询增强，不是采购、库存、质检、出货或财务业务事实审计。
- 完成：为现有 MasterDataRepo 测试 stub 补齐产品主数据 no-op 方法，解决当前接口扩展后后端包测试无法编译的问题；不改 MasterData 运行时逻辑。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service`、`pnpm --dir web exec eslint --ext .jsx src/erp/pages/AuditLogsPage.jsx`、`pnpm --dir web css`、`pnpm --dir web test`（321 tests）、相关路径 `git diff --check` 均通过；Browser 验证审计页桌面和 390px 移动端有日期筛选、事件流、详情且无横向溢出 / console error。
- 阻塞/风险：`pnpm --dir web style:l1` 全量失败在既有 `business-formal-module-shells-desktop` 销售订单弹窗关闭等待，和审计页不在同一链路；本轮未新增 schema、migration、RBAC 权限码、业务事实审计表或领域审计写入。

## 2026-06-17 10:27 CST 产品档案基础信息与规格分段闭环

- 完成：补齐 `products` 主数据 repo/usecase、`masterdata` JSON-RPC 产品 CRUD、`product.*` RBAC 和测试；产品基础信息只维护编号、名称、款号、默认单位和启停状态，不写订单、库存、BOM、生产或出货事实。
- 完成：`/erp/master/products` 默认展示“产品基础信息”，同页分段切换到“产品规格”；SKU 仍走 `product_sku.*` 与既有 SKU CRUD，不新增菜单或路由。
- 完成：同步 `server/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/产品能力进度台账.md`、`docs/product/菜单映射评审表.md` 的当前能力和边界口径。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service`、`node --test web/src/erp/api/masterDataOrderApi.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs`、`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1MasterDataPage.jsx`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；Browser 验证产品基础信息默认态、产品规格切换态、无 framework overlay、无 console error / warn。
- 下一步：如继续推进产品档案，应优先评审产品 / SKU 导入受控创建、附件口径、下游出货 / 库存 SKU 校验或 BOM SKU 粒度，不能在前端本地硬造事实。
- 阻塞/风险：本轮未新增 schema / migration，未改销售订单、库存、BOM、出货、生产或财务事实主路径；单位仍只填现有 `units` ID，未做单位选择器或单位维护页面。

## 2026-06-17 10:34 CST 移动任务页展示层拆分

- 完成：新增 `MobileTaskListScreen.jsx` 和 `MobileTaskDetailScreen.jsx`，把岗位任务端列表 / tab / 消息 / 我的页、详情页和底部动作栏从 `MobileRoleTasksPage.jsx` 中拆出；`MobileRoleTasksPage.jsx` 从 1330 行收缩到 326 行，只保留任务查询、筛选派生、选中态和 action hook 组装。
- 完成：列表页组件本地承接列表展开批次状态，详情页组件本地承接任务关键信息、现场留痕、最近动态和动作确认 UI；不改变 `useMobileRoleTaskActions.js` 的 Workflow 动作边界，不新增后端 API、schema、migration、RBAC、菜单或 Fact 写入。
- 验证：目标 ESLint（不带 fix）、`pnpm --dir web css`、`pnpm --dir web test`（321 tests）、相关 `node --test`（44 tests）、`STYLE_L1_SCENARIOS=mobile-tasks-dark,mobile-tasks-browser-back-stays-mobile pnpm --dir web style:l1`、`pnpm --dir web build`、`git diff --check` 均通过。
- 下一步：若继续治理移动任务端复杂度，优先把 `useMobileRoleTaskActions.js` 的 850 行按业务族拆成 action service/helper；`app.css` 仍是 12572 行级全局样式，应另开 CSS 分批迁移任务。
- 阻塞/风险：本轮只做前端展示层结构拆分，不改移动任务行为语义；当前工作区有大量非本轮并行改动，本轮未回退、格式化或纳入这些现场。

## 2026-06-17 13:12 CST JSON-RPC service dispatcher 职责拆分

- 完成：将 `server/internal/service/jsonrpc_dispatch.go` 从 1231 行拆为 dispatcher core、auth、guards、helpers、admin、user 六个职责文件；保留 URL / method 分发、登录态、管理员身份、权限码和错误映射仍在 `service` 层，不回退到 `data` 或 `biz`。
- 完成：同步 `server/internal/service/README.md`，写清各 `jsonrpc_dispatch_*` 文件职责，避免后续新增 RPC 时继续把 auth/admin/user/helper 混回单个 dispatcher 大文件。
- 验证：`cd server && go test ./internal/service -count=1`、`git diff --check` 通过。
- 下一步：后续若继续拆，应优先评审 `jsonrpc_masterdata_order.go` 中 masterdata / sales_order / 参数解析 helper 的边界；不要把业务规则从 usecase 搬进 service。
- 阻塞/风险：本轮是 service 包内函数搬移，不改 schema、migration、RBAC 权限码、JSON-RPC URL / method、业务 usecase、data repo、前端或部署；当前工作区存在非本轮前端 / 原型改动，本轮未回退或纳入这些现场。
