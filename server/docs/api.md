# JSON-RPC API 说明

当前服务统一使用一套 JSON-RPC 入口，承载通用鉴权、后台账号管理和已登记的业务领域能力。本文列出通用合同，并重点记录来源任务与出货放行链；各业务域完整方法和领域边界以 [`server/README.md`](../README.md) 与代码注册表为准。

## 统一入口

协议定义见：

- `/Users/simon/projects/plush-toy-erp/server/api/jsonrpc/v1/jsonrpc.proto`

HTTP 路由：

- `GET /rpc/{url}`
- `POST /rpc/{url}`

其中：

- `{url}` 表示业务域，例如 `system`、`auth`、`admin`、`workflow`、`operational_fact`
- `method` 表示具体动作，例如 `admin_login`、`me`、`list`

## 当前默认保留的业务域

以下列出通用域和本次来源任务链直接涉及的业务域，不作为所有已登记领域方法的穷举清单。

### `system`

- `ping`
- `version`

用途：无鉴权的基础联通性检查。

### `auth`

- `admin_login`
- `send_sms_code`
- `sms_login`
- `logout`
- `me`

用途：管理员密码登录、管理员短信验证码登录、退出和当前登录态查询。当前产品不提供普通协作账号登录或公开自助注册方法。

### `admin`

- `me`
- `list`
- `create`
- `rbac_options`
- `menu_options`
- `effective_role_access`
- `set_roles`
- `set_role_settings`
- `set_phone`
- `set_erp_column_order`
- `audit_logs`
- `set_disabled`
- `revoke`
- `reset_password`

用途：管理员读取当前账号资料；具备对应系统权限的管理员创建管理员、绑定登录手机号、给管理员分配角色、启用 / 禁用普通管理员，以及在普通管理员忘记密码时协助重置密码。`effective_role_access` 只读解释已保存或待保存权限在当前客户启用版本下的最终页面；`set_role_settings` 使用一个精确请求和角色版本 CAS，原子保存业务岗位的权限、唯一仓库数据范围、`recommended / custom` 导航模式以及有序的“常用工作 / 更多功能”页面分区，并只写一条聚合审计。自定义分区必须恰好覆盖拟保存权限的全部最终可进入业务页面，菜单位置不会增加权限。

### `workflow`

- `metadata`
- `list_tasks`
- `list_role_tasks`
- `list_workbench_role_tasks`
- `get_task_board`
- `get_task_process_context`
- `list_task_events`
- `list_business_states`
- `explain_action_access`
- `explain_task_assignment`
- `get_task_assignment_options`
- `create_task`
- `complete_task_action`
- `block_task_action`
- `reject_task_action`
- `resume_task_action`
- `urge_task`
- `reassign_task`

用途：读取和处理 Workflow 协同任务。`create_task` 只用于普通、无流程关联的协同任务；公开入口精确拒绝 registry 中全部 19 个可驱动领域 transition 或生成下游任务的 task group，不会因更换 task code / payload 而绕过。生产排程、生产异常和出货放行还使用保留的确定性编号前缀；入口防伪不影响受信领域事务 / ProcessRuntime producer 创建真实任务。

`list_role_tasks` 只用于岗位任务端。服务端先要求账号具备对应 `mobile.<role>.access`，再要求 active revision 的 effective session 对同一岗位投影该入口动作；缺 active revision、岗位 profile 停用、entitlement 撤销、账号没有该业务岗位或仅有 super admin 身份都会 fail closed。多岗位账号可按其真实角色切换，但不能把一个岗位的登录入口权限与另一个岗位的 effective action 拼接使用。

`list_workbench_role_tasks` 只用于桌面岗位工作台，参数、游标和响应结构与 `list_role_tasks` 相同。服务端同时要求当前 effective `erp.workbench.read` 与 `workflow.task.read`，并要求 `role_key` 存在于当前 effective session 的桌面岗位投影；查询使用账号的任务只读可见范围，因此 `workflow.task.supervise` 和 super admin 可以保留跨岗位只读监督，但不会获得完成、阻塞、驳回或改派权限。该方法不替代也不放宽岗位任务端的 `mobile.<role>.access` 与真实业务岗位门禁。

两个岗位任务读取方法的 `view_key` 都只接受 `todo / approval / risk / history`。`approval` 只返回 `ready / blocked` 且 `required_capability_key` 命中服务端审批能力注册表的任务；账号必须至少持有一个已登记审批能力。查询会把每个审批能力与它在任务冻结 revision 中的责任岗位 / 责任池范围成对应用，不能把某一审批能力的岗位范围借给另一能力。`get_task_board(approval_only=true)` 复用同一注册表与成对可见性合同，不只识别通用 `workflow.task.approve`。

`get_task_process_context` 只接受 `task_id`。服务端先按当前账号、active / stored revision、owner / assignee 范围确认任务可见，再从任务的 `process_instance_id / process_node_instance_id` 锚点读取来源单据、流程实例、全部节点、当前节点和已完成节点；来源或节点锚点不一致时 fail closed。响应不暴露定义 hash、edge、分支选择、策略快照或内部权限解释。正式桌面任务抽屉和手机任务详情用该结果展示业务流程、来源单据、流程发起时间、流程状态和已执行 / 当前 / 受阻执行轨迹，并保留本任务锚点与重试次数；`waiting` 节点可能属于未选分支，不作为确定未来步骤展示。

`list_task_events` 只接受 `task_id` 和 `1..100` 的 `limit`，按当前任务可见范围校验后返回该任务最近事件，顺序为最新在前。响应保留任务版本、事件类型、状态变化、处理岗位、意见和时间，不返回操作者内部 ID。它只回答一条普通或审批任务如何被处理，不是来源单据的完整审批链；跨节点业务轨迹以 `get_task_process_context` 为准，库存、出货、质检和财务事实仍以各领域读模型为准。

`get_task_assignment_options` 只接受 `task_id`，返回当前任务 version、状态、负责岗位、当前处理人、是否可退回岗位池以及服务端筛选后的接收人。`reassign_task` 只接受 `task_id / expected_version / idempotency_key / assignee_id / reason`；`assignee_id` 必须显式为正整数接收人或 `null` 岗位池，原因不能为空。当前默认只有 `boss` 获得 `workflow.task.assign`，super admin 可通过全权限执行，但不会自动成为业务岗位接收人；PMC 的 `workflow.task.supervise` 仍是只读。接收人必须是 active 账号、直接持有任务负责岗位，并在任务 revision 中具备读取、更新和完成 / 审批能力。成功只改变任务 `assignee_id / updated_by / version` 并写事件、幂等 receipt 与运行审计，不改变任务状态、责任池、流程锚点或 Fact。

### `customer_config` 审批设置

- `get_approval_settings`：只接受空参数，要求 `customer_config.read`；返回固定审批事项、active revision/hash、主办 / 备用 / 升级成员、最终有效候选和阻塞原因。每个事项显式返回 `configured`：`false` 表示当前 active revision 尚未发布该设置，不能与 `configured=true / enabled=false` 的人工停用混为一谈。
- `preview_approval_settings`：要求 `customer_config.read`；精确接收 `customer_key / revision / expected_active_revision / expected_active_hash / items`，只校验并预览新 immutable revision，不落库。
- `publish_approval_settings`：合同与 preview 相同，要求 `customer_config.publish`；使用 active revision/hash CAS 发布新 revision并写配置发布审计，不自动激活。
- `apply_approval_settings`：合同与 preview 相同，同时要求 `customer_config.publish` 和 `customer_config.activate`；服务端在一个 PostgreSQL 事务内重新校验 active revision/hash、写入 immutable revision 及完整投影、切换 active revision 并写单条生效审计。任一步失败都会整体回滚，不会向其他请求暴露 `building / published` 中间态；响应丢失时只允许同一操作者、同一 revision/hash 和同一审批投影精确重试，成功响应的 revision 必须为 `active`。

`items` 只允许 `sales_order / purchase_order / shipment_finance`，成员只允许 `primary / backup / escalation` 的业务角色或具名账号。普通管理员不能把自己、自己持有的业务角色、系统角色或调试角色加入责任。权限页面的常规写路径使用 `apply_approval_settings` 一次保存并生效；通用客户配置发布流水线仍保留独立 publish / activate transition 合同，不能用前端串联冒充原子操作。ProcessRuntime 任务办理使用任务自身存储的 revision，必须同时满足 RBAC、entitlement、精确 owner pool/role 或具名成员、assignee、状态/version 和幂等；没有候选人时失败关闭。事务提交后启动的新流程立即读取新 active revision，已经启动的流程继续读取自身冻结 revision。对应审批事项缺失或显式停用都会在新流程启动前 fail closed，不回退内置老板池，也不能把页面建议值当作已生效配置。

### `operational_fact`

该域承载已登记的生产、委外、出货、库存预留和财务事实方法。出货主路径当前包括：

- `list_shipment_source_candidates`
- `create_shipment_with_items`
- `ship_shipment`
- `cancel_shipment`
- `get_shipment`
- `list_shipments`

用途：查询可出货销售订单行、创建出货草稿、确认真实出货、取消草稿或已出货单，以及按 ID 精确读取或列表查询出货单。`list_shipment_source_candidates` 与绑定销售订单或订单行的 `create_shipment_with_items` 都要求 `shipment.create + sales_order.read + sales_order_item.read`。`get_shipment` 与 `list_shipments` 均只读且要求 `shipment.read`。公开 `submit_shipment_release` 已退出；正式页面使用 `customer_config.start_finished_goods_delivery_process` 启动 active revision。启动事务重验已有成品质检后直接创建财务 approval，审批通过由绑定领域命令记录 Shipment 财务放行并结束流程；流程不判定质检、不确认出货、不创建应收。只有独立 `ship_shipment` 在门禁为 `APPROVED` 且质检、来源、预留、库存均通过时才写 `SHIPPED` 与库存 `OUT`。

`cancel_shipment` 按原状态分支：`DRAFT -> CANCELLED` 只终止未出库草稿，不写库存；`SHIPPED -> CANCELLED` 才逐行写库存 `REVERSAL`。active `finished_goods_delivery` 流程、未结成品质检、active 出货放行任务或非取消应收 / 发票都会阻断取消；草稿已提交放行时，须先将任务完成或退回。重复取消依真实 `shipped_at` 判断是否曾出库，不会把草稿取消误写成库存冲正。

候选响应的 `total` 是相同关键词 / 销售订单过滤条件下的完整结果数，`items` 只包含当前 `limit / offset` 页；前端必须使用服务端分页、远程搜索与该 `total`，不得再客户端拼接有上限的销售订单、明细和出货列表。

生产、委外和财务的状态方法继续使用 canonical RPC：`post_production_fact / cancel_production_fact`、`post_outsourcing_fact / cancel_outsourcing_fact`、`post_finance_fact / settle_finance_fact / cancel_finance_fact`。生产 / 委外取消接受来源完整的 `DRAFT / POSTED`，财务取消接受正式来源的 `DRAFT / POSTED`；`CANCELLED` 只允许精确幂等重放，`SETTLED` 财务事实不能直接取消。`settle_finance_fact` 只允许 `RECONCILIATION`，不能直接结清应收、应付或发票；应收 / 应付余额只能由正式 FinancePayment allocation、CreditNote 或冲正改变。发票页不提供直接 settle 动作，对账通过 `create_reconciliation_from_finance_fact` 生成对账事实表达。草稿取消不写库存，库存型事实只有已过账取消才写反向流水；财务取消写操作人、时间和原因审计，不写库存。

API 存在不代表正式 Web UI 可达。销售与采购正式页面分别只走 `start_* + execute_*_submit`，不保留直连 submit；出货正式页只调用 `start_finished_goods_delivery_process` 创建财务审批。`add_purchase_receipt_item` 仍是后端能力，旧 `material_supply` 收货 / IQC / 入库 execute 和旧 `finished_goods_delivery` 质检 / 出货 / 应收 execute 只允许冻结在途 revision 恢复，当前 manifest 不能新建这些长图，正式页面也不调用它们。

### `production_wip`

该域承载固定 `PLUSH_SEW_HAND_V1` v1 的路线快照、WIP 批次和工序动作：

- `get_production_wip`
- `execute_production_wip_action`

`get_production_wip` 需要 `production.wip.read`；生产订单的 `get_production_order` / `list_production_orders` 同时接受 `pmc.plan.read` 或 `production.wip.read`，但新建、编辑、发布、关闭、取消和引用选项仍只属于 PMC 计划权限。这样业务岗位可进入生产订单页只读核对路线并办理包材确认，不会获得生产计划维护权。

固定路线和首个 WIP 批次只在生产订单发布事务中冻结；缺失或损坏的路线必须修复工序主档绑定后重新发布，不提供事后初始化接口。工序主档以唯一 `production_route_operation_code` 显式绑定四个标准路线位置，不从名称、类别、普通工序编码或排序推断。`execute_production_wip_action` 的通用参数是 `action`、`production_order_id`、`expected_version` 和 `idempotency_key`，动作合同如下：

| action | 追加参数 | 权限 |
| --- | --- | --- |
| `SPLIT_BATCH` | `production_wip_batch_id`、`splits[]` | `production.wip.assign` |
| `ASSIGN_EXECUTION` | `production_wip_batch_id`、`execution_mode`、`outsourcing_allocations[]` | `production.wip.assign` |
| `CANCEL_BATCH` | `production_wip_batch_id`、`reason` | `production.wip.assign` |
| `START_OPERATION` / `COMPLETE_OPERATION` / `RECEIVE_OUTSOURCING_RETURN` | `production_wip_batch_id` | `production.wip.execute` |
| `TRANSFER_TO_NEXT_OPERATION` | `production_wip_batch_id`、`target_operation_id`、`quantity` | `production.wip.execute` |
| `REWORK` | `production_wip_batch_id`、`target_operation_id`、`quantity`、`reason` | `production.wip.rework` |
| `CONFIRM_PACKAGING_MATERIAL` | `production_order_item_id`、`packaging_version_snapshot`、可选 `note` | `production.packaging_material.confirm` |

`production_orders` 与 `quality_inspections` 必须处于可读 / 可写的对应模块状态；外发安排和外发回仓还要求 `outsourcing_orders` 可写。`CANCEL_BATCH` 只接受尚未开工的 `PLANNED` 批次，要求非空取消原因，以 CAS 和幂等事件把状态改为 `CANCELLED`；它不重新拆分数量，也不冲正外发、库存或其它事实。批次拆分是一次原子动作，至少两个子批且总量必须精确等于父批；首道 `FABRIC_PROCESSING` 正常流禁止拆分，只能按生产订单行整单外发。其 allocation 必须且只能逐条覆盖冻结需求中显式标记 `production_operation_code=FABRIC_PROCESSING` 的 MATERIAL 合同行，开始前还要有足量已过账委外发料，不按材料名称或类别文本推断。裁片关口 `PASS` 并转入 `SEWING` 后，产品数量才可拆批；车缝和手工各自决定本厂或外发。返工回到 FABRIC 后若再次外发，返工批次使用新的 PRODUCT 合同行，不复用正常流 MATERIAL 行。生产订单仍有 `PLANNED / IN_PROGRESS / OUTSOURCED / WAITING_QUALITY` 批次时，`close_production_order` 和 `cancel_production_order` 都会失败；`SPLIT` 父批由子批承接，只有其非终态子批继续阻断，系统不会在关闭或取消订单时自动取消 WIP、冲正发料或替代外发收口。

内部完成后的下一道流转记录为 `WIP_TRANSFER`；只有外发完成返回记录为 `OUTSOURCE_RETURN`。裁片、皮套、成品、针检、抽检和订单条件性客户验货是独立质量关口，当前只有 `PASSED + PASS` 可继续转序，通用 `CONCESSION` 对生产 WIP fail closed。包装开始前还必须有独立包材业务确认；路线订单的最终完工入库数量不得超过已验收包装 WIP。

### `quality`

`list_production_stage_quality_inspections` 以 `production_wip_batch_id`、`gate_code`、状态、结果、关键字和日期范围读取生产分段质检，要求 `quality.inspection.read`，并要求 `production_orders` 与 `quality_inspections` 模块可读。生产关口质检仍使用通用 `submit_quality_inspection`、`pass_quality_inspection`、`reject_quality_inspection` 和 `cancel_quality_inspection` 办理，但生产 WIP 的推进规则只接受最终 `PASS`，不把其他来源侧链现有的让步语义扩到生产路线。

上述路线 / WIP / 分段质检合同当前是本地源码和版本化 Atlas migrations 证据；`20260718110227_migrate.sql` 已在一次性 PostgreSQL 18 隔离库完成完整迁移链 apply 与约束读回，登记的个人开发库仍停在 `20260717043625` 并显示该文件 pending。没有目标客户数据库 apply、目标环境发布、health / smoke 或客户 UAT 证据。

## 来源动作、流程启动与结算

公开接口从既有单据 / 事实查询候选或派生下游对象时，必须同时通过目标动作权限、精确来源读权限和来源 / 目标模块状态。统一 registry 覆盖 BOM 复制、采购入库 / 退货 / 调整、四类质检来源、生产 / WIP / 委外 / 库存预留、出货、财务与 ProcessRuntime wrapper；未登记的新来源动作、无精确读权请求或不可读 / 不可写模块会在进入来源 repository / write usecase 前 fail closed。条件来源按请求实际绑定项加权；对账先以候选读权收窄可探测范围，再按服务端读回的 authoritative FactType 要求对应应付 / 应收 / 发票读权限，不做宽泛 any-of 授权。registry 同时生成 permission usage；测试会逐项删除来源读权并断言写用例未调用，AST handler guard 还会验证每个注册 action 的真实 handler 分支调用了来源读 guard。

`customer_config` 公开启动只保留三条：

| 方法 | 来源与新建状态 | 权限 |
| --- | --- | --- |
| `start_sales_order_acceptance_process` | `DRAFT` 销售订单 | `sales_order.submit + sales_order.read` |
| `start_material_supply_purchase_order_process` | `DRAFT` 采购订单 | `purchase.order.update + purchase.order.read` |
| `start_finished_goods_delivery_process` | `DRAFT` 出货单 | `shipment.create + shipment.read` |

创建事务锁定真实来源，从来源派生 canonical 单号并复核状态；只有完全匹配的已创建流程可精确重放。销售与采购 start 只激活首个 domain command，页面还必须用同一业务意图调用对应 `execute_*_submit` 才提交 Source Document 并创建审批任务；start 成功本身不改变单据状态。旧 `start_material_supply_process` 和公开无来源 `create_purchase_receipt_draft / create_purchase_receipt_with_items` 均按 unknown method 处理。

事实取消不是通用删除，状态与库存合同如下：

| 事实 | `DRAFT -> CANCELLED` | `POSTED -> CANCELLED` | 下游阻断 |
| --- | --- | --- | --- |
| 采购入库 | 锁定关联 IQC / 批次，取消 `DRAFT / SUBMITTED` IQC；仅在预备批次余额精确为零时停用；不写库存 | 逐行写 `REVERSAL` | 任一未取消退货 / 调整或应付阻断已过账取消 |
| 采购退货 / 入库调整 | 锁定子单和父收货，只改子单终态；不写库存 | 按原交易写 `REVERSAL` | 草稿子单取消后解除父收货阻断；既有应付约束仍生效 |
| 生产事实 | 重验订单、来源行 / 物料需求或完工事实坐标；不写库存 | 写事实自身来源的库存反向流水 | active REWORK、来源异常任务、父订单 WIP / 结算约束继续生效 |
| 委外事实 | 重验已确认委外订单行；不写库存 | 写事实自身来源的库存反向流水 | 回货的 active 质检 / 应付、发料的 WIP 分配继续生效 |
| 正式来源财务事实 | 写 `cancelled_at / cancelled_by / cancel_reason`；不写库存 | 保留同一取消审计；不写库存 | 非取消对账子事实阻断；相同 actor + reason 精确重放，变更意图冲突 |

以上状态动作都在同一事务锁定事实行，并按领域固定顺序追加父单、来源、批次或下游依赖锁。并发 post / cancel 只有两种合法串行结果：cancel-first 时 post 失败且没有库存流水；post-first 时先过账，再完成全量反向流水或财务取消审计。不能出现半笔库存、只改状态未冲正或缺失审计字段。

| 生命周期动作 | 事务内阻断条件 |
| --- | --- |
| 销售订单取消 | 未取消出货、active 预留、未取消生产订单或 active 销售审批流程 |
| 采购订单关闭 / 取消 | 关闭阻断入库草稿；取消阻断任一未取消入库；两者都阻断 active 备料流程；入库草稿取消后解除该依赖 |
| 生产 / 委外订单关闭 | 任一子事实不是 `POSTED / CANCELLED` |
| 生产 / 委外订单取消 | 任一子事实不是 `CANCELLED`；子草稿逐笔取消后才解除父单阻断 |
| 已过账采购入库取消 | 任一采购退货 / 入库调整未 `CANCELLED`，或既有应付依赖；子修正草稿取消后解除父收货阻断，不自动取消其它子事实 |

委外订单的 `source_order_no / product_order_no_snapshot` 只是可读快照，不是销售订单外键；公开输入 / 输出不再接受 `source_sales_order_id`，`20260718125909_migrate.sql` 用新 Atlas revision 从目标 schema 删除该列。该 migration 文件存在不等于已 apply 到任一共享、测试或目标数据库。

## 来源任务与出货放行合同

三类来源任务由后端领域事务唯一生成：

| 业务动作 | 任务组 | 来源 | 责任岗位 | 确定性任务编号 |
| --- | --- | --- | --- | --- |
| 生产订单从 `DRAFT` 下达到 `RELEASED` | `production_scheduling` | `production-orders` | PMC | `source-production-scheduling-<生产订单ID>` |
| 来源完工事实创建的返工事实从 `DRAFT` 过账到 `POSTED` | `production_exception` | `production-progress` | 生产 | `source-production-exception-<返工事实ID>` |
| 历史 `DRAFT` 出货单显式提交放行（公开 producer 已退出） | `shipment_release` | `shipments` | 仓库 | `source-shipment-release-<出货单ID>` |

三类任务 payload 都携带 `source_task_contract=workflow.source-task/v1`、固定 producer 和来源意图摘要。对应 task group 与任务编号前缀是保留命名空间；公开 `workflow.create_task`、ProcessRuntime 显式 / node-key 回退任务组和客户流程人工 / 审批节点均会拒绝占用。该约束防止普通任务冒充来源任务，不把 payload 变成 Production、Shipment、Inventory、Quality 或 Finance 真源。

`customer_config.start_finished_goods_delivery_process` 是新的出货审批入口。请求绑定正整数 `shipment_id`、stable business ref 和幂等键；服务端只使用 active revision。新建图固定为 `shipment_finance_approval → shipment_finance_release → end`：启动前在来源事务内重验已有成品质检，流程只创建财务 `workflow.task.approve` 并写版本化放行门禁。正式质检、真实出货、库存 OUT、应收、发票与收付款继续由各自领域 API 办理，不能从公开 Shipment API 跳过财务放行。

财务审批 task 完成后，由自动领域命令写 `finance_release_status=APPROVED` 和流程锚点并结束 ProcessInstance；它不调用 `ship_shipment`，不写库存、应收或发票。`operational_fact.ship_shipment` 在独立出货事务内要求该门禁并重新校验质检、销售来源数量、库存预留和可用量；全部通过后才写 `SHIPPED` 与库存 `OUT`。真实出货 / 取消冲正会把来源业务投影继续推进到 `shipped / cancelled`，生产订单关闭 / 取消和返工事实取消同理推进到 `closed / cancelled`；这些来源投影不改写既有 task status。

存量 `RELEASED` 生产订单与 `POSTED REWORK` 返工事实的缺失任务使用 `server/cmd/backfill-workflow-source-tasks` 受控修复，不属于 JSON-RPC API。命令默认事务 dry-run，apply 要求精确确认数据库名；它不推断历史任务 `done / rejected`，也不扫描或推断 `DRAFT` 出货单曾经提交。具体命令见 [`server/README.md`](../README.md#常用命令)。

## 已退出运行时的旧接口

以下旧接口不属于当前 API，调用时按未知业务域或未知方法处理：

- `auth.login`
- `user.list`
- `user.set_disabled`
- `user.reset_password`

## 鉴权规则

- `system.*` 默认是公开方法
- `auth.admin_login`、`auth.send_sms_code`、`auth.sms_login`、`auth.logout` 是公开方法
- 其他业务域默认要求已登录
- `user.*` 普通账号管理域已退出运行时，不再作为 JSON-RPC URL 提供
- `admin.*` 管理操作要求管理员登录态，并按 `system.*` 权限码做动作级校验
- super admin 不允许被普通管理员通过管理接口修改、禁用或重置密码

说明：管理员鉴权依赖后端 RBAC 权限码，而不是前端页面路径。菜单隐藏只是体验，不是安全边界。

## 默认返回结构

所有 JSON-RPC 响应统一返回：

- `jsonrpc`
- `id`
- `result.code`
- `result.message`
- `result.data`
- `error`

其中：

- `result.code=0` 表示成功
- 其他错误码统一来源于 `/Users/simon/projects/plush-toy-erp/server/internal/errcode/catalog.go`

## 当前默认保留的数据字段

### `auth.admin_login` / `auth.sms_login`

返回最小登录态信息：

- `id`
- `username`
- `access_token`
- `expires_at`
- `token_type`
- `issued_at`

`auth.sms_login` 只接受 `scope=admin`，验证码通过后按 `admin_users.phone` 查找管理员，返回字段额外包含 `is_super_admin`、`roles`、`permissions`、`menus`、`erp_preferences`。普通协作账号登录链路及 `scope=user` 已退出运行时。

岗位任务端请求 `auth.send_sms_code` 和 `auth.sms_login` 时会额外携带 `mobile_role_key`。对格式合法的手机号，发码接口始终返回相同的“验证码已发送”受理合同；服务端只在账号存在、active 且具备 `mobile.<role>.access` 时实际请求短信发送，账号资格、查询失败或短信供应商失败只进入内部脱敏日志，不能从公开响应判断手机号是否绑定管理员或具备岗位资格。登录后的岗位任务读取还必须通过 active revision effective session 对同一角色的入口动作；短信登录成功不能替代该运行态门禁。

短信登录先校验验证码，再读取账号和 RBAC。手机号未绑定、账号停用 / 注销、缺少当前岗位入口权限、验证码不存在 / 错误 / 过期或尝试次数耗尽，对外统一返回 `AuthLoginRejected`；内部日志仍使用稳定原因并只记录脱敏手机号。

密码或短信验证码核验完成后，服务端在创建 session 的同一短事务内再次锁定并核对账号状态、`auth_version`、短信登录手机号和当前岗位入口权限；并发禁用、注销、重置密码或调整相关登录条件时，不会返回一个已经失效的“登录成功”结果。

`auth.admin_login` 按密码登录失败原因返回精确错误：账号不存在为 `AuthUserNotFound`，密码不匹配为 `AuthInvalidPassword`，账号停用为 `AuthUserDisabled`，账号注销为 `AuthAccountRevoked`，登录核验期间凭据发生变化为 `AuthCredentialsChanged`。凭据查询故障返回 `Internal`，不能降级成“账号不存在”。每个用户名 / 密码尝试都会执行一次 bcrypt 比较；只有密码匹配后才加载完整 RBAC，并再次核对账号状态、密码哈希和 `auth_version`。该公开合同允许调用方判断账号是否存在；当前仅有服务级 BBR 限流，部署到公网前仍需补按账号 fingerprint 与可信来源共享的密码登录限速。

### `auth.send_sms_code`

请求字段：

- `phone`：手机号，当前支持中国大陆手机号，允许 `+86`、`86` 前缀和空格 / 连字符
- `scope`：当前只接受 `admin`
- `mobile_role_key`：岗位任务端登录时传当前端口角色；桌面短信登录可省略

返回字段：

- `phone`
- `expires_at`
- `resend_after`
- `mock_delivery`
- `mock_code`

`data.auth.sms.mode=mock` 时，服务端使用进程内验证码存储，验证码 5 分钟有效、60 秒内不可重复发送、最多尝试 5 次，`mock_delivery=true` 且返回 `mock_code` 只用于 local / dev / test。为保持防枚举合同，不合格账号也会收到相同格式但不可验证的诱饵码，因此公开发码响应不能作为账号存在或已授权的证据。`data.auth.sms.mode=provider` 时，后端使用阿里云号码认证 PNVS 短信认证发送并核验验证码，`mock_delivery=false` 且不返回 `mock_code`。

短信登录用户可见错误按错误码收口：

| 错误码 | 典型场景 | 用户提示 |
| --- | --- | --- |
| `AuthInvalidPhone` | 手机号格式不正确 | 手机号格式不正确 |
| `AuthLoginRejected` | 手机号未绑定、账号不可用、无当前岗位入口权限，或验证码不存在 / 错误 / 过期 / 尝试次数耗尽 | 登录信息不正确或账号不可用 |
| `AuthSMSServiceQuotaExceeded` | 阿里云短信套餐 / 余额 / 额度已用完 | 短信服务额度已用完，请联系管理员处理 |
| `AuthSMSServiceUnavailable` | 阿里云服务异常、网络超时或服务商拒绝发送 / 核验 | 短信服务暂不可用，请稍后再试或联系管理员 |

`AuthInvalidSMSCode`、`AuthSMSCodeExpired`、`AuthSMSCodeAttemptsExceeded` 只保留为服务端内部分类，不作为公开短信登录响应返回。

### `auth.me`

返回当前管理员的最小信息，用于前端恢复登录态。旧普通用户 token 会按未登录处理。

### `admin.reset_password`

请求字段：

- `id`：普通管理员 ID
- `password`：新密码，8～20 个 Unicode 字符，且 UTF-8 编码后不超过 bcrypt 的 72 字节边界；密码按原值校验，不做 trim 或大小写归一化

成功后在同一事务覆盖该普通管理员的 `password_hash`、递增 `auth_version`、注销该账号全部 active admin session，并追加不含密码、密码哈希或 session key 的控制面审计。旧密码和旧 token 立即失效；接口不返回明文密码，也不允许非超级管理员维护受保护的系统账号。

## 当前未纳入主干的业务能力

以下旧项目或泛平台能力当前不在主干里，不应再假定存在：

- 积分
- 订阅
- 邀请码

如果后续需要这些能力，应按真实需求重新定义 schema、错误码、接口和前端消费层，而不是把历史逻辑直接加回主干。
