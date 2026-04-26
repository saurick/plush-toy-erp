# Phase 2D-C 来料质检入口 / 批次状态 / 冻结库存边界评审

> 结论：本轮只做设计评审，不改 Ent schema，不生成 migration，不改运行时代码，不改前端和帮助中心。下一轮推荐优先做 `inventory_lots.status` 最小状态扩展和库存出库守卫，先防止待检 / 不合格批次被误领用；`quality_inspections`、质检明细、可用 / 冻结 / 预留库存和财务扣款继续暂缓。

## 评审依据

| 范围 | 已确认口径 |
| --- | --- |
| 当前真源 | `docs/current-source-of-truth.md` 明确 Phase 2D-B1 已完成采购入库、采购退货和采购入库调整最小闭环；`inventory_txns` 是库存事实流水真源，`inventory_balances` 是当前余额 / 查询加速表，`inventory_lots` 是批次追溯真源。 |
| RBAC | `server/internal/biz/rbac.go` 已有 `quality.inspection.read/create/update` 和 `quality.exception.handle`，但采购入库、退货、调整当前仍只在后端 usecase/repo 和测试层，尚未接外部 JSON-RPC/API。 |
| 库存底座 | Phase 2A / 2B 文档和代码确认库存影响必须追加 `inventory_txns`，余额同事务更新，批次库存和非批次库存分开聚合、分开扣减。 |
| 采购链路 | Phase 2C / 2D-A / 2D-B1 已让采购入库写 `IN`，采购退货写 `OUT`，采购入库调整写 `ADJUST_IN / ADJUST_OUT`，取消类动作写 `REVERSAL`。 |
| 当前批次状态 | `inventory_lots.status` 当前已有字段，但业务常量只有 `ACTIVE / DISABLED`；当前库存出库、采购退货和采购入库调整只校验批次主体，不校验 `lot.status`。 |
| 当前余额字段 | `inventory_balances` 当前只有账面 `quantity`，没有 `available_quantity / hold_quantity / reserved_quantity`。 |

## 1. Phase 2D-C 边界

Phase 2D-C 本轮只评审来料质检入口、批次状态和冻结库存边界，不落代码。

| 边界 | 本轮口径 |
| --- | --- |
| 只做来料质检入口评审 | 评审采购入库后的 IQC 如何进入 `purchase_receipts / inventory_lots / inventory_balances / purchase_returns` 链路。 |
| 不做完整品质模块 | 不建检验项目库、缺陷库、抽样标准、审批流、质量报表、返工复检和供应商质量统计全套模型。 |
| 不做生产质检 | 不覆盖制程检验、首件检验、巡检、半成品检验或生产返工。 |
| 不做成品质检 | 不覆盖成品抽检、装箱前检验、出货检验或成品返工闭环。 |
| 不做财务扣款 | 不做扣款、索赔、应付红冲、发票、付款或财务核销。 |
| 不做供应商评级 | 不建立供应商主数据、评分、绩效、黑名单或质量月报。 |
| 不做库存字段变更 | 不修改 `inventory_balances`，不新增 `available_quantity / hold_quantity / reserved_quantity`。 |
| 不接前端 | 不改桌面、移动端、菜单、JSON-RPC/API 或权限守卫。 |
| 不改帮助中心 | 不改前端帮助中心和运行时说明。 |

本轮也不新增 `quality_inspections`、`inventory_adjustments`、`stock_reservations`、`warehouse_locations`、供应商主数据、完整采购订单 / 合同 / 审批流、生产、委外、财务，不迁移旧 `business_records`，不删除或替换 `business_records`，不对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`，不做真实分区 migration 和几十亿级压测。

## 2. 毛绒玩具工厂来料质检场景

来料质检通常围绕“是否可以释放给生产或包装使用”展开，很多问题需要按批次隔离，而不是只看材料总库存。

| 场景 | 示例 | 对当前库存链路的影响 |
| --- | --- | --- |
| 面料色差 | 面料颜色与样板、客户确认色或上一批不一致。 | 需要按 `lot_id / color_no / dye_lot_no` 隔离，避免混入生产。 |
| 缸号不一致 | 同色面料不同缸号混到同一生产批。 | `inventory_lots.dye_lot_no` 是关键追溯字段；可接受但需分批使用，或 HOLD 待判。 |
| 克重 / 幅宽不符 | 克重偏轻、幅宽不足，影响单耗或裁片。 | 可退货、让步接收、降级使用；不一定改变账面数量。 |
| 辅料缺陷 | 拉链、吊牌、织唛、魔术贴规格不符或破损。 | 不合格批次应阻止生产领用。 |
| 眼睛 / 鼻子等小配件瑕疵 | 表面划伤、脱漆、尺寸不符、安全测试不合格。 | 通常需要整批 HOLD 或拒收，避免装配后返工。 |
| 填充棉质量问题 | 回弹差、杂质、异味、阻燃或安全指标不达标。 | 不合格批次不能作为可用库存进入生产。 |
| 包装材料破损 | 彩盒压坏、胶袋破损、唛头或贴纸印刷错误。 | 可能影响出货，但不一定影响材料账面数量。 |
| 数量短缺 | 送货单 100，实际清点 98。 | 入库前按实收数量入库；入库后发现则走采购入库调整，不用质检单改库存数量。 |
| 来料污染 / 异味 / 潮湿 | 面料潮湿、辅料沾污、填充棉异味。 | 先 HOLD，后续放行、退货或报废。 |
| 供应商批次异常 | 同供应商同 lot 复发缺陷，或供应商批号与送货资料不一致。 | 需要保留供应商批次线索，后续质量追溯和供应商评级再扩展。 |

## 3. 质检发生在入库前还是入库后

| 方案 | 做法 | 优点 | 缺点 | 当前阶段判断 |
| --- | --- | --- | --- | --- |
| 方案 A：先质检，合格后采购入库 | 到货先进入线下待检区，IQC 合格后才创建 / 过账采购入库。 | 不合格品不进库存；账面库存天然都是可用库存。 | 需要待检暂存区、待检单、待检数量和实物保管规则；当前没有库位、待检库存和质检单。 | 暂不推荐作为 Phase 2D-C1 主路径。它业务上干净，但当前系统底座不够。 |
| 方案 B：先采购入库，批次状态标记 HOLD，质检后释放或退货 | 采购入库仍写账面库存和批次，默认或按需把批次置为 HOLD；质检通过后改 ACTIVE，不合格则 REJECTED 并走退货 / 后续处理。 | 能接当前 `purchase_receipts + inventory_lots + inventory_balances`；实物已进仓时可追溯；适合毛绒工厂批次隔离。 | 当前 `inventory_balances` 只有 `quantity`，没有可用 / 冻结拆分；当前出库逻辑还不检查 `lot.status`。 | 推荐作为后续主路径，但必须先补 `lot.status` 出库守卫，不能只改状态。 |
| 方案 C：采购入库仍写库存，质检只记录结果，不影响可用库存 | 质检作为备注或记录，不拦截库存领用。 | 最小改动；不影响现有采购入库和库存余额。 | 业务风险大，不合格库存可能被生产领用；批次状态和质检结果失去控制力。 | 不推荐。除非只是历史备注，不应作为 IQC 主路径。 |

推荐采用方案 B 的方向，但 Phase 2D-C1 先做“批次状态 + 出库守卫”的最小安全闭环。等状态守卫稳定后，再决定是否落 `quality_inspections` 主表。

## 4. 是否使用 `inventory_lots.status`

`inventory_lots.status` 适合表达“这个批次当前是否可用”，但不足以表达完整质检过程。

| 状态候选 | 是否建议进入近期状态集 | 建议语义 |
| --- | --- | --- |
| `ACTIVE` | 保留 | 已释放，可用于正常出库、生产领料、采购退货和后续业务。 |
| `HOLD` | 建议 Phase 2D-C1 新增 | 待检、复检、异常待判或临时冻结；不得被生产领用或普通出库，但应允许受控采购退货。 |
| `REJECTED` | 建议 Phase 2D-C1 新增 | 质检判定不合格，等待退供应商、报废或让步审批；不得普通领用。 |
| `DISABLED` | 保留 | 批次身份停用或不再作为正常业务入口；不建议用来表达“有库存但质检不合格”。 |
| `RELEASED` | 不建议作为状态 | 放行是动作，结果应回到 `ACTIVE`；如果保留 `RELEASED`，会和 `ACTIVE` 重复。 |
| `QUARANTINED` | 暂缓 | 可理解为隔离，但当前阶段与 `HOLD` 重叠；等需要区分“待检冻结”和“隔离监管”时再拆。 |

关键结论：

- 修改 `lot.status` 可以表达批次可用性，但不能表达检验人、检验时间、抽样、缺陷项、判定依据和处理过程。
- `lot.status` 本身不能阻止出库；必须在库存出库路径或对应 usecase 上加守卫。
- 当前 `validateInventoryLotForTxn` 只校验 `lot.SubjectType / SubjectID` 与库存主体一致，不检查 `lot.Status`。
- 如果只改 `lot.status`，但 `ApplyInventoryTxnAndUpdateBalance`、采购退货、未来生产领料或出货扣减仍可扣减 HOLD 批次，就会出现“不合格库存已被账面领用”的风险。
- 下一轮若使用 `HOLD / REJECTED`，必须同步定义哪些 `source_type / txn_type` 可以扣这些批次。推荐普通 `OUT / ADJUST_OUT / TRANSFER_OUT` 只允许 `ACTIVE`；采购退货 `PURCHASE_RETURN` 可允许从 `ACTIVE / HOLD / REJECTED` 扣减；`REVERSAL` 应继承原流水语义，避免取消链路被状态卡死。

## 5. 是否需要 `quality_inspections / quality_inspection_items`

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A：只使用 `inventory_lots.status` | 通过 `ACTIVE / HOLD / REJECTED / DISABLED` 控制批次可用性，不建质检单。 | 简单；能快速阻断待检批次误出库；不引入品质模块。 | 没有质检记录、判定过程、检验人、样本、缺陷项和审批痕迹。 | 可作为 Phase 2D-C1 的第一步，但必须配合出库守卫。 |
| 方案 B：新增 `quality_inspections / quality_inspection_items` | 建质检单头和明细，记录抽样、缺陷、判定、处理方式，并联动批次状态。 | 记录完整，可追溯，可支撑供应商质量统计。 | 进入品质模块，牵动检验标准、缺陷分类、审批、前端和报表，复杂度明显上升。 | 暂不作为下一轮首要目标。 |
| 方案 C：Phase 2D-C1 先做 `quality_inspections` 最小主表 + `lot.status` 联动，不做完整 defect 明细 | 只记录质检单号、来源入库单 / 批次、结果、检验人和时间，先不做明细。 | 比只改状态更可追溯，复杂度低于完整品质模块。 | 仍要新增 schema、状态机和后续 API；没有明细时质检过程仍不完整。 | 可作为 Phase 2D-C2 候选，不建议抢在出库守卫前。 |
| 方案 D：本轮只评审，下一轮优先做 `lot.status` 出库守卫，再评审 `quality_inspections` | 先让现有批次状态真正影响库存可用性，再决定质检表粒度。 | 先防止 HOLD 批次被误出库；边界清晰；不把品质模块提前做大。 | 仍无完整质检记录；状态变更需要先用受控 usecase 或事件记录补审计。 | 推荐。当前最大风险不是“没有质检报表”，而是“状态即使存在也拦不住出库”。 |

推荐方案 D。下一轮先做批次状态和出库守卫，验证 HOLD / REJECTED 的库存控制口径；随后再做 `quality_inspections` 最小主表评审。

## 6. 质检和库存流水的关系

库存流水只记录数量事实。质检状态变化不能伪造成数量变化。

| 动作 | 是否写 `inventory_txns` | 推荐说明 |
| --- | --- | --- |
| 质检 HOLD | 不写 | 冻结 / 待判只改变可用性，不改变账面数量。应改 `lot.status = HOLD`，并通过后续事件或质检记录审计。 |
| 质检 RELEASE | 不写 | 放行只把批次从 `HOLD / REJECTED` 的可控状态转为 `ACTIVE`，不改变数量。 |
| 质检 REJECT | 不写 | 判定不合格不等于库存减少；仍需决定退供应商、报废、让步接收或继续隔离。 |
| 只改变 `lot.status` | 不写 | 状态变化不是库存事实流水；应由批次状态变更事件或质检单记录。 |
| 转入不合格库存 | 视建模而定 | 如果未来引入不合格仓、库位或冻结事实，可能需要 `TRANSFER_OUT / TRANSFER_IN` 或独立 hold ledger；不应直接用 `ADJUST_OUT / ADJUST_IN` 混表达质量分类。 |
| 退货供应商 | 写，由 `purchase_returns` 写 | 不合格后退供应商应走 `purchase_returns`，过账写 `OUT`，取消退货写 `REVERSAL`。 |
| 让步接收 | 通常不写 | 让步接收是质检判定和放行动作，结果通常是 `lot.status = ACTIVE`，必要时记录让步原因和审批。 |

明确规则：

- 库存数量变化才写 `inventory_txns`。
- 状态变化不一定写 `inventory_txns`。
- 状态变化必须有 audit/event 或 inspection 记录，否则无法解释批次为什么从 HOLD 变 ACTIVE 或 REJECTED。
- 如果不合格库存仍在同一仓库同一批次内，只改状态即可；如果实物移动到另一个仓库或未来不合格库区，必须另行评审转移单据和 source_type。

## 7. 可用库存 / 冻结库存 / 预留库存

当前 `inventory_balances.quantity` 是账面数量，不是可用量。

| 方案 | 做法 | 优点 | 缺点 | 当前阶段判断 |
| --- | --- | --- | --- | --- |
| 方案 A：现在不加字段，仅用 `lot.status` 控制出库 | 余额仍只有 `quantity`；HOLD / REJECTED 批次通过出库守卫阻止普通扣减。 | 改动小；风险集中；能先解决整批待检 / 不合格误领用。 | 无法在同一批次内部分冻结；库存查询无法直接展示 available/hold 拆分。 | 推荐 Phase 2D-C1 采用。适合当前还没有生产领料和出货预留的阶段。 |
| 方案 B：给 `inventory_balances` 增加 `available_quantity / hold_quantity` | 余额表同时维护账面、可用和冻结数量。 | 业务表达更完整，查询更直接。 | 会影响所有库存写入路径、冲正、并发、幂等和历史校验，风险大。 | 暂缓。等生产领料、出货和质检冻结一起稳定后再做。 |
| 方案 C：新增 `stock_holds / stock_reservations` | 用独立冻结 / 预留事实表记录占用、释放和来源。 | 冻结 / 预留可追溯，支持部分冻结和多来源占用。 | 进入库存占用模块，会牵动生产领料、出货锁库、取消释放和并发。 | 暂缓。Phase 2E 或库存占用专题再评审。 |

推荐先用方案 A：`lot.status` 控制整批可用性，不新增余额字段和冻结 / 预留表。其限制必须写清楚：同批次部分不合格无法精准冻结，只能通过拆批或后续 hold facts 解决。

## 8. 来料质检与采购退货的关系

质检拒收和采购退货不是同一件事：

- 质检是判定：合格、待判、不合格、让步接收。
- 采购退货是库存和供应商业务动作：已入库物料退回供应商，库存减少。

| 问题 | 推荐口径 |
| --- | --- |
| 质检不合格后退给供应商 | 应走 `purchase_returns`，继续由采购退货写 `inventory_txns.OUT` 并扣减余额。 |
| `purchase_returns` 是否应引用 `inspection_id` | 长期看可以引用，便于从退货追溯到质检判定。 |
| 本轮是否需要这个字段 | 不需要。本轮不新增 `quality_inspections`，因此也不应提前给采购退货加 `inspection_id`。 |
| 不加字段如何追溯 | Phase 2D-C1 之前只能通过 `purchase_returns.note / purchase_return_items.note`、`source_line_no` 或关联通用 `business_records` 说明质检来源；这只是过渡，不替代后续质检单真源。 |
| 后续如何处理 | 如果 Phase 2D-C2 落 `quality_inspections`，再评审 `purchase_returns.inspection_id` 或独立关联表，避免现在建空引用。 |

采购退货可从 HOLD / REJECTED 批次扣减，但这必须是明确的业务例外：禁止普通领用，不禁止把不合格物退回供应商。

## 9. 来料质检与采购入库调整的关系

| 场景 | 推荐归属 |
| --- | --- |
| 入库前发现实收数量短缺 | 入库差异。`DRAFT` 入库单按实收数量保存，不写质检库存流水。 |
| 入库后才发现原入库数量多记 | 采购入库调整。走 `purchase_receipt_adjustments` 的 `QUANTITY_DECREASE`，校验余额和累计退货上限。 |
| 入库后发现原入库数量少记 | 采购入库调整。走 `QUANTITY_INCREASE`，增加账面库存和可退额度。 |
| 数量短缺同时伴随质检异常 | 质检可记录发现，但库存数量纠正仍由采购入库调整或 DRAFT 入库数量处理。 |
| 质量不合格但数量无误 | 不应使用 adjustment 改数量；应 HOLD / REJECT 批次，后续放行、让步接收或采购退货。 |
| 部分不合格 | 当前只用 `lot.status` 会冻结整批；若要部分冻结，需要拆批或 `stock_holds`，本轮暂缓。 |

关键结论：

- 数量事实错误走采购入库调整。
- 质量判定走批次状态 / 质检记录。
- 不合格但数量无误时，不能用 `ADJUST_OUT` 把库存改少来掩盖 HOLD / REJECT 的可用性问题。
- 部分不合格是下一阶段复杂点：可选路径是入库时拆成不同 lot，或后续通过受控拆批 / stock hold 表达；当前 Phase 2D-C1 不处理部分冻结。

## 10. `source_type / idempotency` 设计建议

如果后续落 `quality_inspections`，需要先区分“状态动作”和“数量动作”。

| 候选 `source_type` | 是否建议用于 `inventory_txns` | 说明 |
| --- | --- | --- |
| `QUALITY_INSPECTION` | 仅当质检动作真实改变库存数量时再用 | 例如未来质检驱动报废、转仓或拆批，才可能作为库存流水来源。Phase 2D-C1 不建议写库存流水。 |
| `QUALITY_HOLD` | 不建议用于库存流水 | HOLD 不改变 `quantity`。应作为批次状态事件或质检状态，不是库存流水来源。 |
| `QUALITY_RELEASE` | 不建议用于库存流水 | RELEASE 不改变 `quantity`，结果是批次变 `ACTIVE`。 |
| `QUALITY_REJECT` | 不建议用于库存流水 | REJECT 是判定，不等于出库；退供应商仍走 `PURCHASE_RETURN`，报废后续走通用库存调整或报废单评审。 |

动作规则：

- `lot.status` 从 `ACTIVE` 或默认状态变 `HOLD`：不写 `inventory_txns`，记录状态变更事件或质检单。
- `HOLD -> ACTIVE`：不写 `inventory_txns`，记录 RELEASE 事件或质检结论。
- `HOLD -> REJECTED`：不写 `inventory_txns`，记录 REJECT 事件或质检结论。
- `REJECTED` 后退供应商：由 `purchase_returns` 写 `OUT`，幂等键仍是 `PURCHASE_RETURN:{return_id}:{item_id}:OUT`。
- 未来如果质检导致报废或库存维度迁移，必须有新的业务单据 source，不能裸写 `QUALITY_REJECT` 的库存流水。

如果后续为质检状态事件设计幂等键，建议不要占用 `inventory_txns.idempotency_key`，而是在质检事件或 audit 表中使用：

```text
QUALITY_INSPECTION:{inspection_id}:LOT:{lot_id}:HOLD
QUALITY_INSPECTION:{inspection_id}:LOT:{lot_id}:RELEASE
QUALITY_INSPECTION:{inspection_id}:LOT:{lot_id}:REJECT
```

如果未来某个质检动作确实要写库存流水，再按来源行设计：

```text
QUALITY_INSPECTION:{inspection_id}:{inspection_item_id}:{txn_type}
```

但这不属于 Phase 2D-C1。

## 11. RBAC 权限码建议

当前 `rbac.go` 已有：

- `quality.inspection.read`
- `quality.inspection.create`
- `quality.inspection.update`
- `quality.exception.handle`

如果后续接入外部 JSON-RPC/API 或菜单入口，建议把“编辑质检单”和“影响批次可用性”的动作分开。

| 权限码 | 建议用途 | 本轮结论 |
| --- | --- | --- |
| `quality.inspection.read` | 查看质检单、批次质检状态和来源追溯。 | 已有，后续可复用。 |
| `quality.inspection.create` | 创建来料质检记录或发起待检。 | 已有，后续可复用。 |
| `quality.inspection.submit` | 提交质检结果，进入待审核或待处理。 | 后续可新增。 |
| `quality.inspection.approve` | 审核让步接收、放行或拒收结论。 | 后续可新增，避免普通编辑权限直接放行库存。 |
| `quality.inspection.release` | 将 HOLD 批次放行为 ACTIVE。 | 后续可新增，属于影响库存可用性的高风险动作。 |
| `quality.inspection.reject` | 将批次判为 REJECTED。 | 后续可新增，属于影响库存可用性的高风险动作。 |
| `quality.inspection.update` | 编辑 DRAFT 或未提交质检记录。 | 已有，但不建议单独授权其执行 release/reject。 |

本轮不改 `server/internal/biz/rbac.go`。Phase 2D-C1 如果只做后端 usecase/repo 且不接 API，可以先不新增权限码；一旦接外部 API，必须同轮补 RBAC 权限码、内置角色矩阵和接口守卫。

## 12. 推荐落地路线

| 阶段 | 推荐范围 | 明确不做 |
| --- | --- | --- |
| Phase 2D-C Review | 本轮只做本评审文档，明确来料质检入口、批次状态、库存流水、可用 / 冻结边界和后续路线。 | 不改 schema，不生成 migration，不改 runtime，不改前端，不改帮助中心，不 apply 数据库。 |
| Phase 2D-C1 | 优先做 `lot.status` 最小状态扩展和出库守卫：新增业务常量 `HOLD / REJECTED`，定义 `ACTIVE / HOLD / REJECTED / DISABLED` 行为；库存扣减路径按 `source_type / txn_type` 校验批次状态；补普通 Go 和 PostgreSQL 测试。 | 不新增 `quality_inspections`，不新增 `quality_inspection_items`，不改 `inventory_balances` 字段，不做 `stock_holds / stock_reservations`，不接前端。 |
| Phase 2D-C2 | 再评审是否新增 `quality_inspections` 最小主表，记录来源采购入库、批次、检验结果、检验人、检验时间、处理建议和状态变更；先不做完整缺陷明细。 | 暂不做完整 `quality_inspection_items`、抽样标准、缺陷库、供应商评级和财务扣款。 |
| Phase 2D-C3 | 若业务确认需要部分冻结、部分放行或同批拆分，再评审 `quality_inspection_items`、拆批模型、`stock_holds` 或 `available_quantity / hold_quantity`。 | 不在 C1 直接扩全量库存占用模块。 |
| Phase 2E | 再评审生产领料、通用库存调整、盘点、报损 / 报溢和出货预留。 | 不把来料质检入口扩成完整生产 / 仓储 / 财务闭环。 |

Phase 2D-C1 的出库守卫建议至少覆盖：

- 有 `lot_id` 的普通 `OUT / ADJUST_OUT / TRANSFER_OUT` 默认要求 `lot.status = ACTIVE`。
- `PURCHASE_RETURN` 可以从 `ACTIVE / HOLD / REJECTED` 扣减，用于不合格退供应商。
- `REVERSAL` 不应因当前 lot 状态改变而失败，应继承原流水语义，保证取消链路可恢复。
- 无 `lot_id` 的非批次库存暂时无法用 lot.status 控制；如来料质检要求必须管控，应要求采购入库生成批次或后续设计非批次冻结事实。

## 13. 最终推荐

| 决策 | 推荐 |
| --- | --- |
| 下一轮是否优先做 `lot.status` 出库守卫 | 是。Phase 2D-C1 先让 `HOLD / REJECTED` 能真正阻止普通领用和普通出库，这是当前最大风险点。 |
| 是否新增 `quality_inspections` | 下一轮不优先新增。建议 C1 先做批次状态守卫，C2 再评审最小主表。 |
| 是否暂缓 `quality_inspection_items` | 暂缓。缺陷明细、抽样和检验项目库属于完整品质模块。 |
| 是否暂缓 `available_quantity / hold_quantity / reserved_quantity` | 暂缓。当前余额仍只维护账面 `quantity`，避免影响所有库存写入路径。 |
| 是否暂缓 `stock_reservations` | 暂缓。冻结 / 预留事实等生产领料、出货预留和部分冻结需求稳定后再统一设计。 |
| 是否通过 `purchase_returns` 处理不合格退货 | 是。质检判定不合格后若退供应商，应走采购退货，过账写 `OUT`，取消写 `REVERSAL`。 |
| 是否暂缓财务扣款 / 供应商评级 | 暂缓。扣款、索赔、评级和供应商质量报表都不属于 Phase 2D-C1。 |

本轮最终建议：Phase 2D-C1 只做批次状态和出库守卫的最小闭环，不做质检专表；等状态守卫跑通后，再评审 `quality_inspections` 最小主表和后续品质模块边界。
