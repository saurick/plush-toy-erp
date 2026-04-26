# Workflow Usecase 统一编排评审

> 结论：后端 workflow usecase 渐进迁入已经开始，但不建议一次性重写 6 条闭环，也不引入复杂流程引擎。前四条最小规则已落地：老板审批任务 `done / blocked / rejected` 后派生工程资料或补资料任务；IQC 来料检验任务 `done / blocked / rejected` 后派生仓库入库或来料异常处理任务；采购 `warehouse_inbound done / blocked / rejected` 只推进协同业务状态；委外回货检验 `outsource_return_qc done / blocked / rejected` 后派生委外入库或返工补做任务。其余主干闭环仍保持前端 v1 编排。

## 1. 当前模式

当前 6 条业务闭环已经完成，但只有前四条最小规则进入后端 usecase：第一条“订单提交 -> 老板审批 -> 工程资料任务”的老板审批完成 / 阻塞 / 退回派生规则，第二条“采购到货 -> IQC -> 入库”的 IQC 合格 / 阻塞 / 退回派生规则，第三条“采购仓库确认入库”的 `warehouse_inbound done / blocked / rejected` 协同状态推进规则，第四条“委外回货检验”的 `outsource_return_qc done / blocked / rejected` 委外入库 / 返工补做派生规则。主路径现在是：

- 老板审批和 IQC 派生后端化。
- 采购仓库入库状态推进后端化。
- 委外回货检验派生后端化。
- 其余闭环前端 v1 编排。
- 后端保存 `workflow_tasks`。
- 后端保存 `workflow_task_events`。
- 后端保存 `workflow_business_states`。
- workflow API 提供 `create_task`、`update_task_status`、`upsert_business_state`、`urge_task`。

优点：

- 开发快。
- 适合验证流程。
- 迁移风险低。
- 不需要马上冻结所有行业字段。

缺点：

- 流程规则分散在前端。
- 后端无法单独保证完整业务状态机。
- 桌面端、移动端和未来 API 多入口可能出现派生任务不一致。
- 下游任务创建和业务状态写入不是完整后端事务。

## 2. 当前 workflow 编排事实

| 闭环                                     | 前端编排位置                                                | 当前下游任务                               |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| 订单提交 -> 老板审批 -> 工程资料任务     | `orderApprovalFlow.mjs`、桌面业务页、移动端任务页           | 老板审批、工程资料、订单资料补充           |
| 采购到货 -> IQC -> 入库                  | `purchaseInboundFlow.mjs`、桌面发起动作、后端 IQC 状态派生  | IQC、仓库入库、来料不良处理                |
| 委外发料 -> 回货 -> 检验 -> 入库         | `outsourceReturnFlow.mjs`、桌面业务页、后端回货检验状态派生 | 委外回货跟踪、回货检验、委外入库、委外返工 |
| 成品完工 -> 成品抽检 -> 成品入库 -> 出货 | `finishedGoodsFlow.mjs`、桌面业务页、移动端任务页           | 成品抽检、成品入库、成品返工、出货放行     |
| 出货 -> 应收登记 -> 开票登记             | `shipmentFinanceFlow.mjs`、桌面业务页、移动端任务页         | 应收登记、开票登记、财务阻塞状态           |
| 采购/委外 -> 应付登记 -> 对账            | `payableReconciliationFlow.mjs`、桌面业务页、移动端任务页   | 采购应付、委外应付、采购对账、委外对账     |

后端当前已经负责：

- 校验任务状态和业务状态是否合法。
- 创建任务时写 `workflow_task_events.created`。
- 更新任务状态时写 `workflow_task_events.status_changed`。
- 催办/升级时写任务 payload 和 `workflow_task_events`。
- upsert `workflow_business_states`。

后端当前已经额外负责第一条老板审批规则：

- 老板审批 `done` 后写 `project_approved` 并幂等创建 `engineering_data` 工程资料任务。
- 老板审批 `blocked` 后强制要求原因，写 `blocked` 并幂等创建 `order_revision` 补资料 / 异常处理任务。
- 老板审批 `rejected` 后强制要求原因，写 `project_pending` 并幂等创建 `order_revision` 补资料 / 修改订单任务。
- `blocked / rejected` 共用 `order_revision` 任务组，但 payload 写入 `decision` 和 `transition_status` 区分来源，并保留 `blocked_reason / rejected_reason`。
- 在同一个事务里完成当前审批任务状态、事件、业务状态 upsert 和下游任务创建。
- 当前幂等是应用层事务内查询后创建，按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 查找已有下游任务，暂未新增 DB unique constraint；极端并发下后续仍需 DB unique constraint 或 advisory lock 加固。

后端当前也已经额外负责第二条 IQC 来料检验规则：

- IQC 任务识别不靠 `task_name` 文案，按 `source_type in (accessories-purchase, inbound) + task_group=purchase_iqc + owner_role_key=quality + 采购到货/IQC相关 business_status_key` 判断。
- IQC `done` 后写 `warehouse_inbound_pending` 业务状态，状态归属 `warehouse`，并幂等创建 `warehouse_inbound` 仓库确认入库任务。
- IQC `blocked` 后强制要求原因，写 `qc_failed` 业务状态，状态归属 `purchasing`，并幂等创建 `purchase_quality_exception` 来料异常处理任务。
- IQC `rejected` 后强制要求原因，写 `qc_failed` 业务状态，状态归属 `purchasing`，并幂等创建 `purchase_quality_exception` 来料异常处理任务。
- `blocked / rejected` 共用 `purchase_quality_exception` 任务组，但 payload 写入 `decision` 和 `transition_status` 区分来源，并保留 `blocked_reason / rejected_reason`。
- 在同一个事务里完成当前 IQC 任务状态、事件、业务状态 upsert 和下游任务创建。
- 当前幂等仍是应用层事务内查询后创建，按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 查找已有下游任务，暂未新增 DB unique constraint；极端并发下后续仍需 DB unique constraint 或 advisory lock 加固。

后端当前已经额外负责第三条采购仓库入库规则：

- 采购 `warehouse_inbound` 任务识别不靠 `task_name` 文案，按 `source_type in (accessories-purchase, inbound) + task_group=warehouse_inbound + owner_role_key=warehouse + business_status_key 为空或 warehouse_inbound_pending` 判断。
- `warehouse_inbound done` 后写 `inbound_done` 业务状态，状态归属 `warehouse`，payload 标记 `warehouse_task_id`、`inbound_result=done`、`inventory_balance_deferred=true`、`critical_path=true`、`decision=done` 和 `transition_status=done`。
- `warehouse_inbound blocked` 后强制要求原因，写 `blocked` 业务状态，状态归属 `warehouse`，payload 保留 `blocked_reason`、`decision=blocked` 和 `transition_status=blocked`。
- `warehouse_inbound rejected` 后强制要求原因，写 `blocked` 业务状态，状态归属 `warehouse`，payload 保留 `rejected_reason`、`decision=rejected` 和 `transition_status=rejected`。
- 第三条规则不创建任何下游任务，不派生采购应付任务，不派生 `purchase_quality_exception`，不写 `qc_failed`。
- 第三条规则不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`；库存事实入账必须单独评审 `InventoryUsecase`。
- 在同一个事务里完成当前仓库入库任务状态、事件和业务状态 upsert。

后端当前已经额外负责第四条委外回货检验规则：

- 委外 `outsource_return_qc` 任务识别不靠 `task_name` 文案，按 `source_type in (processing-contracts, inbound) + task_group=outsource_return_qc + owner_role_key=quality + payload.qc_type=outsource_return 或 payload.outsource_processing=true` 判断。
- 识别边界只允许 `business_status_key` 为空、`qc_pending` 或 `qc_failed` 进入第四条规则；`warehouse_inbound_pending`、`blocked`、`inbound_done` 等已进入下游或业务阻塞的状态不再触发。`qc_failed` 保持可进入，是为了让重复 `blocked / rejected` 走同一事务内幂等保护，并允许上一轮 `outsource_rework` 完成后再次创建下一轮返工 / 补做任务。
- `outsource_return_qc done` 后写 `warehouse_inbound_pending` 业务状态，状态归属 `warehouse`，payload 保留本次提交的 `qc_result`（缺省为 `pass`），并幂等创建 `outsource_warehouse_inbound` 委外回货入库任务。
- `outsource_return_qc blocked` 后强制要求原因，写 `qc_failed` 业务状态，状态归属 `production`，payload 保留 `decision=blocked`、`transition_status=blocked` 和 `blocked_reason`，并幂等创建 `outsource_rework` 返工 / 补做任务。
- `outsource_return_qc rejected` 后强制要求原因，写 `qc_failed` 业务状态，状态归属 `production`，payload 保留 `decision=rejected`、`transition_status=rejected` 和 `rejected_reason`，并幂等创建 `outsource_rework` 返工 / 补做任务。
- 第四条规则不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不迁委外入库完成后的库存事实入账，不派生委外应付。
- 在同一个事务里完成当前委外回货检验任务状态、事件、业务状态 upsert 和下游任务幂等创建。
- 当前幂等按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 查找已有下游任务；`blocked` 后又 `rejected` 且旧 `outsource_rework` 仍未完成时复用同一个 active 返工任务，上一轮返工任务已 `done` 后允许下一轮再次创建。

后端当前还没有负责其余主干闭环：

- 委外入库完成、成品、出货、应收、应付链路的完成 / 阻塞 / 退回后派生。
- 其余闭环在同一个事务里完成任务状态、事件、业务状态和下游任务创建。
- 除老板审批、IQC、采购仓库入库和委外回货检验外，对同一来源同一任务组做后端幂等。

## 3. 哪些流程适合继续前端编排

| 类型          | 继续前端编排原因                                                     |
| ------------- | -------------------------------------------------------------------- |
| UI 辅助动作   | 按钮显示、默认值、调试查询条件属于页面体验逻辑                       |
| 调试/验收场景 | 业务链路调试、协同任务调试和帮助中心入口应保持辅助性质               |
| 非关键链路    | 不影响库存、财务、审批责任和审计闭环的提示类动作可以留在前端         |
| 频繁调整流程  | 字段、角色和操作口径未稳定前不宜过早固化到后端                       |
| 页面展示逻辑  | Dashboard 风险标签、移动端可见性解释、下一步按钮文案可以继续前端计算 |

## 4. 哪些流程适合迁入后端 workflow usecase

满足任意条件时，应迁入后端 usecase：

- 任务完成后必须强一致生成下游任务。
- 同一任务可能被桌面端、移动端、API 多入口触发。
- 需要防重复创建。
- 需要事务保证 `task + event + business_state` 一致。
- 需要权限和角色校验。
- 需要审计闭环。
- 需要后续外部系统调用。

## 5. 迁入后端候选优先级

| 优先级 | 候选                                                          | 评审结论                                                                                                                                                  |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0     | `update_task_status(done)` 后生成下游任务或推进关键业务状态   | 老板审批、IQC、采购仓库入库和委外回货检验四条最小规则已落地；其余闭环继续按优先级渐进迁入                                                                 |
| P0     | `update_task_status(blocked/rejected)` 后写阻塞状态和异常任务 | 老板审批、IQC、采购仓库入库和委外回货检验的 blocked/rejected 分支已落地并强制 reason；其余闭环待迁                                                        |
| P0     | `urge_task`                                                   | 已在后端，继续保留，不迁回前端                                                                                                                            |
| P1     | 订单审批通过 -> 工程资料任务                                  | 已作为第一条试迁链路落地，同时覆盖 blocked/rejected 补资料分支                                                                                            |
| P1     | IQC 合格 -> 仓库入库任务                                      | 已作为第二条最小规则落地，同时覆盖 blocked/rejected 来料异常分支；应付链路后续触发仍留到之后                                                              |
| P1     | 采购仓库确认入库 -> `inbound_done / blocked`                  | 已作为第三条最小规则落地：只迁 `warehouse_inbound done -> inbound_done` 和 blocked/rejected 原因 / `blocked` 状态，不写库存流水 / 余额 / 批次，不派生应付 |
| P1     | 委外回货检验合格 / 异常 -> 委外入库 / 返工补做任务            | 已作为第四条最小规则落地：不写库存流水 / 余额 / 批次，不派生委外应付                                                                                      |
| P1     | 成品抽检合格 -> 成品入库任务                                  | 适合迁入，但与出货任务和库存流水评审有关                                                                                                                  |
| P1     | 成品入库完成 -> 出货任务                                      | 适合迁入，但后续会受库存专表影响                                                                                                                          |
| P1     | 出货完成 -> 应收任务                                          | 适合迁入，但后续会受 AR 专表影响                                                                                                                          |
| P1     | 应收完成 -> 开票任务                                          | 适合迁入，但发票唯一号和异常处理未落专表前保持轻量                                                                                                        |
| P1     | 应付完成 -> 对账任务                                          | 适合迁入，但 AP 专表未落地前仍以任务和业务状态为主                                                                                                        |
| P2     | Dashboard 风险聚合                                            | 暂不迁，继续前端聚合                                                                                                                                      |
| P2     | 移动端扩展可见性                                              | 暂不迁，继续前端解释                                                                                                                                      |
| P2     | 通知/催办升级规则                                             | 催办已在后端，通知中心落表前不扩大范围                                                                                                                    |

## 6. 不建议现在做的后端编排

- 复杂低代码流程设计器。
- 任意自定义流程节点。
- 多租户流程模板。
- 全量 BPMN 引擎。
- 可视化拖拽流程引擎。

## 7. 决策矩阵

| 方案                 | 稳定性 | 维护成本 | 迁移风险 | 结论                               |
| -------------------- | ------ | -------- | -------- | ---------------------------------- |
| 继续全部前端 v1 编排 | 中     | 中到高   | 低       | 短期可维持，但不适合作为长期主路径 |
| 一次性迁完 6 条闭环  | 中     | 高       | 高       | 暂不建议                           |
| 渐进迁入后端 usecase | 高     | 中       | 中       | 推荐                               |
| 引入 BPMN/低代码引擎 | 不确定 | 很高     | 很高     | 不建议                             |

## 8. 推荐结论

当前已经开始迁入后端 workflow usecase，后续仍按渐进式推进：

1. 保持后端 workflow rule 入口简单，不引入 BPMN、流程引擎或低代码 DSL。
2. 已落地的第一条规则继续由后端统一处理老板审批 `done / blocked / rejected`。
3. 已落地的第二条规则继续由后端统一处理 IQC `done / blocked / rejected`。
4. 已落地的第三条规则继续由后端统一处理采购 `warehouse_inbound done / blocked / rejected`，只推进 `inbound_done / blocked` 协同业务状态。
5. 已落地的第四条规则继续由后端统一处理委外 `outsource_return_qc done / blocked / rejected`，只派生委外入库或返工补做任务。
6. 前端保留展示、按钮、toast、刷新和字段口径工具，但不再本地创建同一条老板审批、IQC、采购 `warehouse_inbound` 或委外 `outsource_return_qc` 后端规则覆盖的下游 / 业务状态。
7. 下一条建议迁成品抽检合格 / 异常 -> 成品入库 / 成品返工任务；库存事实入账不要混入 workflow usecase，应单独评审 `InventoryUsecase`。
8. 稳定后再迁成品入库到出货、出货到应收、应付到对账链路。

其余闭环继续前端 v1 编排的边界是：

- 只用于当前已验证的 6 条 v1 主干闭环。
- 不接外部系统直接调用。
- 不承诺强一致任务派生。
- 不做并发高频创建。
- 不把 Dashboard 风险聚合当作后端状态机真源。
- 每次新增下游任务规则都必须同步桌面端、移动端、调试页和测试。

## 9. 迁移风险、回滚和测试要求

| 项目 | 要求                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 幂等 | 老板审批、IQC 和委外回货检验的下游任务派生已按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 做应用层事务内查询后创建；采购 `warehouse_inbound` 规则不创建下游任务，只走 business state upsert；暂未加 DB unique constraint，极端并发下后续仍需 DB unique constraint 或 advisory lock 加固 |
| 事务 | 老板审批、IQC 和委外回货检验规则已在单次状态更新内完成任务状态、事件、业务状态和下游任务创建；采购 `warehouse_inbound` 规则已在单次状态更新内完成任务状态、事件和业务状态 upsert；其余闭环仍待迁                                                                                                                  |
| 权限 | 当前 workflow JSON-RPC 仍要求管理员登录；`actor_role_key` 不是后端授权边界。后续开放非管理员直连时，需要按任务 `owner_role_key / assignee_id` 校验可操作范围                                                                                                                                                      |
| 兼容 | 前端旧入口保留查询和展示能力，逐步改为调用后端统一动作                                                                                                                                                                                                                                                            |
| 回滚 | 若后端规则异常，可回退移动端老板审批 follow-up 到前端 v1 编排；当前没有额外流程引擎状态需要回滚                                                                                                                                                                                                                   |
| 审计 | 所有自动派生任务必须写 `workflow_task_events`，payload 标明派生来源                                                                                                                                                                                                                                               |
| 测试 | 覆盖 done、blocked、rejected、重复点击、并发重复、移动端和桌面端双入口                                                                                                                                                                                                                                            |

当前不是完整 workflow engine，只是四条后端 usecase 最小规则；不要把本文误读为 6 条闭环已全部后端化，也不要据此推断库存 / 财务专表已接入 workflow。采购仓库入库已按方案 A 落地：只推进协同状态；委外回货检验只派生委外入库或返工补做任务。本轮没有写 `inventory_txns`，没有更新 `inventory_balances`，没有创建 `inventory_lots`，没有修改 Ent schema，也没有生成 migration，没有迁委外应付。库存入账必须单独评审 `InventoryUsecase`。
