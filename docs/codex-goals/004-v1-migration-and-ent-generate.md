# Codex Goal 004: V1 Ent Generate and Atlas Migration

## 任务名称

004：V1 Ent generate + Atlas migration：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
Migration / Generate
```

本轮只允许基于 003 已新增的 5 个 Ent schema 文件执行：

```text
Ent generate
Atlas migration generation / migration status check
generated code inspection
migration SQL inspection
必要的 schema 编译修正
```

必须明确：

```text
本轮是否改 runtime：否
本轮是否改 Ent schema：仅允许为 generate / migration 通过做最小 schema 修正
本轮是否新增 migration：是
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
```

本轮目标是让 003 的 schema-only 结果进入 generated code + migration 阶段。

本轮不接业务逻辑。

---

## 背景

003 已完成：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

003 结论：

- 只新增 V1 cutline 允许的 5 个 Ent schema 文件。
- 未生成 Ent 代码。
- 未新增 Atlas migration。
- 未接 repo/usecase。
- 未接 API/RBAC。
- 未接 UI。
- 未改 docs registry。
- 未改 seedData。
- 未改 workflow.go。
- 未改 rbac.go。
- 未改 server runtime 业务逻辑。

004 的目标：

```text
把 003 的 schema 文件生成 Ent 代码和 Atlas migration。
```

004 不是业务实现任务。

004 不处理：

```text
repo
usecase
API
RBAC
UI
数据导入
business_records 迁移
shipment facts
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

### 003 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

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
docs/architecture/product-sku-bom-boundary-review.md
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

### 003 新增 schema

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

### 现有 Ent / Atlas / migration 相关文件

Codex 必须先查看真实仓库结构，再决定命令和路径。

至少检查：

```text
server/Makefile
server/ent
server/internal/data/model
server/internal/data/model/schema
server/migrations
server/atlas*
server/entgo*
```

如果路径不同，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/model/schema/*.go
server/Makefile
Atlas / Ent 现有配置
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

本轮允许修改：

### 003 新增 schema 文件

仅当 generate / migration 失败时，允许对以下文件做最小修正：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

修正范围仅限：

```text
字段类型不符合 Ent / Atlas 要求
索引语法错误
edge 语法错误
decimal helper / import 问题
命名和现有 schema 风格不一致导致生成失败
```

不得借此扩大字段范围。

### Ent generated code

允许修改或生成 Ent 生成代码，路径以仓库实际为准，通常包括：

```text
server/internal/data/model/*
```

但不包括：

```text
server/internal/data/model/schema/*
```

schema 目录只有上述 5 个文件允许必要修正。

### Atlas migration

允许新增 V1 migration 文件，路径以仓库实际为准，通常包括：

```text
server/migrations/*
```

或仓库当前 Atlas migration 目录。

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-implementation-cutline.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

如果当前协议要求保留 runs 最近历史，可以按协议处理；但本轮不要修改协议本身。

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
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
server/internal/data/model/generated 代码允许由 Ent 生成。
server/internal/data/model/schema 仅允许为 003 的 5 个 schema 做最小修正。
server/internal/data 业务 repo/usecase 禁止修改。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Migration / Generate
```

不得扩大范围。

禁止把下面内容放进同一轮：

```text
Ent generate + migration + repo/usecase + API + UI
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 成功基于 003 的 5 个 schema 运行 Ent generate。
- 成功新增 Atlas migration。
- migration SQL 只包含 customers / suppliers / contacts / sales_orders / sales_order_items 相关表、索引、约束和外键。
- generated code 不包含 tenant_id。
- migration 不包含 tenant_id。
- 不新增 product_skus。
- 不新增 purchase_orders。
- 不新增 shipments。
- 不新增 stock_reservations。
- 不新增 AR/AP/invoice/payment/reconciliation。
- 不新增 SaaS runtime tenant 相关表。
- 不新增 license / billing / ticket 相关表。
- 不新增 ChangeUsecase 或 change_records。
- 不改 repo/usecase。
- 不改 API/RBAC。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不从 Workflow 写库存、出货、财务事实。
- contacts owner_type + owner_id 的 DB 层约束和 primary contact 规则仍保留。
- sales_orders / sales_order_items 仍是 Source Document，不是 shipment fact。
- 不引入 shipped_quantity。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“generate 成功”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 003 的 5 个 schema 文件不存在。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 repo/usecase。
- 需要修改 server/internal/data 业务逻辑。
- 需要修改 workflow.go 或 rbac.go。
- 需要修改 API/UI。
- 需要修改 seedData 或 docs registry。
- Ent generate 要求新增 product_skus / purchase_orders / shipments / stock_reservations / finance facts。
- Atlas migration 生成了非 V1 cutline 表。
- migration SQL 包含 tenant_id。
- migration SQL 包含 deferred 表。
- contacts 建模需要改成另一种模型，超出本轮修正范围。
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

## Ent generate 要求

Codex 必须先确认仓库已有生成方式。

优先使用现有 Makefile 或脚本。

通常可能是：

```bash
cd server && make data
```

但必须以真实仓库为准。

如果 `make data` 会同时执行超出本轮范围的步骤，Codex 必须先说明风险并停止，不得自行扩大范围。

生成后必须检查：

```text
generated code 是否只围绕新增 V1 schema 扩展
是否意外修改旧 schema generated code 大量内容
是否有 tenant_id
是否有 deferred 表
```

如果 Ent generate 修改大量旧 generated code，Codex 必须判断是正常生成器输出还是异常，并在 review 中说明。

---

## Atlas migration 要求

Codex 必须先确认仓库已有 migration 生成方式。

优先使用现有 Makefile 或脚本。

通常可能是：

```bash
cd server && make migrate_status
```

但注意：

```text
make migrate_status 可能只是查看状态，不一定生成 migration。
```

Codex 必须根据仓库文档和 Makefile 确认正确命令。

如果仓库有专门的 migration generate 命令，使用仓库约定。

如果没有明确生成命令，必须停止并报告，不得猜。

migration 文件必须只包含：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

允许包含这些对象的：

```text
primary key
columns
indexes
unique indexes
check constraints
foreign keys
created_at / updated_at
```

不得包含：

```text
tenant_id
product_skus
purchase_orders
purchase_order_items
purchase_demands
stock_reservations
shipments
shipment_items
AR/AP/invoice/payment/reconciliation
production facts
outsourcing facts
license / billing / ticket tables
change_records
```

---

## Migration SQL 检查

生成 migration 后必须 grep 检查。

必须检查：

```bash
grep -R "tenant_id" server/migrations || true
grep -R "product_skus\|purchase_orders\|shipments\|stock_reservations\|invoice\|payment\|reconciliation\|change_records" server/migrations || true
```

如果 migration 目录不是 `server/migrations`，用真实目录替换，并在审查报告中说明。

必须手动或用 grep 确认 migration 仅涉及 V1 allowed tables。

---

## contacts 约束检查

必须确认 migration 中保留：

```text
owner_type 枚举 / check 约束
同一 owner 最多一个 primary contact 的约束或索引
```

如果 partial unique index 无法被 Atlas 正确生成，必须停止或在审查报告中明确风险，不得假装通过。

如果 Atlas 不支持当前表达，需要提出下一轮 schema 修正建议。

---

## sales_orders / sales_order_items 边界检查

必须确认 generated code / migration 中没有：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
tenant_id
```

如果发现这些字段，必须停止并报告。

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

本轮 generate / migration 不能让 Workflow 直接写 Fact。

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
新 schema
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
本轮会生成代码和 migration，必须检查 diff、空白、禁止字段和边界词。
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
生成 Ent 代码后，至少要编译 schema / data / biz。
```

命令：

```bash
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

如 generated package 有更合适命令，按仓库真实结构补充。

### 集成测试

选择：有限选择。

原因：

```text
本轮生成 migration，但不接 repo/usecase，不执行业务 DB 测试。
```

命令：

```bash
cd server && make migrate_status
```

如果 `make migrate_status` 需要真实 DB，Codex 必须说明 DB 环境是否可用。

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、API、UI 或部署。
```

### 回归测试

选择：有限选择。

原因：

```text
generated code 不应破坏既有 biz/data 编译。
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
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行 Ent generate 命令，优先仓库约定，例如：

```bash
cd server && make data
```

如果命令不同，用真实仓库命令。

必须运行或检查 migration 命令，优先仓库约定。

如果存在：

```bash
cd server && make migrate_status
```

必须运行。

如果 migration 生成命令不同，按真实仓库命令运行，并在审查报告中说明。

必须运行：

```bash
grep -R "tenant_id" server/internal/data/model server/migrations docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "product_skus\|purchase_orders\|shipments\|stock_reservations\|invoice\|payment\|reconciliation\|change_records" server/internal/data/model server/migrations || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/data/model server/migrations || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

如果 migration 目录不是 `server/migrations`，用真实目录替换。

必须运行：

```bash
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 Ent generated code and Atlas migration for customers / suppliers / contacts / sales_orders / sales_order_items have been generated.
Repo/usecase, API/RBAC, UI, seedData, docs registry, and business_records transition are not implemented yet.
```

如果 migration 未能生成，则写清：

```text
004 stopped before migration generation.
```

不得把 repo/usecase/API/UI 写成完成。

### progress.md

记录本轮：

```text
004 V1 Ent generate and migration completed.
No repo/usecase / API / UI / seedData / docs registry changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
005-v1-repo-usecase-masterdata
006-v1-repo-usecase-sales-order
```

但不得把 005/006 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
003 schema files added
004 generated code / migration added
```

但不得把 runtime usecase 写成完成。

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

【Ent generate 结果】

【Atlas migration 结果】

【migration 文件清单】

【migration SQL 边界检查】

【contacts 约束检查】

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
generated code 文件清单
migration 文件清单
migration SQL 摘要
contacts 约束检查
sales_order / shipment fact 边界检查
tenant_id grep 解释
deferred table grep 解释
shipping_released grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```