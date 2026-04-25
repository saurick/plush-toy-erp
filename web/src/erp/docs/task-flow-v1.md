# 工作流主任务树 v1

## 适用范围

本文定义当前 `business_records + workflow_tasks` 上的行业核心 v1 主任务树。任务是协同层，不是业务事实真源；业务事实仍落在对应业务记录、业务记录事件、任务事件和业务状态快照里。

本轮只定义 T1 到 T8，不定义 T9 资产管理，也不把固定资产、低值易耗品、折旧、总账、凭证或税务申报纳入主链。

## 主任务树

| 编号 | 任务     | 责任角色                          | 触发事件                                  | 完成条件                                                         | 关联模块                                                                                           | 可处理端                                                         | 阻塞原因                                                     | 超时规则                                                                    | 关键路径 |
| ---- | -------- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| T1   | 订单审批 | 业务跟单、老板                    | 业务提交客户 / 款式立项记录               | 老板审批通过，或退回后补齐资料再通过                             | `project-orders`                                                                                   | 桌面、老板移动端、跟单移动端                                     | 客户资料缺失、编号冲突、交期未确认、审批退回                 | 订单提交后 1 个工作日内未审批视为 `approval_pending`                        | 是       |
| T2   | 工程资料 | 工程、跟单、PMC                   | T1 审批通过                               | BOM、色卡、作业指导书、包装要求确认完成                          | `material-bom`、`project-orders`                                                                   | 桌面、跟单移动端、PMC 移动端                                     | BOM 未齐、色卡未确认、包装要求缺失、资料版本冲突             | 审批通过后 2 个工作日内未齐套视为 `due_soon`，超期视为 `overdue`            | 是       |
| T3   | 材料采购 | 采购、仓库、品质、PMC             | 工程资料进入采购准备                      | 采购单明确供应商和回货日期，到货后 IQC 通过并入库                | `material-bom`、`accessories-purchase`、`inbound`、`quality-inspections`、`inventory`              | 桌面、采购移动端、仓库移动端、品质移动端、PMC 移动端             | 缺料、供应商未确认、到货延期、IQC 不合格、入库数量差异       | 到货日前 1 天为 `due_soon`，到货日后未完成为 `overdue`                      | 是       |
| T4   | 委外加工 | 采购、委外、仓库、品质、财务、PMC | 生产经理或 PMC 判定需要委外               | 委外单 / 加工合同完成，发料、回货、回货检验、入库和委外对账完成  | `processing-contracts`、`outbound`、`quality-inspections`、`inbound`、`reconciliation`、`payables` | 桌面、采购移动端、仓库移动端、品质移动端、财务移动端、PMC 移动端 | 合同未回签、委外发料不足、加工厂延期、回货不良、对账差异     | 回货日前 1 天预警，回货日后未入库为 `outsource_delay` / `overdue`           | 是       |
| T5   | 内部生产 | PMC、生产经理、生产工人、品质     | 齐套后进入排产                            | 排产、分派、车缝、手工、包装和完工上报完成；返工必须闭环         | `production-scheduling`、`production-progress`、`production-exceptions`、`quality-inspections`     | 桌面、生产移动端、PMC 移动端、品质移动端                         | 齐套不足、人员或产能冲突、工序延期、返工未完成、异常未关闭   | 计划完成日前 1 天预警，计划日后未完成为 `overdue`                           | 是       |
| T6   | 品质检验 | 品质、生产经理、仓库、PMC         | IQC、委外回货、成品抽检或返工复检任务创建 | 检验结论明确，不良登记完成；放行、退回或返工复检结论已记录       | `quality-inspections`、`inbound`、`production-exceptions`、`shipping-release`                      | 桌面、品质移动端、仓库移动端、生产移动端、PMC 移动端             | 待检样品缺失、检验标准不明确、不良未判责、返工未复检         | 检验要求日期当天未完成为 `due_soon`，超期为 `overdue`；不合格为 `qc_failed` | 是       |
| T7   | 包装出货 | 仓库、业务跟单、财务、PMC         | 成品检验通过并准备出货                    | 成品入库、出货通知、拣货、装箱、财务放行、出货确认完成           | `inventory`、`shipping-release`、`outbound`、`receivables`                                         | 桌面、仓库移动端、跟单移动端、财务移动端、PMC 移动端、老板移动端 | 成品不足、财务未放行、客户信息未确认、装箱异常、出货日期风险 | 出货日前 1 天为 `shipment_due` critical；出货日后未确认为 `overdue`         | 是       |
| T8   | 财务结算 | 财务、采购、业务跟单、老板        | 采购入库、委外回货入库或出货确认          | 采购对账、委外对账、应收登记、应付登记、发票登记、收付款状态完成 | `reconciliation`、`payables`、`receivables`、`invoices`                                            | 桌面、财务移动端、老板移动端                                     | 对账差异、发票未登记、应收逾期、应付待确认、异常费用未说明   | 应收 / 应付到期日前 1 天预警，到期后为 `finance_overdue`                    | 是       |

## 关键原则

- PMC 可以看全链路卡点、超时、阻塞和关键路径，但不能替仓库、品质、财务伪造完成事实。
- 品质负责检验结论和放行；仓库负责收发存事实；财务负责应收、应付、发票和对账事实。
- `workflow_tasks.owner_role_key` 决定任务进入哪个角色池，`assignee_id` 决定具体处理人。
- 任务完成必须留下 `workflow_task_events`；业务记录创建、编辑、删除、恢复必须留下 `business_record_events`。
- v1 不做拖拽流程设计器。任务树先用文档和配置稳定，再评审是否需要后台可配置流程。

## 第一条真实闭环：订单提交 -> 老板审批 -> 工程资料任务

| 环节         | 当前 v1 规则                                                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 触发点       | 桌面 `project-orders` 选中客户 / 款式立项记录后点击“提交审批”。                                                                                                                                                                                                                                          |
| 责任角色     | 提交人通常是 `merchandiser`；审批任务进入 `boss` 角色池；审批通过后的工程资料任务进入 `engineering` 角色池。                                                                                                                                                                                             |
| 审批任务字段 | `task_group=order_approval`、`task_name=老板审批订单`、`source_type=project-orders`、`source_id/source_no` 指向订单、`business_status_key=project_pending`、`task_status_key=ready`、`owner_role_key=boss`、`notification_type=approval_required`、`alert_type=approval_pending`、`critical_path=true`。 |
| 完成条件     | 老板必须给出审批结果：通过则任务更新为 `done` 并带 `project_approved`；阻塞或退回必须填写原因。                                                                                                                                                                                                          |
| 通过路径     | boss 移动端点击“完成”后，订单业务状态同步为 `project_approved`，`workflow_business_states` 归属到 `engineering`，并自动创建 `engineering_data` 工程资料任务。                                                                                                                                            |
| 工程任务字段 | `task_group=engineering_data`、`task_name=准备 BOM / 色卡 / 作业指导书`、`business_status_key=engineering_preparing`、`owner_role_key=engineering`、`due_at` 默认 24 小时后、`payload.next_module_key=material-bom`、`payload.entry_path=/erp/purchase/material-bom`、`critical_path=true`。             |
| 驳回路径     | boss 移动端点击“阻塞”或“退回”时必须填写原因；任务写入 `blocked` 或 `rejected`，状态快照写 `blocked_reason`，并创建 `order_revision` 跟单补资料任务给 `merchandiser`。                                                                                                                                    |
| 当前编排位置 | 本闭环 v1 先在前端业务页和 boss 移动端通过现有 `create_task`、`update_task_status`、`upsert_business_state`、`update_record` API 串联，不新增 workflow API、不改 Ent schema。                                                                                                                            |
| 后端迁移条件 | 当第二、第三条真实闭环也稳定后，再把“任务完成后生成下一任务、同步业务状态、去重和失败补偿”收口到后端 workflow usecase，避免前端重复编排。                                                                                                                                                                |

边界说明：本闭环只落地订单审批到工程资料，不让 PMC 代替老板审批，不创建资产、低值易耗品、低代码表单或拖拽流程设计器，也不新增 notifications 表。预警仍由任务状态、截止时间、优先级和 payload 在前端计算。

## 第二条真实闭环：采购到货 -> IQC -> 入库

| 环节         | 当前 v1 规则                                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 触发点       | 桌面 `accessories-purchase` 或 `inbound` 选中到货 / 入库通知记录后点击“发起 IQC”。                                                                                                                                           |
| 责任角色     | 采购或仓库发起到货待检；IQC 任务进入 `quality`；合格后的入库任务进入 `warehouse`；不合格异常任务进入 `purchasing`，PMC 通过 critical / blocked 关注。                                                                        |
| IQC 任务字段 | `task_group=purchase_iqc`、`task_name=IQC 来料检验`、`business_status_key=iqc_pending`、`task_status_key=ready`、`owner_role_key=quality`、`notification_type=task_created`、`alert_type=qc_pending`、`critical_path=true`。 |
| 合格路径     | quality 移动端点击“完成”代表 IQC 合格；任务更新为 `done`，业务状态进入 `warehouse_inbound_pending`，并自动创建 `warehouse_inbound` 仓库确认入库任务。                                                                        |
| 不合格路径   | quality 移动端点击“阻塞”或“退回”必须填写原因；状态快照进入 `qc_failed`，并创建 `purchase_quality_exception` 任务给 `purchasing` 处理退货、补货、让步接收或重新到货安排。                                                     |
| 入库完成条件 | warehouse 移动端完成“确认入库”任务后，业务状态更新为 `inbound_done`，表示当前入库任务闭环。                                                                                                                                  |
| 当前编排位置 | 本闭环 v1 继续放在前端业务页和移动端，通过现有 `create_task`、`update_task_status`、`upsert_business_state`、`update_record` API 串联，不新增 workflow API。                                                                 |
| 当前不做     | 不写库存余额，不写库存流水，不新增 `inventory_txn` / `inventory_balance` 专表，不用仓库动作替代品质检验结论。                                                                                                                |
| 后续评审条件 | 当采购到货、委外回货、成品入库和出货扣减链路都稳定后，再评审是否拆 `inventory_txn`、`inventory_balance` Ent schema，并补 migration 与库存口径测试。                                                                          |

边界说明：本闭环只落地采购到货、IQC 结论、仓库确认入库的任务和业务状态闭环；不扩散到委外、成品、出货、财务、资产或复杂 WMS。
