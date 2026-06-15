# 主数据 / 源单据 / 事实边界评审 / MasterData / Source Document / Fact Review

## 结论

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

早期 V1 推荐先评审并准备正式 `customers / suppliers / contacts / sales_orders / sales_order_items`。这些对象补齐的是主数据和订单源单据，不替代已经存在的库存、BOM、采购入库、采购退货、采购入库调整、批次和来料质检事实真源。

本文件是架构评审，不是 runtime 实现，不代表 Ent schema、migration、API 或 UI 已落地。

## 分层定义

| 层 | 定义 | 当前示例 | 不能承担 |
| --- | --- | --- | --- |
| MasterData | 长期稳定对象，供多个业务单据引用 | `units`、`materials`、`products`、`warehouses`、候选 `customers`、`suppliers`、`contacts` | 不记录真实入库、出库、开票、付款 |
| Source Document | 记录业务承诺、来源和阶段 | 候选 `sales_orders`、`sales_order_items`、future `purchase_orders` | 不伪造库存、出货、财务事实 |
| Fact | 记录真实发生和落账追溯 | `inventory_txns`、`purchase_receipts`、`purchase_returns`、`purchase_receipt_adjustments`、`quality_inspections`、future `shipments`、AR/AP、invoice、payment | 不由 Workflow done 直接补造 |
| Workflow | 记录协同许可、职责、任务事件和必要派生 | `workflow_tasks`、`workflow_task_events`、`workflow_business_states` | 不写库存、出货、预留、AR/AP、invoice、payment |
| Derived Status | 从事实重算的结果，可缓存 | fulfillment、receipt、payment、invoice status | 不能成为原始事实 |

必须保持：

```text
MasterData 是长期稳定对象。
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

```text
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
```

```text
动作产生事实，事实推导结果。
结果可以缓存，但不能伪造事实。
```

## 旧 business_records 定位

旧 `business_records / business_record_items / business_record_events` 表族已由 `20260612112337` migration 删除。它们不是任何正式业务对象的可写 Product Core 真源，也不再承担兼容层、demo / seed / QA debug、source snapshot、调研入口、历史页面查询或打印带值候选。

不能长期承担：

- 正式 `customers / suppliers / contacts` 主数据。
- 正式 `sales_orders / sales_order_items` 源单据。
- `inventory_txns / inventory_balances / inventory_lots` 库存事实。
- `purchase_receipts / purchase_returns / purchase_receipt_adjustments` 采购事实。
- `shipments` 出货事实。
- AR/AP、invoice、payment 财务事实。
- Product Core 的字段唯一真源。

删除前 JSONL evidence 只作为当前开发库迁移证据，不能替代正式 customers / suppliers / orders / inventory / shipment / finance facts，也不能作为 import/backfill 自动来源。

## V1 推荐起点

V1 应优先评审正式：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

原因：

1. 当前主流程需要稳定客户、供应商、联系人和订单源单据，避免恢复旧 `business_records` 影子承接主档关系。
2. 现有库存、BOM、采购入库、采购退货、采购入库调整和来料质检已经有专表，早期 V1 不应重复设计这些事实对象。
3. `sales_order` 是业务承诺，后续可被 BOM、采购需求、生产、出货和财务引用，但它本身不是出货或库存事实。

V1 不应直接做：

- 完整采购订单 + 合同审批 + 供应商报价。
- 出货事实、库存预留、实际出库。
- 应收、应付、发票、付款、对账。
- 完整 SaaS 多租户。
- license server、billing、customer ticket system。
- 泛化 ChangeUsecase 或 `change_records`。
- 把 永绅 yoyoosun 客户 Excel 列直接升级成 Product Core schema。

```text
V1 应优先评审正式 customers / suppliers / contacts / sales_orders / sales_order_items。
V1 不应直接把 永绅 yoyoosun 客户 Excel 列变成 Product Core schema。
V1 不应直接从 Workflow 推导库存、出货、财务事实。
```

## 避免 status 混用

禁止把 Workflow、Source Document、Fact、Derived Status 混进一个 `status`：

- workflow task status：`pending / done / blocked / rejected`，只代表协同节点处理结果。
- source document lifecycle：`draft / submitted / approved / closed / canceled` 等，代表单据阶段。
- fact status：`POSTED / CANCELLED / REVERSAL` 等，代表真实动作或冲正。
- derived fulfillment status：从 shipment facts 和 order items 重算。
- finance status：从 invoice、payment、reconciliation facts 重算。

`shipping_released` 是单据/协同结果口径，可显示为“已放行 / 可发货 / 待出库”，不得显示成“已出库 / 已发货 / 已扣库存”。`shipped` 必须由 shipment facts / inventory_txns 支撑。

## 避免从 UI 菜单反推业务完成度

前端菜单和 `business_records` 页面只能说明当前有入口、历史快照或字段参考，不能证明对应领域模型已经完成。判断完成度必须回到：

1. Ent schema / migration 是否存在。
2. usecase / repo 是否有状态机、幂等、事务和冲正。
3. API / RBAC 是否接入动作权限和数据范围。
4. 测试是否覆盖 happy path、非法状态、重复提交、取消 / 冲正、事务失败和不可物理删除。
5. 正式文档是否将能力标为 implemented，而不是 draft / review。

## 权限评审口径

后续每个 usecase 需要按以下顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

菜单权限不等于动作权限。前端隐藏按钮不是安全边界。后端 usecase 必须校验动作权限、数据范围和状态机。
