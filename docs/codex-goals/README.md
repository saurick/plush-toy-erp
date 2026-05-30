# Codex Goals 使用说明

本目录用于存放 Codex 的版本化任务文件。

## 为什么要有这个目录

Codex Goal 输入框有长度限制，而且每次新开 Codex 会话时，不能依赖上一次聊天记忆。

所以本项目采用：

```text
中文短 Goal
+ docs/codex-goals/<goal>.md
+ AGENTS.md
+ 本地 .codex-review/latest.md
```

的方式执行任务。

## 新会话短 Goal 模板

每次手动新开 Codex 会话时，使用：

```text
docs/codex-goals/_new-session-goal-template.md
```

该文件只用于复制到 Codex Goal 输入框；真正的任务范围、允许 / 禁止修改文件、验收命令和风险边界，应写在具体的 `docs/codex-goals/<goal-file>.md` 中。

新建具体 Goal 文件时，使用：

```text
docs/codex-goals/_goal-file-template.md
```

## 如何开启一个新的 Codex 会话

新会话中使用这种中文短 Goal：

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

把 `<goal-file>` 替换成实际任务文件名。

## 什么时候新开 Codex 会话

切换到新的编号 Goal 时，建议新开 Codex 会话。

例如：

```text
002 -> 003：新开会话
003 -> 004：新开会话
schema -> repo/usecase：新开会话
repo/usecase -> API/RBAC：新开会话
API/RBAC -> UI：新开会话
```

## 什么时候继续原 Codex 会话

同一个 Goal 内的补漏可以继续原会话。

例如：

```text
修复当前 Goal 的测试失败
补充当前 Goal 要求但遗漏的文件
修复 .codex-review/latest.md
修正当前 Goal 输出格式
```

## 每轮必须生成审查报告

每轮 Codex 任务完成后，必须生成：

```text
.codex-review/latest.md
```

`.codex-review/` 是本地临时审查交接产物，不提交进 Git；长期记录应进入具体 Goal 文件、`progress.md` 或正式文档。

审查报告格式必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户应该可以用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

## Goal 文件命名规则

使用数字前缀：

```text
000-phase0-foundation.md
001-overnight-phase1-masterdata-order-review.md
002-schema-design-final-review.md
003-v1-ent-schema-customers-suppliers-orders.md
004-v1-migration-and-ent-generate.md
005-v1-repo-usecase-masterdata.md
006-v1-repo-usecase-sales-order.md
007-v1-api-rbac-masterdata-order.md
008-v1-frontend-masterdata-order-pages.md
009-business-records-transition-audit.md
010-current-customer-data-import-draft.md
```

## Goal 文件建议结构

可以先复制 `docs/codex-goals/_goal-file-template.md`，再按本轮目标删减或补充。

每个 goal 文件建议包含：

```text
目标
任务名称
任务性质
背景
必须先读
当前真源与非真源
允许修改的文件
禁止修改的文件
改动范围分级
成功标准
停止条件
Git 策略
测试分层选择
验收命令
审查报告输出要求
最终回复格式
```

## 项目长期边界

所有 goal 文件都必须保留以下项目边界，除非经过单独评审：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把 `current` 客户资料写成 Product Core 规则。
- 不让 Workflow 写库存、出货、财务、应收、应付、发票、收付款事实。
- `shipping_released != shipped`。
- `workflow task done != fact posted`。
- `business_records` 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

## 给 GPT 的复盘方式

Codex 完成后，用户只需要执行：

```bash
cat .codex-review/latest.md | pbcopy
```

然后把内容粘贴给 GPT。

不需要截图。
