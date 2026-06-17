# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水；本轮不改归档内容。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。

## 当前活跃事项

- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；本轮只做前端结构拆分、样式拆分和验证脚本同步，不改变 Workflow / Fact 边界、schema、migration、后端 API、RBAC 或菜单。
- `MobileRoleTasksPage.jsx` 不再承接所有规则、样式和动作编排：展示页、动作 hook、纯规则 model、页面专属 CSS 已分层，后续继续拆分应优先沿这些边界推进。
- 当前工作区仍有大量非本轮并行改动；本轮未回退、删除、格式化或提交这些改动。

## 2026-06-17 16:38 CST 加工合同打印归属委外页

- 完成：正式业务壳层不恢复通用打印按钮，只在 `processing-contracts` / 委外订单页选中单条记录后显示 `加工合同打印`，入口打开现有 `processing-contract` 打印工作台，并标记来源为业务页、草稿为 fresh。
- 完成：生产排程页继续不显示 `打印单据` 或 `加工合同打印`；`加工合同打印` 不再作为生产、库存、质检、财务等模块的通用动作。
- 完成：`style:l1` 在 `business-formal-module-shells-desktop` 场景补委外订单页断言：未选中记录时不能打印，选中单条委外记录后允许打开加工合同打印；生产排程页断言加工合同打印缺席。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。`style:l1` 仅出现既有 Node module type warning，不影响场景结果。
- 下一步：若后续要给采购订单页加采购合同打印，也必须按采购订单自己的模板和业务来源单独接入，不回退到通用 `打印单据`。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、后端 usecase、Workflow / Fact 边界、打印模板结构、客户配置或部署；委外页当前仍是正式入口壳，打印工作台使用现有加工合同草稿入口，不落后端事实。

## 2026-06-17 16:31 CST 业务页按钮语义全局收口

- 完成：移除正式业务壳层选中操作条里的通用 `打印单据`，避免生产排程、生产进度、生产异常、质检、库存、财务等未接打印模板 / 打印工作台的页面显示不存在的打印能力；真实打印入口仍只保留在打印中心和合同打印工作台。
- 完成：正式业务壳层的 `批量删除 / 回收站 / 删除` 改为禁用说明入口，并删除对应占位批量删除弹窗、回收站弹窗和恢复按钮代码，避免前端继续伪造无领域 usecase 支撑的删除/恢复主路径。
- 完成：`style:l1` 在 `business-formal-module-shells-desktop` 场景新增生产排程页断言，检查 `打印单据` 不出现，且 `批量删除 / 回收站` 保持禁用；保留 `新建排程 / 生成生产任务` 这类生产页自身业务动作。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。`style:l1` 仅出现既有 Node module type warning，不影响场景结果。
- 下一步：若继续做按钮语义治理，按模块逐页评审主动作是否已有真实 usecase / API / 模板支撑；不要把打印、结汇、开票、出货等跨模块能力放回通用壳层。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、后端 usecase、Workflow / Fact 边界、打印模板、客户配置或部署；当前工作区仍有大量并行改动，本轮只处理 formal 壳层和 L1 断言。

## 2026-06-17 16:09 CST 弱删除入口降级

- 完成：销售订单和主数据 V1 页不再在当前操作条展示 `删除`，避免把无真实删除 API 的提示弹窗伪装成可执行动作。
- 完成：销售订单和主数据顶部 `批量删除 / 回收站` 改为禁用说明入口，文案分别指向销售订单生命周期 `取消 / 关闭`、主数据 `停用`，不再打开占位弹窗。
- 完成：删除销售订单和主数据页里不可达的批量删除 / 回收站 modal 状态与 JSX，避免隐藏占位代码继续误导后续实现；同步 `style:l1` 断言为检查禁用弱动作。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1MasterDataPage.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=material-master-header-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。
- 下一步：若继续清理当前操作条，优先评审 BOM Version 的 `查看 / 添加明细 / 激活 / 归档` 文案是否需要改成 `查看版本 / 维护明细 / 激活版本 / 归档版本`，不改变 BOM 状态机。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、后端生命周期、WorkflowUsecase、Fact usecase、客户配置或审计；销售订单 / 主数据仍保留禁用按钮作为显性说明，不实现删除或回收站。

## 2026-06-17 15:58 CST 当前操作条按钮语义收口

- 完成：按 `plush-page-design-governance` 收口当前操作条按钮语义，正式入口壳将 `关联表格` 改为 `关联单据`，将泛化 `流转` 改为 `更多操作`，下拉内用 `状态变更` 分组承接提交 / 确认 / 退回示例；打印占位文案改为 `打印单据`，避免误读为 trade-erp 的 PI / 商业发票 / 装箱单能力已接入。
- 完成：出货单事实页将 `添加明细 / 出货 / 取消` 改为 `维护明细 / 确认出货 / 取消出货`；采购入库页将 `添加明细 / 过账 / 取消` 改为 `维护明细 / 过账入库 / 取消入库`，继续表达后端 usecase 写库存事实或冲正，不把 Workflow 任务完成当成 Fact posted。
- 完成：同步 `style:l1` 出货场景按钮断言；顺手修正来源选择器空态等待和 SKU 空态文案断言，避免正式入口壳长场景继续锁旧测试口径。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/pages/ShipmentsPage.jsx src/erp/pages/V1PurchaseReceiptsPage.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、相关路径 `git diff --check` 均通过；`STYLE_L1_SCENARIOS=shipment-date-filter-desktop pnpm --dir web style:l1` 通过。
- 下一步：若继续推广 trade-erp 当前操作条经验，应按页面真实状态机逐页评审主动作和低频动作，不新增 PI、商业发票、装箱单、结汇等尚未接正式模板 / Fact 的按钮。
- 阻塞/风险：`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 已修掉来源选择器空态断言后，后续仍被本地 Vite / Playwright 预览服务抖动阻断（`ERR_CONNECTION_REFUSED`、端口占用、browser context closed），未取得该长场景绿灯；本轮不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置或打印模板能力。

## 2026-06-17 15:08 CST 状态动作更多操作文案收口

- 完成：销售订单和采购订单选中态的状态动作下拉统一改为 `更多操作`，下拉内增加 `状态变更` 分组，继续只展示当前状态和权限允许的真实流转动作。
- 完成：同步业务模块标准页 To Implement 原型，把原型当前操作区的 `流转` 示例改为 `更多操作` 打开态，并在 README 写清状态类动作默认按“主状态动作 + 更多操作 / 状态变更”收口。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1PurchaseOrdersPage.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`node --test web/src/erp/utils/masterDataOrderView.test.mjs`、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、静态原型 Playwright 桌面 / 390px 盒模型检查、相关路径 `git diff --check` 均通过。
- 下一步：若后续要推广到更多 V1 事实页面，先按页面状态机和 RBAC 判断主动作与低频动作，不提前抽象成通用状态组件。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单、后端状态机、WorkflowUsecase、Fact usecase 或客户配置；目标 ESLint 扫 `styleL1.mjs` 时仍会命中当前脚本里既有未使用 helper 等问题，本轮用 `node --check` 和实际 L1 场景覆盖脚本改动。

## 2026-06-17 13:20 CST docs 入口重治理

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 重新治理 `docs/README.md`，把主视图从规则和长入口列表改成读者任务路由、文档地图、可视化图索引、文档写法、索引同步、文件名 / metadata 和产品内入口边界。
- 完成：同步 `docs/文档清单.md` 中 `docs/README.md` 的用途描述，从“文档目录说明”调整为“文档入口与治理”，保持清单和 H1 口径一致。
- 验证：活跃 `docs/README.md` / `docs/文档清单.md` / 根 `README.md` 无旧标题和旧 imported-notes 入口残留；活跃长期 Markdown 文件名治理检查通过；`git diff --check -- docs/README.md docs/文档清单.md` 通过。
- 下一步：如继续治理，应优先按目录补强 `docs/product/README.md`、`docs/architecture/README.md` 或客户目录 README 的读者路径，不做整树重命名或 archive/reference 改写。
- 阻塞/风险：该子任务为 docs-only，不改 AGENTS、schema、migration、RBAC、菜单、Workflow / Fact usecase、部署脚本或前端运行时；当前主线后续已进入 runtime/API/UI/原型混合批次时，不能把这条过程记录当作提交范围说明。

## 2026-06-17 13:31 CST docs 目录 README 第一批治理

- 完成：修复 active docs 中 2 处旧 `docs/reference/imported-notes/...` 引用，改为当前 `docs/reference/第一次20260519/...` 路径。
- 完成：重构 `docs/product/README.md`、`docs/architecture/README.md`、`docs/customers/README.md`、`docs/customers/yoyoosun/README.md`、`docs/workflow/README.md`、`docs/roles/README.md`、`docs/finance/README.md`、`docs/warehouse/README.md`、`docs/observability/README.md`，统一补读者路径、文档分组或真源边界，减少模板化负面清单。
- 完成：同步 `docs/archive/README.md` 的当前真源路径和近期 progress 归档索引；同步 `docs/文档清单.md` 补漏列的 `audit-log-page-v1` 原型 README 和 3 个近期 progress 归档。
- 验证：active docs 旧英文真源路径 / 旧清单名扫描无残留；`docs/**/*.md` 与 `docs/文档清单.md` 对账无漏列；活跃长期 Markdown 文件名治理检查通过；相关路径 `git diff --check` 通过。
- 下一步：第二批可治理高频长文档，例如 `docs/product/产品能力进度台账.md`、`docs/product/产品能力证据详情.md`、`docs/product/prototypes/README.md` 或 yoyoosun 导入系列；仍应逐批做，不重写 archive/reference 正文。
- 阻塞/风险：该子任务为 docs-only，`AGENTS.md` 只读未改；不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、部署脚本、前端运行时或客户原始资料；当前主线后续已进入混合批次时，不能把这条过程记录当作提交范围说明。

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

## 2026-06-17 13:18 CST 来源选择器设计治理复审

- 完成：按 `plush-page-design-governance` 重新评估来源选择器当前运行态和原型口径，确认页面主任务是“筛选候选来源、确认已选来源、导入回父弹窗”，不承担出货余量、库存或事实过账判断。
- 完成：把已选摘要改为固定区域：打开选择器时显示“未选择来源”，选中后同一位置展示已选 chip 和清空入口，清空后恢复未选择状态；表格不会因选中后插入摘要而下跳。
- 完成：移除 footer 中重复的候选总数，footer 只保留取消 / 导入动作；候选总数继续交给表格分页 `showTotal`，减少重复扫描点。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`node --test web/src/erp/config/devPrototypes.test.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1PurchaseOrdersPage.jsx src/erp/pages/ShipmentsPage.jsx`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。
- 下一步：若进入出货导入二阶段，先补后端可出运余量 / 已出货扣减 / 库存预警真源，再在同一个第二层选择器内增加分步，不新增第三层弹窗。
- 阻塞/风险：本轮只改来源选择器 UI 层、样式和回归断言；不改 schema、migration、RBAC、菜单、WorkflowUsecase、Shipment Fact、库存预占或客户专属逻辑。

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

## 2026-06-17 13:31 CST 业务页本页协同入口复审

- 完成：按 `plush-page-design-governance` 复审共享业务页协同入口，将折叠态收口为标题、Workflow-only 边界短句、当前记录 / 待办 / 阻塞唯一摘要和展开按钮；移除右侧重复 `任务 / 待办 / 阻塞` tag，未选中记录时不再展示空的“当前记录 未选择”占位。
- 完成：展开态改为紧凑分段 tab，删除 tab 与任务列表之间的重复说明行，默认展开高度从 320px 收紧到 260px、最小高度 240px；保留桌面拖拽调整高度、键盘调整和任务列表内部滚动。
- 完成：补齐同一共享组件里已有 Workflow 任务处理 drawer 的渲染接线，协同任务的完成 / 阻塞 / 催办按钮继续只处理 Workflow 任务，不写库存、出货、财务、开票或收付款事实。
- 完成：新增 `style:l1` 小场景覆盖供应商桌面、暗色客户、采购订单选中记录和 390px 移动业务页；断言默认 / 展开 / 收起恢复、当前记录摘要、重复计数移除、紧凑 tab、高度拖拽、横向溢出和相邻区域。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/components/business-list/BusinessListLayout.jsx`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web test`（323 tests）、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-module-dark-customers-desktop,business-collaboration-purchase-selected-desktop,business-collaboration-mobile pnpm --dir web style:l1` 均通过。
- 下一步：若后续要把业务页协同任务动作进一步统一到任务中心抽屉，应单独评审业务页协同与 `/erp/task-board` 的复用边界；不要把业务页协同入口扩成事实编辑器。
- 阻塞/风险：本轮不改菜单、路由、RBAC 权限码、schema、migration、WorkflowUsecase、Fact usecase 或客户配置；当前工作区存在大量非本轮文档、采购、来源选择器和原型改动，本轮未回退、格式化或纳入这些现场。`pnpm --dir web lint` 会执行全量 `eslint --fix`，为避免改动并行现场，本轮未运行全量 lint。

## 2026-06-17 13:20 CST 业务看板加载失败 toast 修复

- 完成：复现 `/erp/business-dashboard` 首屏在 React 开发态重复 effect 下并发触发两轮 `business.dashboard_stats` / `workflow.list_tasks`，第二轮命中 429 后留下“加载业务看板失败”toast；业务看板数据接口本身带管理员 token 可正常返回。
- 完成：`BusinessDashboardPage` 的 `loadDashboardStats` 增加 in-flight promise 去重，首屏加载、StrictMode 复跑和壳层刷新在同一轮加载中复用同一个请求，避免重复打到后端限流；不改业务看板投影口径、Workflow 任务读取权限或后端限流策略。
- 验证：`cd server && go test ./internal/service`、`cd server && go test ./internal/biz`、`cd web && pnpm exec eslint --ext .jsx src/erp/pages/BusinessDashboardPage.jsx`、`cd web && pnpm test`（321 tests）、`cd web && STYLE_L1_SCENARIOS=erp-business-dashboard-desktop pnpm style:l1`、相关路径 `git diff --check` 均通过；Playwright 真实页面验证业务看板可见、无失败 toast、无 429、无 console error / warn。
- 下一步：如后续其他看板中心页面也出现同类开发态重复请求限流，再按页面 loader 或共享 hook 收口 in-flight 去重，不把后端限流放宽作为默认修复。
- 阻塞/风险：本轮只改业务看板前端加载去重；不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、后端 JSON-RPC 或部署。当前工作区存在其他非本轮前端 / 原型改动，本轮未回退或整理。

## 2026-06-17 13:21 CST 任务处理抽屉导引降密度

- 完成：按 `plush-page-design-governance` 重新评估任务处理抽屉，结论是上一版方向正确但解释层过重；将“处理步骤”和“Workflow / Fact 边界”合并为一个紧凑处理导引，保留 4 个任务摘要字段、3 步短路径、固定底部动作和原因输入状态。
- 完成：同步 `task-command-center-v1` 原型与 README，明确步骤提示和 Workflow / Fact 边界不再拆成多张说明卡；原型仍为 To Implement，不提升为 Current，也不替代真实 Workflow API / RBAC。
- 完成：补强 `style:l1` 任务抽屉断言，检查导引区、步骤、边界提示、底部动作、原因输入、横向溢出；同时为业务表单弹窗关闭补恢复态等待，避免长场景中 modal 未隐藏就点击后续分段。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`（321 tests）、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-dark-wide-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=erp-dashboard-dark-desktop pnpm --dir web style:l1` 均通过；全量 `pnpm --dir web style:l1` 多次受当前工作区 HMR / dev server 重启干扰未取得完整绿灯，失败场景均已单独复跑通过。
- 下一步：如果继续优化任务处理体验，应优先评审抽屉动作是否抽为共享组件供业务页协同面板复用；不要扩成业务事实编辑器。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户定制或真实业务事实；当前工作区存在非本轮并行改动，本轮未回退或纳入这些现场。

## 2026-06-17 13:36 CST 共享任务处理抽屉与采购协同动作

- 完成：新增共享 `WorkflowTaskActionDrawer`，把任务摘要、处理导引、Workflow / Fact 边界、完成 / 阻塞 / 催办动作和原因输入从 `DashboardPage` 抽出；任务板继续复用同一套 className 和视觉结构。
- 完成：`CollaborationTaskPanel` 接入共享抽屉入口，只有调用方显式传 `onCompleteTask / onBlockTask / onUrgeTask` 时才显示动作按钮；默认业务页仍只展示协同任务，不凭空新增处理能力。
- 完成：采购订单页把本页协同动作接到 `workflow.update_task_status / workflow.urge_task`：完成、阻塞和催办只刷新 Workflow 任务，不改采购订单生命周期，不写库存、质检、应付、发票或付款事实；按钮显隐仍按 `workflow.task.complete / workflow.task.update` 权限判断。
- 验证：目标 ESLint（不带 fix）、`pnpm --dir web css`、`node --test web/src/erp/utils/businessCollaborationTasks.test.mjs web/src/erp/utils/workflowTaskBoard.test.mjs web/src/erp/utils/workflowDashboardStats.test.mjs`（24 tests）、`pnpm --dir web test`（324 tests）、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-dark-wide-desktop,purchase-order-date-filter-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。
- 下一步：若要把同一套协同动作扩到销售订单、BOM 或其他业务页，必须先确认这些页面已经有真实 workflow task 来源和动作权限，不在空任务或 mock 页面里显示处理按钮。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单、WorkflowUsecase、Fact usecase 或客户配置；当前工作区存在大量非本轮并行改动和未跟踪文件，本轮未回退、格式化或纳入这些现场。

## 2026-06-17 13:35 CST 来源导入已选折叠弹层

- 完成：补齐共享 `SourceImportPickerModal` 的已选摘要折叠交互，`+N` 不再只是静态 Tag，支持 hover / click / focus 打开 Popover 并展示全部已选来源；弹层内 chip 可换行并限制最大宽度 / 高度，避免长编码横向撑出。
- 完成：采购订单材料导入的已选标签优先使用材料编码 `code`，并把 `style:l1` mock 材料扩到 6 条，用采购来源导入场景覆盖 `+2` 展开、全部 6 条可见、弹层无横向溢出、清空恢复和单选导入主路径。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx src/erp/pages/V1PurchaseOrdersPage.jsx`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、相关路径 `git diff --check` 均通过。
- 下一步：若后续来源数据改为远程分页，继续沿用当前 selected snapshot 思路，把跨页已选来源独立缓存到选择器状态，不依赖当前页 `rows` 映射。
- 阻塞/风险：三场景联跑在进入导入弹窗前失败于 `purchase-order-date-filter-desktop` 的刷新入口断言（当前检测到 0 个刷新按钮），与本轮 `+N` 弹层无关；本轮未改后端出运余量、库存预警、schema、migration、RBAC 或 Fact usecase。

## 2026-06-17 13:42 CST 来源导入已选折叠阈值

- 完成：将共享来源导入弹窗的已选摘要可见 chip 上限从 4 个收口为 2 个，选到第 3 条即显示 `+1`；继续通过 Popover 展示全部已选来源。
- 完成：`style:l1` 采购导入回归同步覆盖两个边界：3 条已选显示 `+1` 且弹层含 3 条，6 条已选显示 `+4` 且弹层含 6 条；清空恢复和单选导入主路径保持不变。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1` 均通过。
- 下一步：如果后续不同来源导入弹窗对已选摘要密度有明显差异，再评审是否把可见上限做成共享组件 prop；当前保持统一阈值，避免每个页面各自定义。
- 阻塞/风险：本轮只改前端摘要展示阈值和回归断言，不改导入数据、后端余量、库存、schema、migration、RBAC、Workflow 或 Fact 规则。

## 2026-06-17 13:48 CST 来源导入分页显性化

- 完成：共享来源导入弹窗默认单页候选行数从 8 调整为 5；只要存在候选记录就显示分页和总数，6 条候选会展示 `1-5 / 共 6 条` 和第 2 页，不再让用户误判没有分页设计。
- 完成：`style:l1` 来源导入 helper 增加分页存在和总数断言；选择多条来源时会从第 1 页翻到后续页查找目标行，覆盖跨页已选缓存、`+N` 弹层全量展示、清空恢复和回到第 1 页单选导入。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1` 均通过。
- 下一步：后续如果来源列表改为远程分页，应沿用当前跨页 selected snapshot 设计，把当前页数据和已选快照分开；不要让翻页丢失已选 chip。
- 阻塞/风险：本轮只改前端选择器分页展示和回归脚本；不改后端远程分页、库存余量、出货校验、schema、migration、RBAC、Workflow 或 Fact 规则。

## 2026-06-17 13:55 CST 来源导入分页固定区域

- 完成：来源导入弹窗不再依赖 AntD Table 内置分页；表格改为只渲染当前页数据，底部新增固定分页区域，空结果也保留总数位置并显示 `共 0 条`。
- 完成：跨页选择开启 `preserveSelectedRowKeys`，避免从第 1 页选到第 2 页时已选 key 被当前页数据覆盖；已选摘要继续依赖 selected snapshot，不依赖当前页 rows。
- 完成：`style:l1` 增加空搜索回归，断言空态、固定分页区域、`共 0 条` 和无横向溢出；采购来源导入场景继续覆盖跨页选 6 条、`+N` 弹层、清空恢复和单选导入。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1` 均通过。
- 下一步：暂无；后续远程分页接入时继续复用固定分页区域和 selected snapshot，不把已选状态绑到当前页。
- 阻塞/风险：本轮只改前端选择器分页区域、跨页选择保持和回归脚本；不改后端分页 API、库存余量、出货校验、schema、migration、RBAC、Workflow 或 Fact 规则。

## 2026-06-17 14:02 CST 来源导入列省略号收口

- 完成：共享来源导入弹窗的列默认值从 `ellipsis: true` 改为 `ellipsis: false`，材料编码、SKU 编码、销售订单号等来源识别字段不再被默认截成省略号。
- 完成：保留列级显式 `ellipsis` 能力；后续只有备注、长描述等辅助长文本确实需要截断时，才由具体列显式声明。
- 完成：`style:l1` 来源导入 helper 增加 `ant-table-cell-ellipsis` 断言，避免关键来源列再次被共享默认省略。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1` 均通过。
- 下一步：如果后续发现某个来源导入列确实过长，应优先调列宽或横向滚动；只有辅助字段才显式 `ellipsis: true`。
- 阻塞/风险：本轮只改前端来源导入表格展示规则和回归断言，不改导入数据、后端分页、schema、migration、RBAC、Workflow 或 Fact 规则。

## 2026-06-17 13:35 CST 入库管理 V1 页面接入

- 完成：将 `/erp/warehouse/inbound` 从正式入口壳切换为采购入库 V1 页面，接入 `purchase` JSON-RPC 的 `list/create draft/add item/post/cancel` 主路径；页面支持状态 / 关键词筛选、单选当前入库单、展开明细、新建草稿、草稿加行、过账和取消已过账冲正。
- 完成：新增前端 `purchaseApi.mjs` 和源代码级 API 测试，明确采购入库 client 只暴露 purchase receipt 方法，不混入质检、库存调整或财务动作。
- 完成：修正入库单 / 明细弹窗表单初始化时序，避免 `setFieldsValue` 早于对应 Form 挂载导致 AntD `useForm is not connected` 运行时告警。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、产品能力台账 / 证据详情、正式菜单运行时拆分和正式产品入口计划；`入库管理` 升为 UI Ready，但仍不代表质检判定、库存台账、采购退货 / 调整、采购订单余额或财务应付已完成。
- 验证：`node --check web/src/erp/api/purchaseApi.mjs`、`node --test web/src/erp/api/purchaseApi.test.mjs`、定向 `pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/api/purchaseApi.mjs src/erp/api/purchaseApi.test.mjs src/erp/router.jsx src/erp/config/businessModules.mjs`、`pnpm --dir web css`、`pnpm --dir web test`（324 tests）、相关路径 `git diff --check` 均通过；一次性 Playwright 回归覆盖桌面默认 / 选中 / 添加明细弹窗 / 新建入库单弹窗 / 恢复态和 390px 默认态，断言无正式入口壳文案、无横向溢出、无 console/page error。
- 下一步：优先拆来料质检 API/UI；库存台账可以作为后一轮只读视图接入，不要把质检判定或库存台账塞进入库页面。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC 权限码、采购订单余额、质检判定、库存台账、采购退货 / 调整、财务或生产；明细表单中的仓库 / 单位暂按现有后端能力使用 ID 输入，未假造选择器。

## 2026-06-17 13:40 CST 销售 / 采购订单状态动作收口

- 完成：按 `plush-page-design-governance` 将销售订单和采购订单选中态的生命周期按钮从横排多按钮收口为“主状态动作 + 更多”下拉；草稿态主动作显示 `提交`，`取消` 进入下拉，后续状态按当前生命周期规则展示生效 / 审核 / 关闭。
- 完成：前端共享 `masterDataOrderView` 增加销售 / 采购订单可执行生命周期动作判断，只展示真实状态流转动作，不把终态 no-op 或跨级状态动作露成可点击入口；`关闭 / 取消` 通过确认弹窗执行，不新增 API 不支持的原因字段。
- 完成：补强 `style:l1` 业务页断言，覆盖销售订单和采购订单选中态的动作收口、下拉菜单、按钮文本、相邻区域和横向溢出。
- 验证：`pnpm --dir web exec eslint --ext .js --ext .jsx src/`、`pnpm --dir web css`、`pnpm --dir web test`（324 tests）、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过。
- 下一步：若后续要把同一状态动作模式抽成共享组件，应等更多正式 V1 页面复用后再评审，避免过早抽象。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、菜单、后端状态机、WorkflowUsecase、Fact usecase、客户配置或文档真源；当前工作区已有大量非本轮并行改动，本轮未回退或纳入这些现场。`pnpm --dir web lint` 会自动 `eslint --fix`，为避免格式化并行现场，本轮改用全量 ESLint 无 fix 校验。

## 2026-06-17 15:17 CST 本页协同拖拽手柄 hover 修复

- 完成：修正本页协同展开态顶部拖拽手柄，默认保持静态短线，hover 只显示上下拖拽光标提示，不加粗、不变背景、不改变面板高度；只有实际 pointer down 拖拽时才进入 `--dragging` 视觉态。
- 完成：将浅色手柄短线调整为 56px × 3px 且移除阴影，命中区恢复到 16px，暗色模式同步使用低强调短线；保留拖拽调整高度、键盘方向键调整高度、焦点 outline 和任务列表内部滚动。
- 完成：补强 `style:l1` 本页协同断言，锁定桌面默认 cursor 为 `default`、hover cursor 为 `ns-resize`，且 hover 前后背景 / 短线颜色 / 短线高度 / 面板高度不变，同时继续覆盖桌面向上 / 向下拖拽和收起恢复。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web exec eslint --ext .jsx src/erp/components/business-list/BusinessListLayout.jsx`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-module-dark-customers-desktop,business-collaboration-purchase-selected-desktop,business-collaboration-mobile pnpm --dir web style:l1` 均通过。
- 下一步：暂无；若后续觉得手柄仍过强，应继续只调本页协同手柄 token，不扩大到业务页整体布局。
- 阻塞/风险：本轮只改协同手柄样式和 L1 回归，不改 schema、migration、菜单、RBAC、WorkflowUsecase、Fact usecase 或客户配置。`pnpm --dir web exec eslint scripts/styleL1.mjs` 会命中该脚本既有未使用 helper / no-undef 存量问题，本轮未借样式修复扩大清理；未运行会自动 `eslint --fix` 的全量 `pnpm --dir web lint`。

## 2026-06-17 13:55 CST 主业务列表表头排序全局收口

- 完成：新增 `moduleTableColumns` 业务主表排序 helper，支持 `dataIndex`、点路径、`sortValue(record)`、数字 / 日期 / 布尔 / 文本比较和空值排最后；主业务列表页统一通过 `applyBusinessColumnSorters` 接入，已有手写 sorter 保持原样。
- 完成：补齐采购入库、采购订单、BOM、出货单等主表漏配排序的列；备注长文本显式标记为不排序，表单内明细、回收站、导入选择弹窗和 dashboard 汇总表不纳入“全局主列表排序”范围。
- 完成：`moduleTableColumns.test.mjs` 增加排序 helper 单测和主业务列表页静态守卫；`style:l1` 增加主业务表排序入口断言，覆盖材料档案、采购订单、出货单和综合业务页链路。
- 验证：`pnpm --dir web exec node --test src/erp/utils/moduleTableColumns.test.mjs`、触达文件 ESLint、`pnpm --dir web test`（328 tests）、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=material-master-header-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check` 均通过。
- 下一步：后续新增正式 V1 主表时直接使用 `applyBusinessColumnSorters`，并为复杂展示列提供 `sortValue`；不要把备注、附件、操作列或表单内明细行强行纳入全局排序。
- 阻塞/风险：本轮不改 schema、migration、后端查询排序、RBAC、菜单、WorkflowUsecase、Fact usecase 或客户配置；排序仍只影响当前前端表格展示和导出行顺序。当前工作区存在大量非本轮并行改动和未跟踪文件，本轮未回退、删除或整理这些现场。

## 2026-06-17 15:34 CST 来料质检 V1 页面接入

- 完成：新增 `quality` JSON-RPC 外部域，支持 `list/create draft/submit/pass/reject/cancel/get` 来料质检主路径；后端列表读模型支持状态、判定、关键词和分页筛选，并复用既有 QualityUsecase 批次状态联动规则。
- 完成：新增来料质检 JSON-RPC 测试，覆盖提交后批次 `HOLD`、合格 / 让步恢复 `ACTIVE`、不合格置 `REJECTED`、草稿取消、权限拒绝，以及质检状态变化不新增 `inventory_txns`。
- 完成：新增前端 `qualityApi.mjs`、`/erp/production/quality-inspections` V1 页面、路由和业务模块配置；页面支持列表筛选、单选当前质检单、新建草稿、提交、判定合格 / 让步、不合格和取消。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、产品能力台账 / 证据详情、正式产品入口计划和正式菜单运行时拆分清单；`来料质检` 不再归为正式入口壳，但仍不代表质检明细、缺陷字典、抽检方案、采购退货自动生成或 Workflow 自动闭环已完成。
- 验证：`go test ./internal/biz ./internal/data ./internal/service -count=1`、`node --test web/src/erp/api/qualityApi.test.mjs`、定向 `pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1QualityInspectionsPage.jsx src/erp/api/qualityApi.mjs src/erp/api/qualityApi.test.mjs src/erp/router.jsx src/erp/config/businessModules.mjs`、`pnpm --dir web css`、`pnpm --dir web test`（330 tests）、相关路径 `git diff --check` 均通过；一次性 Playwright 回归覆盖桌面默认 / 选中 / 新建质检单弹窗 / 判定合格弹窗 / 判定不合格弹窗 / 恢复态和 390px 默认态，断言无正式入口壳文案、无横向溢出、无 console/page error。
- 下一步：优先在库存方向拆只读库存台账，或在采购方向拆采购退货 / 调整 V1；不要把采购退货、库存流水或财务应付塞进来料质检页面。
- 阻塞/风险：本轮不改 schema、migration 或新增更细的 submit / pass / reject / cancel 独立权限码；质检单明细、缺陷字典、抽检方案、采购退货自动生成、质检与 Workflow 自动闭环、本地或客户真实数据导入 / backfill 均未做。新建质检单里的采购入库单、入库行、批次、材料、仓库和检验员暂按现有后端能力使用 ID 输入，未假造选择器。

## 2026-06-17 15:52 CST 主业务列表排序规则写入正式约定

- 完成：在 `AGENTS.md` 前端与样式规则中补充主业务列表排序约定：数据列默认可排序，复杂展示列用共享 helper 或 `sortValue(record)` 提供稳定排序值，备注 / 附件 / 操作 / 选择 / 明细 / 导入弹窗 / 回收站 / dashboard 汇总表不强制排序。
- 完成：在 `docs/当前真源与交接顺序.md` 补充当前排序范围边界，明确表头排序只影响当前页面展示和导出行顺序，不改变领域表写入顺序、后端事实顺序或业务状态。
- 验证：`AGENTS.md` 项目级规则和 `docs/当前真源与交接顺序.md` 真源口径更新本身不改运行时代码；但当前主线现场包含 schema、API、UI、原型和文档治理混合改动，不应按普通 docs-only 清理评审。
- 下一步：后续新增正式 V1 主业务表时按该规则接入 `applyBusinessColumnSorters`，并用现有单测 / L1 守卫避免漏配。
- 阻塞/风险：`AGENTS.md` 的主业务列表排序规则属于长期项目级规则，保留；它不是普通 docs 清理。当前工作区存在大量 schema、API、UI、原型、客户配置和文档改动，本记录不代表只需 docs-only 验收。

## 2026-06-17 15:52 CST 主业务列表排序规则软化

- 完成：将 `AGENTS.md` 中“不得各页随意漏配”的表述软化为“优先接入排序；确实没有稳定比较口径时，必须显式标记不排序并说明原因”，避免后续为了满足规则伪造排序。
- 验证：该调整只改变项目级规则措辞；当前主线现场仍是文档治理 + runtime/API/UI/原型改动混合批次，不能按普通 docs-only 清理收口。
- 下一步：后续主表新增复杂列时按实际展示口径提供 `sortValue(record)`；若无法稳定比较，保留显式不排序和原因说明。
- 阻塞/风险：`AGENTS.md` 排序规则按长期项目级规则保留；提交或评审时需要和 runtime/API/UI/原型改动一起按混合批次说明验证边界。

## 2026-06-17 16:03 CST 库存台账只读 V1 页面接入

- 完成：新增 `inventory` JSON-RPC 外部域，支持 `list_inventory_balances`、`list_inventory_lots`、`list_inventory_txns` 三个只读列表；后端 repo / usecase 支持对象、仓库、批次、状态、流水类型、来源和关键词筛选，并继续由既有库存事实 usecase 写入库存流水、余额和批次状态。
- 完成：新增前端 `inventoryApi.mjs`、`/erp/warehouse/inventory` 只读 V1 页面和路由；页面提供库存余额、库存批次、库存流水三个 tab，支持筛选、分页、单选当前记录和刷新，不提供新建、调整、出库、预留或批次状态写入入口。
- 完成：将库存台账从正式入口壳切换为 `formal-v1`，删除库存的 formal-shell 表单字段残留；`style:l1` 业务综合场景同步改为只读库存台账断言，并补 `rpc/inventory` mock 覆盖余额 / 批次 / 流水三类数据。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、产品能力台账 / 证据详情、正式产品入口计划和正式菜单运行时拆分清单；库存能力升为只读 UI Ready，不代表库存调整、出库确认、可用量 / 预留量聚合、批次状态变更 API 或 reservation 自动消耗已完成。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1`、`node --check web/scripts/styleL1.mjs && node --check web/src/erp/api/inventoryApi.mjs`、定向 `pnpm -C web exec eslint --ext .js --ext .jsx src/erp/pages/V1InventoryLedgerPage.jsx src/erp/api/inventoryApi.mjs src/erp/api/inventoryApi.test.mjs src/erp/utils/businessModuleNavigation.test.mjs src/erp/router.jsx src/erp/config/businessModules.mjs`、全量无 fix `pnpm -C web exec eslint --ext .js --ext .jsx src/`、`pnpm -C web css`、`pnpm -C web test`（332 tests）、`STYLE_L1_BASE_URL=http://127.0.0.1:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；一次性 Playwright 回归覆盖桌面默认 / 选中 / 批次 tab / 流水 tab / 390px 移动端 / 暗色模式，断言无正式入口壳文案、无写按钮、无横向溢出、无 console/page error。
- 下一步：库存方向优先评审可用量 / 预留量 read model、库存调整 V1 或出库确认 V1；不要把库存写入动作塞回只读台账页。
- 阻塞/风险：本轮不改 schema、migration、库存写入 usecase、RBAC 权限码、采购退货 / 调整、出货确认、财务或 Workflow 自动闭环；页面中的对象、仓库、批次和来源暂按现有后端能力使用 ID / 类型筛选，未假造选择器或可用量。

## 2026-06-17 16:22 CST 库存台账可用量 read model 接入

- 完成：`list_inventory_balances` 后端 read model 按同一成品、仓库、单位和批次 grain 汇总 ACTIVE `stock_reservations`，返回 `active_reserved_quantity`，并复用 `core/calc` 计算 `available_quantity = quantity - active_reserved_quantity`；材料余额和无匹配 ACTIVE 预留时保持预留量为 0，不写库存流水或预留事实。
- 完成：库存台账余额 tab 增加 `已预留`、`可用量` 两列，`style:l1` inventory mock 和断言同步覆盖 12.5 / 4 / 8.5；业务模块元数据补充 `stock_reservations` 只读来源和可用量边界。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、产品能力台账 / 证据详情、正式产品入口计划和正式菜单运行时拆分清单；正式口径改为已接 `active_reserved_quantity / available_quantity` 只读 read model，仍不代表 `hold_quantity / reserved_quantity`、预留明细、自动预留、出货预留自动消耗、库存调整或出库确认已完成。
- 验证：`go test ./internal/biz ./internal/data ./internal/service -count=1`、`node --check web/scripts/styleL1.mjs && node --check web/src/erp/api/inventoryApi.mjs`、全量无 fix `pnpm -C web exec eslint --ext .js --ext .jsx src/`、`pnpm -C web css`、`pnpm -C web test`（332 tests）、`STYLE_L1_BASE_URL=http://127.0.0.1:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；一次性 Playwright 盒模型回归覆盖库存页桌面浅色、桌面暗色和 390px 移动宽度，断言新增字段可见、页面级无横向溢出、宽表由表格内部滚动承载，暗色模式确认 `data-erp-theme=dark` 且表格使用暗色背景。
- 下一步：库存方向优先拆库存调整 V1、出库确认 V1 或预留明细 read model；不要把这些写入动作和明细能力塞回只读余额列表。
- 阻塞/风险：本轮不改 schema、migration、库存写入 usecase、RBAC 权限码、SKU 粒度预留校验、冻结量聚合、预留明细、出货自动消耗、采购退货 / 调整、财务或 Workflow 自动闭环；余额页只显示按当前 `inventory_balances` grain 可计算的 ACTIVE 预留合计。

## 2026-06-17 16:40 CST 本页协同桌面遮挡回归补强

- 完成：按“位置不变，继续做密度和交互细节”口径，补强 `style:l1` 本页协同展开态断言：桌面视口下协同面板不得和表格分页、表格工具栏、当前操作区发生矩形重叠。
- 完成：移动端仍按默认收起、不占首屏的口径回归；不把桌面“展开态不遮挡表格操作”的规则强行套到 390px 长操作区场景。
- 验证：`node --check web/scripts/styleL1.mjs`、`git diff --check -- web/scripts/styleL1.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-module-dark-customers-desktop,business-collaboration-purchase-selected-desktop,business-collaboration-mobile pnpm --dir web style:l1` 均通过。
- 下一步：暂无；如后续继续调本页协同高度、sticky、拖拽手柄或业务页底部布局，应保留这条桌面遮挡回归。
- 阻塞/风险：本轮只补 L1 回归，不改运行时 CSS / JSX、schema、migration、菜单、RBAC、WorkflowUsecase、Fact usecase 或客户配置；当前工作区仍有大量非本轮并行改动，本轮未回退或纳入。

## 2026-06-17 16:57 CST Operational Fact 正式业务入口批量接入

- 完成：将 `委外订单`、`生产进度`、`出库管理`、`应收管理`、`应付管理`、`发票管理` 和 `对账管理` 从正式入口壳切换为收窄 Operational Fact V1 页面，复用 `production_facts / outsourcing_facts / shipments / stock_reservations / finance_facts` 与 `operational_fact` JSON-RPC，不恢复旧 `business_records`。
- 完成：`OperationalFactsPage` 抽成可配置工作台，正式业务入口按模块收窄 tab、标题、创建按钮、默认 fact_type 和列表过滤；`finance_facts` 列表过滤补 `fact_type`，前后端测试和 `style:l1` mock / 断言同步覆盖。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、正式产品入口计划、正式菜单运行时拆分清单和产品能力证据详情；当前仍是入口壳的页面只剩 `生产排程`、`生产异常`、`出货放行`。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1`、`node --check web/scripts/styleL1.mjs && node --check web/src/erp/api/operationalFactApi.test.mjs`、全量无 fix `pnpm -C web exec eslint --ext .js --ext .jsx src/`、`pnpm -C web css`、`pnpm -C web test`（334 tests）、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过；L1 已覆盖委外、生产进度、出库、应收、应付、发票、对账正式入口，并额外覆盖 Operational Fact modal 的桌面暗色和 390px 移动盒模型。
- 下一步：优先评审仍未接真实领域 usecase 的 `生产排程`、`生产异常`、`出货放行`，或继续拆库存调整 / 预留明细 / 生产订单 / 委外源单 / 财务核销，不要在现有 facts 页面里伪造完整源单、放行或总账能力。
- 阻塞/风险：本轮不改 schema、migration、新增权限码、WorkflowUsecase、完整生产排程、生产异常闭环、出货放行自动扣库、完整委外合同、付款 / 收款核销、税控、总账、完整报表或客户真实数据导入；页面仍以现有 ID 输入和事实表最小字段为边界。

## 2026-06-17 17:25 CST 工序档案 MasterData 接入

- 完成：新增 `processes` Ent schema、Atlas migration、generated code、MasterData repo/usecase、`masterdata` JSON-RPC 和 `process.*` RBAC；工序类别保持自由文本，字段只表达工序档案、可委外 / 可内制 / 需质检标记、排序和启停，不写死截图里的少数工序。
- 完成：新增 `/erp/engineering/processes` 工序档案 V1 页面、前端 API、路由、业务模块元数据、后端内置菜单、yoyoosun 客户菜单和毛绒行业模板入口；页面支持列表、搜索、新建、编辑、启停和导出。
- 完成：`seed-core-demo-data` 增加带 `SIM-PLUSH-CORE` 前缀的演示工序：车缝、制作刀模、裁片IQC、机裁、丝印、贴合；这些只作为可维护演示资料，不生成委外订单、生产任务、库存流水、质检事实或财务事实。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、正式产品入口计划、业务主链路字段来源规则、产品能力台账 / 证据详情、yoyoosun 客户交付矩阵、导入字段分类和导入配置草案；导入中的加工项目 / 工序名称 / 工序类别只进入 `processes` 主数据候选，不自动创建委外源单或事实。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service`、`cd server && go test ./cmd/seed-core-demo-data`、`cd server && make data`、`cd web && pnpm test`（334 tests）、本轮前端文件定向 ESLint、`cd web && pnpm css`、`git diff --check` 均通过；临时 Playwright 回归覆盖工序页桌面默认态、表格数据、新建弹窗字段、可委外标记和横向溢出。`make migrate_status` 显示本地 dev DB 还有 `20260617085305` 这 1 个 pending migration，说明迁移文件已生成但未 apply。
- 下一步：后续如要继续做委外，应单独评审委外源单 / 加工合同源单、工序路线、发料 / 回货带值、工序质检和应付结算，不要把这些事实能力塞进工序档案。
- 阻塞/风险：全量 `pnpm lint` 当前被本轮未触达的 `OperationalFactsPage.jsx` 现场错误阻塞（未使用变量、缺少 `decimalNumber / formatQuantity` 引用）；全量 `style:l1` 当前也在 `business-formal-module-shells-desktop` 等不到“委外订单”标题，和同一未触达 Operational Fact 现场相关。本轮没有回退或修正这些并行现场。

## 2026-06-17 17:26 CST Operational Fact 入口批量接入验证收口

- 完成：修正 `OperationalFactsPage.jsx` 的选中态、排序、操作区、业务表单 modal class 和长表单滚动样式，清除前一条 progress 中提到的 Operational Fact 页面 lint / L1 阻塞。
- 验证：`pnpm -C web exec eslint --ext .js --ext .jsx src/`、`pnpm -C web css`、`pnpm -C web test`（334 tests）、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；L1 覆盖桌面浅色业务入口、Operational Fact modal 桌面暗色和 390px 移动盒模型。
- 下一步：仍优先单独评审 `生产排程`、`生产异常`、`出货放行` 的真实 usecase；不要把源单、放行、核销、税控或总账能力塞进现有 operational fact 页面。
- 阻塞/风险：本轮没有运行 `make migrate_status`，也未 apply 并行工序档案 migration；当前工作区仍包含大量并行改动和未跟踪文件，本轮未回退或整理这些现场。

## 2026-06-17 17:26 CST 委外订单页 V1 业务页样式重构

- 完成：将 `OperationalFactWorkspace` 从旧 `erp-dashboard` 自绘卡片 / 行内操作列，收口到现有 `BusinessPageLayout`、`PageHeaderCard`、`BusinessOperationPanel`、`SelectionActionBar` 和 `BusinessDataTable`；委外订单、生产进度、出库管理和财务 facts 同源页面统一为“筛选 + 选中当前记录 + 当前操作区 + 主表扫描”的 V1 业务页模式。
- 完成：移除主表右侧行内操作列，过账、取消、发货、释放 / 消耗预留、结清等动作保留在选中记录后的当前操作区；主表列补齐排序口径、长来源省略、数量格式化和空值稳定展示，减少委外页右侧挤压和来源长文本外溢。
- 完成：新建事实、出货行弹窗接入 `erp-business-action-form` 网格字段样式和业务弹窗标题说明；页头补当前视图标签，避免单视图页面隐藏 tab 后丢失“委外发料 / 回货事实”等业务上下文。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`（334 tests）、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 和完整 `cd web && pnpm style:l1`（56 场景）均通过。
- 下一步：后续若继续做委外完整源单 / 加工合同源单，应单独评审 schema、API、RBAC、打印带值、工序路线、发料 / 回货和应付结算，不要在本轮 facts 页面里伪造完整合同管理。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或后端接口；当前页面仍是 Operational Fact 最小事实入口，不代表完整委外源单、完整加工合同、委外质检、应付结算或真实客户数据导入已交付。工作区存在大量非本轮并行改动，本轮未回退、整理或纳入。

## 2026-06-17 17:43 CST 入口文档跳转与混合批次边界收口

- 完成：根 `README.md` 文档索引和 `docs/README.md` 高频读者路径改为可点击 Markdown 链接，只覆盖入口文档的关键跳转，不做全仓机械链接化。
- 完成：将 15:52 主业务列表排序规则记录从普通 docs-only 口径改为“项目级 `AGENTS.md` 规则 + 当前主线混合批次边界”，明确本轮提交 / 评审不能误按普通文档清理处理。
- 完成：`AGENTS.md` 主业务列表排序规则保留为长期项目级规则；本轮只补最终说明边界，不回退该规则，也不把它解释成普通 docs 清理。
- 验证：`git diff --check` 通过；本地 Markdown 链接存在性检查通过；关键 `rg` 扫描确认活跃入口文档无旧标题、旧 `imported-notes` 入口或误导性 docs-only 口径新增残留，命中仅剩 `progress.md` 历史过程记录和本条说明。
- 下一步：若继续治理入口跳转，按目录逐批补高频 Markdown 链接；不要把 archive / reference 正文、全仓历史文件或所有代码路径机械链接化。
- 阻塞/风险：当前工作区仍是文档治理 + runtime/API/UI/原型/客户配置/schema 混合现场，本轮不改运行时代码、schema、migration、RBAC、菜单、原型状态或客户配置语义；完整提交前仍需按混合批次执行对应测试和状态核对。

## 2026-06-17 17:45 CST 委外订单补加工合同打印入口

- 完成：在 `OperationalFactsPage` 的委外视图当前操作区补回 `加工合同打印` 按钮，按钮沿用现有 `PROCESSING_CONTRACT_TEMPLATE_KEY` 打开打印工作台，默认按 business entry + fresh draft 进入，不写委外事实、不生成合同源单、不做页面局部字段拼装。
- 完成：按钮默认未选中委外事实时禁用，选中当前记录后启用；`business-formal-module-shells-desktop` L1 场景同步断言按钮存在、默认禁用、选中后启用，并保留旧壳按钮 `生成委外合同` / `打印单据` 不出现。
- 完成：修正 `style:l1` 中 `waitForScenarioDocumentReady` 的 `catch` 未绑定 `error` 问题，避免全量回归在页面等待失败时被脚本自身的 `error is not defined` 遮住真实原因。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`（335 tests）、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`git diff --check -- web/src/erp/pages/OperationalFactsPage.jsx web/scripts/styleL1.mjs progress.md` 均通过。
- 下一步：如要让打印模板自动带出供应商、工序、数量、单位、仓库或源单信息，应单独评审委外源单 / 加工合同源单字段真源和映射规则，不在 Operational Fact 页面临时拼合同草稿。
- 阻塞/风险：完整 `pnpm style:l1` 曾在 4173 被现有 `pnpm start` 端口现场阻塞；改用 `STYLE_L1_PORT=4174 pnpm style:l1` 后继续运行到 `business-collaboration-purchase-selected-desktop`，失败原因是采购页协同面板展开态与分页矩形重叠，非委外按钮场景。本轮未顺手修改共享协同面板或采购页布局。

## 2026-06-17 18:20 CST 明细字段真源与展示语义收口

- 完成：按 Fact / Workflow 边界排查采购订单、采购入库和出货单明细字段；补充 `docs/product/业务主链路数据流向与字段来源规则.md` 的当前明细字段矩阵，并在 `docs/product/README.md` 增加字段来源读者路径。
- 完成：出货行补齐 `product_sku_id` 的 usecase / JSON-RPC / repo / 前端导入 / 表格展示链路；从销售订单行导入出货明细时保留 SKU 追溯，旧数据缺 SKU 时保持空值。
- 完成：采购入库行关联 `purchase_order_item_id` 时，后端按采购订单行覆盖 `source_line_no`，避免前端旧来源行号残值继续显示成真源；前端采购入库行和出货行参数构造收口到 `businessLineItems` helper。
- 验证：`cd server && go test ./internal/service ./internal/biz ./internal/data`、`cd web && pnpm test`（337 tests）、本轮前端文件定向 ESLint、`cd web && pnpm css`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,business-formal-module-shells-desktop pnpm style:l1`、`git diff --check` 均通过；新增 Go / 前端单元测试覆盖 SKU 透传、采购入库来源行号覆盖和前端明细 helper。
- 下一步：如要继续把入库 / 出货明细从手填 ID 升级为选择器，应单独接入材料、仓库、单位、批次和来源行选择控件，并补浏览器级表单回归。
- 阻塞/风险：本轮不改 schema / migration，不补完整打印导出模板；采购入库手填明细仍允许录入材料 / 仓库 / 单位 ID，出货明细仍要求仓库 / 批次由当前动作补齐。工作区存在大量非本轮并行改动，本轮未回退或整理。

## 2026-06-17 18:55 CST 采购订单选中动作补齐

- 完成：采购订单 V1 当前操作区补 `关联`、`生成入库`、`打印合同` 动作；关联入口只导航到现有明细 / 入库 / 质检 / 库存页面，不新增跨表假筛选；按钮文案压缩并保留 `更多操作` 可访问名称，避免选中栏换行遮挡协同面板和分页。
- 完成：新增 `purchase.create_purchase_receipt_from_purchase_order` JSON-RPC 和 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder`；只允许已审核采购单生成采购入库草稿，按已存在非取消入库行扣减剩余数量，生成草稿不写库存流水，库存入账仍由入库页面过账完成。
- 完成：采购单打印采购合同时，从当前采购订单和明细构造 `material-purchase-contract` 模板草稿；只带采购单号、采购日期、预计回货、供应商和材料明细等已有字段，缺失日期 / 单位 / 联系信息不伪造值。
- 验证：`cd server && go test ./internal/service ./internal/biz`、`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly'`、`cd web && pnpm test`（335 tests）、`cd web && pnpm css`、本轮前端文件定向 ESLint、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=print-workspace-material pnpm style:l1`、`STYLE_L1_SCENARIOS=print-workspace-material-shell-refresh pnpm style:l1` 均通过。
- 下一步：如要把“入库仓库 ID”升级为仓库选择器、把关联入口按采购单号自动筛选入库 / 质检记录，需单独接入对应列表查询参数和仓库主数据选择器。
- 阻塞/风险：全量 `pnpm lint` 当前被本轮未触达且未跟踪的 `web/src/erp/utils/businessLineItems.mjs` 的 `default-param-last` 阻塞；完整 `pnpm style:l1` 一次失败在 dev server `ERR_CONNECTION_REFUSED / waitForFunction` 时序，相关采购选中态和采购合同工作台场景已单独通过。本轮未回退或整理大量并行现场改动。

## 2026-06-17 18:08 CST 委外加工合同打印草稿带值

- 完成：委外订单选中记录后打开 `加工合同打印` 时，不再进入纯空白 fresh 模板，而是通过 `buildProcessingContractDraftFromOutsourcingFact` 写入当前打印窗口的一次性业务草稿。
- 完成：草稿只带入当前 `outsourcing_facts` 可确认字段：`fact_no` 作为合同号、`supplier_name` 作为供应商 / 明细供应商别名，并把事实类型、对象、来源和备注收口到明细备注；产品、工序、单位、数量、单价和金额保持空值，避免从最小事实入口伪造完整加工合同源单。
- 验证：`node --test src/erp/data/processingContractTemplate.test.mjs src/erp/utils/masterDataOrderView.test.mjs`、`cd web && pnpm css`、`cd web && pnpm lint`、`cd web && pnpm test`（340 tests）、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 均通过。
- 下一步：如要继续完善委外，应单独评审委外源单 / 加工合同源单、工序路线、来源行选择、发料 / 回货带值、质检和应付结算；不要把这些长期事实能力塞进当前 Operational Fact 最小页。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、WorkflowUsecase、Operational Fact usecase 或打印模板结构；当前仍只能从最小委外事实带入有限快照，不代表完整委外合同管理已完成。工作区仍有大量非本轮并行改动，本轮未回退或整理。

## 2026-06-17 18:08 CST 打印草稿存储权限兜底修复

- 完成：修复业务页打开采购合同 / 加工合同打印窗口时，localStorage 写入草稿失败就直接报“浏览器无法写入打印草稿”的问题；新增当前弹窗一次性 `window.name` 草稿通道，写入失败时先打开空白弹窗、注入当前 `state` 对应草稿再跳转打印工作台。
- 完成：采购合同和加工合同工作台加载草稿时优先消费一次性弹窗草稿，并在消费后清空 `window.name`，保留原窗口级 localStorage 草稿 key、壳页和快照恢复主链不变。
- 验证：`cd web && node --test src/erp/utils/printWorkspace.test.mjs`、`cd web && pnpm lint && pnpm css && pnpm test`、`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-material-shell-refresh pnpm style:l1` 均通过；新增测试覆盖 localStorage 满额 / 阻止写入时仍可打开业务打印窗口，以及一次性草稿只匹配当前模板和窗口 `state`。
- 下一步：如需验证用户浏览器具体权限状态，可在真实浏览器里重试采购订单 / 委外订单的打印合同入口；本轮未改变打印字段映射、PDF 输出、后端事实或业务写入。
- 阻塞/风险：本轮只跑打印工作台相关 L1 场景，不跑完整 `pnpm style:l1`，因为没有改样式规则或页面布局；当前工作区仍包含大量非本轮并行改动，本轮只修改打印草稿主链相关文件和本条过程记录。
