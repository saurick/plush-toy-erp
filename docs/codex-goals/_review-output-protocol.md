# Codex 审查报告输出协议

## 目的

每轮正式 Codex Goal 收口后，必须生成一个用户可以直接复制给 GPT 审查的 Markdown 报告。

本协议只适用于以下场景：

- 明确执行 `docs/codex-goals/<goal-file>.md`。
- 修复当前 Goal 遗漏、测试失败或审查报告。
- 用户明确要求生成审查报告。

Codex 没有可靠的内置“当前是否 Goal 模式”标志，必须根据当前上下文判断：用户是否明确指定 Goal 文件、当前输入是否是短 Goal 模板、是否正在修复当前 Goal 的后续问题、是否明确要求 review 输出。若上下文不明确，默认按普通任务处理，不碰 `.codex-review/latest.md`。

普通问答、检查、解释、临时排查、小格式修复、非 Goal 的“下一步”不生成、不覆盖、也不删除 `.codex-review/latest.md`。

不要只在 Codex 聊天窗口里分散输出。
不要要求用户截图。
不要只给口头总结。

## 必须生成的文件

正式 Goal 收口时，必须创建或覆盖本地临时文件：

```text
.codex-review/latest.md
```

`.codex-review/` 不提交进 Git。只生成 latest，不生成 `.codex-review/runs` 历史副本。

如果某轮审查结论需要长期保留，应整理进具体 `docs/codex-goals/<goal>.md`、`progress.md` 或正式文档，而不是依赖 `.codex-review/`。

## Codex 最终必须告诉用户

正式 Goal 收口的最终回复必须告诉用户：

```bash
cat .codex-review/latest.md | pbcopy
```

用于一键复制审查报告。

也要告诉用户：

```bash
cat .codex-review/latest.md
```

用于查看报告。

不要要求用户截图。

## `.codex-review/latest.md` 模板

请按下面模板完整输出，不要省略标题。

```md
# Codex 审查报告

## 1. Goal 信息

- Goal 文件：
- Goal 名称：
- 运行时间：
- 任务类型：
- 是否修改运行时代码：是 / 否
- 是否修改 Ent schema：是 / 否
- 是否修改 migration：是 / 否
- 是否修改 API：是 / 否
- 是否修改 UI：是 / 否
- 是否修改 docs registry：是 / 否
- 是否修改 seedData：是 / 否

## 2. 完成摘要

简要说明本轮做了什么。

## 3. 成功标准完成情况

从当前 Goal 文件复制成功标准，并逐条说明：

| 成功标准 | 结果 | 证据 |
|---|---|---|

## 4. 真源检查

说明本轮实际读取并采用的真源、只作为线索的材料、未采用的非真源。

### 当前真源

-

### 只作为线索

-

### 禁止作为真源 / 未采用

-

## 5. 改动范围

- Goal 声明的范围级别：
- 实际改动范围：
- 是否扩大范围：是 / 否
- 如有扩大，是否已获用户明确同意：

## 6. 新增 / 修改 / 删除文件

### 新增文件

列出新增文件。没有则写“无”。

### 修改文件

列出修改文件。没有则写“无”。

### 删除文件

列出删除文件。没有则写“无”。

## 7. Git 状态

命令：

```bash
git status --short
```

结果：

```text
<粘贴输出>
```

## 8. Diff 统计

命令：

```bash
git diff --stat
```

结果：

```text
<粘贴输出>
```

## 9. 未跟踪文件

命令：

```bash
git ls-files --others --exclude-standard
```

结果：

```text
<粘贴输出>
```

## 10. 禁止路径检查

必须检查当前 Goal 的禁止路径是否被修改。默认检查这些路径；如果当前 Goal 明确允许某个默认路径，表格说明中写“当前 Goal 已允许”，不要标为违规。

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model/schema
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

输出表格：

| 路径 | 是否修改 | 说明 |
|---|---:|---|

## 11. tenant_id 检查

命令：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否新增了 `tenant_id` 字段？
- 是否只出现在 imported notes、禁止说明、future SaaS 评审候选说明里？
- 是否进入了 schema draft、runtime 或 Ent schema？

## 12. Workflow / Fact 边界检查

命令：

```bash
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否仍然明确 `shipping_released != shipped`？
- 是否有任何文档把 `shipping_released` 写成已出库、已发货、已扣库存？
- 是否有任何内容让 Workflow 写 inventory、shipment、finance、AR/AP、invoice、payment facts？

## 13. 实现状态措辞检查

命令：

```bash
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
```

结果：

```text
<粘贴输出>
```

解释：

- 本轮是否把 draft / review 错写成 implemented？
- 如果没有，写“未发现问题”。

## 14. 测试层级选择

从当前 Goal 文件复制测试分层选择，并逐项说明实际执行结果。

| 测试层级 | 选择 / 未选择 | 原因 | 命令 | 结果 |
|---|---|---|---|---|
| 静态检查 |  |  |  |  |
| 单元测试 |  |  |  |  |
| 集成测试 |  |  |  |  |
| 冒烟测试 |  |  |  |  |
| 回归测试 |  |  |  |  |
| E2E 测试 |  |  |  |  |
| 视觉 / 样式回归 |  |  |  |  |

如果某个测试没有跑，必须写：

- 未跑命令：
- 未跑原因：
- 是否与本轮改动相关：

## 15. 测试命令与结果

列出实际运行的命令和结果。

## 16. 停止条件检查

从当前 Goal 文件复制停止条件，并说明是否触发。

| 停止条件 | 是否触发 | 说明 |
|---|---:|---|

## 17. Git 策略检查

- `.codex-review/` 是否保持未提交：
- 是否执行 `git add .`：
- 是否提交：
- 是否推送：
- 是否 stash：
- 是否回退非本轮改动：
- 如有 stage，是否按路径精确 stage：

## 18. 关键决策

列出本轮产生的关键决策。

## 19. 风险

列出本轮仍然存在的风险。

每项格式：

```text
风险：
影响：
缓解措施：
下一步是否需要评审：
```

## 20. 下一轮建议 Codex Goal

写下一轮建议。

格式：

```text
建议下一轮 Goal：
建议 Goal 文件：
为什么：
下一轮禁止做：
```

## 21. 复制给 GPT 的摘要

请把本节作为用户可直接复制给 GPT 的摘要。

```text
【Codex 审查报告】

【Goal】
<goal 文件和 goal 名称>

【完成摘要】
<completion summary>

【成功标准】
<success criteria status>

【真源检查】
<source of truth check>

【改动范围】
<scope level and actual scope>

【新增文件】
<added files>

【修改文件】
<modified files>

【git status --short】
<output>

【git diff --stat】
<output>

【untracked files】
<output>

【测试层级选择】
<test level selection>

【测试命令与结果】
<test output summary>

【停止条件】
<stop condition status>

【Git 策略】
<git strategy status>

【tenant_id 检查】
<explanation>

【Workflow / Fact 检查】
<explanation>

【禁止路径检查】
<explanation>

【关键决策】
<decisions>

【风险】
<risks>

【下一轮 Codex 建议】
<next goal>
```
```

## Codex 最终回复要求

正式 Goal 收口的 Codex 最终回复必须包含：

1. `.codex-review/latest.md` 已生成。
2. 给出 Mac 一键复制命令：

```bash
cat .codex-review/latest.md | pbcopy
```

3. 给出普通查看命令：

```bash
cat .codex-review/latest.md
```

4. 不要要求用户截图。
