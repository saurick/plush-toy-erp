# Codex Goal 006: V1 Repo / Usecase for Sales Orders

## 任务名称

006：V1 Sales Order repo / usecase：`sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
Runtime / Repo-Usecase
```

本轮只允许实现 V1 Sales Order Source Document 的后端 repo / biz usecase 和测试：

```text
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
```

本轮不接 API。
本轮不接 RBAC。
本轮不接 UI。
本轮不改 docs registry。
本轮不改 seedData。
本轮不做 business_records transition。
本轮不做 shipment facts。
本轮不做 inventory facts。
本轮不做 finance facts。

必须明确：

```text
本轮是否改 runtime：是，仅限 sales_orders / sales_order_items repo/usecase
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：是，仅限 sales_orders / sales_order_items
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

004 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

005 已完成：

```text
customers / suppliers / contacts repo/usecase
contacts owner_type + owner_id guard
contacts primary contact 策略
```

006 的目标：

```text
只实现 sales_orders / sales_order_items 的 repo + biz usecase + tests。
```

006 不处理：

```text
API
RBAC
UI
数据导入
business_records 迁移
seedData
docs registry
shipment facts
stock reservations
inventory facts
finance facts
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

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

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

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### Sales Order schema / generated code

```text
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
server/internal/data/model/ent/salesorder.go
server/internal/data/model/ent/salesorderitem.go
server/internal/data/model/migrate/20260530161152_migrate.sql
```

### MasterData repo/usecase

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go
```

### 现有 repo / usecase 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz
server/internal/data
server/internal/data/*repo*
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/inventory.go
server/internal/biz/quality_inspection.go
server/internal/data/inventory*
server/internal/data/purchase*
server/internal/data/quality*
server/internal/data/model/ent
```

如果路径不同，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
server/internal/data/model/ent
server/internal/data/model/migrate/20260530161152_migrate.sql
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
现有 repo/usecase 代码风格
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

### biz usecase

按现有项目风格选择文件名。

允许新增类似：

```text
server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
```

或如现有风格更适合，也可以新增：

```text
server/internal/biz/order.go
server/internal/biz/order_test.go
```

但必须在 review 中说明选择原因。

### data repo

允许新增类似：

```text
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

或如现有风格更适合，也可以新增：

```text
server/internal/data/order_repo.go
server/internal/data/order_repo_test.go
```

但必须遵守现有 repo 风格。

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 rbac.go。
本轮不得改 API/UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Runtime / Repo-Usecase
```

但仅限：

```text
sales_orders / sales_order_items
```

不得扩大到：

```text
customers / suppliers / contacts runtime 之外的新改动
API / RBAC / UI / seed / docs registry
```

禁止把下面内容放进同一轮：

```text
sales order usecase + API/RBAC + UI
sales order usecase + shipment facts
sales order usecase + inventory facts
sales order usecase + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 实现 sales_orders repo / usecase。
- 实现 sales_order_items repo / usecase。
- 支持创建 sales order。
- 支持更新 sales order 基础信息。
- 支持获取 sales order。
- 支持列表查询 sales orders。
- 支持取消 / 关闭 sales order 或项目现有 Source Document 标准动作。
- 支持新增 / 更新 / 删除或取消 sales order items，按项目风格确定。
- 创建 sales order 必须校验 customer_id 存在。
- 创建 sales order item 必须校验 product_id 存在。
- 如 schema 包含 unit_id，必须校验 unit_id 存在。
- sales_order 生命周期状态必须用 canonical key。
- sales_order lifecycle 不能直接变成 shipped。
- 不允许新增 shipped_quantity。
- 不允许写 shipments。
- 不允许写 inventory_txns。
- 不允许写 stock_reservations。
- 不允许写 AR/AP/invoice/payment。
- 不允许从 sales_order usecase 触发 Workflow。
- 不允许 current 客户样本字段进入 Product Core。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不接 API/RBAC。
- 不接 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不接 business_records transition。
- 测试覆盖 sales order source document 核心路径和状态 guard。
- .codex-review/latest.md 已生成。
```

不能只写“usecase 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go 或 rbac.go。
- 需要接 API/RBAC/UI。
- 需要改 seedData 或 docs registry。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要处理 business_records 迁移。
- sales order usecase 无法保持 Source Document 边界。
- product_id / customer_id / unit_id 存在性 guard 无法实现。
- 现有测试环境无法验证 data repo 或 biz usecase。
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

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 业务动作范围

本轮仅实现 Sales Order Source Document。

允许动作按现有项目风格确定，推荐最小集合：

### sales_orders

```text
CreateSalesOrder
UpdateSalesOrder
GetSalesOrder
ListSalesOrders
CancelSalesOrder
CloseSalesOrder
```

### sales_order_items

```text
AddSalesOrderItem
UpdateSalesOrderItem
RemoveSalesOrderItem
ListSalesOrderItems
```

如果现有项目采用不同命名，遵守现有风格。

---

## sales_order 生命周期规则

sales_order 是 Source Document，不是 shipment fact。

允许状态应来自 schema 和 Phase 2 cutline。

推荐 canonical lifecycle status：

```text
draft
submitted
active
closed
canceled
```

如果 schema 里实际状态不同，以 schema 为准，并在 review 中说明。

必须保证：

```text
不允许 sales order usecase 直接设置 shipped。
不允许 sales order usecase 生成 shipped。
不允许 sales order usecase 写 shipment / inventory / finance fact。
```

允许：

```text
draft -> submitted
submitted -> active
active -> closed
draft/submitted/active -> canceled
```

如果本轮只实现更小状态集，也可以，但必须测试状态 guard。

---

## customer / product / unit guard

### customer guard

创建 sales order 时：

```text
customer_id 必须存在。
customer 必须 active，如现有项目有 active 规则。
```

如果客户不存在，必须返回明确业务错误。

### product guard

创建 sales order item 时：

```text
product_id 必须存在。
product 必须 active，如现有项目有 active 规则。
```

如果产品不存在，必须返回明确业务错误。

### unit guard

如果 sales_order_items schema 有 `unit_id`：

```text
unit_id 必须存在。
unit 必须 active，如现有项目有 active 规则。
```

如果 schema 没有 `unit_id`，不要新增字段，不要改 schema。

---

## order item 规则

sales_order_item 是承诺明细，不是出货事实。

必须保持：

```text
ordered quantity 是订单承诺数量。
unit price / amount 是订单明细金额。
product snapshots 是历史展示 / 对账辅助。
```

不得新增或写入：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
```

如果 schema 已没有这些字段，不得新增。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

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

不得出现在：

```text
repo
usecase
tests
schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改 repo/usecase/tests/docs，需要检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
本轮新增 sales order usecase 和 guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

如存在更窄 sales order test，按真实结构补充。

### 集成测试

选择：有限选择。

原因：

```text
data repo 可能需要 SQLite enttest 验证 repo / DB 约束。
```

命令：

```bash
cd server && go test ./internal/data
```

如果测试需要目标库 migration apply，而当前 DB pending，必须说明，不得擅自 apply migration，除非本轮明确允许。

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、API、UI 或部署。
```

### 回归测试

选择：是。

原因：

```text
新增 repo/usecase 不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

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
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/data/model docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

如果新增了更窄 package 或 test 文件，也运行对应测试。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非测试要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 sales order repo/usecase has been added.
Sales order remains Source Document and does not write shipment / inventory / finance facts.
API/RBAC, UI, seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
006 V1 sales order repo/usecase completed.
No API / RBAC / UI / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
007-v1-api-rbac-masterdata-order
```

但不得把 007 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
006 sales order repo/usecase added
```

但不得把 API/UI 写成完成。

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

【Sales Order repo/usecase 清单】

【Sales Order lifecycle 策略】

【customer/product/unit guard 实现】

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
repo/usecase 文件清单
sales order lifecycle 策略解释
customer/product/unit guard 解释
sales_order / shipment fact 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
