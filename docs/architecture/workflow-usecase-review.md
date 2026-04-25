# Workflow Usecase 统一编排评审

> 结论：建议下一轮开始做“后端 workflow usecase 渐进迁入”，但不建议一次性重写 6 条闭环，也不引入复杂流程引擎。第一步应选择一条最小链路试迁，例如“老板审批通过 -> 工程资料任务”，同时保留前端 v1 编排作为兼容入口，直到后端规则、幂等和测试稳定。

## 1. 当前审计结论

当前 6 条业务闭环已经跑通，主路径仍是“前端 v1 编排 + 后端保存任务、事件和业务状态”。

| 层级 | 当前事实 |
| --- | --- |
| 前端工具函数 | `orderApprovalFlow.mjs`、`purchaseInboundFlow.mjs`、`outsourceReturnFlow.mjs`、`finishedGoodsFlow.mjs`、`shipmentFinanceFlow.mjs`、`payableReconciliationFlow.mjs` 负责构造下游任务 payload、任务组、角色、截止时间和下一步业务状态 |
| 桌面业务页 | `BusinessModulePage.jsx` 负责手动发起审批、IQC、委外回货、成品抽检、应收、开票、应付和对账等任务，并同步 `workflow_business_states` |
| 移动端任务页 | `MobileRoleTasksPage.jsx` 在 `update_task_status` 之后继续按任务类型创建下游任务，补写业务状态，并处理通过、退回、阻塞、入库、出货、财务登记和对账完成等动作 |
| 后端 workflow usecase | `server/internal/biz/workflow.go` 校验任务状态、业务状态、催办动作和基础参数，然后调用 repo |
| 后端 repo | `workflow_repo.go` 在事务内创建任务和 `created` 事件，更新任务状态和 `status_changed` 事件，催办和升级写 `workflow_task_events`，业务状态 upsert 仍是单独写入 |
| JSON-RPC API | `create_task`、`update_task_status`、`upsert_business_state`、`urge_task` 等是当前稳定接口 |
| 通知中心 | v1 通过任务 payload、Dashboard 聚合和移动端可见性表达通知/预警；当前没有 `notifications` 独立表 |

## 2. 哪些流程由前端工具函数编排

| 闭环 | 前端编排位置 | 当前下游任务 |
| --- | --- | --- |
| 订单提交 -> 老板审批 -> 工程资料任务 | `orderApprovalFlow.mjs`、`BusinessModulePage.jsx`、`MobileRoleTasksPage.jsx` | 老板审批、工程资料、订单资料补充 |
| 采购到货 -> IQC -> 入库 | `purchaseInboundFlow.mjs`、桌面和移动端动作 | IQC、仓库入库、来料不良处理 |
| 委外发料 -> 回货 -> 检验 -> 入库 | `outsourceReturnFlow.mjs`、桌面和移动端动作 | 委外回货跟踪、回货检验、委外入库、委外返工 |
| 成品完工 -> 成品抽检 -> 成品入库 -> 出货 | `finishedGoodsFlow.mjs`、桌面和移动端动作 | 成品抽检、成品入库、成品返工、出货放行 |
| 出货 -> 应收登记 -> 开票登记 | `shipmentFinanceFlow.mjs`、桌面和移动端动作 | 应收登记、开票登记、财务阻塞状态 |
| 采购/委外 -> 应付登记 -> 对账 | `payableReconciliationFlow.mjs`、桌面和移动端动作 | 采购应付、委外应付、采购对账、委外对账、财务阻塞状态 |

## 3. 哪些状态和事件由后端保证

后端当前已经保证：

- `task_status_key` 必须在后端状态字典内。
- `business_status_key` 如果传入，必须在后端业务状态字典内。
- `create_task` 写入 `workflow_tasks`，并写 `workflow_task_events.event_type = created`。
- `update_task_status` 写入状态、开始/完成/关闭时间、阻塞原因，并写 `workflow_task_events.event_type = status_changed`。
- `urge_task` 校验催办/升级动作，更新任务 payload 中的催办、升级和预警字段，并写对应 `workflow_task_events`。
- `upsert_business_state` 按 `source_type + source_id` 更新 `workflow_business_states`。

后端当前还没有保证：

- `update_task_status(done)` 后必须创建哪一个下游任务。
- `blocked` 或 `rejected` 后必须创建哪一个异常任务。
- 同一来源同一任务组的幂等创建。
- `task + event + business_state + downstream_task` 的完整事务一致性。
- 桌面端、移动端、API 多入口触发同一规则时的一致结果。

## 4. 哪些移动端动作会触发下游任务

| 移动端动作 | 当前后续动作 |
| --- | --- |
| 老板审批任务 done | 更新订单为 `project_approved`，生成工程资料任务 |
| 老板审批 blocked/rejected | 更新阻塞或待审批状态，生成订单资料补充任务 |
| IQC done | 更新为 `warehouse_inbound_pending`，生成仓库入库任务 |
| IQC blocked/rejected | 更新为 `qc_failed`，生成来料不良处理任务 |
| 仓库入库 done | 更新为 `inbound_done`，采购链路生成应付登记任务 |
| 委外回货跟踪 done | 更新为 `qc_pending`，生成委外回货检验任务 |
| 委外回货检验 done | 更新为 `warehouse_inbound_pending`，生成委外入库任务 |
| 委外回货检验 blocked/rejected | 更新为 `qc_failed`，生成委外返工任务 |
| 委外入库 done | 更新为 `inbound_done`，生成委外应付登记任务 |
| 成品抽检 done | 更新为 `warehouse_inbound_pending`，生成成品入库任务 |
| 成品抽检 blocked/rejected | 更新为 `qc_failed`，生成成品返工任务 |
| 成品入库 done | 更新为 `inbound_done`，生成出货放行任务 |
| 出货放行 done | 更新为 `shipped`，生成应收登记任务 |
| 应收登记 done | 更新为 `reconciling`，生成开票登记任务 |
| 应付登记 done | 更新为 `reconciling`，生成对账任务 |
| 对账 done | 更新为 `settled` |
| 任意风险任务催办/升级 | 调用后端 `urge_task`，后端写任务 payload 和 `workflow_task_events` |

## 5. 当前前后端边界的优点

- 开发速度快，适合 v1 快速验证 6 条主干闭环。
- 不需要立刻冻结所有业务字段和行业专表。
- 前端按钮、帮助中心、调试页和移动端验收可以快速同步。
- 后端表结构稳定，当前只需要承接任务、事件和业务状态。
- 迁移风险低，旧数据继续通过 `business_records` 和 `workflow_tasks` 可查。

## 6. 当前前后端边界的风险

- 流程规则分散在多个前端文件，后端无法单独保证完整业务状态机。
- 桌面端、移动端和未来 API 入口可能触发不同下游任务。
- 下游任务创建依赖前端执行顺序，网络中断时可能出现任务已完成但下游任务未创建。
- 幂等主要靠前端查询和判断，无法抵御并发入口重复创建。
- `workflow_business_states` 与任务事件不是所有链路都在同一后端事务内完成。
- 后续外部系统或批处理如果直接调后端 API，无法复用当前前端编排规则。

## 7. 哪些流程适合继续前端编排

| 类型 | 继续前端编排原因 |
| --- | --- |
| UI 辅助动作 | 例如按钮是否显示、默认表单值、调试查询条件，属于页面体验逻辑 |
| 调试/验收场景 | 业务链路调试、协同任务调试和帮助中心入口仍应保持只读或辅助性质 |
| 非关键链路 | 不影响库存、财务、审批责任和审计闭环的提示类动作可以留在前端 |
| 频繁调整流程 | 仍在确认字段、角色或操作口径的流程不宜过早固化到后端 |
| 页面展示逻辑 | Dashboard 风险标签、移动端可见性解释、下一步按钮文案可以继续前端计算 |

边界：前端可以决定“显示什么”和“建议做什么”，但不宜长期决定“任务完成后系统必须创建什么事实”。

## 8. 哪些流程适合迁入后端 workflow usecase

满足任意条件时，应迁入后端 usecase：

- 任务完成后必须强一致生成下游任务。
- 同一任务可能被桌面端、移动端、API 或未来外部系统多入口触发。
- 需要防重复创建。
- 需要事务保证 `workflow_tasks + workflow_task_events + workflow_business_states` 一致。
- 需要权限和角色校验。
- 需要审计闭环。
- 需要后续被外部系统调用。

## 9. 迁入后端候选优先级

| 优先级 | 候选 | 评审结论 |
| --- | --- | --- |
| P0 | `update_task_status(done)` 后生成下游任务 | 应优先抽成后端规则入口，但先只接一条具体规则验证幂等和事务边界 |
| P0 | `update_task_status(blocked/rejected)` 后写阻塞状态和异常任务 | 应跟随首条规则验证异常分支，尤其要强制 reason |
| P0 | `urge_task` | 已在后端，继续保留，不迁回前端 |
| P1 | 订单审批通过 -> 工程资料任务 | 最适合作为第一条试迁链路，业务对象少、库存/财务副作用低 |
| P1 | IQC 合格 -> 仓库入库任务 | 适合第二批迁入，但要同时处理不合格异常任务和应付链路后续触发 |
| P1 | 委外回货检验合格 -> 委外入库任务 | 适合与 IQC 类规则复用，但委外返工分支要先定口径 |
| P1 | 成品抽检合格 -> 成品入库任务 | 适合迁入，但与出货任务和库存流水评审有关 |
| P1 | 成品入库完成 -> 出货任务 | 适合迁入，但后续会受库存专表影响 |
| P1 | 出货完成 -> 应收任务 | 适合迁入，但后续会受 AR 专表影响 |
| P1 | 应收完成 -> 开票任务 | 适合迁入，但发票唯一号和异常处理未落专表前保持轻量 |
| P1 | 应付完成 -> 对账任务 | 适合迁入，但 AP 专表未落地前仍以任务和业务状态为主 |
| P2 | Dashboard 风险聚合 | 暂不迁，继续前端聚合即可 |
| P2 | 移动端扩展可见性 | 暂不迁，先保持前端解释能力 |
| P2 | 通知/催办升级规则 | 催办已在后端，通知中心落表前不扩大范围 |

## 10. 不建议现在做的后端编排

- 复杂低代码流程设计器。
- 任意自定义流程节点。
- 多租户流程模板。
- 全量 BPMN 引擎。
- 可视化拖拽流程引擎。

这些能力会显著增加系统复杂度，并且当前 6 条主干闭环还没有行业专表和后端统一 usecase 的稳定基线，不适合现在引入。

## 11. 推荐决策矩阵

| 方案 | 稳定性 | 维护成本 | 迁移风险 | 适配当前阶段 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 继续全部前端 v1 编排 | 中 | 中到高 | 低 | 短期可用 | 可短期维持，但不适合作为长期主路径 |
| 一次性迁完 6 条闭环 | 中 | 高 | 高 | 不适合 | 暂不建议 |
| 渐进迁入后端 usecase | 高 | 中 | 中 | 适合 | 推荐 |
| 引入 BPMN/低代码引擎 | 不确定 | 很高 | 很高 | 不适合 | 不建议 |

## 12. 推荐结论

下一轮建议开始迁入后端 workflow usecase，但只做渐进式试迁：

1. 先在后端定义明确的 workflow rule 入口和幂等策略。
2. 第一条规则选择“老板审批通过 -> 工程资料任务”。
3. 同步覆盖 blocked/rejected 分支，验证异常任务和 `blocked_reason`。
4. 保留前端 v1 入口，但前端调用后端统一动作，不再自己创建同一条下游任务。
5. 稳定后再迁 IQC、委外、成品、出货、财务链路。

如果下一轮暂不迁，继续前端 v1 编排的边界是：

- 只用于当前已验证的 6 条 v1 主干闭环。
- 不接外部系统直接调用。
- 不承诺强一致任务派生。
- 不做并发高频创建。
- 不把 Dashboard 风险聚合当作后端状态机真源。
- 每次新增下游任务规则都必须同步桌面端、移动端、调试页和测试。

## 13. 迁移风险、回滚和测试要求

| 项目 | 要求 |
| --- | --- |
| 幂等 | 后端按 `source_type + source_id + task_group + active status` 或稳定业务 key 防重复 |
| 事务 | 单次状态更新内完成任务状态、事件、业务状态和下游任务创建 |
| 兼容 | 前端旧入口保留查询和展示能力，逐步改为调用后端统一动作 |
| 回滚 | 若后端规则异常，可关闭新规则开关，恢复前端 v1 编排 |
| 审计 | 所有自动派生任务必须写 `workflow_task_events`，payload 标明派生来源 |
| 测试 | 覆盖 done、blocked、rejected、重复点击、并发重复、移动端和桌面端双入口 |

本轮仅评审，不改后端 usecase 行为。
