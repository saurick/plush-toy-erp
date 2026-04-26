# Phase 2D-B 采购入库差异 / 收货差异 / 入库后更正评审

> 结论：本轮只做设计评审，不改 Ent schema，不生成 migration，不改运行时代码，不改前端和帮助中心。下一轮推荐优先落 `purchase_receipt_adjustments / purchase_receipt_adjustment_items`，先只承接已过账采购入库后的数量类差异和 lot / warehouse 维度更正；通用库存调整、来料质检、可用 / 冻结 / 预留库存、应付和发票付款继续暂缓。

## 评审依据

| 范围 | 已确认口径 |
| --- | --- |
| 当前真源 | `README.md`、`docs/current-source-of-truth.md` 明确 `inventory_txns` 是库存事实流水真源，`inventory_balances` 是当前余额 / 查询加速表，`inventory_lots` 是批次追溯真源；`business_records` 仍是通用单据快照和兼容层。 |
| RBAC | `docs/roles/role-permission-matrix-v1.md` 和 `server/internal/biz/rbac.go` 明确权限真源为标准 RBAC，旧 `admin_users.level / menu_permissions / mobile_role_permissions` 不再作为权限来源。 |
| Phase 2A | `docs/changes/phase-2a-inventory-fact-schema.md` 和 `server/internal/data/inventory_repo.go` 明确库存影响必须追加 `inventory_txns`，余额在同事务内更新，默认禁止负库存。 |
| Phase 2B | `docs/changes/phase-2b-bom-lot-schema.md` 和 `inventory_lots / inventory_balances` schema 明确批次库存和非批次库存分开聚合、分开扣减，不能互相抵扣。 |
| Phase 2C | `docs/changes/phase-2c-purchase-receipt-schema.md`、`purchase_receipt.go` 和 `purchase_receipt_repo.go` 明确 `purchase_receipts / purchase_receipt_items` 是采购入库专表真源；过账写 `IN`，取消已过账入库写 `REVERSAL`；`POSTED / CANCELLED` 后关键字段不可改。 |
| Phase 2D-A | `docs/changes/phase-2d-purchase-return-schema.md`、`phase-2d-purchase-return-quality-review.md`、`purchase_return.go` 和 `purchase_return_repo.go` 明确采购退货是独立单据，过账写 `OUT`，取消写 `REVERSAL`，并校验累计有效退货不能超过原入库行数量。 |
| 回归测试 | `inventory_repo_test.go` 和 `inventory_postgres_test.go` 已覆盖入库 / 退货状态机、幂等、批次隔离、余额不足回滚、追溯保护、退货累计上限和并发扣减。 |

## 1. Phase 2D-B 边界

Phase 2D-B 本轮只评审入库差异、收货差异和入库后更正如何建模，不落代码。

| 本轮事项 | 口径 |
| --- | --- |
| 做什么 | 评审已过账采购入库发生数量、批次、仓库、物料、单位、金额和质检差异时，是否应该新增采购入库调整单、如何写库存流水、如何与采购退货和现有余额约束衔接。 |
| 不做完整采购订单 | 当前没有 `purchase_orders` 主路径，不提前设计采购订单余额、关闭、审批、合同或采购计划。 |
| 不做供应商主数据 | 继续沿用 Phase 2C / 2D-A 的 `supplier_name` 快照口径，不新增 `suppliers`。 |
| 不做应付、发票、付款、财务核销 | `unit_price / amount` 仍只作为采购业务快照或后续财务线索，本轮不建立 AP 真源。 |
| 不做完整品质模块 | 不新增质检项目、抽样、缺陷、判定、让步接收、供应商质量报表或 `quality_inspections` schema。 |
| 不做生产领料 | 不把入库差异扩展到生产领料、WIP、成本或 BOM 倒扣。 |
| 不做委外 | 不新增委外发料、回货、结算或委外品质闭环。 |
| 不接前端 | 不改桌面、移动端页面，不接 JSON-RPC/API，不改菜单。 |
| 不改帮助中心 | 不同步前端帮助中心和运行时文档。 |

本轮也不新增 `warehouse_locations`、`stock_reservations`、`product_styles`，不迁移旧 `business_records`，不删除或替换 `business_records`，不对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`，不做真实分区 migration 和几十亿级压测。

## 2. 入库差异的业务类型

入库差异必须先按发生时点和影响对象分类。不能把所有问题都塞进采购退货，也不能直接修改已 `POSTED` 的入库行。

| 场景 | 类型 | 推荐处理 |
| --- | --- | --- |
| 入库前发现实收数量和送货数量不同 | 入库前差异 | `DRAFT` 入库单按实收数量保存。未收数量不是库存事实，不写 `inventory_txns`；送货单差异可先放备注或通用快照，等采购订单进入范围后再沉淀订单余额。 |
| `POSTED` 前修改 `DRAFT` 入库单数量 | 入库前差异 | 允许在 `DRAFT` 阶段修改数量或重新录入行；`DRAFT` 不影响库存。当前代码尚未提供入库行编辑入口，后续如新增只能限制在 `DRAFT`。 |
| `POSTED` 后发现数量多收 | 入库后库存差异 | 如果原来少记了库存，走采购入库调整，写 `ADJUST_IN` 增加余额；如果多出来的货不接收且退回供应商，按业务实质走采购退货或不入账。 |
| `POSTED` 后发现数量少收 | 入库后库存差异 | 如果原来多记了库存，走采购入库调整，写 `ADJUST_OUT` 扣减余额；不是退回供应商，不应伪造成采购退货。 |
| `POSTED` 后发现批次 `lot_no` 填错 | 入库后批次错误 | 对错误批次写 `ADJUST_OUT`，对正确批次写 `ADJUST_IN`，同一调整单内形成一出一入；错误批次余额不足时拒绝过账。 |
| `POSTED` 后发现 `warehouse_id` 填错 | 入库后仓库错误 | 从错误仓库扣减，再加到正确仓库；不使用仓库间转移语义，因为这是纠正原入库记录，不是实物调拨。 |
| `POSTED` 后发现 `unit_id` 填错 | 入库后单位错误 | 不能直接改原行。后续应按错误单位扣减、按正确单位入账；若需要换算，必须有明确换算口径。本轮不引入单位换算表。 |
| `POSTED` 后发现 `material_id` 填错 | 入库后物料错误 | 从错误物料扣减，再加到正确物料；正确批次必须属于正确物料。若错误物料库存已被消耗导致余额不足，不能强行负库存。 |
| `POSTED` 后发现单价 `unit_price` 或 `amount` 错误 | 入库后金额差异 | 不影响库存数量，不写 `inventory_txns`。后续在采购金额调整或应付 / 财务评审里处理。 |
| 已退货后又发现原入库数量错误 | 入库后库存差异 + 退货额度 | 调整后的有效入库数量必须仍大于等于累计有效退货数量；减少原入库数量时若会导致已退数量超额，应拒绝调整。增加原入库数量时，可同步增加可退额度。 |
| 质检发现不合格，但库存已经入账 | 质检差异 | 如果不合格品退回供应商，走采购退货；如果只是冻结 / 待判，不应写库存数量流水。当前没有可用 / 冻结库存维度，本轮不做完整质检。 |

分类结论：

- 入库前差异：只影响 `DRAFT` 入库单内容，不写库存流水。
- 入库后库存差异：通过受控调整单写 `ADJUST_IN / ADJUST_OUT`。
- 入库后金额差异：不写库存流水，后续财务 / 应付单独评审。
- 入库后批次 / 仓库 / 物料 / 单位错误：通过一出一入表达，不直接改原入库行。
- 质检差异：冻结和放行不改变账面数量，暂缓到 Phase 2D-C。

## 3. 入库差异和现有能力的关系

### `CancelPostedPurchaseReceipt`

| 适合 | 不适合 |
| --- | --- |
| 整单取消、整单冲正，表示原采购入库单不成立。 | 部分数量差异、补收入库、批次填错、仓库填错、金额更正、已退货后重新计算有效入库数量。 |

`CancelPostedPurchaseReceipt` 当前按原入库行逐条找到 `PURCHASE_RECEIPT` 的 `IN` 流水并写 `REVERSAL`。它的语义是抵消原入库事实，不适合承接已入库后的部分差异调整。

### `PurchaseReturn`

| 适合 | 不适合 |
| --- | --- |
| 已入库后真实退回供应商，过账写 `OUT`，取消退货写 `REVERSAL`。 | 盘点更正、少收入库补差、原入库数量录错、批次填错、仓库填错、物料填错、纯金额更正。 |

采购退货是供应商方向的业务动作，不是库存账纠错工具。少收扣账如果用退货表达，会错误暗示货物曾经退回供应商。

### Inventory adjustment

| 适合 | 当前缺口 |
| --- | --- |
| 库存数量更正、盘点差异、报损 / 报溢、跨业务来源的账实纠错。 | 当前还没有独立 `inventory_adjustments / inventory_adjustment_items` 单据真源。直接裸写 `inventory_txns.ADJUST_IN / ADJUST_OUT` 会缺少稳定 `source_type/source_id/source_line_id`。 |

现有 `inventory_txns` 已支持 `ADJUST_IN / ADJUST_OUT`，但库存流水不能自己充当业务单据。只要用调整类流水，就必须先有来源单据真源。

### Quality hold / reject

| 适合 | 当前缺口 |
| --- | --- |
| 来料待检冻结、不合格隔离、放行、让步接收或退货判定。 | 当前 `inventory_balances` 只有 `quantity`，没有 `available_quantity / hold_quantity / reserved_quantity`；`inventory_lots.status` 也还没有 HOLD / REJECTED 主路径校验。 |

冻结、放行和质检判定本身不改变账面数量，不应在 Phase 2D-B 里通过伪造 `IN / OUT` 流水解决。完整质检模块应后续单独评审。

## 4. 建模方案比较

| 方案 | 做法 | 优点 | 缺点 | 对毛绒玩具工厂的判断 |
| --- | --- | --- | --- | --- |
| 方案 A：继续复用 `CancelPostedPurchaseReceipt + PurchaseReturn` | 整单错误用取消入库，少收 / 多收 / 不合格尽量用退货或重新入库表达。 | 少建表，短期实现最少。 | 语义混乱；无法表达部分差异、补收入库、批次更正、仓库更正、物料更正、金额更正；会污染退货统计和供应商质量 / 对账口径。 | 不推荐。毛绒工厂常见面料批次、缸号、仓库、辅料数量差异，强行复用会让库存追溯和采购退货都失真。 |
| 方案 B：新增 `purchase_receipt_adjustments / purchase_receipt_adjustment_items` | 采购入库差异作为独立采购调整单，调整行关联原入库单 / 行，过账后写 `ADJUST_IN / ADJUST_OUT`。 | 语义清晰；支持入库后差异调整；能追溯原入库单 / 行；便于约束已退数量、批次和仓库；后续可扩展金额差异。 | 新增一组表和状态机；需要补幂等、取消、退货额度、库存余额和追溯保护测试。 | 推荐作为下一轮目标。采购入库差异和通用盘点调整不同，先用采购专表承接更符合当前 Phase 2C / 2D-A 主路径。 |
| 方案 C：新增通用 `inventory_adjustments / inventory_adjustment_items` | 所有库存更正都走通用库存调整单，采购入库差异通过可选原入库行引用表达。 | 以后盘点、报损、报溢都能复用；库存语义统一。 | 采购语义弱；和原入库单 / 行关系不够清晰；已退数量约束、供应商入库差异报表和采购责任归因会变成可选逻辑，容易漏。 | 暂缓。通用库存调整有价值，但不应抢在采购入库差异前把采购语义稀释掉。 |
| 方案 D：Phase 2D-B 只做评审，下一轮优先落 `purchase_receipt_adjustments`，`inventory_adjustments` 后续单独评审 | 本轮不落代码；下一轮先做采购入库调整最小闭环，后续再评审通用库存调整。 | 边界清晰；不把采购差异和通用库存调整混在一起；能先解决 Phase 2C 入库和 Phase 2D-A 退货之间的真实缺口。 | 后续仍需要再做库存调整模块，盘点 / 报损 / 报溢不能在 B1 一次解决。 | 推荐。当前毛绒工厂最直接的问题是采购入库后的数量、批次和仓库纠错，不是全仓盘点体系。 |

推荐采用方案 D 的路线，并以方案 B 作为下一轮实现目标。

## 5. 推荐的 source_type 设计

### 候选 `source_type`

| `source_type` | 是否建议新增 | 用途 | 本轮结论 |
| --- | --- | --- | --- |
| `PURCHASE_RECEIPT_ADJUSTMENT` | 建议下一轮新增 | 采购入库差异调整。库存增加写 `ADJUST_IN`，库存减少写 `ADJUST_OUT`，取消调整写 `REVERSAL`。 | 推荐 Phase 2D-B1 使用。 |
| `INVENTORY_ADJUSTMENT` | 暂缓 | 通用盘点、报损、报溢、非采购来源库存纠错。 | 后续 Phase 2E 或独立库存调整评审再决定。 |
| `QUALITY_HOLD` | 暂不作为库存数量流水来源 | 冻结不改变账面数量。 | 暂缓。若后续有冻结事实，应设计可用 / 冻结维度或质检状态，不伪造成数量流水。 |
| `QUALITY_RELEASE` | 暂不作为库存数量流水来源 | 放行不改变账面数量。 | 暂缓。 |
| `QUALITY_REJECT` | 不作为 Phase 2D-B 主路径 | 判定不合格本身不改变数量；若退供应商，库存来源仍是 `PURCHASE_RETURN`；若报损，后续可由通用库存调整或报废单表达。 | 暂缓。 |

### 库存流水类型

| 场景 | 推荐 `txn_type` | 原因 |
| --- | --- | --- |
| 入库差异导致库存增加 | `ADJUST_IN`，`direction = 1` | 原入库已成立，补差是更正，不是新的采购入库主事实，不应写 `IN`。 |
| 入库差异导致库存减少 | `ADJUST_OUT`，`direction = -1` | 少收扣账是更正，不是退给供应商，不应写 `OUT`。 |
| 批次 / 仓库 / 物料 / 单位更正 | 一条 `ADJUST_OUT` 从错误维度扣减，再一条 `ADJUST_IN` 加到正确维度 | 维度错误必须用一出一入保留审计轨迹；不能直接改原入库行、批次或余额。 |
| 只更正金额、不影响库存 | 不写 `inventory_txns` | 库存流水是真实数量事实，不能用来记录价格差异。 |
| 取消已过账调整 | 对调整产生的每条 `ADJUST_IN / ADJUST_OUT` 写 `REVERSAL` | 取消是撤销本次调整影响，不直接删除调整流水。 |

### `source_id / source_line_id`

如果下一轮落 `purchase_receipt_adjustments`：

- `source_type = PURCHASE_RECEIPT_ADJUSTMENT`。
- `source_id = purchase_receipt_adjustments.id`。
- `source_line_id = purchase_receipt_adjustment_items.id`。
- 每条会影响库存的调整行最多对应一条库存流水，保持追溯和幂等简单。
- 批次 / 仓库更正这类一出一入，推荐建成两个调整行，并用同一调整单头或后续 `correction_group` 关联；不要让一条来源行同时产生多个无法区分的库存影响。

### `idempotency_key`

推荐下一轮使用稳定、可读、可重放的 key：

```text
PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:ADJUST_IN
PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:ADJUST_OUT
PURCHASE_RECEIPT_ADJUSTMENT:{adjustment_id}:{item_id}:REVERSAL
```

如果后续允许一条调整行产生多条库存流水，必须在 key 中增加稳定 leg 标识，例如 `FROM` / `TO`，否则重复提交和取消会产生歧义。Phase 2D-B1 推荐先避免这种复杂度。

## 6. 推荐的状态机

如果下一轮落 `purchase_receipt_adjustments`，推荐沿用 Phase 2C / 2D-A 的最小状态机。

| 状态 | 是否可修改 | 库存影响 | 说明 |
| --- | --- | --- | --- |
| `DRAFT` | 可以修改单头备注、原因和调整行；可以新增、修改、删除调整行。 | 不写库存流水。 | 草稿只代表待确认差异。过账前应完成原入库单 / 行、物料、仓库、单位、批次和数量校验。 |
| `POSTED` | 禁止普通修改和删除。 | 写 `ADJUST_IN / ADJUST_OUT` 并同事务更新 `inventory_balances`。 | 重复 post 必须幂等返回，不重复写库存影响。 |
| `CANCELLED` | 禁止普通修改和再次过账。 | 如果由 `POSTED` 取消而来，必须对原调整流水写 `REVERSAL`。 | 取消后释放本次差异影响：余额恢复，原入库行有效数量和可退额度按取消后的口径重新计算。 |

状态机规则：

- `DRAFT -> POSTED`：写库存流水和余额。
- `POSTED -> CANCELLED`：写 `REVERSAL`，不删除原调整流水。
- `POSTED` 后禁止修改影响库存事实和追溯链的字段。
- `CANCELLED` 后不再占用有效差异数量。
- 重复 post 已 `POSTED` 调整单应返回当前单据，不重复写流水。
- 重复 cancel 已 `CANCELLED` 调整单应返回当前单据，不重复写 `REVERSAL`。
- 是否允许 `DRAFT -> CANCELLED` 可下一轮再定；若允许，不应写库存流水。Phase 2D-B1 可先只实现已过账取消。

## 7. 与 `purchase_receipts / purchase_receipt_items` 的关系

| 问题 | 推荐口径 |
| --- | --- |
| adjustment 是否必须关联原 `purchase_receipt_id` | 是。采购入库差异的业务语义是纠正某张已过账采购入库单；无原入库单的库存更正应留给通用 `inventory_adjustments`。 |
| adjustment item 是否必须关联原 `purchase_receipt_item_id` | Phase 2D-B1 推荐必须关联。只有关联原入库行，才能计算有效入库数量、已退数量上限和差异追溯。 |
| 无原入库单差异是否允许 | 不建议在 `purchase_receipt_adjustments` 中允许。历史补录或盘点差异后续走通用库存调整评审。 |
| 关联原入库行时是否校验物料 / 仓库 / 单位 / 批次 | 必须校验。数量增减类调整默认应与原入库行 `material_id / warehouse_id / unit_id / lot_id` 一致；批次 / 仓库更正则需要明确 from 行匹配原错误维度、to 行匹配新维度，且两边数量相等。 |
| 原入库单已 `CANCELLED` 是否允许 adjustment | 不允许。原入库事实已经被整单冲正，不应再在其上追加差异调整。 |
| 原入库行已被退货是否允许 adjustment | 可以有条件允许。减少有效入库数量时，调整后有效入库数量必须大于等于累计有效退货数量；增加有效入库数量时，可增加可退额度；维度更正如果会让已有退货来源维度失真，B1 应保守拒绝或只允许更正未退部分。 |

下一轮需要显式定义“有效入库数量”：

```text
effective_receipt_quantity =
  original_purchase_receipt_item.quantity
  + posted_adjustment_in_quantity
  - posted_adjustment_out_quantity
```

`CANCELLED` 调整不计入有效入库数量。批次 / 仓库更正的一出一入不改变总有效数量，但会改变有效库存所在维度。

## 8. 与 `purchase_returns` 的关系

入库差异不是采购退货：

- 采购退货表示货物已经或将要退回供应商。
- 入库差异表示纠正入库记录、库存账或入库快照。
- 少收更正不是供应商退货；批次填错也不是供应商退货。

与退货累计上限的关系：

| 场景 | 推荐约束 |
| --- | --- |
| adjustment 减少原入库数量 | 必须校验累计有效退货数量不能超过调整后的有效入库数量。若已退 80，原入库 100，调整后有效入库要改为 70，应拒绝。 |
| adjustment 增加原入库数量 | 增加后的有效入库数量可以增加可退额度，但仍要满足当前库存余额和批次 / 仓库隔离。 |
| adjustment 被取消 | 取消后从有效入库数量中移除该差异影响，并重新按剩余有效调整计算可退额度。 |
| 已有退货后做批次 / 仓库更正 | 必须避免让已有退货行指向的原入库维度失真。Phase 2D-B1 建议保守处理：若原入库行已有有效退货，优先只允许数量增加或不影响已退维度的扣减；复杂维度迁移后续单独加规则和测试。 |

Phase 2D-B1 如果落地，`PostPurchaseReturn` 的累计退货校验不能继续只看 `purchase_receipt_items.quantity`，应改为读取原入库行的有效入库数量。库存余额校验仍然独立存在，两者都必须满足。

## 9. 库存余额影响

| 场景 | 余额影响 |
| --- | --- |
| 多收补收入库 | 对指定 `subject_type + material_id + warehouse_id + unit_id + lot_id` 写 `ADJUST_IN`，增加 `inventory_balances.quantity`。 |
| 少收扣减库存 | 对同一库存维度写 `ADJUST_OUT`，减少 `inventory_balances.quantity`。 |
| 批次填错 | 错误 `lot_id` 写 `ADJUST_OUT`，正确 `lot_id` 写 `ADJUST_IN`；两个批次不能互相抵扣，错误批次余额不足则拒绝。 |
| 仓库填错 | 错误 `warehouse_id` 写 `ADJUST_OUT`，正确 `warehouse_id` 写 `ADJUST_IN`；不把它表达成普通调拨。 |
| 物料填错 | 错误 `material_id` 写 `ADJUST_OUT`，正确 `material_id` 写 `ADJUST_IN`；批次主体必须和物料一致。 |
| 单位填错 | 错误 `unit_id` 写 `ADJUST_OUT`，正确 `unit_id` 写 `ADJUST_IN`；如果需要换算，必须先有明确换算规则，本轮不引入。 |
| 单价 / 金额错 | 不写 `inventory_txns`，只在后续采购金额差异或财务模块处理。 |
| 库存余额不足 | 拒绝过账，整张调整单回滚，不允许部分调整成功。 |
| 非批次库存和批次库存 | `lot_id = NULL` 和 `lot_id IS NOT NULL` 的余额继续分开聚合、分开扣减，不能互相抵扣。 |

一出一入更正必须先确保扣减侧余额足够。若错误库存已经被生产领用、退货或其他出库消耗，系统不能通过负库存掩盖历史链路问题，应要求先处理下游事实或选择更合适的业务调整路径。

## 10. 是否现在需要可用库存 / 冻结库存

| 问题 | 评审结论 |
| --- | --- |
| 当前余额字段 | `inventory_balances` 只有 `quantity`，表示账面数量。 |
| 是否已有可用 / 冻结 / 预留 | 当前没有 `available_quantity / hold_quantity / reserved_quantity`，也没有 `stock_reservations`。 |
| 来料质检冻结是否本轮强行做 | 不应强行做。冻结 / 放行是可用性问题，不是账面数量增减。 |
| 入库差异是否需要 `stock_reservations` 或 hold balance | Phase 2D-B1 不需要。数量更正只需要现有余额扣减和批次隔离；冻结和预留应等质检、生产领料、出货预留一起设计。 |
| 是否暂缓这些字段 | 推荐暂缓。现在新增可用 / 冻结 / 预留字段会提前引入多套库存口径，但生产领料、出货占用和质检 HOLD 规则尚未稳定。 |

如果 Phase 2D-C 后续进入来料质检，应先评审：

1. `inventory_lots.status` 是否扩展 `HOLD / REJECTED`。
2. HOLD 批次是否允许采购退货、报损、盘点或转仓。
3. 库存查询默认展示账面量、可用量，还是同时展示。
4. 可用量是否由余额字段维护，还是由冻结 / 预留事实表计算。

## 11. 权限码建议

当前 `rbac.go` 已有：

- `purchase.receipt.read`
- `purchase.receipt.create`
- `purchase.return.read`
- `purchase.return.create`
- `warehouse.adjustment.create`
- `warehouse.inventory.read`
- `quality.inspection.read/create/update`

Phase 2D-B1 如果落采购入库调整并接入外部 JSON-RPC/API，推荐新增独立权限码：

| 权限码 | 推荐用途 |
| --- | --- |
| `purchase.receipt.adjustment.read` | 查看采购入库调整单和差异追溯。 |
| `purchase.receipt.adjustment.create` | 创建 / 编辑 `DRAFT` 调整单。 |
| `purchase.receipt.adjustment.post` | 过账调整单，写库存流水。 |
| `purchase.receipt.adjustment.cancel` | 取消已过账调整，写 `REVERSAL`。 |

不推荐简单复用：

- `purchase.receipt.update`：当前真源里没有该权限码，且修改原入库单和过账差异调整不是同一语义。
- `warehouse.adjustment.create`：适合后续通用库存调整，不适合作为采购入库差异的唯一权限；否则采购差异会绕开采购单据追溯和已退数量约束。

本轮不改 `rbac.go`。下一轮如果只做内部 usecase/repo 而不接外部 API，可以先不暴露权限守卫；一旦接 JSON-RPC/API，应同轮先扩 `rbac.go` 权限码和内置角色矩阵，再加接口守卫。推荐采购角色拥有 read/create，过账和取消是否给采购、仓库或管理角色，需要随实际流程再定，但不能只靠前端入口隐藏。

## 12. 推荐落地路线

| 阶段 | 范围 | 明确不做 |
| --- | --- | --- |
| Phase 2D-B Review | 只做本评审文档，明确采购入库差异的边界、方案、source_type、状态机、与采购退货和余额的关系。 | 不改 schema，不生成 migration，不改 runtime，不改前端，不改帮助中心，不 apply 数据库。 |
| Phase 2D-B1 | 如果采纳本评审，落 `purchase_receipt_adjustments / purchase_receipt_adjustment_items`；只支持数量差异；支持 `ADJUST_IN / ADJUST_OUT`；支持 lot / warehouse 维度；校验有效入库数量、累计有效退货、余额不足和批次 / 非批次隔离；补 repo/usecase/PostgreSQL 测试。 | 不做金额差异，不做质检，不做供应商主数据，不做完整采购订单，不做前端。 |
| Phase 2D-B2 | 再评审金额差异是否进入采购金额调整、应付或财务模块；明确 `unit_price / amount` 更正是否需要单独单据和审计。 | 不把金额差异写进 `inventory_txns`。 |
| Phase 2D-C | 再评审来料质检入口，包括 HOLD / RELEASE / REJECT、批次状态、可用库存、质检单是否需要落表。 | 不在 2D-B1 强行新增 `quality_inspections`。 |
| Phase 2E | 再评审生产领料或通用库存调整，包括 `inventory_adjustments`、报损 / 报溢、盘点和生产领用。 | 不把 Phase 2D-B 的采购差异单扩成全仓调整模块。 |

## 13. 最终推荐

| 决策 | 推荐 |
| --- | --- |
| 下一轮是否优先落 `purchase_receipt_adjustments / purchase_receipt_adjustment_items` | 是。建议 Phase 2D-B1 优先落采购入库调整单，先解决已过账采购入库的数量、lot 和 warehouse 维度差异。 |
| 是否暂缓通用 `inventory_adjustments` | 是。通用盘点、报损、报溢和非采购库存调整后续单独评审，避免采购语义被稀释。 |
| 是否暂缓 `quality_inspections` | 是。质检冻结、放行、不合格处理牵动可用库存和品质流程，放到 Phase 2D-C。 |
| 是否暂缓 `available_quantity / hold_quantity / reserved_quantity` | 是。当前先保持 `inventory_balances.quantity` 作为账面数量，等质检 HOLD、生产领料和出货预留一起设计。 |
| 是否暂缓应付 / 发票 / 付款 | 是。金额差异不写库存流水，Phase 2D-B2 再评审是否进入应付 / 财务。 |
| 是否需要先扩 `rbac.go` 权限码 | 本轮不改。下一轮如果落外部 API 或页面入口，应先在 `rbac.go` 增加 `purchase.receipt.adjustment.read/create/post/cancel`，并同步内置角色矩阵和权限守卫。 |

最终口径：

- 入库前差异：按实收数量维护 `DRAFT` 入库单，不写库存流水。
- 入库后数量差异：下一轮推荐通过采购入库调整单写 `ADJUST_IN / ADJUST_OUT`。
- 入库后批次 / 仓库错误：通过同一调整单内一出一入表达。
- 入库后物料 / 单位错误：原则上也应一出一入，但 B1 应谨慎收窄范围，优先不做复杂换算和已退维度迁移。
- 金额错误：不影响库存，不写 `inventory_txns`。
- 质检冻结：不是数量事实，本轮暂缓。
