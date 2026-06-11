# 领域模型 V1 / Domain Model V1

本文只描述 0 到 1 重构的业务域模型草案，不改 Ent schema，不生成 migration。

本文吸收 `docs/reference/imported-notes/毛绒玩具ERP从0到1重构方案.md` 中稳定的业务域划分，但不吸收其字段示例作为 schema 真源。任何新增表、字段、状态机、API 或页面都必须回到对应架构评审、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md` 和本轮具体任务说明。

当前仍可用于边界核对的评审文档：

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`

这些文档仍是 review / boundary input，不代表 Ent schema、migration、runtime、API 或 UI 已实现。已删除的早期 schema draft、cutline 和 go/no-go 文档只可从 Git 历史追溯，不再作为活跃路线入口。

## 业务域职责

| 业务域 | 正式职责 | 不负责 |
| --- | --- | --- |
| MasterData | 客户、供应商、联系人、物料、产品、单位、仓库等长期稳定资料 | 不承接临时订单字段或客户样本残值 |
| Order | 客户订单、订单行、订单变更等业务承诺和源单据 | 不写库存、出货、应收、发票或付款事实 |
| BOM | 产品工程资料、用料和版本关系 | 不直接改库存，不替代采购需求评审 |
| Purchase | 采购承诺、到货、入库、退货、入库调整 | 不直接生成应付真源，除非 Finance 评审明确 |
| Quality | 来料、委外回货、成品质检的判定和批次状态影响 | 不直接写库存数量流水 |
| Inventory | 批次、流水、余额、预留、冻结和冲正 | 不从 workflow payload 或 `business_records` 伪造事实 |
| Production | 生产单、生产领料、成品入库事实 | 不用协同状态代替生产领料或成品入库落账 |
| Outsourcing | 委外订单、发料、回货、质检、返工和结算线索 | 不把加工合同样本直接写成通用产品规则 |
| Shipment | 出货计划、预留、拣货、实际出库和出货事实 | 不把 `shipment_release done` 当 `shipped` |
| Finance | 应收、应付、发票、收付款和对账事实 | 不从 `shipping_released` 或采购入库任务 done 直接生成财务事实 |

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
- 外部规划稿中的字段、API 名、状态名和目录名都是评审输入；不得直接当成 Ent schema、JSON-RPC 方法或前端路由。
- `sales_order.status` 不能混入审批、工程、采购、生产、出货、财务等全链路状态；这些状态必须按单据生命周期、Workflow、Fact 和派生结果拆开。
