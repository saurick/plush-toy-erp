# Phase 2A PostgreSQL 落地验收

## 结论

Phase 2A 库存事实闭环已在本地临时 PostgreSQL 库完成 migration apply 和集成测试验收。验收只针对 `units / materials / products / warehouses / inventory_txns / inventory_balances`，未新增 BOM、采购、生产、委外、品质、财务表，未改前端，未迁移 `business_records`。

## 安全边界

- 之前没有对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`，原因是该地址来自当前 dev 覆盖配置，不能确认是本机临时库，存在误操作共享库风险。
- 本轮新增 `phase2a_*` 专用 Makefile target，默认只指向 `127.0.0.1:55432/plush_erp_phase2a_test`。
- 防呆规则：`PHASE2A_DB_URL` 的 host 必须是本地地址或本机 Docker PostgreSQL 服务名，数据库名必须包含 `phase2a` 或 `test`，执行前只打印脱敏 DSN。
- 已验证 `PHASE2A_DB_URL=postgres://test_user:fake@192.168.0.106:5432/plush_erp?sslmode=disable bash ../scripts/phase2a-pg.sh status` 会拒绝执行，报错为 `refuse non-local PHASE2A_DB_URL host: 192.168.0.106`。

## 本轮本地测试库

| 项 | 值 |
| --- | --- |
| PostgreSQL 来源 | 本机 Docker 容器 `plush-toy-erp-phase2a-postgres` |
| Host / Port | `127.0.0.1:55432` |
| Database | `plush_erp_phase2a_test` |
| 默认 Makefile DSN | `postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2a_test?sslmode=disable` |

本机临时 PostgreSQL 可用以下方式启动：

```bash
docker run --name plush-toy-erp-phase2a-postgres \
  -e POSTGRES_PASSWORD=phase2a-local-password \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=postgres \
  -p 55432:5432 \
  -d postgres:18
```

## 新增验收命令

```bash
cd /Users/simon/projects/plush-toy-erp/server
make phase2a_pg_createdb
make phase2a_migrate_status
make phase2a_migrate_apply
make phase2a_migrate_status
make phase2a_pg_test
make phase2a_pg_dropdb
```

如需覆盖 DSN，必须使用本地临时库：

```bash
cd /Users/simon/projects/plush-toy-erp/server
PHASE2A_DB_URL='postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2a_test?sslmode=disable' make phase2a_pg_test
```

## 本轮执行结果

| 命令 | 结果 |
| --- | --- |
| `make phase2a_pg_dropdb && make phase2a_pg_createdb && make phase2a_migrate_status` | 初始 status 为 `PENDING`，当前版本为空，pending 8 个 migration。 |
| `make phase2a_migrate_apply` | 成功 apply 到 `20260425104804`，共 8 个 migration、57 条 SQL。 |
| `make phase2a_migrate_status` | `Migration Status: OK`，当前版本 `20260425104804`，pending 0。 |
| `make phase2a_pg_test` | PostgreSQL 集成测试通过。 |
| `make data` | 通过，migration 目录与 Ent schema 同步，无新增 diff。 |
| `go test ./...` | 通过；PostgreSQL 集成测试默认跳过，需 `PHASE2A_PG_TEST=1` 或 `make phase2a_pg_test` 显式运行。 |

## 已验证的 PostgreSQL 结构

| 验收项 | 结果 |
| --- | --- |
| 6 张 Phase 2A 表 | `units`、`materials`、`products`、`warehouses`、`inventory_txns`、`inventory_balances` 均已创建。 |
| `inventory_txns.quantity` | `numeric(20,6)`。 |
| `inventory_balances.quantity` | `numeric(20,6)`。 |
| `inventory_txns.idempotency_key` | 唯一索引 `inventorytxn_idempotency_key` 生效。 |
| `inventory_txns.reversal_of_txn_id` | 唯一索引 `inventorytxn_reversal_of_txn_id` 生效，用于防重复冲正。 |
| `inventory_balances` 唯一键 | `subject_type + subject_id + warehouse_id + unit_id` 唯一索引生效。 |

## 已验证的 PostgreSQL 行为

| 行为 | 结果 |
| --- | --- |
| 小数精度 | `1.234567` 入库后余额精确等于 `1.234567`。 |
| code unique | `units.code` 等主档 code 唯一约束在 PostgreSQL 下生效。 |
| 幂等 | 相同 `idempotency_key` 重放返回幂等成功，不重复增加余额。 |
| subject 校验 | `MATERIAL` 必须指向存在的 `materials.id`，`PRODUCT` 必须指向存在的 `products.id`。 |
| 入库 / 出库 | 入库增加余额，出库减少余额。 |
| 负库存禁止 | 余额不足的出库失败，流水随事务回滚。 |
| REVERSAL 冲正 | 冲正以新增反向流水表达，余额回到正确值。 |
| 重复冲正 | 同一原流水重复冲正失败或幂等重放，不重复影响余额。 |
| 历史流水保护 | `inventory_txns` 普通 update/delete 被 Ent hook 拒绝。 |
| 余额唯一约束 | 重复创建同一 `subject_type + subject_id + warehouse_id + unit_id` 余额行失败。 |

## PostgreSQL 并发出库结果

并发测试使用真实 PostgreSQL，不使用 SQLite 伪装：

- 初始库存：`10`
- 并发请求：`20` 个出库请求，每个出库 `1`
- 成功出库流水：`10`
- 最终余额：`0.000000`
- 结论：未出现 `-1 / -2` 等负数穿透，成功流水数量与最终扣减一致。

## 当前仍未做

- 未加 `bom_headers / bom_items`。
- 未加采购、生产、委外、品质、财务专表。
- 未做真实分区 migration；未来几十亿级库存流水仍需按 `occurred_at` 评估月 / 季度分区。
- 未做几十亿数据量压测。
- 未接前端页面。
- 未迁移旧 `business_records` 数据；`business_records / business_record_items` 仍作为通用单据快照和兼容层。
