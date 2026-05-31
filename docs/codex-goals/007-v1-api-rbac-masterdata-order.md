# Codex Goal 007: V1 API / RBAC for MasterData and Sales Order

## 任务名称

007：V1 API / RBAC：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
API-RBAC
```

本轮只允许给已经完成 repo/usecase 的 V1 能力接 API/RBAC：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 / 006 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
006: sales_orders / sales_order_items Source Document repo/usecase added.
```

本轮不接 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 business_records transition。  
本轮不做 data import。  
本轮不做 shipment facts。  
本轮不做 stock reservations。  
本轮不做 inventory facts。  
本轮不做 finance facts。  

必须明确：

```text
本轮是否改 runtime：是，仅限 API/RBAC 接入
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：是
本轮是否改 RBAC：是
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：原则上否，除非 API 接入暴露必要的小 bug 修复
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

006 已完成：

```text
sales_orders / sales_order_items repo/usecase
sales order lifecycle: draft / submitted / active / closed / canceled
sales order item status: open / closed / canceled
customer / product / unit guard
```

007 的目标：

```text
只给 V1 MasterData 和 Sales Order 接 API/RBAC。
```

007 不处理：

```text
UI
移动端页面
数据导入
business_records 迁移
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

### 003 / 004 / 005 / 006 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005/006 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

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

### 已实现 repo/usecase

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go

server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

### 现有 API / RBAC 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz/rbac.go
server/internal/service
server/internal/server
server/internal/conf
server/api
server/internal/data
server/internal/biz
```

如果 API 入口不是这些路径，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

必须查找现有 JSON-RPC / HTTP / service 注册方式，例如：

```bash
grep -R "jsonrpc\|JSON-RPC\|Register\|rpc" server/internal server/api -n | head -80
```

也可以用 `rg`，以本地可用命令为准。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
server/internal/biz/rbac.go
现有 API / service / server 注册代码
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

### API / service

按现有项目风格选择文件。

允许修改或新增类似：

```text
server/internal/service/*
server/internal/server/*
server/api/*
```

但仅限 V1 customers / suppliers / contacts / sales_orders / sales_order_items API 接入。

如果仓库使用 JSON-RPC registry，允许修改对应 registry 文件。

如果仓库使用 HTTP handlers，允许新增对应 handler / route。

如果仓库使用 Kratos service，允许新增对应 service 方法。

Codex 必须遵守现有风格，不引入新 API 框架。

### RBAC

允许修改：

```text
server/internal/biz/rbac.go
```

仅限新增 V1 API 所需权限码、菜单/动作权限映射或角色权限种子。

不得重构整个 RBAC。

不得改 RBAC 为多租户模型。

### API tests

允许新增或修改与本轮 API/RBAC 直接相关的测试。

路径按现有项目风格确定，例如：

```text
server/internal/service/*_test.go
server/internal/server/*_test.go
server/internal/biz/rbac_test.go
```

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

原则上禁止修改 repo/usecase：

```text
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
```

如果 API 接入暴露出 repo/usecase 的必要小 bug，允许最小修复，但必须在 review 中单独说明：

```text
修复原因：
涉及方法：
为什么不能留到后续：
是否改变业务边界：
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
API-RBAC
```

仅限：

```text
customers / suppliers / contacts / sales_orders / sales_order_items
```

不得扩大到：

```text
UI
seedData
docs registry
business_records migration
shipment/inventory/finance facts
```

禁止把下面内容放进同一轮：

```text
API/RBAC + UI
API/RBAC + seedData
API/RBAC + business_records transition
API/RBAC + shipment facts
API/RBAC + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 为 customers 提供 API 接入。
- 为 suppliers 提供 API 接入。
- 为 contacts 提供 API 接入。
- 为 sales_orders 提供 API 接入。
- 为 sales_order_items 提供 API 接入。
- API 调用必须走已实现 usecase，不得绕过 usecase 直接写 Ent。
- API 层不得复制业务状态机。
- API 层不得复制 contacts owner guard。
- API 层不得复制 sales order lifecycle 规则。
- RBAC 必须新增或复用清晰权限码。
- 后端必须校验动作权限，不能只靠前端隐藏菜单。
- 必须覆盖无权限或未登录 / 非管理员 / disabled admin / no permission 的至少核心路径测试，按现有项目 auth 测试能力执行。
- customers / suppliers / contacts API 不得写订单、库存、出货、财务事实。
- sales_order API 不得写 shipments、stock_reservations、inventory_txns、AR/AP、invoice、payment。
- sales_order API 不得允许 lifecycle 直接进入 shipped。
- 不新增 shipped_quantity。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不接 business_records transition。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“API 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 找不到现有 API 注册方式，且无法确认项目约定。
- 需要引入新 API 框架。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go。
- 需要接 UI。
- 需要改 seedData 或 docs registry。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要处理 business_records 迁移。
- API 无法走 usecase，只能直接写 Ent。
- RBAC 无法后端校验权限。
- 测试环境无法验证 API/RBAC 核心路径。
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

## API 范围

本轮 API 范围只包括 V1 后端能力。

### Customers API

必须支持或按项目风格等价支持：

```text
createCustomer
updateCustomer
getCustomer
listCustomers
setCustomerActive
```

### Suppliers API

必须支持或按项目风格等价支持：

```text
createSupplier
updateSupplier
getSupplier
listSuppliers
setSupplierActive
```

### Contacts API

必须支持或按项目风格等价支持：

```text
createContact
updateContact
getContact
listContactsByOwner
setPrimaryContact
disableContact
```

Contacts API 必须走 usecase guard。

不得在 API 层绕过：

```text
owner_type 合法性
owner_id 存在性
primary contact 策略
```

### Sales Orders API

必须支持或按项目风格等价支持：

```text
createSalesOrder
updateSalesOrder
getSalesOrder
listSalesOrders
submitSalesOrder
activateSalesOrder
closeSalesOrder
cancelSalesOrder
```

### Sales Order Items API

必须支持或按项目风格等价支持：

```text
addSalesOrderItem
updateSalesOrderItem
removeSalesOrderItem
listSalesOrderItems
```

Sales Order Items API 必须走 usecase guard。

不得在 API 层绕过：

```text
customer_id active guard
product_id active guard
unit_id active guard
lifecycle status guard
line status guard
```

---

## RBAC 范围

本轮只允许新增或复用权限码。

建议权限粒度：

```text
customer.view
customer.create
customer.update
customer.disable

supplier.view
supplier.create
supplier.update
supplier.disable

contact.view
contact.create
contact.update
contact.disable
contact.set_primary

sales_order.view
sales_order.create
sales_order.update
sales_order.submit
sales_order.activate
sales_order.close
sales_order.cancel

sales_order_item.view
sales_order_item.create
sales_order_item.update
sales_order_item.cancel
```

如果现有项目权限码命名不同，必须遵守现有风格，并在 review 中列出映射。

必须明确：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 API 必须校验动作权限。
```

不得做：

```text
tenant-scoped RBAC
SaaS tenant role model
客户可自由定义核心权限点
```

---

## Auth / Permission 测试要求

必须按现有项目能力覆盖核心路径。

优先覆盖：

```text
unauthenticated request
disabled admin
non-admin or not operator
admin without permission
admin with permission
```

如果现有测试框架没有这些 helper，必须说明限制，并至少覆盖权限函数 / handler guard 的可测部分。

不得因为测试困难就移除权限检查。

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

## Sales Order / Shipment 边界

Sales Order API 不得支持：

```text
markAsShipped
shipSalesOrder
reserveStock
deductInventory
generateInvoice
generateReceivable
receivePayment
```

Sales Order API 只允许推进 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

`closed` 不等于 `shipped`。

如果需要未来出货，应后续单独做：

```text
ShipmentUsecase
stock_reservations
inventory outbound facts
```

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
API
RBAC
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
本轮改 API/RBAC/tests/docs，需要检查 diff、格式、禁止字段和边界词。
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
本轮新增 API/RBAC guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

以及 API / service 所在 package 的测试。

### 集成测试

选择：有限选择。

原因：

```text
API/RBAC 可能涉及 handler/service + auth/permission 链路。
```

命令按真实 package 选择。

### 冒烟测试

选择：否。

原因：

```text
本轮不改部署和前端入口。
```

### 回归测试

选择：是。

原因：

```text
API/RBAC 接入不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或完整用户路径。
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
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

还必须运行 API / service / server 相关测试。Codex 必须先识别真实 package 后运行，例如：

```bash
cd server && go test ./internal/service ./internal/server
```

如果 package 不存在，以真实结构为准，并在报告中说明。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非任务要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 API/RBAC for customers / suppliers / contacts / sales_orders / sales_order_items has been added.
UI, seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
007 V1 API/RBAC for MasterData and Sales Order completed.
No UI / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
008-v1-frontend-masterdata-order-pages
```

但不得把 008 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
007 API/RBAC added
```

但不得把 UI 写成完成。

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

【API 接入清单】

【RBAC 权限清单】

【权限校验策略】

【Auth / Permission 测试覆盖】

【Sales Order / Shipment 边界】

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
API 文件清单
RBAC 权限清单
auth/permission 测试说明
sales order / shipment fact 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```