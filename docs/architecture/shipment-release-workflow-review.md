# Shipment Release Workflow Usecase 评审

> 结论：第七条最小后端 workflow usecase 已落地。`shipment_release done / blocked / rejected` 只推进协同业务状态：`done -> shipping_released`，`blocked / rejected -> blocked`。它不等于 `shipped`，不写库存流水，不更新库存余额，不创建库存批次，不做库存预留 / 冻结 / 扣减，不创建 DerivedTask，不派生出货执行、应收、开票或任何财务任务，也不改 Ent schema 或生成 migration。

## 1. 本轮范围

| 范围 | 结论 |
| --- | --- |
| `shipment_release done` 是否进入后端 `WorkflowUsecase` | 已进入，只做协同状态推进。 |
| done 语义 | `shipping_released`，表示已放行待出库，不是实际 `shipped`。 |
| blocked / rejected | 强制原因，业务状态统一写 `blocked`，清理相反原因残值。 |
| 库存事实 | 不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不做预留 / 冻结 / 扣减。 |
| 下游任务 | 不创建 DerivedTask，不派生出货执行、异常任务、应收、开票或财务任务。 |
| Ent / migration | 本轮不改 Ent schema，不生成 migration。 |

## 2. 代码级事实

| 文件 | 当前事实 | 对 shipment_release 的影响 |
| --- | --- | --- |
| `server/internal/biz/workflow.go` | `UpdateTaskStatus` 已新增 `shipment_release` 特殊 rule。识别不靠 `task_name`，而是 `task_group=shipment_release`、`owner_role_key=warehouse`、`source_type in (shipping-release, production-progress, inbound)`，并要求 payload 有 `shipment_release=true` 或 `finished_goods=true`。 | 后端成为真实运行时派生真源，只推进 `shipping_released / blocked`。 |
| `server/internal/biz/workflow.go` | 只允许业务状态为空、`shipment_release_pending`、`shipment_pending` 或 `blocked` 的同类任务进入特殊 rule；`shipping_released / shipped / receivable_pending / invoice_pending` 等后续状态不再触发。 | 防止 `done` 后重复触发或把后续财务 / 出货状态重新解释为放行。 |
| `server/internal/data/workflow_repo.go` | repo 复用现有 side effect 机制，在同一事务里更新任务、写 `status_changed` 事件并 upsert `workflow_business_states`；本规则不设置 `DerivedTask`。 | business state 与任务事件一致，不创建下游任务。 |
| `server/internal/data/jsonrpc_workflow.go` | `update_task_status` 继续走动作级权限、owner / assignee / status 校验。warehouse 可处理未指派的 warehouse `shipment_release`，非 warehouse 不能越权，super_admin 可处理未指派任务。 | 不新增 API，也不伪造旧前端 follow-up。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | warehouse 移动端对 `shipment_release done / blocked / rejected` 只调用 `updateWorkflowTaskStatus`，随后 `loadTasks()` 刷新；已移除本地 `shipped` 推进、warehouse / finance 状态 upsert 和 `receivable_registration` 创建。 | 真实移动端动作不再保留旧前端双写路径。 |
| `web/src/erp/utils/finishedGoodsFlow.mjs` | `buildShipmentReleaseTask` 保留给 seed / test / demo / 未来出货专项辅助；`resolveFinishedGoodsTaskBusinessStatus` 对 `shipment_release done` 返回 `shipping_released`。 | helper 不再把放行完成解释成真实 `shipped`。 |
| `web/src/erp/utils/shipmentFinanceFlow.mjs` | 继续保留 `shipped -> receivable_registration -> invoice_registration` 的辅助构造。 | 只能基于真实 `shipped` 或手动财务入口使用，不由 `shipment_release done` 自动调用。 |
| `web/src/erp/pages/BusinessModulePage.jsx` | 手动应收 / 开票入口本轮不迁，但发起应收不再把最新 `shipment_release done` 当成真实 `shipped`。 | 财务入口不扩大 shipment_release 语义。 |

## 3. 三个分支语义

| 分支 | 后端行为 |
| --- | --- |
| `done` | 更新当前任务为 `done`，写 `workflow_task_events.status_changed`，upsert `workflow_business_states.status_key=shipping_released`，payload 写 `shipment_release_task_id`、`shipment_release_result=done`、`shipment_release_deferred_inventory=true`、`shipment_execution_required=true`、`inventory_out_deferred=true`、`receivable_deferred=true`、`invoice_deferred=true`、`critical_path=true`、`decision=done`、`transition_status=done`。 |
| `blocked` | 要求 `reason` 或 payload `blocked_reason` 非空，更新当前任务为 `blocked`，写事件和 `blocked_reason`，upsert `workflow_business_states.status_key=blocked`，payload 写 `shipment_release_task_id`、`critical_path=true`、`decision=blocked`、`transition_status=blocked`、`blocked_reason`，并清理 `rejected_reason` 残留。 |
| `rejected` | 要求 `reason` 或 payload `rejected_reason` 非空，更新当前任务为 `rejected`，写事件和 `rejected_reason`，upsert `workflow_business_states.status_key=blocked`，payload 写 `shipment_release_task_id`、`critical_path=true`、`decision=rejected`、`transition_status=rejected`、`rejected_reason`，并清理 `blocked_reason` 残留。 |

`blocked` 业务状态允许再次进入特殊 rule，用于重复失败保护；`done` 后进入 `shipping_released`，不再触发特殊 rule。

## 4. 与 shipped 的边界

`shipment_release done` 不应默认等于 `shipped`。

| 语义 | 推荐真源 | 当前规则 |
| --- | --- | --- |
| 已放行待出库 | `WorkflowUsecase.UpdateTaskStatus(shipment_release done)` | 写 `shipping_released`，不写库存。 |
| 已实际出货 | 未来 `ShipmentUsecase / shipment_execution / outbound done` | 写 shipment / outbound 事实，并由 `InventoryUsecase` 写 `inventory_txns.OUT` 和余额扣减。 |
| 应收 / 开票前置 | 真实 `shipped` 后专项评审 | 不从 `shipment_release done` 派生。 |

当前规则只解决协同状态，不承诺库存可用量、库存锁定、财务放行、实际装车、物流单号、客户签收或 AR / invoice 成立。

## 5. 不派生应收 / 开票的原因

出货放行不等于债权成立。应收 / 开票至少需要真实出货事实、客户 ID、销售订单 / 合同、出货头和行、出货数量、金额、税率、物流 / 出库资料，以及 `ar_receivable / ar_invoice` 或等价财务真源。

因此第七条规则明确不创建 `receivable_registration`、`invoice_registration`，不 upsert finance 应收 / 开票状态，不派生任何财务任务。`shipmentFinanceFlow.mjs` 可继续作为 seed / test / demo / 手动财务入口辅助，但不是真实 `shipment_release done` 的运行时 follow-up。

## 6. 前端真实运行时收口

本项目是新项目，不兼容旧前端运行时 follow-up。已经迁入后端 `WorkflowUsecase` 的规则，真实页面不再本地写同一条业务事实。

本轮已收口：

1. 删除移动端真实运行时 `completeShipmentReleaseTask` 本地 follow-up。
2. `runFinishedGoodsFollowUp` 对 warehouse `shipment_release done / blocked / rejected` 直接返回，不再本地 upsert business state 或创建应收任务。
3. 移动端提交 payload 不再写 `shipment_result=shipped`，done 分支改写 `shipment_release_result=done`。
4. 移动端不再本地 upsert warehouse `workflow_business_states=shipped`。
5. 移动端不再本地 upsert finance 状态。
6. 移动端不再本地 createWorkflowTask 创建 `receivable_registration`。
7. 桌面手动应收入口不再把 `shipment_release done` 等同真实 `shipped`。

`finishedGoodsFlow.mjs` 和 `shipmentFinanceFlow.mjs` 仍可作为 seed / test / demo / 展示辅助或未来专项辅助，但不能作为真实运行时派生真源。

## 7. 后续专项边界

下一条主干闭环建议先评审并落地 `ShipmentUsecase / shipment_execution / outbound`：

1. 明确 shipment / outbound header 和 line 的唯一真源、字段、状态、幂等键和取消 / 冲正语义。
2. 明确 `on_hand / reserved / frozen / available` 的来源、释放条件和并发策略。
3. 由 `ShipmentUsecase` 承接出货执行和 shipped 确认。
4. 由 `InventoryUsecase` 只提供库存事实原语：`OUT`、余额扣减、防负库存、批次守卫、幂等和 `REVERSAL`。
5. 真实 `shipped` 后再专项评审应收 / 开票。

## 8. 本轮未做

- 没有实现 `ShipmentUsecase`。
- 没有实现 `Inventory OUT`。
- 没有推进 `shipped`。
- 没有写 `inventory_txns`。
- 没有更新 `inventory_balances`。
- 没有创建 `inventory_lots`。
- 没有新增 `shipments / shipment_items / reservations` schema。
- 没有改 Ent schema。
- 没有生成 migration。
- 没有执行 `make data / make migrate_status / ent_migrate`。
- 没有派生应收、开票、应付或对账。
