# Finished Goods Inbound Workflow Usecase 评审

> 结论：方案 A 已落地。第六条后端 workflow usecase 规则 `finished_goods_inbound done / blocked / rejected` 只收口后端协同状态：当前任务更新、写 `workflow_task_events`、upsert `workflow_business_states`。`done` 沿用当前状态字典口径写 `inbound_done`；`blocked / rejected` 写通用 `blocked` 并强制原因。不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不派生 `shipment_release`，不派生应收 / 开票 / 应付 / 对账。

## 1. 本轮评审范围

本专项记录 `finished_goods_inbound` 成品入库任务完成、阻塞和退回迁入后端 `WorkflowUsecase` 后的运行时口径。

| 范围 | 评审结论 |
| --- | --- |
| `finished_goods_inbound done` | 已迁入后端。只推进协同业务状态到 `inbound_done`，不写库存事实，不派生出货。 |
| `finished_goods_inbound blocked / rejected` | 已迁入后端。强制原因，任务进入对应状态，业务状态统一写 `blocked`。 |
| 库存事实 | 本轮不接入。成品库存入账必须单独评审 `InventoryUsecase`。 |
| 出货 / 财务 | 本轮不派生 `shipment_release`，不迁应收、开票、应付或对账。 |
| Ent / migration | 本轮不改 Ent schema，不生成 migration。 |

## 2. 代码级事实

| 文件 | 当前事实 | 对第六条的影响 |
| --- | --- | --- |
| `server/internal/biz/workflow.go` | `UpdateTaskStatus` 已识别第六条 `finished_goods_inbound` 特殊规则，使用 `applyFinishedGoodsInboundTransition` 处理 `done / blocked / rejected`。 | 第六条运行时真源已经收口到后端 WorkflowUsecase。 |
| `server/internal/biz/workflow.go` | 成品相关 payload 只有 `product_no/product_name/quantity/unit/shipment_date` 等快照字段，没有结构化 `product_id/sku_id/warehouse_id/location_id/lot_id/unit_id/source_line_id`。 | 这些字段不足以驱动真实成品库存入账。 |
| `server/internal/biz/workflow_test.go`、`server/internal/data/workflow_repo_test.go`、`server/internal/data/jsonrpc_workflow_test.go` | 已覆盖第六条 `finished_goods_inbound done / blocked / rejected`、原因强制、残值清理、识别边界、business state upsert、事件 payload、JSON-RPC RBAC，以及不创建下游任务 / 不派生 `shipment_release` / 不写库存事实。 | 第六条最小后端规则有后端 usecase、repo 和 JSON-RPC 回归保护。 |
| `server/internal/data/workflow_repo.go` | `UpdateWorkflowTaskStatus` 能在同一事务内更新任务、写 `status_changed` 事件、upsert 业务状态和幂等创建下游任务。 | 第六条最小状态收口可复用现有 `SideEffects.BusinessState`，无需新增 repo 层抽象。 |
| `server/internal/data/jsonrpc_workflow.go` | `update_task_status` 已有动作级 RBAC，并继续校验 `owner_role_key / assignee_id / task_status_key`。 | 第六条不需要绕开现有权限模型。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | `runFinishedGoodsFollowUp` 对仓库 `finished_goods_inbound` 已直接 return；真实移动端动作只调用 `update_task_status` 后刷新任务列表，不再本地 upsert `inbound_done`，也不再调用 `buildShipmentReleaseTask + createWorkflowTask`。 | 真实运行时不保留第六条旧前端 follow-up 双写。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | `finished_goods_inbound` 已纳入仓库退回按钮，`blocked / rejected` 由后端强制原因并统一写 `blocked`。 | 成品入库失败状态不由前端派生异常、返工或复检任务。 |
| `web/src/erp/utils/finishedGoodsFlow.mjs` | `buildShipmentReleaseTask` 只依赖业务记录和入库任务快照，未查询真实库存可用量，也没有库存预留、出库扣减或财务放行前置。 | 直接把该派生搬到后端会把“协同入库完成”误表达成“库存可发”。 |
| `web/src/erp/utils/finishedGoodsFlow.test.mjs` | 已测试移动端不再调用 `completeFinishedGoodsInboundTask`、不再导入 `buildShipmentReleaseTask` 或 `SHIPMENT_RELEASE_TASK_GROUP`；`buildShipmentReleaseTask` 测试只保留 seed / test / demo / 未来出货辅助字段口径。 | 前端测试保护第六条真实运行时不再本地派生出货。 |
| `web/src/erp/config/seedData.mjs`、业务链路调试页相关代码 | 前端 seed / 帮助配置只把“生产到出货”作为 v1 主链展示；`server/internal/biz/debug_seed.go` 的 `finished_goods_shipment` 调试场景会直接 seed `finished_goods_qc` 和 `shipment_release`。 | 调试 seed 是开发验收样本，不是第六条运行时真源；不能据此把出货派生写进后端规则。 |

## 3. `done` 口径

`finished_goods_inbound done` 本轮只做以下事情：

1. 当前 `finished_goods_inbound` 任务更新为 `done`。
2. 写一条 `workflow_task_events.event_type=status_changed`。
3. upsert `workflow_business_states`：
   - `source_type/source_id/source_no` 沿用当前任务来源。
   - `business_status_key=inbound_done`。
   - `owner_role_key=warehouse`。
   - payload 写 `inbound_task_id`、`inbound_result=done`、`decision=done`、`transition_status=done`、`finished_goods=true`、`inventory_balance_deferred=true`、`shipment_release_deferred=true`、`critical_path=true` 和必要展示快照。

状态名建议使用 `inbound_done`，不是新增 `finished_goods_inbound_done`。原因是当前后端业务状态字典、`finishedGoodsFlow.mjs`、`task-flow-v1.md` 和 `warehouse-quality-v1.md` 都以 `inbound_done` 表示仓库入库协同完成；若未来要新增更细状态，必须先同步评审状态字典、前端展示、调试页和文档口径。

## 4. 为什么不写库存事实

当前已有 `InventoryUsecase` 和库存 schema 能表达库存事实，但 `finished_goods_inbound` 任务本身还不是合格的库存入账来源。

| 前置条件 | 当前缺口 |
| --- | --- |
| 入库数量来源 | 当前 payload 只有 `quantity` 快照，缺少仓库确认行、部分入库、短溢装、多行入库和最终入库数量来源。 |
| 单位和精度来源 | 当前只有 `unit` 文本；库存写入需要结构化 `unit_id` 和 decimal 精度 / rounding 规则。 |
| 成品主体来源 | 库存流水需要 `subject_type=PRODUCT + subject_id`；当前只有 `product_no/product_name` 快照，没有稳定 `finished_product_id / product_id / sku_id`。 |
| 仓库 / 库位来源 | 库存写入需要 `warehouse_id`；当前成品入库任务没有稳定 `warehouse_id`，且项目仍未落 `warehouse_locations`。 |
| 批次来源 | Phase 2B 已有 `inventory_lots`，但成品入库没有定义 `lot_id / lot_no / batch_no / production_lot_no` 来源和缺批次策略。 |
| 来源行和幂等键 | `inventory_txns` 需要 `source_type + source_id + source_line_id` 或稳定 `idempotency_key`；当前 workflow 任务只有表头来源，缺少成品入库来源行。 |
| 重复 done 防重 | workflow 派生任务的应用层幂等不等于库存事实幂等；库存必须使用 `inventory_txns.idempotency_key` 唯一约束。 |
| 取消 / 冲正策略 | 库存错误必须追加 `REVERSAL`，不能改历史流水；第六条尚未定义从任务撤回到原流水定位和冲正的路径。 |
| 负库存策略 | 成品入库是 IN，但后续出货扣减会触达负库存、可用量和预留策略；不能只写入库不定义扣减闭环。 |
| 并发余额更新 | `InventoryUsecase` 已能同事务写流水和余额，但 workflow transaction 与 inventory transaction 的边界尚未统一。 |
| DB 约束 / 锁 | 若 workflow 和 inventory 合并，必须明确库存幂等 unique、业务来源 unique、必要的 DB lock 或 advisory lock。 |

采购入库之所以能过账，是因为 Phase 2C 已有 `purchase_receipts / purchase_receipt_items` 作为来源头和来源行，并用 `purchase_receipt_items.id` 生成 `source_line_id` 和幂等键。成品入库目前还没有等价的生产完工 / 成品入库专表或确认行，所以不能把 workflow payload 当库存真源。

## 5. 为什么不派生 `shipment_release`

当前前端 v1 的 `buildShipmentReleaseTask` 只根据业务记录和入库任务快照创建出货准备任务，不依赖真实库存可用量：

- 没有查询 `inventory_balances`。
- 没有区分账面库存、可用库存、冻结库存、预留库存。
- 没有 `stock_reservations` 或出货预留。
- 没有成品批次、仓库、单位和出货行的结构化映射。
- 没有定义出货扣减库存的 `OUT` 流水和冲正路径。

如果第六条后端直接派生 `shipment_release`，用户会在仓库任务池看到“出货放行 / 出货准备”，容易误以为成品库存已经真实可发。即使把它解释成“出货准备任务”，也会绕过库存确认口径，因为当前任务链没有强制校验库存事实或可用量。

因此 `shipment_release` 应等待成品 `InventoryUsecase` 入账、出货扣减、库存可用量 / 预留策略稳定后再评审。届时可再决定由 `finished_goods_inbound done` 派生，还是由库存可用 / 出货计划 / 业务确认共同触发。

## 6. `blocked / rejected` 口径

第六条 `blocked / rejected` 采用和采购仓库入库类似的最小口径：

| 问题 | 当前口径 |
| --- | --- |
| 是否强制原因 | 强制。接受 `reason`，或 payload 中的 `blocked_reason / rejected_reason`，并裁剪空白；空字符串和全空格无效。 |
| 业务状态 | 使用当前已有 `blocked`，不新增 `warehouse_blocked`、`inbound_blocked` 或 `finished_goods_inbound_blocked`。 |
| owner | 最小规则写 `owner_role_key=warehouse`，表示当前卡在仓库成品入库动作。 |
| payload | 写 `inbound_task_id`、`decision`、`transition_status`、对应原因、`finished_goods=true`、`critical_path=true`；`blocked` 清理 `rejected_reason` 残留，`rejected` 清理 `blocked_reason` 残留。 |
| 是否派生异常任务 | 不派生。当前前端 v1 没有稳定的成品入库异常 task_group。 |
| 是否派回 production | 不默认派。数量差异、库位、包装、质检撤回和生产返工不是同一责任场景。 |
| 是否派给 quality | 不默认派。只有明确需要复检或放行撤回时才应由未来异常任务或质检任务表达。 |

当前不新增成品入库异常任务、返工任务或复检任务。真实失败口径只表达为当前仓库入库协同状态 `blocked`，后续若需要区分数量差异、库位问题、品质撤回或生产返工，应先评审专门 task_group 和责任边界。

## 7. 当前前端运行时边界

第六条落地后，真实运行时已经移除成品入库旧前端 follow-up：

1. `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx`
   - `finished_goods_inbound done / blocked / rejected` 后不再调用本地后续函数。
   - 不再本地 `upsertWorkflowBusinessState(inbound_done / blocked)`。
   - 不再调用 `buildShipmentReleaseTask`。
   - 不再通过 `createWorkflowTask` 派生 `shipment_release`、异常、返工或复检任务。
2. `web/src/erp/utils/finishedGoodsFlow.mjs`
   - `buildShipmentReleaseTask` 只保留 seed / test / demo / 未来出货专项辅助字段口径。
   - `resolveFinishedGoodsTaskBusinessStatus` 定义 `finished_goods_inbound done -> inbound_done`，`blocked / rejected -> blocked`。
3. `web/src/erp/utils/finishedGoodsFlow.test.mjs`
   - 保留 `buildShipmentReleaseTask` 字段口径测试，但明确不作为真实移动端运行时派生。
   - 覆盖移动端不再导入 `buildShipmentReleaseTask`，不再保留 `completeFinishedGoodsInboundTask`。
4. 业务链路调试页和 debug seed
   - `businessChainDebug.mjs` 把“成品完工 -> 成品抽检 -> 成品入库 -> 出货”标为 partial v1 场景。
   - `server/internal/biz/debug_seed.go` 的 `finished_goods_shipment` 会直接 seed `shipment_release`，用于调试样本，不代表运行时后端规则。

业务链路调试页和 debug seed 可继续 seed `shipment_release` 作为开发样本或展示辅助，但它不是 `finished_goods_inbound done` 的后端运行时派生结果。

## 8. 第六条识别边界

后端识别第六条时必须同时满足：

1. `source_type=production-progress`。
2. `task_group=finished_goods_inbound`。
3. `owner_role_key=warehouse`。
4. `payload.finished_goods=true`。
5. `business_status_key` 为空、`warehouse_inbound_pending` 或 `blocked`。

`blocked` 允许再次触发，用于重复失败幂等保护。`inbound_done`、`shipment_pending`、`shipment_release_pending`、`shipped` 等 settled 或出货语义状态不再触发第六条特殊规则。

不要为了兼容旧逻辑保留“双轨”：本项目是新项目，`finished_goods_inbound done / blocked / rejected` 的业务状态收口以后端 `WorkflowUsecase.UpdateTaskStatus` 为唯一运行时真源。

## 9. InventoryUsecase 独立评审前置条件

成品库存入账应作为独立 `InventoryUsecase` 专项评审，至少先确认：

1. 成品入库来源真源：生产完工单、成品入库单、业务记录明细，还是新专表。
2. 来源行粒度：每个成品 / SKU / 批次 / 仓库是否有稳定行 ID。
3. `subject_type=PRODUCT` 的 `subject_id` 来源，以及 `product_id / sku_id / finished_product_id` 的唯一口径。
4. 入库数量、单位、单位精度和 decimal rounding。
5. `warehouse_id` 和未来 `location_id` 来源。
6. `lot_id / lot_no / batch_no / production_lot_no` 来源、缺批号策略和批次质量状态。
7. `source_type + source_id + source_line_id` 与 `idempotency_key` 生成规则。
8. 重复 done、重复过账、网络重试和并发提交的防重策略。
9. 取消、撤回、错入库和冲正的 `REVERSAL` 策略。
10. 成品入库与出货扣减、预留、冻结和可用量的关系。
11. workflow transaction 与 inventory transaction 是否合并，或如何保持跨 usecase 一致性。
12. DB unique constraint、行锁、余额原子更新或 advisory lock 的选择。
13. 历史旧数据是否回补，缺字段时是否允许只保留协同状态、不伪造库存。

## 10. 第六条最小实现

当前最小落地范围：

1. 在 `WorkflowUsecase.UpdateTaskStatus` 增加 `finished_goods_inbound` 识别：
   - `source_type=production-progress`；
   - `task_group=finished_goods_inbound`；
   - `owner_role_key=warehouse`；
   - `payload.finished_goods=true`；
   - `business_status_key` 为空、`warehouse_inbound_pending` 或 `blocked` 时进入规则。
2. `done`：
   - `BusinessStatusKey=inbound_done`；
   - side effect 只 upsert `workflow_business_states`；
   - 不设置 `DerivedTask`；
   - payload 标记 `inventory_balance_deferred=true` 和 `shipment_release_deferred=true`。
3. `blocked / rejected`：
   - 强制 reason；
   - `BusinessStatusKey=blocked`；
   - side effect 只 upsert `workflow_business_states=blocked`；
   - blocked 清理 `rejected_reason`，rejected 清理 `blocked_reason`；
   - 不派生异常、返工、复检或出货任务。
4. 测试：
   - usecase 测 `done / blocked / rejected`、原因强制、残值清理、非成品入库不误触发。
   - repo 测任务状态、事件、业务状态同事务写入，不创建 `shipment_release`，不写 `inventory_txns / inventory_balances / inventory_lots`。
   - JSON-RPC 测 RBAC、owner role、完成 / 驳回权限仍生效。
   - 前端测真实移动端不再本地 upsert 第六条业务状态、不再本地创建 `shipment_release`。

本专项没有修改 Ent schema，没有生成 migration，没有写库存流水、库存余额或库存批次，也没有迁出货和财务链路。`shipment_release` 是否由成品入库完成派生，必须等库存事实 / 可用量 / 预留冻结 / 财务放行边界评审后再决定。
