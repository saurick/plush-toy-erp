Doc Type / 文档类型: Yoyoosun Customer Import Strategy / 永绅 yoyoosun 客户导入策略
Status / 状态: Draft + 011 Tooling Added / 草案，已补 011 工具
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 永绅 yoyoosun 客户导入策略 / Yoyoosun Customer Import Strategy

本策略从 Product 层约束 永绅 yoyoosun 客户数据导入。011 已新增 dry-run preview package tooling，012 已新增 source snapshot freeze checker 和 real dry-run evidence preparation；它们都不是真实 import loader，不代表真实导入已经开始。

## 定位 / Position

`yoyoosun` 是第一个真实客户、种子客户和私有化客户实例来源。永绅 yoyoosun 资料可以作为：

- Customer Material。
- Data Import Source。
- Demo Seed。
- Industry Template Candidate。
- Print Template Input。
- QA Debug。

永绅 yoyoosun 资料不能直接成为：

- Product Core 真源。
- Ent schema 必填字段。
- runtime usecase 特殊分支。
- shipment / inventory / finance facts。
- `business_records` 之外的隐藏兼容事实。

## 导入原则 / Import Principles

| principle | decision |
|---|---|
| 先 dry-run | 所有来源先生成 preview、skipped rows、unresolved queue、duplicates 和 conflicts。 |
| 先 freeze evidence | source snapshot 先生成 freeze metadata、checksum、风险 summary 和 manual review checklist。 |
| 先字段分类 | 字段必须先归类为 Product Core、Industry Template Candidate、Customer Config、Customer Material、Demo Seed、Data Import Source、Print Template Input、Deferred 或 Forbidden Auto Import。 |
| 先 unresolved queue | 不能唯一判断的主体、字段、数量、金额、单位、仓库、SKU、采购、出货、库存和财务信息先进入 queue。 |
| 先人工确认 | 所有 Medium/Low confidence、重复、冲突、deferred 和 永绅 yoyoosun 专属字段必须人工确认。 |
| 不自动生成 deferred facts | `product_skus`、`purchase_orders`、`shipments`、`stock_reservations`、inventory facts、finance facts 全部禁止自动生成。 |
| 不绕过 V1 usecase | future import loader 必须走 V1 MasterData / SalesOrder usecase 或已有正式 usecase，不直接写表绕过校验。 |
| 不双写 | future import 不得同时写 V1 和 `business_records` 作为两个正式真源。 |
| 单独实现任务 | 真实 import loader、backfill、migration execution 必须作为后续单独实现任务。 |

## 目标模型策略 / Target Model Strategy

| domain | strategy |
|---|---|
| customers | 可做 dry-run import candidate；名称、代码、税号、地址、付款字段需区分 Product Core 可选和 Customer Material。 |
| suppliers | 可做 dry-run import candidate；加工厂、供应商、客户角色不清时进入 unresolved。 |
| contacts | 仅在 owner_type + owner_id 已确认后做候选；不得无 owner 写入。 |
| sales_orders | 只作为 Source Document / Business Commitment 候选；不写 shipment、inventory、finance。 |
| sales_order_items | product/unit 唯一匹配后做候选；不自动创建 SKU。 |
| products / materials / units / warehouses / BOM | 复用 existing formal models；无法唯一匹配时 unresolved，不重复设计真源。 |
| product_skus | draft-only / deferred；颜色、尺寸、包装版本和 SKU 进入后续评审。 |
| purchase_orders | draft-only / V2 candidate；采购承诺不等于采购入库事实。 |
| shipments / stock_reservations | deferred fact domains；不得从 yoyoosun 或旧快照自动生成。 |
| inventory facts | 只由 InventoryUsecase / purchase facts 等正式事实 usecase 写入；导入不生成。 |
| finance facts | 至少等待 finance review；导入不生成 AR/AP、invoice、payment、reconciliation。 |

## 未来导入 loader 要求 / Future Import Loader Requirements

011 已实现 dry-run preview package：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

该 preview package 可输出 source references、normalized rows、candidates、unresolved queue、duplicates、conflicts、forbidden auto-import、validation summary 和 Markdown report。它只证明 dry-run tooling 可运行；真实 loader 仍需单独实现任务。

012 已实现 freeze checker 和 evidence preparation：

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

012 同时用 freeze fixtures 生成 `output/customers/yoyoosun/real-dry-run-evidence/`。这些 output 目录只是 evidence，不是 import approval；`freeze-metadata.json` 和 dry-run `validation-summary.json` 都必须保持 `canExecuteRealImport=false`。

后续真实 import loader 必须作为单独实现任务，并先满足：

1. 允许修改范围明确包含 import code。
2. 备份计划明确，包含数据库和 source artifacts。
3. rollback / forward-fix 计划明确。
4. dry-run 与实际执行使用同一套 mapping / validation rules。
5. 有幂等键或 source reference 防重复。
6. 有导入后对账报告。
7. 不修改 seedData 或 docs registry 作为导入的必要条件。
8. 不删除或覆盖 `business_records` 历史快照。
9. 不绕过 V1 MasterData / SalesOrder usecase 或已有正式 fact usecase。

## 非目标 / Out Of Scope

- 不实现 SaaS 多租户。
- 不新增 `tenant_id`。
- 不实现 license server、套餐计费或客户工单系统。
- 不创建 ChangeUsecase 或 `change_records`。
- 不把 永绅 yoyoosun 样本字段写进 Product Core。
- 不从旧记录自动生成 shipment / inventory / finance facts。
