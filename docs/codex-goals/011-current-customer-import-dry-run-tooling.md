# 保存路径

docs/codex-goals/011-current-customer-import-dry-run-tooling.md

---

# Codex 输入框短 Goal

目标：执行 docs/codex-goals/011-current-customer-import-dry-run-tooling.md。

请先阅读 AGENTS.md，然后严格执行该 Goal 文件。

本轮是 011 单 Goal，属于 import dry-run tooling 实现型任务，不是 audit / planning / candidate-only。必须落地可运行 CLI、测试、文档同步、验证命令和 .codex-review/latest.md。

本轮只允许实现 current import dry-run tooling 这一层。不得混入 schema、migration、server runtime、repo/usecase、API/RBAC、web UI、seedData、docs registry、business_records runtime cutover 或真实 import execution。

如果发现必须修改 schema/API/UI/runtime/seedData/business_records 才能继续，立即停止并报告，不得越界补丁。

最终不要输出后续候选 Goal 队列；成功标准必须是可运行产物：能用命令生成 dry-run JSON/Markdown 报告，并有自动化测试覆盖。

---

# Codex Goal 011: current Import Dry-run Tooling Implementation

## 任务名称

011：current 客户导入 dry-run tooling 实现

---

## 目标

基于 010 的 current 客户导入草案，真正实现一个可运行的 current import dry-run CLI 工具。

本轮必须产出可运行工具，而不是继续形成方案。

工具目标：

1. 读取 current 客户导入 source snapshot JSON。
2. 读取 existing V1 / existing formal model snapshot JSON。
3. 执行 dry-run 解析、字段归类、基础规范化、重复识别、冲突识别、禁止自动导入识别、unresolved queue 生成。
4. 输出 dry-run package：

   * source-references.json
   * normalized-rows.json
   * candidates.json
   * unresolved-queue.json
   * duplicates.json
   * conflicts.json
   * forbidden-auto-import.json
   * validation-summary.json
   * dry-run-report.md
5. 增加自动化测试，覆盖 happy path、block path、deferred path、forbidden path、duplicate path、invalid value path。
6. 同步 docs，明确 011 已实现 dry-run tooling，但仍未实现真实导入、schema/API/UI/cutover。
7. 最终生成 .codex-review/latest.md。

本轮只实现 import dry-run tooling 这一层，不做真实导入，不连接数据库，不写 V1 表，不写 business_records，不改 schema/API/UI。

---

## 为什么选择这个目标

上一个 011 偏 docs-only，几分钟即可完成，不能提供长期可执行产物。

本轮改为实现型 Goal，但仍遵守单层边界：

* 选中层级：Import dry-run tooling。
* 不混入 schema。
* 不混入 migration。
* 不混入 repo/usecase。
* 不混入 API/RBAC。
* 不混入 Web UI。
* 不混入 seedData。
* 不混入 docs registry。
* 不混入 business_records cutover。
* 不混入真实 import execution。

本轮的完成结果必须能通过命令运行，并生成可检查的 dry-run 报告。

---

## 任务性质

本轮属于：

* Implementation
* Import dry-run tooling
* Script / CLI
* Automated test
* Docs sync

本轮不是：

* Audit-only
* Planning-only
* Candidate-only
* Schema implementation
* API implementation
* UI implementation
* Cutover implementation
* Real import execution
* Data migration
* business_records runtime transition

---

## 必须先读

### 项目规则

* AGENTS.md
* README.md
* docs/current-source-of-truth.md
* progress.md
* scripts/README.md
* docs/codex-goals/README.md
* docs/codex-goals/_goal-file-template.md
* docs/codex-goals/_new-session-goal-template.md
* docs/codex-goals/_review-output-protocol.md

### 010 current 客户导入草案

* docs/codex-goals/010-current-customer-data-import-draft.md
* docs/customers/current/import-source-inventory.md
* docs/customers/current/import-field-classification.md
* docs/customers/current/import-dry-run-plan.md
* docs/customers/current/import-unresolved-queue.md
* docs/customers/current/import-acceptance-checklist.md
* docs/product/current-customer-import-strategy.md
* docs/product/current-customer-import-risk-register.md

### 009 business_records 审计输入

* docs/product/business-records-reference-audit.md
* docs/product/business-records-transition-audit.md
* docs/product/business-records-cutover-plan.md
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-risk-register.md

### V1 / Product 边界

* docs/product/product-principles.md
* docs/product/domain-model-v1.md
* docs/product/module-boundaries.md
* docs/product/customer-instance-policy.md
* docs/product/customer-delta-policy.md
* docs/product/config-permission-policy.md
* docs/product/release-gates.md
* docs/product/test-strategy.md
* docs/product/v1-implementation-cutline.md
* docs/product/v1-schema-go-no-go.md
* docs/product/v1-next-codex-goals.md
* docs/architecture/status-workflow-fact-boundary.md

如果 .codex-review/latest.md 存在，可以读取作为上一轮线索；如果不存在，继续执行并在最终报告说明缺失。

---

## 当前真源

本轮必须以这些为准：

* 010 的七个 current import draft 文档。
* 009 的 business_records data map 和 risk register。
* 当前 V1 已实现状态：

  * customers
  * suppliers
  * contacts
  * sales_orders
  * sales_order_items
* existing formal model 已实现状态：

  * units
  * materials
  * products
  * warehouses
  * inventory_txns
  * inventory_balances
  * inventory_lots
  * bom_headers
  * bom_items
  * purchase_receipts
  * purchase_receipt_items
  * purchase_returns
  * purchase_return_items
  * purchase_receipt_adjustments
  * purchase_receipt_adjustment_items
  * quality_inspections

注意：

* dry-run tooling 可以识别 existing formal model 候选，但不得写入任何数据库。
* dry-run tooling 可以输出 products/materials/units/warehouses/BOM 候选，但不得执行创建。
* dry-run tooling 可以识别 shipment/inventory/finance 字段，但必须进入 forbidden-auto-import 或 unresolved queue。
* sales_order 仍是 Source Document / Business Commitment，不是 shipment、inventory、finance fact。

---

## 非真源 / 只作为线索

以下只能作为 source snapshot / clue，不能成为 runtime 真源：

* current 客户 Excel / PDF / 图片 / 截图样本
* business_records 旧数据导出
* web/src/erp/config/seedData.mjs
* web/src/erp/config/businessModules.mjs
* web/src/erp/config/businessRecordDefinitions.mjs
* 已删除的历史 changes 记录（仅可从 Git 历史回查）
* imported notes
* 历史聊天记忆
* 旧 Codex 输出

本轮可以读取这些文件作为字段线索，但不得修改它们。

---

## 本轮实现边界

### 允许实现

本轮必须实现：

1. 一个 Node.js CLI：

   * scripts/import/currentCustomerDryRun.mjs

2. 一个自动化测试文件：

   * scripts/import/currentCustomerDryRun.test.mjs

3. 测试 fixtures：

   * scripts/import/fixtures/current/source-snapshot.sample.json
   * scripts/import/fixtures/current/existing-v1.sample.json
   * scripts/import/fixtures/current/README.md

4. docs 同步：

   * docs/customers/current/import-dry-run-tooling.md
   * docs/customers/current/import-dry-run-plan.md
   * docs/customers/current/import-acceptance-checklist.md
   * docs/product/current-customer-import-strategy.md
   * docs/product/current-customer-import-risk-register.md
   * docs/current-source-of-truth.md
   * scripts/README.md
   * progress.md

5. 最终审查报告：

   * .codex-review/latest.md

### 禁止实现

本轮禁止实现：

* 真实导入。
* 数据库写入。
* 数据库读取。
* DB backup / restore。
* migration。
* schema。
* Ent generated code。
* repo/usecase。
* API/RBAC。
* Web UI。
* docs registry。
* seedData。
* business_records runtime cutover。
* business_records read-only。
* menu cutover。
* source Excel parser。
* source PDF parser。
* xlsx dependency。
* OCR。
* 自动生成 shipment。
* 自动生成 stock_reservation。
* 自动生成 inventory_txn。
* 自动生成 inventory_balance。
* 自动生成 inventory_lot。
* 自动生成 AR/AP。
* 自动生成 invoice。
* 自动生成 payment。
* 自动生成 finance reconciliation。
* 新增 tenant_id。
* 新增 ChangeUsecase / change_records。

---

## 允许修改的文件

本轮只允许修改：

```
scripts/import/**
scripts/README.md
docs/codex-goals/011-current-customer-import-dry-run-tooling.md
docs/customers/current/**
docs/product/current-customer-import-strategy.md
docs/product/current-customer-import-risk-register.md
docs/current-source-of-truth.md
progress.md
.codex-review/latest.md
```

说明：

* scripts/import/** 是本轮唯一允许的代码层。
* docs 修改只允许同步 dry-run tooling 的使用方式、边界和当前状态。
* .codex-review/latest.md 只在最终收口时生成。
* progress.md 必须在每个 checkpoint 后更新。

---

## 禁止修改的文件

本轮禁止修改：

```
server/**
web/**
migrations/**
config/**
deployments/**
docs/product/business-records-*.md
docs/architecture/**
web/src/erp/config/seedData.mjs
web/src/erp/config/docs.mjs
web/src/erp/config/businessModules.mjs
web/src/erp/config/businessRecordDefinitions.mjs
server/internal/data/model/schema/**
server/internal/data/model/ent/**
server/internal/biz/**
server/internal/data/**
server/internal/core/**
server/openapi.yaml
generated code
```

特别禁止：

* 不得修改 server runtime。
* 不得修改 web runtime。
* 不得修改 seedData。
* 不得修改 docs registry。
* 不得修改 business_records runtime。
* 不得新增或修改 API。
* 不得新增或修改 RBAC。
* 不得新增 migration。
* 不得运行 Ent generate。
* 不得运行 Atlas migration。
* 不得修改 config/deployments。
* 不得修改 docs/product/business-records-*，因为本轮不是 cutover Goal。

如果发现必须修改禁止路径才能继续，必须立即停止并报告。

---

## CLI 设计要求

必须实现命令：

```
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run \
  --format json,md
```

必须支持：

```
node scripts/import/currentCustomerDryRun.mjs --help
```

必须支持参数：

| 参数                 | 必填 | 说明                                                  |
| ------------------ | -: | --------------------------------------------------- |
| --source           |  是 | source snapshot JSON 路径                             |
| --existing         |  是 | existing V1 / formal model snapshot JSON 路径         |
| --out              |  是 | 输出目录                                                |
| --format           |  否 | json、md 或 json,md，默认 json,md                        |
| --fail-on-blockers |  否 | 存在 block severity unresolved / forbidden 时返回非 0     |
| --strict-source    |  否 | source 缺少 source reference / domain / fields 时返回非 0 |
| --help             |  否 | 输出帮助                                                |

必须保证：

* 默认不连接数据库。
* 默认不读取 env 中的数据库 DSN。
* 默认不读取 server config。
* 默认不写任何非 --out 目录文件，除了测试时允许使用临时目录。
* 不产生真实导入文件。
* 不产生 SQL。
* 不产生 migration。
* 不调用 server/web 代码。
* 不依赖 npm 新包。
* 使用 Node.js 内置模块实现。

---

## Source Snapshot JSON 格式

本轮要在 fixtures README 和 docs 中定义 source snapshot 最小格式。

示例结构：

{
"version": 1,
"generatedAt": "2026-05-31T00:00:00.000Z",
"sources": [
{
"sourceId": "br-partners-001",
"sourceType": "Data Import Source",
"sourceKind": "business_records",
"moduleKey": "partners",
"fileName": "business-records-export.json",
"sheetName": null,
"rowNumber": 1,
"domain": "customers",
"fields": {
"document_no": "C001",
"title": "示例客户",
"partner_type": "合作客户",
"country_region": "CN",
"address": "示例地址"
},
"items": []
}
]
}

字段说明：

| 字段          | 说明                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| version     | snapshot 格式版本，本轮支持 1                                                                                                                                                            |
| generatedAt | 快照生成时间                                                                                                                                                                          |
| sources     | source rows 数组                                                                                                                                                                  |
| sourceId    | 来源内部 ID                                                                                                                                                                         |
| sourceType  | Data Import Source / Customer Material / Demo Seed / Source Snapshot 等                                                                                                          |
| sourceKind  | business_records / excel / csv / manual_snapshot / pdf_extract 等                                                                                                                |
| moduleKey   | partners / products / project-orders / material-bom 等                                                                                                                           |
| fileName    | 来源文件名                                                                                                                                                                           |
| sheetName   | Excel sheet 或 null                                                                                                                                                              |
| rowNumber   | 来源行号或 null                                                                                                                                                                      |
| domain      | customers / suppliers / contacts / sales_orders / sales_order_items / products / materials / warehouses / units / bom / purchase / outsourcing / shipment / inventory / finance |
| fields      | 原始字段键值                                                                                                                                                                          |
| items       | 明细行数组，可为空                                                                                                                                                                       |

本轮不实现 Excel / PDF 直接解析，只接受已经导出的 JSON snapshot。

---

## Existing Snapshot JSON 格式

本轮要在 fixtures README 和 docs 中定义 existing snapshot 最小格式。

示例结构：

{
"version": 1,
"customers": [
{
"id": "customer-1",
"code": "C001",
"name": "示例客户",
"displayName": "示例客户",
"status": "active"
}
],
"suppliers": [],
"contacts": [],
"salesOrders": [],
"salesOrderItems": [],
"products": [],
"materials": [],
"units": [
{
"id": "unit-pcs",
"code": "PCS",
"name": "只"
}
],
"warehouses": [],
"bomHeaders": [],
"bomItems": []
}

要求：

* existing snapshot 只作为 dry-run 匹配输入。
* 不得从数据库读取 existing snapshot。
* 不得在 CLI 内写回 existing snapshot。
* existing snapshot 缺失时必须报错。
* 同一 code/name 多条时要输出 duplicate/conflict，而不是猜测。

---

## Dry-run 输出要求

CLI 成功执行后，必须在 --out 目录生成：

```
source-references.json
normalized-rows.json
candidates.json
unresolved-queue.json
duplicates.json
conflicts.json
forbidden-auto-import.json
validation-summary.json
dry-run-report.md
```

### source-references.json

必须记录每条 source 的来源：

* sourceId
* sourceType
* sourceKind
* moduleKey
* fileName
* sheetName
* rowNumber
* domain
* sourceReferenceLabel

### normalized-rows.json

必须记录：

* sourceReference
* domain
* normalizedFields
* rawFields
* normalizationWarnings
* skipped
* skipReason

规范化至少覆盖：

* trim string
* empty string -> null
* decimal-like string normalize
* date-like string normalize
* unit text normalize
* money text normalize
* demo/debug/source snapshot 标记

### candidates.json

必须记录：

* sourceReference
* targetModel
* actionCandidate
* confidence
* matchedExistingId
* targetFields
* reason
* warnings

actionCandidate 只能是：

* create
* update
* skip
* defer
* forbidden
* review

### unresolved-queue.json

必须记录：

* sourceReference
* sourceType
* domain
* unresolvedType
* sourceField
* sourceValue
* targetCandidate
* severity
* ownerRole
* resolution
* decisionNote
* reason

severity 只能是：

* block
* defer
* review
* warning

### duplicates.json

必须记录：

* targetModel
* duplicateType
* key
* sourceReferences
* existingIds
* reason

### conflicts.json

必须记录：

* targetModel
* conflictType
* key
* sourceReference
* existingId
* before
* afterCandidate
* reason

### forbidden-auto-import.json

必须记录：

* sourceReference
* domain
* sourceField
* sourceValue
* forbiddenTarget
* reason
* boundary

必须识别并阻断：

* shipment
* stock_reservation
* inventory_txn
* inventory_balance
* inventory_lot
* AR/AP
* invoice
* payment
* finance reconciliation
* product_skus
* purchase_orders
* shipping_released -> shipped
* workflow task done -> fact posted

### validation-summary.json

必须记录：

* totalSources
* normalizedRows
* candidateCountsByAction
* unresolvedCountsBySeverity
* forbiddenCount
* duplicateCount
* conflictCount
* blockerCount
* canProceedToManualReview
* canExecuteRealImport

要求：

* canExecuteRealImport 必须永远是 false。
* 如果有 block/defer/forbidden，canProceedToManualReview 可以为 true，但 canExecuteRealImport 仍为 false。
* 报告必须明确：本工具只做 dry-run，不执行真实导入。

### dry-run-report.md

必须包含：

* 标题
* 运行命令
* 输入 source / existing 路径
* 输出目录
* summary
* candidate counts
* unresolved counts
* forbidden list 摘要
* duplicate/conflict 摘要
* no real import statement
* next manual review steps

---

## 字段归类与边界规则

实现至少覆盖以下规则。

### 可产生候选的目标

| domain            | target                                          |
| ----------------- | ----------------------------------------------- |
| customers         | customers                                       |
| suppliers         | suppliers                                       |
| contacts          | contacts                                        |
| sales_orders      | sales_orders                                    |
| sales_order_items | sales_order_items                               |
| products          | existing products                               |
| materials         | existing materials                              |
| units             | existing units                                  |
| warehouses        | existing warehouses                             |
| bom               | existing bom_headers / bom_items candidate only |

### deferred 目标

这些只能 defer，不能 create/update：

* product_skus
* purchase_orders
* purchase_order_items
* outsourcing source documents
* future shipment source documents
* future finance source documents

### forbidden auto-import 目标

这些必须 forbidden 或 block：

* shipments
* shipment_items
* stock_reservations
* inventory_txns
* inventory_balances
* inventory_lots
* AR/AP
* invoice
* payment
* finance reconciliation
* shipped facts
* inventory deduction
* workflow done -> fact posted
* shipping_released -> shipped

### sourceType 规则

* Demo Seed：默认 skip。
* QA Debug：默认 skip。
* Customer Material：默认 review，不自动 create/update。
* Data Import Source：可以进入候选，但必须经过 target/domain 规则。
* Source Snapshot：可以进入候选或 review，但不得成为正式真源。
* Print Template Input：默认 review/defer，不自动写事实。
* Industry Template Candidate：默认 defer/review，不自动写 Product Core。
* Forbidden Auto Import：必须 forbidden。

---

## 匹配规则要求

必须实现最小匹配规则，不需要完美业务匹配，但不能乱猜。

### customers

按以下顺序匹配：

1. code / customer_code / document_no
2. name / title / customer_name
3. displayName / display_name

如果唯一匹配，actionCandidate = update。

如果无匹配且 required fields 足够，actionCandidate = create。

如果多匹配，进入 duplicates / unresolved block。

### suppliers

按以下顺序匹配：

1. code / supplier_code / document_no
2. name / title / supplier_name / factory_name
3. shortName / short_name

加工厂 / 供应商语义不清时，进入 unresolved review 或 block。

### contacts

必须先确认 owner：

* ownerType / owner_type
* ownerId / owner_id
* 或从同一 source 的 customer/supplier 候选中唯一推导

无法唯一确认 owner 时，必须 unresolved block，不得 create。

### sales_orders

必须满足：

* order_no / document_no 存在。
* customer 必须唯一匹配或已有 customer_id。
* order date 如果无法解析，进入 unresolved block 或 review。
* shipping date 只能作为 expected_ship_date 候选，不得证明 shipped。

### sales_order_items

必须满足：

* product 必须唯一匹配 existing products 或进入 unresolved block。
* unit 必须唯一匹配 existing units 或进入 unresolved block。
* ordered_quantity 必须是有效 decimal 且 >= 0。
* unshipped_qty / production_qty 不得写入出货、库存、生产事实。

### products/materials/units/warehouses

允许生成候选，但：

* 重复 code/name 必须 unresolved。
* 颜色/尺寸/包装版本/SKU 必须 defer。
* warehouse location 语义不清时 review，不写 inventory facts。

### BOM

允许生成候选报告，但：

* product/material/unit 必须唯一确认。
* 不写库存事实。
* 不反向生成采购或生产。

---

## 测试要求

必须新增：

```
scripts/import/currentCustomerDryRun.test.mjs
```

测试必须使用 Node.js 内置 node:test 和 assert，不引入新依赖。

测试必须覆盖：

1. help 输出。
2. 缺少 --source 返回非 0。
3. 缺少 --existing 返回非 0。
4. happy path：

   * source snapshot + existing snapshot 可以生成全部输出文件。
   * validation-summary.json 存在。
   * dry-run-report.md 存在。
5. customers 唯一匹配：

   * 同 code existing customer -> update candidate。
6. customers 新建候选：

   * 无匹配且字段足够 -> create candidate。
7. duplicate：

   * existing 中同名 / 同 code 多条 -> duplicates + unresolved block。
8. contacts 无 owner：

   * 进入 unresolved block，不得 create。
9. sales_order 缺 customer：

   * unresolved block。
10. sales_order_item unknown unit：

* unresolved block。

11. product_skus 字段：

* defer，不得 create。

12. shipment / inventory / finance 字段：

* forbidden-auto-import。

13. shipping_released：

* 不得变成 shipped。

14. workflow task done：

* 不得变成 fact posted。

15. Demo Seed / QA Debug：

* skip，不进入 create/update。

16. --fail-on-blockers：

* 存在 block/forbidden 时返回非 0。

17. --strict-source：

* source 缺 sourceId/sourceType/sourceKind/moduleKey/domain/fields 时返回非 0。

18. no DB / no runtime：

* 测试中确认 CLI 不需要 server、web、DB env 即可运行。

19. output determinism：

* 同输入重复运行输出 summary 关键字段一致。

测试不要求跑完整 web/server 测试，因为本轮不改 web/server。

---

## Fixture 要求

必须新增：

```
scripts/import/fixtures/current/source-snapshot.sample.json
scripts/import/fixtures/current/existing-v1.sample.json
scripts/import/fixtures/current/README.md
```

fixture 必须覆盖：

* customer update
* customer create
* supplier review
* contact missing owner
* sales order candidate
* sales order item unknown unit
* product SKU deferred
* shipment forbidden
* inventory forbidden
* finance forbidden
* demo/debug skip
* duplicate existing customer 或 supplier

fixture 必须是小而完整的样本，不能塞入真实客户敏感数据。

---

## Docs 同步要求

必须新增：

```
docs/customers/current/import-dry-run-tooling.md
```

内容必须包括：

* CLI 用法。
* source snapshot 格式。
* existing snapshot 格式。
* 输出文件说明。
* 运行示例。
* exit code 说明。
* fail-on-blockers 说明。
* strict-source 说明。
* 手工 review 下一步。
* 明确 canExecuteRealImport 永远 false。
* 明确不连接数据库、不写正式表、不改 business_records、不改 seedData、不改 docs registry。

必须更新：

```
docs/customers/current/import-dry-run-plan.md
```

更新内容：

* 010 是 plan，011 已实现 dry-run tooling。
* Stage 0 - Stage 3 的部分能力已有 CLI 支撑。
* Stage 4 - Stage 6 仍需人工 review / future Goal。
* Stage 6 真实 import execution 仍未实现。

必须更新：

```
docs/customers/current/import-acceptance-checklist.md
```

更新内容：

* 增加 dry-run CLI 输出作为 future import 前置 evidence。
* 但真实导入仍需要人工确认、备份、回滚、customer sign-off。

必须更新：

```
docs/product/current-customer-import-strategy.md
```

更新内容：

* Future Import Loader Requirements 中加入 011 tooling 已实现 dry-run preview package。
* 真实 loader 仍需单独 Goal。
* 不得绕过 V1 usecase。

必须更新：

```
docs/product/current-customer-import-risk-register.md
```

更新内容：

* 增加 011 tooling 已有控制：

  * forbidden-auto-import report
  * unresolved queue
  * duplicates/conflicts
  * validation-summary
* 明确这只是 dry-run 检查，不是 runtime 防护。

必须更新：

```
docs/current-source-of-truth.md
```

更新内容：

* 在当前业务保存层或 current import 边界处追加：011 已新增 current import dry-run tooling，但不执行真实导入、不写 DB、不改 schema/API/UI/seedData/business_records。

必须更新：

```
scripts/README.md
```

更新内容：

* 增加 current import dry-run CLI 的说明和运行命令。
* 放在 QA / import tooling 位置，不要描述成 runtime loader。

必须更新 progress.md。

---

## Checkpoints

本轮是长时间执行的单 Goal，可以按 checkpoint 推进，但所有 checkpoint 都属于 011，不得自动进入下一 Goal。

### Checkpoint 0：启动与边界确认

必须完成：

1. 读取必须先读文件。
2. 记录 git status。
3. 确认本轮只做 import dry-run tooling。
4. 确认禁止路径。
5. 检查 progress.md 是否达到归档阈值。
6. 在 progress.md 记录启动、下一步、风险。

验收标准：

* 已确认只允许 scripts/import/** + docs + progress + .codex-review。
* 未修改 server/web/schema/API/UI/seedData。
* progress.md 已更新。

### Checkpoint 1：CLI 骨架与参数解析

必须完成：

1. 新增 scripts/import/currentCustomerDryRun.mjs。
2. 实现 --help。
3. 实现参数解析。
4. 实现输入文件存在性校验。
5. 实现 --out 创建。
6. main 与核心函数分离，便于测试 import。
7. progress.md 更新。

验收标准：

* node scripts/import/currentCustomerDryRun.mjs --help 可运行。
* 缺 --source / --existing / --out 时返回非 0。
* 不引入新 npm 依赖。
* 不读取 DB / server config / web runtime。
* progress.md 已更新。

### Checkpoint 2：Source / Existing loader 与规范化

必须完成：

1. 读取 source snapshot。
2. 读取 existing snapshot。
3. 校验 version。
4. 校验 sources 数组。
5. 校验 required source fields。
6. 实现 trim、empty string -> null。
7. 实现 basic decimal/date/money/unit normalization。
8. 生成 source-references.json 和 normalized-rows.json。
9. progress.md 更新。

验收标准：

* fixture 可以生成 source-references.json。
* fixture 可以生成 normalized-rows.json。
* --strict-source 能阻断缺少 sourceId/domain/fields 的 source。
* invalid date / quantity / money 可以产生 warning/unresolved。
* progress.md 已更新。

### Checkpoint 3：候选生成、匹配、重复和冲突

必须完成：

1. 实现 customers 匹配。
2. 实现 suppliers 匹配。
3. 实现 contacts owner guard。
4. 实现 sales_orders customer guard。
5. 实现 sales_order_items product/unit/quantity guard。
6. 实现 products/materials/units/warehouses/BOM 候选规则。
7. 输出 candidates.json。
8. 输出 duplicates.json。
9. 输出 conflicts.json。
10. progress.md 更新。

验收标准：

* customer existing 唯一匹配输出 update。
* customer 无匹配且字段足够输出 create。
* duplicate code/name 输出 duplicates + unresolved block。
* contact 无 owner 不输出 create。
* sales_order 缺 customer 不输出 create。
* sales_order_item unknown unit 不输出 create。
* progress.md 已更新。

### Checkpoint 4：unresolved / deferred / forbidden 规则

必须完成：

1. 实现 unresolved queue。
2. 实现 severity：block/defer/review/warning。
3. 实现 product_skus deferred。
4. 实现 purchase_orders deferred。
5. 实现 shipment forbidden。
6. 实现 inventory forbidden。
7. 实现 finance forbidden。
8. 实现 shipping_released != shipped。
9. 实现 workflow task done != fact posted。
10. 输出 unresolved-queue.json。
11. 输出 forbidden-auto-import.json。
12. progress.md 更新。

验收标准：

* product_skus 字段只能 defer。
* purchase_orders 字段只能 defer。
* shipment / stock reservation 字段必须 forbidden。
* inventory facts 必须 forbidden。
* finance facts 必须 forbidden。
* shipping_released 不得映射为 shipped。
* workflow done 不得映射为 fact posted。
* progress.md 已更新。

### Checkpoint 5：summary 与 Markdown report

必须完成：

1. 输出 validation-summary.json。
2. 输出 dry-run-report.md。
3. canExecuteRealImport 永远 false。
4. canProceedToManualReview 根据 blocker/forbidden 情况计算。
5. report 中写明 no real import。
6. report 中写明 manual review next steps。
7. progress.md 更新。

验收标准：

* validation-summary.json 字段完整。
* dry-run-report.md 可读。
* canExecuteRealImport === false。
* report 不暗示可以直接真实导入。
* progress.md 已更新。

### Checkpoint 6：自动化测试

必须完成：

1. 新增 currentCustomerDryRun.test.mjs。
2. 新增 fixtures。
3. 覆盖测试要求中的 19 类场景。
4. 使用临时目录运行，不污染仓库。
5. progress.md 更新。

验收标准：

* node --test scripts/import/currentCustomerDryRun.test.mjs 通过。
* 测试不依赖 DB。
* 测试不依赖 server/web。
* fixture 不包含真实敏感数据。
* progress.md 已更新。

### Checkpoint 7：文档同步

必须完成：

1. 新增 docs/customers/current/import-dry-run-tooling.md。
2. 更新 import-dry-run-plan.md。
3. 更新 import-acceptance-checklist.md。
4. 更新 current-customer-import-strategy.md。
5. 更新 current-customer-import-risk-register.md。
6. 更新 docs/current-source-of-truth.md。
7. 更新 scripts/README.md。
8. progress.md 更新。

验收标准：

* docs 明确 011 已实现 dry-run tooling。
* docs 明确仍未真实导入。
* docs 明确仍未 schema/API/UI/seedData/business_records cutover。
* docs 包含运行命令。
* progress.md 已更新。

### Checkpoint 8：完整验证与收口

必须完成：

1. 运行全部验收命令。
2. 检查禁止路径未改。
3. 检查 output 目录未纳入 git。
4. 检查 .codex-review/latest.md 只描述 011。
5. 最终更新 progress.md。
6. 最终生成 .codex-review/latest.md。

验收标准：

* 所有必跑命令完成。
* 禁止路径无 diff。
* .codex-review/latest.md 存在。
* .codex-review/latest.md 符合协议。
* 不生成 012/013/014 候选 Goal。
* 不自动进入下一 Goal。

---

## 成功标准

本轮完成必须满足：

1. scripts/import/currentCustomerDryRun.mjs 存在。
2. CLI --help 可运行。
3. CLI 可读取 source snapshot JSON。
4. CLI 可读取 existing snapshot JSON。
5. CLI 可输出完整 dry-run package。
6. 输出文件包含：

   * source-references.json
   * normalized-rows.json
   * candidates.json
   * unresolved-queue.json
   * duplicates.json
   * conflicts.json
   * forbidden-auto-import.json
   * validation-summary.json
   * dry-run-report.md
7. validation-summary.json 中 canExecuteRealImport 永远 false。
8. product_skus 只能 defer。
9. purchase_orders 只能 defer。
10. shipment/inventory/finance facts 必须 forbidden。
11. shipping_released 不得映射为 shipped。
12. workflow task done 不得映射为 fact posted。
13. contacts 无 owner 不得 create。
14. sales_order 缺 customer 不得 create。
15. sales_order_item 缺 product/unit/quantity 不得 create。
16. duplicate code/name 不得自动合并。
17. Demo Seed / QA Debug 默认 skip。
18. --fail-on-blockers 可让 blocker/forbidden 导致非 0 exit。
19. --strict-source 可让 source 格式错误导致非 0 exit。
20. 测试覆盖关键场景。
21. node --test scripts/import/currentCustomerDryRun.test.mjs 通过。
22. fixture 和 docs 完整。
23. docs 已同步 011 tooling 状态。
24. progress.md 每个 checkpoint 都更新。
25. .codex-review/latest.md 生成且只描述 011。
26. 没有修改 server。
27. 没有修改 web。
28. 没有修改 schema。
29. 没有修改 migration。
30. 没有修改 API/RBAC。
31. 没有修改 seedData。
32. 没有修改 docs registry。
33. 没有修改 business_records runtime。
34. 没有生成后续候选 Goal 队列。
35. 没有自动进入下一 Goal。

---

## 停止条件

出现以下情况必须立即停止并报告：

1. 必须修改 server 才能继续。
2. 必须修改 web 才能继续。
3. 必须修改 schema 才能继续。
4. 必须新增 migration 才能继续。
5. 必须修改 API/RBAC 才能继续。
6. 必须修改 seedData 才能继续。
7. 必须修改 docs registry 才能继续。
8. 必须修改 business_records runtime 才能继续。
9. 必须连接数据库才能继续。
10. 必须执行真实导入才能继续。
11. 必须实现 Excel/PDF parser 才能继续。
12. 必须引入 npm 新依赖才能继续。
13. 必须生成 shipment/inventory/finance facts 才能继续。
14. 必须新增 tenant_id 才能继续。
15. 必须创建 ChangeUsecase/change_records 才能继续。
16. 工作区出现非本轮改动且影响验收，无法隔离。
17. 测试需要通过修改禁止路径才能通过。
18. 文档要求与 AGENTS.md 冲突。
19. 无法保持单层 import dry-run tooling 边界。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

* 默认不提交。
* 默认不推送。
* 不执行 git add .
* 不执行 git stash。
* 不回退非本轮改动。
* 不删除非本轮文件。
* 不格式化非本轮文件。
* 若用户要求提交，必须精确 stage 本轮允许路径。
* .codex-review/ 不提交。

开始时运行：

```
git status --short
git branch --show-current
git log --oneline -3
git diff --name-status
git ls-files --others --exclude-standard
```

收口时运行：

```
git status --short
git diff --name-status
git diff --stat
git diff --check
git diff --cached --name-status
git ls-files --others --exclude-standard
```

---

## 测试分层选择

| 测试层级           | 本轮选择 | 原因                           | 命令                                                        |
| -------------- | ---: | ---------------------------- | --------------------------------------------------------- |
| CLI 单测         |    是 | 本轮实现 Node import dry-run CLI | node --test scripts/import/currentCustomerDryRun.test.mjs |
| CLI 冒烟         |    是 | 必须证明可运行产物能生成 dry-run package | node scripts/import/currentCustomerDryRun.mjs ...         |
| 静态 diff 检查     |    是 | 检查格式与越界路径                    | git diff --check / git diff --name-status                 |
| docs 检查        |    是 | 本轮同步 docs                    | grep / cat / test -f                                      |
| web lint/test  |    否 | 本轮不改 web                     | 不运行                                                       |
| server go test |    否 | 本轮不改 server                  | 不运行                                                       |
| migration 检查   |    否 | 本轮不改 schema/migration        | 不运行                                                       |
| E2E / style:l1 |    否 | 本轮不改 UI                      | 不运行                                                       |

---

## 必跑验证命令

### 1. Git / diff

```
git status --short
git branch --show-current
git log --oneline -3
git diff --name-status
git diff --stat
git diff --check
git diff --cached --name-status
git ls-files --others --exclude-standard
```

### 2. CLI help

```
node scripts/import/currentCustomerDryRun.mjs --help
```

### 3. CLI smoke

```
rm -rf output/current-import-dry-run
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run \
  --format json,md
```

### 4. CLI output existence

```
test -f output/current-import-dry-run/source-references.json
test -f output/current-import-dry-run/normalized-rows.json
test -f output/current-import-dry-run/candidates.json
test -f output/current-import-dry-run/unresolved-queue.json
test -f output/current-import-dry-run/duplicates.json
test -f output/current-import-dry-run/conflicts.json
test -f output/current-import-dry-run/forbidden-auto-import.json
test -f output/current-import-dry-run/validation-summary.json
test -f output/current-import-dry-run/dry-run-report.md
```

### 5. CLI blocker mode

```
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run-blocker-check \
  --format json \
  --fail-on-blockers ; test "$?" -ne 0
```

如果 shell 写法不方便，可用下面等价方式：

```
if node scripts/import/currentCustomerDryRun.mjs --source scripts/import/fixtures/current/source-snapshot.sample.json --existing scripts/import/fixtures/current/existing-v1.sample.json --out output/current-import-dry-run-blocker-check --format json --fail-on-blockers; then echo "expected blocker failure" >&2; exit 1; else echo "blocker check passed"; fi
```

### 6. 自动化测试

```
node --test scripts/import/currentCustomerDryRun.test.mjs
```

### 7. 输出内容检查

```
grep -R "\"canExecuteRealImport\": false" output/current-import-dry-run/validation-summary.json
grep -R "No real import" output/current-import-dry-run/dry-run-report.md
grep -R "shipping_released" output/current-import-dry-run/forbidden-auto-import.json output/current-import-dry-run/unresolved-queue.json || true
grep -R "shipped" output/current-import-dry-run/forbidden-auto-import.json output/current-import-dry-run/unresolved-queue.json || true
grep -R "inventory_txn\|inventory_balance\|invoice\|payment\|stock_reservation" output/current-import-dry-run/forbidden-auto-import.json || true
```

### 8. docs 文件存在

```
test -f docs/customers/current/import-dry-run-tooling.md
test -f docs/customers/current/import-dry-run-plan.md
test -f docs/customers/current/import-acceptance-checklist.md
test -f docs/product/current-customer-import-strategy.md
test -f docs/product/current-customer-import-risk-register.md
test -f docs/current-source-of-truth.md
test -f scripts/README.md
```

### 9. 禁止路径检查

```
git diff --name-only -- server web migrations config deployments || true
git diff --name-only -- 'server/**' 'web/**' 'migrations/**' 'config/**' 'deployments/**' || true
git diff --name-only -- web/src/erp/config/seedData.mjs web/src/erp/config/docs.mjs web/src/erp/config/businessModules.mjs web/src/erp/config/businessRecordDefinitions.mjs || true
git diff --name-only -- docs/product/business-records-reference-audit.md docs/product/business-records-transition-audit.md docs/product/business-records-cutover-plan.md docs/product/business-records-data-map-draft.md docs/product/business-records-risk-register.md || true
```

以上命令如果输出禁止路径，必须解释是否为非本轮现场；若是本轮造成，必须停止并修正到允许范围内。

### 10. tenant_id / ChangeUsecase 检查

```
grep -R "tenant_id" scripts/import docs/customers/current docs/product/current-customer-import-strategy.md docs/product/current-customer-import-risk-register.md docs/current-source-of-truth.md || true
grep -R "ChangeUsecase\|change_records" scripts/import docs/customers/current docs/product/current-customer-import-strategy.md docs/product/current-customer-import-risk-register.md docs/current-source-of-truth.md || true
```

---

## 不得运行的命令

本轮不得运行：

```
cd server && make data
cd server && make migrate_status
cd server && make migrate_apply
cd server && go test ./...
cd web && pnpm lint
cd web && pnpm test
cd web && pnpm style:l1
cd web && pnpm build
pnpm install
npm install
```

原因：

* 本轮不改 server/web。
* 本轮不需要新增依赖。
* 本轮不应触发 schema/migration/runtime 验证。
* 如果需要这些命令才能继续，说明本轮越界，应停止报告。

---

## .codex-review/latest.md 要求

最终必须生成：

```
.codex-review/latest.md
```

要求：

1. 只生成 latest。
2. 不生成 .codex-review/runs。
3. 不提交 .codex-review/。
4. 只描述 011。
5. 不把 010 docs-only 成果写成本轮成果。
6. 不把其他会话改动写成本轮成果。
7. 不输出后续候选 Goal 队列。
8. 必须遵守 docs/codex-goals/_review-output-protocol.md。

报告必须包含：

* Goal 文件：docs/codex-goals/011-current-customer-import-dry-run-tooling.md
* Goal 名称：011 current 客户导入 dry-run tooling 实现
* 任务类型：Implementation / Import dry-run tooling / CLI / Test / Docs sync
* 是否修改运行时代码：否，说明只改 scripts/import tooling，不改 server/web runtime
* 是否修改 Ent schema：否
* 是否修改 migration：否
* 是否修改 API：否
* 是否修改 UI：否
* 是否修改 docs registry：否
* 是否修改 seedData：否
* 新增/修改文件清单
* CLI 功能摘要
* 输出 dry-run package 文件清单
* 测试覆盖摘要
* 验收命令与结果
* 禁止路径检查
* tenant_id 检查
* Workflow / Fact 边界检查
* 风险
* 下一步建议，但不得自动进入下一 Goal

用户必须能执行：

```
cat .codex-review/latest.md | pbcopy
```

也能执行：

```
cat .codex-review/latest.md
```

---

## 最终回复格式

Codex 最终回复必须包含：

【完成】

【可运行产物】

【新增/修改文件】

【本轮改动范围】

【CLI 使用方式】

【dry-run 输出文件】

【测试覆盖】

【文档同步】

【明确没有做的内容】

【禁止路径检查】

【tenant_id 检查】

【Workflow / Fact 边界检查】

【测试命令与结果】

【Git 状态摘要】

【风险】

【下一步建议】

【.codex-review/latest.md 复制命令】

```
cat .codex-review/latest.md | pbcopy
```

【.codex-review/latest.md 查看命令】

```
cat .codex-review/latest.md
```

---

## 最重要边界提醒

本轮是实现型，但只能实现 import dry-run tooling。

不要把 dry-run tooling 误扩成真实 import loader。

不要写数据库。

不要写 V1 表。

不要写 business_records。

不要改 seedData。

不要改 docs registry。

不要改 schema。

不要改 API。

不要改 UI。

不要生成 shipment / inventory / finance facts。

不要把 shipping_released 当 shipped。

不要把 workflow task done 当 fact posted。

不要新增 tenant_id。

不要生成后续候选 Goal 队列。

成功标准是：CLI 能运行、能生成 dry-run package、测试通过、docs 同步、review 报告完整。
