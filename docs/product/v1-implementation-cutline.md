Doc Type: V1 Implementation Cutline
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# V1 Implementation Cutline

本文件决定下一轮真正可以实现的 Ent schema 范围。下一轮只允许做这里标为 `Yes` 的表；不得顺手实现 repo/usecase、API/RBAC、UI、seed、docs registry 或迁移外的业务逻辑。

## Allowed in next Ent schema goal

下一轮 Ent schema goal 允许落：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

限制：

- 这些表只表达 MasterData 和 Source Document。
- 不写库存、出货、预留、财务事实。
- 不新增 `tenant_id`。
- `sales_order_items.product_sku_id` 不进入第一 cutline。
- `contacts` 采用 `owner_type + owner_id` 文档口径，下一轮 schema 必须明确 DB check / usecase guard 方案。
- `business_records` 只作为 migration source snapshot / compatibility reference，不作为长期关系主键。

## Draft only, not next schema goal

暂时只保留 draft，不进入下一轮 Ent schema：

- `product_skus`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `supplier_material_profiles`
- `customer_addresses`
- `settlement_terms`

原因：

- `product_skus` 还不能证明不是 `products` 别名。
- BOM 版本扩展不得重复现有 `bom_headers.version/status/effective_*`。
- 采购订单和采购需求属于 V2 purchase planning / source document review。
- 地址和结算条款仍可能只是 current 客户样本或 finance review 候选。

## Deferred to later fact reviews

必须等事实层评审：

- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

原因：

- 这些对象影响库存、出货、财务或生产事实。
- `shipping_released != shipped`。
- `shipment_release done` 不能生成出货、库存扣减、应收或发票。
- Workflow 只记录协同许可；Fact 必须由领域 usecase 产生。

## Explicitly forbidden in V1

V1 明确禁止：

- `tenant_id`
- SaaS runtime tenant tables
- license server tables
- billing / plan tables
- customer ticket tables
- generic `change_records`
- `ChangeUsecase`
- workflow-owned inventory facts
- workflow-owned shipment facts
- workflow-owned finance facts

## Object Cutline Table

| Object | Next Schema Goal? | Reason | Stop Conditions |
|---|---:|---|---|
| `customers` | Yes | 客户主数据是订单源单据的必要引用；不重复已有事实表。 | current-only 字段必填；无 code 唯一策略；与 partners 页面双写无退出计划。 |
| `suppliers` | Yes | 供应商主数据是采购和未来应付引用基础；V1 不改采购事实。 | 直接修改已过账 receipt；银行 / 发票字段变必填。 |
| `contacts` | Yes | 联系人独立建模可避免继续塞 payload。 | owner_type / owner_id 无校验策略；current-only 联系人字段必填。 |
| `sales_orders` | Yes | Source Document，记录客户订单承诺。 | 状态混用 shipped / finance；workflow done 写订单事实。 |
| `sales_order_items` | Yes | 订单承诺明细，引用 existing `products / units`。 | `shipped_quantity` 手工事实；强依赖 `product_skus`。 |
| `product_skus` | No | 证据不足，可能重复 `products`。 | 未证明影响订单 / BOM / 库存 / 出货粒度。 |
| `customer_addresses` | No | 地址类型和通用性未确认。 | 仅 current 地址样本支撑。 |
| `supplier_material_profiles` | No | 需 V2 purchase planning review。 | 重复 `materials` 或把供应商习惯写进核心。 |
| `settlement_terms` | No | 需 finance review。 | 暗示直接生成 AR/AP。 |
| `order_revisions` | No | 需订单审计策略，不创建泛 Change。 | 滑向 `change_records` 或 `ChangeUsecase`。 |
| BOM version extension | No | 现有 BOM 已有 version/status。 | 建第二套 BOM 真源。 |
| `purchase_orders` | No | V2 采购承诺，不是入库事实。 | 替代 `purchase_receipts` 或直接生成 AP。 |
| `purchase_order_items` | No | 需 receipt matching 和采购评审。 | received quantity 无事实来源。 |
| `purchase_demands` | No | 计划 / 派生对象。 | 需求缓存被当采购事实。 |
| `stock_reservations` | No | 库存 / 出货事实层。 | 从 `shipment_release done` 生成。 |
| `shipments` | No | 出货事实层。 | `shipping_released` 当 `shipped`。 |
| `shipment_items` | No | 出货行事实层。 | 没有 outbound inventory facts。 |
| AR/AP/invoice/payment/reconciliation | No | 财务事实层。 | 未 shipped / receipt / invoice review 就生成财务事实。 |

## Next Ent Schema Goal Exact Cutline

下一轮 goal 名建议：`003-v1-ent-schema-customers-suppliers-orders`。

允许文件范围应限制为：

- `server/internal/data/model/schema/*`
- Ent generated files
- migration files
- schema docs status updates

禁止同轮修改：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- business repo/usecase implementation
- API/service/server
- frontend UI
- docs registry
- seedData
- `server/internal/core/*`

下一轮必须先在 goal 内重新确认：

1. 本文件仍是最新 cutline。
2. `tenant_id` 未进入字段列表。
3. `product_skus` 仍未进入 first cutline。
4. `shipping_released != shipped` 没有被订单状态字段破坏。
5. `business_records` 只是 migration source snapshot / compatibility reference。
