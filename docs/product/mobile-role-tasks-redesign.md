# 移动端岗位任务页改版 / Mobile Role Tasks Redesign

本文记录移动端岗位任务页改版的设计参考落点和实现边界，避免后续只能从聊天记录里找原型图。

## 设计参考

| 原型文件 | 参考重点 | 当前状态 |
| --- | --- | --- |
| `docs/assets/mobile-role-tasks/mobile-role-tasks-list-reference.png` | 列表页：岗位胶囊、刷新、同步信息、四项指标、筛选、任务列表、底部导航 | 待补原图 |
| `docs/assets/mobile-role-tasks/mobile-role-task-detail-reference.png` | 详情页：任务关键信息、风险提示、关联单据、最近动态、原因输入、底部动作栏 | 待补原图 |
| `docs/assets/mobile-role-tasks/mobile-role-risk-dashboard-reference.png` | 风险分组页：今日必须处理、卡点、等待他人、催办等分组 | 待补原图 |

## 已采用方向

- 默认态采用“移动优先任务列表”，优先让岗位人员快速看到待处理任务、预警、超时和阻塞原因。
- 点选任务进入详情态，集中展示关键信息、关联单据、最近动态和操作原因输入。
- 底部保留移动端导航感，但当前不把这些导航文案升级为新的权限或路由真源。
- 暗色模式继续遵循 ERP theme token，不单独引入只服务原型图的色系。

## 实现边界

- 当前实现入口：`web/src/erp/mobile/pages/MobileRoleTasksPage.jsx`。
- 移动端外壳入口：`web/src/erp/mobile/MobileAppLayout.jsx`。
- 移动端暗色覆盖：`web/src/erp/styles/app.css` 中 `.mobile-app-layout` 范围内规则。
- 状态更新、阻塞、退回、完成、催办仍复用现有 `moveTask` / `urgeTask` 主路径。
- 本改版不改变后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或事实层。

## 非真源说明

原型图不是业务真源。若图片里的字段、状态、按钮或分组与代码、测试、`docs/current-source-of-truth.md`、Workflow / Fact 边界文档冲突，优先按正式文档和当前代码收敛。

