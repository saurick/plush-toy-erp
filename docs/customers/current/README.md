# current 客户资料

`current` 是当前甲方资料区，用于保存第一个真实客户 / 种子客户 / 私有化客户实例的需求线索、假设、问题、决策和配置草案。

`current` 不是 SaaS runtime tenant，不代表数据库多租户，不要求新增 `tenant_id`，也不是 Product Core 真源。

| 文件 | 作用 |
| --- | --- |
| `source-materials.md` | 记录当前客户样本资料类型和用途 |
| `requirement-clues.md` | 按业务域记录需求线索 |
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

只有经过通用化评审的能力才能进入 Product Core。

当前导入草案只做 dry-run / 字段分类 / unresolved queue 设计，不代表真实导入、backfill、seedData 改造、docs registry 改造或运行时代码已经实现。
