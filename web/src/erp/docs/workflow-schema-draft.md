# Workflow / Schema 草案

> 适用对象：后端研发、前端研发、实施、产品
> 当前用途：记录任务协同层、业务状态层和首版通用业务记录层 v1 的字段、关系和 SQL 对照，用于继续对齐页面、状态和保存链路。
> 重要约束：当前数据库结构真源是后端 Ent schema 和 Atlas migration；下面 SQL 只用于校对字段和关系，不要直接执行到生产或开发库。

## 1. 设计前提

1. 业务真源仍是 `客户/款式立项`、`材料 BOM`、`辅材/包材采购`、`加工合同/委外下单`、`入库通知/检验/入库`、`生产排单`、`生产进度`、`延期/返工/异常`、`待出货/出货放行`、`出库`、`对账/结算`。
2. `business_records` 是当前首轮通用业务记录真源，用来承接各业务页表格和弹窗保存。
3. `workflow_tasks` 只是协同层，用来表达谁该处理、何时处理、为什么卡住。
4. `workflow_business_states` 只是主链状态快照层，用来表达订单、批次或单据处于哪个业务阶段。
5. 当前已进入 Ent schema v1，仍不把任务表升格为业务真源；后续细分业务专表继续按真实样本逐步拆。

## 2. 当前建议表

| 表名                       | 当前定位           | 为什么需要                                      |
| -------------------------- | ------------------ | ----------------------------------------------- |
| `workflow_tasks`           | 任务协同主表       | 存当前责任人、任务状态、来源单据和完成条件      |
| `workflow_task_events`     | 任务时间轴 / 日志  | 保留状态变化、阻塞原因、退回原因和催办记录      |
| `workflow_business_states` | 业务状态快照       | 按订单 / 批次 / 单据维度挂当前主链状态          |
| `business_records`         | 通用业务记录主表   | 承接当前各业务页表格 / 弹窗保存、软删除和乐观锁 |
| `business_record_items`    | 通用业务记录明细表 | 预留 BOM、采购、合同、出入库等行项目结构        |
| `business_record_events`   | 业务记录事件表     | 保留创建、更新、删除、恢复和状态变化轨迹        |

## 3. 当前 JSON-RPC 接口

当前后端已提供 `POST /rpc/workflow` 和 `POST /rpc/business`，都需要管理员登录态。`workflow` 只操作协同层和状态快照；`business` 操作当前首版通用业务记录真源。

### 3.1 `/rpc/workflow`

| method                  | 当前用途                                            | 关键参数                                                                               |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `metadata`              | 获取任务状态、业务状态和推进阶段字典                | 无                                                                                     |
| `list_tasks`            | 按角色、任务状态或来源单据查询任务池                | `owner_role_key`、`task_status_key`、`source_type`、`source_id`、`limit`、`offset`     |
| `create_task`           | 创建协同任务并写入 `created` 时间轴事件             | `task_code`、`task_group`、`task_name`、`source_type`、`source_id`、`owner_role_key`   |
| `update_task_status`    | 更新任务状态并写入 `status_changed` 时间轴事件      | `id`、`task_status_key`、`business_status_key`、`reason`、`payload`                    |
| `list_business_states`  | 查询业务状态快照                                    | `source_type`、`source_id`、`business_status_key`、`owner_role_key`、`limit`、`offset` |
| `upsert_business_state` | 按 `source_type + source_id` 写入或更新业务状态快照 | `source_type`、`source_id`、`business_status_key`、`owner_role_key`、`payload`         |

### 3.2 `/rpc/business`

| method           | 当前用途                                            | 关键参数                                                                                                               |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `list_records`   | 按模块、状态、角色、关键词和回收站查询业务记录      | `module_key`、`business_status_key`、`owner_role_key`、`keyword`、`include_deleted`、`deleted_only`、`limit`、`offset` |
| `create_record`  | 创建业务记录、可自动生成单据号并写入 `created` 事件 | `module_key`、`title`、`business_status_key`、`owner_role_key`、`payload`、`items`                                     |
| `update_record`  | 更新业务记录、清理被置空字段并写入 `updated` 事件   | `id`、`row_version`、业务字段、`payload`、`items`                                                                      |
| `delete_records` | 软删除业务记录并写入 `deleted` 事件                 | `ids`、`delete_reason`                                                                                                 |
| `restore_record` | 从回收站恢复业务记录并写入 `restored` 事件          | `id`                                                                                                                   |

`include_deleted` 用于兼容需要同时看当前记录和已删记录的查询；桌面业务页回收站使用 `deleted_only`，只返回已移入回收站的记录。

## 4. PostgreSQL SQL 对照

当前已生成的迁移文件是：

- `server/internal/data/model/migrate/20260423081607_migrate.sql`：workflow 协同表和业务状态快照表
- `server/internal/data/model/migrate/20260423090005_migrate.sql`：通用业务记录、明细和事件表

下面保留业务长度和默认值口径，便于阅读和评审；数据库精确 DDL 以迁移文件为准。实际外键策略按 Ent 生成结果保持 `ON DELETE NO ACTION`，避免删除任务或业务记录时误级联清掉历史。

```sql
create table workflow_tasks (
  id bigserial primary key,
  task_code varchar(64) not null unique,
  task_group varchar(32) not null,
  task_name varchar(128) not null,
  source_type varchar(64) not null,
  source_id bigint not null,
  source_no varchar(128),
  business_status_key varchar(64),
  task_status_key varchar(32) not null,
  owner_role_key varchar(32) not null,
  assignee_id bigint,
  priority smallint not null default 0,
  blocked_reason varchar(255),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workflow_tasks_source
  on workflow_tasks (source_type, source_id);

create index idx_workflow_tasks_owner_status
  on workflow_tasks (owner_role_key, task_status_key);

create index idx_workflow_tasks_due_at
  on workflow_tasks (due_at);

create table workflow_task_events (
  id bigserial primary key,
  task_id bigint not null references workflow_tasks(id),
  event_type varchar(32) not null,
  from_status_key varchar(32),
  to_status_key varchar(32),
  actor_role_key varchar(32),
  actor_id bigint,
  reason varchar(255),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_workflow_task_events_task_id
  on workflow_task_events (task_id, created_at desc);

create table workflow_business_states (
  id bigserial primary key,
  source_type varchar(64) not null,
  source_id bigint not null,
  source_no varchar(128),
  order_id bigint,
  batch_id bigint,
  business_status_key varchar(64) not null,
  owner_role_key varchar(32),
  blocked_reason varchar(255),
  status_changed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index idx_workflow_business_states_status
  on workflow_business_states (business_status_key);

create index idx_workflow_business_states_order_batch
  on workflow_business_states (order_id, batch_id);

create table business_records (
  id bigserial primary key,
  module_key varchar(64) not null,
  document_no varchar(128),
  title varchar(255) not null,
  business_status_key varchar(64) not null,
  owner_role_key varchar(32) not null,
  source_no varchar(128),
  customer_name varchar(255),
  supplier_name varchar(255),
  style_no varchar(128),
  product_no varchar(128),
  product_name varchar(255),
  material_name varchar(255),
  warehouse_location varchar(255),
  quantity double precision,
  unit varchar(32),
  amount double precision,
  document_date varchar(32),
  due_date varchar(32),
  payload jsonb not null default '{}'::jsonb,
  row_version bigint not null default 1,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by bigint,
  delete_reason varchar(255)
);

create unique index idx_business_records_module_document_no
  on business_records (module_key, document_no)
  where deleted_at is null and document_no is not null and document_no <> '';

create index idx_business_records_module_status
  on business_records (module_key, business_status_key);

create index idx_business_records_module_owner
  on business_records (module_key, owner_role_key);

create table business_record_items (
  id bigserial primary key,
  record_id bigint not null,
  module_key varchar(64) not null,
  line_no bigint not null default 1,
  item_name varchar(255),
  material_name varchar(255),
  spec varchar(255),
  unit varchar(32),
  quantity double precision,
  unit_price double precision,
  amount double precision,
  supplier_name varchar(255),
  warehouse_location varchar(255),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_business_record_items_record_line
  on business_record_items (record_id, line_no);

create table business_record_events (
  id bigserial primary key,
  record_id bigint,
  module_key varchar(64) not null,
  action_key varchar(32) not null,
  from_status_key varchar(64),
  to_status_key varchar(64),
  actor_id bigint,
  actor_role_key varchar(32),
  note varchar(255),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_business_record_events_record_id
  on business_record_events (record_id);
```

## 5. 字段说明

### 5.1 `workflow_tasks`

| 字段                        | 当前建议含义                                               |
| --------------------------- | ---------------------------------------------------------- |
| `task_group`                | 对应 `T1` 到 `T8` 一级任务组                               |
| `source_type` + `source_id` | 指向业务单据或业务节点，不单独发明第二套真源               |
| `business_status_key`       | 当前任务关联的业务状态，可为空                             |
| `task_status_key`           | 必须来自 `任务 / 业务状态字典` 的任务状态表                |
| `owner_role_key`            | 当前责任角色，如 `merchandiser`、`pmc`、`quality`          |
| `assignee_id`               | 若未来需要精确到人，可后续接到管理员或业务用户体系         |
| `blocked_reason`            | 仅保存当前阻塞摘要；详细历史写进事件表                     |
| `payload`                   | 临时承接催办上下文、页面摘要和兼容字段，避免过早硬拆大量列 |

### 5.2 `workflow_task_events`

| 字段                                | 当前建议含义                                                     |
| ----------------------------------- | ---------------------------------------------------------------- |
| `event_type`                        | 如 `created`、`claimed`、`blocked`、`rejected`、`done`、`closed` |
| `from_status_key` / `to_status_key` | 状态流转轨迹                                                     |
| `reason`                            | 退回、阻塞、取消、关闭原因                                       |
| `payload`                           | 补充记录按钮来源、页面来源、备注快照                             |

### 5.3 `workflow_business_states`

| 字段                        | 当前建议含义                                     |
| --------------------------- | ------------------------------------------------ |
| `source_type` + `source_id` | 当前业务状态挂在哪个业务单据或节点上             |
| `order_id` / `batch_id`     | 便于未来按订单或批次聚合                         |
| `business_status_key`       | 必须来自 `任务 / 业务状态字典` 的业务状态表      |
| `owner_role_key`            | 当前主责角色，便于工作台聚合                     |
| `blocked_reason`            | 当前主链阻塞摘要                                 |
| `payload`                   | 存页面聚合所需的轻量快照，不替代正式业务单据字段 |

### 5.4 `business_records`

| 字段                                          | 当前建议含义                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `module_key`                                  | 当前业务页 key，如 `project-orders`、`material-bom`、`processing-contracts` |
| `document_no`                                 | 当前模块内单据号；为空时后端按模块前缀和 ID 自动生成                        |
| `business_status_key`                         | 必须来自 `任务 / 业务状态字典` 的业务状态表                                 |
| `owner_role_key`                              | 当前主责角色，用于桌面筛选、权限口径和手机端任务池派生                      |
| `source_no`                                   | 上游单据号快照，不替代上游真实记录                                          |
| `payload`                                     | 当前通用层未拆字段和备注，不作为长期复杂业务模型兜底                        |
| `row_version`                                 | 更新时的乐观锁版本；前端编辑旧版本会提示刷新                                |
| `deleted_at` / `deleted_by` / `delete_reason` | 回收站软删除字段，避免误删业务记录                                          |

### 5.5 `business_record_items`

| 字段                                   | 当前建议含义                                                                |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `record_id`                            | 归属业务记录                                                                |
| `line_no`                              | 行号，保存时按有效明细行连续编号，后续用于 BOM 行、采购行、合同行、出入库行 |
| `item_name` / `material_name` / `spec` | 通用行项目字段，细分专表稳定后再拆                                          |
| `quantity` / `unit_price` / `amount`   | 数量、单价和金额快照；行金额为空且已有数量 / 单价时由前端保存转换层派生     |
| `payload`                              | 行级补充快照，不替代正式字段                                                |

### 5.6 `business_record_events`

| 字段                                | 当前建议含义                                               |
| ----------------------------------- | ---------------------------------------------------------- |
| `action_key`                        | `created`、`updated`、`deleted`、`restored` 等业务记录事件 |
| `from_status_key` / `to_status_key` | 业务状态变化轨迹                                           |
| `note`                              | 删除原因或人工说明                                         |
| `payload`                           | 保留按钮来源、页面来源和兼容上下文                         |

## 6. 当前不建议继续扩表的东西

1. 不直接建 `wf_task_relation` 这种泛化关系表，除非真实出现多对多链路需求。
2. 不先把 `due_soon`、`overdue` 做成真字段，建议继续由聚合层计算。
3. 不在当前阶段拆复杂审批流表、自动派单规则表、产能算法表。
4. 不为所有角色提前生成空任务；应按业务条件逐步派生。
5. 不把 `payload` 当成长期垃圾桶；字段稳定后应逐步迁移到细分专表或明确列。

## 7. 后续接通顺序

1. 当前已接通桌面业务页通用保存、业务状态快照、协同任务创建、业务阻塞 / 取消原因必填和手机端任务状态回填。
2. 下一步按真实样本把高价值模块从 `business_records` 拆到细分专表，例如 BOM 行、采购行、合同头 / 行、出入库行。
3. 再补自动派生任务和状态迁移规则，但只按真实前置条件生成任务，不机械生成 8 组空任务。
4. Ent schema 和 Atlas migration 已有 v1；后续变更继续通过 Ent + Atlas 生成。
