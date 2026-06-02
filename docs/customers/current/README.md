# current 客户资料

`current` 是当前甲方资料区，用于保存第一个真实客户 / 种子客户 / 私有化客户实例的需求线索、假设、问题、决策和配置草案。

`current` 不是 SaaS runtime tenant，不代表数据库多租户，不要求新增 `tenant_id`，也不是 Product Core 真源。

| 文件 | 作用 |
| --- | --- |
| `source-materials.md` | 记录当前客户样本资料类型和用途 |
| `requirement-clues.md` | 按业务域记录需求线索 |
| `raw-source-file-archive-review.md` | 记录 current 原始客户文件归档评审、用途分类和未来落点 |
| `assumption-register.md` | 记录尚不能开发成规则的假设 |
| `question-backlog.md` | 用业务人员能看懂的话列待确认问题 |
| `decision-log.md` | 只记录已经确认的决策 |
| `customer-config-draft.md` | 记录 current 未来可能的配置项 |
| `delta-register.md` | 记录客户差异项 |
| `change-request-process.md` | 记录后续需求分类和评审流程 |
| `import-source-inventory.md` | 记录 current 导入来源清单和用途分类 |
| `import-field-classification.md` | 记录 current 字段分类、可导入候选和禁止自动迁移项 |
| `import-dry-run-plan.md` | 记录 current 数据导入 dry-run 阶段设计 |
| `import-unresolved-queue.md` | 记录导入未决队列类型、阻断规则和处理方式 |
| `import-acceptance-checklist.md` | 记录 future import execution 前的验收清单 |
| `import-dry-run-tooling.md` | 记录 011 dry-run CLI 与 012 freeze evidence tooling 的用法和边界 |
| `source-snapshot-freeze.md` | 记录 012 source snapshot freeze metadata、checksum、风险统计和重跑方式 |
| `real-dry-run-evidence.md` | 记录 012 real dry-run evidence package 摘要和 no-real-import 结论 |
| `source-snapshot-manual-review-checklist.md` | 记录 freeze / dry-run evidence 的人工 review checklist 和 import-not-approved 结论 |

只有经过通用化评审的能力才能进入 Product Core。

当前导入草案和 012 evidence preparation 只做 dry-run / 字段分类 / unresolved queue / source freeze / evidence review，不代表真实导入、backfill、loader、DB 写入、seedData 改造、docs registry 改造、`business_records` runtime cutover 或运行时代码已经实现。
