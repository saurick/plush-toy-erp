# Shipment / Inventory 出货事实边界评审

> 结论：当前 `InventoryUsecase` 已具备库存事实底座，可以承接“已明确出货行”的 `OUT` 扣减原语，但还不足以直接支撑真实出货扣减闭环。缺口不在单条库存流水，而在 shipment / outbound 事实输入、可用量、预留、冻结、库位和财务放行边界。第七条后端 workflow usecase 已把 `shipment_release done` 收口为“允许出货 / 出货放行”即 `shipping_released`，不直接等同 `shipped`。

## 1. 本轮范围

| 项 | 结论 |
| --- | --- |
| 是否改 Go / JS 运行时代码 | 只改 `WorkflowUsecase` 与真实移动端 follow-up 收口，不改库存事实代码。 |
| 是否实现 `shipment_release` 后端 rule | 已实现最小协同状态规则：`done -> shipping_released`，`blocked / rejected -> blocked`。 |
| 是否写 `inventory_txns / inventory_balances / inventory_lots` | 不写。 |
| 是否新增 reservation 表 | 不新增。 |
| 是否改 Ent schema / 生成 migration | 不改、不生成。 |
| 是否迁应收 / 开票 / 应付 / 对账 | 不迁。 |

本轮只落第七条 workflow 协同状态规则和对应前端运行时收口，不实现出货库存事实。`server/internal/biz/inventory_test.go` 当前不存在；库存相关测试集中在 `server/internal/data/inventory_repo_test.go` 和 `server/internal/data/inventory_postgres_test.go`。

## 2. InventoryUsecase 当前能力

| 能力 | 当前事实 | 评审 |
| --- | --- | --- |
| 流水语义 | `server/internal/biz/inventory.go` 定义 `IN / OUT / ADJUST_IN / ADJUST_OUT / TRANSFER_IN / TRANSFER_OUT / REVERSAL`。 | 已有出入库、调整、转移和冲正语义；没有单一 `ADJUST`，而是拆成入 / 出方向调整。 |
| 库存事实不可变 | `inventory_txns` 字段 immutable，hook 拒绝 update / delete。 | 符合库存事实追加模型，错误应走 `REVERSAL`。 |
| 余额并发更新 | `ApplyInventoryTxnAndUpdateBalance` 在 DB transaction 内新增流水并更新余额；入库走 upsert 累加，出库走条件更新。 | 可以防止并发出库把账面余额扣成负数。 |
| 防负库存 | 出库类 delta 使用 `UPDATE ... WHERE quantity + delta >= 0`，失败返回 `ErrInventoryInsufficientStock`。 | 已有账面余额防负库存。 |
| decimal 精度 | 数量字段使用 `decimal.Decimal`，PostgreSQL schema 为 `numeric(20,6)`。 | 不使用 float；后续 shipment 行仍需定义单位换算、舍入和小数位策略。 |
| 批次 | `inventory_lots` 支持 `subject_type + subject_id + lot_no`，`inventory_txns / inventory_balances` 均有 nullable `lot_id`。 | 已支持材料和成品批次维度；非批次库存和批次库存分开扣减。 |
| 冲正 / 取消基础 | `REVERSAL` 要求原流水、主体、仓库、单位、数量匹配且方向相反；同一原流水只能冲正一次。 | 有通用冲正原语；采购入库 / 采购退货 / 调整已各自实现取消。shipment 取消还没有专用用例。 |
| 幂等 | `idempotency_key` 唯一；重复提交返回已有流水。`source_type/source_id/source_line_id` 有索引。 | 真正幂等靠 `idempotency_key`，来源三元组当前只是追溯索引，不是唯一约束。shipment 行必须生成稳定幂等键。 |
| 仓库 | `warehouse_id` 是流水和余额必填维度。 | 支持仓库维度。 |
| 库位 | 未落 `warehouse_locations`，流水和余额无 `location_id`。 | 不能做精细库位扣减。 |
| 主体区分 | `subject_type` 支持 `MATERIAL / PRODUCT`；业务层校验 MATERIAL 指向 `materials.id`，PRODUCT 指向 `products.id`。 | 材料库存和成品库存可以共用同一套流水 / 余额 / 批次模型。 |
| 可用 / 预留 / 冻结 | `inventory_balances` 当前只有账面 `quantity`，没有 `reserved_qty / frozen_qty / available_qty`；无 `stock_reservations`。 | 只能做账面扣减，不能严格承诺可用量或锁库存。 |

结论：`InventoryUsecase` 可以作为出货扣减的底层库存事实能力，但当前不能直接从 `shipment_release` payload 写真实出货扣减。原因是 `shipment_release` 缺出货行真源，库存模型也缺预留 / 冻结 / 可用量事实。

## 3. 出货事实需要的结构化输入

| 字段 | 当前情况 | 结论 |
| --- | --- | --- |
| `product_id` | 当前 `shipment_release` 主要只有 `product_no / product_name` 展示快照。 | 缺失。真实出库必须指向 `products.id`。 |
| `sku_id` | 当前没有稳定 SKU 专表和字段。 | 缺失。若后续有 SKU，要先定义 SKU 与 product 的关系。 |
| `product_no / product_name` | `finishedGoodsFlow`、`businessRecordDefinitions` 和 debug seed 有文本快照。 | 只能用于回显，不可作为库存主体真源。 |
| `quantity` | 有展示数量或待出货数量。 | 只是快照；还缺最终出货行数量、部分出货、短溢装和 decimal 规则。 |
| `unit_id` | 库存流水必填，但 shipment payload 只有 `unit` 文本。 | 缺失。 |
| `unit` | 有文本快照。 | 只能显示，不能替代 `unit_id`。 |
| `warehouse_id` | 库存流水必填；当前只有 `warehouse_location` 文本。 | 缺失。 |
| `location_id` | schema 未落 `warehouse_locations`。 | 完全缺失。 |
| `lot_id` | 批次库存支持，但 shipment payload 没有稳定 `lot_id`。 | 缺失。 |
| `batch_no` | `item_name/spec` 或 `warehouse_location` 可能含文本线索。 | 只有展示线索，不是结构化批次。 |
| `source_type` | workflow task / business record 有来源。 | 有表头级来源；shipment 扣减还需正式来源类型。 |
| `source_id` | workflow task / business record 有来源 ID。 | 有表头级来源；不能替代行级幂等。 |
| `source_line_id` | 当前 `shipment_release` payload 没有稳定行 ID。 | 缺失。库存扣减必须有行级来源。 |
| `sales_order_id / order_id` | 当前多为 `source_no / order_no` 文本。 | 缺失结构化 ID。 |
| `shipment_id / shipment_line_id` | 当前没有正式 shipment / outbound 专表。 | 缺失。 |
| `customer_id` | 当前多为 `customer_name`。 | 缺失。财务和对账不能只依赖客户文本。 |
| `shipment_date` | `shipment_date / due_date / document_date` 有快照口径。 | 有展示字段，但还不是出库事实发生时间真源。 |
| `operator_id` | task 更新有 actor，但 shipment 行没有经手人字段。 | 缺失结构化字段。 |
| `available_qty` | 当前没有可用量模型。 | 缺失。 |
| `reserved_qty` | 当前没有 reservation 表或余额预留字段。 | 缺失。 |
| `frozen_qty` | 当前没有 frozen / hold 余额字段。 | 缺失。 |
| `finance_release_status` | 当前 shipment payload 没有财务放行状态。 | 缺失。 |

当前 `shipping-release` 通用记录只覆盖放行单号、来源订单、客户、产品名称、待出货数量、出货仓位和计划日期等展示字段；它不是库存扣减、出库、应收或开票事实真源。

## 4. `shipment_release done` 与 `shipped`

`shipment_release done` 不应默认等于 `shipped`。

| 语义 | 必要事实 | 当前是否具备 |
| --- | --- | --- |
| 允许出货 / 已放行 | 放行人、放行时间、放行原因、财务或业务限制、可用量检查结果。 | 只具备部分展示和任务完成信息。 |
| 已出货 / 已扣库存 | 出库单、shipment line、产品 ID、单位 ID、仓库 / 批次、出货数量、经手人、发生时间、库存 `OUT` 流水。 | 不具备。 |

旧前端 v1 曾在 `MobileRoleTasksPage.jsx` 中把 `shipment_release done` 本地推进为 `shipped`，并继续创建应收任务；这个语义过重。本轮已移除真实移动端运行时的这条 follow-up。更合理且当前已采用的拆分是：

1. `shipment_release done -> shipping_released`：表示允许出货，不写库存。
2. `shipment_execution done -> shipped + inventory OUT`：表示实际出库完成，写库存流水和余额。
3. `shipped -> receivable / invoice`：实际出货后再进入应收 / 开票。

当前已迁的 `shipment_release` 后端 rule 只做协同状态：`done -> shipping_released`，`blocked / rejected -> blocked`，强制 reason，不创建 DerivedTask，不写库存，不派生财务。

## 5. 可用量、预留和冻结

`available_qty = on_hand - reserved - frozen` 作为查询口径成立，但前提是三类量都有明确真源。

| 量 | 建议真源 | 当前状态 |
| --- | --- | --- |
| `on_hand` | `inventory_balances.quantity`，可由 `inventory_txns` 聚合校验。 | 已有。 |
| `reserved` | `stock_reservations` 或等价预留事实表，按来源行占用。 | 未落。 |
| `frozen` | `stock_holds / stock_reservations` 或明确冻结事实表，区分质检、财务、客户、异常冻结。 | 未落。 |
| `available` | 查询时计算，或余额表冗余并用一致性检查守护。 | 未落。 |

出货放行如果要承诺“可发”，应先 reserve，而不是仅检查当前账面余额。否则两个订单同时通过放行检查，最后只有先扣库存的一单成功，另一单会在执行时失败。

财务未放行是否 frozen，要看业务定义：

- 如果财务未放行是“订单不可出货”，应冻结订单对应库存或拒绝创建 reservation。
- 如果财务未放行只是任务状态，不应污染库存冻结量。
- 冻结必须有来源、释放条件和审计，不应藏在 workflow payload 里。

多订单抢同一批库存时，推荐由 reservation 表在同一 DB transaction 中原子占用，并用 active reservation 聚合防超占。出货取消释放 reservation；出货完成把 reservation 消耗为 `OUT`，并关闭 reservation。没有 reservation 表时，只能在实际 `OUT` 时防负库存，不能做严格可用量承诺。

## 6. 三种方案评审

| 方案 | 评审 | 结论 |
| --- | --- | --- |
| A：`WorkflowUsecase` 不写库存，只触发 `InventoryUsecase.Outbound` | 技术上可以调用库存扣减，但 workflow event、业务状态和库存流水必须在一个清晰 transaction 边界内一致。当前 `WorkflowUsecase` 与 `InventoryUsecase` 的 repo transaction 没有统一外层业务事务接口，且 shipment payload 缺出货行事实。 | 不作为首选；容易把协同任务变成库存事实入口。 |
| B：独立 `ShipmentUsecase / InventoryUsecase` 先完成出货事实，再由 workflow 只读结果 | shipment / outbound 专用 usecase 负责 shipment document、出货行、reservation、执行、取消和 `OUT / REVERSAL`；`InventoryUsecase` 负责库存事实原语；`WorkflowUsecase` 只推进协同状态或读事实结果。 | 推荐。边界清楚，后续可测试、可审计、可扩展。 |
| C：前端继续直接创建财务 / 出货任务 | 当前前端 v1 能跑展示链路，但会绕过后端事实边界，且已与新项目后端 usecase 迁移方向冲突。 | 不推荐。后续迁入后应移除真实运行时 follow-up，避免双写。 |

推荐方案 B：先定义 ShipmentUsecase 的事实边界，再让它调用 InventoryUsecase 的库存事实能力。`WorkflowUsecase` 后续只承担 `shipment_release` 的协同状态推进，不直接承担库存扣减和财务派生。

## 7. 应收 / 开票前置条件

应收建议在 `shipped` 后生成，而不是 `shipment_release` 后生成。`shipment_release` 只是放行时，客户债权通常还未成立；只有实际出货完成后，才具备应收基础。

开票不应只依赖 `shipment_release done` 或 `receivable_registration done` 任务状态。至少需要：

- 客户 ID、销售订单 / 合同、shipment / outbound 行。
- 出货数量、单价、金额、税率、含税 / 不含税金额。
- 开票申请、发票类型、发票号、红冲 / 作废边界。
- `sales_order / shipment / ar_receivable / ar_invoice` 或等价专表真源。

当前 `shipmentFinanceFlow.mjs` 是前端 v1 任务流：`shipped -> receivable_registration -> invoice_registration`。它可以继续作为展示、调试或临时手动入口辅助，但不应作为财务事实真源。

## 8. 当前前端 v1 follow-up 位置

| 路径 | 当前 follow-up |
| --- | --- |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | 真实移动端 `shipment_release done / blocked / rejected` 只调用 `updateWorkflowTaskStatus` 并刷新；已移除本地 `shipped` 推进、warehouse / finance 状态 upsert 和 `receivable_registration` 创建。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | `runFinishedGoodsFollowUp` 对 warehouse `shipment_release` 直接返回；提交任务 payload 不再写入 `shipment_result=shipped`，done 分支只写 `shipment_release_result=done`。 |
| `web/src/erp/utils/shipmentFinanceFlow.mjs` | `isShipmentCompletedRecord` 认 `business_status_key=shipped`、`payload.shipment_result=shipped` 或 `payload.shipped=true`；`buildReceivableRegistrationTask` 再创建应收任务，`buildInvoiceRegistrationTask` 创建开票任务。 |
| `web/src/erp/pages/BusinessModulePage.jsx` | 桌面业务页保留手动“发起应收登记 / 发起开票登记”入口；发起应收不再允许以最新 `shipment_release` 任务已 done 作为真实 `shipped` 前置。 |
| `server/internal/biz/debug_seed.go` | debug seed 可生成 `shipment_release`、`warehouse_outbound`、应收和开票样本；这些只是开发验收样本，不是运行时真源。 |
| `web/src/erp/utils/finishedGoodsFlow.mjs` | `buildShipmentReleaseTask` 构造出货放行任务，payload 仍是展示快照；`resolveFinishedGoodsTaskBusinessStatus` 已把 `shipment_release done` 映射为 `shipping_released`。 |

这些位置已按第七条规则完成运行时收口；`shipmentFinanceFlow.mjs` 仍可保留给 seed / test / demo / 手动财务入口，但不是真实 `shipment_release done` 的 follow-up。

## 9. 下一轮最小落地建议

推荐按下面顺序推进：

1. 先补出货事实设计，不动 workflow：确定 shipment / outbound header 和 line 的唯一真源、字段、状态、幂等键和取消 / 冲正语义。
2. 决定是否新增 `ShipmentUsecase`：推荐新增，用它承接 shipment document、reservation、出货执行和取消；`InventoryUsecase` 只暴露库存事实原语。
3. 设计 reservation / frozen：至少明确 `on_hand / reserved / frozen / available` 的来源、释放条件和并发策略；没有 reservation 表前，不承诺严格可用量。
4. `shipment_release` 最小协同状态已迁：只做 `done -> shipping_released`、`blocked / rejected -> blocked`，并已移除移动端真实运行时本地 `shipped` 和应收派生 follow-up。
5. 实现 `shipment_execution` 或 outbound 完成：由 ShipmentUsecase 在同一业务事务内写出货事实和 `inventory_txns.OUT`，失败时整体回滚；取消写 `REVERSAL` 并释放 reservation。
6. 最后再评审应收 / 开票：基于 `shipped` 和正式 shipment / receivable / invoice 事实推进，不从 `shipment_release` 直接派生。

## 10. 本轮未做

- 已改 Go / JS 运行时代码，但只限第七条 workflow 协同状态规则和移动端真实 follow-up 收口。
- 已实现 `shipment_release` 最小后端 rule：`done -> shipping_released`，`blocked / rejected -> blocked`。
- 没有写 `inventory_txns`、更新 `inventory_balances` 或创建 `inventory_lots`。
- 没有新增 `stock_reservations`、`warehouse_locations` 或 shipment / finance 专表。
- 没有改 Ent schema。
- 没有生成 migration。
- 没有执行 `make data / make migrate_status / ent_migrate`。
- 没有推进 `shipped`，没有派生应收、开票、应付或对账。
