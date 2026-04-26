# Warehouse Inbound Workflow Usecase 评审

> 结论：方案 A 已落地。第三条后端 workflow usecase 只推进采购 `warehouse_inbound done / blocked / rejected` 协同状态，不在 workflow 中写 `inventory_txns`、不更新 `inventory_balances`、不生成库存批次，也不顺手迁采购应付、委外、成品、出货和应收链路。

## 1. 本轮评审范围

本专项只覆盖采购到货 / 入库通知来源的 `warehouse_inbound` 任务：

| 范围 | 结论 |
| --- | --- |
| `warehouse_inbound done` | 已进入后端 workflow usecase，只做任务状态、任务事件和 `workflow_business_states=inbound_done`。 |
| `warehouse_inbound blocked/rejected` | 已进入后端 workflow usecase，强制原因，只落业务阻塞状态，不派生新异常任务。 |
| 库存流水 / 余额 | 当前不接入 workflow。库存入账必须单独走库存 usecase 评审。 |
| 应付登记 | 当前仍需单独评审 payable usecase，不随第三条 workflow usecase 一起迁。 |

不在本专项范围内：

- 委外入库、成品入库、出货扣减。
- 应收、应付、对账和开票链路。
- Ent schema、Atlas migration、库存余额重算、历史回补。

## 2. 当前代码级事实

| 层级 | 当前事实 | 对第三条规则的影响 |
| --- | --- | --- |
| `server/internal/biz/workflow.go` | `WorkflowUsecase.UpdateTaskStatus` 已识别老板审批、IQC 和采购 `warehouse_inbound` 三类任务；采购 `warehouse_inbound` 进入后端特殊 rule。 | 后端已自动把 `warehouse_inbound done` 收口成 `inbound_done`，把 `blocked/rejected` 收口成 `blocked`。 |
| `server/internal/data/workflow_repo.go` | `UpdateWorkflowTaskStatus` 已能在同一 Ent transaction 内更新当前任务、写 `workflow_task_events`，并根据 `SideEffects` upsert 业务状态或幂等创建下游任务。 | 第三条最小规则未新增 repo 抽象，只复用现有 business state side effect，且不设置 `DerivedTask`。 |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | 仓库移动端采购 `warehouse_inbound done / blocked / rejected` 后只调用 `update_task_status` 并刷新任务列表，不再本地 upsert `inbound_done/blocked`，也不再创建采购应付登记任务。 | 当前前端没有写库存；应付登记后续必须按 payable usecase 单独评审。 |
| `web/src/erp/utils/purchaseInboundFlow.mjs` | `warehouse_inbound` 任务 payload 只带 `material_name/product_name/quantity/unit` 等展示快照，不带结构化 `material_id/product_id/unit_id/warehouse_id/lot_id/source_line_id`。 | 这些字段不足以可靠写库存事实表。 |
| `server/internal/data/model/schema/inventory_txn.go` | 已有 `subject_type/subject_id/warehouse_id/lot_id/txn_type/direction/quantity/unit_id/source_type/source_id/source_line_id/idempotency_key/reversal_of_txn_id`。 | schema 能承接最小库存事实，但 workflow 入库任务还没有稳定来源映射。 |
| `server/internal/data/model/schema/inventory_balance.go` | 余额按 `subject_type + subject_id + warehouse_id + unit_id + nullable lot_id` 聚合，Phase 2B 已用 partial unique index 区分批次 / 非批次余额。 | 余额维度足够表达批次或非批次入库，但需要明确仓库、单位和批次来源。 |
| `server/internal/data/model/schema/inventory_lot.go` | 批次按 `subject_type + subject_id + lot_no` 唯一，不做物理删除。 | 如果真实入库要落批次，必须先确定批号来源和缺批号策略。 |

## 3. `done` 边界

已落地的后端最小规则：

| 动作 | 规则 |
| --- | --- |
| 识别任务 | `source_type in (accessories-purchase, inbound) + task_group=warehouse_inbound + owner_role_key=warehouse + business_status_key 为空或 warehouse_inbound_pending`。 |
| 当前任务 | 更新为 `task_status_key=done`，写 `completed_at`。 |
| 任务事件 | 写 `workflow_task_events.event_type=status_changed`，保留 actor、actor_role_key 和 payload。 |
| 业务状态 | upsert `workflow_business_states.business_status_key=inbound_done`，`owner_role_key=warehouse`。 |
| payload | 保留 `warehouse_task_id`、`inbound_result=done`、`inventory_balance_deferred=true`、`critical_path=true`，只作为协同状态说明，不作为库存事实真源。 |
| 下游任务 | 不在该 usecase 内创建采购应付登记任务；应付登记后续按财务 / payable usecase 单独评审。 |
| 库存 | 不创建 `inventory_txns`，不更新 `inventory_balances`，不创建或更新 `inventory_lots`。 |

原因：

- `inbound_done` 当前业务状态文案已经明确“库存余额和库存流水后续按专表评审落地”。
- 当前任务 payload 的数量、单位、物料和仓库仍是快照文本或缺失字段，不够作为库存事实写入依据。
- workflow usecase 当前只负责任务和业务状态的一致推进；库存事实是另一条强事实链路，不能混进任务状态迁移里。

## 4. `blocked / rejected` 边界

已按最小稳定口径处理：

| 问题 | 建议 |
| --- | --- |
| 是否要求 reason | 必须要求 `reason` 或 payload 中的 `blocked_reason/rejected_reason`，与老板审批和 IQC 分支保持一致。 |
| 业务状态 | 使用当前已有 `blocked`，不要新增 `inbound_blocked` 或 `warehouse_exception`，也不要写成 `qc_failed`。 |
| 当前任务 | `blocked` 或 `rejected` 只更新当前 `warehouse_inbound` 任务和 `workflow_task_events`。 |
| 业务状态 owner | 最小规则先写 `owner_role_key=warehouse`，表示当前入库执行被仓库卡住；后续若派生异常任务，再由异常任务表达采购、品质或业务责任。 |
| payload | 写 `decision`、`transition_status`、`blocked_reason/rejected_reason`、`warehouse_task_id`、`critical_path=true`。 |
| 是否派生任务 | 当前规则不派生。不要共用 `purchase_quality_exception`；该 task_group 语义是 IQC 来料不良处理，不等于仓库入库异常。 |
| 后续可能新增 task_group | 如果样本确认仓库入库异常需要责任人闭环，再新增 `warehouse_inbound_exception` 之类专用 task_group，而不是复用 IQC 异常。 |

`qc_failed` 只表示品质结论不合格。仓库入库阶段的阻塞可能来自数量差异、库位缺失、单据不齐、供应商短发、未找到批次、仓库容量等，不应默认改写为品质不合格。

责任角色建议：

| 场景 | 后续可能责任 | 说明 |
| --- | --- | --- |
| 数量、供应商、采购单据、补货 / 退货协调 | `purchase` | 适合未来由 `warehouse_inbound_exception` 派生给采购。 |
| 需要复检、质量状态不清或放行撤回 | `quality` | 只能在原因明确指向质量复核时派给品质，不应默认走 `qc_failed`。 |
| 客户订单、交期或业务资料缺失 | `sales` | 不是采购入库异常默认责任人，除非来源记录明确是业务资料问题。 |
| 纯入库执行问题 | `warehouse` | 最小规则先保持当前任务 owner，不额外派生。 |

## 5. 为什么不直接写库存流水和余额

真实入库写 `inventory_txns / inventory_balances` 前，至少需要先确认以下前置条件：

| 前置条件 | 当前缺口 |
| --- | --- |
| 入库数量来源 | `warehouse_inbound` payload 只有展示用 `quantity` 文本；真实数量应来自确认入库行，且要支持部分入库、短溢装和多行。 |
| 单位来源 | payload 只有 `unit` 文本；库存写入需要结构化 `unit_id` 和单位精度。 |
| 仓库 / 库位来源 | 现有库存 schema 有 `warehouse_id`，没有 `warehouse_locations`；任务 payload 未提供稳定 `warehouse_id`。 |
| 物料 / 成品来源 | 库存写入需要 `subject_type + subject_id`，当前任务只有 `material_name/product_name` 快照文本。 |
| 批次来源 | Phase 2B 有 `inventory_lots`，但入库任务未定义 `lot_id/lot_no/batch_no` 来源、缺批号策略和质量状态映射。 |
| 来源行粒度 | `inventory_txns` 需要 `source_type + source_id + source_line_id` 或稳定幂等键；当前任务只有表头 `source_id`。 |
| 重复 done | 库存写入必须通过 `idempotency_key` 防重复；workflow 当前应用层幂等只覆盖派生任务，不覆盖库存事实。 |
| 取消 / 冲正 | 已入库后撤回不能改历史流水，必须定义 `REVERSAL` 触发条件、权限和原流水定位。 |
| 负库存 | Phase 2A 默认禁止负库存；是否允许仓库级负库存仍未形成业务配置。 |
| decimal 精度 | schema 使用 decimal/numeric，但入库来源还未定义按单位精度 rounding / scale。 |
| 并发余额 | `InventoryUsecase` 已有同事务流水 + 原子余额更新能力，但 workflow transaction 与 inventory transaction 还没有统一事务边界。 |
| DB 幂等 / 锁 | 库存已有 `idempotency_key` unique；workflow 派生任务仍是应用层查询后创建。若把库存接进 workflow，需要明确 DB unique constraint、advisory lock 或统一事务策略。 |

Phase 2A / 2B 的库存 schema 已经能表达最小库存事实，但还不能单靠 `warehouse_inbound` 任务直接推导真实入库。缺的是业务来源映射、入库确认行、幂等键生成、冲正策略和 workflow 与 inventory 的事务边界，不是再补一个简单写表分支。

## 6. 三个方案对比

| 方案 | 内容 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| 方案 A | 只迁 `warehouse_inbound done -> inbound_done` 业务状态；`blocked/rejected` 只做原因和 `blocked` 状态边界；不写库存。 | 最小、稳定，复用现有 workflow 事务，不污染库存事实。 | 应付和库存仍需后续单独迁。 | 已采用。 |
| 方案 B | `warehouse_inbound done` 同时写 `inventory_txns / inventory_balances`。 | 一次完成协同和库存事实。 | 来源字段不足；重复 done、部分入库、批次、单位、仓库、冲正和事务边界都未定，容易把错误库存写成事实。 | 不建议本轮做。 |
| 方案 C | 先新增库存入账专用 usecase，但暂不接 workflow。 | 能独立验证库存字段、幂等、冲正和余额并发。 | 需要先补业务来源映射和入库确认输入，不会立即解决 workflow 状态迁移。 | 适合作为下一轮库存专项，不替代方案 A。 |

## 7. 已落地的最小范围

本轮已按方案 A 编码落地：

1. 在 `WorkflowUsecase` 中新增 `isPurchaseWarehouseInboundTask`，识别 `accessories-purchase/inbound + warehouse_inbound + warehouse + business_status_key 为空或 warehouse_inbound_pending`。
2. `done` 分支设置 `BusinessStatusKey=inbound_done`，通过现有 `SideEffects.BusinessState` upsert `workflow_business_states`，payload 写 `warehouse_task_id`、`inbound_result=done`、`inventory_balance_deferred=true`、`critical_path=true`、`decision=done`、`transition_status=done`。
3. `blocked/rejected` 分支要求 reason，写 `BusinessStatusKey=blocked`，upsert `workflow_business_states=blocked`，payload 分别保留 `blocked_reason` 或 `rejected_reason`，不派生下游任务。
4. `MobileRoleTasksPage.jsx` 的采购入库 `done/blocked/rejected` follow-up 已下线本地状态 upsert；采购应付任务不再由这条真实移动端动作创建，后续必须在 payable usecase 中单独评审。
5. 已补后端 usecase、repo、JSON-RPC 测试和前端 source guard / 构造函数字段口径测试。

明确不做：

- 不调用 `InventoryUsecase.ApplyInventoryTxnAndUpdateBalance`。
- 不创建 `inventory_lots`。
- 不修改 Ent schema。
- 不生成 migration。
- 不迁委外、成品、出货、应收、应付链路。

当前仍不是完整 workflow engine。库存事实入账下一步必须单独评审 `InventoryUsecase` 的入账输入、幂等键、批次 / 单位 / 仓库来源、冲正和事务边界，不应写成已经接入 workflow。
