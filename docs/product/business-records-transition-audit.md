Doc Type / 文档类型: Business Records Transition Audit
Status / 状态: Audit / 审计
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# Business Records Transition Audit

本文件是 009 docs-only 审计结论，不代表任何 runtime 切换已经实施。

## 当前是什么

`business_records / business_record_items / business_record_events` 当前是：

- 兼容层。
- demo / seed / QA debug 承载层。
- source snapshot。
- 调研入口。
- 旧通用业务页面、打印、帮助和移动端任务跳转的历史承载层。
- 尚未拆专表前的通用业务记录保存能力。

它仍有保留价值，因为旧页面、debug seed、测试、帮助文档、workflow source 跳转和历史快照仍引用这些记录。

## 现在不能是什么

`business_records` 现在不能继续被解释为：

- 正式 `customers / suppliers / contacts` 主数据真源。
- 正式 `sales_orders / sales_order_items` 源单据真源。
- existing `products / materials / units / warehouses` 的替代真源。
- `purchase_receipts / purchase_returns / purchase_receipt_adjustments / quality_inspections` 的替代真源。
- 库存流水、库存余额、批次、出货、应收、应付、发票、收付款或对账事实。
- Product Core 字段唯一真源。

`business_records` 可以保存历史文本和快照，但不能用旧页面继续扩展已经有正式模型的核心能力。

## Partners 入口处理

V1 `customers / suppliers / contacts` 已有 schema、migration、repo/usecase、API/RBAC 和前端页面后，`partners` 入口只能继续作为历史兼容入口和 source snapshot。

处理口径：

1. 新客户、新供应商、新联系人正式写入应走 V1 MasterData usecase。
2. `partners` 旧记录可用于导入 dry-run、重复主体识别、联系人拆分和缺值检查。
3. `partners` 不应继续新增 Product Core 必填字段。
4. `partners` 不应与 V1 主数据双写。
5. `partners` 进入只读前必须先评估旧页面仍承担的打印、debug、帮助和移动端跳转影响。

## Orders / Project Orders 入口处理

V1 `sales_orders / sales_order_items` 已有正式模型后，`project-orders` 只能作为订单源单据迁移来源和历史快照。

处理口径：

1. 正式销售订单创建、提交、激活、关闭、取消走 SalesOrderUsecase。
2. `project-orders` 旧记录可 dry-run 映射 `document_no / source_no / customer_name / style_no / product_no / product_name / quantity / unit / amount / items`。
3. 无法唯一匹配客户、产品、单位的记录必须进入人工确认。
4. 旧订单不得自动生成出货、库存预留、库存扣减、应收、发票或付款事实。
5. `shipping_released != shipped`；旧 `shipping-release` 或 `outbound` 快照不得反向证明销售订单已发货。

## Products 入口处理

现有 `products` schema 已是成品主数据真源；旧 `products` 通用业务记录只能保留为产品资料快照和导入线索。

处理口径：

1. 产品主数据能力应复用 existing `products`，不得新建第二套 Product Core。
2. `business_records.products` 的 `document_no / product_no / product_name / style_no / payload` 可作为 data map source。
3. `product_skus` 仍是 draft-only；不能因旧产品页存在颜色、SKU 或款式字段就自动进入 schema 或映射目标。
4. current 客户产品样本字段必须先分类为 Product Core Candidate、Customer Material、Print Template Input / Candidate、Reporting 或 Import Adapter input。

## 如何继续作为兼容层

`business_records` 可以继续保留以下职责：

- 历史快照查看。
- 打印和文档核对中的 source snapshot。
- demo / seed / QA debug。
- 暂未拆专表的低风险通用记录。
- 迁移 dry-run 的 source reference。
- 移动端任务和 workflow 旧 source 的历史跳转。

保留条件：

- 不能与正式模型双写同一业务事实。
- 不能让旧入口继续扩展已落地正式模型的核心能力。
- 不能让旧快照覆盖正式主数据或事实表。
- 必须在 UI / 文档上逐步明确兼容、demo、只读或 deprecated 状态。

## 如何避免双写真源

| 领域 | 正式写入入口 | `business_records` 允许行为 | 禁止行为 |
|---|---|---|---|
| 客户 / 供应商 / 联系人 | V1 MasterData usecase | 历史快照、导入 dry-run、人工核对 | 新增正式主数据后同步写 partners |
| 销售订单 / 订单行 | SalesOrderUsecase | source snapshot、旧订单查看、迁移候选 | 订单创建或生命周期动作同时写 project-orders |
| 产品 | existing `products` | 旧产品资料和样本线索 | 新增第二套产品主档 |
| 采购 / 库存 / 质检 | existing purchase / inventory / quality facts | 兼容快照和 source reference | 从旧记录直接过账库存或质检判定 |
| 出货 / 财务 | future dedicated usecase | 调研和历史文本 | 自动生成 shipment、AR/AP、invoice、payment |

## 何时进入只读

某个重叠领域满足以下条件后，旧 `business_records` 入口应进入只读或 demo 化：

1. 正式 schema / migration 已落地。
2. repo/usecase、API/RBAC 和 UI 已可承接正式写入。
3. 引用审计已确认旧入口涉及的页面、seed、docs、测试和 mobile task。
4. 数据映射 dry-run 已输出可迁移、不可迁移、需人工确认清单。
5. 用户和实施侧确认旧入口不再作为正式新增入口。

对当前 V1 来说，`partners`、`products` 和 `project-orders` 是优先只读候选。

## 何时可以标记 deprecated

`business_records` 的某个模块可以标记 deprecated，但不能直接删除。至少需要：

- 正式入口已替代对应写入路径。
- 旧页面只承担历史查看或 demo。
- seedData、docs registry、Dashboard、菜单权限、移动端跳转、测试和帮助文档均已完成切换。
- 旧数据迁移 dry-run 已确认缺值、重复、无法自动匹配和不能迁移范围。
- 有回滚或保留旧快照的查看方式。

## 是否能删除

当前不能删除 `business_records`。

删除前置条件：

1. 所有 runtime 引用清零或已替换。
2. 历史记录有归档查看方案。
3. debug seed / cleanup 有替代实现。
4. workflow source 跳转和移动端任务不再依赖旧 source。
5. 旧数据完成迁移、客户确认和备份。
6. migration / rollback 方案单独评审。
7. UI、docs registry、seedData 和测试全部更新。

在以上条件满足前，删除会破坏历史文档、demo、QA、旧页面和任务跳转。

## 必须人工确认

| 内容 | 为什么必须人工确认 |
|---|---|
| partners 中同名主体的客户 / 供应商归属 | 同名可能跨客户、供应商、加工厂多角色 |
| 联系人归属和主联系人 | 旧明细只记录文本，不一定有唯一 owner |
| project-orders 中客户名到 `customers.id` 的匹配 | 文本名称可能重复、缺简称或含旧称 |
| 产品编号 / 款式 / SKU 边界 | `product_skus` 未进入正式 cutline，不能自动创建 |
| 单位映射 | 正式 `units` 需要 active guard，文本单位可能不规范 |
| 数量、金额、币种、税率 | 旧记录使用 float / payload，不能直接作为财务事实 |
| 出货、应收、发票、付款状态 | 缺少事实依据，不能从旧状态或文案推导 |
| current 客户专属字段 | 可能只是客户材料、打印样本输入或导入适配字段 |

## 可以进入后续 import draft

- partners 到 customers / suppliers / contacts 的 dry-run 映射。
- project-orders 到 sales_orders / sales_order_items 的 dry-run 映射。
- products 旧快照到 existing products 的候选匹配。
- materials / warehouses 文本快照到 existing materials / warehouses 的候选匹配。
- unresolved queue、重复主体清单、缺值清单、禁止自动迁移清单。

## 不能自动迁移

- 无唯一主体匹配的客户 / 供应商。
- 无 owner 的联系人。
- 仅凭颜色 / 款式 / SKU 文本生成的 `product_skus`。
- 旧订单直接生成出货、库存、财务事实。
- current 客户样本字段直接变成 Product Core 必填字段。
- demo / seed / debug 数据直接进入正式业务表。
