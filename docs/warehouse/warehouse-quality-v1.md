# 仓库与品质 v1

## 仓库 v1

仓库负责收发存事实，不负责替品质、财务或 PMC 完成业务结论。

| 能力 | 当前落点 |
| --- | --- |
| 收货 | `inbound` |
| IQC 待检 | `inbound` + `quality-inspections` |
| 入库 | `inbound`、`inventory` |
| 发料 | `outbound` 或后续领料任务 |
| 委外发料 | `outbound` + `processing-contracts` |
| 委外回货入库 | `inbound` + `processing-contracts` |
| 成品入库 | `inbound` + `inventory` |
| 出货出库 | `shipping-release` + `outbound` |
| 库存余额 | `inventory` |
| 库存流水 | 当前通过业务记录和事件追踪，后续再评审库存专表 |
| 异常件 | `production-exceptions` 或 `quality-inspections` 关联记录 |

## 品质 v1

品质负责检验事实、检验结论、返工复检和放行，不负责库存数量事实或财务金额事实。

| 能力 | 当前落点 |
| --- | --- |
| IQC | `quality-inspections` |
| 委外回货检验 | `quality-inspections` |
| 成品抽检 | `quality-inspections` |
| 不良登记 | `quality-inspections.payload.qc_result / defect_qty / defect_reason` |
| 返工复检 | `quality-inspections.payload.rework_required / release_decision` |
| 放行 / 退回 | `quality-inspections.payload.release_decision` |

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

| 环节 | 责任角色 | v1 记录口径 |
| --- | --- | --- |
| 到货 / 待检 | 采购、仓库 | `accessories-purchase` 或 `inbound` 记录点击“发起 IQC”，业务状态进入 `iqc_pending`。 |
| IQC 合格 | 品质 | quality 移动端完成 `purchase_iqc` 任务，payload 记录 `qc_result=pass`，状态进入 `warehouse_inbound_pending`。 |
| IQC 不合格 | 品质、采购、PMC | quality 移动端阻塞或退回任务并填写原因，状态进入 `qc_failed`，生成采购异常处理任务。 |
| 确认入库 | 仓库 | warehouse 移动端完成 `warehouse_inbound` 任务，状态进入 `inbound_done`。 |

当前 v1 的 `inbound_done` 只表示业务任务闭环，不代表已经写入正式库存余额或库存流水。正式 `inventory_txn` / `inventory_balance` 需要等采购到货、委外回货、成品入库和出货扣减口径都稳定后，再评审 Ent schema、migration、库存计算和历史回补策略。
