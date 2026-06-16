# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录；本轮不改归档内容。

## 当前活跃事项

- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；本轮只做前端结构拆分、样式拆分和验证脚本同步，不改变 Workflow / Fact 边界、schema、migration、后端 API、RBAC 或菜单。
- `MobileRoleTasksPage.jsx` 不再承接所有规则、样式和动作编排：展示页、动作 hook、纯规则 model、页面专属 CSS 已分层，后续继续拆分应优先沿这些边界推进。
- 当前工作区仍有大量非本轮并行改动；本轮未回退、删除、格式化或提交这些改动。

## 2026-06-16 23:03 CST 移动任务页可维护性二次拆分

- 完成：在上一轮纯规则和 CSS 拆分基础上，新增 `web/src/erp/mobile/hooks/useMobileRoleTaskActions.js`，把移动任务完成、阻塞、催办、财务跟进、委外回货、成品入库、出货财务和应付对账等动作编排从 `MobileRoleTasksPage.jsx` 中迁出。
- 完成：`MobileRoleTasksPage.jsx` 进一步收缩到 1330 行；动作 hook 850 行，纯规则 model 467 行，专属 CSS 658 行。页面现在主要负责加载任务、筛选态、布局和展示组合，动作副作用集中在 hook，任务展示规则集中在 model。
- 完成：同步调整 `purchaseInboundFlow.test.mjs`、`orderApprovalFlow.test.mjs`、`outsourceReturnFlow.test.mjs`、`finishedGoodsFlow.test.mjs` 的源码扫描断言，继续守住移动端不本地创建下游任务、状态映射和 Workflow / Fact 边界。
- 完成：为配合当前 dashboard 标题现场和构建验收，修正 `DashboardPage.jsx` 里现有 JSX 闭合残留，并把 `style:l1` 中 dashboard 初始标题断言同步到当前可见标题“工作台”；不改变 dashboard 业务语义。
- 验证：目标 ESLint（不带 fix）、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web test`（320 tests）、相关 `node --test`（44 tests）、`STYLE_L1_SCENARIOS=mobile-tasks-dark,mobile-tasks-browser-back-stays-mobile pnpm --dir web style:l1`、`pnpm --dir web build`、`git diff --check` 均通过。
- 下一步：如果继续压缩复杂度，优先把 `useMobileRoleTaskActions.js` 内的业务族动作拆成更小的 follow-up service/helper，例如 `shipmentFinance`、`payableReconciliation`、`outsourceReturn`、`finishedGoods`；不要在同一轮混入后端 usecase 或事实层行为改造。
- 阻塞/风险：`useMobileRoleTaskActions.js` 仍有 850 行，已经比页面大泥团更可维护，但还不是最终形态；当前只是前端结构拆分，未新增后端能力，也未执行部署或目标环境验证。`pnpm --dir web lint` 未直接执行，因为该脚本会全量 `eslint --fix` 且当前工作区已有大量并行未提交改动，本轮使用目标 ESLint 避免扩大 diff。
