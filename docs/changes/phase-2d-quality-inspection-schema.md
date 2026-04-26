# Phase 2D-C2-A 来料质检最小主表

## 结论

Phase 2D-C2-A 按 `docs/architecture/phase-2d-quality-inspection-schema-review.md` 的推荐落地 `quality_inspections` 最小主表：

- 新增 `quality_inspections` 作为来料质检状态 / 判定真源。
- 只支持采购入库后、材料批次维度的最小质检记录。
- `SubmitQualityInspection` 在事务内把批次改为 `HOLD`。
- `PassQualityInspection` 在事务内把批次改为 `ACTIVE`，支持 `PASS / CONCESSION`。
- `RejectQualityInspection` 在事务内把批次改为 `REJECTED`。
- `CancelQualityInspection` 只允许取消 `DRAFT / SUBMITTED`，其中 `SUBMITTED` 取消需校验批次仍为 `HOLD` 后恢复 `original_lot_status`。
- 质检状态变化不写 `inventory_txns`，不改 `inventory_balances`。

本轮 migration 为：

- `20260426142444_migrate.sql`：新增 `quality_inspections`。

## 新增专表

| 表 | 定位 | 关键约束 |
| --- | --- | --- |
| `quality_inspections` | 来料质检单头和批次质量判定记录，保存检验单号、来源采购入库、可选来源入库行、批次、物料、仓库、状态、结果、原批次状态、检验时间、检验人和处理意见。 | `inspection_no` 唯一；`status` 为 `DRAFT / SUBMITTED / PASSED / REJECTED / CANCELLED`；`result` 判定后为 `PASS / REJECT / CONCESSION`；`purchase_receipt_id / purchase_receipt_item_id / inventory_lot_id / material_id / warehouse_id` 均使用 `ON DELETE NO ACTION`；同一 `inventory_lot_id` 同一时间只允许一张 `SUBMITTED` inspection。 |

本轮不新增 `quality_inspection_items`，不记录缺陷项、抽检数量、不良数量、检验标准、供应商评分或财务扣款。

## 状态机

| 动作 | 状态变化 | 批次状态联动 | 备注 |
| --- | --- | --- | --- |
| `CreateQualityInspectionDraft` | 新建 `DRAFT` | 不改 `lot.status` | 草稿不冻结库存，避免未提交单据长期占用批次。 |
| `SubmitQualityInspection` | `DRAFT -> SUBMITTED` | 记录 `original_lot_status`，把 `ACTIVE / HOLD` 批次置为 `HOLD`；拒绝 `DISABLED / REJECTED`。 | 同一批次已有 `SUBMITTED` inspection 时拒绝。 |
| `PassQualityInspection` | `SUBMITTED -> PASSED` | 当前批次必须仍为 `HOLD`，随后改为 `ACTIVE`。 | `result = PASS` 或 `CONCESSION`；`CONCESSION` 对库存可用性等价于放行。 |
| `RejectQualityInspection` | `SUBMITTED -> REJECTED` | 当前批次必须仍为 `HOLD`，随后改为 `REJECTED`。 | `result = REJECT`。 |
| `CancelQualityInspection` | `DRAFT -> CANCELLED` | 不改 `lot.status`。 | 草稿取消只终止质检单。 |
| `CancelQualityInspection` | `SUBMITTED -> CANCELLED` | 如果当前批次仍为 `HOLD`，恢复 `original_lot_status`。 | 如果批次已被其他业务改为 `ACTIVE / REJECTED / DISABLED`，取消失败，避免覆盖其他业务决策。 |

`PASSED / REJECTED / CANCELLED` 为终态。重复 submit / pass / reject / cancel 对已到达同一目标状态的单据返回当前结果；对不允许的跨终态动作返回业务错误。

## 原批次状态

`original_lot_status` 在提交质检时记录质检接管前的批次状态。

| 场景 | 规则 |
| --- | --- |
| 提交时 `original_lot_status` 为空 | 使用当前 `inventory_lots.status`。 |
| `SUBMITTED` 取消 | 只有当前 `lot.status` 仍为 `HOLD` 时恢复 `original_lot_status`。 |
| 质检期间批次状态被其他业务改动 | 取消失败，不做盲目恢复。 |
| 批次为 `DISABLED` | 不允许提交质检。 |
| 批次已为 `REJECTED` | 本轮不允许再次提交质检；复检或让步接收后续另行评审。 |

本轮不新增通用 version 字段；并发控制先通过事务内锁定 inspection / lot、局部唯一索引和状态校验完成。

## 关联校验

创建草稿和提交前会校验：

- `purchase_receipt_id` 必须存在，且采购入库单状态为 `POSTED`。
- `purchase_receipt_item_id` 非空时必须属于该 `purchase_receipt_id`。
- `inventory_lot_id` 必须存在。
- `inventory_lot.subject_type` 必须为 `MATERIAL`。
- `inventory_lot.subject_id` 必须等于 `material_id`。
- 如果关联采购入库行，`material_id / warehouse_id / lot_id` 必须与该入库行一致。
- 本轮只支持材料来料质检，不支持 `PRODUCT` 成品质检。

## 库存流水边界

质检状态变化不是库存数量变化，因此：

- `Create / Submit / Pass / Reject / Cancel` 都不写 `inventory_txns`。
- 本轮不修改 `inventory_balances` 字段，也不更新余额数量。
- `quality_inspections` 是质量判定和批次状态变化真源；`inventory_txns` 仍是库存数量变化真源。
- 退供应商、入库数量更正、未来报废或通用调整等真实数量变化，必须继续通过对应业务单据写库存流水。

## 与采购退货和入库调整的边界

| 场景 | 当前归属 |
| --- | --- |
| 质检不合格 | `RejectQualityInspection` 把批次改为 `REJECTED`。 |
| 不合格后退供应商 | 继续走 `purchase_returns`；采购退货当前允许从 `REJECTED` 批次扣减。 |
| 采购退货反查质检单 | 本轮不新增 `purchase_returns.quality_inspection_id`；先通过 `lot_id / purchase_receipt_item_id / note` 追溯。 |
| 入库数量多记 / 少记 | 继续走 `purchase_receipt_adjustments`。 |
| 入库批次或仓库填错 | 继续走 `purchase_receipt_adjustments` 的一出一入更正。 |
| 质量判定 | 只由 `quality_inspections` 和批次状态联动表达，不用 adjustment 改数量。 |

## 追溯保护

| 对象 | 保护策略 |
| --- | --- |
| `quality_inspections` | Ent hook 禁止普通 `Delete / DeleteOne`；如需作废，走 `CancelQualityInspection`。 |
| 关键字段 | 普通 update 禁止修改 `inspection_no / purchase_receipt_id / purchase_receipt_item_id / inventory_lot_id / material_id / warehouse_id / status / result / original_lot_status / inspected_at / inspector_id`。 |
| 状态变化 | 只能通过 `SubmitQualityInspection / PassQualityInspection / RejectQualityInspection / CancelQualityInspection` 进入事务内状态机。 |
| 来源 FK | `purchase_receipt_id / purchase_receipt_item_id / inventory_lot_id / material_id / warehouse_id` 使用数据库 `ON DELETE NO ACTION`，防止绕过 Ent 删除破坏追溯。 |

## 权限与 API

本轮只落后端 schema、repo/usecase、migration、测试和正式后端文档，未接 JSON-RPC/API、前端页面或帮助中心，因此不修改 `server/internal/biz/rbac.go`。

后续接 API 时建议补动作级权限码：

- `quality.inspection.read`
- `quality.inspection.create`
- `quality.inspection.submit`
- `quality.inspection.pass`
- `quality.inspection.reject`
- `quality.inspection.cancel`

不建议把会改变批次可用性的 submit / pass / reject / cancel 合并到普通 update 权限。

## PostgreSQL 本地验收入口

Phase 2D 继续使用独立本地测试库：

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

`phase2d_pg_test` 覆盖 `quality_inspections` 表结构、`inspection_no` 唯一约束、`inventory_lot_id` 的 `SUBMITTED` 局部唯一约束、FK `ON DELETE NO ACTION`、绕过 Ent 的直接 SQL 删除失败、Submit / Pass / Reject / Cancel 的批次状态联动，以及既有采购入库 / 退货 / 调整 / 批次状态守卫回归。

## 当前仍未做

| 暂不落地 | 说明 |
| --- | --- |
| `quality_inspection_items` | 缺陷明细、抽样数量、不良数量和检验项目后续进入 C2-B 评审。 |
| defect 字典 / 检验标准 | 本轮只做主表和判定，不进入完整品质模块。 |
| `available_quantity / hold_quantity / reserved_quantity` | `inventory_balances` 仍只有账面 `quantity`。 |
| `stock_reservations` | 不做库存预留 / 占用。 |
| `warehouse_locations` | 不做库位。 |
| `purchase_returns.quality_inspection_id` | 先通过批次和入库行追溯，等退货与质检 API 稳定后再评审。 |
| 供应商评级 / 财务扣款 | 不接供应商质量统计、应付红冲、发票、付款或财务核销。 |
| 生产、委外、成品质检 | 本轮只做材料来料质检最小主表。 |
| 前端 / API / 帮助中心 | 未接页面、菜单、JSON-RPC/API 或帮助中心。 |
| 旧 `business_records` 迁移 | 继续作为通用单据快照和兼容层，不删除、不替换、不批量迁移。 |
| 真实分区 migration / 几十亿级压测 | 当前只做功能、约束和本地 PostgreSQL 行为验证。 |
