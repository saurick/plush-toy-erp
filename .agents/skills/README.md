# Codex 项目 Skills / Project Skills

本目录只保存 plush-toy-erp 的专项 SOP。长期规则在 `AGENTS.md`，项目事实在正式 docs、代码、migration 和测试；通用工作流使用 `~/.codex/skills`，不在项目版重复。

| Skill | 适用范围 |
| --- | --- |
| `$plush-code-review-governance` | review diff/commit/worktree；按触达面路由到领域、页面、打印和测试检查 |
| `$plush-docs-governance` | 当前真源、文档清单、中文文件名、读者路径和 `progress.md` |
| `$plush-domain-boundary-governance` | Workflow / Fact、Product Core、客户差异、schema/usecase/API/RBAC 和字段真源 |
| `$plush-page-design-governance` | 页面业务语义、字段/动作/状态、原型和浏览器回归 |
| `$plush-print-template-source-governance` | 客户 Excel/PDF/图片源、模板意图、字段映射、编辑与 PDF/打印验证 |
| `$plush-seed-import-governance` | seed、fixture、模拟试用、import dry-run、cleanup 和真实客户数据边界 |
| `$plush-test-governance` | T0-T8、测试形态、PostgreSQL/migration、browser、release evidence |
| `$plush-operations-governance` | runtime 诊断、可观测/错误、安全/隐私、发布、迁移和回滚 |

## 选择规则

- 简单任务只选一个最贴近主目标的 skill；跨边界时再补相邻 skill。
- 提示词整理使用全局显式 `$prompt-governance`；提交推送并发收口使用 `$git-closeout-coordination`。
- 项目 skill 不重复高内聚、低耦合等通用常识，只保留项目真源、判断流程、命令和验收。
- 修改 skill 后同步 `agents/openai.yaml`，运行 validator、YAML/metadata 扫描、引用扫描和 `git diff --check`，并更新 `progress.md`。
