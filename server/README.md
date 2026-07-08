# server 后端说明

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 环境版本

后端 Go 版本以 `server/go.mod` 为准：`go 1.25.0`，当前 toolchain 为 `go1.26.4`。本机检查走仓库根目录的 `scripts/doctor.sh`，该脚本会在 `server/` 模块内读取实际 Go toolchain，避免只看仓库根目录默认 Go 版本造成误判。

```bash
cd /Users/simon/projects/plush-toy-erp
bash scripts/doctor.sh
```

若 `doctor` 报 Go 低于 `1.26.4`，先升级 Go 或启用 Go toolchain 自动切换，再执行 `make init`、`make data`、`go test` 或 migration 相关命令。

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / gRPC / JSON-RPC 接入层
- `service`：DTO 转换、JSON-RPC URL / method 分发、入口级鉴权与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

## 开发验收 debug 能力

后端 JSON-RPC `debug` 域可生成和清理开发验收调试数据。前端业务链路调试页已移除，这组接口只作为受权限保护的后端调试能力保留；旧 `business_records / business_record_items / business_record_events` 表族已由 `20260612112337` migration 删除，debug seed / cleanup 不再写旧通用业务记录：

- `debug.capabilities`：返回当前环境、seed / cleanup / 业务数据清空是否允许和禁用原因
- `debug.rebuild_business_chain_scenario`：生成带 debugRunId 标记的调试数据
- `debug.clear_business_chain_scenario`：按 debugRunId 预览或清理调试数据
- `debug.clear_business_data`：清空本项目当前 SQL 连接中的 V1 主数据 / 订单、Workflow、Operational Fact、采购入库、库存、BOM、工序档案、委外源单、物料、成品、仓库和单位业务表

这些接口默认面向当前 SQL 连接开启。可用 `ERP_DEBUG_SEED_ENABLED=false` 或 `ERP_DEBUG_CLEANUP_ENABLED=false` 显式关闭写操作；清理类能力仍要求 `ERP_DEBUG_CLEANUP_SCOPE=debug_run`。业务数据清空不删除账号、权限、管理员偏好、配置和数据库结构。后端还会校验管理员身份和 debug 权限。

## 业务领域 JSON-RPC / Domain JSON-RPC

采购入库已接入独立 `purchase` JSON-RPC 域，当前只覆盖既有 `purchase_receipts / purchase_receipt_items` 事实主路径：

- `create_purchase_receipt_draft`
- `add_purchase_receipt_item`
- `post_purchase_receipt`
- `cancel_purchase_receipt`
- `get_purchase_receipt`
- `list_purchase_receipts`

这组接口走 `InventoryUsecase` 和既有采购入库事实表，过账写 `inventory_txns.IN`，取消已过账入库写 `REVERSAL`。公开入库 API 不接受 `business_record_id` 作为正式事实来源；`purchase.receipt.create / purchase.receipt.read / warehouse.inbound.confirm` 只控制采购入库 API 权限，不代表 Workflow 任务完成会自动过账库存事实。

普通 `business` JSON-RPC 域当前只保留业务看板 `dashboard_stats`。旧 `list_records / create_record / update_record / delete_records / restore_record` 已退出运行时，不能恢复为事实或历史快照查询入口。

`workflow` JSON-RPC 域承载 Workflow 协同任务主路径。任务列表按当前管理员 owner role、assignee、active customer config 责任池成员 `role_key`、PMC / 老板催办边界和 super admin 收口；由责任池扩出的 owner role 必须在同一 active revision 下由同一条 entitlement 同时命中当前任务场景所需 workflow task capability 和当前 customer scope，列表按同 scope 的 `workflow.task.read`，完成 / 阻塞 / 退回 / 催办按同 scope 的对应 action permission 过滤，避免把一个角色的动作权限、另一个责任池 membership 或另一个 customer scope 的 entitlement 拼接成处理资格；完成 / 阻塞 / 退回动作只走 `complete_task_action / block_task_action / reject_task_action`，旧 `update_task_status` 已退出 JSON-RPC 运行时。服务端按当前管理员、任务责任角色、指派人和服务端解析出的可见 owner role 集合推导事件 `actor_role_key`，不采信前端提交的 raw `task_status_key` 或 `actor_role_key`。只读解释接口 `explain_action_access / explain_task_assignment` 用于返回当前账号为什么能或不能完成、阻塞、退回、催办某个任务，以及当前账号与 owner / assignee / 责任池 / PMC / 老板 / super admin 的任务归属关系；action explain 会返回 `required_permission`、`owner_role_key`、`visible_owner_role_keys`、`candidate_owner_role_keys`、`work_pool_role_matched`、`work_pool_entitlement_scope_matched` 和 `actor_role_key`，并额外返回 `configured_candidate_owner_role_keys / configured_membership_role_keys / configured_entitled_role_keys / configured_candidate_source`，按 active customer config 的 owner pool、当前 action capability 和 customer scope 反查配置候选责任角色；assignment explain 会返回各动作 `action_required_permissions`、`action_candidate_owner_role_keys`、`action_work_pool_scope_matches`、`action_configured_candidate_owner_role_keys` 与 `action_configured_candidate_sources`。只读解释还会返回 `domain_command_entry / action_domain_command_entries`：当前 `enabled=false`、`will_write_fact=false`，用于说明 task action 仍保持 Workflow-only，并列出正式接入领域命令前必须具备的 command key、domain usecase binding、stable business ref、idempotency、RBAC、append-only audit、重复提交测试和取消 / 冲正策略；workflow payload 里的 `command_key` 不会被采信为事实命令。super admin 当前保留查看和催办类诊断边界，但不通过普通任务动作默认处理业务任务；`complete_task_action / block_task_action / reject_task_action` 支持单次受控 break-glass，必须显式传入 `break_glass=true`、非空 `break_glass_reason` 和不超过 2 小时的 `break_glass_expires_at`，并且在任务状态更新前写入 `workflow_task.break_glass` 高风险请求审计，payload 记录 `requested_next_status_key`，事件 actor role 固定为 `admin`；任务是否实际更新成功仍以随后 `workflow_task_events` 和任务状态为准。该机制不是长期 break-glass session、审批流、客户可见岗位能力或生产放行证据。它们不写库存、出货、质检、财务或其他 Fact，也不暴露 entitlement ID、user-level 候选人或全局候选人清单。

`attachment` JSON-RPC 域承载业务附件证据层，当前支持 `list_attachments / upload_attachment / download_attachment / delete_attachment`。附件挂到既有业务对象的 `owner_type + owner_id`，服务端会校验 owner 真实存在，并按所属业务对象复用读写权限；上传限制为单个附件 50MB 以内，允许图片、PDF、Word、Excel、CSV、文本、HEIC/HEIF、ZIP、邮件证据和 WPS 文件。附件写入口已接入 active module states 本地门禁：`upload_attachment / delete_attachment` 会按 `owner_type` 映射到 `sales_orders / purchase_orders / outsourcing_orders / purchase_receipts / quality_inspections / shipments / finance / production / products / material_bom / workflow_tasks` 等所属模块，要求对应模块为 `enabled`；`read_only / disabled / 缺失` 会返回参数错误且不创建或删除附件。`list_attachments / download_attachment` 历史读取仍保留。附件只作为证据，不改变 Source Document、Fact、Workflow、库存、质检、财务、税控或总账状态；`content_base64` 等文件内容字段在 JSON-RPC 日志中脱敏。该切片只证明 attachment 证据写 API 的本地门禁，不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`masterdata` JSON-RPC 域承载客户、供应商、联系人、材料、产品、SKU 和加工环节主数据维护。客户 / 供应商页面保存主体和联系人时应优先使用 `save_customer_with_contacts / save_supplier_with_contacts`，在一个后端事务中完成主体创建 / 更新、联系人新增 / 更新以及遗漏联系人停用，避免前端串联联系人写入留下半保存主数据；单联系人 `create_contact / update_contact / set_primary_contact / disable_contact` 仍保留为底层单对象能力。产品基础信息使用 `create_product / update_product / get_product / list_products / set_product_active`，只维护产品编号、名称、款号、默认单位和启停状态，校验默认单位，不写订单、库存、BOM、生产、出货或财务事实。SKU 使用 `create_product_sku / update_product_sku / get_product_sku / list_product_skus / set_product_sku_active`，只维护产品规格主数据和启停状态，校验归属产品与可选默认单位，不写订单、库存、BOM、生产、出货或财务事实。基础档案写入口已接入 active module states 本地门禁：客户主体和客户聚合保存要求 `customers=enabled`，供应商主体和供应商聚合保存要求 `suppliers=enabled`，联系人创建 / 更新按 `owner_type` 映射到客户或供应商模块，联系人设为主要联系人 / 停用会先读取现有联系人 owner 再按对应模块要求 `enabled`，材料写入口要求 `materials=enabled`，产品和 SKU 写入口要求 `products=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写基础档案，历史 get/list 读取仍保留。加工环节 `processes` 写入口也已接入 active module states 本地门禁：`create_process / update_process / set_process_active` 要求 `processes=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写加工环节主数据；`get_process / list_processes` 历史读取仍保留。该切片只证明 MasterData 基础档案与 processes 加工环节主数据普通业务 API 的本地门禁，不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`sales_order` JSON-RPC 域承载销售订单 Source Document / Business Commitment 主路径。订单表单保存应优先使用 `save_sales_order_with_items`，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；任一步失败会整体回滚，不由前端串联多个订单行接口拼装一次保存流程。原有 `create_sales_order / update_sales_order / add_sales_order_item / update_sales_order_item / remove_sales_order_item` 仍保留为底层单对象能力，不写库存、出货、预留、财务、发票或收付款事实。销售订单写入口已接入 active module states 本地门禁：订单头创建 / 更新 / 保存、订单行新增 / 更新 / 移除和提交 / 激活 / 关闭 / 取消都要求 `sales_orders=enabled`，历史 get/list 读取仍保留；该切片不代表其它后端业务 API、打印、其它导入入口或目标环境 release evidence 已闭环。

`purchase_order` JSON-RPC 域承载采购订单 Source Document / Purchase Commitment 主路径。采购订单表单保存应优先使用 `save_purchase_order_with_items`，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；同时支持 `submit_purchase_order / approve_purchase_order / close_purchase_order / cancel_purchase_order / get_purchase_order / list_purchase_orders / list_purchase_order_items`。采购订单只表达供应商采购承诺，采购入库行可选关联 `purchase_order_item_id` 做来源追溯；它不写库存、批次、应付、发票或付款事实。采购订单写入口已接入 active module states 本地门禁：订单头创建 / 更新 / 保存、订单行新增 / 更新 / 移除和提交 / 审批 / 关闭 / 取消都要求 `purchase_orders=enabled`，历史 get/list 读取仍保留；该切片不代表采购入库、其它后端业务 API、打印、其它导入入口或目标环境 release evidence 已闭环。

`outsourcing_order` JSON-RPC 域承载委外订单 Source Document / Outsourcing Commitment 主路径。委外订单表单保存应优先使用 `save_outsourcing_order_with_items`，提交 / 确认 / 关闭 / 取消通过 `submit_outsourcing_order / confirm_outsourcing_order / close_outsourcing_order / cancel_outsourcing_order` 推进源单状态；它不写委外事实、库存、应付、发票或付款事实。委外订单写入口已接入 active module states 本地门禁：保存和提交 / 确认 / 关闭 / 取消都要求 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `OutsourcingOrderUsecase` 写入或推进委外订单；`get_outsourcing_order / list_outsourcing_orders / list_outsourcing_order_items` 历史读取仍保留。该切片只证明 outsourcing order 委外订单 Source Document 普通业务 API 的本地门禁，不代表 outsourcing fact、打印、其它导入入口或目标环境 release evidence 已闭环。

`bom` JSON-RPC 域承载 BOM Version / 工程资料主路径。当前支持 `list_bom_versions / get_bom_version / create_bom_draft / update_bom_draft / add_bom_item / update_bom_item / delete_bom_item / copy_bom_version / activate_bom_version / archive_bom_version`。BOM 草稿可维护头信息和明细；激活会把同产品旧 `ACTIVE` 版本设为历史版本（底层状态仍为 `ARCHIVED`），已激活 BOM 不允许直接改头或明细，改版应复制新草稿后再激活。该域只维护工程资料，不生成采购需求、采购订单、库存流水、生产任务、成本、应付、发票或付款事实。BOM 写入口已接入 active module states 本地门禁：草稿创建 / 更新、复制、激活、归档和明细新增 / 更新 / 删除都要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 BOM 头或明细；`list_bom_versions / get_bom_version` 历史读取仍保留。该切片只证明 material BOM 工程资料普通业务 API 的本地门禁，不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`admin` JSON-RPC 域承载后台管理员、角色和权限管理。当前系统控制面审计入口为 `audit_logs`，受 `system.audit.read` 权限控制，只读返回 `runtime_audit_events` 中的启动初始化、账号 / 角色 / 权限变更和客户配置版本控制事件；支持按 `source / event_type / event_key / actor_key / target_type / target_key / keyword / created_from / created_to` 查询，并返回 `risk_level / action_label / summary / actor_key / target_type / target_key` 供前端定位。账号创建、角色绑定、账号启停、重置密码、角色权限变更、客户配置 publish / activate 会追加非敏感摘要，不保存密码、token、密码 hash、compiled snapshot 或客户 raw 配置。该审计表不是采购、库存、质检、出货、财务等业务动作的通用审计事实表。

`customer_config` JSON-RPC 域承载客户配置版本控制面能力，当前支持 `validate_customer_config / publish_customer_config / activate_customer_config / rollback_customer_config / get_effective_session / explain_module_status / explain_process_definition / start_sales_order_acceptance_process / execute_sales_order_acceptance_submit / start_material_supply_process / start_material_supply_purchase_order_process / execute_material_supply_purchase_receipt_create / execute_material_supply_quality_decide / execute_material_supply_post_inbound / start_finished_goods_delivery_process / execute_finished_goods_delivery_quality_decide / execute_finished_goods_delivery_finance_release / execute_finished_goods_delivery_shipment_ship / execute_finished_goods_delivery_receivable_lead`。`publish` 只接受受控编译后的配置 revision，写入 `customer_config_revisions / deployment_module_states / role_profiles / access_entitlements / work_pools / work_pool_memberships`，active revision 不允许覆盖；`publish / activate` 会在同一事务追加脱敏 `runtime_audit_events`，记录 actor、customer / revision、config hash、计数和状态，不保存 compiled snapshot 或 raw 配置；`get_effective_session` 会按当前管理员角色返回页面、动作、字段策略和责任池投影，其中页面清单只取后端 RBAC 菜单与 active revision 页面配置的交集，不允许客户配置扩大权限。`explain_module_status` 只读返回某模块在 active revision 下的产品包含、成熟层、客户部署状态、依赖、角色 / 责任池 / 页面 / 流程引用，以及启用 / 关闭阻断原因；当前已接入 active / blocked 流程实例数、未完成 WorkflowTask 数和核心业务表未结单据数，runtime count source 为 `process_workflow_business_partial`，不代表真实模块关闭已经可执行。`explain_process_definition` 只读返回 active revision 中某个 process definition 的 manifest 状态、loader 状态、节点命令合同、runtime blocker 和是否可启动，不创建 ProcessInstance、不执行 domain command、不写 Fact。

该域里的流程运行时入口只做显式启动和显式领域命令执行，不上传任意客户包文件，不提供普通运行时 `install_module / uninstall_module / upload_plugin`，不导入真实业务数据，也不绕过领域 usecase 和后端 RBAC 校验。所有 `customer_config.execute_*` 显式流程命令在调用 `ExecuteDomainCommandNode` 前都会通过 `EnsureProcessDomainCommandModulesEnabled` 按 active revision module states 校验命令引用模块，非 `enabled` 时返回参数错误且不调用领域 usecase；这只是 `customer_config` execute API 的本地门禁，不等于普通业务 JSON-RPC、打印或其它导入入口已经全链路阻断。`start_sales_order_acceptance_process` 只从 active customer config 受控构造并显式创建 / 启动销售订单接单 ProcessInstance，要求 `sales_order.submit` 权限，返回 runtime boundary，不执行 domain command、不写 Fact、不替代正式 UI；`execute_sales_order_acceptance_submit` 只执行已 active 的 `submit_sales_order` 节点，要求调用方提供 process instance、process node、expected version、销售订单 ID 和幂等键，成功后调用 `sales_order.submit` domain command 提交销售订单 Source Document，并推进到老板审批 linked task，仍不写库存、出货、质检、财务或其他 Fact。`start_material_supply_process` 覆盖已有采购入库单的窄版显式链路，只创建并启动 `purchase_receipt` ProcessInstance；`start_material_supply_purchase_order_process` 覆盖采购订单显式链路，只创建并启动 `purchase_order` ProcessInstance；`execute_material_supply_purchase_receipt_create` 显式执行 `purchase_receipt.create`，通过 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder` 创建采购收货草稿，并把生成的 `purchase_receipt` 记录到 `module_contract_snapshot.linked_business_refs`；`execute_material_supply_quality_decide` 和 `execute_material_supply_post_inbound` 后续通过 `ProcessInstanceHasBusinessRef` 识别该 linked ref，分别显式调用质检判定和采购入库过账 usecase。这里的入库过账只来自显式 `execute_material_supply_post_inbound`，不是 Workflow task done、manifest human_task 节点或后台 loader 自动写 Fact。

ProcessInstance 的业务引用唯一性由 `process_key + business_ref_type + business_ref_id` 约束。同一业务引用使用同一 `idempotency_key` 重试创建时返回已有流程实例和节点；同一业务引用换一个 `idempotency_key` 再启动会被拒绝为重复流程，避免同一销售订单、采购订单、采购入库单或出货单生成多条并行流程。重复调用 `StartProcessInstance` 时，如果首节点已经是 `active`，会返回同一个 active 首节点，不重复创建 linked WorkflowTask，也不推进后续节点。

`purchase` JSON-RPC 域里的采购入库写入口已接入 active module states 本地门禁：`create_purchase_receipt_draft / create_purchase_receipt_with_items / create_purchase_receipt_from_purchase_order / add_purchase_receipt_item / post_purchase_receipt / cancel_purchase_receipt` 会分别要求 `purchase_receipts`、`purchase_orders` 或 `inventory` 为 `enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 Source Document 或库存事实。`get_purchase_receipt / list_purchase_receipts` 保留历史读取边界，不把模块关闭理解成历史数据不可查。该切片只证明 purchase 采购入库普通业务 API 的本地门禁，不代表其它业务 JSON-RPC、打印、其它导入入口或目标环境 release evidence 已闭环。

active revision 的 `work_pool_memberships.role_key` 可被 Workflow 服务端用于收窄当前账号任务可见 owner role 集合，但只有同一 revision 的同一条 `access_entitlements` 同时命中该 role、当前 workflow action capability 和当前 customer scope 时才会扩展处理资格；`workflow_tasks.owner_pool_key / required_capability_key / config_revision / process_instance_id / process_node_instance_id` 当前只作为新任务 runtime 解释锚点、配置版本线索和流程节点追踪锚点，旧任务可为空；ProcessRuntime 可显式启动 active ProcessInstance 的首个 waiting 节点，首节点为 `human_task / approval` 时才创建 linked WorkflowTask；ProcessRuntime 只允许从 `active` 且 `expected_version` 匹配当前节点版本的 `human_task / approval` 节点显式创建 linked WorkflowTask，未显式传 `owner_role_key` 时只接受 active customer config 解析出的唯一候选 owner role，相同 `task_code` 的同一节点重试会返回已有任务，也可读取已 `done` 的 linked WorkflowTask 完成当前 ProcessNodeInstance；`complete_task_action` 成功完成 linked WorkflowTask 后会受控触发当前节点完成，并按顺序、命名 policy、fan-out / join 或受控 returnTo attempt 路由激活下一组节点；刚激活的 `human_task / approval` 会复用 `CreateLinkedWorkflowTask` 创建下一 linked WorkflowTask，刚激活的 `end` 会完成 end 节点并把 ProcessInstance 标记为 completed，`domain_command / wait_event` 只进入 active 等待显式执行 / 唤醒；旧 `update_task_status` 已退出运行时，且系统仍不会由后台 scheduler 自动启动流程、自动扫描流程定义、自动扫描 overdue、跳过节点、为 `domain_command / wait_event / end` 创建 WorkflowTask、把任务完成自动绑定到 domain handler、发送提醒升级通知或直接新增任务事实字段。

`workflow` JSON-RPC 写入口已接入 active module states 本地门禁：`create_task / complete_task_action / block_task_action / reject_task_action / urge_task / upsert_business_state` 要求 `workflow_tasks=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 Workflow usecase 写任务、事件或业务状态；旧 `update_task_status` 已退出运行时，调用会返回 unknown method。`metadata / list_tasks / list_business_states / explain_action_access / explain_task_assignment` 历史 list/explain/metadata 查询继续保留。该切片只证明 Workflow JSON-RPC 写入口的本地模块门禁，不改变 Workflow task done 不等于 Fact posted 的边界，也不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`/templates/render-pdf` 模板 PDF 生成入口已接入 active module states 本地门禁：已登记 `template_key` 中，`material-purchase-contract` 要求 `purchase_orders=enabled`，`processing-contract` 要求 `outsourcing_orders=enabled`，`engineering-material-detail`、`engineering-color-card` 和 `engineering-work-instruction` 要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会拒绝生成 PDF；未知模板 key 会返回参数错误，不再绕过模块归属判断。该切片只证明正式 PDF 模板生成入口的本地门禁，不代表打印留档回写、Excel 母版回写、其它普通后端业务 API 或目标环境 release evidence 已闭环。

ProcessRuntime 的 `wait_event` 当前只提供 usecase 层显式唤醒：`WakeProcessWaitEventNode` 要求节点为 `active`、版本匹配、`policy_snapshot.event_key` 已声明，调用方提供匹配事件 key 和幂等键后才完成该节点并复用顺序推进。它不提供事件订阅器、不由 `complete_task_action` 自动触发、不创建 WorkflowTask、不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的启动当前也只提供 usecase 层显式入口：`StartProcessInstance` 要求 ProcessInstance 仍为 `active`，只激活首个 `waiting` 节点，并按节点类型复用现有处理边界。首节点为 `human_task / approval` 时创建 linked WorkflowTask；首节点为 `domain_command / wait_event` 时只进入 active 等待后续显式执行 / 唤醒；首节点为 `end` 时完成流程实例。它不把流程创建等同于启动，不提供后台 scheduler，不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的命名 policy 分支当前也只提供 usecase 层显式 handler：节点完成后，只有当前节点 `policy_snapshot.branch_policy_key` 已注册为 `ProcessBranchPolicyHandler`，运行时才会让 handler 返回下一节点 key，并只激活同一 ProcessInstance 内这个仍为 `waiting` 的目标节点。它不解析自由表达式、客户 JS / SQL 或任意脚本，不自动跳过或 settle 非选中分支，不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `returnTo` 当前只提供 usecase / repo 层受控返工 attempt：节点完成后，只有当前节点 `policy_snapshot.return_to_node_key / return_outcomes / return_max_attempts` 明确声明返工目标、触发 outcome 和最大 attempt，且 outcome 命中时，运行时才会复制目标 node key 的最新已 settled 节点配置，创建下一 attempt 的 waiting `ProcessNodeInstance` 并激活它；目标是 `human_task / approval` 时才创建 linked WorkflowTask。目标不存在、目标最新 attempt 未 settled、超过上限或配置非法都会拒绝。它不提供任意循环、不复用旧 completed 节点、不自动 settle 其他分支、不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `blocked / due_at` 当前只提供 usecase / repo 层显式阻塞：`BlockProcessNodeInstance` 要求 active 流程、active 节点、`expected_version` 匹配和非空 reason；`EscalateDueProcessNode` 额外要求节点已有 due_at 且当前时间达到或超过 due_at。两者只把节点和 ProcessInstance 标记为 blocked，不写 completed_at，不推进后续节点，不创建 WorkflowTask，不提供后台 scheduler、不自动扫描 overdue、不发送提醒升级通知，也不写库存、出货、质检、财务或其他 Fact。

当前服务端 runtime 未发现 active business scheduler / timer 写入口。现有后台任务只限 server bootstrap 初始化、`template_pdf` 的 PDF warmup / Chrome WebSocket 等待，以及 `taskgroup` 生命周期工具；这些任务不按客户配置启动流程、导入、打印或过账，也不执行业务模块写入。后续若新增业务 scheduler、cron、outbox worker 或自动 overdue 扫描，必须另拆阶段接入 active module states、RBAC、幂等、审计和测试。

ProcessRuntime 当前只注册了 `sales_order.submit` 这个最小领域命令 handler：它调用 `SalesOrderUsecase.SubmitSalesOrder` 提交销售订单 Source Document，并校验流程业务引用与 payload `sales_order_id` 一致；`TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview` 已锁住同一流程实例内 `submit_sales_order` domain command 完成后激活老板审批 linked task、老板完成后激活 PMC 评审 linked task 的后端最小链路；前端 `orderApprovalFlow` 串任务 builder 已删除，正式运行时代码只保留订单审批相关任务识别和状态常量。客户配置 runtime manifest 已编译 `sales_order_acceptance` 的 `runtime_loader_ready` 流程定义，并把客户包 source pool 映射到 runtime `order_approval` / `order_review` 责任池；后端 `BuildProcessInstanceCreateFromActiveCustomerConfig` 可从 active revision 受控构造 `ProcessInstanceCreate`，并拒绝未启用 loader、Fact 边界变更或未知 command key；`customer_config.start_sales_order_acceptance_process` 可显式创建并启动该流程实例首节点，要求 `sales_order.submit` 权限并返回 runtime boundary，仍不执行 domain command；`customer_config.execute_sales_order_acceptance_submit` 可显式执行已 active 的首个 submit command，提交销售订单 Source Document 并推进到老板审批 linked task；正式销售订单页的“提交”动作已接入 `submitSalesOrderAcceptanceProcess`，先调用 start API，再调用 submit command API，不再直连旧 `submit_sales_order`。它不由普通 `complete_task_action` 自动触发提交命令，不写库存、出货、质检、财务或其他 Fact，也不代表客户配置流程定义已在目标环境加载、目标环境 evidence 已闭环或完整销售订单黄金闭环已经生产可交付。

`operational_fact` JSON-RPC 当前承载生产、委外、出货、库存预留和财务事实的最小运行入口。shipment 主路径复用 `shipments / shipment_items / inventory_txns`，提供：

- `create_shipment`
- `create_shipment_with_items`
- `add_shipment_item`
- `ship_shipment`
- `cancel_shipment`
- `list_shipments`

这组接口使用 `shipment.read / shipment.create / shipment.ship / shipment.cancel` 动作权限。新建表单应优先使用 `create_shipment_with_items`，在一个后端事务中创建出货单头和明细，避免前端串联多个请求留下半成品草稿；`ship_shipment` 才把出货单推进到 `SHIPPED` 并写库存 `OUT`，`cancel_shipment` 只允许取消已出货单并写 `REVERSAL`；`shipment_release done` 不会自动调用这些接口。

`operational_fact` 的 shipment 出货写入口已接入 active module states 本地门禁：`create_shipment / create_shipment_with_items / add_shipment_item` 要求 `shipments=enabled`，`ship_shipment / cancel_shipment` 要求 `shipments=enabled` 且 `inventory=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写出货或库存事实。`list_shipments` 保留历史读取边界，不把模块关闭理解成历史出货不可查。该切片只证明 shipment 出货普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

`operational_fact` 的 stock reservation 库存预留写入口已接入 active module states 本地门禁：`create_stock_reservation / release_stock_reservation / consume_stock_reservation` 要求 `inventory=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写库存预留事实。`list_stock_reservations` 保留历史读取边界，不把模块关闭理解成历史预留不可查。该切片只证明 stock reservation 库存预留普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

`operational_fact` 的 production 生产事实写入口已接入 active module states 本地门禁：`create_production_fact / post_production_fact / cancel_production_fact` 要求 `production=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写生产事实。`list_production_facts` 保留历史读取边界，不把模块关闭理解成历史生产事实不可查。该切片只证明 production 生产事实普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

`operational_fact` 的 outsourcing fact 委外事实写入口已接入 active module states 本地门禁：`create_outsourcing_fact / post_outsourcing_fact / cancel_outsourcing_fact` 要求当前模块目录中的 `outsourcing_orders=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写委外事实。`list_outsourcing_facts` 保留历史读取边界，不把模块关闭理解成历史委外事实不可查。该切片只证明 outsourcing fact 委外事实普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

`operational_fact` 的 finance 财务写入口也已接入 active module states 本地门禁：`create_finance_fact / post_finance_fact / settle_finance_fact / cancel_finance_fact` 要求 `finance=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写财务事实。`list_finance_facts` 保留历史读取边界，不把模块关闭理解成历史财务事实不可查。该切片只证明 finance 普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

P4-3 当前已完成合同预检、manifest 定义证据和 start-only loader：shipment 事实入口已定位到 `create_shipment_with_items / ship_shipment / cancel_shipment`，finance 事实入口已定位到 `create_finance_fact / post_finance_fact / settle_finance_fact / cancel_finance_fact`。`customer_config` runtime manifest 会编译 `finished_goods_delivery / quality_finance_ship_receivable` 的 `runtime_loader_start_ready` 定义，并可通过只读 `customer_config.explain_process_definition` 查看 `runtime_loader_enabled=true`、节点命令合同和剩余 blocker。`start_finished_goods_delivery_process` 要求 `shipment.create` 权限，只从 active customer config 显式创建并启动 shipment 业务引用的 ProcessInstance，首个 `finished_goods_quality` domain command 进入 active 等待；它不执行 domain command、不写质检、出货、库存、应收、开票或财务 Fact。

`execute_finished_goods_delivery_quality_decide` 已注册 `finished_goods_quality.decide` ProcessRuntime handler，要求 `quality.inspection.update` 权限，显式传入 active `finished_goods_quality` 节点、expected version、shipment ref、`quality_inspection_id` 和幂等键后，校验该质检单已经是 `source_type=SHIPMENT / source_id=<shipment_id> / inspection_type=FINISHED_GOODS` 的已提交质检事实，并调用 `InventoryUsecase.PassQualityInspection / RejectQualityInspection` 判定质检；它不复用 P4-2 purchase-receipt-bound `quality_inspection.decide`，不调用采购入库过账，也不写出货、库存流水、应收、开票或财务 Fact。

`execute_finished_goods_delivery_finance_release` 已注册 `shipment.finance_release` ProcessRuntime handler，要求 `finance.receivable.confirm` 权限，显式传入 active `shipment_finance_release` 节点、expected version、shipment ref 和幂等键后调用 `OperationalFactUsecase.GetShipment` 校验 shipment 存在且仍为 `DRAFT`；成功后只完成财务放行节点并激活 `shipment_execution`，不调用 `ShipShipment`，不写出货、库存流水、应收、开票或财务 Fact，也不新增独立 shipment release 状态、release 取消 / 撤销或目标环境证据。

`execute_finished_goods_delivery_shipment_ship` 已注册 `shipment.ship` handler，要求 `shipment.ship` 权限，显式传入 active `shipment_execution` 节点、expected version、shipment ref 和幂等键后调用 `OperationalFactUsecase.ShipShipment`；成功后完成 `shipment_execution`、激活 `receivable_lead`，并复用现有 `ship_shipment` 领域逻辑把出货单推进到 `SHIPPED`、写库存 `OUT`，但仍不是 Workflow task done 自动过账，也不写 finance Fact。`execute_finished_goods_delivery_receivable_lead` 已注册 `finance.receivable_lead` handler，要求 `finance.receivable.confirm` 权限，显式传入 active `receivable_lead` 节点、expected version、shipment ref、`receivable_source_no`、`expected_amount` 和幂等键后调用 `OperationalFactUsecase.CreateFinanceFactDraft`；该 handler 只允许从已 `SHIPPED` 的 shipment 创建 `RECEIVABLE` 草稿并把 finance fact 记录为流程 linked ref，成功后完成 `receivable_lead` 和 end 节点，不 post / settle / cancel finance fact，也不创建 invoice。当前四个 P4-3 execute handler 本地已注册，`shipment_finance_release` 不再带 `domain_command_handler_not_registered` blocker；shipment 成品质检 create/list 已有收窄入口；`TestFinishedGoodsDeliveryProcessRunsLocalGoldenChain` 已锁住同一 ProcessInstance 从成品质检判定、财务放行、显式出货到应收草稿的本地黄金链路、节点版本推进、end 节点完成和 finance fact draft 边界；目标环境 release evidence 仍未闭环。后续若要继续升级，必须另拆阶段补目标环境证据以及独立财务放行状态 / 取消 / 撤销策略；不得把 `shipment_release done` 解释为自动出货、自动扣库存、自动生成应收或自动开票。

质检事实当前已在 `quality_inspections` 上保留 nullable `source_type / source_id / inspection_type / subject_type / subject_id` 锚点；新建来料质检草稿默认写入 `PURCHASE_RECEIPT / INCOMING / MATERIAL`，并要求这些锚点与 `purchase_receipt_id / material_id` 一致。普通 `quality` JSON-RPC create / submit / decide 仍是来料批次质检主路径，拒绝 `source_type=SHIPMENT`；P4-3 另有收窄的 `create_finished_goods_quality_inspection_draft` / `list_finished_goods_quality_inspections` shipment 成品质检入口，只允许从 `DRAFT` shipment、匹配 shipment item、产品批次和产品 subject 创建 / 查询 shipment-linked 成品质检草稿，不写出货、库存流水、应收、开票或财务 Fact，提交质检只把产品批次置为 `HOLD`。`finished_goods_quality.decide` ProcessRuntime handler 仍只消费已提交的 shipment-linked 质检事实。

`quality` JSON-RPC 域里的质检写入口已接入 active module states 本地门禁：`create_quality_inspection_draft / create_finished_goods_quality_inspection_draft / submit_quality_inspection / pass_quality_inspection / reject_quality_inspection / cancel_quality_inspection` 要求 `quality_inspections` 为 `enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 创建或变更质检事实。`get_quality_inspection / list_quality_inspections / list_finished_goods_quality_inspections` 保留历史读取边界，不把模块关闭理解成历史数据不可查。该切片只证明 quality 质检普通业务 API 的本地门禁，不代表其它业务 JSON-RPC、打印、其它导入入口或目标环境 release evidence 已闭环。

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

## 常用命令

```bash
make api
make all
make data
make migrate_apply
make print_db_url
make migrate_status
go test ./...
make build
go run ./cmd/seed-core-demo-data --help
```

本地开发默认只使用 `192.168.0.106:5432/plush_erp`。`192.168.0.133:5435/plush_erp` 是测试 / 目标环境库，不应通过 `config.local.yaml` 静默混入本地 `make run`、seed 或 migration；确需对测试库执行一次性操作时，必须显式设置 `ERP_ALLOW_TEST_DB_AS_DEV=1` 并在命令里写清目标。

库存事实 PostgreSQL 本地验收使用专用防呆 target，默认库名为 `plush_erp_inventory_test`：

```bash
make inventory_pg_createdb
make inventory_migrate_status
make inventory_migrate_apply
make inventory_pg_test
```

BOM + 批次库存 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_bom_lot_test`：

```bash
make bom_lot_pg_createdb
make bom_lot_migrate_status
make bom_lot_migrate_apply
make bom_lot_pg_test
```

采购入库 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_purchase_receipt_test`：

```bash
make purchase_receipt_pg_createdb
make purchase_receipt_migrate_status
make purchase_receipt_migrate_apply
make purchase_receipt_pg_test
```

采购退货 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_purchase_return_test`：

```bash
make purchase_return_pg_createdb
make purchase_return_migrate_status
make purchase_return_migrate_apply
make purchase_return_pg_test
```

## 迁移说明

- `make migrate_apply` 默认读取 `server/configs/dev/config.yaml`
- 若存在 `config.local.yaml`，会覆盖本地私有 DSN
- dev 配置解析到 `192.168.0.133` 或 `5435` 会被防呆拦截，避免把测试 / 目标环境当成本地开发库迁移
- 只有显式设置 `USE_ENV_DB_URL=1` 时才使用环境变量 `DB_URL`
- 发布依赖新 schema 的服务前，先确认目标库 migration 已落地

## 目录结构（简版）

```text
server/
├── api/
├── cmd/
├── configs/
├── deploy/
├── docs/
├── internal/
│   ├── biz/
│   ├── core/
│   ├── data/
│   ├── server/
│   └── service/
├── pkg/
└── third_party/
```

| 路径 | 职责 |
| --- | --- |
| `api/` | 协议定义与生成入口，目前包含 JSON-RPC 相关接口描述 |
| `cmd/` | 服务启动、迁移辅助与排障命令入口 |
| `configs/` | 按环境拆分的配置文件 |
| `internal/server/` | HTTP/gRPC/JSON-RPC 接入、中间件与路由装配 |
| `internal/service/` | 接口适配层，负责 DTO 转换与调用编排 |
| `internal/biz/` | 业务规约与 UseCase 真源 |
| `internal/core/` | 纯产品领域规则层，当前承载无 IO 的值对象、领域错误、出货三态、库存批次、采购过账单据、采购订单、来料质检、销售订单生命周期等状态机、库存可用量计算和边界守卫；后续其他状态机、计算器或 policy 迁入前必须先评审，不接 runtime / DB / transport |
| `internal/data/` | 数据访问、外部依赖与持久化实现 |
| `internal/conf/` | 配置结构定义与加载相关代码 |
| `internal/errcode/` | 服务端错误码目录真源 |
| `pkg/` | 可复用基础设施组件，如日志、JWT、任务编排与 Telegram 辅助 |
| `deploy/` | Compose 部署模板与发布入口 |
| `docs/` | 后端专题文档索引与 runbook |
| `third_party/` | 第三方 proto / OpenAPI 依赖 |

## 文档索引

- 后端专题入口：`/Users/simon/projects/plush-toy-erp/server/docs/README.md`
- 部署总览：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- 运行说明：`/Users/simon/projects/plush-toy-erp/server/docs/runtime.md`
- 配置说明：`/Users/simon/projects/plush-toy-erp/server/docs/config.md`
- API 说明：`/Users/simon/projects/plush-toy-erp/server/docs/api.md`
- 可观测性：`/Users/simon/projects/plush-toy-erp/server/docs/observability.md`
- Ent / Atlas：`/Users/simon/projects/plush-toy-erp/server/docs/ent.md`
- DB 工作流：`/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`

## 部署

- 当前只保留 Compose：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 如需查看部署占位符和发布脚本入口，优先看 `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
