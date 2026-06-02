Doc Type / 文档类型: Business Records Data Map Draft / business_records 数据映射草案
Status / 状态: Draft / 草案
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录数据映射草案 / business_records Data Map Draft

本草案只描述后续 dry-run / import draft 可使用的字段映射，不迁移数据，不写 import/backfill 代码，不修改 schema。

## 映射原则

- `business_records` 只是 source snapshot，不是正式模型父表。
- 自动映射只允许用于唯一、低风险、无歧义字段。
- 缺少唯一主体、单位、产品或 owner 时必须进入人工确认。
- 永绅 yoyoosun 客户样本字段不能自动变成 Product Core 必填字段。
- `product_skus` 仍 draft-only，不得自动映射。
- `purchase_orders / shipments / finance facts` 仍 deferred，不得自动映射。
- 没有事实依据不得生成 shipment / inventory / finance facts。

## 数据映射草案 / Data Map Draft

| Source | Source fields | Target model | Target fields | Can auto map? | Needs manual review? | Forbidden auto map? | Notes |
|---|---|---|---|---:|---:|---:|---|
| `business_records` `module_key=partners` 客户类 | `document_no`, `title`, `payload.partner_type`, `payload.country_region`, `payload.address`, `payload.payment_method`, `payload.payment_cycle_days`, `payload.tax_no`, `payload.sales_owner`, `payload.note` | `customers` | `customer_code`, `name`, `display_name`, `country_region`, `address`, `payment_method`, `payment_cycle_days`, `tax_no`, `owner_user_id/note` 候选 | 部分 | 是 | 是，不能自动把付款、税号、地址设为 Product Core 必填 | 只有 `partner_type in 合作客户 / 潜在客户` 且名称唯一时可 dry-run 生成候选 |
| `business_records` `module_key=partners` 供应商类 | `document_no`, `title`, `payload.partner_type`, `payload.address`, `payload.payment_method`, `payload.tax_no`, `payload.sales_owner` | `suppliers` | `supplier_code`, `name`, `short_name`, `supplier_type`, `address`, `tax_no`, `note` 候选 | 部分 | 是 | 是，不能自动生成采购事实或应付事实 | `合作供应商` 可能包含加工厂、辅包材供应商，需分类 |
| `business_record_items` from partners | `item_name`, `payload.office_phone`, `payload.mobile_phone`, `payload.email`, `payload.title`, `payload.note` | `contacts` | `owner_type`, `owner_id`, `name`, `phone`, `mobile`, `email`, `title`, `is_primary`, `note` | 部分 | 是 | 是，无 owner 不得写入 | owner 必须来自已确认的 customer/supplier 候选；第一联系人可候选 primary，但需确认 |
| `business_records` `module_key=project-orders` | `document_no`, `source_no`, `customer_name`, `document_date`, `due_date`, `title`, `style_no`, `product_no`, `product_name`, `quantity`, `unit`, `amount`, `payload.product_order_no`, `payload.business_owner`, `payload.category`, `payload.color` | `sales_orders` | `order_no`, `customer_id`, `customer_snapshot`, `order_date`, `expected_ship_date`, `title`, `note`, `lifecycle_status` | 部分 | 是 | 是，不能自动生成 shipped / shipment / inventory / finance | `customer_id` 必须由唯一客户匹配产生；状态只能按 Source Document 口径处理 |
| `business_record_items` from project-orders | `line_no`, `item_name`, `spec`, `quantity`, `unit`, `unit_price`, `amount`, `payload.color`, `payload.production_qty`, `payload.unshipped_qty`, `payload.line_remark` | `sales_order_items` | `line_no`, `product_id`, `product_snapshot`, `ordered_quantity`, `unit_id`, `unit_price`, `amount`, `line_status`, `note` | 部分 | 是 | 是，不能自动映射 `unshipped_qty` 为出货事实 | `product_id` / `unit_id` 必须唯一匹配；`production_qty`、`unshipped_qty` 只作线索 |
| `business_records` `module_key=products` | `document_no`, `product_no`, `product_name`, `style_no`, `payload.product_category`, `payload.hs_code`, `payload.spec_code`, `payload.en_desc`, `payload.attachment_ref`, `payload.color`, `payload.designer_name`, `payload.color_card_ref`, `payload.image_ref`, `payload.sop_ref` | existing `products` | `product_code/product_no` 候选、`name`, `category`, `spec`, `default_unit_id`, `status`, `payload` | 部分 | 是 | 是，不得自动创建 `product_skus` | 颜色、SKU、包装版本先进入 unresolved / SKU review，不进本轮自动目标 |
| `business_records` / items from `material-bom` and purchase snapshots | `material_name`, `item_name`, `spec`, `unit`, `supplier_name`, `payload.material_category`, `payload.supplier_item_no`, `payload.color` | existing `materials` | `material_code` 候选、`material_name`, `spec`, `default_unit_id`, `supplier_id` 候选、`payload` | 部分 | 是 | 是，不能自动生成采购订单、采购入库或库存流水 | 与 existing `materials` 去重；供应商无法唯一匹配时留待人工确认 |
| `business_records` / items with warehouse text | `warehouse_location`, `payload.warehouse`, `payload.location`, item `warehouse_location` | existing `warehouses` | `warehouse_code` 候选、`name`, `warehouse_type`, `status` | 低 | 是 | 是，不能自动生成库存余额或库存流水 | 仓库文本可能是库位、地点或备注；需人工归类 |
| `business_records` `module_key=shipping-release/outbound` | `business_status_key`, `document_no`, `source_no`, `customer_name`, `product_name`, `quantity`, `payload` | none in current implemented V1 | 无自动目标 | 否 | 是 | 是，禁止自动生成 `shipments` 或库存扣减 | `shipping_released` 只表示放行，不等于 shipped |
| `business_records` `module_key=reconciliation/payables/receivables/invoices` | `amount`, `customer_name`, `supplier_name`, `payload`, `items` | none in current implemented V1 | 无自动目标 | 否 | 是 | 是，禁止自动生成 AR/AP、invoice、payment | 只作为 future finance review 线索 |

## 自动映射候选条件

| 条件 | 说明 |
|---|---|
| source record 非 demo/debug | debug seed 必须排除或单独标记 |
| module key 与目标一致 | partners 才进 MasterData，project-orders 才进 Sales Order |
| 目标唯一匹配 | 客户、供应商、产品、单位、仓库都必须唯一 |
| 字段非空且不冲突 | 空值不能伪造，冲突进入人工确认 |
| 状态语义可映射 | 只能映射 Source Document 或 MasterData 状态，不映射 Fact |
| 可回滚 | dry-run 先输出候选，不写正式表 |

## 必须等待人工确认

- 客户 / 供应商同名、多角色或简称冲突。
- 联系人所属主体不唯一。
- 产品编号、款式编号、颜色和 SKU 之间的关系。
- 文本单位到 `units.id` 的匹配。
- 仓库文本到底是仓库、库位还是备注。
- 旧订单金额、币种、税率是否用于正式对账。
- 永绅 yoyoosun 客户字段是否属于 Product Core、Industry Template、Customer Config、Print Template Input / Candidate 或 Import Adapter。

## 不能自动迁移

- `product_skus`。
- `purchase_orders / purchase_order_items`。
- `shipments / shipment_items`。
- `stock_reservations`。
- `inventory_txns / inventory_balances / inventory_lots`。
- AR/AP、invoice、payment、reconciliation facts。
- workflow task done 或 `shipping_released` 推导出的事实。
- demo / seed / debug 数据。

## 后续 import draft 可接收的产物

| 产物 | 用途 |
|---|---|
| source reference list | 明确每条候选来自哪个旧记录 |
| mapping candidate CSV / JSON | 供人工检查和 dry-run |
| unresolved queue | 记录需人工确认原因 |
| forbidden auto-map list | 防止自动生成事实或 draft-only 对象 |
| validation summary | 统计可迁移、不可迁移、需确认数量 |
