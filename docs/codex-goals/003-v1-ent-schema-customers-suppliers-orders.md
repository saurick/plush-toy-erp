# Codex Goal 003: V1 Ent Schema for Customers / Suppliers / Contacts / Sales Orders

## 任务名称

003：V1 Ent schema：`customers / suppliers / contacts / sales_orders / sales_order_items`

## 任务性质

本轮属于：

```text
Schema-only
```

本轮只允许新增或修改 V1 cutline 明确允许的 Ent schema 文件。

必须明确：

```text
本轮是否改 runtime：否
本轮是否改 Ent schema：是
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
```

本轮目标是创建 V1 源单据和主数据的 schema 起点，不生成 migration，不生成 Ent 代码，不接业务逻辑。

---

## 背景

Phase 0 已完成产品化架构、状态分层、配置权限、current 客户实例边界和目录骨架。

Phase 1 已完成主数据、订单源单据、BOM、采购前置模型评审。

Phase 2 已完成 schema final review 和 V1 implementation cutline。

Phase 2 结论：

```text
V1 Go:
- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

Draft Only:
- product_skus
- customer_addresses
- supplier_material_profiles
- settlement_terms
- order_revisions
- BOM version extension
- purchase_orders
- purchase_order_items
- purchase_demands

Deferred:
- stock_reservations
- shipments
- shipment_items
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts
```

本轮只落 V1 Go 表的 Ent schema。

本轮不处理：

```text
repo
usecase
API
RBAC
UI
数据导入
business_records 迁移
migration
Ent generate
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### Codex 工作流

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果其中某些模板文件不存在，记录缺失，不要自行大范围补模板。

### Phase 0 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md
```

### Phase 1 文档

```text
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
```

### Phase 2 文档

```text
docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### current 客户资料

```text
docs/customers/current/README.md
docs/customers/current/source-materials.md
docs/customers/current/requirement-clues.md
docs/customers/current/assumption-register.md
docs/customers/current/question-backlog.md
docs/customers/current/decision-log.md
docs/customers/current/customer-config-draft.md
docs/customers/current/delta-register.md
docs/customers/current/change-request-process.md
```

### 后端现状

```text
server/internal/data/model/schema
server/internal/data/model/schema/product.go
server/internal/data/model/schema/material.go
server/internal/data/model/schema/unit.go
server/internal/data/model/schema/warehouse.go
server/internal/data/model/schema/business_record.go
server/internal/data/model/schema/bom_header.go
server/internal/data/model/schema/bom_item.go
server/internal/data/model/schema/purchase_receipt.go
server/internal/data/model/schema/purchase_return.go
server/internal/data/model/schema/purchase_receipt_adjustment.go
server/internal/data/model/schema/quality_inspection.go
server/internal/data/model/schema/inventory_txn.go
server/internal/data/model/schema/inventory_balance.go
server/internal/data/model/schema/inventory_lot.go
```

如果文件名与实际仓库不一致，Codex 必须先 `ls server/internal/data/model/schema` 并按真实文件名阅读。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/domain-schema-draft-v1-v2.md
server/internal/data/model/schema
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

允许小幅更新：

```text
docs/current-source-of-truth.md
progress.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/v1-next-codex-goals.md
```

允许生成或覆盖：

```text
.codex-review/latest.md
```

如果当前仓库协议仍要求历史副本，可按协议生成；但本轮不要修改协议本身。

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

特别说明：

```text
server/internal/data/model/schema 允许按本轮清单新增 schema 文件。
server/internal/data/model 其他生成代码禁止修改。
server/internal/data 业务 repo/usecase 禁止修改。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Schema-only
```

不得扩大范围。

禁止把下面内容放进同一轮：

```text
Ent schema + migration + generated code + repo/usecase + API + UI
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 只新增或修改 V1 cutline 允许的 Ent schema 文件。
- 新增 schema 文件命名和风格与现有 Ent schema 保持一致。
- 不新增 tenant_id。
- 不新增 SaaS runtime tenant 相关字段或表。
- 不新增 product_skus。
- 不新增 purchase_orders。
- 不新增 shipments。
- 不新增 stock_reservations。
- 不新增 AR/AP/invoice/payment/reconciliation。
- 不新增 migration。
- 不运行 make data 生成 Ent 代码。
- 不改 repo/usecase。
- 不改 API/RBAC。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- contacts 建模方式必须在文档或 schema 注释中说明约束与后续 guard。
- sales_orders / sales_order_items 必须明确是 Source Document，不是 shipment fact。
- shipped_quantity 不得作为人工事实字段伪造出货；如确需字段，必须标明为 derived/cache，并说明真实来源是 future shipment facts。
- .codex-review/latest.md 已生成。
```

不能只写“schema 已完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要运行 make data 生成 Ent 代码。
- 需要修改 server/internal/data 业务逻辑。
- 需要修改 workflow.go 或 rbac.go。
- 发现 customers/suppliers/orders 与已有 schema 重复但无法解释边界。
- contacts 建模无法表达 customer/supplier 归属。
- sales_order_item 无法安全关联现有 products。
- Workflow / Fact 边界无法保持。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## Ent schema 设计要求

### 通用要求

所有新 schema 必须：

```text
- 遵守现有 server/internal/data/model/schema 的命名、field、edge、mixin、index 风格。
- 使用现有项目的 created_at / updated_at / status / remark 风格。
- 状态字段使用稳定 canonical key，不使用中文文案。
- 不出现 tenant_id。
- 不引用 current 客户专属字段作为必填 Product Core 字段。
- 不添加库存、出货、财务事实字段。
```

如果现有 schema 有 mixin 或公共字段约定，必须复用。

如果现有 schema 没有统一 mixin，按现有文件风格实现，不自行引入新架构。

---

## Entity: customers

### 分类

```text
MasterData
```

### 目的

记录客户主数据，用于销售订单、未来出货、未来应收、未来发票和对账。

### 推荐字段

Codex 必须先阅读 Phase 2 cutline 和现有 schema，再决定最终字段。

V1 推荐最小字段：

```text
code
name
short_name
status
remark
created_at
updated_at
```

可选字段，如 Phase 2 文档明确允许才加入：

```text
invoice_title
tax_no
phone
address
```

建议延后字段：

```text
settlement_terms
credit_limit
payment_terms
customer_addresses
finance-specific fields
```

### 关系

V1 应支持：

```text
customer -> sales_orders
```

如果 Ent edge 风格允许，添加与 `sales_orders` 的边。

不得添加：

```text
tenant_id
AR/AP direct facts
shipment facts
```

---

## Entity: suppliers

### 分类

```text
MasterData
```

### 目的

记录供应商主数据，用于未来采购订单、采购入库、采购退货、采购对账、委外加工。

### 推荐字段

V1 推荐最小字段：

```text
code
name
short_name
supplier_type
status
remark
created_at
updated_at
```

`supplier_type` 建议使用稳定 key，例如：

```text
material
outsourcing
service
mixed
```

如果 Phase 2 文档判断 V1 不应加入 `supplier_type`，可以延后，但必须在审查报告中说明。

建议延后字段：

```text
settlement_terms
tax_no
invoice_title
bank_account
supplier_material_profiles
finance-specific fields
```

### 关系

V1 应支持：

```text
supplier -> contacts
```

未来才支持：

```text
supplier -> purchase_orders
supplier -> purchase_receipts
supplier -> purchase_returns
supplier -> AP
```

不得添加采购事实替代字段。

---

## Entity: contacts

### 分类

```text
MasterData
```

### 目的

记录客户或供应商联系人。

### 建模决策要求

本轮必须明确选择一种 contacts 归属方式：

#### 方案 A：owner_type + owner_id

```text
owner_type
owner_id
```

优点：

```text
字段少，支持 customer / supplier 统一联系人。
```

风险：

```text
数据库层缺少强外键。
必须在后续 usecase guard 中校验 owner 是否存在。
```

#### 方案 B：customer_id / supplier_id 双 nullable edge

```text
customer_id
supplier_id
```

优点：

```text
数据库关系更清楚。
```

风险：

```text
需要约束二选一。
如果 Ent/DB 无法加 check，需要后续 usecase guard。
```

Codex 必须基于现有 Ent 风格选择一种方案，并在 `.codex-review/latest.md` 说明：

```text
选择了哪种方案：
为什么：
DB 层能否约束：
后续 usecase 需要什么 guard：
```

### 推荐字段

```text
name
phone
role
is_primary
status
remark
created_at
updated_at
```

可选：

```text
email
wechat
```

如果这些只来自 current 样本，不要作为必填字段。

---

## Entity: sales_orders

### 分类

```text
Source Document / Business Commitment
```

### 目的

记录客户销售订单和业务承诺。

它不是出货事实。

### 推荐字段

V1 推荐字段：

```text
order_no
customer_id
customer_order_no
order_date
planned_delivery_date
status
approval_status
release_status
fulfillment_status
remark
created_at
updated_at
```

状态字段必须使用 canonical key。

推荐状态口径：

```text
status: draft / submitted / active / closed / canceled
approval_status: not_required / pending / approved / blocked
release_status: not_released / shipping_released / blocked
fulfillment_status: not_shipped / partial_shipped / fully_shipped
```

注意：

```text
fulfillment_status 是派生 / 缓存状态。
真实出货必须由 future shipments / shipment_items / inventory_txns 支撑。
```

不建议 V1 加入：

```text
invoice_status
payment_status
settlement_status
```

如果 Phase 2 cutline 已明确允许，可以作为 deferred/cache 字段记录；否则延后到 finance review。

不得加入：

```text
tenant_id
shipped fact fields
finance fact fields
```

### 关系

应关联：

```text
sales_order -> customer
sales_order -> sales_order_items
```

不得关联 future shipments 为已实现事实。

---

## Entity: sales_order_items

### 分类

```text
Source Document Line / Business Commitment Line
```

### 目的

记录销售订单行。

它不是出货事实。

### 推荐字段

V1 推荐字段：

```text
sales_order_id
product_id
product_code_snapshot
product_name_snapshot
color_snapshot
ordered_qty
unit_price
planned_delivery_date
status
remark
created_at
updated_at
```

字段说明：

```text
product_id 应关联现有 products。
product_code_snapshot / product_name_snapshot 用于历史快照。
color_snapshot 仅作为订单行快照或行业线索，不得因此新增 product_skus。
ordered_qty 记录订单承诺数量。
```

不建议 V1 加入：

```text
shipped_quantity
```

如果必须加入，必须明确：

```text
shipped_quantity 只能是 derived/cache。
真实来源必须是 future shipment facts。
不能人工维护成事实。
```

不得加入：

```text
tenant_id
inventory_txn_id
shipment_id
AR/AP fields
```

---

## 不允许新增的 schema

本轮不得新增：

```text
product_skus
purchase_orders
purchase_order_items
purchase_demands
supplier_material_profiles
customer_addresses
settlement_terms
order_revisions
stock_reservations
shipments
shipment_items
AR
AP
invoices
payments
reconciliations
change_records
tenant tables
license tables
billing tables
ticket tables
```

---

## business_records 边界

本轮不得改 `business_records`。

必须在文档或 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮 schema 不能让 Workflow 直接写 Fact。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在新 schema 字段中。

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮新增 Go schema 文件和文档，必须检查 diff、格式和语法风险。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
```

### 单元测试

选择：是。

原因：

```text
新增 Ent schema Go 文件，至少要编译 schema package。
```

命令：

```bash
cd server && go test ./internal/data/model/schema
```

如果该 package 不存在或命令不适用，Codex 必须报告并选择最接近的 schema 编译检查命令，不得乱改生成代码。

### 集成测试

选择：否。

原因：

```text
本轮不生成 migration，不接 repo/usecase，不访问 DB。
```

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、部署、API 或 UI。
```

### 回归测试

选择：有限选择。

原因：

```text
本轮不改 runtime，但新 schema 文件不应破坏现有 biz/data 编译。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

如果因为未生成 Ent 代码导致失败，必须判断是否与本轮 schema-only 分阶段策略有关，不得擅自运行 make data。

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
grep -R "tenant_id" server/internal/data/model/schema docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非任务中止并明确说明为什么下一轮需要。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 Ent schema files for customers / suppliers / contacts / sales_orders / sales_order_items have been added.
Runtime generated code, migration, repo/usecase, API and UI are not implemented yet.
Current runtime truth remains existing code and migrations.
```

### progress.md

记录本轮：

```text
003 V1 Ent schema cutline files added.
No migration / generate / repo / usecase / API / UI changes.
```

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
004-v1-migration-and-ent-generate
```

但不得把 004 写成已完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【V1 Ent schema 新增清单】

【contacts 建模方案】

【sales_order / shipment fact 边界】

【business_records 边界】

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
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
新增 schema 文件清单
contacts 建模解释
tenant_id grep 解释
shipping_released grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```