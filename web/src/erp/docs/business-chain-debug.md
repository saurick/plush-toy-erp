# 业务链路调试

> 目的：把毛绒 ERP 当前怎样安全排查一条业务链路说清楚。`/erp/qa/business-chain-debug` 是受控 SQL 调试中心，不是生产运维工具，也不是任意造数或任意 SQL 工具。

## 1. 当前结论

- 当前 6 条链路只代表 ERP v1 主干闭环，不代表所有业务链路已经全量覆盖。
- 当前通用单据层仍复用 `business_records` 和 `business_record_items`；库存、BOM、采购入库等已落地的本项目专表是各自事实真源。
- 当前 workflow 状态真源是 `workflow_business_states`。
- 当前协同任务真源是 `workflow_tasks` 和 `workflow_task_events`。
- 当前已有最小库存流水 / 库存余额 / 批次 / BOM / 采购入库专表；生产、委外、品质、财务、总账、凭证、纳税申报仍未全量拆表，也没有 notification 独立表和外部推送。
- 当前调试仍以 `business_records` 为主：列表、来源单据、任务 source 和业务状态快照都优先按 `source_type + source_id + source_no` 回到通用记录排查。
- 拆表后排查路径必须更新：库存、财务、采购、委外、生产或品质专表成为事实真源后，业务链路调试不能继续只查 `business_records` 快照。
- 调试页已经接入受控后端能力：seed 表示生成调试数据，cleanup 表示清理调试数据，dryRun 表示只预览不执行，debugRunId 表示本次调试编号；业务数据清空只用于按本项目业务表 allowlist 清空当前 SQL 连接里的业务数据。
- 当前 seed 仍是通用业务记录与协同任务层的最小造景，不等于完整生产 E2E，也不代表行业专表已经落地。
- 链路走不通时先看业务链路调试；业务记录、状态和任务已经存在，但角色看不到任务时看 [`协同任务调试`](/erp/docs/workflow-task-debug)。

## 2. 已接入 v1 主干闭环

| 场景 key                      | 主干闭环                                 | 覆盖状态  | 承载方式                              | 验收方式                             | 当前盲区                                                                    |
| ----------------------------- | ---------------------------------------- | --------- | ------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `order_approval_engineering`  | 订单提交 -> 老板审批 -> 工程资料任务     | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 已接入后端最小派生规则，但没有真实 E2E 造数 runner                          |
| `purchase_iqc_inbound`        | 采购到货 -> IQC -> 入库                  | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 已有库存流水 / 库存余额专表，但当前 seed 仍不写真实库存事实                 |
| `outsource_return_inbound`    | 委外发料 -> 回货 -> 检验 -> 入库         | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 没有 `outsource_order` 专表，没有真实委外成本结算专表                       |
| `finished_goods_shipment`     | 成品完工 -> 成品抽检 -> 成品入库 -> 出货 | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 没有 `production_order` / `shipment_order` 专表，当前 seed 不写真实库存流水 |
| `shipment_receivable_invoice` | 出货 -> 应收登记 -> 开票登记             | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 没有 `ar_receivable` / `ar_invoice` 专表，没有总账、凭证、纳税申报          |
| `payable_reconciliation`      | 采购/委外 -> 应付登记 -> 对账            | 已接入 v1 | `business_records` + `workflow_tasks` | 单元测试 + `style:l1` + 移动端 smoke | 没有 `ap_payable` / `ap_settlement` 专表，没有付款流水                      |

## 3. 未覆盖 / 待补扩展链路

| 扩展链路                                | 状态     | 原因                                                                                                                | 后续建议                                                  |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 工程资料 -> BOM -> 材料需求 -> 采购需求 | deferred | 当前已有工程资料任务和 BOM 模块，但尚未形成从 BOM 自动生成材料需求和采购需求的闭环。                                | 在拆 BOM / `material_requirement` 或稳定业务字段后补。    |
| 订单变更 / 客户变更 / 交期变更          | deferred | 当前主链路覆盖订单审批，不覆盖变更审批和影响传播。                                                                  | 建立变更单、影响范围、重新触发任务规则。                  |
| 生产排产 -> 分派 -> 生产进度            | partial  | 当前已有 `production-scheduling` / `production-progress` 模块，但主闭环从成品完工后开始，不覆盖排产和分派前置链路。 | 补排产任务、产能资源、工序分派。                          |
| 欠料预警 -> 采购补料                    | deferred | 当前已有库存余额真源，但没有材料需求和缺料计算闭环。                                                                | `material_requirement` 和缺料计算口径稳定后再做。         |
| 仓库发料 / 委外发料 / 生产领料          | deferred | 当前覆盖入库和出货，不覆盖领料 / 发料流水。                                                                         | 发料 / 领料单据和库存出库口径稳定后补。                   |
| 库存盘点 / 库存调整 / 异常件            | deferred | 当前已有库存流水和余额真源，但没有盘点单、调整单和异常件流程。                                                      | `adjustment_order` 和异常件处理口径评审后补。             |
| 返工完成 -> 重新送检                    | partial  | 当前不合格会生成返工任务，但返工完成后自动重新送检规则还不完整。                                                    | 补 `rework_done -> qc_pending` 的重提链路。               |
| 出货退回 / 客诉 / 售后                  | deferred | 当前只覆盖正常出货，不覆盖退货和客诉。                                                                              | 售后 / 退货模块稳定后补。                                 |
| 收款登记 / 付款登记                     | deferred | 当前覆盖应收、开票、应付、对账，不覆盖实际收付款流水。                                                              | `receipt` / `payment` 专表或业务记录稳定后补。            |
| 发票异常 / 红冲 / 作废                  | deferred | 当前只覆盖开票登记，不覆盖税务异常处理。                                                                            | 发票专表和状态机稳定后补。                                |
| 成本核算 / 毛利分析                     | deferred | 当前没有完整库存成本、采购成本、委外成本和财务专表。                                                                | 成本快照和专表评审后补。                                  |
| 供应商 / 加工商绩效                     | deferred | 当前任务流记录了延期、不良、对账，但没有绩效模型。                                                                  | 供应商评分指标稳定后补。                                  |
| 权限审批 / 菜单权限变更审计             | deferred | 当前有权限配置和日志文档，但没有权限变更审批流。                                                                    | 审计日志和权限变更记录稳定后补。                          |
| 完整通知中心 / 未读 / 外部推送          | deferred | 当前只有任务事件、预警和催办评审，尚未落 notifications 独立表。                                                     | 评审 notification 表、recipient 表、read 状态和外部推送。 |

## 4. 当前不做

| 能力                    | 状态         |
| ----------------------- | ------------ |
| 固定资产 / 低值易耗品   | out_of_scope |
| 总账 / 凭证 / 纳税申报  | out_of_scope |
| PDA / 条码枪 / 图片识别 | out_of_scope |
| 复杂低代码表单设计器    | future       |
| 任意 SQL 控制台         | out_of_scope |

## 5. 安全操作边界

`填入并查询` 是只读安全操作：

1. 只把当前场景的推荐查询词填入搜索条件。
2. 只查询 `business_records`、`workflow_tasks`、`workflow_business_states` 和后续可接入的 `workflow_task_events`。
3. 不创建、不更新、不删除任何业务数据。

`生成调试数据` 已接入后端 `debug.rebuild_business_chain_scenario`：

1. 只允许管理员且拥有“业务链路调试”菜单权限的账号调用。
2. 默认面向当前 SQL 连接开启，也可通过 `ERP_DEBUG_SEED_ENABLED=false` 显式关闭。
3. 每次生成都会返回 `scenarioKey`、`debugRunId`、`createdRecords`、`createdTasks`、`nextCheckpoints`、`cleanupToken` 和 `warnings`。
4. 所有样本都会带 `payload.debug = true`、`payload.created_by_debug = true`、`payload.debug_run_id = 本次调试编号` 和 `payload.scenario_key = 场景 key`。
5. `document_no` / `source_no` / `task_code` 都带 `DBG-<debugRunId>-<scenarioCode>` 前缀，标题带 `[DEBUG]`。
6. 当前 6 个场景都返回 `partial` 提示：它们只覆盖通用表和协同任务，不生成库存、AR/AP、发票、对账等行业专表。

`清理调试数据` 已接入后端 `debug.clear_business_chain_scenario`：

1. 必须提供 `debugRunId`，禁止无本次调试编号清理全部数据。
2. `scenarioKey` 可选；提供后只清理该场景，不提供时只清理该 `debugRunId` 下的调试数据。
3. 默认面向当前 SQL 连接开启，也可通过 `ERP_DEBUG_CLEANUP_ENABLED=false` 显式关闭；`ERP_DEBUG_CLEANUP_SCOPE` 必须是 `debug_run`。
4. cleanup 必须提供 debugRunId，即使前端按钮被误打开，后端也会拒绝无范围清理。
5. dryRun 只返回将影响的 `matchedRecords`、`matchedTasks`、`matchedBusinessStates` 和 `skippedItems`，不修改数据。
6. 正式清理只归档带 debug 标记的 `business_records`；`workflow_tasks`、`workflow_task_events`、`workflow_business_states` 只删除本次 debug run 生成的调试行。
7. 匹配到 `DBG` 前缀但缺少 payload debug 标记的数据会进入 `skippedItems`，不会被清理。

`清空业务数据` 已接入后端 `debug.clear_business_data`：

1. 只允许管理员且拥有“业务链路调试”菜单权限的账号调用。
2. 默认面向当前 SQL 连接开启，并复用 `ERP_DEBUG_CLEANUP_ENABLED` 和 `ERP_DEBUG_CLEANUP_SCOPE=debug_run` 作为破坏性清理总开关。
3. 会硬删除本项目当前 SQL 连接中的业务链路、采购入库、库存、BOM、物料、成品、仓库和单位业务表，包括 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events`、`workflow_business_states`、`purchase_receipts`、`purchase_receipt_items`、`inventory_txns`、`inventory_balances`、`inventory_lots`、`bom_headers`、`bom_items`、`materials`、`products`、`warehouses`、`units`。
4. 不删除账号、权限、管理员列顺序、配置和数据库结构。
5. 即使前端按钮被误打开，后端也会校验管理员身份、业务链路调试菜单权限和显式关闭开关。

## 6. 当前 seed 场景

| 场景 key                      | 中文场景                 | 当前 seed 结果                                       |
| ----------------------------- | ------------------------ | ---------------------------------------------------- |
| `order_approval_engineering`  | 订单到工程               | 生成订单、工程资料记录和工程资料任务，标记为 partial |
| `purchase_iqc_inbound`        | 采购到入库               | 生成采购到货、IQC 和仓库入库任务，标记为 partial     |
| `outsource_return_inbound`    | 委外到入库               | 生成加工合同、回货检验和入库任务，标记为 partial     |
| `finished_goods_shipment`     | 生产到出货               | 生成生产完工、出货放行和出库任务，标记为 partial     |
| `shipment_receivable_invoice` | 出货到应收 / 开票        | 生成出库、应收登记和开票登记任务，标记为 partial     |
| `payable_reconciliation`      | 采购 / 委外到应付 / 对账 | 生成应付登记和对账任务，标记为 partial               |

## 7. 明确禁止

- 不提供任意 SQL 执行。
- 不提供页面输入 SQL 后执行。
- 不提供全库 truncate。
- 不提供跨账号、权限、配置和系统表的全库清空。
- 不提供绕开管理员权限、业务链路调试菜单权限和显式关闭开关的清空入口。
- 不绕开 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events` 和 `workflow_business_states`。

## 8. 移动端看不到任务时先查什么

先打开 [`协同任务调试`](/erp/docs/workflow-task-debug) 选择角色、source_no 或 task_group，再按下面顺序核对：

1. `owner_role_key` 是否是当前移动端角色。
2. `task_group` 是否被 `mobileTaskView.mjs` 识别。
3. 任务是否已经进入 `done`、`cancelled`、`closed` 等终态。
4. `mobileTaskQueries.mjs` 是否对 PMC、老板、生产使用全量加载后过滤。
5. `workflow_business_states` 是否有对应来源、业务状态和主责角色。
6. blocked、rejected、overdue、critical_path、finance_pending 等预警字段是否在 payload 或任务状态里正确出现。

## 9. 后续升级条件

- 接入只读 `workflow_task_events` 查询 API，补齐事件结果区。
- 继续把每次 seed / cleanup 的结构化审计结果沉淀到后续运行记录或审计中心；当前先以服务端日志记录 scenarioKey、debugRunId、操作者、影响数量、dryRun 和失败原因。
- 若后续拆行业专表，按专表事实真源更新排查顺序：先查专表事实，再查 `workflow_tasks`、`workflow_task_events`、`workflow_business_states`，最后用 `business_records` 兼容快照辅助回溯。
