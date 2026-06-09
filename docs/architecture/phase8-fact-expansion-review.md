# Phase 8 事实层扩展总评审 / Phase 8 Fact Expansion Review

- 文档类型：架构评审 / Architecture Review
- 状态：Phase 8 统一 review、本地最小实现闭环、当前目标环境发布、登录态只读 API smoke 和内部模拟事实写入闭环已完成
- Runtime Source of Truth / 运行时真源：No
- Schema Source of Truth / Schema 真源：No
- Current Implementation Source of Truth / 当前实现真源：No；当前实现以 Ent schema、migration、biz/data usecase、JSON-RPC、前端页面和测试为准

## 1. 结论

Phase 8 不拆任何字母子阶段，也不再把生产、委外、出货、库存预留和财务拆成后续字母半阶段。本文先作为 Phase 8 的统一 review，一次性覆盖五条事实链的真源、边界、状态、冲正、幂等、RBAC、API、UI、测试和停止条件；当前同一 Phase 8 内已落本地最小实现闭环。

本文最初作为 docs-only review，随后同一 Phase 8 内已落本地最小实现闭环：schema / migration、repo / usecase、API / RBAC、最小 UI 和测试。2026-06-08 已发布到当前目标环境并执行 migration 到 `20260608134530`，健康检查、前端 Phase 8 路由、未登录鉴权 smoke、目标试用账号 RBAC 核对、登录态只读 Phase 8 API smoke 和内部受控模拟事实写入闭环均已通过。客户使用确认属于交付后的业务确认，不再作为 Phase 8 完成阻塞；该结论仍不代表真实客户数据导入、完整打印、完整报表、发票和收付款核销已经交付。

## 2. 范围项

| 范围项 | 目标 | 本文评审结果 | 不做 |
| --- | --- | --- | --- |
| 生产事实 / Production Facts | 明确生产领料、成品入库、返工事实边界 | 已落最小 `production_facts`，过账写 `inventory_txns` IN / OUT，取消写 REVERSAL | 不把生产任务 done 当成入库或成本事实 |
| 委外事实 / Outsourcing Facts | 明确委外发料、委外回货边界 | 已落最小 `outsourcing_facts`，发料写 OUT，回料写 IN，取消写 REVERSAL | 委外结算不写成委外库存事实，进入财务事实 |
| 出货事实 / Shipment Facts | 明确出货计划、实际发货、取消冲正边界 | 已落 `shipments` / `shipment_items`，发货写库存 OUT，取消写 REVERSAL | 不把 `shipping_released` 当成 `shipped` |
| 库存预留 / Stock Reservation | 明确可用量、预留、释放、消耗顺序 | 已落 `stock_reservations`，只影响可用量检查，不写库存流水 | 不从销售订单直接扣库存 |
| 财务事实 / Finance Facts | 明确 AR/AP、发票、收付款、对账状态事实 | 已落 `finance_facts` draft / posted / settled / cancelled | 不从放行或任务状态直接生成财务事实 |

## 3. 总边界

- Workflow task done 不等于 Fact posted。
- Source Document 只代表业务承诺，不代表事实落账。
- `shipping_released` 只表示出货放行，不表示 shipped、库存扣减、应收或开票。
- 成品入库任务完成不等于库存入账；真实库存变化必须由事实 usecase 写 `inventory_txns` 并维护余额。
- 财务事实必须晚于真实可审计业务事实，且必须支持冲正、审计和幂等。
- 客户合同、Excel、截图和模拟数据只能作为线索或样本，不直接进入 Product Core。

## 4. 事实链评审结果

### 4.1 生产事实 / Production Facts

| 项目 | 结论 |
| --- | --- |
| 唯一真源 | `production_facts` + `Phase8Usecase`；workflow task、`workflow_business_states` 和 `business_records` 都不是生产事实真源 |
| 已落事实类型 | `MATERIAL_ISSUE`、`FINISHED_GOODS_RECEIPT`、`REWORK` |
| 状态边界 | `DRAFT` / `POSTED` / `CANCELLED`；受保护字段不可直接更新，已过账只能取消冲正 |
| 库存影响 | 生产领料和返工写 `inventory_txns.OUT`；成品入库写 `inventory_txns.IN` 并维护余额 |
| 冲正 | 取消已过账生产事实时写 `inventory_txns.REVERSAL`，不直接改历史流水 |
| RBAC | 复用 `pmc.plan.*` 与 `warehouse.adjustment.create` 守卫创建、过账和取消 |
| API / UI | `phase8` JSON-RPC 暴露 create / post / cancel / list；`/erp/phase8/facts` 只提交 usecase 动作 |
| 剩余项 | 未接生产订单专表、移动端岗位任务投影、成本归集或完整报工 |

### 4.2 委外事实 / Outsourcing Facts

| 项目 | 结论 |
| --- | --- |
| 唯一真源 | `outsourcing_facts` + `Phase8Usecase`；加工合同打印样式不是委外事实真源 |
| 已落事实类型 | `MATERIAL_ISSUE`、`RETURN_RECEIPT` |
| 状态边界 | `DRAFT` / `POSTED` / `CANCELLED`；委外库存事实和财务结算事实分开 |
| 库存影响 | 委外发料写 `inventory_txns.OUT`；委外回料写 `inventory_txns.IN` |
| 冲正 | 取消已过账委外事实时写 `inventory_txns.REVERSAL`，不覆盖原始外发和回货事实 |
| RBAC | 复用 `purchase.order.*` 与 `warehouse.adjustment.create` 守卫创建、过账和取消 |
| API / UI | `phase8` JSON-RPC 暴露 create / post / cancel / list；`/erp/phase8/facts` 只提交 usecase 动作 |
| 剩余项 | 委外结算进入 `finance_facts`，未做委外订单专表、质检对接或应付自动生成 |

### 4.3 出货事实 / Shipment Facts

| 项目 | 结论 |
| --- | --- |
| 唯一真源 | `shipments` / `shipment_items` + `Phase8Usecase`；`shipping_released` 只是 workflow 协同状态 |
| 已落事实类型 | 出货单草稿、出货行、发货、取消发货 |
| 状态边界 | `DRAFT` / `SHIPPED` / `CANCELLED`；`SHIPPED` 才代表真实出货 |
| 库存影响 | 发货按出货行写 `inventory_txns.OUT`；取消已发货出货单写 `inventory_txns.REVERSAL` |
| 冲正 | 已 shipped 的错误走取消发货冲正；不直接改原出货流水 |
| RBAC | 复用 `sales_order.update` 创建草稿 / 加行，`warehouse.outbound.confirm` 确认发货和取消 |
| API / UI | `phase8` JSON-RPC 暴露 create / add item / ship / cancel / list；UI 继续区分放行与已发货 |
| 剩余项 | 未接拣货、装箱、物流、打印、退货或自动应收派生 |

### 4.4 库存预留 / Stock Reservation

| 项目 | 结论 |
| --- | --- |
| 唯一真源 | `stock_reservations` + `Phase8Usecase`；销售订单行不是预留真源 |
| 已落事实类型 | 新建预留、释放预留、消耗预留、列表 |
| 状态边界 | `ACTIVE` / `RELEASED` / `CONSUMED`；消耗只能从 active 进入 |
| 库存影响 | 新建预留检查 `inventory_balances - active reservations`，不写 `inventory_txns` |
| 冲正 | 释放和消耗只变更预留状态；已消耗后的库存冲正仍跟随出货事实冲正处理 |
| RBAC | 复用 `sales_order.update`、`warehouse.inventory.read` 和 `warehouse.outbound.confirm` |
| API / UI | `phase8` JSON-RPC 暴露 create / release / consume / list；UI 不把菜单显隐当权限边界 |
| 剩余项 | 未做并发锁升级、可用量专用 read model、按订单行自动预留或出货自动消耗 |

### 4.5 财务事实 / Finance Facts

| 项目 | 结论 |
| --- | --- |
| 唯一真源 | `finance_facts` + `Phase8Usecase` |
| 已落事实类型 | `RECEIVABLE`、`PAYABLE`、`INVOICE`、`PAYMENT`、`RECONCILIATION` |
| 状态边界 | `DRAFT` / `POSTED` / `SETTLED` / `CANCELLED`；posted 后只能结清或取消 |
| 前置事实 | 应收仍应晚于 shipped；应付仍应晚于采购入库 / 委外结算等可审计事实；当前不自动派生 |
| 冲正 | 当前最小实现只做状态取消，未写总账、核销、红冲或反向金额事实 |
| RBAC | 复用 `finance.receivable.*` 与 `finance.payable.*` 守卫创建、过账、结清和取消 |
| API / UI | `phase8` JSON-RPC 暴露 create / post / settle / cancel / list；UI 不从放行状态派生应收或开票 |
| 剩余项 | 未做发票明细、收付款核销、对账单、总账、自动派生或报表 |

## 5. 本地实现摘要

本地实现已完成以下最小闭环：

1. Ent schema 和 Atlas migration：`production_facts`、`outsourcing_facts`、`shipments`、`shipment_items`、`stock_reservations`、`finance_facts`。
2. 后端 usecase / repo：`Phase8Usecase` 和 `NewPhase8Repo`，库存影响统一复用 `InventoryUsecase` 的事务内流水与余额更新能力。
3. JSON-RPC / RBAC：新增 `phase8` handler，复用既有生产、采购、销售、仓库和财务权限码。
4. 前端 UI：保留内部直达页面 `/erp/phase8/facts`，统一处理五条事实链的创建、过账 / 发货 / 释放 / 消耗 / 结清 / 取消动作；该页面不进入客户侧栏、前端默认菜单或后端内置菜单。
5. 测试：新增 repo 层生产过账与冲正、库存预留可用量检查、出货发货与取消冲正测试；同步验证客户菜单不展示内部 Phase 8 入口。

后续扩展仍必须至少写清：

1. 当前唯一真源和既有真源是否可复用。
2. 是否需要扩展 Ent schema、字段或 migration。
3. 状态机、终态、取消、作废和冲正口径。
4. 幂等键、并发保护、重复提交和 source tracing。
5. RBAC 动作权限、角色职责和业务守卫。
6. API 是否只暴露 usecase 能力，不补造事实逻辑。
7. UI 是否只展示和提交事实 usecase，不在前端本地派生事实。
8. 测试层级、验收命令、停止条件和剩余风险。

允许的实现闭环顺序不是 Phase 8 子阶段，只是工程依赖顺序：

1. 先落会被其他链路引用的事实真源和库存影响边界。
2. 再落 API / RBAC 和 UI 操作入口。
3. 最后接客户试用、培训、交付台账和目标环境验收。

## 6. 剩余停止条件

当前 Phase 8 本地最小实现已完成，但仍不允许：

- 修改 `WorkflowUsecase` 去写库存、出货或财务事实。
- 把 Phase 7 模拟数据或客户样本转写成真实导入、出货、库存或财务事实。
- 把内部模拟闭环写成真实客户数据导入、客户已签收或完整业务交付。

Phase 8 当前按目标环境内部模拟事实闭环关闭，执行手册为 `docs/customers/yoyoosun/phase8-target-release-acceptance.md`，本次发布和模拟闭环 evidence 为 `docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`。自动派生、报表、打印、核销、物流退货或并发锁升级仍是后续增强，不作为 Phase 8 本地最小实现的补尾；若启动这些增强，仍必须按 `docs/product/implementation-governance.md` 明确允许路径、禁止路径、验收命令和停止条件。
