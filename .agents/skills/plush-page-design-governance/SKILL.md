---
name: plush-page-design-governance
description: 项目页面治理（plush-toy-erp）。Use to assess or change ERP page tasks, fields, actions, layout, and browser regressions; customer print sources and PDF fidelity use print governance.
---

# Plush Page Design Governance

从当前任务的 checkout / Worktree 内用 `git rev-parse --show-toplevel` 核对仓库根；下文命令以该根目录为工作目录，仓库内引用也相对它解析。

让页面的岗位任务、字段、动作和反馈清楚可用，并保持后端能力、Workflow / Fact、RBAC 与菜单真源一致。评估默认只给结论；实现请求连续完成当前授权范围及必要验证。

## Project Page Gates

- 每个可见元素都应支持岗位判断、动作或反馈；重复入口和装饰信息按任务价值合并、降级或删除。
- 页面不能补造业务事实、掩盖后端或权限缺口，也不能以局部字段映射替代共享真源。
- 减少密度依靠任务分组、优先级、可读标签和交互，保留必要状态、错误及关键约束。
- 复用设计系统和共享业务组件。布局或交互变化必须以真实浏览器证据和 DOM / box metrics 验证，覆盖受影响的默认、交互、恢复、边界与相邻区域；主题、移动端和共享组件按实际影响扩大范围。
- 纸面模板及 PDF 保真使用 `$plush-print-template-source-governance`。需要改变 API / RBAC / schema / Workflow / Fact 时转入领域技能继续已授权工作，新增范围才询问。

## Select the Relevant Detail

| 当前任务 | 必要读取 |
| --- | --- |
| 页面任务、字段、动作、状态、密度、原型 | [Page Semantics](references/page-semantics.md) |
| 布局、主题、弹窗、键盘、运行交互、浏览器验证 | [Page Implementation](references/page-implementation.md) |
| 纯文档 / Skill 修改 | 文本、metadata、引用和 scoped diff 检查 |

只加载命中的分支。原型未变化且仍准确时不机械同步；小改动不强制检查全部页面或固定截图数量，高成本验证遵循 `$plush-test-governance`。

## Workflow

1. Establish the page state and truth source.
   - Determine whether the work is Draft, To Implement, or Current.
   - Read the relevant current truth before editing: project `AGENTS.md`, `docs/当前真源与交接顺序.md`, `web/README.md`, and `docs/product/prototypes/README.md` when prototypes are involved.
   - Inspect the real runtime page and existing components when the task touches layout, density, spacing, styles, interactions, or visible page structure.

2. 根据影响面读取上表的语义或实现分支，在现有组件、helper 和真实后端能力上修改。
3. 按 `$plush-test-governance` 与 affected 计划完成相关检查。字段变化核对覆盖、清空和缺值；交互变化核对实际动作、请求生命周期、焦点和恢复；仅在新改动、失败或未解决风险需要时扩圈或重跑。

## Deliverable Standard

结论先行，说明页面行为或信息结构的变化、修改文件、实际验证和盲区。原型、字段链或权限边界仅在本次相关时展开；不逐项填报未触达内容。
