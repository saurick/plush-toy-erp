# 当前真源与交接顺序

本文档只解决一件事：当前这份仓库到底应该先读哪里，才能避免把历史占位、现场猜测或过期文档误当成真源。

## 真源原则

- 运行时行为的最终真源始终是代码。
- 仓库级约定、部署边界和项目基线，以当前文档为索引，再分流到对应子目录文档。
- 当前部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。
- 当前仓库没有 `lab-ha`、Kubernetes 和 dashboard 主路径；不要按不存在的目录做推断。

## 当前业务保存层真源

- 首版业务落盘真源是后端 Ent schema 和 Atlas migration：`workflow_tasks`、`workflow_task_events`、`workflow_business_states`、`business_records`、`business_record_items`、`business_record_events`。
- 桌面业务页当前走通用 `business_records` 表格 / 弹窗保存，明细行落到 `business_record_items`；行金额为空且已有数量 / 单价时由前端保存转换层派生，表头数量 / 金额为空时按明细合计回写，保存和状态流转都会按单据来源写入 `workflow_business_states`；列表列顺序属于管理员 ERP 偏好，后端真源字段是 `admin_users.erp_preferences.column_orders`，浏览器 localStorage 只作为同步失败或未登录资料加载完成前的兜底。
- `business_records` 是当前首轮通用业务记录真源，不等于所有客户、BOM、采购、库存、生产和财务专表都已经拆完；后续细分专表继续按真实样本和 Ent + Atlas 迁移推进。
- 当前 workflow 编排真源仍是“前端 v1 编排 + 后端保存任务 / 事件 / 业务状态”；后端 `WorkflowUsecase` 已负责任务状态、业务状态、催办动作和参数校验，但还没有统一派生 6 条闭环的下游任务。
- 业务链路调试 seed / cleanup 已作为开发验收能力接入后端 JSON-RPC `debug` 域；它只复用 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events`、`workflow_business_states`，通过 `ERP_DEBUG_*` 环境变量、管理员 + 菜单权限、`debugRunId` 和 payload debug 标记限制范围，不是普通业务入口。
- workflow usecase 统一编排评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/workflow-usecase-review.md`。当前结论是下一轮可先试迁“老板审批通过 -> 工程资料任务”，不要一次性重写全部 6 条闭环。
- 行业专表 schema 评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/industry-schema-review.md`。当前结论是本轮不改 Ent schema、不生成 migration；P1 只优先评审 `inventory_txn / inventory_balance / ar_receivable / ar_invoice / ap_payable / ap_reconciliation` 草案。

## 按任务分流

### 1. 日常开发或代码修改

先读：

- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/AGENTS.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- `/Users/simon/projects/plush-toy-erp/server/README.md`
- `/Users/simon/projects/plush-toy-erp/scripts/README.md`

如果任务落在 ERP 页面、流程、帮助中心或移动端，再补读：

- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- `/Users/simon/projects/plush-toy-erp/web/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/role-page-document-matrix.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/task-document-mapping.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/workflow-status-guide.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/workflow-schema-draft.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/workflow-usecase-review.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/industry-schema-review.md`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/business_record.go`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/workflow_task.go`

如果任务涉及模板打印或帮助中心口径，再继续补读：

- `/Users/simon/projects/plush-toy-erp/docs/erp-print-template-field-behavior.md`
- `/Users/simon/projects/plush-toy-erp/docs/erp-print-template-implementation.md`
- `/Users/simon/projects/plush-toy-erp/web/src/erp/docs/print-templates.md`

### 2. 部署、运行或配置问题

先读：

- `/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- `/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/README.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/README.md`

### 3. 收口、改名或默认配置清理

先读：

- `/Users/simon/projects/plush-toy-erp/docs/project-status.md`
- `/Users/simon/projects/plush-toy-erp/scripts/README.md`

然后执行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

## 新开对话最小交接格式

```text
先读：
- /Users/simon/projects/plush-toy-erp/README.md
- [本轮必须先读的正式文档]
- [本轮必须先读的代码]

任务：
[一句话说明目标]

当前唯一真源：
[哪个文件 / 哪段实现 / 哪份文档才是当前真源]

不要碰：
[过期实现 / 临时脚本 / 非当前主路径]

验收：
1. [结果]
2. [边界状态]
3. [必须执行的命令]
```
