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

- `create_purchase_receipt_from_purchase_order`
- `add_purchase_receipt_item`
- `post_purchase_receipt`
- `cancel_purchase_receipt`
- `get_purchase_receipt`
- `list_purchase_receipts`

这组接口走 `InventoryUsecase` 和既有采购入库事实表。过账写 `inventory_txns.IN`；`DRAFT` 取消不写库存，会在收货行锁事务内锁定并校验关联 `PURCHASE_RECEIPT / INCOMING / MATERIAL` IQC 与预备批次，取消 `DRAFT / SUBMITTED` IQC，并只在所有预备批次余额精确为零时停用；`POSTED` 取消才逐行写 `REVERSAL`。任一 IQC 来源形状异常、预备批次非零余额、未取消退货 / 调整或 active 应付都会按对应状态整笔阻断。公开入库 API 不接受 `business_record_id` 作为正式事实来源；读取采购订单或订单行的 `create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 同时要求 `purchase.receipt.create + purchase_order.read`，其它采购入库读取和确认仍分别使用 `purchase.receipt.read / warehouse.inbound.confirm`。这些权限边界不代表 Workflow 任务完成会自动过账库存事实。

采购退货和入库调整沿用同一草稿 / 过账分界：取消 `DRAFT` 时先锁定子单再锁定父收货，只把子单改为 `CANCELLED`，不写库存；取消 `POSTED` 时才按原交易写 `REVERSAL`。草稿子修正全部取消后，父收货的 correction dependency 解除；采购收货草稿取消后，也不再阻断采购订单关闭 / 取消。父单动作不会自动取消任一子单或子事实。

`inventory` JSON-RPC 域只读返回库存余额、批次和流水，并支持按显式 `product_sku_id` 筛选。产品库存 grain 当前为产品 + 可选 SKU + 仓库 + 单位 + 可选批次；`inventory_lots / inventory_txns / inventory_balances`、生产 / 委外事实、出货和预留共用这一粒度，扣减、冲正、可用量和幂等匹配都不能跨 SKU。历史 `product_sku_id=NULL` 保留为未分规格产品库存，不自动回填、不作为任一 SKU 的兜底池。采购入库仍是 MATERIAL 主路径；成品 SKU 入库由生产 / 委外事实承接，不代表采购收货已支持产品 SKU。

普通 `business` JSON-RPC 域当前只保留业务看板 `dashboard_stats`，入口要求 `erp.business_dashboard.read`。岗位工作台单独使用 `erp.workbench.read`，不能借工作台权限读取跨部门统计。响应固定返回 20 个模块，每项只包含 `module_key / available / total`；客户端必须先判断 `available`，成功查询得到 0 条时是 `available=true, total=0`，运行时 usecase 未接入或当前管理员没有对应 Workflow 读取能力时是 `available=false`，不能把后者显示成真实 0。任一已接入查询报错会让整次 `dashboard_stats` fail closed，不返回部分成功的混合快照。旧 `list_records / create_record / update_record / delete_records / restore_record` 已退出运行时，不能恢复为事实或历史快照查询入口。

20 个模块按真实数据层读取，不建立新的看板事实表，也不从 Workflow payload 或前端列表反推业务数量：

| 真源层 | `module_key` | 当前读取口径 |
| --- | --- | --- |
| MasterData | `customers`、`suppliers`、`products`、`material-bom` | 客户、供应商、产品读取 MasterData；BOM 读取现有 BOM header 清单。 |
| Source Document | `sales-orders`、`accessories-purchase`、`processing-contracts`、`production-orders` | 分别读取销售订单、采购订单、委外订单和生产订单源单，不用后续 Fact 数量替代。 |
| Fact | `inbound`、`inventory`、`outbound`、`production-progress`、`quality-inspections`、`reconciliation`、`payables`、`receivables`、`invoices` | 分别读取采购入库、库存余额、出货单、生产事实、质量检验及财务事实；财务四项严格按 `RECONCILIATION / PAYABLE / RECEIVABLE / INVOICE` 过滤，不混算其它财务类型。 |
| Workflow | `shipping-release`、`production-scheduling`、`production-exceptions` | 分别读取历史 `shipment_release` 协同任务、`production_scheduling` 与 `production_exception`；新的出货财务审批统一进入 ProcessRuntime 审批箱，不再生成 `shipment_release`。只有具备 `workflow.task.read` 时才查询，并复用 active / stored revision、owner role 与 assignee 可见性范围。 |

生产订单从 `DRAFT` 下达到 `RELEASED` 时生成 `production_scheduling`，生产返工事实从 `DRAFT` 过账到 `POSTED` 时生成 `production_exception`；两者均由领域事务生成，不接受页面或流程配置手填。新的出货财务审批由 `finished_goods_delivery` active revision 生成 `workflow.task.approve` 任务，审批通过后由绑定领域命令原子写入 Shipment 财务放行版本与审计锚点。旧 `shipment_release` 任务只保留历史读取和既有协同语义，不再有公开 producer。

任务动作终态不等于来源事实终态。排程完成只把业务投影推进到生产执行中，生产异常完成只记录异常已安排处理，出货放行完成只推进到 `shipping_released`；都不代写生产、质检、库存、出货或财务 Fact。来源后续关闭、取消或真实出货时，领域事务会继续把同一来源投影更新为 `closed / cancelled / shipped`，并追加来源状态事件，但不会修改既有 task status 或伪造历史 `done / rejected`。

`workflow` JSON-RPC 域承载 Workflow 协同任务主路径。任务列表按当前管理员在 active revision 中仍有效的 owner role、assignee、责任池成员 `role_key`、PMC / 老板催办边界和 super admin 收口；无论 owner role 来自管理员基础角色还是责任池 membership，都必须由同一角色的 entitlement 同时命中当前任务动作 capability 和当前 customer scope，并且对应 role profile 仍启用且没有 revoke 该动作。列表按同 scope 的 `workflow.task.read`，完成 / 阻塞 / 退回 / 催办按同 scope 的对应 action permission 过滤，避免把一个角色的动作权限、另一个角色的 owner 身份或另一个 customer scope 的 entitlement 拼接成处理资格；固定真实客户缺 active revision 或角色投影读取失败时 fail closed，不回退原始基础角色。完成 / 阻塞 / 退回动作只走 `complete_task_action / block_task_action / reject_task_action`，旧 `update_task_status` 已退出 JSON-RPC 运行时。服务端按当前管理员、任务责任角色、指派人和服务端解析出的可见 owner role 集合推导事件 `actor_role_key`，不采信前端提交的 raw `task_status_key` 或 `actor_role_key`。只读解释接口 `explain_action_access / explain_task_assignment` 用于返回当前账号为什么能或不能完成、阻塞、退回、催办某个任务，以及当前账号与 owner / assignee / 责任池 / PMC / 老板 / super admin 的任务归属关系；action explain 会返回 `required_permission`、`owner_role_key`、`visible_owner_role_keys`、`candidate_owner_role_keys`、`work_pool_role_matched`、`work_pool_entitlement_scope_matched` 和 `actor_role_key`，并额外返回 `configured_candidate_owner_role_keys / configured_membership_role_keys / configured_entitled_role_keys / configured_candidate_source`，按 active customer config 的 owner pool、当前 action capability 和 customer scope 反查配置候选责任角色；assignment explain 会返回各动作 `action_required_permissions`、`action_candidate_owner_role_keys`、`action_work_pool_scope_matches`、`action_configured_candidate_owner_role_keys` 与 `action_configured_candidate_sources`。只读解释复用实际动作的有效权限与角色判断，不会把已停用或被 revoke 的原始 owner role 报告成允许。只读解释还会返回 `domain_command_entry / action_domain_command_entries`：当前 `enabled=false`、`will_write_fact=false`，用于说明 task action 仍保持 Workflow-only，并列出正式接入领域命令前必须具备的 command key、domain usecase binding、stable business ref、idempotency、RBAC、append-only audit、重复提交测试和取消 / 冲正策略；workflow payload 里的 `command_key` 不会被采信为事实命令。super admin 当前保留查看和催办类诊断边界，但不通过普通任务动作默认处理业务任务；`complete_task_action / block_task_action / reject_task_action` 支持单次受控 break-glass，必须显式传入 `break_glass=true`、非空 `break_glass_reason` 和不超过 2 小时的 `break_glass_expires_at`。成功动作会把 `workflow_task.break_glass` 高风险审计与任务状态、事件 receipt、业务投影和派生任务放在同一事务内提交，payload 记录 `requested_next_status_key`，事件 actor role 固定为 `admin`；精确 receipt 重放不会重复写审计，事务失败也不会留下“动作已成功”的孤立审计。该机制不是长期 break-glass session、审批流、客户可见岗位能力或生产放行证据。它们不写库存、出货、质检、财务或其他 Fact，也不暴露 entitlement ID、user-level 候选人或全局候选人清单。

`get_task_board` 是 `workflow.task.read` 下的任务看板只读投影。它在同一查询快照中先应用 owner role / assignee 可见性与关键词、状态、到期、来源筛选，再返回全量 `total`、互斥的 `actionable / exception / due / finished` 计数和每栏有界分页。`source_types` 是稳定的来源候选 facet，只受任务可见性与显式 owner role 范围约束，不受当前关键词、状态、到期或来源值影响，避免选中来源后下拉候选塌缩。`rejected` 在生命周期中仍是 settled，不进入 due 且不可再操作；看板可将它只读投影到 `exception` 承接退回交接。默认每栏最多返回 5 条，单栏聚焦页最多 50 条；`lane_key` 只改变返回的分页栏，不改变完整 `total / counts / source_types`。未知状态会 fail closed，不会被静默漏计。

任务返回值包含内部并发字段 `version`；`complete_task_action / block_task_action / reject_task_action / urge_task` 必须提交正整数 `expected_version` 和顶层 `idempotency_key`。数据层按任务 ID、当前状态和版本做 CAS，成功动作只增加一次版本，并在同一事务的 `workflow_task_events` 中写入新版本、服务端计算的 SHA-256 intent hash、命令 key 和首次任务返回快照。receipt 使用稳定的 `workflow.task-mutation-result/v1`；writer 落库前校验 V1 DTO，reader 要求存储 key / command / status 为 canonical，并校验任务状态与非空业务状态字典。相同 task、key、actor、命令和业务 intent 的重放会在终态 / 版本校验前返回首次快照，不重复催办计数、审计、业务投影或派生任务。同 key 改 intent 返回 `40920`，新 key 操作终态任务仍按 settled 拒绝。公开 `create_task` 使用精确创建字段 allowlist，拒绝流程锚点、`customer_key`、receipt / CAS、未知字段以及上述来源任务的保留 task group / 任务编号前缀；普通任务创建不增加幂等或网络 replay。

linked ProcessRuntime 对账在任务已提交后失败时返回可重试未知结果，客户端必须保留同一 attempt 再取 receipt。前端会为一次用户 intent 冻结业务参数、`expected_version` 和安全 UUID；HTTP 408、网络中断、5xx 或结构不合法的 success response 都保留同一 key，任务抽屉、原因和证据也保持可重试。同一 task 的正式动作使用同步 in-flight lease 在请求发出前互斥，避免完成 / 阻塞 / 退回 / 催办跨动作双发；`version / idempotency_key / intent_hash` 均为内部技术字段，不面向业务用户展示。Go 与 JS 已共同消费共享 intent vectors，mixed evidence、raw whitespace key 和 relations 由同一 golden 锁定；当前定向 33/33、联合 62/62 不能外推为 final full/strict/L1 已完成。

`20260711063237 / 20260711075355` 已在本地隔离 migration chain 执行并固定为不可变 revision；`20260711104729` 新增 portable receipt bundle CHECK；`20260711204000` 把本项目迁移前投影表里的 `shipment_release_pending` 规范为正式业务状态 `shipment_pending`，不改 payload 中同名提醒类型。本项目迁移前且无法证明准确版本的事件继续保存 `task_version=NULL`，不使用事件行号或当前任务版本伪造 backfill；这不是旧项目、旧客户端或旧 API 兼容路径。当前迁移链包含两项不同的存量门槛：`--audit populated-upgrade` 核对 `20260714055504` 的状态、审计束、生命周期、流程锚点和待删除时间字段；`--audit customer-config-cutover` 核对 `20260714055825` 前必须显式治理的流程运行态和任务配置锚点。两项都由 `scripts/qa/populated-upgrade-preflight.sh` 在只读事务中执行，任一失败即停止 apply；迁移和发布脚本不得自动 DML。fresh schema、静态 DDL、Ent 零漂移和 Atlas validate 仍只证明结构与迁移链，不替代存量数据升级证据。共享工作树的 migration chain 可能继续增长，必须按当前代码与 Atlas status 重查。目标环境是否已发布仍以绑定具体 commit / image、数据库 status 和发布证据为准，本地 latest 不代表目标环境已经发布。

`attachment` JSON-RPC 域承载业务附件证据层和窄版产品媒体槽，canonical 读取 / 上传方法为 `list_attachments / upload_attachment / download_attachment`；另提供 `clear_product_image`，且只接受已保存产品的 `primary / secondary` 图片槽。普通物理删除接口仍已退出；除产品图片同槽替换 / 清空外，已上传证据不能由页面无痕删除，后续如需纠错必须先完成受控撤销与持久审计设计。产品图片固定使用 `owner_type=product + attachment_type=product_image`，只接受 PNG / JPEG / WEBP，写入要求 `product.update` 和 `products=enabled`；上传或清空在同一事务内锁定 `products` 行，同槽替换失败会回滚并保留旧图，数据库 partial unique index 再约束每个产品 / 槽位最多一行。服务端在 base64 解码后按声明格式完整解码图片；宽高单边不得超过 8192px、总像素不得超过 2000 万，扩展名、声明 MIME、完整图片内容或尺寸不一致时都会拒绝。其它附件挂到既有业务对象的 `owner_type + owner_id`，读取内容前会再次确认 owner 存在；上传 repo 在同一事务内锁定 owner 行并创建附件，debug 清理会先清理附件再清理 owner，避免孤儿记录。单个附件上限为 5MB，HTTP `/rpc/attachment` 在 JSON / protobuf 解析前限制 7MB 编码请求体，业务层还会在 base64 解码分配前检查编码长度，并在解码后复核 5MB 上限。当前 JSON-RPC 下载仍会在内存中生成 base64 响应，因此 5MB 是低配宿主的收窄内存预算，不代表大文件流式能力已经交付。

`workflow_task` owner 额外执行行级边界：list / download 必须同时具备 `workflow.task.read` 且任务处于当前 active revision 的可见责任范围；upload 只接受 `workflow.task.update`，并要求当前账号是有效 owner scope 或指定处理人，终态任务拒绝继续追加附件。PMC / 老板 / super admin 的催办能力不等于附件写权。其它 owner 继续复用所属业务对象权限和 active module state；附件只作为证据，不改变 Source Document、Fact、Workflow、库存、质检、财务、税控或总账状态，`content_base64` 等文件内容字段在 JSON-RPC 日志中脱敏。该切片不代表对象存储、流式大文件、病毒扫描或目标环境 release evidence 已闭环。

`masterdata` JSON-RPC 域承载客户、供应商、联系人、材料、产品、SKU 和加工环节主数据维护。客户 / 供应商页面保存主体和联系人时应优先使用 `save_customer_with_contacts / save_supplier_with_contacts`，在一个后端事务中完成主体创建 / 更新、联系人新增 / 更新以及遗漏联系人停用，避免前端串联联系人写入留下半保存主数据；单联系人 `create_contact / update_contact / set_primary_contact / disable_contact` 仍保留为底层单对象能力。供应商主体的 `address` 是经营 / 加工地址真源，`process_ids` 是可承接工序的多选能力关系；缺省 `process_ids` 保持现状，空数组清空，非空数组整体替换，且新关联工序必须启用并允许委外。产品基础信息使用 `create_product / update_product / get_product / list_products / set_product_active`，维护产品编号、名称、款号、默认单位、可选单重和启停状态；产品页另通过 `attachment` 域维护 0–2 张产品媒体，不把图片二进制写进 `products`。SKU 使用 `create_product_sku / update_product_sku / get_product_sku / list_product_skus / set_product_sku_active`，只维护产品规格主数据和启停状态，校验归属产品与可选默认单位，不写订单、库存、BOM、生产、出货或财务事实。基础档案写入口已接入 active module states 本地门禁：客户主体和客户聚合保存要求 `customers=enabled`，供应商主体和供应商聚合保存要求 `suppliers=enabled`，联系人创建 / 更新按 `owner_type` 映射到客户或供应商模块，联系人设为主要联系人 / 停用会先读取现有联系人 owner 再按对应模块要求 `enabled`，材料写入口要求 `materials=enabled`，产品和 SKU 写入口要求 `products=enabled`；`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写基础档案，历史 get/list 读取仍保留。加工环节 `processes` 写入口也已接入 active module states 本地门禁：`create_process / update_process / set_process_active` 要求 `processes=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `MasterDataUsecase` 写加工环节主数据；`get_process / list_processes` 历史读取仍保留。该切片只证明 MasterData 基础档案、产品媒体和 processes 加工环节主数据的本地能力，不代表目标环境 migration、部署、打印 smoke 或 customer acceptance 已闭环。

`sales_order` JSON-RPC 域承载销售订单 Source Document / Business Commitment 主路径。订单表单只通过 `save_sales_order_with_items` 聚合写入，草稿更新使用 `id + DRAFT + version` CAS。正式提交只走 `sales_order_acceptance` 的 `sales_order.submit` 命令；approval 完成后自动执行 `sales_order.activate_after_approval`，在同一数据库事务写 `SUBMITTED → ACTIVE` 与 ProcessRuntime durable result。公开 `submit_sales_order / activate_sales_order` 路由已移除，关闭 / 取消仍保留；销售订单不会写库存、出货、预留、财务、发票或收付款事实。

`purchase_order` JSON-RPC 域承载采购订单 Source Document / Purchase Commitment 主路径。采购订单表单只通过 `save_purchase_order_with_items` 聚合写入并使用单头 CAS。提交后正式页面启动 `material_supply`，首节点是 `workflow.task.approve`；批准后的自动命令只调用 `PurchaseOrderUsecase.ApprovePurchaseOrderForProcessCommand`，在同一事务写 `SUBMITTED → APPROVED` 与 durable result。公开 `approve_purchase_order` 路由已移除，`submit / close / cancel` 与历史查询保留。提交与启动审批是可重试的两个请求；启动失败时订单保持 `SUBMITTED` 且不能批准或入库。采购订单不写库存、批次、应付、发票或付款事实。

`outsourcing_order` JSON-RPC 域承载委外订单 Source Document / Outsourcing Commitment 主路径。委外订单表单保存应优先使用 `save_outsourcing_order_with_items`；更新已有草稿同样要求正整数 `expected_version`，并在单个事务里先按 `id + DRAFT + version` CAS 递增单头版本，成功后才更新明细。提交 / 确认 / 关闭 / 取消通过 `submit_outsourcing_order / confirm_outsourcing_order / close_outsourcing_order / cancel_outsourcing_order` 推进源单状态；委外明细以 `processing_item` 单独保存“加工项目 / 部位”，不与正式 `process_id` 或 `process_*_snapshot` 工序主数据混用，并保存 `product_order_no_snapshot / product_no_snapshot / product_name_snapshot / unit_name_snapshot` 等加工合同逐行打印快照。其中 `source_order_no / product_order_no_snapshot` 只用于追溯客户产品订单 / 销售订单号，不新增销售订单外键；公开输入和输出不接受或暴露 `source_sales_order_id`，PRODUCT / MATERIAL 主体均可独立保留。`20260718125909_migrate.sql` 通过新的不可变 Atlas revision 从目标 schema 删除该伪来源列，不改写旧 migration。它不写委外事实、库存、应付、发票或付款事实。委外订单写入口已接入 active module states 本地门禁：保存和提交 / 确认 / 关闭 / 取消都要求 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `OutsourcingOrderUsecase` 写入或推进委外订单；`get_outsourcing_order / list_outsourcing_orders / list_outsourcing_order_items` 历史读取仍保留。该切片只证明 outsourcing order 委外订单 Source Document 普通业务 API 的本地门禁，不代表 outsourcing fact、打印、其它导入入口或目标环境 release evidence 已闭环。

`production_order` 生产订单行已增加可选 `route_code` 和 `customer_inspection_required`，当前只接受固定 `PLUSH_SEW_HAND_V1` v1。工序主档使用唯一可选的 `production_route_operation_code` 显式绑定 `FABRIC_PROCESSING / SEWING / HANDWORK / PACKAGING` 四个标准路线位置；名称、类别、普通工序编码和列表排序都不是路线真源。该路线行发布时在原 BOM 材料需求快照之外，原子冻结四个工序快照和首个 WIP 批次；绑定缺失、重复或已停用时发布整体失败，不提供发布后的补初始化入口，也不按已有工序文本猜测回填。BOM 行以独立的显式 `production_operation_code=FABRIC_PROCESSING` 标记首道材料，并冻结到 `production_order_material_requirements`；显式路线行至少要有一条该材料需求，后端不从“面料”名称、类别或备注推断。历史 `route_code=NULL` 行不猜测回填路线，继续使用旧完工边界。

`production_wip` JSON-RPC 域只保留 `get_production_wip / execute_production_wip_action`。写动作使用精确 allowlist，包括 `SPLIT_BATCH / ASSIGN_EXECUTION / CANCEL_BATCH / START_OPERATION / COMPLETE_OPERATION / RECEIVE_OUTSOURCING_RETURN / TRANSFER_TO_NEXT_OPERATION / REWORK / CONFIRM_PACKAGING_MATERIAL`，并通过 `expected_version + idempotency_key +` 服务端 intent hash 守住 CAS 和精确重放。`CANCEL_BATCH` 只允许把尚未开工的 `PLANNED` 批次改为 `CANCELLED`，要求取消原因并追加不可变事件；它不重新拆分数量、不冲正已形成事实。已发布生产订单仍有活动 WIP 时，关闭和取消都会失败，不会留下订单已终止但 WIP 仍活动的分裂状态。布料加工正常流只允许按订单行整单数量外发，首道不允许拆批；必须绑定且仅绑定恰好覆盖显式 `FABRIC_PROCESSING` 材料需求的 MATERIAL 加工合同明细，开始前要求每条已有足量已过账委外发料。裁片关口 `PASS` 并转入车缝后，才允许按产品数量一次拆成至少两个 WIP 子批，且子批总量必须精确等于父批；车缝与手工每道独立选择 `IN_HOUSE / OUTSOURCED`。返工回到 FABRIC 后若再次外发，返工 WIP 必须绑定新的等量 PRODUCT 合同行，不复用正常流 MATERIAL 行。内部转移记录 `WIP_TRANSFER`，只有外发返回使用 `OUTSOURCE_RETURN`；这些 WIP 事件不写委外发料 / 回货或库存事实。包装启动前要求订单行级包材版面 / 版本业务确认，不代替品质 IQC。权限分为 `production.wip.read / assign / execute / rework` 和 `production.packaging_material.confirm`；生产订单列表 / 详情读取接受 `pmc.plan.read` 或 `production.wip.read`，但新建、编辑、生命周期动作和引用选项仍只属于 PMC，后端继续叠加 production / quality / outsourcing 模块状态门禁。`20260718110227_migrate.sql` 已完成一次性 PostgreSQL 18 fresh apply、约束读回和零漂移验证。Migration 不会按名称猜测或自动写入 `processes.production_route_operation_code`，使用固定路线前仍须通过工序页或受控 seed 显式绑定四个标准位置。133 较早固定 V5 已将路线 migration 应用到 `20260722000505` 并完成配置激活及岗位 / 页面技术检查；当前 HEAD 后续异常切片尚未整体重发，客户 UAT / 签收未完成，不能把旧目标证据写成当前版本已交付。

销售订单、采购订单和加工合同页面共同遵守分阶段保存合同：只有聚合保存请求本身或完整响应校验失败才能进入版本冲突 / 结果未知分支，并保持表单、不上传附件、不刷新列表；一旦保存响应给出有效 `id / version`，页面先绑定该已保存真源，再独立处理附件、明细读取和列表 / Workflow 刷新。后置失败只提示对应附件或刷新动作，不会把已保存源单重新解释为结果未知，也不会让新建重试再次以 `id=0` 创建。

`bom` JSON-RPC 域承载 BOM Version / 工程资料主路径。BOM 表单只通过 `save_bom_with_items` 写入，在一个后端事务中完成草稿头创建 / 更新、明细新增 / 更新与缺失行删除；更新已有草稿必须提交当前正整数 `expected_version`，其值来自读模型的 `edit_version`。`edit_version` 由既有 `updated_at` 生成，数据层按 `id + DRAFT + updated_at` CAS 并单调推进，冲突不会留下半保存明细；业务字段 `version` 仍只表示 BOM 版次。旧 `create_bom_draft / update_bom_draft / add_bom_item / update_bom_item / delete_bom_item` 分拆写接口已退出公开路由。复制、激活、归档继续使用 `copy_bom_version / activate_bom_version / archive_bom_version`；激活会把同产品旧 `ACTIVE` 版本设为历史版本（底层状态仍为 `ARCHIVED`），已激活 BOM 不允许直接改头或明细，改版应复制新草稿后再激活。该域只维护工程资料，不生成采购需求、采购订单、库存流水、生产任务、成本、应付、发票或付款事实。所有 BOM 写入口都要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase`；历史 `list_bom_versions / get_bom_version` 读取仍保留。该切片不代表目标环境发布证据已闭环。

`admin` JSON-RPC 域承载后台管理员、预设角色和权限管理。每个方法使用精确参数合同，未知字段和不在后端权限注册表中的权限码会整体拒绝。当前不开放自定义角色创建或角色物理删除；内置角色定义只负责首次初始化默认权限，角色落库后启动 seed 不再覆盖权限中心保存的功能组合。业务岗位还可通过 `set_role_navigation` 在 `recommended / custom` 间切换；`custom` 保存 1–5 个有序 ERP 页面路径，看板、帮助、重复路径和非法路径会拒绝，更新与权限 / 数据范围共用角色 version CAS 和 `system.role.permission.manage`，只控制导航位置而不授予页面或操作权限。系统控制面审计入口为 `audit_logs`，受 `system.audit.read` 权限控制，只读返回 `runtime_audit_events` 中的启动初始化、账号 / 角色 / 权限 / 导航变更和客户配置版本控制事件；支持按 `source / event_type / event_key / actor_key / target_type / target_key / keyword / created_from / created_to` 查询，并返回 `risk_level / action_label / summary / actor_key / target_type / target_key` 供前端定位。账号创建、角色绑定、账号启停、重置密码、角色权限 / 导航变更、客户配置 publish / activate 会追加非敏感摘要，不保存密码、token、密码 hash、compiled snapshot 或客户 raw 配置。该审计表不是采购、库存、质检、出货、财务等业务动作的通用审计事实表。

`customer_config` JSON-RPC 域承载客户配置版本控制面与受控 ProcessRuntime 入口。公开成品交付命令不包含财务放行：`shipment.finance_release` 只由通用 approval 对账在服务端内部触发；其它 validate / publish / activate / rollback / explain / start / execute 方法继续遵守 active revision、模块、RBAC、幂等和领域 usecase 门禁。配置 publish 仍以 normalized payload 的 canonical SHA-256 hash 执行 INSERT-only，控制面审计不保存 compiled snapshot 或 raw 配置；`explain_process_definition` 只读，不创建流程、不执行命令、不写 Fact。

以上方法是服务端公开能力清单，不等于正式 Web 页面已全部可达。销售订单页调用 sales start，采购订单页提交源单后调用 material-supply start，出货页直接调用 finished-goods-delivery start；财务放行不再提供公开 execute，由 approval 对账触发内部自动命令。其余显式 execute 仍按页面职责选择性开放。

该域里的流程运行时入口只做显式启动和显式领域命令执行，不上传任意客户包文件，不提供普通运行时 `install_module / uninstall_module / upload_plugin`，不导入真实业务数据，也不绕过领域 usecase 和后端 RBAC 校验。所有 `customer_config.execute_*` 显式流程命令在调用 `ExecuteDomainCommandNode` 前都会通过 `EnsureProcessDomainCommandModulesEnabled` 按 active revision module states 校验命令引用模块，非 `enabled` 时返回参数错误且不调用领域 usecase；这只是 `customer_config` execute API 的本地门禁，不等于普通业务 JSON-RPC、打印或其它导入入口已经全链路阻断。`start_sales_order_acceptance_process` 只从 active customer config 受控构造并显式创建 / 启动销售订单接单 ProcessInstance，要求 `sales_order.submit + sales_order.read`，返回 runtime boundary，不执行 domain command、不写 Fact、不替代正式 UI；`execute_sales_order_acceptance_submit` 只执行已 active 的 `submit_sales_order` 节点，要求调用方提供 process instance、process node、expected version、销售订单 ID 和幂等键，成功后调用 `sales_order.submit` domain command 提交销售订单 Source Document，并推进到老板审批 linked task，仍不写库存、出货、质检、财务或其他 Fact。

`start_material_supply_purchase_order_process` 只从已提交采购订单创建并启动 `purchase_order` ProcessInstance，要求 `purchase.receipt.create + purchase_order.read`；首节点创建老板责任池 approval，批准后的内部自动命令调用唯一采购批准 usecase。`execute_material_supply_purchase_receipt_create` 随后通过 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder` 从已批准采购订单创建收货草稿、HOLD lot 和逐行来料质检；`execute_material_supply_quality_gate` 只聚合正式质检结果，`execute_material_supply_post_inbound` 再校验并过账库存。审批 task done 本身不创建收货、不写质检或库存 Fact。

上段 `start_material_supply_purchase_order_process` 的来源状态现已收口为 `SUBMITTED`，不是“已审批”：首节点创建老板责任池 approval，批准后内部自动命令调用唯一采购批准 usecase；公开直批路由已退役。采购提交与启动流程分两次可重试请求，启动失败时保持 `SUBMITTED` 并禁止批准和入库。

ProcessInstance 的业务引用唯一性由 `process_key + business_ref_type + business_ref_id` 约束。同一业务引用使用同一 `idempotency_key` 重试创建时返回已有流程实例和节点；同一业务引用换一个 `idempotency_key` 再启动会被拒绝为重复流程，避免同一销售订单、采购订单或出货单生成多条公开并行流程。重复调用 `StartProcessInstance` 会对首节点做有界恢复：`human_task / approval` 的 active 节点补建或精确重放同一 linked WorkflowTask，已完成 `end` 补齐 ProcessInstance completed，带 durable result 的已结算 `domain_command` 继续结算；active `domain_command / wait_event` 只返回当前节点，不自动重复领域副作用或唤醒事件。任务重放会核对不可变任务字段和原始 payload intent，运行时后来追加的 payload 字段不造成误冲突。

ProcessRuntime 执行 `domain_command` 时，先让已登记 handler 做无副作用只读预检，再把 `command_key + idempotency_key + JSON payload` 的 SHA-256 fingerprint 原子绑定到 active 节点；数据层使用单条带状态、版本和 fingerprint 条件的 `UPDATE ... RETURNING`。protocol v1 的 `sales_order.submit / purchase_receipt.create / inventory.post_inbound / finished_goods_quality.decide / shipment.ship / finance.receivable_lead` 会在各自领域事务内同时写业务副作用和 durable result / effect ref；`quality_inspection.aggregate_gate / shipment.finance_release` 会在锁定来源对象的短事务内评估并记录 `effect_state=none`。handler 返回后 runtime 的 `RecordResult` 只是 exact replay；重试会先读持久结果并跳过 Validate / handler，再继续节点结算、linked ref CAS 和下游推进对账。

销售订单取消、采购入库取消冲正、已出货取消冲正和财务事实取消会在同一领域事务内标记 compensation；正式认证 JSON-RPC 主路径会把当前管理员写入 `domain_command_compensated_by`。active 节点读取 compensated result 会阻塞流程，已完成节点在补偿后重放会返回 `40921` 且不再推进下游。若补偿前已有下游节点被激活，当前不会自动回滚下游，只保留证据并等待明确恢复决策。migration `20260710150000` 只把升级前 active 空 fingerprint 标成 fail-closed sentinel；`20260710150001` 才新增 protocol / result / hash / effect-ref / compensation schema，并把本项目迁移前已有 fingerprint 标为 protocol 0。本项目迁移前的 protocol 0、已提交销售订单但缺 exact result，以及省略 `inspected_at`、无法证明原判定时间的迁移前成品质检 result-missing 仍返回 `40921`。本地 PostgreSQL 已覆盖结果冲突时领域写回滚、finance exact recovery / payload conflict / cancellation compensation、本项目迁移前销售结果 fail closed、completed-node compensation fail closed 和 ProcessRuntime 并发；目标环境尚未应用 `20260710150001`，也没有 release evidence。

`purchase` JSON-RPC 域里的采购入库写入口已接入 active module states 本地门禁：`create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 都要求 `purchase_orders / purchase_receipts / quality_inspections / inventory=enabled`，并同时要求 `purchase.receipt.create + purchase_order.read`；`post_purchase_receipt / cancel_purchase_receipt` 按各自事实副作用要求 `purchase_receipts`、`quality_inspections` 或 `inventory` 为 `enabled`。依赖模块 `read_only / disabled / 缺失` 会返回参数错误且不调用 `InventoryUsecase` 写 Source Document、质检或库存事实。公开新建只接受 `create_purchase_receipt_from_purchase_order`；旧 `create_purchase_receipt_draft / create_purchase_receipt_with_items` 已退役并返回 unknown method，内部 usecase 不构成公开无来源写入口。公开的 `create_purchase_receipt_from_purchase_order / add_purchase_receipt_item` 要求调用方提供不超过 128 字符的稳定 `idempotency_key`，拒绝调用方提交 payload hash；`add_purchase_receipt_item` 还必须提供 `purchase_order_item_id`，服务端会在锁定入库单后校验来源采购单已审核、来源材料 / 单位与入库行一致、来源采购单供应商与入库单稳定供应商一致，并禁止同一入库单跨采购单追加。服务端规范化业务参数后生成 SHA-256 intent hash，并在事务锁内再次检查 replay。相同 key 和 intent 只返回原始收货行、HOLD lot 与来料质检事实，key 相同但 intent 不同返回幂等冲突；写入错误或 commit 结果未知时按同一 key 回查，损坏或缺失的结果边界 fail closed。`get_purchase_receipt / list_purchase_receipts` 保留历史读取边界，不把模块关闭理解成历史数据不可查。该切片只证明 purchase 采购入库普通业务 API 的本地门禁，不代表打印或目标环境 release evidence 已闭环。

active revision 的 `work_pool_memberships.role_key` 可被 Workflow 服务端用于收窄当前账号任务可见 owner role 集合，但只有同一 revision 的同一条 `access_entitlements` 同时命中该 role、当前 workflow action capability 和当前 customer scope 时才会扩展处理资格；`workflow_tasks.owner_pool_key / required_capability_key / config_revision / process_instance_id / process_node_instance_id` 当前只作为新任务 runtime 解释锚点、配置版本线索和流程节点追踪锚点，旧任务可为空；公开 JSON-RPC `create_task` 只创建无流程关联、且不占用来源任务保留命名空间的普通协同任务，显式提交 `config_revision / process_instance_id / process_node_instance_id` 会被拒绝，`config_revision` 只由服务端受控派生，两个流程节点关联 ID 只由 ProcessRuntime 的 `CreateLinkedWorkflowTask` 内部路径生成；ProcessRuntime 可显式启动 active ProcessInstance 的首个 waiting 节点，首节点为 `human_task / approval` 时才创建 linked WorkflowTask；ProcessRuntime 只允许从 `active` 且 `expected_version` 匹配当前节点版本的 `human_task / approval` 节点显式创建 linked WorkflowTask，未显式传 `owner_role_key` 时只接受 active customer config 解析出的唯一候选 owner role，相同 `task_code` 的同一节点重试会返回已有任务，也可读取已 `done` 的 linked WorkflowTask 完成当前 ProcessNodeInstance；显式 task group、由 node key 回退得到的 task group，以及客户流程定义的人工 / 审批 node key 都不能占用来源任务保留 task group 或编号前缀。`complete_task_action` 成功完成 linked WorkflowTask 后会受控触发当前节点完成，并按顺序、命名 policy、fan-out / join 或受控 returnTo attempt 路由激活下一组节点；刚激活的 `human_task / approval` 会复用 `CreateLinkedWorkflowTask` 创建下一 linked WorkflowTask，刚激活的 `end` 会完成 end 节点并把 ProcessInstance 标记为 completed，`domain_command / wait_event` 只进入 active 等待显式执行 / 唤醒；旧 `update_task_status` 已退出运行时，且系统仍不会由后台 scheduler 自动启动流程、自动扫描流程定义、自动扫描 overdue、跳过节点、为 `domain_command / wait_event / end` 创建 WorkflowTask、把任务完成自动绑定到 domain handler、发送提醒升级通知或直接新增任务事实字段。

`workflow` JSON-RPC 写入口已接入 active module states 本地门禁：`create_task / complete_task_action / block_task_action / reject_task_action / urge_task` 先按各自精确顶层合同拒绝 `customer_key` 和未知字段，再只用服务端部署上下文解析当前客户，并要求 `workflow_tasks=enabled`；`read_only / disabled / 缺失` 会拒绝且不调用 Workflow usecase 写任务、事件或业务状态。旧 `update_task_status` 和公共 `upsert_business_state` 已退出运行时，调用会返回 unknown method。`metadata / list_tasks / list_business_states / explain_action_access / explain_task_assignment` 只读查询继续保留。该切片只证明 Workflow JSON-RPC 写入口的本地模块门禁，不改变 Workflow task done 不等于 Fact posted 的边界，也不代表打印、其它导入入口或目标环境 release evidence 已闭环。

公开 `workflow.create_task` 使用独立入口校验：它精确拒绝当前 registry 中全部 19 个会驱动领域 transition 或生成下游任务的 task group，其中三个确定性来源任务组 / 编号前缀继续受 `workflow.source-task/v1` 命名空间保护。这个公开入口门禁不禁止受信的领域事务和 ProcessRuntime producer 使用同一批真实任务组。

所有公开“从来源查候选 / 派生单据 / 生成事实 / 启动流程”动作都受共享 source-action permission registry 约束：除目标页面或动作权限外，还必须拥有精确上游单据 / 事实读权限，且在进入来源 repo / usecase 前 fail closed。生产订单的销售行 / BOM、出货的销售来源和 WIP 外发合同按实际绑定条件逐项加权；对账则先阻断完全无来源可见性的请求，再按服务端读回的 authoritative FactType 要求对应一类财务读权限。

`/templates/render-pdf` 模板 PDF 生成入口已接入 active module states 本地门禁：已登记 `template_key` 中，`material-purchase-contract` 要求 `purchase_orders=enabled`，`processing-contract` 要求 `outsourcing_orders=enabled`，`engineering-material-detail`、`engineering-color-card` 和 `engineering-work-instruction` 要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会拒绝生成 PDF；未知模板 key 会返回参数错误，不再绕过模块归属判断。`engineering-work-instruction` 可由物料清单（BOM）页面或委外订单生成业务草稿，但 PDF 模板仍按工程资料门禁登记，委外入口只提供外发上下文，不改变模板归属或写入委外事实。生产镜像固定已在目标宿主验证的 Debian Chromium `150.0.7871.100-1~deb12u1`，构建时校验实际包版本；正式发布 smoke 必须用受控 admin token 调一次真实最小 PDF，校验 HTTP 200、`%PDF` 文件头和非空结果，不把关闭 warmup 当成 PDF 可用证据。该切片不代表打印留档回写或 Excel 母版回写已经实现。

ProcessRuntime 的 `wait_event` 当前只提供 usecase 层显式唤醒：`WakeProcessWaitEventNode` 要求节点为 `active`、版本匹配、`policy_snapshot.event_key` 已声明，调用方提供匹配事件 key 和幂等键后才完成该节点并复用顺序推进。它不提供事件订阅器、不由 `complete_task_action` 自动触发、不创建 WorkflowTask、不扫描或跳过流程节点，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的通用启动仍只在 usecase 层暴露；公开 `customer_config` 只保留三条来源绑定入口：`DRAFT` 销售订单启动 `sales_order_acceptance`、`APPROVED` 采购订单启动 `material_supply`、`DRAFT` 出货单启动 `finished_goods_delivery`。三者均要求目标动作权限与精确来源读权限；数据层在同一事务锁定来源，从真实单据派生 canonical `business_ref_no` 并复核状态，只允许同来源、同 idempotency key 与同定义的已创建流程重放；销售订单已 `SUBMITTED` 或出货单已 `SHIPPED` 只是既有流程精确重放容忍，不允许新建。旧的入库单起点 `start_material_supply_process` 已退役。`StartProcessInstance` 首次启动会激活首个 `waiting` 节点，重试只执行有界恢复；它不提供后台 scheduler，不扫描或跳过中间节点，也不因“启动”本身写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的命名 policy 分支当前也只提供 usecase 层显式 handler：节点完成后，只有当前节点 `policy_snapshot.branch_policy_key` 已注册为 `ProcessBranchPolicyHandler`，运行时才会让 handler 返回下一节点 key，并只激活同一 ProcessInstance 内这个仍为 `waiting` 的目标节点。它不解析自由表达式、客户 JS / SQL 或任意脚本，不自动跳过或 settle 非选中分支，不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `returnTo` 当前只提供 usecase / repo 层受控返工 attempt：节点完成后，只有当前节点 `policy_snapshot.return_to_node_key / return_outcomes / return_max_attempts` 明确声明返工目标、触发 outcome 和最大 attempt，且 outcome 命中时，运行时才会复制目标 node key 的最新已 settled 节点配置，创建下一 attempt 的 waiting `ProcessNodeInstance` 并激活它；目标是 `human_task / approval` 时才创建 linked WorkflowTask。目标不存在、目标最新 attempt 未 settled、超过上限或配置非法都会拒绝。它不提供任意循环、不复用旧 completed 节点、不自动 settle 其他分支、不绑定真实领域 usecase，也不写库存、出货、质检、财务或其他 Fact。

ProcessRuntime 的 `blocked / due_at` 当前只提供 usecase / repo 层显式阻塞：阻塞入口要求 active 流程、active 节点、`expected_version` 匹配和非空 reason；`EscalateDueProcessNode` 额外要求节点已有 due_at 且当前时间达到或超过 due_at。数据层在同一个 PostgreSQL 事务内把节点和 ProcessInstance 标记为 blocked，任一更新失败会整体回滚；它不写 completed_at，不推进后续节点，不创建 WorkflowTask，不提供后台 scheduler、不自动扫描 overdue、不发送提醒升级通知，也不写库存、出货、质检、财务或其他 Fact。

当前服务端 runtime 未发现 active business scheduler / timer 写入口。现有后台任务只限 server bootstrap 初始化、`template_pdf` 的 PDF warmup / Chrome WebSocket 等待，以及 `taskgroup` 生命周期工具；这些任务不按客户配置启动流程、导入、打印或过账，也不执行业务模块写入。后续若新增业务 scheduler、cron、outbox worker 或自动 overdue 扫描，必须另拆阶段接入 active module states、RBAC、幂等、审计和测试。

ProcessRuntime 当前白名单注册 `sales_order.submit / purchase_receipt.create / quality_inspection.aggregate_gate / inventory.post_inbound / finished_goods_quality.decide / shipment.finance_release / shipment.ship / finance.receivable_lead`。其中 `sales_order.submit` 调用 `SalesOrderUsecase.SubmitSalesOrder` 提交销售订单 Source Document，并校验流程业务引用与 payload `sales_order_id` 一致；`TestSalesOrderAcceptanceProcessSubmitCreatesBossApprovalAndPmcReview` 已锁住同一流程实例内提交后激活老板审批 linked task、老板完成后激活 PMC 评审 linked task 的后端最小链路。前端 `orderApprovalFlow` 串任务 builder 已删除，正式运行时代码只保留订单审批相关任务识别和状态常量。客户配置 runtime manifest 已编译 `sales_order_acceptance` 的 `runtime_loader_ready` 流程定义，并把客户包 source pool 映射到 runtime `order_approval` / `order_review` 责任池；后端 `BuildProcessInstanceCreateFromActiveCustomerConfig` 可从 active revision 受控构造 `ProcessInstanceCreate`，并拒绝未启用 loader、Fact 边界变更或未知 command key；`customer_config.start_sales_order_acceptance_process` 可显式创建并启动该流程实例首节点，要求 `sales_order.submit` 权限并返回 runtime boundary，仍不执行 domain command；`customer_config.execute_sales_order_acceptance_submit` 可显式执行已 active 的首个 submit command，提交销售订单 Source Document 并推进到老板审批 linked task；正式销售订单页的“提交”动作已接入 `submitSalesOrderAcceptanceProcess`，先调用 start API，再调用 submit command API，不再直连旧 `submit_sales_order`。它不由普通 `complete_task_action` 自动触发提交命令，不写库存、出货、质检、财务或其他 Fact，也不代表客户配置流程定义已在目标环境加载、目标环境 evidence 已闭环或完整销售订单黄金闭环已经生产可交付。

所有“读取已有单据 / 事实，再查询候选或生成下游对象”的公开动作都复用 `publicSourceActionReadPermissionContracts`。handler 必须先通过目标动作权限、精确来源读权限和来源 / 目标模块状态，才允许进入来源 repository 或写 usecase；条件来源只在请求确实引用该来源时加权，动态财务来源按服务端读回的真实 FactType 收窄到应付 / 应收 / 发票读权。registry 同时补充 permission usage；逐项缺权测试验证任一来源能力缺失都会在写前拒绝，AST handler guard 验证每个已登记 action 的 handler 分支确实调用 guard。来源模块为 `read_only / disabled / 缺失` 时也不能用目标模块写权绕过。

`operational_fact` JSON-RPC 当前承载生产、委外、出货、库存预留和财务事实的最小运行入口。shipment 主路径复用 `shipments / shipment_items / inventory_txns`，提供：

- `list_shipment_source_candidates`
- `create_shipment_with_items`
- `ship_shipment`
- `cancel_shipment`
- `get_shipment`
- `list_shipments`

这组接口使用 `shipment.read / shipment.create / shipment.ship / shipment.cancel` 动作权限；来源候选以及绑定销售订单或订单行的新建还同时要求 `sales_order.read / sales_order_item.read`。`list_shipment_source_candidates` 是服务端唯一的可出货来源候选合同。公开 `create_shipment / add_shipment_item / submit_shipment_release` 已退出；页面通过 `customer_config.start_finished_goods_delivery_process` 启动 active revision。流程质量关口通过后生成财务审批，审批通过自动执行 `shipment.finance_release`，在同一领域事务内 CAS 写入 `finance_release_status / version / actor / process instance / node / note` 和 durable command result。

`ship_shipment` 才把出货单推进到 `SHIPPED` 并写库存 `OUT`。服务层和数据层都会要求 Shipment 当前 `finance_release_status=APPROVED`，并继续校验质检、销售来源数量、库存预留和可用量；普通调用和流程领域命令共用这一不可绕过门禁。任何一项失败都不写出货或库存。

`cancel_shipment` 同时承担草稿源单取消和已出货冲正，但两条路径严格分开：`DRAFT` 没有放行任务时可直接转为 `CANCELLED`，不创建 Workflow、不写库存；存在 `ready / blocked` 放行任务时拒绝取消，必须先完成或退回；任务已经 `done / rejected` 时允许取消源单，只把来源投影推进到 `cancelled`，保留任务终态和退回原因。`SHIPPED` 取消仍要求可信放行任务为 `done`，并在同一事务写库存 `REVERSAL`。重复取消按真实 `shipped_at` 区分是否曾经出库，不会把草稿取消伪报为库存冲正。

正式出货页与上述状态分支保持同一口径：`DRAFT` 显示“作废草稿”并提示不扣减 / 恢复库存，`SHIPPED` 显示“撤销已出货”并提示恢复库存；取消 RPC 后重新加载出货列表。这一页面合同不替代真实 PostgreSQL 库存读回。

`operational_fact` 的 shipment 出货写入口已接入 active module states 本地门禁：`create_shipment_with_items` 要求 `shipments=enabled`，其正式依赖闭包同时要求 `sales_orders / inventory` 等依赖保持 `enabled`；`ship_shipment / cancel_shipment` 要求 `shipments / inventory / workflow_tasks=enabled`。写入模块或依赖不可写时不会进入仓储。`get_shipment / list_shipments` 保留历史读取边界。

`operational_fact` 的 stock reservation 库存预留写入口已接入 active module states 本地门禁：`create_stock_reservation_from_sales_order / release_stock_reservation` 要求 `inventory=enabled`；创建时只接受销售订单、订单行、仓库、批次和数量，产品、SKU、单位由后端锁定源单派生。`read_only / disabled / 缺失` 会返回参数错误且不调用 `OperationalFactUsecase` 写库存预留事实。`list_stock_reservations` 保留历史读取边界，不把模块关闭理解成历史预留不可查。普通业务 API 不提供独立 `consume_stock_reservation`：`CONSUMED` 只能由 `ship_shipment` 在真实出货与库存 `OUT` 的同一事务内推进，不能单独释放可用量。

`operational_fact` 的 production 生产事实写入口已收口为 `create_production_material_issue_from_order / create_production_completion_from_order / create_production_rework_from_completion`，并继续使用 `post_production_fact / cancel_production_fact` 处理状态。领料必须来源于发布时冻结的物料需求，完工必须来源于生产订单行，返工必须来源于已过账完工事实；公开 `create_production_fact` 已退役。来源坐标完整的领料、完工和返工 `DRAFT` 可直接转为 `CANCELLED`，不写库存；`POSTED` 取消才写事实自身来源的库存反向流水。已过账完工有非取消 REWORK 时阻断取消，已过账 REWORK 仍要求来源异常任务达到允许终态；草稿子事实取消后只解除相应父生产订单的子事实阻断，不替父单结清 WIP 或来源任务。对显式 `PLUSH_SEW_HAND_V1` 订单行，完工入库的创建与过账数量还不得超过最终包装工序已 `ACCEPTED` WIP 数量；包装动作完成、包材业务确认或 Workflow task done 都不单独写成品库存。所有写入口要求 `production=enabled`；REWORK 的过账及其 `POSTED` 后取消还要求 `workflow_tasks=enabled`，因为两者分别原子创建、核对并推进来源异常任务。`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_production_facts / list_production_order_material_requirements` 保留历史读取边界。

`operational_fact` 的 outsourcing fact 委外事实写入口已收口为 `create_outsourcing_material_issue_from_order / create_outsourcing_return_receipt_from_order`，并继续使用 `post_outsourcing_fact / cancel_outsourcing_fact` 处理状态。发料、回货均锁定已确认委外订单行并派生供应商、业务对象和单位；公开 `create_outsourcing_fact` 已退役。来源完整的 `DRAFT` 发料 / 回货可取消且不写库存，`POSTED` 取消才写库存反向流水；回货无论草稿或已过账，只要仍有非取消质检或应付就阻断取消，已过账发料还继续服从 WIP 外发分配依赖。子事实达到 `POSTED / CANCELLED` 后才解除父委外单关闭阻断，全部 `CANCELLED` 后才解除父委外单取消阻断。加工合同页的“委外记录”使用 `outsourcing.fact.read / post / cancel` 和 canonical RPC 展示 `MATERIAL_ISSUE / RETURN_RECEIPT`，DRAFT 可过账或作废、POSTED 可取消、CANCELLED 只读，并在写后重新读取目标状态；质检和应付只对 `POSTED RETURN_RECEIPT` 开放。写入口要求当前模块目录中的 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例。`list_outsourcing_facts` 保留历史读取边界。

`operational_fact` 的来源财务入口收口为 `create_receivable_from_shipment / create_invoice_from_shipment / create_payable_from_purchase_receipt / create_payable_from_outsourcing_return / create_reconciliation_from_finance_fact`；往来方、币种、金额和来源由后端从已过账事实派生，公开 `create_finance_fact` 已退役。真实收付款使用独立 `create / post / reverse_finance_payment`，过账时只允许按同往来方、同币种和收 / 付方向把一笔款项分配到多条应收或应付，并支持部分核销；红冲 / 反向红冲使用独立 credit note 合同。`post / settle / cancel_finance_fact` 继续承担来源财务事实状态动作。正式来源的 `DRAFT / POSTED` 可进入 `CANCELLED` 并保存审计；草稿取消不写库存，无正式来源草稿 fail closed，非取消下游继续阻断上游取消。写入口要求 `finance=enabled`；银行直连 / 流水导入、付款申请审批、总账和税控不在当前合同。

采购、生产、委外和财务的 post / cancel 都在同一事务锁定事实行，并按领域约定追加父单、来源、批次或 active downstream 锁。并发只允许两种串行结果：cancel-first 时后续 post 失败且没有库存流水；post-first 时先完成过账，再执行完整 `REVERSAL` 或财务取消审计。生产 / 委外父单关闭要求子事实处于 `POSTED / CANCELLED`，父单取消要求全部子事实 `CANCELLED`；取消子草稿只解除相应依赖，不自动结算 WIP、Workflow、质检、应付或对账。

业务记录页还会在调用前对历史草稿 fail closed：生产 / 委外 `DRAFT` 缺少该类事实必需的来源坐标时，同时禁用过账和作废；财务 `DRAFT` 缺少可校验正式来源时，同时禁用确认和作废。合法来源草稿仍按上述状态机开放；页面禁用只是避免发起必然失败的请求，不替代服务端校验。

成品交付流程当前已完成合同预检、manifest 定义证据和 start-only loader：shipment 事实入口为 `create_shipment_with_items / ship_shipment / cancel_shipment`，公开财务创建入口为上述来源专用方法；ProcessRuntime 的 `finance.receivable_lead` handler 仍可在工作流合同内调用内部 usecase 创建与出货来源绑定的应收草稿。`customer_config` runtime manifest 会编译 `finished_goods_delivery / quality_finance_ship_receivable` 的 `runtime_loader_start_ready` 定义，并可通过只读 `customer_config.explain_process_definition` 查看 `runtime_loader_enabled=true`、节点命令合同和剩余 blocker。`start_finished_goods_delivery_process` 要求 `shipment.create` 权限，只从 active customer config 显式创建并启动 shipment 业务引用的 ProcessInstance，首个 `finished_goods_quality` domain command 进入 active 等待；它不执行 domain command、不写质检、出货、库存、应收、开票或财务 Fact。

`execute_finished_goods_delivery_quality_decide` 已注册 `finished_goods_quality.decide` ProcessRuntime handler，要求 `quality.inspection.update` 权限，显式传入 active `finished_goods_quality` 节点、expected version、shipment ref、`quality_inspection_id` 和幂等键后，校验该质检单已经是 `source_type=SHIPMENT / source_id=<shipment_id> / inspection_type=FINISHED_GOODS` 的已提交质检事实，并调用 `InventoryUsecase.PassQualityInspection / RejectQualityInspection` 判定质检；实际 `inspector_id` 固定取当前认证 admin actor，不接受命令 payload 代报。它不复用 `material_supply` 的 `quality_inspection.aggregate_gate`，后者只聚合采购收货逐行正式质检结果、不判定单张质检单；该成品质检 handler 不调用采购入库过账，也不写出货、库存流水、应收、开票或财务 Fact。

`shipment.finance_release` ProcessRuntime handler 只由 `shipment_finance_approval` 完成后的内部自动命令触发，公开 `execute_finished_goods_delivery_finance_release` 已移除。数据层锁定 Shipment，以 `finance_release_status=PENDING` 和 `finance_release_version` 做 CAS，在同一事务写 `APPROVED`、版本、时间、actor、流程实例 / 节点锚点、审批意见和 durable result；普通 `ShipShipment` 与流程出货命令都必须读到 `APPROVED`。该门禁不创建出货、库存流水、应收、开票、付款或总账事实；目标环境 migration 与岗位验收仍未执行。

`execute_finished_goods_delivery_shipment_ship` 已注册 `shipment.ship` handler，要求 `shipment.ship` 权限，payload 只接受 shipment ref；命令不再接收实际未落账的 shipment no、warehouse、operator、shipped time、carrier、tracking no 或 note。它调用 `OperationalFactUsecase.ShipShipment`，成功后完成 `shipment_execution`、激活 `receivable_lead`，并复用现有 `ship_shipment` 领域逻辑把出货单推进到 `SHIPPED`、写库存 `OUT`，但仍不是 Workflow task done 自动过账，也不写 finance Fact。`execute_finished_goods_delivery_receivable_lead` 已注册 `finance.receivable_lead` handler，要求 `finance.receivable.confirm` 权限，显式传入 active `receivable_lead` 节点、expected version、shipment ref、`receivable_source_no`、`expected_amount` 和幂等键后调用内部财务 usecase；应收 counterparty 强制取已 `SHIPPED` shipment 的 `customer_id` 真源，payload 不接受 caller 自报 customer。该 handler 只创建 `RECEIVABLE` 草稿并把 finance fact 记录为流程 linked ref，成功后完成 `receivable_lead` 和 end 节点，不 post / settle / cancel finance fact，也不创建 invoice。当前四个成品交付 execute handler 本地已注册；目标环境 release evidence 仍未闭环。不得把 `shipment_release done` 解释为自动出货、自动扣库存、自动生成应收或自动开票。

质检事实当前在 `quality_inspections` 上保留 nullable `source_type / source_id / inspection_type / subject_type / subject_id` 锚点。来料质检使用 `PURCHASE_RECEIPT / INCOMING / MATERIAL`；委外回货质检使用 `OUTSOURCING_FACT / OUTSOURCING_RETURN / PRODUCT|MATERIAL`，只允许从已过账回货事实创建且累计送检量不得超过有效回货量；出货前成品检验使用 `SHIPMENT / FINISHED_GOODS / PRODUCT`，只允许从 `DRAFT` 出货单按产品 / SKU、仓库和批次组合创建。该组合是当前正式送检粒度，同组合重复出货行聚合为一批，不声称具备逐出货行锚点。创建在 shipment 行锁事务内完成，同单号同 payload 精确重放、同送检粒度非取消记录冲突、取消后可重建，并与确认出货串行化。没有成品质检时仍可按当前可选检验策略出货；一旦存在非取消记录，`DRAFT / SUBMITTED / REJECTED` 会阻止出货，只有 `PASSED + PASS / CONCESSION` 放行。这些来源不能互相伪装，也不由 Workflow 完成状态代写质检事实；直接从出货页创建质检不会启动或推进 `finished_goods_delivery` ProcessRuntime。委外应付只有在恰有一张非取消质检达到 `PASSED + PASS / CONCESSION` 时才能生成。

生产 WIP 分段质检使用 `PRODUCTION_WIP / PRODUCTION_STAGE / WIP`，并以 `production_wip_batch_id + gate_code` 绑定裁片、皮套、成品、针检、抽检和条件客户验货。工序完成或外发返回后只创建当前第一关草稿；提交、判定、取消和顺序生成下一关都与 WIP 批次状态在同一事务内校验。当前没有关口级让步审批策略和审计，因此生产阶段只有 `PASSED + PASS` 放行，通用 `CONCESSION` fail closed；这不改变上述其他来源现有的让步边界。

`quality` JSON-RPC 域里的质检写入口已接入 active module states 本地门禁：`create_quality_inspection_draft / create_quality_inspection_from_outsourcing_return / submit_quality_inspection / pass_quality_inspection / reject_quality_inspection / cancel_quality_inspection` 要求 `quality_inspections` 为 `enabled`；`create_finished_goods_quality_inspection_draft` 同时要求 `shipments / quality_inspections` 为 `enabled`。`read_only / disabled / 缺失` 会返回参数错误且不调用领域用例创建或变更质检事实。成品检验创建只接受 canonical `inspection_no / shipment_id / finished_goods_lot_id / product_id / warehouse_id / decision_note` 与 customer scope，不接受来源别名或 caller 代报 inspector。`get_quality_inspection / list_quality_inspections / list_finished_goods_quality_inspections / list_outsourcing_return_quality_inspections / list_production_stage_quality_inspections` 保留各来源读取边界，不把模块关闭理解成历史数据不可查。

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

`make run`、`make dev` 和 `make dev_restart` 会先校验仓库根目录 `config/dev-ports.env`，并把其中固定的 HTTP `8300`、gRPC `9300` 注入 dev 配置；生产配置不消费这组覆盖。随后共享本地启动预检运行 `db-guard` 核对 Ent schema 与 versioned migration，再读取当前 dev 配置命中的数据库，要求 Atlas status 已到最新 revision 且 pending 为 0。`make dev_restart` 只在预检通过后才停止旧进程，避免先停服再发现缺 migration。该预检始终只读，不会自动执行 `migrate apply`；失败时应先审查并完成 migration，不应绕过。

主端口不自动顺延。`make dev_stop` / `make dev_restart` 虽按登记端口查找 listener，但停止前会逐个校验进程 cwd 位于本仓库；端口被其他项目占用时会报告 PID、cwd 和命令并拒绝 kill。整组本机覆盖必须写入 ignored 的 `config/dev-ports.local.env`，且包含完整端口组。

登记的本地开发库未显式设置管理员账号或密码时，分别使用 `admin` / `adminadmin`。配置或 `APP_ADMIN_*` 显式值优先；启动只创建缺失账号，不会覆盖已有账号密码。管理员账号创建、初始化和重置密码统一要求 8～20 位，并继续受 bcrypt 72-byte 安全边界保护。若本地验收工具曾改动稳定管理员，使用以下专用命令恢复当前开发库；它会递增认证版本并撤销旧会话，且没有生产或 133 逃逸开关：

```bash
make reset_local_admin_password
```

本地后端默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，并只在 `make run`、`make dev`、`make dev_restart` 这些本地入口中设置 `ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG=1`。前者避免显式 session 请求读取永绅、而未携带 customer key 的业务 RPC 回落到 `demo`；后者只允许本地服务接收带 `local_test_apply` 标记的测试 revision。专用别名仍可用于强调意图：

```bash
make run_yoyoosun
make dev_restart_yoyoosun
```

确需启动 demo 时必须显式覆盖，例如 `ERP_CUSTOMER_KEY=demo make dev_restart`。永绅本地测试配置仍需登录后在 Vite 开发控制台显式应用；上述目标不会自动发布或激活配置。未通过本地 Make 入口启动的后端默认拒绝 local-test manifest 及其切换操作；本地 gate 开启时，启动预检和 JSON-RPC dispatcher 会基于同一份启动时配置，按 pgx 最终连接结果把 DSN 固定到 `192.168.0.106:5432` 上的 `plush_erp` 或 `plush_erp_*_dev` 开发库，不会因运行中修改环境变量、query override、multi-host fallback 或 `ERP_ALLOW_TEST_DB_AS_DEV=1` 放行 133 / loopback tunnel。人工验收数据 runner 另行把 `local-dev` 精确绑定到当前版本的隔离验收库，不会写共享开发库；production 配置发现该环境开关时也会直接失败。

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
go run ./cmd/backfill-workflow-source-tasks --help
```

存量来源任务修复使用后端专用命令，并先由受控环境注入 `POSTGRES_DSN`，不要把连接串写入命令或报告：

```bash
# 默认在事务中执行与正式修复相同的检查和写入，然后回滚
go run ./cmd/backfill-workflow-source-tasks

# 核对 dry-run 的数据库名、扫描数和新增数后，才允许显式提交
go run ./cmd/backfill-workflow-source-tasks \
  --apply \
  --confirm-database=<精确数据库名>
```

该命令只扫描当前仍为 `RELEASED` 的生产订单和当前仍为 `POSTED REWORK` 的返工事实，补齐缺失的 task / `created` event / business state 包；确定性编号被占用、已有包不完整或来源不合法时整批失败。新建任务保持 `ready`，由真实责任岗位处理，不推断历史 `done / rejected`。它不扫描 `DRAFT` 出货单，也不猜测历史上是否点过提交；出货放行仍必须从出货页显式提交。命令可执行不表示任何共享库、目标环境或客户数据库已经 dry-run / apply。

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

`inventory_pg_test` 同时覆盖 `TestInventoryPostgres*` 与 `TestOperationalFactPostgres*`，包括 SKU grain、库存预留、出货来源数量、预留消费，以及生产 / 委外 / 财务 draft post-vs-cancel 的事实行锁与库存 / 审计串行边界。

`critical_transactions_pg_test` 复用同一隔离测试库，强制运行采购入库 / 退货 / 调整 draft post-vs-cancel、child-create-vs-parent-cancel、生产 / 委外 / 财务事实并发、Source Document 聚合保存、库存 / SKU / 预留 / 出货、ProcessRuntime 领域命令和 Workflow 终态并发测试；脚本会同时开启 purchase receipt 与 inventory 两组 PostgreSQL 测试标志。`full/strict` 会先创建并 apply 该测试库再执行此门禁，不把普通 `go test ./...` 中的 PostgreSQL skip 冒充事务验收。

验证证据必须分层报告：SQLite / usecase 测试证明状态、依赖、零库存与父单解除；真实 PostgreSQL 用例证明行锁和并发赢家；Web 组件与 Style L1 mock 只证明 canonical RPC、按钮状态、文案和写后重读可达；真实后端浏览器 + 数据库读回才证明岗位操作已持久写入当前数据库；目标 release、health / ready、smoke 和客户 UAT 仍是独立关口。任一 PostgreSQL 用例失败或被环境变量跳过，都不能用组件、mock 浏览器或普通 `go test ./...` 绿色覆盖。

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
- `make migrate_apply` 是开发库 Atlas apply 入口，会在 Atlas apply 前自动运行 `--audit populated-upgrade`，覆盖 `20260714055504` 及 WIP 委外关联切换；`--audit customer-config-cutover` 仍需在跨越 `20260714055825` 前显式执行
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
