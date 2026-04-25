# 财务 v1

## 当前做什么

财务 v1 围绕 `business_records + workflow_tasks` 做业务结算事实记录，不做完整会计系统。

| 能力 | 当前落点 |
| --- | --- |
| 应收登记 | `receivables` |
| 应付登记 | `payables` |
| 发票登记 | `invoices` |
| 采购对账 | `reconciliation` |
| 委外对账 | `reconciliation` |
| 出货后应收 | `outbound` / `shipping-release` 触发，落 `receivables` |
| 采购入库 / 委外回货后应付 | `inbound` / `processing-contracts` 触发，落 `payables` |
| 税率 / 税额 / 含税金额 / 不含税金额 | `receivables.payload`、`invoices.payload` |
| 收款状态 / 付款状态 | `receivables.payload.receivable_status`、`payables` 状态和 payload |
| 异常费用备注 | `payload.settlement_note` 或业务记录备注 |

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
