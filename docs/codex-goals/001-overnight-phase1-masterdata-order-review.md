# Codex Goal 001: Overnight Phase 1 MasterData / Order / BOM / Purchase Review

## 任务名称

Phase 1：主数据、订单源单据、BOM、采购前置模型评审。

## 任务性质

这是一个 overnight analysis / design task。

本轮只输出文档和实施计划。

不要改 runtime code。
不要改 Ent schema。
不要新增 migration。
不要新增 tenant_id。
不要接入 API。
不要改 UI。
不要改 docs registry。
不要改 seedData。
不要移动旧代码。

## 背景

Phase 0 已经完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- `server/internal/core/*` 空骨架。
- `docs/product/*` 和 `docs/customers/current/*` 初步文档。

Phase 1 的目标是为 V1/V2 真正落 schema 做评审准备。

当前重点不是写代码，而是回答：

1. `customers / suppliers / contacts` 怎么建模。
2. `products / product_skus` 与现有 `products / materials / units / warehouses / bom_*` 怎么衔接。
3. `sales_orders / sales_order_items` 是否应该作为正式源单据。
4. BOM、订单、采购需求之间的边界是什么。
5. `purchase_orders` 是否 V1 做，还是 V2 做。
6. `business_records` 如何过渡，不能长期替代正式事实 / 主数据。
7. 哪些字段来自 current 客户样本，但不能写进 Product Core。
8. 哪些模型会影响库存 / 出货 / 财务，必须延后到事实层评审。

## 必须先读

- `AGENTS.md`
- `README.md`
- `docs/current-source-of-truth.md`
- `progress.md`

Phase 0 文档：

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

当前客户资料：

- `docs/customers/current/README.md`
- `docs/customers/current/source-materials.md`
- `docs/customers/current/requirement-clues.md`
- `docs/customers/current/assumption-register.md`
- `docs/customers/current/question-backlog.md`
- `docs/customers/current/decision-log.md`
- `docs/customers/current/customer-config-draft.md`
- `docs/customers/current/delta-register.md`
- `docs/customers/current/change-request-process.md`

设计输入：

- `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md`
- `docs/reference/imported-notes/erp_status_workflow_context.md`

后端现状：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/biz/inventory.go`
- `server/internal/biz/quality_inspection.go`
- `server/internal/data/model/schema`
- `server/internal/data/business_record*`
- `server/internal/data/inventory*`
- `server/internal/data/purchase*`
- `server/internal/data/quality*`

前端现状：

- `web/src/erp/config/businessModules.mjs`
- `web/src/erp/config/businessRecordDefinitions.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

如果某些文件不存在，请记录缺失，不要猜。

## 本轮允许新增 / 修改的文件

允许新增：

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/migration-readiness-checklist.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`

允许小幅更新：

- `docs/current-source-of-truth.md`
- `progress.md`
- `docs/product/domain-model-v1.md`
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
2. 本轮只评审。
3. 本轮只写设计文档和实施计划。
4. 所有 schema 都只能写在 draft 文档里。
5. 不能把 draft 伪装成已实现。
6. 不能把 current 客户资料写成 Product Core。
7. 不能新增 `tenant_id`。
8. 不能重复设计已有真源。
9. 不能用 Workflow 承担 Fact。
10. 不能用 `business_records` 长期替代正式主数据 / 事实表。
11. 不创建泛化 Change 模块。
12. 不创建 `change_records`。
13. 不创建 `ChangeUsecase`。
14. 不做 SaaS 多租户。
15. 不做 license server。
16. 不做套餐计费。
17. 不做客户工单系统。

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

## 文档 1：masterdata-order-source-document-review.md

路径：

```text
docs/architecture/masterdata-order-source-document-review.md
```

必须回答：

1. 什么是 MasterData。
2. 什么是 Source Document。
3. 什么是 Fact。
4. `customers / suppliers / contacts` 属于 MasterData。
5. `sales_orders / sales_order_items` 属于 Source Document / Business Commitment。
6. `inventory_txns / shipments / AR/AP / invoices / payments` 属于 Fact 或落账事实。
7. `business_records` 当前能做什么。
8. `business_records` 不能长期做什么。
9. 当前 V1 是否应该从正式 `customers / suppliers / sales_orders` 开始。
10. V1 不应该先做哪些复杂内容。
11. 如何避免把 Workflow、Source Document、Fact、Derived Status 混成一个 `status`。
12. 如何避免从 UI 菜单反推业务完成度。

必须明确：

```text
MasterData 是长期稳定对象。
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

必须说明 `business_records` 的定位：

```text
business_records 可以继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不能长期替代正式 customers / suppliers / orders / inventory / shipment / finance facts。
```

必须给出 V1 推荐结论：

```text
V1 应优先评审正式 customers / suppliers / contacts / sales_orders / sales_order_items。
V1 不应直接把 current 客户 Excel 列变成 Product Core schema。
V1 不应直接从 Workflow 推导库存、出货、财务事实。
```

## 文档 2：customer-supplier-masterdata-review.md

路径：

```text
docs/architecture/customer-supplier-masterdata-review.md
```

必须评审：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses` 可选
- `supplier_material_profiles` 可选
- `settlement_terms` 可选

必须回答：

1. `customers` 和 `suppliers` 是否共用 partner 模型。
2. 推荐是分表，还是统一 `party / partner + role`。
3. V1 最小字段。
4. 哪些字段是 Product Core。
5. 哪些字段是 Customer Config。
6. 哪些字段只是 current 客户样本。
7. 与 `sales_orders`、`purchase_orders`、`purchase_receipts`、`purchase_returns`、`quality_inspections`、future `shipments`、future AR/AP 的关系。
8. 如何避免和 `business_records` 的 partners 页面重复。
9. 如何支持 current 客户，但不硬编码 current 客户。
10. 是否需要 contacts 单独建模。
11. 是否需要开票资料第一版就进入 Product Core。
12. 是否需要结算条件第一版就进入 Product Core。

必须给出三个方案：

```text
Option A: customers / suppliers 分表。
Option B: partners + roles。
Option C: 先分表，未来抽象 party。
```

每个方案必须写：

- 优点。
- 缺点。
- 对 V1 的影响。
- 对 future finance 的影响。
- 对客户配置的影响。
- 对 migration 的影响。
- 与现有 `business_records` 的关系。

必须给出当前阶段推荐。

推荐倾向：

```text
如果当前代码还处于起步阶段，可以推荐 Option C：
V1 先用 customers / suppliers 分表，降低复杂度；
文档中保留未来 party 抽象可能性；
不要在 V1 过度抽象成万能 partner 模型。
```

但 Codex 需要根据真实代码和文档判断，不能机械套用。

## 文档 3：product-sku-bom-boundary-review.md

路径：

```text
docs/architecture/product-sku-bom-boundary-review.md
```

必须评审：

- `products`
- `product_skus`
- `materials`
- `units`
- `bom_headers`
- `bom_items`
- `bom_versions` 可选

必须回答：

1. 现有 `products / materials / units / bom_*` 已经是哪些真源。
2. 是否需要 `product_skus`。
3. SKU 与颜色、尺寸、版本、客户款号、产品编号的关系。
4. BOM 是按 product，还是按 sku。
5. BOM 改版怎么处理。
6. 材料替代是否 V1 做。
7. current 客户 Excel 里的字段如何抽成线索，而不是直接硬编码。
8. BOM 如何成为采购需求的来源。
9. BOM 不应该直接写库存事实。
10. `product_skus` 是否应在 V1 落 schema，还是先保留 draft。
11. SKU 是否必须影响库存粒度。
12. 色号、尺寸、图片、版本、客户款号分别应该放在哪里。

必须给出 V1 推荐模型草案：

```text
products
product_skus
bom_headers
bom_items
materials
units
```

但只写文档，不改 schema。

必须说明：

```text
BOM 是工程资料 / 物料需求来源。
BOM 不是库存事实。
BOM 不能直接改库存余额。
采购需求可以从 BOM 派生，但采购事实必须由采购单 / 入库单产生。
```

必须给出字段分类：

- Product Core 字段。
- Industry Template Candidate 字段。
- Customer Config 字段。
- current 客户样本字段。

## 文档 4：order-purchase-boundary-review.md

路径：

```text
docs/architecture/order-purchase-boundary-review.md
```

必须评审：

- `sales_orders`
- `sales_order_items`
- `purchase_orders`
- `purchase_order_items`
- `purchase_receipts`
- `purchase_returns`
- `purchase_receipt_adjustments`

必须回答：

1. `sales_order` 是业务源单据，不是出货事实。
2. `sales_order_item` 的数量和交期怎么记录。
3. `shipped_quantity` 是派生 / 缓存，不能伪造出货事实。
4. `purchase_order` 是否 V1 必做。
5. `purchase_receipts` 已存在，和 future `purchase_orders` 怎么关联。
6. 从 BOM 生成采购需求是否 V1 做，还是 V2 做。
7. 采购入库事实已经由 `purchase_receipts + inventory_txns` 承担。
8. `purchase_order` 不能替代 `purchase_receipt`。
9. Workflow 的采购跟进不能替代采购事实。
10. 财务应付不应从采购订单直接生成，至少要评审采购入库 / 对账口径。
11. sales order 的未出货数量如何从 shipment facts 重算。
12. purchase order 的未收货数量如何从 receipt facts 重算。
13. 出货放行和真实出货如何分离。
14. 采购下单和真实入库如何分离。

必须明确：

```text
sales_order = 业务承诺。
sales_order_item = 承诺明细。
purchase_order = 采购承诺。
purchase_receipt = 采购入库事实。
shipment = 出货事实。
inventory_txns = 库存落账事实。
AR/AP = 财务事实。
```

## 文档 5：domain-schema-draft-v1-v2.md

路径：

```text
docs/product/domain-schema-draft-v1-v2.md
```

这是 schema 草案，不是 Ent schema。

文件顶部必须写：

```text
Doc Type / 文档类型: Schema Draft
Status / 状态: Proposed / 候选
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否
```

必须列出候选表。

V1 候选：

- `customers`
- `suppliers`
- `contacts`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions` 可选
- BOM version 扩展可选

V2 候选：

- `purchase_orders`
- `purchase_order_items`
- `purchase_demands` 可选
- `supplier_material_profiles` 可选

V4 候选，仅记录，不在 V2 落：

- `stock_reservations`
- `shipments`
- `shipment_items`

每张表写：

- purpose
- category: MasterData / Source Document / Fact / Derived / Workflow / Config
- key fields
- relations
- status fields
- whether V1/V2/V4
- affects inventory?
- affects shipment?
- affects finance?
- depends on existing truth source?
- migration risk
- duplicate-design risk
- customer-coupling risk
- workflow-fact risk

必须明确：

```text
本文件不是实现。
本文件不代表 schema 已落地。
本文件不允许直接作为 migration 输入。
落 Ent schema 前必须经过 migration-readiness-checklist。
```

字段草案里不得出现 `tenant_id`。

如果需要提到租户：

```text
当前私有化阶段每客户一套数据库 / 对象存储 / 部署配置。
未来 SaaS 多租户另行评审。
```

## 文档 6：migration-readiness-checklist.md

路径：

```text
docs/product/migration-readiness-checklist.md
```

必须列出真正落 Ent schema 前要确认的事项：

1. 当前已有 schema 对象。
2. 是否重复已有真源。
3. 是否需要 data migration。
4. 是否会影响 `business_records`。
5. 是否需要 backfill。
6. 是否需要唯一索引。
7. 是否需要状态机。
8. 是否需要幂等键。
9. 是否影响库存。
10. 是否影响出货。
11. 是否影响财务。
12. 是否需要 RBAC 权限码。
13. 是否需要 API。
14. 是否需要 UI。
15. 是否需要 seed / demo / import。
16. 是否需要客户配置。
17. 是否需要测试。
18. 是否影响 current 客户资料分类。
19. 是否需要更新 `current-source-of-truth`。
20. 是否需要更新 `domain-model-v1`。
21. 是否需要更新 release gates。
22. 是否需要 migration 回滚计划。

每一项要提供检查问题和合格标准。

必须包含一个表格：

| Check | Question | Required Evidence | Stop If |
|---|---|---|---|

必须明确：

```text
如果无法证明不重复已有真源，则停止。
如果影响库存 / 出货 / 财务事实但没有架构评审，则停止。
如果 schema 草案包含 tenant_id，则停止。
如果只是 current 客户样本字段但被写成 Product Core，则停止。
```

## 文档 7：phase1-implementation-plan.md

路径：

```text
docs/product/phase1-implementation-plan.md
```

必须把后续实现拆成小 Codex goals：

- `002-schema-design-final-review`
- `003-customers-suppliers-ent-schema`
- `004-customers-suppliers-repo-usecase-tests`
- `005-product-skus-bom-version-schema-review`
- `006-sales-orders-schema`
- `007-sales-orders-usecase-status-machine`
- `008-api-rbac-for-masterdata-order`
- `009-frontend-v1-pages`
- `010-customer-data-import-draft`

每个 goal 写：

- objective
- allowed files
- forbidden files
- schema change yes/no
- migration yes/no
- runtime yes/no
- test commands
- stop conditions
- expected output
- review checklist

必须把大任务拆小。

不允许建议下一轮直接做：

```text
schema + migration + repo + usecase + API + UI + docs
```

必须按阶段拆：

```text
review -> schema -> migration -> repo -> usecase -> API/RBAC -> UI -> docs -> E2E
```

## 文档 8：phase1-risk-register.md

路径：

```text
docs/product/phase1-risk-register.md
```

必须列风险：

- customer coupling
- duplicate masterdata
- `business_records` shadow model
- Workflow / Fact confusion
- `tenant_id` creep
- over-generalized partner model
- product_sku over-design
- purchase_order vs purchase_receipt confusion
- shipped_quantity fake fact
- current customer Excel field hardcoding
- RBAC menu-only risk
- migration risk
- docs/code information gap
- UI text vs canonical status confusion
- source document vs fact confusion
- finance generated from wrong event
- order status overloaded

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- must-review-before-implementation

必须包含风险等级：

- High
- Medium
- Low

必须说明：

```text
High 风险不能进入 implementation goal。
必须先做架构评审或字段确认。
```

## 需要更新的已有文档

可以小幅更新：

### docs/current-source-of-truth.md

增加一段 Phase 1 说明：

```text
Phase 1 新增的是评审文档和 schema draft，不是 runtime 实现。
当前正式实现状态仍以现有代码、schema、migration、tests 为准。
```

### progress.md

增加本轮记录：

```text
Phase 1 masterdata / order / BOM / purchase review docs added.
No runtime/schema/migration changes.
```

### docs/product/domain-model-v1.md

如需要，可以增加链接到：

- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`

但不得把 draft 写成 implemented。

### docs/product/rewrite-roadmap.md

如需要，可以更新 Phase 1 下一步拆分，但不得承诺已经落 schema。

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

【Phase 1 核心结论】

【建议 V1/V2 表清单】

【明确不落地的内容】

【重复设计风险】

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
本轮新增文档清单
本轮没有修改的禁止路径
下一轮建议
```