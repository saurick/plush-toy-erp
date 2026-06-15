# 岗位任务端原型 / Mobile Role Tasks Prototype

本目录归档岗位任务端改版时使用的三张 PNG 原型图。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `implemented-reference.html` | 当前实现参考：覆盖待办 / 已办 / 消息 / 我的、主筛选、分批展开、任务详情、现场留痕、原因面板和底部动作栏。 |
| `images/mobile-role-tasks-list-reference.png` | 早期视觉方向 / 历史参考：待办列表页参考，包含岗位胶囊、刷新、同步信息、四项指标、筛选、任务列表和底部导航。 |
| `images/mobile-role-task-detail-reference.png` | 早期视觉方向 / 历史参考：任务详情页参考，包含任务关键信息、风险提示、关联单据、最近动态、原因输入和底部动作栏。 |
| `images/mobile-role-risk-dashboard-reference.png` | 早期视觉方向 / 历史参考：风险分组页参考，包含今日必须处理、卡点、等待他人、催办和已完成等分组。 |

## HTML 口径

当前补充一个“当前实现参考”HTML，不把三张 PNG 分别机械转成三份 HTML。

原因：

- 这批 PNG 已作为岗位任务端改版参考，真实实现入口已经落到 `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx`，且与早期 PNG 略有差异。
- `implemented-reference.html` 用于记录真实页面吸收早期方向后的 as-built 形态。
- 真实页面继续以运行时代码、自动化测试和浏览器回归结果为准，HTML 只作为可打开的设计参考。
- 若后续要重新设计岗位任务端 v2，应基于当前真实页面和新目标重新做可交互 HTML 原型，而不是机械复刻历史 PNG。

## 边界

- 本目录只保存设计参考，不进入 `web/src`、菜单、路由或生产构建。
- 图片不是业务规则、权限规则、Workflow 状态或 Fact 事实真源。
- 若图片里的字段、状态、按钮或分组与代码、测试、`docs/当前真源与交接顺序.md` 或 Workflow / Fact 边界文档冲突，优先按正式文档和当前代码收敛。
