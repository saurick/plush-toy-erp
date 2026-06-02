Doc Type / 文档类型: Business Records Transition Plan
Status / 状态: Proposed / 候选
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# business_records 过渡计划 / Business Records Transition Plan

009 已补充 docs-only 审计产物：

- `docs/product/business-records-reference-audit.md`
- `docs/product/business-records-transition-audit.md`
- `docs/product/business-records-cutover-plan.md`
- `docs/product/business-records-data-map-draft.md`
- `docs/product/business-records-risk-register.md`

这些文件只增加引用审计、风险清单、迁移草案和下一步计划；未实施 runtime、API、UI、seedData、docs registry、schema、migration、import/backfill、真实数据迁移或删除。

```text
business_records 当前可继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不能长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

本计划不建议直接删除 `business_records`。删除或停用必须等完整引用审计、迁移 dry-run、UI/API 切换、历史回显和回滚策略完成后再评审。

## 当前定位

`business_records / business_record_items / business_record_events` 当前承担：

- 通用业务记录快照。
- 兼容层。
- demo / seed / QA debug。
- source snapshot。
- 调研入口。
- 尚未拆专表前的页面保存能力。

它不能长期承担：

- 正式客户 / 供应商 / 联系人主数据。
- 正式销售订单源单据。
- 库存、采购、质检、出货、财务事实。
- Product Core 字段唯一真源。

## 仍可能依赖 business_records 的页面

现有前端配置显示，以下页面或模块仍可能依赖通用业务记录：

- partners 主档页面。
- products 资料页面。
- project / order 类业务页面。
- purchase / accessories / processing contract 等采购相关快照页面。
- shipping-release 页面。
- finance / reconciliation 类快照页面。
- debug seed / cleanup 相关能力。

这些入口只能说明当前有兼容保存或演示能力，不能证明正式领域模型已完成。

## partners 页面过渡

正式 `customers / suppliers / contacts` 出现后：

1. 新建 / 编辑正式客户供应商必须走正式 usecase。
2. partners 页面不得继续作为 overlapping domains 的官方可写真源。
3. partners 历史记录可以保留为 source snapshot、demo 或 migration audit source。
4. 迁移前必须 dry-run：partner type、document_no、name、contacts、tax_no、address、payment fields、重复主体和缺值。
5. UI 切换前必须避免同一客户 / 供应商同时在 partners 和正式主档中双写。

## products 页面过渡

现有 `products` Ent schema 已是成品主数据真源。products 页面如果仍通过 `business_records` 保存，只能作为兼容 / source snapshot：

1. 不得新增与 existing `products` schema 语义重复的第二套 Product Core 表。
2. 新正式产品能力应复用 existing `products`。
3. current 产品样本字段先分类为 Product Core Candidate、Customer Material、Print Template Input / Candidate 或 Reporting。
4. `product_skus` 不因 products 页面存在或 current 颜色字段而自动进入 V1 schema。

## 订单样本迁移

订单样本迁移到正式 `sales_orders / sales_order_items` 的顺序：

1. 保留 `business_records` 原始快照。
2. dry-run 映射 `module_key / document_no / source_no / customer_name / style_no / product_no / product_name / quantity / unit / amount / payload / items`。
3. 客户名先映射到 `customers`，无法唯一匹配则进入 unresolved queue。
4. 产品字段先映射 existing `products`，无法唯一匹配不得伪造 `product_skus`。
5. 明细数量和单位必须映射到 decimal 和 `units`。
6. 迁移结果应记录 source snapshot reference，但正式订单不应依赖 `business_records` 作为长期父表。

## current 客户样本保留

current 客户资料继续保留为：

- Customer Material。
- Demo Seed。
- Industry Template Candidate。
- Print Template Input。
- QA Debug。
- Data Import Adapter input。

它们不能直接成为：

- Product Core Source。
- Ent schema 必选字段。
- 通用产品规则。
- 核心状态机规则。

## 停止给 business_records 增加新核心能力的时机

当某个 overlapping domain 的正式模型完成以下条件后，应停止继续在 `business_records` 新增该领域核心业务能力：

1. Ent schema + migration 已落地。
2. repo/usecase 有状态机、幂等、审计和测试。
3. API/RBAC 已接动作权限和数据范围。
4. UI 已切到正式 API。
5. 历史 business_records 快照有只读、引用或迁移策略。
6. 文档明确正式真源。

## 可以继续留在 business_records 的内容

- 旧历史快照。
- demo / seed / QA debug 数据。
- 临时调研和资料整理记录。
- 尚未拆专表的低风险通用业务记录。
- migration source audit reference。
- 不影响库存、出货、财务事实的兼容展示。

## 必须迁移到正式模型的内容

- 客户 / 供应商 / 联系人正式主数据。
- 销售订单和订单行源单据。
- 成品主数据应复用 existing `products`。
- 采购入库 / 退货 / 调整事实已由 existing purchase facts 承担。
- 库存流水、余额、批次、质检事实。
- future shipment facts。
- future finance facts。

## 过渡阶段

```text
Stage 0: business_records as existing compatibility/demo layer.
Stage 1: new V1 models created, business_records read-only or demo-only for overlapping domains.
Stage 2: official pages/API switch to V1 models.
Stage 3: business_records retained only for generic snapshots/debug/demo or deprecated.
```

## 停止条件 / Stop Conditions

- Stop if partners and formal customers/suppliers both remain official writable truth.
- Stop if products page creates a second Product Core truth instead of using existing `products`.
- Stop if order migration fabricates customers, products, SKUs, shipped status or finance facts.
- Stop if current sample fields become required schema fields without classification.
- Stop if business_records is deleted before reference audit.
