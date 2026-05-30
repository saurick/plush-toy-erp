# Codex Goal 文件模板

## 用途

本文件是 `docs/codex-goals/<goal>.md` 的标准模板。以后每个具体 Codex Goal 文件都应基于本模板创建。

不要把复杂任务直接塞进 Codex Goal 输入框。Codex Goal 输入框只放 `4000` 字以内中文短 Goal。

---

# Codex Goal XXX: <任务标题>

## 目标

用 1-3 句话说明本轮要完成的可验收闭环。

## 任务名称

<写清本轮任务名称>

## 任务性质

- 类型：Docs-only / Schema-only / Migration / Runtime / API-RBAC / UI / Deployment / Audit / Cleanup
- 是否改 runtime：是 / 否
- 是否改 Ent schema：是 / 否
- 是否新增 migration：是 / 否
- 是否改 API：是 / 否
- 是否改 UI：是 / 否
- 是否改 docs registry：是 / 否
- 是否改 seedData：是 / 否

## 背景

- 上一轮已经完成什么：
- 本轮要解决什么：
- 本轮不解决什么：
- 本轮与产品路线、当前客户、Workflow / Fact 边界的关系：

## 必须先读

基础文件：

1. `AGENTS.md`
2. `docs/current-source-of-truth.md`
3. `docs/codex-goals/_review-output-protocol.md`
4. `<本轮相关真源文档>`

如某些文件不存在，Codex 必须记录缺失，不要猜。

## 当前真源与非真源

### 当前真源

- `AGENTS.md`
- `docs/current-source-of-truth.md`
- `<本轮直接相关代码 / 文档 / 测试>`

### 只能作为线索

- `docs/reference/imported-notes/*`
- 历史 changes 文档
- 旧 Goal 输出
- 客户样本、截图、Excel、PDF

### 禁止作为真源

- 历史聊天记忆
- 未经确认的截图 / 口头描述
- 未落地的 architecture review
- 未实现的 schema draft
- current 客户样本字段
- demo / seed 数据

必须保持：

- 代码 / schema / migration / tests 是实现真源。
- `docs/current-source-of-truth.md` 是当前状态入口。
- schema draft 不是 implemented。
- architecture review 不是 runtime。
- customer material 不是 Product Core。

## 允许修改的文件

本轮只允许修改：

```text
<列出允许路径>
```

## 禁止修改的文件

本轮禁止修改：

```text
<列出禁止路径>
```

常见禁止项：

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

如果本轮目标明确需要修改某个默认禁止路径，必须先把该路径移到“允许修改的文件”，并说明原因；不要让同一路径同时出现在允许和禁止列表。

## 改动范围分级

- 本轮范围级别：Docs-only / Schema-only / Migration / Runtime / API-RBAC / UI / Deployment
- 本轮是否允许扩大范围：是 / 否
- 扩大范围时如何处理：

默认规则：

- 不得自动扩大范围。
- 发现范围不足时，停止并报告。
- 不得把 schema、repo/usecase、API、UI 放在同一轮，除非任务明确允许。
- 不得因为测试失败去乱改无关文件。

## 成功标准

本轮完成必须满足以下可验证标准：

- <标准 1>
- <标准 2>
- <标准 3>
- `.codex-review/latest.md` 已生成。

不要只写“完成任务”“文档写好”“代码可用”。

## 停止条件

出现以下情况必须停止并报告，不得继续乱改：

- 任务文件与 `AGENTS.md` 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 `tenant_id`。
- 需要实现 SaaS 多租户。
- 需要引入新架构、新依赖或新数据模型，但本轮未允许。
- 发现已有真源被重复设计。
- Workflow / Fact 边界无法保持。
- 验收命令暴露大量与本轮无关的既有失败。
- 测试失败原因不明确。
- 需要删除或重写大量历史文件。

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

## Git 策略

默认规则：

- 本轮默认不提交、不推送。
- 不允许执行 `git add .`。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须区分：

- tracked diff
- untracked files
- 本轮新增文件
- 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

## 测试分层选择

本轮必须根据改动影响面选择测试层级。不要机械全跑，不要只跑最轻检查，不要让 `AGENTS.md` 代替本轮测试选择。

### 可选测试层级

- 静态检查：格式、lint、类型、`git diff --check`。
- 单元测试：验证单个函数、helper、usecase、repo。
- 集成测试：验证 API / usecase / repo / DB / 权限等跨层链路。
- 冒烟测试：确认主路径能启动、页面能打开、核心入口没炸。
- 回归测试：验证本轮相关旧行为没有被破坏。
- E2E 测试：用真实浏览器或真实接口跑完整用户路径。
- 视觉 / 样式回归：检查默认态、交互态、响应式和布局。

### 本轮选择的测试层级

每项必须说明“选择 / 未选择”、原因和对应命令。

| 测试层级 | 选择 / 未选择 | 原因 | 对应命令 |
|---|---|---|---|
| 静态检查 |  |  |  |
| 单元测试 |  |  |  |
| 集成测试 |  |  |  |
| 冒烟测试 |  |  |  |
| 回归测试 |  |  |  |
| E2E 测试 |  |  |  |
| 视觉 / 样式回归 |  |  |  |

## 验收命令

基础命令：

```bash
git status --short
git diff --stat
git diff --check
```

按本轮类型补充具体命令。文档-only 通常补 `grep` / `rg` 检查关键锚点；前端、后端、schema、migration、docs registry、seedData、部署、错误码等改动必须补对应项目命令。

## 项目长期禁止项

除非经过单独评审，本轮必须遵守：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把 current 客户资料写成 Product Core。
- 不让 `WorkflowUsecase` 写库存、出货、财务、应收、应付、发票或收付款事实。
- `shipping_released != shipped`。
- `workflow task done != fact posted`。
- `business_records` 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

只生成 latest，不生成 `.codex-review/runs` 历史副本。

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【成功标准完成情况】

【真源与非真源检查】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```
