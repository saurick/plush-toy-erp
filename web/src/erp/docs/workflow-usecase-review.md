# Workflow Usecase 统一编排评审

> 结论：后端 `WorkflowUsecase.UpdateTaskStatus` 已落地七条最小规则，但仍不是完整 workflow engine。第七条规则是 `shipment_release done / blocked / rejected` 只推进协同业务状态：`done -> shipping_released`，`blocked / rejected -> blocked`。`shipment_release done` 不等于 `shipped`，不写库存，不派生应收 / 开票 / 财务任务。

## 1. 当前后端已迁规则

| 规则         | 后端行为                                                                          | 边界                                                                               |
| ------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 老板审批     | `done -> engineering_data`，`blocked / rejected -> order_revision`。              | 幂等创建下游任务。                                                                 |
| IQC          | `done -> warehouse_inbound`，`blocked / rejected -> purchase_quality_exception`。 | 不写库存事实。                                                                     |
| 采购仓库入库 | `done -> inbound_done`，`blocked / rejected -> blocked`。                         | 只 upsert business state，不派生应付，不写库存。                                   |
| 委外回货检验 | `done -> outsource_warehouse_inbound`，`blocked / rejected -> outsource_rework`。 | 不写库存事实，不派生委外应付。                                                     |
| 成品抽检     | `done -> finished_goods_inbound`，`blocked / rejected -> finished_goods_rework`。 | 不写库存事实，不派生 `shipment_release`。                                          |
| 成品入库     | `done -> inbound_done`，`blocked / rejected -> blocked`。                         | 只 upsert business state，不写库存，不派生 `shipment_release`。                    |
| 出货放行     | `done -> shipping_released`，`blocked / rejected -> blocked`。                    | 只 upsert business state，不推进 `shipped`，不派生出货执行、应收、开票或财务任务。 |

下游任务派生仍按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 在应用层事务内查询后创建；采购仓库入库、成品入库和出货放行不创建下游任务，只走 business state upsert。当前暂未新增 DB unique constraint，极端并发下后续仍需 DB unique constraint 或 advisory lock 加固。

## 2. shipment_release 识别边界

`shipment_release` 特殊规则不靠 `task_name` 文案识别，而是同时要求：

- `task_group=shipment_release`
- `owner_role_key=warehouse`
- `source_type in (shipping-release, production-progress, inbound)`
- payload 有 `shipment_release=true` 或 `finished_goods=true`
- `business_status_key` 为空、`shipment_release_pending`、`shipment_pending` 或 `blocked`

`shipping_released / shipped / receivable_pending / invoice_pending` 等 settled 或后续状态不再触发第七条特殊规则。`blocked` 保持可进入，用于重复失败保护。

## 3. shipment_release 分支

| 分支       | 结果                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`     | 当前任务更新为 `done`，写 `workflow_task_events`，upsert `workflow_business_states=shipping_released`。payload 写 `shipment_release_task_id`、`shipment_release_result=done`、`shipment_release_deferred_inventory=true`、`shipment_execution_required=true`、`inventory_out_deferred=true`、`receivable_deferred=true`、`invoice_deferred=true`、`critical_path=true`、`decision=done`、`transition_status=done`。 |
| `blocked`  | 要求 `reason` 或 payload `blocked_reason` 非空，更新当前任务为 `blocked`，写事件和 `blocked_reason`，upsert `workflow_business_states=blocked`，清理 `rejected_reason` 残留。                                                                                                                                                                                                                                       |
| `rejected` | 要求 `reason` 或 payload `rejected_reason` 非空，更新当前任务为 `rejected`，写事件和 `rejected_reason`，upsert `workflow_business_states=blocked`，清理 `blocked_reason` 残留。                                                                                                                                                                                                                                     |

第七条规则不创建 DerivedTask，不派回 warehouse / sales / pmc / finance，不派生异常任务，不派生出货执行，不派生 `receivable_registration` 或 `invoice_registration`。

## 4. 前端运行时边界

本项目是新项目，已迁入后端的规则不保留真实运行时旧前端 follow-up 双写。

当前真实移动端动作已经收口：

1. `MobileRoleTasksPage.jsx` 对 warehouse `shipment_release done / blocked / rejected` 只调用 `updateWorkflowTaskStatus`，随后刷新任务列表。
2. 移动端不再本地把业务记录推进 `shipped`。
3. 移动端不再本地 upsert warehouse / finance 业务状态。
4. 移动端不再本地创建 `receivable_registration`。
5. 移动端提交 payload 不再写 `shipment_result=shipped`，done 分支只写 `shipment_release_result=done`。
6. `BusinessModulePage.jsx` 的手动应收入口不再把最新 `shipment_release done` 当成真实 `shipped`。

`finishedGoodsFlow.mjs` 的 `buildShipmentReleaseTask` 可以继续保留给 seed / test / demo / 展示辅助；`shipmentFinanceFlow.mjs` 可以继续保留给 seed / test / demo / 手动财务入口和未来财务专项辅助，但二者都不是真实 `shipment_release done` 的运行时派生真源。

## 5. 仍未迁的主干闭环

`shipment_release done` 只是 `shipping_released`。真实 `shipped` 必须由未来 `ShipmentUsecase / shipment_execution / outbound done` 确认；库存事实入账必须由 `InventoryUsecase` 负责。

后续仍需专项评审：

1. `ShipmentUsecase`：出货单据、出货行、放行、出货执行、取消 / 冲正和 `shipped` 确认。
2. `InventoryUsecase` 出货侧：`OUT`、余额扣减、防负库存、批次守卫、预留 / 冻结、幂等和 `REVERSAL`。
3. 真实 `shipped` 后的应收 / 开票。
4. 应付和对账闭环。

当前未做：没有写 `inventory_txns`，没有更新 `inventory_balances`，没有创建 `inventory_lots`，没有库存预留 / 冻结 / 扣减，没有改 Ent schema，没有生成 migration，没有推进 `shipped`，没有派生应收、开票、应付或对账。
