# Codex 新会话短 Goal 模板

## 用途

每次手动新开 Codex 会话时，复制本文件里的短 Goal 模板。

不要在 Codex Goal 输入框里粘贴超长任务说明。复杂任务必须写入：

```text
docs/codex-goals/<goal-file>.md
```

Codex 新会话不能依赖历史聊天记忆，只能以仓库文件为准。

## 固定短 Goal 模板

复制下面内容到 Codex Goal 输入框，并把 `<goal-file>` 替换为实际任务文件名。

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，再阅读该任务文件。每次新会话不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许修改、禁止修改、明确不做、成功标准、停止条件、Git 策略、测试分层选择和验收命令，以任务 md 为准；项目长期边界以 AGENTS.md、docs/product/*、docs/architecture/* 为准。

执行前后都要检查工作区状态。若运行期间出现其他会话修改的非本 Goal 路径，只能记录为非本轮现场，不得回退、删除、格式化、提交，也不得写入本轮成果；需要提交时必须按本 Goal 允许路径精确 stage。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成本地 .codex-review/latest.md。只生成 latest，不生成 .codex-review/runs 历史副本，不提交 .codex-review/。

.codex-review/latest.md 只能覆盖当前 Goal 的目标、允许范围、实际纳入文件、验证命令、提交状态和本轮风险；不得把并发会话或非本轮路径改动写成本轮成果。

用户应能用 cat .codex-review/latest.md | pbcopy 一键复制；不要要求用户截图。
```

## 示例

如果下一轮任务文件是：

```text
docs/codex-goals/<goal-file>.md
```

则复制给 Codex 的 Goal 是：

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，再阅读该任务文件。每次新会话不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许修改、禁止修改、明确不做、成功标准、停止条件、Git 策略、测试分层选择和验收命令，以任务 md 为准；项目长期边界以 AGENTS.md、docs/product/*、docs/architecture/* 为准。

执行前后都要检查工作区状态。若运行期间出现其他会话修改的非本 Goal 路径，只能记录为非本轮现场，不得回退、删除、格式化、提交，也不得写入本轮成果；需要提交时必须按本 Goal 允许路径精确 stage。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成本地 .codex-review/latest.md。只生成 latest，不生成 .codex-review/runs 历史副本，不提交 .codex-review/。

.codex-review/latest.md 只能覆盖当前 Goal 的目标、允许范围、实际纳入文件、验证命令、提交状态和本轮风险；不得把并发会话或非本轮路径改动写成本轮成果。

用户应能用 cat .codex-review/latest.md | pbcopy 一键复制；不要要求用户截图。
```

## 什么时候新开 Codex 会话

建议新开会话：

```text
schema review -> schema
schema -> migration/generate
schema -> repo/usecase
repo/usecase -> API/RBAC
API/RBAC -> UI
docs-only -> schema implementation
```

也就是：

```text
换 Goal，就新开 Codex 会话。
```

## 什么时候继续原 Codex 会话

可以继续原会话：

```text
修复当前 Goal 的测试失败
补当前 Goal 要求但遗漏的文件
修复 .codex-review/latest.md
修正当前 Goal 输出格式
补跑当前 Goal 的验收命令
```

也就是：

```text
同一个 Goal 内补漏，继续原会话。
```

## 注意事项

1. 新会话不能假设 Codex 记得上一轮内容。
2. 长期规则必须写进仓库文件。
3. 任务范围必须以 `docs/codex-goals/<goal-file>.md` 为准。
4. 每轮必须在任务文件里选择测试层级，并说明选择 / 未选择原因。
5. 审查报告必须生成本地 `.codex-review/latest.md`，不生成 `.codex-review/runs` 历史副本，也不提交 `.codex-review/`。
6. `.codex-review/latest.md` 只能覆盖当前 Goal；并发会话或非本轮路径改动只能记录为非本轮现场，不得写成本轮成果。
7. 不要让用户截图。
8. 用户复制报告给 GPT 的命令是：

```bash
cat .codex-review/latest.md | pbcopy
```
