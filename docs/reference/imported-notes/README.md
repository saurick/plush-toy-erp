# Imported Design Notes

本目录保存外部设计输入，只作为 0 到 1 架构整理的参考资料。

这些文件不是当前实现真源：

| 范围 | 当前正式真源 |
| --- | --- |
| 产品架构和边界 | `docs/product/*`、`docs/architecture/*` |
| 运行时行为 | 当前代码和测试 |
| 数据库结构 | Ent schema、Atlas migration、数据库验收 |
| 当前项目状态 | `docs/current-source-of-truth.md`、正式架构文档、代码和测试 |

使用约束：

1. 不直接按 imported note 生成 schema、migration 或 runtime 代码。
2. 不把 imported note 中的示例字段、示例状态或示例流程当作当前能力。
3. 若 imported note 与当前代码、测试或正式文档冲突，优先以当前代码、测试和正式文档为准。
4. imported note 中出现的多租户或 `tenant_id` 示例，只能作为未来 SaaS 评审素材，不能进入当前 schema 方案。
