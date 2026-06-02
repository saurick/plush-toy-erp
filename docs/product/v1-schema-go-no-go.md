Doc Type / 文档类型: V1 Schema Go/No-Go
Status / 状态: Proposed / 候选
Runtime Implemented / 运行时已实现: MasterData repo/usecase for customers / suppliers / contacts added in 005; Sales Order repo/usecase for sales_orders / sales_order_items added in 006; JSON-RPC API/RBAC for these V1 objects added in 007; V1 frontend pages for customers / suppliers / contacts / sales_orders / sales_order_items added in 008; current customer import dry-run draft added in 010 docs-only, with no runtime import/backfill implemented
Ent Schema Implemented / Ent Schema 已实现: Schema files added in 003; generated code added in 004
Migration Implemented / Migration 已实现: Yes, generated in 004 / 是，004 已生成
Current Implementation Source of Truth / 当前实现真源: Schema files, generated Ent code, Atlas migration, 005 MasterData repo/usecase for customers / suppliers / contacts, 006 Sales Order repo/usecase for sales_orders / sales_order_items, 007 JSON-RPC API/RBAC handlers, 008 V1 frontend pages/API client/tests, and 010 docs-only current customer import dry-run draft documents

# V1 Schema Go / No-Go Checklist

本检查清单用于下一轮 Ent schema goal 前的 go/no-go。结论只允许在 `docs/product/v1-implementation-cutline.md` 的范围内 Proceed With Restrictions。

003 schema-only 已按本清单落入 `customers / suppliers / contacts / sales_orders / sales_order_items` Ent schema 文件；004 已运行 Ent generate 并生成 Atlas migration；005 已新增 `customers / suppliers / contacts` repo/usecase 和测试；006 已新增 `sales_orders / sales_order_items` repo/usecase 和测试；007 已新增这些对象的 JSON-RPC API 和 RBAC 动作权限；008 已新增 V1 前端页面和前端 API client/tests；009 已新增 `business_records` 兼容层引用审计、过渡审计、cutover plan、data map draft 和 risk register；010 已新增 current customer import dry-run draft、字段分类、unresolved queue、acceptance checklist、Product 层 import strategy 和 risk register。docs registry、seedData、`business_records` runtime transition、真实 import loader、backfill 和真实数据迁移仍未实现；销售订单仍是 Source Document，不写 shipment / inventory / finance facts。

| Check | Answer | Evidence | Decision | Owner Layer |
|---|---|---|---|---|
| 是否重复已有 `products/materials/units/warehouses` | No for cutline | 下一轮只落 customers/suppliers/contacts/sales_orders/sales_order_items；`products/materials/units/warehouses` 已有 Ent schema。 | Go with restriction | MasterData |
| 是否重复已有 `bom_headers/bom_items` | No for cutline | BOM version extension Draft Only；现有 BOM 已有 version/status/effective fields。 | No-Go for BOM extension | MasterData |
| 是否重复已有 `purchase_receipts/purchase_returns/purchase_receipt_adjustments` | No for cutline | purchase_orders Draft Only；采购入库、退货、调整事实已有专表。 | No-Go for PO in V1 | Purchase / Inventory |
| 是否重复已有 `inventory_txns/inventory_balances/inventory_lots` | No for cutline | stock_reservations / shipments deferred；不写库存事实。 | Go with restriction | Inventory |
| 是否重复已有 `quality_inspections` | No | 本轮不落 quality entities。 | Go | Quality |
| 是否只是 current 客户样本字段 | Some candidates yes | SKU、地址、结算、供应商供货习惯仍多来自 current 线索。 | Exclude from V1 cutline | Productization |
| 是否影响库存事实 | Allowed cutline does not directly | sales orders only indirect demand source；不写 inventory_txns。 | Go with restriction | Inventory |
| 是否影响出货事实 | Allowed cutline indirect only | sales_orders 是 shipment source document，不是 shipment fact。 | Go with restriction | Shipment |
| 是否影响财务事实 | Allowed cutline indirect only | customers/suppliers/orders 不生成 AR/AP/invoice/payment。 | Go with restriction | Finance |
| 是否需要 workflow 写 fact | No | Workflow 只记录协同许可；source documents 不由 workflow 写事实。 | Go | Workflow / Fact |
| 是否需要 migration backfill | Yes, later | business_records partners/orders may be migration source snapshots；下一轮 schema 可先不 backfill。 | Restrict: require dry-run in migration goal | Data |
| 是否需要唯一索引 | Yes | customers/suppliers code、sales_orders order_no、sales_order_items order_id+line_no 需要唯一策略。 | Go if included in schema goal | Data |
| 是否需要状态机 | Yes for orders | customers/suppliers/contacts only active status；sales_orders/items need lifecycle status, not fact status。 | Go with restriction | Domain |
| 是否需要幂等键 | Not for pure schema; later usecase yes | Source document create/update usecase later must define idempotency / duplicate handling。 | Defer to usecase goal | Biz |
| 是否需要 RBAC 权限码 | Done for V1 API cutline | 007 已新增 `customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.*` 动作权限。 | Done for API-RBAC cutline | RBAC |
| 是否需要 API | Done for V1 API cutline | 007 已新增 `masterdata` 与 `sales_order` JSON-RPC handlers，仍不接 UI。 | Done for API-RBAC cutline | API |
| 是否需要 UI | Done for V1 UI cutline | 008 已新增客户 / 供应商 / 联系人 / 销售订单 / 销售订单行前端页面；docs registry、seedData 和 `business_records` transition 仍未实现。 | Done for UI cutline | UI |
| 是否需要导入 | Later yes | 009 已输出 data map draft；current 数据导入仍必须 dry-run 和字段分类，不能混入 schema goal。 | Defer | Data Import |
| 010 current import dry-run draft 是否已补 | Yes, docs-only | 已新增 current 导入来源清单、字段分类、dry-run plan、unresolved queue、acceptance checklist、Product 层 strategy 和 risk register。 | Done for docs draft only | Data Import |
| 是否需要客户配置 | Later yes | 字段显示、编号规则属于 config draft；打印格式当前只记录客户样本和低风险展示参数，不进入 schema first cut，也不做模板内核。 | Defer | Productization |
| 是否包含 `tenant_id` | No | 正式 cutline 禁止；grep 命中只能是 imported notes / 禁止说明 / future SaaS 候选说明。 | Go | Data / Productization |
| 是否误把 draft 写成 implemented | No | 新增文档顶部均为 implemented = No。 | Go | Docs / QA |

## Final Conclusion

```text
Proceed With Restrictions
```

限制条件：

1. 下一轮 Ent schema 只能落 `customers / suppliers / contacts / sales_orders / sales_order_items`。
2. `product_skus`、BOM version extension、purchase orders、addresses、settlement terms 都不能顺手落 schema。
3. Ent schema goal 不得实现 repo/usecase、API/RBAC、UI、seed、docs registry 或 business_records 迁移。
4. 不得新增 `tenant_id`。
5. 不得从 Workflow 写库存、出货、预留或财务事实。
6. High risks 中 `business_records` shadow model、migration dry-run、SKU 粒度和 purchase order 边界仍需在后续 goals 继续关闭，因此不能写 `Proceed`。

## Migration Readiness Checklist

下一轮 Ent schema goal 前必须逐项确认：

- 字段列表没有 current-only required fields。
- code / order_no / line_no unique index 规则明确。
- nullable 策略明确。
- status key 不混用 workflow / fact / derived。
- generated migration 可回滚或 forward-fix。
- no `tenant_id`。
- no `product_sku_id` in first sales_order_items cutline。
- no shipment / inventory / finance fact columns。
- `business_records` 只作为 source snapshot / migration reference。
