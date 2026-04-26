# 日志 / 审计 / Trace v1

## 分层

| 类型 | 真源 | 用途 |
| --- | --- | --- |
| 业务记录事件 | `business_record_events` | 记录业务记录创建、编辑、删除、恢复等事实变化 |
| 任务状态事件 | `workflow_task_events` | 记录任务创建、状态流转、阻塞、完成、退回和后续催办 |
| 业务状态快照 | `workflow_business_states` | 保存来源单据当前业务状态、负责人和阻塞原因 |
| 服务日志 | 结构化日志 | 排查接口、服务和外部依赖问题 |
| trace / request_id | 请求链路上下文 | 串联一次请求经过的服务调用和错误定位 |

## 关键原则

- 操作日志不是备注。备注可以描述业务背景，操作日志必须描述谁在什么时候做了什么动作。
- 审计日志不允许普通编辑删除；更正只能追加新事件或走受控恢复 / 作废动作。
- `trace_id` / `request_id` 用于排查请求链路，业务审计不能依赖 trace 是否存在。
- 移动端处理任务必须留下 `workflow_task_events`。
- 业务记录创建、编辑、删除、恢复必须留下 `business_record_events`。
- 角色绑定、角色权限变更、打印带值打开应记录或预留审计入口。

## 当前事件口径

| 动作 | 事件表 | 说明 |
| --- | --- | --- |
| 新建业务记录 | `business_record_events` | 记录模块、记录 ID、操作者和 payload |
| 编辑业务记录 | `business_record_events` | 记录更新事件和业务状态变化说明 |
| 删除 / 恢复业务记录 | `business_record_events` | 删除进入回收站，恢复追加事件 |
| 创建协同任务 | `workflow_task_events` | 当前事件类型为创建类事件 |
| 任务处理 / 阻塞 / 完成 / 退回 | `workflow_task_events` | 记录 from / to 状态、原因、角色和 payload |
| 催办 / 升级任务 | `workflow_task_events` | 事件类型为 `urge_task`、`urge_role`、`urge_assignee`、`escalate_to_pmc` 或 `escalate_to_boss`，from / to 状态保持一致 |
| 业务状态快照更新 | `workflow_business_states` | 保存当前状态，不替代事件流水 |

## 催办与升级审计口径

| 字段 | 记录要求 |
| --- | --- |
| `event_type` | 使用实际动作：`urge_task`、`urge_role`、`urge_assignee`、`escalate_to_pmc`、`escalate_to_boss` |
| `from_status_key` / `to_status_key` | 催办不改变任务状态，两者记录为当前任务状态 |
| `actor_id` / `actor_role_key` | 记录发起催办或升级的人和角色 |
| `reason` | 必填，说明催办或升级原因 |
| `payload.action` | 与 `event_type` 保持一致，便于审计查询 |
| `workflow_tasks.payload` | 保存 `urged`、`urge_count`、`last_urge_at`、`last_urge_reason`、`last_urge_action`、`last_urge_actor_role_key`；升级时额外保存 `escalated`、`escalate_target_role_key` |

催办不是备注，也不代表业务事实完成。PMC 或老板通过催办 / 升级获得关注权，不获得代替生产、品质、仓库或财务完成任务的权限。

## 第五条闭环审计口径

| 财务链路动作 | 审计要求 |
| --- | --- |
| 出货完成后创建应收登记任务 | 写 `workflow_task_events` 创建事件，任务 payload 保留 `shipment_task_id`、`next_module_key=receivables` 和应收相关字段快照。 |
| 财务完成应收登记 | 写任务完成事件，`workflow_business_states` 进入或保持 `reconciling`，并创建 `invoice_registration`。 |
| 财务完成开票登记 | 写任务完成事件，业务状态保持 `reconciling`，交给后续对账链路；当前不生成真实发票文件。 |
| 应收 / 开票阻塞或退回 | 写任务状态事件和 `blocked_reason`，Dashboard、PMC、老板视角通过 `finance_pending` / `finance_overdue` 预警追踪。 |

当前不新增财务审计专表，不写总账、凭证、纳税申报或真实发票文件生成日志；这些能力需要在评审 `ar_receivable` / `ar_invoice` / `settlement` schema 后再扩展。

## 第六条闭环审计口径

| 财务链路动作 | 审计要求 |
| --- | --- |
| 采购 / 委外入库完成后创建应付登记任务 | 写 `workflow_task_events` 创建事件，任务 payload 保留入库任务 ID、`next_module_key=payables`、`payable_type=purchase/outsource` 和供应商 / 加工厂、数量、金额字段快照。 |
| 财务完成应付登记 | 写任务完成事件，`workflow_business_states` 进入 `reconciling`，并创建 `purchase_reconciliation` 或 `outsource_reconciliation`。 |
| 财务完成采购 / 委外对账 | 写任务完成事件，业务状态进入 `settled`，表示成本侧财务闭环完成；当前不生成凭证或付款流水。 |
| 应付 / 对账阻塞或退回 | 写任务状态事件和 `blocked_reason`，Dashboard、PMC、老板视角通过 `payable_pending` / `reconciliation_pending` / `finance_overdue` 预警追踪。 |

当前不新增财务审计专表，不写总账、凭证、付款流水或纳税申报日志；这些能力需要在评审 `ap_payable` / `ap_settlement` / `settlement` schema 后再扩展。

## 可观测性要求

- 服务端日志优先结构化字段，禁止输出密码、密钥、完整 token 等敏感明文。
- 关键链路应保留 request_id 或 trace_id，方便从页面报错追到服务日志。
- `/healthz` 和 `/readyz` 继续作为基础健康检查；`/readyz` 默认只检查 PostgreSQL 这种硬依赖。
- 业务审计查询应优先按业务单据、任务 ID、来源单号和操作者定位，不依赖分布式 trace 是否完整。

## 后续预留

- 若后续需要站内未读收件箱、多接收人已读状态、外部推送、消息保留策略、用户级通知偏好、批量通知或通知模板，再评审独立 notifications 表。
- 权限管理页后续如支持批量授权，应记录角色绑定和角色权限变更前后摘要。
- 打印带值打开后续如要求留痕，应记录模板 key、来源模块、来源记录 ID 和操作者。
