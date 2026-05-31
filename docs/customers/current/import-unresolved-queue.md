Doc Type: Current Customer Import Unresolved Queue
Status: Draft
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# Current Customer Import Unresolved Queue

unresolved queue 用于 dry-run 阶段记录不能自动处理的来源、字段和候选动作。本设计不实现队列代码，不创建表，不写 `business_records`，不执行真实迁移。

## Queue Rules

- 涉及 shipment / inventory / finance facts 的 unresolved 必须 block。
- 涉及 `product_skus / purchase_orders` 的 unresolved 必须 deferred。
- 涉及 current 客户特殊字段的 unresolved 不得自动进入 Product Core。
- 无 source reference 的记录不得自动导入。
- demo/seed/debug 数据默认 skip 或单独标记，不能进入正式数据。

## Unresolved Types

| type | meaning | example | owner role | resolution options | can auto resolve? | must block import? | notes |
|---|---|---|---|---|---:|---:|---|
| unknown customer | 无法匹配客户 | 订单行客户名不存在或为空 | Sales / Data Import | 新建 customer 候选、匹配现有 customer、跳过该订单 | 否 | 是 | sales_orders 必须有已确认 customer_id。 |
| unknown supplier | 无法匹配供应商或加工厂 | 加工合同厂家名称无法确认 | Purchase / Data Import | 新建 supplier 候选、匹配现有 supplier、标记为客户材料 | 否 | 是 | 不得自动生成采购或应付事实。 |
| unknown product | 无法匹配产品 | 产品编号和名称都无法匹配 existing products | Product / Sales | 匹配 existing product、新建 product 候选、defer 到产品评审 | 否 | 是 | 不得自动创建 `product_skus`。 |
| unknown material | 无法匹配物料 | BOM 行材料名称无匹配 | Purchase / Engineering | 匹配 existing material、新建 material 候选、跳过 BOM 行 | 否 | 是 | BOM/material 候选不写库存事实。 |
| unknown unit | 无法匹配单位 | 单位文本为“袋/套/PCS”且无标准映射 | Data / Purchase | 映射 existing unit、新建 unit 候选、人工换算 | 否 | 是 | 数量字段无 unit 不得自动导入。 |
| unknown warehouse | 无法匹配仓库 | 文本“成品仓A区”无法判断仓库还是库位 | Warehouse / Data | 映射 warehouse、标记为 location note、defer | 否 | 视目标而定 | 若涉及库存事实，必须 block。 |
| ambiguous customer/supplier | 主体既可能是客户也可能是供应商 | partners 记录 partner_type 缺失 | Sales / Purchase | 拆分为 customer/supplier、保留 source snapshot、跳过 | 否 | 是 | 不得自动按名称猜 owner_type。 |
| duplicate code | 编码重复 | 客户编号或订单号已存在多条候选 | Data / Domain Owner | 合并、改码、跳过、标记冲突 | 否 | 是 | code/order_no 唯一性不能靠导入时覆盖。 |
| duplicate name | 名称重复 | 两个供应商简称相同 | Domain Owner | 合并、保留多主体、补充 short_name/code | 否 | 是 | 同名不等于同主体。 |
| missing required field | 目标模型必填字段缺失 | sales_order 缺 customer_id 或 order_no | Data Import | 补充来源、人工填写、跳过 | 否 | 是 | 空值不能伪造。 |
| invalid date | 日期格式无法解析 | “月底前”“2026/13/01” | Data Import | 标准化、人工修正、作为 note | 否 | 视目标而定 | 交期无效时订单候选需 block。 |
| invalid quantity | 数量无效 | 负数、文本、无法换算 | Data Import | 修正、跳过行、人工确认单位 | 否 | 是 | 不得把异常数量写入 Source Document 或 Fact。 |
| invalid money | 金额无效 | 公式残留、币种不明、税额混合 | Finance / Data | 修正、忽略金额、保留为 note | 否 | 否，除非目标要求金额 | 金额不生成 finance facts。 |
| unmapped field | 字段未分类 | Excel 列“客户专属码” | Product / Data | 分类为 Customer Material / Config / Template / Deferred | 否 | 否 | 不得自动塞入 note 后伪装为已确认字段。 |
| deferred domain | 属于后续模型 | purchase order、SKU、shipment、finance | Product / Architecture | 进入后续 Goal、保留 source snapshot、禁止导入 | 否 | 是 | `product_skus / purchase_orders / shipments / finance` 均 deferred。 |
| forbidden fact generation | 会伪造事实 | 从“未出货数”生成 shipment 或库存扣减 | Architecture / Data | 拒绝自动导入、记录风险、后续事实 usecase 评审 | 否 | 是 | shipment / inventory / finance facts 必须 block。 |
| needs manual review | 置信度不足 | 字段语义不清或 current 特殊字段 | Domain Owner | 人工确认分类、补充样本、跳过 | 否 | 视目标而定 | 当前客户字段不能自动进 Product Core。 |

## Queue Item Minimum Fields

| field | purpose |
|---|---|
| source_reference | 文件 / sheet / row 或 business_record id |
| source_type | Customer Material / Demo Seed / Source Snapshot / Data Import Source 等 |
| domain | customers / suppliers / contacts / orders / products / materials / deferred domain |
| unresolved_type | 上表类型 |
| source_field | 原始字段名 |
| source_value | 原始值 |
| target_candidate | 目标模型和字段候选 |
| severity | block / defer / review / warning |
| owner_role | 负责确认角色 |
| resolution | resolved / skipped / deferred / forbidden |
| decision_note | 人工确认说明 |

## Block Policy

| domain | policy |
|---|---|
| customers / suppliers / contacts | 缺 owner、重复主体、缺必填字段时 block。 |
| sales_orders / sales_order_items | 缺 customer/product/unit、订单号重复、数量无效时 block。 |
| products / materials / warehouses / units | 匹配不唯一时 block 或 defer，不能猜测创建。 |
| BOM | product/material/unit 未确认时 block。 |
| product_skus | deferred，不自动创建。 |
| purchase_orders | deferred，不自动创建。 |
| shipments / stock_reservations | forbidden auto import，必须 block。 |
| inventory facts | forbidden auto import，必须 block。 |
| finance facts | forbidden auto import，必须 block。 |
