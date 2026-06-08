Doc Type / 文档类型: Yoyoosun Field Numbering Confirmation Result Template / 永绅 yoyoosun 字段编号确认结果模板
Status / 状态: Draft / 草案
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否

# 永绅 yoyoosun 字段编号确认结果模板 / Yoyoosun Field Numbering Confirmation Result Template

本文用于把 `field-numbering-confirmation-checklist.md` 的客户确认结果回写到正确位置。本文不是 runtime、schema、migration、API、RBAC、导入或真实账号真源；它只规定确认结果如何记录、分类和进入后续评审。

禁止把客户口头确认直接写成 Product Core、Ent schema、真实导入规则或行业默认模板。任何进入 runtime / schema / import loader 的动作都必须另开实现任务，并重新确认范围、测试和回滚。

## 1. 回写总规则

| 结果类型 | 写入位置 | 不写入位置 |
| --- | --- | --- |
| 已确认客户配置 | `customer-config-draft.md`、`fieldNumberingConfig.mjs` | 不直接写 schema、migration、API |
| 仍未确认问题 | `question-backlog.md` 或 `import-unresolved-queue.md` | 不塞进默认值或 fallback |
| 客户差异 | `delta-register.md` | 不升级为 Product Core |
| 已确认正式决策 | `decision-log.md` | 不把猜测写成已决策 |
| Product Core 候选 | 产品 / 架构评审文档或后续任务 | 不直接改 usecase 或 DB |
| 真实导入候选 | import strategy / acceptance / future loader task | 不执行真实 import |

## 2. 确认记录模板

复制下面模板到客户确认记录或本文件下方的 “确认结果暂存区”，再根据结论分别回写到正式文件。

```markdown
## YYYY-MM-DD 字段编号确认 / Field Numbering Confirmation

来源 / Source:
- 会议:
- 参与人:
- 证据材料:

确认结论 / Confirmed Decisions:

| 编号 | 领域 | 字段 / 编号 | 客户确认结论 | 回写位置 | 是否进入 runtime | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | customers | 客户编码 |  | customer-config-draft.md / fieldNumberingConfig.mjs | No / Review Required |  |
| 2 | sales_orders | 销售订单编号 |  | customer-config-draft.md / fieldNumberingConfig.mjs | No / Review Required |  |

未确认问题 / Open Questions:

| 编号 | 问题 | 当前处理 | 回写位置 |
| --- | --- | --- | --- |
| 1 |  | 继续待确认 | question-backlog.md |

客户差异 / Customer Deltas:

| 差异项 | 分类 | 当前处理 | 是否 Product Core |
| --- | --- | --- | --- |
|  | Customer Config |  | 否，待评审 |

禁止误读 / Do Not Interpret As:
- 不代表 schema 已批准。
- 不代表 runtime 已接入。
- 不代表真实 import 已批准。
- 不代表 Product Core 已通过。
```

## 3. 字段结论回写规则

| 字段结论 | 回写动作 |
| --- | --- |
| 客户确认字段显示但不要求必填 | `fieldNumberingConfig.mjs` 中保留 `decision=review_required`，在 note 写明显示偏好；`customer-config-draft.md` 更新状态 |
| 客户确认字段必须出现但当前模型无字段 | 进入 `question-backlog.md` 或 Product Core 评审；不直接加 schema |
| 客户确认字段只是 yoyoosun 习惯 | 进入 `delta-register.md`，分类为 Customer Config |
| 客户确认字段属于导入来源 | 进入 `import-unresolved-queue.md` 或 future import loader 设计 |
| 客户确认字段涉及出货、库存、财务或生产事实 | 进入对应 usecase 评审；不从销售订单或导入自动生成事实 |

## 4. 编号结论回写规则

| 编号结论 | 回写动作 |
| --- | --- |
| 人工维护编号 | 在 `fieldNumberingConfig.mjs` note 记录维护角色和唯一性要求；不自动生成 |
| 系统生成编号 | 进入后续 runtime 评审，必须单独确认规则、冲突处理和测试 |
| 沿用历史编号 | 进入 import loader 设计，必须有 source reference 和重复检测 |
| 编号缺失允许为空 | 明确不得伪造默认编号 |
| 编号缺失必须阻断 | 写入 unresolved / validation 规则；真实 import 前必须客户确认 |

## 5. 当前禁止进入 runtime 的结论

以下结论即使客户确认，也不能在当前阶段直接接入 runtime：

| 结论 | 原因 |
| --- | --- |
| 颜色 / 尺寸直接形成 SKU | `product_skus` 仍为 draft-only |
| 采购订单号直接生成采购订单 | `purchase_orders` 仍为 V2 candidate |
| 交期 / 出货日期代表已出货 | `shipping_released != shipped`，销售订单不是出货事实 |
| 未出货数 / 生产数量写入订单明细事实 | shipment / production facts 未评审 |
| 单价 / 金额生成应收、发票或收款 | finance facts deferred |
| 客户合同样式进入通用打印模板内核 | Print Template Core 尚未进入 Product Core |

## 6. 确认结果暂存区

当前暂无客户签字确认结果。
