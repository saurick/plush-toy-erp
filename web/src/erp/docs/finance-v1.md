# 财务 v1

## 当前做什么

财务 v1 围绕 `business_records + workflow_tasks` 做业务结算事实记录，不做完整会计系统。

| 能力                                | 当前落点                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| 应收登记                            | `receivables`                                                      |
| 应付登记                            | `payables`                                                         |
| 发票登记                            | `invoices`                                                         |
| 采购对账                            | `reconciliation`                                                   |
| 委外对账                            | `reconciliation`                                                   |
| 出货后应收                          | `outbound` / `shipping-release` 触发，落 `receivables`             |
| 采购入库 / 委外回货后应付           | `inbound` / `processing-contracts` 触发，落 `payables`             |
| 税率 / 税额 / 含税金额 / 不含税金额 | `receivables.payload`、`invoices.payload`                          |
| 收款状态 / 付款状态                 | `receivables.payload.receivable_status`、`payables` 状态和 payload |
| 异常费用备注                        | `payload.settlement_note` 或业务记录备注                           |

## 应收登记

应收登记覆盖出货后的客户应收金额、收款状态、开票状态和异常金额。字段包括来源单号、客户、产品、数量、应收金额、税率、税额、含税金额、不含税金额、已收金额、收款状态、开票状态和结算备注。

应收不是总账，不生成凭证，也不反向伪造出货事实。出货事实仍由仓库和出库链路确认。

## 应付登记

应付登记覆盖采购入库、委外回货入库、对账完成后的待付款提醒。当前已有 `payables`，继续保留，不拆旧入口。

应付事实来自采购、委外、入库和对账，不由 PMC 代填完成。异常费用必须写清来源和说明。

## 发票登记

发票登记覆盖销项发票和进项发票登记。字段包括发票号、发票类型、发票方向、含税金额、不含税金额、税率、税额、开票日期、收票日期和发票状态。

发票登记不做税务申报，不替代发票查验平台或税控系统。

## 当前不做

- 总账。
- 凭证。
- 会计科目。
- 纳税申报。
- 多账簿。
- 复杂成本会计。
- 固定资产、折旧和低值易耗品。

## 预警规则

- 应收或应付到期日前 1 天进入 warning。
- 到期后未处理进入 `finance_overdue`，通常为 critical。
- 发票缺失但业务已经到收付款节点时进入 `finance_pending`。
- 财务风险可进入老板关注，但不能绕过财务确认事实。

## 第五条真实闭环：出货 -> 应收登记 -> 开票登记

本闭环把出货后的财务动作落在 `workflow_tasks`，不新增财务专表。出货业务事实仍由 `shipping-release` / `outbound` 或上一轮沿用的 `production-progress` 出货任务确认，财务只确认应收和开票登记事实。

| 环节             | 当前 v1 规则                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 触发点           | `shipment_release` 完成或业务状态进入 `shipped` 后创建 `receivable_registration`。桌面 `shipping-release` / `outbound` 可手动发起；移动端仓库完成出货任务后会自动发起。 |
| 应收登记责任人   | `owner_role_key=finance`，财务移动端处理；PMC 和老板只看风险，不代办。                                                                                                  |
| 应收登记完成条件 | 财务确认客户、出货数量、应收金额、税率、含税 / 不含税金额和收款状态。完成后创建 `invoice_registration`，业务状态推进到 `reconciling`。                                  |
| 开票登记责任人   | `owner_role_key=finance`，继续由财务移动端处理。                                                                                                                        |
| 开票登记完成条件 | 财务登记发票号、发票类型、税率、税额、含税金额、不含税金额和发票状态。完成后业务状态保持 `reconciling`，交给后续对账。                                                  |
| 财务异常 / 阻塞  | 应收或开票任务阻塞 / 退回必须填写原因；状态快照记录 `blocked_reason`；Dashboard 以 `finance_pending`、`invoice_pending` 或 `finance_overdue` 展示预警。                 |
| 当前不做         | 不做总账、凭证、会计科目、纳税申报；不新增 `ar_receivable`、`ar_invoice`、`settlement` 或 finance 专表；不自动生成真实发票文件。                                        |
| 后续评审条件     | 当应收金额、税率、发票状态、收款状态、对账差异和历史回补口径稳定后，再评审是否拆 `ar_receivable`、`ar_invoice`、`settlement` Ent schema。                               |

## 第六条真实闭环：采购/委外 -> 应付登记 -> 对账

本闭环把采购和委外入库后的成本侧财务动作落在 `workflow_tasks`，不新增财务专表。采购 / 委外入库事实仍由仓库任务和 `inbound_done` 状态确认，财务只确认应付登记和对账事实。

| 环节             | 当前 v1 规则                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 触发点           | 采购入库或委外入库完成，业务状态进入 `inbound_done` 后创建应付登记任务。桌面业务页可手动发起；移动端仓库完成采购 / 委外入库任务后会自动发起。                  |
| 采购应付责任人   | `purchase_payable_registration` 进入 `finance`，财务移动端处理；PMC 和老板只看风险，不代办。                                                                   |
| 委外应付责任人   | `outsource_payable_registration` 进入 `finance`，payload 标记 `payable_type=outsource` 和 `outsource_processing=true`。                                        |
| 应付登记完成条件 | 财务确认供应商或加工厂、数量、金额、税率、含税 / 不含税金额和应付状态。完成后业务状态推进到 `reconciling`，并创建采购或委外对账任务。                          |
| 采购对账完成条件 | 财务完成采购单、入库记录、发票 / 对账资料和金额差异核对。完成后业务状态进入 `settled`。                                                                        |
| 委外对账完成条件 | 财务完成加工合同、回货记录、检验结果、加工费、扣款或差异核对。完成后业务状态进入 `settled`。                                                                   |
| 财务异常 / 阻塞  | 应付或对账任务阻塞 / 退回必须填写原因；状态快照记录 `blocked_reason`；Dashboard 以 `payable_pending`、`reconciliation_pending` 或 `finance_overdue` 展示预警。 |
| 当前不做         | 不做总账、凭证、会计科目、纳税申报、复杂成本核算或付款流水；不新增 `ap_payable`、`ap_settlement`、`settlement` 或 finance 专表。                               |
| 后续评审条件     | 当供应商账期、加工费、税率、扣款、对账差异、付款状态和历史回补口径稳定后，再评审是否拆 `ap_payable`、`ap_settlement`、`settlement` Ent schema。                |
