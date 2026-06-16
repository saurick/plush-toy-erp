# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：归档截至 2026-06-15 22:42 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 428 行 / 83344 bytes，超过 80KB 阈值；本轮 BOM Version、JSON-RPC service 迁移和全量验收提交前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`：归档截至 2026-06-11 14:06 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 395 行 / 80005 bytes，接近并按项目约定视为达到 80KB 归档边界；本轮补 UI 极简不改语义规则前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-12-before-formal-menu-candidate-prototype.md`：归档截至 2026-06-12 18:29 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 425 行 / 81740 bytes，超过 80KB 阈值；本轮补正式菜单候选原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-13-before-workbench-prototype-redesign.md`：归档截至 2026-06-13 19:59 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 385 行 / 81720 bytes，达到 80KB 归档边界；本轮重做工作台原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-14-before-business-modal-alignment.md`：归档截至 2026-06-14 18:20 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 369 行 / 80362 bytes，达到 80KB 归档边界；本轮继续统一业务新建 / 编辑弹窗前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接，不再内嵌“看板中心 / 运营工具”卡片导航，也不把核心区域做成跳转入口集合；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessListLayout` 已承接正式业务页共享骨架；`客户档案`、`供应商档案` 和 `销售订单` 使用 V1 页面，`产品档案`、`BOM 管理`、采购、入库、质检、库存、委外、生产、出货和财务等 16 个 `formal-shell` 菜单统一使用 `FormalBusinessModulePage`。共享骨架已收口紧凑筛选、列表统计、列顺序、列排序、导出、批量删除、回收站、行点击选中、双击进入编辑 / 主操作弹窗、当前操作和协同入口；业务对象查看、新建和编辑统一进入业务表单弹窗，formal-shell 真实保存仍待领域 usecase / API / RBAC 接入；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、任务中心、业务管理中心、产品核心菜单覆盖矩阵、正式菜单候选导航、业务模块列表页、业务详情页、新建 / 编辑业务表单弹窗、业务页协同入口组件、局部动作弹窗和模板打印中心十一个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：`admin-command-center-v1` 是判断型工作台样板，`core-menu-coverage-v1` 是内部覆盖矩阵，`formal-menu-candidate-v1` 是正式菜单候选原型；它们都不是正式菜单、路由、权限或 seedData 映射表，真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-16 22:42 CST 工作台任务详情留白修复

- 完成：修复 `/erp/dashboard` 工作台任务详情卡片正文贴边问题，为任务详情正文、按钮区和空态增加局部容器样式；标题、字段回显和动作按钮不再贴住头部分割线或左边框，长来源编号按当前卡片宽度换行。
- 完成：补 `style:l1` 工作台布局断言，覆盖有任务正文和无任务空态两条路径，检查任务详情头部、正文 / 空态、字段和动作区不会贴边、溢出或压住相邻区域。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、目标 ESLint（不带 fix）、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-dark-desktop,erp-dashboard-mobile pnpm --dir web style:l1` 均通过。
- 下一步：如继续优化工作台视觉，应优先沿现有 `erp-workbench-*` 局部样式和 L1 断言推进，不新增冗余工作台入口或改变 Workflow / Fact 边界。
- 阻塞/风险：本轮只改桌面工作台任务详情视觉与回归脚本，不改 schema、migration、后端 API、RBAC、菜单、WorkflowUsecase 或 Fact 事实规则；`pnpm --dir web lint` 未直接执行，因为该脚本会全量 `eslint --fix` 且当前工作区已有大量并行未提交改动，本轮用目标 ESLint 避免扩大 diff。

## 2026-06-16 23:19 CST 移动任务页大文件拆分

- 完成：将 `MobileRoleTasksPage.jsx` 顶部的岗位标签、tab/filter key、任务严重度、催办权限、业务状态映射、详情事实行等纯规则迁到 `web/src/erp/mobile/utils/mobileRoleTaskModel.mjs`，页面文件从约 2531 行降到约 2122 行；新增 `mobileRoleTaskModel.test.mjs` 并接入 `pnpm test`。
- 完成：将移动岗位任务端专属 `.mobile-role-*` / `.mobile-app-layout` / `.erp-mobile-*` 样式迁到 `web/src/erp/mobile/mobileRoleTasks.css`，由岗位任务页入口导入；`app.css` 从约 12392 行降到约 11733 行，Vite 构建已拆出独立 `MobileRoleTasksPage.*.css`。
- 完成：同步调整 `purchaseInboundFlow.test.mjs` 的源码扫描断言，继续守住采购入库移动端状态映射和“不在页面本地创建下游任务”的边界。
- 验证：目标 ESLint（不带 fix）、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=mobile-tasks-dark,mobile-tasks-browser-back-stays-mobile pnpm --dir web style:l1`、`pnpm --dir web build` 均通过。
- 下一步：若继续降低 `MobileRoleTasksPage.jsx` 复杂度，下一轮优先拆 `run*FollowUp / moveTask / urgeTask` 为移动任务动作 hook，或拆列表 / 详情屏幕组件；不要和 Workflow / Fact 行为改造混在同一轮。
- 阻塞/风险：本轮是结构拆分和样式迁移，不改 schema、migration、后端 API、RBAC、菜单、WorkflowUsecase 或 Fact 事实规则；`pnpm --dir web lint` 未直接执行，因为该脚本会全量 `eslint --fix` 且当前工作区已有大量并行未提交改动，本轮用目标 ESLint 避免扩大 diff。

## 2026-06-16 20:01 CST 日期筛选裁切修复

- 完成：修复业务页共享 `DateRangeFilter` 的原生日期输入裁切问题；桌面日期范围控件从 420px 收口到 500px，起止日期输入最小宽度提升到 160px，避免 `yyyy/mm/dd` 被右侧原生日历图标挤掉尾部。
- 完成：补窄屏策略，移动宽度下日期范围控件保持整块铺满，起止日期改为上下排列，避免为了桌面完整显示而造成小屏横向溢出。
- 完成：`style:l1` 日期筛选断言升级为检查原生日历图标预留后的有效文本宽度，并新增 `shipment-date-filter-mobile` 场景；同步 `web/README.md` 回归覆盖说明。
- 下一步：后续新增业务日期筛选时必须复用共享 `DateRangeFilter`，不要在单页手写 date input 宽度；若要改成 AntD DatePicker，应作为单独控件替换任务评审。
- 阻塞/风险：本轮只改共享样式、日期筛选回归脚本和过程文档，不改 schema、migration、后端 API、RBAC、菜单或事实层；本地浏览器验证时后端 profile 同步出现 rate limit 警告，页面布局和日期控件渲染不受影响。

## 2026-06-16 20:01 CST

- 完成：将销售订单行从手填 `product_id / unit_id` 的可见输入，改为 `SKU / 产品来源` 选择器；选择 SKU 后自动带出 `product_id / unit_id`、产品编号 / 名称 / 颜色快照，并保留只读回显，旧订单行可按已有 product / unit / 快照尽量回显匹配 SKU。
- 完成：补齐 `sales_order_item.product_sku_id` 的 biz / repo / JSON-RPC / 前端提交参数映射；`product_sku_id` 仍是 nullable 追溯字段，清空来源会清掉该字段，订单行事实主路径仍校验 active product 和 active unit，不把 SKU 选择扩展成库存、出货或财务事实。
- 完成：同步数据流向与字段来源正式文档、产品能力台账、客户交付矩阵和当前真源口径；`style:l1` 锁住销售订单弹窗必须出现 `SKU / 产品来源` 和 `带出产品 / 单位`，且旧 `产品引用 ID / 单位引用 ID` 不再出现。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_PORT=4174 pnpm --dir web style:l1` 和 `git diff --check` 通过；`style:l1` 共验证 50 个场景。
- 下一步：订单到 BOM / 库存 / 出货 / 预留 / 财务的下游 SKU 校验仍需分阶段接入，优先从出货单明细按销售订单行 / SKU 选取带出做下一闭环。
- 阻塞/风险：本轮不自动从订单颜色、尺寸或客户款号创建 SKU，不改出货 / 库存 / 预留 / BOM / 财务事实主路径，也未执行目标环境 migration / 部署。

## 2026-06-16 19:54 CST

- 完成：补齐生产 bootstrap 最小审计闭环守卫，`runtime_audit_events` 和 `runtime_markers` 通过 Ent hook 拒绝普通 update / delete，保持启动审计事件和一次性 marker 只能创建 / 追加。
- 完成：新增 `runtime_audit_schema_test.go`，覆盖 runtime audit event append-only 和 runtime marker immutable；同步 `server/docs/observability.md` 与 `docs/observability/日志链路追踪审计第一版.md`，明确这组表只服务服务启动安全审计，不是全业务通用 `audit_events`。
- 验证：`make data` 通过且 Atlas 未生成新 migration；`go test ./internal/data -run 'TestRuntime|TestInitAdminUsersIfNeeded'`、`go test ./cmd/server -run 'TestValidateProductionBootstrapConfig'`、`go test ./cmd/server ./internal/data`、`bash scripts/deploy/production-preflight.sh --example`、`bash deployments/yoyoosun/scripts/verify-env.sh --example`、`bash -n scripts/deploy/production-preflight.sh deployments/yoyoosun/scripts/verify-env.sh` 和 `git diff --check` 均通过。
- 下一步：后续若要做角色权限变更、账号启停或业务动作审计，应单独设计系统管理审计或领域审计任务，不把本轮 runtime 表直接扩成采购 / 库存 / 出货 / 财务全量审计。
- 阻塞/风险：本轮未执行真实库 migration apply、未构建镜像、未部署目标环境；当前工作区仍有多轮并行未提交改动，本轮只收口 bootstrap runtime audit 守卫与文档。

## 2026-06-16 19:40 CST

- 完成：继续按“只给有真实业务日期语义和后端查询支持的页面补筛选”的口径收口出货单日期筛选回归；当前出货单页已存在计划出货 / 实际出货日期范围筛选和 `list_shipments` 日期查询主路径，本轮只补页面级 `style:l1` 守卫。
- 完成：`style:l1` 新增 `shipment-date-filter-desktop` 场景，验证出货单页计划 / 实际出货日期范围控件整体成组、起止日期同一行、输入不裁切、筛选控件高度和圆角对齐，并确认正式业务主表没有操作列和横向溢出。
- 下一步：后续继续评估采购入库、采购退货、采购调整和质检页是否已有真实日期字段、后端过滤和页面主路径；没有三者闭环的页面不补日期筛选。
- 阻塞/风险：本轮不改出货页运行时代码、schema、migration、后端 usecase、RBAC、菜单或事实层；当前工作区已有大量非本轮并行改动，本轮未回退、整理或纳入这些改动。

## 2026-06-16 19:07 CST

- 完成：继续收口业务弹窗输入控件高度，把 Select 下拉框明确纳入单行输入控件；业务弹窗内 Input、InputNumber、Date Picker、Select selector 统一按 `--erp-control-height` 36px 对齐，普通多行 TextArea 保持 3 倍高度，item 区 TextArea 保持单行高度。
- 完成：`style:l1` 业务表单弹窗断言新增单行控件高度一致性检查，并把供应商新建弹窗纳入截图回归，直接覆盖“供应商类型”下拉框和普通输入框同高。
- 验证：`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过并生成供应商弹窗截图；`purchase-order-date-filter-desktop`、`business-module-dark-customers-desktop` 目标场景串行通过；`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`git diff --check` 通过。
- 下一步：后续若再发现普通业务弹窗里新增第三方控件，应先纳入“单行输入控件”断言，再决定是否扩展共享 CSS，而不是在页面内逐个写高度。
- 阻塞/风险：本轮只改前端共享样式和 `style:l1` 回归断言，不改 schema、migration、后端 API、RBAC、菜单或事实层；完整全站 `style:l1` 未重跑，按本次触达范围跑了目标业务页场景。

## 2026-06-16 18:17 CST

- 完成：继续按 Product Design 口径强化业务弹窗 item 区视觉层次，运行态销售订单、采购订单、客户 / 供应商联系人和出货 item 区统一为“导入 / 标题说明 / 条目卡片 / 底部新增与统计”的高辨识结构；item 明细保持单行横向滚动，输入高度保持 36px 口径。
- 完成：补 `business-form-page-standard-v1` 原型的 item 导入、横向滚动、条目新增、数量 / 金额统计和 README 标准口径；同步 dev prototype 注册与测试说明，避免原型查看器继续把 item 导入误归到局部动作弹窗。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop`、`purchase-order-date-filter-desktop`、`business-module-dark-customers-desktop pnpm --dir web style:l1` 通过；原型 HTML inline script 语法检查和 Playwright 桌面 / 移动盒模型检查通过；`git diff --check` 通过。
- 下一步：如继续吸收更多业务页弹窗，BOM / 出货 / 其他特殊 item 应按真实来源库、字段和统计口径接入，不把产品 / SKU / 材料导入无脑套到所有模块。
- 阻塞/风险：本轮仍只改前端样式、业务弹窗布局和原型资产，不改 schema、migration、后端 API、RBAC、菜单或事实层；完整全站 `style:l1` 未重跑，已按触达范围跑目标场景回归。

## 2026-06-16 19:19 CST

- 完成：全局扫描正式业务页列表外壳后，收口 BOM、采购订单和出货单的顶部操作区；新建主动作统一进入 `BusinessOperationPanel.primaryAction` 右侧槽，筛选区不再混放新建按钮。
- 完成：BOM 主表补显式行操作列，区分查看、草稿编辑和复制新版本；ACTIVE 版本仍不允许直接编辑，继续通过复制新版本维护工程资料边界。采购订单补选中态当前操作区，出货单从旧 dashboard Card/Table 外壳迁入业务页标准骨架并保留后端事实动作边界。
- 完成：同步 `style:l1` 业务工具栏断言，使其同时识别旧 `BusinessFilterPanel` 和新 `BusinessOperationPanel` 的筛选控件，避免标准容器迁移后测试误判缺控件。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过。内置浏览器打开本地 5175 BOM 路由确认页面壳层可加载且无 console error，但当前浏览器账号缺少后台入口权限，业务内容验证以 style:l1 mock 授权回归为准。
- 下一步：若后续要继续做“每行都放编辑按钮”的统一，需要单独评审客户 / 供应商 / 材料 / 产品 / 销售订单当前“选中后当前操作区编辑”的既有标准是否要整体改口径。
- 阻塞/风险：本轮只改前端业务页外壳、操作入口和回归脚本，不改 schema、migration、后端 API、RBAC、菜单或 Workflow / Fact 事实规则；出货确认和取消仍只通过后端 shipment usecase 执行。

## 2026-06-16 19:31 CST

- 完成：按“正式业务主表不保留操作列”的统一口径，移除 BOM、采购订单和出货单主表操作列；查看、编辑、复制新版本、添加明细、出货和取消等动作继续从选中后的“当前操作”区触发。
- 完成：复扫正式业务主表后确认客户 / 供应商 / 产品 / 销售订单 / 通用壳页主表本来就无操作列；剩余“操作”列只存在于 BOM 明细弹窗、回收站、嵌套明细表、权限 / 看板 / 内部事实验证页等非正式业务主表场景。
- 完成：`style:l1` 增加业务主表不得出现“操作”表头的断言，覆盖采购订单、BOM、出货单和通用正式壳页，避免后续回退。
- 验证：`pnpm --dir web lint` 通过；首次 `style:l1` 因默认 4173 端口被短暂占用失败，端口释放后重跑 `STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过。
- 下一步：如要把局部弹窗明细表或回收站表也统一去掉操作列，需要单独评审这些局部表的替代操作入口。
- 阻塞/风险：本轮只改前端主表列口径和回归断言，不改后端、schema、migration、RBAC、菜单或事实规则。

## 2026-06-16 19:43 CST

- 完成：按其他正式业务页当前操作区口径，移除 BOM、采购订单和出货单 `SelectionActionBar` 里的额外摘要项与边界说明；当前操作区只保留“当前操作 + 已选对象”与右侧动作按钮，边界说明回到页面头部摘要承载。
- 完成：复扫正式业务页 `SelectionActionBar` 用法，客户 / 供应商 / 产品 / 销售订单 / 采购订单 / BOM / 出货单 / 通用壳页均不再传 `summaryItems` 或 `boundaryText`。
- 验证：`pnpm --dir web lint` 通过；目标 `style:l1` 首次在客户编辑弹窗关闭等待上抖动失败，重跑 `STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过。
- 下一步：如后续需要在当前操作区展示状态 / 数量摘要，必须先整体评审共享组件标准，不在单页单独加说明块。
- 阻塞/风险：本轮只改前端当前操作区布局口径，不改后端、schema、migration、RBAC、菜单或事实规则。

## 2026-06-16 16:59 CST

- 完成：按 Product Design 原型口径收口业务弹窗控件高度，业务页筛选输入 / 下拉 / 日期输入统一到 36px；业务表单弹窗单行控件统一 36px，textarea 按 3 倍行高，多明细 item 内 textarea 保持单行高度并横向滚动。
- 完成：销售订单和采购订单新建 / 编辑弹窗补“从 SKU / 材料库导入”、已录入条数、数量合计和金额合计；销售新建默认带 1 条空订单行，采购顶部字段改用共享业务表单网格，采购明细数字输入撑满 item 列宽。
- 完成：`style:l1` 新增采购订单新建弹窗断言和截图，覆盖表单弹窗、采购明细、导入入口、录入 / 数量 / 金额统计和控件尺寸。
- 下一步：后续若继续扩展 BOM / 出货等特殊明细弹窗，应按各自真实来源库和字段口径接入导入与统计，不要无脑套 SKU / 材料口径。
- 阻塞/风险：本轮只改前端业务页交互和样式，不改 schema、migration、后端 API、RBAC 或事实层语义；全量 `pnpm --dir web style:l1` 仍受本地 Vite 连接被拒影响未完整收口，目标销售 / 采购业务场景已单独通过。

## 2026-06-16 16:50 CST

- 完成：新增 `create_shipment_with_items` JSON-RPC 方法，复用 `shipment.create` 权限，在后端事务内一次创建出货单头和明细；任一明细保存失败会整体回滚，不留下半成品草稿。
- 完成：出货单页面新建弹窗改用组合接口保存，已存在草稿的加行仍保留 `add_shipment_item` 增量接口；同步 `server/README.md` 和当前真源文档出货单口径。
- 完成：补后端事务回滚、组合接口权限 / 分发测试；为跑通全量相关测试，顺手收口当前工作区已有 admin bootstrap 测试 / env helper 命名冲突和若干前端 lint 未使用变量问题。
- 下一步：出货单新建事务化已完成；后续若继续推进出货能力，应单独评审经手人审计、库位、冻结、装箱 / 物流 / 签收 / 退货或完整财务闭环，不把 `shipment_release done` 当事实入口。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、`shipment_release` workflow 规则、库存出库 / 冲正语义或财务事实门禁；lint 仍保留 4 个既有 hooks warning。

## 2026-06-16 16:47 CST

- 完成：新增 `docs/product/业务主链路数据流向与字段来源规则.md`，把订单到产品 / BOM / 材料 / 仓库 / 出货 / 财务的数据流向收口为 MasterData -> Source Document -> Domain Usecase -> Fact -> Derived 的主路径。
- 完成：明确新建 / 编辑、来源导入、列表、打印和导出字段的来源分级：主数据选择、来源单据带值、动作事实输入、派生展示、客户配置显示、导入候选和人工备注；同步 `docs/product/README.md`、`docs/文档清单.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：后续进入 runtime 前，先选一个可验证闭环落地，例如销售订单行产品 / SKU / 单位选择、采购订单到采购入库来源带值，或出货单到销售订单来源带值。
- 阻塞/风险：本轮只做正式文档治理，不改 schema、migration、repo/usecase、API、RBAC、前端页面或测试；工作区已有大量非本轮改动，本轮未回退、整理或纳入这些改动。

## 2026-06-16 16:49 CST

- 完成：收紧前端 ESLint 基线，打开 `no-unused-vars`，并将 `react-hooks/exhaustive-deps` 从关闭改为 warning；清理现有 unused import / catch 绑定 / 死变量，修正 BOM、采购订单、权限中心、打印预热、共享业务协同面板和后台账号页的 hooks 依赖声明。
- 完成：验证通过 `pnpm exec eslint --no-fix --ext .js --ext .jsx src/`、`pnpm lint`、`pnpm css`、`pnpm test`、`git diff --check`，并串行补跑 `style:l1` 关键场景：`permission-center-desktop`、`purchase-order-date-filter-desktop`、`business-formal-module-shells-desktop`、`business-module-dark-customers-desktop`、`print-center-desktop`、`print-workspace-material`、`print-workspace-processing`。
- 下一步：如果后续继续提升质量门禁，可在一段时间 warning 清零稳定后再评审是否把 `react-hooks/exhaustive-deps` 升级为 error。
- 阻塞/风险：本轮只处理 ESLint 收紧，不改业务字段、schema、migration、RBAC、菜单或部署；当前工作区已有大量非本轮改动，本轮未回退、整理或纳入这些改动。

## 2026-06-16 16:47 CST

- 完成：收口生产 bootstrap 管理员安全闭环，新增 `runtime_markers` 与 `runtime_audit_events` Ent schema / Atlas migration，用于记录一次性 admin bootstrap marker 和启动审计事件。
- 完成：生产环境只允许在 `BOOTSTRAP_ADMIN_ONCE=true` 且临时注入 `APP_ADMIN_PASSWORD` 时创建初始 super admin；成功后重复 bootstrap 会被 marker 拒绝，已有同名管理员不再被启动逻辑自动提权。
- 完成：同步生产 Compose、preflight、server config 文档、yoyoosun 部署 env 样例 / 校验脚本和当前真源文档；`production-preflight` 会拦截长期保留 `APP_ADMIN_PASSWORD` 或只开 once flag 不给密码的配置。
- 验证：`make data` 通过并生成 `20260616084340_migrate.sql`；`go test ./cmd/server ./internal/data -run 'TestValidateProductionBootstrapConfig|TestInitAdminUsersIfNeeded'` 通过；`go test ./cmd/server ./internal/data` 通过；`bash scripts/deploy/production-preflight.sh --example` 通过；`bash deployments/yoyoosun/scripts/verify-env.sh --example` 通过；`bash -n scripts/deploy/production-preflight.sh deployments/yoyoosun/scripts/verify-env.sh` 通过；补充两组负向 preflight 临时 env 检查通过。
- 下一步：发布前必须先 apply 新 migration，再按首次初始化窗口短暂设置 `BOOTSTRAP_ADMIN_ONCE=true` 与 `APP_ADMIN_PASSWORD`；初始化成功后立即移除密码并恢复 `BOOTSTRAP_ADMIN_ONCE=false`。
- 阻塞/风险：本轮未对任何真实库执行 migration apply、未构建镜像、未部署目标环境；`make data` 在当前脏工作区生成 Ent 代码，生成产物反映了当时所有 schema 现场，新迁移文件本身只包含两个 runtime 表。

## 2026-06-16 16:39 CST

- 完成：继续扫描当前 dev DB 所有 public 表的 text / varchar / json / jsonb 字段，发现并收口 `Phase 7` 试用模拟主数据残留：客户、供应商、联系人、单位、产品、销售订单、销售订单行和订单快照统一改为 `SIM-YOYOOSUN-TRIAL` / `Trial` 口径。
- 完成：补清 `workflow_task_events.reason` 中旧 `Phase 9` 原因文本，并将 `output/customers/yoyoosun/phase*` 历史本地 evidence 目录移动到系统回收站；`output/customers/yoyoosun` 当前不再命中编号 Phase 标签。
- 下一步：如后续需要把 DB 数据扫描变成固定 QA，可单独补一个只读数据边界脚本；当前 `phase-label-boundaries` 仍只负责仓库活跃文件扫描。
- 阻塞/风险：本轮只处理当前 `192.168.0.106:5432/plush_erp` dev DB 和本机 git-ignored output；其他目标环境、其他开发库或已归档历史 evidence 不在本轮扫描范围。

## 2026-06-16 16:38 CST

- 完成：采购订单页复用共享 `DateRangeFilter`，按已有 `purchase_order` JSON-RPC 查询主路径接入采购日期 / 预计到货日期范围筛选；筛选变化会重置分页并传递 `date_field/date_from/date_to`。
- 完成：在模块实施治理中补业务列表筛选规则，明确日期筛选按真实业务日期字段和后端支持接入，桌面端日期类型、开始日期和结束日期作为整体控件展示，不逐页机械复制。
- 完成：`style:l1` 新增 `purchase-order-date-filter-desktop` 场景，验证采购订单页日期筛选整体控件、起止日期同一行、输入不裁切和筛选控件高度对齐；完整 `pnpm --dir web style:l1` 当前 49 个场景通过。
- 下一步：如后续继续补日期筛选，优先评估出货单、采购入库 / 退货 / 调整、质检单和任务看板；客户、供应商、材料、BOM 等主数据页默认不把日期作为首要筛选。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase 或其他业务页；采购订单余额、在途统计、采购需求和应付 / 发票联动仍未实现。

## 2026-06-16 16:36 CST

- 完成：继续按参考图修业务表单弹窗 item 形态，联系人、订单明细、出货明细等条目内部字段不再自动换行；条目内容超出时由 item 区域横向滚动承接。
- 完成：业务弹窗普通输入框从上一轮偏高的 42px 收回到 36px，item 内 textarea 也压回单行高度，避免明细条目被备注字段撑高。
- 下一步：如后续要进一步压缩主表字段密度，可单独评审主表区列宽和 textarea 高度；本轮只改 item 横向滚动与输入高度。
- 阻塞/风险：全量 `style:l1` 当前仍被无关 `print-workspace-material` 采购合同头部 pairCount=0 阻塞；目标业务弹窗场景已通过过滤回归。

## 2026-06-16 16:29 CST

- 完成：复核出货幂等当前状态，确认 `operational_fact_repo_test.go` 已覆盖出货单、出货明细、发货、取消冲正、重复发货和重复取消，状态机与 repo 主路径均保持重复动作无副作用。
- 完成：同步更新 `docs/architecture/出货事实与库存边界评审.md`，移除“shipment 取消还没有专用用例 / 没有正式 shipment 专表”等旧口径，改为当前 `shipments / shipment_items` + `OperationalFactUsecase` + `operational_fact` JSON-RPC 真源。
- 下一步：出货幂等本身无需继续补；后续若要推进，应聚焦库位、独立冻结、经手人审计、装箱 / 物流 / 签收 / 退货和完整财务闭环，不能回到 `shipment_release done` 直接写事实。
- 阻塞/风险：本轮只同步正式文档并跑后端相关包测试，不改 runtime、schema、migration、RBAC、菜单或前端样式；当前工作区仍有其他未提交改动，本轮不接管、不回退。

## 2026-06-16 16:26 CST

- 完成：按参考弹窗视觉修补共享业务表单弹窗样式，增强标题栏、输入框边界、焦点态、明细 / 联系人条目区块、底部操作栏和按钮可见性；客户 / 供应商、销售订单、采购订单、BOM、出货单等复用 `erp-business-action-modal` 的页面同步受益。
- 完成：补齐暗色主题变量和窄屏断点，避免浅色修好后暗色或小屏业务弹窗失真。
- 下一步：如要继续逼近外部 ERP 参考图，可再单独做一轮字段密度和业务表单排版评审；本轮不改业务字段、后端 API 或权限。
- 阻塞/风险：工作区中已有多份文档和服务端文件处于修改状态，本轮不接管、不回退；本轮仅验证前端共享弹窗样式相关路径。

## 2026-06-16 16:20 CST

- 完成：定位任务看板仍出现编号 Phase 的原因是 dev DB 中 2026-06-09 旧模拟 workflow 数据残留，而不是当前 `scripts/qa/phase-label-boundaries.mjs` 漏扫代码；已将 `workflow_tasks`、`workflow_business_states` 和 `workflow_task_events` 中旧 `SIM-YOYOOSUN-PHASE9...` / `Phase 9...` / `phase9_mobile_task` 收口为 `SIM-YOYOOSUN-MOBILE-WORKFLOW...`、`Mobile workflow...` 和 `mobile_workflow_task`。
- 完成：后端 Workflow 创建 / 更新入口增加编号 Phase 标签守卫，拒绝在任务字段、阻塞原因、payload、派生任务或业务状态 payload 中写入新的编号 Phase 标签；同步当前真源文档口径。
- 下一步：如目标环境或其他 dev DB 仍有同类旧模拟数据，需要在对应库单独执行同样的只针对模拟 workflow 数据的改名收口。
- 阻塞/风险：本轮不删除任务、不改 schema、migration、RBAC、Workflow / Fact 边界或事实表；页面是否即时消失取决于当前浏览器和接口缓存，刷新任务看板后应读取到已改名数据。

## 2026-06-16 16:20 CST

- 完成：复核 JSON-RPC 分层迁移收口状态，确认 `server/internal/data/jsonrpc*.go` 已不存在，运行时 JSON-RPC dispatch、权限守卫和错误映射位于 `server/internal/service`。
- 完成：同步修正当前正式文档中的旧 `server/internal/data/jsonrpc_*` 路径和“handler 位于 data 层历史架构”风险口径；`docs/reference` 与 `docs/archive` 作为历史资料不改。
- 下一步：如后续继续扩展 JSON-RPC 域，按 `service -> biz -> data repo` 主路径新增 service 测试，不恢复 `data.JsonrpcData` 入口。
- 阻塞/风险：本轮不改 runtime、schema、migration、RBAC 或前端；当前工作区仍有出货单弹窗和 workflow phase-label guard 相关未提交改动。

## 2026-06-16 15:56 CST

- 完成：出货单继续按现有业务弹窗原型修补，`新建草稿` 改为同一弹窗内上方维护出货单主表字段、下方维护出货明细条目；草稿 `加行` 也复用同一弹窗，上方只读回显主表和已保存明细，下方新增明细。
- 完成：出货单查看改为同一弹窗只读回显，不再保留业务对象抽屉路径；`style:l1` 增加 `/erp/warehouse/shipments` 新建弹窗和加行弹窗断言。
- 下一步：如后续要把前端 `createShipment` 后顺序 `addShipmentItem` 升级为后端单请求事务保存，需要单独评审 ShipmentUsecase/API 合约。
- 阻塞/风险：本轮不改 schema、migration、RBAC、Workflow / Fact 边界或后端 usecase；当前后端没有把“创建出货单 + 明细”包成同一个事务请求，明细保存失败时仍按现有 API 失败提示处理。

## 2026-06-16 14:36 CST

- 完成：全局收口业务对象新建 / 编辑 / 查看交互，移除销售订单、采购订单、BOM、出货单和 formal-shell 入口壳的业务对象详情抽屉路径；销售订单、采购订单继续在同一业务弹窗内维护主表字段和订单 / 采购明细，BOM 查看 / 编辑弹窗下方展示 BOM 明细，出货单详情 / 新建 / 加行改为统一 Modal。
- 完成：同步原型口径，把 `business-form-page-standard-v1` 改为“新建 / 编辑业务弹窗标准样板”，明确上方主表字段、下方明细 items；`action-modal-drawer-standard-v1` 改为局部动作弹窗口径，并同步原型中心、业务模块标准页 README、当前真源文档和 `style:l1` 断言。
- 下一步：出货单同一弹窗内维护主表和明细已在 15:56 CST 继续补齐；若要进一步改成后端单请求事务保存，需要单独评审 ShipmentUsecase/API 合约。
- 阻塞/风险：本轮不改 schema、migration、RBAC、Workflow / Fact 边界或后端 usecase；Dashboard 任务详情 Drawer 属于 Workflow 任务处理，不是业务对象表单，本轮按边界保留。

## 2026-06-16 16:49 CST

- 完成：为 yoyoosun 私有化发布补 release evidence gate，新增 `scripts/deploy/release-evidence-gate.mjs` 与单测，检查本次 release evidence、pre-migration backup evidence、migration status、smoke report 和 sign-off checklist 是否脱敏且填齐；草稿 evidence 会被明确拒绝，避免把模板误当真实签收。
- 完成：补 `release-signoff-checklist` 模板，扩展 `collect-evidence.sh` 生成的 evidence 草稿目录，并同步 yoyoosun 部署资料包 README、evidence README、首次部署 / 升级 runbook、部署前后 checklist、`scripts/README.md` 和 fast/full/strict QA 测试接线。
- 验证：`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/deployment-package-lint.test.mjs` 通过；`node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun` 通过；`bash -n deployments/yoyoosun/scripts/collect-evidence.sh deployments/yoyoosun/scripts/verify-backup-restore.sh scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh` 通过；临时草稿 evidence 运行 gate 被拒绝，符合预期。
- 下一步：真实 yoyoosun 发布或客户试用交付前，先填写 `deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/` 下真实脱敏证据，再运行 `node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>`。
- 阻塞/风险：本轮不生成真实 release evidence、不接触目标服务器、不读取真实 `.env`、不处理真实备份文件、不改变 `server/deploy/compose/prod` 部署主路径；当前仍不能写成客户已签收或 Delivery Ready。

## 2026-06-16 14:02 CST

- 完成：按 `trade-erp` 的大弹窗交互收口 V1 客户 / 供应商页，删除“查看详情”抽屉和独立联系人弹窗；客户 / 供应商新增、编辑统一在一个业务表单弹窗里维护主体字段和联系人条目。
- 完成：联系人保存从同一弹窗主路径同步：先保存客户 / 供应商主体，再创建 / 更新联系人；编辑时从弹窗移除的旧联系人按停用处理，避免旧联系人残留继续挂在当前主体下。
- 完成：补联系人条目局部样式和 `style:l1` 断言，客户 / 供应商回归从“详情抽屉联系人入口”改为“编辑弹窗内联系人条目”；13:08 CST 的抽屉方案已被本条记录替代。
- 下一步：如后续要支持联系人只读详情、单条联系人停用确认或更细的联系人权限 UI，需要另起联系人明细交互任务，不恢复主页面第二张常驻表。
- 阻塞/风险：本轮不改后端 schema、migration、菜单、RBAC 或客户 / 供应商分表真源；联系人仍是当前客户 / 供应商从属明细，不作为独立业务对象。

## 2026-06-16 12:52 CST

- 完成：重排 `docs/product/产品能力进度台账.md`，取消快速查阅表第一列内部编号，改为按“能力 / 所属层 / 成熟度 / 客户可见性 / 下一步”给人查阅。
- 完成：新增 `docs/product/产品能力证据详情.md`，把原宽表中的当前结果、当前不包含、证据、风险和客户边界拆到按能力名称索引的详情文档；可见正文只按能力名称查阅。
- 完成：同步 `docs/product/产品台账索引.md`、`docs/product/README.md`、`docs/文档清单.md`，并修正台账内和客户差异台账内 SKU 示例，避免继续写成“只落 schema 未接 API / UI”。
- 下一步：后续维护台账时先更新主台账的人可读状态，再按需补证据详情；如证据详情继续变大，再按业务域拆分详情。
- 阻塞/风险：本轮只改正式文档呈现和 SKU 示例口径，不改 runtime、schema、migration、测试、部署或客户交付矩阵。

## 2026-06-16 12:53 CST

- 完成：收口 V1 主数据客户 / 供应商页面的前端称呼，保留客户与供应商作为不同业务入口和后端真源，但不再在按钮、统计和联系人面板里统一显示成泛化“主体”，避免误读为两套重复表单。
- 下一步：如后续要把客户与供应商进一步合成“往来单位 / 交易主体”单入口，需要单独评审 schema、RBAC、销售 / 采购外键、联系人 owner_type、菜单和迁移，不在本轮文案收口范围内。
- 阻塞/风险：此条仅记录早先称呼收口；同轮后续已在 14:02 CST 继续按大弹窗交互完成单页结构收口和 `style:l1` 回归，最终风险以 14:02 CST 记录为准。

## 2026-06-16 13:55 CST

- 完成：新增 `docs/customers/yoyoosun/source-manifest.json` 作为永绅原始来源文件导入前主清单，记录 path、sha256、size、用途、domain、敏感复查和 `structuredExtract` 策略；新增 `scripts/import/customerSourceManifestCheck.mjs` 与测试，校验 manifest、raw source 文件一致性和 checksum 漂移。
- 完成：`customerSourceExtract.mjs` 默认改为 manifest 驱动，只提取 manifest 中允许结构化的 Excel；source snapshot、extract summary、freeze metadata、dry-run validation summary 和 source references 保留 manifest 追溯信息，文档命令从 raw-dir glob 主路径同步为 manifest-first。
- 下一步：真实导入仍必须另行补齐已 review 的 existing V1/formal model snapshot、unresolved 清理、客户 sign-off、备份/回滚、幂等、审计和 post-import reconciliation 后再评审是否执行。
- 阻塞/风险：本轮仍不执行真实客户数据导入，不写 DB、不改 schema/migration/API/UI/seedData，不对 PDF/图片做 OCR；`canExecuteRealImport` 继续保持 `false`。

## 2026-06-16 13:08 CST

- 完成：进一步收口 V1 客户 / 供应商页单页结构，删除页面底部常驻联系人明细表，把联系人列表和新建联系人入口移入“查看详情”抽屉；主页面只保留一张客户 / 供应商主数据表。
- 完成：清理已失效的联系人面板 CSS，并同步 `style:l1` 客户 / 供应商场景断言，按“新建客户 / 新建供应商”和详情抽屉联系人入口验证新结构。
- 下一步：联系人编辑、设为主联系人和停用仍需后续按 masterdata 联系人能力单独补 UI 动作，不回到主页面常驻第二张表。
- 阻塞/风险：本轮未改后端 schema、API、RBAC、菜单、migration 或真实数据；联系人仍是当前客户 / 供应商的从属明细，不作为独立业务对象。

## 2026-06-16 12:16 CST

- 完成：关闭 P0/P1 硬缺口主路径：生产配置移除 token 形态 Telegram 注释块；个人开发阶段不落 GitHub CI，继续以本地 QA / hooks 为主；后端 HTTP 增加 CSP、Referrer-Policy、X-Content-Type-Options、X-Frame-Options 和 Permissions-Policy 基础安全响应头。
- 完成：公开自助注册从“生产关闭”改为“运行时删除”：后端移除 `auth.register` 分发和 `AuthUsecase.Register`，`auth.capabilities` 不再返回 `public_register`，生产 Compose / preflight 不再使用 `APP_PUBLIC_REGISTER_ENABLED`，前端删除 `/register` 路由和注册页，登录页不再展示注册链接，正式 API / 配置 / 部署 / 前端 README 同步为不提供公开自助注册。
- 下一步：SKU 继续只按已修正台账推进；如要进一步降低 token 风险，应单独评审 HttpOnly SameSite Cookie、CSRF、刷新 token 和前端 API client 改造；如要补普通协作账号创建入口，应单独评审受控 `user.create` 权限、流程、审计和测试。
- 阻塞/风险：本轮未做 SKU API/UI、真实 MVP runner、目标环境部署、生产镜像构建或线上 smoke；后端 CSP 仍保留 inline script/style 兼容现有构建和模板渲染，后续收紧需要前端构建和 PDF 回归。

## 2026-06-16 12:50 CST

- 完成：按用户确认删除公开注册入口，清理后端 register 方法、前端注册路由 / 页面、公开注册 capability、公开注册错误码消费、生产部署开关、preflight 检查和相关正式文档口径；保留测试断言 `register` 返回 UnknownMethod，避免后续误恢复。
- 下一步：如需要新增普通协作账号，另起受控账号创建任务，不从公开注册入口恢复。
- 阻塞/风险：未新增普通协作账号创建 API；当前普通用户新增仍依赖既有初始化 / 数据准备路径或后续账号管理能力设计。

## 2026-06-16 20:34 CST

- 完成：全局修复 Ant Design `Input.TextArea showCount` 的字数统计布局，把 `.ant-input-data-count` 收口到多行输入框内部右下角，并给输入内容预留底部空间；同步处理明细行内 showCount textarea 不再被压成单行高度，移除批量删除弹窗旧的外部 margin 兜底。
- 完成：补 `style:l1` 的 textarea 字数统计盒模型断言，并新增 `textarea-show-count-layout-desktop` 窄范围场景，验证业务表单弹窗中计数器在输入框边界内、无横向溢出、未覆盖相邻区域。
- 验证：`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，前端 node test 312 项通过；`STYLE_L1_PORT=4176 STYLE_L1_SCENARIOS=textarea-show-count-layout-desktop pnpm --dir web style:l1` 通过；`git diff --check` 通过。
- 下一步：若后续发现非 AntD 原生 textarea 或移动端手写 textarea 也需要字数统计，应单独接入同一盒模型规则或补移动端专项 L1。
- 阻塞/风险：`pnpm --dir web lint` 未按脚本直接执行，因为该脚本会全量 `eslint --fix` 且当前工作区已有大量其他会话改动；改用非自动修复 ESLint 检查时失败在既有现场 `BusinessListLayout.jsx prefer-arrow-callback` 和 `V1PurchaseOrdersPage.jsx Space 未使用`，不是本轮 textarea 样式改动引入。

## 2026-06-16 19:30 CST

- 完成：按“真实单据 / 事实页才补业务日期筛选”的口径，给正式 `出货单` V1 页面补计划出货 / 实际出货日期范围筛选；前端复用 `DateRangeFilter`，后端 `list_shipments` 增加 `date_field/date_from/date_to` 解析、白名单校验和 repo 谓词。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/产品能力证据详情.md`，明确出货单支持状态与业务日期筛选；入口壳、BOM 和主数据不补假日期筛选。
- 下一步：后续采购入库、质检、财务等页面只有在正式领域 API 接入并确认业务日期字段后，再按同样规则补日期筛选。
- 阻塞/风险：本轮不改 schema / migration，不给入口壳加日期；日期范围沿用现有 V1 单据页的日期输入口径，要求记录日期按日落库或由调用方传入匹配的日期边界。

## 2026-06-16 12:33 CST

- 完成：按个人开发边界撤回 GitHub CI 落地，删除 `.github/workflows/ci.yml`，并把 `docs/product/自动化测试策略.md` 改回“当前不配置 GitHub CI，后续协作扩大时再评审”的口径。
- 下一步：继续保留本地 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`、preflight 和 hooks 作为当前质量主路径。
- 阻塞/风险：未改生产注册关闭、安全响应头、错误码、前端 capabilities 或部署 preflight 收口；后续若需要远端门禁再重新评审 CI。

## 2026-06-16 12:08 CST

- 完成：修正 `docs/product/产品能力进度台账.md` 中 `product_skus` 口径，补齐 masterdata JSON-RPC、`product_sku.*` RBAC 和 `/erp/master/products` SKU 最小维护页面已接入的状态，避免继续被误读为只落 schema。
- 完成：保留 SKU 当前边界：订单、出货、库存和预留运行时主路径仍未切 SKU；销售订单行 SKU 选择、出货 / 库存 / 预留 SKU 校验、BOM SKU 粒度和导入受控创建 SKU 仍待单独评审。
- 下一步：后续推进 SKU 时优先评审销售订单行 SKU 选择与快照带值，再评审 BOM SKU 粒度和事实链路 SKU 校验。
- 阻塞/风险：本轮只修正式产品能力台账口径，不改运行时代码、schema、migration、测试脚本、部署或 git 提交。

## 2026-06-15 22:59 CST

- 完成：BOM Version 已完成 runtime 闭环并通过最终收口验证：后端 BOM lifecycle / repo / service JSON-RPC / RBAC、前端 BOM API / V1 页面 / 路由、`style:l1` BOM 页面 mock 与断言、正式文档和客户交付矩阵均已同步；BOM 仍只维护产品物料清单版本，不写库存、采购、生产、成本或财务事实。
- 完成：收口 JSON-RPC service/data 分层迁移现场，修复 Product SKU L1 暗色客户场景空记录崩溃，并补齐 `style:l1` 对 Product SKU、BOM Version 和当前业务页表头 / 回收站列的断言口径。
- 验证：`go test ./...` 通过；`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test && pnpm --dir web build` 通过，前端单测 312 项通过；`node --test scripts/qa/mvp-closure.test.mjs && node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure-smoke` 通过；`pnpm --dir web style:l1` 全量 48 个场景通过；本轮提交前还将执行 `git diff --check`。
- 下一步：按用户要求全量 stage、提交并推送当前工作区。
- 阻塞/风险：未执行目标服务器 migration、部署或线上 smoke；BOM SKU 粒度、采购需求生成、MRP / 替代料、成本核算、订单 / 采购需求版本快照和客户真实数据验收仍需后续单独评审。

## 2026-06-16 19:30 CST

- 完成：修复采购订单页默认列表加载把空 `date_from` / `date_to` 传给 `purchase_order.list_purchase_orders`，导致 JSON-RPC 时间解析返回“参数不合法”的问题；未选择日期范围时现在与销售订单页一致省略空日期参数。
- 完成：补 `masterDataOrderView` 参数构造测试，覆盖采购订单头和明细的空可选日期不会作为空字符串进入保存参数，避免后续把空值误传到后端时间解析。
- 验证：`pnpm --dir web test -- masterDataOrderView.test.mjs` 通过，实际执行 web 全量 node test 312 项通过；本地后端 `/healthz` 返回 200；Browser 登录本地开发后台后打开 `http://localhost:5175/erp/purchase/accessories`，页面无“参数不合法”提示，控制台无 error / warn。
- 下一步：若后续还有出货页或其他列表页出现同类空日期参数问题，按同一口径收口请求构造或评审后端 optional time 是否接受空字符串。
- 阻塞/风险：本轮不改采购订单后端 schema、migration、usecase、RBAC、Workflow / Fact 边界或采购入库事实；当前工作区存在其他会话的未提交改动，本轮只处理采购页空日期参数和对应测试记录。

## 2026-06-16 19:43 CST

- 完成：继续排查采购订单页“服务器内部错误”，确认 `purchase_order.list_purchase_orders` 500 的根因是当前本地 dev DB 尚未应用采购订单 migration，缺少 `purchase_orders / purchase_order_items` 表。
- 完成：按 `server/Makefile` 主路径执行 `cd server && make migrate_apply`，将当前 dev DB 从 `20260615113608` 升到 `20260616084340`，应用 `20260615133823` 采购订单表 / 采购入库行追溯列和 `20260616084340` runtime marker / audit 表。
- 验证：`cd server && make migrate_status` 显示 `Migration Status: OK`、pending 0；直接调用 `purchase_order.list_purchase_orders` 返回 `code=0` 和空采购订单列表；Browser 刷新 `http://localhost:5175/erp/purchase/accessories` 后无“服务器内部错误”和“参数不合法”，控制台无 error / warn。
- 下一步：后续如果其他本地页面出现表不存在导致的 500，先按 `make print_db_url` 和 `make migrate_status` 确认运行库是否落后，而不是继续补前端参数。
- 阻塞/风险：本轮只对当前本地 dev DB 应用既有 migration，不生成新 migration，不触碰目标 / 测试服务器，不写业务数据，不改变采购订单作为 Source Document 的边界。

## 2026-06-16 19:39 CST

- 完成：收口业务模块配置中采购订单的旧壳层口径，将 `accessories-purchase` 改为正式 V1 模块，真源同步为 `purchase_orders / purchase_order_items`，并移除 formal-shell 表单字段残留。
- 完成：同步 `web/README.md` 和 `docs/product/产品完成路线图.md`，避免继续把采购订单、BOM、出货单等已正式接入页面误写成入口壳或后续实现。
- 下一步：采购入库、采购退货、采购入库调整等后续正式编辑页实现时，按 header/items 真源补对应明细区。
- 阻塞/风险：本轮只修正配置、测试和文档口径，不改 schema、migration、后端 usecase、RBAC 或页面运行逻辑；当前工作区仍有其他未提交改动。

## 2026-06-16 19:55 CST

- 完成：修复出货单页默认加载把空 `date_from` / `date_to` 传给 `operational_fact.list_shipments`，导致 JSON-RPC 时间解析返回“参数不合法”的问题；未选择日期范围时现在省略空日期参数，和销售订单、采购订单页口径一致。
- 完成：Browser 打开 `http://localhost:5175/erp/warehouse/shipments` 后页面正常渲染；点击页面内“刷新”后无“参数不合法”提示，控制台无 error / warn。
- 验证：`pnpm --dir web test` 通过，前端 node test 312 项通过；`STYLE_L1_SCENARIOS=shipment-date-filter-desktop pnpm --dir web style:l1` 通过；`pnpm --dir web css` 通过；`git diff --check -- web/src/erp/pages/ShipmentsPage.jsx` 通过。
- 下一步：若其他日期筛选页继续出现同类问题，优先按当前 V1 单据页口径检查前端是否发送空日期字符串，再评审是否需要抽公共请求参数 helper。
- 阻塞/风险：本轮只改出货单页列表请求参数，不改后端 schema、migration、Shipment Fact usecase、RBAC、库存 OUT / REVERSAL 边界或真实业务数据；未执行 `pnpm --dir web lint`，因为当前工作区已有大量其他会话改动且该命令会全量 `eslint --fix`，可能扩大无关 diff。

## 2026-06-16 20:34 CST

- 完成：全局收口业务页只读指标卡“摘要”徽标布局，把共享只读指标头部从右侧 `space-between` 改为跟随指标 label 的紧邻徽标，避免短 label 页面看起来贴到最右、长 label 页面又不一致。
- 完成：增强 `style:l1` 业务页头部统计断言，新增 `badgeLabelGap` 盒模型检查，并把 BOM 管理 3 项指标纳入同一断言口径。
- 验证：`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web lint` 通过；Browser 打开 `http://localhost:5175/erp/purchase/material-bom`，桌面 1280px 与窄屏 390px 下“摘要”和 label 间距均为 6px，页面无横向溢出，console 无 error / warn。
- 下一步：若后续还有其他只读指标卡希望恢复右侧徽标，需要先区分“只读摘要卡”和“动作 / 筛选卡”语义，不在业务页头部逐页覆盖。
- 阻塞/风险：`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 已进入目标场景但被既有供应商弹窗 textarea 字数统计位置断言挡住；该失败与本轮摘要徽标无关，已用 Browser 盒模型回归补齐目标验证。

## 2026-06-16 21:11 CST

- 完成：继续全面扫描业务页头部摘要组，确认上一轮只修了徽标内部间距，未解决采购等页面摘要组整体右浮；本轮将共享 `PageHeaderCard` 头部改为单列布局，摘要组统一放在标题说明下方左对齐。
- 完成：摘要组桌面列宽从固定 4 列改为按实际指标数量生成列，避免采购 / BOM 这类 3 指标页面保留隐形第 4 列；移动端仍保持两列响应式。
- 完成：扩展 `style:l1` 断言，检查摘要组相对头部左侧偏移不超过 24px，并把采购订单、BOM、出货单场景纳入回归。
- 验证：Browser 扫描采购、BOM、出货、销售、产品、供应商 6 个页面，摘要组距头部左侧均为 13px，徽标与 label 间距均为 6px；采购页 1280px 与 390px 均无横向溢出。`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test` 通过，`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop pnpm --dir web style:l1` 通过，`git diff --check -- web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：若继续发现不走 `PageHeaderCard` 的老页面摘要样式不一致，再按实际组件路径单独收口，不把业务页头部规则复制成多套。
- 阻塞/风险：Browser 截图捕获在采购页发生一次 CDP timeout，已改用 DOM / 盒模型指标作为验证证据；`pnpm --dir web lint` 对当前未跟踪的 `web/src/erp/pages/AuditLogsPage.jsx` 报一个既有 hook dependency warning，但退出码为 0，本轮未处理该文件。

## 2026-06-16 20:46 CST

- 完成：把业务日期输入从原生 `input[type=date]` 收口为共享 `DateInput` 组件，基于 Ant Design DatePicker 展示 `YYYY/MM/DD`、提交仍保持现有 `YYYY-MM-DD` 字符串；采购订单、销售订单、出货单、BOM 和内部事实页日期字段均改用该组件。
- 完成：`DateRangeFilter` 复用 `DateInput`，日期输入 root、内部 input 和图标统一 `cursor: pointer`，点击输入框文本区域也能打开日期面板；浅色 / 暗色样式同步收口到 `app.css`。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css` 通过；低并发 `node --test --test-concurrency=1 ...` 前端 312 项通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop` 与 `shipment-date-filter-desktop,shipment-date-filter-mobile pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/erp/purchase/accessories`，采购订单日期筛选区 2 个日期组件 root / input cursor 均为 pointer，点击左侧文本区域后 `.ant-picker-panel` 打开。
- 下一步：如后续新增日期字段，优先复用 `DateInput` / `DateRangeFilter`，不要回到原生 date input 或单页手写日历样式。
- 阻塞/风险：首次并行执行 `pnpm --dir web test` 与全量 L1 时触发本机 `EAGAIN`，已低并发重跑测试通过；全量 `pnpm --dir web style:l1` 仍失败在既有 `business-formal-module-shells-desktop` 回收站缺少“刷新”按钮断言，和本轮日期组件不在同一页面 / 控件链路，本轮未改该非本轮问题。

## 2026-06-16 21:18 CST

- 完成：全面对齐 BOM 管理页主表交互与正式业务页列表模式，补主表复选框选择、列顺序入口 / 表头列设置、导出当前结果、当前操作区多选标签和 selected items hover 明细；单条动作查看 / 编辑草稿 / 添加明细 / 复制 / 激活只在单选时启用，多选只允许走现有归档主路径。
- 完成：BOM 页面展示“批量删除”和“回收站”禁用态并用 tooltip 明确边界：当前 `bom` JSON-RPC 没有删除 BOM 版本或回收站 API，BOM 版本正式退出方式是归档，不新增前端假删除语义。
- 完成：移除 BOM 页头专属技术表 tag、`ACTIVE 不可直接改` tag 和页头 summary，将页头改为正式 V1 页面通用的 compact 标题、简短描述和统计卡，不再在页头做单页特殊强调。
- 完成：修复 BOM 选择框交互主路径，列表加载不再默认勾选第一条；刷新只保留仍存在的已选 key，清空和多选会清掉旧单选详情，checkbox 单选会按当前 `versions` 真源反查记录并同步当前操作区与协同区。
- 验证：`pnpm --dir web css`、`pnpm --dir web test -- BOMVersionsPage bomApi moduleTableColumns`、`cd web && pnpm exec eslint --ext .jsx src/erp/pages/BOMVersionsPage.jsx` 和 `git diff --check -- web/src/erp/pages/BOMVersionsPage.jsx progress.md` 通过；Browser 打开 `http://localhost:5175/erp/purchase/material-bom` 验证复选框、导出当前结果、列顺序、禁用批量删除 / 回收站、列顺序弹窗、紧凑页头、初始未选、checkbox 单选、清空恢复、当前操作区 / 协同区同步和无横向溢出。
- 下一步：如果后续确实需要 BOM 版本删除 / 恢复能力，必须先补后端 usecase、JSON-RPC、RBAC、测试和文档边界，不能只在前端加回收站按钮。
- 阻塞/风险：`pnpm --dir web style:l1` 全量仍失败在既有 `business-formal-module-shells-desktop` 回收站缺少“刷新”按钮断言，不是 BOM 页面本轮改动引入；最终全量 `pnpm --dir web lint` 被当前工作区既有 `V1PurchaseOrdersPage.jsx` 未完成改动阻断，本轮已单独验证 BOM 文件；本地当前只有 1 条 BOM 数据，Browser 未覆盖两条以上同时多选的真实点击。

## 2026-06-16 21:14 CST

- 完成：做完系统管理审计最小闭环，复用 append-only `runtime_audit_events` 记录管理员创建、角色绑定、账号启停、重置密码和角色权限变更；payload 只保存 actor、target、before / after 非敏感摘要，不保存密码、token 或密码 hash。
- 完成：新增 `system.audit.read` 权限、后端 `admin.audit_logs` 只读接口、系统管理侧栏 `审计日志` 入口和 `/erp/system/audit-logs` 页面；系统管理员内置角色默认拥有审计读取权限，业务角色不默认拥有。
- 完成：同步 `docs/当前真源与交接顺序.md`、`docs/observability/日志链路追踪审计第一版.md`、`server/docs/observability.md`、`server/README.md` 和 `web/README.md`，明确 `runtime_audit_events` 只承接启动初始化与系统控制面审计，不替代采购、库存、质检、出货或财务业务事实流水。
- 下一步：如要继续扩展，应单独评审配置变更审计、打印带值留痕或各领域事实审计；不要把业务事实统一复制进通用 audit event。
- 阻塞/风险：本轮不做通用 CRUD before / after 全量审计，不新增业务审计专表，不改 schema / migration，不部署目标环境；前端审计页是只读列表，未做复杂报表或导出中心。

## 2026-06-16 21:23 CST

- 完成：按 BOM 页同一口径收口采购订单页列表工具区，补“导出当前结果”“列顺序”“批量删除”“回收站”入口；采购订单当前没有删除 / 回收站 JSON-RPC，相关按钮保持禁用并用 tooltip 说明只能走取消或关闭状态。
- 完成：采购订单主表从 radio 单选改为受控 checkbox 多选；当前操作区展示已选数量和 selected items，编辑 / 提交 / 审核 / 关闭 / 取消只在恰好选中一条时启用，多选和清空都会清掉旧单选对象与明细，避免复选框和动作区状态不一致。
- 完成：采购订单表头接入列顺序偏好保存，导出按当前可见列顺序输出；页头统计改为总订单 / 当前结果 / 已审核 / 已选订单，移除单页专属 `Source Document` tag。
- 验证：`pnpm exec eslint --ext .jsx src/erp/pages/V1PurchaseOrdersPage.jsx`、`pnpm --dir web test -- masterDataOrderApi masterDataOrderView moduleTableColumns`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、`node --check web/scripts/styleL1.mjs` 和 `git diff --check -- web/src/erp/pages/V1PurchaseOrdersPage.jsx web/scripts/styleL1.mjs progress.md` 通过；Browser 打开 `http://localhost:5175/erp/purchase/accessories` 验证采购页不空白、无控制台 error / warn、无横向溢出、默认 0 选中、工具按钮与列顺序弹窗可见。
- 下一步：如果后续确实需要采购订单删除 / 恢复能力，必须先补后端 usecase、JSON-RPC、RBAC、测试和文档边界，不能只在前端启用按钮。
- 阻塞/风险：当前本地 dev DB 采购订单结果为 0 条，Browser 未能在真实数据态点击行复选框；选择框有数据态由受控 `selectedRowKeys` 实现和 `style:l1` 采购页场景覆盖布局。本轮不改采购订单 schema、migration、后端 API、RBAC、采购入库、退货、质检或应付事实边界。

## 2026-06-16 21:23 CST

- 完成：继续收口桌面 `/erp` 业务页局部刷新入口；采购订单、BOM 管理、出货单、业务事实处理页、正式业务壳回收站、V1 主数据回收站、销售订单回收站和业务页原型回收站不再显示内容区“刷新”按钮。
- 完成：采购订单、出货单和业务事实处理页补齐 `registerPageRefresh`，删除局部刷新后仍由壳层“刷新当前页”调用当前页面加载函数；`BusinessOperationPanel` 在没有左侧动作时不再渲染空动作容器。
- 完成：`style:l1` 增加业务页只保留壳层刷新、业务内容区无局部刷新、回收站弹窗无“刷新”按钮的负向断言，并覆盖采购、出货、供应商、客户、销售订单、产品、BOM、库存、应收等业务页路径。
- 验证：`pnpm --dir web exec eslint --ext .jsx src/erp/components/business-list/BusinessListLayout.jsx src/erp/pages/V1PurchaseOrdersPage.jsx src/erp/pages/BOMVersionsPage.jsx src/erp/pages/ShipmentsPage.jsx src/erp/pages/OperationalFactsPage.jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/pages/V1MasterDataPage.jsx src/erp/pages/V1SalesOrdersPage.jsx` 通过；`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_BASE_URL=http://localhost:4173 STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- ...` 通过。Browser 打开 `http://localhost:5175/erp/purchase/accessories`，点击壳层“刷新当前页”后出现“当前页面数据已刷新”，内容区局部刷新计数为 0，控制台无 error / warn。
- 下一步：若后续还有不在标准业务页壳层内的移动端、打印窗口或开发原型刷新入口，需要按对应入口是否有壳层刷新单独判断，不机械删除。
- 阻塞/风险：本轮不改后端、schema、migration、RBAC、菜单权限、Workflow / Fact 边界或真实业务数据；未运行会全量 `eslint --fix` 的 `pnpm --dir web lint`，避免在当前大量非本轮脏文件上扩大无关 diff，改用触达文件定向 eslint。

## 2026-06-16 21:47 CST

- 完成：按 `business-module-page-standard-v1` 原型口径，把共享业务页 `PageHeaderCard` 恢复为桌面左标题 / 说明、右侧只读摘要指标布局；移动窄屏仍保持两列摘要自然折行，避免横向溢出。
- 完成：更新 `style:l1` 业务页头部断言，从“摘要组跟随标题左对齐”改为“桌面两列、摘要组在标题右侧并贴近右边界”，并新增 `material-master-header-desktop` 场景覆盖截图中的材料档案页。
- 验证：Product Design 检查确认现有 `docs/product/prototypes/business-module-page-standard-v1/index.html` 已有左标题右摘要原型；`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=material-master-header-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=shipment-date-filter-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=shipment-date-filter-mobile pnpm --dir web style:l1`、`git diff --check -- web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：后续若发现不走 `PageHeaderCard` 的旧业务页头部仍左下显示摘要，再按对应共享组件收口，不逐页复制 CSS。
- 阻塞/风险：未执行会全量 `eslint --fix src/` 的 `pnpm --dir web lint`，避免在当前大量非本轮脏工作区扩大 diff；定向 `pnpm --dir web exec eslint scripts/styleL1.mjs` 仍被脚本内既有未使用函数和旧 `no-undef` 阻断。`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 在采购页后续来源导入弹窗点击处超时，头部断言已先执行，失败不在本轮头部布局链路。

## 2026-06-16 22:05 CST

- 完成：新增 `docs/product/prototypes/audit-log-page-v1/index.html` 和 README，把审计日志页从当前空表壳收敛为审计摘要、筛选分组、日志表格、事件详情、空态和风险事件态的 `To Implement` 原型。
- 完成：同步 `docs/product/prototypes/README.md`、静态原型查看器 `docs/product/prototypes/index.html` 以及开发态 `/__dev/prototypes` 资产登记和测试断言，明确审计日志是系统控制面只读追溯页，不替代业务事实表、后端 API、RBAC 或菜单真源。
- 下一步：若用户确认进入真实页面吸收，再按当前 `audit_logs` JSON-RPC、ERP theme token、错误提示 helper 和目标页面浏览器回归改 `web/src`；不要直接复制 mock 数据或把原型状态改为 Current。
- 阻塞/风险：本轮只做原型和登记，不改运行时审计页面、后端 schema、migration、RBAC、菜单权限或真实审计事件数据；当前工作区已有大量非本轮未提交改动，提交时需按路径精确 stage。

## 2026-06-16 21:54 CST

- 完成：按来源导入选择器模式新增共享 `SourceImportPickerModal`，把“弹窗上再弹窗”收口为主业务表单 + 第二层来源选择器两层结构；选择器只负责搜索、勾选和导入来源，不在第二层编辑业务字段。
- 完成：销售订单从 SKU 库导入订单行、采购订单从材料库导入采购明细、出货单从销售订单导入来源和可追溯明细；导入后回到主弹窗维护数量、单价、仓库、批次等本次业务字段，不从前端伪造库存、出货或财务事实。
- 完成：补充浅色 / 暗色样式、禁用行 / 限制说明样式和 L1 回归 helper，验证来源选择器最多两层、表格无横向溢出、取消 / 导入后主弹窗仍保持。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1` 和 `STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过。
- 下一步：若后续要做到 trade-erp 式“先选外销订单，再逐行勾选本次发货产品和数量”，应在同一个来源选择器内增加分步行选择，不再新增第三层弹窗。
- 阻塞/风险：当前出货单导入只从已选销售订单带出 open 销售订单行并回主弹窗补仓库 / 批次，不做可出运余量、库存预占、逐行限制说明或后端 shipment import API；这些需要后端可用量 / 预留规则后再闭环。

## 2026-06-16 22:20 CST

- 完成：按“重新造数据，所有页面都要”重建本地 dev DB 模拟数据；先通过 `debug.clear_business_data` 清空业务表，再重新写入 core demo 主数据 / BOM、试用客户供应商联系人销售订单、Operational Fact、岗位 Workflow、SKU 和采购订单数据。
- 完成：扩展后端 debug 业务数据清空 allowlist，覆盖当前 V1 主数据 / 订单、Operational Fact、Shipment、Workflow、采购入库、库存、BOM 和基础主数据表，避免重新造数时旧 sales / purchase / shipment 残值继续出现在页面。
- 完成：修正 `operational-fact-simulated-closure.mjs` 的财务事实来源，`RECEIVABLE / INVOICE` 创建时带 `source_type=SHIPMENT` 和已发货 shipment id；修正 `mobile-workflow-simulated-closure.mjs` 的 run-id 长度上限，避免生成超过 `workflow_tasks.task_code` 64 字符的任务编码。
- 验证：本地 DB 目标为 `192.168.0.106:5432/plush_erp`；数据覆盖统计显示 `customers/suppliers/contacts/products/product_skus/materials/bom_headers/bom_items/sales_orders/sales_order_items/purchase_orders/purchase_order_items/shipments/shipment_items/production_facts/outsourcing_facts/stock_reservations/finance_facts/workflow_tasks/workflow_task_events/workflow_business_states/inventory_txns/inventory_balances` 均有数据；`go test ./internal/data -run 'TestDebugSeedRepo_ClearBusinessDataDeletesCurrentProjectBusinessTables|TestDebugSeedRepo_SeedAndCleanupBusinessChainDebugData'`、`node --test scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs` 通过。
- 下一步：如需进一步做到每个 formal-shell 页面都有专属业务行而不是共享 Workflow / Fact 上下文，需要按对应领域 usecase 逐页补正式 API；不能把壳页模拟数据写成已实现事实。
- 阻塞/风险：本轮只重建本地 dev DB 模拟数据，不导入真实 yoyoosun 客户数据，不写 `business_records`，不改 schema / migration；formal-shell 页面仍是当前产品边界内的壳页或投影页，不能等同完整领域事实已实现。

## 2026-06-16 22:32 CST

- 完成：全局扫描正式业务主列表分页状态；确认采购订单和审计日志已是服务端分页，formal-shell 壳页已有本地分页，本轮补齐 BOM、V1 主数据、销售订单、出货单和业务事实处理页的主列表服务端分页。
- 完成：新增 `businessPagination` 共享 helper，统一 `limit / offset`、页大小选项、总数文案和筛选回到第一页规则；新增分页 helper 测试并接入 `web/package.json` 的 `pnpm test` 显式测试列表。
- 完成：BOM、主数据、销售订单、出货单和业务事实页不再固定 `limit: 100` 或主表 `pagination={false}`；筛选状态、关键词、日期、排序变化时回到第一页，业务事实页按 Tab 保存各自分页状态。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop,material-master-header-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/erp/purchase/material-bom`、`/erp/master/materials`、`/erp/sales/project-orders/sales-orders`、`/erp/warehouse/shipments` 和 `/erp/operations/facts`，均确认主表分页条存在并显示总数 / 页大小。
- 下一步：若后续需要引用选择器也支持远程分页，应单独按“来源选择器搜索 / 翻页 / 已选保留”设计；不要把主列表分页状态直接复用到来源弹窗。
- 阻塞/风险：全量 `pnpm --dir web style:l1` 仍失败在既有原型查看器断言，当前待实现原型为 13 个但脚本仍断言 12 个，和本轮业务主列表分页无关；本轮未处理该非分页问题。

## 2026-06-16 22:46 CST

- 完成：保留菜单入口“产品档案”，将 `/erp/master/products` 页面内业务对象文案从窄义 `SKU` 收口为“产品规格”；新建 / 编辑按钮、统计卡和弹窗标题改为“产品规格”，表单字段仍保留 `SKU 编号 / 客户 SKU / 条码` 等规格字段。
- 完成：同步 `businessModules` 产品档案说明和 `style:l1` 产品档案断言，明确该入口当前维护产品规格 / SKU 主数据，不把订单、库存、BOM、生产或出货事实混进产品档案。
- 验证：`node --check web/scripts/styleL1.mjs`、`node --test web/src/erp/config/seedData.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs`、`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1MasterDataPage.jsx`、`pnpm --dir web exec eslint --ext .jsx,.mjs src/erp/pages/V1MasterDataPage.jsx src/erp/config/businessModules.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/erp/master/products`，确认页面有“产品档案 / 新建产品规格 / 编辑产品规格”，弹窗标题为“新建产品规格”，且没有“编辑SKU”。
- 下一步：若后续要做完整产品基础档案，应在同一入口评审产品基础信息与产品规格 / SKU 的分区或 Tab，不把 SKU 直接等同整个产品档案。
- 阻塞/风险：本轮只改前端展示语义和 L1 断言，不改 `product_skus` schema、JSON-RPC、RBAC、订单 / 库存 / BOM / 出货事实主路径；全量 `pnpm --dir web test -- ...` 曾被既有移动端 / 采购入库断言阻断，`scripts/styleL1.mjs` 定向 eslint 仍被脚本内既有未使用函数和旧 `no-undef` 阻断，均非本轮产品档案文案链路。

## 2026-06-16 22:35 CST

- 完成：全局扫描出货单运行态“查看”入口，移除 `/erp/warehouse/shipments` 选择栏“查看”按钮、`view` 模式、双击行查看入口和查看弹窗标题分支；出货单主操作保留选中、添加明细、确认出货和取消出货。
- 完成：同步 `businessModules` 出货单当前范围为“列表和明细维护”，并更新 `docs/当前真源与交接顺序.md`，明确出货单不再保留单独查看按钮或双击查看入口。
- 验证：`pnpm --dir web exec eslint --ext .jsx --ext .mjs src/erp/pages/ShipmentsPage.jsx src/erp/config/businessModules.mjs`、`node --check web/src/erp/config/businessModules.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=shipment-date-filter-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/pages/ShipmentsPage.jsx web/src/erp/config/businessModules.mjs docs/当前真源与交接顺序.md progress.md` 均通过；出货单运行态文件已扫不到 `EyeOutlined / openView / isViewModal / mode: 'view' / 查看出货单`。
- 下一步：若后续要继续统一 BOM 的查看能力，需要单独评审 BOM ACTIVE 版本只读查看和复制新版本的工程资料边界，不把本轮出货单口径机械套到 BOM。
- 阻塞/风险：本轮只改出货单前端交互口径、业务模块配置、当前真源和过程记录；不改 schema、migration、后端 API、RBAC、Shipment Fact 过账 / 冲正规则或真实业务数据。

## 2026-06-16 22:34 CST

- 完成：补齐业务表单和局部动作两类原型的来源选择器口径，明确主业务弹窗可以打开第二层来源选择器，但来源选择器只做筛选 / 勾选 / 导入，不编辑本单数量、价格、仓库、批次或收货字段。
- 完成：更新 `business-form-page-standard-v1` 的 README 和 HTML，item 区从下拉导入改为“打开来源选择器”入口，并模拟导入后回填当前明细字段；更新 `action-modal-drawer-standard-v1` 的 README 和 HTML，在来源选择器弹窗顶部标注“第二层、只选来源、不编辑本单字段、不弹第三层”。
- 完成：同步 `docs/product/prototypes/README.md`、原型中心 `index.html` 搜索关键词和 `/__dev/prototypes` 资产描述，让来源选择器本体归到局部动作弹窗样板，业务表单样板只保留入口和回填结果。
- 验证：Product Design saved context preflight 显示未配置持久设计上下文，本轮按当前截图和已确认 brief 收口；`node --test web/src/erp/config/devPrototypes.test.mjs`、`git diff --check -- docs/product/prototypes/README.md docs/product/prototypes/business-form-page-standard-v1/README.md docs/product/prototypes/business-form-page-standard-v1/index.html docs/product/prototypes/action-modal-drawer-standard-v1/README.md docs/product/prototypes/action-modal-drawer-standard-v1/index.html docs/product/prototypes/index.html web/src/erp/config/devPrototypes.mjs progress.md` 通过。
- 下一步：若要继续增强来源选择器原型，可在同一个选择器弹窗内增加分步预检、跨页已选保留和不可导入原因筛选，不新增第三层弹窗。
- 阻塞/风险：本轮只补原型设计和登记，不改运行时页面、后端 API、RBAC、schema、migration 或真实来源导入规则；`pnpm --dir web test -- devPrototypes` 实际会跑完整测试列表，已在既有移动端 / 入库流断言处失败，`devPrototypes` 定向用例本身通过；当前工作区已有大量非本轮改动，提交时需要按路径精确 stage。

## 2026-06-16 22:57 CST

- 完成：按 Product Design 复审把看板中心三页运行态降密度：`/erp/dashboard` 从 5 个 KPI + 底部双总览收敛为 3 个判断指标、优先处理队列、当前任务和少量业务对象快捷入口；`/erp/task-board` 删除重复任务明细表，保留筛选、当前任务和 Workflow 泳道；`/erp/business-dashboard` 把模块健康表从多状态列压缩为模块、记录、推进、风险和入口，并移除重复关注统计。
- 完成：同步 `admin-command-center-v1`、`task-command-center-v1`、`business-management-center-v1` 和原型总 README，记录低密度方向已部分吸收到运行态，但 To Implement 原型仍不升级为 Current，也不替代菜单、RBAC、API、schema 或 Fact 真源。
- 下一步：如果后续要进一步减少左侧“看板中心”入口数量，必须单独做正式菜单评审，同步 seed、客户菜单配置、权限、路由和测试；不能只因页面更简洁就隐藏正式菜单。
- 阻塞/风险：当前工作区已有大量非本轮未提交改动；本轮只改前端看板页、样式、L1 断言和原型文档，不改后端、schema、migration、RBAC、菜单真源、Workflow / Fact 边界或真实业务数据。

## 2026-06-16 23:00 CST

- 完成：参照 `trade-erp` 来源导入选择器，补齐共享 `SourceImportPickerModal` 的受控分页、总数显示、已选来源 chip 和“清空已选”；筛选会回到第一页，翻页 / 筛选后的已选来源仍可见且可一键清空。
- 完成：销售订单 SKU 导入、采购材料导入和出货销售订单导入三处接入已选标签；出货仍只选择来源销售订单并回主弹窗维护出货数量、仓库和批次，不在前端伪造可出运余量或库存事实。
- 完成：同步来源选择器原型和 `/__dev/prototypes` 描述，明确来源选择器必须有分页、已选摘要和清空入口；复杂“选择本次发货行 / 数量”后续应在同一来源选择器流程内分步，不新增第三层弹窗。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`node --test web/src/erp/config/devPrototypes.test.mjs`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/components/business-list/SourceImportPickerModal.jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/V1PurchaseOrdersPage.jsx src/erp/pages/ShipmentsPage.jsx`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,shipment-date-filter-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- ...` 通过。
- 下一步：若要做到 `trade-erp` 出货导入的下一步，需要后端先提供可出运余量、已出货扣减和库存预警来源，再在同一个选择器流程内增加“勾选本次发货行 / 数量”步骤。
- 阻塞/风险：本轮没有改 schema、migration、后端 API、RBAC、Shipment Fact 过账、库存预占或真实可出运余量校验；`progress.md` 追加后预计接近或超过 80KB，下次再改前需要先归档。
