# Codex Goal 002: Schema Design Final Review Before Ent Implementation

## 任务名称

Phase 2：V1/V2 Schema Design Final Review。

## 任务性质

这是一次 schema 实现前的最终评审任务。

本轮只写文档和决策记录。
本轮不落 Ent schema。
本轮不生成 migration。
本轮不改 runtime。
本轮不接 API。
本轮不改 UI。
本轮不改 docs registry。
本轮不改 seedData。

本轮目标是把下一步真正要落的 V1 schema 范围定死，避免一边写 schema 一边争论模型边界。

## 背景

Phase 0 已完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- `server/internal/core/*` 空骨架。
- `docs/product/*` 与 `docs/customers/current/*` 初步文档。

Phase 1 已完成 docs-only 评审：

- 主数据 / 订单源单据 / BOM / 采购边界评审。
- V1/V2 domain schema draft。
- migration readiness checklist。
- phase1 implementation plan。
- phase1 risk register。

Phase 2 的目标不是扩大范围，而是做最终裁剪：

1. V1 到底落哪些表。
2. V1 明确不落哪些表。
3. 哪些字段必须进入 Product Core。
4. 哪些字段只是 current 客户样本。
5. 哪些内容延后到 V2/V3/V4。
6. 哪些风险必须在 schema 实现前关闭。
7. 下一轮 Ent schema goal 的允许范围和禁止范围。

## 必须先读

### 项目约束

- `AGENTS.md`
- `README.md`
- `docs/current-source-of-truth.md`
- `progress.md`

### Phase 0 文档

- `docs/product/zero-to-one-architecture.md`
- `docs/product/product-principles.md`
- `docs/product/domain-model-v1.md`
- `docs/product/module-boundaries.md`
- `docs/product/config-permission-policy.md`
- `docs/product/customer-instance-policy.md`
- `docs/product/customer-delta-policy.md`
- `docs/product/rewrite-roadmap.md`
- `docs/product/release-gates.md`
- `docs/product/test-strategy.md`
- `docs/architecture/status-workflow-fact-boundary.md`

### Phase 1 文档

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/migration-readiness-checklist.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`

### current 客户资料

- `docs/customers/current/README.md`
- `docs/customers/current/source-materials.md`
- `docs/customers/current/requirement-clues.md`
- `docs/customers/current/assumption-register.md`
- `docs/customers/current/question-backlog.md`
- `docs/customers/current/decision-log.md`
- `docs/customers/current/customer-config-draft.md`
- `docs/customers/current/delta-register.md`
- `docs/customers/current/change-request-process.md`

### 设计输入

- `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md`
- `docs/reference/imported-notes/erp_status_workflow_context.md`

### 后端现状

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/biz/inventory.go`
- `server/internal/biz/quality_inspection.go`
- `server/internal/data/model/schema`
- `server/internal/data/business_record*`
- `server/internal/data/inventory*`
- `server/internal/data/purchase*`
- `server/internal/data/quality*`

### 前端现状

- `web/src/erp/config/businessModules.mjs`
- `web/src/erp/config/businessRecordDefinitions.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

如果某些文件不存在，请记录缺失，不要猜。

## 本轮允许新增 / 修改的文件

允许新增：

- `docs/product/schema-design-final-review.md`
- `docs/product/v1-entity-decision-record.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-schema-go-no-go.md`
- `docs/product/business-records-transition-plan.md`
- `docs/product/v1-next-codex-goals.md`

允许小幅更新：

- `docs/current-source-of-truth.md`
- `progress.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`
- `docs/product/rewrite-roadmap.md`

禁止修改：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/data`
- `server/internal/data/model/schema`
- `server/internal/core/*`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/pages`
- `web/src/erp/mobile`
- `migrations`
- `server/deploy`
- `scripts`

## 总体原则

1. 本轮不实现。
2. 本轮只做 final review。
3. 本轮只写设计文档、决策记录和下一步 goal。
4. 所有 schema 都只能写在文档中。
5. 不得把 draft 写成 implemented。
6. 不得把 current 客户资料写成 Product Core。
7. 不得新增 `tenant_id`。
8. 不得重复设计已有真源。
9. 不得用 Workflow 承担 Fact。
10. 不得用 `business_records` 长期替代正式主数据 / 事实表。
11. 不得创建泛化 Change 模块。
12. 不得创建 `change_records`。
13. 不得创建 `ChangeUsecase`。
14. 不得做 SaaS 多租户。
15. 不得做 license server。
16. 不得做套餐计费。
17. 不得做客户工单系统。

## 必须遵守的已有真源

不要重复设计这些对象：

- `units`
- `materials`
- `products`
- `warehouses`
- `inventory_txns`
- `inventory_balances`
- `inventory_lots`
- `bom_headers`
- `bom_items`
- `purchase_receipts`
- `purchase_returns`
- `purchase_receipt_adjustments`
- `quality_inspections`
- RBAC roles / permissions / menus

如果发现现有模型不够，只能在文档中提出扩展建议，不能直接改 schema。

## 状态和事实边界总原则

必须在所有文档中保持以下口径：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

必须明确：

```text
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

必须明确：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
quality task done != quality_inspection passed。
business_records 不替代正式事实表。
current 客户资料不等于 Product Core 真源。
```

必须明确：

```text
动作产生事实，事实推导结果。
结果可以缓存，但不能伪造事实。
```

## tenant_id 规则

禁止新增 `tenant_id`。

如果 imported note 或历史文档中已经出现 `tenant_id`，只能这样处理：

```text
未来 SaaS 多租户评审候选，不进入当前 V1/V2 schema。
```

grep 命中 `tenant_id` 时，必须说明命中是否只在以下上下文：

- imported note 原文。
- 禁止新增说明。
- 未来 SaaS 评审候选说明。
- current 不是 runtime tenant 的说明。

不得把 `tenant_id` 写进当前 schema 草案的字段列表。

## Workflow / Fact 规则

必须明确：

- Workflow task done 不写库存。
- Workflow task done 不写 shipments。
- Workflow task done 不写 reservations。
- Workflow task done 不写 AR/AP。
- Workflow task done 不写 invoice/payment。
- Workflow 可以产生许可或协同状态。
- Fact 必须由领域 usecase 产生。
- `shipping_released` 只能表示已放行 / 可发货 / 待出库。
- `shipping_released` 不能显示成已出库。
- `shipped` 才能表示真实出货完成。
- `shipment facts / inventory_txns` 才能支撑 `shipped`。

## current 客户规则

current 是：

- seed customer。
- first private deployment customer。
- source material owner。
- first config draft source。

current 不是：

- Product Core rule source。
- SaaS runtime tenant。
- reason to hardcode fields。
- reason to fork code。

current 客户样本字段只能作为：

- Customer Material。
- Demo Seed。
- Industry Template Candidate。
- Print Template Input。
- QA Debug。

不能直接作为：

- Product Core Source。
- Ent schema 必选字段。
- 通用产品规则。
- 核心状态机规则。

## 文档 1：schema-design-final-review.md

路径：

```text
docs/product/schema-design-final-review.md
```

文件顶部必须写：

```text
Doc Type: Final Schema Design Review
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No
```

必须输出一个总决策表：

| Area | Decision | V1 | V2 | Deferred | Reason | Risk |
|---|---|---:|---:|---:|---|---|

必须覆盖：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- `business_records` transition

必须给出总判断：

```text
哪些进入下一轮 Ent schema goal。
哪些只保留 draft。
哪些必须等待后续 fact review。
哪些必须等待客户确认。
哪些不应该做。
```

必须明确：

```text
下一轮 Ent schema goal 只能落 V1 cutline 中明确允许的表。
```

## 文档 2：v1-entity-decision-record.md

路径：

```text
docs/product/v1-entity-decision-record.md
```

必须为每个候选实体写决策记录。

每个实体使用同一模板：

```text
## Entity: <name>

Decision: Go / No-Go / Defer / Draft Only

Category:
- MasterData / Source Document / Fact / Derived / Workflow / Config

V1 Scope:
- Yes / No

Reason:

Existing Truth Sources:

Fields Allowed in Product Core:

Fields Deferred:

Fields Treated as Current Customer Sample:

Relations:

Status Fields:

Affects Inventory:
- Yes / No

Affects Shipment:
- Yes / No

Affects Finance:
- Yes / No

Workflow/Fact Risk:

Duplicate Design Risk:

Customer Coupling Risk:

Migration Risk:

Required Before Ent Schema:

Stop Conditions:
```

必须覆盖至少这些实体：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions`
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation

## 文档 3：v1-implementation-cutline.md

路径：

```text
docs/product/v1-implementation-cutline.md
```

这个文件决定下一轮真正可以实现什么。

必须分成四段：

### Allowed in next Ent schema goal

列出下一轮允许落 Ent schema 的表。

建议候选，但 Codex 必须基于真实文档判断：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

`product_skus` 必须单独给 go/no-go，不得自动进入。

### Draft only, not next schema goal

列出暂时只保留 draft 的表。

可能包括：

- `product_skus`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `supplier_material_profiles`
- `customer_addresses`
- `settlement_terms`

### Deferred to later fact reviews

列出必须等事实层评审的表。

必须包括：

- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

### Explicitly forbidden in V1

必须包括：

- `tenant_id`
- SaaS runtime tenant tables
- license server tables
- billing / plan tables
- customer ticket tables
- generic `change_records`
- `ChangeUsecase`
- workflow-owned inventory/shipment/finance facts

必须包含一个表：

| Object | Next Schema Goal? | Reason | Stop Conditions |
|---|---:|---|---|

## 文档 4：v1-schema-go-no-go.md

路径：

```text
docs/product/v1-schema-go-no-go.md
```

必须输出 go/no-go 检查清单。

每项必须有：

- check
- answer
- evidence
- decision
- owner layer

必须覆盖：

1. 是否重复已有 `products/materials/units/warehouses`。
2. 是否重复已有 `bom_headers/bom_items`。
3. 是否重复已有 `purchase_receipts/purchase_returns/purchase_receipt_adjustments`。
4. 是否重复已有 `inventory_txns/inventory_balances/inventory_lots`。
5. 是否重复已有 `quality_inspections`。
6. 是否只是 current 客户样本字段。
7. 是否影响库存事实。
8. 是否影响出货事实。
9. 是否影响财务事实。
10. 是否需要 workflow 写 fact。
11. 是否需要 migration backfill。
12. 是否需要唯一索引。
13. 是否需要状态机。
14. 是否需要幂等键。
15. 是否需要 RBAC 权限码。
16. 是否需要 API。
17. 是否需要 UI。
18. 是否需要导入。
19. 是否需要客户配置。
20. 是否包含 `tenant_id`。
21. 是否误把 draft 写成 implemented。

必须有最终结论：

```text
Proceed / Proceed With Restrictions / Blocked
```

如果任何 High 风险未关闭，结论必须是：

```text
Proceed With Restrictions
```

或：

```text
Blocked
```

不能写 Proceed。

## 文档 5：business-records-transition-plan.md

路径：

```text
docs/product/business-records-transition-plan.md
```

必须说明 `business_records` 的过渡定位。

必须包含：

```text
business_records 当前可继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不能长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

必须回答：

1. 哪些现有前端页面仍可能依赖 `business_records`。
2. partners 页面如何避免和正式 `customers/suppliers` 重复。
3. products 页面如何避免和现有 `products` schema 重复。
4. 订单样本如何迁移到正式 `sales_orders`。
5. current 客户样本如何保留为 demo/source material。
6. 什么时候可以停止把新业务功能加到 `business_records`。
7. 哪些内容可以继续留在 `business_records`。
8. 哪些内容必须迁移到正式模型。

必须给出过渡阶段：

```text
Stage 0: business_records as existing compatibility/demo layer.
Stage 1: new V1 models created, business_records read-only or demo-only for overlapping domains.
Stage 2: official pages/API switch to V1 models.
Stage 3: business_records retained only for generic snapshots/debug/demo or deprecated.
```

不得建议直接删除 `business_records`，除非完整引用审计完成。

## 文档 6：v1-next-codex-goals.md

路径：

```text
docs/product/v1-next-codex-goals.md
```

必须生成后续小 goal 列表，但不要写超长内容。

至少包含：

- `003-v1-ent-schema-customers-suppliers-orders`
- `004-v1-migration-and-ent-generate`
- `005-v1-repo-usecase-masterdata`
- `006-v1-repo-usecase-sales-order`
- `007-v1-api-rbac-masterdata-order`
- `008-v1-frontend-masterdata-order-pages`
- `009-business-records-transition-audit`
- `010-current-customer-data-import-draft`

每个 goal 必须写：

- objective
- allowed files
- forbidden files
- schema change yes/no
- migration yes/no
- runtime yes/no
- test commands
- stop conditions
- expected output

必须明确：

```text
不要把 schema、repo/usecase、API/RBAC、UI 放进同一轮。
```

推荐顺序：

```text
final review -> Ent schema -> migration/generate -> repo/usecase tests -> API/RBAC -> UI -> import/demo -> E2E
```

## 需要更新的已有文档

可以小幅更新：

### docs/current-source-of-truth.md

增加 Phase 2 说明：

```text
Phase 2 新增的是 schema final review 和 implementation cutline，不是 runtime 实现。
当前正式实现状态仍以现有代码、schema、migration、tests 为准。
```

### progress.md

增加本轮记录：

```text
Phase 2 schema final review docs added.
No runtime/schema/migration changes.
```

### docs/product/domain-schema-draft-v1-v2.md

可以增加链接到：

- `docs/product/schema-design-final-review.md`
- `docs/product/v1-entity-decision-record.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-schema-go-no-go.md`

但不得把 draft 写成 implemented。

### docs/product/phase1-implementation-plan.md

可以增加说明：

```text
Implementation must follow the Phase 2 cutline before any Ent schema changes.
```

### docs/product/phase1-risk-register.md

可以增加 Phase 2 risk closure links。

## 强制决策点

本轮必须对以下问题给出明确结论，不允许只写“待定”。

### 1. customers / suppliers / contacts

必须给出：

```text
V1 Go / No-Go
```

必须说明：

- 分表还是 partner abstraction。
- contacts 如何挂 owner。
- V1 最小字段。
- 什么字段不进 V1。
- 是否需要 address / settlement_terms 第一版落表。

### 2. product_skus

必须给出：

```text
Go / No-Go / Draft Only
```

必须说明：

- 它是否只是 products 的别名。
- 它是否真实影响订单行、BOM、库存、出货粒度。
- 如果证据不足，必须 Draft Only。
- 不能因为 current Excel 有颜色字段就直接落 `product_skus`。

### 3. sales_orders / sales_order_items

必须给出：

```text
V1 Go / No-Go
```

必须说明：

- 它们是 Source Document。
- 它们不是出货事实。
- shipped_quantity 如果存在，只能是 derived/cache。
- 真实出货必须等 shipment facts。

### 4. purchase_orders

必须给出：

```text
V1 / V2 / Draft Only
```

必须说明：

- purchase_order 是采购承诺。
- purchase_receipt 是采购入库事实。
- purchase_order 不能替代 purchase_receipt。
- purchase_order 不应直接生成 AP，除非财务评审明确。

### 5. business_records

必须给出：

```text
继续保留 / 限制新增 / 逐步过渡
```

必须说明：

- 当前不能直接删除。
- overlapping domains 不应继续新增核心业务能力。
- 正式 customers/suppliers/orders 出现后，应避免 UI 和 API 双真源。

### 6. BOM version

必须给出：

```text
V1 / Draft Only / Deferred
```

必须说明：

- 现有 `bom_headers/bom_items` 已是真源。
- 不得重复建一套 BOM。
- 如果要做 version extension，必须围绕现有 BOM 真源扩展。

### 7. stock_reservations / shipments / finance

必须给出：

```text
Deferred
```

必须说明：

- 这些属于出货 / 库存 / 财务事实层。
- 不进入 V1/V2 masterdata/order schema goal。
- 不从 `shipment_release` 生成。

## 状态和命名要求

内部状态必须用 canonical key。

不要在设计里用中文文案做业务判断。

必须明确：

```text
shipping_released != shipped
shipped 才能代表真实出货完成
shipment facts / inventory_txns 才能支撑 shipped
```

推荐写法：

```text
UI 可显示“已放行 / 可发货 / 待出库”。
UI 不得把 shipping_released 显示为“已出库 / 已发货 / 已扣库存”。
```

## 权限设计要求

本轮只评审，不落权限码。

但文档必须说明后续每个 usecase 要按以下顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

必须说明：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 usecase 必须校验动作权限、数据范围和状态机。
```

## 客户需求处理要求

所有来自 current 的字段或流程，必须先进入分类：

- Product Core
- Industry Template Candidate
- Customer Config
- Customer Extension
- Data Import Adapter
- Print Template
- Reporting
- Customer Material

如果一个字段只在 current 样本里出现，不能直接写成 V1 必选 Product Core 字段。

如果一个需求影响库存、出货、财务事实，必须进入 Product Core 架构评审。

## 禁止事项

严格禁止：

- 不新增 `tenant_id`。
- 不改 Ent schema。
- 不新增 migration。
- 不改 `server/internal/biz/workflow.go`。
- 不改 `server/internal/biz/rbac.go`。
- 不改 `server/internal/data`。
- 不改 `server/internal/data/model/schema`。
- 不改 `server/internal/core/*`。
- 不改 `web/src/erp/config/docs.mjs`。
- 不改 `web/src/erp/config/seedData.mjs`。
- 不改前端页面。
- 不改移动端页面。
- 不改部署脚本。
- 不实现 API。
- 不实现 UI。
- 不实现 SaaS。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 Change 模块。
- 不创建 `change_records`。
- 不创建 `ChangeUsecase`。
- 不把 current 资料写成 Product Core。
- 不从 Workflow 写 Fact。
- 不从 `shipping_released` 生成 shipment / inventory / AR / invoice。
- 不把 draft 说成 implemented。

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git ls-files --others --exclude-standard
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
cd web && pnpm test
cd ../server && go test ./internal/biz ./internal/data
```

如果 `go test` 因现有环境或依赖失败：

- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。
- 不要为了通过测试乱改 runtime。

如果 `pnpm test` 因已有 warning 通过：

- 记录 warning。
- 不要为 warning 乱改不相关配置。

## 最终回复格式

```text
【完成】

【新增/修改文件】

【Phase 2 核心结论】

【V1 Go 表清单】

【V1 Draft Only / Deferred 清单】

【下一轮 Ent schema cutline】

【明确不落地的内容】

【business_records 过渡结论】

【product_skus go/no-go 结论】

【purchase_orders go/no-go 结论】

【Workflow/Fact 边界风险】

【tenant_id 处理结论】

【测试命令与结果】

【风险】

【下一轮 Codex Goal 建议】
```

## 完成后给 GPT 的复盘材料

Codex 完成后，请输出足够信息，让 GPT 判断下一轮 goal。

必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
测试命令和结果
grep tenant_id 结果解释
grep shipping_released 结果解释
本轮新增文档清单
本轮没有修改的禁止路径
下一轮建议
```