Doc Type: Schema Draft
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# Domain Schema Draft V1 / V2

本文件是 schema 草案，不是 Ent schema，不代表 migration 已落地，也不允许直接作为 migration 输入。落 Ent schema 前必须经过 `docs/product/migration-readiness-checklist.md`。

当前私有化阶段采用每客户一套数据库 / 对象存储 / 部署配置。未来 SaaS 多租户另行评审，不进入当前 V1/V2 schema。

Phase 2 final review 文档：

- `docs/product/schema-design-final-review.md`
- `docs/product/v1-entity-decision-record.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-schema-go-no-go.md`
- `docs/product/business-records-transition-plan.md`
- `docs/product/v1-next-codex-goals.md`

Phase 2 final review 仍是 Proposed / docs-only，不代表 Ent schema、migration、runtime、API 或 UI 已实现。

## 候选表总览

| Table | Version | Category | Purpose |
| --- | --- | --- | --- |
| `customers` | V1 | MasterData | 客户交易主体 |
| `suppliers` | V1 | MasterData | 供应商 / 加工厂交易主体 |
| `contacts` | V1 | MasterData | 客户 / 供应商联系人 |
| `product_skus` | V1 Candidate | MasterData | 产品规格 / 颜色 / 尺寸 / 包装版本 |
| `sales_orders` | V1 | Source Document | 客户订单业务承诺 |
| `sales_order_items` | V1 | Source Document | 订单承诺明细 |
| `order_revisions` | V1 Optional | Source Document / Audit | 订单变更记录候选，不是泛化 Change 模块 |
| `bom_versions` | V1 Optional | MasterData | BOM 版本扩展候选，不能重复现有 `bom_headers.version` |
| `purchase_orders` | V2 | Source Document | 采购承诺 |
| `purchase_order_items` | V2 | Source Document | 采购承诺明细 |
| `purchase_demands` | V2 Optional | Derived / Planning | 从订单和 BOM 派生的采购需求候选 |
| `supplier_material_profiles` | V2 Optional | MasterData / Config | 供应商供货能力候选 |
| `stock_reservations` | V4 Candidate | Fact | 库存预留事实，仅记录，不在 V2 落 |
| `shipments` | V4 Candidate | Fact | 出货事实，仅记录，不在 V2 落 |
| `shipment_items` | V4 Candidate | Fact | 出货事实行，仅记录，不在 V2 落 |

## V1 Draft

### customers

| Item | Draft |
| --- | --- |
| purpose | 记录客户主数据，供 sales order、shipment、future AR / invoice 引用 |
| category | MasterData |
| key fields | id, code, name, display_name, status/is_active, tax_no optional, note, created_at, updated_at |
| relations | `sales_orders.customer_id`, future `shipments.customer_id`, future AR / invoice |
| status fields | `is_active` 或 `status`，schema final review 决定 |
| version | V1 |
| affects inventory? | No |
| affects shipment? | Indirect, through sales order / shipment relation |
| affects finance? | Indirect, future AR / invoice |
| depends on existing truth source? | `business_records` partners 兼容数据可作为 migration source snapshot |
| migration risk | partner type 拆分、重名、code 生成、联系人明细 backfill |
| duplicate-design risk | High if it coexists with partners page as second writable truth |
| customer-coupling risk | Medium, current 客户字段不能直接变必填 |
| workflow-fact risk | Low, 不应被 workflow done 写入 |

### suppliers

| Item | Draft |
| --- | --- |
| purpose | 记录供应商 / 加工厂主数据，供 purchase、quality、future AP 引用 |
| category | MasterData |
| key fields | id, code, name, short_name optional, status/is_active, tax_no optional, note, created_at, updated_at |
| relations | future `purchase_orders.supplier_id`; existing `purchase_receipts` 后续可评审 optional supplier_id |
| status fields | `is_active` 或 `status` |
| version | V1 |
| affects inventory? | Indirect, through receipt source |
| affects shipment? | No |
| affects finance? | Indirect, future AP / invoice |
| depends on existing truth source? | `business_records` partners 和 current 加工厂资料可作为 source snapshot |
| migration risk | 供应商 / 加工厂 / 客户同名去重，历史 receipt supplier_name 回补 |
| duplicate-design risk | High if supplier master duplicates `materials` or receipt supplier snapshot |
| customer-coupling risk | Medium, 银行和开票字段需 finance review |
| workflow-fact risk | Low |

### contacts

| Item | Draft |
| --- | --- |
| purpose | 记录客户 / 供应商联系人 |
| category | MasterData |
| key fields | id, owner_type, owner_id, name, phone, mobile, email, title optional, is_primary, note |
| relations | customers/suppliers via owner_type + owner_id or final review 拆表 |
| status fields | is_active optional |
| version | V1 |
| affects inventory? | No |
| affects shipment? | No |
| affects finance? | No direct effect |
| depends on existing truth source? | `business_record_items` partners 联系人明细 |
| migration risk | owner_type 约束和跨表 FK 设计需 final review |
| duplicate-design risk | Medium, 避免同时维护 payload 联系人和正式联系人 |
| customer-coupling risk | Low |
| workflow-fact risk | Low |

### product_skus

| Item | Draft |
| --- | --- |
| purpose | 表达产品的可销售 / 可生产规格，如颜色、尺寸、包装版本或客户 SKU |
| category | MasterData |
| key fields | id, product_id, sku_code, sku_name, color, size, packaging_version, barcode optional, is_active |
| relations | `products.id`; future `sales_order_items.product_sku_id`; optional future BOM |
| status fields | is_active |
| version | V1 Candidate |
| affects inventory? | Indirect only; only if future inventory subject includes sku |
| affects shipment? | Indirect through order/shipment lines |
| affects finance? | Indirect through order amount |
| depends on existing truth source? | Existing `products` and current product page snapshots |
| migration risk | SKU 与 product code / style_no / customer_style_no 边界不清 |
| duplicate-design risk | High if it duplicates existing `products` without clear SKU variance |
| customer-coupling risk | High if current Excel columns become mandatory |
| workflow-fact risk | Medium if SKU status is misused as fulfillment status |

### sales_orders

| Item | Draft |
| --- | --- |
| purpose | 记录客户订单业务承诺 |
| category | Source Document |
| key fields | id, order_no, customer_id, customer_snapshot, order_date, expected_ship_date, lifecycle_status, owner_user_id, note |
| relations | `customers.id`, `sales_order_items.order_id`, workflow source optional |
| status fields | lifecycle_status; release / fulfillment / finance status must be separately derived or reviewed |
| version | V1 |
| affects inventory? | Indirect, via demand planning only |
| affects shipment? | Yes, as shipment source |
| affects finance? | Indirect, future AR after shipped |
| depends on existing truth source? | `business_records` project-orders snapshots |
| migration risk | 编号层级、客户订单号、款式编号和产品编号拆分 |
| duplicate-design risk | Medium, avoid duplicating business_records as writable source |
| customer-coupling risk | High, current 订单 Excel 字段要分类 |
| workflow-fact risk | High, workflow approval must not mark shipped |

### sales_order_items

| Item | Draft |
| --- | --- |
| purpose | 记录订单承诺明细 |
| category | Source Document |
| key fields | id, sales_order_id, line_no, product_id, product_sku_id optional, ordered_quantity, unit_id, required_date, unit_price optional, amount optional, line_status |
| relations | `sales_orders.id`, `products.id`, optional `product_skus.id`, `units.id`, future shipment_items |
| status fields | line_status; shipped_quantity only derived/cache |
| version | V1 |
| affects inventory? | Indirect through BOM demand |
| affects shipment? | Yes, shipment source |
| affects finance? | Indirect, amount source before actual AR |
| depends on existing truth source? | Existing `products / units`, business record items snapshots |
| migration risk | quantity decimal precision, unit mapping, SKU optionality |
| duplicate-design risk | Medium |
| customer-coupling risk | Medium |
| workflow-fact risk | High if line_status is used to fake shipped |

### order_revisions

| Item | Draft |
| --- | --- |
| purpose | 记录订单源单据变更，不是泛化 Change 模块 |
| category | Source Document / Audit |
| key fields | id, sales_order_id, revision_no, reason, changed_fields, created_by, created_at |
| relations | `sales_orders.id` |
| status fields | none or revision_status optional |
| version | V1 Optional |
| affects inventory? | Indirect only if future demand is recalculated |
| affects shipment? | Indirect |
| affects finance? | Indirect |
| depends on existing truth source? | workflow events and business record events as history clues |
| migration risk | Must avoid becoming `change_records` |
| duplicate-design risk | Medium |
| customer-coupling risk | Low |
| workflow-fact risk | Medium |

### bom_versions

| Item | Draft |
| --- | --- |
| purpose | BOM 版本扩展候选；现有 `bom_headers.version` 已表达基础版本 |
| category | MasterData |
| key fields | id, bom_header_id or product_id, version, effective_from, effective_to, status, reason |
| relations | Existing `bom_headers / bom_items` |
| status fields | DRAFT / ACTIVE / DISABLED candidate |
| version | V1 Optional |
| affects inventory? | Indirect via demand only |
| affects shipment? | No direct effect |
| affects finance? | Indirect via material cost future review |
| depends on existing truth source? | Existing `bom_headers.version` |
| migration risk | High duplicate risk with existing BOM version fields |
| duplicate-design risk | High |
| customer-coupling risk | Medium |
| workflow-fact risk | Medium if BOM change is treated as inventory fact |

## V2 Draft

### purchase_orders

| Item | Draft |
| --- | --- |
| purpose | 记录采购承诺 |
| category | Source Document |
| key fields | id, purchase_order_no, supplier_id, order_date, expected_receipt_date, lifecycle_status, note |
| relations | suppliers, purchase_order_items, future purchase_receipts optional |
| status fields | lifecycle_status, receipt_status derived |
| version | V2 |
| affects inventory? | No direct effect |
| affects shipment? | No |
| affects finance? | Indirect, future AP review |
| depends on existing truth source? | Existing purchase receipts and business_records purchase snapshots |
| migration risk | Must not replace `purchase_receipts` |
| duplicate-design risk | High if PO is treated as receipt fact |
| customer-coupling risk | Medium |
| workflow-fact risk | High |

### purchase_order_items

| Item | Draft |
| --- | --- |
| purpose | 采购承诺明细 |
| category | Source Document |
| key fields | id, purchase_order_id, line_no, material_id, quantity, unit_id, expected_receipt_date, unit_price optional, amount optional, line_status |
| relations | purchase_orders, materials, units, future purchase_receipt_items optional |
| status fields | line_status, receipt_status derived |
| version | V2 |
| affects inventory? | No direct effect |
| affects shipment? | No |
| affects finance? | Indirect |
| depends on existing truth source? | materials, units, existing receipt lines |
| migration risk | quantity and price precision, receipt matching |
| duplicate-design risk | Medium |
| customer-coupling risk | Medium |
| workflow-fact risk | High if received_quantity is faked |

### purchase_demands

| Item | Draft |
| --- | --- |
| purpose | 从 sales order + BOM + inventory planning 派生采购需求 |
| category | Derived / Planning |
| key fields | id, source_order_item_id, material_id, demand_quantity, unit_id, required_date, planning_status |
| relations | sales_order_items, materials, units, optional purchase_order_items |
| status fields | planning_status |
| version | V2 Optional |
| affects inventory? | No direct effect |
| affects shipment? | Indirect |
| affects finance? | No direct effect |
| depends on existing truth source? | sales_orders, bom_headers/items, inventory balances |
| migration risk | High if planning cache is mistaken as fact |
| duplicate-design risk | Medium |
| customer-coupling risk | Medium |
| workflow-fact risk | Medium |

### supplier_material_profiles

| Item | Draft |
| --- | --- |
| purpose | 供应商供货能力、默认物料和采购偏好 |
| category | MasterData / Config |
| key fields | id, supplier_id, material_id, preferred_rank, lead_time_days, min_order_quantity optional, quality_required optional |
| relations | suppliers, materials |
| status fields | is_active |
| version | V2 Optional |
| affects inventory? | Indirect through purchasing |
| affects shipment? | No |
| affects finance? | Indirect through purchase price future review |
| depends on existing truth source? | suppliers, materials, current samples |
| migration risk | current sample fields may be incomplete |
| duplicate-design risk | Medium |
| customer-coupling risk | High if supplier-specific habits become core |
| workflow-fact risk | Low |

## V4 Candidate Only

### stock_reservations

| Item | Draft |
| --- | --- |
| purpose | 库存预留事实 |
| category | Fact |
| key fields | id, source_type, source_id, subject_type, subject_id, warehouse_id, lot_id optional, quantity, unit_id, status, idempotency_key |
| relations | sales_order_items or shipment_items, inventory lots/balances |
| status fields | RESERVED / CONSUMED / RELEASED / EXPIRED candidate |
| version | V4 Candidate only |
| affects inventory? | Yes, availability not on-hand |
| affects shipment? | Yes |
| affects finance? | No direct effect |
| depends on existing truth source? | inventory facts and future shipments |
| migration risk | High |
| duplicate-design risk | High if it duplicates balances |
| customer-coupling risk | Low |
| workflow-fact risk | High |

### shipments

| Item | Draft |
| --- | --- |
| purpose | 真实出货事实 |
| category | Fact |
| key fields | id, shipment_no, customer_id, sales_order_id optional, status, shipped_at, idempotency_key |
| relations | sales_orders, shipment_items, inventory_txns |
| status fields | DRAFT / POSTED / CANCELLED / REVERSED candidate |
| version | V4 Candidate only |
| affects inventory? | Yes |
| affects shipment? | Yes |
| affects finance? | Yes, future AR candidate |
| depends on existing truth source? | sales orders, inventory txns |
| migration risk | High |
| duplicate-design risk | Medium |
| customer-coupling risk | Medium |
| workflow-fact risk | Very High; `shipping_released` must not equal shipped |

### shipment_items

| Item | Draft |
| --- | --- |
| purpose | 出货事实明细 |
| category | Fact |
| key fields | id, shipment_id, sales_order_item_id optional, product_id, product_sku_id optional, warehouse_id, lot_id optional, quantity, unit_id |
| relations | shipments, sales_order_items, products, product_skus, inventory_txns |
| status fields | line_status optional |
| version | V4 Candidate only |
| affects inventory? | Yes |
| affects shipment? | Yes |
| affects finance? | Indirect |
| depends on existing truth source? | sales order items, inventory facts |
| migration risk | High |
| duplicate-design risk | Medium |
| customer-coupling risk | Medium |
| workflow-fact risk | Very High |

## 禁止

- 本文件不是实现。
- 本文件不代表 schema 已落地。
- 本文件不允许直接作为 migration 输入。
- 字段草案不得包含多租户运行时字段。
- 不创建泛化 ChangeUsecase、`change_records`、license server、billing 或 customer ticket system。
