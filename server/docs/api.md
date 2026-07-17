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
- `set_roles`
- `set_role_permissions`
- `set_phone`
- `set_erp_column_order`
- `set_disabled`
- `revoke`
- `reset_password`

用途：管理员读取当前账号资料；具备对应系统权限的管理员创建管理员、绑定登录手机号、给管理员分配角色、给角色分配权限、启用 / 禁用普通管理员，以及在普通管理员忘记密码时协助重置密码。

### `workflow`

- `metadata`
- `list_tasks`
- `get_task_board`
- `list_business_states`
- `explain_action_access`
- `explain_task_assignment`
- `create_task`
- `complete_task_action`
- `block_task_action`
- `reject_task_action`
- `urge_task`

用途：读取和处理 Workflow 协同任务。`create_task` 只用于普通、无流程关联的协同任务；生产排程、生产异常和出货放行使用保留 task group 与确定性编号，不能通过该方法、ProcessRuntime 节点或客户流程配置伪造。

### `operational_fact`

该域承载已登记的生产、委外、出货、库存预留和财务事实方法。出货主路径当前包括：

- `create_shipment_with_items`
- `submit_shipment_release`
- `ship_shipment`
- `cancel_shipment`
- `list_shipments`

用途：创建出货草稿、显式提交放行、确认真实出货、取消已出货单并冲正库存，以及查询出货单。`submit_shipment_release` 生成 Workflow 任务，`ship_shipment` 才写 `SHIPPED` 与库存 `OUT`，两步不能合并理解。

### `production_wip`

该域承载固定 `PLUSH_SEW_HAND_V1` v1 的路线快照、WIP 批次和工序动作：

- `get_production_wip`
- `initialize_production_wip`
- `execute_production_wip_action`

`get_production_wip` 需要 `production.wip.read`；生产订单的 `get_production_order` / `list_production_orders` 同时接受 `pmc.plan.read` 或 `production.wip.read`，但新建、编辑、发布、关闭、取消和引用选项仍只属于 PMC 计划权限。这样业务岗位可进入生产订单页只读核对路线并办理包材确认，不会获得生产计划维护权。

`initialize_production_wip` 需要 `production.wip.assign`。`execute_production_wip_action` 的通用参数是 `action`、`production_order_id`、`expected_version` 和 `idempotency_key`，动作合同如下：

| action | 追加参数 | 权限 |
| --- | --- | --- |
| `SPLIT_BATCH` | `production_wip_batch_id`、`splits[]` | `production.wip.assign` |
| `ASSIGN_EXECUTION` | `production_wip_batch_id`、`execution_mode`、`outsourcing_allocations[]` | `production.wip.assign` |
| `START_OPERATION` / `COMPLETE_OPERATION` / `RECEIVE_OUTSOURCING_RETURN` | `production_wip_batch_id` | `production.wip.execute` |
| `TRANSFER_TO_NEXT_OPERATION` | `production_wip_batch_id`、`target_operation_id`、`quantity` | `production.wip.execute` |
| `REWORK` | `production_wip_batch_id`、`target_operation_id`、`quantity`、`reason` | `production.wip.rework` |
| `CONFIRM_PACKAGING_MATERIAL` | `production_order_item_id`、`packaging_version_snapshot`、可选 `note` | `production.packaging_material.confirm` |

`production_orders` 与 `quality_inspections` 必须处于可读 / 可写的对应模块状态；外发安排和外发回仓还要求 `outsourcing_orders` 可写。批次拆分是一次原子动作，至少两个子批且总量必须精确等于父批；首道 `FABRIC_PROCESSING` 正常流禁止拆分，只能按生产订单行整单外发。其 allocation 必须且只能逐条覆盖冻结需求中显式标记 `production_operation_code=FABRIC_PROCESSING` 的 MATERIAL 合同行，开始前还要有足量已过账委外发料，不按材料名称或类别文本推断。裁片关口 `PASS` 并转入 `SEWING` 后，产品数量才可拆批；车缝和手工各自决定本厂或外发。返工回到 FABRIC 后若再次外发，返工批次使用新的 PRODUCT 合同行，不复用正常流 MATERIAL 行。生产订单仍有 `PLANNED / IN_PROGRESS / OUTSOURCED / WAITING_QUALITY` 批次时，`close_production_order` 即使带短关闭原因也会失败；`SPLIT` 父批由子批承接，只有其非终态子批继续阻断，系统不会在关闭时自动取消 WIP、冲正发料或替代外发收口。

内部完成后的下一道流转记录为 `WIP_TRANSFER`；只有外发完成返回记录为 `OUTSOURCE_RETURN`。裁片、皮套、成品、针检、抽检和订单条件性客户验货是独立质量关口，当前只有 `PASSED + PASS` 可继续转序，通用 `CONCESSION` 对生产 WIP fail closed。包装开始前还必须有独立包材业务确认；路线订单的最终完工入库数量不得超过已验收包装 WIP。

### `quality`

`list_production_stage_quality_inspections` 以 `production_wip_batch_id`、`gate_code`、状态、结果、关键字和日期范围读取生产分段质检，要求 `quality.inspection.read`，并要求 `production_orders` 与 `quality_inspections` 模块可读。生产关口质检仍使用通用 `submit_quality_inspection`、`pass_quality_inspection`、`reject_quality_inspection` 和 `cancel_quality_inspection` 办理，但生产 WIP 的推进规则只接受最终 `PASS`，不把其他来源侧链现有的让步语义扩到生产路线。

上述路线 / WIP / 分段质检合同当前是本地源码和版本化 Atlas migrations 证据；migrations 尚未 apply 到共享开发库或目标客户数据库，也没有目标环境发布、health / smoke 或客户 UAT 证据。

## 来源任务与出货放行合同

三类来源任务由后端领域事务唯一生成：

| 业务动作 | 任务组 | 来源 | 责任岗位 | 确定性任务编号 |
| --- | --- | --- | --- | --- |
| 生产订单从 `DRAFT` 下达到 `RELEASED` | `production_scheduling` | `production-orders` | PMC | `source-production-scheduling-<生产订单ID>` |
| 来源完工事实创建的返工事实从 `DRAFT` 过账到 `POSTED` | `production_exception` | `production-progress` | 生产 | `source-production-exception-<返工事实ID>` |
| `DRAFT` 出货单显式提交放行 | `shipment_release` | `shipments` | 仓库 | `source-shipment-release-<出货单ID>` |

三类任务 payload 都携带 `source_task_contract=workflow.source-task/v1`、固定 producer 和来源意图摘要。对应 task group 与任务编号前缀是保留命名空间；公开 `workflow.create_task`、ProcessRuntime 显式 / node-key 回退任务组和客户流程人工 / 审批节点均会拒绝占用。该约束防止普通任务冒充来源任务，不把 payload 变成 Production、Shipment、Inventory、Quality 或 Finance 真源。

`operational_fact.submit_shipment_release` 的业务请求只提交：

- `id`：正整数 `DRAFT` 出货单 ID。

后端锁定出货单并校验明细与当时的出货前成品检验集合；没有检验时按当前可选检验策略提交，一旦存在非取消检验，则必须全部达到 `PASSED + PASS / CONCESSION`。成功返回：

- `workflow_task`：来源生成的放行任务。
- `created`：本次是否新建；精确重放返回同一任务并为 `false`。

前端必须核对任务 ID / version、确定性编号、任务组、来源类型与 ID、仓库责任岗位、task status / business status、`workflow.source-task/v1`、producer 和来源意图摘要；结构不完整或与请求来源不一致时按结果无法确认处理，不能提示提交成功。

放行任务完成只把协同投影推进到 `shipping_released`，不调用 `ship_shipment`，不写库存、应收或发票。`operational_fact.ship_shipment` 会在同一出货事务内重新核对上述完整来源合同并要求 task status 为 `done`，然后继续校验冻结的质检集合、销售来源数量、库存预留和可用量；全部通过后才写 `SHIPPED` 与库存 `OUT`。真实出货 / 取消冲正会把来源业务投影继续推进到 `shipped / cancelled`，生产订单关闭 / 取消和返工事实取消同理推进到 `closed / cancelled`；这些来源投影不改写既有 task status。

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

岗位任务端请求 `auth.send_sms_code` 和 `auth.sms_login` 时会额外携带 `mobile_role_key`。对格式合法的手机号，发码接口始终返回相同的“验证码已发送”受理合同；服务端只在账号存在、active 且具备 `mobile.<role>.access` 时实际请求短信发送，账号资格、查询失败或短信供应商失败只进入内部脱敏日志，不能从公开响应判断手机号是否绑定管理员或具备岗位资格。

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
