# Codex 项目 Skills / Project Skills

本目录只保存 plush-toy-erp 的专项 SOP。长期规则在 `AGENTS.md`，项目事实在正式 docs、代码、migration 和测试；通用工作流使用 `~/.codex/skills`，不在项目版重复。

当前 10 个 Skill 按请求动作、对象与影响选择一个主入口；只有当前判断需要时才读取分支/引用或补充其他 Skill。切换后继续同一目标的已授权工作，不逐个执行或逐层向甲方确认；当前技能目录已能定位时无需重复读取本索引。

| Skill                                     | 适用范围                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `$plush-capability-evidence-audit`        | 只读审计“做到哪、还缺什么、能否发布/交付”，分开代码、本地 QA、运行态、目标发布、恢复和客户验收                                         |
| `$plush-code-review-governance`           | review diff/commit/worktree；按触达面路由到领域、页面、打印和测试检查                                                                  |
| `$plush-docs-governance`                  | 当前真源、文档清单、中文文件名、读者路径和 `progress.md`                                                                               |
| `$plush-domain-boundary-governance`       | Workflow / Fact、Product Core、客户差异、schema/migration 设计与生成、usecase/API/RBAC 和字段真源                                      |
| `$plush-page-design-governance`           | 普通 ERP 页面业务语义、字段/动作/状态、原型和浏览器回归                                                                                |
| `$plush-print-template-source-governance` | 客户 Excel/PDF/图片源、纸张版式、字段映射、模板编辑与 PDF/打印保真                                                                     |
| `$plush-seed-import-governance`           | 模块化 seed / fixture / 模拟数据、甲方资料到脱敏场景映射、增量复用、import dry-run、批次与数据 cleanup 边界                           |
| `$plush-manual-acceptance-governance`     | 人工验收目录/批次、岗位账号/任务、浏览器/PDF 与人工证据、签收和退出清理                                                                |
| `$plush-test-governance`                  | 验证范围需要判断，或涉及浏览器、数据库、migration、CI 编排/缓存变更及证据；T0-T8 只作工作台追踪键                                  |
| `$plush-operations-governance`            | runtime 诊断、可观测/错误、安全/隐私、发布、迁移和回滚                                                                                 |

## 选择规则

页面治理按需读取 [Page Semantics](plush-page-design-governance/references/page-semantics.md) 或 [Page Implementation](plush-page-design-governance/references/page-implementation.md)。

打印治理在 [Source Analysis](plush-print-template-source-governance/references/source-analysis.md) 与 [Template Runtime](plush-print-template-source-governance/references/template-runtime.md) 中保存条件细节，由对应 SKILL 选择本次需要的引用。

从当前任务的 checkout / Worktree 内用 `git rev-parse --show-toplevel` 核对仓库根；下文命令以该根目录为工作目录，仓库内文件引用也相对它解析。

- 简单任务只选一个最贴近主目标的 skill；跨边界时再补相邻 skill。
- schema / migration 的设计、生成和领域合同使用 Domain；目标库 apply、运行态迁移、发布与回滚使用 Operations。
- 普通页面和原型使用 Page；客户源文件、纸张版式或 PDF/打印保真是主目标时使用 Print。
- seed / fixture / dry-run / cleanup、模拟场景覆盖、甲方资料脱敏映射和 `reuse / reverify / reseed` 判断使用 Seed；验收目录、readiness、浏览器/PDF、人工结论和签收编排使用 Manual Acceptance。
- Manual Acceptance 只编排验收与证据；目标访问、migration、release、rollback 的真实执行仍由 Operations 负责。
- 提示词整理使用全局显式 `$prompt-governance`。存在待提交 / 需交接改动时按 `AGENTS.md` 留一份被动 `Git handoff record`；只有当前任务已授权 commit / push 且实时现场复杂时，才使用全局 `$git-closeout-coordination`。
- 项目 skill 不重复高内聚、低耦合等通用常识，只保留项目真源、判断流程、命令和验收。
- 修改 Skill 时核对 `agents/openai.yaml` 仍准确；仅在适用范围、入口或元数据变化时修改相关 README / metadata / 引用。验证入口与覆盖见下文；只有命中项目过程记录条件时才更新 `progress.md`。

<a id="skill-validation"></a>

## 维护与验证 / Skill Validation

仓库根目录运行 `node scripts/qa/skill-health.mjs`。这是项目 validator，仅使用现有 Node 与仓库代码，不依赖 Python、PyYAML、客户私有仓库或运行服务。`affected` 对 Markdown 与项目 Skill 变更选择同一入口，也核对被引用文档的章节变化。

检查当前项目支持的平面字符串 YAML：frontmatter 的 `name / description` 与 `openai.yaml` 的 `interface` 字段；同时核对目录名、metadata、README 索引、Skill 指令与 references 的本地文件/章节链接、项目 Skill 名称引用及未完成 TODO 占位。代码块中的示例不作为指令占位；`assets` 中的输出模板不扫描正文，指令指向模板的链接仍须有效。全局 Skill 的可用性仍按当前会话安装目录确认，不在产品仓复制目录。

```bash
node scripts/qa/skill-health.mjs
GIT_OPTIONAL_LOCKS=0 git -c diff.autoRefreshIndex=false diff --check -- .agents/skills scripts/qa/skill-health.mjs scripts/qa/skill-health.test.mjs
```

修改 validator 或共享链接工具时，再运行 `node --test scripts/qa/skill-health.test.mjs scripts/qa/docs-inventory.test.mjs` 验证正反例和共享链接合同。项目检查不替代跨项目 Skill 的 canonical validator，也不证明模型行为或目标环境已通过。

## 行为走查 / Behavior Checks

触发条件、授权或执行分支变化时，用相关请求走查当前 Skill 与实际真源，说明选择的入口、允许动作、必要证据及停止条件。只执行请求所需且已授权的动作；计划判断与实际运行分开记录，不用关键词匹配测试代替行为走查。

| 代表请求 | 主入口 | 需要核对的行为 |
| --- | --- | --- |
| “评估采购页布局，先别改。” | Page | 只读核对页面真源并给结论；无浏览器证据时说明范围，不写实现。 |
| “只调整页面间距，做好必要验证。” | Page / Test | 选择受影响页面与状态，复用现有数据；不触发整批重造。 |
| “给数量校验单测补空值 fixture。” | Seed / Test | 复用所属测试/helper，验证空值、隔离和清理；不要求人工验收批次回执。 |
| “继续已授权的共享组件修改，完成必要浏览器验证。” | Page / Test | 沿用同一目标授权，按真实影响选择验证；只在显著超出范围或预算时询问。 |
| “根据已有发布回执判断缺口，不连接目标。” | Capability Evidence Audit | 读取已有证据，保留目标未核验结论；不访问生产或取得运行凭据。 |
| “实现 schema 调整并生成 migration，暂不 apply。” | Domain / Test | 完成设计、生成、守卫及适用的隔离升级检查；不执行目标库 apply。 |
