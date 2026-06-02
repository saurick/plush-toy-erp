Doc Type / 文档类型: Current Source Snapshot Manual Review Checklist
Status / 状态: 012 Evidence Prepared / 012 证据已准备
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: `scripts/import/currentSourceSnapshotFreezeCheck.mjs` and `scripts/import/currentCustomerDryRun.mjs`
Current Evidence Inputs / 当前证据输入: `output/current-source-snapshot-freeze/` and `output/current-real-dry-run-evidence/`

# current 来源快照人工复查清单 / Current Source Snapshot Manual Review Checklist

本清单用于 review 012 freeze evidence 和 dry-run evidence。结论默认是 import not approved，直到后续单独 Goal 完成真实 loader 设计、备份、回滚、幂等、对账和客户确认。

## 复查清单 / Review Checklist

| area | review item | evidence | required conclusion |
|---|---|---|---|
| customers | 确认 customer update / create 候选是否唯一、字段是否来自可追溯 source reference。 | `candidates.json`、`source-references.json` | 未确认前不得导入。 |
| suppliers | 确认加工厂 / 供应商语义，不把加工厂习惯字段写进 Product Core。 | `unresolved-queue.json` | 供应商角色需人工确认。 |
| contacts | 检查已有 owner 的联系人候选；无 owner 的联系人必须 block。 | `candidates.json`、`unresolved-queue.json` | 无 owner 不得创建联系人。 |
| sales_orders | 确认订单号、customer 匹配、日期和 source document 语义。 | `candidates.json`、`normalized-rows.json` | 销售订单只是 Source Document / Business Commitment。 |
| sales_order_items | 确认 product / unit / quantity；未知单位必须 block。 | `unresolved-queue.json` | 缺 product/unit/quantity 不得创建订单行。 |
| products / materials / units / warehouses | 确认候选是否复用 existing formal models；不要重复设计真源。 | `candidates.json`、`existing-v1.freeze.sample.json` | 无唯一匹配时进入人工 review。 |
| BOM | 确认 product/material/unit 都唯一，BOM 不写库存事实。 | `candidates.json`、`unresolved-queue.json` | 只允许作为候选 evidence。 |
| product_skus deferred | 检查 SKU、颜色、尺寸、包装版本字段全部 deferred。 | `unresolved-queue.json`、`freeze-check-summary.json` | 不自动创建 `product_skus`。 |
| purchase_orders deferred | 检查采购单字段全部 deferred。 | `unresolved-queue.json`、`freeze-check-summary.json` | 不自动创建 `purchase_orders`。 |
| shipment forbidden | 检查 shipment / shipped / `shipping_released` 风险全部 forbidden/block。 | `forbidden-auto-import.json`、`freeze-check-summary.json` | `shipping_released != shipped`。 |
| inventory forbidden | 检查 `inventory_txn`、`inventory_balance`、`inventory_lot` 风险全部 forbidden/block。 | `forbidden-auto-import.json` | 不生成库存事实。 |
| finance forbidden | 检查 AR/AP、invoice、payment、reconciliation 风险全部 forbidden/block。 | `forbidden-auto-import.json` | 不生成财务事实。 |
| duplicate review | 检查 duplicate code/name；当前 sanitized evidence duplicate count 为 0。 | `duplicates.json` | 真实 source 若出现重复，必须人工处理。 |
| conflict review | 检查 update conflict；当前 sanitized evidence conflict count 为 0。 | `conflicts.json` | 真实 source 若出现冲突，不得自动覆盖。 |
| unresolved block review | 检查所有 block 项，尤其 contact owner、unknown unit、forbidden facts。 | `unresolved-queue.json` | block 未关闭前不得设计真实导入执行。 |
| missing source reference | 检查 sourceId/sourceKind/moduleKey/fileName/domain 是否完整。 | `freeze-check-summary.json` | 缺 source reference 不得导入。 |
| sensitive data review | 只 review 字段名和 source reference，不复制 raw sensitive values。 | `freeze-check-summary.json`、`freeze-check-report.md` | 禁止把敏感原值写入报告。 |
| customer sign-off | 预留客户确认 evidence package、unresolved 处理和 exclusions。 | customer sign-off notes | 012 不包含 sign-off。 |

## 客户签收占位 / Customer Sign-off Placeholder

| item | status | note |
|---|---|---|
| source snapshot freeze reviewed by customer | Pending | 012 未执行客户确认。 |
| dry-run candidates reviewed by customer | Pending | 012 只生成 evidence。 |
| forbidden rows acknowledged | Pending | shipment / inventory / finance 必须确认排除。 |
| unresolved queue resolved | Pending | 当前仍有 block / defer / review 项。 |
| backup / rollback plan approved | Pending | 012 未设计真实 loader。 |
| import execution approved | Not approved | 012 不是真实导入批准。 |

## 不批准导入结论 / Import-not-approved Conclusion

当前结论：import not approved。

原因：

1. 012 只生成 freeze evidence 和 dry-run evidence。
2. `canExecuteRealImport=false`。
3. evidence 中仍有 blocker、defer、review 和 forbidden 项。
4. 未完成客户 sign-off。
5. 未设计真实 import loader、备份、回滚、幂等和对账。
6. 未允许写 DB、schema/API/UI/seedData/docs registry 或 `business_records` runtime。
