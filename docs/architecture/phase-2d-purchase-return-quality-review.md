# Phase 2D 采购退货 / 入库差异 / 来料质检入口评审

> 结论：本轮只做设计评审，不改 Ent schema，不生成 migration，不改运行时代码，不改前端和帮助中心。Phase 2D 后续优先落地采购退货最小闭环，暂缓完整质检专表、采购差异专表、库存预留和可用库存拆分。

## 评审依据

| 类型 | 文件 / 范围 | 关键结论 |
| --- | --- | --- |
| 当前真源 | `README.md`、`docs/current-source-of-truth.md` | Phase 2A / 2B / 2C 已形成库存、批次和采购入库最小闭环；`inventory_txns` 是库存事实流水真源，`inventory_balances` 是当前余额 / 查询加速表，`inventory_lots` 是批次追溯真源。 |
| Phase 2A | `docs/changes/phase-2a-inventory-fact-schema.md`、`docs/architecture/material-product-inventory-schema-review.md` | 库存事实用追加流水表达，余额同事务更新，错误用 `REVERSAL` 冲正，不直接改历史流水。 |
| Phase 2B | `docs/changes/phase-2b-bom-lot-schema.md` | 批次进入 `inventory_txns.lot_id` 和 `inventory_balances.lot_id`；批次库存和非批次库存分开聚合、分开扣减，不能互相抵扣。 |
| Phase 2C | `docs/changes/phase-2c-purchase-receipt-schema.md`、`docs/architecture/phase-2c-purchase-receipt-review.md` | `purchase_receipts / purchase_receipt_items` 是采购入库专表真源；过账写 `IN`，取消已过账入库写 `REVERSAL`。 |
| 当前实现 | `server/internal/biz/inventory.go`、`server/internal/biz/purchase_receipt.go`、`server/internal/data/inventory_repo.go`、`server/internal/data/purchase_receipt_repo.go` | `ApplyInventoryTxnAndUpdateBalance` 负责幂等流水和余额更新；`CancelPostedPurchaseReceipt` 是整单取消，按原入库流水逐条冲正。 |
| 当前 schema / 测试 | `server/internal/data/model/schema/*.go`、`server/internal/data/inventory_repo_test.go`、`server/internal/data/inventory_postgres_test.go` | `inventory_txns` 不可更新 / 删除；`purchase_receipts / purchase_receipt_items` 禁止普通删除，过账 / 取消后关键字段不可改；测试已覆盖 source 追溯、批次隔离和取消冲正。 |

## 1. Phase 2D 边界

| 范围 | 本轮评审口径 |
| --- | --- |
| 评审采购退货 | 已入库后，部分或全部退回供应商时如何表达业务单据、库存 `OUT`、批次扣减、幂等和追溯。 |
| 评审入库差异 | 实收数量与采购单 / 送货单差异、破损、单价差异、单位换算差异，以及已过账后发现数量错误时如何处理。 |
| 评审来料质检入口 | 毛绒玩具工厂来料 IQC 如何与批次状态、库存可用性和后续品质模块衔接。 |
| 不做完整采购订单 | 当前没有 `purchase_orders`，不提前设计采购计划、订单审批、订单行关闭或订单余额。 |
| 不做供应商主数据 | Phase 2C 仍使用 `supplier_name` 快照；不新增 `suppliers`。 |
| 不做应付 / 发票 / 付款 / 财务核销 | 入库、退货和差异中的金额只作为业务快照或后续财务线索，不成为 AP 真源。 |
| 不做生产领料 / 委外 | 不引入生产、委外发料、回货、结算或成本表。 |
| 不做完整品质模块 | 不设计检验项目库、缺陷分类、抽样标准、判定流程、质量报表和责任追溯全套表。 |
| 不接前端 | 本轮不改页面、帮助中心、移动端入口或通用 `business_records` 展示逻辑。 |

本轮也不新增 `warehouse_locations`、`stock_reservations`，不迁移旧 `business_records`，不删除或替换 `business_records`，不对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`，不做真实分区 migration 和几十亿级压测。

## 2. 采购退货与取消入库的区别

`CancelPostedPurchaseReceipt` 和采购退货不是同一类业务。

| 主题 | 取消已过账入库 | 采购退货 |
| --- | --- | --- |
| 业务语义 | 原入库单整体作废，表示这张入库单不应成立。 | 入库已经成立，后续因质量、错料、协商等原因退回供应商。 |
| 操作粒度 | 当前实现按整单所有行冲正。 | 必须支持部分行、部分数量、多次退货。 |
| 库存语义 | 对原 `IN` 流水写 `REVERSAL`，抵消原事实。 | 从当前库存中真实出库，推荐写 `OUT`；取消退货时再对退货 `OUT` 写 `REVERSAL`。 |
| 批次要求 | 冲正继承原入库流水 `lot_id`。 | 必须显式按 `lot_id` 退指定批次；非批次库存只能从 `lot_id = NULL` 的余额扣。 |
| 追溯来源 | `source_type = PURCHASE_RECEIPT`，`source_id/source_line_id` 指向入库单头 / 行。 | 推荐 `source_type = PURCHASE_RETURN`，`source_id/source_line_id` 指向退货单头 / 行，并可在退货行记录原入库行。 |

### 方案比较

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A：复用 `purchase_receipts` 的 `CANCELLED / REVERSAL` | 退货时把原入库单改为取消，或复用 `CancelPostedPurchaseReceipt` 写冲正。 | 少建表；能复用现有取消和冲正实现。 | 不支持部分退货；不支持同一入库行多次退货；退货会把原入库语义改成“整单不成立”；`REVERSAL` 和真实退货出库混用后，来源追溯和库存审计会变得模糊。 | 不推荐。只能用于整单取消 / 整单冲正，不能作为采购退货主路径。 |
| 方案 B：新增 `purchase_returns / purchase_return_items` | 退货作为新业务单据，过账后按退货行写库存 `OUT`，取消退货时写退货 `OUT` 的 `REVERSAL`。 | 语义清晰；支持部分退货、多次退货、按批次退货；能保留原入库单成立事实；后续可衔接质量异常、供应商对账和应付扣减。 | 多一组表和状态机，需要新增幂等、库存扣减、取消退货和追溯测试。 | 推荐作为 Phase 2D-A 主路径。复杂度可控，且不污染 Phase 2C 的入库取消语义。 |

推荐 Phase 2D-A 新增退货专表，但只做最小闭环：

- `purchase_returns`：退货单头，状态建议先保持 `DRAFT / POSTED / CANCELLED`，保存退货单号、供应商名称快照、退货日期、可选原入库单引用和备注。
- `purchase_return_items`：退货行，保存材料、仓库、单位、`lot_id`、数量、可选原入库行 ID、退货原因和备注。
- 过账退货写 `inventory_txns.txn_type = OUT`、`direction = -1`。
- 取消已过账退货写 `inventory_txns.txn_type = REVERSAL`，冲正退货产生的 `OUT` 流水。
- 不做财务扣款、应付红冲、发票、付款或供应商主数据。

## 3. 入库差异

入库差异要先区分“过账前差异”和“过账后差异”。Phase 2C 当前没有完整采购订单，因此采购单 / 送货单数量只能作为外部快照或后续来源，不应反向伪造结构化订单余额。

| 场景 | 入库前处理 | 入库后处理 |
| --- | --- | --- |
| 采购单或送货单数量 100，实际收 98 | 采购入库行按实收 `98` 过账；缺的 `2` 不写库存流水。差异原因可暂记备注或通用快照。 | 已按 100 过账后发现实际只有 98，不能改 `POSTED` 入库行，应写调整 / 冲正类新流水扣减 2。 |
| 多收 | 若业务接受多收，按实收数量入库；若不接受，多收部分不入库或进入待处理 / HOLD 口径。 | 已过账后才确认多收，可用 `ADJUST_IN` 补入，来源指向调整单。 |
| 少收 | 按实收数量入库；订单未到齐是采购订单问题，当前 Phase 2D 不处理订单余额。 | 已过账多记时，用 `ADJUST_OUT` 或退货 / 报损等明确业务动作扣减。 |
| 破损 | 可只入库合格数量；破损但需仓库暂存时，后续可进入 HOLD 批次或异常处理。 | 已入库后发现破损，不能改原行；根据业务结果走采购退货 `OUT`、报损 `OUT` 或库存调整。 |
| 单价差异 | 不影响库存数量；当前 `unit_price / amount` 只是采购入库快照，不做财务真源。 | 已过账后发现单价错，不应通过库存流水修数量；后续采购 / 财务模块再处理价格差异。 |
| 单位换算差异 | 过账前应换算成当前 `unit_id` 对应的库存数量，避免同一材料多单位混入同一库存口径。 | 已过账后才发现换算错误，用数量调整表达差额；同时保留原错误来源，不能直接改历史入库行。 |
| 已入库后发现数量错误 | 不适用。 | 必须通过新业务单据和新库存流水表达，保持 `inventory_txns` 追加式事实。 |

### 差异表达方案

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A：直接修改 `POSTED` 入库行 | 改 `purchase_receipt_items.quantity` 或回写原入库流水。 | 表面简单，少建表。 | 违反当前不可变和追溯保护；会破坏 `inventory_txns.source_line_id` 对应的历史事实；并发和审计风险高。 | 禁止。 |
| 方案 B：新增 `purchase_receipt_adjustments` | 为已过账入库创建采购入库调整单，调整行指向原入库行，过账后写 `ADJUST_IN / ADJUST_OUT`。 | 采购语义完整；能沉淀入库差异、原因、责任和原入库行追溯。 | 又新增一组采购差异表和状态机；在没有完整采购订单、供应商主数据和差异报表前，可能提前扩大边界。 | 暂不作为下一轮优先项；Phase 2D-B 再按报表需求评审。 |
| 方案 C：先用库存调整单表达 | 已过账后的数量错误先走通用库存调整来源，写 `ADJUST_IN / ADJUST_OUT`，来源行记录调整原因和可选原入库行。 | 保持库存事实正确，表语义比直接改原行清楚；适合盘点差异、换算错误、录入错误等库存纠错。 | 采购差异报表不如专门的 `purchase_receipt_adjustments` 直接；仍需要一个受控的调整单来源，不能裸写孤立流水。 | 推荐 Phase 2D-B 优先评审。若后续采购差异统计成为硬需求，再新增采购入库差异专表。 |

本轮推荐：

- 入库前差异直接按实收数量进入 `purchase_receipt_items.quantity`，不写“未收数量”的库存流水。
- 已过账入库行保持不可变，不新增普通修改入口。
- Phase 2D-B 优先评审最小库存调整单；仅当采购差异需要独立状态、审批、报表和原入库行差异统计时，再新增 `purchase_receipt_adjustments / purchase_receipt_adjustment_items`。

## 4. 来料质检入口

毛绒玩具工厂来料质检常见问题包括：

| 来料类型 / 问题 | 例子 | 库存影响关注点 |
| --- | --- | --- |
| 面料色差 | 同一面料颜色与样板或上批次不一致。 | 需要按批次隔离，避免不合格批次被生产领用。 |
| 缸号问题 | 同色不同缸号混用导致成品色差。 | `inventory_lots.dye_lot_no` 是关键追溯字段，退货 / 放行必须按批次处理。 |
| 克重 / 幅宽不符 | 面料规格达不到订单或 BOM 要求。 | 可能降级使用、让步接收、退货或 HOLD 待判。 |
| 辅料缺陷 | 眼睛、鼻子、拉链、吊牌等破损或规格不符。 | 需要避免缺陷辅料进入生产。 |
| 包装材料问题 | 彩盒、胶袋、唛头、贴纸印刷错误。 | 可能影响出货但不一定影响材料库存数量。 |
| 填充棉质量问题 | 回弹、杂质、克重、阻燃或安全指标不合格。 | 不合格批次通常不能释放为生产可用库存。 |

### 关键问题回答

| 问题 | 评审结论 |
| --- | --- |
| 质检是在入库前，还是入库后？ | 业务上通常是“到货后、释放可用库存前”。系统可支持两种口径：严格场景先质检再过账合格数量；需要仓库实物管控时，先入库到 `HOLD` 批次，再由质检放行为 `ACTIVE` 或转退货 / 报损。当前 Phase 2D 只定义入口，不强制唯一流程。 |
| 不合格品是否进入库存？ | 未被仓库接收的物料可以不进入库存；已经实物收下并需要保管、退货或复检的物料，应进入库存但不能作为可用库存。当前 `inventory_balances` 只有 `quantity`，没有 `available_quantity / hold_quantity`，所以仅靠余额无法表达可用性。 |
| `HOLD` 是否放在 `inventory_lots.status`？ | 推荐把 `HOLD` 作为批次状态预留，因为质检结果通常按批次管控。当前实现只有 `ACTIVE / DISABLED`，且出入库校验未按批次状态拦截领用；后续如落地 HOLD，必须同步加 usecase 校验和测试。 |
| 是否需要 `quality_inspections / quality_inspection_items`？ | 当前不推荐 Phase 2D 直接新增。完整质检记录会牵动检验项目、抽样标准、缺陷分类、判定流程、返工 / 让步 / 退货等品质模块边界。 |
| Phase 2D 是否只做入口和状态预留？ | 推荐。Phase 2D-C 可先明确 IQC 入口、状态枚举和库存可用性限制，暂不落完整品质表。 |

### 方案比较

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A：只使用 `inventory_lots.status = HOLD / ACTIVE / DISABLED` | 来料入库后先把批次置为 HOLD，质检通过改 ACTIVE，不合格改 DISABLED 或后续退货。 | 简单；复用现有批次真源；适合先阻止不合格批次被领用。 | 缺少质检记录、抽样数据、判定过程和责任追溯；当前余额没有可用 / 冻结拆分；仅改状态不会生成库存数量事实。 | 可作为后续最小实现的一部分，但必须补状态校验，不能只改枚举。 |
| 方案 B：新增 `quality_inspections / quality_inspection_items` | 建质检单和质检行，记录项目、结果、缺陷、判定、处理方式，并驱动批次状态和后续退货。 | 记录完整，后续品质报表、供应商质量统计和责任追溯更清晰。 | 进入完整品质模块；会扩大 Phase 2D 范围并牵动检验标准、缺陷分类、流程和前端。 | 暂缓，不作为 Phase 2D 优先落地。 |
| 方案 C：Phase 2D 只定义接口和状态，不落品质表 | 本轮只明确 IQC 入口、批次状态含义、库存可用性限制和后续 source_type 预留。 | 保持边界，避免在质检样本和流程未稳定前建窄表；后续可从状态入口平滑扩展。 | 当前不能完整记录质检过程，也无法生成品质报表。 | 推荐作为本轮结论。Phase 2D-C 再决定是否只落状态校验，或进入质检专表评审。 |

## 5. 库存流水 source_type 设计

### 候选 source_type

| source_type | 是否建议新增 | 适用库存流水 | source 追溯 | 幂等键建议 | 本轮结论 |
| --- | --- | --- | --- | --- | --- |
| `PURCHASE_RETURN` | 是，Phase 2D-A 优先 | 退货过账写 `OUT`；取消退货写 `REVERSAL`。 | `source_id = purchase_returns.id`，`source_line_id = purchase_return_items.id`。退货行可另存原入库行 ID。 | `PURCHASE_RETURN:{return_id}:{item_id}:OUT`；取消退货用 `PURCHASE_RETURN:{return_id}:{item_id}:REVERSAL`。 | 推荐下一轮落地。 |
| `PURCHASE_RECEIPT_ADJUSTMENT` | 候选，Phase 2D-B 再评审 | 入库后数量差异写 `ADJUST_IN / ADJUST_OUT`。 | `source_id = adjustment.id`，`source_line_id = adjustment_item.id`，调整行可指向原入库行。 | `PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:ADJUST_IN` 或 `...:ADJUST_OUT`。 | 暂缓；先评审是否用通用库存调整。 |
| `QUALITY_HOLD` | 暂不进入 `inventory_txns` | 冻结本身不改变库存数量。 | 若后续有质检单，指向质检行；若仅改批次状态，不应写库存流水。 | 状态变更可有自己的业务幂等键，但不占用库存流水幂等。 | 暂缓。状态变化不应伪造库存数量流水。 |
| `QUALITY_RELEASE` | 暂不进入 `inventory_txns` | 放行本身不改变库存数量。 | 同上。 | 同上。 | 暂缓。 |
| `QUALITY_REJECT` | 视处理结果而定 | 如果只是判定不合格，改批次状态；如果报废 / 退货 / 扣减库存，则由报废或采购退货等业务写 `OUT`。 | 指向产生库存影响的业务单据行。 | 按实际业务单据设计，例如退货仍用 `PURCHASE_RETURN:{return_id}:{item_id}:OUT`。 | 不单独作为 Phase 2D 库存 source 主路径。 |

### REVERSAL 与 OUT 的区别

| 类型 | 语义 | 是否指向原流水 | 典型场景 |
| --- | --- | --- | --- |
| `OUT` | 一次真实业务出库，减少当前库存。 | 不需要指向原入库流水，但必须指向本次出库业务来源行。 | 采购退货、生产领料、报废、出货等。 |
| `REVERSAL` | 对某一条已有库存流水做冲正，表示原库存影响需要被抵消。 | 必须有 `reversal_of_txn_id`，且当前实现要求同一原流水只能冲正一次。 | 取消已过账入库、取消已过账退货、纠正误写流水。 |

### 追溯保障

`source_type/source_id/source_line_id` 的追溯能力依赖三个条件同时成立：

1. `source_type` 必须指向稳定业务来源类型，例如 `PURCHASE_RECEIPT`、`PURCHASE_RETURN` 或后续受控调整单类型，不能把不同业务混用成同一个来源。
2. `source_id` 必须指向来源单据头，`source_line_id` 必须指向真实来源行。对采购退货、采购入库调整这类行级库存影响，后续实现应要求 `source_line_id` 非空。
3. 被库存流水引用的来源单据头和来源行必须禁止普通物理删除；`POSTED / CANCELLED` 后影响库存事实的关键字段必须不可变。Phase 2C 已在采购入库上采用这一规则，Phase 2D-A 退货单也应沿用。

`idempotency_key` 只负责防重复写入库存影响，不替代来源追溯。重复点击、重试或重放应返回同一条库存流水；业务审计仍通过 `source_type/source_id/source_line_id` 回到业务单据和单据行。

采购退货推荐写 `OUT`，因为它不是否认原入库事实，而是在原入库成立后发生新的出库业务。只有“取消退货”或“纠正误退货”才应对退货 `OUT` 写 `REVERSAL`。

质检冻结不推荐写 `inventory_txns`：冻结 / 放行不改变 `quantity`，写库存流水会把状态变更伪装成数量事实。后续如果要影响可用量，应优先设计 `available_quantity / hold_quantity` 或受控的 hold ledger，而不是用 `IN / OUT / REVERSAL` 混表达。

## 6. 批次与余额影响

| 主题 | 规则 |
| --- | --- |
| 采购退货按批次出库 | 退货行必须能指定 `lot_id`。对于有批次的入库来源，退货必须从对应批次余额扣减，不能只按材料总库存扣。 |
| 退货数量上限 | 退货数量不能超过该 `subject_type + subject_id + warehouse_id + lot_id + unit_id` 当前余额；当前 `ApplyInventoryTxnAndUpdateBalance` 已通过条件更新防止负库存，后续退货 usecase 应复用这一路径。 |
| 非批次与批次隔离 | `lot_id = NULL` 的非批次库存和任意批次库存不能互相抵扣。退货行无 `lot_id` 只能扣非批次余额；有 `lot_id` 只能扣该批次余额。 |
| 入库后差异 | `POSTED` 入库行和原 `IN` 流水不可直接修改；数量差异必须通过新流水调整，来源指向调整单或后续采购差异单。 |
| 质检 HOLD 与余额 | 当前 `inventory_balances` 只有 `quantity`，没有 `available_quantity / reserved_quantity / hold_quantity`。单靠 `HOLD` 状态不会改变余额数量，也不会天然改变查询可用量。 |
| 是否需要 `stock_reservations` / hold balances | 本轮暂缓。采购退货和入库差异可以先复用现有余额扣减；质检可用性问题先在状态入口评审清楚，等生产领料 / 出货预留进入范围时再统一设计可用量、冻结量和预留量。 |

如果 Phase 2D-C 后续决定落 `HOLD`，至少还要同步评审：

1. `inventory_lots.status` 是否扩展为 `HOLD / ACTIVE / DISABLED / REJECTED`。
2. 出库、生产领料、采购退货是否允许从 HOLD 批次扣减。
3. 库存查询是否默认排除 HOLD 批次，或显示账面量与可用量差异。
4. 是否需要在 `inventory_balances` 上增加 `available_quantity / hold_quantity`，或单独建立冻结 / 预留事实表。

## 7. 推荐落地路线

| 阶段 | 目标 | 关键动作 | 不做什么 |
| --- | --- | --- | --- |
| Phase 2D-Review | 只做评审文档。 | 明确采购退货、入库差异、来料质检入口的边界、方案比较、source_type 和后续顺序。 | 不改 schema，不生成 migration，不改运行时代码，不改前端。 |
| Phase 2D-A | 采购退货最小闭环。 | 可能新增 `purchase_returns / purchase_return_items`；退货过账写 `inventory_txns.OUT`；同事务更新 `inventory_balances`；按 `lot_id` 退货；取消退货写 `REVERSAL`；补幂等和追溯测试。 | 不做财务、应付、发票、付款、供应商主数据和完整采购订单。 |
| Phase 2D-B | 入库差异 / 调整。 | 评审并选择最小库存调整单，或在确有采购差异报表需求时新增 `purchase_receipt_adjustments`；已过账差异写 `ADJUST_IN / ADJUST_OUT`。 | 不修改 `POSTED` 入库行，不把单价差异当库存事实，不提前做采购订单余额。 |
| Phase 2D-C | 来料质检入口。 | 先用 `inventory_lots.status` 或评审是否新增 `quality_inspections / quality_inspection_items`；明确 HOLD 批次是否可领用、可退货、可查询为可用。 | 不做完整品质模块，不做复杂抽样、缺陷库、供应商质量报表。 |

## 8. 本轮之后优先建议

| 决策 | 建议 |
| --- | --- |
| 下一轮优先做什么 | 优先做 Phase 2D-A：`purchase_returns / purchase_return_items` 采购退货最小闭环。它直接复用 Phase 2A / 2B / 2C 的库存事实、批次和采购入库来源能力，业务价值明确，复杂度可控。 |
| 是否暂缓 `quality_inspections` | 暂缓。当前先定义 IQC 入口和批次状态边界，等质检项目、判定流程、异常处理和报表需求稳定后再落完整品质表。 |
| 是否暂缓 `purchase_receipt_adjustments` | 暂缓。入库前差异按实收入库；入库后数量错误先在 Phase 2D-B 评审通用库存调整是否足够，必要时再建采购入库差异专表。 |
| 是否暂缓 `stock_reservations / available_quantity` | 暂缓。当前 `inventory_balances.quantity` 先承接账面数量；可用量、冻结量、预留量应等生产领料、出货预留和质检 HOLD 规则一起设计，避免多套可用库存口径。 |
| 是否继续保留 `business_records` | 保留。它仍是通用单据快照和兼容层，不替代采购退货、库存流水、批次和未来调整单真源。 |

推荐下一轮只落采购退货：

- 新增退货单头 / 行专表和最小状态机。
- 退货过账写 `OUT`，取消退货写 `REVERSAL`。
- 退货必须按 `lot_id` 或非批次余额精确扣减，不能混扣。
- 幂等键先固定为 `PURCHASE_RETURN:{return_id}:{item_id}:OUT` 和 `PURCHASE_RETURN:{return_id}:{item_id}:REVERSAL`。
- 不做财务、不做供应商主数据、不做采购订单审批、不接前端。
