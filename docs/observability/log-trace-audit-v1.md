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
- 权限变更、菜单权限变更、打印带值打开应记录或预留审计入口。

## 当前事件口径

| 动作 | 事件表 | 说明 |
| --- | --- | --- |
| 新建业务记录 | `business_record_events` | 记录模块、记录 ID、操作者和 payload |
| 编辑业务记录 | `business_record_events` | 记录更新事件和业务状态变化说明 |
| 删除 / 恢复业务记录 | `business_record_events` | 删除进入回收站，恢复追加事件 |
| 创建协同任务 | `workflow_task_events` | 当前事件类型为创建类事件 |
| 任务处理 / 阻塞 / 完成 / 退回 | `workflow_task_events` | 记录 from / to 状态、原因、角色和 payload |
| 业务状态快照更新 | `workflow_business_states` | 保存当前状态，不替代事件流水 |

## 可观测性要求

- 服务端日志优先结构化字段，禁止输出密码、密钥、完整 token 等敏感明文。
- 关键链路应保留 request_id 或 trace_id，方便从页面报错追到服务日志。
- `/healthz` 和 `/readyz` 继续作为基础健康检查；`/readyz` 默认只检查 PostgreSQL 这种硬依赖。
- 业务审计查询应优先按业务单据、任务 ID、来源单号和操作者定位，不依赖分布式 trace 是否完整。

## 后续预留

- 催办 API 接入后，`urge_task`、`urge_role`、`urge_assignee`、`escalate_to_pmc`、`escalate_to_boss` 必须写入 `workflow_task_events`。
- 权限管理页后续如支持批量授权，应记录菜单权限变更前后摘要。
- 打印带值打开后续如要求留痕，应记录模板 key、来源模块、来源记录 ID 和操作者。
