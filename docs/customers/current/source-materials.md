# 来源材料 / Source Materials

本文件只记录 current 客户资料用途，不把资料直接升级为通用产品真源。

| 资料类型 | 用途分类 | 说明 |
| --- | --- | --- |
| Excel | Customer Material / Demo Seed / Industry Template Candidate | 可作为字段、导入、seed 和行业模板候选；需评审后再沉淀 |
| PDF | Customer Material / Print Template Input | 可作为合同、报表或交付样式输入；不直接决定 schema，也不直接抽成产品模板 |
| 图片 / 截图 | Customer Material / QA Debug | 可帮助识别页面、字段和流程线索；不作为唯一真源 |
| seed / demo 数据 | Demo Seed / QA Debug | 只用于开发验收和演示，不替代真实业务事实 |
| print template | Print Template Input | 只作客户打印样本和字段来源记录；默认 Deferred，待多客户重复后再评审是否模板化 |
| business_records 快照 | Source Snapshot / Data Import Source / Demo Seed | 可作为 dry-run 来源和历史快照，不是长期事实真源 |
| V1 正式页面当前数据 | Data Import Target Preview | 只作为 future import preview 的目标模型参照；010 不写数据库 |

使用规则：

1. 资料先归档用途，再决定是否进入 Product Core、Industry Template、Customer Config 或 Customer Extension。
2. 当前客户特殊字段、特殊流程和特殊报表不能直接进入核心 usecase。
3. 涉及库存、出货、财务事实的资料必须进入架构评审。
4. current 数据导入必须先 dry-run、字段分类、unresolved queue 和人工确认；010 不执行真实导入。

## 原始文件归档口径 / Raw Source File Archive

`/Users/simon/Downloads/永绅erp/原文件/` 下的 current 原始 Excel / PDF / PNG 本轮不移动进仓库，也不作为 Product Core、runtime、schema、migration、API、UI、seedData、docs registry 或真实导入批准。

具体文件清单、checksum、用途分类和后续允许落点见 `raw-source-file-archive-review.md`。
