Doc Type / 文档类型: Yoyoosun Raw Source File Archive Review / 永绅 yoyoosun 原始客户文件归档评审
Status / 状态: Active Review / 当前评审
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 永绅 yoyoosun 原始客户文件归档评审 / Yoyoosun Raw Source File Archive Review

本文件评审本地永绅 yoyoosun 客户原始文件的用途、边界和仓库归档落点。

## 结论 / Decision

- 原始 Excel / PDF / PNG / JPG / JPEG 本轮纳入项目，归档到 `docs/customers/yoyoosun/raw-source-files/`，方便后续功能、字段和模板溯源。Excel / PDF 仍保留来源文件名；微信图片已按 `yoyoosun-<content>-<date>` 语义命名，原 hash 用于追溯来源版本。
- `/Users/simon/Downloads/永绅erp/原文件/` 和 `/Users/simon/Desktop/永绅erp相关文件/原文件/` 只作为本次复制来源，不再作为唯一可追溯位置。
- 仓库内保存原件、归档评审、用途分类和后续处理规则；原件仍只是永绅 yoyoosun 客户材料，不升级为 Product Core 或 runtime 真源。
- 若后续需要进入导入 dry-run，应先从原件生成脱敏、结构化、可审查的 snapshot fixture，落到 `scripts/import/fixtures/customers/yoyoosun/*`。
- 若后续需要进入客户配置，应先沉淀为配置草案，落到 `config/customers/yoyoosun/*`，且不创建 runtime loader。
- 若后续需要进入部署 / 培训 / 交付资料，应先沉淀为交付文档或清单，建议落到 `deployments/yoyoosun/*`；现有 `deployments/yoyoosun/*` 只保留 active-deployment 草案口径。
- 当前仓库未启用 Git LFS，本批约 25.4MB 原件直接纳入 Git；后续若继续批量增加原始二进制文件，应另评审 Git LFS、对象存储、脱敏样本或只提交结构化 fixture。

本轮不做：

- 不压缩、不改写原始文件内容；微信图片只做语义化文件名重命名。
- 不把原始 Excel / PDF / PNG 接入运行时代码或 docs registry。
- 不写 DB，不做真实 import / backfill。
- 不改 schema、migration、runtime、API、UI、seedData、docs registry 或 `business_records` cutover。
- 不把永绅 yoyoosun 客户文件升级成 Product Core、行业模板真源、库存事实、出货事实、财务事实或 SaaS tenant 资料。

## Source Roots / 来源与归档目录

```text
source:
- /Users/simon/Downloads/永绅erp/原文件/
- /Users/simon/Desktop/永绅erp相关文件/原文件/
archive: docs/customers/yoyoosun/raw-source-files/
```

## File Inventory / 文件清单

| 文件 | 类型 | 大小 bytes | 用途分类 | 当前仓库处理 |
| --- | --- | ---: | --- | --- |
| `raw-source-files/辅材、包材 成慧怡.xlsx` | Excel | 2406323 | Customer Material / Data Import Source / Industry Template Candidate | 归档原件；作为辅材 / 包材采购来源；不自动生成采购订单、采购入库、库存或应付事实 |
| `raw-source-files/加工 成慧怡.xlsx` | Excel | 120942 | Customer Material / Data Import Source / Print Template Input | 归档原件；作为委外加工汇总和加工厂 / 联系人候选来源；不自动写委外、应付或付款事实 |
| `raw-source-files/26029#夜樱烬色才料明细表2026-1-19.xlsx` | Excel | 13317122 | Customer Material / Data Import Source / Industry Template Candidate | 归档原件；作为材料 / BOM / 产品 / 单位候选来源；不写库存事实 |
| `raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` | Excel | 6832207 | Customer Material / Data Import Source / Industry Template Candidate | 归档原件；作为材料 / BOM / 产品 / 单位候选来源；不写库存事实 |
| `raw-source-files/模板-材料与加工合同.xlsx` | Excel | 688470 | Print Template Input / Customer Material / Field Clue | 归档原件；作为采购合同、加工合同和字段映射样本；不作为运行时 Excel 母版，不抽成 Product Core 模板 |
| `raw-source-files/9.3加工合同-子淳.pdf` | PDF | 424728 | Print Template Input / Customer Material / Data Import Source | 归档原件；作为加工合同纸面、条款、合同行和附件快照样本；不自动生成委外、应付、付款或库存事实 |
| `raw-source-files/plush_factory_formal_report_v3_mobile.pdf` | PDF | 1476358 | Customer Material / Delivery Input / QA Debug | 归档原件；作为客户汇报、移动端观感和交付线索；不作为产品实现真源 |
| `raw-source-files/yoyoosun-report-mobile-screenshot-20260420.png` | PNG | 80528 | Customer Material / QA Debug / Field Clue | 归档原件；作为截图线索；不能作为唯一字段、流程或事实真源 |
| `raw-source-files/yoyoosun-role-workflow-v3-20260413.png` | PNG | 522183 | Customer Material / Workflow Clue / Field Clue | 归档原件；作为永绅岗位职责流程、岗位节点和 Workflow / Fact 边界线索；不自动升级为 Product Core 流程真源 |
| `raw-source-files/yoyoosun-purchase-contract-order-photo-20260421.jpeg` | JPEG | 392476 | Customer Material / Print Template Input / Field Clue | 归档原件；作为合同订单字段、条款和纸面样式线索；与 `source-copy` `.jpg` 是同一张照片的另一份源文件，不重复计为独立业务单据 |
| `raw-source-files/yoyoosun-purchase-contract-order-photo-20260421-source-copy.jpg` | JPEG | 473184 | Customer Material / Print Template Input / Field Clue | 归档原件；作为合同订单字段、条款和纸面样式线索；与同名主 `.jpeg` 是同一张照片的另一份源文件，不重复计为独立业务单据 |

## Checksums / 校验和

这些 hash 用于确认仓库归档原件与本地来源文件版本一致，不代表真实导入已批准。

```text
c02dc3da0c2e1e788623bc24034c9a7ed5072e54126d626fd4e50d0537b6fdee  辅材、包材 成慧怡.xlsx
e43e2f664060e872f7c0448079abc8ec830913fb2ad8735bda3c7649a0da0cb5  加工 成慧怡.xlsx
9a31e9eb87f64548486e5281212b56f0381cc441103738570d4c7f074e56804a  26029#夜樱烬色才料明细表2026-1-19.xlsx
ea20c33390cab8e7cd36e0af05b5f9ec4fe75bdd7db607721663c5af7adf82a2  26204#抱抱猴子材料明细表2026-4-10.xlsx
9b2192307f3d194283babfcfd1ce4be1e1f1b01660d28666d6650b63e4e9491f  模板-材料与加工合同.xlsx
053b37a0b493b36a3dcbfee1698cc8fb5380be2c47a20c68e073456953ae4ad1  9.3加工合同-子淳.pdf
d1738c4c6af776a0171c86f1435cbb4d0d4103d9ebb3b54034d99b30c8f793f6  plush_factory_formal_report_v3_mobile.pdf
fb7b1dfae4acbe05ddab89d21273a92f5284644543d9fef214fbbf4e661351a5  yoyoosun-report-mobile-screenshot-20260420.png
54ec502d21eac86ad27882e8b0dc2b312cfb5d2b285fb6abd6592a1c29f1d9d6  yoyoosun-role-workflow-v3-20260413.png
94478778f6b0c71825c624a346da2d579b1b625b208e07ee4f0a502e6d45d1eb  yoyoosun-purchase-contract-order-photo-20260421.jpeg
244249fb3ba5b5a0575f31714c80adb280c6314ed80adf75289c4376670c7dd8  yoyoosun-purchase-contract-order-photo-20260421-source-copy.jpg
```

## Placement Rules / 落点规则

| 后续用途 | 允许落点 | 禁止事项 |
| --- | --- | --- |
| 原始资料用途登记和原件归档 | `docs/customers/yoyoosun/raw-source-files/*`、`docs/customers/yoyoosun/raw-source-file-archive-review.md` 和 `docs/customers/yoyoosun/source-materials.md` | 不接 runtime，不进 docs registry，不当 Product Core |
| 字段分类、导入候选、unresolved queue | `docs/customers/yoyoosun/import-*.md` | 不把客户样本字段直接升级成 Product Core 必填字段 |
| 脱敏 dry-run fixture | `scripts/import/fixtures/customers/yoyoosun/*` | 不连接 DB，不写正式表，不写 `business_records` |
| 本地 freeze / dry-run evidence | `output/customers/yoyoosun/source-snapshot-freeze/*`、`output/customers/yoyoosun/real-dry-run-evidence/*` | `output/` 不纳入 git，不代表 import approval |
| 客户配置草案 | `config/customers/yoyoosun/*` | 不新增 tenant_id，不创建 runtime loader |
| 客户部署 / 交付资料草案 | `deployments/yoyoosun/*` | 不改变当前部署真源 `server/deploy/compose/prod` |
| 产品通用能力评审 | `docs/product/*` 或 `docs/architecture/*` | 未经评审不得写入核心 usecase、schema、RBAC、API 或 UI |

## Manual Review Checklist / 人工复查清单

后续若要新增原件、生成 fixture 或从原件推进功能，至少先确认：

1. 文件是否包含客户名、供应商、联系人、电话、地址、价格、结算条款、图片或其他敏感信息。
2. 是否需要脱敏、裁剪、抽样或只保留结构化字段。
3. Excel 列是否已进入 `import-field-classification.md` 和 unresolved queue。
4. PDF / 图片是否只是打印样式或截图线索，还是需要形成正式模板 / 页面需求。
5. 是否会误把合同金额、生产数量、未出货数、采购数量或截图状态写成库存、出货、财务事实。
6. 是否需要更新 `docs/document-inventory.md`、帮助中心入口、测试断言或 docs registry。
7. 是否有客户确认、备份、回滚和导入幂等方案。

## Boundary Audit / 边界审计

- Product Core：否。这些文件只能作为永绅 yoyoosun 客户材料、导入来源、模板输入、QA Debug 或行业模板候选。
- SaaS tenant：否。`yoyoosun` 是客户 key，不是 runtime tenant。
- business_records：否。原件不能直接写入 `business_records`，也不能把 `business_records` 当长期事实真源。
- Shipment fact：否。生产订单截图、未出货数或出货日期线索不等于 `shipped`。
- Inventory fact：否。材料表、采购表和合同明细不自动生成 `inventory_txns` 或 `inventory_balances`。
- Finance fact：否。单价、金额、结算条款和合同 PDF 不自动生成应付、付款、发票或对账事实。
