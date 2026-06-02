# 产品 / SKU / BOM 边界评审 / Product / SKU / BOM Boundary Review

## 结论

现有 `products / materials / units / warehouses / bom_headers / bom_items` 已经是当前最小主数据与工程资料真源。Phase 1 可以提出 `product_skus` 和 BOM version 扩展草案，但不得重复设计已存在的 `products / materials / units / bom_*`，也不得把 current 客户 Excel 字段直接写成 Product Core 必填字段。

```text
BOM 是工程资料 / 物料需求来源。
BOM 不是库存事实。
BOM 不能直接改库存余额。
采购需求可以从 BOM 派生，但采购事实必须由采购单 / 入库单产生。
```

## 现有真源

| 对象 | 当前状态 | 口径 |
| --- | --- | --- |
| `units` | 已有 Ent schema / migration / relation | 单位主数据，库存、BOM、采购事实共用 |
| `materials` | 已有 Ent schema / migration / relation | 物料主数据，包含 code、name、category、spec、color、default_unit |
| `products` | 已有 Ent schema / migration / relation | 成品主数据，包含 code、name、style_no、customer_style_no、default_unit |
| `warehouses` | 已有 Ent schema / migration / relation | 仓库主数据，不属于本文件新增范围 |
| `bom_headers` | 已有 Ent schema / migration / relation | BOM 头，按 product + version，单产品最多一个 ACTIVE |
| `bom_items` | 已有 Ent schema / migration / relation | BOM 明细，关联 material / unit，有 quantity 和 loss_rate |
| `inventory_lots` | 已有事实/追溯表 | 批次追溯，不是 SKU 主数据 |

## 是否需要 product_skus

建议保留 `product_skus` 作为 V1 候选，但必须在 schema final review 前回答库存粒度和 BOM 粒度。

SKU 可能承接：

- 颜色。
- 尺寸。
- 包装版本。
- 客户款号。
- 客户 SKU。
- 条码 / 外部编码。
- 图片或样图引用。

SKU 不应承接：

- 库存事实。
- 出货事实。
- 客户专属报表临时列。
- BOM 明细事实。
- current 样本中未通用化的任意 Excel 列。

## SKU 与产品编号、款式、颜色、尺寸关系

| 概念 | 推荐层级 | 说明 |
| --- | --- | --- |
| product.code | Product Core | 产品资料编号 / 内部产品编号，现有 `products.code` |
| product.style_no | Product Core 可选 | 款式编号，现有 `products.style_no` |
| product.customer_style_no | Product Core 可选 | 客户款号，现有 `products.customer_style_no` |
| product_sku.sku_code | V1 候选 | 具体可销售 / 可生产规格编码 |
| color / color_no | SKU / lot 分层待确认 | 标准颜色可进 SKU；染批、批次色号属于 lot |
| size | SKU 候选 | 如果同一 product 有多尺寸规格，放 SKU |
| version | BOM / SKU 分层待确认 | 工程版本优先放 BOM version；销售包装版本可放 SKU |
| image / attachment | 文档 / media 引用 | 不进入库存事实；V1 可先做引用字段草案 |

## BOM 按 product 还是 sku

当前已实现的 BOM 是按 `product_id`。Phase 1 推荐：

- V1 保持现有 product-level BOM 作为主路径。
- 如果同一产品不同颜色 / 尺寸的材料用量、颜色、包装差异会影响采购需求，则评审 BOM header 可选 `product_sku_id`。
- 在未证明 SKU 影响 BOM 前，不把 BOM 强制改为 SKU 粒度。
- 不用 BOM 改版直接修改历史采购或库存事实。

## BOM 改版

现有 `bom_headers.version / status / effective_from / effective_to` 已能表达基础版本。下一步只建议在文档草案中补充：

- ACTIVE 版本唯一性保持。
- 已被订单 / 采购需求引用的 BOM 应保留版本快照。
- BOM 改版影响未来需求，不回写已过账库存、采购入库或质检事实。
- BOM version 扩展可以在 V1 optional 或 V2 评审，不在本轮改 schema。

## 材料替代

材料替代不建议 V1 必做。原因：

- 会影响采购需求、可用库存、质检和成本。
- 需要替代规则、优先级、有效期、客户限制和审计。
- 如果替代会影响库存和采购事实，必须进入 Product Core 架构评审。

## BOM 到采购需求

BOM 可以作为采购需求来源：

```text
sales_order_item
-> product / product_sku
-> active BOM version
-> material demand
-> purchase demand / purchase order candidate
```

但采购事实必须由采购单或入库单产生：

```text
purchase_order = 采购承诺。
purchase_receipt = 采购入库事实。
inventory_txns = 库存落账事实。
```

BOM 不写 `inventory_txns`，不更新 `inventory_balances`，不决定 `purchase_receipts` 是否 posted。

## product_skus 是否 V1 落地

推荐：`product_skus` 作为 V1 候选，进入 schema final review；是否实际落 Ent schema 取决于两个问题：

1. 当前客户和行业模板是否存在“一产品多可售规格 / 颜色 / 尺寸 / 包装版本”的稳定需求。
2. SKU 是否影响销售订单、BOM、库存、出货任一核心粒度。

如果答案不清楚，先保留 draft，不落 schema。

## 字段分类

| 字段 / 资料 | 分类 | 推荐落点 |
| --- | --- | --- |
| product code、name、style_no、customer_style_no、default_unit | Product Core | 现有 `products` |
| material code、name、category、spec、color、default_unit | Product Core | 现有 `materials` |
| BOM version、status、effective dates、quantity、loss_rate | Product Core | 现有 `bom_headers / bom_items`，按需扩展 |
| sku_code、barcode、sku_name、color、size、packaging_version | Product Core Candidate | `product_skus` draft |
| 色卡、作业指导书、图片 | Industry Template Candidate / Attachment | 先做引用和模板，不塞进库存事实 |
| current Excel 中的设计师、特殊颜色描述、客户内部列名 | Customer Material | 作为线索，不直接必填 |
| 字段显示、必填、编号规则 | Customer Config | 配置草案 |
| 染批、供应商批号、生产批号 | Fact / Lot | `inventory_lots`，不放 SKU 主数据 |

## 明确不落地

- 不重复设计 `products / materials / units / warehouses / bom_headers / bom_items`。
- 不让 BOM 直接写库存事实。
- 不把 `product_sku` 写成库存必然粒度，除非 schema final review 证明需要。
- 不把 current 客户 Excel 列直接写成 Product Core schema。
- 不做材料替代 V1 强制能力。
