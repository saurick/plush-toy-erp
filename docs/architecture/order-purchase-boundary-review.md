# 订单 / 采购边界评审 / Order / Purchase Boundary Review

## 结论

`sales_order` 是业务源单据，不是出货事实。`purchase_order` 是采购承诺，不是采购入库事实。当前已经存在的 `purchase_receipts / purchase_returns / purchase_receipt_adjustments + inventory_txns` 承担采购入库、退货、调整和库存落账事实；Phase 1 不应重复设计这些事实表。

```text
sales_order = 业务承诺。
sales_order_item = 承诺明细。
purchase_order = 采购承诺。
purchase_receipt = 采购入库事实。
shipment = 出货事实。
inventory_txns = 库存落账事实。
AR/AP = 财务事实。
```

## 销售订单 / Sales Order

`sales_orders` 应记录客户订单承诺：

- customer_id / customer snapshot。
- order_no / customer_order_no。
- order_date。
- expected_delivery_date / ship_date。
- lifecycle status。
- owner / salesperson。
- currency / amount summary 可选。
- source snapshot / note。

`sales_order_items` 应记录承诺明细：

- product_id。
- product_sku_id 可选。
- customer_style_no / product code snapshot。
- ordered_quantity。
- unit_id。
- required_date。
- unit_price / amount 可选。
- line_status。
- cancelled_quantity / closed reason 可选。

`shipped_quantity` 不应作为手工事实字段。它可以是从 shipment facts 重算的派生值或缓存：

```text
shipped_quantity = sum(valid shipment_items.quantity by sales_order_item_id)
```

如果未来缓存 `shipped_quantity`，必须能从 `shipments / shipment_items / inventory_txns` 重算，且不能在没有 shipment facts 时伪造已发货。

## Purchase Order 是否 V1 必做

建议：`purchase_orders / purchase_order_items` 不作为 V1 schema 第一批必做，先放 V2 候选。

理由：

- 当前已有采购入库、退货、调整事实底座，采购入库事实不依赖 purchase order 才能成立。
- 从 BOM 生成采购需求会牵涉订单、BOM version、库存可用量、在途、供应商、最小起订量和采购权限，当前证据不足。
- V1 应先稳定 customers / suppliers / product_skus / sales_orders，再评审 purchase order。

如果业务要求 V1 同时做采购承诺，也必须先做独立 schema final review，不能把采购订单和采购入库混成一张表。

## Purchase Receipt 关系

当前 `purchase_receipts / purchase_receipt_items` 已经是采购入库事实源单据：

- posted 后写 `inventory_txns.IN`。
- cancel posted receipt 通过 `REVERSAL` 回退库存。
- 行级关联 material / warehouse / unit / lot。
- 与 `business_records` 可有兼容关系，但不由 `business_records` 替代。

future `purchase_orders` 与现有 receipt 的关系应是：

```text
purchase_order / item = 采购承诺。
purchase_receipt / item = 真实到货入库事实。
```

一个采购订单可以多次入库；一个采购入库可选关联采购订单行，也可能来自无 PO 的历史 / 快速入库场景，具体必须在 V2 schema review 中确认。

## BOM 到采购需求

V1 建议只做文档和模型评审，不直接实现 BOM 生成采购需求。

V2 可评审：

- `purchase_demands` 是否需要独立表。
- 是否从 `sales_order_items + active BOM` 计算材料需求。
- 是否扣减现有库存、在途和已下 PO。
- 是否按供应商、物料、交期合并。
- 是否需要需求冻结和版本快照。

采购需求不是采购事实；采购事实仍由 `purchase_receipts` 和 `inventory_txns` 落账。

## 采购下单与真实入库分离

| 概念 | 表 | 影响库存 | 说明 |
| --- | --- | --- | --- |
| 采购需求 | `purchase_demands` V2 可选 | 否 | 从订单/BOM/库存计算出来的计划 |
| 采购承诺 | `purchase_orders / purchase_order_items` V2 候选 | 否 | 已向供应商下单 |
| 采购入库事实 | `purchase_receipts / purchase_receipt_items` 已有 | 是 | 到货验收入库，posted 后写库存 |
| 采购退货事实 | `purchase_returns / purchase_return_items` 已有 | 是 | 退供应商，posted 后扣库存 |
| 采购入库调整 | `purchase_receipt_adjustments / items` 已有 | 是 | 入库后数量或 lot/warehouse 更正 |

`purchase_order` 不能替代 `purchase_receipt`。Workflow 的采购跟进也不能替代采购事实。

## 出货放行与真实出货分离

`shipment_release done -> shipping_released` 只表示已放行 / 可发货 / 待出库。

禁止：

- 从 `shipping_released` 生成 shipment。
- 从 `shipping_released` 写 `inventory_txns.OUT`。
- 从 `shipping_released` 生成 AR/AP、invoice、payment。
- UI 把 `shipping_released` 显示为已出库 / 已发货 / 已扣库存。

`shipped` 只能由 future ShipmentUsecase / shipment facts / outbound inventory_txns 支撑。sales order 未出货数量应从 shipment facts 重算：

```text
unshipped_quantity = ordered_quantity - valid_shipped_quantity
```

## 财务边界

财务应付不应从 purchase order 直接生成，至少要评审采购入库、对账、发票和付款口径。

建议口径：

- AP candidate 可以基于 posted purchase receipt / accepted invoice / reconciliation 评审。
- AR candidate 至少应在真实 shipped 后评审。
- invoice / payment / reconciliation 是财务事实，不由 Workflow done 或 source document status 直接伪造。

## 权限评审口径

后续 usecase 动作必须按顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

菜单权限不等于动作权限。前端隐藏按钮不是安全边界。
