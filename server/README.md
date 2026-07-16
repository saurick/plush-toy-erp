# server 后端说明

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 环境版本

后端 Go 版本以 `server/go.mod` 为准：`go 1.25.0`，当前 toolchain 为 `go1.26.5`。本机检查走仓库根目录的 `scripts/doctor.sh`，该脚本会在 `server/` 模块内读取实际 Go toolchain，避免只看仓库根目录默认 Go 版本造成误判。

```bash
cd /Users/simon/projects/plush-toy-erp
bash scripts/doctor.sh
```

若 `doctor` 报 Go 低于 `1.26.5`，先升级 Go 或启用 Go toolchain 自动切换，再执行 `make init`、`make data`、`go test` 或 migration 相关命令。

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / gRPC / JSON-RPC 接入层
- `service`：DTO 转换、JSON-RPC URL / method 分发、入口级鉴权与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

HTTP / gRPC transport 日志只记录 operation、JSON-RPC domain / method / id、结果码和耗时，不序列化请求体；密码、验证码、token、附件内容和客户业务参数必须留在脱敏后的业务日志边界内。

## 开发验收 debug 能力

后端 JSON-RPC `debug` 域可生成和清理开发验收调试数据。前端业务链路调试页已移除，这组接口只作为受权限保护的后端调试能力保留；旧 `business_records / business_record_items / business_record_events` 表族已由 `20260612112337` migration 删除，debug seed / cleanup 不再写旧通用业务记录：

- `debug.capabilities`：返回当前环境、仅数据库名的运行态身份、seed / cleanup / 业务数据清空是否允许和禁用原因；不返回 DSN、主机、用户或密码
- `debug.rebuild_business_chain_scenario`：生成带 debugRunId 标记的调试数据
- `debug.clear_business_chain_scenario`：按 debugRunId 预览或清理调试数据
- `debug.clear_business_data`：清空本项目当前 SQL 连接中的 V1 主数据 / 订单、Workflow、Operational Fact、采购入库、库存、BOM、工序档案、委外源单、物料、成品、仓库和单位业务表

`GET /readyz/runtime-identity` 是模拟验收写入前的窄化只读探针。调用方只提交目标身份摘要；服务端用当前 SQL 连接读取 `current_database()`，并在 133 范围同时绑定镜像 `GIT_SHA` 与 Atlas 最新 revision。成功只返回 `matched-v1` 证明，不返回数据库名、DSN、主机、用户或密码；旧服务、错误摘要、错误 release / migration 或查询失败均 fail closed。普通 `/healthz` 与 `/readyz` 合同不变。

这三类写能力默认全部关闭：seed 需显式设置 `ERP_DEBUG_SEED_ENABLED=true`，按 debugRunId 清理需显式设置 `ERP_DEBUG_CLEANUP_ENABLED=true` 且保持 `ERP_DEBUG_CLEANUP_SCOPE=debug_run`。全量业务清空使用独立的 `ERP_DEBUG_BUSINESS_CLEAR_ENABLED=true`，只允许 `ERP_DEBUG_ENV=local|dev`；请求默认 `dryRun=true` 只统计范围，真正删除必须同时传入 `dryRun=false` 和精确确认短语 `CLEAR_ALL_PROJECT_BUSINESS_DATA`。业务数据清空不删除账号、权限、管理员偏好、配置和数据库结构，后端仍会校验管理员身份与 `debug.business.clear` 权限。

## 业务领域 JSON-RPC / Domain JSON-RPC

采购入库已接入独立 `purchase` JSON-RPC 域，当前只覆盖既有 `purchase_receipts / purchase_receipt_items` 事实主路径：

- `create_purchase_receipt_draft`
- `add_purchase_receipt_item`
- `post_purchase_receipt`
- `cancel_purchase_receipt`
- `get_purchase_receipt`
- `list_purchase_receipts`

这组接口走 `InventoryUsecase` 和既有采购入库事实表，过账写 `inventory_txns.IN`，取消已过账入库写 `REVERSAL`。公开入库 API 不接受 `business_record_id` 作为正式事实来源；`purchase.receipt.create / purchase.receipt.read / warehouse.inbound.confirm` 只控制采购入库 API 权限，不代表 Workflow 任务完成会自动过账库存事实。

`inventory` JSON-RPC 域只读返回库存余额、批次和流水，并支持按显式 `product_sku_id` 筛选。产品库存 grain 当前为产品 + 可选 SKU + 仓库 + 单位 + 可选批次；`inventory_lots / inventory_txns / inventory_balances`、生产 / 委外事实、出货和预留共用这一粒度，扣减、冲正、可用量和幂等匹配都不能跨 SKU。历史 `product_sku_id=NULL` 保留为未分规格产品库存，不自动回填、不作为任一 SKU 的兜底池。采购入库仍是 MATERIAL 主路径；成品 SKU 入库由生产 / 委外事实承接，不代表采购收货已支持产品 SKU。

普通 `business` JSON-RPC 域当前只保留业务看板 `dashboard_stats`，入口继续要求 `erp.dashboard.read`。响应固定返回 20 个模块，每项只包含 `module_key / available / total`；客户端必须先判断 `available`，成功查询得到 0 条时是 `available=true, total=0`，运行时 usecase 未接入或当前管理员没有对应 Workflow 读取能力时是 `available=false`，不能把后者显示成真实 0。任一已接入查询报错会让整次 `dashboard_stats` fail closed，不返回部分成功的混合快照。旧 `list_records / create_record / update_record / delete_records / restore_record` 已退出运行时，不能恢复为事实或历史快照查询入口。

20 个模块按真实数据层读取，不建立新的看板事实表，也不从 Workflow payload 或前端列表反推业务数量：

| 真源层 | `module_key` | 当前读取口径 |
| --- | --- | --- |
| MasterData | `customers`、`suppliers`、`products`、`material-bom` | 客户、供应商、产品读取 MasterData；BOM 读取现有 BOM header 清单。 |
| Source Document | `sales-orders`、`accessories-purchase`、`processing-contracts`、`production-orders` | 分别读取销售订单、采购订单、委外订单和生产订单源单，不用后续 Fact 数量替代。 |
| Fact | `inbound`、`inventory`、`outbound`、`production-progress`、`quality-inspections`、`reconciliation`、`payables`、`receivables`、`invoices` | 分别读取采购入库、库存余额、出货单、生产事实、质量检验及财务事实；财务四项严格按 `RECONCILIATION / PAYABLE / RECEIVABLE / INVOICE` 过滤，不混算其它财务类型。 |
| Workflow | `shipping-release`、`production-scheduling`、`production-exceptions` | 分别按 task group `shipment_release / production_scheduling / production_exception` 计数。只有当前管理员具备后端 RBAC `workflow.task.read` 时才查询，并复用任务列表的 active / stored revision、owner role 与 assignee 可见性范围；没有该权限时三项返回 `available=false`，不会绕过任务行级边界。 |

`workflow` JSON-RPC 域承载 Workflow 协同任务主路径。任务列表按当前管理员在 active revision 中仍有效的 owner role、assignee、责任池成员 `role_key`、PMC / 老板催办边界和 super admin 收口；无论 owner role 来自管理员基础角色还是责任池 membership，都必须由同一角色的 entitlement 同时命中当前任务动作 capability 和当前 customer scope，并且对应 role profile 仍启用且没有 revoke 该动作。列表按同 scope 的 `workflow.task.read`，完成 / 阻塞 / 退回 / 催办按同 scope 的对应 action permission 过滤，避免把一个角色的动作权限、另一个角色的 owner 身份或另一个 customer scope 的 entitlement 拼接成处理资格；固定真实客户缺 active revision 或角色投影读取失败时 fail closed，不回退原始基础角色。完成 / 阻塞 / 退回动作只走 `complete_task_action / block_task_action / reject_task_action`，旧 `update_task_status` 已退出 JSON-RPC 运行时。服务端按当前管理员、任务责任角色、指派人和服务端解析出的可见 owner role 集合推导事件 `actor_role_key`，不采信前端提交的 raw `task_status_key` 或 `actor_role_key`。只读解释接口 `explain_action_access / explain_task_assignment` 用于返回当前账号为什么能或不能完成、阻塞、退回、催办某个任务，以及当前账号与 owner / assignee / 责任池 / PMC / 老板 / super admin 的任务归属关系；action explain 会返回 `required_permission`、`owner_role_key`、`visible_owner_role_keys`、`candidate_owner_role_keys`、`work_pool_role_matched`、`work_pool_entitlement_scope_matched` 和 `actor_role_key`，并额外返回 `configured_candidate_owner_role_keys / configured_membership_role_keys / configured_entitled_role_keys / configured_candidate_source`，按 active customer config 的 owner pool、当前 action capability 和 customer scope 反查配置候选责任角色；assignment explain 会返回各动作 `action_required_permissions`、`action_candidate_owner_role_keys`、`action_work_pool_scope_matches`、`action_configured_candidate_owner_role_keys` 与 `action_configured_candidate_sources`。只读解释复用实际动作的有效权限与角色判断，不会把已停用或被 revoke 的原始 owner role 报告成允许。只读解释还会返回 `domain_command_entry / action_domain_command_entries`：当前 `enabled=false`、`will_write_fact=false`，用于说明 task action 仍保持 Workflow-only，并列出正式接入领域命令前必须具备的 command key、domain usecase binding、stable business ref、idempotency、RBAC、append-only audit、重复提交测试和取消 / 冲正策略；workflow payload 里的 `command_key` 不会被采信为事实命令。super admin 当前保留查看和催办类诊断边界，但不通过普通任务动作默认处理业务任务；`complete_task_action / block_task_action / reject_task_action` 支持单次受控 break-glass，必须显式传入 `break_glass=true`、非空 `break_glass_reason` 和不超过 2 小时的 `break_glass_expires_at`。成功动作会把 `workflow_task.break_glass` 高风险审计与任务状态、事件 receipt、业务投影和派生任务放在同一事务内提交，payload 记录 `requested_next_status_key`，事件 actor role 固定为 `admin`；精确 receipt 重放不会重复写审计，事务失败也不会留下“动作已成功”的孤立审计。该机制不是长期 break-glass session、审批流、客户可见岗位能力或生产放行证据。它们不写库存、出货、质检、财务或其他 Fact，也不暴露 entitlement ID、user-level 候选人或全局候选人清单。

`get_task_board` 是 `workflow.task.read` 下的任务看板只读投影。它在同一查询快照中先应用 owner role / assignee 可见性与关键词、状态、到期、来源筛选，再返回全量 `total`、互斥的 `actionable / exception / due / finished` 计数和每栏有界分页。`source_types` 是稳定的来源候选 facet，只受任务可见性与显式 owner role 范围约束，不受当前关键词、状态、到期或来源值影响，避免选中来源后下拉候选塌缩。`rejected` 在生命周期中仍是 settled，不进入 due 且不可再操作；看板可将它只读投影到 `exception` 承接退回交接。默认每栏最多返回 5 条，单栏聚焦页最多 50 条；`lane_key` 只改变返回的分页栏，不改变完整 `total / counts / source_types`。未知状态会 fail closed，不会被静默漏计。

任务返回值包含内部并发字段 `version`；`complete_task_action / block_task_action / reject_task_action / urge_task` 必须提交正整数 `expected_version` 和顶层 `idempotency_key`。数据层按任务 ID、当前状态和版本做 CAS，成功动作只增加一次版本，并在同一事务的 `workflow_task_events` 中写入新版本、服务端计算的 SHA-256 intent hash、命令 key 和首次任务返回快照。receipt 使用稳定的 `workflow.task-mutation-result/v1`；writer 落库前校验 V1 DTO，reader 要求存储 key / command / status 为 canonical，并校验任务状态与非空业务状态字典。相同 task、key、actor、命令和业务 intent 的重放会在终态 / 版本校验前返回首次快照，不重复催办计数、审计、业务投影或派生任务。同 key 改 intent 返回 `40920`，新 key 操作终态任务仍按 settled 拒绝。公开 `create_task` 使用精确创建字段 allowlist，拒绝流程锚点、`customer_key`、receipt / CAS 和未知字段，但不增加幂等或网络 replay。

linked ProcessRuntime 对账在任务已提交后失败时返回可重试未知结果，客户端必须保留同一 attempt 再取 receipt。前端会为一次用户 intent 冻结业务参数、`expected_version` 和安全 UUID；HTTP 408、网络中断、5xx 或结构不合法的 success response 都保留同一 key，任务抽屉、原因和证据也保持可重试。同一 task 的正式动作使用同步 in-flight lease 在请求发出前互斥，避免完成 / 阻塞 / 退回 / 催办跨动作双发；`version / idempotency_key / intent_hash` 均为内部技术字段，不面向业务用户展示。Go 与 JS 已共同消费共享 intent vectors，mixed evidence、raw whitespace key 和 relations 由同一 golden 锁定；当前定向 33/33、联合 62/62 不能外推为 final full/strict/L1 已完成。

`20260711063237 / 20260711075355` 已在本地隔离 migration chain 执行并固定为不可变 revision；`20260711104729` 新增 portable receipt bundle CHECK；`20260711204000` 把本项目迁移前投影表里的 `shipment_release_pending` 规范为正式业务状态 `shipment_pending`，不改 payload 中同名提醒类型。本项目迁移前且无法证明准确版本的事件继续保存 `task_version=NULL`，不使用事件行号或当前任务版本伪造 backfill；这不是旧项目、旧客户端或旧 API 兼容路径。当前迁移链包含两项不同的存量门槛：`--audit populated-upgrade` 核对 `20260714055504` 的状态、审计束、生命周期、流程锚点和待删除时间字段；`--audit customer-config-cutover` 核对 `20260714055825` 前必须显式治理的流程运行态和任务配置锚点。两项都由 `scripts/qa/populated-upgrade-preflight.sh` 在只读事务中执行，任一失败即停止 apply；迁移和发布脚本不得自动 DML。fresh schema、静态 DDL、Ent 零漂移和 Atlas validate 仍只证明结构与迁移链，不替代存量数据升级证据。共享工作树的 migration chain 可能继续增长，必须按当前代码与 Atlas status 重查。目标环境是否已发布仍以绑定具体 commit / image、数据库 status 和发布证据为准，本地 latest 不代表目标环境已经发布。

`attachment` JSON-RPC 域承载业务附件证据层，当前只保留 canonical `list_attachments / upload_attachment / download_attachment`。普通物理删除接口已退出；已上传证据不能由页面无痕删除，后续如需纠错必须先完成受控撤销与持久审计设计。附件挂到既有业务对象的 `owner_type + owner_id`，读取内容前会再次确认 owner 存在；上传 repo 在同一事务内锁定 owner 行并创建附件，debug 清理会先清理附件再清理 owner，避免孤儿记录。单个附件上限为 5MB，HTTP `/rpc/attachment` 在 JSON / protobuf 解析前限制 7MB 编码请求体，业务层还会在 base64 解码分配前检查编码长度，并在解码后复核 5MB 上限。当前 JSON-RPC 下载仍会在内存中生成 base64 响应，因此 5MB 是低配宿主的收窄内存预算，不代表大文件流式能力已经交付。

`workflow_task` owner 额外执行行级边界：list / download 必须同时具备 `workflow.task.read` 且任务处于当前 active revision 的可见责任范围；upload 只接受 `workflow.task.update`，并要求当前账号是有效 owner scope 或指定处理人，终态任务拒绝继续追加附件。PMC / 老板 / super admin 的催办能力不等于附件写权。其它 owner 继续复用所属业务对象权限和 active module state；附件只作为证据，不改变 Source Document、Fact、Workflow、库存、质检、财务、税控或总账状态，`content_base64` 等文件内容字段在 JSON-RPC 日志中脱敏。该切片不代表对象存储、流式大文件、病毒扫描或目标环境 release evidence 已闭环。

`masterdata` JSON-RPC 域承载客户、供应商、联系人、材料、产品、SKU 和加工环节主数据维护。客户 / 供应商页面保存主体和联系人时应优先使用 `save_customer_with_contacts / save_supplier_with_contacts`，在一个后端事务中完成主体创建 / 更新、联系人新增 / 更新以及遗漏联系人停用，避免前端串联联系人写入留下半保存主数据；单联系人 `create_contact / update_contact / set_primary_contact / disable_contact` 仍保留为底层单对象能力。产品基础信息使用 `create_product / update_product / get_product / list_products / set_product_active`，只维护产品编号、名称、款号、默认单位和启停状态，校验默认单位，不写订单、库存、BOM、生产、出货或财务事实。SKU 使用 `create_product_sku / update_product_sku / get_product_sku / list_product_skus / set_product_sku_active`，只维护产品规格主数据和启停状态，校验归属产品与可选默认单位，不写订单、库存、BOM、生产、出货或财务事实。基础档案写入口已接入 active module states 本地门禁：客户主体和客户聚合保存要求 `customers=enabled`，供应商主体和供应商聚合保存要求 `suppliers=enabled`，联系人创建 / 更新按 `owner_type` 映射到客户或供应商模块，联系人设为主要联系人 / 停用会先读取现有联系人 owner 再按对应模块要求 `enabled`，材料写入口要求 `materials=enabled`，产品和 SKU 写入口要求 `products=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写基础档案，历史 get/list 读取仍保留。加工环节 `processes` 写入口也已接入 active module states 本地门禁：`create_process / update_process / set_process_active` 要求 `processes=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写加工环节主数据；`get_process / list_processes` 历史读取仍保留。该切片只证明 MasterData 基础档案与 processes 加工环节主数据普通业务 API 的本地门禁，不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`sales_order` JSON-RPC 域承载销售订单 Source Document / Business Commitment 主路径。订单表单只通过 `save_sales_order_with_items` 写入，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；任一步失败会整体回滚。更新已有草稿必须提交当前正整数 `expected_version`，数据层先用 `id + DRAFT + version` CAS 更新单头并递增版本，成功后才替换明细；同一旧版本并发保存只有一个赢家，失败方返回版本冲突且不会改写明细。新系统不保留 `create_sales_order / update_sales_order / add_sales_order_item / update_sales_order_item / remove_sales_order_item` 分拆写接口，避免绕过父单草稿锁和事务一致性；订单行查询仍保留。聚合保存和提交 / 激活 / 关闭 / 取消都要求 `sales_orders=enabled`，历史 get/list 读取仍保留；销售订单不会写库存、出货、预留、财务、发票或收付款事实。

`purchase_order` JSON-RPC 域承载采购订单 Source Document / Purchase Commitment 主路径。采购订单表单只通过 `save_purchase_order_with_items` 写入，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；更新已有草稿与销售订单共用正整数 `expected_version`、`id + DRAFT + version` 单头 CAS、成功后再替换明细的合同，冲突不会留下半保存明细。新系统不保留 `create_purchase_order / update_purchase_order / add_purchase_order_item / update_purchase_order_item / remove_purchase_order_item` 分拆写接口。生命周期继续使用 `submit_purchase_order / approve_purchase_order / close_purchase_order / cancel_purchase_order`，历史头行查询继续使用 get/list。采购订单只表达供应商采购承诺，采购入库行可关联 `purchase_order_item_id` 追溯来源；它不写库存、批次、应付、发票或付款事实。

`outsourcing_order` JSON-RPC 域承载委外订单 Source Document / Outsourcing Commitment 主路径。委外订单表单保存应优先使用 `save_outsourcing_order_with_items`；更新已有草稿同样要求正整数 `expected_version`，并在单个事务里先按 `id + DRAFT + version` CAS 递增单头版本，成功后才更新明细。提交 / 确认 / 关闭 / 取消通过 `submit_outsourcing_order / confirm_outsourcing_order / close_outsourcing_order / cancel_outsourcing_order` 推进源单状态；委外明细保存 `product_order_no_snapshot / product_no_snapshot / product_name_snapshot / process_*_snapshot / unit_name_snapshot` 等加工合同逐行打印快照，其中 `product_order_no_snapshot` 只用于追溯客户产品订单 / 销售订单号，不新增销售订单外键。它不写委外事实、库存、应付、发票或付款事实。委外订单写入口已接入 active module states 本地门禁：保存和提交 / 确认 / 关闭 / 取消都要求 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `OutsourcingOrderUsecase` 写入或推进委外订单；`get_outsourcing_order / list_outsourcing_orders / list_outsourcing_order_items` 历史读取仍保留。该切片只证明 outsourcing order 委外订单 Source Document 普通业务 API 的本地门禁，不代表 outsourcing fact、打印、其它导入入口或目标环境 release evidence 已闭环。

销售订单、采购订单和加工合同页面共同遵守分阶段保存合同：只有聚合保存请求本身或完整响应校验失败才能进入版本冲突 / 结果未知分支，并保持表单、不上传附件、不刷新列表；一旦保存响应给出有效 `id / version`，页面先绑定该已保存真源，再独立处理附件、明细读取和列表 / Workflow 刷新。后置失败只提示对应附件或刷新动作，不会把已保存源单重新解释为结果未知，也不会让新建重试再次以 `id=0` 创建。

`bom` JSON-RPC 域承载 BOM Version / 工程资料主路径。当前支持 `list_bom_versions / get_bom_version / create_bom_draft / update_bom_draft / add_bom_item / update_bom_item / delete_bom_item / copy_bom_version / activate_bom_version / archive_bom_version`。BOM 草稿可维护头信息和明细；激活会把同产品旧 `ACTIVE` 版本设为历史版本（底层状态仍为 `ARCHIVED`），已激活 BOM 不允许直接改头或明细，改版应复制新草稿后再激活。该域只维护工程资料，不生成采购需求、采购订单、库存流水、生产任务、成本、应付、发票或付款事实。BOM 写入口已接入 active module states 本地门禁：草稿创建 / 更新、复制、激活、归档和明细新增 / 更新 / 删除都要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 BOM 头或明细；`list_bom_versions / get_bom_version` 历史读取仍保留。该切片只证明 material BOM 工程资料普通业务 API 的本地门禁，不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`admin` JSON-RPC 域承载后台管理员、预设角色和权限管理。每个方法使用精确参数合同，未知字段和不在后端权限注册表中的权限码会整体拒绝。当前不开放自定义角色创建或角色物理删除；内置角色定义只负责首次初始化默认权限，角色落库后启动 seed 不再覆盖权限中心保存的功能组合。系统控制面审计入口为 `audit_logs`，受 `system.audit.read` 权限控制，只读返回 `runtime_audit_events` 中的启动初始化、账号 / 角色 / 权限变更和客户配置版本控制事件；支持按 `source / event_type / event_key / actor_key / target_type / target_key / keyword / created_from / created_to` 查询，并返回 `risk_level / action_label / summary / actor_key / target_type / target_key` 供前端定位。账号创建、角色绑定、账号启停、重置密码、角色权限变更、客户配置 publish / activate 会追加非敏感摘要，不保存密码、token、密码 hash、compiled snapshot 或客户 raw 配置。该审计表不是采购、库存、质检、出货、财务等业务动作的通用审计事实表。

`customer_config` JSON-RPC 域承载客户配置版本控制面能力，当前支持 `validate_customer_config / publish_customer_config / check_customer_config_transition / activate_customer_config / rollback_customer_config / get_effective_session / explain_module_status / explain_process_definition / start_sales_order_acceptance_process / execute_sales_order_acceptance_submit / start_material_supply_process / start_material_supply_purchase_order_process / execute_material_supply_purchase_receipt_create / execute_material_supply_quality_gate / execute_material_supply_post_inbound / start_finished_goods_delivery_process / execute_finished_goods_delivery_quality_decide / execute_finished_goods_delivery_finance_release / execute_finished_goods_delivery_shipment_ship / execute_finished_goods_delivery_receivable_lead`。`publish` 要求非空产品版本，只接受受控编译后的配置 revision，以完整 normalized publish payload 的 canonical SHA-256 hash v1 执行 INSERT-only；同 revision 同 identity 幂等返回原记录，异 identity 冲突且不覆盖投影。`check_customer_config_transition` 只读返回目标身份、观测 active revision 和模块 / 流程 / 责任阻断；`activate / rollback` 必须提交相同 hash、产品版本与 expected active revision，并在锁定 revision 的事务内再次校验目标 identity 和模块依赖闭包，rollback 只接受有激活历史的 superseded revision。`publish / activate / rollback` 会在各自成功事务追加脱敏 `runtime_audit_events`，记录 actor、customer / revision、config hash、计数和状态，不保存 compiled snapshot 或 raw 配置；`get_effective_session` 会按当前管理员角色返回 revision、hash version、页面、动作、字段策略和责任池投影，页面同时受角色页面投影收窄，动作只由 `access_entitlements` 加权并受后端 RBAC 上限、模块状态和角色 revoke 约束；`role_profiles` 只保留角色启停、能力包标记和撤权。`explain_module_status` 只读返回某模块在 active revision 下的产品包含、成熟层、客户部署状态、依赖、角色 / 责任池 / 页面 / 流程引用，以及启用 / 关闭阻断原因；当前已接入 active / blocked 流程实例数、`ready / blocked` WorkflowTask 数和核心业务表未结单据数，runtime count source 为 `process_workflow_business_partial`，不代表真实模块关闭已经可执行。`explain_process_definition` 只读返回 active revision 中某个 process definition 的 manifest 状态、loader 状态、节点命令合同、runtime blocker 和是否可启动，不创建 ProcessInstance、不执行 domain command、不写 Fact。

该域里的流程运行时入口只做显式启动和显式领域命令执行，不上传任意客户包文件，不提供普通运行时 `install_module / uninstall_module / upload_plugin`，不导入真实业务数据，也不绕过领域 usecase 和后端 RBAC 校验。所有 `customer_config.execute_*` 显式流程命令在调用 `ExecuteDomainCommandNode` 前都会通过 `EnsureProcessDomainCommandModulesEnabled` 按 active revision module states 校验命令引用模块，非 `enabled` 时返回参数错误且不调用领域 usecase；这只是 `customer_config` execute API 的本地门禁，不等于普通业务 JSON-RPC、打印或其它导入入口已经全链路阻断。`start_sales_order_acceptance_process` 只从 active customer config 受控构造并显式创建 / 启动销售订单接单 ProcessInstance，要求 `sales_order.submit` 权限，返回 runtime boundary，不执行 domain command、不写 Fact、不替代正式 UI；`execute_sales_order_acceptance_submit` 只执行已 active 的 `submit_sales_order` 节点，要求调用方提供 process instance、process node、expected version、销售订单 ID 和幂等键，成功后调用 `sales_order.submit` domain command 提交销售订单 Source Document，并推进到老板审批 linked task，仍不写库存、出货、质检、财务或其他 Fact。`start_material_supply_process` 覆盖已有采购入库单的窄版显式链路，只创建并启动 `purchase_receipt` ProcessInstance；`start_material_supply_purchase_order_process` 覆盖采购订单显式链路，只创建并启动 `purchase_order` ProcessInstance；`execute_material_supply_purchase_receipt_create` 显式执行 `purchase_receipt.create`，通过 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder` 创建采购收货草稿，为每个收货行创建独立的零余额 `HOLD` lot 和 `SUBMITTED` 来料质检单，并把采购收货单及生成的质检单记录到 `module_contract_snapshot.linked_business_refs`；`execute_material_supply_quality_gate` 只接受 `purchase_receipt_id`，通过 `InventoryUsecase.EvaluatePurchaseReceiptQualityGate` 聚合读取逐行正式质检结果：全部 `PASS / CONCESSION` 才推进，任一 `REJECT` 阻塞流程，仍有未判定行则保持当前节点 active。该门禁不接受 `quality_inspection_id / result` 等判定字段，不替代逐行质检 usecase，也不写质检或库存 Fact；`execute_material_supply_post_inbound` 再在同一事务内校验全部收货行、正式质检结果和 `ACTIVE` lot 后执行采购入库过账；这里的入库过账只来自显式 `execute_material_supply_post_inbound`，不是 Workflow task done、manifest human_task 节点或后台 loader 自动写 Fact。

ProcessInstance 的业务引用唯一性由 `process_key + business_ref_type + business_ref_id` 约束。同一业务引用使用同一 `idempotency_key` 重试创建时返回已有流程实例和节点；同一业务引用换一个 `idempotency_key` 再启动会被拒绝为重复流程，避免同一销售订单、采购订单、采购入库单或出货单生成多条并行流程。重复调用 `StartProcessInstance` 会对首节点做有界恢复：`human_task / approval` 的 active 节点补建或精确重放同一 linked WorkflowTask，已完成 `end` 补齐 ProcessInstance completed，带 durable result 的已结算 `domain_command` 继续结算；active `domain_command / wait_event` 只返回当前节点，不自动重复领域副作用或唤醒事件。任务重放会核对不可变任务字段和原始 payload intent，运行时后来追加的 payload 字段不造成误冲突。

ProcessRuntime 执行 `domain_command` 时，先让已登记 handler 做无副作用只读预检，再把 `command_key + idempotency_key + JSON payload` 的 SHA-256 fingerprint 原子绑定到 active 节点；数据层使用单条带状态、版本和 fingerprint 条件的 `UPDATE ... RETURNING`。protocol v1 的 `sales_order.submit / purchase_receipt.create / inventory.post_inbound / finished_goods_quality.decide / shipment.ship / finance.receivable_lead` 会在各自领域事务内同时写业务副作用和 durable result / effect ref；`quality_inspection.aggregate_gate / shipment.finance_release` 会在锁定来源对象的短事务内评估并记录 `effect_state=none`。handler 返回后 runtime 的 `RecordResult` 只是 exact replay；重试会先读持久结果并跳过 Validate / handler，再继续节点结算、linked ref CAS 和下游推进对账。

销售订单取消、采购入库取消冲正、已出货取消冲正和财务事实取消会在同一领域事务内标记 compensation；正式认证 JSON-RPC 主路径会把当前管理员写入 `domain_command_compensated_by`。active 节点读取 compensated result 会阻塞流程，已完成节点在补偿后重放会返回 `40921` 且不再推进下游。若补偿前已有下游节点被激活，当前不会自动回滚下游，只保留证据并等待明确恢复决策。migration `20260710150000` 只把升级前 active 空 fingerprint 标成 fail-closed sentinel；`20260710150001` 才新增 protocol / result / hash / effect-ref / compensation schema，并把本项目迁移前已有 fingerprint 标为 protocol 0。本项目迁移前的 protocol 0、已提交销售订单但缺 exact result，以及省略 `inspected_at`、无法证明原判定时间的迁移前成品质检 result-missing 仍返回 `40921`。本地 PostgreSQL 已覆盖结果冲突时领域写回滚、finance exact recovery / payload conflict / cancellation compensation、本项目迁移前销售结果 fail closed、completed-node compensation fail closed 和 ProcessRuntime 并发；目标环境尚未应用 `20260710150001`，也没有 release evidence。

`purchase` JSON-RPC 域里的采购入库写入口已接入 active module states 本地门禁：`create_purchase_receipt_draft / create_purchase_receipt_with_items / create_purchase_receipt_from_purchase_order / add_purchase_receipt_item / post_purchase_receipt / cancel_purchase_receipt` 会分别要求 `purchase_receipts`、`purchase_orders` 或 `inventory` 为 `enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 Source Document 或库存事实。公开的 `create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 要求调用方提供不超过 128 字符的稳定 `idempotency_key`，拒绝调用方提交 payload hash；服务端规范化业务参数后生成 SHA-256 intent hash，并在事务锁内再次检查 replay。相同 key 和 intent 只返回原始收货行、HOLD lot 与来料质检事实，key 相同但 intent 不同返回幂等冲突；写入错误或 commit 结果未知时按同一 key 回查，损坏或缺失的结果边界 fail closed。`get_purchase_receipt / list_purchase_receipts` 保留历史读取边界，不把模块关闭理解成历史数据不可查。该切片只证明 purchase 采购入库普通业务 API 的本地门禁，不代表其它业务 JSON-RPC、打印、其它导入入口或目标环境 release evidence 已闭环。

active revision 的 `work_pool_memberships.role_key` 可被 Workflow 服务端用于收窄当前账号任务可见 owner role 集合，但只有同一 revision 的同一条 `access_entitlements` 同时命中该 role、当前 workflow action capability 和当前 customer scope 时才会扩展处理资格；`workflow_tasks.owner_pool_key / required_capability_key / config_revision / process_instance_id / process_node_instance_id` 当前只作为新任务 runtime 解释锚点、配置版本线索和流程节点追踪锚点，旧任务可为空；公开 JSON-RPC `create_task` 只创建无流程关联的普通协同任务，显式提交 `config_revision / process_instance_id / process_node_instance_id` 会被拒绝，`config_revision` 只由服务端受控派生，两个流程节点关联 ID 只由 ProcessRuntime 的 `CreateLinkedWorkflowTask` 内部路径生成；ProcessRuntime 可显式启动 active ProcessInstance 的首个 waiting 节点，首节点为 `human_task / approval` 时才创建 linked WorkflowTask；ProcessRuntime 只允许从 `active` 且 `expected_version` 匹配当前节点版本的 `human_task / approval` 节点显式创建 linked WorkflowTask，未显式传 `owner_role_key` 时只接受 active customer config 解析出的唯一候选 owner role，相同 `task_code` 的同一节点重试会返回已有任务，也可读取已 `done` 的 linked WorkflowTask 完成当前 ProcessNodeInstance；`complete_task_action` 成功完成 linked WorkflowTask 后会受控触发当前节点完成，并按顺序、命名 policy、fan-out / join 或受控 returnTo attempt 路由激活下一组节点；刚激活的 `human_task / approval` 会复用 `CreateLinkedWorkflowTask` 创建下一 linked WorkflowTask，刚激活的 `end` 会完成 end 节点并把 ProcessInstance 标记为 completed，`domain_command / wait_event` 只进入 active 等待显式执行 / 唤醒；旧 `update_task_status` 已退出运行时，且系统仍不会由后台 scheduler 自动启动流程、自动扫描流程定义、自动扫描 overdue、跳过节点、为 `domain_command / wait_event / end` 创建 WorkflowTask、把任务完成自动绑定到 domain handler、发送提醒升级通知或直接新增任务事实字段。

`workflow` JSON-RPC 写入口已接入 active module states 本地门禁：`create_task / complete_task_action / block_task_action / reject_task_action / urge_task` 先按各自精确顶层合同拒绝 `customer_key` 和未知字段，再只用服务端部署上下文解析当前客户，并要求 `workflow_tasks=enabled`；`read_only / disabled / 缺失` 会拒绝且不调用 Workflow usecase 写任务、事件或业务状态。旧 `update_task_status` 和公共 `upsert_business_state` 已退出运行时，调用会返回 unknown method。`metadata / list_tasks / list_business_states / explain_action_access / explain_task_assignment` 只读查询继续保留。该切片只证明 Workflow JSON-RPC 写入口的本地模块门禁，不改变 Workflow task done 不等于 Fact posted 的边界，也不代表打印、其它导入入口或目标环境 release evidence 已闭环。

`/templates/render-pdf` 模板 PDF 生成入口已接入 active module states 本地门禁：已登记 `template_key` 中，`material-purchase-contract` 要求 `purchase_orders=enabled`，`processing-contract` 要求 `outsourcing_orders=enabled`，`engineering-material-detail`、`engineering-color-card` 和 `engineering-work-instruction` 要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会拒绝生成 PDF；未知模板 key 会返回参数错误，不再绕过模块归属判断。`engineering-work-instruction` 可由 BOM 管理或委外订单生成业务草稿，但 PDF 模板仍按工程资料门禁登记，委外入口只提供外发上下文，不改变模板归属或写入委外事实。生产镜像固定已在目标宿主验证的 Debian Chromium `150.0.7871.100-1~deb12u1`，构建时校验实际包版本；正式发布 smoke 必须用受控 admin token 调一次真实最小 PDF，校验 HTTP 200、`%PDF` 文件头和非空结果，不把关闭 warmup 当成 PDF 可用证据。该切片不代表打印留档回写或 Excel 母版回写已经实现。

ProcessRuntime 的 `wait_event` 当前只提供 usecase 层显式唤醒：`WakeProcessWaitEventNode` 要求节点为 `active`、版本匹配、`policy_snapshot.event_key` 已声明，调用方提供匹配事件 key 和幂等键后才完成该节点并复用顺序推进。它不提供事件订阅器、不由 `complete_task_action` 自动触发、不创建 WorkflowTask、不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的启动当前只提供 usecase 层显式入口：`StartProcessInstance` 首次启动会激活首个 `waiting` 节点并按节点类型复用现有处理边界；重试则执行上一段的有界恢复，不从任意中间节点重新扫描流程。首节点为 `human_task / approval` 时创建或核对 linked WorkflowTask；首节点为 `domain_command / wait_event` 时只进入 active 等待后续显式执行 / 唤醒；首节点为 `end` 时完成节点与流程实例。它不把流程创建等同于启动，不提供后台 scheduler，不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的命名 policy 分支当前也只提供 usecase 层显式 handler：节点完成后，只有当前节点 `policy_snapshot.branch_policy_key` 已注册为 `ProcessBranchPolicyHandler`，运行时才会让 handler 返回下一节点 key，并只激活同一 ProcessInstance 内这个仍为 `waiting` 的目标节点。它不解析自由表达式、客户 JS / SQL 或任意脚本，不自动跳过或 settle 非选中分支，不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `returnTo` 当前只提供 usecase / repo 层受控返工 attempt：节点完成后，只有当前节点 `policy_snapshot.return_to_node_key / return_outcomes / return_max_attempts` 明确声明返工目标、触发 outcome 和最大 attempt，且 outcome 命中时，运行时才会复制目标 node key 的最新已 settled 节点配置，创建下一 attempt 的 waiting `ProcessNodeInstance` 并激活它；目标是 `human_task / approval` 时才创建 linked WorkflowTask。目标不存在、目标最新 attempt 未 settled、超过上限或配置非法都会拒绝。它不提供任意循环、不复用旧 completed 节点、不自动 settle 其他分支、不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `blocked / due_at` 当前只提供 usecase / repo 层显式阻塞：阻塞入口要求 active 流程、active 节点、`expected_version` 匹配和非空 reason；`EscalateDueProcessNode` 额外要求节点已有 due_at 且当前时间达到或超过 due_at。数据层在同一个 PostgreSQL 事务内把节点和 ProcessInstance 标记为 blocked，任一更新失败会整体回滚；它不写 completed_at，不推进后续节点，不创建 WorkflowTask，不提供后台 scheduler、不自动扫描 overdue、不发送提醒升级通知，也不写库存、出货、质检、财务或其他 Fact。

当前服务端 runtime 未发现 active business scheduler / timer 写入口。现有后台任务只限 server bootstrap 初始化、`template_pdf` 的 PDF warmup / Chrome WebSocket 等待，以及 `taskgroup` 生命周期工具；这些任务不按客户配置启动流程、导入、打印或过账，也不执行业务模块写入。后续若新增业务 scheduler、cron、outbox worker 或自动 overdue 扫描，必须另拆阶段接入 active module states、RBAC、幂等、审计和测试。

ProcessRuntime 当前白名单注册 `sales_order.submit / purchase_receipt.create / quality_inspection.aggregate_gate / inventory.post_inbound / finished_goods_quality.decide / shipment.finance_release / shipment.ship / finance.receivable_lead`。其中 `sales_order.submit` 调用 `SalesOrderUsecase.SubmitSalesOrder` 提交销售订单 Source Document，并校验流程业务引用与 payload `sales_order_id` 一致；`TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview` 已锁住同一流程实例内提交后激活老板审批 linked task、老板完成后激活 PMC 评审 linked task 的后端最小链路。前端 `orderApprovalFlow` 串任务 builder 已删除，正式运行时代码只保留订单审批相关任务识别和状态常量。客户配置 runtime manifest 已编译 `sales_order_acceptance` 的 `runtime_loader_ready` 流程定义，并把客户包 source pool 映射到 runtime `order_approval` / `order_review` 责任池；后端 `BuildProcessInstanceCreateFromActiveCustomerConfig` 可从 active revision 受控构造 `ProcessInstanceCreate`，并拒绝未启用 loader、Fact 边界变更或未知 command key；`customer_config.start_sales_order_acceptance_process` 可显式创建并启动该流程实例首节点，要求 `sales_order.submit` 权限并返回 runtime boundary，仍不执行 domain command；`customer_config.execute_sales_order_acceptance_submit` 可显式执行已 active 的首个 submit command，提交销售订单 Source Document 并推进到老板审批 linked task；正式销售订单页的“提交”动作已接入 `submitSalesOrderAcceptanceProcess`，先调用 start API，再调用 submit command API，不再直连旧 `submit_sales_order`。它不由普通 `complete_task_action` 自动触发提交命令，不写库存、出货、质检、财务或其他 Fact，也不代表客户配置流程定义已在目标环境加载、目标环境 evidence 已闭环或完整销售订单黄金闭环已经生产可交付。

`operational_fact` JSON-RPC 当前承载生产、委外、出货、库存预留和财务事实的最小运行入口。shipment 主路径复用 `shipments / shipment_items / inventory_txns`，提供：

- `create_shipment_with_items`
- `ship_shipment`
- `cancel_shipment`
- `list_shipments`

这组接口使用 `shipment.read / shipment.create / shipment.ship / shipment.cancel` 动作权限。新建表单只使用 `create_shipment_with_items`，在一个后端事务中创建出货单头和全部明细；同一幂等键只有同一头行 payload 才返回原聚合，不同 payload 明确冲突。公开 `create_shipment / add_shipment_item` 拆分写入口已退出，避免网络重试重复明细和多行中途失败留下半保存草稿；既有出货明细只读查看。`ship_shipment` 才把出货单推进到 `SHIPPED` 并写库存 `OUT`，`cancel_shipment` 只允许取消已出货单并写 `REVERSAL`；`shipment_release done` 不会自动调用这些接口。

`operational_fact` 的 shipment 出货写入口已接入 active module states 本地门禁：`create_shipment_with_items` 要求 `shipments=enabled`，`ship_shipment / cancel_shipment` 要求 `shipments=enabled` 且 `inventory=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写出货或库存事实。`list_shipments` 保留历史读取边界，不把模块关闭理解成历史出货不可查。该切片只证明 shipment 出货普通业务 API 的本地门禁，不代表其它 `operational_fact` 写入口整体、打印、其它导入入口或目标环境 release evidence 已闭环。

`operational_fact` 的 stock reservation 库存预留写入口已接入 active module states 本地门禁：`create_stock_reservation_from_sales_order / release_stock_reservation` 要求 `inventory=enabled`；创建时只接受销售订单、订单行、仓库、批次和数量，产品、SKU、单位由后端锁定源单派生。`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写库存预留事实。`list_stock_reservations` 保留历史读取边界，不把模块关闭理解成历史预留不可查。普通业务 API 不提供独立 `consume_stock_reservation`：`CONSUMED` 只能由 `ship_shipment` 在真实出货与库存 `OUT` 的同一事务内推进，不能单独释放可用量。

`operational_fact` 的 production 生产事实写入口已收口为 `create_production_material_issue_from_order / create_production_completion_from_order / create_production_rework_from_completion`，并继续使用 `post_production_fact / cancel_production_fact` 处理状态。领料必须来源于发布时冻结的物料需求，完工必须来源于生产订单行，返工必须来源于已过账完工事实；公开 `create_production_fact` 已退役。写入口要求 `production=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_production_facts / list_production_order_material_requirements` 保留历史读取边界。

`operational_fact` 的 outsourcing fact 委外事实写入口已收口为 `create_outsourcing_material_issue_from_order / create_outsourcing_return_receipt_from_order`，并继续使用 `post_outsourcing_fact / cancel_outsourcing_fact` 处理状态。发料、回货均锁定已确认委外订单行并派生供应商、业务对象和单位；公开 `create_outsourcing_fact` 已退役。写入口要求当前模块目录中的 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_outsourcing_facts` 保留历史读取边界。

`operational_fact` 的 finance 创建入口已收口为 `create_receivable_from_shipment / create_invoice_from_shipment / create_payable_from_purchase_receipt / create_payable_from_outsourcing_return / create_reconciliation_from_finance_fact`；往来方、币种、金额和业务来源由后端从已过账源事实派生，公开 `create_finance_fact` 已退役。`post_finance_fact / settle_finance_fact / cancel_finance_fact` 继续承担允许类型的状态动作，`PAYMENT` 不开放正式创建。写入口要求 `finance=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_finance_facts` 保留历史读取边界。

成品交付流程当前已完成合同预检、manifest 定义证据和 start-only loader：shipment 事实入口为 `create_shipment_with_items / ship_shipment / cancel_shipment`，公开财务创建入口为上述来源专用方法；ProcessRuntime 的 `finance.receivable_lead` handler 仍可在工作流合同内调用内部 usecase 创建与出货来源绑定的应收草稿。`customer_config` runtime manifest 会编译 `finished_goods_delivery / quality_finance_ship_receivable` 的 `runtime_loader_start_ready` 定义，并可通过只读 `customer_config.explain_process_definition` 查看 `runtime_loader_enabled=true`、节点命令合同和剩余 blocker。`start_finished_goods_delivery_process` 要求 `shipment.create` 权限，只从 active customer config 显式创建并启动 shipment 业务引用的 ProcessInstance，首个 `finished_goods_quality` domain command 进入 active 等待；它不执行 domain command、不写质检、出货、库存、应收、开票或财务 Fact。

`execute_finished_goods_delivery_quality_decide` 已注册 `finished_goods_quality.decide` ProcessRuntime handler，要求 `quality.inspection.update` 权限，显式传入 active `finished_goods_quality` 节点、expected version、shipment ref、`quality_inspection_id` 和幂等键后，校验该质检单已经是 `source_type=SHIPMENT / source_id=<shipment_id> / inspection_type=FINISHED_GOODS` 的已提交质检事实，并调用 `InventoryUsecase.PassQualityInspection / RejectQualityInspection` 判定质检；实际 `inspector_id` 固定取当前认证 admin actor，不接受命令 payload 代报。它不复用 `material_supply` 的 `quality_inspection.aggregate_gate`，后者只聚合采购收货逐行正式质检结果、不判定单张质检单；该成品质检 handler 不调用采购入库过账，也不写出货、库存流水、应收、开票或财务 Fact。

`execute_finished_goods_delivery_finance_release` 已注册 `shipment.finance_release` ProcessRuntime handler，要求 `finance.receivable.confirm` 权限，显式传入 active `shipment_finance_release` 节点、expected version、shipment ref 和幂等键后调用 `OperationalFactUsecase.GetShipment` 校验 shipment 存在且仍为 `DRAFT`；成功后只完成财务放行节点并激活 `shipment_execution`，不调用 `ShipShipment`，不写出货、库存流水、应收、开票或财务 Fact，也不新增独立 shipment release 状态、release 取消 / 撤销或目标环境证据。

`execute_finished_goods_delivery_shipment_ship` 已注册 `shipment.ship` handler，要求 `shipment.ship` 权限，payload 只接受 shipment ref；命令不再接收实际未落账的 shipment no、warehouse、operator、shipped time、carrier、tracking no 或 note。它调用 `OperationalFactUsecase.ShipShipment`，成功后完成 `shipment_execution`、激活 `receivable_lead`，并复用现有 `ship_shipment` 领域逻辑把出货单推进到 `SHIPPED`、写库存 `OUT`，但仍不是 Workflow task done 自动过账，也不写 finance Fact。`execute_finished_goods_delivery_receivable_lead` 已注册 `finance.receivable_lead` handler，要求 `finance.receivable.confirm` 权限，显式传入 active `receivable_lead` 节点、expected version、shipment ref、`receivable_source_no`、`expected_amount` 和幂等键后调用内部财务 usecase；应收 counterparty 强制取已 `SHIPPED` shipment 的 `customer_id` 真源，payload 不接受 caller 自报 customer。该 handler 只创建 `RECEIVABLE` 草稿并把 finance fact 记录为流程 linked ref，成功后完成 `receivable_lead` 和 end 节点，不 post / settle / cancel finance fact，也不创建 invoice。当前四个成品交付 execute handler 本地已注册；目标环境 release evidence 仍未闭环。不得把 `shipment_release done` 解释为自动出货、自动扣库存、自动生成应收或自动开票。

质检事实当前在 `quality_inspections` 上保留 nullable `source_type / source_id / inspection_type / subject_type / subject_id` 锚点。来料质检使用 `PURCHASE_RECEIPT / INCOMING / MATERIAL`；委外回货质检使用 `OUTSOURCING_FACT / OUTSOURCING_RETURN / PRODUCT|MATERIAL`，只允许从已过账回货事实创建且累计送检量不得超过有效回货量；成品交付另有收窄的 shipment 成品质检入口。三条来源不能互相伪装，也不由 Workflow 完成状态代写质检事实。委外应付只有在恰有一张非取消质检达到 `PASSED + PASS / CONCESSION` 时才能生成。

`quality` JSON-RPC 域里的质检写入口已接入 active module states 本地门禁：`create_quality_inspection_draft / create_quality_inspection_from_outsourcing_return / create_finished_goods_quality_inspection_draft / submit_quality_inspection / pass_quality_inspection / reject_quality_inspection / cancel_quality_inspection` 要求 `quality_inspections` 为 `enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例创建或变更质检事实。`get_quality_inspection / list_quality_inspections / list_finished_goods_quality_inspections / list_outsourcing_return_quality_inspections` 保留历史读取边界，不把模块关闭理解成历史数据不可查。

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

`make run`、`make dev` 和 `make dev_restart` 会先校验仓库根目录 `config/dev-ports.env`，并把其中固定的 HTTP `8300`、gRPC `9300` 注入 dev 配置；生产配置不消费这组覆盖。随后共享本地启动预检运行 `db-guard` 核对 Ent schema 与 versioned migration，再读取当前 dev 配置命中的数据库，要求 Atlas status 已到最新 revision 且 pending 为 0。`make dev_restart` 只在预检通过后才停止旧进程，避免先停服再发现缺 migration。该预检始终只读，不会自动执行 `migrate apply`；失败时应先审查并完成 migration，不应绕过。

主端口不自动顺延。`make dev_stop` / `make dev_restart` 虽按登记端口查找 listener，但停止前会逐个校验进程 cwd 位于本仓库；端口被其他项目占用时会报告 PID、cwd 和命令并拒绝 kill。整组本机覆盖必须写入 ignored 的 `config/dev-ports.local.env`，且包含完整端口组。

登记的本地开发库未显式设置管理员账号或密码时，分别使用 `admin` / `adminadmin`。配置或 `APP_ADMIN_*` 显式值优先；启动只创建缺失账号，不会覆盖已有账号密码。若本地验收工具曾改动稳定管理员，使用以下专用命令恢复当前开发库；它会递增认证版本并撤销旧会话，且没有生产或 133 逃逸开关：

```bash
make reset_local_admin_password
```

本地后端默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，并只在 `make run`、`make dev`、`make dev_restart` 这些本地入口中设置 `ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG=1`。前者避免显式 session 请求读取永绅、而未携带 customer key 的业务 RPC 回落到 `demo`；后者只允许本地服务接收带 `local_test_apply` 标记的测试 revision。专用别名仍可用于强调意图：

```bash
make run_yoyoosun
make dev_restart_yoyoosun
```

确需启动 demo 时必须显式覆盖，例如 `ERP_CUSTOMER_KEY=demo make dev_restart`。永绅本地测试配置仍需登录后在 Vite 开发控制台显式应用；上述目标不会自动发布或激活配置。未通过本地 Make 入口启动的后端默认拒绝 local-test manifest 及其切换操作；本地 gate 开启时，启动预检按 pgx 最终连接配置把 DSN 固定到 `192.168.0.106:5432` 上的 `plush_erp` 或 `plush_erp_*_dev` 开发库，不会因 query override、multi-host fallback 或 `ERP_ALLOW_TEST_DB_AS_DEV=1` 放行 133 / loopback tunnel。production 配置发现该环境开关时也会直接失败。

## 常用命令

```bash
make api
make all
make data
make migrate_apply
make print_db_url
make migrate_status
make reset_local_admin_password
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
make critical_transactions_pg_test
```

`inventory_pg_test` 同时覆盖 `TestInventoryPostgres*` 与 `TestOperationalFactPostgres*`，包括 SKU grain、库存预留、出货来源数量、预留消费和并发确认边界。

`critical_transactions_pg_test` 复用同一隔离测试库，强制运行采购入库/调整、Source Document 聚合保存、库存/SKU/预留/出货、ProcessRuntime 领域命令和 Workflow 终态并发测试；脚本会同时开启 purchase receipt 与 inventory 两组 PostgreSQL 测试标志。`full/strict` 会先创建并 apply 该测试库再执行此门禁，不把普通 `go test ./...` 中的 PostgreSQL skip 冒充事务验收。

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
- `make migrate_apply` 是开发库 Atlas apply 入口，不会自动运行 `20260714055504` / `20260714055825` 的两项只读审计；现存开发库跨越这些 revision 前先显式运行对应 `--audit`
- 生产 / 低配部署只走 `server/deploy/compose/prod/migrate_online.sh`，由同一锁串行执行 status、055504 审计、055825 审计、dry-run 和 apply
- 发布依赖新 schema 的服务前，先确认目标库审计通过、migration 已落地并完成 status / 读回；fresh 或静态 DDL 结果不能替代存量升级证据

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
| `internal/devdbguard/` | 本地开发数据库目标守卫，阻止 dev 配置静默指向测试 / 目标 PostgreSQL；显式例外由运行命令授权 |
| `internal/errcode/` | 服务端错误码目录真源 |
| `pkg/` | 可复用基础设施组件，如日志、JWT 与任务编排辅助 |
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

## 实现命名写入边界

自动生成的 Workflow 任务名称 / payload、核心演示 seed 和试用 MasterData seed 复用 `internal/biz/implementation_naming.go`，避免自动化重新写入编号阶段标签。普通 MasterData 和客户业务数据不套用开发阶段命名规则；P0/P1/P2 风险等级、p50/p95/p99 百分位、产品编码和部署技术步骤按原业务 / 技术语义保留。历史数据库残值按需使用只读 SQL 专项盘点，不建立常驻全表扫描流程。

## 部署

- 当前只保留 Compose：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 如需查看部署占位符和发布脚本入口，优先看 `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
