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
