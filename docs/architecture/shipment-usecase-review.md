# ShipmentUsecase / 出货事实最小模型评审

> 结论：建议新增或明确 `ShipmentUsecase`。`WorkflowUsecase` 只负责协同任务状态，`InventoryUsecase` 只负责库存流水、余额、批次、防负库存、冲正和幂等等库存事实原语；出货单据、出货行、预留 / 冻结、出货放行、实际出货、取消 / 冲正和 `shipped` 确认应由 `ShipmentUsecase` 统一承接。`shipment_release done` 不等于 `shipped`，最小语义应是 `shipping_released`；实际 `shipment_execution / outbound done` 才能写 `inventory_txns.OUT` 并推进到 `shipped`。

## 1. 本轮范围

| 项 | 本轮结论 |
| --- | --- |
| 是否实现 `ShipmentUsecase` | 不实现，只评审职责和最小模型。 |
| 是否实现 `shipment_release` 后端 rule | 已实现最小 workflow 协同状态规则：`done -> shipping_released`，`blocked / rejected -> blocked`。 |
| 是否新增 `shipments / shipment_items / reservations` schema | 不新增。 |
| 是否改 Ent schema / 生成 migration | 不改、不生成。 |
| 是否写 `inventory_txns` 或更新 `inventory_balances` | 不写、不更新。 |
| 是否迁应收 / 开票 / 应付 / 对账 | 不迁。 |

## 2. 当前代码事实

| 位置 | 当前事实 | 评审影响 |
| --- | --- | --- |
| `server/internal/biz/workflow.go:64-84` | 业务状态字典已有 `shipping_released` 和 `shipped`，含义分别是“已放行待出库”和“已出货”。 | 状态词已经支持拆分放行与实际出货，不需要把 `shipment_release done` 复用成 `shipped`。 |
| `server/internal/biz/workflow.go` | `WorkflowUsecase.UpdateTaskStatus` 已新增第七条 `shipment_release done / blocked / rejected` 特殊规则，只推进 `shipping_released / blocked` 协同业务状态。 | 出货放行已迁入后端 workflow，但仍不是 shipment / outbound 事实，也不等于 `shipped`。 |
| `server/internal/biz/workflow.go:652-667`、`1292-1313` | 成品入库完成只推进 `inbound_done`，payload 标记 `inventory_balance_deferred` 和 `shipment_release_deferred`。 | 成品入库不写库存，也不派生出货放行，符合“出货单独评审”的边界。 |
| `server/internal/data/workflow_repo.go:130-221` | workflow 状态更新在事务内写任务、事件、业务状态和下游任务。 | 适合协同状态一致性，不适合直接承接库存扣减和出货行事实。 |
| `server/internal/biz/inventory.go:28-38` | 库存流水类型包括 `IN / OUT / ADJUST_IN / ADJUST_OUT / TRANSFER_IN / TRANSFER_OUT / REVERSAL`。 | `InventoryUsecase` 已具备出货扣减所需的 `OUT` 和取消冲正所需的 `REVERSAL` 原语。 |
| `server/internal/biz/inventory.go:137-198` | 库存流水有 `subject_type / subject_id / warehouse_id / lot_id / quantity / unit_id / source_type / source_id / source_line_id / idempotency_key`。 | 出货扣减必须提供结构化产品、仓库、批次、单位和行级来源；当前 `shipment_release` 展示快照不足。 |
| `server/internal/data/inventory_repo.go:150-223`、`278-298` | `ApplyInventoryTxnAndUpdateBalance` 在库存事务内写流水并更新余额；负向扣减通过条件更新防负库存。 | 可以作为 `ShipmentUsecase.PostOutbound` 的底层能力，但跨 usecase 需要统一事务边界。 |
| `server/internal/data/model/schema/inventory_txn.go:19-29`、`124-130` | `inventory_txns` 不可更新 / 删除，`idempotency_key` 唯一，`reversal_of_txn_id` 唯一。 | 出货错误应追加 `REVERSAL`，不能改历史流水；重复出库要靠稳定幂等键。 |
| `server/internal/data/model/schema/inventory_balance.go:17-36` | `inventory_balances` 当前只有账面 `quantity`，没有 `reserved_qty / frozen_qty / available_qty`。 | 当前只能在实际 OUT 时防负库存，不能严格承诺可用量。 |
| `web/src/erp/config/businessRecordDefinitions.mjs:528-589` | `shipping-release` 和 `outbound` 通用记录只有单号、客户、产品名称、数量、仓位等展示字段。 | 通用业务记录不是正式 shipment / outbound 行事实真源。 |

## 3. 是否建议新增 ShipmentUsecase

建议新增或明确 `ShipmentUsecase`，并把它作为真实出货动作的唯一后端真源。

| Usecase | 推荐职责 | 不应承担 |
| --- | --- | --- |
| `WorkflowUsecase` | 任务状态、事件、协同业务状态；当前 `shipment_release` 只做 `done -> shipping_released`、`blocked/rejected -> blocked`。 | 不直接写库存流水、余额、reservation、应收或开票。 |
| `InventoryUsecase` | 库存事实原语：`OUT`、`REVERSAL`、余额原子更新、防负库存、批次校验、幂等。 | 不理解出货单状态、客户、订单、部分出货、取消出货业务语义。 |
| `ShipmentUsecase` | `shipment document`、`shipment lines`、出货状态、放行、预留 / 冻结、出货执行、取消 / 冲正、`shipped` 确认，并在需要时调用库存原语。 | 不生成应收 / 开票事实，不替代财务专表。 |

推荐原因：出货既不是单纯 workflow 状态，也不是单条库存流水。它需要单据头、行、库存占用、实际出库、部分出货、取消和财务前置条件的统一业务事务；这些语义放进 `WorkflowUsecase` 会过重，放进 `InventoryUsecase` 又会污染库存原语。

## 4. 最小出货事实模型

### 4.1 `shipments`

建议作为出货单据头真源，至少包含：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键。 |
| `shipment_no` | 出货单号，唯一。 |
| `source_type`、`source_id` | 来源单据头，例如销售订单、生产进度、出货申请或通用记录。 |
| `customer_id`、`customer_name` | `customer_id` 是后续财务和对账真源；`customer_name` 是快照。 |
| `sales_order_id / order_id` | 订单或合同来源。 |
| `status` | 建议最小状态：`DRAFT / RELEASED / PARTIALLY_SHIPPED / SHIPPED / CANCELLED / REVERSED`。 |
| `release_status` | 出货放行状态：`PENDING / RELEASED / BLOCKED / REJECTED / CANCELLED`。 |
| `finance_release_status` | 财务放行或冻结状态，不能只靠 workflow task 文案。 |
| `planned_ship_date`、`shipped_at`、`cancelled_at` | 计划出货、实际出货、取消时间。 |
| `created_by`、`updated_by` | 审计。 |
| `idempotency_key` | 创建或导入防重；可结合来源唯一约束。 |
| `metadata / payload` | 展示快照和扩展字段，不作为结构化库存字段替代品。 |

### 4.2 `shipment_items`

建议作为出货行真源，至少包含：

| 字段 | 说明 |
| --- | --- |
| `id`、`shipment_id` | 行主键和单据头外键。 |
| `source_line_id` | 来源订单行或业务记录行；用于追溯和幂等。 |
| `product_id / sku_id` | 库存主体真源；`product_no / product_name` 只做快照。 |
| `quantity` | 计划出货数量，decimal/numeric。 |
| `unit_id / unit` | `unit_id` 是库存单位真源；`unit` 是快照。 |
| `warehouse_id` | 出货仓库，必须结构化。 |
| `location_id` | 当前项目未落 `warehouse_locations`，可先为空或用默认库位，但字段设计应预留。 |
| `lot_id / batch_no` | 批次真源和批次快照；有批次扣减时必须使用 `lot_id`。 |
| `shipped_quantity` | 已出货数量，支持部分出货。 |
| `reserved_quantity` | 已预留数量，来自 reservation 聚合或同步字段。 |
| `frozen_quantity` | 被冻结数量，来自 hold / frozen 事实聚合或同步字段。 |
| `status` | 行状态：`PENDING / RESERVED / RELEASED / PARTIALLY_SHIPPED / SHIPPED / CANCELLED`。 |
| `idempotency_key` | 行级防重。 |
| `metadata / payload` | 展示和外部字段快照。 |

### 4.3 `stock_reservations` 或 `shipment_reservations`

如果 `shipment_release` 要表达“库存已锁定、可以承诺发货”，建议引入 reservation 事实表：

| 字段 | 说明 |
| --- | --- |
| `id` | 主键。 |
| `source_type`、`source_id`、`source_line_id` | 占用来源。 |
| `shipment_id`、`shipment_item_id` | 出货单据和行。 |
| `subject_type=PRODUCT`、`subject_id=product_id / sku_id` | 库存主体。 |
| `warehouse_id`、`location_id`、`lot_id` | 占用维度。 |
| `reserved_quantity` | 已占用数量。 |
| `frozen_quantity` | 如共表表达冻结，需要区分原因；也可以拆到 `stock_holds`。 |
| `status` | `ACTIVE / CONSUMED / RELEASED / CANCELLED / EXPIRED`。 |
| `released_at`、`consumed_at`、`cancelled_at` | 释放、消耗、取消时间。 |
| `idempotency_key` | 占用防重。 |

如果暂时不做 reservation 表，则只能采用弱模型：

- 只能在实际 `OUT` 时防负库存。
- 不能严格承诺 `available_qty`。
- 不能解决多订单同时抢同一批库存。
- `shipment_release done` 只能表示弱放行，不能表示库存锁定。

## 5. available / reserved / frozen 口径

| 量 | 推荐定义 |
| --- | --- |
| `on_hand` | 来自 `inventory_balances.quantity`，表示账面现存量。 |
| `reserved` | 来自 active `stock_reservations` 聚合，按 `subject + warehouse + location + lot + unit` 维度占用。 |
| `frozen` | 来自显式 hold / frozen 事实，来源可以是质量、财务、仓库异常或客户锁定；必须有来源、释放条件和审计。 |
| `available_qty` | `on_hand - reserved - frozen`。查询可以实时聚合，若冗余到余额表必须有一致性校验。 |

`shipment_release done` 是否创建 reservation，取决于业务语义：

- 如果只是“业务 / 财务允许出货”，不应创建 reservation，只写 `shipping_released`。
- 如果承诺“这批库存已经锁给该出货单”，则应由 `ShipmentUsecase.ReleaseShipment` 在事务内创建 reservation，并校验 `available_qty >= reserved_quantity`。

财务未放行不应默认污染全仓库存冻结量。更稳的做法是：财务未放行时拒绝 release / reservation；只有业务明确要求“客户或订单锁定库存但暂不可发”时，才创建带来源的 frozen / hold 事实。取消出货应释放 active reservation；实际 shipped 应 consume reservation 并写 `OUT`。部分出货时，按行累计 `shipped_quantity`，reservation 可部分 consume，剩余数量继续 active、释放或拆分到下一张出货单。

## 6. `shipment_release done` 与 `shipped`

必须拆开：

| 动作 | 推荐业务状态 | 是否写库存 |
| --- | --- | --- |
| `finished_goods_inbound done` | `inbound_done` | 不写库存，不派生出货。 |
| `shipment_release done` | `shipping_released` | 不写库存，不派生应收 / 开票。 |
| `shipment_execution / outbound done` | `shipped` | 写 `inventory_txns.OUT`，更新 `inventory_balances`，更新 shipment 行和头状态。 |
| `shipped` 后 | 待 AR / invoice 专项评审 | 不从 `shipment_release` 直接生成财务事实。 |

旧前端 v1 曾把 `shipment_release done` 直接推进 `shipped`，语义过重。本轮已移除真实运行时的本地 follow-up，不能再保留双写。

## 7. 出货扣减事务边界

推荐由 `ShipmentUsecase.PostOutbound` 承接实际出货。它应在一个数据库事务内完成：

1. 校验 shipment 头状态：已放行、未取消、未全量出货。
2. 校验 shipment line：数量、单位、产品、仓库、批次、剩余可出货数量。
3. 校验 reservation 或 available：有 reservation 时 consume；无 reservation 的弱模型只能在 `OUT` 时防负库存。
4. 写 `inventory_txns.OUT`。
5. 更新 `inventory_balances`。
6. 更新 `shipment_items.shipped_quantity / status`。
7. 更新 `shipments.status / shipped_at`。

事务实现上不建议让 `WorkflowUsecase` 调一个会自己开启独立事务的库存方法后再单独更新 shipment。需要统一外层事务，或者提供 tx-aware 的库存 repo 原语，让 shipment 头、行、reservation、`inventory_txns` 和 `inventory_balances` 同提交、同回滚。

取消和冲正建议：

- 未出货取消：关闭 shipment，释放 reservation，不写 `REVERSAL`。
- 已部分或全部出货后取消 / 冲正：对已写的 `OUT` 追加 `REVERSAL`，恢复余额；同步回退 shipment item 的 shipped 数量和状态。
- 重复提交：优先用 `idempotency_key` 防重；同时建议对 `source_type + source_id + source_line_id + txn_type` 或 `shipment_item_id + outbound_posting_id` 建唯一约束。
- 并发控制：对同一 `PRODUCT + warehouse + location + lot + unit` 的 reservation 和余额扣减要串行化。可用行级锁、条件更新、DB unique constraint；必要时使用 advisory lock，但不能只靠应用内查询后判断。

当前 `inventory_txns.source_type/source_id/source_line_id` 只有普通索引，`idempotency_key` 才是唯一防重；后续 shipment 行必须生成稳定幂等键。

## 8. 应收 / 开票触发时机

应收不应该在 `shipment_release done` 后生成，至少应在 `shipped` 后生成。开票至少需要：

- 客户 ID。
- 订单 / 合同。
- 出货事实头和行。
- 出货数量、金额、单价、币种、税率、含税 / 不含税金额。
- 发票申请。
- `ar_receivable / ar_invoice` 专表或等价财务真源。

`shipmentFinanceFlow.mjs` 当前只是前端 v1 编排：`shipped -> receivable_registration -> invoice_registration`。它可以继续作为 seed / test / demo / 临时手动入口辅助，但不是财务事实真源。

## 9. 当前前端 v1 follow-up 位置

| 位置 | 当前行为 | 后续迁入后的处理 |
| --- | --- | --- |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | warehouse 移动端完成 `shipment_release done / blocked / rejected` 后只调用 `updateWorkflowTaskStatus` 并刷新任务列表；已移除 `completeShipmentReleaseTask` 真实运行时 follow-up。 | 真实移动端动作不再本地推进 `shipped`、upsert warehouse / finance 状态或创建应收任务。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | `runFinishedGoodsFollowUp` 对 warehouse `shipment_release` 直接 return。 | `shipment_release` 已迁入后端后不再本地推进 shipped。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | 移动端提交 `shipment_release done` 时 payload 写 `shipment_release_result=done`，不再写 `shipment_result=shipped`。 | 前端不再伪造实际 shipped 事实。 |
| `web/src/erp/utils/finishedGoodsFlow.mjs:303-332` | `buildShipmentReleaseTask` 构造出货放行任务，payload 仍是展示快照。 | 可保留给 seed / test / demo / 展示辅助。 |
| `web/src/erp/utils/finishedGoodsFlow.mjs` | `resolveFinishedGoodsTaskBusinessStatus` 把 `shipment_release done` 映射为 `shipping_released`。 | helper 可用于 seed / test / demo / 展示辅助，但不再把放行当作 shipped。 |
| `web/src/erp/utils/shipmentFinanceFlow.mjs:162-170` | 认定 `business_status_key=shipped`、`payload.shipment_result=shipped` 或 `payload.shipped=true` 为已出货。 | 只能基于真实 `shipped` 事实触发财务。 |
| `web/src/erp/utils/shipmentFinanceFlow.mjs:235-298` | 构造 `receivable_registration` 和 `invoice_registration` 任务。 | 财务事实专表评审前仅作为前端 v1 编排。 |
| `web/src/erp/pages/BusinessModulePage.jsx` | 手动发起应收不再允许最新 `shipment_release` 已 `done` 作为真实 `shipped` 前置。 | 本轮不迁手动财务入口，但避免扩大 shipment_release 语义。 |
| `web/src/erp/pages/BusinessModulePage.jsx:2599-2658` | 手动发起开票：从应收记录推进到 `reconciling` 并创建开票任务。 | 等 AR / invoice 专项评审后迁移。 |
| `web/src/erp/pages/BusinessModulePage.jsx:3470-3517` | 桌面按钮展示“发起应收登记 / 发起开票登记”。 | 本轮只记录，不移除。 |
| `server/internal/biz/debug_seed.go:636-690` | debug seed 生成 `shipping-release`、`outbound`、`shipment_release`、`warehouse_outbound`、应收、开票样本。 | 仅开发验收样本，不是运行时真源。 |
| `web/src/erp/config/seedData.mjs:2224-2248` | 帮助 / 演示导航仍有“生产到出货”和“出货到应收/开票”条目。 | 只作为展示辅助，不是后端事实。 |

本轮只记录这些位置，不移除运行时代码。

## 10. 下一轮最小落地建议

推荐路线：

1. `ShipmentUsecase / Shipment schema` 评审：先定头、行、状态、幂等、取消 / 冲正和权限边界。
2. 落最小 `shipments / shipment_items / reservation` 方案；如果暂不做 reservation，明确这是弱模型，只能实际 OUT 防负库存。
3. `InventoryUsecase` 支持 `PRODUCT OUT` with shipment source：稳定 `source_type/source_id/source_line_id/idempotency_key`。
4. `shipment_release` 最小后端 rule 已落地：`done -> shipping_released`，`blocked/rejected -> blocked`，不写库存，不派生应收 / 开票。
5. `shipment_execution / outbound done -> shipped + inventory OUT`：由 `ShipmentUsecase` 在统一事务里完成出货事实和库存扣减。
6. `shipped` 后再专项评审 AR / invoice，不从 `shipment_release` 直接迁财务。

## 11. 本轮未做

- 没有实现 `ShipmentUsecase`。
- 已实现 `shipment_release` 最小后端 workflow rule，但没有实现 shipment / outbound 事实。
- 没有写 `inventory_txns`。
- 没有更新 `inventory_balances`。
- 没有创建 `inventory_lots`。
- 没有新增 `shipments / shipment_items / reservations` schema。
- 没有改 Ent schema。
- 没有生成 migration。
- 没有运行 `make data / make migrate_status / ent_migrate`。
- 没有推进 `shipped`，没有迁应收、开票、应付或对账。
