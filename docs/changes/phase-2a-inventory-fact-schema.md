# Phase 2A 库存事实专表

## 结论

Phase 2A 只落地材料、成品、仓库、库存事实流水和库存余额的最小闭环。`business_records / business_record_items / business_record_events` 继续作为通用单据快照、流程兼容和调试验收层，不删除、不替代、不迁移为库存事实真源。

## 新增专表

| 表 | 定位 |
| --- | --- |
| `units` | 单位字典，定义 `PCS / M / KG / YD` 等单位和数量精度。 |
| `materials` | 材料主档，当前只保留 code、name、category、spec、color、默认单位和启用状态。 |
| `products` | 成品主档，当前只保留 code、name、style_no、customer_style_no、默认单位和启用状态。 |
| `warehouses` | 仓库主档，当前支持原料仓、成品仓、WIP 等类型。 |
| `inventory_txns` | 库存事实流水真源。入库、出库、调整、转移和冲正都以追加流水表达。 |
| `inventory_balances` | 当前库存余额 / 查询加速表，按 `subject_type + subject_id + warehouse_id + unit_id` 聚合。 |

## 库存事实规则

- `inventory_txns` 是库存历史事实真源，不做软删除，不直接修改或删除历史事实；Ent schema 通过 `Immutable()` 和 mutation hook 拒绝普通 update/delete。
- `ApplyInventoryTxnAndUpdateBalance` 在同一个数据库事务内完成幂等检查、引用校验、流水新增、余额变更和负库存校验；任一步失败都会回滚，不允许出现流水成功但余额失败，或余额成功但流水失败。
- 库存错误通过新增 `txn_type=REVERSAL` 的冲正流水表达，并记录 `reversal_of_txn_id`；冲正流水必须与原流水的主体、仓库、单位、数量匹配，方向相反，不允许修改原流水。
- `reversal_of_txn_id` 有唯一约束，同一原流水只能被冲正一次；相同 `idempotency_key` 的重复冲正请求返回已有流水，不重复影响余额。
- `inventory_balances` 可以由业务事务更新，但必须能由 `inventory_txns` 聚合校验。
- 同一个 `idempotency_key` 重复提交时返回已有流水，标记为幂等重放，不重复增加或扣减库存，不把唯一键冲突直接暴露为普通业务失败。
- `direction=1` 表示入库类影响，`direction=-1` 表示出库类影响。
- 当前默认禁止负库存；如后续允许负库存，必须先补仓库级配置和校验口径。
- 并发余额更新采用数据库事务 + 原子 SQL：入库类使用 `ON CONFLICT` 累加余额，出库类使用 `UPDATE ... WHERE quantity + delta >= 0` 条件更新，避免并发出库绕过负库存校验。
- `subject_type + subject_id` 本轮暂不建多态外键，但业务层会校验 `MATERIAL` 必须指向 `materials.id`，`PRODUCT` 必须指向 `products.id`。
- 数量字段使用 decimal/numeric，不使用 float。

## 当前没有落地的范围

| 暂不落地 | 原因 |
| --- | --- |
| `bom_headers / bom_items` | 本轮不一次性落 BOM，先把库存事实底座跑通。 |
| 采购、生产、委外、品质、财务专表 | 这些链路仍依赖更多字段真源、单据样本和 workflow source 迁移策略。 |
| `inventory_lots` | 批次 / 质量状态后续按入库、IQC、成品批次需求再加。 |
| `warehouse_locations` | 当前不做复杂库位，先以仓库维度承接最小闭环。 |
| `stock_reservations` | 预留 / 占用等出货和领料能力后续按业务需求再推进。 |
| 十亿级分区 migration | Phase 2A 保留未来按 `occurred_at` 分区策略，但本轮不实际创建分区表。 |

## 兼容边界

- 通用业务记录仍负责列表、表格弹窗、打印快照、帮助中心和 debug seed / cleanup 的兼容路径。
- workflow 的 `source_type/source_id` 当前不强制迁移到库存专表；库存流水通过自己的 `source_type/source_id/source_line_id` 追溯来源。
- Phase 2A 不改前端页面，不改帮助中心，不迁移历史 `business_records` 到专表。
