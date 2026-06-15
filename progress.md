# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`：归档截至 2026-06-11 14:06 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 395 行 / 80005 bytes，接近并按项目约定视为达到 80KB 归档边界；本轮补 UI 极简不改语义规则前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-12-before-formal-menu-candidate-prototype.md`：归档截至 2026-06-12 18:29 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 425 行 / 81740 bytes，超过 80KB 阈值；本轮补正式菜单候选原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-13-before-workbench-prototype-redesign.md`：归档截至 2026-06-13 19:59 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 385 行 / 81720 bytes，达到 80KB 归档边界；本轮重做工作台原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-14-before-business-modal-alignment.md`：归档截至 2026-06-14 18:20 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 369 行 / 80362 bytes，达到 80KB 归档边界；本轮继续统一业务新建 / 编辑弹窗前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接，不再内嵌“看板中心 / 运营工具”卡片导航，也不把核心区域做成跳转入口集合；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessListLayout` 已承接正式业务页共享骨架；`客户档案`、`供应商档案` 和 `销售订单` 使用 V1 页面，`产品档案`、`BOM 管理`、采购、入库、质检、库存、委外、生产、出货和财务等 16 个 `formal-shell` 菜单统一使用 `FormalBusinessModulePage`。共享骨架已收口紧凑筛选、列表统计、列顺序、列排序、导出、批量删除、回收站、行点击选中、双击进入编辑 / 主操作弹窗、显式详情、当前操作和协同入口；formal-shell 新建 / 编辑现在统一走只读业务表单弹窗，真实保存仍待领域 usecase / API / RBAC 接入；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、任务中心、业务管理中心、产品核心菜单覆盖矩阵、正式菜单候选导航、业务模块列表页、业务详情页、页面级新建 / 编辑表单、业务页协同入口组件、业务弹窗和模板打印中心十一个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：`admin-command-center-v1` 是判断型工作台样板，`core-menu-coverage-v1` 是内部覆盖矩阵，`formal-menu-candidate-v1` 是正式菜单候选原型；它们都不是正式菜单、路由、权限或 seedData 映射表，真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-14 17:27 CST

- 完成：修正 formal-shell 业务页行双击语义。`FormalBusinessModulePage` 现在单击行仍只选中记录，双击行走与“编辑”按钮一致的业务动作弹窗；显式“详情”按钮继续打开详情抽屉。弹窗新增当前边界说明，强调 formal-shell 真实保存必须等领域 usecase、API 和 RBAC 接入，不能由前端本地伪造事实。
- 完成：同步正式文档口径。`docs/current-source-of-truth.md`、`web/README.md` 和 `docs/product/formal-menu-entry-plan.md` 均改为“显式详情、双击 / 编辑动作提示”，避免后续继续把双击默认理解成详情抽屉。
- 验证：已执行 `node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/pages/FormalBusinessModulePage.jsx web/scripts/styleL1.mjs docs/current-source-of-truth.md web/README.md docs/product/formal-menu-entry-plan.md progress.md`，均通过；前端测试 308 个用例通过，目标 L1 通过 1 个场景。
- 下一步：如果继续把 formal-shell 推向真实完成，应按模块补字段、保存 usecase、JSON-RPC、RBAC、删除 / 回收站真实持久化和测试；库存台账仍应通过盘点 / 调整 / 调拨等受控动作改事实，不能直接编辑台账余额。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、库存事实写入、菜单 seed、部署、提交或推送。当前工作区已有其他未提交改动，本轮只在相关文件上增量修改并保留现场。

## 2026-06-14 18:20 CST

- 完成：按原型、`trade-erp` 和线上 yoyoosun 对照继续统一业务新建 / 编辑弹窗。正式业务壳 `FormalBusinessModulePage` 的新建和编辑不再使用 560px 提示确认框，统一改为 `erp-business-action-modal--form` 业务表单弹窗；表单展示业务编号、标题、状态、责任角色、主事实 / 真源、来源表、字段范围和当前边界，保存按钮保持禁用，避免前端本地伪造事实。
- 完成：V1 `客户档案`、`供应商档案`、`联系人` 和 `销售订单` 新建 / 编辑弹窗宽度收敛到 `min(960px, calc(100vw - 96px))`，并设置 `maskClosable={false}`，对齐 `trade-erp` 的表单弹窗和遮罩不误关闭口径。业务表单 CSS 改为自适应多列，补齐浅色 / 暗色下 disabled 输入框样式。
- 完成：`style:l1` 增加 formal-shell “新建库存调整”表单弹窗断言，并强化双击编辑必须命中业务表单弹窗、字段数充足且不能打开详情抽屉。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；前端测试 309 个用例通过，目标 L1 通过 1 个场景。Playwright 直连本地 `/erp/warehouse/inventory` 验证：新建库存弹窗为业务表单弹窗，宽 1120px，8 个字段，无 body 横向溢出，底部“待接入后启用”按钮禁用；双击 `INVENTORY-002` 后打开编辑业务表单且未出现详情抽屉。
- 下一步：后续如果要把 formal-shell 的新建 / 编辑从只读表单推进为真实保存，必须逐模块补领域 usecase、JSON-RPC、RBAC、审计、字段残值 / 缺值防护和 L1 / 单测；库存台账仍不能直接编辑余额事实。
- 阻塞/风险：线上 `https://admin.yoyoosun.net/` 当前仍是旧 AntD 默认窄弹窗，不能作为本轮复制目标；本轮按原型和 `trade-erp` 的业务表单弹窗口径收齐本地实现。未改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实删除 / 回收站持久化、部署、提交或推送。当前工作区仍有多处非本轮改动，本轮只保留并增量修改相关路径。

## 2026-06-14 17:46 CST

- 完成：继续把双击行语义扩展到全部正式业务页。`客户档案`、`供应商档案` 和 `销售订单` V1 页面现在单击行仍只选中记录，双击行进入同一个编辑弹窗；显式“查看详情”按钮继续打开详情抽屉。
- 完成：补充业务页 L1 回归，覆盖供应商、客户、销售订单和 formal-shell 库存台账：双击行必须打开编辑 / 主操作弹窗且不能打开详情抽屉，显式详情入口仍打开详情抽屉。同步 `docs/current-source-of-truth.md`、`web/README.md` 和业务模块标准页原型 README，明确编辑 / 主操作优先弹窗，详情抽屉只作显式只读核对。
- 验证：已执行 `node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/pages/V1MasterDataPage.jsx web/src/erp/pages/V1SalesOrdersPage.jsx web/src/erp/pages/FormalBusinessModulePage.jsx web/scripts/styleL1.mjs docs/current-source-of-truth.md web/README.md docs/product/prototypes/business-module-page-standard-v1/README.md progress.md`，均通过；前端测试 308 个用例通过，目标 L1 通过 1 个场景。直接自启 `style:l1` 曾受 4173 端口残留影响失败，已改用现有 5175 dev server 完成同一场景回归。
- 下一步：后续若新增业务列表页，应沿用单击选中、双击编辑 / 主操作弹窗、显式详情抽屉的交互口径，并按页面级回归补断言。
- 阻塞/风险：本轮不新增真实保存能力、不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、库存 / 出货 / 财务事实写入、部署、提交或推送；当前工作区仍有其他未提交改动，本轮只保留并增量修改相关路径。

## 2026-06-14 17:54 CST

- 完成：按“创建时间”追问补齐当前正式业务前端的只读审计展示。`客户档案`、`供应商档案` 主列表 / 导出 / 详情增加创建时间和更新时间；`销售订单` 和订单行列表 / 导出增加创建时间和更新时间，销售订单详情同步显示；formal-shell 正式入口壳样例行、列表、导出和详情增加创建时间；业务事实处理内部页列表增加创建时间。
- 完成：新增 `formatUnixDateTime` 共享格式化函数并补单测。创建时间仍是后端返回的系统审计字段，不进入新建 / 编辑表单输入项，不改保存参数，不改领域 usecase，不新增 migration。为恢复本轮浏览器回归，顺手稳定化 `style:l1` 业务行详情 Drawer 清理动作和一处既有 lint 字符串拼接。
- 验证：`pnpm --dir web exec prettier --write ...`、`pnpm exec eslint --ext .js --ext .jsx scripts/styleL1.mjs src/erp/utils/masterDataOrderView.mjs src/erp/utils/masterDataOrderView.test.mjs src/erp/pages/V1MasterDataPage.jsx src/erp/pages/V1SalesOrdersPage.jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/pages/OperationalFactsPage.jsx`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_PORT=4174 STYLE_L1_SCENARIOS=business-module-dark-customers-desktop,business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；目标 L1 通过 2 个场景，前端测试 308 个用例通过。全量 `style:l1` 仍受 dev-docs Mermaid 场景影响，本轮用受影响业务页面过滤场景收口。
- 下一步：如果要继续把创建时间推进到采购入库、质检、库存批次、财务事实等后端事实页，需要先为对应正式页面建立字段配置 / 详情抽屉 / L1 场景；不要在新建表单里加入可编辑创建时间。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、库存 / 出货 / 财务事实写入、菜单 seed、部署、提交或推送。联系人明细表本轮未单独增加创建时间，因为它当前作为主数据主体下的维护明细展示，继续保持信息密度；业务事实处理页没有现成 L1 场景，只通过目标 ESLint、全量单测、CSS 和已登记业务页面 L1 间接验证。

## 2026-06-14 18:10 CST

- 完成：修复截图中的管理员权限同步误报。`persistAuthMeta` 写入 `roles / permissions / menus / erp_preferences` 等本地 metadata 时改为 best-effort，`localStorage` 满额或被浏览器拒绝时不再抛出到 `ERPLayout` 的 `admin.me` 同步链路；页面仍使用后端返回的最新 profile，缓存失败只影响下次离线 / 同步失败时可用的本地兜底。
- 完成：新增 `auth` 单测覆盖 `admin_menus` 写入抛 `QuotaExceededError` 时 `persistAuthMeta` 不抛异常，且其他可写 metadata 仍正常保存。
- 验证：`node --test web/src/common/auth/auth.test.mjs`、`pnpm --dir web exec eslint --ext .js --ext .jsx src/common/auth/auth.js src/common/auth/auth.test.mjs`、`pnpm --dir web test`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-center-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/common/auth/auth.js web/src/common/auth/auth.test.mjs` 均通过；Playwright 复现 `admin_menus` 写入 quota 异常并打开 `/erp/print-center?template=material-purchase-contract`，页面可见打印中心，控制台无 `管理员权限同步失败`、`QuotaExceededError` 或 `admin_menus` 相关 warning / error。
- 下一步：如果仍有用户浏览器 localStorage 被历史大草稿占满，应单独评审是否增加偏好 / 草稿缓存清理入口；本轮先保证认证同步主路径不被 best-effort 缓存拖垮。
- 阻塞/风险：本轮只改前端通用认证 metadata 缓存和对应测试；不改 token 持久化语义、后端 `admin.me`、RBAC、菜单权限、schema / migration、打印模板、PDF、部署、提交或推送。当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理、未纳入结论。

## 2026-06-14 18:11 CST

- 完成：按截图全局收口桌面后台重复标题。`ERPLayout` 现在把工作台、任务看板、业务看板、异常 / 阻塞闭环、模板打印中心和权限管理识别为自包含页面，不再渲染共享 page-head；看板中心页面内部删除 `ERP / ...` 小标题，只保留外层全局面包屑和页面主标题，避免出现两套“ERP / 当前页”。
- 完成：`style:l1` 新增 `assertNoDuplicatedAdminPageTitle`，覆盖桌面、移动和暗色相关场景，断言自包含页面没有 `.erp-admin-page-head`，内容区也不再渲染 `ERP / ...` 式重复面包屑。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、目标 ESLint（`scripts/styleL1.mjs`、`ERPLayout.jsx`、`DashboardPage.jsx`、`BusinessDashboardPage.jsx`）、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-dashboard-desktop,erp-business-dashboard-desktop,erp-exception-flow-desktop,permission-center-desktop,print-center-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=erp-dashboard-mobile,erp-task-board-mobile,erp-business-dashboard-mobile,erp-dashboard-dark-desktop,erp-task-board-dark-wide-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/components/ERPLayout.jsx web/src/erp/pages/DashboardPage.jsx web/src/erp/pages/BusinessDashboardPage.jsx web/scripts/styleL1.mjs` 均通过；前端单测 308 个用例通过，目标 L1 共 11 个场景通过。
- 下一步：后续新增桌面后台页面时，如果页面自身已有标题 / 摘要 hero，应同步加入自包含 page-head 规则和 L1 断言；不要在页面内容区再写 `ERP / ...` 小面包屑。
- 阻塞/风险：`pnpm --dir web lint` 全量失败在既有 `web/src/erp/pages/V1SalesOrdersPage.jsx` 的 `itemModalOpen / saveItem / setItemModalOpen / itemForm / SalesOrderItemFormFields` 未定义，不属于本轮标题重复修复；in-app Browser 可打开本地页面但未登录目标页，截图接口仍 `Page.captureScreenshot` 超时，本轮可见回归以通过的 Playwright `style:l1` DOM / 盒模型断言为准。本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、业务字段、菜单 seed、部署、提交或推送。

## 2026-06-14 18:20 CST

- 完成：继续收口正式业务页头重复信息。共享 `PageHeaderCard` 不再接收或渲染 `sectionTitle`，`客户档案`、`供应商档案`、`销售订单` 和 formal-shell 业务页不再在标题上方显示“基础资料 / 销售链路 / 正式业务入口”等业务域小标题；保留外层面包屑、页面主标题、说明文案和只读摘要统计。
- 完成：`style:l1` 新增 `assertBusinessHeaderHasNoSectionTitle`，在业务页连续回归里覆盖客户、销售订单、产品档案和 BOM，断言业务页 header 不再出现分组小标题，也不再包含这类重复分组文案。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web exec eslint --ext .js --ext .jsx scripts/styleL1.mjs src/erp/components/business-list/BusinessListLayout.jsx src/erp/pages/V1MasterDataPage.jsx src/erp/pages/FormalBusinessModulePage.jsx`、`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1SalesOrdersPage.jsx`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、`git diff --check -- web/src/erp/components/business-list/BusinessListLayout.jsx web/src/erp/pages/V1MasterDataPage.jsx web/src/erp/pages/V1SalesOrdersPage.jsx web/src/erp/pages/FormalBusinessModulePage.jsx web/scripts/styleL1.mjs` 均通过；前端单测 309 个用例通过，目标业务页 L1 通过 1 个场景。
- 下一步：后续业务页如果需要表达业务域，优先依赖左侧菜单分组和外层面包屑；页面 hero 内只放当前对象主标题、说明和必要摘要，不再重复菜单分组。
- 阻塞/风险：本轮只改正式业务页共享页头展示和 L1 断言；不改菜单分组、权限分组、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、业务字段、部署、提交或推送。当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 18:24 CST

- 完成：修复 `/erp/business-dashboard` 暗色模式可读性。业务看板的只读摘要卡、业务状态分布行、业务预警卡、摘要徽标和状态进度底色接入暗色主题 token，不再在暗色壳层里保留白底浅字。
- 完成：`style:l1` 新增 `erp-business-dashboard-dark-desktop` 场景，覆盖暗色业务看板的摘要卡、状态分布、预警卡、重复标题、局部刷新按钮和页面整体低对比文本断言。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-business-dashboard-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；前端单测 309 个用例通过，全量 L1 48 个场景通过。
- 下一步：后续新增业务看板局部卡片时，暗色覆盖应直接接入 ERP theme token，并把页面级暗色对比断言纳入对应 L1 场景。
- 阻塞/风险：本轮只改业务看板暗色样式和浏览器回归断言；不改业务看板数据口径、JSON-RPC、菜单、RBAC、schema / migration、WorkflowUsecase、Fact usecase、部署、提交或推送。当前工作区已有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 18:46 CST

- 完成：把 `销售订单` 页面收口为一个业务表单体验。主页面只保留销售订单主列表；新建 / 编辑弹窗在同一个 `<Form form={orderForm}>` 内维护订单头和 `Form.List` 订单行；详情抽屉改为只读展示订单行。底层仍保持 `sales_orders` 与 `sales_order_items` 两个事实对象，不把订单行合并进订单头表，也不在本页写出货、库存、发票、应收或收款事实。
- 完成：补齐订单行表单和详情明细的浅色 / 暗色样式，新增行、已保存行、移除按钮、移动端窄屏栅格和详情抽屉都接入 ERP theme token。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过，前端单测 309 个用例通过；另用 Playwright mock JSON-RPC 在 `http://localhost:5175/erp/sales/project-orders/sales-orders` 覆盖浅色和暗色两种主题，验证主页面只剩一个业务表格、新建表单可新增订单行、编辑表单可回显订单行、详情抽屉可查看订单行且页面无横向溢出。`pnpm --dir web style:l1` 全量本轮未通过，失败点在 `business-formal-module-shells-desktop` 里查找非销售订单目标文案“当前页面仍是正式入口壳”，未作为本轮销售订单目标验收通过项。
- 下一步：如果后续要消除“订单头保存成功但订单行保存失败”的局部风险，应新增后端事务型 `create/update sales order with items` JSON-RPC 主路径，再把前端顺序调用收口到该接口。
- 阻塞/风险：本轮不改 Ent schema、migration、RBAC、WorkflowUsecase、Shipment / Inventory / Finance fact usecase、菜单 seed、部署、提交或推送；订单行保存当前仍复用既有多个 JSON-RPC 顺序提交，异常时会提示“销售订单已保存，订单行保存失败”。当前工作区还有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 21:39 CST

- 完成：修复暗色模式下业务看板文字和数字像“套圈”的视觉问题。暗色全局按钮样式继续保留普通按钮边框，但 `ant-btn-link` / `ant-btn-text` 默认态恢复透明背景和透明边框；业务看板模块名和数字 link 按钮不再被全局非 primary 按钮边框误伤。
- 完成：`style:l1` 在 `erp-business-dashboard-dark-desktop` 场景新增 link 按钮无框断言，覆盖模块名和数字 `0` 的默认态 computed style，防止后续暗色按钮规则再次把 link 按钮渲染成小框。
- 验证：浏览器直连 `http://localhost:5175/erp/business-dashboard` 并切到暗色主题，确认 `客户档案` 和数字 `0` 的按钮 `backgroundColor` 与 `borderColor` 均为透明，`textShadow` 为 `none`；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-business-dashboard-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；前端单测 309 个用例通过，全量 L1 48 个场景通过。
- 下一步：后续新增暗色主题全局按钮覆盖时，必须显式区分 default / primary / link / text 语义；link/text 默认态应保持文本链接视觉，只在 hover / focus 时显示必要交互反馈。
- 阻塞/风险：本轮只改暗色主题按钮默认视觉和业务看板 L1 断言；不改业务看板数据、菜单、RBAC、JSON-RPC、schema / migration、WorkflowUsecase、Fact usecase、部署、提交或推送。完整 L1 第一次运行时遇到 `V1MasterDataPage.jsx` HMR 瞬时 `renderColumnHeader is not defined`，失败场景单独重跑和完整 L1 第二次均已通过；当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 21:43 CST

- 完成：业务列表表头列顺序入口改为先打开快捷菜单，提供左移一列、右移一列、移到最前、移到最后和打开列顺序面板；工具栏列顺序按钮仍直接打开完整面板。共享实现收口到 `ColumnOrderHeaderMenu`，客户档案、供应商档案、销售订单、销售订单行和 formal-shell 业务页复用同一交互，列顺序保存仍走现有管理员账号偏好和 localStorage 兜底。
- 完成：`style:l1` 的列顺序回归新增表头菜单断言，覆盖点击表头不会直接弹完整面板、快捷左移会写入本地缓存和菜单入口仍能打开完整面板。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过；前端单测 309 个用例通过，全量 L1 48 个场景通过。另用 in-app Browser 打开 `http://localhost:5175/erp/sales/project-orders/sales-orders`，确认销售订单表头菜单显示五个动作、未直接弹面板、菜单内“打开列顺序面板”可进入完整面板，控制台无 warn/error。
- 下一步：如果后续要让列顺序菜单支持隐藏列、固定列或拖拽排序，应先评审账号偏好结构和导出字段口径，避免把展示偏好误写成业务事实。
- 阻塞/风险：本轮不改后端偏好字段、RBAC、菜单、schema / migration、WorkflowUsecase、Fact usecase、部署、提交或推送。浅色主题的完整人工截图未单独保存；默认 / 浅色相关路径由全量 `style:l1` 和 CSS 检查覆盖，in-app Browser 本次实际截图在暗色主题下完成。

## 2026-06-14 21:46 CST

- 完成：排查产品核心正式业务页的“下一步”列来源，确认是 `FormalBusinessModulePage` 的 formal-shell 共用列配置影响所有产品核心入口壳；已删除 `next_action` 样例字段、`下一步` 列、搜索索引和导出列，并缩回表格横向滚动宽度。
- 完成：把正式业务模块字段范围里的施工型“后续动作 / 后续记录 / 后续评审”文案收口为业务对象和边界口径，例如库存改为“盘点 / 调整边界”、委外改为“发料 / 回货追溯”、出库改为“出库冲正边界”。
- 完成：`style:l1` 的业务页列顺序回归新增表头断言，正式业务页列表表头不得再出现“下一步”列；开发能力台账和过程文档中的“下一步”仍保留，不作为客户业务页真源。
- 验证：`rg` 确认 `web/src/erp/pages`、`web/src/erp/config` 和 `web/scripts` 中已无 formal-shell 的 `next_action` 和“下一步”列配置；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；前端单测 309 个用例通过，目标 L1 场景覆盖供应商、客户、销售订单、产品档案、BOM、库存台账和应收管理。
- 下一步：如果后续继续清理产品核心页面语义，应优先按“稳定业务对象 / 状态 / 真源 / 边界”检查正式入口壳，不再把施工计划或实现待办写进客户业务列表列。
- 阻塞/风险：本轮不改真实 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、客户菜单配置、部署、提交或推送；采购、库存、质检、生产、委外、出货和财务 formal-shell 仍是入口壳，真实写入能力仍需逐模块评审和实现。

## 2026-06-14 22:00 CST

- 完成：把“已选项摘要 + 已选明细 Popover”抽成 `SelectedItemsSummaryTag` 展示组件，并让 `SelectionActionBar` 通过 `selectedItems` 传入明细；正式业务入口壳在 BOM 多选时继续显示简洁摘要 `已选择 3 条BOM`，点击 / hover / focus 后展示全部已选 BOM 编号。
- 完成：补齐已选明细 Popover 样式，明细 chip 可换行且不撑宽操作条；目标 L1 场景新增 BOM 多选断言，覆盖摘要 tag、Popover 明细、操作条盒模型和横向溢出。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；前端单测 309 个用例通过，全量 L1 48 个场景通过。另用 in-app Browser 打开 `http://localhost:5175/erp/purchase/material-bom`，选中 3 条 BOM 后确认摘要为 `已选择 3 条BOM`，Popover 展示 `MATERIAL-BOM-001 / MATERIAL-BOM-002 / MATERIAL-BOM-003`，控制台无 warn/error，页面无横向溢出；Browser 全页截图接口超时，裁剪截图成功。
- 下一步：后续若客户档案、销售订单或其他单选 / 多选页也需要核对已选明细，可复用 `selectedItems` 入参接入，不应在各页面重复写 Popover。
- 阻塞/风险：本轮不改后端 BOM usecase、schema / migration、RBAC、菜单、导出字段、Workflow / Fact 边界、部署、提交或推送；正式业务入口壳仍是样例数据页面，Popover 展示的是当前列表行编号，不代表真实 BOM 领域 API 已接入。当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 22:18 CST

- 完成：全局排查业务页表单和列表列后，先收口确定有真源约束的问题：供应商类型从自由输入改为后端允许的 `material / outsourcing / service / mixed` 枚举，并在列表、详情和导出中展示中文标签。
- 完成：销售订单行列表不再默认暴露 `产品 ID / 单位 ID` 内部列；弹窗中的必需字段改名为“产品引用 ID / 单位引用 ID”，明确当前保存接口仍依赖引用 ID。订单行金额改为按“订单数量 × 单价”派生显示和提交，避免继续手填金额造成数量、单价、金额不一致；缺数量或缺单价时保留既有金额快照，不伪造 `0.00`。
- 完成：正式业务入口壳的通用“标题 / 内容”列和弹窗字段改为“业务对象 / 字段范围”，回收站占位列同步改成“业务对象 / 名称”，避免把施工壳层字段误看成产品核心通用字段。
- 完成：`style:l1` 新增销售订单详情抽屉订单行列头守卫，防止业务列表重新暴露 `产品 ID / 单位 ID`；回收站列头断言同步到“业务对象”。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test -- masterDataOrderView` 均通过；该 test 命令实际跑完整前端单测 310 个用例。`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，覆盖供应商、客户、销售订单、产品档案、BOM、库存台账和应收管理业务页。
- 下一步：销售订单行真正消除“产品引用 ID / 单位引用 ID”的用户可见输入，需要新增或接入产品档案和单位档案的选择 API，再让弹窗按产品选择自动带出产品编号、产品名称和默认单位；本轮没有在前端硬造假选项。
- 阻塞/风险：本轮不改后端 Product / Unit API、Ent schema、migration、RBAC、WorkflowUsecase、Fact usecase、客户菜单配置、部署、提交或推送；`OperationalFactsPage` 是内部事实验证页，仍保留产品 / 单位 ID 输入，不按客户业务页口径隐藏。当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 22:54 CST

- 完成：在产品核心补齐 `材料档案` 主数据入口，新增 `/erp/master/materials` 菜单、路由、V1 页面配置、yoyoosun 与行业模板菜单配置；页面复用主数据维护体验，支持材料编号、名称、分类、规格、颜色、默认单位 ID 和启停状态。
- 完成：后端补齐 `materials` 的 MasterData usecase、Ent repo、JSON-RPC API 和 RBAC 权限码 `material.read/create/update/disable`；默认单位校验复用现有 `units` 真源，不新增单位菜单、不写采购、库存、质检或 BOM 事实。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/product/capability-ledger.md` 和相关菜单 / API / 视图测试，明确材料档案只作为材料主数据，采购、库存、质检和 BOM 用量仍由对应领域 usecase 承载。
- 验证：`go test ./...`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`git diff --check` 均通过；前端单测 310 个用例通过，全量 L1 48 个场景通过。
- 下一步：如果后续要让材料选择更易用，应先接入单位下拉或单位档案 V1 入口，再评审产品、仓库、BOM 的主数据页面吸收顺序；不要在采购、库存或 BOM 页面硬造材料快照。
- 阻塞/风险：本轮不改 Ent schema / migration，因为 `materials` 和 `units` 真源表已存在；不实现采购订单、库存流水、质检单、BOM 用量、产品档案、单位档案或仓库档案页面；不提交、不推送。

## 2026-06-14 23:05 CST

- 完成：销售订单列表新增服务端日期区间筛选和排序参数，支持按 `订单日期 / 计划交付` 过滤，并按 `更新时间 / 订单日期 / 计划交付` 受控排序；JSON-RPC 参数解析会拒绝非法日期，后端 repo 用 Ent 字段白名单查询，不做前端本地假筛选。
- 完成：销售订单筛选栏新增日期区间控件和排序控件；桌面筛选控件收窄到同一行，日期组内部保持不拆行，窄屏按整控件换行以避免横向溢出。
- 验证：`go test ./internal/data`、`go test ./internal/data -run 'TestSalesOrderRepoOrderLifecycleAndList|TestJsonrpcData_SalesOrderListAcceptsDateAndSortFilters'`、`pnpm --dir web lint`、`pnpm --dir web css` 均通过。用本地 Chrome + mocked JSON-RPC 打开 `/erp/sales/project-orders/sales-orders`，验证 1440 桌面浅色 / 暗色四个筛选控件同一行、日期组 `nowrap`、无横向溢出；390 移动视口按整控件纵向排列且无横向溢出。
- 下一步：后续采购、入库、质检、生产、出货和财务模块接入真实领域 API 后，可按各自真源日期字段复用同一筛选模式；主数据页默认不加日期筛选，创建 / 更新时间继续作为列排序或高级筛选候选。
- 阻塞/风险：本轮不改主数据日期筛选、不改正式入口壳样例筛选、不改 schema / migration、WorkflowUsecase、Fact usecase、菜单或部署。`pnpm --dir web test` 仍受当前工作区既有 `devCustomerConfig` 菜单数量断言影响失败（期望 25、实际 26）；`pnpm --dir web style:l1` 仍受既有 `business-formal-module-shells-desktop` 找不到“主数据详情”影响失败，本轮已用目标页面浏览器盒模型回归补充验证。

## 2026-06-14 23:06 CST

- 完成：正式业务入口壳的“新建 / 编辑”弹窗不再所有模块共用同一组字段；新增 `getFormalShellFormFieldLabels`，按产品核心模块分别展示产品、BOM、采购、入库、质检、库存、委外、生产、出货和财务字段。
- 完成：`FormalBusinessModulePage` 表单拆成通用壳层字段和“产品核心字段”两段；字段仍是只读占位，明确等待领域 API / usecase / RBAC 接入后才允许真实保存，不从前端本地伪造事实。
- 完成：补齐浅色 / 暗色样式和回归断言；`businessModuleNavigation` 测试锁住 formal-shell 模块必须声明差异化核心字段，且 `材料档案` 作为正式 V1 页不再走壳层字段配置。
- 验证：`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/config/businessModules.mjs src/erp/pages/FormalBusinessModulePage.jsx src/erp/utils/businessModuleNavigation.test.mjs scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_PORT=4174 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；前端单测 311 个用例通过，目标 L1 覆盖 BOM、库存和应收弹窗字段文本及库存双击编辑弹窗。
- 下一步：后续要让采购、库存、质检、生产、出货和财务弹窗真正可保存，必须逐模块补领域 usecase、API、RBAC 和事实真源测试；不能把当前只读字段配置当成写入模型。
- 阻塞/风险：本轮只修正式入口壳的弹窗字段展示和回归，不改 schema / migration、WorkflowUsecase、Fact usecase、真实保存 API、客户菜单、部署、提交或推送；当前工作区仍有多处非本轮未提交改动，本轮未回退、未整理。

## 2026-06-14 23:09 CST

- 完成：复验销售订单日期筛选和排序改动仍在，前端控件、后端 filter、JSON-RPC 参数、Ent repo 查询和目标测试用例均保留；日期筛选桌面不拆行，小屏按整控件换行。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`git diff --check -- server/internal/biz/sales_order.go server/internal/data/sales_order_repo.go server/internal/data/jsonrpc_masterdata_order.go server/internal/data/jsonrpc_masterdata_order_test.go server/internal/data/sales_order_repo_test.go web/src/erp/pages/V1SalesOrdersPage.jsx web/src/erp/styles/app.css progress.md` 均通过。
- 下一步：后续可在采购、入库、质检、生产、出货和财务模块接入真实领域 API 后，按各自真源日期字段复用该筛选模式；主数据页默认仍不加日期筛选。
- 阻塞/风险：当前 `go test ./internal/data` 被未跟踪文件 `server/internal/data/jsonrpc_operational_fact_test.go` 的未使用 `context` import 挡住；该文件不属于本轮销售订单筛选改动，本轮未修改或回退。

## 2026-06-14 23:22 CST

- 完成：补齐 Product Core 的 `出货单` 正式入口，菜单归属 `出货管理`，路由为 `/erp/warehouse/shipments`；`出货放行`、`出库管理`、`出货单` 三个入口并存，不替换、不合并。前端新增 `ShipmentsPage`，复用现有 `operational_fact` JSON-RPC，支持出货单列表、详情、新建草稿、添加明细、确认出货和取消已出货冲正。
- 完成：后端把 shipment JSON-RPC 权限从旧的销售订单 / 出库权限收口到 `shipment.read/create/ship/cancel`，RBAC 内置权限、角色菜单、客户菜单和行业模板同步补齐；确认出货仍由 `OperationalFactUsecase.ShipShipment` 写 `shipments / shipment_items` 与 `inventory_txns.OUT`，取消已出货走 `CancelShippedShipment` 写 `REVERSAL`，不新增 schema / migration / tenant_id。
- 完成：同步更新 `README.md`、`server/README.md`、`docs/current-source-of-truth.md`、`docs/product/formal-menu-entry-plan.md`、`docs/product/capability-ledger.md`，明确 `shipping_released != shipped`，只有出货单 `SHIPPED` 才是真实 Shipment Fact；装箱、物流追踪、签收、退货、打印、自动应收 / 开票保留 P2。
- 验证：`go test ./internal/biz -run 'TestBuiltinRoleWorkflowPermissionMatrix|TestAdminVisibleMenusUsesFormalV1Entries|TestAdminMenusOmitRetiredFrontendDocsAndQAPaths|TestNormalizeAdminMenuPermissionsRedirectsRetiredFrontendPaths|TestCoreValueIntegration|Test.*Shipment'`、`go test ./internal/data -run 'TestOperationalFactRepo_ShipShipmentAndCancelWritesOutboundReversal|TestJsonrpcData_ShipmentAPIRequiresDedicatedShipmentPermissions|TestJsonrpcData_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState|TestJsonrpcData_WorkflowUpdateTaskStatusRejectsNonWarehouseShipmentRelease|TestJsonrpcData_WorkflowUpdateTaskStatusAllowsSuperAdminShipmentRelease'`、`go test ./internal/core/status -run Shipment` 均通过。
- 验证：`pnpm --dir web test -- menuPermissions seedData devCustomerConfig businessModuleNavigation`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`git diff --check` 均通过；前端单测 311 个用例通过，全量 L1 48 个场景通过。
- 验证：in-app Browser 打开 `http://localhost:5176/erp/warehouse/shipments`，真实登录后确认 `出货管理` 下存在 `出货放行 / 出库管理 / 出货单` 三个入口；`出货放行` 页面文案仍是可发货 / 协同口径，`出库管理` 页面文案仍是库存出库口径，`出货单` 页面显示 Shipment Fact 边界说明和列表；浅色、暗色默认态均无横向溢出。
- 下一步：P2 再评审装箱 / 发货明细、物流追踪、签收、退货、打印、自动应收 / 开票，以及出货单与销售订单、仓库批次选择器的更完整业务闭环。
- 阻塞/风险：当前工作区仍有多处非本轮既有改动，本轮未回退、未整理、未提交；本轮不改 Ent schema / migration、不新增事实表、不在 WorkflowUsecase 写库存或出货事实、不把 workflow payload 当事实真源。

## 2026-06-15 01:55 CST

- 完成：在 `AGENTS.md` 的产品化与客户差异隔离约束中补充角色系统边界：plush-toy-erp 不是“每个角色一套独立系统”，而是同一套 Product Core 通过客户菜单配置、RBAC 权限码、岗位任务端入口和 Workflow 任务责任投影出不同角色工作界面。
- 完成：明确菜单显隐和岗位入口只影响可见性与操作入口，不改变后端 usecase、schema、Workflow / Fact 边界或事实落账规则，避免后续误读为按角色分叉系统、SaaS tenant 或低代码流程系统。
- 验证：`progress.md` 当前未达到归档阈值；本轮为文档规则小改，未运行前后端测试。
- 下一步：如后续继续扩展客户配置或岗位任务端，应优先复用该规则，并回到 RBAC、Workflow / Fact 和客户配置正式文档核对。
- 阻塞/风险：当前工作区已有大量非本轮改动，本轮只修改 `AGENTS.md` 和 `progress.md`，未回退、整理、提交或推送其他现场内容。

## 2026-06-15 02:08 CST

- 完成：在 `AGENTS.md` 的角色投影规则后补充权限码边界：权限码不是通用 UI 配置系统，而是表达业务能力访问、敏感动作执行和后端本次操作授权。
- 完成：明确权限码可以辅助前端隐藏菜单、入口和业务动作按钮，但不应默认扩展为每个字段、普通按钮或文案一个权限码；字段显示、字段命名、客户叫法、菜单文案和低风险展示差异优先走客户配置、字段显示配置或页面配置。
- 验证：`progress.md` 当前未达到归档阈值；本轮为文档规则小改，未运行前后端测试。
- 下一步：后续新增权限码时，应优先服务真实业务动作、敏感数据、审批、冲正、出货、库存、财务和后端 usecase 校验，不把 RBAC 膨胀成低代码 UI 配置层。
- 阻塞/风险：当前工作区已有大量非本轮改动，本轮只修改 `AGENTS.md` 和 `progress.md`，未回退、整理、提交或推送其他现场内容。

## 2026-06-15 03:18 CST

- 完成：把活跃 QA、配置、架构评审和产品化文档中的 Phase 7/8/9/10/11/12 执行口径收口为能力、测试和 evidence 口径；保留客户历史 evidence 文件名作为追溯记录，不再把阶段号作为当前实施目标。
- 完成：重命名试用、岗位任务、行业模板、私有化客户包和业务事实评审相关脚本 / 文档入口；新增 `scripts/qa/phase-label-boundaries.mjs` 并接入 `fast/full/strict`，阻止 active config、QA 脚本、运行时代码和 architecture 文档继续出现新的阶段号主路径。
- 完成：`scripts/seed-phase7-sim-masterdata.sh` 与 `server/cmd/seed-phase7-sim-masterdata` 收口为 `seed-trial-sim-masterdata`，模拟 key 改为 `SIM-YOYOOSUN-TRIAL`；SaaS docs-only 评审入口改为 `docs/product/saas-entry-review.md`。
- 验证：`node --check scripts/qa/phase-label-boundaries.mjs scripts/qa/trial-simulated-data.mjs scripts/qa/mobile-workflow-simulated-closure.mjs scripts/qa/industry-template-closure.mjs scripts/qa/private-deployment-package-closure.mjs`、`node --test scripts/qa/trial-simulated-data.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs scripts/qa/industry-template-closure.test.mjs scripts/qa/private-deployment-package-closure.test.mjs`、`bash -n scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh scripts/seed-trial-sim-masterdata.sh`、`go test ./cmd/seed-trial-sim-masterdata ./cmd/seed-core-demo-data`、`node scripts/qa/phase-label-boundaries.mjs && node scripts/qa/industry-template-boundaries.mjs && node scripts/qa/private-deployment-boundaries.mjs` 均通过。
- 验证：`node scripts/qa/industry-template-closure.mjs --out /tmp/plush-industry-template-closure` 与 `node scripts/qa/private-deployment-package-closure.mjs --out /tmp/plush-private-deployment-package-closure` 通过；`progress.md` 追加前未达到归档阈值。
- 下一步：后续判断项目进展默认看 capability ledger、current-source-of-truth、代码、测试和目标环境 evidence；历史 phase 文件只作为追溯证据，不作为新任务拆分依据。
- 阻塞/风险：本轮未重命名历史客户 evidence 文件，也未清理旧 Phase 2A/2B/2C/2D PostgreSQL 防呆脚本；当前工作区仍有大量非本轮既有改动，本轮未回退、整理、提交或推送。

## 2026-06-15 03:49 CST

- 完成：把活跃文档中的 Phase 规划框架继续收口为能力路线、里程碑、功能闭环和测试证据口径；同步更新 `docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/implementation-governance.md`、客户资料、导入验收、测试策略、README 和前端开发测试入口。
- 完成：将客户历史验收 / release evidence 从 `docs/customers/yoyoosun/phase*.md` 改名并归档到 `docs/archive/customer-evidence/yoyoosun/`，新增归档 README，并同步 `docs/document-inventory.md`、客户 README、交付矩阵、能力台账和 current-source 引用。
- 完成：将旧架构归档文件从 `phase-2*.md` 改成 BOM、采购入库、采购退货、采购调整和来料质检等能力名，并同步归档 README 和文档清单。
- 完成：新增能力命名的 PostgreSQL 防呆脚本包装层和 Make target：`inventory-*`、`bom_lot-*`、`purchase_receipt-*`、`purchase_return-*`；旧 `phase2*` target 保留为兼容入口但不再作为文档推荐入口。
- 验证：已确认 `docs` 文件名级搜索无 `phase / px` 命中；排除 `docs/archive/**` 和 `docs/reference/**` 后，活跃文档、README 和前端开发测试配置无 `phase / phasex / px` 命中。
- 下一步：如要继续彻底清理代码内部历史命名，可单独评审旧 `phase2*` Make target、环境变量、DB 名和测试 source_type 的兼容迁移；本轮未强行删除兼容入口。
- 阻塞/风险：归档 evidence 正文中仍可能保留当时真实镜像 tag、输出路径和命令里的旧命名；这些属于历史证据，不作为当前执行口径。

## 2026-06-15 04:06 CST

- 完成：按截图建议将 `docs/reference/第二次20260611/` 中高风险旧规划、测试、菜单、数据构造和部署资料移出 reference 主入口，归档到 `docs/archive/reference-high-risk/2026-06-11/`；配套 PDF 一并移动，避免继续作为可直接读取的 reference 输入。
- 完成：新增 `docs/archive/reference-high-risk/README.md` 和 `docs/archive/reference-high-risk/2026-06-11/README.md`，明确这些资料只作历史追溯，不作为当前任务、路线、API、测试、部署、菜单、schema、migration 或 runtime 真源。
- 完成：同步 `docs/reference/README.md`、`docs/archive/README.md`、`docs/document-inventory.md` 和相关原型 README 引用；`docs/reference/第二次20260611/` 当前只保留 `server:internal:core 分层、保留与迁移规范.md` 与 `客户配置与部署指南.md` 两份相对低风险参考。
- 验证：已确认 5 份高风险 Markdown 及对应 PDF 均在 `docs/archive/reference-high-risk/2026-06-11/`，原 `docs/reference/第二次20260611/` 不再保留这些文件。
- 下一步：如后续继续收紧 reference，可再评审第一批 `20260519` 两份保留参考是否只需 README 标注，或是否也应迁入高风险归档。
- 阻塞/风险：归档资料正文仍保留原始旧阶段、旧 API、旧路径和旧命令内容，属于历史证据；不能据此恢复旧实现或规划。

## 2026-06-15 04:18 CST

- 完成：按用户确认“reference 里很多东西值得参考”的判断，将刚才移入 `docs/archive/reference-high-risk/2026-06-11/` 的 5 份第二批参考 Markdown 及配套 PDF 全部移回 `docs/reference/第二次20260611/`。
- 完成：撤销 `docs/archive/reference-high-risk/` 归档入口和文档清单归档条目；`docs/reference/README.md` 保留更强读取边界，明确 reference 可作为产品讨论、方案比较和历史设计输入，但不能直接作为当前任务、阶段、API、测试、部署、菜单或路线真源。
- 完成：同步 `docs/document-inventory.md` 和相关原型 README，将这些资料恢复为 GPT 第二批 reference 输入，并强调必须回到 current-source、正式产品文档、代码和测试复核。
- 验证：`docs/reference/第二次20260611/` 已恢复 5 份参考资料及 PDF；`docs/archive/reference-high-risk/` 已为空并移除。
- 下一步：后续 AI 读取 reference 时，应先看 `docs/reference/README.md` 的边界说明；真正执行仍以 current-source、能力台账、代码和测试为准。
- 阻塞/风险：reference 正文仍保留旧阶段、旧 API、旧路径和旧命令内容；这些只能作为参考输入，不能直接恢复为当前实现。

## 2026-06-15 17:24 CST

- 完成：评审 `docs/reference/第二次20260611/agents.md` 与 `No Phase Runtime Policy.md`，未原样复制 reference，而是将可吸收规则写入当前真源：`AGENTS.md` 新增“不按 Phase 组织新任务”和“禁止新增 runtime phase 命名”约束，`docs/product/implementation-governance.md` 新增 Runtime Phase 命名冻结小节。
- 完成：收紧 `scripts/qa/phase-label-boundaries.mjs`，从只扫内容扩展为扫描路径和内容，并纳入 `scripts`、`server/Makefile`、`server/README.md`；仅为当前已知 `phase2*` PostgreSQL 本地验收兼容入口设置精确例外，避免 reference 规则与现有兼容现场冲突。
- 完成：同步 `scripts/README.md`，登记 phase label 边界守卫的用途和兼容边界。
- 验证：`node scripts/qa/phase-label-boundaries.mjs`、`node --check scripts/qa/phase-label-boundaries.mjs` 与 `bash scripts/qa/fast.sh` 通过。
- 下一步：若要彻底消除旧 `phase2*` PostgreSQL 测试 / Make target / DB env 命名，需要单独评审兼容迁移、命令替换和历史 evidence 追溯，不在普通功能任务中顺手清理。
- 阻塞/风险：本轮没有移动或删除新增的 reference Markdown/PDF；`AGENTS.md.pdf` 和 `No Phase Runtime Policy.pdf` 仍只是 reference 附件，不作为正式真源。

## 2026-06-15 17:40 CST

- 完成：按“规则、限制和普通文档分层”做文档治理扫描，排除 `docs/archive/**` 与 `docs/reference/**` 历史原文后统计活跃 Markdown 中的负面限制词密度，确认高命中文档集中在 `AGENTS.md`、原型 README、菜单计划、current-source、实施治理和状态 / 架构评审。
- 完成：新增 `docs/README.md` 文档治理原则，明确规则文档、真源索引、产品 / 架构设计、原型 / 样板、客户 / 交付资料、参考 / 归档的写法差异：普通文档优先写用途、正式真源和吸收路径，红线集中在规则文档或自动化守卫。
- 完成：将 `AGENTS.md`、`docs/product/implementation-governance.md` 中刚纳入的 no-phase 口径从“禁止清单”改成“命名主路径 + 自动化守卫 + 兼容边界”；将 `docs/product/prototypes/README.md` 的“禁止照搬 / 不代表”结构改成“升级前确认 / 吸收边界 / 正式吸收边界”；将 `docs/product/formal-menu-entry-plan.md` 和 `docs/current-source-of-truth.md` 入口处改为正向真源描述。
- 验证：`git diff --check -- AGENTS.md docs/README.md docs/current-source-of-truth.md docs/product/implementation-governance.md docs/product/prototypes/README.md docs/product/formal-menu-entry-plan.md` 通过；`node scripts/qa/phase-label-boundaries.mjs` 通过。
- 下一步：后续新增或改正文档时，优先按 `docs/README.md` 的文档类型选择写法；若普通说明文档需要反复写红线，应优先考虑是否应收口到 AGENTS / governance / test-strategy / deploy conventions 或脚本守卫。
- 阻塞/风险：本轮没有全量重写 102 份活跃 Markdown；大量业务边界、状态机、真实导入、RBAC 和部署相关红线仍保留在规则 / 真源 / 架构类文档中，因为这些属于已知高风险误判点。

## 2026-06-15 17:57 CST

- 完成：按用户要求将“文档写作与规则分层”提升到全局 `/Users/simon/.codex/AGENTS.md` 的“注释与文档”章节，只写通用元规则：普通文档写目标、职责、真源、主路径和验收方式；限制、红线和禁止项优先收口到项目级 AGENTS、治理文档、测试策略、部署约定或自动化 hook / QA 脚本。
- 完成：全局规则未加入 plush-toy-erp 专属业务细节；Workflow / Fact、真实导入、phase 兼容、yoyoosun 等仍由本仓库 `AGENTS.md` 和正式文档维护。
- 验证：已确认新增内容位于 `/Users/simon/.codex/AGENTS.md:191` 附近。
- 下一步：后续其他项目也可复用该全局元规则；项目专属红线仍放项目级规则或脚本。
- 阻塞/风险：全局 AGENTS 不在本仓库 git 管理内，本轮无法用仓库 diff 展示该文件变更。

## 2026-06-15 17:52 CST

- 完成：处理前端私有 npm registry token 明文入库问题，移除 `web/.npmrc` 与 `web/.yarnrc.yml` 中的 Font Awesome registry/auth 配置；当前 `web/package.json` 与 lockfile 未使用 `@fortawesome` 私有依赖，仓库不再保留无用私有 registry token 配置。
- 完成：更新 `.gitignore`，忽略本地 npm / yarn registry token 覆盖文件，并保留 tracked `web/.npmrc` / `web/.yarnrc.yml` 作为无密钥包管理器配置。
- 完成：增强 `scripts/qa/secrets.sh`，将 tracked npm/yarn 配置纳入常规扫描，并让疑似密钥泄露默认阻断；同时增加 npm registry token 明文配置的专门检查，避免只扫 diff 时漏掉既有 tracked 配置。
- 验证：`bash -n scripts/qa/secrets.sh`、`bash scripts/qa/secrets.sh`、`pnpm config get node-linker` 均通过；已确认 tracked npm/yarn 配置中不再存在 auth token 关键字段或 UUID 形式 token 残留。
- 下一步：必须在对应 npm / Font Awesome registry 后台撤销已泄露 token 并重新生成；如后续确实需要私有包，优先通过本机全局 npmrc、CI/CD Secret 或安装步骤临时注入，不写入仓库。
- 阻塞/风险：该 token 已存在于 2026-04-17 初始提交历史中；本轮没有重写 git 历史，历史清理需要单独确认协作成本、远端影响和所有克隆的同步方式。
