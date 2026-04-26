# Phase 2C 采购入库最小闭环

## 结论

Phase 2C 落地采购入库最小闭环，采用 `docs/architecture/phase-2c-purchase-receipt-review.md` 推荐的方案 B：

- 新增 `purchase_receipts` 作为采购入库单头专表。
- 新增 `purchase_receipt_items` 作为采购入库行专表。
- `business_records / business_record_items` 继续作为通用单据快照和兼容层，不替代采购入库专表。
- 采购入库过账通过 `inventory_lots -> inventory_txns -> inventory_balances` 影响库存。

这是 Phase 2A / 2B 库存事实闭环的来源接入，不改变以下主路径：

- `inventory_txns` 是库存历史事实真源。
- `inventory_balances` 是当前余额 / 查询加速表。
- `inventory_lots` 是批次追溯真源。

## 新增专表

| 表 | 定位 | 关键约束 |
| --- | --- | --- |
| `purchase_receipts` | 采购入库单头，保存入库单号、供应商名称快照、状态、到货 / 入库日期和可选通用快照关联。 | `receipt_no` 唯一；`business_record_id` 可为空；`status` 为 `DRAFT / POSTED / CANCELLED`。 |
| `purchase_receipt_items` | 采购入库行，保存材料、仓库、单位、批次、数量、单价、金额和来源行号。 | `quantity > 0`；`unit_price IS NULL OR unit_price >= 0`；`amount IS NULL OR amount >= 0`；`receipt_id + source_line_no` 在非空范围内唯一。 |

本轮 migration 为 `20260425153557_migrate.sql`。

本轮加固只新增 Ent hook、repo/usecase 测试和文档口径，不改变数据库结构，因此未新增后续 migration。

## 与 business_records 的关系

| 主题 | 当前口径 |
| --- | --- |
| 通用快照 | `business_records / business_record_items` 继续用于通用页面、打印、调试和兼容层。 |
| 专表真源 | `purchase_receipts / purchase_receipt_items` 是采购入库过账、取消和库存来源追溯的真源。 |
| 关联方式 | `purchase_receipts.business_record_id` nullable，可关联已有通用单据快照；没有快照时也允许独立创建采购入库专表记录。 |
| 库存来源 | `inventory_txns.source_type/source_id/source_line_id` 指向采购入库专表，不指向通用快照。 |
| 旧数据 | 本轮不迁移旧 `business_records`，不删除、不替换通用记录。 |

## 入库驱动库存规则

| 阶段 | 规则 |
| --- | --- |
| 草稿 | `CreatePurchaseReceiptDraft` 只创建 `DRAFT` 入库单，不影响库存。 |
| 添加行 | `AddPurchaseReceiptItem` 只允许给 `DRAFT` 入库单添加材料行；校验材料、仓库、单位、批次和数量。 |
| 过账 | `PostPurchaseReceipt` 只允许 `DRAFT -> POSTED`，并在一个数据库事务内处理所有行。 |
| 批次 | 行有 `lot_id` 时校验批次主体；行有 `lot_no` 且无 `lot_id` 时按 `MATERIAL + material_id + lot_no` 创建或复用 `inventory_lots`；无批次时写非批次库存。 |
| 流水 | 每条入库行写一条 `inventory_txns`，`txn_type = IN`、`direction = 1`。 |
| 余额 | 每条入库流水同事务更新 `inventory_balances`，批次库存和非批次库存不混。 |
| 重复过账 | 已 `POSTED` 的入库单重复过账直接返回当前单据，不重复写库存。 |

## source 与幂等规则

| 字段 | 规则 |
| --- | --- |
| `source_type` | 固定为 `PURCHASE_RECEIPT`。 |
| `source_id` | `purchase_receipts.id`。 |
| `source_line_id` | `purchase_receipt_items.id`。 |
| 入库幂等键 | `PURCHASE_RECEIPT:{receipt_id}:{item_id}:IN`。 |
| 取消冲正幂等键 | `PURCHASE_RECEIPT:{receipt_id}:{item_id}:REVERSAL`。 |

`inventory_txns.idempotency_key` 继续使用唯一索引防重复库存影响。

`source_type/source_id/source_line_id` 是采购入库到库存流水的追溯链。`source_id` 对应 `purchase_receipts.id`，`source_line_id` 对应 `purchase_receipt_items.id`；这两个字段是通用来源字段，不是数据库外键，因此采购入库单头和行必须在应用层禁止普通物理删除，避免库存流水失去来源。

## 追溯保护与不可变规则

| 对象 | 保护策略 |
| --- | --- |
| `purchase_receipts` | Ent hook 禁止普通 `Delete / DeleteOne`。采购入库单不做业务物理删除；如需作废，使用 `CancelPostedPurchaseReceipt`。 |
| `purchase_receipt_items` | Ent hook 禁止普通 `Delete / DeleteOne`。采购入库行是 `inventory_txns.source_line_id` 的追溯来源，不能被普通删除。 |
| 入库单关键字段 | Ent hook 禁止普通 update 修改 `receipt_no`、`business_record_id`、`supplier_name`、`status`、`received_at`、`posted_at`。状态只能通过 `PostPurchaseReceipt` 或 `CancelPostedPurchaseReceipt` 的明确路径变化。 |
| 入库行关键字段 | Ent hook 禁止普通 update 修改 `receipt_id`、`material_id`、`warehouse_id`、`unit_id`、`lot_id`、`lot_no`、`quantity`、`unit_price`、`amount`、`source_line_no`。 |
| DRAFT 行新增 | `AddPurchaseReceiptItem` 只允许给 `DRAFT` 单据新增行。 |
| POSTED / CANCELLED 行新增 | usecase 拒绝新增行，防止过账后改变库存事实来源。 |

当前运行时代码不提供采购入库单或入库行的普通修改入口。若后续要新增编辑能力，只能允许 `DRAFT` 状态下修改，并必须继续保证 `POSTED / CANCELLED` 后影响库存事实和来源追溯的字段不可变。

## 状态与取消冲正

| 状态 | 语义 | 库存影响 |
| --- | --- | --- |
| `DRAFT` | 草稿。 | 不影响库存。 |
| `POSTED` | 已过账。 | 已写入入库流水并增加余额。 |
| `CANCELLED` | 已取消。 | 已通过 `REVERSAL` 流水回退库存。 |

取消规则：

- 已 `POSTED` 的入库单不能通过物理删除表达取消。
- `DRAFT` 不能取消；`CANCELLED` 后不能再次过账。
- `CancelPostedPurchaseReceipt` 对每条原入库流水写 `REVERSAL`。
- REVERSAL 继承原流水 `lot_id`，不能把批次流水冲成非批次流水。
- 重复取消已 `CANCELLED` 单据不重复写冲正流水。
- 原入库流水和冲正流水都是 `inventory_txns` 事实，继续由 `inventory_txns` hook 禁止普通 update/delete。

## PostgreSQL 本地验收入口

Phase 2C 使用独立本地测试库，默认：

| 项 | 值 |
| --- | --- |
| 默认 DSN | `postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2c_test?sslmode=disable` |
| 默认数据库 | `plush_erp_phase2c_test` |
| 防呆 | host 必须是本机 / 本机 Docker 名称，数据库名必须包含 `phase2c` 或 `test`。 |

命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make phase2c_pg_createdb
make phase2c_migrate_status
make phase2c_migrate_apply
make phase2c_migrate_status
make phase2c_pg_test
```

`phase2c_pg_test` 只运行 PostgreSQL Phase 2C 集成测试，覆盖 migration 结构、check constraint、唯一约束、批次创建 / 复用、入库过账、重复过账幂等、非批次隔离、取消冲正、重复取消防护、采购入库单 / 行普通删除保护、过账后关键字段修改保护，以及 `source_type/source_id/source_line_id` 追溯链保留。

## 当前仍未做

| 暂不落地 | 原因 |
| --- | --- |
| 完整采购订单 / 采购合同审批 | 本轮只做采购入库事实来源，不做采购计划、订单审批或合同流。 |
| 供应商主数据 `suppliers` | 最小闭环先用 `supplier_name` 快照；供应商编码、账期、税务和对账后续单独评审。 |
| 应付、发票、付款、财务核销 | 入库金额只做采购行快照，不作为财务真源。 |
| 生产领料、委外发料、品质检验完整模块 | 这些链路会牵动任务、检验、发料、回货和成本，本轮不扩展。 |
| `warehouse_locations` | 本轮仍只做到仓库维度，不做精细库位。 |
| `stock_reservations` | 本轮不做库存占用 / 预留。 |
| 前端和帮助中心 | 本轮只落后端 schema、repo/usecase、测试和正式后端文档。 |
| 旧 `business_records` 迁移 | 继续作为通用单据快照和兼容层，不删除、不替换、不批量迁移。 |
| 真实分区 migration / 几十亿级压测 | 当前只做功能、约束和本地 PostgreSQL 行为验证。 |
