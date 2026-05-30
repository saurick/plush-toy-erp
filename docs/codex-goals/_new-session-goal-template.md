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

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。只生成 latest，不生成 .codex-review/runs 历史副本。

用户应能用 cat .codex-review/latest.md | pbcopy 一键复制；不要要求用户截图。
```

## 示例

如果下一轮任务文件是：

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
```

则复制给 Codex 的 Goal 是：

```text
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，再阅读该任务文件。每次新会话不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许修改、禁止修改、明确不做、成功标准、停止条件、Git 策略、测试分层选择和验收命令，以任务 md 为准；项目长期边界以 AGENTS.md、docs/product/*、docs/architecture/* 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。只生成 latest，不生成 .codex-review/runs 历史副本。

用户应能用 cat .codex-review/latest.md | pbcopy 一键复制；不要要求用户截图。
```

## 什么时候新开 Codex 会话

建议新开会话：

```text
002 -> 003
003 -> 004
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
5. 审查报告必须生成 `.codex-review/latest.md`，不生成 `.codex-review/runs` 历史副本。
6. 不要让用户截图。
7. 用户复制报告给 GPT 的命令是：

```bash
cat .codex-review/latest.md | pbcopy
```
