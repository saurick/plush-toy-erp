# Phase 2B BOM 与批次库存闭环

## 结论

Phase 2B 落地最小 BOM + 批次库存闭环，采用 `docs/architecture/phase-2b-bom-lot-schema-review.md` 推荐的方案 B：

- 新增 `inventory_lots`，承接材料批次和成品批次。
- 新增 `bom_headers / bom_items`，承接产品 BOM 版本和材料用量。
- `inventory_txns` 增加 nullable `lot_id`，批次进入库存事实流水。
- `inventory_balances` 增加 nullable `lot_id`，当前余额按批次和非批次分开聚合。

这是 Phase 2A 库存事实闭环的维度演进，不改变 `inventory_txns` 是库存历史事实真源、`inventory_balances` 是当前余额 / 查询加速表的主路径。

## 新增专表

| 表 | 定位 | 关键约束 |
| --- | --- | --- |
| `inventory_lots` | 批次身份事实，支持材料批次、成品批次、供应商批次、色号、缸号和生产批次。 | `subject_type + subject_id + lot_no` 唯一；业务层校验 `MATERIAL` 指向 `materials.id`，`PRODUCT` 指向 `products.id`。 |
| `bom_headers` | BOM 版本头，绑定 `products.id`，保存版本、生效状态和生效时间。 | `product_id + version` 唯一；`status = ACTIVE` 时同一 `product_id` 只能有一个 ACTIVE BOM；`product_id + status` 索引。 |
| `bom_items` | BOM 明细，保存材料、单位用量、单位、损耗率、部位和备注。 | `bom_header_id + material_id` 索引；DB check 约束 `quantity > 0`、`loss_rate >= 0`；业务层同时校验材料和单位必须存在。 |

## 库存批次规则

| 规则 | 口径 |
| --- | --- |
| 批次主体 | `inventory_lots` 继续使用 Phase 2A 的 `subject_type + subject_id`，本轮不引入多态外键或统一库存对象表。 |
| 批次删除 | `inventory_lots` 作为批次身份事实，不做物理删除；普通 Ent delete/delete-one 会被 hook 拒绝，需要停用时更新 `status = DISABLED`。 |
| 删除保护 | `inventory_txns.lot_id` 和 `inventory_balances.lot_id` 的外键删除策略为 `ON DELETE NO ACTION`，数据库层不允许被引用批次删除后把流水或余额置空。 |
| 批次流水 | `inventory_txns.lot_id` nullable；非空时必须指向存在的批次，且批次主体必须与流水主体一致。 |
| 非批次库存 | `lot_id = NULL` 表示非批次库存，和任意批次库存分开写入、分开查询、分开扣减。 |
| 批次余额 | `inventory_balances.lot_id` nullable；有批次流水更新批次余额，非批次流水更新非批次余额。 |
| 幂等 | `idempotency_key` 语义保持不变；重复提交返回已有流水，不重复更新批次余额。 |
| 冲正 | `REVERSAL` 必须继承原流水 `lot_id`；如果显式传入不同 `lot_id`，业务层拒绝。 |
| 负库存 | 继续默认禁止负库存；批次出库和非批次出库各自按对应余额行校验。 |

## PostgreSQL NULL unique 处理

PostgreSQL 普通唯一索引会允许多条 `NULL`，所以 Phase 2B 没有使用单个：

```sql
UNIQUE (subject_type, subject_id, warehouse_id, unit_id, lot_id)
```

而是使用两个 partial unique index：

```sql
CREATE UNIQUE INDEX inventorybalance_subject_type_subject_id_warehouse_id_unit_id
ON inventory_balances (subject_type, subject_id, warehouse_id, unit_id)
WHERE lot_id IS NULL;

CREATE UNIQUE INDEX inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l
ON inventory_balances (subject_type, subject_id, warehouse_id, unit_id, lot_id)
WHERE lot_id IS NOT NULL;
```

这样可以同时保证：

- 非批次库存：同一 `subject_type + subject_id + warehouse_id + unit_id` 只能有一条余额。
- 批次库存：同一 `subject_type + subject_id + warehouse_id + unit_id + lot_id` 只能有一条余额。
- 不同 `lot_id` 的批次余额可以并存，不会被非批次余额混淆。

这两个 partial unique index 由 Ent schema 通过 `entsql.IndexWhere` 表达，并由 Atlas migration 生成。

## BOM 当前边界

| 范围 | 当前口径 |
| --- | --- |
| BOM 头 | 只绑定 `products.id`，不新增 `product_styles`。现有 `products.style_no / customer_style_no` 足够支撑最小闭环。 |
| BOM 明细 | 只保存材料、单位用量、单位、损耗率、部位和备注。 |
| 数量类型 | `bom_items.quantity` 和 `bom_items.loss_rate` 使用 `numeric(20,6)`，Go 层使用 `decimal.Decimal`，不使用 float。 |
| 数量约束 | `bom_items.quantity > 0`、`bom_items.loss_rate >= 0` 由 usecase 层和 PostgreSQL DB check 双层保证。 |
| 状态 | `bom_headers.status` 支持 `DRAFT / ACTIVE / DISABLED`；PostgreSQL partial unique index 保证同一产品最多一个 `ACTIVE` BOM。 |
| 不做 | 不做审批流、采购需求生成、生产领料、成本核算和前端页面。 |

`GetActiveBOMByProduct` 当前仍按 `id desc` 查询 ACTIVE BOM；数据库唯一约束会阻止同产品多个 ACTIVE BOM，因此不会出现多 ACTIVE 时取哪一个的业务歧义。

## Phase 2B 加固 migration

初始 Phase 2B migration 为 `20260425121227_migrate.sql`。本轮加固追加 `20260425145141_migrate.sql`：

- 将 `inventory_txns.lot_id -> inventory_lots.id` 从 `ON DELETE SET NULL` 修正为 `ON DELETE NO ACTION`。
- 将 `inventory_balances.lot_id -> inventory_lots.id` 从 `ON DELETE SET NULL` 修正为 `ON DELETE NO ACTION`。
- 增加 `bom_items_quantity_positive` 和 `bom_items_loss_rate_non_negative` DB check constraint。
- 增加 `bomheader_product_id` partial unique index：`UNIQUE (product_id) WHERE status = 'ACTIVE'`。

## 新增 PostgreSQL 本地验收入口

Phase 2B 使用独立本地测试库，默认：

| 项 | 值 |
| --- | --- |
| 默认 DSN | `postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2b_test?sslmode=disable` |
| 默认数据库 | `plush_erp_phase2b_test` |
| 防呆 | host 必须是本机 / 本机 Docker 名称，数据库名必须包含 `phase2b` 或 `test`。 |

命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make phase2b_pg_createdb
make phase2b_migrate_status
make phase2b_migrate_apply
make phase2b_migrate_status
make phase2b_pg_test
```

`phase2b_pg_test` 只运行 PostgreSQL Phase 2B 集成测试，覆盖 migration 结构、partial unique index、批次入库、批次出库、非批次隔离、冲正继承 `lot_id`、幂等重放、批次并发出库、直接 SQL 删除被引用批次失败、BOM DB check constraint 和同产品 ACTIVE BOM 唯一约束。

## 当前仍未做

| 暂不落地 | 原因 |
| --- | --- |
| `product_styles` | 现有 `products.style_no / customer_style_no` 足够支撑最小 BOM；产品、款式、纸样、客户款号生命周期后续再单独评审。 |
| 采购、生产、委外、品质、财务专表 | 这些链路会牵动订单、任务、发料、回货、检验、结算和成本；Phase 2B 只做 BOM + 批次库存底座。 |
| `warehouse_locations` | 本轮仍只做到仓库维度，不做精细库位。 |
| `stock_reservations` | 本轮不做库存占用 / 预留。 |
| 前端和帮助中心 | 本轮只落后端 schema、repo/usecase 和测试。 |
| 旧 `business_records` 迁移 | `business_records / business_record_items` 继续作为通用单据快照和兼容层，不删除、不替换、不批量迁移。 |
| 真实分区 migration | 仍不做库存流水真实分区表。 |
| 几十亿级压测 | 当前只做功能、约束和并发出库验证，不做大规模压测。 |
