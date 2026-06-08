# 永绅 yoyoosun 原始客户文件 / Yoyoosun Raw Source Files

本目录保存永绅 yoyoosun 客户原始 Excel / PDF / PNG / JPG / JPEG，用于后续字段、模板、导入、页面和验收工作的溯源。

## 使用边界 / Usage Boundary

- 这些文件是 Customer Material / Data Import Source / Print Template Input / QA Debug。
- 这些文件不是 Product Core 真源，不代表通用行业规则已经成立。
- 这些文件不是 SaaS runtime tenant 资料，不新增 `tenant_id`。
- 这些文件不代表真实 import / backfill 已批准。
- 这些文件不直接写 `business_records`，也不生成库存、出货、财务或委外事实。
- 后续功能实现必须先回到 `docs/current-source-of-truth.md`、正式产品 / 架构文档、代码和测试交叉确认。

## 文件清单 / File Inventory

| 文件 | 用途 |
| --- | --- |
| `辅材、包材 成慧怡.xlsx` | 辅材 / 包材采购来源、供应商 / 材料 / 单位候选 |
| `加工 成慧怡.xlsx` | 委外加工汇总、加工厂 / 联系人 / 合同字段候选 |
| `26029#夜樱烬色才料明细表2026-1-19.xlsx` | 材料、BOM、产品、单位候选来源 |
| `26204#抱抱猴子材料明细表2026-4-10.xlsx` | 材料、BOM、产品、单位候选来源 |
| `模板-材料与加工合同.xlsx` | 采购合同、加工合同和字段映射样本 |
| `9.3加工合同-子淳.pdf` | 加工合同纸面、条款、合同行和附件快照样本 |
| `plush_factory_formal_report_v3_mobile.pdf` | 客户汇报、移动端观感和交付线索 |
| `yoyoosun-report-mobile-screenshot-20260420.png` | 截图线索和字段 / 页面核对材料 |
| `yoyoosun-role-workflow-v3-20260413.png` | 永绅岗位职责流程图截图，作为 Workflow / Fact 边界、岗位节点和后续需求确认线索 |
| `yoyoosun-purchase-contract-order-photo-20260421.jpeg` | 合同订单照片，作为采购合同 / 订单字段、条款和纸面样式线索；与 `source-copy` `.jpg` 为同一张照片的另一份源文件 |
| `yoyoosun-purchase-contract-order-photo-20260421-source-copy.jpg` | 合同订单照片，作为采购合同 / 订单字段、条款和纸面样式线索；与主 `.jpeg` 为同一张照片的另一份源文件 |

更完整的用途分类、checksum、禁止事项和后续落点见 `../raw-source-file-archive-review.md`。

## 后续新增规则 / Future File Rule

后续新增原始客户文件时，先确认敏感信息、文件大小和用途分类；如果只是导入 dry-run，应优先生成脱敏结构化 fixture，而不是无限制堆放原件。当前仓库未启用 Git LFS，本批约 25.4MB 原件直接纳入 Git；若后续批量增长，应单独评审 Git LFS、对象存储或只提交脱敏样本。

本目录已通过仓库根 `.gitattributes` 标记为 binary，避免 Git 将 Excel / PDF / PNG / JPG / JPEG 原件当作文本做 whitespace 检查或展示正文 diff；不要为通过检查而改写原件内容。
