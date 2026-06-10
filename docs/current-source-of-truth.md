# 当前真源与交接顺序 / Current Source Of Truth And Handoff Order

本文档只解决一件事：当前这份仓库到底应该先读哪里，才能避免把历史占位、现场猜测或过期文档误当成真源。

## 真源原则

- 运行时行为的最终真源始终是代码。
- 仓库级约定、部署边界和项目基线，以当前文档为索引，再分流到对应子目录文档。
- 历史 changes 文档不再作为阅读入口；当前状态必须回到本文档、正式能力账本（`docs/product/capability-ledger.md`）、当前代码和当前测试交叉确认。
- 产品从起步到成熟的阶段规划、重新做项目的 Phase 路线和产品化路线，以 `docs/product/product-completion-roadmap.md` 作为可演进规划真源；正式菜单入口、行业菜单候选、客户菜单配置和旧入口退出细节，以 `docs/product/formal-menu-entry-plan.md` 作为路线配套计划；产品能力成熟度以 `docs/product/capability-ledger.md` 作为长期台账，客户交付状态和客户差异分类按客户放在 `docs/customers/<customer-key>/delivery-matrix.md` 和 `docs/customers/<customer-key>/delta-ledger.md`；`docs/product/product-delivery-ledgers.md` 只作为三类台账索引保留。它们都不替代当前实现真源，也不直接授权 schema、migration、runtime、API 或 UI 改动。
- 模块进入实现前的施工治理、Phase 与 Architecture Layer 区分、门禁和实施任务拆分规则，以 `docs/product/implementation-governance.md` 作为阅读入口；它不替代 roadmap、当前实现真源、测试或本轮具体任务说明。
- 当前部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。
- 当前仓库没有 `lab-ha`、Kubernetes 和 dashboard 主路径；不要按不存在的目录做推断。

## 当前业务保存层真源

- 早期 Phase 1 / Phase 2 schema draft、cutline、go/no-go 和旧执行规划文档已从活跃文档树删除；它们只可从 Git 历史追溯。当前正式实现状态以现有代码、Ent schema、Atlas migration、测试、本文和 roadmap / 产品台账交叉确认为准。
- 003 schema-only 已按 V1 cutline 新增 `server/internal/data/model/schema/customer.go`、`supplier.go`、`contact.go`、`sales_order.go` 和 `sales_order_item.go`；004 已基于这 5 个 schema 生成 Ent 代码和 Atlas migration；005 已新增客户 / 供应商 / 联系人 MasterData repo/usecase 和测试；006 已新增 `sales_orders / sales_order_items` 后端 repo/usecase 和测试；007 已为这些 V1 对象接入后端 JSON-RPC API 和 RBAC 动作权限；008 已新增 V1 客户 / 供应商 / 联系人 / 销售订单 / 销售订单行前端页面；009 已新增 `business_records` 兼容层引用审计、过渡审计、cutover plan、data map draft 和 risk register。Sales order 仍是 Source Document / Business Commitment，不写 shipment、inventory、stock reservation、finance、invoice、payment 或 Workflow facts；产品内 docs registry 已下线；`partners / project-orders` 普通 `business` JSON-RPC 写操作已冻结，旧路径权限别名已删除，但 seedData、其他 `business_records` runtime transition、import/backfill、真实数据迁移或删除仍未实现。
- 首版业务落盘真源是后端 Ent schema 和 Atlas migration：`workflow_tasks`、`workflow_task_events`、`workflow_business_states`、`business_records`、`business_record_items`、`business_record_events`。
- Phase 2A 已新增最小库存事实闭环专表：`units`、`materials`、`products`、`warehouses`、`inventory_txns`、`inventory_balances`。Phase 2B 已新增最小 BOM + 批次库存闭环：`inventory_lots`、`bom_headers`、`bom_items`，并让 `inventory_txns / inventory_balances` 支持 nullable `lot_id`。Phase 2C 已新增采购入库最小闭环：`purchase_receipts`、`purchase_receipt_items`，让采购入库过账驱动 `inventory_lots / inventory_txns / inventory_balances`。Phase 2D-A 已新增采购退货最小闭环：`purchase_returns`、`purchase_return_items`，让已入库后的采购退货作为独立业务单据写 `inventory_txns.OUT` 并扣减 `inventory_balances`，取消退货通过 `REVERSAL` 回补库存。Phase 2D-B1 已新增采购入库调整单最小闭环：`purchase_receipt_adjustments`、`purchase_receipt_adjustment_items`，只支持已过账采购入库后的数量类差异和 `lot / warehouse` 维度更正，调整过账写 `inventory_txns.ADJUST_IN / ADJUST_OUT`，取消调整写 `REVERSAL`。Phase 2D-C1 已扩展 `inventory_lots.status` 最小状态集并在有 `lot_id` 的库存扣减路径增加批次状态守卫。Phase 2D-C2-A 已新增 `quality_inspections` 最小来料质检主表，作为采购入库后材料批次质检状态 / 判定真源，并在事务内联动 `inventory_lots.status`。其中 `inventory_txns` 是库存事实流水真源，`inventory_balances` 是当前余额 / 查询加速表，`inventory_lots` 是批次追溯和批次可用性状态真源，`quality_inspections` 是来料质检判定和批次状态变化来源真源；`business_records / business_record_items` 仍保留为通用单据快照和兼容层，不替代库存、采购入库、采购退货、采购入库调整、批次状态或来料质检真源。
- 桌面业务页当前走通用 `business_records` 表格 / 弹窗保存，明细行落到 `business_record_items`；行金额为空且已有数量 / 单价时由前端保存转换层派生，表头数量 / 金额为空时按明细合计回写，保存和状态流转都会按单据来源写入 `workflow_business_states`；列表列顺序属于管理员 ERP 偏好，后端真源字段是 `admin_users.erp_preferences.column_orders`，浏览器 localStorage 只作为同步失败或未登录资料加载完成前的兜底。表头排序只改变当前页面展示和导出行顺序，不改变 `business_records` 真源、状态流转或后端写入顺序。
- `business_records` 是当前首轮通用业务记录真源，不等于所有客户、BOM、采购、库存、生产和财务专表都已经拆完；后续细分专表继续按真实样本和 Ent + Atlas 迁移推进。
- 当前 Phase 2D-C2-A 已落材料、成品、仓库、库存流水、库存余额、库存批次、最小 BOM、采购入库最小闭环、采购退货最小闭环、采购入库调整单最小闭环、批次状态扣减守卫和来料质检最小主表；004 已为客户 / 供应商 / 联系人 / 销售订单 / 销售订单行生成 Ent 代码和 Atlas migration，005 已为客户 / 供应商 / 联系人新增后端 repo/usecase 和测试，006 已为销售订单 / 销售订单行新增后端 repo/usecase 和测试，007 已接入 `masterdata` 与 `sales_order` JSON-RPC API 并新增 `customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.*` 动作权限，008 已新增对应 V1 前端页面，Phase 5 已将 `客户档案`、`供应商档案` 和 `销售订单` 接入桌面正式菜单、dashboard 入口、前端菜单权限选项和后端内置菜单；旧 `/erp/master/partners` 与 `/erp/sales/project-orders` 不再渲染通用 `business_records` 业务页、兼容只读页或旧路径重定向，前端和后端菜单权限归一化都不再保留这两个旧入口的模块定义、产品内路由或权限别名；普通 `business` JSON-RPC 已拒绝 `partners / project-orders` 的 create / update / delete / restore。009 已完成 `business_records` 引用审计与退出方案设计。当前 `contacts` 通过 usecase 校验 `owner_type` 只能是 `CUSTOMER / SUPPLIER`、`owner_id` 必须存在，并在设置主联系人时事务内取消同一 owner 的其他主联系人。当前 `sales_orders` 生命周期只使用 `draft / submitted / active / closed / canceled`，`sales_order_items` 行状态只使用 `open / closed / canceled`；创建订单校验 active customer，创建 / 更新订单行校验 active product 和 active unit；销售订单仍只记录客户订单承诺和明细承诺，不写出货、库存、预留、应收、应付、发票或收付款事实。产品内 docs registry 已下线；仍未实现 `business_records` 旧数据迁移、删除、归档、完整采购订单、采购合同审批、金额差异、`quality_inspection_items`、缺陷字典、应付、发票、付款、生产、委外、品质完整模块、财务、`warehouse_locations`、`stock_reservations`、`available_quantity / hold_quantity / reserved_quantity`。库存、BOM、采购入库、采购退货和采购入库调整数量 / 金额使用 decimal/numeric，不使用 float；库存错误通过 `REVERSAL` 冲正，不直接修改历史流水，采购入库取消通过 REVERSAL 回退库存，采购退货过账写 `OUT`，采购入库调整过账写 `ADJUST_IN / ADJUST_OUT`，取消退货或调整再对原流水写 `REVERSAL`，批次冲正必须继承原流水 `lot_id` 且不受当前 `lot.status` 阻断。`inventory_lots.status` 当前业务状态为 `ACTIVE / HOLD / REJECTED / DISABLED`：普通出库、普通调整和采购入库调整扣减只允许 `ACTIVE` 批次；`PURCHASE_RETURN` 退供应商允许从 `ACTIVE / HOLD / REJECTED` 批次扣减但拒绝 `DISABLED`；`lot_id = NULL` 的非批次库存暂不受批次状态管控，仍按现有余额规则执行。`quality_inspections` 当前只支持采购入库后材料来料质检：`DRAFT` 不改批次；`SUBMITTED` 记录 `original_lot_status` 并把批次改为 `HOLD`；`PASSED` 把批次改为 `ACTIVE`，`result = PASS / CONCESSION`；`REJECTED` 把批次改为 `REJECTED`；`CANCELLED` 只允许取消 `DRAFT / SUBMITTED`，其中 `SUBMITTED` 取消仅在当前批次仍为 `HOLD` 时恢复 `original_lot_status`。质检状态变化不写 `inventory_txns`，不改 `inventory_balances`，不合格退供应商仍走 `purchase_returns`。如果采购退货行关联 `purchase_receipt_item_id`，同一原入库行的有效已退数量加本次退货数量不得超过 `effective_receipt_quantity`：原入库行 `quantity` + 已过账未取消的 `QUANTITY_INCREASE` - 已过账未取消的 `QUANTITY_DECREASE`；已 `CANCELLED` 退货或调整不占用 / 不影响该上限，lot / warehouse 更正不改变总有效入库数量，取消调整后也不得让有效入库数量低于累计有效退货数量。库存余额校验、原入库行可退数量校验、批次状态守卫和质检状态机是不同约束，必须同时满足。批次不做物理删除，被库存流水、余额或质检引用后由数据库 `ON DELETE NO ACTION` 外键保护；采购入库单 / 行、采购退货单 / 行、采购入库调整单 / 行和质检单也不做普通物理删除，`purchase_receipts / purchase_receipt_items / purchase_returns / purchase_return_items / purchase_receipt_adjustments / purchase_receipt_adjustment_items / quality_inspections` 由 Ent hook 禁止普通 `Delete / DeleteOne`，`POSTED / CANCELLED / PASSED / REJECTED` 后不得修改影响库存事实、质检判定和 `inventory_txns.source_type/source_id/source_line_id` 追溯链的关键字段。`purchase_returns.purchase_receipt_id`、`purchase_return_items.purchase_receipt_item_id`、`purchase_receipt_adjustments.purchase_receipt_id`、`purchase_receipt_adjustment_items.purchase_receipt_id`、`quality_inspections.purchase_receipt_id`、`quality_inspections.purchase_receipt_item_id` 和 `quality_inspections.inventory_lot_id` 使用数据库 `ON DELETE NO ACTION`，防止绕过 Ent 的直接 SQL 删除破坏采购退货 / 入库调整 / 质检与原采购入库或批次的追溯链。BOM 明细数量 / 损耗率有 DB check 约束，同一产品最多一个 `ACTIVE` BOM。
- 当前 workflow 编排已开始后端渐进迁入：第一条最小规则“老板审批任务 `done / blocked / rejected` 后派生下游任务”、第二条最小规则“IQC 来料检验任务 `done / blocked / rejected` 后派生仓库入库或来料异常处理任务”、第三条最小规则“采购 `warehouse_inbound done / blocked / rejected` 只推进协同业务状态”、第四条最小规则“委外回货检验 `outsource_return_qc done / blocked / rejected` 后派生委外入库或返工补做任务”、第五条最小规则“成品抽检 `finished_goods_qc done / blocked / rejected` 后派生成品入库或成品返工任务”、第六条最小规则“成品入库 `finished_goods_inbound done / blocked / rejected` 只推进协同业务状态”，以及第七条最小规则“出货放行 `shipment_release done / blocked / rejected` 只推进协同业务状态”已进入后端 `WorkflowUsecase`。
- 当前状态词典树和状态混用禁区集中维护在 `docs/architecture/status-workflow-fact-boundary.md` 的“当前状态词典树 / Current Status Dictionary Tree”章节；该章节区分协同层状态、业务对象生命周期状态、事实层对象状态、事实流水类型、派生结果状态、当前已实现状态和未来候选状态。本文只保留真源入口，不复制完整词典，避免两处漂移。
- 第三条规则识别口径为采购来源、`task_group=warehouse_inbound`、`owner_role_key=warehouse` 且 `business_status_key` 为空或 `warehouse_inbound_pending`，由后端在一次状态更新中写任务状态、`workflow_task_events` 和 `workflow_business_states`：`done -> inbound_done`，`blocked / rejected -> blocked` 并强制原因；不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不派生采购应付任务，也不派生 `purchase_quality_exception`。
- 第四条规则识别口径为 `source_type in (processing-contracts, inbound) + task_group=outsource_return_qc + owner_role_key=quality + payload.qc_type=outsource_return 或 payload.outsource_processing=true`，并且只允许业务状态为空、`qc_pending` 或 `qc_failed` 进入；`qc_failed` 保持可进入是为了让重复失败走幂等保护，并支持上一轮返工完成后的下一轮返工 / 补做。第五条规则识别口径为 `source_type=production-progress + task_group=finished_goods_qc + owner_role_key=quality + payload.finished_goods=true`，并且只允许业务状态为空、`qc_pending` 或 `qc_failed` 进入；`done -> finished_goods_inbound`，`blocked/rejected -> finished_goods_rework`，`qc_failed` 保持可进入用于重复失败幂等和上一轮返工完成后的下一轮返工。
- 第六条规则识别口径为 `source_type=production-progress + task_group=finished_goods_inbound + owner_role_key=warehouse + payload.finished_goods=true`，并且只允许业务状态为空、`warehouse_inbound_pending` 或 `blocked` 进入；`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因，`blocked` 保持可进入用于重复失败幂等保护，`inbound_done / shipment_pending / shipment_release_pending / shipped` 等 settled 状态不再触发。
- 第七条规则识别口径为 `task_group=shipment_release`、`owner_role_key=warehouse`、`source_type in (shipping-release, production-progress, inbound)`，且 payload 存在 `shipment_release=true` 或 `finished_goods=true`；只允许业务状态为空、`shipment_release_pending`、`shipment_pending` 或 `blocked` 进入，`shipping_released / shipped / receivable_pending / invoice_pending` 等 settled 或后续状态不再触发。`shipment_release done -> shipping_released`，`blocked / rejected -> blocked` 并强制原因；`done` payload 标记 `shipment_release_task_id`、`shipment_release_result=done`、`shipment_release_deferred_inventory=true`、`shipment_execution_required=true`、`inventory_out_deferred=true`、`receivable_deferred=true`、`invoice_deferred=true`、`critical_path=true`、`decision=done` 和 `transition_status=done`，不等于 `shipped`。
- 第四条和第五条都由后端在一次状态更新中写任务状态、`workflow_task_events`、`workflow_business_states`，并幂等派生下游任务；第三条、第六条和第七条只 upsert 协同业务状态。第三条、第六条和第七条均不写库存流水，不更新库存余额，不创建批次；第七条不做库存预留 / 冻结或扣减，不创建 DerivedTask，不派生出货执行、`receivable_registration`、`invoice_registration` 或任何财务任务。出货执行、应收、应付和对账等其余主干闭环仍待按专门 usecase 评审；`finished_goods_inbound` 和 `shipment_release` 真实运行时不再保留旧前端 follow-up 双写。
- 当前老板审批、IQC、委外回货检验和成品抽检派生任务的幂等边界是应用层事务内查询后创建：按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 查找已有下游任务；委外回货检验中 `blocked` 后又 `rejected` 且旧 `outsource_rework` 仍未完成时复用同一个 active 返工任务，上一轮 `outsource_rework` 已 `done` 后允许再次创建；成品抽检中 `blocked` 后又 `rejected` 且旧 `finished_goods_rework` 仍未完成时复用同一个 active 返工任务并刷新 payload，上一轮 `finished_goods_rework` 已 `done` 后允许再次创建。采购 `warehouse_inbound`、成品 `finished_goods_inbound` 和 `shipment_release` 不创建下游任务，只走业务状态 upsert；第六条和第七条 blocked/rejected 允许 `blocked` 业务状态再次进入，用于重复失败幂等保护。当前暂未新增 DB unique constraint，也未改 Ent schema / migration；极端并发下后续仍需 DB unique constraint 或 advisory lock 加固。
- 当前后台权限模型已经切换为标准 RBAC。权限数据真源是 `admin_users.is_super_admin`、`roles`、`permissions`、`role_permissions`、`admin_user_roles`；权限码定义和内置角色矩阵真源是 `/Users/simon/projects/plush-toy-erp/server/internal/biz/rbac.go`。`admin_users.level`、`admin_users.menu_permissions`、`admin_users.mobile_role_permissions` 不再作为权限来源，RBAC 迁移已清理这些旧字段。普通管理员只从未禁用角色的 `role_permissions -> permissions` 获得权限；当前 `permissions` 表不提供独立 disabled 开关，停用某个权限应从角色移除，或从 `rbac.go` 真源移除后由后端归一化丢弃。
- 登录和 `auth.me` 返回当前管理员、角色、权限码和后端推导出的菜单。桌面菜单、岗位任务端入口、后端 JSON-RPC 接口统一消费 permission code；岗位任务端角色入口只认 `mobile.<role>.access` 权限码，`roles` 只用于身份展示、任务归属匹配和审计语义。统一登录页当前按 `web/src/erp/config/entryConfig.mjs` 和可选 `window.__PLUSH_ERP_ENTRY_CONFIG__` 控制“后台管理 / 岗位任务端”显隐；设备只决定默认选项，手机默认岗位任务端、电脑默认后台、平板优先使用上次选择或保留选择。用户不在登录前手选岗位角色，岗位任务端按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位；后续若出现一个账号多岗位高频切换，再单独设计账号内角色切换。短信登录是否可用由后端 `data.auth.sms.mode` 和公开 `auth.capabilities` 决定，dev 默认 `mock`，prod 默认 `disabled`；生产环境不返回 `mock_code`，真实服务商 `provider` 模式尚未接入。前端隐藏入口只是体验，不是安全边界。未登录仍返回 AuthRequired，非管理员仍返回 AdminRequired，disabled 管理员优先拒绝，`is_super_admin=true` 拥有全部权限但仍不应绕过业务事实校验。
- workflow / business / debug JSON-RPC 已进入动作级权限守卫：workflow 任务读写、创建、指派、审批、驳回、完成分别使用 `workflow.task.*`；`update_task_status` 中老板审批 `done` 要求 `workflow.task.approve`，其他 `done` 要求 `workflow.task.complete`，`rejected` 要求 `workflow.task.reject`，普通状态更新要求 `workflow.task.update`；业务记录读写删使用 `business.record.*`；调试 seed、cleanup、业务清空和业务链路运行分别使用 `debug.*`。采购入库、采购退货、采购入库调整、批次状态变更和来料质检当前仍是后端 usecase/repo 与测试覆盖，尚未接入外部 JSON-RPC/API；后续接入时必须分别加 `purchase.receipt.*`、`purchase.return.*`、`purchase.receipt.adjustment.*`、`quality.inspection.*` 和 `inventory.lot.status.*` 权限守卫，其中质检 submit / pass / reject / cancel 应拆成独立动作权限。业务任务处理不能只靠 RBAC，更新、完成、审批、驳回仍必须同时校验任务 `owner_role_key`、`assignee_id` 和 `task_status_key`；`workflow.task.update / complete / approve / reject` 不代表可以修改所有角色任务，boss / pmc 的关注和催办也不等于替其他角色完成业务事实。
- 当前预设角色是 `boss`、`sales`、`purchase`、`warehouse`、`quality`、`finance`、`pmc`、`production`、`admin`、`debug_operator`。跟单角色如果甲方没有，不新增独立角色；业务跟进由 `sales` 或 `pmc` 承担。`debug_operator` 只用于 local / dev / test 的高危调试能力，生产默认不分配。
- 业务链路调试 seed / cleanup / 业务数据清空已作为开发验收能力接入后端 JSON-RPC `debug` 域；seed 和 debugRunId cleanup 只复用 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events`、`workflow_business_states`。业务数据清空是本项目当前 SQL 连接的破坏性开发重置入口，清理本项目业务链路、采购入库、采购退货、采购入库调整、库存、BOM、物料、成品、仓库和单位相关业务表，不清账号、角色、权限、管理员偏好、配置和数据库结构。相关写操作默认面向当前 SQL 连接开启，可通过 `ERP_DEBUG_*` 环境变量显式关闭，并通过管理员身份和 `debug.seed`、`debug.cleanup`、`debug.business.clear`、`debug.business_chain.run` 等权限码限制范围；按 debugRunId 清理还会校验 payload debug 标记，不是普通业务入口。
- workflow usecase 统一编排评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/workflow-usecase-review.md`。当前结论是老板审批、IQC、采购仓库入库、委外回货检验、成品抽检、成品入库和出货放行七条最小规则已落地；仓库入库专项文档为 `/Users/simon/projects/plush-toy-erp/docs/architecture/warehouse-inbound-workflow-review.md`，成品入库专项文档为 `/Users/simon/projects/plush-toy-erp/docs/architecture/finished-goods-inbound-workflow-review.md`，`shipment_release` 专项评审文档为 `/Users/simon/projects/plush-toy-erp/docs/architecture/shipment-release-workflow-review.md`。第三条规则只迁协同状态推进：`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因；第四条规则只迁委外回货检验后的任务 / 状态派生：`done -> outsource_warehouse_inbound`，`blocked/rejected -> outsource_rework` 并强制原因；第五条规则只迁成品抽检后的任务 / 状态派生：`done -> finished_goods_inbound`，`blocked/rejected -> finished_goods_rework` 并强制原因；第六条规则只迁成品入库协同状态推进：`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因；第七条规则只迁出货放行协同状态推进：`done -> shipping_released`，`blocked/rejected -> blocked` 并强制原因。`shipment_release done` 不等于 `shipped`，真实 shipped 必须由未来 `ShipmentUsecase / shipment_execution / outbound done` 确认。库存专表、库存流水、库存余额、批次、出货扣减、应收、开票、应付和对账派生仍必须按 Phase 8 统一 review 和实现门禁推进，不要把七条最小 usecase 误读成完整 workflow engine。
- 行业专表 schema 早期评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/industry-schema-review.md`。该文档用于说明不要一次性拆完整 ERP 的判断。
- 材料、成品、BOM 与库存专表长期边界评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/material-product-inventory-schema-review.md`。Phase 2A 只从该草案中落最小库存事实闭环；后续 BOM / SKU 与采购承诺边界继续以 `docs/architecture/product-sku-bom-boundary-review.md` 和 `docs/architecture/order-purchase-boundary-review.md` 复核。
- Phase 2B 到 Phase 2D-C2-A 的旧阶段实现评审已移出活跃 `docs/architecture/`，归档到 `docs/archive/architecture-history/`。当前结论以内嵌在本文的真源摘要、当前 Ent schema / Atlas migration、repo/usecase 测试和活跃长期边界评审文档为准；归档文件只用于追溯历史设计过程。

## 前端文档与开发验收入口

- 前端已移除产品内文档中心、帮助中心、高级文档和开发与验收页面入口；`web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs`、`DocumentationPage`、`HelpCenterPage`、`AcceptanceOverviewPage`、业务链路调试页和协同任务调试页不再作为运行时入口维护。
- 桌面侧栏当前只保留看板中心、业务分组、单据模板和系统管理；不展示 `Phase 8`、`事实闭环` 这类内部开发阶段或工程验收入口。旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness`、`/erp/mobile-workbenches` 和 `/erp/roles/*` 路径仅兼容重定向到桌面看板。核心前端品牌默认使用中性产品名，不包含客户公司名；客户前端展示配置可通过 `VITE_ERP_CUSTOMER_KEY`、`window.__PLUSH_ERP_CUSTOMER_KEY__` 或 `window.__PLUSH_ERP_CUSTOMER_CONFIG__` 选择客户品牌和菜单。当前已登记 `config/customers/yoyoosun/menuConfig.mjs`，可覆盖 yoyoosun 品牌和桌面菜单；该配置只控制前端品牌展示、菜单分组、排序、显隐和文案，不替代后端 RBAC action permission、Workflow / Fact usecase、schema、migration、真实导入或 SaaS tenant。
- 桌面构建当前提供 `/m/<role>/tasks` 单端口岗位任务端路径；生产 Compose 只启动 `web-desktop` 一个前端容器并监听 `5175`，不再启动 8 个 `APP_ID=mobile-*` 多实例生产容器。按角色拆端口仍可作为本地开发调试入口，不再作为生产部署主路径。`/entry` 只作为登录后“后台管理 / 岗位任务端”入口选择页，不提供登录前岗位角色选择；入口显隐由前端入口配置和登录账号权限共同决定。
- 统一登录页、桌面后台和岗位任务端当前支持「跟系统 / 浅色 / 暗色」三种主题模式，默认跟随系统偏好，手动选择持久化到浏览器 `localStorage` 的 `plush_erp_theme_mode`。主题只影响视觉，不影响入口选择、RBAC、岗位角色推导或最终路由；打印、PDF、采购合同 / 加工合同纸面预览默认固定浅色，不跟随运行时暗色主题。
- 系统分层、产品化与交付、客户差异、状态 / Workflow / Fact 边界继续以仓库正式 `docs/product/*`、`docs/architecture/*`、`docs/customers/*` 和当前代码 / 测试为准，不再镜像成前端 Markdown 页面。
- 后台工作台与看板原型已部分承接到运行时：`/erp/dashboard` 作为 Workflow 任务看板 / 工作台入口，`/erp/business-dashboard` 作为业务摘要看板，`/erp/print-center` 作为模板打印中心。`/erp/dashboard` 的任务筛选状态使用 URL query 作为可分享 / 可刷新恢复 / 可一键清空的页面状态，不写后端用户偏好或业务事实。`docs/product/prototypes/admin-command-center-v1/` 仍只是参考原型，不替代当前代码、测试、schema、API 或正式边界文档；这些运行时页面也不把 Workflow 任务完成等同于库存、出货、财务、发票或收付款事实过账。
- 开发环境可访问独立隐藏路径 `/__dev/docs` 查看仓库 tracked Markdown；该入口左侧专用于按真实目录树浏览 `docs/**/*.md` 及主要 README，搜索态显示匹配结果，右侧章节标签可滚动到对应标题并提供回到顶部，只服务本地开发查阅，不进入 ERP 菜单、seedData、RBAC、产品内 docs registry 或生产构建。
- 开发环境可访问独立隐藏路径 `/__dev/prototypes` 查看产品原型资产；该入口只浏览 `docs/product/prototypes` 下的 HTML 原型、PNG 方案图和截图证据，可按资产状态筛选并在右侧预览，只服务本地开发和产品评审查阅，不进入 ERP 菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建。
- 开发环境可访问独立隐藏路径 `/__dev/capability-ledger` 查看能力台账只读可视化；该入口只读解析 `docs/product/capability-ledger.md`、`docs/customers/yoyoosun/delivery-matrix.md` 和 `docs/customers/yoyoosun/delta-ledger.md`，展示产品能力成熟度、客户交付状态、客户差异分类和显式 `CAP-*` 关联，只服务本地治理查阅，不进入 ERP 菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建；三份 Markdown 仍是唯一维护入口，可视化不替代当前实现真源、schema、migration、API、UI 或测试。
- 开发环境可访问独立隐藏路径 `/__dev/customer-config` 查看客户配置总控；该入口只读汇总 yoyoosun 客户配置包、前端品牌 / 桌面菜单 runtime、字段 / 编号草案、导入 tooling 和边界状态，只服务本地治理查阅，不进入 ERP 菜单、seedData、RBAC、后端业务、真实导入或生产构建；`config/customers/yoyoosun/*`、`scripts/import/*` 和正式文档仍是维护真源。
- 开发环境可访问独立隐藏路径 `/__dev/testing` 查看测试入口；该入口只读解析 `docs/product/test-strategy.md` 和 `docs/**/*.md` 中的测试、验收、QA、smoke、`style:l1` 等相关文档，展示测试分层、命令块和相关文档索引，只服务本地治理查阅，不进入 ERP 菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建；`docs/product/test-strategy.md` 仍是测试选择真源，可视化不替代实际命令执行结果、业务事实、权限边界、部署状态或客户交付结论。
- Phase 0 已新增 0 到 1 产品架构、客户实例、客户差异和状态 / Workflow / Fact 边界文档：`docs/product/*`、`docs/architecture/status-workflow-fact-boundary.md`、`docs/customers/yoyoosun/*`。
- `docs/product/capability-ledger.md` 是全局产品能力进度台账，用于判断能力成熟度、证据和下一步；`docs/customers/yoyoosun/delivery-matrix.md` 和 `docs/customers/yoyoosun/delta-ledger.md` 是永绅 yoyoosun 客户交付矩阵和客户差异台账；`docs/product/product-delivery-ledgers.md` 只保留三类台账索引。它们不是 runtime、schema、migration、API、UI 或测试真源。
- `docs/product/implementation-governance.md` 是模块实施治理入口，用于拆新实现任务前确认 Phase、Architecture Layer、门禁、范围和禁止项；它不是 runtime、schema、migration、API、UI 或测试真源。
- `docs/reference/imported-notes/*` 只保存 imported design notes，状态是 Reference Only，不是 runtime、schema 或当前实现真源。
- 永绅客户的稳定客户 key 是 `yoyoosun`；本仓库按稳定客户 key 管理客户资料，不保留活跃客户目录或导入工作区别名。当前不新增 `tenant_id`，也不把客户 key 当 SaaS runtime tenant。
- 永绅客户资料已建立 `docs/customers/yoyoosun` 文档边界和 `config/customers/yoyoosun` 配置包；其中 `menuConfig.mjs` 已作为前端品牌 / 桌面菜单展示配置接入，`fieldNumberingConfig.mjs` 已新增为字段显示和编号规则 Customer Config 评审草案且 `runtimeEnabled=false`，`field-numbering-confirmation-checklist.md` 已新增为客户确认清单，`field-numbering-confirmation-result-template.md` 已新增为客户确认结果回写模板，`trial-training-note.md` 已新增为试用培训说明草案，`trial-account-role-menu-checklist.md` 已新增为试用账号、角色、菜单和岗位任务端核对清单，`trial-environment-runbook.md` 已新增为目标试用环境账号 / RBAC / 菜单 / 岗位任务端执行手册，`phase7-simulated-trial-acceptance.md` 已新增为 Phase 7 本地模拟数据试用验收记录，原始资料和导入线索仍不接产品内 docs registry。该配置包不是 SaaS runtime tenant，不新增 `tenant_id`，不改变 Ent schema、后端权限真源、Workflow / Fact 规则、真实导入或 `business_records` cutover。本地原始 Excel / PDF / PNG / JPG / JPEG 已归档到 `docs/customers/yoyoosun/raw-source-files/`，并由 `docs/customers/yoyoosun/raw-source-file-archive-review.md` 记录 checksum、用途分类和边界。原件只用于功能、字段、模板、导入和验收溯源，不代表 Product Core、真实导入批准、schema、migration、API、UI、seedData 或 `business_records` cutover。后续若继续新增客户或新增大批原始二进制文件，应按 `docs/customers/<customer-key>/` 隔离，并单独评审敏感信息、文件大小、引用关系、产品内文档入口、测试断言、Git 历史体积和回滚风险。
- yoyoosun customer import dry-run draft 已新增：`docs/customers/yoyoosun/import-source-inventory.md`、`docs/customers/yoyoosun/import-field-classification.md`、`docs/customers/yoyoosun/import-dry-run-plan.md`、`docs/customers/yoyoosun/import-unresolved-queue.md`、`docs/customers/yoyoosun/import-acceptance-checklist.md`、`docs/customers/yoyoosun/import-strategy.md` 和 `docs/customers/yoyoosun/import-risk-register.md`。这些文档记录导入来源清单、字段分类、dry-run 流程、unresolved queue、验收清单、导入策略和风险登记；当前已补 import execution loader 口径，但未改变 runtime UI、seedData、migration、schema、backfill 或真实客户数据迁移结论。
- yoyoosun import dry-run tooling 已新增：`scripts/import/customerImportDryRun.mjs`、`scripts/import/customerImportDryRun.test.mjs` 和 `scripts/import/fixtures/customers/yoyoosun/*`。该 CLI 只读取 source snapshot JSON 与 existing V1 / formal model snapshot JSON，输出 dry-run package 和 Markdown 报告；它不连接数据库、不写正式表、不写 `business_records`、不改 schema / migration / API / UI / seedData，也不执行真实 import / backfill。`validation-summary.json` 中 `canExecuteRealImport` 永远为 `false`。
- yoyoosun source snapshot freeze + real dry-run evidence preparation 已新增：`scripts/import/customerSourceSnapshotFreezeCheck.mjs`、`scripts/import/customerSourceSnapshotFreezeCheck.test.mjs`、sanitized freeze fixtures、`docs/customers/yoyoosun/source-snapshot-freeze.md`、`docs/customers/yoyoosun/real-dry-run-evidence.md` 和 `docs/customers/yoyoosun/source-snapshot-manual-review-checklist.md`。相关工具可生成 `output/customers/yoyoosun/source-snapshot-freeze/` 与 `output/customers/yoyoosun/real-dry-run-evidence/`，但 output 只是本地 evidence，不纳入 git，不是真实导入批准。该 evidence preparation 不读 DB、不写 DB、不做 loader、不改 schema / migration / API / UI / seedData、不写 `business_records`、不做 `business_records` runtime cutover，也不生成后续执行队列；`freeze-metadata.json` 和 dry-run `validation-summary.json` 中 `canExecuteRealImport` 都必须为 `false`。
- yoyoosun import execution loader 已新增：`scripts/import/customerImportExecute.mjs`、`scripts/import/customerImportExecute.test.mjs` 和 sample approval fixture。该 loader 默认只校验 dry-run package、approval、backup evidence、unresolved block、forbidden auto-import 和 supported target，并生成 `import-execution-report.json/md`；显式 `--execute` 路径虽有工具门禁，但当前 yoyoosun 没有可执行客户真实数据，Phase 7 中不得执行真实导入。该 loader 不直接写数据库、不写 `business_records`、不生成 schema / migration、不创建 `tenant_id`，也拒绝 product_skus、purchase_orders、shipments、stock reservations、inventory facts 和 finance facts。
- 当前没有可直接执行的 yoyoosun 客户真实数据。Phase 7 不拆 A/B/C/D 或任何字母子阶段，只能一次性按模拟数据演练完成：`scripts/seed-phase7-sim-masterdata.sh` 可准备带 `SIM-YOYOOSUN-PHASE7` 前缀的模拟产品 / 单位主数据；`scripts/qa/phase7-simulated-trial-data.mjs` 已作为 Phase 7 模拟试用数据入口，可生成报告，或在显式确认后通过 V1 JSON-RPC 创建 / 复用模拟客户、供应商、联系人和销售订单数据，用于验证试用环境、账号、RBAC、菜单、V1 页面、岗位任务端入口和培训口径；这不等于真实 import，不代表客户字段已确认，不生成出货、库存、财务、发票或付款事实。2026-06-08 已完成一次本地 dev DB 模拟数据试用闭环，验收记录为 `docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`；该记录代表 Phase 7 按本地模拟试用通过关闭，目标客户环境正式验收转为交付后续项。真实客户数据导入在当前 Phase 7 中不可执行，也不作为后续半阶段或完成条件。
- Phase 8 已按“不拆任何字母子阶段”的口径完成本地统一实现闭环和目标环境内部模拟事实写入闭环。当前已新增 `production_facts`、`outsourcing_facts`、`shipments`、`shipment_items`、`stock_reservations`、`finance_facts` Ent schema 和 Atlas migration；新增 `Phase8Usecase`、`phase8` JSON-RPC、复用既有 RBAC 权限码，并保留 `/erp/phase8/facts` 作为内部直达验证页面，不进入客户侧栏、前端默认菜单或后端内置菜单。库存影响只由后端 fact usecase 写 `inventory_txns`：生产领料 / 返工写出库、成品入库写入库、委外发料写出库、委外回料写入库、出货发货写出库并支持取消冲正；库存预留只检查并占用可用量，不写库存流水；财务事实只维护 AR/AP/invoice/payment/reconciliation 状态，不从 workflow task 或出货放行自动生成。2026-06-08 已按 `docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md` 发布到当前目标环境，migration 已到 `20260608134530` 且 pending 0，健康检查、前端 Phase 8 路由、未登录鉴权 smoke、目标环境试用账号 RBAC 核对、登录态 Phase 8 只读 API smoke 和 `scripts/qa/phase8-simulated-fact-closure.mjs` 受控模拟事实写入闭环通过；目标环境服务端已更新到 `plush-toy-erp-server:20260608T2345-phase8-closure-amd64`。客户使用确认属于交付后的业务确认，不作为 Phase 8 完成阻塞；当前仍不代表真实客户数据导入、完整打印、完整报表、发票和收付款核销已交付。本次首次目标发布前没有明确 pre-migration 备份 evidence，已补 post-deploy 逻辑备份；后续发布必须先记录 pre-migration 备份 evidence。
- Phase 9 已按“不拆任何字母子阶段”的口径完成岗位任务端与岗位协同的本地实现、目标环境发布和内部模拟 workflow 闭环。当前岗位任务端详情页支持现场留痕、最近动作、保存 evidence 和异常报告展示；完成 / 催办动作会把模拟现场留痕随 workflow task update payload 提交；`/m/<role>/guide` 兼容入口已修正为绝对跳转到 `/m/<role>/tasks`，避免旧 wildcard 形成 `tasks/tasks` 循环；`scripts/qa/phase9-simulated-mobile-closure.mjs` 只创建和更新带 `SIM-YOYOOSUN-PHASE9` 前缀的模拟 workflow 任务。2026-06-09 已按 `docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md` 发布 Phase 9 Web 镜像到当前目标环境，健康检查、仓库岗位任务端目标路由 smoke、目标试用账号 RBAC 核对和内部模拟 workflow 闭环通过；server 镜像、schema、migration 和 Phase 8 fact usecase 未变。Phase 9 关闭不代表客户已签收、真实客户数据导入已批准、拍照上传 / 附件服务已交付、扫码已交付，也不代表出货、库存、预留或财务事实会从岗位任务端自动过账。
- Phase 10 已按“不拆任何字母子阶段”的口径完成行业模板沉淀闭环。当前已新增 `config/industry-templates/plush/templateConfig.mjs`，把默认角色、桌面菜单、岗位任务模式、字段显示、编号规则、导入模板、培训验收清单和 deferred 项统一沉淀为 `candidate` 配置；新增 `scripts/qa/industry-template-boundaries.mjs` 和 `scripts/qa/phase10-industry-template-closure.mjs`，并接入 fast / full / strict QA。Phase 10 只把 yoyoosun 作为候选输入来源，不把单客户名称、logo、合同条款、打印样式或特殊报表写成行业默认；不新增 runtime loader、不改 schema / migration、不改后端 RBAC 权限真源、不执行真实导入、不写 `business_records`，也不写库存、出货、预留、财务或其他事实表。
- Phase 11 已按“不拆任何字母子阶段”的口径完成多客户私有化复制模板和模拟闭环。当前已新增 `config/private-deployment-template/templateConfig.mjs`，把新增客户所需的 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/`、`deployments/<customer-key>/`、导入 dry-run / unresolved queue、差异台账、部署 runbook、备份恢复和验收清单收口为私有化客户包模板候选；新增 `scripts/qa/private-deployment-boundaries.mjs` 和 `scripts/qa/phase11-private-deployment-closure.mjs`，并接入 fast / full / strict QA。`SIM-PRIVATE-PHASE11` 只用于本地 evidence，不创建正式客户目录；Phase 11 不新增 runtime loader、不新增 `tenant_id`、不实现 SaaS / license / billing、不改 schema / migration / RBAC / Workflow / Fact、不执行真实导入、不按客户 fork 代码、不在目标服务器构建。
- Phase 12 已新增 SaaS docs-only 评审入口：`docs/product/phase12-saas-review.md`。当前结论是不进入 SaaS 实现，继续优先验证 Phase 11 私有化客户包；不新增 `tenant_id`，不改 schema / migration / RBAC / Workflow / Fact，不新增 runtime tenant、license server、billing、套餐权限、客户工单系统或 SaaS 运营后台，也不把 customer key、客户配置包、行业模板候选或私有化部署模板接成多租户 runtime loader。

## 按任务分流

### 1. 日常开发或代码修改

先读：

- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/AGENTS.md`
- `/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- `/Users/simon/projects/plush-toy-erp/docs/product/product-completion-roadmap.md`
- `/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`
- `/Users/simon/projects/plush-toy-erp/docs/product/capability-ledger.md`
- `/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/delivery-matrix.md`
- `/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/delta-ledger.md`
- `/Users/simon/projects/plush-toy-erp/docs/product/implementation-governance.md`
- `/Users/simon/projects/plush-toy-erp/server/README.md`
- `/Users/simon/projects/plush-toy-erp/scripts/README.md`

如果任务落在 ERP 页面、业务流程、打印工作台或移动端，再补读：

- `/Users/simon/projects/plush-toy-erp/web/README.md`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/business_record.go`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/workflow_task.go`

如果任务涉及模板打印口径，再继续补读：

- `/Users/simon/projects/plush-toy-erp/docs/erp-print-template-field-behavior.md`
- `/Users/simon/projects/plush-toy-erp/docs/erp-print-template-implementation.md`

### 2. 部署、运行或配置问题

先读：

- `/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/README.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/README.md`

### 3. 收口、改名或默认配置清理

先读：

- `/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
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
