Doc Type: Final Schema Design Review
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# Schema Design Final Review

本文件是 V1 Ent schema 实现前的最终文档评审，不代表 runtime、Ent schema、migration、API 或 UI 已实现。下一轮 Ent schema goal 只能落 `docs/product/v1-implementation-cutline.md` 明确允许的表。

核心口径：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
动作产生事实，事实推导结果。
结果可以缓存，但不能伪造事实。
```

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
quality task done != quality_inspection passed。
business_records 不替代正式事实表。
current 客户资料不等于 Product Core 真源。
```

## Final Decision Table

| Area | Decision | V1 | V2 | Deferred | Reason | Risk |
|---|---|---:|---:|---:|---|---|
| `customers` | Go | Yes | No | No | 客户交易主体是销售订单、出货和未来应收的稳定引用对象；不重复现有库存、BOM、采购事实真源。 | 与 `business_records` partners 双写风险，需迁移和退出计划。 |
| `suppliers` | Go | Yes | No | No | 供应商 / 加工厂主数据是采购、质检和未来应付的稳定引用对象；V1 只落最小主档。 | current 银行、开票、账期字段不得变必填。 |
| `contacts` | Go | Yes | No | No | 联系人是客户 / 供应商主数据的附属对象，V1 采用 `owner_type + owner_id` 文档口径。 | 跨 owner FK 无法一次表达，下一轮 schema 需用 check + usecase 守卫。 |
| `customer_addresses` | Draft Only | No | Yes | Yes | 地址类型、交付地址、开票地址和注册地址差异尚未确认。 | 过早落表会把 current 地址样本写成 Product Core。 |
| `supplier_material_profiles` | Draft Only | No | Yes | Yes | 供应商供货能力、价格、质检要求属于采购 / 供应商能力评审后续项。 | 可能重复 `materials` 或把供应商习惯写进核心。 |
| `settlement_terms` | Draft Only | No | Yes | Yes | 账期、付款方式、发票规则属于 finance review 候选，V1 不落。 | 未评审财务事实前容易误导 AR/AP 生成。 |
| `product_skus` | Draft Only | No | Candidate | Yes | 现有 `products` 已有 code/style_no/customer_style_no；SKU 是否影响订单、BOM、库存、出货粒度证据不足。 | 高重复风险；不能因 current Excel 颜色字段直接落 schema。 |
| `sales_orders` | Go | Yes | No | No | 销售订单是 Source Document，记录客户订单承诺，不是出货事实。 | 状态字段可能被误用为 shipped / finance status，需切分 lifecycle 和 derived status。 |
| `sales_order_items` | Go | Yes | No | No | 订单行记录承诺明细，引用现有 `products / units`，`product_sku_id` 本轮不进入 V1 必填。 | `shipped_quantity` 只能 derived/cache，不能手工伪造事实。 |
| `order_revisions` | Draft Only | No | Candidate | Yes | 订单变更需要审计和版本策略，但不能泛化成 ChangeUsecase。 | 容易滑向 `change_records` 泛化模块。 |
| BOM version extension | Draft Only | No | Candidate | Yes | 现有 `bom_headers.version/status/effective_*` 已是 BOM 主路径；扩展必须围绕现有 BOM。 | 重复设计 BOM 或破坏单产品 ACTIVE 唯一约束。 |
| `purchase_orders` | Draft Only | No | Yes | Yes | 采购订单是采购承诺，不是采购入库事实；当前已有 `purchase_receipts` 事实底座。 | PO 与 receipt 混淆会导致库存和 AP 失真。 |
| `purchase_order_items` | Draft Only | No | Yes | Yes | 采购承诺明细需在 V2 评审 receipt matching、价格、交期和供应商能力。 | received quantity 可能被伪造成事实。 |
| `purchase_demands` | Draft Only | No | Candidate | Yes | 采购需求是 planning / derived，需要 sales order + BOM + inventory planning 后再评审。 | 计划缓存被误当采购事实。 |
| `stock_reservations` | Deferred | No | No | Yes | 库存预留属于库存 / 出货事实层，需 Shipment / Inventory review。 | 影响 available quantity，不能由 workflow 或 order status 直接生成。 |
| `shipments` | Deferred | No | No | Yes | 出货事实必须由 ShipmentUsecase 和库存出库事实支撑。 | `shipping_released` 被误当 `shipped` 是高风险。 |
| `shipment_items` | Deferred | No | No | Yes | 出货行是 shipment fact 明细，需产品、仓库、批次、订单行和库存流水关系评审。 | 未评审前落表会伪造出库事实。 |
| AR/AP/invoice/payment/reconciliation | Deferred | No | No | Yes | 财务事实至少等 shipped / receipt / invoice / payment 生成时机评审后再落。 | 从 PO 或 shipping_released 直接生成财务事实会失真。 |
| `business_records` transition | Keep, restrict, transition | No | No | Yes | 继续作为兼容层、demo、seed、source snapshot 和调研入口；overlapping domains 限制新增核心能力。 | 正式表出现后两套 UI/API 双真源风险最高。 |

## 总判断

进入下一轮 Ent schema goal：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

只保留 draft：

- `product_skus`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`

必须等待后续 fact review：

- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

必须等待客户确认：

- SKU 是否代表稳定销售 / 生产规格粒度。
- 地址、账期、开票资料、银行账户是否是行业通用字段还是 current 客户样本。
- BOM 是否需要 SKU 粒度或更强版本快照。
- business_records 历史 partners / order snapshots 的迁移字段映射和失败样本处理。

不应该做：

- `tenant_id`
- SaaS runtime tenant tables
- license server tables
- billing / plan tables
- customer ticket tables
- generic `change_records`
- `ChangeUsecase`
- workflow-owned inventory / shipment / finance facts

## 状态与权限口径

后续每个 usecase 必须按以下顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

菜单权限不等于动作权限。前端隐藏按钮不是安全边界。后端 usecase 必须校验动作权限、数据范围和状态机。

UI 可显示 `shipping_released` 为“已放行 / 可发货 / 待出库”。UI 不得把 `shipping_released` 显示为“已出库 / 已发货 / 已扣库存”。`shipped` 才能代表真实出货完成，必须由 shipment facts / inventory_txns 支撑。
