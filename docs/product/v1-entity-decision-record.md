Doc Type: V1 Entity Decision Record
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# V1 Entity Decision Record

本文件记录 V1 schema final review 的实体级决策。它只约束下一轮 Ent schema goal 的允许范围，不代表 schema 已落地。

## Entity: customers

Decision: Go

Category:
- MasterData

V1 Scope:
- Yes

Reason:

客户交易主体是销售订单、出货和未来应收 / 发票的长期引用对象。V1 采用分表主路径，不做万能 partner 抽象。

Existing Truth Sources:

- `business_records` partners 兼容快照。
- current 客户资料只作为 source material。

Fields Allowed in Product Core:

- `code`
- `name`
- `display_name`
- `status` or `is_active`
- `tax_no` nullable
- `note`
- `created_at`
- `updated_at`

Fields Deferred:

- invoice title
- bank account
- settlement terms
- full address profiles
- default currency

Fields Treated as Current Customer Sample:

- 当前客户特殊简称。
- 特殊开票习惯。
- 当前样本中的报表专用列。

Relations:

- future `sales_orders.customer_id`
- future `shipments.customer_id`
- future AR / invoice references

Status Fields:

- V1 只允许主档启停状态；不得承接订单履约、出货或财务状态。

Affects Inventory:
- No

Affects Shipment:
- Yes, indirect through source documents and future shipment references

Affects Finance:
- Yes, indirect through future AR / invoice references

Workflow/Fact Risk:

- Low if usecase remains MasterData only.

Duplicate Design Risk:

- High if `business_records` partners continues as writable official customer truth after formal tables exist.

Customer Coupling Risk:

- Medium. current customer fields must remain nullable / deferred unless reviewed as Product Core.

Migration Risk:

- High. Requires partner type split, code generation, duplicate name handling and snapshot preservation.

Required Before Ent Schema:

- Confirm unique code rule.
- Confirm nullable `tax_no`.
- Confirm no customer address table in first cut.
- Confirm business_records migration trace strategy.

Stop Conditions:

- Stop if current-only fields are proposed as required.
- Stop if partners page remains equal writable official truth without transition plan.

## Entity: suppliers

Decision: Go

Category:
- MasterData

V1 Scope:
- Yes

Reason:

供应商 / 加工厂是采购、质检和未来应付的长期引用对象。V1 只落最小主档，不替代已存在的采购入库、退货、调整和质检事实。

Existing Truth Sources:

- `business_records` partners 兼容快照。
- Existing `purchase_receipts.supplier_name` snapshot.
- current supplier / processing materials as source samples.

Fields Allowed in Product Core:

- `code`
- `name`
- `short_name` nullable
- `status` or `is_active`
- `tax_no` nullable
- `note`
- `created_at`
- `updated_at`

Fields Deferred:

- bank account
- invoice title
- settlement terms
- supplier material profiles
- quotation / price profile

Fields Treated as Current Customer Sample:

- 加工厂习惯分类。
- 当前样本中的付款、银行、发票字段。

Relations:

- future `purchase_orders.supplier_id`
- future optional receipt supplier backfill after review
- future AP / invoice references

Status Fields:

- V1 只允许主档启停状态。

Affects Inventory:
- Yes, indirect through purchase source documents

Affects Shipment:
- No

Affects Finance:
- Yes, indirect through future AP / invoice references

Workflow/Fact Risk:

- Low if supplier usecase does not write purchase facts.

Duplicate Design Risk:

- High if supplier master duplicates `materials`, `purchase_receipts.supplier_name` snapshots or partners page without transition.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High. Existing snapshots may have supplier / processor / customer mixed categories.

Required Before Ent Schema:

- Confirm code uniqueness and active/inactive behavior.
- Confirm no supplier material profile in first cut.
- Confirm receipt snapshot remains historical.

Stop Conditions:

- Stop if supplier master is used to mutate posted purchase receipt facts.

## Entity: contacts

Decision: Go

Category:
- MasterData

V1 Scope:
- Yes

Reason:

客户和供应商均可能有多个联系人。V1 采用一个 `contacts` 表，文档口径为 `owner_type + owner_id`，不提前拆 `customer_contacts / supplier_contacts`。

Existing Truth Sources:

- `business_record_items` and payload contact snapshots in partners page.

Fields Allowed in Product Core:

- `owner_type`
- `owner_id`
- `name`
- `phone`
- `mobile`
- `email`
- `title` nullable
- `is_primary`
- `is_active`
- `note`
- `created_at`
- `updated_at`

Fields Deferred:

- address linkage
- identity document
- messaging preferences
- finance contact roles

Fields Treated as Current Customer Sample:

- 当前样本中的联系人称谓和特殊电话格式。

Relations:

- `owner_type = CUSTOMER` -> `customers.id`
- `owner_type = SUPPLIER` -> `suppliers.id`

Status Fields:

- `is_active` only.

Affects Inventory:
- No

Affects Shipment:
- No

Affects Finance:
- No direct effect

Workflow/Fact Risk:

- Low.

Duplicate Design Risk:

- Medium if payload contacts remain official editable truth.

Customer Coupling Risk:

- Low.

Migration Risk:

- Medium. Cross-owner validation needs usecase guard if DB cannot express cross-table FK.

Required Before Ent Schema:

- Confirm canonical owner keys.
- Confirm one primary contact per owner policy or defer uniqueness.

Stop Conditions:

- Stop if schema requires current-only contact columns.

## Entity: customer_addresses

Decision: Draft Only

Category:
- MasterData

V1 Scope:
- No

Reason:

地址类型、交付地址、注册地址、开票地址和客户特殊格式尚未确认。V1 可在 `customers` 或 `sales_orders` 保留 nullable snapshot，不单独落地址表。

Existing Truth Sources:

- partners payload snapshots.
- current source materials.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- address_type
- country / province / city / district / street
- receiver / phone
- is_default

Fields Treated as Current Customer Sample:

- 当前客户地址格式和报表显示习惯。

Relations:

- future customers / sales_orders / shipments.

Status Fields:

- Draft only.

Affects Inventory:
- No

Affects Shipment:
- Yes, future shipment address snapshot

Affects Finance:
- Yes, future invoice address candidate

Workflow/Fact Risk:

- Medium if address is used to fake shipment completion.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- High.

Migration Risk:

- Medium.

Required Before Ent Schema:

- Confirm address types and whether order snapshot is sufficient.

Stop Conditions:

- Stop if only current sample proves the fields.

## Entity: supplier_material_profiles

Decision: Draft Only

Category:
- MasterData / Config

V1 Scope:
- No

Reason:

供应商供货能力会影响采购计划、价格、交期和质检要求，需要 V2 purchase review。

Existing Truth Sources:

- `suppliers` draft.
- existing `materials`.
- current sample notes.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- supplier_id
- material_id
- preferred_rank
- lead_time_days
- min_order_quantity
- quality_required
- price profile

Fields Treated as Current Customer Sample:

- 供应商供货习惯和样本价格。

Relations:

- future suppliers / materials.

Status Fields:

- Draft only.

Affects Inventory:
- Indirect

Affects Shipment:
- No

Affects Finance:
- Indirect

Workflow/Fact Risk:

- Low.

Duplicate Design Risk:

- Medium if it duplicates `materials` attributes.

Customer Coupling Risk:

- High.

Migration Risk:

- Medium.

Required Before Ent Schema:

- V2 purchase planning review.

Stop Conditions:

- Stop if it is used as receipt or inventory fact.

## Entity: settlement_terms

Decision: Draft Only

Category:
- Config / Finance

V1 Scope:
- No

Reason:

结算条款影响应收、应付、发票、付款和对账，必须等 finance review。

Existing Truth Sources:

- current customer config draft.
- partners payload snapshots.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- payment_method
- payment_period_days
- invoice_policy
- currency
- credit_limit

Fields Treated as Current Customer Sample:

- 当前客户付款周期和开票习惯。

Relations:

- future customers / suppliers / AR / AP.

Status Fields:

- Draft only.

Affects Inventory:
- No

Affects Shipment:
- No

Affects Finance:
- Yes

Workflow/Fact Risk:

- High if used to generate finance facts without finance review.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- High.

Migration Risk:

- Medium.

Required Before Ent Schema:

- Finance generation timing review.

Stop Conditions:

- Stop if terms imply AP/AR generation from source document alone.

## Entity: product_skus

Decision: Draft Only

Category:
- MasterData

V1 Scope:
- No

Reason:

现有 `products` 已有 `code / style_no / customer_style_no / default_unit_id`。目前无法证明 SKU 是独立于 product 的稳定订单、BOM、库存或出货粒度。

Existing Truth Sources:

- Existing `products`.
- Existing `inventory_lots` for lot/color batch facts.
- current product samples as clues only.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- product_id
- sku_code
- sku_name
- color
- size
- packaging_version
- barcode

Fields Treated as Current Customer Sample:

- current Excel color fields.
- customer-only product display columns.
- image / sample sheet references.

Relations:

- future products / sales_order_items / BOM candidate.

Status Fields:

- Draft only; no runtime status.

Affects Inventory:
- Yes, only if future inventory subject includes SKU

Affects Shipment:
- Yes, only if future shipment lines need SKU

Affects Finance:
- Indirect

Workflow/Fact Risk:

- Medium if SKU status is misused as fulfillment status.

Duplicate Design Risk:

- High.

Customer Coupling Risk:

- High.

Migration Risk:

- High.

Required Before Ent Schema:

- Prove SKU affects at least one core grain: sales order line, BOM, inventory, or shipment.
- Prove fields are not merely current sample columns.

Stop Conditions:

- Stop if SKU is only a `products` alias.
- Stop if only current Excel color field supports it.

## Entity: sales_orders

Decision: Go

Category:
- Source Document

V1 Scope:
- Yes

Reason:

销售订单记录客户订单承诺，是后续 BOM、采购需求、生产、出货和财务评审的来源，但不写库存、出货或财务事实。

Existing Truth Sources:

- `business_records` project/order snapshots.
- workflow business states as collaboration status, not source document truth.

Fields Allowed in Product Core:

- `order_no`
- `customer_id`
- `customer_snapshot`
- `order_date`
- `expected_ship_date`
- `lifecycle_status`
- `owner_user_id` nullable
- `note`
- `created_at`
- `updated_at`

Fields Deferred:

- release_status
- fulfillment_status
- finance_status
- shipped_quantity cache
- invoice/payment fields

Fields Treated as Current Customer Sample:

- current Excel order display columns.
- customer-specific report grouping.

Relations:

- `customers.id`
- `sales_order_items.order_id`
- optional workflow source references only after separate review

Status Fields:

- `lifecycle_status` only. Fulfillment and finance status must be derived or later reviewed.

Affects Inventory:
- Indirect through future demand planning

Affects Shipment:
- Yes, as source document

Affects Finance:
- Indirect after shipment / invoice review

Workflow/Fact Risk:

- High if approval or release status is treated as shipped.

Duplicate Design Risk:

- Medium if business_records stays writable source.

Customer Coupling Risk:

- High.

Migration Risk:

- High. Requires order number and customer mapping dry-run.

Required Before Ent Schema:

- Confirm order number uniqueness.
- Confirm lifecycle status keys.
- Confirm no shipment / finance fields in schema cutline.

Stop Conditions:

- Stop if schema proposes `shipped` without shipment facts.

## Entity: sales_order_items

Decision: Go

Category:
- Source Document

V1 Scope:
- Yes

Reason:

订单行记录承诺明细，V1 引用 existing `products / units`。`product_sku_id` 不进入第一 cutline。

Existing Truth Sources:

- `business_record_items` order snapshots.
- existing `products / units`.

Fields Allowed in Product Core:

- `sales_order_id`
- `line_no`
- `product_id`
- `product_snapshot`
- `ordered_quantity`
- `unit_id`
- `required_date`
- `unit_price` nullable
- `amount` nullable or derived snapshot
- `line_status`

Fields Deferred:

- product_sku_id
- shipped_quantity cache
- reservation status
- shipment linkage

Fields Treated as Current Customer Sample:

- current sample size/color columns unless SKU review proves core grain.

Relations:

- `sales_orders.id`
- `products.id`
- `units.id`
- future `shipment_items.sales_order_item_id`

Status Fields:

- line lifecycle only; shipped status must be derived from future shipment facts.

Affects Inventory:
- Indirect

Affects Shipment:
- Yes, future shipment source line

Affects Finance:
- Indirect

Workflow/Fact Risk:

- High if `line_status` is used to fake shipped.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High. Quantity decimal, unit mapping and missing product mapping need dry-run.

Required Before Ent Schema:

- Confirm decimal precision and unit FK.
- Confirm `product_sku_id` excluded.

Stop Conditions:

- Stop if `shipped_quantity` is hand-written without shipment facts.

## Entity: order_revisions

Decision: Draft Only

Category:
- Source Document / Audit

V1 Scope:
- No

Reason:

订单变更需要保留审计，但当前不创建泛化 ChangeUsecase，也不创建 `change_records`。

Existing Truth Sources:

- business record events.
- workflow task events.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- revision_no
- reason
- changed_fields
- created_by
- created_at

Fields Treated as Current Customer Sample:

- current 变更说明格式。

Relations:

- future `sales_orders.id`.

Status Fields:

- Draft only.

Affects Inventory:
- Indirect

Affects Shipment:
- Indirect

Affects Finance:
- Indirect

Workflow/Fact Risk:

- Medium.

Duplicate Design Risk:

- High if generalized into ChangeUsecase.

Customer Coupling Risk:

- Low.

Migration Risk:

- Medium.

Required Before Ent Schema:

- Dedicated order revision review.

Stop Conditions:

- Stop if proposed as generic `change_records`.

## Entity: BOM version extension

Decision: Draft Only

Category:
- MasterData

V1 Scope:
- No

Reason:

现有 `bom_headers.version/status/effective_from/effective_to` 已是 BOM 版本主路径。任何扩展必须围绕现有 `bom_headers / bom_items`，不得重复建 BOM。

Existing Truth Sources:

- `bom_headers`
- `bom_items`
- existing product-level BOM relation

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- stronger version snapshot.
- optional product_sku_id on BOM only if SKU review proves required.
- approval / reason metadata.

Fields Treated as Current Customer Sample:

- current BOM Excel columns not mapped to existing fields.

Relations:

- existing BOM tables only.

Status Fields:

- existing `DRAFT / ACTIVE / DISABLED` candidates remain.

Affects Inventory:
- Indirect through future demand

Affects Shipment:
- No direct effect

Affects Finance:
- Indirect through future costing

Workflow/Fact Risk:

- Medium if BOM change is treated as inventory fact.

Duplicate Design Risk:

- High.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- Prove existing BOM fields insufficient.

Stop Conditions:

- Stop if proposal creates a second BOM truth source.

## Entity: purchase_orders

Decision: Draft Only

Category:
- Source Document

V1 Scope:
- No

Reason:

采购订单是采购承诺，不是采购入库事实。当前已有 `purchase_receipts / purchase_returns / purchase_receipt_adjustments` 和 `inventory_txns`，V1 不把 PO 混入入库事实。

Existing Truth Sources:

- existing purchase receipt facts.
- business_records purchase snapshots.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- purchase_order_no
- supplier_id
- order_date
- expected_receipt_date
- lifecycle_status
- amount summary

Fields Treated as Current Customer Sample:

- current purchase contract fields and print-only fields.

Relations:

- future suppliers / purchase_order_items / optional purchase_receipts.

Status Fields:

- future lifecycle status only, not receipt fact status.

Affects Inventory:
- No direct effect

Affects Shipment:
- No

Affects Finance:
- Indirect after AP review

Workflow/Fact Risk:

- High if PO status creates receipt, inventory or AP facts.

Duplicate Design Risk:

- High if treated as receipt.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- V2 purchase source document review.

Stop Conditions:

- Stop if purchase_order replaces purchase_receipt.
- Stop if PO directly generates AP.

## Entity: purchase_order_items

Decision: Draft Only

Category:
- Source Document

V1 Scope:
- No

Reason:

采购承诺明细需要与材料、单位、价格、到货匹配、退货和调整关系一起评审。

Existing Truth Sources:

- existing materials / units.
- purchase receipt item facts.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- purchase_order_id
- line_no
- material_id
- quantity
- unit_id
- expected_receipt_date
- unit_price
- amount
- line_status

Fields Treated as Current Customer Sample:

- current supplier-specific price and print columns.

Relations:

- future purchase_orders / materials / units / purchase_receipt_items.

Status Fields:

- future source document line lifecycle only.

Affects Inventory:
- No direct effect

Affects Shipment:
- No

Affects Finance:
- Indirect

Workflow/Fact Risk:

- High if received quantity is hand-maintained.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- V2 purchase matching review.

Stop Conditions:

- Stop if line received status is not derivable from purchase receipt facts.

## Entity: purchase_demands

Decision: Draft Only

Category:
- Derived / Planning

V1 Scope:
- No

Reason:

采购需求需要 sales order、BOM、库存余额、在途和供应商能力共同评审。它是计划 / 派生，不是采购事实。

Existing Truth Sources:

- future sales orders.
- existing BOM.
- existing inventory balances.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- source_order_item_id
- material_id
- demand_quantity
- unit_id
- required_date
- planning_status

Fields Treated as Current Customer Sample:

- current material preparation worksheet columns.

Relations:

- future sales_order_items / materials / units / purchase_order_items.

Status Fields:

- future planning status only.

Affects Inventory:
- No direct effect

Affects Shipment:
- Indirect

Affects Finance:
- No direct effect

Workflow/Fact Risk:

- Medium if planning result is treated as purchase fact.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- Planning review after sales order schema.

Stop Conditions:

- Stop if demand table writes inventory or purchase facts.

## Entity: stock_reservations

Decision: Defer

Category:
- Fact

V1 Scope:
- No

Reason:

库存预留影响可用库存和出货执行，必须进入库存 / 出货 fact review。

Existing Truth Sources:

- existing `inventory_txns / inventory_balances / inventory_lots`.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- source_type
- source_id
- subject_type
- subject_id
- warehouse_id
- lot_id
- quantity
- unit_id
- status
- idempotency_key

Fields Treated as Current Customer Sample:

- None.

Relations:

- future sales_order_items / shipment_items / inventory facts.

Status Fields:

- Future fact status only.

Affects Inventory:
- Yes

Affects Shipment:
- Yes

Affects Finance:
- No

Workflow/Fact Risk:

- Very High if created from workflow release.

Duplicate Design Risk:

- High if it duplicates balances.

Customer Coupling Risk:

- Low.

Migration Risk:

- High.

Required Before Ent Schema:

- Shipment / inventory reservation review.

Stop Conditions:

- Stop if generated by `shipment_release done`.

## Entity: shipments

Decision: Defer

Category:
- Fact

V1 Scope:
- No

Reason:

出货事实必须由未来 ShipmentUsecase 和 outbound inventory facts 支撑。`shipping_released` 不是 `shipped`。

Existing Truth Sources:

- Existing workflow release state only as permission/collaboration state.
- Existing inventory facts for stock movements.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- shipment_no
- customer_id
- sales_order_id
- status
- shipped_at
- idempotency_key

Fields Treated as Current Customer Sample:

- current shipping documents and print fields.

Relations:

- future customers / sales_orders / shipment_items / inventory_txns.

Status Fields:

- Future shipment fact status only.

Affects Inventory:
- Yes

Affects Shipment:
- Yes

Affects Finance:
- Yes

Workflow/Fact Risk:

- Very High.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- ShipmentUsecase review.

Stop Conditions:

- Stop if `shipping_released` creates shipment facts.

## Entity: shipment_items

Decision: Defer

Category:
- Fact

V1 Scope:
- No

Reason:

出货行必须和实际出库、订单行、产品、仓库、批次、库存流水关系一起评审。

Existing Truth Sources:

- future shipments.
- existing inventory facts.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- shipment_id
- sales_order_item_id
- product_id
- product_sku_id candidate
- warehouse_id
- lot_id
- quantity
- unit_id

Fields Treated as Current Customer Sample:

- current delivery note columns.

Relations:

- future shipments / sales_order_items / products / units / inventory_txns.

Status Fields:

- Future fact line status only.

Affects Inventory:
- Yes

Affects Shipment:
- Yes

Affects Finance:
- Indirect

Workflow/Fact Risk:

- Very High.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- Medium.

Migration Risk:

- High.

Required Before Ent Schema:

- Shipment facts review.

Stop Conditions:

- Stop if line status fakes inventory out.

## Entity: AR/AP/invoice/payment/reconciliation

Decision: Defer

Category:
- Fact

V1 Scope:
- No

Reason:

财务事实必须等待 receipt / shipped / invoice / payment / reconciliation generation timing review。V1 源单据和主数据不生成财务事实。

Existing Truth Sources:

- None as formal finance facts.
- business_records finance pages may contain snapshots only.

Fields Allowed in Product Core:

- None for next Ent schema goal.

Fields Deferred:

- accounts_receivable
- accounts_payable
- invoices
- payments
- reconciliations
- allocations

Fields Treated as Current Customer Sample:

- current financial report formats.

Relations:

- future customers / suppliers / shipments / purchase receipts / invoices / payments.

Status Fields:

- Future finance fact status only.

Affects Inventory:
- No

Affects Shipment:
- Indirect

Affects Finance:
- Yes

Workflow/Fact Risk:

- Very High if generated from workflow done or source document status.

Duplicate Design Risk:

- Medium.

Customer Coupling Risk:

- High.

Migration Risk:

- High.

Required Before Ent Schema:

- Finance review.

Stop Conditions:

- Stop if AR/AP is generated before true shipped / receipt / invoice review.
