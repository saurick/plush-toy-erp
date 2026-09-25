# JSON-RPC API 说明

本文统一维护 JSON-RPC 的协议、方法、领域约束和来源动作合同。查运行启动与端口见 [服务运行](runtime.md)，模型生成和目标迁移见 [Ent + Atlas](ent.md)；具体方法注册仍以 `internal/service` 为准。

## 统一入口

协议定义见：

- `server/api/jsonrpc/v1/jsonrpc.proto`

HTTP 路由：

- `POST /rpc/{url}`；GET 请求不注册为业务调用入口，不通过 query 传递鉴权信息。

其中：

- `{url}` 表示业务域，例如 `system`、`auth`、`admin`、`workflow`、`operational_fact`
- `method` 表示具体动作，例如 `admin_login`、`me`、`list`

## 当前默认保留的业务域

先查所属业务域，再核对文末的跨域来源动作与流程结算约束。API 存在不代表正式页面已开放该动作。

### `system`

- `ping`
- `version`

用途：无鉴权的基础联通性检查。

`system.version` 是公开只读的运行身份回读，返回构建时注入的正式 catalog 版本、完整与短 Git SHA，以及是否具备正式身份；不返回运行配置、凭据或客户数据。正式 Web 静态包和 Server / Web 镜像必须绑定同一 `RELEASE_VERSION + GIT_SHA`，后台和手机端据此提示一致、缺失或不一致；未注入身份的本地进程只报告 `local`，不能作为发布或目标部署证据。

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
- `set_profile`
- `set_erp_column_order`
- `legal_notice_status`
- `acknowledge_legal_notice`
- `audit_logs`
- `set_disabled`
- `revoke`
- `reset_password`
- `change_password`
- `reset_default_password`

用途：管理员读取当前账号资料；具备对应系统权限的管理员创建管理员、维护员工姓名与登录手机号、给管理员分配角色、启用 / 禁用普通管理员，以及在普通管理员忘记密码时协助重置密码。姓名用于任务、审批、附件和审计等业务页面识别人，账号名用于登录；新建员工账号去除首尾空白后只接受英文字母、数字和下划线，最长 64 个字符，存量账号不自动改名。存量账号尚未补录姓名时，业务展示暂以账号名兜底。`effective_role_access` 只读解释已保存或待保存权限在当前客户启用版本下的最终页面；`set_role_settings` 使用一个精确请求和角色版本 CAS，原子保存业务岗位的权限、唯一仓库数据范围、`recommended / custom` 导航模式以及有序的“常用工作 / 更多功能”页面分区，并只写一条聚合审计。自定义分区必须恰好覆盖拟保存权限的全部最终可进入业务页面，菜单位置不会增加权限。

`admin` JSON-RPC 域承载后台管理员、预设角色和权限管理。每个方法使用精确参数合同，未知字段和不在后端权限注册表中的权限码会整体拒绝。`rbac_options.permission_options` 同时返回稳定 `module` key 和后端注册的岗位语言 `module_name`；内置权限模块缺少名称会由测试阻断，前端不再维护第二份分类翻译表。`system / customer_config / process_runtime` 属于不可委派的控制面权限，其中异常流程恢复只随系统管理员边界使用，不进入业务岗位勾选清单。当前不开放自定义角色创建或角色物理删除；内置角色定义只负责首次初始化默认权限，角色落库后启动 seed 不再覆盖权限中心保存的功能组合。`effective_role_access` 默认解释已保存岗位，也可接收严格校验的 `permission_keys` 对业务岗位草稿做只读有效页面预览；预览复用同一 RBAC、active revision、模块和岗位投影，不落库、不改角色 version、不写审计，系统岗位或不可委派权限会拒绝。业务岗位只通过 `set_role_settings` 整包保存权限、唯一仓库数据范围和菜单布局：`recommended` 要求两组菜单路径都为空；`custom` 要求“常用工作”保留 1–5 个有序页面，“更多功能”保存其余有序页面，二者并集必须恰好覆盖拟保存权限在当前 active revision 下的全部最终可进入业务页面。看板、岗位帮助、重复、跨组重复、缺页、越权页和非法路径都会整体拒绝。该聚合写入以一次角色 version CAS、一个数据库事务和一条 `role.settings.set` 审计完成；不再公开分拆的权限、数据范围或导航保存方法。菜单位置只影响查找顺序，不授予页面或操作权限。系统控制面审计入口为 `audit_logs`，受 `system.audit.read` 权限控制，只读返回 `runtime_audit_events` 中的启动初始化、账号 / 角色 / 权限 / 导航变更和客户配置版本控制事件；支持按 `source / event_type / event_key / actor_key / target_type / target_key / keyword / created_from / created_to` 查询，并返回 `risk_level / action_label / summary / actor_key / target_type / target_key` 供前端定位。账号创建、角色绑定、账号启停、重置密码、岗位设置、客户配置 publish / activate 会追加非敏感摘要，不保存密码、token、密码 hash、compiled snapshot 或客户 raw 配置。该审计表不是采购、库存、质检、出货、财务等业务动作的通用审计事实表。

### `workflow`

- `metadata`
- `list_tasks`
- `list_role_tasks`
- `list_workbench_role_tasks`
- `get_task_board`
- `get_task`
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

`get_task` 只接受正整数 `task_id`，返回 `{ task }` 中的正式任务及版本，用于从进度明细精确进入任务，不能依赖已加载列表查找。读取要求有效登录、active 账号、`workflow.task.read` 和该任务冻结配置下的责任 / 监督可见范围；不接受角色、来源等范围覆盖参数，不写任务或业务事实。可见性不代表可办理，后续动作继续执行既有 explain、权限、版本和幂等校验。

`get_task_process_context` 是 `workflow.task.read` 下的 ProcessRuntime 业务轨迹只读接口，只接受任务 ID。服务端先按当前账号可见性读取任务，再使用任务已持久化的 ProcessRuntime 锚点核对来源、流程实例和关联节点；无锚点、来源不一致、节点不属于该实例或关联节点不存在都会拒绝，不从 task group、名称或 payload 猜测。响应只返回业务来源、流程实例摘要、全部节点、当前节点和已完成节点，不返回流程定义 hash、edge、分支选择或策略快照。桌面任务抽屉和手机任务详情据此显示业务流程、来源单据、发起时间、流程状态，以及已执行 / 当前 / 受阻业务轨迹、本任务锚点和重试次数；`waiting` 可能属于未选分支，前端不得把它排成确定的未来步骤。`list_task_events` 另行提供单条任务的“本任务处理记录”，不能把两条读链合并成完整审批链。明确带 `simulated_only` 或验收批次来源的无流程任务显示“模拟展示数据”边界，不冒充流程闭环。

`list_task_events` 只接受 `task_id` 和 `1..100` 的 `limit`，按当前任务可见范围校验后返回该任务最近事件，顺序为最新在前。响应保留任务版本、事件类型、状态变化、处理岗位、意见和时间，不返回操作者内部 ID。它只回答一条普通或审批任务如何被处理，不是来源单据的完整审批链；跨节点业务轨迹以 `get_task_process_context` 为准，库存、出货、质检和财务事实仍以各领域读模型为准。

任务转交是独立的归属控制动作，不属于上述普通完成 / 阻塞 / 退回代办。`get_task_assignment_options` 只接受 `task_id`，按当前账号可见性、有效 `workflow.task.assign`、任务状态和任务冻结 revision 返回同一负责岗位的合格 active 接收人；候选人必须直接持有 `owner_role_key`，并同时满足 `workflow.task.read + workflow.task.update + workflow.task.complete / approve`，当前处理人不重复返回。`reassign_task` 只接受 `task_id / expected_version / idempotency_key / assignee_id / reason`；正整数 `assignee_id` 表示转给指定人员，显式 `null` 表示取消个人指派并退回原岗位池。当前默认 `boss` 持有转交权限；super admin 可通过全权限执行，但若没有任务负责岗位仍不会进入接收候选人，PMC 监督与普通 admin 不会自动获得转交。数据层在同一事务锁定并重验接收账号、岗位关联和岗位权限，以 task version、当前状态和原 `assignee_id` 做 CAS，只更新 `assignee_id / updated_by / version`，并原子写 `reassigned / unassigned` 事件、`workflow.task-assignment/v1` intent receipt 和 `workflow_task.reassign` 运行审计。任务状态、owner / pool、payload、流程锚点和业务事实均不改变。

`workflow` JSON-RPC 域承载 Workflow 协同任务主路径。任务列表按当前管理员在 active revision 中仍有效的 owner role、assignee、责任池成员 `role_key`、PMC / 老板催办边界和 super admin 收口；无论 owner role 来自管理员基础角色还是责任池 membership，都必须由同一角色的 entitlement 同时命中当前任务动作 capability 和当前 customer scope，并且对应 role profile 仍启用且没有 revoke 该动作。列表按同 scope 的 `workflow.task.read`，完成 / 阻塞 / 退回 / 催办按同 scope 的对应 action permission 过滤，避免把一个角色的动作权限、另一个角色的 owner 身份或另一个 customer scope 的 entitlement 拼接成处理资格；固定真实客户缺 active revision 或角色投影读取失败时 fail closed，不回退原始基础角色。完成 / 阻塞 / 退回动作只走 `complete_task_action / block_task_action / reject_task_action`，旧 `update_task_status` 已退出 JSON-RPC 运行时。服务端按当前管理员、任务责任角色、指派人和服务端解析出的可见 owner role 集合推导事件 `actor_role_key`，不采信前端提交的 raw `task_status_key` 或 `actor_role_key`。只读解释接口 `explain_action_access / explain_task_assignment` 用于返回当前账号为什么能或不能完成、阻塞、退回、催办某个任务，以及当前账号与 owner / assignee / 责任池 / PMC / 老板 / super admin 的任务归属关系；action explain 会返回 `required_permission`、`owner_role_key`、`visible_owner_role_keys`、`candidate_owner_role_keys`、`work_pool_role_matched`、`work_pool_entitlement_scope_matched` 和 `actor_role_key`，并额外返回 `configured_candidate_owner_role_keys / configured_membership_role_keys / configured_entitled_role_keys / configured_candidate_source`，按 active customer config 的 owner pool、当前 action capability 和 customer scope 反查配置候选责任角色；assignment explain 会返回各动作 `action_required_permissions`、`action_candidate_owner_role_keys`、`action_work_pool_scope_matches`、`action_configured_candidate_owner_role_keys` 与 `action_configured_candidate_sources`。只读解释复用实际动作的有效权限与角色判断，不会把已停用或被 revoke 的原始 owner role 报告成允许。只读解释还会返回 `domain_command_entry / action_domain_command_entries`：当前 `enabled=false`、`will_write_fact=false`，用于说明 task action 仍保持 Workflow-only，并列出正式接入领域命令前必须具备的 command key、domain usecase binding、stable business ref、idempotency、RBAC、append-only audit、重复提交测试和取消 / 冲正策略；workflow payload 里的 `command_key` 不会被采信为事实命令。super admin 当前保留查看和催办类诊断边界，但不通过普通任务动作默认处理业务任务；`complete_task_action / block_task_action / reject_task_action` 支持单次受控 break-glass，必须显式传入 `break_glass=true`、非空 `break_glass_reason` 和不超过 2 小时的 `break_glass_expires_at`。成功动作会把 `workflow_task.break_glass` 高风险审计与任务状态、事件 receipt、业务投影和派生任务放在同一事务内提交，payload 记录 `requested_next_status_key`，事件 actor role 固定为 `admin`；精确 receipt 重放不会重复写审计，事务失败也不会留下“动作已成功”的孤立审计。该机制不是长期 break-glass session、审批流、客户可见岗位能力或生产放行证据。它们不写库存、出货、质检、财务或其他 Fact，也不暴露 entitlement ID、user-level 候选人或全局候选人清单。

任务读取接口 `get_task / list_tasks / get_task_board / get_workbench / list_role_tasks` 返回可选只读 `display_context`，只投影识别任务所需的 `source_no` 和产品 / 物料 `kind、name、code、style_no、order_no`，产品项还包含 `product_id、image_attachment_id`（仅当前主图 ID；不返回图片内容）。采购订单来源另外返回 `source_line_count`，它只统计真实采购明细行，不受产品 / 物料识别项展开或去重影响；其他来源暂返回 null。仅对任务已经可见且 ProcessRuntime 来源绑定一致，或命中既有正式来源任务生产者合同的记录批量读取；不输出价格、客户或完整单据，也不扩大原单据查看权限。名称与编号优先保留来源单据快照，快照为空再读取主数据；款号只取产品档案 `style_no`，清空后不会由产品编号或任务旧快照回补。来源已不可用时返回 `available=false` 与空 items，无正式来源绑定时返回 null。该字段不进入任务 payload、数据库 schema、版本签名或写入口。

任务看板与移动岗位列表关键词在计数与分页前搜索同一来源识别信息，支持单号、产品名称 / 编号 / 款号、物料名称 / 编号和已关联销售订单；仍叠加原任务可见性及筛选。已有正式来源绑定的任务不再用旧 payload 的产品字段匹配搜索。读取投影不推进 Workflow，不将任务完成视为 Fact 过账。 `list_role_tasks / list_workbench_role_tasks` 接收最多 100 字的 `keyword`，各视图与计数都使用相同关键词；游标绑定关键词，改变条件必须重读首屏。

`get_task_board` 是 `workflow.task.read` 下的任务看板只读投影。它在同一查询快照中先应用 owner role / assignee 可见性与关键词、状态、到期、来源筛选，再返回全量 `total`、互斥的 `actionable / exception / due / finished` 计数和每栏有界分页。`source_types` 是稳定的来源候选 facet，只受任务可见性与显式 owner role 范围约束，不受当前关键词、状态、到期或来源值影响，避免选中来源后下拉候选塌缩。`exception` 只包含 `blocked`；`done / rejected / withdrawn` 都不进入 due 且不可再操作，只读归入 `finished`，其中撤回与人工退回使用不同文案。默认每栏最多返回 5 条，单栏聚焦页最多 50 条；`lane_key` 只改变返回的分页栏，不改变完整 `total / counts / source_types`。未知状态会 fail closed，不会被静默漏计。

任务返回值包含内部并发字段 `version`；`complete_task_action / block_task_action / reject_task_action / urge_task` 必须提交正整数 `expected_version` 和顶层 `idempotency_key`。数据层按任务 ID、当前状态和版本做 CAS，成功动作只增加一次版本，并在同一事务的 `workflow_task_events` 中写入新版本、服务端计算的 SHA-256 intent hash、命令 key 和首次任务返回快照。receipt 使用稳定的 `workflow.task-mutation-result/v1`；writer 落库前校验 V1 DTO，reader 要求存储 key / command / status 为 canonical，并校验任务状态与非空业务状态字典。相同 task、key、actor、命令和业务 intent 的重放会在终态 / 版本校验前返回首次快照，不重复催办计数、审计、业务投影或派生任务。同 key 改 intent 返回 `40920`，新 key 操作终态任务仍按 settled 拒绝。公开 `create_task` 使用精确创建字段 allowlist，拒绝流程锚点、`customer_key`、receipt / CAS、未知字段以及上述来源任务的保留 task group / 任务编号前缀；普通任务创建不增加幂等或网络 replay。

linked ProcessRuntime 对账在任务已提交后失败时返回可重试未知结果，客户端必须保留同一 attempt 再取 receipt。前端会为一次用户 intent 冻结业务参数、`expected_version` 和安全 UUID；HTTP 408、网络中断、5xx 或结构不合法的 success response 都保留同一 key，任务抽屉、原因和证据也保持可重试。同一 task 的正式动作使用同步 in-flight lease 在请求发出前互斥，避免完成 / 阻塞 / 退回 / 催办跨动作双发；`version / idempotency_key / intent_hash` 均为内部技术字段，不面向业务用户展示。服务启动后立即执行并每 30 秒重复一次有界对账：Workflow 游标处理 `done / rejected` linked task 对应节点仍 active 或已完成但缺路由回执的缺口；ProcessRuntime 节点游标处理缺 linked task、已持久化领域结果未结算、completed 节点缺路由回执和 end / 实例完成缺口。每批最多 100 条，末尾回绕；单条失败仍推进游标并记录最小定位信息。它不重放领域副作用、不处理逾期升级，也不把 `withdrawn` 当成人工审批结果继续路由。Go 与 JS 已共同消费共享 intent vectors，mixed evidence、raw whitespace key 和 relations 由同一 golden 锁定；定向结果不能外推为 final full/strict 或页面级浏览器回归（Style L1）已完成。

`20260711063237 / 20260711075355` 已在本地隔离 migration chain 执行并固定为不可变 revision；`20260711104729` 新增 portable receipt bundle CHECK；`20260711204000` 把本项目迁移前投影表里的 `shipment_release_pending` 规范为正式业务状态 `shipment_pending`，不改 payload 中同名提醒类型。本项目迁移前且无法证明准确版本的事件继续保存 `task_version=NULL`，不使用事件行号或当前任务版本伪造 backfill；这不是旧项目、旧客户端或旧 API 兼容路径。当前迁移链包含两项不同的存量门槛：`--audit populated-upgrade` 核对 `20260714055504` 的状态、审计束、生命周期、流程锚点和待删除时间字段；`--audit customer-config-cutover` 核对 `20260714055825` 前必须显式治理的流程运行态和任务配置锚点。两项都由 `scripts/qa/populated-upgrade-preflight.sh` 在只读事务中执行，任一失败即停止 apply；迁移和发布脚本不得自动 DML。fresh schema、静态 DDL、Ent 零漂移和 Atlas validate 仍只证明结构与迁移链，不替代存量数据升级证据。共享工作树的 migration chain 可能继续增长，必须按当前代码与 Atlas status 重查。目标环境是否已发布仍以绑定具体 commit / image、数据库 status 和发布证据为准，本地 latest 不代表目标环境已经发布。

active revision 的 `work_pool_memberships.role_key` 可被 Workflow 服务端用于收窄当前账号任务可见 owner role 集合，但只有同一 revision 的同一条 `access_entitlements` 同时命中该 role、当前 workflow action capability 和当前 customer scope 时才会扩展处理资格；`workflow_tasks.owner_pool_key / required_capability_key / config_revision / process_instance_id / process_node_instance_id` 当前只作为新任务 runtime 解释锚点、配置版本线索和流程节点追踪锚点，旧任务可为空；公开 JSON-RPC `create_task` 只创建无流程关联、且不占用来源任务保留命名空间的普通协同任务，显式提交 `config_revision / process_instance_id / process_node_instance_id` 会被拒绝，`config_revision` 只由服务端受控派生，两个流程节点关联 ID 只由 ProcessRuntime 的 `CreateLinkedWorkflowTask` 内部路径生成；ProcessRuntime 可显式启动 active ProcessInstance 的首个 waiting 节点，首节点为 `human_task / approval` 时才创建 linked WorkflowTask；ProcessRuntime 只允许从 `active` 且 `expected_version` 匹配当前节点版本的 `human_task / approval` 节点显式创建 linked WorkflowTask，未显式传 `owner_role_key` 时只接受 active customer config 解析出的唯一候选 owner role，相同 `task_code` 的同一节点重试会返回已有任务，也可读取已 `done` 的 linked WorkflowTask 完成当前 ProcessNodeInstance；显式 task group、由 node key 回退得到的 task group，以及客户流程定义的人工 / 审批 node key 都不能占用来源任务保留 task group 或编号前缀。`complete_task_action` 成功完成 linked WorkflowTask 后会受控触发当前节点完成，并按顺序、命名 policy、fan-out / join 或受控 returnTo attempt 路由激活下一组节点；刚激活的 `human_task / approval` 会复用 `CreateLinkedWorkflowTask` 创建下一 linked WorkflowTask，刚激活的 `end` 会完成 end 节点并把 ProcessInstance 标记为 completed，`domain_command / wait_event` 只进入 active 等待显式执行 / 唤醒；旧 `update_task_status` 已退出运行时，且系统仍不会由后台 scheduler 自动启动流程、自动扫描流程定义、自动扫描 overdue、跳过节点、为 `domain_command / wait_event / end` 创建 WorkflowTask、把任务完成自动绑定到 domain handler、发送提醒升级通知或直接新增任务事实字段。

`workflow` JSON-RPC 写入口已接入 active module states 本地门禁：`create_task / complete_task_action / block_task_action / reject_task_action / urge_task` 先按各自精确顶层合同拒绝 `customer_key` 和未知字段，再只用服务端部署上下文解析当前客户，并要求 `workflow_tasks=enabled`；`read_only / disabled / 缺失` 会拒绝且不调用 Workflow usecase 写任务、事件或业务状态。旧 `update_task_status` 和公共 `upsert_business_state` 已退出运行时，调用会返回 unknown method。`metadata / list_tasks / list_business_states / explain_action_access / explain_task_assignment` 只读查询继续保留。该切片只证明 Workflow JSON-RPC 写入口的本地模块门禁，不改变 Workflow task done 不等于 Fact posted 的边界，也不代表打印、其它导入入口或目标环境 release evidence 已闭环。

### `customer_config` 审批设置

- `get_approval_settings`：只接受空参数，要求 `customer_config.read`；返回固定审批事项、active revision/hash、主办 / 备用 / 升级成员、最终有效候选和阻塞原因。每个事项显式返回 `configured`：`false` 表示当前 active revision 尚未发布该设置，不能与 `configured=true / enabled=false` 的人工停用混为一谈。
- `preview_approval_settings`：要求 `customer_config.read`；精确接收 `customer_key / revision / expected_active_revision / expected_active_hash / items`，只校验并预览新 immutable revision，不落库。
- `publish_approval_settings`：合同与 preview 相同，要求 `customer_config.publish`；使用 active revision/hash CAS 发布新 revision并写配置发布审计，不自动激活。
- `apply_approval_settings`：合同与 preview 相同，同时要求 `customer_config.publish` 和 `customer_config.activate`；服务端在一个 PostgreSQL 事务内重新校验 active revision/hash、写入 immutable revision 及完整投影、切换 active revision 并写单条生效审计。任一步失败都会整体回滚，不会向其他请求暴露 `building / published` 中间态；响应丢失时只允许同一操作者、同一 revision/hash 和同一审批投影精确重试，成功响应的 revision 必须为 `active`。

`items` 只允许 `sales_order / purchase_order / shipment_finance`，成员只允许 `primary / backup / escalation` 的业务角色或具名账号。普通管理员不能把自己、自己持有的业务角色、系统角色或调试角色加入责任。权限页面的常规写路径使用 `apply_approval_settings` 一次保存并生效；通用客户配置发布流水线仍保留独立 publish / activate transition 合同，不能用前端串联冒充原子操作。ProcessRuntime 任务办理使用任务自身存储的 revision，必须同时满足 RBAC、entitlement、精确 owner pool/role 或具名成员、assignee、状态/version 和幂等；没有候选人时失败关闭。事务提交后启动的新流程立即读取新 active revision，已经启动的流程继续读取自身冻结 revision。对应审批事项缺失或显式停用都会在新流程启动前 fail closed，不回退内置老板池，也不能把页面建议值当作已生效配置。

#### 流程命令与恢复

`customer_config` JSON-RPC 域承载客户配置版本控制面与受控 ProcessRuntime 入口。公开成品交付命令不包含财务放行或拒绝：`shipment.finance_release / shipment.finance_reject` 只由通用 approval 对账按命名分支在服务端内部触发；其它 validate / publish / activate / rollback / explain / start / execute 方法继续遵守 active revision、模块、RBAC、幂等和领域 usecase 门禁。配置 publish 仍以 normalized payload 的 canonical SHA-256 hash 执行 INSERT-only，控制面审计不保存 compiled snapshot 或 raw 配置；`explain_process_definition` 只读，不创建流程、不执行命令、不写 Fact。

该域里的流程运行时入口只做显式启动和显式领域命令执行，不上传任意客户包文件，不提供普通运行时 `install_module / uninstall_module / upload_plugin`，不导入真实业务数据，也不绕过领域 usecase 和后端 RBAC 校验。所有 `customer_config.execute_*` 显式流程命令在调用 `ExecuteDomainCommandNode` 前都会通过 `EnsureProcessDomainCommandModulesEnabled` 按 active revision module states 校验命令引用模块，非 `enabled` 时返回参数错误且不调用领域 usecase；这只是 `customer_config` execute API 的本地门禁，不等于普通业务 JSON-RPC、打印或其它导入入口已经全链路阻断。`start_sales_order_acceptance_process` 只从 active customer config 受控构造并显式创建 / 启动销售订单接单 ProcessInstance，要求 `sales_order.submit + sales_order.read`，返回 runtime boundary，不执行 domain command、不写 Fact、不替代正式 UI；`execute_sales_order_acceptance_submit` 只执行已 active 的 `submit_sales_order` 节点，要求调用方提供 process instance、process node、expected version、销售订单 ID 和幂等键，成功后调用 `sales_order.submit` domain command 提交销售订单 Source Document，并推进到 active revision 解析出的销售审批责任池 linked task，仍不写库存、出货、质检、财务或其他 Fact。

ProcessInstance 的业务引用唯一性由 `process_key + business_ref_type + business_ref_id` 约束。同一业务引用使用同一 `idempotency_key` 重试创建时返回已有流程实例和节点；同一业务引用换一个 `idempotency_key` 再启动会被拒绝为重复流程，避免同一销售订单、采购订单或出货单生成多条公开并行流程。重复调用 `StartProcessInstance` 会对首节点做有界恢复：`human_task / approval` 的 active 节点补建或精确重放同一 linked WorkflowTask，已完成 `end` 补齐 ProcessInstance completed，带 durable result 的已结算 `domain_command` 继续结算；active `domain_command / wait_event` 只返回当前节点，不自动重复领域副作用或唤醒事件。任务重放会核对不可变任务字段和原始 payload intent，运行时后来追加的 payload 字段不造成误冲突。

ProcessRuntime 执行 `domain_command` 时，先让已登记 handler 做无副作用只读预检，再把 `command_key + idempotency_key + JSON payload` 的 SHA-256 fingerprint 原子绑定到 active 节点；数据层使用单条带状态、版本和 fingerprint 条件的 `UPDATE ... RETURNING`。当前新建图使用的 `sales_order.submit / sales_order.activate_after_approval / sales_order.reject_after_workflow / purchase_order.submit / purchase_order.approve_after_workflow / purchase_order.reject_after_workflow / shipment.finance_release / shipment.finance_reject` 都在各自领域事务内同时写业务副作用和 durable result / effect ref。销售 submit、activate 和两类拒绝命令都要求生产 repo 实现 durable transaction 合同；缺少接口会失败关闭，不回退到普通 Source Document 更新。旧在途图仍可使用其冻结 revision 中的 `purchase_receipt.create / quality_inspection.aggregate_gate / inventory.post_inbound / finished_goods_quality.decide / shipment.ship / finance.receivable_lead` handler；这些 handler 的存在不是当前客户 manifest 可以新建长流程的授权。重试会先读持久结果并跳过 Validate / handler，再继续节点结算、linked ref CAS 和下游推进对账。

销售订单取消、采购入库取消冲正、已出货取消冲正和财务事实取消会在同一领域事务内标记 compensation；正式认证 JSON-RPC 主路径会把当前管理员写入 `domain_command_compensated_by`。active 节点读取 compensated result 会阻塞流程，已完成节点在补偿后重放会返回 `40921` 且不再推进下游。受控恢复按已持久化 activation parent 与路由回执识别实际被选中的下游，撤回可证明属于该效果的节点和 linked task；不根据定义里未选中的分支猜测执行历史，证据不完整或存在不安全活动效果时继续失败关闭。migration `20260710150000` 只把升级前 active 空 fingerprint 标成 fail-closed sentinel；`20260710150001` 才新增 protocol / result / hash / effect-ref / compensation schema，并把本项目迁移前已有 fingerprint 标为 protocol 0。本项目迁移前的 protocol 0、已提交销售订单但缺 exact result，以及省略 `inspected_at`、无法证明原判定时间的迁移前成品质检 result-missing 仍返回 `40921`。本地 PostgreSQL 已覆盖结果冲突时领域写回滚、finance exact recovery / payload conflict / cancellation compensation、本项目迁移前销售结果 fail closed、completed-node compensation fail closed 和 ProcessRuntime 并发；目标环境尚未应用本轮迁移，也没有 release evidence。

管理员补偿恢复的上下文读取与写入共用同一失败关闭范围：只接受收付款、库存人工调整和生产异常三类 process key，并逐节点校验实例、attempt、结果 hash、补偿 hash 与持久路由证据。冻结定义包含 branch、fan-out、join 或 returnTo 本身不再一票否决；恢复只处理可由当前实例证据证明已选中的路径，不能证明时仍要求人工核对。这与运行时周期对账是两条独立边界。

ProcessRuntime 的 `wait_event` 当前只提供 usecase 层显式唤醒：`WakeProcessWaitEventNode` 要求节点为 `active`、版本匹配、`policy_snapshot.event_key` 已声明，调用方提供匹配事件 key 和幂等键后才完成该节点并复用顺序推进。它不提供事件订阅器、不由 `complete_task_action` 自动触发、不创建 WorkflowTask、不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的命名 policy 分支当前也只提供 usecase 层显式 handler：节点完成后，只有当前节点 `policy_snapshot.branch_policy_key` 已注册为 `ProcessBranchPolicyHandler`，运行时才会让 handler 返回下一节点 key，并只激活同一 ProcessInstance 内这个仍为 `waiting` 的目标节点。它不解析自由表达式、客户 JS / SQL 或任意脚本，不自动跳过或 settle 非选中分支，不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `returnTo` 当前只提供 usecase / repo 层受控返工 attempt：节点完成后，只有当前节点 `policy_snapshot.return_to_node_key / return_outcomes / return_max_attempts` 明确声明返工目标、触发 outcome 和最大 attempt，且 outcome 命中时，运行时才会复制目标 node key 的最新已 settled 节点配置，创建下一 attempt 的 waiting `ProcessNodeInstance` 并激活它；目标是 `human_task / approval` 时才创建 linked WorkflowTask。目标不存在、目标最新 attempt 未 settled、超过上限或配置非法都会拒绝。它不提供任意循环、不复用旧 completed 节点、不自动 settle 其他分支、不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `blocked / due_at` 当前只提供 usecase / repo 层显式阻塞：阻塞入口要求 active 流程、active 节点、`expected_version` 匹配和非空 reason；`EscalateDueProcessNode` 额外要求节点已有 due_at 且当前时间达到或超过 due_at。数据层在同一个 PostgreSQL 事务内把节点和 ProcessInstance 标记为 blocked，任一更新失败会整体回滚；它不写 completed_at，不推进后续节点，不创建 WorkflowTask，不提供后台 scheduler、不自动扫描 overdue、不发送提醒升级通知，也不写库存、出货、质检、财务或其他 Fact。

当前服务端只有一项有界 ProcessRuntime reconciliation timer：一条游标扫描终态 linked task 与人工 / 审批节点的结算缺口，另一条游标扫描缺 linked task、已持久化领域结果未结算、completed 节点缺路由回执和 end / 实例完成缺口；每批有上限、逐项失败留日志并从持久证据幂等恢复。它不按客户配置启动新流程、不扫描 overdue、不重新执行领域副作用、不导入、不打印，也不写新的领域事实。其它后台任务仍只限 server bootstrap 初始化和 `template_pdf` 的 PDF warmup / Chrome WebSocket 等待。后续若新增通用 scheduler、cron、durable outbox、提醒通知或自动 overdue 扫描，必须另拆阶段接入 active module states、RBAC、幂等、审计和测试。

ProcessRuntime 当前 handler registry 同时保留当前图所需命令和旧在途 revision 的冻结命令；是否可执行必须再由当前流程定义、冻结 revision、节点、权限与业务引用共同决定，不能凭 handler 存在推断页面可达。Product Core 登记六个 process key：销售、采购和 Shipment 三条可配置日常流程，加收付款、库存人工调整和生产异常三条固定责任流程；销售有两个受控变体，不因此增加新的 process key。客户 manifest 可以选择全部六条已注册合同，但只能在 Product Core 允许的范围内选择销售受控变体并配置前三条的审批责任；后三条的节点图和责任池仍由 Product Core 固定，客户不能改写。正式销售、采购页面都执行 `start → submit command`，出货页只启动财务审批；三条固定流程分别由来源页启动并在 approval 后等待独立执行任务 / 领域命令。上述本地代码边界不代表目标 active revision、部署 evidence、九岗位 smoke 或 UAT 已闭环。

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

#### 库存预留、生产、委外与财务

`operational_fact` 的 shipment 出货写入口已接入 active module states 本地门禁：`create_shipment_with_items` 要求 `shipments=enabled`，其正式依赖闭包同时要求 `sales_orders / inventory` 等依赖保持 `enabled`；`ship_shipment / cancel_shipment` 要求 `shipments / inventory / workflow_tasks=enabled`。写入模块或依赖不可写时不会进入仓储。`get_shipment / list_shipments` 保留历史读取边界。

`operational_fact` 的 stock reservation 库存预留写入口已接入 active module states 本地门禁：`create_stock_reservation_from_sales_order / release_stock_reservation` 要求 `inventory=enabled`；创建时只接受销售订单、订单行、仓库、批次和数量，产品、SKU、单位由后端锁定源单派生。`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写库存预留事实。`list_stock_reservations` 保留历史读取边界，不把模块关闭理解成历史预留不可查。普通业务 API 不提供独立 `consume_stock_reservation`：`CONSUMED` 只能由 `ship_shipment` 在真实出货与库存 `OUT` 的同一事务内推进，不能单独释放可用量。

`operational_fact` 的 production 生产事实写入口已收口为 `create_production_material_issue_from_order / create_production_completion_from_order / create_production_rework_from_completion`，并继续使用 `post_production_fact / cancel_production_fact` 处理状态。领料必须来源于发布时冻结的物料需求；显式路线完工必须来源于生产订单行和确切 `ACCEPTED` 包装 WIP 批次，事实以不可变 `production_wip_batch_id` 保存该链接；返工必须来源于带完整订单 / 行 / WIP 投影的已过账完工事实。公开 `create_production_fact` 已退役。来源坐标完整的领料、完工和返工 `DRAFT` 可直接转为 `CANCELLED`，不写库存；`POSTED` 取消才写事实自身来源的库存反向流水。已过账完工有非取消 REWORK 时阻断取消；REWORK 过账在库存 OUT 和事实 POSTED 的同一事务内创建成品补制根 WIP、事件和来源异常任务，取消还要求任务终态且整条补制链未开始。草稿子事实取消后只解除相应父生产订单的子事实阻断，不替父单结清 WIP 或来源任务。对显式 `PLUSH_SEW_HAND_V1` 订单行，完工入库的创建与过账数量按确切包装批次分别扣除 DRAFT + POSTED 占用，不得超过该批次已验收数量；CLOSED 只允许 `origin_rework_fact_id` 来源链登记返工补完工。包装动作完成、包材业务确认或 Workflow task done 都不单独写成品库存。所有写入口要求 `production=enabled`；REWORK 的过账及其 `POSTED` 后取消还要求 `workflow_tasks=enabled`。`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_production_facts / list_production_order_material_requirements` 保留历史读取边界。

`operational_fact` 的 outsourcing fact 委外事实写入口已收口为 `create_outsourcing_material_issue_from_order / create_outsourcing_return_receipt_from_order`，并继续使用 `post_outsourcing_fact / cancel_outsourcing_fact` 处理状态。发料、回货均锁定已确认委外订单行并派生供应商、业务对象和单位；公开 `create_outsourcing_fact` 已退役。来源完整的 `DRAFT` 发料 / 回货可取消且不写库存，`POSTED` 取消才写库存反向流水；回货无论草稿或已过账，只要仍有非取消质检或应付就阻断取消，已过账发料还继续服从 WIP 外发分配依赖。子事实达到 `POSTED / CANCELLED` 后才解除父委外单关闭阻断，全部 `CANCELLED` 后才解除父委外单取消阻断。加工合同页的“委外记录”使用 `outsourcing.fact.read / post / cancel` 和 canonical RPC 展示 `MATERIAL_ISSUE / RETURN_RECEIPT`，DRAFT 可过账或作废、POSTED 可取消、CANCELLED 只读，并在写后重新读取目标状态；质检和应付只对 `POSTED RETURN_RECEIPT` 开放。写入口要求当前模块目录中的 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_outsourcing_facts` 保留历史读取边界。

`operational_fact` 的来源财务入口收口为 `create_receivable_from_shipment / create_invoice_from_shipment / create_payable_from_purchase_receipt / create_payable_from_outsourcing_return / create_reconciliation_from_finance_fact`；往来方、币种、金额和来源由后端从已过账事实派生，公开 `create_finance_fact` 已退役。真实收付款使用独立 `create / post / reverse_finance_payment`，过账时只允许按同往来方、同币种和收 / 付方向把一笔款项分配到多条应收或应付，并支持部分核销；红冲 / 反向红冲使用独立 credit note 合同。`post / settle / cancel_finance_fact` 继续承担来源财务事实状态动作。正式来源的 `DRAFT / POSTED` 可进入 `CANCELLED` 并保存审计；草稿取消不写库存，无正式来源草稿 fail closed，非取消下游继续阻断上游取消。写入口要求 `finance=enabled`；银行直连 / 流水导入、付款申请审批、总账和税控不在当前合同。

采购、生产、委外和财务的 post / cancel 都在同一事务锁定事实行，并按领域约定追加父单、来源、批次或 active downstream 锁。并发只允许两种串行结果：cancel-first 时后续 post 失败且没有库存流水；post-first 时先完成过账，再执行完整 `REVERSAL` 或财务取消审计。生产 / 委外父单关闭要求子事实处于 `POSTED / CANCELLED`，父单取消要求全部子事实 `CANCELLED`；取消子草稿只解除相应依赖，不自动结算 WIP、Workflow、质检、应付或对账。

业务记录页还会在调用前对历史草稿 fail closed：生产 / 委外 `DRAFT` 缺少该类事实必需的来源坐标时，同时禁用过账和作废；财务 `DRAFT` 缺少可校验正式来源时，同时禁用确认和作废。合法来源草稿仍按上述状态机开放；页面禁用只是避免发起必然失败的请求，不替代服务端校验。

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

`production_orders` 与 `quality_inspections` 必须处于可读 / 可写的对应模块状态；外发安排和外发回仓还要求 `outsourcing_orders` 可写。`CANCEL_BATCH` 只接受尚未开工的 `PLANNED` 批次，要求非空取消原因，以 CAS 和幂等事件把状态改为 `CANCELLED`；它不重新拆分数量，也不冲正外发、库存或其它事实。批次拆分是一次原子动作，至少两个子批且总量必须精确等于父批；首道 `FABRIC_PROCESSING` 正常流禁止拆分，只能按生产订单行整单外发。其 allocation 必须且只能逐条覆盖生产负责人所选冻结材料需求对应的 MATERIAL 合同行，开始前还要有足量已过账委外发料，不按材料名称或类别文本推断。裁片关口 `PASS` 并转入 `SEWING` 后，产品数量才可拆批；车缝和手工各自决定本厂或外发。返工回到 FABRIC 后若再次外发，返工批次使用新的 PRODUCT 合同行，不复用正常流 MATERIAL 行。生产订单仍有 `PLANNED / IN_PROGRESS / OUTSOURCED / WAITING_QUALITY` 批次时，`close_production_order` 和 `cancel_production_order` 都会失败；`SPLIT` 父批由子批承接，只有其非终态子批继续阻断，系统不会在关闭或取消订单时自动取消 WIP、冲正发料或替代外发收口。

内部完成后的下一道流转记录为 `WIP_TRANSFER`；只有外发完成返回记录为 `OUTSOURCE_RETURN`。裁片、皮套、成品、针检、抽检和订单条件性客户验货是独立质量关口，当前只有 `PASSED + PASS` 可继续转序，通用 `CONCESSION` 对生产 WIP fail closed。包装开始前还必须有独立包材业务确认；路线订单的最终完工入库数量不得超过已验收包装 WIP。

`production_wip` JSON-RPC 域提供 `get_production_wip / execute_production_wip_action / prepare_production_outsourcing_order`。写动作使用精确 allowlist，包括 `SPLIT_BATCH / ASSIGN_EXECUTION / CANCEL_BATCH / START_OPERATION / COMPLETE_OPERATION / RECEIVE_OUTSOURCING_RETURN / TRANSFER_TO_NEXT_OPERATION / REWORK / CONFIRM_PACKAGING_MATERIAL`，并通过 `expected_version + idempotency_key +` 服务端 intent hash 守住 CAS 和精确重放。`CANCEL_BATCH` 只允许把尚未开工的 `PLANNED` 批次改为 `CANCELLED`，要求取消原因并追加不可变事件；它不重新拆分数量、不冲正已形成事实。已发布生产订单仍有活动 WIP 时，关闭和取消都会失败，不会留下订单已终止但 WIP 仍活动的分裂状态。布料加工正常流只允许按订单行整单数量外发，首道不允许拆批；必须绑定且仅绑定恰好覆盖生产负责人所选材料需求的 MATERIAL 加工合同明细，开始前要求每条已有足量已过账委外发料。裁片关口 `PASS` 并转入车缝后，才允许按产品数量一次拆成至少两个 WIP 子批，且子批总量必须精确等于父批；车缝与手工每道独立选择 `IN_HOUSE / OUTSOURCED`。返工回到 FABRIC 后若再次外发，返工 WIP 必须绑定新的等量 PRODUCT 合同行，不复用正常流 MATERIAL 行。内部转移记录 `WIP_TRANSFER`，只有外发返回使用 `OUTSOURCE_RETURN`；这些 WIP 事件不写委外发料 / 回货或库存事实。包装启动前要求订单行级包材版面 / 版本业务确认，不代替品质 IQC。成品返工采用独立来源链：REWORK 事实过账原子创建带 `origin_rework_fact_id` 的 HANDWORK 根批次和创建事件，拆分、转序与后续返工子批必须继承来源；订单 CLOSED 后普通批次只读，只允许该来源链继续办理，且不得直接取消来源根批次。来源异常任务达到终态且根批次仍是无子批、执行、质检、分配或完工依赖的初始 `PLANNED` 状态时，才允许取消已过账 REWORK。权限分为 `production.wip.read / assign / execute / rework` 和 `production.packaging_material.confirm`；生产订单列表 / 详情读取接受 `pmc.plan.read` 或 `production.wip.read`，但新建、编辑、生命周期动作和引用选项仍只属于 PMC，后端继续叠加 production / quality / outsourcing 模块状态门禁。`20260718110227_migrate.sql` 已完成一次性 PostgreSQL 18 fresh apply、约束读回和零漂移验证。Migration 不会按名称猜测或自动写入 `processes.production_route_operation_code`，使用固定路线前仍须通过工序页或受控 seed 显式绑定四个标准位置。成品返工来源字段 migration `20260730161955_migrate.sql` 仅在本地生成和审查，尚未 apply、发布或完成客户 UAT；133 较早固定 V5 证据不能外推到当前 HEAD。

### `quality`

`list_production_stage_quality_inspections` 以 `production_wip_batch_id`、`gate_code`、状态、结果、关键字和日期范围读取生产分段质检，要求 `quality.inspection.read`，并要求 `production_orders` 与 `quality_inspections` 模块可读。生产关口质检仍使用通用 `submit_quality_inspection`、`pass_quality_inspection`、`reject_quality_inspection` 和 `cancel_quality_inspection` 办理，但生产 WIP 的推进规则只接受最终 `PASS`，不把其他来源侧链现有的让步语义扩到生产路线。

路线 / WIP / 分段质检的实现以源码、版本化 Atlas migrations 和同名测试为准；任一目标是否已升级，须独立读取该目标的 migration、release 与运行证据，不在本文保存易过期的开发库版本快照。

质检事实当前在 `quality_inspections` 上保留 nullable `source_type / source_id / inspection_type / subject_type / subject_id` 锚点。来料质检使用 `PURCHASE_RECEIPT / INCOMING / MATERIAL`；委外回货质检使用 `OUTSOURCING_FACT / OUTSOURCING_RETURN / PRODUCT|MATERIAL`，只允许从已过账回货事实创建且累计送检量不得超过有效回货量；出货前成品检验使用 `SHIPMENT / FINISHED_GOODS / PRODUCT`，只允许从 `DRAFT` 出货单按产品 / SKU、仓库和批次组合创建。该组合是当前正式送检粒度，同组合重复出货行聚合为一批，不声称具备逐出货行锚点。创建在 shipment 行锁事务内完成，同单号同 payload 精确重放、同送检粒度非取消记录冲突、取消后可重建，并与确认出货串行化。没有成品质检时仍可按当前可选检验策略出货；一旦存在非取消记录，`DRAFT / SUBMITTED / REJECTED` 会阻止出货，只有 `PASSED + PASS / CONCESSION` 放行。这些来源不能互相伪装，也不由 Workflow 完成状态代写质检事实；直接从出货页创建质检不会启动或推进 `finished_goods_delivery` ProcessRuntime。委外应付只有在恰有一张非取消质检达到 `PASSED + PASS / CONCESSION` 时才能生成。

生产 WIP 分段质检使用 `PRODUCTION_WIP / PRODUCTION_STAGE / WIP`，并以 `production_wip_batch_id + gate_code` 绑定裁片、皮套、成品、针检、抽检和条件客户验货。工序完成或外发返回后只创建当前第一关草稿；提交、判定、取消和顺序生成下一关都与 WIP 批次状态在同一事务内校验。当前没有关口级让步审批策略和审计，因此生产阶段只有 `PASSED + PASS` 放行，通用 `CONCESSION` fail closed；这不改变上述其他来源现有的让步边界。

`quality` JSON-RPC 域里的质检写入口已接入 active module states 本地门禁：`create_quality_inspection_draft / create_quality_inspection_from_outsourcing_return / submit_quality_inspection / pass_quality_inspection / reject_quality_inspection / cancel_quality_inspection` 要求 `quality_inspections` 为 `enabled`；`create_finished_goods_quality_inspection_draft` 同时要求 `shipments / quality_inspections` 为 `enabled`。`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例创建或变更质检事实。成品检验创建只接受 canonical `inspection_no / shipment_id / finished_goods_lot_id / product_id / warehouse_id / decision_note` 与 customer scope，不接受来源别名或 caller 代报 inspector。`get_quality_inspection / list_quality_inspections / list_finished_goods_quality_inspections / list_outsourcing_return_quality_inspections / list_production_stage_quality_inspections` 保留各来源读取边界，不把模块关闭理解成历史数据不可查。

### 采购入库 `purchase`

采购入库已接入独立 `purchase` JSON-RPC 域，当前只覆盖既有 `purchase_receipts / purchase_receipt_items` 事实主路径：

- `create_purchase_receipt_from_purchase_order`
- `add_purchase_receipt_item`
- `post_purchase_receipt`
- `cancel_purchase_receipt`
- `get_purchase_receipt`
- `list_purchase_receipts`

这组接口走 `InventoryUsecase` 和既有采购入库事实表。过账写 `inventory_txns.IN`；`DRAFT` 取消不写库存，会在收货行锁事务内锁定并校验关联 `PURCHASE_RECEIPT / INCOMING / MATERIAL` IQC 与预备批次，取消 `DRAFT / SUBMITTED` IQC，并只在所有预备批次余额精确为零时停用；`POSTED` 取消才逐行写 `REVERSAL`。任一 IQC 来源形状异常、预备批次非零余额、未取消退货 / 调整或 active 应付都会按对应状态整笔阻断。公开入库 API 只接受采购订单、采购行等已登记的正式来源字段；读取采购订单或订单行的 `create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 同时要求 `purchase.receipt.create + purchase_order.read`，其它采购入库读取和确认仍分别使用 `purchase.receipt.read / warehouse.inbound.confirm`。这些权限边界不代表 Workflow 任务完成会自动过账库存事实。

采购退货和入库调整沿用同一草稿 / 过账分界：取消 `DRAFT` 时先锁定子单再锁定父收货，只把子单改为 `CANCELLED`，不写库存；取消 `POSTED` 时才按原交易写 `REVERSAL`。草稿子修正全部取消后，父收货的 correction dependency 解除；采购收货草稿取消后，也不再阻断采购订单关闭 / 取消。父单动作不会自动取消任一子单或子事实。

`purchase` JSON-RPC 域里的采购入库写入口已接入 active module states 本地门禁：`create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 都要求 `purchase_orders / purchase_receipts / quality_inspections / inventory=enabled`，并同时要求 `purchase.receipt.create + purchase_order.read`；`post_purchase_receipt / cancel_purchase_receipt` 按各自事实副作用要求 `purchase_receipts`、`quality_inspections` 或 `inventory` 为 `enabled`。依赖模块 `read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 Source Document、质检或库存事实。公开新建只接受 `create_purchase_receipt_from_purchase_order`；旧 `create_purchase_receipt_draft / create_purchase_receipt_with_items` 已退役并返回 unknown method，内部 usecase 不构成公开无来源写入口。公开的 `create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 要求调用方提供不超过 128 字符的稳定 `idempotency_key`，拒绝调用方提交 payload hash；`add_purchase_receipt_item` 还必须提供 `purchase_order_item_id`，服务端会在锁定入库单后校验来源采购单已审核、来源材料 / 单位与入库行一致、来源采购单供应商与入库单稳定供应商一致，并禁止同一入库单跨采购单追加。服务端规范化业务参数后生成 SHA-256 intent hash，并在事务锁内再次检查 replay。相同 key 和 intent 只返回原始收货行、HOLD lot 与来料质检事实，key 相同但 intent 不同返回幂等冲突；写入错误或 commit 结果未知时按同一 key 回查，损坏或缺失的结果边界 fail closed。`get_purchase_receipt / list_purchase_receipts` 保留历史读取边界，不把模块关闭理解成历史数据不可查。该切片只证明 purchase 采购入库普通业务 API 的本地门禁，不代表打印或目标环境 release evidence 已闭环。

### 库存查询 `inventory`

`inventory` JSON-RPC 域只读返回库存余额、批次和流水，并支持按显式 `product_sku_id` 筛选。产品库存 grain 当前为产品 + 可选 SKU + 仓库 + 单位 + 可选批次；`inventory_lots / inventory_txns / inventory_balances`、生产 / 委外事实、出货和预留共用这一粒度，扣减、冲正、可用量和幂等匹配都不能跨 SKU。历史 `product_sku_id=NULL` 保留为未分规格产品库存，不自动回填、不作为任一 SKU 的兜底池。采购入库仍是 MATERIAL 主路径；成品 SKU 入库由生产 / 委外事实承接，不代表采购收货已支持产品 SKU。

### 进度看板 `business`

只读入口 `list_progress / get_progress` 要求 `erp.business_dashboard.read`，复用现有销售订单、生产明细、WIP、生产事实、正式出货及 Workflow；没有看板事实表。工作台仍使用 `erp.workbench.read`。旧模块数量接口 `dashboard_stats` 已退出。

| 方法 | 参数与返回 |
| --- | --- |
| `list_progress` | `view=orders/production`，`scope=active/all/ended`，`risk=all/overdue/due_soon/blocked/undated/unlinked`；支持 `keyword/owner/date_from/date_to`，`limit` 默认 20、最大 100，`offset` 最大 1,000,000。返回 `rows/total/counts/snapshot_at/access`。日期为 `YYYY-MM-DD`，非法枚举、额外参数与反向日期范围拒绝。 |
| `get_progress` | 必填正整数 `id` 和对应 `view`；返回 `row/sections/has_more/snapshot_at/access`。产品明细、生产单、工序批次、领料、关联任务各最多 100 条；`has_more` 提示到来源页继续查看，不能把截断数据当作全量。 |

进度行的 `product/product_id` 指向按显示名称稳定排序后的首款代表产品，`product_count` 保留整单款数；首款缺少正式产品关联时 `product_id=0`。列表图片继续通过 `attachment.list_product_image_references` 与缩略图下载按需读取，进度响应不携带图片二进制；读取图片仍要求 `product.read`。

订单视图要求有效的 `sales_order.read + sales_order_item.read`；生产视图要求 `pmc.plan.read` 或 `production.wip.read`，并检查对应模块可读状态。WIP、工序质检与有效完工数另需 `production.wip.read` 及质检模块可读。老板与 PMC 的客户配置模板均包含这项只读能力，不授予生产执行、返工或事实过账；已启用环境需通过正常客户配置更新采用当前模板。没有销售读取能力时，生产视图不投影客户与业务负责人。关联任务复用任务看板的 RBAC、stored revision、岗位、assignee 与监督范围，不能通过查询参数扩大权限。`access=false` 展示无权限，不展示为真实零；异常整次失败，不拼接部分成功。

`counts` 按搜索、记录范围、处理人和交期条件在数据库分页前汇总，风险可重叠；`total` 另应用所选风险。列表、数量和明细分别在各自的只读一致性事务中返回。交期统一按北京时间自然日计算；销售使用最早未交明细交期，明细缺失时采用单头交期，已结束单据不进入逾期或任务阻塞计数。

出货数量仅累计 `SHIPPED`，取消出货不计入；错联或缺失销售行时返回待核对，不给百分比。不同单位不相加。有效完工累计已登记的 `FINISHED_GOODS_RECEIPT` 并扣除已登记 `REWORK`，不由关闭生产单或任务完成推导；领料对比生产计划用量和已登记领料，不等同仓库可用量或采购齐套。未关联销售的生产单在生产视图单独筛选；无法可靠关联订单的其他协同任务仍从任务看板查询。

### 业务附件 `attachment`

`attachment` JSON-RPC 域承载业务附件证据层和窄版产品媒体槽，canonical 方法为 `list_attachments / upload_attachment / download_attachment / withdraw_attachment`；另提供 `clear_product_image`，且只接受已保存产品的 `primary / secondary` 图片槽。普通物理删除接口仍已退出；普通已上传证据只允许填写 1–255 字原因后做单向受控撤销，以 `withdrawn_at / withdrawn_by / withdrawal_reason` 全空或全有值为数据库合同。撤销行继续出现在列表并保留原文件元数据、上传审计和撤销审计，但不再允许普通预览 / 下载，也不提供恢复；相同操作者和相同规范化原因的精确重试返回首次回执，其他重复撤销返回版本冲突。产品图片固定使用 `owner_type=product + attachment_type=product_image`，只接受 PNG / JPEG / WEBP，并继续只走同槽替换 / 清空，不进入普通证据撤销。产品图片写入要求 `product.update` 和 `products=enabled`；上传或清空在同一事务内锁定 `products` 行，同槽替换失败会回滚并保留旧图，数据库 partial unique index 再约束每个产品 / 槽位最多一行。服务端在 base64 解码后按声明格式完整解码图片；宽高单边不得超过 8192px、总像素不得超过 2000 万，扩展名、声明 MIME、完整图片内容或尺寸不一致时都会拒绝。其它附件挂到既有业务对象的 `owner_type + owner_id`；上传在同一事务内锁定 owner 行并创建附件，撤销在同一事务内重新锁定 owner 和附件行并以 `withdrawn_at IS NULL` 做一次性转换，读取内容前会再次确认 owner 存在且附件未撤销。debug 清理会先清理附件再清理 owner，避免孤儿记录。单个附件上限为 5MB，HTTP `/rpc/attachment` 在 JSON / protobuf 解析前限制 7MB 编码请求体，业务层还会在 base64 解码分配前检查编码长度，并在解码后复核 5MB 上限。当前 JSON-RPC 下载仍会在内存中生成 base64 响应，因此 5MB 是低配宿主的收窄内存预算，不代表大文件流式能力已经交付。

`workflow_task` owner 额外执行行级边界：list / download 必须同时具备 `workflow.task.read` 且任务处于当前 active revision 的可见责任范围；upload 只接受 `workflow.task.update`，并要求当前账号是有效 owner scope 或指定处理人，终态任务拒绝继续追加附件。PMC / 老板 / super admin 的催办能力不等于附件写权。其它 owner 继续复用所属业务对象权限和 active module state；附件只作为证据，不改变 Source Document、Fact、Workflow、库存、质检、财务、税控或总账状态，`content_base64` 等文件内容字段在 JSON-RPC 日志中脱敏。该切片不代表对象存储、流式大文件、病毒扫描或目标环境 release evidence 已闭环。

产品任务缩略图使用已有 `download_attachment(id, variant="thumbnail")`，仍先校验所属产品的 `product.read`，再读取并校验原件完整性，生成长边最多 160px 的 PNG。该变体仅支持产品图片；不写派生文件、表或图片快照。省略 variant 保持原件下载；前端按当前账号权限范围和不可变附件 ID 去重读取，列表进入视口后加载小图，详情按需读取原图。清空或替换主图后，下一次任务投影不保留旧引用。

### 主数据 `masterdata`

`masterdata` JSON-RPC 域承载客户、供应商、联系人、材料、产品、SKU 和加工环节主数据维护。客户 / 供应商页面保存主体和联系人时应优先使用 `save_customer_with_contacts / save_supplier_with_contacts`，在一个后端事务中完成主体创建 / 更新、联系人新增 / 更新以及遗漏联系人停用，避免前端串联联系人写入留下半保存主数据；单联系人 `create_contact / update_contact / set_primary_contact / disable_contact` 仍保留为底层单对象能力。供应商主体的 `address` 是经营 / 加工地址真源，`process_ids` 是可承接工序的多选能力关系；缺省 `process_ids` 保持现状，空数组清空，非空数组整体替换，且新关联工序必须启用并允许委外。产品基础信息使用 `create_product / update_product / get_product / list_products / set_product_active`，维护产品编号、名称、款号、默认单位、可选单重和启停状态；产品页另通过 `attachment` 域维护 0–2 张产品媒体，不把图片二进制写进 `products`。SKU 使用 `create_product_sku / update_product_sku / get_product_sku / list_product_skus / set_product_sku_active`，只维护产品规格主数据和启停状态，校验归属产品与可选默认单位，不写订单、库存、BOM、生产、出货或财务事实。基础档案写入口已接入 active module states 本地门禁：客户主体和客户聚合保存要求 `customers=enabled`，供应商主体和供应商聚合保存要求 `suppliers=enabled`，联系人创建 / 更新按 `owner_type` 映射到客户或供应商模块，联系人设为主要联系人 / 停用会先读取现有联系人 owner 再按对应模块要求 `enabled`，材料写入口要求 `materials=enabled`，产品和 SKU 写入口要求 `products=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写基础档案，历史 get/list 读取仍保留。加工环节 `processes` 写入口也已接入 active module states 本地门禁：`create_process / update_process / set_process_active` 要求 `processes=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写加工环节主数据；`get_process / list_processes` 历史读取仍保留。该切片只证明 MasterData 基础档案、产品媒体和 processes 加工环节主数据的本地能力，不代表目标环境 migration、部署、打印 smoke 或 customer acceptance 已闭环。

### BOM `bom`

`bom` JSON-RPC 域承载 BOM Version / 工程资料主路径。BOM 表单只通过 `save_bom_with_items` 写入，在一个后端事务中完成草稿头创建 / 更新、明细新增 / 更新与缺失行删除；更新已有草稿必须提交当前正整数 `expected_version`，其值来自读模型的 `edit_version`。`edit_version` 由既有 `updated_at` 生成，数据层按 `id + DRAFT + updated_at` CAS 并单调推进，冲突不会留下半保存明细；业务字段 `version` 仍只表示 BOM 版次。旧 `create_bom_draft / update_bom_draft / add_bom_item / update_bom_item / delete_bom_item` 分拆写接口已退出公开路由。复制、激活、归档继续使用 `copy_bom_version / activate_bom_version / archive_bom_version`；激活会把同产品旧 `ACTIVE` 版本设为历史版本（底层状态仍为 `ARCHIVED`），已激活 BOM 不允许直接改头或明细，改版应复制新草稿后再激活。该域只维护工程资料，不生成采购需求、采购订单、库存流水、生产任务、成本、应付、发票或付款事实。所有 BOM 写入口都要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase`；历史 `list_bom_versions / get_bom_version` 读取仍保留。该切片不代表目标环境发布证据已闭环。

### 源单聚合与生命周期

销售、采购和委外的公开关闭 / 取消现在共用收窄的强动作信封：客户端提交 `expected_version + idempotency_key`，关闭再明确 `normal / short`，短结必须填写原因，取消也必须填写原因；actor 只从会话注入。`normal` 只有在各行有效履约量达到计划量时通过，委外履约只统计已过账回货，不把发料算成回货；`short` 明确终止剩余量。事务会同时终结 open 行并追加 `source-order-lifecycle-result/v1` 回执，逐行保存计划、有效履约、剩余与终态。关闭与取消继续使用各自独立 RBAC，页面只按当前状态展示一个主动作和少量次动作。

销售订单、采购订单和加工合同页面共同遵守分阶段保存合同：只有聚合保存请求本身或完整响应校验失败才能进入版本冲突 / 结果未知分支，并保持表单、不上传附件、不刷新列表；一旦保存响应给出有效 `id / version`，页面先绑定该已保存真源，再独立处理附件、明细读取和列表 / Workflow 刷新。后置失败只提示对应附件或刷新动作，不会把已保存源单重新解释为结果未知，也不会让新建重试再次以 `id=0` 创建。

### 销售订单 `sales_order`

`sales_order` JSON-RPC 域承载销售订单 Source Document / Business Commitment 主路径。订单表单只通过 `save_sales_order_with_items` 聚合写入，草稿更新使用 `id + DRAFT + version` CAS。正式提交只走 `sales_order_acceptance` 的 `sales_order.submit` 命令，并要求 repo 在同一事务写 Source 生命周期与 durable ProcessRuntime result，缺少该合同会失败关闭，不降级到普通 submit。approval 完成后自动执行 `sales_order.activate_after_approval`，在同一数据库事务写 `SUBMITTED → ACTIVE` 与 durable result；approval 拒绝自动执行 `sales_order.reject_after_workflow`，原子把仍为 `SUBMITTED` 的源单和 open 行置为取消、保存原因与 durable result，再进入 `sales_order_rejected_end`。公开 `submit_sales_order / activate_sales_order` 路由已移除，关闭 / 取消仍保留；销售订单不会写库存、出货、预留、财务、发票或收付款事实。

### 采购订单 `purchase_order`

`purchase_order` JSON-RPC 域承载采购订单 Source Document / Purchase Commitment 主路径。采购订单表单只通过 `save_purchase_order_with_items` 聚合写入并使用单头 CAS。正式页面从 `DRAFT` 启动 `material_supply`，显式执行首个 `purchase_order.submit` 命令后才进入 `workflow.task.approve`；批准后的自动命令只调用 `PurchaseOrderUsecase.ApprovePurchaseOrderForProcessCommand`，在同一事务写 `SUBMITTED → APPROVED` 与 durable result。approval 拒绝自动执行 `purchase_order.reject_after_workflow`，原子把仍为 `SUBMITTED` 的源单和 open 行置为取消、保存原因与 durable result，再进入 `purchase_order_rejected_end`。销售、采购和出货三类新实例都会校验当前图包含对应命名拒绝分支；缺少拒绝终点的旧 active revision 失败关闭，重新发布当前配置后才能继续启动，已冻结的在途实例不被代码改写。公开 `submit_purchase_order / approve_purchase_order` 路由都已移除，close / cancel 与历史查询保留。start、submit command 和审批对账都是可重试的持久步骤；任一步失败都保留可恢复证据，不把任务状态伪装成采购单状态。采购订单不写库存、批次、应付、发票或付款事实。

`start_material_supply_purchase_order_process` 只从 `DRAFT` 采购订单创建并启动 `purchase_order` ProcessInstance，要求 `purchase.order.update + purchase.order.read`；首节点 `submit_purchase_order` 只被激活，不在 start 请求里写源单。正式页面随后调用 `execute_material_supply_purchase_order_submit`，由 `PurchaseOrderUsecase.SubmitPurchaseOrderForProcessCommand` 在同一事务写 `DRAFT → SUBMITTED` 与 durable result，再创建 `workflow.task.approve` 审批任务；任务通过后内部自动命令调用唯一采购批准 usecase，写 `SUBMITTED → APPROVED` 与 durable result，流程随即进入 `end`。

当前新建 `material_supply / purchase_order_approval` 图不包含收货、IQC 或入库节点。采购从已批准订单创建收货草稿、品质逐行判定 IQC、仓库过账库存分别走正式领域页面和 usecase；审批 task done 本身不创建收货、不写质检、库存、应付或发票 Fact。公开直提与直批路由都已退役；旧长图 execute 方法只允许已冻结的旧在途 revision 继续按其原定义恢复，不能被当前 active revision 选为新流程图。

### 委外订单 `outsourcing_order`

`outsourcing_order` JSON-RPC 域承载委外订单 Source Document / Outsourcing Commitment 主路径。委外订单表单保存应优先使用 `save_outsourcing_order_with_items`；更新已有草稿同样要求正整数 `expected_version`，并在单个事务里先按 `id + DRAFT + version` CAS 递增单头版本，成功后才更新明细。提交 / 确认 / 关闭 / 取消通过 `submit_outsourcing_order / confirm_outsourcing_order / close_outsourcing_order / cancel_outsourcing_order` 推进源单状态；委外明细以 `processing_item` 单独保存“加工项目 / 部位”，不与正式 `process_id` 或 `process_*_snapshot` 工序主数据混用，并保存 `product_order_no_snapshot / product_no_snapshot / product_name_snapshot / unit_name_snapshot` 等加工合同逐行打印快照。其中 `source_order_no / product_order_no_snapshot` 只用于追溯客户产品订单 / 销售订单号，不新增销售订单外键；公开输入和输出不接受或暴露 `source_sales_order_id`，PRODUCT / MATERIAL 主体均可独立保留。`20260718125909_migrate.sql` 通过新的不可变 Atlas revision 从目标 schema 删除该伪来源列，不改写旧 migration。它不写委外事实、库存、应付、发票或付款事实。委外订单写入口已接入 active module states 本地门禁：保存和提交 / 确认 / 关闭 / 取消都要求 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `OutsourcingOrderUsecase` 写入或推进委外订单；`get_outsourcing_order / list_outsourcing_orders / list_outsourcing_order_items` 历史读取仍保留。该切片只证明 outsourcing order 委外订单 Source Document 普通业务 API 的本地门禁，不代表 outsourcing fact、打印、其它导入入口或目标环境 release evidence 已闭环。

### 生产订单 `production_order`

`production_order` 生产订单行已增加可选 `route_code` 和 `customer_inspection_required`，当前只接受固定 `PLUSH_SEW_HAND_V1` v1。工序主档使用唯一可选的 `production_route_operation_code` 显式绑定 `FABRIC_PROCESSING / SEWING / HANDWORK / PACKAGING` 四个标准路线位置；名称、类别、普通工序编码和列表排序都不是路线真源。该路线行发布时在原 BOM 材料需求快照之外，原子冻结四个工序快照和首个 WIP 批次；绑定缺失、重复或已停用时发布整体失败，不提供发布后的补初始化入口，也不按已有工序文本猜测回填。BOM 只保存技术材料用量，生产负责人从发布时冻结的需求中显式选择首道加工材料；工程不填写本厂或委外归属。历史 `route_code=NULL` 行不猜测回填路线，继续使用旧完工边界。

### 开发验收 `debug`

后端 JSON-RPC `debug` 域可生成和清理开发验收调试数据。前端业务链路调试页已移除，这组接口只作为受权限保护的后端调试能力保留；debug seed / cleanup 只处理带调试批次标记的当前领域数据：

- `debug.capabilities`：返回当前环境、仅数据库名的运行态身份、seed / cleanup / 业务数据清空是否允许和禁用原因；不返回 DSN、主机、用户或密码
- `debug.rebuild_business_chain_scenario`：生成带 debugRunId 标记的调试数据
- `debug.clear_business_chain_scenario`：按 debugRunId 预览或清理调试数据
- `debug.clear_business_data`：清空本项目当前 SQL 连接中的 V1 主数据 / 订单、Workflow、Operational Fact、采购入库、库存、BOM、工序档案、委外源单、物料、成品、仓库和单位业务表

`GET /readyz/runtime-identity` 是模拟验收写入前的窄化只读探针。调用方只提交目标身份摘要；服务端用当前 SQL 连接读取 `current_database()`，并在 133 范围同时绑定镜像 `GIT_SHA` 与 Atlas 最新 revision。生产 `erp_app` 仅为此探针获得 `atlas_schema_revisions` schema 的 `USAGE` 和规范版本表 `atlas_schema_revisions.atlas_schema_revisions` 的 `SELECT`，不得写入该表或访问 schema 内其他表。成功只返回 `matched-v1` 证明，不返回数据库名、DSN、主机、用户或密码；旧服务、错误摘要、错误 release / migration 或查询失败均 fail closed。普通 `/healthz` 与 `/readyz` 合同不变。

这三类写能力默认全部关闭：seed 需显式设置 `ERP_DEBUG_SEED_ENABLED=true`，按 debugRunId 清理需显式设置 `ERP_DEBUG_CLEANUP_ENABLED=true` 且保持 `ERP_DEBUG_CLEANUP_SCOPE=debug_run`。全量业务清空使用独立的 `ERP_DEBUG_BUSINESS_CLEAR_ENABLED=true`，只允许 `ERP_DEBUG_ENV=local|dev`；请求默认 `dryRun=true` 只统计范围，真正删除必须同时传入 `dryRun=false` 和精确确认短语 `CLEAR_ALL_PROJECT_BUSINESS_DATA`。业务数据清空不删除账号、权限、管理员偏好、配置和数据库结构，后端仍会校验管理员身份与 `debug.business.clear` 权限。

## 来源动作、流程启动与结算

公开接口从既有单据 / 事实查询候选或派生下游对象时，必须同时通过目标动作权限、精确来源读权限和来源 / 目标模块状态。统一 registry 覆盖 BOM 复制、采购入库 / 退货 / 调整、四类质检来源、生产 / WIP / 委外 / 库存预留、出货、财务与 ProcessRuntime wrapper；未登记的新来源动作、无精确读权请求或不可读 / 不可写模块会在进入来源 repository / write usecase 前 fail closed。条件来源按请求实际绑定项加权；对账先以候选读权收窄可探测范围，再按服务端读回的 authoritative FactType 要求对应应付 / 应收 / 发票读权限，不做宽泛 any-of 授权。registry 同时生成 permission usage；测试会逐项删除来源读权并断言写用例未调用，AST handler guard 还会验证每个注册 action 的真实 handler 分支调用了来源读 guard。

`customer_config` 公开提供六条来源绑定启动入口；前三条使用客户 active revision 的可配置审批责任，后三条使用 Product Core 固定异常流程合同：

| 方法 | 来源与新建状态 | 权限 |
| --- | --- | --- |
| `start_sales_order_acceptance_process` | `DRAFT` 销售订单 | `sales_order.submit + sales_order.read` |
| `start_material_supply_purchase_order_process` | `DRAFT` 采购订单 | `purchase.order.update + purchase.order.read` |
| `start_finished_goods_delivery_process` | `DRAFT` 出货单 | `shipment.create + shipment.read` |
| `start_finance_payment_approval_process` | `DRAFT` 收付款申请 | `finance.payment.create` 及来源读权限 |
| `start_inventory_adjustment_approval_process` | `DRAFT` 人工库存调整 | `warehouse.adjustment.create` 及仓库数据范围 |
| `start_production_exception_approval_process` | `SUBMITTED` 生产异常决定 | `production.exception.submit` 及来源读权限 |

创建事务锁定真实来源，从来源派生 canonical 单号并复核状态；只有完全匹配的已创建流程可精确重放。销售与采购 start 只激活首个 domain command，页面还必须用同一业务意图调用对应 `execute_*_submit` 才提交 Source Document 并创建审批任务；库存人工调整 start 后同样要显式执行 submit 命令。Shipment 首节点直接是财务 approval。收付款和生产异常按已存在的来源状态进入固定 approval 节点。start 成功不等于任一 Fact 已写入；旧 `start_material_supply_process` 和公开无来源 `create_purchase_receipt_draft / create_purchase_receipt_with_items` 均按 unknown method 处理。

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

`customer_config.start_finished_goods_delivery_process` 是新的出货审批入口。请求绑定正整数 `shipment_id`、stable business ref 和幂等键；服务端只使用 active revision。新建图从 `shipment_finance_approval` 按审批结论分支：同意走 `shipment_finance_release → end`，拒绝走 `shipment_finance_reject → shipment_finance_rejected_end`。启动前在来源事务内重验已有成品质检，流程只创建财务 `workflow.task.approve`；同意分支把版本化放行门禁写为 `APPROVED`，拒绝分支写为 `REJECTED` 并保留原因和流程锚点。正式质检、真实出货、库存 OUT、应收、发票与收付款继续由各自领域 API 办理，不能从公开 Shipment API 跳过财务放行。

财务审批 task 结算后，由对应自动领域命令写 `finance_release_status=APPROVED / REJECTED` 和流程锚点，再进入各自 end；ProcessInstance `completed` 只表示该审批分支结束，不能单独解释为已放行。两条命令都不调用 `ship_shipment`，不写库存、应收或发票。`operational_fact.ship_shipment` 在独立出货事务内只接受 `APPROVED` 门禁，并重新校验质检、销售来源数量、库存预留和可用量；全部通过后才写 `SHIPPED` 与库存 `OUT`。真实出货 / 取消冲正会把来源业务投影继续推进到 `shipped / cancelled`，生产订单关闭 / 取消和返工事实取消同理推进到 `closed / cancelled`；这些来源投影不改写既有 task status。

存量 `RELEASED` 生产订单与 `POSTED REWORK` 返工事实的缺失任务使用 `server/cmd/backfill-workflow-source-tasks` 受控修复，不属于 JSON-RPC API。命令默认事务 dry-run，apply 要求精确确认数据库名；它不推断历史任务 `done / rejected`，也不扫描或推断 `DRAFT` 出货单曾经提交。具体命令见 [来源任务修复](runtime.md#来源任务修复)。

## 已退出运行时的旧接口

以下旧接口不属于当前 API，调用时按未知业务域或未知方法处理：

- `auth.login`
- `user.list`
- `user.set_disabled`
- `user.reset_password`

## 隐私规则知悉 API

`admin.legal_notice_status` 与 `admin.acknowledge_legal_notice` 只接受：

- `notice_version`：1–64 位稳定版本，只允许字母、数字、点、下划线和连字符。
- `content_fingerprint`：16–64 位小写十六进制内容指纹。

两者都只操作当前已登录且启用的管理员账号，不要求额外业务权限，也不能替其他账号确认。状态查询返回 `notice_version / content_fingerprint / acknowledged / acknowledged_at`；确认接口幂等复用相同回执。后端把账号 ID 和内容指纹组成精确审计事件 key，payload 只含账号 ID、账号名、规则版本、内容指纹和时间，不保存手机号、密码、token 或规则正文。“已阅读并知悉”只证明告知送达，不等于所有个人信息处理均以同意为依据。

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
- 其他错误码统一来源于 `server/internal/errcode/catalog.go`

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

### `admin.change_password`

所有正常登录账号均可修改本人的密码，包括超级管理员，不要求账号管理权限。桌面入口为右上角账号菜单的“修改密码”；岗位任务端入口为“我的 → 入口与安全 → 修改密码”。

请求只接受两个字符串字段：

- `old_password`：旧密码，按原值核验，不去除首尾空白。
- `new_password`：新密码，沿用 8～20 个 Unicode 字符且不超过 72 个 UTF-8 字节的规则，不能与旧密码相同。前端要求再次输入确认，确认值不发送至服务端。

账号 ID 从登录态确定，不接受指定其他账号、认证版本或任何额外字段。旧密码错误返回 `AuthInvalidPassword`；凭据在核验或写入期间发生变化返回 `AuthCredentialsChanged`。服务端在锁定账号后再次核对账号状态、已验证的密码哈希及认证版本，避免并发重置被旧请求覆盖。

密码更新、递增 `auth_version`、注销全部 active admin session 和 `admin_user.password.change` 审计在同一事务完成，任一步失败全部回滚。成功后桌面和手机端清除当前登录态，返回统一登录页；旧密码和旧 token 不再可用。网络响应异常时页面提示重新登录确认结果，不自动重试改密。审计只记录本人操作、会话注销数量和原因，不记录密码、哈希或 token。

### `admin.reset_default_password`

仅超级管理员可以使用，请求只接受正整数 `id`；默认密码由服务端固定为 `12345678`，不能由请求覆盖。普通管理员即使有 `system.user.update` 权限也不能调用此快捷操作，服务端在事务内再次核对操作者的超级管理员身份。

入口位于“权限管理 → 员工账号 → 重置密码”弹窗中的“重置为 12345678”按钮；点击即执行，无需填写新密码。沿用普通重置的目标保护规则：可以重置正常或临时停用的普通账号，不能重置已注销账号或超级管理员账号，也不会顺带启用账号。成功后旧会话全部失效，界面提示提醒本人登录后改密；不增加强制首次改密状态。

操作复用 `admin_user.password.reset` 审计，通过非敏感的 `reset_to_default` 标记区分默认密码与指定新密码，不保存密码值。

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

## 接单、工程打样与用料审批 / Order Engineering Material Review

销售订单行可先填写 `requested_product_name`、`customer_product_no`、`order_category`、`process_requirement`、数量、单位及 `pre_shipment_sample_quantity`，此时 `product_id` / `product_sku_id` 可空。产品和 BOM 由 `sales_order.save_sales_order_engineering` 单独关联，要求 `expected_version`，关联 BOM 时还要求 `expected_bom_version`。工程状态为 `PREPARING / SAMPLING / CONFIRMED`；确认与退回说明均由服务端验证，返单 `reuse_confirmed_sample` 只复用同客户相同资料的已确认样品。工程动作不能修改商务价格。

| 域 / 方法 | 输入与权限 | 结果与边界 |
| --- | --- | --- |
| `sales_order.get_engineering_material_request` | `sales_order_id`、可选 `preview`；`engineering.material.read` 和销售来源读取 | 最新审批或现时汇总、部位来源与阻塞原因，价格按敏感字段权限隐藏 |
| `sales_order.submit_engineering_material_request` | `sales_order_id`、`expected_version`、`expected_source_hash`；`engineering.material.submit` | 生成不可改写的订单材料快照；版本变化拒绝提交 |
| `sales_order.boss_review_engineering_material_request` | `id`、`expected_version`、`BOSS_APPROVE / REJECT`、备注；`engineering.material.boss_approve` | 老板审核或有原因退回 |
| `sales_order.finance_review_engineering_material_request` | `id`、`expected_version`、`FINANCE_APPROVE / REJECT`、备注及可选任务版本；财务审批和工程用料、销售订单读取权限 | 不接收 `items` 或核价参数；另一位财务批准后按冻结应需数量、按厂商原子生成 approved 采购单，单价、金额和预计到货日期留空；精确重试返回同批单据，退回必须说明原因且不生成采购单 |
| `production_wip.prepare_production_outsourcing_order` | `production_wip_batch_id`、`expected_version`、`supplier_id`、`expected_return_date`、首道的 `requirement_ids`；生产安排及来源读取权限 | 按生产负责人明确选择生成委外草稿，数量来自冻结需求或 WIP 批次；不接收客户端数量、价格或操作者覆盖 |

用料审批不自动扣库存、付款或创建 Workflow 任务；委外草稿仍须补价确认，发料、回货、IQC 与入库沿用独立事实动作。材料接口增加 `supplier_id / supplier_name`；厂商、料号、色号构成材料身份。BOM 的部位行不再接收生产归属标记。

### 材料库存类别与仓库

`masterdata.create_material / update_material` 使用 `stock_category`（`MAIN / AUXILIARY / PACKAGING / OTHER / UNCLASSIFIED`）和可空 `default_warehouse_id`；`category` 仍保存细分分类。材料更新采用完整字段覆盖，默认仓为空即清除。默认仓必须启用且与库存类别相容。

`masterdata.create_warehouse / update_warehouse` 接收 `code / name / type / is_active`，修改还要求正整数 `id`。用途为 `MAIN_MATERIAL / AUXILIARY_MATERIAL / PACKAGING_MATERIAL / OTHER_MATERIAL / MATERIAL / FINISHED_GOODS / UNCLASSIFIED`。要求 `warehouse.manage` 和仓库数据范围，新增要求全部仓库范围。冲突的正库存或默认仓关联阻止类别变更和停用。`list_warehouses` 保持库存读取权限与仓库范围；`list_material_warehouses` 只返回启用材料仓的主数据选项，要求 `material.read`，不返回库存事实。

`purchase.create_purchase_receipt_from_purchase_order` 可通过 `item_warehouses: [{purchase_order_item_id, warehouse_id}]` 逐行选择入库仓；全部待收行均有选择时可省略整单 `warehouse_id`。指定不存在、已收完或非本订单的行会拒绝整单。每行仓库参与幂等请求摘要，重放不能偷偷替换仓库；当前账号必须有全部目标仓的访问范围。生成草稿不增加库存。

`inventory.list_inventory_balances / list_inventory_lots / list_inventory_txns` 支持 `stock_category` 筛选（与 `PRODUCT` 互斥），列表返回材料当前 `stock_category`。分类在服务端计数和分页前过滤；库存作业详情的材料行也返回该只读字段。新入库与库存增加统一验证用途和启用状态，原始流水的合法冲正与原请求重放保留。
