# 保存路径

docs/codex-goals/012-current-source-snapshot-freeze-and-real-dry-run-evidence.md

---

# Codex 输入框短 Goal

目标：执行 docs/codex-goals/012-current-source-snapshot-freeze-and-real-dry-run-evidence.md。

请先阅读 AGENTS.md，然后严格执行该 Goal 文件。

本轮是 012 单 Goal：current source snapshot freeze + real dry-run evidence preparation。

本轮基于 011 已实现的 scripts/import/currentCustomerDryRun.mjs，新增 source snapshot freeze checker、sanitized freeze fixtures、freeze metadata、dry-run evidence package、人工 review checklist、测试、文档同步和 .codex-review/latest.md。

本轮禁止真实导入、写 DB、做 loader、改 schema/API/UI/seedData/docs registry、做 business_records cutover、生成 013/014 队列。

如果发现必须真实导入、写 DB、修改 schema/API/UI/seedData/business_records runtime 才能继续，立即停止并报告，不得越界补丁。

---

# Codex Goal 012: current Source Snapshot Freeze + Real Dry-run Evidence Preparation

## 任务名称

012：current source snapshot freeze + real dry-run evidence preparation

---

## 目标

基于 011 已落地的 current import dry-run tooling，完成 current 客户 source snapshot freeze 和 real dry-run evidence preparation。

本轮必须产出可运行、可复查、可重复生成的 evidence package，而不是继续形成方案。

本轮只做一个层级：

current source snapshot freeze + dry-run evidence preparation

本轮不做：

* 真实导入
* 写 DB
* import loader
* schema
* migration
* repo/usecase
* API/RBAC
* Web UI
* seedData
* docs registry
* business_records runtime cutover
* menu readonly cutover
* 013/014 队列

核心目标：

1. 新增 current source snapshot freeze checker CLI。
2. 新增 sanitized freeze fixtures。
3. 运行 freeze checker 生成 freeze metadata。
4. 运行 011 dry-run CLI 生成 evidence package。
5. 新增 source snapshot freeze 文档。
6. 新增 real dry-run evidence 文档。
7. 新增 manual review checklist。
8. 补充自动化测试。
9. 同步 current docs、product docs、scripts README、current-source-of-truth、progress.md。
10. 最终生成 .codex-review/latest.md。

本轮成功标准必须是可运行产物：

* freeze checker 可运行。
* freeze checker 测试通过。
* 011 dry-run CLI 回归测试通过。
* output/current-source-snapshot-freeze 能生成 freeze evidence。
* output/current-real-dry-run-evidence 能生成 dry-run evidence。
* docs 明确 012 仍不是真实导入批准。
* .codex-review/latest.md 只描述 012。

---

## 当前代码包确认

本轮开始时必须确认以下文件已存在：

* scripts/import/currentCustomerDryRun.mjs
* scripts/import/currentCustomerDryRun.test.mjs
* scripts/import/fixtures/current/source-snapshot.sample.json
* scripts/import/fixtures/current/existing-v1.sample.json
* scripts/import/fixtures/current/README.md
* docs/customers/current/import-dry-run-tooling.md
* docs/codex-goals/011-current-customer-import-dry-run-tooling.md

如果 011 CLI 不存在，立即停止并报告。

如果 011 CLI 测试不通过，优先判断是否是当前工作区噪音；不得直接扩大到 loader/schema/API/UI。

---

## 011 前置能力

011 已实现：

* current import dry-run CLI
* source snapshot JSON 输入
* existing V1/formal model snapshot JSON 输入
* dry-run package 输出
* unresolved queue
* duplicates
* conflicts
* forbidden-auto-import
* validation-summary
* dry-run-report.md
* node:test 测试
* fixture

011 CLI 输出：

* source-references.json
* normalized-rows.json
* candidates.json
* unresolved-queue.json
* duplicates.json
* conflicts.json
* forbidden-auto-import.json
* validation-summary.json
* dry-run-report.md

011 关键边界：

* 不读 DB。
* 不写 DB。
* 不执行真实导入。
* 不写 business_records。
* 不写正式表。
* 不改 schema。
* 不改 API。
* 不改 UI。
* 不改 seedData。
* 不改 docs registry。
* validation-summary.json 中 canExecuteRealImport 永远 false。
* product_skus / purchase_orders defer。
* shipment / inventory / finance forbidden。
* shipping_released != shipped。
* workflow task done != fact posted。

012 必须继承以上边界。

---

## 本轮任务性质

本轮属于：

* Implementation
* Evidence preparation
* Source snapshot freeze
* Freeze checker CLI
* Sanitized fixtures
* Dry-run evidence package generation
* Automated test
* Docs sync

本轮不是：

* Audit-only
* Planning-only
* Candidate-only
* Real import
* Loader implementation
* DB import
* DB export
* Schema implementation
* Migration
* Repo/usecase implementation
* API/RBAC implementation
* UI implementation
* seedData update
* docs registry update
* business_records runtime cutover
* menu readonly cutover
* 013/014 queue

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

### 011 tooling

* docs/codex-goals/011-current-customer-import-dry-run-tooling.md
* scripts/import/currentCustomerDryRun.mjs
* scripts/import/currentCustomerDryRun.test.mjs
* scripts/import/fixtures/current/source-snapshot.sample.json
* scripts/import/fixtures/current/existing-v1.sample.json
* scripts/import/fixtures/current/README.md
* docs/customers/current/import-dry-run-tooling.md

### 010 current import 草案

* docs/codex-goals/010-current-customer-data-import-draft.md
* docs/customers/current/import-source-inventory.md
* docs/customers/current/import-field-classification.md
* docs/customers/current/import-dry-run-plan.md
* docs/customers/current/import-unresolved-queue.md
* docs/customers/current/import-acceptance-checklist.md
* docs/product/current-customer-import-strategy.md
* docs/product/current-customer-import-risk-register.md

### 009 business_records 审计线索

* docs/product/business-records-reference-audit.md
* docs/product/business-records-transition-audit.md
* docs/product/business-records-cutover-plan.md
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-risk-register.md

### Product / Fact 边界

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

如果 .codex-review/latest.md 存在，可以读取作为上一轮线索；但最终必须覆盖生成只描述 012 的 latest.md。

---

## 当前真源

本轮以这些为准：

* AGENTS.md
* README.md
* docs/current-source-of-truth.md
* 011 dry-run CLI 实现和测试
* 011 fixtures
* 010 current import 七份草案
* 009 business_records data map / risk register
* V1 / Product 边界文档
* Workflow / Fact 边界文档

不得把以下内容升级为真源：

* seedData
* docs registry
* businessModules
* businessRecordDefinitions
* business_records runtime
* Excel / PDF / OCR 原始资料
* 历史聊天记忆
* 未确认截图
* 未冻结 source snapshot
* output 目录运行产物

---

## 允许修改的文件

本轮只允许修改：

* docs/codex-goals/012-current-source-snapshot-freeze-and-real-dry-run-evidence.md
* docs/customers/current/**
* docs/product/current-customer-import-strategy.md
* docs/product/current-customer-import-risk-register.md
* docs/current-source-of-truth.md
* scripts/import/currentSourceSnapshotFreezeCheck.mjs
* scripts/import/currentSourceSnapshotFreezeCheck.test.mjs
* scripts/import/fixtures/current/**
* scripts/README.md
* progress.md
* .codex-review/latest.md

原则：

* scripts/import/currentCustomerDryRun.mjs 原则上不改。
* scripts/import/currentCustomerDryRun.test.mjs 原则上不改。
* 如果 012 发现 011 CLI 有真实 bug，优先通过 freeze checker 或 012 测试暴露，不要扩大成 loader。
* 若必须修 011 CLI bug，必须只限 scripts/import/currentCustomerDryRun.mjs 和对应 test，并在 .codex-review/latest.md 中单独说明原因、diff、风险。
* output 目录允许作为本地运行产物生成，但不得纳入 git。
* .codex-review/latest.md 只在最终收口生成。

---

## 禁止修改的文件

本轮禁止修改：

* server/**
* web/**
* migrations/**
* config/**
* deployments/**
* web/src/erp/config/seedData.mjs
* web/src/erp/config/docs.mjs
* web/src/erp/config/businessModules.mjs
* web/src/erp/config/businessRecordDefinitions.mjs
* server/internal/data/model/schema/**
* server/internal/data/model/ent/**
* server/internal/biz/**
* server/internal/data/**
* server/internal/core/**
* server/openapi.yaml
* generated code
* docs/product/business-records-reference-audit.md
* docs/product/business-records-transition-audit.md
* docs/product/business-records-cutover-plan.md
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-risk-register.md

特别禁止：

* 不得真实导入。
* 不得写 DB。
* 不得从 DB 自动导出 existing snapshot。
* 不得做 import loader。
* 不得新增 migration。
* 不得修改 schema。
* 不得修改 repo/usecase。
* 不得修改 API/RBAC。
* 不得修改 Web UI。
* 不得修改 seedData。
* 不得修改 docs registry。
* 不得修改 business_records runtime。
* 不得做 business_records cutover。
* 不得生成 013/014 队列。
* 不得自动进入下一 Goal。
* 不得生成 shipment / inventory / finance facts。
* 不得新增 tenant_id。
* 不得新增 ChangeUsecase / change_records。
* 不得引入 npm 新依赖。
* 不得执行 npm install / pnpm install。

如果发现必须越界才能继续，立即停止并报告。

---

## 本轮必须新增的可运行产物

### 1. Freeze checker CLI

新增：

* scripts/import/currentSourceSnapshotFreezeCheck.mjs

必须支持：

```
node scripts/import/currentSourceSnapshotFreezeCheck.mjs --help
```

必须支持：

```
node scripts/import/currentSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-source-snapshot-freeze
```

参数：

| 参数         | 必填 | 说明                                        |
| ---------- | -: | ----------------------------------------- |
| --source   |  是 | source snapshot JSON 路径                   |
| --existing |  是 | existing V1/formal model snapshot JSON 路径 |
| --out      |  是 | freeze evidence 输出目录                      |
| --help     |  否 | 输出帮助                                      |

必须做到：

* 使用 Node.js 内置模块。
* 不引入依赖。
* 不读 DB。
* 不写 DB。
* 不读取 server config。
* 不调用 web runtime。
* 不执行真实导入。
* 不生成 SQL。
* 不生成 migration。
* 不修改 source/existing 输入文件。
* 只写 --out 目录。

必须输出：

* freeze-metadata.json
* freeze-check-summary.json
* freeze-check-report.md

### 2. Freeze checker 输出字段

freeze-metadata.json 至少包含：

* freezeId
* freezeDate
* sourcePath
* existingPath
* sourceSha256
* existingSha256
* sourceSizeBytes
* existingSizeBytes
* sourceCount
* domainCounts
* sourceKindCounts
* sourceTypeCounts
* cli
* noRealImport
* canExecuteRealImport
* generatedBy
* manualReviewRequired

要求：

* noRealImport 必须为 true。
* canExecuteRealImport 必须为 false。
* manualReviewRequired 必须为 true。

freeze-check-summary.json 至少包含：

* valid
* blockerCount
* warningCount
* sourceCount
* duplicateSourceIdCount
* invalidDomainCount
* invalidFieldsCount
* missingSourceReferenceCount
* sensitiveFieldCount
* forbiddenFieldCount
* deferredFieldCount
* shippingBoundaryRiskCount
* workflowFactBoundaryRiskCount
* blockers
* warnings

freeze-check-report.md 至少包含：

* 标题
* 运行命令
* source path
* existing path
* output path
* checksum 摘要
* source count
* domain counts
* blockers
* warnings
* sensitive field review
* forbidden field review
* deferred field review
* shipping_released != shipped
* workflow task done != fact posted
* no real import statement
* manual review next steps

---

## Freeze checker 校验规则

### Source root 校验

必须校验：

* source snapshot 是 object。
* version === 1。
* sources 是 array。
* generatedAt 存在。
* 每条 source 是 object。

### Source row 校验

每条 source 必须校验：

* sourceId 存在。
* sourceId 唯一。
* sourceType 存在。
* sourceKind 存在。
* moduleKey 存在。
* fileName 存在。
* domain 存在。
* domain 合法。
* fields 存在且是 object。
* source reference 可追溯。

source reference 可追溯最小条件：

* sourceId
* sourceKind
* moduleKey
* fileName
* domain

sheetName / rowNumber 可为空，但 freeze report 必须展示为空。

### Existing root 校验

必须校验：

* existing snapshot 是 object。
* version === 1。
* 常见数组字段如果存在，必须是 array。

常见数组字段包括：

* customers
* suppliers
* contacts
* salesOrders
* salesOrderItems
* products
* materials
* units
* warehouses
* bomHeaders
* bomItems

### 合法 domain

允许 domain：

* customers
* suppliers
* contacts
* sales_orders
* sales_order_items
* products
* materials
* units
* warehouses
* bom
* product_skus
* purchase_orders
* purchase_order_items
* outsourcing
* shipment
* shipments
* shipment_items
* stock_reservations
* inventory
* inventory_txns
* inventory_balances
* inventory_lots
* finance
* ar_ap
* invoice
* invoices
* payment
* payments
* finance_reconciliation

未知 domain 必须 blocker。

### 风险扫描规则

必须扫描字段名和值中的风险。

#### Sensitive review

疑似敏感字段名进入 warning：

* phone
* mobile
* tel
* email
* address
* contact
* 联系电话
* 手机
* 电话
* 邮箱
* 地址
* 联系人
* 身份证
* 银行
* 账号

注意：

* 只记录字段名、sourceReference 和风险类型。
* 不要在 report 中原样输出敏感值。
* JSON summary 中可以记录 sourceId/sourceReference、fieldName、riskType，但不要输出原始敏感值。

#### Forbidden facts

以下进入 blocker 或 warning，但不得自动修复：

* shipment
* shipped
* shipping_released
* stock_reservation
* inventory_txn
* inventory_balance
* inventory_lot
* invoice
* payment
* receivable
* payable
* reconciliation
* 已发货
* 已出库
* 库存流水
* 库存余额
* 发票
* 收款
* 付款
* 应收
* 应付
* 对账

#### Deferred fields

以下进入 warning/defer review：

* sku
* product_sku
* color
* size
* packing_version
* purchase_order
* 颜色
* 尺寸
* 包装版本
* 采购订单
* 采购单

#### Boundary rules

必须明确：

* shipping_released != shipped
* workflow task done != fact posted
* sales_order != shipment
* dry-run evidence != import approval

---

## Sanitized freeze fixtures

新增：

* scripts/import/fixtures/current/source-snapshot.freeze.sample.json
* scripts/import/fixtures/current/existing-v1.freeze.sample.json

更新：

* scripts/import/fixtures/current/README.md

fixture 要求：

* 必须是 synthetic / sanitized。
* 不包含真实客户敏感数据。
* 结构更接近 freeze 场景，不只是 011 最小测试 fixture。
* 至少覆盖：

  * customer update
  * customer create
  * supplier review
  * contact with owner
  * contact missing owner
  * sales_order candidate
  * sales_order_item candidate
  * sales_order_item unknown unit
  * product/material/unit/warehouse reference
  * BOM candidate/review
  * product_skus deferred
  * purchase_orders deferred
  * shipment forbidden
  * inventory forbidden
  * finance forbidden
  * shipping_released boundary
  * workflow fact boundary
  * duplicate sourceId negative fixture 可在 test 内动态生成，不一定落库
  * invalid domain negative fixture 可在 test 内动态生成，不一定落库
  * sensitive field warning

fixture 必须写明：

* 这些不是客户真实数据。
* 这些不是 import approval。
* 这些只用于 freeze checker 和 dry-run evidence preparation。

---

## Dry-run evidence output

本轮必须运行 011 CLI 生成：

* output/current-real-dry-run-evidence/

该目录不纳入 git。

必须生成 9 个文件：

* source-references.json
* normalized-rows.json
* candidates.json
* unresolved-queue.json
* duplicates.json
* conflicts.json
* forbidden-auto-import.json
* validation-summary.json
* dry-run-report.md

必须检查：

* validation-summary.json 中 canExecuteRealImport 是 false。
* dry-run-report.md 中包含 No real import 或等价说明。
* forbidden-auto-import.json 中保留 shipment/inventory/finance 边界证据。
* output 目录未纳入 git。

---

## Freeze evidence output

本轮必须运行 freeze checker 生成：

* output/current-source-snapshot-freeze/

该目录不纳入 git。

必须生成 3 个文件：

* freeze-metadata.json
* freeze-check-summary.json
* freeze-check-report.md

必须检查：

* freeze-metadata.json 中 canExecuteRealImport 是 false。
* freeze-metadata.json 中 noRealImport 是 true。
* freeze-check-summary.json 中包含 warning / blocker 统计。
* freeze-check-report.md 中写明 no real import。

---

## 文档产物

### 1. Source snapshot freeze 文档

新增：

* docs/customers/current/source-snapshot-freeze.md

必须包含：

* Freeze ID
* Freeze date
* Source snapshot file path
* Existing snapshot file path
* Freeze checker command
* 011 dry-run command
* SHA256 checksum 摘要
* Source count
* Domain count
* Source type count
* Known blockers
* Known warnings
* Sensitive field handling
* No real import statement
* Manual review required
* Output directory
* Re-run instructions
* Not committed output statement

### 2. Real dry-run evidence 文档

新增：

* docs/customers/current/real-dry-run-evidence.md

必须包含：

* Evidence package directory
* Input source snapshot
* Input existing snapshot
* Dry-run command
* Generated output files
* validation-summary 摘要
* candidates 摘要
* unresolved 摘要
* duplicates/conflicts 摘要
* forbidden-auto-import 摘要
* canExecuteRealImport=false
* no real import statement
* manual review next steps
* next allowed step
* next forbidden step

### 3. Manual review checklist

新增：

* docs/customers/current/source-snapshot-manual-review-checklist.md

必须覆盖：

* customers
* suppliers
* contacts
* sales_orders
* sales_order_items
* products/materials/units/warehouses
* BOM
* product_skus deferred
* purchase_orders deferred
* shipment forbidden
* inventory forbidden
* finance forbidden
* duplicate review
* conflict review
* unresolved block review
* missing source reference
* sensitive data review
* customer sign-off placeholder
* import-not-approved conclusion

### 4. 更新现有 docs

必须更新：

* docs/customers/current/import-dry-run-tooling.md
* docs/customers/current/import-dry-run-plan.md
* docs/customers/current/import-acceptance-checklist.md
* docs/product/current-customer-import-strategy.md
* docs/product/current-customer-import-risk-register.md
* docs/current-source-of-truth.md
* scripts/README.md
* progress.md

更新要求：

* 明确 012 已新增 freeze checker 和 evidence preparation。
* 明确 012 仍不是真实导入。
* 明确 012 不写 DB。
* 明确 012 不做 loader。
* 明确 output 是 evidence，不是 import approval。
* 明确真实 import loader 仍需单独 Goal，且必须另有备份、回滚、幂等、对账、客户确认。

---

## 测试要求

新增：

* scripts/import/currentSourceSnapshotFreezeCheck.test.mjs

使用：

* node:test
* node:assert/strict
* Node.js 内置模块

不得引入新依赖。

测试必须覆盖：

1. help 输出可运行。
2. 缺少 --source 返回非 0。
3. 缺少 --existing 返回非 0。
4. 缺少 --out 返回非 0。
5. valid freeze fixture 生成 3 个 freeze 输出。
6. freeze-metadata.json 包含 sha256、sourceCount、canExecuteRealImport=false。
7. freeze-check-summary.json 包含 warnings/blockers 统计。
8. duplicate sourceId 返回非 0 或 valid=false + blocker，二者择一但必须测试锁定。
9. invalid domain 返回非 0 或 valid=false + blocker，二者择一但必须测试锁定。
10. fields 非 object 返回非 0 或 valid=false + blocker，二者择一但必须测试锁定。
11. missing source reference 返回非 0 或 valid=false + blocker，二者择一但必须测试锁定。
12. forbidden field 被记录。
13. sensitive field 被记录但不输出原始敏感值。
14. shipping_released / shipped 混淆被记录。
15. workflow done / fact posted 风险被记录。
16. SHA256 对同一输入稳定。
17. 不依赖 DB / server / web。
18. 输出目录可重复生成。
19. output report 包含 no real import。

还必须回归运行：

* node --test scripts/import/currentCustomerDryRun.test.mjs

---

## Checkpoints

本轮是一个单 Goal，可以按 checkpoint 推进，但不得自动进入 013/014。

---

### Checkpoint 0：启动与边界确认

必须完成：

1. 读取必须先读文件。
2. 记录 git status。
3. 确认 011 CLI 存在。
4. 确认 011 test 存在。
5. 确认 012 只做 freeze + evidence preparation。
6. 确认本轮禁止真实导入、不写 DB、不做 loader。
7. 检查 progress.md 是否达到归档阈值。
8. 更新 progress.md。

验收标准：

* 已确认 011 CLI 可作为输入工具。
* 已确认不做真实导入。
* 已确认禁止路径。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 1：Freeze checker CLI 骨架

必须完成：

1. 新增 scripts/import/currentSourceSnapshotFreezeCheck.mjs。
2. 实现 --help。
3. 实现参数解析。
4. 实现输入文件存在性校验。
5. 实现 output 目录创建。
6. 实现 main / core function 分离，便于测试。
7. 更新 progress.md。

验收标准：

* node scripts/import/currentSourceSnapshotFreezeCheck.mjs --help 可运行。
* 缺 --source / --existing / --out 返回非 0。
* 不引入 npm 新依赖。
* 不调用 DB/server/web。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 2：Snapshot freeze 校验与 metadata

必须完成：

1. 读取 source snapshot。
2. 读取 existing snapshot。
3. 校验 version。
4. 校验 sources 数组。
5. 校验 sourceId 唯一。
6. 校验 source reference 可追溯。
7. 校验 domain 合法。
8. 校验 fields 是 object。
9. 校验 existing 常见数组字段。
10. 计算 source 和 existing SHA256。
11. 输出 freeze-metadata.json。
12. 输出 freeze-check-summary.json。
13. 输出 freeze-check-report.md。
14. 更新 progress.md。

验收标准：

* valid fixture 生成 3 个 freeze 输出。
* invalid fixture 有 blocker 或非 0 exit。
* checksum 稳定。
* metadata 不暗示真实导入批准。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 3：风险扫描规则

必须完成：

1. 扫描疑似敏感字段名。
2. 扫描 shipment / inventory / finance forbidden fields。
3. 扫描 product_skus / purchase_orders deferred fields。
4. 扫描 shipping_released / shipped 混淆。
5. 扫描 workflow done / fact posted 风险。
6. 输出 warnings / blockers。
7. report 不输出敏感原始值。
8. 更新 progress.md。

验收标准：

* 风险字段进入 freeze-check-summary。
* freeze-check-report.md 可读。
* report 不泄露敏感原始值。
* 不自动修复源数据。
* 不执行导入。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 4：Sanitized freeze fixtures 与测试

必须完成：

1. 新增 source-snapshot.freeze.sample.json。
2. 新增 existing-v1.freeze.sample.json。
3. 新增 currentSourceSnapshotFreezeCheck.test.mjs。
4. 覆盖测试要求。
5. 更新 fixtures README。
6. 运行 freeze checker 测试。
7. 更新 progress.md。

验收标准：

* node --test scripts/import/currentSourceSnapshotFreezeCheck.test.mjs 通过。
* fixture 不包含真实敏感数据。
* 测试不依赖 DB/server/web。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 5：执行 freeze evidence 和 dry-run evidence

必须完成：

1. 运行 freeze checker。
2. 生成 output/current-source-snapshot-freeze/。
3. 运行 011 dry-run CLI。
4. 生成 output/current-real-dry-run-evidence/。
5. 检查 freeze output 3 个文件存在。
6. 检查 dry-run output 9 个文件存在。
7. 检查 canExecuteRealImport=false。
8. 检查 output 未纳入 git。
9. 更新 progress.md。

验收标准：

* freeze output 存在。
* dry-run evidence output 存在。
* canExecuteRealImport 是 false。
* output 未纳入 git。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 6：文档同步

必须完成：

1. 新增 docs/customers/current/source-snapshot-freeze.md。
2. 新增 docs/customers/current/real-dry-run-evidence.md。
3. 新增 docs/customers/current/source-snapshot-manual-review-checklist.md。
4. 更新 docs/customers/current/import-dry-run-tooling.md。
5. 更新 docs/customers/current/import-dry-run-plan.md。
6. 更新 docs/customers/current/import-acceptance-checklist.md。
7. 更新 docs/product/current-customer-import-strategy.md。
8. 更新 docs/product/current-customer-import-risk-register.md。
9. 更新 docs/current-source-of-truth.md。
10. 更新 scripts/README.md。
11. 更新 progress.md。

验收标准：

* docs 明确 012 已完成 freeze + evidence preparation。
* docs 明确不是真实导入。
* docs 明确不写 DB。
* docs 明确不做 loader。
* docs 明确 output 是 evidence，不是 import approval。
* progress.md 已记录完成、下一步、风险。

---

### Checkpoint 7：完整验证与 .codex-review

必须完成：

1. 运行全部必跑验证命令。
2. 检查禁止路径。
3. 检查 output 未纳入 git。
4. 检查没有生成 013/014 队列。
5. 检查没有真实导入措辞。
6. 检查 .codex-review/latest.md 只描述 012。
7. 最终更新 progress.md。
8. 最终生成 .codex-review/latest.md。

验收标准：

* 必跑命令通过。
* 禁止路径无本轮 diff。
* .codex-review/latest.md 存在。
* .codex-review/latest.md 符合协议。
* 没有新增 013/014。
* 没有自动进入下一 Goal。
* progress.md 已记录完成、下一步、风险。

---

## 成功标准

本轮完成必须满足：

1. 新增 scripts/import/currentSourceSnapshotFreezeCheck.mjs。
2. 新增 scripts/import/currentSourceSnapshotFreezeCheck.test.mjs。
3. 新增 source-snapshot.freeze.sample.json。
4. 新增 existing-v1.freeze.sample.json。
5. 更新 fixtures README。
6. freeze checker --help 可运行。
7. freeze checker 缺参返回非 0。
8. freeze checker 可生成 freeze-metadata.json。
9. freeze checker 可生成 freeze-check-summary.json。
10. freeze checker 可生成 freeze-check-report.md。
11. freeze checker 能校验 sourceId 唯一。
12. freeze checker 能校验 domain。
13. freeze checker 能校验 fields object。
14. freeze checker 能计算 SHA256。
15. freeze checker 能扫描 sensitive fields。
16. freeze checker 能扫描 forbidden facts。
17. freeze checker 能扫描 deferred fields。
18. freeze checker 能扫描 shipping_released / shipped 边界。
19. freeze checker 能扫描 workflow done / fact posted 边界。
20. node --test scripts/import/currentSourceSnapshotFreezeCheck.test.mjs 通过。
21. node --test scripts/import/currentCustomerDryRun.test.mjs 通过。
22. 运行 freeze checker 生成 output/current-source-snapshot-freeze/。
23. 运行 011 dry-run CLI 生成 output/current-real-dry-run-evidence/。
24. dry-run evidence package 包含 9 个输出文件。
25. freeze evidence package 包含 3 个输出文件。
26. validation-summary.json 中 canExecuteRealImport 是 false。
27. freeze-metadata.json 中 canExecuteRealImport 是 false。
28. 新增 docs/customers/current/source-snapshot-freeze.md。
29. 新增 docs/customers/current/real-dry-run-evidence.md。
30. 新增 docs/customers/current/source-snapshot-manual-review-checklist.md。
31. 更新 import dry-run tooling / plan / acceptance docs。
32. 更新 product strategy / risk register。
33. 更新 docs/current-source-of-truth.md。
34. 更新 scripts/README.md。
35. 更新 progress.md。
36. 生成 .codex-review/latest.md。
37. 不真实导入。
38. 不写 DB。
39. 不做 loader。
40. 不改 schema。
41. 不改 migration。
42. 不改 API/RBAC。
43. 不改 UI。
44. 不改 seedData。
45. 不改 docs registry。
46. 不做 business_records cutover。
47. 不生成 shipment / inventory / finance facts。
48. 不新增 tenant_id。
49. 不生成 013/014 队列。
50. 不自动进入下一 Goal。

---

## 停止条件

出现以下情况必须立即停止并报告：

1. 必须真实导入才能继续。
2. 必须写 DB 才能继续。
3. 必须做 loader 才能继续。
4. 必须改 schema 才能继续。
5. 必须改 migration 才能继续。
6. 必须改 repo/usecase 才能继续。
7. 必须改 API/RBAC 才能继续。
8. 必须改 UI 才能继续。
9. 必须改 seedData 才能继续。
10. 必须改 docs registry 才能继续。
11. 必须做 business_records cutover 才能继续。
12. 必须生成 013/014 队列才能继续。
13. 必须从 DB 自动导出 existing snapshot 才能继续。
14. 必须读取真实客户敏感原文才能继续。
15. 必须引入 npm 新依赖才能继续。
16. 必须生成 shipment/inventory/finance facts 才能继续。
17. 必须新增 tenant_id 才能继续。
18. 必须创建 ChangeUsecase/change_records 才能继续。
19. 测试必须修改 server/web/schema/API/UI 才能通过。
20. 011 CLI 缺失且无法在允许范围内继续。
21. 工作区存在非本轮冲突且无法隔离。

停止时必须输出：

```
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认：

* 不提交。
* 不推送。
* 不 stage。
* 不执行 git add .
* 不 stash。
* 不回退非本轮改动。
* 不删除非本轮文件。
* 不格式化非本轮文件。
* output 目录不纳入 git。
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

| 测试层级                | 本轮选择 | 原因                             | 命令                                                                   |
| ------------------- | ---: | ------------------------------ | -------------------------------------------------------------------- |
| freeze checker 单测   |    是 | 本轮新增 freeze checker CLI        | node --test scripts/import/currentSourceSnapshotFreezeCheck.test.mjs |
| 011 dry-run CLI 回归  |    是 | 012 依赖 011 dry-run 输出 evidence | node --test scripts/import/currentCustomerDryRun.test.mjs            |
| freeze checker 冒烟   |    是 | 必须证明 freeze output 可生成         | node scripts/import/currentSourceSnapshotFreezeCheck.mjs ...         |
| dry-run evidence 冒烟 |    是 | 必须证明 evidence package 可生成      | node scripts/import/currentCustomerDryRun.mjs ...                    |
| docs 检查             |    是 | 本轮同步 docs                      | test -f / grep                                                       |
| 禁止路径检查              |    是 | 防止越界                           | git diff --name-only -- server web ...                               |
| web lint/test       |    否 | 本轮不改 web                       | 不运行                                                                  |
| server go test      |    否 | 本轮不改 server                    | 不运行                                                                  |
| migration 检查        |    否 | 本轮不改 schema/migration          | 不运行                                                                  |
| E2E / style:l1      |    否 | 本轮不改 UI                        | 不运行                                                                  |

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

### 2. 011 CLI 存在

```
test -f scripts/import/currentCustomerDryRun.mjs
test -f scripts/import/currentCustomerDryRun.test.mjs
test -f scripts/import/fixtures/current/source-snapshot.sample.json
test -f scripts/import/fixtures/current/existing-v1.sample.json
```

### 3. 012 freeze checker help

```
node scripts/import/currentSourceSnapshotFreezeCheck.mjs --help
```

### 4. 012 freeze checker smoke

```
rm -rf output/current-source-snapshot-freeze
node scripts/import/currentSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-source-snapshot-freeze
```

### 5. freeze output existence

```
test -f output/current-source-snapshot-freeze/freeze-metadata.json
test -f output/current-source-snapshot-freeze/freeze-check-summary.json
test -f output/current-source-snapshot-freeze/freeze-check-report.md
```

### 6. 012 tests

```
node --test scripts/import/currentSourceSnapshotFreezeCheck.test.mjs
```

### 7. 011 tests regression

```
node --test scripts/import/currentCustomerDryRun.test.mjs
```

### 8. real dry-run evidence smoke

```
rm -rf output/current-real-dry-run-evidence
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-real-dry-run-evidence \
  --format json,md
```

### 9. real dry-run evidence output existence

```
test -f output/current-real-dry-run-evidence/source-references.json
test -f output/current-real-dry-run-evidence/normalized-rows.json
test -f output/current-real-dry-run-evidence/candidates.json
test -f output/current-real-dry-run-evidence/unresolved-queue.json
test -f output/current-real-dry-run-evidence/duplicates.json
test -f output/current-real-dry-run-evidence/conflicts.json
test -f output/current-real-dry-run-evidence/forbidden-auto-import.json
test -f output/current-real-dry-run-evidence/validation-summary.json
test -f output/current-real-dry-run-evidence/dry-run-report.md
```

### 10. no real import check

```
grep -R "\"canExecuteRealImport\": false" output/current-real-dry-run-evidence/validation-summary.json
grep -R "\"canExecuteRealImport\": false" output/current-source-snapshot-freeze/freeze-metadata.json
grep -R "\"noRealImport\": true" output/current-source-snapshot-freeze/freeze-metadata.json
grep -R "No real import\|no real import\|不执行真实导入\|不是真实导入" docs/customers/current/real-dry-run-evidence.md docs/customers/current/source-snapshot-freeze.md docs/customers/current/source-snapshot-manual-review-checklist.md || true
```

### 11. forbidden boundary check

```
grep -R "shipping_released" output/current-real-dry-run-evidence output/current-source-snapshot-freeze docs/customers/current docs/product/current-customer-import-risk-register.md || true
grep -R "workflow task done\|fact posted\|Workflow task done\|Fact posted" output/current-real-dry-run-evidence output/current-source-snapshot-freeze docs/customers/current docs/product/current-customer-import-risk-register.md || true
grep -R "inventory_txn\|inventory_balance\|invoice\|payment\|stock_reservation" output/current-real-dry-run-evidence/forbidden-auto-import.json output/current-source-snapshot-freeze/freeze-check-summary.json || true
```

### 12. docs existence

```
test -f docs/customers/current/source-snapshot-freeze.md
test -f docs/customers/current/real-dry-run-evidence.md
test -f docs/customers/current/source-snapshot-manual-review-checklist.md
test -f docs/customers/current/import-dry-run-tooling.md
test -f docs/customers/current/import-dry-run-plan.md
test -f docs/customers/current/import-acceptance-checklist.md
test -f docs/product/current-customer-import-strategy.md
test -f docs/product/current-customer-import-risk-register.md
test -f docs/current-source-of-truth.md
test -f scripts/README.md
```

### 13. 禁止路径检查

```
git diff --name-only -- server web migrations config deployments || true
git diff --name-only -- 'server/**' 'web/**' 'migrations/**' 'config/**' 'deployments/**' || true
git diff --name-only -- web/src/erp/config/seedData.mjs web/src/erp/config/docs.mjs web/src/erp/config/businessModules.mjs web/src/erp/config/businessRecordDefinitions.mjs || true
git diff --name-only -- docs/product/business-records-reference-audit.md docs/product/business-records-transition-audit.md docs/product/business-records-cutover-plan.md docs/product/business-records-data-map-draft.md docs/product/business-records-risk-register.md || true
```

如果这些命令输出禁止路径，必须解释是否是非本轮现场；如果是本轮造成，必须停止并修正。

### 14. 确认没有生成 013/014 队列

```
find docs/codex-goals -maxdepth 1 -type f \( -name '013-*' -o -name '014-*' \) -print || true
grep -R "自动进入 013\|自动进入 014\|执行 013\|执行 014\|013/014 队列" docs/codex-goals docs/customers/current docs/product/current-customer-import-strategy.md || true
```

### 15. output 未纳入 git

```
git status --short output || true
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

* .codex-review/latest.md

要求：

1. 只生成 latest。
2. 不生成 .codex-review/runs。
3. 不提交 .codex-review/。
4. 只描述 012。
5. 不把 011 成果写成本轮成果。
6. 不把其他会话改动写成本轮成果。
7. 不输出 013/014 候选队列。
8. 必须遵守 docs/codex-goals/_review-output-protocol.md。

报告必须包含：

* Goal 文件：docs/codex-goals/012-current-source-snapshot-freeze-and-real-dry-run-evidence.md
* Goal 名称：012 current source snapshot freeze + real dry-run evidence preparation
* 任务类型：Implementation / Evidence preparation / Source snapshot freeze / Dry-run evidence
* 是否真实导入：否
* 是否写 DB：否
* 是否做 loader：否
* 是否修改 Ent schema：否
* 是否修改 migration：否
* 是否修改 API：否
* 是否修改 UI：否
* 是否修改 docs registry：否
* 是否修改 seedData：否
* 是否做 business_records cutover：否
* 新增/修改文件清单
* Freeze checker 功能摘要
* Freeze metadata 摘要
* Dry-run evidence 输出清单
* Manual review checklist 摘要
* 测试覆盖摘要
* 验收命令与结果
* 禁止路径检查
* output 未纳入 git 检查
* tenant_id 检查
* Workflow / Fact 边界检查
* 风险
* 下一步建议，但不得自动进入 013/014

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

【012 可运行产物】

【新增/修改文件】

【本轮改动范围】

【Freeze checker 使用方式】

【Freeze output 文件】

【Dry-run evidence output 文件】

【Manual review checklist】

【文档同步】

【明确没有做的内容】

【禁止路径检查】

【output 未纳入 git 检查】

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

本轮是 012 单 Goal，只做：

* current source snapshot freeze。
* real dry-run evidence preparation。
* freeze checker。
* sanitized freeze fixtures。
* 运行 011 CLI 生成 evidence。
* manual review checklist。
* docs sync。
* tests。
* .codex-review/latest.md。

本轮不做：

* 真实导入。
* 写 DB。
* loader。
* schema。
* migration。
* repo/usecase。
* API/RBAC。
* UI。
* seedData。
* docs registry。
* business_records cutover。
* 013/014 队列。
* shipment/inventory/finance facts。
* tenant_id。
* ChangeUsecase/change_records。

成功标准是可运行 evidence preparation，而不是形成方案。
