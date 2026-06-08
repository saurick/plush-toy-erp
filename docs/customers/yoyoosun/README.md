# 永绅 yoyoosun 客户资料 / Yoyoosun Customer Materials

`yoyoosun` 是永绅客户的稳定客户 key，用于保存该客户专属原始资料、归档评审、后续配置草案和交付线索。

## 文件 / Files

| 路径 | 作用 |
| --- | --- |
| `source-materials.md` | 记录永绅 yoyoosun 样本资料类型和用途 |
| `requirement-clues.md` | 按业务域记录需求线索 |
| `assumption-register.md` | 记录尚不能开发成规则的假设 |
| `question-backlog.md` | 用业务人员能看懂的话列待确认问题 |
| `decision-log.md` | 只记录已经确认的决策 |
| `customer-config-draft.md` | 记录永绅 yoyoosun 未来可能的配置项 |
| `delta-register.md` | 记录客户差异项 |
| `change-request-process.md` | 记录后续需求分类和评审流程 |
| `import-source-inventory.md` | 记录永绅 yoyoosun 导入来源清单和用途分类 |
| `import-field-classification.md` | 记录永绅 yoyoosun 字段分类、可导入候选和禁止自动迁移项 |
| `import-dry-run-plan.md` | 记录永绅 yoyoosun 数据导入 dry-run 阶段设计 |
| `import-unresolved-queue.md` | 记录导入未决队列类型、阻断规则和处理方式 |
| `import-acceptance-checklist.md` | 记录 future import execution 前的验收清单 |
| `import-dry-run-tooling.md` | 记录 dry-run CLI 与 freeze evidence tooling 的用法和边界 |
| `source-snapshot-freeze.md` | 记录 source snapshot freeze metadata、checksum、风险统计和重跑方式 |
| `real-dry-run-evidence.md` | 记录 real dry-run evidence package 摘要和 no-real-import 结论 |
| `source-snapshot-manual-review-checklist.md` | 记录 freeze / dry-run evidence 的人工 review checklist 和 import-not-approved 结论 |
| `import-strategy.md` | 记录永绅 yoyoosun 导入策略和真实导入前置要求 |
| `import-risk-register.md` | 记录永绅 yoyoosun 导入风险登记 |
| `trial-training-note.md` | 记录永绅 yoyoosun 试用培训说明、正式入口和旧入口退出边界 |
| `trial-account-role-menu-checklist.md` | 记录永绅 yoyoosun 试用账号、角色、菜单和岗位任务端核对清单 |
| `trial-environment-runbook.md` | 记录永绅 yoyoosun 目标试用环境账号、RBAC、菜单和岗位任务端核对执行步骤 |
| `field-numbering-confirmation-checklist.md` | 记录永绅 yoyoosun 字段显示、字段必填和编号规则的客户确认清单 |
| `field-numbering-confirmation-result-template.md` | 记录永绅 yoyoosun 字段编号客户确认结果的回写模板和边界 |
| `raw-source-files/` | 保存永绅 yoyoosun 原始 Excel / PDF / PNG / JPG / JPEG，用于字段、模板、导入、页面和验收溯源 |
| `raw-source-file-archive-review.md` | 记录永绅 yoyoosun 原始客户文件归档评审、用途分类、checksum 和边界 |

## 边界 / Boundary

- 本目录资料只代表永绅 yoyoosun 客户材料，不自动成为 Product Core。
- 不代表 SaaS runtime tenant，不新增 `tenant_id`。
- 不代表真实 import / backfill 已批准。
- 不直接写 `business_records`，也不生成库存、出货、财务、委外或采购事实。
- 后续若多个客户进入项目，应继续按 `docs/customers/<customer-key>/` 隔离原始资料和客户差异。
