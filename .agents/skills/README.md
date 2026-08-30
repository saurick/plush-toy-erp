# Codex 项目 Skills / Project Skills

本目录只保存 plush-toy-erp 的专项 SOP。长期规则在 `AGENTS.md`，项目事实在正式 docs、代码、migration 和测试；通用工作流使用 `~/.codex/skills`，不在项目版重复。

当前 10 个 Skill 是按需加载的专项工具，不是 10 个开发阶段，也不要求逐个执行或由甲方确认。普通任务只选择一个最贴近目标的 Skill；只有真实跨领域时才组合。

| Skill                                     | 适用范围                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `$plush-capability-evidence-audit`        | 只读审计“做到哪、还缺什么、能否发布/交付”，分开代码、本地 QA、运行态、目标发布、恢复和客户验收                     |
| `$plush-code-review-governance`           | review diff/commit/worktree；按触达面路由到领域、页面、打印和测试检查                                              |
| `$plush-docs-governance`                  | 当前真源、文档清单、中文文件名、读者路径和 `progress.md`                                                           |
| `$plush-domain-boundary-governance`       | Workflow / Fact、Product Core、客户差异、schema/migration 设计与生成、usecase/API/RBAC 和字段真源                  |
| `$plush-page-design-governance`           | 普通 ERP 页面业务语义、字段/动作/状态、原型和浏览器回归                                                            |
| `$plush-print-template-source-governance` | 客户 Excel/PDF/图片源、纸张版式、字段映射、模板编辑与 PDF/打印保真                                                 |
| `$plush-seed-import-governance`           | seed、fixture、模拟数据、import dry-run、批次与数据 cleanup 边界                                                   |
| `$plush-manual-acceptance-governance`     | 人工验收目录/批次、岗位账号/任务、浏览器/PDF 与人工证据、签收和退出清理                                            |
| `$plush-test-governance`                  | 按影响面选择文档、领域/API、页面、真实数据库或发布验证，并治理网页 GPT 的 review-only 快照；T0-T8 只作工作台追踪键 |
| `$plush-operations-governance`            | runtime 诊断、可观测/错误、安全/隐私、发布、迁移和回滚                                                             |

## 选择规则

- 简单任务只选一个最贴近主目标的 skill；跨边界时再补相邻 skill。
- schema / migration 的设计、生成和领域合同使用 Domain；目标库 apply、运行态迁移、发布与回滚使用 Operations。
- 普通页面和原型使用 Page；客户源文件、纸张版式或 PDF/打印保真是主目标时使用 Print。
- seed / fixture / dry-run / cleanup 的数据构造使用 Seed；验收目录、readiness、浏览器/PDF、人工结论和签收编排使用 Manual Acceptance。
- Manual Acceptance 只编排验收与证据；目标访问、migration、release、rollback 的真实执行仍由 Operations 负责。
- 提示词整理使用全局显式 `$prompt-governance`。所有任务按 `AGENTS.md` 只产出一份被动 `Git handoff record`；只有用户明确要求 commit / push 且实时现场复杂时，才使用全局 `$git-closeout-coordination`。
- 项目 skill 不重复高内聚、低耦合等通用常识，只保留项目真源、判断流程、命令和验收。
- 修改 skill 后同步 `agents/openai.yaml`，运行 validator、YAML/metadata 扫描、引用扫描和 `git diff --check`；只有命中项目过程记录条件时才更新 `progress.md`。
