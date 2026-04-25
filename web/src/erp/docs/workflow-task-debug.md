# 协同任务调试

> 目的：排查 `workflow_tasks`、`workflow_task_events`、角色任务池和移动端可见性问题。`/erp/qa/workflow-task-debug` 是只读诊断页，不提供修复按钮，不直接改数据。

## 1. 和业务链路调试的区别

| 入口         | 关注点                                                                                                                                                               | 适合问题                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 业务链路调试 | 一条业务主线是否走通，`business_records` 和 `workflow_business_states` 是否推进，下游任务是否生成；开发验收环境可受控 seed（生成调试数据）和 cleanup（清理调试数据） | 单据为什么没推进、业务状态为什么没同步、上下游链路是否断开                         |
| 协同任务调试 | 任务是否进入正确角色池，移动端是否应该看到，任务事件是否留痕                                                                                                         | 某角色看不到任务、`owner_role_key` 写错、`task_group` 不匹配、终态任务是否还应显示 |

如果链路走不通，先看业务链路调试；需要复现场景时先在业务链路调试页拿到 debugRunId（本次调试编号）。如果业务记录和任务都存在，但角色移动端看不到，再进入协同任务调试。

## 2. 当前 v1 查询模式

- 页面默认调用 `listWorkflowTasks({ limit: 200 })` 读取最近 200 条任务。
- 筛选条件在前端完成，当前不新增后端 API。
- 当前 workflow API 没有按 `task_id` 查询 `workflow_task_events` 的接口；事件轨迹如果 `list_tasks` 没有返回 `events`，页面会显示“任务事件接口待接入”。
- 真实排查事件留痕时，仍应核对 `workflow_task_events` 表中的状态变化、催办、升级、阻塞和完成记录。
- 当前下游任务多数仍由桌面端或移动端动作创建；如果未来后端 workflow usecase 统一编排落地，任务来源可能从“前端动作创建”变成“后端状态更新自动派生”。
- 后端统一编排落地后，排查重复任务时要先看后端幂等规则和 `workflow_task_events` 派生事件，再看前端按钮是否重复调用。

当前支持筛选：

| 筛选   | 说明                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| 关键词 | 匹配 `source_no`、`task_name`、`task_group`、`source_type`、`task_code`                |
| 来源   | `source_type`、`source_no`                                                             |
| 任务   | `task_group`、`task_status_key`、`business_status_key`                                 |
| 角色   | `owner_role_key`、`assignee_id`                                                        |
| 风险   | `priority`、`alert_level`、blocked、overdue、critical_path、urged、escalated、terminal |

## 3. 业务、任务、角色怎么绑定

| 对象       | 字段                                  | 表                         | 说明                                   |
| ---------- | ------------------------------------- | -------------------------- | -------------------------------------- |
| 业务单据   | `source_type + source_id + source_no` | `business_records`         | 表示任务来自哪张业务单据或来源记录     |
| 业务状态   | `business_status_key`                 | `workflow_business_states` | 表示业务主线推进到哪个状态             |
| 协同任务   | `task_group + task_status_key`        | `workflow_tasks`           | 表示协同层要做什么、当前进度是什么     |
| 角色池     | `owner_role_key`                      | `workflow_tasks`           | 决定任务进入哪个角色池                 |
| 具体处理人 | `assignee_id`                         | `workflow_tasks`           | 可选字段，不是每个任务都有             |
| 事件留痕   | `workflow_task_events`                | `workflow_task_events`     | 记录创建、处理、阻塞、完成、催办和升级 |

关键边界：

- `menu_permissions` 只管桌面菜单可见。
- `owner_role_key` 决定任务池。
- `assignee_id` 决定具体人。
- PMC 可以看风险和卡点，但不能代办事实。
- boss 可以看高优先级和升级关注，但不能代办财务、品质、仓库事实。

## 4. 排查移动端为什么看不到任务

1. 先确认任务是否在最近 200 条 `listWorkflowTasks` 返回结果里。
2. 看 `mobileTaskQueries`：PMC、boss、production、merchandiser 使用全量加载后过滤；quality、warehouse、finance、purchasing 按 `owner_role_key` 直查。
3. 看 `owner_role_key` 是否等于当前角色。
4. 看 `task_status_key` 是否是 `done`、`cancelled`、`closed` 等终态。
5. 看 `task_group` 是否属于该角色关注范围。
6. 看 `payload.alert_type`、`payload.notification_type`、`payload.critical_path`、`payload.shipment_risk`、`payload.finance_risk`、`payload.outsource_processing`、`payload.finished_goods` 是否满足扩展规则。
7. 看 `workflow_task_events` 是否有创建、阻塞、完成、催办或升级记录，避免只看任务当前快照。

常见不可见原因：

| 原因                    | 判断方式                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `owner_role_key` 不匹配 | 当前角色直查时不会加载该任务                                                                                          |
| 当前角色没有扩展可见性  | 例如 purchasing 当前只看自己的 `owner_role_key`                                                                       |
| 任务已终态              | 终态任务不会进入活跃统计；是否展示按移动端当前规则判断                                                                |
| `task_group` 不匹配     | 生产、品质、仓库等角色的扩展判断依赖任务组或来源                                                                      |
| 风险字段不满足          | boss / PMC 扩展需要 high priority、finance critical、shipment risk、blocked、overdue、critical_path、催办或升级等信号 |
| `source_type` 不匹配    | finance、warehouse、quality 等角色会按来源类型识别部分任务                                                            |
| 任务未加载              | 最近 200 条里没有该任务，或 owner 直查无法命中                                                                        |
| payload 缺字段          | 缺少扩展可见性需要的 alert / notification / critical_path 等字段                                                      |

## 5. 排查任务重复创建

1. 按 `source_type + source_id + task_group` 或 `source_no + task_group` 搜索。
2. 对比重复任务的 `task_code`、`created_at`、`created_by` 和 `payload.related_documents`。
3. 检查业务页是否在保存、流转和“创建协同任务”多个入口重复触发任务创建。
4. 检查任务是否只是历史终态任务加新任务，而不是同一待办重复。
5. 当前页面不做去重修复；确认根因后应回到任务创建主路径修复。

## 6. 排查 owner_role_key 错误

1. 先看 `owner_role_key` 是否符合业务责任角色。
2. 再看 `assignee_id` 是否只是具体处理人，不要把具体人误当成角色池。
3. 如果移动端直查角色看不到，优先确认 `owner_role_key` 是否写错。
4. 如果 PMC / boss / production 能看到，但 owner 角色看不到，说明可能是扩展可见性命中，不代表任务池归属正确。
5. 当前页面不提供“直接改 owner_role_key”能力。

## 7. 排查 task_group 错误

1. 按任务组筛选，确认同一业务来源下是否存在预期任务组。
2. 对照当前 6 条 v1 闭环中的任务组，例如 `order_approval`、`purchase_iqc`、`warehouse_inbound`、`outsource_return_qc`、`finished_goods_qc`、`shipment_release`、`receivable_registration`、`invoice_registration`、`purchase_payable_registration`、`purchase_reconciliation`。
3. 如果 `owner_role_key` 正确但移动端扩展不可见，检查 `task_group` 是否没有进入该角色关注范围。
4. 当前页面只诊断，不提供任务组改写。

## 8. 排查 terminal status 导致不可见

终态任务包括：

- `done`
- `cancelled`
- `closed`

当前移动端会把终态从活跃统计中排除。若角色反馈“任务不在待办里”，先确认是不是已经终态；如果仍需展示历史任务，应单独评审移动端历史视图，而不是在调试页改任务状态。

## 9. 排查扩展可见性

| 角色         | 扩展可见性口径                                                                         |
| ------------ | -------------------------------------------------------------------------------------- |
| PMC          | blocked、rejected、overdue、critical、critical_path、催办、升级、高优先级              |
| boss         | high priority、approval_required、shipment_risk、finance critical、overdue、升级到老板 |
| production   | 委外回货、委外返工、成品返工、生产相关任务                                             |
| finance      | 财务来源、财务通知、财务逾期                                                           |
| quality      | 品质来源、质检失败、品质任务                                                           |
| warehouse    | 仓储来源、仓库任务                                                                     |
| merchandiser | 出货来源、业务确认、跟单主责                                                           |
| purchasing   | 当前按 `owner_role_key` 直查，不额外扩展                                               |

## 10. 当前不做

- 不新增后端 API。
- 不改 workflow 任务创建逻辑。
- 不改 6 条业务闭环。
- 不新增数据库表。
- 不改 Ent schema。
- 不做 migration。
- 不做 SQL 控制台。
- 不做任务强制修复按钮。
- 不提供“直接改 owner_role_key / task_status_key”的危险操作。
- 不把调试页做成生产运维改数据工具。

## 11. 后端统一编排后的排查变化

| 现在                                                                   | 后续后端 usecase 统一编排后                        |
| ---------------------------------------------------------------------- | -------------------------------------------------- |
| 前端调用 `createWorkflowTask` 创建多数下游任务                         | 前端优先调用后端统一状态动作，由后端派生下游任务   |
| 重复任务优先查前端是否重复点击或多个入口创建                           | 重复任务先查后端幂等 key、事务重试和规则开关       |
| `workflow_task_events` 主要记录 created、status_changed、urge/escalate | 需要补充自动派生来源、规则 key 或父任务 id         |
| 业务状态和下游任务可能由前端分步写入                                   | 后端应在同一事务里写任务、事件、业务状态和下游任务 |

调试页仍只做诊断，不因为后端统一编排而提供直接改任务或改业务状态的按钮。
