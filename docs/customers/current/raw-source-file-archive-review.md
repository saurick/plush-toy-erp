Doc Type / 文档类型: Current Raw Source File Archive Review / current 原始客户文件归档评审
Status / 状态: Active Review / 当前评审
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# current 原始客户文件归档评审 / Current Raw Source File Archive Review

本文件只评审 `/Users/simon/Downloads/永绅erp/原文件/` 下这批 current 客户原始文件的用途、边界和未来仓库落点。

## 结论 / Decision

- 原始 Excel / PDF / PNG 本轮继续保留在仓库外的本地资料目录：`/Users/simon/Downloads/永绅erp/原文件/`。
- 仓库内本轮只保存归档评审、用途分类和后续处理规则，不复制原件、不新增二进制资料目录。
- 若后续需要进入导入 dry-run，应先从原件生成脱敏、结构化、可审查的 snapshot fixture，落到 `scripts/import/fixtures/current/*`。
- 若后续需要进入客户配置，应先沉淀为配置草案，落到 `config/customers/current/*`，且不创建 runtime loader。
- 若后续需要进入部署 / 培训 / 交付资料，应先沉淀为交付文档或清单，落到 `deployments/current/*`。
- 若后续确实要把原始二进制文件纳入仓库，必须另开归档迁移任务，先评审敏感信息、文件大小、引用关系、docs registry、测试断言、Git 历史体积和回滚风险。

本轮不做：

- 不移动、复制、改名或压缩原始文件。
- 不提交原始 Excel / PDF / PNG。
- 不写 DB，不做真实 import / backfill。
- 不改 schema、migration、runtime、API、UI、seedData、docs registry 或 `business_records` cutover。
- 不把 current 客户文件升级成 Product Core、行业模板真源、库存事实、出货事实、财务事实或 SaaS tenant 资料。

## Source Root / 来源根目录

```text
/Users/simon/Downloads/永绅erp/原文件/
```

## File Inventory / 文件清单

| 文件 | 类型 | 大小 bytes | 用途分类 | 当前仓库处理 |
| --- | --- | ---: | --- | --- |
| `辅材、包材 成慧怡.xlsx` | Excel | 2406323 | Customer Material / Data Import Source / Industry Template Candidate | 仅登记为辅材 / 包材采购来源；不自动生成采购订单、采购入库、库存或应付事实 |
| `加工 成慧怡.xlsx` | Excel | 120942 | Customer Material / Data Import Source / Print Template Input | 仅登记为委外加工汇总和加工厂 / 联系人候选来源；不自动写委外、应付或付款事实 |
| `26029#夜樱烬色才料明细表2026-1-19.xlsx` | Excel | 13317122 | Customer Material / Data Import Source / Industry Template Candidate | 仅登记为材料 / BOM / 产品 / 单位候选来源；不写库存事实 |
| `26204#抱抱猴子材料明细表2026-4-10.xlsx` | Excel | 6832207 | Customer Material / Data Import Source / Industry Template Candidate | 仅登记为材料 / BOM / 产品 / 单位候选来源；不写库存事实 |
| `模板-材料与加工合同.xlsx` | Excel | 688470 | Print Template Input / Customer Material / Field Clue | 仅作为采购合同、加工合同和字段映射样本；不作为运行时 Excel 母版，不抽成 Product Core 模板 |
| `9.3加工合同-子淳.pdf` | PDF | 424728 | Print Template Input / Customer Material / Data Import Source | 仅作为加工合同纸面、条款、合同行和附件快照样本；不自动生成委外、应付、付款或库存事实 |
| `plush_factory_formal_report_v3_mobile.pdf` | PDF | 1476358 | Customer Material / Delivery Input / QA Debug | 仅作为客户汇报、移动端观感和交付线索；不作为产品实现真源 |
| `Weixin Image_20260420164444_2155_288.png` | PNG | 80528 | Customer Material / QA Debug / Field Clue | 仅作为截图线索；不能作为唯一字段、流程或事实真源 |

## Checksums / 校验和

这些 hash 只用于确认本地来源文件版本，不代表文件已进入仓库。

```text
c02dc3da0c2e1e788623bc24034c9a7ed5072e54126d626fd4e50d0537b6fdee  辅材、包材 成慧怡.xlsx
e43e2f664060e872f7c0448079abc8ec830913fb2ad8735bda3c7649a0da0cb5  加工 成慧怡.xlsx
9a31e9eb87f64548486e5281212b56f0381cc441103738570d4c7f074e56804a  26029#夜樱烬色才料明细表2026-1-19.xlsx
ea20c33390cab8e7cd36e0af05b5f9ec4fe75bdd7db607721663c5af7adf82a2  26204#抱抱猴子材料明细表2026-4-10.xlsx
9b2192307f3d194283babfcfd1ce4be1e1f1b01660d28666d6650b63e4e9491f  模板-材料与加工合同.xlsx
053b37a0b493b36a3dcbfee1698cc8fb5380be2c47a20c68e073456953ae4ad1  9.3加工合同-子淳.pdf
d1738c4c6af776a0171c86f1435cbb4d0d4103d9ebb3b54034d99b30c8f793f6  plush_factory_formal_report_v3_mobile.pdf
fb7b1dfae4acbe05ddab89d21273a92f5284644543d9fef214fbbf4e661351a5  Weixin Image_20260420164444_2155_288.png
```

## Placement Rules / 落点规则

| 后续用途 | 允许落点 | 禁止事项 |
| --- | --- | --- |
| 原始资料用途登记 | `docs/customers/current/source-materials.md` 和本文 | 不提交二进制原件 |
| 字段分类、导入候选、unresolved queue | `docs/customers/current/import-*.md` | 不把客户样本字段直接升级成 Product Core 必填字段 |
| 脱敏 dry-run fixture | `scripts/import/fixtures/current/*` | 不连接 DB，不写正式表，不写 `business_records` |
| 本地 freeze / dry-run evidence | `output/current-source-snapshot-freeze/*`、`output/current-real-dry-run-evidence/*` | `output/` 不纳入 git，不代表 import approval |
| 客户配置草案 | `config/customers/current/*` | 不新增 tenant_id，不创建 runtime loader |
| 客户部署 / 交付资料草案 | `deployments/current/*` | 不改变当前部署真源 `server/deploy/compose/prod` |
| 产品通用能力评审 | `docs/product/*` 或 `docs/architecture/*` | 未经评审不得写入核心 usecase、schema、RBAC、API 或 UI |

## Manual Review Checklist / 人工复查清单

后续若要迁移原件或生成 fixture，至少先确认：

1. 文件是否包含客户名、供应商、联系人、电话、地址、价格、结算条款、图片或其他敏感信息。
2. 是否需要脱敏、裁剪、抽样或只保留结构化字段。
3. Excel 列是否已进入 `import-field-classification.md` 和 unresolved queue。
4. PDF / 图片是否只是打印样式或截图线索，还是需要形成正式模板 / 页面需求。
5. 是否会误把合同金额、生产数量、未出货数、采购数量或截图状态写成库存、出货、财务事实。
6. 是否需要更新 `docs/document-inventory.md`、帮助中心入口、测试断言或 docs registry。
7. 是否有客户确认、备份、回滚和导入幂等方案。

## Boundary Audit / 边界审计

- Product Core：否。这些文件只能作为 current 客户材料、导入来源、模板输入、QA Debug 或行业模板候选。
- SaaS tenant：否。`current` 是第一个真实客户 / 私有化客户实例，不是 runtime tenant。
- business_records：否。原件不能直接写入 `business_records`，也不能把 `business_records` 当长期事实真源。
- Shipment fact：否。生产订单截图、未出货数或出货日期线索不等于 `shipped`。
- Inventory fact：否。材料表、采购表和合同明细不自动生成 `inventory_txns` 或 `inventory_balances`。
- Finance fact：否。单价、金额、结算条款和合同 PDF 不自动生成应付、付款、发票或对账事实。
