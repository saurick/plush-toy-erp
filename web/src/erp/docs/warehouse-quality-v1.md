# 仓库与品质 v1

## 仓库 v1

仓库负责收发存事实，不负责替品质、财务或 PMC 完成业务结论。

| 能力         | 当前落点                                                  |
| ------------ | --------------------------------------------------------- |
| 收货         | `inbound`                                                 |
| IQC 待检     | `inbound` + `quality-inspections`                         |
| 入库         | `inbound`、`inventory`                                    |
| 发料         | `outbound` 或后续领料任务                                 |
| 委外发料     | `outbound` + `processing-contracts`                       |
| 委外回货入库 | `inbound` + `processing-contracts`                        |
| 成品入库     | `inbound` + `inventory`                                   |
| 出货出库     | `shipping-release` + `outbound`                           |
| 库存余额     | `inventory`                                               |
| 库存流水     | 当前通过业务记录和事件追踪，后续再评审库存专表            |
| 异常件       | `production-exceptions` 或 `quality-inspections` 关联记录 |

## 品质 v1

品质负责检验事实、检验结论、返工复检和放行，不负责库存数量事实或财务金额事实。

| 能力         | 当前落点                                                             |
| ------------ | -------------------------------------------------------------------- |
| IQC          | `quality-inspections`                                                |
| 委外回货检验 | `quality-inspections`                                                |
| 成品抽检     | `quality-inspections`                                                |
| 不良登记     | `quality-inspections.payload.qc_result / defect_qty / defect_reason` |
| 返工复检     | `quality-inspections.payload.rework_required / release_decision`     |
| 放行 / 退回  | `quality-inspections.payload.release_decision`                       |

## 主链关系

1. 采购或委外到货后，仓库先形成收货 / 到仓记录。
2. 品质执行 IQC 或回货检验，记录合格、不合格、让步接收或返工复检。
3. 合格或让步接收后，仓库才能确认入库事实。
4. 不合格进入返工、退回或异常处理，必须留下任务事件。
5. 成品出货前，品质放行、仓库拣货 / 装箱、财务放行和业务确认必须分层记录。

## 当前不做

- PDA。
- 条码枪。
- 复杂库位策略。
- WMS 波次。
- 自动补货。
- 图片识别。
- 复杂 AQL 算法。

## 预警规则

- `qc_failed` 为 critical。
- IQC 或复检超过要求完成日期进入 overdue。
- 欠料、异常件、出货日期风险进入 PMC 关注。
- 仓库不能以入库动作替代品质放行；品质也不能以检验结论替代仓库库存变动。

## 第二条真实闭环：采购到货 -> IQC -> 入库

| 环节        | 责任角色        | v1 记录口径                                                                                                   |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| 到货 / 待检 | 采购、仓库      | `accessories-purchase` 或 `inbound` 记录点击“发起 IQC”，业务状态进入 `iqc_pending`。                          |
| IQC 合格    | 品质            | quality 移动端完成 `purchase_iqc` 任务，payload 记录 `qc_result=pass`，状态进入 `warehouse_inbound_pending`。 |
| IQC 不合格  | 品质、采购、PMC | quality 移动端阻塞或退回任务并填写原因，状态进入 `qc_failed`，生成采购异常处理任务。                          |
| 确认入库    | 仓库            | warehouse 移动端完成 `warehouse_inbound` 任务，状态进入 `inbound_done`。                                      |

当前 v1 的 `inbound_done` 只表示业务任务闭环，不代表已经写入正式库存余额或库存流水。正式 `inventory_txn` / `inventory_balance` 需要等采购到货、委外回货、成品入库和出货扣减口径都稳定后，再评审 Ent schema、migration、库存计算和历史回补策略。

## 第三条真实闭环：委外发料 -> 回货 -> 检验 -> 入库

| 环节              | 责任角色             | v1 记录口径                                                                                                                                            |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 委外发料 / 加工中 | 生产/委外            | `processing-contracts` 记录进入 `production_processing`，桌面点击“发起委外回货跟踪”后创建 `outsource_return_tracking` 给 `production`。                |
| 委外回货          | 生产/委外、品质      | production 移动端完成跟踪任务，表示已登记回货数量和回货日期，随后创建 `outsource_return_qc` 给 `quality`；`inbound` 委外回货通知也可以直接发起该任务。 |
| 回货检验合格      | 品质、仓库           | quality 移动端完成 `outsource_return_qc`，状态进入 `warehouse_inbound_pending`，并创建 `outsource_warehouse_inbound` 给 `warehouse`。                  |
| 回货检验不合格    | 品质、生产/委外、PMC | quality 移动端阻塞或退回并填写不良原因，状态进入 `qc_failed`，创建 `outsource_rework` 给 `production` 处理返工、补做或让步接收安排。                   |
| 委外入库完成      | 仓库                 | warehouse 移动端完成 `outsource_warehouse_inbound`，状态进入 `inbound_done`，只表示委外回货入库任务完成。                                              |

当前 v1 不新增 `outsource_order` 专表，不新增 `inventory_txn` / `inventory_balance` 专表，不写库存余额或库存流水。库存流水和余额需要等采购到货、委外回货、成品入库、出货扣减、历史回补和对账影响都稳定后，再评审 Ent schema、migration 与库存计算口径。

当前也不新增 `outsource` 移动端入口；委外回货跟踪和返工 / 补做先由 `production` 承接，payload 保留 `outsource_owner_role_key=outsource` 作为后续拆分角色入口的迁移线索。PMC 只看 blocked、overdue、critical_path 和 critical 风险，不代替品质或仓库完成业务事实。

## 第四条真实闭环：成品完工 -> 成品抽检 -> 成品入库 -> 出货

| 环节                | 责任角色        | v1 记录口径                                                                                                                                                                                                                                                                          |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 成品完工 / 待抽检   | 生产、品质      | `production-progress` 记录标注 `payload.finished=true`，或桌面点击“发起成品抽检”，创建 `finished_goods_qc` 给 `quality`，业务状态进入 `qc_pending`。                                                                                                                                 |
| 成品抽检合格        | 品质、仓库      | quality 移动端完成 `finished_goods_qc`，后端 `WorkflowUsecase.UpdateTaskStatus` 将状态推进到 `warehouse_inbound_pending`，并幂等创建 `finished_goods_inbound` 给 `warehouse`。                                                                                                       |
| 成品抽检不合格      | 品质、生产、PMC | quality 移动端阻塞或退回 `finished_goods_qc` 并填写不良原因，后端将状态推进到 `qc_failed`，并幂等创建 `finished_goods_rework` 给 `production` 处理返工、重新抽检或让步放行。                                                                                                         |
| 成品入库完成        | 仓库            | warehouse 移动端完成 `finished_goods_inbound`，后端 `WorkflowUsecase.UpdateTaskStatus` 将状态推进到 `inbound_done`，只表示成品入库协同任务完成，不写正式库存余额或库存流水，也不派生 `shipment_release`。                                                                            |
| 成品入库阻塞 / 退回 | 仓库、PMC       | warehouse 移动端阻塞或退回 `finished_goods_inbound` 并填写原因，后端统一写 `blocked`，不派生成品入库异常、生产返工、品质复检或出货任务。                                                                                                                                             |
| 出货放行 / 待出库   | 仓库、业务      | `shipment_release` 已进入后端 `WorkflowUsecase.UpdateTaskStatus`：`done -> shipping_released`，`blocked / rejected -> blocked`，只表示出货放行协同状态；不等于 `shipped`，不写库存，不派生应收 / 开票。若 seed / demo 需要展示出货准备任务，只能作为调试样本，不代表运行时派生真源。 |

当前 `finished_goods_qc done / blocked / rejected` 后的成品入库 / 成品返工任务派生、`finished_goods_inbound done / blocked / rejected` 后的 `inbound_done / blocked` 协同状态推进，以及 `shipment_release done / blocked / rejected` 后的 `shipping_released / blocked` 协同状态推进，均已进入后端 usecase，但这仍不是完整 workflow engine。真实移动端业务动作不再通过 `finishedGoodsFlow.mjs` 本地 upsert 第六条或第七条 `workflow_business_states`，不再本地创建 `finished_goods_inbound / finished_goods_rework / shipment_release`，也不再由 `shipment_release done` 本地推进 `shipped`、upsert warehouse / finance 状态或创建 `receivable_registration`；`finishedGoodsFlow.mjs` 的 `buildShipmentReleaseTask` 仅保留 seed、test、demo 和未来出货专项辅助口径。当前 v1 不新增 `production_order`、`shipment_order`、`inventory_txn`、`inventory_balance` 专表，不写 `inventory_txns`，不更新 `inventory_balances`，不创建 `inventory_lots`，不由成品入库完成派生 `shipment_release`，不由出货放行派生应收 / 开票登记。正式库存流水、库存余额、出货扣减、可用量、预留冻结和应收开票需要等成品入库、真实出货确认、客户要求、历史回补和财务口径稳定后，再单独评审 `ShipmentUsecase / InventoryUsecase`、Ent schema、migration 与计算测试。
