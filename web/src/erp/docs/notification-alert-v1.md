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
| `task_urged`              | 任务已催办   |
| `business_status_changed` | 业务状态变化 |
| `approval_required`       | 待审批       |
| `qc_failed`               | 质检不合格   |
| `material_shortage`       | 欠料         |
| `outsource_delay`         | 委外延期     |
| `shipment_risk`           | 出货风险     |
| `finance_pending`         | 财务待处理   |
| `urgent_escalation`       | 紧急升级     |

## 预警类型和等级

| alert_type                       | 默认等级           | 规则                                                                                              |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `due_soon`                       | warning            | 非终态任务距离 `due_at` 小于等于 24 小时                                                          |
| `overdue`                        | critical           | 非终态任务超过 `due_at`                                                                           |
| `blocked`                        | critical           | 任务状态为 `blocked`                                                                              |
| `high_priority`                  | warning            | `priority >= 3`                                                                                   |
| `shipment_due`                   | warning / critical | 出货任务即将到期或已超时；小于等于 1 天按 critical                                                |
| `material_shortage`              | critical           | payload 或阻塞原因明确缺料 / 欠料                                                                 |
| `vendor_delay`                   | warning / critical | 委外延期；已超期按 critical                                                                       |
| `outsource_return_pending`       | warning / critical | 委外发料后等待加工厂回货登记；已超期按 critical                                                   |
| `outsource_return_qc_pending`    | warning / critical | 委外回货后等待品质检验；已超期按 critical                                                         |
| `finished_goods_qc_pending`      | warning / critical | 成品完工后等待品质抽检；已超期按 critical                                                         |
| `finished_goods_inbound_pending` | warning / critical | 成品抽检合格后等待仓库确认成品入库；已超期按 critical                                             |
| `shipment_pending`               | warning / critical | 成品已入库或放行，等待出货准备、装箱、唛头和出货确认；已超期按 critical                           |
| `qc_pending`                     | warning            | 采购到货后等待 IQC 检验                                                                           |
| `qc_failed`                      | critical           | 品质检验结论为不合格                                                                              |
| `inbound_pending`                | warning            | IQC 合格后等待仓库确认入库                                                                        |
| `rework_pending`                 | warning            | 返工要求未闭环                                                                                    |
| `finance_pending`                | warning / critical | 应收登记、开票登记或其他财务任务待处理；标记 `finance_risk=true` 时按 critical                    |
| `invoice_pending`                | warning / critical | 应收登记完成后等待开票登记；已超期按 `finance_overdue` critical                                   |
| `payable_pending`                | warning / critical | 采购 / 委外入库后等待应付登记；已超期按 `finance_overdue` critical                                |
| `reconciliation_pending`         | warning / critical | 应付登记后等待采购 / 委外对账；已超期按 `finance_overdue` critical                                |
| `finance_overdue`                | warning / critical | 财务待处理或已超期；已超期按 critical                                                             |
| `approval_pending`               | warning            | 老板审批或退回待处理                                                                              |
| `urged_task`                     | warning            | 任务已被催办，任务 payload 中存在 `urged=true`、`urge_count` 或 `last_urge_at`                    |
| `urgent_escalation`              | critical           | 任务已升级到 PMC 或老板，任务 payload 中存在 `escalated=true` 或 `last_urge_action=escalate_to_*` |

终态 `done`、`closed`、`cancelled` 不产生 `due_soon` 或 `overdue` 预警。

## 接收人规则

| 来源           | 接收人                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 任务主责       | `owner_role_key` 对应角色池                                                                                                                                                                                                          |
| 指定处理人     | `assignee_id` 对应用户                                                                                                                                                                                                               |
| 创建人         | `created_by`                                                                                                                                                                                                                         |
| 来源单据负责人 | `source_owner`，当前通过 payload 或业务记录负责人补齐                                                                                                                                                                                |
| PMC            | 所有 `blocked`、`rejected`、`overdue`、`critical_path`、已催办、已升级和 critical 预警                                                                                                                                               |
| boss           | `high_priority`、`overdue`、`approval_required`、`shipment_risk`、`finance_overdue`、升级到老板或 critical 财务风险                                                                                                                  |
| finance        | `receivables`、`payables`、`invoices`、`reconciliation`、`receivable_registration`、`invoice_registration`、`purchase_payable_registration`、`outsource_payable_registration`、`purchase_reconciliation`、`outsource_reconciliation` |
| warehouse      | `inbound`、`outbound`、`inventory`、`shipping-release`                                                                                                                                                                               |
| quality        | `quality-inspections`、`qc_failed`、`rework_pending`                                                                                                                                                                                 |
| production     | `production` 主责任务、委外回货跟踪、委外返工 / 补做、成品返工                                                                                                                                                                       |
| business       | 出货任务中 `payload.confirm_role_key=business` 的确认线索；本轮不作为默认完成人                                                                                                                                                      |

## 催办与升级

催办不是普通备注，必须记录到 `workflow_task_events`。v1 已接入 `workflow.urge_task`，调用后只写任务事件并更新 `workflow_tasks.payload` 的催办快照，不改变 `task_status_key` 和 `business_status_key`。

| 催办动作           | 事件落点               | 说明                        |
| ------------------ | ---------------------- | --------------------------- |
| `urge_task`        | `workflow_task_events` | 催办当前任务                |
| `urge_role`        | `workflow_task_events` | 催办角色池                  |
| `urge_assignee`    | `workflow_task_events` | 催办指定处理人              |
| `escalate_to_pmc`  | `workflow_task_events` | 升级到 PMC 关注，不代办完成 |
| `escalate_to_boss` | `workflow_task_events` | 升级到老板关注，不代办完成  |

`reason` 必填，事件中保留 `from_status_key`、`to_status_key`、`actor_id`、`actor_role_key`、`reason`、`payload.action` 和创建时间。任务 payload 同步保存 `urged`、`urge_count`、`last_urge_at`、`last_urge_reason`、`last_urge_action`、`last_urge_actor_role_key`；升级动作额外保存 `escalated` 和 `escalate_target_role_key`。

禁止只靠备注、红点或纯前端状态假装已经催办。

升级规则：

1. 任务 `overdue` 通知 `owner_role_key` 角色池和 PMC。
2. `blocked` 超过配置时间通知 PMC。
3. high priority 且 overdue 通知老板。
4. shipment risk 通知业务、仓库、PMC，必要时老板。
5. `qc_failed` 通知品质、生产经理、PMC。
6. `material_shortage` 通知采购、PMC。
7. `finance_overdue` 通知财务，并进入老板关注。
8. 已催办任务进入 PMC 关注。
9. `escalate_to_boss` 进入老板关注。

升级必须有规则，不能所有异常都直接打给老板。

后续只有需要站内未读收件箱、多接收人已读状态、外部推送、消息保留策略、用户级通知偏好、批量通知或通知模板时，才评审独立 `notifications` / `notification_recipients` 表。

## 第二条真实闭环预警

| 场景             | 通知 / 预警                                                     | 接收人                                 |
| ---------------- | --------------------------------------------------------------- | -------------------------------------- |
| 采购到货发起 IQC | `notification_type=task_created`、`alert_type=qc_pending`       | quality；PMC 可通过 critical_path 关注 |
| IQC 合格待入库   | `notification_type=task_created`、`alert_type=inbound_pending`  | warehouse                              |
| IQC 不合格       | `notification_type=qc_failed`、`alert_type=qc_failed`、critical | purchasing、PMC；品质保留检验事实      |
| 仓库入库超时     | `task_due_soon` / `task_overdue`                                | warehouse、PMC                         |

当前 v1 不建立独立 notifications 表，不推送外部渠道；提醒仍由 `workflow_tasks`、`workflow_task_events`、`workflow_business_states` 和前端计算共同形成。

## 第三条真实闭环预警

| 场景                   | 通知 / 预警                                                                | 接收人                                    |
| ---------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| 委外发料后待回货       | `notification_type=task_created`、`alert_type=outsource_return_pending`    | production；PMC 可通过 critical_path 关注 |
| 委外回货后待检验       | `notification_type=task_created`、`alert_type=outsource_return_qc_pending` | quality；PMC 可通过 critical_path 关注    |
| 委外回货检验合格待入库 | `notification_type=task_created`、`alert_type=inbound_pending`             | warehouse                                 |
| 委外回货检验不合格     | `notification_type=qc_failed`、`alert_type=qc_failed`、critical            | production、PMC；品质保留检验事实         |
| 委外回货或入库超时     | `task_due_soon` / `task_overdue`，或 `vendor_delay` / `outsource_delay`    | owner_role_key 对应角色、PMC              |

当前不新增 `outsource` 移动端入口，委外回货跟踪和返工 / 补做先由 production 移动端承接。PMC、boss、production 移动端会按 `limit=200` 拉取任务池后由前端可见性规则过滤；quality、warehouse、finance、purchasing 继续按 `owner_role_key` 直查。不新增后端复合查询 API。

## 第四条真实闭环预警

| 场景                   | 通知 / 预警                                                                   | 接收人                                               |
| ---------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| 成品完工后待抽检       | `notification_type=task_created`、`alert_type=finished_goods_qc_pending`      | quality；PMC 可通过 critical_path 关注               |
| 成品抽检合格待入库     | `notification_type=task_created`、`alert_type=finished_goods_inbound_pending` | warehouse；PMC 可通过 critical_path 关注             |
| 成品抽检不合格 / 返工  | `notification_type=qc_failed`、`alert_type=qc_failed`、critical               | production、PMC；品质保留检验事实                    |
| 成品入库后待出货       | `notification_type=task_created`、`alert_type=shipment_pending`               | warehouse；业务通过 `confirm_role_key=business` 关注 |
| 出货准备或出货确认超时 | `task_due_soon` / `task_overdue`，或 `shipment_due` / `shipment_risk`         | warehouse、business、PMC，必要时 boss                |

第四条闭环只负责把出货任务推进到 `shipped`。第五条闭环承接 `shipped` 后的应收登记和开票登记；仍不新增 `production_order`、`shipment_order`、`inventory_txn`、`inventory_balance` 专表。`shipment_release` 先由 warehouse 移动端完成出货准备 / 出货执行确认，后续再评审是否拆业务确认任务。

## 第五条真实闭环预警

| 场景                 | 通知 / 预警                                                                             | 接收人                                       |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| 出货完成后待应收登记 | `notification_type=finance_pending`、`alert_type=finance_pending`、`critical_path=true` | finance；PMC 可通过 critical_path 关注       |
| 应收登记完成后待开票 | `notification_type=finance_pending`、`alert_type=invoice_pending`                       | finance                                      |
| 应收或开票超时       | `notification_type=finance_pending`、`alert_type=finance_overdue`、critical             | finance、PMC；老板可作为关注项               |
| 财务任务阻塞 / 退回  | `task_blocked` / `task_rejected`，并记录 `blocked_reason`                               | finance、PMC；高优先级或 critical 时老板关注 |

当前 v1 不新增 notifications 表，不推送外部渠道，不自动生成真实发票文件。PMC 和老板只能看到财务风险或关注项，不能代替 finance 完成 `receivable_registration` 或 `invoice_registration`。

## 第六条真实闭环预警

| 场景                      | 通知 / 预警                                                                 | 接收人                                       |
| ------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| 采购入库后待应付登记      | `notification_type=finance_pending`、`alert_type=payable_pending`           | finance                                      |
| 委外入库后待应付登记      | `notification_type=finance_pending`、`alert_type=payable_pending`           | finance                                      |
| 应付登记完成后待对账      | `notification_type=finance_pending`、`alert_type=reconciliation_pending`    | finance                                      |
| 应付或对账超时            | `notification_type=finance_pending`、`alert_type=finance_overdue`、critical | finance、PMC；老板可作为关注项               |
| 应付 / 对账任务阻塞或退回 | `task_blocked` / `task_rejected`，并记录 `blocked_reason`                   | finance、PMC；高优先级或 critical 时老板关注 |

当前 v1 不新增 notifications 表，不推送外部渠道，不生成付款流水或凭证。PMC 和老板只能看到财务风险或关注项，不能代替 finance 完成 `purchase_payable_registration`、`outsource_payable_registration`、`purchase_reconciliation` 或 `outsource_reconciliation`。

## 页面落点

- 任务看板：待处理、处理中、阻塞、退回、超时、即将到期和已完成任务。
- 业务看板：今日预警、出货风险、欠料、委外延期、质检不良、财务待处理、开票待登记、待老板审批、计划物控关注事项。
- 业务页：当前模块关联的 blocked / overdue / due_soon 提示；品质、仓库、出货、财务模块显示对应风险。
- 移动端：顶部显示我的预警、已超时、即将超时、阻塞、高优先级；任务卡显示 alert_level、alert_label、due_status 和催办状态。

移动端 v1 的主请求策略按角色分层：quality、warehouse、finance、purchasing 继续按 `owner_role_key` 直查；PMC、老板、生产端和业务端为了承接跨角色风险池、委外回货、成品返工、出货确认线索和财务关注项，先按 `limit=200` 拉取任务池，再由 `mobileTaskView` 过滤 blocked、rejected、overdue、critical_path、high priority、`confirm_role_key`、critical 财务项和对应角色任务。不新增后端 API。
