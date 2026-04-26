# 当前真源与交接顺序

本文档只解决一件事：当前这份仓库到底应该先读哪里，才能避免把历史占位、现场猜测或过期文档误当成真源。

## 真源原则

- 运行时行为的最终真源始终是代码。
- 仓库级约定、部署边界和项目基线，以当前文档为索引，再分流到对应子目录文档。
- 当前部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`。
- 当前仓库没有 `lab-ha`、Kubernetes 和 dashboard 主路径；不要按不存在的目录做推断。

## 当前业务保存层真源

- 首版业务落盘真源是后端 Ent schema 和 Atlas migration：`workflow_tasks`、`workflow_task_events`、`workflow_business_states`、`business_records`、`business_record_items`、`business_record_events`。
- Phase 2A 已新增最小库存事实闭环专表：`units`、`materials`、`products`、`warehouses`、`inventory_txns`、`inventory_balances`。Phase 2B 已新增最小 BOM + 批次库存闭环：`inventory_lots`、`bom_headers`、`bom_items`，并让 `inventory_txns / inventory_balances` 支持 nullable `lot_id`。Phase 2C 已新增采购入库最小闭环：`purchase_receipts`、`purchase_receipt_items`，让采购入库过账驱动 `inventory_lots / inventory_txns / inventory_balances`。Phase 2D-A 已新增采购退货最小闭环：`purchase_returns`、`purchase_return_items`，让已入库后的采购退货作为独立业务单据写 `inventory_txns.OUT` 并扣减 `inventory_balances`，取消退货通过 `REVERSAL` 回补库存。Phase 2D-B1 已新增采购入库调整单最小闭环：`purchase_receipt_adjustments`、`purchase_receipt_adjustment_items`，只支持已过账采购入库后的数量类差异和 `lot / warehouse` 维度更正，调整过账写 `inventory_txns.ADJUST_IN / ADJUST_OUT`，取消调整写 `REVERSAL`。其中 `inventory_txns` 是库存事实流水真源，`inventory_balances` 是当前余额 / 查询加速表，`inventory_lots` 是批次追溯真源；`business_records / business_record_items` 仍保留为通用单据快照和兼容层，不替代库存、采购入库、采购退货或采购入库调整专表。
- 桌面业务页当前走通用 `business_records` 表格 / 弹窗保存，明细行落到 `business_record_items`；行金额为空且已有数量 / 单价时由前端保存转换层派生，表头数量 / 金额为空时按明细合计回写，保存和状态流转都会按单据来源写入 `workflow_business_states`；列表列顺序属于管理员 ERP 偏好，后端真源字段是 `admin_users.erp_preferences.column_orders`，浏览器 localStorage 只作为同步失败或未登录资料加载完成前的兜底。
- `business_records` 是当前首轮通用业务记录真源，不等于所有客户、BOM、采购、库存、生产和财务专表都已经拆完；后续细分专表继续按真实样本和 Ent + Atlas 迁移推进。
- 当前 Phase 2D-B1 已落材料、成品、仓库、库存流水、库存余额、库存批次、最小 BOM、采购入库最小闭环、采购退货最小闭环和采购入库调整单最小闭环；仍未落完整采购订单、采购合同审批、供应商主数据、金额差异、来料质检、应付、发票、付款、生产、委外、品质、财务、`warehouse_locations`、`stock_reservations`。库存、BOM、采购入库、采购退货和采购入库调整数量 / 金额使用 decimal/numeric，不使用 float；库存错误通过 `REVERSAL` 冲正，不直接修改历史流水，采购入库取消通过 REVERSAL 回退库存，采购退货过账写 `OUT`，采购入库调整过账写 `ADJUST_IN / ADJUST_OUT`，取消退货或调整再对原流水写 `REVERSAL`，批次冲正必须继承原流水 `lot_id`。如果采购退货行关联 `purchase_receipt_item_id`，同一原入库行的有效已退数量加本次退货数量不得超过 `effective_receipt_quantity`：原入库行 `quantity` + 已过账未取消的 `QUANTITY_INCREASE` - 已过账未取消的 `QUANTITY_DECREASE`；已 `CANCELLED` 退货或调整不占用 / 不影响该上限，lot / warehouse 更正不改变总有效入库数量，取消调整后也不得让有效入库数量低于累计有效退货数量。库存余额校验和原入库行可退数量校验是两个不同约束，必须同时满足。批次不做物理删除，被库存流水或余额引用后由数据库 `ON DELETE NO ACTION` 外键保护；采购入库单 / 行、采购退货单 / 行和采购入库调整单 / 行也不做普通物理删除，`purchase_receipts / purchase_receipt_items / purchase_returns / purchase_return_items / purchase_receipt_adjustments / purchase_receipt_adjustment_items` 由 Ent hook 禁止普通 `Delete / DeleteOne`，`POSTED / CANCELLED` 后不得修改影响库存事实和 `inventory_txns.source_type/source_id/source_line_id` 追溯链的关键字段。`purchase_returns.purchase_receipt_id`、`purchase_return_items.purchase_receipt_item_id`、`purchase_receipt_adjustments.purchase_receipt_id` 和 `purchase_receipt_adjustment_items.purchase_receipt_item_id` 使用数据库 `ON DELETE NO ACTION`，防止绕过 Ent 的直接 SQL 删除破坏采购退货 / 入库调整与原采购入库的追溯链。BOM 明细数量 / 损耗率有 DB check 约束，同一产品最多一个 `ACTIVE` BOM。
- 当前 workflow 编排已开始后端渐进迁入：第一条最小规则“老板审批任务 `done / blocked / rejected` 后派生下游任务”、第二条最小规则“IQC 来料检验任务 `done / blocked / rejected` 后派生仓库入库或来料异常处理任务”、第三条最小规则“采购 `warehouse_inbound done / blocked / rejected` 只推进协同业务状态”、第四条最小规则“委外回货检验 `outsource_return_qc done / blocked / rejected` 后派生委外入库或返工补做任务”、第五条最小规则“成品抽检 `finished_goods_qc done / blocked / rejected` 后派生成品入库或成品返工任务”，以及第六条最小规则“成品入库 `finished_goods_inbound done / blocked / rejected` 只推进协同业务状态”已进入后端 `WorkflowUsecase`。第三条规则识别口径为采购来源、`task_group=warehouse_inbound`、`owner_role_key=warehouse` 且 `business_status_key` 为空或 `warehouse_inbound_pending`，由后端在一次状态更新中写任务状态、`workflow_task_events` 和 `workflow_business_states`：`done -> inbound_done`，`blocked / rejected -> blocked` 并强制原因；不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不派生采购应付任务，也不派生 `purchase_quality_exception`。第四条规则识别口径为 `source_type in (processing-contracts, inbound) + task_group=outsource_return_qc + owner_role_key=quality + payload.qc_type=outsource_return 或 payload.outsource_processing=true`，并且只允许业务状态为空、`qc_pending` 或 `qc_failed` 进入；`qc_failed` 保持可进入是为了让重复失败走幂等保护，并支持上一轮返工完成后的下一轮返工 / 补做。第五条规则识别口径为 `source_type=production-progress + task_group=finished_goods_qc + owner_role_key=quality + payload.finished_goods=true`，并且只允许业务状态为空、`qc_pending` 或 `qc_failed` 进入；`done -> finished_goods_inbound`，`blocked/rejected -> finished_goods_rework`，`qc_failed` 保持可进入用于重复失败幂等和上一轮返工完成后的下一轮返工。第六条规则识别口径为 `source_type=production-progress + task_group=finished_goods_inbound + owner_role_key=warehouse + payload.finished_goods=true`，并且只允许业务状态为空、`warehouse_inbound_pending` 或 `blocked` 进入；`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因，`blocked` 保持可进入用于重复失败幂等保护，`inbound_done / shipment_pending / shipment_release_pending / shipped` 等 settled 状态不再触发。第四条和第五条都由后端在一次状态更新中写任务状态、`workflow_task_events`、`workflow_business_states`，并幂等派生下游任务；第三条和第六条只 upsert 协同业务状态。第三条到第六条均不写库存流水，不更新库存余额，不创建批次；第五条和第六条均不派生 `shipment_release`，不迁出货、应收、开票、应付或对账。出货、应收、应付和对账等其余主干闭环仍是“前端 v1 编排 + 后端保存任务 / 事件 / 业务状态”；`finished_goods_inbound` 真实运行时不再保留旧前端 follow-up 双写。
- 当前老板审批、IQC、委外回货检验和成品抽检派生任务的幂等边界是应用层事务内查询后创建：按 `source_type + source_id + task_group + owner_role_key + 非终态状态` 查找已有下游任务；委外回货检验中 `blocked` 后又 `rejected` 且旧 `outsource_rework` 仍未完成时复用同一个 active 返工任务，上一轮 `outsource_rework` 已 `done` 后允许再次创建；成品抽检中 `blocked` 后又 `rejected` 且旧 `finished_goods_rework` 仍未完成时复用同一个 active 返工任务并刷新 payload，上一轮 `finished_goods_rework` 已 `done` 后允许再次创建。采购 `warehouse_inbound` 和成品 `finished_goods_inbound` 不创建下游任务，只走业务状态 upsert；第六条 blocked/rejected 允许 `blocked` 业务状态再次进入，用于重复失败幂等保护。当前暂未新增 DB unique constraint，也未改 Ent schema / migration；极端并发下后续仍需 DB unique constraint 或 advisory lock 加固。
- 当前后台权限模型已经切换为标准 RBAC。权限数据真源是 `admin_users.is_super_admin`、`roles`、`permissions`、`role_permissions`、`admin_user_roles`；权限码定义和内置角色矩阵真源是 `/Users/simon/projects/plush-toy-erp/server/internal/biz/rbac.go`。`admin_users.level`、`admin_users.menu_permissions`、`admin_users.mobile_role_permissions` 不再作为权限来源，RBAC 迁移已清理这些旧字段。普通管理员只从未禁用角色的 `role_permissions -> permissions` 获得权限；当前 `permissions` 表不提供独立 disabled 开关，停用某个权限应从角色移除，或从 `rbac.go` 真源移除后由后端归一化丢弃。
- 登录和 `auth.me` 返回当前管理员、角色、权限码和后端推导出的菜单。桌面菜单、移动端入口、后端 JSON-RPC 接口统一消费 permission code；移动端角色入口只认 `mobile.<role>.access` 权限码，`roles` 只用于身份展示、任务归属匹配和审计语义。前端隐藏入口只是体验，不是安全边界。未登录仍返回 AuthRequired，非管理员仍返回 AdminRequired，disabled 管理员优先拒绝，`is_super_admin=true` 拥有全部权限但仍不应绕过业务事实校验。
- workflow / business / debug JSON-RPC 已进入动作级权限守卫：workflow 任务读写、创建、指派、审批、驳回、完成分别使用 `workflow.task.*`；`update_task_status` 中老板审批 `done` 要求 `workflow.task.approve`，其他 `done` 要求 `workflow.task.complete`，`rejected` 要求 `workflow.task.reject`，普通状态更新要求 `workflow.task.update`；业务记录读写删使用 `business.record.*`；调试 seed、cleanup、业务清空和业务链路运行分别使用 `debug.*`。采购入库、采购退货和采购入库调整当前仍是后端 usecase/repo 与测试覆盖，尚未接入外部 JSON-RPC/API；后续接入时必须分别加 `purchase.receipt.*`、`purchase.return.*` 和 `purchase.receipt.adjustment.*` 权限守卫。业务任务处理不能只靠 RBAC，更新、完成、审批、驳回仍必须同时校验任务 `owner_role_key`、`assignee_id` 和 `task_status_key`；`workflow.task.update / complete / approve / reject` 不代表可以修改所有角色任务，boss / pmc 的关注和催办也不等于替其他角色完成业务事实。
- 当前预设角色是 `boss`、`sales`、`purchase`、`warehouse`、`quality`、`finance`、`pmc`、`production`、`admin`、`debug_operator`。跟单角色如果甲方没有，不新增独立角色；业务跟进由 `sales` 或 `pmc` 承担。`debug_operator` 只用于 local / dev / test 的高危调试能力，生产默认不分配。
- 业务链路调试 seed / cleanup / 业务数据清空已作为开发验收能力接入后端 JSON-RPC `debug` 域；seed 和 debugRunId cleanup 只复用 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events`、`workflow_business_states`。业务数据清空是本项目当前 SQL 连接的破坏性开发重置入口，清理本项目业务链路、采购入库、采购退货、采购入库调整、库存、BOM、物料、成品、仓库和单位相关业务表，不清账号、角色、权限、管理员偏好、配置和数据库结构。相关写操作默认面向当前 SQL 连接开启，可通过 `ERP_DEBUG_*` 环境变量显式关闭，并通过管理员身份和 `debug.seed`、`debug.cleanup`、`debug.business.clear`、`debug.business_chain.run` 等权限码限制范围；按 debugRunId 清理还会校验 payload debug 标记，不是普通业务入口。
- workflow usecase 统一编排评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/workflow-usecase-review.md`。当前结论是老板审批、IQC、采购仓库入库、委外回货检验、成品抽检和成品入库六条最小规则已落地；仓库入库专项文档为 `/Users/simon/projects/plush-toy-erp/docs/architecture/warehouse-inbound-workflow-review.md`，成品入库专项文档为 `/Users/simon/projects/plush-toy-erp/docs/architecture/finished-goods-inbound-workflow-review.md`。第三条规则只迁协同状态推进：`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因；第四条规则只迁委外回货检验后的任务 / 状态派生：`done -> outsource_warehouse_inbound`，`blocked/rejected -> outsource_rework` 并强制原因；第五条规则只迁成品抽检后的任务 / 状态派生：`done -> finished_goods_inbound`，`blocked/rejected -> finished_goods_rework` 并强制原因；第六条规则只迁成品入库协同状态推进：`done -> inbound_done`，`blocked/rejected -> blocked` 并强制原因。库存专表、库存流水、库存余额、批次、`shipment_release`、出货、应收、开票、应付和对账派生仍必须单独评审，不要把六条最小 usecase 误读成完整 workflow engine。
- 行业专表 schema 早期评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/industry-schema-review.md`。该文档用于说明不要一次性拆完整 ERP 的判断。
- 材料、成品、BOM 与库存专表评审文档：`/Users/simon/projects/plush-toy-erp/docs/architecture/material-product-inventory-schema-review.md`。Phase 2A 只从该草案中落最小库存事实闭环。
- Phase 2A 库存事实专表变更记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2a-inventory-fact-schema.md`。当前结论是先落最小库存事实闭环，不扩展到采购、生产、委外、品质、财务和 BOM。
- Phase 2A PostgreSQL 落地验收记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2a-postgres-verification.md`。该文档记录本地临时库 migration apply、numeric/unique 约束和并发出库测试结果。
- Phase 2B BOM 与批次库存变更记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2b-bom-lot-schema.md`。当前结论是采用方案 B，让批次进入库存流水和当前余额维度，同时落最小 BOM 主数据。
- Phase 2C 采购入库变更记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2c-purchase-receipt-schema.md`。当前结论是新增 `purchase_receipts / purchase_receipt_items` 作为采购入库专表真源，`business_records` 继续作为通用快照和兼容层。
- Phase 2D-A 采购退货变更记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2d-purchase-return-schema.md`。当前结论是新增 `purchase_returns / purchase_return_items` 作为采购退货专表真源，退货过账写 `inventory_txns.OUT`，取消退货写 `REVERSAL`，指向原采购入库单 / 行的追溯 FK 使用 `ON DELETE NO ACTION`，有关联原入库行的累计有效退货不得超过原入库行数量，`business_records` 继续作为通用快照和兼容层。
- Phase 2D-B1 采购入库调整变更记录：`/Users/simon/projects/plush-toy-erp/docs/changes/phase-2d-purchase-receipt-adjustment-schema.md`。当前结论是新增 `purchase_receipt_adjustments / purchase_receipt_adjustment_items` 作为采购入库后数量差异和 `lot / warehouse` 更正专表真源，调整过账写 `inventory_txns.ADJUST_IN / ADJUST_OUT`，取消调整写 `REVERSAL`，采购退货累计上限改用 `effective_receipt_quantity`，本轮不做金额差异、质检、通用库存调整、可用 / 冻结 / 预留库存或前端 / API 接入。

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
