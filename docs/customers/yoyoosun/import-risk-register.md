Doc Type / 文档类型: Yoyoosun Customer Import Risk Register / 永绅 yoyoosun 客户导入风险登记
Status / 状态: Draft + Dry-run / Freeze Controls Added / 草案，已补 dry-run / freeze 控制
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 永绅 yoyoosun 客户导入风险登记 / Yoyoosun Customer Import Risk Register

本风险登记覆盖 永绅 yoyoosun 客户导入 dry-run 设计、CLI tooling 控制和 freeze / evidence preparation 控制。这些控制只存在于 tooling evidence 和报告层，不是 runtime 防护，也不代表任何真实导入已经实施。

## 工具控制 / Tooling Controls

| control | output | coverage | limitation |
|---|---|---|---|
| source snapshot freeze metadata | `freeze-metadata.json` | 记录 freezeId、freezeDate、source/existing SHA256、source count、domain/source type counts、`noRealImport=true`、`canExecuteRealImport=false` | 只证明 snapshot evidence 已生成，不批准导入 |
| freeze check summary | `freeze-check-summary.json` | 记录 duplicate sourceId、invalid domain、invalid fields、missing source reference、sensitive / forbidden / deferred / boundary 风险 | 只做 evidence preparation，不自动修复 source |
| freeze check report | `freeze-check-report.md` | 可读化 checksum、blockers、warnings、sensitive review、forbidden review、deferred review 和 no-real-import statement | 不替代人工 review 或客户 sign-off |
| forbidden-auto-import report | `forbidden-auto-import.json` | 阻断 shipment、inventory、finance、`shipping_released -> shipped`、workflow done -> fact posted 等自动导入风险 | 只在 dry-run package 中呈现，不拦截 runtime 写入 |
| unresolved queue | `unresolved-queue.json` | 记录 block / defer / review / warning，要求人工确认缺 owner、缺 customer、未知 unit、invalid value 等问题 | 不会自动修复数据 |
| duplicates / conflicts | `duplicates.json`、`conflicts.json` | 暴露 code/name 重复和更新冲突，避免自动合并同名主体 | 需要人工决策 |
| validation summary | `validation-summary.json` | 统计 candidate、unresolved、forbidden、duplicate、conflict；`canExecuteRealImport` 永远为 `false` | 不是导入批准单 |
| Markdown report | `dry-run-report.md` | 给人工 review 提供可读摘要和 No real import 声明 | 不替代客户 sign-off、备份、回滚和真实 loader 审查 |

| risk | impact | evidence | mitigation | owner layer | next review needed |
|---|---|---|---|---|---:|
| 永绅 yoyoosun 客户字段污染 Product Core | 客户专属字段变成通用必填字段，后续产品化失败 | `docs/customers/yoyoosun/*` 明确 yoyoosun 不是 Product Core 真源 | 字段先分类；yoyoosun-only 字段默认 Customer Material / Customer Config / Print Template Input | Productization | 是 |
| Excel 字段语义不清 | 错误映射客户、供应商、产品、材料、订单或金额 | 009 data map 和 yoyoosun docs 均要求人工确认 | dry-run 输出 unmapped fields 和 unresolved queue | Data Import | 是 |
| 同名客户 / 供应商 / 产品重复 | 合并错主体或创建重复主数据 | 删除前 JSONL evidence、客户原始资料和 V1 模型可能存在同名主体 | duplicate code/name queue；人工确认后才导入 | MasterData | 是 |
| 产品与 `product_skus` 混淆 | 把颜色、尺寸、包装版本误写入 product core 或自动建 SKU | `product_skus` 在 V1 cutline 中为 Draft Only | SKU 类字段 deferred，不自动创建 | Product / Sales | 是 |
| 订单样本误当 `sales_orders` 正式数据 | 旧 project-orders 状态或样本订单污染正式 Source Document | 009 说明 project-orders 只能作 source snapshot | 只生成 dry-run preview；customer/product/unit 唯一匹配后才候选 | Sales / Data | 是 |
| 业务快照误当事实 | 从删除前 evidence 或旧样本生成库存、出货或财务记录 | 旧 `business_records` 表族已删除，evidence 不是事实真源 | forbidden auto-import list 强制 block | Architecture / Data | 是 |
| 旧 `business_records` 被恢复成双真源 | 同一客户、供应商或订单两边可写导致准绳不清 | 旧表族已删除；当前只允许 V1 / 领域 usecase 写入 | 禁止恢复旧表；future archive task 单独处理 | Product / UI / API | 是 |
| seedData 被误当正式数据 | demo seed 污染客户正式资料 | seedData 是 Demo Seed / QA Debug | dry-run 排除 demo/debug 或单独标记 | QA / Data Import | 是 |
| 自动生成出货 / 库存 / 财务事实 | 造成 shipped、库存余额、应收应付错误 | `shipping_released != shipped`，finance facts deferred | shipment/inventory/finance 全部 Forbidden Auto Import | Workflow / Fact | 是 |
| migration / import 无回滚 | 导入错误后无法恢复 | 当前 dry-run draft 不实现真实导入或 loader | future Stage 6 必须先有备份、rollback、forward-fix 和对账 | Ops / Data | 是 |
| 导入后客户不认可 | 正式数据与客户理解不一致，返工成本高 | 永绅 yoyoosun 样本字段和业务口径仍多处待确认 | Stage 5 需要 customer sign-off | Delivery / Product | 是 |
| 未确认字段被自动丢弃 | 后续追溯困难，客户认为资料缺失 | Excel/PDF 存在未知列和专属字段 | unmapped fields 进入 unresolved，不静默丢弃 | Data Import | 是 |
| 未确认字段被错误写入 note | note 变成隐藏垃圾桶，后续无法结构化 | 009 要求字段先分类，不要用 note 掩盖未确认 | note 写入必须有人工决策和 source reference | Product / Data | 是 |
| 时间格式错误 | 订单日期、交期或出货日期错写 | 来源可能包含中文日期、Excel serial 或文本日期 | invalid date queue；不确定时 block 订单候选 | Data Import | 是 |
| 数量格式错误 | 订单数量、BOM 用量或采购数量错写 | 来源可能含公式、文本、负数或单位混写 | invalid quantity queue；decimal 校验和 unit 匹配 | Data Import | 是 |
| 金额格式错误 | 单价、金额、税额或币种误写 | 合同和 Excel 金额可能含公式或税率语义 | invalid money queue；不生成 finance facts | Finance / Data | 是 |
| 单位映射错误 | 数量语义错误，影响订单、BOM、采购候选 | 单位文本可能是只、件、套、PCS 等 | unknown unit queue；人工映射 existing units | MasterData / Data | 是 |
| 仓库映射错误 | 仓库、库位、地点混淆 | 仓库字段可能是成品仓、A区、货位或备注 | unknown warehouse queue；库存事实一律 block | Warehouse / Data | 是 |

## 主要风险 / Top Risks

| priority | risk | current control |
|---:|---|---|
| P0 | 从旧快照自动生成 shipment / inventory / finance facts | Forbidden Auto Import + block queue |
| P0 | 永绅 yoyoosun 字段污染 Product Core | field classification + Product layer strategy |
| P0 | 旧 `business_records` 被恢复成双真源 | 旧表族已删除；dry-run 不允许恢复 runtime |
| P0 | dry-run 报告被误当真实导入批准 | `validation-summary.canExecuteRealImport=false` + `dry-run-report.md` No real import |
| P0 | freeze evidence 被误当真实导入批准 | `freeze-metadata.canExecuteRealImport=false` + `source-snapshot-manual-review-checklist.md` import-not-approved conclusion |
| P1 | SKU / purchase order 过早落地 | deferred domain policy |
| P1 | 未确认字段丢失或塞 note | unresolved queue + manual review |

## 必要下一步评审 / Required Next Review

真实导入前至少需要：

- yoyoosun source artifact inventory review。
- dry-run preview review。
- unresolved queue review。
- customer sign-off。
- import loader design review。
- backup / rollback / validation review。
- customer sign-off based on reviewed freeze evidence and dry-run evidence。
