---
name: plush-page-design-governance
description: 项目页面治理（plush-toy-erp）。Use to assess or change ERP and engineering workbench pages, shared page patterns, tasks, fields, actions, layout, and browser acceptance; customer print sources and PDF fidelity use print governance.
---

# Plush Page Design Governance

从当前任务的 checkout / Worktree 内用 `git rev-parse --show-toplevel` 核对仓库根；下文命令以该根目录为工作目录，仓库内引用也相对它解析。

让页面的岗位任务、字段、动作和反馈清楚可用，并保持后端能力、Workflow / Fact、RBAC 与菜单真源一致。评估按用户要求交付结论、图示或交互原型；实现请求连续完成当前授权范围及必要验证。

<a id="page-gates"></a>

## Project Page Gates

- 每个受影响元素都应支持岗位判断、动作或反馈；优化先按[信息密度与减法](references/page-semantics.md#density-and-subtraction)检查删除、合并和按需查看，保留已有好用布局与交互。
- 工作台和 ERP 的图、表、步骤和短说明先读[选择表达](../../../docs/engineering/可视化表达规范.md#visualization-choices)，按读者任务和可用证据选用；展示与返回按[页内理解与上下文](../../../docs/engineering/可视化表达规范.md#页内理解与上下文--in-context-reading)核对。
- 生成或调整 Mermaid 时按[布局方向](../../../docs/engineering/可视化表达规范.md#diagram-direction)在源码或模型中显式选向，并核对实际容器；保留订单阶段导航、手机帮助与打印各自的阅读合同。
- 涉及可视化时按[图形关键信息](../../../docs/engineering/可视化表达规范.md#chart-inspection)落实 hover、键盘 focus 与手机点按的同等提示；核验数值／单位／口径、权限边界、关闭和原有下钻，避免只给桌面悬停。
- 页面不能补造业务事实、掩盖后端或权限缺口，也不能以局部字段映射替代共享真源。
- 任务详情、流程/异常追踪及 ERP 桌面与手机一致性，按 [任务聚焦与两端一致](references/page-semantics.md#task-focus-and-cross-device-parity) 核对信息层级、入口和实际结果。
- 复用设计系统和共享业务组件，按 [Visual Finish](references/page-implementation.md#visual-finish) 保留简洁页面的视觉完成度。布局或交互变化必须以真实浏览器证据和 DOM / box metrics 验证，覆盖受影响的默认、交互、恢复、边界与相邻区域；主题、移动端和共享组件按实际影响扩大范围。
- 新增或修改 Tab、分段切换和自定义页签时，使用项目共享导航组件并让页签条在视图切换期间保持挂载；只替换下方内容，不在各内容分支内重复创建页签。具体组件和动效验证见 [Page Implementation](references/page-implementation.md)。
- 纸面模板及 PDF 保真使用 `$plush-print-template-source-governance`。需要改变 API / RBAC / schema / Workflow / Fact 时转入领域技能继续已授权工作，新增范围才询问。

## Select the Relevant Detail

| 当前任务 | 必要读取 |
| --- | --- |
| 页面任务、字段、动作、状态、密度、交互设计 | [Page Semantics](references/page-semantics.md) |
| 动作、筛选、页签或页面数据规模增长 | [功能与数据增长](references/page-semantics.md#page-growth) |
| 布局、主题、弹窗、键盘、运行交互、浏览器验证 | [Page Implementation](references/page-implementation.md) |
| 效能工作台页面、统一设计、信息密度与复用 | [工作台页面组合](references/page-implementation.md#workbench-patterns)及其正式设计引用 |
| 纯文档 / Skill 修改 | 文本、metadata、引用和 scoped diff 检查 |

只加载命中的分支。设计同步按 [Design Sync](references/page-semantics.md#design-sync) 判断，按需读取相关章节及 HTML 片段；小改动不强制检查全部页面或固定截图数量，高成本验证遵循 `$plush-test-governance`。

<a id="page-workflow"></a>

## Workflow

1. Establish the page state and truth source.
   - 写组件前按[组件复用与使用入口](../../../docs/engineering/前端实现与交互约定.md#组件复用与使用入口--shared-component-entrypoints)核对职责、正式入口及真实调用；先复用或扩展现有实现，确需独立实现时说明不能合理共用的原因。检查同时覆盖组件与调用页面，不以组件单测通过推定页面已正确复用。
   - 分开核对设计意图与当前代码、测试及运行证据，不以设计稿存在推定已实现。
   - 范围或页面入口不清时，用 `docs/当前真源与交接顺序.md` 与 `web/README.md` 定位；涉及交互设计时才读 `docs/product/ui-design/README.md` 与相关页面族说明。
   - Inspect the real runtime page and existing components when the task touches layout, density, spacing, styles, interactions, or visible page structure.

2. 根据影响面读取上表的语义或实现分支，在现有组件、helper 和真实后端能力上修改。样式变更按实现分支核对属性归属、竞争声明及模块/portal 作用域，并使用现有静态边界和浏览器断言守住。
3. 按 `$plush-test-governance` 与 affected 计划完成相关检查。字段变化核对覆盖、清空和缺值；交互变化核对实际动作、请求生命周期、焦点和恢复；仅在新改动、失败或未解决风险需要时扩圈或重跑。

<a id="page-output"></a>

## Deliverable Standard

结论先行，说明页面行为或信息结构的变化、修改文件、实际验证和盲区。设计同步、字段链或权限边界仅在本次相关时展开；不逐项填报未触达内容。

## 执行流程 / Execution Guide

### 任务与方案 / understand

先明确页面承担的判断和动作；评估与原型只给设计输入，实施依照当前授权。

```mermaid
flowchart LR
  task["明确页面<br/>任务"]
  runtime["读取真实<br/>页面"]
  design["选择现有<br/>组合"]
  prototype["验证方案<br/>取舍"]

  task --> runtime
  runtime --> design
  design -->|需要比较| prototype
  prototype -->|需调整| design
```

- `task` [明确页面任务](#page-gates)
  - 前置条件：已有用户目标、痛点或问题截图。
  - 具体操作：写清当前角色要判断什么、完成什么动作及预期反馈，区分评估、原型与实施。
  - 完成标准：每个元素有任务用途，原有有效能力和权限边界已识别。
  - 失败处理：目标含糊时先核对现场和上下文，只询问无法自行确定的关键取舍。
- `runtime` [读取真实页面](#page-workflow)
  - 前置条件：页面入口与当前环境可核实。
  - 具体操作：后台打开实际页面，检查 DOM、computed style、覆盖链、父子盒模型、滚动、溢出及响应式；定位真实消费者。
  - 完成标准：问题有可复现状态和几何或交互依据。
  - 失败处理：页面不可达时定位环境并保留未验证；不凭截图猜选择器叠补丁。
- `design` [选择现有组合](#page-gates)
  - 前置条件：已明确任务与现有样式归属。
  - 具体操作：查统一页面样板和共享组件，决定保留、合并或按需查看；流程、关系、数值按表达任务选形式。
  - 完成标准：方向能复用既有设计语言，新增复杂度有具体收益。
  - 失败处理：共享能力不足时说明缺口并扩展正确归属层，不按页面复制样式。
- `prototype` [验证方案取舍](#page-gates)
  - 前置条件：布局、导航或流程存在实质取舍。
  - 具体操作：做能操作的方案比较，验证主要动作、失败恢复与返回；方向明确的小修正直接进入实施专题。
  - 完成标准：取舍及保留能力清楚，原型与正式运行证据分开。
  - 失败处理：原型通道或交互不可用时报告具体缺口，不能把静态图当可交互结果。

### 实现与浏览器验收 / implement

在已授权范围内完成主路径和相关文档，按真实影响验证页面。

```mermaid
flowchart LR
  reuse["核对实现<br/>边界"]
  change["修改<br/>主路径"]
  verify["验证真实<br/>交互"]
  finish["同步<br/>与交付"]

  reuse --> change
  change --> verify
  verify -->|通过| finish
  verify -->|缺陷| change
```

- `reuse` [核对实现边界](#page-workflow)
  - 前置条件：实施方向和允许路径已明确。
  - 具体操作：检查组件真实调用、数据真源和共享样式归属；后端事实或打印能力变化切入对应治理，沿用现有授权。
  - 完成标准：组件、样式和业务责任唯一，不让页面补造事实。
  - 失败处理：发现 API、权限或真源缺口时先修所属主路径，不通过临时前端状态掩盖。
- `change` [修改主路径](#page-workflow)
  - 前置条件：已定位唯一实现与相关消费者。
  - 具体操作：复用共享组件；修改样式时删除竞争声明，导航保持稳定挂载，错误与空态沿统一处理入口。
  - 完成标准：正常、清空、来源切换和异常恢复都有明确行为。
  - 失败处理：出现层叠冲突或副作用时回查属性归属，不增加提权选择器或隐藏实例。
- `verify` [验证真实交互](#page-workflow)
  - 前置条件：代码和同名检查已可运行。
  - 具体操作：按影响验证默认、交互、恢复、长文本、异常媒体及相邻区域；共享变化核对样板和实际消费者。
  - 完成标准：目标路径可完成，布局、焦点、滚动和权限结果正确，测试摘要完整。
  - 失败处理：失败先定位主路径，修复后只复验受影响范围；环境缺失明确保留。
- `finish` [同步与交付](#page-output)
  - 前置条件：页面行为已有足够验证。
  - 具体操作：同步对应交互说明和必要测试，报告改动、实际证据与盲区，保留精确 Git 交接。
  - 完成标准：设计、实现与运行结果一致，未宣称客户或发布验收。
  - 失败处理：仍有未解风险时说明位置、影响及下一步，不用截图数量代替任务完成。
