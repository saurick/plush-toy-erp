# Phase 2D-C1 批次状态出库守卫

## 结论

Phase 2D-C1 只落地 `inventory_lots.status` 最小状态扩展和库存扣减守卫，不新增质检、冻结库存或前端入口。

- `inventory_lots.status` 继续使用 string 字段，不改 DB enum，不生成 migration。
- 新增业务状态常量：`ACTIVE / HOLD / REJECTED / DISABLED`。
- 有 `lot_id` 的普通扣减只允许 `ACTIVE` 批次。
- `PURCHASE_RETURN` 退供应商允许从 `ACTIVE / HOLD / REJECTED` 批次扣减。
- `REVERSAL` 不受当前批次状态阻断，保证取消链路可恢复。
- `lot_id = NULL` 的非批次库存暂不受批次状态管控。

最新 schema migration 仍是 `20260426095103_migrate.sql`。本轮没有 Ent schema 变化，因此没有新增 migration。

## 批次状态

| 状态 | 语义 | 普通扣减 | 采购退货扣减 |
| --- | --- | --- | --- |
| `ACTIVE` | 已释放，可用于普通出库、普通调整、生产领料等正常扣减。 | 允许 | 允许 |
| `HOLD` | 待检、复检、异常待判或临时冻结。 | 禁止 | 允许 |
| `REJECTED` | 质检不合格，等待退供应商、报废或让步处理。 | 禁止 | 允许 |
| `DISABLED` | 批次停用，不作为正常业务扣减对象。 | 禁止 | 禁止 |

新建批次默认仍为 `ACTIVE`。采购入库如果未来要默认生成 `HOLD` 批次，需要另行评审采购入库默认行为、质检放行路径和 API/RBAC，不在本轮改变。

## 出库守卫规则

库存扣减状态校验收口在库存流水引用校验路径：有 `lot_id` 时先确认批次主体与流水主体一致，再按 `txn_type / source_type / direction` 判断当前批次状态。

| 场景 | 规则 |
| --- | --- |
| 普通 `OUT` | `source_type != PURCHASE_RETURN` 时只允许 `ACTIVE` 批次。 |
| 普通 `ADJUST_OUT` | 只允许 `ACTIVE` 批次。 |
| 未来 `TRANSFER_OUT / PRODUCTION_ISSUE / SHIPMENT_OUT` | 如复用当前扣减路径，默认只允许 `ACTIVE` 批次。 |
| `PURCHASE_RECEIPT_ADJUSTMENT` 的 `QUANTITY_DECREASE` | 写 `ADJUST_OUT`，只允许 `ACTIVE` 批次。 |
| `PURCHASE_RECEIPT_ADJUSTMENT` 的 `LOT_CORRECTION_OUT / WAREHOUSE_CORRECTION_OUT` | 写 `ADJUST_OUT`，只允许 `ACTIVE` 批次；OUT 侧被状态拒绝时，整张调整单回滚，不写 IN 侧流水。 |
| `PURCHASE_RETURN` 的 `OUT` | 允许 `ACTIVE / HOLD / REJECTED`，拒绝 `DISABLED`。 |
| `REVERSAL` | 不检查当前 `lot.status`，但仍继承原流水 `lot_id` 并遵守幂等和余额规则。 |
| `lot_id = NULL` | 不做批次状态校验，仍按现有非批次余额规则执行。 |

采购退货例外只表示“不合格或待处理批次可以退供应商”，不表示这些批次可以被普通领用、普通出库或普通调整扣减。采购退货仍必须同时满足当前库存余额、批次维度、`effective_receipt_quantity` 和累计已退上限。

## 状态变更入口

本轮新增后端最小入口 `ChangeInventoryLotStatus(ctx, lotID, newStatus, reason)`，暂不接 JSON-RPC/API。

| 转换 | 本轮规则 |
| --- | --- |
| `ACTIVE -> HOLD` | 允许。 |
| `HOLD -> ACTIVE` | 允许。 |
| `HOLD -> REJECTED` | 允许。 |
| `REJECTED -> ACTIVE` | 允许，作为让步接收或复判放行的过渡能力；后续接质检时应由质检放行 / 让步接收控制。 |
| `ACTIVE / HOLD / REJECTED -> DISABLED` | 仅当该批次没有正数余额时允许，避免把仍有账面库存的批次停用后卡住正常处理。 |
| `DISABLED -> ACTIVE` | 本轮拒绝；若未来需要恢复停用批次，需补审计、权限和业务审批口径。 |

`reason` 当前仅作为后续 API 接入的调用参数预留；本轮不新增状态事件表、质检单或 audit 表，因此不持久化状态变更原因。

## REVERSAL 边界

`REVERSAL` 是对已过账库存事实的取消 / 纠正动作，不是新的当前业务领用许可。

- 采购入库取消对原 `IN` 写反向 `REVERSAL`，即使批次已变为 `HOLD / REJECTED / DISABLED` 也必须可取消。
- 采购退货取消对原 `OUT` 写反向 `REVERSAL`，不能因为批次当前不为 `ACTIVE` 而无法恢复库存。
- 采购入库调整取消对原 `ADJUST_IN / ADJUST_OUT` 逐条写 `REVERSAL`，继承原流水 `lot_id`。
- 重复取消仍按 `reversal_of_txn_id` 和幂等键防重，不重复影响余额。

## 非批次库存边界

`inventory_txns.lot_id = NULL` 表示非批次库存。本轮无法用 `inventory_lots.status` 控制非批次库存：

- 非批次库存继续只按 `subject_type + subject_id + warehouse_id + unit_id + lot_id(NULL)` 的余额规则扣减。
- 如果来料需要质检管控，应要求采购入库生成批次。
- 非批次库存不适合纳入来料质检状态守卫；后续如要支持，需要单独评审非批次冻结事实、库位或库存占用模型。

## 当前仍未做

| 暂不落地 | 说明 |
| --- | --- |
| `quality_inspections / quality_inspection_items` | 本轮只让批次状态真正影响扣减，不建质检主表或明细。 |
| `available_quantity / hold_quantity / reserved_quantity` | `inventory_balances` 仍只有账面 `quantity`。 |
| `stock_reservations` | 不做库存预留 / 占用。 |
| `warehouse_locations` | 不做库位。 |
| 供应商质量评级 | 不新增供应商质量统计或评级。 |
| 财务扣款 | 不接应付、发票、付款、红冲或财务核销。 |
| 生产、委外、品质完整模块 | 不扩展到完整生产领料、委外或品质流程。 |
| 前端 / API 接入 | 不改页面、菜单、JSON-RPC/API 或帮助中心。 |

后续如果接 API，需要补 `quality.inspection.*` 或 `inventory.lot.status.*` 权限守卫，并补状态变更审计或质检单真源。
