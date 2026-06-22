---
name: plush-prompt-governance
description: plush-toy-erp 项目提示词治理。Use when Codex writes, refines, evaluates, or converts a plush-toy-erp request into an executable prompt for implementation, review, docs governance, page design, tests, deployment, handoff, side chat, main chat, or commit/push work; when the user asks how to phrase a plush task; or when prompts need project boundaries such as README/current source of truth, AGENTS.md, Workflow/Fact, RBAC, customer data, progress.md, validation scope, related skills, or positive "要做什么" wording instead of broad "不要" lists.
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

验收：
- 按影响面选择 T0-T8 验证层级和测试形态。
- 跑 <targeted commands>.
- 更新 progress.md。
```

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
