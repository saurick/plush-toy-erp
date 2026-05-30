# Phase 1 Risk Register

## 规则

High 风险不能进入 implementation goal。必须先做架构评审或字段确认。

## 风险清单

| Risk | Level | Impact | Evidence | Mitigation | Owner Layer | Must Review Before Implementation |
| --- | --- | --- | --- | --- | --- | --- |
| customer coupling | High | current 客户字段、流程或报表写死进 Product Core | `docs/customers/current/*` 明确 current 只是种子客户和资料来源 | 所有 current 字段先分类，再决定 Product Core / Config / Material | Productization / MasterData | Yes |
| duplicate masterdata | High | 重复设计 `products/materials/units/warehouses/bom_*` 或 partners 影子主档 | 现有 Ent schema 已有这些对象；partners 仍是 business_records 兼容页 | schema final review 先对照现有 schema | MasterData | Yes |
| `business_records` shadow model | High | 正式主数据和旧快照双写，残值/缺值难查 | 当前页面仍用 `business_records` 保存通用业务记录 | 明确兼容期、迁移来源、退出路径和只读策略 | API / UI / Data | Yes |
| Workflow / Fact confusion | High | workflow done 直接扣库存、生成出货或财务 | `workflow.go` 已明确 shipment_release done 只到 shipping_released | 文档和测试持续锁定 Workflow 不写 Fact | Workflow / Fact | Yes |
| `tenant_id` creep | High | 提前进入 SaaS 多租户复杂度和 schema 污染 | Phase 0 文档只允许未来 SaaS 评审候选 | 当前私有化阶段每客户一套 DB / 对象存储 / 部署配置 | Productization / Data | Yes |
| over-generalized partner model | Medium | V1 schema、权限、迁移过度复杂 | current 只需要客户/供应商起步主数据 | 推荐 Option C：先分表，未来抽象 party | MasterData | Yes |
| product_sku over-design | High | SKU 变成 `products` 别名或影响库存粒度不清 | 现有 `products` 已有 code/style_no/customer_style_no | SKU 落 schema 前必须证明差异维度和下游影响 | MasterData / Inventory | Yes |
| purchase_order vs purchase_receipt confusion | High | 把采购承诺当入库事实，库存/应付失真 | `purchase_receipts` 已有 posted + inventory_txns 事实 | PO 放 V2，receipt 继续是入库事实 | Purchase / Inventory | Yes |
| shipped_quantity fake fact | High | 没有 shipment facts 却显示已出货 | Shipment facts 尚未落，`shipping_released != shipped` | shipped_quantity 只能 derived/cache，可从 shipments 重算 | Shipment / Order | Yes |
| current customer Excel field hardcoding | High | 客户样本字段污染通用 schema | source-materials 只允许作为线索 / seed / template candidate | 字段分类表和 migration checklist 拦截 | Productization / MasterData | Yes |
| RBAC menu-only risk | High | 前端隐藏菜单被误当安全边界 | 项目 RBAC 规则要求后端动作权限 | API 接入时补动作权限、数据范围和状态机测试 | RBAC / API | Yes |
| migration risk | High | 历史快照迁移出错、唯一约束冲突、无法回滚 | partners、orders 目前存在 business_records 快照 | dry-run、backfill、唯一键、回滚计划先行 | Data / Ops | Yes |
| docs/code information gap | Medium | 文档草案被误读为已实现 | Phase 1 是 docs-only，schema draft 非真源 | 每份草案顶部写 implemented=no，并同步 current-source-of-truth | Docs / QA | Yes |
| UI text vs canonical status confusion | Medium | 中文文案变化影响业务判断 | 既有状态分层文档要求 canonical key | UI 只显示文案，逻辑只认 key | UI / Workflow | Yes |
| source document vs fact confusion | High | 订单或采购单直接改变库存、出货、财务 | status boundary 文档明确 Source Document 记录承诺 | Source Document usecase 不写 Fact | Domain / Fact | Yes |
| finance generated from wrong event | High | 未 shipped 或未 receipt 即生成应收/应付/发票 | Finance 未开始，release gates 要求 shipped 后评审 | Finance goal 单独评审生成时机 | Finance | Yes |
| order status overloaded | High | 一个 status 同时承接审批、放行、履约、收款 | imported note 和正式文档都反对大而全 status | 拆 lifecycle、release、fulfillment、finance derived status | Order / Workflow / Finance | Yes |

## 当前最高优先级风险

1. `business_records` shadow model：V1 主数据和订单落地前，必须设计迁移和退出路径。
2. product_sku over-design：如果无法证明 SKU 与产品差异，先不落 schema。
3. Workflow / Fact confusion：任何后续订单、采购、出货实现都必须保持 `shipping_released != shipped`。
4. migration risk：正式 schema 不能只靠当前页面快照猜字段。

## Phase 2 Risk Closure Links

Phase 2 schema final review 已对上述 High 风险给出实现前限制，但未关闭全部风险：

- `business_records` shadow model：见 `docs/product/business-records-transition-plan.md`，下一步仍需引用审计和迁移 dry-run。
- product_sku over-design：见 `docs/product/v1-entity-decision-record.md` 和 `docs/product/v1-implementation-cutline.md`，当前结论为 Draft Only，不进下一轮 Ent schema。
- Workflow / Fact confusion：见 `docs/product/schema-design-final-review.md`，继续锁定 `shipping_released != shipped`。
- migration risk：见 `docs/product/v1-schema-go-no-go.md`，下一轮 schema 后仍需单独 migration/generate goal。
