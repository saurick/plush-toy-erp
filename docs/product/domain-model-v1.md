# Domain Model V1

本文只描述 0 到 1 重构的业务域模型草案，不改 Ent schema，不生成 migration。

Phase 1 评审补充文档：

- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`

这些文档仍是 proposed / review，不代表 Ent schema、migration、runtime、API 或 UI 已实现。

| 模型 | Purpose | 分类 | V1 必做 | 影响库存 | 影响出货 | 影响财务 |
| --- | --- | --- | --- | --- | --- | --- |
| customers | 记录客户主数据和交易对象 | MasterData | 是 | 否 | 间接 | 间接 |
| suppliers | 记录供应商主数据 | MasterData | 是 | 间接 | 否 | 间接 |
| contacts | 记录客户 / 供应商联系人 | MasterData | 是 | 否 | 否 | 否 |
| products | 成品主数据 | MasterData | 已有最小表 | 间接 | 是 | 间接 |
| product_skus | 产品规格 / SKU 草案 | MasterData | 是 | 间接 | 是 | 间接 |
| materials | 物料主数据 | MasterData | 已有最小表 | 是 | 间接 | 间接 |
| units | 单位主数据 | MasterData | 已有 | 是 | 是 | 是 |
| warehouses | 仓库主数据 | MasterData | 已有 | 是 | 是 | 否 |
| sales_orders | 客户订单源单据 | Source Document | 是 | 间接 | 是 | 间接 |
| sales_order_items | 客户订单行 | Source Document | 是 | 间接 | 是 | 间接 |
| bom_headers | BOM 头 | MasterData | 已有最小表 | 间接 | 间接 | 间接 |
| bom_items | BOM 明细 | MasterData | 已有最小表 | 间接 | 否 | 间接 |
| purchase_orders | 采购订单源单据 | Source Document | 是 | 间接 | 否 | 间接 |
| purchase_receipts | 采购入库事实源单据 | Fact | 已有 | 是 | 否 | 间接 |
| purchase_returns | 采购退货事实源单据 | Fact | 已有 | 是 | 否 | 间接 |
| purchase_receipt_adjustments | 采购入库调整 | Fact | 已有 | 是 | 否 | 间接 |
| inventory_lots | 批次追溯和批次状态 | Fact | 已有 | 是 | 间接 | 否 |
| inventory_txns | 库存事实流水 | Fact | 已有 | 是 | 是 | 间接 |
| inventory_balances | 当前库存余额查询加速 | Derived | 已有 | 是 | 是 | 否 |
| stock_reservations | 库存预留 | Fact | 否 | 是 | 是 | 否 |
| quality_inspections | 来料质检事实 | Fact | 已有最小表 | 是 | 间接 | 间接 |
| production_orders | 生产任务 / 生产单 | Source Document | 是 | 间接 | 间接 | 间接 |
| production_material_issues | 生产领料 | Fact | 否 | 是 | 否 | 间接 |
| finished_goods_receipts | 成品入库 | Fact | 否 | 是 | 是 | 间接 |
| outsource_orders | 委外订单 | Source Document | 是 | 间接 | 否 | 间接 |
| outsource_material_issues | 委外发料 | Fact | 否 | 是 | 否 | 间接 |
| outsource_receipts | 委外回货 / 入库 | Fact | 否 | 是 | 间接 | 间接 |
| shipments | 出货事实 | Fact | 否 | 是 | 是 | 是 |
| shipment_items | 出货行 | Fact | 否 | 是 | 是 | 是 |
| accounts_receivable | 应收 | Fact | 否 | 否 | 间接 | 是 |
| accounts_payable | 应付 | Fact | 否 | 否 | 否 | 是 |
| invoices | 发票 | Fact | 否 | 否 | 间接 | 是 |
| payments | 收付款 | Fact | 否 | 否 | 否 | 是 |
| reconciliations | 对账 / 核销 | Fact | 否 | 否 | 间接 | 是 |

## 规则

- `business_records` 仍可作为通用快照和兼容层，但不替代正式事实表。
- 事实表只在真实业务动作发生时写入，错误通过作废、冲正、反向记录或重新生成修正记录处理。
- 派生状态可以缓存，但必须能从事实重算。
- 当前表清单是设计草案，不代表当前 schema 已经存在。
