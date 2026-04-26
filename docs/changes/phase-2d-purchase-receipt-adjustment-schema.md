# Phase 2D-B1 采购入库调整单最小闭环

## 结论

Phase 2D-B1 落地 `docs/architecture/phase-2d-purchase-receipt-adjustment-review.md` 推荐的采购入库调整方案：

- 新增 `purchase_receipt_adjustments` 作为采购入库调整单头专表。
- 新增 `purchase_receipt_adjustment_items` 作为采购入库调整行专表。
- 采购入库调整只处理已过账采购入库后的数量类差异和 `lot / warehouse` 维度更正。
- 调整过账写 `inventory_txns.ADJUST_IN / ADJUST_OUT` 并更新 `inventory_balances`。
- 取消已过账调整对本调整产生的库存流水逐条写 `REVERSAL`。
- 采购退货的原入库行可退上限已从原始入库行数量升级为 `effective_receipt_quantity`。

本轮 migration 为：

- `20260426095103_migrate.sql`：新增 `purchase_receipt_adjustments / purchase_receipt_adjustment_items`。

## 新增专表

| 表 | 定位 | 关键约束 |
| --- | --- | --- |
| `purchase_receipt_adjustments` | 采购入库调整单头，保存调整单号、原采购入库单、可选通用快照、原因、状态、调整时间和过账时间。 | `adjustment_no` 唯一；`status` 为 `DRAFT / POSTED / CANCELLED`；索引 `purchase_receipt_id / business_record_id / status / adjusted_at`；`purchase_receipt_id -> purchase_receipts.id` 使用 `ON DELETE NO ACTION`。 |
| `purchase_receipt_adjustment_items` | 采购入库调整行，保存原采购入库行、调整类型、材料、仓库、单位、批次、数量、来源行号和更正分组。 | `quantity > 0`；`adjustment_id + source_line_no` 在非空范围内唯一；`purchase_receipt_item_id -> purchase_receipt_items.id` 使用 `ON DELETE NO ACTION`；`lot_id -> inventory_lots.id` 使用 `ON DELETE NO ACTION`。 |

数量继续使用 `numeric(20,6)` / `decimal.Decimal`，不使用 float。本轮不新增 `unit_price / amount`，也不改变采购入库或采购退货既有金额字段语义。

## 业务边界

| 本轮支持 | 本轮不支持 |
| --- | --- |
| 已过账采购入库后的数量增加。 | 金额差异、单价更正、应付、发票、付款、财务核销。 |
| 已过账采购入库后的数量减少。 | 完整采购订单、采购合同、审批流、供应商主数据。 |
| 批次 `lot_id` 填错后用一出一入两行更正。 | `quality_inspections`、来料质检、可用库存、冻结库存、预留库存。 |
| 仓库 `warehouse_id` 填错后用一出一入两行更正。 | 通用 `inventory_adjustments`、生产、委外、品质模块。 |
| 取消已过账调整并写冲正流水。 | `warehouse_locations`、`stock_reservations`、`product_styles`、分区 migration、几十亿级压测。 |

采购入库调整不是采购退货，也不是整单取消入库：

- `CancelPostedPurchaseReceipt` 表示整张已过账入库单不成立，对原 `PURCHASE_RECEIPT` 入库流水写冲正。
- `PurchaseReturn` 表示已入库后退回供应商，过账写 `OUT`。
- `PurchaseReceiptAdjustment` 表示纠正已过账采购入库后的数量或库存维度差异，过账写 `ADJUST_IN / ADJUST_OUT`。

## 状态机

| 状态 | 行为 |
| --- | --- |
| `DRAFT` | 可通过 `AddPurchaseReceiptAdjustmentItem` 新增调整行，不写库存流水。 |
| `POSTED` | 由 `PostPurchaseReceiptAdjustment` 从 `DRAFT` 进入；过账后禁止新增行，重复 post 幂等返回，不重复写库存。 |
| `CANCELLED` | 由 `CancelPostedPurchaseReceiptAdjustment` 从 `POSTED` 进入；取消时写 `REVERSAL`，重复 cancel 幂等返回，不重复冲正；取消后不能再次 post。 |

本轮明确拒绝 `DRAFT` cancel。状态只能通过 `PostPurchaseReceiptAdjustment / CancelPostedPurchaseReceiptAdjustment` 变化，不通过普通 Ent update 修改。

## source 与幂等规则

| 场景 | 规则 |
| --- | --- |
| 调整过账 `source_type` | `PURCHASE_RECEIPT_ADJUSTMENT`。 |
| 调整过账 `source_id` | `purchase_receipt_adjustments.id`。 |
| 调整过账 `source_line_id` | `purchase_receipt_adjustment_items.id`。 |
| `QUANTITY_INCREASE` | 写 `txn_type = ADJUST_IN`，`direction = 1`。 |
| `QUANTITY_DECREASE` | 写 `txn_type = ADJUST_OUT`，`direction = -1`。 |
| `LOT_CORRECTION_IN / WAREHOUSE_CORRECTION_IN` | 写 `ADJUST_IN`。 |
| `LOT_CORRECTION_OUT / WAREHOUSE_CORRECTION_OUT` | 写 `ADJUST_OUT`。 |
| 过账幂等键 | `PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:{txn_type}`。 |
| 取消幂等键 | `PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:REVERSAL:{original_txn_id}`。 |

`REVERSAL` 继承原调整流水的 `lot_id / warehouse_id / unit_id / quantity`，不能把批次冲正成非批次，也不能把一个仓库的更正冲回另一个仓库。

## 有效入库数量

`effective_receipt_quantity` 是原采购入库行当前可用于累计退货上限判断的数量：

```text
effective_receipt_quantity =
  purchase_receipt_items.quantity
  + 已 POSTED 且未 CANCELLED 的 QUANTITY_INCREASE 数量
  - 已 POSTED 且未 CANCELLED 的 QUANTITY_DECREASE 数量
```

规则：

- `LOT_CORRECTION_OUT / LOT_CORRECTION_IN` 不改变总有效入库数量。
- `WAREHOUSE_CORRECTION_OUT / WAREHOUSE_CORRECTION_IN` 不改变总有效入库数量。
- `CANCELLED` adjustment 不计入有效入库数量。
- 当前正在 post 的 adjustment 会排除自身已存在的 posted 行，并合并本 adjustment 内同一 `purchase_receipt_item_id` 的多行净影响。
- PostgreSQL 路径下，调整过账、调整取消和采购退货过账会按 `purchase_receipt_item_id` 加 `FOR UPDATE` 锁，避免并发超调有效入库数量；库存余额扣减仍由 `quantity + delta >= 0` 的原子 update 防负库存。
- 过账数量减少时，调整后的有效入库数量不得小于 0。
- 过账数量减少时，调整后的有效入库数量不得小于该原入库行累计有效退货数量。
- 取消已过账调整时也会校验取消后的有效入库数量不得小于累计有效退货数量，避免取消 `QUANTITY_INCREASE` 后留下超退状态。
- `PostPurchaseReturn` 已改为使用 `effective_receipt_quantity`，不再只按原始 `purchase_receipt_items.quantity` 判断累计可退上限。

库存余额校验仍独立生效：有效入库数量校验不能替代 `inventory_balances` 不得扣成负数的约束。

## lot / warehouse 更正

本轮不允许一条调整行同时产生两条库存流水。批次和仓库更正必须拆成一出一入两行，并用同一个 `correction_group` 关联。

| 更正类型 | 配对规则 |
| --- | --- |
| lot 更正 | 同一 `correction_group` 内必须恰好一条 `LOT_CORRECTION_OUT` 和一条 `LOT_CORRECTION_IN`；数量、原入库行、物料、单位、仓库必须一致；OUT 扣原错误 `lot_id`，IN 加新正确 `lot_id`。 |
| warehouse 更正 | 同一 `correction_group` 内必须恰好一条 `WAREHOUSE_CORRECTION_OUT` 和一条 `WAREHOUSE_CORRECTION_IN`；数量、原入库行、物料、单位、`lot_id` 必须一致；OUT 扣原错误 `warehouse_id`，IN 加新正确 `warehouse_id`。 |

如果 `correction_group` 不完整、OUT/IN 数量不一致、维度不一致或 OUT 侧库存余额不足，整张调整单过账失败并回滚。

有 `lot_id` 的库存只扣该批次，`lot_id = NULL` 的库存只扣非批次余额；批次库存和非批次库存不能互相抵扣。

## 追溯保护

| 对象 | 保护策略 |
| --- | --- |
| `purchase_receipt_adjustments` | Ent hook 禁止普通 `Delete / DeleteOne`；关键字段 `adjustment_no / purchase_receipt_id / business_record_id / status / adjusted_at / posted_at` 禁止普通 update。 |
| `purchase_receipt_adjustment_items` | Ent hook 禁止普通 `Delete / DeleteOne`；影响库存事实和追溯的关键字段禁止普通 update。 |
| 原入库单 / 行 FK | `purchase_receipt_adjustments.purchase_receipt_id` 和 `purchase_receipt_adjustment_items.purchase_receipt_item_id` 使用数据库 `ON DELETE NO ACTION`，防止绕过 Ent 的直接 SQL 删除破坏追溯链。 |
| POSTED / CANCELLED 行新增 | `AddPurchaseReceiptAdjustmentItem` 拒绝，防止过账后改变库存事实来源。 |

## 权限与 API

本轮只落后端 usecase / repo / schema / migration / 测试，未新增外部 JSON-RPC/API，也未改前端菜单入口。因此本轮不修改 `server/internal/biz/rbac.go`。

后续接 API 时再补权限码和守卫：

- `purchase.receipt.adjustment.read`
- `purchase.receipt.adjustment.create`
- `purchase.receipt.adjustment.post`
- `purchase.receipt.adjustment.cancel`

## PostgreSQL 本地验收入口

Phase 2D 使用独立本地测试库，默认：

| 项 | 值 |
| --- | --- |
| 默认 DSN | `postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2d_test?sslmode=disable` |
| 默认数据库 | `plush_erp_phase2d_test` |
| 防呆 | host 必须是本机 / 本机 Docker 名称，数据库名必须包含 `phase2d` 或 `test`。 |

命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make phase2d_pg_dropdb
make phase2d_pg_createdb
make phase2d_migrate_status
make phase2d_migrate_apply
make phase2d_migrate_status
make phase2d_pg_test
```

`phase2d_pg_test` 覆盖新增表、唯一约束、`quantity > 0` check、`source_line_no` partial unique、原入库单 / 行 FK `ON DELETE NO ACTION`、直接 SQL 删除被引用入库单 / 行失败、`ADJUST_OUT` 并发扣减不产生负库存、`effective_receipt_quantity` 与累计退货上限、采购入库 / 退货既有回归。

## 当前仍未做

| 暂不落地 | 说明 |
| --- | --- |
| 金额差异 | 本轮不改 `unit_price / amount`，金额差异后续进入应付 / 财务评审。 |
| `quality_inspections` | 来料质检、冻结、放行和不合格后续单独评审。 |
| 通用 `inventory_adjustments` | 盘点、报损、报溢等通用库存调整后续单独评审。 |
| `available_quantity / hold_quantity / reserved_quantity` | 当前余额仍只有账面 `quantity`。 |
| 供应商主数据和完整采购订单 | 当前采购入库 / 退货 / 调整仍围绕已过账入库事实。 |
| 应付、发票、付款、财务核销 | 本轮不接财务事实。 |
| 生产、委外、品质模块 | 本轮不扩展到生产领料、委外发料 / 回货或完整品质流程。 |
| 前端和帮助中心 | 本轮未接页面、菜单、JSON-RPC/API 或帮助中心。 |
| 旧 `business_records` 迁移 | 继续作为通用单据快照和兼容层，不删除、不替换、不批量迁移。 |
| 分区 migration / 几十亿级压测 | 当前只做功能、约束和本地 PostgreSQL 行为验证。 |
