# Codex Goal 010: current Customer Data Import Draft

## 任务名称

010：current 客户数据导入 dry-run / 字段分类 / unresolved queue 草案

---

## 任务性质

本轮属于：

Audit / Docs-only / Import Design Draft

本轮只允许做导入方案、字段分类、dry-run 设计、unresolved queue 设计和后续执行计划。

本轮不改 runtime。
本轮不改 Ent schema。
本轮不新增 migration。
本轮不改 generated code。
本轮不改 repo/usecase。
本轮不改 API/RBAC。
本轮不改 UI。
本轮不改 docs registry。
本轮不改 seedData。
本轮不写 import/backfill 代码。
本轮不执行真实数据迁移。
本轮不删除或修改 business_records。

必须明确：

* 本轮是否改 runtime：否
* 本轮是否改 Ent schema：否
* 本轮是否新增 migration：否
* 本轮是否改 API：否
* 本轮是否改 RBAC：否
* 本轮是否改 UI：否
* 本轮是否改 docs registry：否
* 本轮是否改 seedData：否
* 本轮是否改 repo/usecase：否
* 本轮是否做真实数据迁移：否
* 本轮是否写 import/backfill 代码：否

---

## 背景

003 已新增 V1 Ent schema：

* customers
* suppliers
* contacts
* sales_orders
* sales_order_items

004 已完成：

* Ent generated code
* Atlas migration

005 已完成：

* customers / suppliers / contacts repo/usecase
* contacts owner_type + owner_id guard
* contacts primary contact 策略

006 已完成：

* sales_orders / sales_order_items repo/usecase
* sales order lifecycle: draft / submitted / active / closed / canceled
* sales order item status: open / closed / canceled
* customer / product / unit guard

007 已完成：

* customers / suppliers / contacts JSON-RPC API
* sales_orders / sales_order_items JSON-RPC API
* V1 API/RBAC 权限码和测试

008 已完成：

* V1 customers / suppliers / contacts 前端页面
* V1 sales_orders / sales_order_items 前端页面
* V1 前端 API client
* V1 路由
* 前端测试、mocked route render、style:l1

009 已完成：

* business_records 引用审计
* business_records 与 V1 正式模型重叠矩阵
* business_records cutover plan
* business_records data map draft
* business_records risk register

009 结论：

* business_records 继续保留。
* business_records 不删除、不迁移、不双写。
* partners / products / project-orders 是最高优先级重叠入口。
* data map 只能进入 dry-run / import draft，不自动写正式数据。
* product_skus、采购订单、出货、库存预留和财务事实继续 draft-only / deferred，不从旧快照自动生成。

010 的目标：

基于 current 客户资料、seed/demo/source snapshot、business_records audit 和 V1 正式模型，设计 current 客户数据导入 dry-run 方案。

010 不处理：

* 真实导入
* 真实 backfill
* 修改 seedData
* 修改 docs registry
* 修改 business_records
* 修改 V1 页面
* 修改 API/RBAC
* 修改 repo/usecase
* 修改 schema/migration
* 自动生成 shipment / inventory / finance facts

---

## 必须先读

### 项目规则

* AGENTS.md
* README.md
* docs/current-source-of-truth.md
* progress.md

### GPT / Codex 上下文

* docs/codex-goals/_gpt-context-summary.md
* docs/codex-goals/README.md
* docs/codex-goals/_new-session-goal-template.md
* docs/codex-goals/_goal-file-template.md
* docs/codex-goals/_review-output-protocol.md

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 / 008 / 009 Goal 与审查结果

* docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
* docs/codex-goals/004-v1-migration-and-ent-generate.md
* docs/codex-goals/005-v1-repo-usecase-masterdata.md
* docs/codex-goals/006-v1-repo-usecase-sales-order.md
* docs/codex-goals/007-v1-api-rbac-masterdata-order.md
* docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
* docs/codex-goals/009-business-records-transition-audit.md
* .codex-review/latest.md

如果 .codex-review/latest.md 不存在，请继续，但必须从 003 到 009 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

* docs/product/zero-to-one-architecture.md

* docs/product/product-principles.md

* docs/product/domain-model-v1.md

* docs/product/module-boundaries.md

* docs/product/config-permission-policy.md

* docs/product/customer-instance-policy.md

* docs/product/customer-delta-policy.md

* docs/product/rewrite-roadmap.md

* docs/product/release-gates.md

* docs/product/test-strategy.md

* docs/architecture/status-workflow-fact-boundary.md

* docs/architecture/masterdata-order-source-document-review.md

* docs/architecture/customer-supplier-masterdata-review.md

* docs/architecture/product-sku-bom-boundary-review.md

* docs/architecture/order-purchase-boundary-review.md

* docs/product/domain-schema-draft-v1-v2.md

* docs/product/migration-readiness-checklist.md

* docs/product/phase1-implementation-plan.md

* docs/product/phase1-risk-register.md

* docs/product/schema-design-final-review.md

* docs/product/v1-entity-decision-record.md

* docs/product/v1-implementation-cutline.md

* docs/product/v1-schema-go-no-go.md

* docs/product/business-records-transition-plan.md

* docs/product/v1-next-codex-goals.md

### 009 business_records 审计文档

* docs/product/business-records-reference-audit.md
* docs/product/business-records-transition-audit.md
* docs/product/business-records-cutover-plan.md
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-risk-register.md

### current 客户资料

* docs/customers/current/README.md
* docs/customers/current/source-materials.md
* docs/customers/current/requirement-clues.md
* docs/customers/current/assumption-register.md
* docs/customers/current/question-backlog.md
* docs/customers/current/decision-log.md
* docs/customers/current/customer-config-draft.md
* docs/customers/current/delta-register.md
* docs/customers/current/change-request-process.md

### current 资料和 seed 相关文件

Codex 必须搜索真实仓库，不要猜路径。

至少检查：

* docs/customers/current/*
* web/src/erp/config/seedData.mjs
* web/src/erp/config/businessModules.mjs
* web/src/erp/config/businessRecordDefinitions.mjs
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-reference-audit.md

建议命令：

```
grep -R "current\|客户\|供应商\|订单\|产品\|材料\|仓库\|Excel\|PDF\|加工合同\|seed\|demo" docs/customers web/src/erp/config docs/product -n || true
```

如果本地有 rg，可用 rg。

如果某些文件不存在，请记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

* AGENTS.md
* docs/current-source-of-truth.md
* docs/product/business-records-data-map-draft.md
* docs/product/business-records-transition-audit.md
* docs/product/business-records-cutover-plan.md
* docs/product/v1-implementation-cutline.md
* docs/product/v1-schema-go-no-go.md
* docs/customers/current/source-materials.md
* docs/customers/current/requirement-clues.md
* docs/customers/current/customer-config-draft.md
* docs/customers/current/delta-register.md
* V1 正式 schema / API / UI 已完成状态

### 只能作为线索

* web/src/erp/config/seedData.mjs
* docs/customers/current/*
* current 客户 Excel / PDF / 图片样本
* business_records 历史快照
* imported notes
* 历史 changes 文档

### 禁止作为当前实现真源

* 历史聊天记忆
* 未确认截图 / 口头描述
* demo / seed 数据
* current 客户样本字段
* 未落地 schema draft
* business_records 历史记录

必须保持：

* 代码 / schema / migration / tests 是实现真源。
* current-source-of-truth 是当前状态入口。
* customer material 不是 Product Core。
* seed/demo/source snapshot 只能作为导入线索。
* business_records 是兼容层，不是正式事实真源。
* import draft 不是实际迁移。

---

## 允许修改的文件

本轮允许新增：

* docs/customers/current/import-source-inventory.md
* docs/customers/current/import-field-classification.md
* docs/customers/current/import-dry-run-plan.md
* docs/customers/current/import-unresolved-queue.md
* docs/customers/current/import-acceptance-checklist.md
* docs/product/current-customer-import-strategy.md
* docs/product/current-customer-import-risk-register.md

允许小幅更新：

* docs/current-source-of-truth.md
* docs/customers/current/README.md
* docs/customers/current/source-materials.md
* docs/customers/current/delta-register.md
* docs/product/v1-next-codex-goals.md
* docs/product/v1-schema-go-no-go.md
* progress.md

允许生成或覆盖：

* .codex-review/latest.md

---

## 禁止修改的文件

本轮禁止修改：

* server/internal/biz/*
* server/internal/data/*
* server/internal/data/model/schema/*
* server/internal/data/model/migrate/*
* server/internal/data/model/ent/*
* server/internal/core/*
* web/src/erp/config/docs.mjs
* web/src/erp/config/seedData.mjs
* web/src/erp/config/businessModules.mjs
* web/src/erp/config/businessRecordDefinitions.mjs
* web/src/erp/router.jsx
* web/src/erp/pages/*
* web/src/erp/api/*
* web/src/erp/utils/*
* web/src/erp/mobile/*
* server/deploy
* scripts
* docs/codex-goals/_new-session-goal-template.md
* docs/codex-goals/_goal-file-template.md
* docs/codex-goals/_review-output-protocol.md

特别说明：

* 本轮不得写 import loader。
* 本轮不得写 backfill 脚本。
* 本轮不得修改 seedData。
* 本轮不得修改 business_records。
* 本轮不得修改 V1 页面。
* 本轮不得修改 API/RBAC。
* 本轮不得执行真实迁移。
* 本轮不得做双写。
* 本轮不得删除旧入口。

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

Audit / Docs-only / Import Design Draft

不得扩大到：

* runtime
* schema
* migration
* generated code
* repo/usecase
* API/RBAC
* UI
* seedData
* docs registry
* data migration
* import/backfill code

禁止把下面内容放进同一轮：

* import draft + 写 import loader
* import draft + seedData 改造
* import draft + business_records 修改
* import draft + V1 UI 改造
* import draft + API 双写
* import draft + 数据迁移
* import draft + 自动生成出货 / 库存 / 财务事实

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

* 输出 current 客户导入来源清单。
* 输出 current 客户字段分类表。
* 输出 current 客户导入 dry-run plan。
* 输出 unresolved queue 设计。
* 输出 import acceptance checklist。
* 输出 Product 层 current customer import strategy。
* 输出 import risk register。
* 明确哪些字段可以自动进入 V1 正式模型。
* 明确哪些字段只能进入 Customer Material / Demo Seed / Industry Template Candidate。
* 明确哪些字段必须人工确认。
* 明确哪些字段不能自动迁移。
* 明确哪些内容不得生成 shipment / inventory / finance facts。
* 明确哪些内容必须等待 product_skus / purchase_orders / shipments / finance 后续模型。
* 不改 runtime。
* 不改 schema/migration。
* 不改 seedData。
* 不改 business_records。
* 不做真实数据迁移。
* 不写 import/backfill 代码。
* 不新增 tenant_id。
* 不新增 ChangeUsecase/change_records。
* .codex-review/latest.md 已生成。

不能只写“已完成导入草案”。

---

## 停止条件

出现以下情况必须停止并报告：

* 任务文件与 AGENTS.md 或当前代码真源冲突。
* 需要修改禁止路径。
* 需要改 seedData。
* 需要改 business_records。
* 需要写 import/backfill 代码。
* 需要做真实数据迁移。
* 需要改 V1 页面。
* 需要改 API/RBAC。
* 需要新增 schema/migration。
* 需要新增 tenant_id。
* 需要实现 SaaS 多租户。
* 需要自动生成 shipments。
* 需要自动生成 stock_reservations。
* 需要自动生成 inventory_txns。
* 需要自动生成 AR/AP/invoice/payment。
* 无法区分 demo/seed/source snapshot 与正式事实。
* 无法确认字段来源。
* 需要删除、回退、整理或 stash 非本轮改动。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

默认规则：

* 本轮默认不提交、不推送。
* 不允许执行 git add .
* 不允许自动 commit。
* 不允许自动 push。
* 不允许回退、整理或 stash 非本轮改动。
* 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须先运行并记录：

```
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

* tracked diff
* untracked files
* 本轮新增文件
* 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 输出文档要求

### 1. import-source-inventory.md

路径：

* docs/customers/current/import-source-inventory.md

必须列出 current 客户所有可作为导入来源的资料。

至少包括：

* docs/customers/current/source-materials.md 中列出的资料
* web/src/erp/config/seedData.mjs 中的 seed/demo/source snapshot
* business_records 相关旧数据或旧入口
* current 客户 Excel / PDF / 图片样本
* 加工合同样本
* 材料表 / 订单表 / 辅材包材表 / 生产订单表等线索
* V1 页面当前可承载的数据

每项必须写：

* source
* type
* owner
* business domain
* can import?
* import target
* confidence
* needs manual review?
* notes

分类建议：

* Customer Material
* Demo Seed
* Source Snapshot
* Print Template Input
* Industry Template Candidate
* Data Import Source
* QA Debug
* Do Not Import

### 2. import-field-classification.md

路径：

* docs/customers/current/import-field-classification.md

必须按业务域分类字段：

* customers
* suppliers
* contacts
* sales_orders
* sales_order_items
* products
* materials
* warehouses
* BOM
* purchase
* outsourcing
* shipment
* inventory
* finance

每个字段必须标记：

* source field
* meaning
* target model
* target field
* classification
* auto import?
* manual review?
* forbidden?
* reason

classification 必须使用：

* Product Core
* Industry Template Candidate
* Customer Config
* Customer Material
* Demo Seed
* Data Import Source
* Print Template Input
* Deferred
* Forbidden Auto Import

必须明确：

* current 客户样本字段不能自动变成 Product Core 必填字段。
* product_skus 仍 draft-only，不得自动创建。
* purchase_orders 仍 draft-only / V2 candidate，不得自动创建。
* shipments / stock_reservations / finance facts 仍 deferred，不得自动创建。
* 没有事实依据不得生成库存、出货、财务记录。

### 3. import-dry-run-plan.md

路径：

* docs/customers/current/import-dry-run-plan.md

必须设计 dry-run 流程，不写代码。

dry-run 阶段至少包括：

Stage 0: Source collection

* 收集来源文件、seed、business_records 快照。
* 只读扫描，不写数据库。

Stage 1: Parse and normalize

* 解析字段。
* 标准化客户、供应商、产品、材料、订单字段。
* 记录无法识别字段。

Stage 2: Match existing V1 data

* 匹配 customers。
* 匹配 suppliers。
* 匹配 contacts。
* 匹配 sales_orders。
* 匹配 sales_order_items。
* 匹配 existing products / materials / warehouses / units。

Stage 3: Generate preview

* 生成可导入预览。
* 生成 skipped rows。
* 生成 unresolved queue。
* 生成 duplicate candidates。
* 生成 conflict candidates。

Stage 4: Manual review

* 人工确认客户 / 供应商 / 产品 / 订单映射。
* 人工确认不能自动判断的字段。

Stage 5: Approval before import

* 审批导入结果。
* 明确本阶段仍不写数据库。

Stage 6: Future import execution

* 只有后续单独 Goal 才能写 import loader。
* 必须有备份、回滚、校验。
* 必须禁止双写。

必须明确：

当前 010 不执行 Stage 6。

### 4. import-unresolved-queue.md

路径：

* docs/customers/current/import-unresolved-queue.md

必须设计 unresolved queue。

必须包含 unresolved 类型：

* unknown customer
* unknown supplier
* unknown product
* unknown material
* unknown unit
* unknown warehouse
* ambiguous customer/supplier
* duplicate code
* duplicate name
* missing required field
* invalid date
* invalid quantity
* invalid money
* unmapped field
* deferred domain
* forbidden fact generation
* needs manual review

每类必须写：

* meaning
* example
* owner role
* resolution options
* can auto resolve?
* must block import?
* notes

必须明确：

* 涉及 shipment / inventory / finance facts 的 unresolved 必须 block。
* 涉及 product_skus / purchase_orders 的 unresolved 必须 deferred。
* 涉及 current 客户特殊字段的 unresolved 不得自动进 Product Core。

### 5. import-acceptance-checklist.md

路径：

* docs/customers/current/import-acceptance-checklist.md

必须输出导入验收清单。

至少包含：

* source files confirmed
* field classification reviewed
* target model confirmed
* required fields present
* duplicate rules reviewed
* unresolved queue empty or approved
* no forbidden facts generated
* no tenant_id introduced
* no shipment facts generated
* no inventory facts generated
* no finance facts generated
* no product_skus generated unless future review approves
* no purchase_orders generated unless future review approves
* business_records not deleted
* seedData not modified
* V1 data preview reviewed
* rollback plan prepared
* backup plan prepared
* customer sign-off

### 6. current-customer-import-strategy.md

路径：

* docs/product/current-customer-import-strategy.md

必须从 Product 层总结 current 客户导入策略：

* current 是种子客户。
* current 资料是 Customer Material / Data Import Source。
* current 资料不直接成为 Product Core。
* 导入必须先 dry-run。
* 导入必须先分类字段。
* 导入必须先 unresolved queue。
* 导入必须先人工确认。
* 导入不得自动生成 deferred facts。
* 导入不得绕过 V1 usecase。
* 后续真实 import loader 必须单独 Goal。
* 后续真实 import 必须有备份、回滚、校验。

### 7. current-customer-import-risk-register.md

路径：

* docs/product/current-customer-import-risk-register.md

必须列风险：

* current 客户字段污染 Product Core。
* Excel 字段语义不清。
* 同名客户 / 供应商 / 产品重复。
* 产品与 product_skus 混淆。
* 订单样本误当 sales_orders 正式数据。
* 业务快照误当事实。
* business_records 与 V1 双真源。
* seedData 被误当正式数据。
* 自动生成出货 / 库存 / 财务事实。
* migration / import 无回滚。
* 导入后客户不认可。
* 未确认字段被自动丢弃。
* 未确认字段被错误写入 note。
* 时间、数量、金额格式错误。
* 单位映射错误。
* 仓库映射错误。

每项写：

* risk
* impact
* evidence
* mitigation
* owner layer
* next review needed

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

* Workflow task done != Fact posted。
* shipping_released != shipped。
* shipment_release done -> shipping_released。
* sales_order 是 Source Document。
* shipment 才是未来出货事实。
* inventory_txns 才是库存落账事实。

不得建议从 current 资料或 business_records 自动生成：

* shipments
* stock_reservations
* inventory_txns
* AR/AP
* invoice
* payment

---

## Sales Order / Shipment 边界

import draft 不得建议：

* markAsShipped
* shipSalesOrder
* reserveStock
* deductInventory
* generateInvoice
* generateReceivable
* receivePayment

不得建议从 Excel / PDF / business_records 自动生成：

* shipments
* stock_reservations
* inventory_txns
* AR/AP
* invoice
* payment

---

## tenant_id 规则

本轮禁止新增 tenant_id。

如果 grep 命中 tenant_id，必须解释是否只来自：

* imported notes
* 禁止说明
* future SaaS 评审候选说明
* current 不是 runtime tenant 说明

不得进入：

* schema
* runtime
* migration
* import target
* data mapping target
* unresolved queue target

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

本轮改文档，需要检查 diff、格式、边界词和禁止项。

命令：

```
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：否。

原因：

本轮 docs-only，不改代码。

### 集成测试

选择：否。

原因：

本轮 docs-only，不改 API/repo/usecase/DB。

### 冒烟测试

选择：否。

原因：

本轮不改运行入口或前端页面。

### 回归测试

选择：有限选择。

原因：

如果只改 docs/customers 和 docs/product，不需要跑前后端全量；如果误改 web/docs registry，则必须停止。

### E2E 测试

选择：否。

原因：

本轮不改 UI 或用户路径。

### 视觉 / 样式回归

选择：否。

原因：

本轮不改 UI / 样式。

---

## 验收命令

必须运行：

```
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行来源检查命令：

```
grep -R "Excel\|PDF\|加工合同\|材料\|订单\|供应商\|客户\|仓库\|seed\|demo\|business_records\|businessRecords\|BusinessRecord" docs/customers web/src/erp/config docs/product -n || true
```

必须运行边界检查：

```
grep -R "tenant_id" docs/customers docs/product docs/architecture docs/reference config deployments || true
grep -R "shipping_released" docs/customers docs/product docs/architecture docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" docs/customers docs/product docs/architecture || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" docs/customers docs/product docs/architecture || true
grep -R "ChangeUsecase\|change_records" docs/customers docs/product docs/architecture || true
```

不得运行：

```
cd server && make data
cd server && make migrate_status
```

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告。

不得运行后端测试，除非本轮意外改了后端文件；如果改了后端文件，必须停止并报告。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

current customer import dry-run draft has been added.
No runtime, API, UI, seedData, docs registry, migration, schema, import/backfill, or real data migration has been implemented.

### docs/customers/current/README.md

可以增加链接到：

* import-source-inventory.md
* import-field-classification.md
* import-dry-run-plan.md
* import-unresolved-queue.md
* import-acceptance-checklist.md

但不得写成真实导入已完成。

### progress.md

记录本轮：

010 current customer import dry-run draft completed.
No runtime / schema / migration / API / UI / seedData / docs registry / import/backfill changes.

如果本轮中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

* V1 menu entry review
* current customer import loader design
* true import dry-run tooling

但不得把下一轮写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

010 current customer import dry-run draft added

但不得把 real import / migration / loader 写成完成。

---

## 项目长期禁止项

必须遵守：

* 不新增 tenant_id。
* 不实现 SaaS 多租户。
* 不实现 license server、套餐计费、客户工单系统。
* 不创建泛化 ChangeUsecase。
* 不创建泛化 change_records。
* 不把 current 客户资料写成 Product Core。
* 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
* shipping_released != shipped。
* workflow task done != fact posted。
* business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

---

## 审查报告要求

本轮完成后必须生成：

.codex-review/latest.md

审查报告必须遵守：

docs/codex-goals/_review-output-protocol.md

用户必须能用下面命令复制：

```
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

【完成】

【新增/修改文件】

【本轮改动范围】

【current 导入来源清单摘要】

【字段分类摘要】

【dry-run plan 摘要】

【unresolved queue 摘要】

【acceptance checklist 摘要】

【明确没有做的内容】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】

```
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

.codex-review/latest.md 必须包含：

* git status --short
* git diff --stat
* git ls-files --others --exclude-standard
* current 导入来源清单摘要
* 字段分类摘要
* dry-run plan 摘要
* unresolved queue 摘要
* acceptance checklist 摘要
* tenant_id grep 解释
* shipping_released grep 解释
* forbidden action grep 解释
* 禁止路径检查
* 测试层级选择
* 测试命令和结果
* 下一轮建议

```
```
