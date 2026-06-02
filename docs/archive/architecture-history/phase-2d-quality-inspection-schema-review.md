# Phase 2D-C2 quality_inspections 最小主表设计评审

> 结论：本轮只做 `quality_inspections` 最小主表设计评审，不改 Ent schema，不生成 migration，不改运行时代码，不改前端和帮助中心。下一轮建议优先落 `quality_inspections` 主表和最小 `lot.status` 联动；`quality_inspection_items`、可用 / 冻结 / 预留库存、供应商评级、财务扣款和采购退货质检外键继续暂缓。

## 评审依据

| 范围 | 当前已确认口径 |
| --- | --- |
| 库存事实 | `inventory_txns` 是库存历史事实真源，`inventory_balances` 是当前余额 / 查询加速表，数量变化必须追加流水并同事务更新余额。 |
| 批次身份 | `inventory_lots` 是批次追溯和批次可用性状态真源，当前状态为 `ACTIVE / HOLD / REJECTED / DISABLED`。 |
| 批次状态守卫 | 普通扣减只允许 `ACTIVE` 批次；`PURCHASE_RETURN` 允许从 `ACTIVE / HOLD / REJECTED` 批次扣减；`REVERSAL` 不受当前 `lot.status` 阻断；`lot_id = NULL` 的非批次库存不受批次状态管控。 |
| 采购入库 | `purchase_receipts / purchase_receipt_items` 是采购入库专表真源，过账写 `IN` 并生成或复用材料批次。 |
| 采购退货 | `purchase_returns / purchase_return_items` 是采购退货专表真源，过账写 `OUT`，取消写 `REVERSAL`，有关联原入库行时累计有效退货不得超过 `effective_receipt_quantity`。 |
| 入库调整 | `purchase_receipt_adjustments / purchase_receipt_adjustment_items` 只处理已过账入库后的数量差异和 `lot / warehouse` 更正，不表达质量判定。 |
| 当前未落 | 尚无 `quality_inspections / quality_inspection_items`、可用 / 冻结 / 预留库存、库位、供应商评级、财务扣款、生产质检、成品质检或外部 API / 前端入口。 |

## 1. Phase 2D-C2 边界

本轮只评审 `quality_inspections` 最小主表是否应该落、怎么落，以及它和 `inventory_lots.status` 如何联动。

| 本轮只评审 | 本轮明确不做 |
| --- | --- |
| 来料质检最小主表定位。 | 不做完整品质模块。 |
| 质检单状态机和批次状态联动。 | 不做 `quality_inspection_items` 明细。 |
| 是否记录原批次状态和取消恢复边界。 | 不做缺陷项字典、检验标准、抽样标准和质量报表。 |
| 与采购退货、采购入库调整、库存流水的边界。 | 不做供应商评级、财务扣款、应付、发票、付款和财务核销。 |
| 后续 RBAC 权限码建议。 | 不做 `available_quantity / hold_quantity / reserved_quantity`，不做 `stock_reservations`，不做 `warehouse_locations`。 |
| 下一轮最小落地路线。 | 不做生产质检、成品质检、委外质检，不接前端、JSON-RPC/API 或帮助中心。 |

本轮也不新增完整采购订单 / 采购合同 / 审批流，不迁移旧 `business_records`，不删除或替换 `business_records`，不对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`，不做真实分区 migration，不做几十亿级压测。

## 2. 为什么 Phase 2D-C1 不够

Phase 2D-C1 已经解决“批次状态能不能挡住错误扣减”的安全问题，但它不是质检记录真源。

| C1 已能解决 | C1 仍不能解决 |
| --- | --- |
| `inventory_lots.status = HOLD / REJECTED` 可以阻止普通出库、普通调整和未来普通扣减。 | 不能说明是谁检验、什么时候检验、为什么 HOLD、为什么 REJECTED。 |
| `PURCHASE_RETURN` 可以从 `HOLD / REJECTED` 批次扣减，用于退供应商。 | 不能记录让步接收、复检、判定依据、处理意见和检验责任人。 |
| `REVERSAL` 不受当前批次状态阻断，取消链路可恢复。 | 不能解释批次为什么从 `HOLD -> ACTIVE` 或 `HOLD -> REJECTED`。 |
| 非批次库存继续按余额规则处理。 | 不能作为质量追溯、供应商质量统计或后续退货原因的正式来源。 |

因此，`lot.status` 适合作为库存可用性控制字段；`quality_inspections` 才适合作为质检判定、放行、拒收和让步接收的记录真源。C2 的核心问题不是替代 C1，而是给 C1 的状态变化补上可追溯的业务来源。

## 3. `quality_inspections` 最小主表业务定位

建议 `quality_inspections` 只承接“采购入库后、按批次判定是否释放”的来料质检记录，不承接完整品质模块。

| 字段 | 建议 | 说明 |
| --- | --- | --- |
| `inspection_no` | 必须 | 检验单号，唯一。 |
| `purchase_receipt_id` | 必须 | 关联已过账采购入库单，质检入口不脱离入库事实。 |
| `purchase_receipt_item_id` | 可选但推荐 | 如果按入库行发起质检则记录；少数整批跨行复检场景可为空。 |
| `inventory_lot_id` | 必须 | 质检最小粒度建议落在批次；非批次库存暂不纳入来料质检主路径。 |
| `material_id` | 必须 | 保存物料维度，创建时应与批次和可选入库行一致。 |
| `warehouse_id` | 必须 | 保存当前质检对应仓库；不做库位。 |
| `status` | 必须 | 建议使用 `DRAFT / SUBMITTED / PASSED / REJECTED / CANCELLED`。 |
| `result` | 必须但可空 | 草稿 / 已提交未判定时为空；判定后为 `PASS / REJECT / CONCESSION`。 |
| `inspected_at` | 判定时必须 | 表达实际检验或判定时间；草稿可为空。 |
| `inspector_id` | 可选 | 当前没有品质人员专表，先保留管理员 ID 或业务用户 ID 入口；是否强制后续由 API/RBAC 决定。 |
| `decision_note` | 可选但判定异常时推荐必填 | 记录放行、拒收、让步接收或取消原因，不拆缺陷明细。 |
| `original_lot_status` | 推荐必须 | 只要质检单会改 `lot.status`，就应记录提交质检前的批次状态，用于取消待判质检和审计。 |
| `created_at / updated_at` | 必须 | 常规审计时间。 |

本轮不建议增加抽检数量、不良数量、缺陷数量、缺陷项字典、检验项目、抽样标准或图片附件。原因是当前主路径只需要解释批次状态为什么变化；一旦把数量统计和缺陷结构放进 C2-A，就会直接进入完整品质模块，复杂度和前端 / API 需求都会明显扩大。

## 4. 状态机设计

推荐采用：

```text
DRAFT -> SUBMITTED -> PASSED
                    -> REJECTED
DRAFT -> CANCELLED
SUBMITTED -> CANCELLED
```

不推荐 `PENDING / FAILED` 命名作为第一版主路径：`SUBMITTED` 更清楚表达“已提交并进入待检 / 待判”，`REJECTED` 与当前 `inventory_lots.status = REJECTED` 语义一致，减少跨表翻译。

| inspection.status | 语义 | 对 lot.status 的推荐动作 | 是否可改 |
| --- | --- | --- | --- |
| `DRAFT` | 草稿，尚未进入正式质检。 | 不自动改批次状态。 | 允许编辑和取消。 |
| `SUBMITTED` | 已提交待检 / 待判。 | 同事务把 `ACTIVE / REJECTED` 批次改成 `HOLD`；如果已是 `HOLD`，保持 `HOLD`。拒绝 `DISABLED`。 | 只允许补充非关键备注；不允许改来源、物料、仓库、批次。 |
| `PASSED` | 已判定释放。 | 同事务把批次改成 `ACTIVE`。 | 不允许普通修改；更正应走复检或后续作废评审。 |
| `REJECTED` | 已判定不合格。 | 同事务把批次改成 `REJECTED`。 | 不允许普通修改；退供应商走采购退货。 |
| `CANCELLED` | 草稿作废或待判撤销。 | `DRAFT` 取消不影响批次；`SUBMITTED` 取消在校验通过时恢复 `original_lot_status`。 | 终态，不允许再次提交。 |

关键规则：

- 已判定的 `PASSED / REJECTED` inspection 不允许普通编辑，也不建议在 C2-A 允许取消后恢复批次状态。若要推翻结论，建议新增一张复检 / 让步接收 inspection。
- 一个 lot 可以有多张历史 inspection，用于复检、让步接收或后续追溯。
- 同一 lot 同一时间只能有一张影响批次状态的 `SUBMITTED` inspection。`DRAFT` 可以存在但不影响状态；是否限制多草稿可后续按 API 体验决定。
- 不通过“扫描所有 inspection 动态计算 lot.status”。`inventory_lots.status` 仍是库存扣减的当前状态真源，`quality_inspections` 是导致状态变化的业务记录真源。状态变化必须在 inspection 状态流转事务内写回 `inventory_lots.status`。
- 如果多个历史 inspection 同时存在，当前 `lot.status` 以最后一次成功流转并写回批次的非取消判定为准；同时依靠“同一 lot 只允许一个 `SUBMITTED`”避免两个待判单争抢状态。

## 5. `lot.status` 联动策略

| 动作 | 评审结论 | 推荐 |
| --- | --- | --- |
| 创建质检单是否自动把 `lot.status` 改成 `HOLD` | 不建议。草稿可能只是准备记录，直接 HOLD 容易出现无人提交的草稿冻结库存。 | `DRAFT` 不改批次状态。 |
| 提交质检单是否改 `HOLD` | 建议。提交表示正式进入待检 / 待判，必须阻止普通扣减。 | `DRAFT -> SUBMITTED` 同事务锁定 lot，记录 `original_lot_status`，把 `ACTIVE / REJECTED` 改成 `HOLD`，已是 `HOLD` 则保持。 |
| 判定 `PASSED` 是否改 `ACTIVE` | 建议。放行结果应让普通扣减恢复。 | `SUBMITTED -> PASSED` 同事务把 lot 改成 `ACTIVE`，`result = PASS`。 |
| 判定 `REJECTED` 是否改 `REJECTED` | 建议。不合格批次应继续阻止普通领用，但允许采购退货。 | `SUBMITTED -> REJECTED` 同事务把 lot 改成 `REJECTED`，`result = REJECT`。 |
| 取消质检单是否恢复原状态 | 只建议对未判定的 `SUBMITTED` 允许。 | `SUBMITTED -> CANCELLED` 只有在当前 lot 仍为本单造成的 `HOLD` 时恢复 `original_lot_status`；否则拒绝取消。 |
| 当前 lot 已被其他业务改了，是否允许恢复 | 不允许盲目恢复。 | 如果当前 `lot.status` 不符合预期，例如已被其他质检或人工状态入口改为 `ACTIVE / REJECTED / DISABLED`，取消应失败并提示先处理状态冲突。 |
| 让步接收是否等价于 `PASSED` | 对库存可用性等价，对质检结果不等价。 | lot 最终改 `ACTIVE`；inspection 建议 `status = PASSED`、`result = CONCESSION`，`decision_note` 必填。暂不新增 `lot.status = CONCESSION / WAIVED`。 |

这个策略保持 C1 的库存扣减守卫不变：`ACTIVE` 可普通扣减，`HOLD / REJECTED` 不可普通扣减，`PURCHASE_RETURN` 可扣 `ACTIVE / HOLD / REJECTED`，`DISABLED` 仍拒绝。

## 6. 是否要记录原 `lot.status`

如果 `quality_inspections` 会联动 `inventory_lots.status`，不建议省略 `original_lot_status`。

| 问题 | 推荐 |
| --- | --- |
| 是否需要 `original_lot_status` | 需要。提交质检时记录当前批次状态，至少支持待判取消和审计。 |
| 取消 inspection 时是否恢复 | 只对 `SUBMITTED -> CANCELLED` 恢复；`DRAFT` 取消无动作；`PASSED / REJECTED` 不建议在 C2-A 取消恢复。 |
| inspection 期间 lot.status 被别人改了是否还恢复 | 不恢复。取消时应锁定 lot 并校验当前状态仍是本 inspection 造成的 `HOLD`，否则返回冲突。 |
| 是否需要 version / optimistic lock | 长期需要更清晰的并发控制，但 C2-A 可暂缓新增 version 字段。 |
| C2-A 并发策略 | 先用数据库事务、`SELECT ... FOR UPDATE` 锁 lot、同一 lot active inspection 唯一约束或事务内查询校验，以及“当前状态必须等于预期状态”的条件更新。 |

当前 `inventory_lots` 已有 `updated_at`，但它不是严格版本号。C2-A 不建议为了质检主表先给 lot 增加通用 version；只要所有会改批次状态的质检动作都在事务内锁 lot，并在状态不匹配时失败，就能覆盖当前阶段的主要风险。

## 7. 质检与采购退货关系

质检拒收和退供应商不是同一个动作。

| 主题 | 推荐口径 |
| --- | --- |
| 质检 `REJECTED` 后如何退供应商 | 应继续走 `purchase_returns`，由采购退货写 `inventory_txns.OUT` 并扣减 `inventory_balances`。 |
| 当前采购退货是否允许扣 REJECTED 批次 | 允许。C1 已明确 `PURCHASE_RETURN` 可从 `ACTIVE / HOLD / REJECTED` 批次扣减，拒绝 `DISABLED`。 |
| 是否需要 `purchase_returns.quality_inspection_id` | 长期可以考虑，便于从退货反查质检判定。 |
| C2-A 是否新增该字段 | 暂不推荐。第一步只让质检主表成为批次状态变化真源，不同时扩采购退货 schema。 |
| 不加字段如何追溯 | 通过 `purchase_return_items.lot_id`、可选 `purchase_receipt_item_id` 与 inspection 的 `inventory_lot_id / purchase_receipt_item_id` 关联；退货单或行的 `note` 可写质检单号作为过渡。 |

暂缓 `purchase_returns.quality_inspection_id` 的原因是：退货可能来自质检拒收、采购协商、错料、外观不符或后续仓储异常；过早加单一外键会把采购退货过度绑定到来料质检。等质检 API 和实际退货流程稳定后，再评审是否加 nullable FK 或独立关联表。

## 8. 质检与采购入库调整关系

| 场景 | 当前归属 |
| --- | --- |
| 入库后发现数量多记 / 少记 | 走 `purchase_receipt_adjustments` 的 `QUANTITY_DECREASE / QUANTITY_INCREASE`。 |
| 批次填错 | 走 `purchase_receipt_adjustments` 的 `LOT_CORRECTION_OUT / LOT_CORRECTION_IN`。 |
| 仓库填错 | 走 `purchase_receipt_adjustments` 的 `WAREHOUSE_CORRECTION_OUT / WAREHOUSE_CORRECTION_IN`。 |
| 质量不合格但数量无误 | 不应用 adjustment 改数量；应由质检判定并联动 `lot.status`。 |
| 不合格后退供应商 | 先由质检把批次判为 `REJECTED`，退货动作再走 `purchase_returns`。 |

采购入库调整的真源是“已入库事实的数量或库存维度更正”；质检的真源是“质量判定和批次可用性变化”。不合格但实物仍在仓时，账面数量不应被 adjustment 改少，否则会掩盖后续退货、报废或让步接收的真实来源。

## 9. 是否需要 `inventory_txns`

质检状态变化不改变库存数量，因此不写 `inventory_txns`。

| 动作 | 是否写库存流水 | 原因 |
| --- | --- | --- |
| 创建 / 提交质检单 | 不写 | 只改变批次待检状态，不改变账面数量。 |
| 判定合格 / 让步接收 | 不写 | 放行只把批次改回 `ACTIVE`，不增加库存。 |
| 判定不合格 | 不写 | 不合格是质量结论，不等于库存减少。 |
| 取消未判定质检 | 不写 | 恢复原状态也不是数量变化。 |
| 退供应商 | 写，由 `purchase_returns` 写 | 退货过账真实减少库存。 |
| 入库数量更正 | 写，由 `purchase_receipt_adjustments` 写 | 调整真实改变账面数量或库存维度。 |
| 报废 / 盘亏 / 转仓 | 后续另评审 | 如果未来产生数量变化，必须有对应业务单据和 source_type。 |

`quality_inspections` 是状态 / 判定真源，不是库存流水真源。不能为了记录质检动作而写 `QUALITY_HOLD / QUALITY_RELEASE / QUALITY_REJECT` 类库存流水；只有退货、调整、报废、转仓等数量或库存维度变化，才进入 `inventory_txns`。

## 10. 是否需要 `quality_inspection_items`

| 方案 | 做法 | 优点 | 缺点 | 当前判断 |
| --- | --- | --- | --- | --- |
| 方案 A：Phase 2D-C2 只做 `quality_inspections` 主表 | 记录质检单号、来源入库、入库行、批次、物料、仓库、状态、结果、检验人、时间和处理意见，并联动 `lot.status`。 | 快速补上质检记录真源；复杂度可控；能解释批次为什么 HOLD / ACTIVE / REJECTED。 | 没有缺陷明细、抽样数量、不良数量和检验项目统计。 | 推荐作为下一轮 C2-A 主路径。 |
| 方案 B：`quality_inspections + quality_inspection_items` 一起做 | 主表加明细，记录缺陷项、抽样、判定和处理。 | 记录更完整，后续可支撑供应商质量统计和质量报表。 | 复杂度高，容易同时拉入缺陷字典、抽样标准、附件、审批、前端和报表，直接进入完整品质模块。 | 暂缓。等主表和 lot 状态联动稳定后再做 C2-B。 |
| 方案 C：继续只用 `lot.status`，不做 inspection 表 | 通过批次状态控制库存可用性。 | 最简单，不新增 schema。 | 没有质检记录，不可追溯；无法解释谁、何时、为何改状态，也难以支持让步接收和退货原因。 | 不推荐继续作为长期主路径。C1 只解决安全守卫，不解决质检真源。 |

推荐方案 A。它能在不进入完整品质模块的前提下补齐当前最大缺口：批次状态变化缺少业务记录真源。方案 B 应等实际质检明细、缺陷分类和报表口径明确后再评审。

## 11. RBAC 权限码建议

当前 `rbac.go` 已有：

- `quality.inspection.read`
- `quality.inspection.create`
- `quality.inspection.update`

C2-A 若只落 schema、repo/usecase 和测试且不接外部 JSON-RPC/API，可以暂不改 `rbac.go`。一旦接 API 或前端入口，建议把“草稿编辑”和“影响批次可用性”的动作拆开：

| 权限码 | 建议用途 |
| --- | --- |
| `quality.inspection.read` | 查看质检单、批次质检状态和来源追溯。 |
| `quality.inspection.create` | 创建 `DRAFT` 质检单。 |
| `quality.inspection.update` | 编辑 `DRAFT` 中不影响库存可用性的字段。 |
| `quality.inspection.submit` | 提交质检单并把批次置为 `HOLD`。 |
| `quality.inspection.pass` | 判定合格或让步接收并把批次置为 `ACTIVE`。 |
| `quality.inspection.reject` | 判定不合格并把批次置为 `REJECTED`。 |
| `quality.inspection.cancel` | 取消草稿或未判定质检，必要时恢复原批次状态。 |

不建议用现有 `quality.inspection.update` 直接覆盖 submit / pass / reject / cancel，因为这些动作会改变库存可用性，应按高风险动作单独授权和审计。

## 12. 推荐落地路线

| 阶段 | 推荐范围 | 继续不做 |
| --- | --- | --- |
| Phase 2D-C2 Review | 本轮只新增本设计评审文档。 | 不改 schema，不生成 migration，不改 runtime，不改前端，不改帮助中心，不 apply 数据库。 |
| Phase 2D-C2-A | 落 `quality_inspections` 最小主表；新增最小 repo/usecase 状态流转；提交质检联动 `lot.status = HOLD`；判定合格 / 让步接收联动 `ACTIVE`；判定不合格联动 `REJECTED`；记录 `original_lot_status`；补普通 Go 和 PostgreSQL 行为测试。 | 暂不新增 `quality_inspection_items`；暂不新增 `purchase_returns.quality_inspection_id`；不接前端/API/帮助中心；不改余额字段。 |
| Phase 2D-C2-B | 在真实缺陷记录、抽样数量、不良数量和检验项目口径明确后，再评审是否落 `quality_inspection_items`。 | 不在 C2-A 抢先建缺陷字典、检验标准、供应商评级和质量报表。 |
| Phase 2E | 再评审生产领料或通用库存调整；如果出现部分冻结、锁库、拆批或出货预留，再统一评审 `stock_reservations`、可用 / 冻结 / 预留数量和库位。 | 不把来料质检主表扩成生产、委外、成品质检或完整库存占用模块。 |

C2-A 若落表，建议至少同步确认这些约束：

- `inspection_no` 唯一。
- `purchase_receipt_id` 指向 `purchase_receipts.id`，建议 `ON DELETE NO ACTION`。
- `purchase_receipt_item_id` nullable，但非空时必须属于 `purchase_receipt_id`。
- `inventory_lot_id` 指向 `inventory_lots.id`，建议 `ON DELETE NO ACTION`。
- `material_id / warehouse_id` 必须与批次、入库行和当前质检口径一致。
- 同一 `inventory_lot_id` 同一时刻只允许一张影响状态的 `SUBMITTED` inspection。
- `PASSED / REJECTED / CANCELLED` 后影响来源和批次状态的关键字段不允许普通 update。

## 13. 最终推荐

| 决策 | 推荐 |
| --- | --- |
| 下一轮是否落 `quality_inspections` 主表 | 推荐落。C1 已解决扣减守卫，下一步应补质检记录真源。 |
| 下一轮是否联动 `lot.status` | 推荐联动。提交改 `HOLD`，合格 / 让步接收改 `ACTIVE`，拒收改 `REJECTED`。 |
| 是否暂缓 `quality_inspection_items` | 暂缓。缺陷明细、抽样和不良数量属于 C2-B 或完整品质模块。 |
| 是否暂缓 `available_quantity / hold_quantity / reserved_quantity` | 暂缓。当前 `inventory_balances` 仍只维护账面 `quantity`。 |
| 是否暂缓 `stock_reservations` | 暂缓。预留 / 占用等生产领料、出货和部分冻结需求稳定后再统一设计。 |
| 是否暂缓供应商评级 / 财务扣款 | 暂缓。供应商质量统计、扣款、索赔、应付红冲和财务核销都不属于 C2-A。 |
| 是否暂缓 `purchase_returns.quality_inspection_id` | 暂缓。先通过 `lot_id / purchase_receipt_item_id / note` 追溯，等退货和质检 API 稳定后再评审外键或关联表。 |
| 是否需要先扩 RBAC 权限码 | 不需要先扩。C2-A 如果只落后端表和 usecase 可暂缓；接外部 API / 前端前必须同轮补 `submit / pass / reject / cancel` 等动作权限。 |

本轮最终建议：Phase 2D-C2-A 只落 `quality_inspections` 最小主表和 `lot.status` 事务内联动，不落 `quality_inspection_items`，不改 `inventory_balances`，不新增库存占用、供应商评级、财务扣款或采购退货质检外键。
