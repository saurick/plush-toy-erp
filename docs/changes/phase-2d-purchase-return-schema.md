# Phase 2D-A 采购退货最小闭环

## 结论

Phase 2D-A 落地采购退货最小闭环，采用 `docs/architecture/phase-2d-purchase-return-quality-review.md` 推荐的采购退货方案 B：

- 新增 `purchase_returns` 作为采购退货单头专表。
- 新增 `purchase_return_items` 作为采购退货行专表。
- 采购退货作为独立业务单据，不复用 `CancelPostedPurchaseReceipt`。
- 退货过账通过 `inventory_txns.OUT -> inventory_balances` 扣减库存。
- 取消已过账退货通过 `REVERSAL` 回补库存。

本轮 migration 为 `20260426033346_migrate.sql`。

## 新增专表

| 表 | 定位 | 关键约束 |
| --- | --- | --- |
| `purchase_returns` | 采购退货单头，保存退货单号、可选原入库单、可选通用快照、供应商名称快照、状态和退货 / 过账时间。 | `return_no` 唯一；`status` 为 `DRAFT / POSTED / CANCELLED`；索引 `purchase_receipt_id / business_record_id / status / returned_at`。 |
| `purchase_return_items` | 采购退货行，保存可选原入库行、材料、仓库、单位、批次、数量、单价、金额和来源行号。 | `quantity > 0`；`unit_price IS NULL OR unit_price >= 0`；`amount IS NULL OR amount >= 0`；`return_id + source_line_no` 在非空范围内唯一。 |

数量、单价和金额继续使用 `numeric(20,6)` / `decimal.Decimal`，不使用 float。

## 与采购入库取消的区别

| 主题 | `CancelPostedPurchaseReceipt` | `PurchaseReturn` |
| --- | --- | --- |
| 语义 | 整单取消采购入库，表示原入库单不成立。 | 已入库后的部分或全部退货，可以多次发生。 |
| 库存流水 | 对原 `PURCHASE_RECEIPT` 入库 `IN` 写 `REVERSAL`。 | 退货过账写 `OUT`；取消退货时对退货 `OUT` 写 `REVERSAL`。 |
| 粒度 | 当前按整单所有入库行冲正。 | 按退货行扣减，支持指定 `lot_id` 或非批次库存。 |
| source | `source_type = PURCHASE_RECEIPT`。 | `source_type = PURCHASE_RETURN`。 |

采购退货不复用采购入库取消，避免把“原入库单不成立”和“入库后退回供应商”混成同一语义。

## 库存驱动规则

| 阶段 | 规则 |
| --- | --- |
| 草稿 | `CreatePurchaseReturnDraft` 只创建 `DRAFT` 退货单，不影响库存。 |
| 添加行 | `AddPurchaseReturnItem` 只允许给 `DRAFT` 退货单添加行；校验材料、仓库、单位、批次和可选原入库行。 |
| 过账 | `PostPurchaseReturn` 只允许 `DRAFT -> POSTED`，并在一个数据库事务内处理所有退货行。 |
| 批次 | 行有 `lot_id` 时只扣该批次余额；`lot_id = NULL` 时只扣非批次余额。批次库存和非批次库存不能互相抵扣。 |
| 余额 | 每条退货行写 `inventory_txns` 后同事务更新 `inventory_balances`，继续默认禁止负库存。 |
| 重复过账 | 已 `POSTED` 的退货单重复过账直接返回当前单据，不重复扣库存。 |
| 取消 | `CancelPostedPurchaseReturn` 只允许 `POSTED -> CANCELLED`；重复取消已 `CANCELLED` 单据不重复冲正。 |

如果退货行关联 `purchase_receipt_item_id`，业务层会校验：

- 原入库行所属入库单必须为 `POSTED`。
- 若退货单头指定 `purchase_receipt_id`，退货行关联的原入库行必须属于该入库单。
- `material_id / warehouse_id / unit_id / lot_id` 必须与原入库行一致，避免退错物料、仓库、单位或批次。

## source 与幂等规则

| 场景 | 规则 |
| --- | --- |
| 退货过账 `source_type` | `PURCHASE_RETURN`。 |
| 退货过账 `source_id` | `purchase_returns.id`。 |
| 退货过账 `source_line_id` | `purchase_return_items.id`。 |
| 退货过账幂等键 | `PURCHASE_RETURN:{return_id}:{item_id}:OUT`。 |
| 取消退货幂等键 | `PURCHASE_RETURN:{return_id}:{item_id}:REVERSAL`。 |
| 取消退货 `reversal_of_txn_id` | 指向原退货 `OUT` 流水。 |

`REVERSAL` 继承原 `OUT` 流水的 `lot_id`，不能把批次退货冲成非批次回补。

## 追溯保护与不可变规则

| 对象 | 保护策略 |
| --- | --- |
| `purchase_returns` | Ent hook 禁止普通 `Delete / DeleteOne`。采购退货单不做业务物理删除；如需作废，使用 `CancelPostedPurchaseReturn`。 |
| `purchase_return_items` | Ent hook 禁止普通 `Delete / DeleteOne`。退货行是 `inventory_txns.source_line_id` 的追溯来源，不能被普通删除。 |
| 退货单关键字段 | Ent hook 禁止普通 update 修改 `return_no`、`purchase_receipt_id`、`business_record_id`、`supplier_name`、`status`、`returned_at`、`posted_at`。状态只能通过 `PostPurchaseReturn` 或 `CancelPostedPurchaseReturn` 的明确路径变化。 |
| 退货行关键字段 | Ent hook 禁止普通 update 修改 `return_id`、`purchase_receipt_item_id`、`material_id`、`warehouse_id`、`unit_id`、`lot_id`、`quantity`、`unit_price`、`amount`、`source_line_no`。 |
| DRAFT 行新增 | `AddPurchaseReturnItem` 只允许给 `DRAFT` 退货单新增行。 |
| POSTED / CANCELLED 行新增 | usecase 拒绝新增行，防止过账后改变库存事实来源。 |

当前运行时代码不提供采购退货单或退货行的普通修改入口。若后续要新增编辑能力，只能允许 `DRAFT` 状态下修改，并必须继续保证 `POSTED / CANCELLED` 后影响库存事实和来源追溯的字段不可变。

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

`phase2d_pg_test` 只运行 PostgreSQL Phase 2D 集成测试，覆盖 migration 结构、check constraint、唯一约束、批次退货、非批次隔离、库存不足回滚、重复过账幂等、取消退货冲正、重复取消防护、采购退货单 / 行普通删除保护、过账后关键字段修改保护，以及 `source_type/source_id/source_line_id` 追溯链保留。

## 当前仍未做

| 暂不落地 | 原因 |
| --- | --- |
| 入库差异 `purchase_receipt_adjustments` | Phase 2D-A 只做采购退货，不做入库后数量差异专表。 |
| 来料质检 `quality_inspections` | 质检入口和批次 HOLD 规则后续单独评审。 |
| 供应商主数据 `suppliers` | 最小退货闭环继续使用 `supplier_name` 快照。 |
| 完整采购订单 / 采购合同 / 审批流 | 本轮只承接已入库后的退货事实，不做采购计划和订单审批。 |
| 应付、发票、付款、财务核销 | 退货金额只做业务快照，不作为财务真源。 |
| 生产、委外、品质模块 | 不扩展到生产领料、委外发料 / 回货或完整品质流程。 |
| `warehouse_locations` | 本轮仍只做到仓库维度。 |
| `stock_reservations / available_quantity` | 当前余额仍只有账面 `quantity`；预留、冻结和可用量后续统一评审。 |
| `product_styles` | 采购退货不需要新增款式主数据。 |
| 前端和帮助中心 | 本轮只落后端 schema、repo/usecase、测试和正式后端文档。 |
| 旧 `business_records` 迁移 | 继续作为通用单据快照和兼容层，不删除、不替换、不批量迁移。 |
| 真实分区 migration / 几十亿级压测 | 当前只做功能、约束和本地 PostgreSQL 行为验证。 |
