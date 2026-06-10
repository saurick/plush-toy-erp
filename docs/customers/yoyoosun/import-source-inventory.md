Doc Type / 文档类型: Yoyoosun Customer Import Source Inventory / 永绅 yoyoosun 客户导入来源清单
Status / 状态: Draft / 草案
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 永绅 yoyoosun 客户导入来源清单 / Yoyoosun Customer Import Source Inventory

本清单只用于 永绅 yoyoosun 客户数据导入 dry-run 设计。它不执行真实导入，不写 import/backfill 代码，不修改 runtime、schema、migration、API、UI、docs registry、seedData 或 `business_records`。

## 来源清单 / Source Inventory

| source | type | owner | business domain | can import? | import target | confidence | needs manual review? | notes |
|---|---|---|---|---:|---|---|---:|---|
| `docs/customers/yoyoosun/source-materials.md` | Customer Material index | Product / Delivery | all | 否 | 无直接目标 | High | 是 | 只说明资料用途；不能直接决定 schema 或 Product Core 字段。 |
| yoyoosun Excel 样本 | Customer Material / Data Import Source / Industry Template Candidate | Product / Data Import | customers, suppliers, orders, products, materials, BOM, purchase | 仅 dry-run | V1 customers / suppliers / contacts / sales_orders / sales_order_items；existing products / materials / units / warehouses / BOM 候选 | Medium | 是 | Excel 列必须先分类；不得把客户样本字段自动升级为 Product Core 必填字段。 |
| yoyoosun PDF 样本 | Customer Material / Print Template Input | Product / Delivery | print, outsourcing, purchase, finance | 否，仅抽取字段线索 | Print Template Input / Customer Material | Medium | 是 | 合同、报表和打印版式可作为样本输入；不直接决定 schema、事实或模板内核。 |
| yoyoosun 图片 / 截图 | Customer Material / QA Debug | Product / QA | order, production, warehouse, finance | 否 | QA Debug / field clue | Low | 是 | 只能辅助识别字段、页面和流程，不作为唯一真源。 |
| 岗位职责流程图截图 | Customer Material / Workflow Clue / Field Clue | Product / Workflow | order, purchase, production, outsourcing, warehouse, quality, shipment, finance | 否 | requirement clues / question backlog | Medium | 是 | 可用于梳理岗位节点、协同顺序和待确认问题；不能直接升级成 Product Core workflow、ShipmentUsecase、InventoryUsecase 或 FinanceUsecase。 |
| 合同订单照片 | Customer Material / Print Template Input / Field Clue | Product / Purchase / Print | purchase, suppliers, products, materials, settlement | 否，仅抽取字段线索 | Print Template Input / source document review clue | Low | 是 | 可作为采购订单号、产品订单编号、材料品名、厂商料号、规格、数量、交期和条款线索；照片不是可靠结构化导入来源，不自动生成采购订单、采购入库、库存或应付事实。 |
| 加工合同样本 | Customer Material / Print Template Input / Data Import Source | Product / Purchase / Finance | outsourcing, suppliers, contacts, settlement | 仅 dry-run | suppliers / contacts 候选；加工合同字段留待 future outsourcing / purchase source document review | Medium | 是 | 可提取加工方、联系人、工序、数量、金额、结算条款；不得生成采购订单、应付、付款、库存事实或模板内核。 |
| 材料表 / 材料分析明细 | Customer Material / Data Import Source / Industry Template Candidate | Product / Purchase | materials, BOM, products, units | 仅 dry-run | existing materials / units / bom_headers / bom_items 候选 | Medium | 是 | 主料、辅材、包材需分域；BOM 不写库存事实，采购汇总不能反向覆盖 BOM 明细真源。 |
| 订单表 / 生产订单总表截图 | Customer Material / Data Import Source | Product / Sales / PMC | customers, sales_orders, products, production | 仅 dry-run | customers / sales_orders / sales_order_items 候选 | Medium | 是 | 订单编号、客户订单号、款式编号、产品编号需分层；未出货数、生产数量只作线索，不生成 shipped、shipment、inventory 或 finance facts。 |
| 辅材 / 包材采购表 | Customer Material / Industry Template Candidate / Data Import Source | Product / Purchase | materials, suppliers, purchase | 仅 dry-run | suppliers / contacts / materials / units 候选 | Medium | 是 | 采购数量、单价、金额可进入 unresolved；不得自动生成 `purchase_orders`、采购入库、库存或应付事实。 |
| 委外加工汇总表 | Customer Material / Data Import Source / Print Template Input | Product / Purchase / Outsourcing | outsourcing, suppliers, finance | 仅 dry-run | suppliers / contacts 候选；future outsourcing source document candidate | Medium | 是 | 委外加工订单号、厂家、工序、金额先作为 source snapshot，不自动写 future outsourcing facts。 |
| `web/src/erp/config/seedData.mjs` | Demo Seed / QA Debug / Source Snapshot | Frontend / QA | dashboard, flow, demo materials | 否 | 无直接导入目标 | Medium | 是 | 本轮禁止修改；seed/demo 只作演示和字段线索，不能导入正式数据。 |
| `web/src/erp/config/businessModules.mjs` | Source Snapshot / QA Debug | Frontend / Product | module clues | 否 | 无直接导入目标 | Medium | 是 | 记录旧兼容页面和样本来源；不能证明正式模型已完成。 |
| `web/src/erp/config/businessRecordDefinitions.mjs` | Source Snapshot / Data Map clue | Frontend / Product | business_records fields | 否 | dry-run field mapping clue | Medium | 是 | 可辅助识别旧通用记录字段；不得继续扩展重叠领域核心字段。 |
| `docs/product/business-records-data-map-draft.md` | Source Snapshot / Data Import Source | Product / Data Import | partners, products, project-orders | 是，仅作为 dry-run 设计输入 | V1 MasterData / Sales Order 候选 | High | 是 | 009 输出的映射草案是本轮 data map 输入，不是迁移执行。 |
| `docs/product/business-records-reference-audit.md` | Audit / Source Snapshot | Product | business_records references | 否 | 无直接导入目标 | High | 是 | 用于确认兼容层引用面和旧入口风险。 |
| `business_records` 旧数据或旧入口 | Source Snapshot / Demo Seed / QA Debug / Data Import Source | Product / Data Import | partners, products, project-orders, purchase, shipment, finance | 仅 dry-run | customers / suppliers / contacts / sales_orders / sales_order_items / existing products/materials/warehouses 候选 | Medium | 是 | 不删除、不迁移、不双写；不能作为长期事实真源。 |
| V1 customers 页面和 API | V1 formal model | MasterData | customers | 是，未来 import execution 才可写 | `customers` | High | 是 | 当前 dry-run 不写入；后续真实 loader 必须走 V1 usecase。 |
| V1 suppliers 页面和 API | V1 formal model | MasterData | suppliers | 是，未来 import execution 才可写 | `suppliers` | High | 是 | 当前 dry-run 不写入；加工厂 / 供应商分类不清时必须 unresolved。 |
| V1 contacts 页面和 API | V1 formal model | MasterData | contacts | 是，未来 import execution 才可写 | `contacts` | High | 是 | owner_type + owner_id 必须先唯一确认。 |
| V1 sales_orders 页面和 API | V1 formal model | Source Document | sales orders | 是，未来 import execution 才可写 | `sales_orders` | High | 是 | Sales order 只是 Source Document / Business Commitment，不写 shipment、inventory、finance facts。 |
| V1 sales_order_items 页面和 API | V1 formal model | Source Document | sales order items | 是，未来 import execution 才可写 | `sales_order_items` | High | 是 | product_id 和 unit_id 必须唯一匹配；不自动生成 `product_skus`。 |

## 使用边界

- `yoyoosun` 客户资料只能作为 Customer Material、Demo Seed、Industry Template Candidate、Print Template Input 或 Data Import Source。
- 原始 Excel 可通过 `scripts/import/customerSourceExtract.mjs` 生成本地 `output/customers/yoyoosun/source-extract/*` evidence；该输出不纳入 git，不是真实导入批准。
- `config/customers/yoyoosun/importConfig.mjs` 是从提取 evidence、产品核心边界和客户台账人工收口后的配置草案；只记录统计、字段分组、review queue 和 forbidden targets，不嵌入 raw rows、不接 loader、不执行真实导入。
- `business_records` 只能作为兼容层、demo、seed、source snapshot 和调研入口。
- 本轮 import source inventory 不是 migration plan，也不是 loader spec。
- 任何涉及 shipment、inventory 或 finance facts 的来源只能进入 deferred / forbidden review，不得自动导入。
