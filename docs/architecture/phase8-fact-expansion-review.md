# Phase 8 事实层扩展总评审 / Phase 8 Fact Expansion Review

- 文档类型：架构评审 / Architecture Review
- 状态：Phase 8 已开启，评审准备中
- Runtime Source of Truth / 运行时真源：No
- Schema Source of Truth / Schema 真源：No
- Current Implementation Source of Truth / 当前实现真源：No

## 1. 结论

Phase 8 已开启，但当前只进入事实层扩展的总评审。Phase 8 不拆任何字母子阶段；生产、委外、出货、库存预留和财务只作为同一 Phase 内的事实链范围项。本文不代表生产、委外、出货、库存预留、应收、应付、发票、收付款或对账已经实现。

Phase 8 可以一次性规划完整主干闭环，但每条事实链仍必须先完成 docs-only review，再按项目门禁进入 schema / migration、repo / usecase、API / RBAC、UI 和测试。不得为了“一次做完”跳过事实层评审、冲正边界、幂等、权限和验收。

## 2. 范围项

| 范围项 | 目标 | 首轮产物 | 不做 |
| --- | --- | --- | --- |
| 生产事实 / Production Facts | 明确生产订单、生产领料、成品入库、返工事实边界 | production fact review | 不把生产任务 done 当成入库或成本事实 |
| 委外事实 / Outsourcing Facts | 明确委外订单、委外发料、委外回货、委外结算边界 | outsourcing fact review | 不把加工合同样式当委外核心规则 |
| 出货事实 / Shipment Facts | 明确出货计划、放行、拣货、实际出库、冲正边界 | shipment fact review | 不把 `shipping_released` 当成 `shipped` |
| 库存预留 / Stock Reservation | 明确可用量、预留、释放、并发扣减和出库扣减顺序 | stock reservation review | 不从销售订单直接扣库存 |
| 财务事实 / Finance Facts | 明确 AR/AP、发票、收付款、对账和冲正边界 | finance fact review | 不从放行或任务状态直接生成财务事实 |

## 3. 总边界

- Workflow task done 不等于 Fact posted。
- Source Document 只代表业务承诺，不代表事实落账。
- `shipping_released` 只表示出货放行，不表示 shipped、库存扣减、应收或开票。
- 成品入库任务完成不等于库存入账；真实库存变化必须由事实 usecase 写 `inventory_txns` 并维护余额。
- 财务事实必须晚于真实可审计业务事实，且必须支持冲正、审计和幂等。
- 客户合同、Excel、截图和模拟数据只能作为线索或样本，不直接进入 Product Core。

## 4. 进入实现前门禁

每条事实链进入 schema / migration 前，必须至少写清：

1. 当前唯一真源和既有真源是否可复用。
2. 是否需要新增 Ent schema、字段或 migration。
3. 状态机、终态、取消、作废和冲正口径。
4. 幂等键、并发保护、重复提交和 source tracing。
5. RBAC 动作权限、角色职责和业务守卫。
6. API 是否只暴露 usecase 能力，不补造事实逻辑。
7. UI 是否只展示和提交事实 usecase，不在前端本地派生事实。
8. 测试层级、验收命令、停止条件和剩余风险。

## 5. 当前停止条件

当前 Phase 8 已开启但仍停在 docs-only 总评审层。本轮不允许：

- 新增 schema 或 migration。
- 修改 `WorkflowUsecase` 去写库存、出货或财务事实。
- 新增 shipment、reservation、production、outsourcing 或 finance runtime API。
- 把 Phase 7 模拟数据或客户样本转写成真实导入、出货、库存或财务事实。
- 把目标客户环境未验收状态写成 Delivery Ready。

下一步应先选择 Phase 8 内一条事实链做专项 docs-only review，再决定是否进入实现。
