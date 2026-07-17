# 指标卡交互语义样板 / Metric Card Interaction Standard

本目录保存后台指标组件的待实现语义样板。目标不是统一成同一种卡片，而是让只读、筛选、跳转和执行命令从元素类型到视觉反馈都保持一致。

## 阶段与文件

- 阶段：待实现 / To Implement
- 归属：产品内核 / Core
- 原型：`index.html`
- 适用：工作台、任务看板、业务看板和业务列表页中的指标组件

## 基础语义

| 用途 | 必须使用 | 默认反馈 | 关键状态 |
| --- | --- | --- | --- |
| 只读摘要 | `div` | default 光标、无 hover 抬升、无键盘焦点 | normal / loading / zero / error |
| 筛选当前列表 | `button` | hover、focus、`aria-pressed` | default / selected / disabled / recovery |
| 进入目标页面 | `a href` | hover、focus、默认“进入”信号 | default / visited / unavailable |
| 执行命令 | `button` | hover、focus、loading 与结果反馈 | default / disabled / loading / recovery |

不得为了视觉统一把所有指标做成可点击卡，也不得给 `div` 补 `role="button"`、`tabindex="0"` 或空 `onClick` 冒充真实操作。

## 状态规则

- Hover：只属于真实可交互元素；只读摘要不抬升、不改变边框来暗示可点。
- Focus：按钮和链接必须有独立可见的 focus ring，不依赖 hover。
- Selected：筛选按钮使用 `aria-pressed="true"` 与稳定选中面，不能只改变数字颜色。
- Disabled：使用真实 `disabled`，同时说明当前条件不满足；禁用态不响应 hover。
- Loading：执行按钮进入 `aria-busy="true"` 并阻止重复触发；只读统计使用骨架或明确加载文案。
- Zero：只有来源成功且数量确实为零时显示 `0`，并说明“当前无记录”。
- Error：来源失败时显示 `— / 暂不可用`，不能显示 0。
- Recovery：重试是独立真实按钮，必须经历 loading 并把恢复结果通过 `aria-live` 告知用户。

## 原型交互

- 三张基础语义卡分别使用真实 `div`、`button` 和 `a href`。
- 筛选示例可在三项之间切换，当前项同步 `aria-pressed`、动作信号和结果摘要。
- “清除筛选”会恢复全部结果并进入禁用态；它不是静态装饰按钮。
- “同步当前视图”演示 command button 的默认、loading 和 recovery。
- “重新加载”演示只读错误卡与独立重试按钮的 error、loading 和 recovered。
- 页面内链接会跳到真实锚点目标并转移键盘焦点。

## 当前运行时吸收口径

- `/erp/business-dashboard` 顶部业务摘要：只读统计语义。
- `/erp/task-board` 顶部任务指标：筛选按钮语义。
- 工作台当前任务关联记录：普通链接或按钮语义，不作为指标卡。
- 来源不可用时必须显示 `— / 暂不可用`；真实零值才显示 0。

本资产仍是 To Implement，不证明所有运行时页面已经吸收完整状态和键盘行为。

## 响应式、暗色与键盘

- 980px 以下三类语义示例改为单列，状态示例改为两列；680px 以下全部单列。
- 表格只在自身容器内横向滚动，不造成页面级横向溢出。
- 浅色与暗色均覆盖 normal、selected、disabled、loading、zero、error 和 recovery。
- 所有真实按钮和链接都可通过 Tab 到达；focus ring 在两种主题下可见。
- `prefers-reduced-motion` 下关闭抬升过渡和加载动画的持续循环。

## 进入真实实现前

1. 先写明指标会产生什么结果：无结果、筛选、导航还是命令。
2. 再选择 `div`、`button` 或 `a`，不要由视觉样式反推语义。
3. 明确数据来源的 loading、zero、error 和 recovery，不把失败吞成 0。
4. 核对权限、路由、列表状态、URL 状态和请求生命周期。
5. 用真实浏览器检查 hover、focus、selected、disabled、loading、暗色和窄屏。

## 不在本原型内

- 不新增正式菜单、路由、RBAC、后端 API、schema、migration 或 Fact 写入。
- 不把演示数字、定时器或页面内锚点复制成运行时业务逻辑。
- 不要求所有统计都变成卡片或按钮；扫描型数据优先使用表格。
