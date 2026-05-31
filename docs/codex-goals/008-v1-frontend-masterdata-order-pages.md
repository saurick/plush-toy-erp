# Codex Goal 008: V1 Frontend Pages for MasterData and Sales Order

## 任务名称

008：V1 Frontend pages：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
UI
```

本轮只允许给已经完成后端 API/RBAC 的 V1 能力接前端页面：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 / 006 / 007 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
006: sales_orders / sales_order_items Source Document repo/usecase added.
007: customers / suppliers / contacts / sales_orders / sales_order_items JSON-RPC API/RBAC added.
```

本轮只做 UI 页面接入。

本轮不改 schema。  
本轮不改 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
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
本轮是否改 runtime：是，仅限前端 UI
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 RBAC：否
本轮是否改 UI：是
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
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

007 已完成：

```text
customers / suppliers / contacts JSON-RPC API
sales_orders / sales_order_items JSON-RPC API
customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.* RBAC 权限码
API/RBAC tests
```

008 的目标：

```text
只给 V1 MasterData 和 Sales Order 接前端页面。
```

008 不处理：

```text
schema
migration
generated code
repo/usecase
API/RBAC
docs registry
seedData
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

### 003 / 004 / 005 / 006 / 007 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005/006/007 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

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

### 已实现后端 API/RBAC

```text
server/internal/data/jsonrpc_masterdata_order.go
server/internal/data/jsonrpc_masterdata_order_test.go
server/internal/data/jsonrpc.go
server/internal/biz/rbac.go
```

### 现有前端结构

Codex 必须先查看真实仓库结构和现有实现风格，再写 UI。

至少检查：

```text
web/src/erp
web/src/erp/pages
web/src/erp/config
web/src/erp/components
web/src/erp/modules
web/src/erp/mobile
web/src/erp/docs
web/package.json
```

必须查找现有 API 调用方式、页面路由、菜单配置、权限判断方式，例如：

```bash
grep -R "jsonrpc\|JSON-RPC\|fetch\|request\|rpc" web/src/erp -n | head -120
grep -R "businessRecords\|businessModules\|permissions\|menu" web/src/erp/config web/src/erp/pages -n | head -120
```

也可以用 `rg`，以本地可用命令为准。

如果前端入口不是这些路径，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/jsonrpc_masterdata_order.go
server/internal/biz/rbac.go
现有前端页面 / 路由 / API 调用 / 权限判断风格
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

### 前端页面

按现有项目风格选择路径。

允许新增或修改类似：

```text
web/src/erp/pages/*
web/src/erp/modules/*
web/src/erp/components/*
```

但仅限 V1 customers / suppliers / contacts / sales_orders / sales_order_items 页面。

推荐根据现有结构建立或接入：

```text
customers 页面
suppliers 页面
contacts 页面或客户/供应商详情页内联系人区块
sales_orders 页面
sales_order_items 区块或订单详情页内明细区块
```

如果当前前端仍以 `businessRecords` 通用页面为主，允许新增独立 V1 页面入口或内部模块页面，但不得删除旧 business_records 页面。

### 前端 API client

允许新增或修改：

```text
web/src/erp/api/*
web/src/erp/services/*
web/src/erp/shared/api/*
web/src/erp/config/*
```

但仅限 V1 API 调用封装和菜单/模块入口。

不得改 `web/src/erp/config/docs.mjs`。  
不得改 `web/src/erp/config/seedData.mjs`。  

### 前端测试

允许新增或修改与本轮 UI 直接相关的测试。

路径按现有项目风格确定，例如：

```text
web/src/erp/**/*.test.*
web/tests/*
web/scripts/*
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
server/internal/biz/rbac.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/data/masterdata_repo.go
server/internal/data/sales_order_repo.go
server/internal/data/jsonrpc_masterdata_order.go
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

原则上禁止修改后端：

```text
server/internal/biz/*
server/internal/data/*
server/internal/service/*
server/internal/server/*
server/api/*
```

如果 UI 接入暴露出 API 返回字段命名或 handler 的必要小 bug，必须停止并报告，不得自行修改后端。

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 rbac.go。
本轮不得改 API/RBAC。
本轮不得改 docs registry。
本轮不得改 seedData。
```

---

## 改动范围分级

本轮范围级别：

```text
UI
```

仅限：

```text
customers / suppliers / contacts / sales_orders / sales_order_items
```

不得扩大到：

```text
schema
migration
repo/usecase
API/RBAC
seedData
docs registry
business_records migration
shipment/inventory/finance facts
```

禁止把下面内容放进同一轮：

```text
UI + API/RBAC
UI + seedData
UI + docs registry
UI + business_records transition
UI + shipment facts
UI + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- customers 页面可列表、创建、编辑、查看、启停。
- suppliers 页面可列表、创建、编辑、查看、启停。
- contacts 可按 owner 查看、创建、编辑、设置 primary、禁用。
- sales_orders 页面可列表、创建、编辑、查看。
- sales_order 页面可提交、激活、关闭、取消。
- sales_order_items 可新增、编辑、取消/移除、列表查看。
- UI 调用 007 已存在 API，不绕过 API。
- UI 不直接写 Ent / local fake state 当真源。
- UI 不复制 sales order lifecycle 业务规则，只按 API 返回和 action 结果展示。
- UI 不把 shipping_released 显示成已出库。
- UI 不显示 sales_order 为 shipped。
- UI 不展示或编辑 shipped_quantity。
- UI 不展示 shipment / inventory / finance facts。
- UI 不把 current 客户样本字段写成固定产品字段。
- UI 权限按钮显示可以根据权限控制，但后端权限仍是安全边界。
- 不改 docs registry。
- 不改 seedData。
- 不改后端 API/RBAC。
- 不改 schema/migration/generated code。
- 不改 workflow.go。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“页面完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 找不到现有前端路由 / 页面 / API 调用方式，且无法确认项目约定。
- 需要引入新前端框架或大组件库。
- 需要修改后端 API/RBAC。
- 需要修改 seedData 或 docs registry。
- 需要改 schema/migration/generated code。
- 需要处理 business_records 迁移。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- UI 只能靠假数据完成，无法连接后端 API。
- UI 需要把 sales_order 显示成 shipped。
- UI 需要展示 shipped_quantity。
- UI 需要展示 shipment/inventory/finance facts。
- 测试环境无法验证前端核心路径。
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

## UI 范围

本轮 UI 范围只包括 V1 后端能力。

### Customers UI

必须支持或按现有项目风格等价支持：

```text
客户列表
创建客户
编辑客户
查看客户
启停客户
```

### Suppliers UI

必须支持或按现有项目风格等价支持：

```text
供应商列表
创建供应商
编辑供应商
查看供应商
启停供应商
```

### Contacts UI

必须支持或按现有项目风格等价支持：

```text
按 owner 查看联系人
创建联系人
编辑联系人
设置主联系人
禁用联系人
```

Contacts UI 必须使用后端 API。

不得在 UI 层绕过：

```text
owner_type 合法性
owner_id 存在性
primary contact 策略
```

### Sales Orders UI

必须支持或按现有项目风格等价支持：

```text
销售订单列表
创建销售订单
编辑销售订单
查看销售订单
提交销售订单
激活销售订单
关闭销售订单
取消销售订单
```

### Sales Order Items UI

必须支持或按现有项目风格等价支持：

```text
新增订单行
编辑订单行
移除/取消订单行
查看订单行
```

Sales Order Items UI 必须使用后端 API。

不得在 UI 层绕过：

```text
customer_id active guard
product_id active guard
unit_id active guard
lifecycle status guard
line status guard
```

---

## 权限与按钮显示

UI 可以根据当前用户权限控制按钮显示。

但必须保持：

```text
前端隐藏按钮不是安全边界。
后端 API/RBAC 才是安全边界。
```

如果现有前端已有权限判断工具，复用。

如果没有权限工具：

```text
不要发明复杂权限系统。
只做最小按钮禁用 / 隐藏，并在 review 中说明后端仍是最终校验。
```

---

## Sales Order / Shipment 边界

Sales Order UI 不得出现这些动作：

```text
标记已出库
确认出货
库存预留
扣减库存
生成发票
生成应收
登记收款
```

不得调用或新增：

```text
markAsShipped
shipSalesOrder
reserveStock
deductInventory
generateInvoice
generateReceivable
receivePayment
```

Sales Order UI 只允许展示和推进 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

`closed` 不等于 `shipped`。

如果页面需要说明出货状态，只能写：

```text
出货事实后续由 ShipmentUsecase 接入。
当前销售订单页面不代表已出货。
```

---

## business_records 边界

本轮不得迁移 `business_records`。

允许：

```text
新增正式 V1 页面入口。
保留旧 business_records 页面。
在文案中说明旧 business_records 是兼容 / demo / source snapshot 入口。
```

禁止：

```text
删除 business_records。
把 business_records 数据自动迁移到新模型。
让新 UI 双写 business_records 和新 API。
把 business_records 当事实真源。
```

如果当前前端菜单里已有 partners / orders business_records 入口，不要强行删除。

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

不得新增让 UI 调用 workflow 或写 fact 的逻辑。

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
UI
API client
tests
runtime
schema
generated code
migration SQL
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改前端 UI/API client/tests/docs，需要检查 diff、格式、禁止字段和边界词。
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
前端页面、API client、helper、权限按钮逻辑需要测试。
```

命令按真实项目选择，例如：

```bash
cd web && pnpm test
```

### 集成测试

选择：有限选择。

原因：

```text
本轮可能接前端 API client，但不启动真实后端。
```

如果现有前端测试有 mock API / integration test，运行对应测试。

### 冒烟测试

选择：有限选择。

原因：

```text
新增前端入口和页面，需要确认页面路由 / 渲染不炸。
```

命令按项目真实脚本选择。

### 回归测试

选择：是。

原因：

```text
新增页面和配置不应破坏现有 ERP 前端测试。
```

命令：

```bash
cd web && pnpm test
```

### E2E 测试

选择：否或有限选择。

原因：

```text
本轮不做完整用户路径端到端，除非项目已有轻量 browser QA 可直接跑。
```

如果现有 E2E 非常轻量且项目要求，可运行；否则说明未选原因。

### 视觉 / 样式回归

选择：有限选择。

原因：

```text
新增页面可能影响样式 / 布局。
```

如果项目有 `style:l1` 或类似脚本，运行：

```bash
cd web && pnpm style:l1
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
grep -R "tenant_id" web/src/erp server/internal/biz server/internal/data docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" web/src/erp docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" web/src/erp server/internal/biz server/internal/data || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" web/src/erp server/internal/biz server/internal/data || true
grep -R "ChangeUsecase\|change_records" web/src/erp server/internal/biz server/internal/data docs/product docs/architecture || true
```

必须运行前端测试：

```bash
cd web && pnpm test
```

如果本轮改 CSS / layout / className / style：

```bash
cd web && pnpm css
cd web && pnpm style:l1
```

如果项目要求 lint：

```bash
cd web && pnpm lint
```

必须保留后端回归：

```bash
cd server && go test ./internal/biz ./internal/data
```

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

不得 apply migration。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 frontend pages for customers / suppliers / contacts / sales_orders / sales_order_items have been added.
The pages use V1 API/RBAC and do not write shipment / inventory / finance facts.
seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
008 V1 frontend pages for MasterData and Sales Order completed.
No schema / migration / generated code / API / RBAC / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
009-business-records-transition-audit
010-current-customer-data-import-draft
```

但不得把 009/010 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
008 frontend pages added
```

但不得把 business_records transition 或 shipment facts 写成完成。

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

【前端页面清单】

【API client 接入清单】

【权限按钮策略】

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
前端页面清单
API client 文件清单
权限按钮策略
sales order / shipment fact 边界解释
business_records 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```