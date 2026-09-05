# Codex 项目 Skills / Project Skills

本目录只保存 plush-toy-erp 的专项 SOP。长期规则在 `AGENTS.md`，项目事实在正式 docs、代码、migration 和测试；通用工作流使用 `~/.codex/skills`，不在项目版重复。

当前 10 个 Skill 按需选择分支，不要求逐个执行或由甲方确认。优先一个主 Skill，真实跨领域才组合；切换 Skill 后继续同一目标的已授权工作。

| Skill                                     | 适用范围                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `$plush-capability-evidence-audit`        | 只读审计“做到哪、还缺什么、能否发布/交付”，分开代码、本地 QA、运行态、目标发布、恢复和客户验收                                         |
| `$plush-code-review-governance`           | review diff/commit/worktree；按触达面路由到领域、页面、打印和测试检查                                                                  |
| `$plush-docs-governance`                  | 当前真源、文档清单、中文文件名、读者路径和 `progress.md`                                                                               |
| `$plush-domain-boundary-governance`       | Workflow / Fact、Product Core、客户差异、schema/migration 设计与生成、usecase/API/RBAC 和字段真源                                      |
| `$plush-page-design-governance`           | 普通 ERP 页面业务语义、字段/动作/状态、原型和浏览器回归                                                                                |
| `$plush-print-template-source-governance` | 客户 Excel/PDF/图片源、纸张版式、字段映射、模板编辑与 PDF/打印保真                                                                     |
| `$plush-seed-import-governance`           | seed、fixture、模拟数据、import dry-run、批次与数据 cleanup 边界                                                                       |
| `$plush-manual-acceptance-governance`     | 人工验收目录/批次、岗位账号/任务、浏览器/PDF 与人工证据、签收和退出清理                                                                |
| `$plush-test-governance`                  | 按影响面选择文档、领域/API、页面、真实数据库或发布验证，并区分 GitLab exact-SHA CI、GitHub 镜像与 GPT 审查证据；T0-T8 只作工作台追踪键 |
| `$plush-operations-governance`            | runtime 诊断、可观测/错误、安全/隐私、发布、迁移和回滚                                                                                 |

## 选择规则

页面治理按需读取 [Page Semantics](plush-page-design-governance/references/page-semantics.md) 或 [Page Implementation](plush-page-design-governance/references/page-implementation.md)。

打印治理在 [Source Analysis](plush-print-template-source-governance/references/source-analysis.md) 与 [Template Runtime](plush-print-template-source-governance/references/template-runtime.md) 中保存条件细节，由对应 SKILL 选择本次需要的引用。

从当前任务的 checkout / Worktree 内用 `git rev-parse --show-toplevel` 核对仓库根；下文命令以该根目录为工作目录，仓库内文件引用也相对它解析。

- 简单任务只选一个最贴近主目标的 skill；跨边界时再补相邻 skill。
- schema / migration 的设计、生成和领域合同使用 Domain；目标库 apply、运行态迁移、发布与回滚使用 Operations。
- 普通页面和原型使用 Page；客户源文件、纸张版式或 PDF/打印保真是主目标时使用 Print。
- seed / fixture / dry-run / cleanup 的数据构造使用 Seed；验收目录、readiness、浏览器/PDF、人工结论和签收编排使用 Manual Acceptance。
- Manual Acceptance 只编排验收与证据；目标访问、migration、release、rollback 的真实执行仍由 Operations 负责。
- 提示词整理使用全局显式 `$prompt-governance`。存在待提交 / 需交接改动时按 `AGENTS.md` 留一份被动 `Git handoff record`；只有当前任务已授权 commit / push 且实时现场复杂时，才使用全局 `$git-closeout-coordination`。
- 项目 skill 不重复高内聚、低耦合等通用常识，只保留项目真源、判断流程、命令和验收。
- 修改 skill 后同步 `agents/openai.yaml`，运行 validator、YAML/metadata 扫描、引用扫描和 `git diff --check`；只有命中项目过程记录条件时才更新 `progress.md`。
