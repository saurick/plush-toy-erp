# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-17-before-related-actions.md`：本轮写入关联按钮前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。

## 当前活跃事项

- 当前工作区仍有大量非本轮并行改动，包含 schema / API / UI / 文档 / 原型 / 客户配置等混合现场；每轮收口必须按本轮允许路径精确说明和验证，不得回退或整理非本轮现场。
- 已接正式 V1 的销售订单、采购订单、采购入库、来料质检、库存台账、出货 / 预留和财务事实页面应保持 Workflow / Fact 边界：关联入口只提供上下文跳转或已有打印 / 生成动作，不代表下游事实自动过账。
- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；后续拆分应继续保持 Workflow 任务完成不写库存、出货、财务或付款事实。

## 2026-06-17 加工合同日期筛选栏修复

- 完成：修复 `/erp/purchase/processing-contracts` 加工合同筛选栏日期范围控件传参，移除外层重复日期字段下拉，统一由 `DateRangeFilter` 承接日期类型、开始日期和结束日期，避免渲染空白下拉框。
- 完成：保持委外订单 / 加工合同源单边界不变；本轮只改前端筛选控件，不改 schema、migration、后端 usecase、RBAC、菜单或加工合同打印模板。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；`pnpm test` 342 项通过，`style:l1` 覆盖 56 个场景。
- 验证：通过真实管理员登录打开加工合同页，覆盖桌面浅色、桌面暗色和 390px 移动宽度；确认筛选栏 `emptySelectCount=0`，日期类型为“下单日期”，下拉选项包含“下单日期 / 预计回货”，开始 / 结束日期输入存在，点击日期输入后空白下拉不复现。
- 下一步：若后续要按 URL query 预置加工合同日期筛选，需要单独接入查询参数读取和回归；本轮不扩展筛选能力。
- 阻塞/风险：未运行后端 Go 测试或 migration 检查，因为本轮不涉及后端或数据结构；浏览器验证依赖当前本地 `5175` 前端和 `8300` 后端运行态。

## 2026-06-17 关联按钮全局补齐

- 完成：按 `plush-page-design-governance` 全局扫描正式业务页，在销售订单、采购入库、来料质检、库存台账和 Operational Fact 工作区补选中态 `关联` 下拉；采购订单原有关联逻辑保留。
- 完成：关联入口只导航到已有正式页面、切换库存台账视图或回到可识别来源页；不新增 schema、migration、RBAC、菜单、后端 usecase、Workflow / Fact 写入或客户专属规则。
- 完成：不在 BOM / 主数据维护页补关联按钮，原因是当前没有明确的上下游事实动作或已实现承接页面，避免把主数据页伪装成链路总控。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；`style:l1` 覆盖 56 个场景。
- 下一步：如要让关联入口按当前单据自动筛选目标页，需要先给目标列表补正式查询参数读取和浏览器回归；不能在按钮处做页面局部假过滤。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动；本轮未提交、未推送、未改部署，也未验证后端 Go 测试或 migration 状态，因为本轮只改前端关联入口和过程记录。

## 2026-06-17 委外订单加工合同源单 V1

- 完成：将 `委外订单` 从旧 operational fact 列表收口为加工合同 / 委外源单 V1：新增 `outsourcing_orders / outsourcing_order_items` schema、migration、Ent generated code、repo/usecase、`outsourcing_order` JSON-RPC、`outsourcing.order.*` RBAC 和 `/erp/purchase/processing-contracts` 页面。页面支持状态栏统计、单选当前合同、提交 / 确认 / 关闭 / 取消、编辑弹窗、工序明细和加工合同打印带值；确认合同不写库存、质检、应付、发票、付款或 Workflow 完成。
- 完成：加工合同打印模板新增从委外订单映射合同号、来源订单、加工厂、产品、工序、单位、数量、单价、金额和备注；L1 mock 补 `outsourcing_order` 域和可委外工序，避免回归继续验证旧“委外事实”页面。
- 完成：同步 README、当前真源、正式菜单计划、实施拆分清单和产品能力台账，把“委外订单=委外发料 / 回货 facts 页面”的旧口径改为“加工合同源单已落，发料 / 回货 facts 仍在事实层”。
- 验证：`cd server && make data`、`cd server && make migrate_apply && make migrate_status` 通过，本地 dev DB 当前版本 `20260617124401`、pending 0；`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过。
- 下一步：评审委外发料 / 回货从加工合同明细带值、委外回货质检联动和委外应付 / 对账联动；不要在合同确认动作里直接写库存或财务事实。
- 阻塞/风险：完整 `pnpm style:l1` 本轮曾运行到工作台 / 业务看板阶段后长时间无输出，已中断并清理本轮 4173 验证进程；本轮用覆盖委外页和相邻业务页的目标 L1 收口。当前未做真实 yoyoosun Excel 导入、合同审批流、工序报价、附件留档或目标环境发布。

## 2026-06-17 委外订单页面工具层与协同收口

- 完成：补齐 `/erp/purchase/processing-contracts` 标准业务页工具层，新增 `导出当前结果`、`列顺序`、禁用态 `批量删除`、禁用态 `回收站`，列表列顺序跟随管理员 ERP 偏好保存并保留本地缓存兜底；导出按当前可读列顺序输出，不导出内部 ID。
- 完成：接入 `本页协同` 面板，按 `processing-contracts` + 当前委外订单 ID 过滤 Workflow 任务；协同完成 / 阻塞 / 催办只更新 Workflow 任务，不写库存、质检、应付、发票、付款或委外事实。
- 完成：表单去掉可见 `销售订单ID`、`单位ID` 和产品 / 工序 / 单位快照字段；新增 `list_units` 最小读取链路，明细单位改为单位主数据选择器，产品切换时同步带出默认单位和单位快照，避免页面直接暴露内部 ID。
- 完成：同步产品能力证据和业务模块 currentScope，明确委外订单页已具备标准工具层、本页协同和单位可读选择；真实发料 / 回货 / 质检 / 结算仍属后续事实联动。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过。
- 下一步：继续做委外发料 / 回货从加工合同明细带值、委外回货质检联动、委外应付 / 对账联动；合同审批流、工序报价、附件留档和真实客户 Excel 导入需要单独评审。
- 阻塞/风险：本轮没有做目标环境发布，也没有实现回收站 / 物理删除 API；批量删除和回收站保持禁用，避免前端假能力。当前工作区仍有非本轮并行改动，未提交、未推送。

## 2026-06-17 加工环节页面降级

- 完成：按 `plush-page-design-governance` 将 `/erp/engineering/processes` 从“工序档案”高权重表达收窄为“加工环节”小字典；保留 `processes` 工序主数据、`masterdata` JSON-RPC、`process.*` RBAC 和委外订单 `process_id` 引用，不新增工艺路线、排程、报工、库存、质检或财务写入能力。
- 完成：前端页面去掉该页摘要数字卡、导出 / 列顺序 / 禁用批量删除 / 回收站工具层，表格收窄为环节编号、名称、类别、委外、内制、需质检、状态和更新时间；委外订单页标签改为“工序来自加工环节字典”。
- 完成：同步 README、当前真源、产品入口计划、产品能力台账、字段来源规则和前端菜单断言；页面显示名为“加工环节”，技术锚点仍保留 `processes` / 工序主数据。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`git diff --check` 通过。
- 下一步：如果后续还要继续降低入口权重，需要单独评审菜单分组 / 客户菜单显隐 / 后端内置菜单 label，不在本轮顺手改 RBAC 或后端菜单真源。
- 阻塞/风险：本轮未运行后端 Go 测试、migration 或完整 `pnpm style:l1`，因为未改 schema、API、RBAC 或后端 usecase，浏览器回归采用正式业务页目标 L1 场景；L1 曾先后遇到遗留 4173 验证进程占端口和一次委外弹窗明细行等待超时，清理 / 复跑后同一目标场景通过。

## 2026-06-17 委外弹窗添加条目统一

- 完成：按 `plush-page-design-governance` 复核弹窗明细区语义，确认“加行”和“添加条目”都是弹窗内新增明细行动作，没有后端能力差异；将委外订单弹窗从顶部普通 `加行` 收口为底部共享 footer 的虚线 `添加条目`，统计展示统一为 `已录入 / 数量合计 / 金额合计` chip。
- 完成：更新 `style:l1` 断言，按通用 `.erp-sales-order-lines-form__list` 检查明细横向滚动、行宽一致、grid 不再各自横滚，并覆盖采购订单明细和委外订单桌面 / 窄屏弹窗；不改 schema、migration、RBAC、菜单、Workflow / Fact usecase 或客户专属配置。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过。
- 下一步：后续如果还有弹窗明细入口使用页面私有文案或私有容器，优先继续复用 `erp-line-items-form__footer` 和同一 L1 盒模型断言，不新增第二套“添加行”样式。
- 阻塞/风险：本轮未运行后端 Go 测试、migration 或完整 `pnpm style:l1`，因为只改前端弹窗展示与目标 L1 断言；运行 targeted L1 前曾遇到默认 `4173` 端口清理抖动，最终换 `STYLE_L1_PORT=4193` 完成验证。

## 2026-06-17 采购明细弹窗整体横向滚动

- 完成：按截图中的采购订单明细弹窗修正共享 `.erp-sales-order-lines-form` 布局，将横向滚动从每行 `.erp-sales-order-lines-form__grid` 上移到整体 `.erp-sales-order-lines-form__list`；多行明细现在共享同一个横向滚动面和列宽，不再每行各自滚动。
- 完成：补充 `style:l1` 通用断言 `assertLineItemsUnifiedHorizontalScroll`，在采购订单场景通过“从材料库导入”形成至少两行明细后检查弹窗 body 不横向溢出、整体列表可横向滚动、行宽一致、每行 grid 不再单独 `overflow-x:auto/scroll`。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=admin-login-mobile-source-desktop-choice pnpm style:l1` 均通过。
- 下一步：如果后续其他明细弹窗需要更细列宽，应继续在共享明细结构上调列宽预算或按页面加 scoped 变量，不恢复每行独立横向滚动。
- 阻塞/风险：完整 `pnpm style:l1` 本轮两次都在 Chromium `browserContext.close: Target page, context or browser has been closed` 处中断，且失败场景分别单独复跑通过；本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或后端逻辑。
