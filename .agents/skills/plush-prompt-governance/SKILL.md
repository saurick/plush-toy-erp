---
name: plush-prompt-governance
description: 项目提示词治理（plush-toy-erp）。Use when Codex writes, refines, evaluates, or converts a plush-toy-erp request into an executable prompt for implementation, review, docs governance, page design, tests, deployment, handoff, side chat, main chat, or commit/push work; when the user asks how to phrase a plush task; when a complete copyable final prompt, prompt length control, Codex input limit, engineering quality gate, maintainability, extensibility, simplicity, complexity budget, or prompt boundary conditions are needed; or when prompts need project boundaries such as README/current source of truth, AGENTS.md, Workflow/Fact, RBAC, customer data, progress.md, validation scope, related skills, or positive "要做什么" wording instead of broad "不要" lists.
---

# Plush Prompt Governance

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文，`Workflow / Fact / RBAC / API / migration / runtime` 等术语按需保留，方便触发、检索和跨工具引用。

Use this skill to draft prompts that make plush-toy-erp work executable and bounded. The main pattern is positive: state the goal, true sources, scope, validation, and closeout. Use "不要 / 禁止" only for project risks that commonly cause bad changes.

## Prompt Principle

Write prompts around "要做什么":

- 要先读哪些真源。
- 要完成哪个业务或文档结果。
- 要改哪些路径或模块。
- 要跑哪些验证，或先评估验证范围。
- 要在最终回复说明哪些证据和盲区。

Only use "不要 / 禁止" for high-risk plush boundaries:

- 不改 `AGENTS.md` 或长期规则，除非任务明确要求并说明风险。
- 不把聊天规划、历史 changes 或截图当仓库真源。
- 不混淆 Workflow / Fact，不把 workflow task done 当 fact posted。
- 不新增 `tenant_id`、SaaS 多租户、license server 或客户工单系统。
- 不把当前客户资料硬编码进 Product Core。
- 不直接改生产 / 目标环境数据，不在低配服务器构建。
- 不乱提交 unrelated dirty worktree，不 reset/stash/force push。
- 不声称“测试通过”却不说明验证层级、测试形态和未覆盖项。

## Complete Prompt Output

当任务是“写 / 改 / 转换提示词”时，必须输出一份完整可复制的 `最终提示词`，用 fenced Markdown 包起来；不要只给原则、片段或检查清单。

如果用户只是问“是否合理 / 为什么 / 怎么处理”，先短答，不强制展开成完整提示词。

长度治理：

- 最终提示词必须能放进目标 Codex / ChatGPT 输入窗口。目标限制未知时，默认压缩历史，保留真源、当前状态、决策、阻塞和验收。
- 如果仍可能超限，输出 `主提示词` + `补充上下文`，不要给一个无法粘贴执行的超长版本。
- 不凭空声称精确 token 余量；需要时只说明压缩和拆分策略。

完整 plush 提示词通常应包含：相关 `$plush-*` skills、目标、先读真源、允许修改、本轮不做、验收、progress.md 要求和收口要求。微型提示词可省略明显无关段落。

## Engineering Quality Gate

Structure constraints to include when relevant:

- 边界清晰、合理严谨：说明本轮管什么、不管什么、依赖哪个真源，以及为什么当前拆分、抽象和验证足够但不过度。
- 语义清晰：提示词要定义关键名词、目标输出、范围、非目标、验收和后果，避免泛称驱动无约束实现。
- 模块化：提示词要要求按真实职责拆分，不做无意义拆文件，也不把多个阶段塞进一次大改。
- 高内聚：同一规则、字段真源、权限判断、错误处理或文档口径要收口到同一 usecase/helper/config/test source。
- 低耦合：要求页面、usecase、repo、schema、配置、部署和测试的依赖方向清楚，不跨层偷做逻辑。
- 单一职责：要求输出说明新增抽象、fallback、API/schema/config 的理由、收益、验证方式和退出边界。

plush 提示词不能只要求“把目标做出来”。非平凡实现、页面、文档、测试、部署或 review 提示词必须要求 Codex 保持项目的复杂度预算：

- 优先沿用当前架构、业务真源、共享组件、usecase/repo/API/RBAC 分层、QA 脚本和文档体系。
- 先做最小必要但完整的主路径修复；不要用局部 fallback、重复派生、页面私有真源或宽松测试条件换取短期通过。
- 新增 helper、组件、schema、migration、API、RBAC 权限、Workflow 规则、客户配置或部署步骤前，必须说明为什么现有能力不能复用，以及为什么现在值得增加复杂度。
- 遇到跨 Workflow / Fact、字段残值 / 缺值、客户差异、页面共享层或发布部署的任务时，优先收窄成可验证切片，不在一轮里无约束扩张。
- 收口必须说明：复用了哪些既有能力、增加了哪些复杂度、为什么恰当、未覆盖哪些路径、剩余风险是什么。

如果用户说“完美 / 顶级 / 大厂 / 开源优秀”，提示词应转成可维护、可扩展、低心智负担、低信息密度、可回归的具体要求，而不是允许无限重构。

## Standard Plush Prompt

```markdown
$plush-prompt-governance
$relevant-plush-skill

目标：
请完成 <one concrete plush outcome>.

先读：
- /Users/simon/projects/plush-toy-erp/README.md
- /Users/simon/projects/plush-toy-erp/docs/当前真源与交接顺序.md
- <task-specific docs/code/tests>

允许修改：
- <exact paths/modules>

本轮不做：
- <only high-risk non-goals: schema, RBAC, deployment, AGENTS, customer core, etc.>

工程质量：
- 优先复用 plush 现有真源、共享组件、usecase/repo/API/RBAC 分层、QA 脚本和文档体系。
- 新增抽象、helper、schema、API、权限、配置、fallback 或 Workflow 规则前，先说明复用不足和复杂度收益。
- 收口时说明复杂度控制、复用点、取舍、未覆盖路径和剩余风险。

验收：
- 先按影响面选择验证层级和测试形态。
- 执行 <commands / browser regression / review checks>.
- 更新 progress.md（如果有代码或正式文档改动）。

收口：
- 说明改动文件、验证命令、未覆盖项和剩余风险。
- 如用户要求提交/推送，只提交本轮相关文件，推送前 fetch 并确认不落后远端。
```

## Skill Pairing

| Task | Add these skills |
| --- | --- |
| 文档治理 / docs | `$plush-docs-governance` |
| 页面设计 / 信息密度 / 原型同步 | `$plush-page-design-governance` |
| 代码 review | `$plush-code-review-governance` |
| 测试选择 / 验证范围 | `$plush-test-governance` |
| 通用提示词整理 | `$prompt-governance` |
| 发布/部署/版本 | `$plush-release-governance` |
| 领域边界/实现前评估 | `$plush-domain-boundary-governance` |
| 运行故障诊断 | `$plush-runtime-diagnostics` |
| seed/import/fixture | `$plush-seed-import-governance` |
| 可观测/错误提示 | `$plush-observability-error-governance` |
| 安全/隐私/权限 | `$plush-security-privacy-governance` |

If the task often needs two skills, include both explicitly. There is no special shortcut required; one prompt can list multiple `$skill-name` lines.

## Prompt Patterns

### Implementation

```markdown
$plush-prompt-governance
$plush-test-governance

目标：
请实现 <feature/fix>，以当前代码和正式文档为真源。

先读：
- README.md
- docs/当前真源与交接顺序.md
- <related module files>

允许修改：
- <paths>

本轮不做：
- 不改 schema / RBAC / deployment / AGENTS，除非代码确认必须改并先说明。

工程质量：
- 优先主路径修复，不用局部 fallback 或重复真源掩盖根因。
- 新增抽象或共享层前先说明为什么现有结构不能承接。

验收：
- 按影响面选择 T0-T8 验证层级和测试形态。
- 跑 <targeted commands>.
- 更新 progress.md。
```

When asked to produce a prompt, deliver it as:

````markdown
最终提示词：

```markdown
$plush-prompt-governance
...
```
````

### Review

```markdown
$plush-code-review-governance

请 review 当前 diff 或指定 commit。
重点看：Workflow / Fact 边界、RBAC/API 合同、字段残值/缺值、真实后端读写、页面回归和测试盲区。
输出先列 findings，按严重度排序，带文件/行号；没有阻断问题也要说明剩余风险。
```

### Docs / Handoff

```markdown
$plush-docs-governance
$plush-prompt-governance

请把以下聊天/想法整理成 plush 可执行交接提示词。
要求：中文主体，结论前置，列出先读文件、唯一真源、允许改动、明确不做、验收命令和剩余风险。
不要把聊天内容直接写成正式真源；先要求 Codex 回到仓库文件核对。
```

### Commit / Push

```markdown
请提交并推送本轮相关代码。
范围：只包含 <paths/commits>。
执行：先 `git fetch` 并检查 `git status -sb`；精确 stage；提交信息用简体中文；push 当前分支。
收口：说明 commit hash、push 目标、hook/QA 结果，以及是否还有未提交 unrelated 改动。
```

## Common Mistakes

- 把很多愿望写进一个 prompt，导致 Codex 同轮改 runtime、docs、tests、deployment。
- 只写 "不要乱改"，但不写要读什么、要完成什么、怎么验收。
- 要求 "完美通过测试"，但不定义测试形态和证据环境。
- 把 AGENTS 或 README 全文复制进 prompt，反而淹没本轮目标。
- 把 "参考大厂/开源" 写成照搬视觉或流程；应写成参考信息架构、密度控制、可读性和可操作性原则。
- 只讲提示词原则但不给最终可复制版本，或把完整聊天历史塞进一个超长 prompt。
- 只要求达成目标，却没有要求复杂度预算、复用优先、主路径修复和收口自检，导致实现不可维护。
