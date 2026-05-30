# Codex 审查报告

## 1. Goal 信息

- Goal 文件：Inline goal context
- Goal 名称：统一 Codex 模板命名，废弃 `_template.md`
- 运行时间：2026-05-30 22:48:00 CST
- 任务类型：Docs-only / Template cleanup
- 是否修改运行时代码：否
- 是否修改 Ent schema：否
- 是否修改 migration：否
- 是否修改 API：否
- 是否修改 UI：否
- 是否修改 docs registry：否
- 是否修改 seedData：否

## 2. 完成摘要

本轮统一 Codex Goal 模板命名：

- 检查了旧 `docs/codex-goals/_template.md`，确认它是具体 Goal 文件结构模板。
- 将旧模板里有价值的“目标”章节合并进 `docs/codex-goals/_goal-file-template.md`。
- 删除 `docs/codex-goals/_template.md`，避免两个具体 Goal 文件模板并存。
- 保留 `docs/codex-goals/_new-session-goal-template.md` 和 `docs/codex-goals/_review-output-protocol.md`。
- 更新 `docs/codex-goals/README.md`，确保只引用 `_goal-file-template.md`。
- 检查 `AGENTS.md` 未引用 `_template.md`，无需修改。
- 只覆盖 `.codex-review/latest.md`，未生成新的 `.codex-review/runs` 历史副本。

## 3. 成功标准完成情况

| 成功标准 | 结果 | 证据 |
|---|---|---|
| 检查 `_template.md` 内容 | 完成 | 已读取并确认其为旧具体 Goal 文件结构模板 |
| 有价值内容合并到 `_goal-file-template.md` | 完成 | 已把“目标”章节加入 `_goal-file-template.md` |
| 删除 `_template.md` | 完成 | `test ! -f docs/codex-goals/_template.md` 通过 |
| 保留短 Goal 模板 | 完成 | `test -f docs/codex-goals/_new-session-goal-template.md` 通过 |
| 保留 review 协议 | 完成 | `test -f docs/codex-goals/_review-output-protocol.md` 通过 |
| README / AGENTS 不再引用 `_template.md` | 完成 | `grep -R "_template.md" AGENTS.md docs/codex-goals || true` 无输出 |
| README / AGENTS 引用 `_goal-file-template.md` | 完成 | `grep -R "_goal-file-template.md" AGENTS.md docs/codex-goals` 命中 README |
| 只生成 latest，不生成 runs | 完成 | 本轮只覆盖 `.codex-review/latest.md` |

## 4. 真源检查

### 当前真源

- `AGENTS.md`
- `docs/codex-goals/README.md`
- `docs/codex-goals/_goal-file-template.md`
- `docs/codex-goals/_new-session-goal-template.md`
- `docs/codex-goals/_review-output-protocol.md`

### 只作为线索

- 旧 `docs/codex-goals/_template.md` 内容，仅用于确认是否有需要迁移的结构。

### 禁止作为真源 / 未采用

- 历史聊天记忆。
- 本轮外工作区现场。

## 5. 改动范围

- Goal 声明的范围级别：Docs-only / Template cleanup。
- 实际改动范围：`docs/codex-goals/README.md`、`docs/codex-goals/_goal-file-template.md`、删除 `docs/codex-goals/_template.md`、覆盖 `.codex-review/latest.md`。
- 是否扩大范围：否。
- `AGENTS.md`：已检查，无需修改。

## 6. 新增 / 修改 / 删除文件

### 新增文件

无。

### 修改文件

- `docs/codex-goals/README.md`
- `docs/codex-goals/_goal-file-template.md`
- `.codex-review/latest.md`

### 删除文件

- `docs/codex-goals/_template.md`

## 7. Git 状态

命令：

```bash
git status --short
```

结果：

```text
 M AGENTS.md
 M README.md
 M docs/current-source-of-truth.md
 M progress.md
 M web/src/erp/docs/productization-delivery.md
 M web/src/erp/docs/system-layer-progress.md
?? .codex-review/
?? config/
?? deployments/
?? docs/architecture/customer-supplier-masterdata-review.md
?? docs/architecture/masterdata-order-source-document-review.md
?? docs/architecture/order-purchase-boundary-review.md
?? docs/architecture/product-sku-bom-boundary-review.md
?? docs/architecture/status-workflow-fact-boundary.md
?? docs/codex-goals/
?? docs/customers/
?? docs/product/
?? docs/reference/
?? server/internal/core/
?? web/src/erp/mobile/roles/
?? web/src/erp/modules/
```

说明：工作区已有大量本轮外改动和未跟踪文件；本轮未整理或回退这些现场。

## 8. Diff 统计

命令：

```bash
git diff --stat
```

结果：

```text
 AGENTS.md                                   | 36 +++++++++++++++++++++++++++++
 README.md                                   |  8 ++++++-
 docs/current-source-of-truth.md             |  7 +++++-
 progress.md                                 | 30 ++++++++++++++++++++++++
 web/src/erp/docs/productization-delivery.md |  2 ++
 web/src/erp/docs/system-layer-progress.md   |  4 +++-
 6 files changed, 84 insertions(+), 3 deletions(-)
```

说明：`docs/codex-goals/*` 当前为未跟踪目录，未出现在 tracked diff stat 中。

## 9. 未跟踪文件

命令：

```bash
git ls-files --others --exclude-standard
```

结果摘要：

```text
.codex-review/
config/
deployments/
docs/architecture/
docs/codex-goals/
docs/customers/
docs/product/
docs/reference/
server/internal/core/
web/src/erp/mobile/roles/
web/src/erp/modules/
```

## 10. 禁止路径检查

| 路径 | 是否修改 | 说明 |
|---|---:|---|
| 运行时代码 | 否 | 本轮未修改 |
| Ent schema | 否 | 本轮未修改 |
| migration | 否 | 本轮未修改 |
| API | 否 | 本轮未修改 |
| UI | 否 | 本轮未修改 |
| docs registry | 否 | 本轮未修改 |
| seedData | 否 | 本轮未修改 |
| `workflow.go` | 否 | 本轮未修改 |
| `rbac.go` | 否 | 本轮未修改 |
| `server/internal/data` | 否 | 本轮未修改 |
| `server/internal/core` | 否 | 当前工作区已有本轮外未跟踪文件，本轮未修改 |

## 11. tenant_id 检查

本轮没有新增 `tenant_id`，没有修改 schema/runtime，也没有实现 SaaS 多租户。

## 12. Workflow / Fact 边界检查

本轮只改 Codex 模板文档，没有修改 Workflow / Fact 运行时逻辑，也没有改变 `shipping_released != shipped` 边界。

## 13. 实现状态措辞检查

本轮不涉及 implemented 状态文案。

## 14. 测试层级选择

| 测试层级 | 选择 / 未选择 | 原因 | 命令 | 结果 |
|---|---|---|---|---|
| 静态检查 | 选择 | 模板命名和引用收口需要检查文件存在性、引用和 diff 空白 | 用户指定验收命令、`git diff --check` | 通过 |
| 单元测试 | 未选择 | 不涉及函数 / helper / usecase / repo | 无 | 不适用 |
| 集成测试 | 未选择 | 不涉及 API / DB / 权限跨层链路 | 无 | 不适用 |
| 冒烟测试 | 未选择 | 不涉及启动、页面入口或部署配置 | 无 | 不适用 |
| 回归测试 | 未选择 | 不涉及运行时行为 | 无 | 不适用 |
| E2E 测试 | 未选择 | 不涉及 UI 流程 | 无 | 不适用 |
| 视觉 / 样式回归 | 未选择 | 不涉及样式或布局 | 无 | 不适用 |

## 15. 测试命令与结果

```bash
git status --short
git diff --stat
test -f docs/codex-goals/_goal-file-template.md
test -f docs/codex-goals/_new-session-goal-template.md
test -f docs/codex-goals/_review-output-protocol.md
test ! -f docs/codex-goals/_template.md
grep -R "_template.md" AGENTS.md docs/codex-goals || true
grep -R "_goal-file-template.md" AGENTS.md docs/codex-goals
git diff --check
```

结果：

- `_goal-file-template.md` 存在。
- `_new-session-goal-template.md` 存在。
- `_review-output-protocol.md` 存在。
- `_template.md` 不存在。
- `_template.md` 引用检查无输出。
- `_goal-file-template.md` 引用命中 `docs/codex-goals/README.md`。
- `git diff --check` 通过。

未跑前端 / 后端测试：

- 未跑原因：本轮只改 Codex 模板文档，不涉及 runtime / API / UI / schema / migration。
- 是否与本轮改动相关：否。

## 16. 停止条件检查

| 停止条件 | 是否触发 | 说明 |
|---|---:|---|
| 需要修改禁止路径 | 否 | 未修改运行时代码等禁止路径 |
| 需要新增 `tenant_id` | 否 | 未新增 |
| 需要实现 SaaS 多租户 | 否 | 未实现 |
| 需要创建 `ChangeUsecase` 或 `change_records` | 否 | 未创建 |
| 验收命令失败 | 否 | 验收通过 |

## 17. Git 策略检查

- 是否执行 `git add .`：否。
- 是否提交：否。
- 是否推送：否。
- 是否 stash：否。
- 是否回退非本轮改动：否。
- 如有 stage，是否按路径精确 stage：未 stage。

## 18. 关键决策

- `_goal-file-template.md` 是唯一具体 Goal 文件结构模板。
- `_new-session-goal-template.md` 保留为新开 Codex 会话短 Goal 模板。
- `_review-output-protocol.md` 保留为 `.codex-review/latest.md` 输出协议。
- 删除 `_template.md`，避免两个模板并存造成混淆。
- 不修改 `progress.md`，因为本轮用户明确限制了允许修改范围。

## 19. 风险

风险：
当前工作区已有大量本轮外改动和未跟踪文件。
影响：
后续提交时容易混入无关现场。
缓解措施：
提交时按路径精确 stage，禁止 `git add .`。
下一步是否需要评审：
提交前需要。

## 20. 下一轮建议 Codex Goal

建议下一轮 Goal：
按路径精确整理并提交 Codex 模板体系相关文档。
建议 Goal 文件：
无，提交前可直接按路径复核。
为什么：
当前工作区很脏，提交需要避免混入无关现场。
下一轮禁止做：
不要修改 runtime、schema、migration、API、UI、docs registry、seedData 或部署脚本。

## 21. 复制给 GPT 的摘要

```text
【Codex 审查报告】

【Goal】
统一 Codex 模板命名，废弃 _template.md，改用 _goal-file-template.md。

【完成摘要】
已检查旧 docs/codex-goals/_template.md，确认它是具体 Goal 文件结构模板；已把有价值的“目标”章节合并进 docs/codex-goals/_goal-file-template.md；已删除 _template.md；已保留 _new-session-goal-template.md 和 _review-output-protocol.md；README 只引用 _goal-file-template.md。

【新增文件】
无。

【修改文件】
docs/codex-goals/README.md
docs/codex-goals/_goal-file-template.md
.codex-review/latest.md

【删除文件】
docs/codex-goals/_template.md

【测试命令与结果】
test -f docs/codex-goals/_goal-file-template.md: pass
test -f docs/codex-goals/_new-session-goal-template.md: pass
test -f docs/codex-goals/_review-output-protocol.md: pass
test ! -f docs/codex-goals/_template.md: pass
grep -R "_template.md" AGENTS.md docs/codex-goals || true: no output
grep -R "_goal-file-template.md" AGENTS.md docs/codex-goals: README hits only
git diff --check: pass

【风险】
工作区已有大量本轮外改动，提交时必须按路径精确 stage，禁止 git add .
```
