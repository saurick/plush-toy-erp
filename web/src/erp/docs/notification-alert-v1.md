# 通知 / 预警 / 催办 / 升级 v1

## 目标

通知和预警用于减少状态沟通，不替代业务事实。预警来自任务状态、业务状态、截止时间、优先级和 payload 中明确的风险标记。

v1 只做系统内通知和页面预警：桌面 Dashboard 预警区、桌面业务页顶部预警条、移动端任务页预警区、移动端任务卡红 / 黄标识、帮助中心说明。不做短信、邮件、企业微信、飞书、Telegram、App Push 或 WebSocket 实时推送。

## 通知类型

| notification_type         | 含义         |
| ------------------------- | ------------ |
| `task_created`            | 任务创建     |
| `task_assigned`           | 任务分派     |
| `task_due_soon`           | 即将超时     |
| `task_overdue`            | 已超时       |
| `task_blocked`            | 任务阻塞     |
| `task_unblocked`          | 阻塞解除     |
| `task_rejected`           | 任务退回     |
| `task_completed`          | 任务完成     |
| `business_status_changed` | 业务状态变化 |
| `approval_required`       | 待审批       |
| `qc_failed`               | 质检不合格   |
| `material_shortage`       | 欠料         |
| `outsource_delay`         | 委外延期     |
| `shipment_risk`           | 出货风险     |
| `finance_pending`         | 财务待处理   |
| `urgent_escalation`       | 紧急升级     |

## 预警类型和等级

| alert_type          | 默认等级           | 规则                                               |
| ------------------- | ------------------ | -------------------------------------------------- |
| `due_soon`          | warning            | 非终态任务距离 `due_at` 小于等于 24 小时           |
| `overdue`           | critical           | 非终态任务超过 `due_at`                            |
| `blocked`           | critical           | 任务状态为 `blocked`                               |
| `high_priority`     | warning            | `priority >= 3`                                    |
| `shipment_due`      | warning / critical | 出货任务即将到期或已超时；小于等于 1 天按 critical |
| `material_shortage` | critical           | payload 或阻塞原因明确缺料 / 欠料                  |
| `vendor_delay`      | warning / critical | 委外延期；已超期按 critical                        |
| `qc_pending`        | warning            | 采购到货后等待 IQC 检验                            |
| `qc_failed`         | critical           | 品质检验结论为不合格                               |
| `inbound_pending`   | warning            | IQC 合格后等待仓库确认入库                         |
| `rework_pending`    | warning            | 返工要求未闭环                                     |
| `finance_overdue`   | warning / critical | 财务待处理或已超期；已超期按 critical              |
| `approval_pending`  | warning            | 老板审批或退回待处理                               |

终态 `done`、`closed`、`cancelled` 不产生 `due_soon` 或 `overdue` 预警。

## 接收人规则

| 来源           | 接收人                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| 任务主责       | `owner_role_key` 对应角色池                                                |
| 指定处理人     | `assignee_id` 对应用户                                                     |
| 创建人         | `created_by`                                                               |
| 来源单据负责人 | `source_owner`，当前通过 payload 或业务记录负责人补齐                      |
| PMC            | 所有 `blocked`、`overdue`、`critical_path` 和 critical 预警                |
| boss           | `high_priority`、`approval_required`、`shipment_risk`、严重 `finance_risk` |
| finance        | `receivables`、`payables`、`invoices`、`reconciliation`                    |
| warehouse      | `inbound`、`outbound`、`inventory`、`shipping-release`                     |
| quality        | `quality-inspections`、`qc_failed`、`rework_pending`                       |

## 催办与升级

催办不是普通备注，必须记录到 `workflow_task_events`。动作包括 `urge_task`、`urge_role`、`urge_assignee`、`escalate_to_pmc`、`escalate_to_boss`。

如果当前 API 还没有催办方法，页面按钮只能显示 disabled，并标注“催办 API 待接入”。禁止只靠备注、红点或前端状态假装已经催办。

升级规则：

1. 任务 `overdue` 通知 `owner_role_key` 角色池和 PMC。
2. `blocked` 超过配置时间通知 PMC。
3. high priority 且 overdue 通知老板。
4. shipment risk 通知业务、仓库、PMC，必要时老板。
5. `qc_failed` 通知品质、生产经理、PMC。
6. `material_shortage` 通知采购、PMC。
7. `finance_overdue` 通知财务，并进入老板关注。

升级必须有规则，不能所有异常都直接打给老板。

## 第二条真实闭环预警

| 场景             | 通知 / 预警                                                     | 接收人                                 |
| ---------------- | --------------------------------------------------------------- | -------------------------------------- |
| 采购到货发起 IQC | `notification_type=task_created`、`alert_type=qc_pending`       | quality；PMC 可通过 critical_path 关注 |
| IQC 合格待入库   | `notification_type=task_created`、`alert_type=inbound_pending`  | warehouse                              |
| IQC 不合格       | `notification_type=qc_failed`、`alert_type=qc_failed`、critical | purchasing、PMC；品质保留检验事实      |
| 仓库入库超时     | `task_due_soon` / `task_overdue`                                | warehouse、PMC                         |

当前 v1 不建立独立 notifications 表，不推送外部渠道；提醒仍由 `workflow_tasks`、`workflow_task_events`、`workflow_business_states` 和前端计算共同形成。

## 页面落点

- Dashboard：今日预警、超时、阻塞、出货风险、欠料、委外延期、质检不良、财务待处理、待老板审批、PMC 关注事项。
- 业务页：当前模块关联的 blocked / overdue / due_soon 提示；品质、仓库、出货、财务模块显示对应风险。
- 移动端：顶部显示我的预警、已超时、即将超时、阻塞、高优先级；任务卡显示 alert_level、alert_label、due_status 和催办状态。

移动端 v1 的主请求仍按 `owner_role_key` 拉取当前角色任务，避免绕过现有后端筛选和既有登录路由烟测。PMC / 老板跨角色风险池先在 Dashboard 和前端视图规则中沉淀口径；如要在移动端直接聚合跨角色 blocked / overdue / high priority，需要后续补后端复合查询 API。
