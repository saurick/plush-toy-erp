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

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接，不再内嵌“看板中心 / 运营工具”卡片导航，也不把核心区域做成跳转入口集合；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessListLayout` 已承接正式业务页共享骨架；`客户档案`、`供应商档案` 和 `销售订单` 使用 V1 页面，`产品档案`、`BOM 管理`、采购、入库、质检、库存、委外、生产、出货和财务等 16 个 `formal-shell` 菜单统一使用 `FormalBusinessModulePage`。共享骨架已收口紧凑筛选、列表统计、列顺序、列排序、导出、批量删除、回收站、行点击选中、双击进入编辑 / 主操作弹窗、显式详情、当前操作和协同入口；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、任务中心、业务管理中心、产品核心菜单覆盖矩阵、正式菜单候选导航、业务模块列表页、业务详情页、页面级新建 / 编辑表单、业务页协同入口组件、业务弹窗和模板打印中心十一个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：`admin-command-center-v1` 是判断型工作台样板，`core-menu-coverage-v1` 是内部覆盖矩阵，`formal-menu-candidate-v1` 是正式菜单候选原型；它们都不是正式菜单、路由、权限或 seedData 映射表，真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-14 00:52 CST

- 完成：继续从工作台推进到产品核心业务菜单共享页。按 `trade-erp` 已验证业务页结构和当前原型口径，把 `FormalBusinessModulePage` 从工程说明式壳页改为紧凑业务工作台：筛选 + 导出 / 列顺序 / 批量删除 / 回收站 / 新建，当前操作行按模块展示编辑、关联表格、流转、生成 / 更新、打印、删除和详情；行点击可直接选中，表头保留列顺序入口并补列排序。`客户档案`、`供应商档案` 和 `销售订单` 去掉顶部技术 tag 和选中区冗余摘要，选中条只保留必要当前对象和操作。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/src/erp/config/seedData.mjs`，移除“工作台保留后台运营中枢导航”和“打印入口 / 常用业务模块”旧口径，记录 formal-shell 业务页已吸收列顺序、排序、回收站和选中行操作但不承诺后端写入 API 已完成。同步更新 `web/scripts/styleL1.mjs`，不再断言已删除的“正式新入口 / 领域 API / 不读取 business_records / 正式 MasterData”标签。
- 完成：菜单覆盖核对通过：`businessModuleDefinitions` 当前 19 个产品核心业务菜单，其中 3 个 `formal-v1`、16 个 `formal-shell`，路径无缺失、无重复；`formal-shell` 由路由动态注册到 `FormalBusinessModulePage`，因此本轮共享页改动一次覆盖产品核心业务菜单。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过，测试 308 条通过；配置级菜单覆盖 Node 检查通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop,business-formal-module-shells-desktop,erp-dashboard-desktop,erp-task-board-desktop,erp-business-dashboard-desktop pnpm --dir web style:l1` 通过 5 个场景；修正暗色客户页旧断言后，`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1` 通过；最终全量 `pnpm --dir web style:l1` 通过 47 个场景；`git diff --check -- web/src/erp/components/business-list/BusinessListLayout.jsx web/src/erp/pages/FormalBusinessModulePage.jsx web/src/erp/pages/V1MasterDataPage.jsx web/src/erp/pages/V1SalesOrdersPage.jsx web/src/erp/config/seedData.mjs web/scripts/styleL1.mjs docs/current-source-of-truth.md` 通过。
- 下一步：若继续推进“真实完成”，应逐个 fact / masterdata 模块补后端 usecase、JSON-RPC、RBAC、保存 / 删除 / 回收站真实数据和测试；不能把当前 formal-shell 的预留按钮当成事实写入已经完成。
- 阻塞/风险：133 线上 `https://admin.yoyoosun.net/` 当前只能公开确认到登录入口，业务页需要登录态，本轮未把未登录页面当业务页真源；参考来源为本地 `trade-erp` 的业务页交互、用户截图、当前原型和仓库正式文档。本轮不改 schema、migration、后端 API、RBAC、WorkflowUsecase、Fact usecase、正式原型阶段登记、提交或推送。

## 2026-06-13 19:59 CST

- 完成：因 `progress.md` 达到 385 行 / 81720 bytes，先归档到 `docs/archive/progress-2026-06-13-before-workbench-prototype-redesign.md`，再收缩当前文件，保留归档索引、当前活跃事项和本轮记录。
- 完成：按“工作台一定要有意义”的要求，重做 `admin-command-center-v1/index.html`。新原型去掉类似正式菜单的侧栏，把工作台收敛为判断型首屏：今日焦点、优先队列、当前处理卡、相关对象快捷入口和 Workflow / Fact 交接边界；相关对象快捷入口会随当前处理卡高亮，明确不替代正式菜单。
- 完成：同步 `admin-command-center-v1/README.md`、`docs/product/prototypes/README.md`、`docs/product/prototypes/index.html` 和 `web/src/erp/config/devPrototypes.mjs`，把登记口径从旧的“今日队列 / 当前任务详情 / 常用业务对象入口”更新为新结构，并继续保持 `To Implement`。
- 验证：内联脚本语法检查通过；旧文案残留扫描无命中；`git diff --check -- docs/product/prototypes/admin-command-center-v1/index.html docs/product/prototypes/admin-command-center-v1/README.md docs/product/prototypes/README.md docs/product/prototypes/index.html web/src/erp/config/devPrototypes.mjs` 通过。通过系统 Chrome + Playwright 打开 `http://127.0.0.1:8765/docs/product/prototypes/admin-command-center-v1/index.html` 验证桌面 1366px 和移动 390px：无页面级横向溢出，tab 切换后当前处理卡与快捷入口高亮同步，移动端 topbar 按钮未被裁切。
- 下一步：如果要吸收到真实 `/erp/dashboard`，应单独进入 Current 实现任务，按现有 Workflow API、菜单 / RBAC、theme token、浅色 / 暗色和 `style:l1` 做浏览器回归；不要直接复制原型静态任务、固定数字或快捷入口结构到运行时。
- 阻塞/风险：本轮只改 To Implement 原型、原型登记文案和过程记录；不改正式运行时代码、正式菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。当前工作区仍有非本轮改动，本轮未回退、整理或提交这些无关现场。

## 2026-06-13 20:15 CST

- 完成：按“任务和业务管理菜单也一定要有意义”的要求，新增 `docs/product/prototypes/task-command-center-v1/` 和 `docs/product/prototypes/business-management-center-v1/` 两个 To Implement 原型。任务中心收敛为职责处理台：待我处理、我发起的、阻塞交接、当前任务详情和关联业务对象；业务管理中心收敛为业务对象总控：按链路选择对象、查看风险、进入标准业务页或详情页。
- 完成：同步 `docs/product/prototypes/README.md`、`docs/product/prototypes/index.html`、`web/src/erp/config/devPrototypes.mjs` 和 `docs/document-inventory.md`，把两个新原型登记到静态查看器、`/__dev/prototypes` registry 和文档清单；继续保持 To Implement，不改 Current。
- 验证：`node --check web/src/erp/config/devPrototypes.mjs` 通过；两个新 HTML 和原型查看器内联脚本语法检查通过；`git diff --check -- docs/product/prototypes/task-command-center-v1 docs/product/prototypes/business-management-center-v1 docs/product/prototypes/README.md docs/product/prototypes/index.html web/src/erp/config/devPrototypes.mjs docs/document-inventory.md` 通过。通过系统 Chrome + Playwright 验证两个新原型桌面 1366px 和移动 390px：tab 切换后详情同步，topbar 未裁切，无页面级横向溢出；业务管理移动端统计卡标题误命中数字样式的问题已修复并复验通过。
- 下一步：如果后续吸收到真实 `/erp/task-board` 或新增业务管理运行时入口，应分别单独进入 Current 实现任务，按当前 Workflow API、业务页共享组件、菜单 / RBAC、theme token、浅色 / 暗色和 `style:l1` 做回归；不要把原型静态任务、静态对象、链路顺序或快捷入口直接写成运行时真源。
- 阻塞/风险：本轮只新增 To Implement 原型、原型登记文案、文档清单和过程记录；不改正式运行时代码、正式菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。当前工作区仍有非本轮改动，本轮未回退、整理或提交这些无关现场。

## 2026-06-13 20:22 CST

- 完成：补 PDF 启动异步预热开始日志。启动 warmup 时现在会记录 `template pdf warmup started`，并带 `timeout_ms`、`render_concurrency`；完成、失败、禁用日志继续分别使用 `template pdf warmup success`、`template pdf warmup failed`、`template pdf warmup disabled`。
- 验证：`cd server && go test ./internal/server` 通过。
- 下一步：重启服务后可按 started -> success / failed 的日志顺序确认 PDF 预热是否启动和是否进入 ready。
- 阻塞/风险：本轮只补启动日志，不改 PDF 渲染语义、readyz 规则、API、schema / migration、RBAC、前端页面或部署配置。

## 2026-06-13 20:30 CST

- 完成：按“待实现原型中重复的部分，按照新的来”收口表单和浮层样板边界。`action-modal-drawer-standard-v1` 作为较新的业务弹窗样板，承接单据补录、来源导入、明细行、回收站、列顺序、删除确认和危险确认；`business-form-page-standard-v1` 收窄为页面级新建 / 编辑表单骨架、字段分组和残值 / 缺值防护。
- 完成：同步 `docs/product/prototypes/README.md`、静态查看器 `docs/product/prototypes/index.html`、`web/src/erp/config/devPrototypes.mjs` 以及两个样板 README / HTML 首屏文案，移除旧的“审批 / reason 必填”作为业务弹窗主摘要，避免两个 To Implement 卡片继续看起来重复。
- 验证：`node --check web/src/erp/config/devPrototypes.mjs` 通过；三个 HTML 内联脚本语法检查通过；定向 `git diff --check` 通过。通过 Playwright CLI 打开临时静态服务，验证业务弹窗桌面 1366px 和移动 390px 下单据补录、来源导入、回收站、列顺序、删除确认均无横向溢出；表单页和原型查看器卡片摘要在桌面 / 移动下无横向溢出，console 无 error / warn。
- 下一步：后续若吸收到真实页面，应先选定一个业务列表页或一个页面级表单做 Current 实现；不要把新版弹窗样板里的静态字段、来源行或删除策略直接写成运行时真源。
- 阻塞/风险：本轮只改 To Implement 原型和原型登记文案，不改正式运行时代码、正式菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。当前工作区仍有多轮非本轮改动，本轮未回退、整理或提交这些无关现场。

## 2026-06-13 20:38 CST

- 完成：继续收口 `business-module-page-standard-v1/index.html` 的选中行操作区，把按钮改成模块动作示例：编辑、关联单据、流转、生成出库、打印单据、删除；同步 `docs/product/prototypes/README.md` 明确这些按钮是出货 / 出库类示例，真实页面必须按各模块业务动作调整，不作为所有页面固定按钮。
- 验证：业务模块原型内联脚本语法检查通过；`git diff --check -- docs/product/prototypes/business-module-page-standard-v1/index.html docs/product/prototypes/README.md` 通过。通过浏览器打开本地原型并验证桌面选中态和 390px 移动端：选中后动作行可见，页面级横向溢出为 false，移动端操作区不撑宽页面。
- 下一步：如果要吸收到真实业务页，应按客户、产品、采购、入库、库存、出货、财务等模块分别定义允许动作和按钮顺序，再回到共享业务页组件、权限、API 和 theme token 做 Current 实现。
- 阻塞/风险：本轮仍只改 To Implement 原型和原型 README，不改正式运行时页面、正式菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。

## 2026-06-14 00:52 CST

- 完成：按反馈继续收口真实工作台和任务中心，不再保留 DashboardPage 内部的“运营中枢 / 看板中心 / 运营工具”卡片式二级导航；工作台页面不再把核心区域做成跳转入口集合，改为展示今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接。
- 完成：任务中心移除不必要的“看业务状态 / 打印中心”泛跳转动作，只保留刷新、清空筛选、任务筛选、泳道、当前任务处理和关联对象入口；异常闭环页面补回内容区标题，不依赖已删除的内部导航标题。
- 完成：同步 `style:l1` 断言，去掉对“常用入口 / 运营工具 / 看全部任务 / 看业务状态”等旧跳转型文案的依赖；保留业务页列顺序弹窗可点击状态等待修正。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop,erp-exception-flow-desktop,business-menu-groups-desktop pnpm --dir web style:l1` 通过 8 个核心场景；全量 `pnpm --dir web style:l1` 通过 47 个场景；`git diff --check -- web/src/erp/pages/DashboardPage.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如果继续要求“所有正式业务菜单逐页定制”，应基于共享业务页骨架和每个模块字段 / 动作差异继续做，但本轮已先把截图指出的工作台内导航、无意义跳转入口和任务中心泛跳转问题收口到真实运行时。
- 阻塞/风险：本轮仍不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、正式菜单配置、原型阶段登记、提交或推送；工作区仍有其他既有原型/配置改动，本轮未回退或整理。

## 2026-06-14 00:20 CST

- 完成：继续从产品核心入口推进，将任务中心原型吸收到真实 `/erp/task-board`。任务看板首屏改为更紧凑的“按职责处理任务，再回到真实业务对象”结构：四个入口覆盖待我处理、发起来源、阻塞交接和当前结果；右侧当前任务区直接提供处理完成、标记阻塞和关联对象入口；下方保留现有筛选、四个泳道和任务处理明细表。
- 完成：同步补齐任务中心浅色 / 暗色 / 移动端样式，去掉重复筛选动作，只保留一个稳定的清空筛选入口；修正 `style:l1` 列顺序弹窗回归脚本第二次点击前未等待 saving 解除的问题，改为等待可点击的“移到最后”按钮。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1` 通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm --dir web style:l1` 通过；`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,admin-login-mobile-source-desktop-choice,auth-expired-alert-mobile,erp-dashboard-redirect,erp-dashboard-desktop,erp-task-board-desktop,erp-command-center-focus-desktop,erp-dashboard-mobile,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1` 实际验证 9 个匹配场景并通过；`node --check web/scripts/styleL1.mjs` 与 `git diff --check -- web/src/erp/pages/DashboardPage.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：产品核心所有菜单还没有全部做完；下一块建议继续做业务管理中心 / 业务模块标准页吸收到真实业务页共享骨架，再逐步覆盖主数据、销售、采购、库存、出货、财务等正式二级菜单。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、正式菜单配置、原型阶段登记、提交或推送。全量 `pnpm --dir web style:l1` 连续两次在全量运行时卡在 `erp-dashboard-desktop` 等待标题，但该场景单跑通过，前段核心子集也通过；记录为全量脚本跨场景偶发/启动顺序风险，未作为任务中心页面失败处理。

## 2026-06-13 21:16 CST

- 完成：从工作台开始吸收 To Implement 原型到真实 `/erp/dashboard`。工作台首屏改为紧凑的“今日判断 + 当前处理 + 指标入口”结构：四个关键指标可直达任务看板、异常闭环、业务看板和打印中心；右侧当前处理卡读取今日焦点任务，提供处理、标记阻塞和查看关联记录入口；下方继续保留今日焦点、业务状态摘要、常用入口、角色提醒和运营工具。
- 完成：参考 `trade-erp` 和当前测试服中较好的紧凑卡片 / 指标点击 / 入口分流交互，只吸收布局和交互密度；没有恢复旧 `business_records`、旧外销业务语义、旧菜单真源或旧接口。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm --dir web style:l1` 通过；首次全量 `pnpm --dir web style:l1` 在业务模块列顺序同步等待处偶发超时，单独复跑 `business-menu-groups-desktop` 通过，第二次全量 `pnpm --dir web style:l1` 通过 47 个场景。
- 下一步：继续按同一节奏推进任务中心 Current 吸收，再推进业务模块标准页共享骨架；不要一轮把所有菜单页面做成半成品。
- 阻塞/风险：本轮只改真实工作台页面和样式，不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、正式菜单配置、原型阶段登记、提交或推送；工作区仍有其他既有改动，本轮未回退或整理。

## 2026-06-13 20:56 CST

- 完成：移除原型查看器列表 / 菜单侧 `action-modal-drawer-standard-v1` 的重复长参照范围文案。`/__dev/prototypes` 左侧卡片现在只显示标题、状态、路径和短摘要；右侧详情仍保留完整参照范围和后端 usecase / RBAC 边界说明。同步静态查看器 `docs/product/prototypes/index.html` 删除同一卡片的 `参照范围` 段落。
- 完成：补齐 `web/src/erp/config/devPrototypes.test.mjs` 对当前 18 个原型资产、11 个 To Implement 资产、两个新增原型目录和业务弹窗列表隐藏开关的断言，避免原型登记测试继续按旧资产数量失败。
- 验证：`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过；`cd web && node --check src/erp/config/devPrototypes.mjs` 通过；静态原型索引脚本检查确认业务弹窗卡片不再包含 `参照范围：出货、采购`。通过内置浏览器打开 `http://localhost:5175/__dev/prototypes`，点击业务弹窗标准样板后确认左侧卡片无长参照范围，右侧详情仍包含完整参照范围和后端边界说明。
- 下一步：如果还要继续精简原型列表，可按同一规则只保留菜单卡片短摘要，把完整适用范围放在详情区和 README。
- 阻塞/风险：本轮只改 dev-only 原型查看器、静态原型索引、原型配置测试和过程记录；不改正式运行时菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。`pnpm exec eslint ...` 对 `DevPrototypesPage.jsx` 返回 0 但提示该 JSX 文件被当前 ESLint 配置忽略，未作为有效 lint 验证依据。

## 2026-06-13 21:24 CST

- 完成：纠正上一轮只处理单张卡片的问题，改为全局移除原型查看器左侧列表 / 菜单卡片里的 `参照范围` 文案。`/__dev/prototypes` 卡片现在统一只保留标题、状态、目录和短摘要；右侧详情区继续展示完整参照范围。同步静态查看器 `docs/product/prototypes/index.html`，批量移除所有资产卡片的 `<p class="applies">` 段落。
- 完成：移除临时的单卡 `showAppliesInList` 开关和对应测试断言，避免把全局展示规则误做成单个资产特例；`appliesTo` 数据本身继续保留，用于详情区、搜索和 README 口径。
- 验证：`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过；`cd web && node --check src/erp/config/devPrototypes.mjs` 通过；静态索引检查确认不存在 `class="applies"` 段落；`git diff --check` 通过。通过内置浏览器打开 `http://localhost:5175/__dev/prototypes` 并点击后台工作台样板，确认左侧所有卡片均无 `参照范围`，右侧详情仍保留完整参照范围。
- 下一步：如果仍觉得卡片摘要偏长，可继续按“列表短摘要、详情完整说明”的规则压缩 `description`，但不改 `appliesTo` 真源说明。
- 阻塞/风险：本轮仍只改 dev-only 原型查看器、静态原型索引、原型配置测试和过程记录；不改正式运行时菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。

## 2026-06-13 21:45 CST

- 完成：继续压缩原型查看器左侧卡片，把摘要 `description` 也从列表卡片中移除。`/__dev/prototypes` 左侧卡片现在只保留标题、HTML / PNG 标签、阶段状态和目录路径；完整摘要和参照范围仍在右侧详情区。同步静态查看器 `docs/product/prototypes/index.html`，移除所有资产卡片的 `purpose` 段落并把资产行从 5 列收紧为 4 列。
- 完成：清理 `web/src/erp/styles/app.css` 中已失效的卡片摘要 / 参照范围选择器，并同步 `web/scripts/styleL1.mjs` 的 dev prototype 场景断言，改为检查 11 个待实现卡片、卡片无摘要 / 参照范围、右侧详情保留完整说明。
- 验证：`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过；`cd web && node --check src/erp/config/devPrototypes.mjs` 和 `node --check scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；静态索引检查确认无 `class="purpose"` / `class="applies"`；`git diff --check` 通过。通过内置浏览器打开 `http://localhost:5175/__dev/prototypes` 验证左侧卡片只剩索引信息，样例卡片高度约 95px，无页面级横向溢出，右侧详情仍保留摘要和参照范围。
- 下一步：如果还要进一步减少滚动，下一步应评审是否去掉每个目录分组头或改成扁平列表；不要再往卡片里加说明文案。
- 阻塞/风险：`pnpm style:l1` 已通过 dev prototype 场景，但后续在业务模块列顺序弹窗场景等待 `/admin` 同步响应超时失败；该失败点不在本轮原型卡片范围内，本轮未顺手修改业务模块列顺序逻辑或测试。

## 2026-06-13 22:06 CST

- 完成：按截图重排 `business-module-page-standard-v1/index.html` 的工作台区域，改成筛选一行、页面级动作一行、当前操作一行；按钮文案对齐采购合同场景：导出当前结果、列顺序、批量删除、回收站、新建记录、清空已选、关联表格、生成入库通知、打印采购合同等。
- 完成：默认选中第一条采购合同示例记录 `KSC260404001`，打开原型即可看到截图里的当前操作态；该示例仍只服务辅材 / 包材采购模块，不作为所有业务模块固定动作。
- 验证：业务模块原型内联脚本语法检查通过；`git diff --check -- docs/product/prototypes/business-module-page-standard-v1/index.html` 通过。通过本地 Playwright 打开 `http://127.0.0.1:8811/docs/product/prototypes/business-module-page-standard-v1/index.html` 验证 2048px 桌面和 390px 移动端：页面级横向溢出为 false，移动端操作区仅内部轻微横向滚动。
- 下一步：如果继续做真实页面吸收，应按模块分别定义选中行允许动作，不把本次采购合同动作照搬到客户、产品、库存、财务等页面。
- 阻塞/风险：本轮只改 To Implement 原型和过程记录，不改正式运行时页面、正式菜单、客户菜单配置、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、提交或推送。

## 2026-06-14 01:38 CST

- 完成：继续按 trade-erp 已验证交互收口真实业务页。`/erp/business-dashboard` 去掉旧 CommandCenter 说明壳，改成紧凑业务看板：顶部只保留业务摘要和刷新 / 任务看板入口，主体优先展示模块健康明细、业务状态分布、业务预警和业务关注统计。
- 完成：业务模块页隐藏 ERPLayout 自动生成的重复页面说明卡，保留面包屑和页面自身紧凑顶部；销售订单页将筛选、刷新、导出、列顺序、批量删除、回收站和新建订单合并到同一操作区，选中行操作补删除，主表列补排序和列设置入口。
- 完成：客户 / 供应商 V1 页主表补列设置入口、列排序和行内删除入口；业务页筛选卡与当前操作卡视觉上连成一组；同步 `style:l1` 断言，避免继续校验旧的“正式 MasterData / 当前订单行 / 旧业务看板长标题”等冗余文案。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；目标 `STYLE_L1_SCENARIOS=business-menu-groups-desktop,business-formal-module-shells-desktop,erp-business-dashboard-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1` 通过；全量 `pnpm --dir web style:l1` 通过 47 个场景；`git diff --check` 通过。
- 下一步：如果继续逐页深化，应从每个 formal-shell 模块的真实字段和真实动作矩阵开始，按模块替换默认“新建记录 / 生成资料 / 打印”等占位动作，不把某个截图按钮组固定成所有页面通用动作。
- 阻塞/风险：本轮仍不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实删除 / 回收站持久化能力或部署；回收站和批量删除在 V1 / formal-shell 中按原型交互展示，不伪造成已落地后端事实能力。

## 2026-06-14 09:21 CST

- 完成：继续把业务页真实运行时按“业务模块标准页样板”收口。V1 客户 / 供应商、销售订单和 formal-shell 业务页改为独立的顶部摘要、筛选区、结果工具条、当前操作条、业务表格和协同入口，不再把筛选输入、统计 tag 和操作按钮挤在同一层里；页面文案改成当前模块业务口径，去掉旧的英文真源说明式文案。
- 完成：把“业务弹窗标准样板”落到真实 V1 表单和业务操作弹窗。新建客户、新建销售订单使用宽弹窗、多列字段、标题说明和底部确认 / 取消；列顺序、批量删除、回收站统一接入 `erp-business-action-modal` 标准类；回收站保留批量恢复、刷新、选择计数、标准列和空状态。
- 完成：补强 `style:l1`，新增真实打开弹窗后的自动断言和单独截图：`business-v1-customers-form-modal.png`、`business-v1-sales-order-form-modal.png`、`business-formal-products-recycle-modal.png`、`business-column-order-modal.png`。断言覆盖弹窗居中、标准类、表单网格、必要字段数量、回收站按钮 / 列、横向溢出和空状态。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过；全量 `pnpm --dir web style:l1` 通过 47 个场景；`git diff --check` 通过。
- 下一步：如果继续深化，应该按每个正式模块的真实业务字段和动作矩阵逐页替换 formal-shell 默认占位动作；不要把采购 / 出货截图里的按钮组照搬到客户、产品、库存或财务页。
- 阻塞/风险：本轮只落地前端页面布局、样式、文案和交互回归；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实删除 / 回收站持久化、部署、提交或推送。回收站和批量删除仍是前端交互样板 / 读模型边界，不伪造成已接入后端事实能力。

## 2026-06-14 09:47 CST

- 完成：按用户截图继续校正业务页中间操作区。新增共享 `BusinessOperationPanel`，将筛选、左侧工具按钮、右侧新建按钮和当前操作合并为一个整体 Card；只在当前操作上方保留一条虚线分隔，不再拆成筛选 / 工具 / 当前操作三个盒子。
- 完成：V1 客户 / 供应商、销售订单和 `FormalBusinessModulePage` 均切换到整体操作盒；业务操作盒内移除重复“刷新”按钮，保留壳层“刷新当前页”；新建按钮固定在右侧，其余导出、列顺序、批量删除、回收站在左侧；底部当前操作按钮压成更小尺寸。
- 完成：同步校对 `business-module-page-standard-v1` 原型：操作区保留一个整体 box、无刷新按钮、新建在右侧、当前操作上方 1px dashed、未选中时底部动作按钮可见但禁用，避免原型继续误导真实实现。
- 完成：更新 `style:l1` 业务页断言，改为检查整体操作盒、禁止旧三段 Card、禁止操作盒内刷新、检查虚线分隔、列顺序和回收站从新操作盒打开；同步修正协同区当前文案为“本页协同”。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop,business-menu-groups-desktop pnpm --dir web style:l1` 通过；全量 `pnpm --dir web style:l1` 通过 47 个场景；原型静态 Playwright 截图和 DOM 检查确认 operation box 高度 182px、当前操作分隔为 1px dashed、无刷新按钮、新建按钮在右侧；`node --check web/scripts/styleL1.mjs` 和 `git diff --check` 通过。
- 下一步：继续深化时只应按各业务模块真实字段 / 动作矩阵替换按钮文案和可用性，不再改回三段式工具区；如果要减少顶部摘要统计，也应单独评审，不和操作区结构混在一起。
- 阻塞/风险：本轮仍只改前端共享组件、业务页样式、业务页回归脚本和 To Implement 原型；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实删除 / 回收站持久化、部署、提交或推送。

## 2026-06-14 09:45 CST

- 完成：按业务页协同入口原型继续收口真实 `CollaborationTaskPanel`。收起态改为贴底单行摘要，标题为“本页协同”，只保留当前记录、本页待办、阻塞异常和展开按钮；展开态只保留本页待办、当前记录、阻塞异常三类实际 Workflow 视图，删除桌面高度拖拽手柄和“已完成”浏览型 tab。
- 完成：同步浅色 / 暗色 / 移动端样式。协同入口抵消后台内容区底部 padding 后贴近视口底部；窄屏下隐藏长边界说明，展开按钮固定在可见位置，摘要和标签只在内部横向滚动，不撑宽页面。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；全量 `pnpm --dir web style:l1` 通过 47 个场景。通过内置浏览器验证 `/erp/sales/project-orders/sales-orders`：桌面收起态面板 54px、头部 28px、底部间距 4px；展开态面板 194px、无拖拽手柄、无已完成 tab、任务列表可滚动；暗色态颜色走暗色 token；390px 移动端收起态 54px、展开态 320px、无页面横向溢出、展开按钮可见。
- 下一步：后续如果真实 workflow 任务数量和任务详情增加，应继续复用现有 Workflow payload / action 回调，不在协同入口里补造库存、出货、财务、开票或收付款事实。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、原型阶段登记、部署、提交或推送。内置浏览器截图能力本轮仍在 `Page.captureScreenshot` 超时，视觉证据以 DOM / 盒模型 / 控制台检查为准。

## 2026-06-14 10:02 CST

- 完成：修正正式业务页顶部统计卡换行问题。`erp-business-page-header-card__stats` 在桌面态改为固定单行 flex，四个统计项等宽压缩并禁止标签换行；窄屏保留允许换行和无横向溢出的响应式边界。
- 完成：补强 `style:l1` 业务页断言，`business-formal-module-shells-desktop` 现在检查 formal 业务页顶部统计保留 `总记录 / 当前结果 / 待处理 / 已选记录` 四项、桌面同一行、标签 `nowrap`、容器无内部横向溢出、页面无横向溢出。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`git diff --check -- web/src/erp/styles/app.css web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web test`、`git diff --check` 均通过。通过内置浏览器验证 `/erp/master/products`：1440px 下四个统计卡同 top、每项 119px、`flex-wrap: nowrap`、无横向溢出；选中一条记录后 `已选记录` 更新为 1 仍同排；390px 移动视口无横向溢出。
- 下一步：如果后续继续压缩业务页头部，应单独评审是否减少统计项，不要用 CSS 换行掩盖信息密度问题。
- 阻塞/风险：全量 `pnpm --dir web style:l1` 仍失败在既有打印工作台场景 `print-workspace-material`，错误为采购合同头部信息行数读到 0，单独重跑该场景同样失败；该失败不在本轮业务页统计卡路径，本轮未顺手修改打印工作台。本轮只改业务页头部统计样式和回归断言；不改业务字段、保存、打印、导出、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、部署、提交或推送。当前工作区仍有多处既有未提交改动，本轮未回退或整理。

## 2026-06-14 10:10 CST

- 完成：按截图把 V1 客户 / 供应商页的联系人区域从第二个并列表格收口为主表下方的内嵌“联系人明细”面板。未选主体时只显示轻量空态和禁用的新建联系人按钮；选中主体后才展示联系人表格和联系人数量，继续保持联系人随 `CUSTOMER / SUPPLIER` 主体维护的主从边界。
- 完成：补齐联系人明细面板浅色、暗色和窄屏样式，控制标题、说明、统计 chip、按钮和表格的换行 / 省略 / 溢出边界；同步 `style:l1` 客户页断言，覆盖联系人明细文案和新建联系人弹窗。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1` 均通过；内置浏览器验证 `/erp/master/partners/customers` 空数据状态：页面标题正确、console 无 warn/error、联系人面板 1 个、面板内无第二个业务表格 Card、`新建联系人` 禁用、主内容无横向溢出。
- 下一步：如果后续要支持联系人编辑、设为主联系人或停用，应复用当前主体选中态和后端 `contact.*` API，不把联系人提升为独立主入口或独立事实。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实客户 / 联系人数据或菜单配置。目标组合场景 `STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1` 仍在既有产品页列顺序同步等待处超时；该失败不在客户 / 联系人路径，本轮未顺手修改产品页列顺序逻辑。

## 2026-06-14 10:12 CST

- 完成：按“业务弹窗标准样板”继续收口真实业务页弹窗共享样式。`erp-business-action-modal` 统一了弹窗圆角、分隔线、头部 / 内容 / 底部布局、滚动边界、表格容器、移动端宽度和暗色 token；formal-shell、V1 销售订单、V1 客户 / 供应商的表单、列顺序、批量删除和回收站弹窗均走同一套外观基线。
- 完成：修复产品页列顺序弹窗连续操作回归超时。列顺序弹窗里的“移到最前 / 移到最后”图标按钮改为 `title` + `aria-label`，不再用 Ant Tooltip 包裹连续点击按钮，避免 Tooltip 浮层截获下一次点击；按钮语义提示仍保留。
- 验证：`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过。目标回归覆盖客户 / 联系人 / 销售订单表单弹窗、产品回收站弹窗、列顺序弹窗默认态、交互态、账号偏好同步和 reload 后恢复态。
- 下一步：后续逐页深化时继续按各模块真实字段和动作矩阵替换占位动作；不要把出货或采购截图里的按钮组无差别套到客户、产品、库存或财务页。
- 阻塞/风险：本轮只改前端弹窗样式、列顺序按钮提示方式和过程记录；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实删除 / 回收站持久化、部署、提交或推送。当前工作区仍有多处既有未提交改动，本轮未回退或整理。

## 2026-06-14 10:15 CST

- 完成：按线上 `admin.yoyoosun.net` 的正式业务页参考，恢复业务页协同入口展开态顶部的灰蓝色粗横杠视觉握柄。真实运行时只补视觉提示，不恢复旧版桌面高度拖拽，也不恢复“已完成”浏览型 tab；收起态仍只保留一行摘要。
- 完成：同步 `business-module-page-standard-v1/task-collab-entry-v2.html` 原型和 README：展开态展示 64px × 5px 横杠，收起态隐藏横杠，避免原型违背“一行收起”的产品要求。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=business-menu-groups-desktop,business-formal-module-shells-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1` 通过 3 个业务页相关场景；`git diff --check -- web/src/erp/components/business-list/BusinessListLayout.jsx web/src/erp/styles/app.css docs/product/prototypes/business-module-page-standard-v1/task-collab-entry-v2.html docs/product/prototypes/business-module-page-standard-v1/README.md progress.md` 通过。
- 验证：通过内置浏览器和 Playwright 盒模型检查 `/erp/sales/project-orders/sales-orders`：桌面收起态 54px、底部间距 4px、无横杠；展开态横杠 64px × 5px、握柄高度 14px、无拖拽手柄、无“已完成”tab、无横向溢出；390px 移动端收起态 54px，展开态横杠 64px × 5px，浅色 / 暗色均通过；原型 HTML 展开态有横杠、收起态横杠 display none。
- 下一步：如果后续还要校准协同入口视觉，应继续以“收起一行、展开只处理本页 Workflow”为边界，不把协同入口扩展成任务看板或事实处理入口。
- 阻塞/风险：全量 `pnpm --dir web style:l1` 本轮两次失败于脚本自启 `4173` dev server 连接断开 / 端口残留，不是本次协同入口断言失败；已清理本轮遗留的 `4173` 进程，并用现有 `5175` 服务完成受影响业务页定向回归。本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、部署、提交或推送。

## 2026-06-14 10:18 CST

- 完成：按 trade-erp 表头和用户截图继续校准业务主表。正式业务样板、V1 客户 / 供应商、V1 销售订单主表全部去掉右侧行内“操作”列；主表左侧改为受控勾选列，数据列不设置 `fixed`，查看 / 编辑 / 删除 / 流转等动作只保留在选中后的“当前操作”栏。
- 完成：业务主表表头列设置入口从齿轮改为竖向三点，继续保留 Ant Table 排序箭头；联系人明细和订单行明细也去掉行尾操作列，避免和主表当前操作栏重复。`style:l1` 新增主表断言：不得出现“操作”表头、不得出现 Ant 固定列 class、每个数据列必须有列顺序入口和排序入口；列顺序回归开始前清理对应 localStorage，避免历史顺序残留导致连续移动列误判。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm --dir web style:l1` 通过 1 个场景；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop,business-menu-groups-desktop pnpm --dir web style:l1` 通过 3 个业务页场景。截图检查 `business-menu-groups-desktop.png`、`business-module-dark-customers-desktop.png` 确认主表左侧勾选列、右侧无“操作”列、表头有竖向三点和排序箭头。
- 下一步：如果后续要恢复联系人或订单行编辑 / 停用 / 取消，应设计为明细区选中态或弹窗内明细操作，不要重新把“操作”列塞回业务主表右侧。
- 阻塞/风险：全量 `pnpm --dir web style:l1` 本轮两次失败于非业务页浏览器上下文被关闭：一次在 `permission-center-desktop`，单独复跑该场景通过；一次在 `erp-dashboard-redirect` 截图阶段关闭。业务页专项回归均通过。本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实回收站持久化、部署、提交或推送。

## 2026-06-14 10:20 CST

- 完成：按截图收掉 `/erp/task-board` 顶部由 `ERPLayout` 自动生成的独立“任务看板”说明 box；任务看板页面继续使用本体内的任务中心标题、统计、筛选、泳道和明细表，不把 seed 菜单说明重复合并到下方。
- 完成：补强 `style:l1` 任务看板布局断言，明确 `/erp/task-board` 不应再渲染 `.erp-admin-page-head` 独立页面说明卡，同时保留筛选区、四个泳道、表格横向滚动和页面无横向溢出检查。
- 验证：`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-task-board-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/components/ERPLayout.jsx web/scripts/styleL1.mjs` 均通过。
- 下一步：如继续压缩任务看板信息密度，应优先评审任务中心本体内的标题、统计和筛选组合，不再恢复壳层说明卡。
- 阻塞/风险：`pnpm --dir web lint` 当前失败在既有 `web/src/erp/components/business-list/BusinessListLayout.jsx` 可访问性规则 `jsx-a11y/no-noninteractive-element-interactions` / `jsx-a11y/no-noninteractive-tabindex`，不在本轮任务看板壳层路径，本轮未顺手修改；执行过程中工作区已有大量非本轮未提交改动，并新增非本轮未跟踪 `web/src/erp/components/business-list/ColumnOrderModal.jsx`，本轮未纳入。

## 2026-06-14 10:27 CST

- 完成：按用户截图收口业务页列顺序弹窗。新增共享 `ColumnOrderModal`，formal-shell、销售订单主表 / 订单行、客户 / 供应商主数据页统一使用同一套弹窗；弹窗补齐账号保存说明、序号、`移到最前 / 上移 / 下移 / 移到最后` 四类动作按钮、首尾边界禁用、恢复默认和完成按钮。
- 完成：主数据页列顺序从旧的禁用“置顶 / 置底”占位改为真实偏好保存；表格展示和导出共用当前列顺序，状态列导出继续输出“启用 / 停用”，不把 React 标签对象写进 CSV。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过，全量 L1 覆盖 47 个场景；in-app Browser 打开 `/erp/master/products` 验证列顺序弹窗 8 行、每行 4 个按钮、说明文案存在、首列上移 / 移到最前禁用、末列下移 / 移到最后禁用，行宽无横向溢出。
- 下一步：如继续吸收业务弹窗标准样板，可再检查回收站、批量删除和详情抽屉是否仍有旧文案、占位按钮或页面间分叉。
- 阻塞/风险：本轮只改前端列顺序弹窗、主数据列顺序偏好、样式和 L1 回归断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、真实业务写入或菜单配置。in-app Browser 截图捕获接口本次超时；`style:l1` 已生成列顺序弹窗截图并通过。

## 2026-06-14 10:29 CST

- 完成：把业务页协同入口顶部粗横杠升级为真实 `CollaborationPanelResizeHandle` 组件。展开态可拖动调整入口高度，当前高度保存在 React state 中，收起再展开保持；刷新页面后恢复默认 320px，不写 localStorage，避免临时手动高度变成长期偏好。
- 完成：协同入口展开态改为组件自有 `__body` 高度容器和内部滚动列表，不再依赖 AntD `.ant-card-body` 选择器；拖动握柄使用真实 button、`ns-resize` 光标、键盘上下 / Home / End 调整，横杠仍保持 64px × 5px。同步原型 HTML 和 README，原型也能拖动并保留收起单行。
- 完成：修正 `style:l1` 协同入口断言为当前三类 Workflow tab：本页待办、当前记录、阻塞异常；保留桌面拖高 / 拖低 / 最小高度 / 内部滚动边界断言，避免后续再误删拖动能力。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_BASE_URL=http://127.0.0.1:5175 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-menu-groups-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1` 通过 3 个业务页相关场景；`git diff --check -- web/src/erp/components/business-list/BusinessListLayout.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs docs/product/prototypes/business-module-page-standard-v1/task-collab-entry-v2.html docs/product/prototypes/business-module-page-standard-v1/README.md progress.md` 通过。
- 验证：Playwright 盒模型检查 `/erp/sales/project-orders/sales-orders`：桌面收起态 54px；展开默认 `__body` 320px；向上拖动后 460px；向下拖动后 370px；收起再展开仍为 370px；刷新后恢复 320px；无“已完成”tab、无横向溢出、console 无 error / warning。390px 移动视口收起态 54px、展开 320px、拖高到 400px、无横向溢出。原型 HTML 展开 320px、拖高 400px、收起态隐藏握柄且高度 56px。
- 下一步：后续如果要把高度长期记忆到浏览器本地，应单独评审是否需要 per-page key、清除入口和移动端上限；当前按用户要求只缓存到刷新前。
- 阻塞/风险：内置浏览器在点击协同入口时出现底层 CDP `Runtime.evaluate` 超时，已按前端调试流程降级到项目 Playwright 完成同路径验证；本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、部署、提交或推送。

## 2026-06-14 10:50 CST

- 完成：按截图压缩正式业务页模块间距。`ERPLayout` 将 `/erp/production/*` 和 `/erp/warehouse/*` 纳入业务页头隐藏范围，去掉生产进度等正式业务页上方重复的壳层说明 box；业务页共享 layout 的模块 gap 从 10px 收到 6px，并同步压缩 header / 操作区 / 表格卡片的内部 padding 和操作区内部 gap。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过，全量 L1 通过 47 个场景。通过内置浏览器验证 `/erp/production/progress`：桌面默认态无 `.erp-admin-page-head`，业务卡片间距为 6px，页面无横向溢出；选中第一条记录后操作按钮启用，操作区到表格仍为 6px；清空选择后恢复未选中态；390px 移动视口无重复页头、无横向溢出，业务卡片间距保持 6px。
- 下一步：如果后续还觉得业务页头部信息密度偏高，应单独评审是否减少统计项或合并标题信息，不要再通过恢复壳层页头或增加外层 Card 解决。
- 阻塞/风险：本轮只改前端共享业务页布局和过程记录；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、业务字段、打印、导出、部署、提交或推送。内置浏览器截图接口本轮仍出现 `Page.captureScreenshot` 超时；本轮视觉验收以 DOM / 盒模型 / 控制台和 `style:l1` 回归为准。

## 2026-06-14 11:42 CST

- 完成：按截图统一业务页筛选控件宽度。`SelectFilter` 默认增加普通下拉筛选类，`BusinessOperationPanel` 桌面筛选区将搜索框收口为约 340px、下拉筛选收口为约 180px，避免“全部主体 / 全部状态”在业务操作盒内占满整行；移动端继续走窄屏整行布局，不沿用桌面固定宽度。
- 完成：`style:l1` 补充业务页操作区筛选盒模型断言，桌面下要求搜索框和下拉筛选都在合理宽度范围内，防止后续共享样式或页面接入再把 select 拉满。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过，全量 L1 通过 47 个场景；in-app Browser 在 `/erp/master/partners/customers` 和 `/erp/master/products` 验证桌面业务筛选：搜索框 340px、下拉 180px、无横向溢出、console 无 error / warning，并覆盖暗色和浅色。
- 下一步：如后续继续调整业务页筛选，应优先改共享 `SearchInput` / `SelectFilter` / `BusinessOperationPanel` 宽度策略，不逐页给单个 select 写特殊宽度。
- 阻塞/风险：本轮只改前端共享筛选控件、CSS 和 L1 断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、业务字段、打印、导出、部署、提交或推送。最后一次移动端复拍时 in-app Browser 新标签导航被 URL policy 拦截，未继续绕过；移动端以通过的 `style:l1` 和 CSS 断点规则为准，未再补最终 Browser 截图。

## 2026-06-14 11:57 CST

- 完成：按 Product Design 选定的 `Object Pulse` 方向重新实现 `/erp/dashboard` 工作台首屏：顶部收口为紧凑 KPI 条，主体改为左侧优先处理队列、右侧任务详情和业务对象脉搏，下方保留流程状态总览与角色工作负载；删除旧的分散卡片墙布局，不新增菜单、后端 API、RBAC、schema、migration 或事实写入。
- 完成：`style:l1` 增加工作台盒模型断言，覆盖桌面、移动和暗色桌面：校验 5 个紧凑指标、队列 / 详情 / 业务对象脉搏可见、桌面左右布局、窄屏上下布局、无页面级横向溢出和关键区域不重叠。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；全量 L1 通过 47 个场景，单测通过 308 个用例。in-app Browser 验证 `/erp/dashboard`：默认 1280 宽为单列、1440 宽为左队列 + 右上下文两栏，页面无横向溢出，console 无 error / warning。
- 下一步：如果继续提升看板中心，应优先在当前工作台队列筛选、任务详情和业务对象脉搏内迭代，不恢复多个大卡片并列，也不要把快捷入口升级成正式菜单结构。
- 阻塞/风险：本轮只改前端工作台布局、样式和 L1 断言；`business-list` 筛选宽度相关改动是本轮开始前已有工作区现场，已保留未回退。工作台仍只处理 Workflow 协同任务和 `dashboard_stats` 只读投影，不代表库存、出货、财务、发票或收付款事实过账。

## 2026-06-14 12:02 CST

- 完成：看板中心内容区不再显示局部刷新按钮。`/erp/dashboard` 移除工作台顶部“刷新”，`/erp/task-board` 移除“刷新任务”，`/erp/business-dashboard` 移除“刷新业务数据”；三个页面继续通过 `registerPageRefresh(loadDashboardStats)` 使用壳层“刷新当前页”。
- 完成：`style:l1` 增加看板中心内容区局部刷新按钮禁用断言，任务看板造数后的数据刷新改走全局“刷新当前页”，覆盖工作台、任务看板、业务看板的桌面 / 移动 / 暗色相关场景。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-task-board-desktop,erp-business-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-task-board-dark-wide-desktop,erp-business-dashboard-mobile pnpm --dir web style:l1`、`git diff --check` 均通过；单测通过 308 个用例，目标 L1 通过 7 个场景。
- 下一步：后续看板中心若还要减少顶部动作，应优先复用壳层动作和页内主内容入口，不再给每个看板页加重复刷新。
- 阻塞/风险：本轮只改前端看板中心页面动作区和 L1 断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送。工作区中 `business-list` 和 `app.css` 的筛选宽度相关改动是本轮开始前已有现场，已保留未回退。

## 2026-06-14 12:08 CST

- 完成：继续按截图移除看板中心里的重复“任务看板 / 回任务看板”跳转按钮。`/erp/dashboard` 工作台顶部不再显示“任务看板”，`/erp/business-dashboard` 顶部不再显示带返回箭头的“任务看板”，`/erp/operations/exceptions` 不再显示“回任务看板”；左侧正式菜单入口保持不变。
- 完成：`style:l1` 将对应页面的跳转点击断言改为负向按钮断言，保留工作台布局、业务看板内容、异常闭环步骤和壳层“刷新当前页”回归。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-business-dashboard-desktop,erp-exception-flow-desktop pnpm --dir web style:l1` 均通过；目标 L1 通过 5 个场景，单测通过 308 个用例。in-app Browser 在 `http://localhost:5175` 验证工作台、业务看板和异常闭环均非空，内容区没有 `任务看板`、`回任务看板`、`刷新`、`刷新任务` 或 `刷新业务数据` 局部按钮；壳层 `刷新当前页` 点击后仍停留在工作台。
- 下一步：如后续要进一步隐藏左侧菜单里的任务看板入口，需要单独评审产品默认菜单、客户菜单配置和 RBAC，不应和页面内重复按钮清理混在同一轮。
- 阻塞/风险：本轮只改前端看板中心页面动作和 L1 断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送。Browser console 仍有既有 `admin.me` rate limit 后使用本地缓存 profile 的 warning，不影响本轮按钮可见性验证。

## 2026-06-14 12:18 CST

- 完成：业务页主表格统一按列宽和选择列估算横向 `scroll.x`，调用方传入的数值小于列宽总和时自动抬高，避免列被压窄导致表头换行；业务表格表头、排序标题和列顺序按钮标题统一保持单行，内容单元格仍保留原本换行策略。
- 完成：`style:l1` 的业务页盒模型断言补充表格横向滚动容器和表头单行检查；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、业务字段、打印、导出或部署。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=print-workspace-material pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；全量 L1 最终通过 47 个场景，单测通过 308 个用例。in-app Browser 验证 `/erp/production/progress`：桌面 1280 宽表格容器 `clientWidth=902 / scrollWidth=1622`，横向滚动后 `scrollLeft=650`；移动 390 宽表格容器 `clientWidth=340 / scrollWidth=1622`，横向滚动后 `scrollLeft=500`；两种视口表头 `white-space=nowrap`、页面级横向溢出为 0、console 无 error / warning。
- 下一步：如果后续业务页新增更宽字段，应优先给列配置合理 `width`，共享表格会按列宽总和承接横向滚动，不逐页补表头换行特殊规则。
- 阻塞/风险：全量 `style:l1` 第一次复跑时 `print-workspace-material` 偶发失败，单独复跑该场景通过，第二次全量复跑也通过；本轮没有修改打印模板或打印工作台逻辑。

## 2026-06-14 12:22 CST

- 完成：按截图修正业务页“当前操作”未选中态左右垂直对齐。共享 `SelectionActionBar` 行容器从顶部对齐改为中线对齐，`style:l1` 补充桌面当前操作行 `align-items: center` 与左侧主文案 / 右侧按钮组中心线断言，避免后续回退。
- 完成：顺手把业务看板指标卡右侧“摘要”胶囊从 `span:last-child` 收口为语义类名，消除当前工作区 `pnpm css` 的 selector specificity 报错，不改变业务看板行为。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=erp-task-board-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4178 pnpm --dir web style:l1`、`git diff --check` 通过；全量 L1 通过 47 个场景，单测通过 308 个用例。in-app Browser 验证 `/erp/master/partners/customers`：当前操作行 `align-items=center`，左侧主文案中心线与右侧按钮组中心线差值 `0px`；筛选输入交互后差值仍为 `0px`，页面无横向溢出。
- 下一步：如果后续继续调整业务页操作区，应优先改共享 `SelectionActionBar` 和对应 L1 盒模型断言，不逐页写特殊对齐。
- 阻塞/风险：本轮只改前端共享业务页当前操作对齐、已有业务看板指标 badge 选择器和 L1 断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单配置、业务字段、打印、导出、部署、提交或推送。Browser 截图接口仍 `Page.captureScreenshot` 超时，本轮视觉证据以 DOM / 盒模型 / 控制台为准；控制台仅见既有 `admin.me` rate limit 后使用本地缓存 profile 的 warning。

## 2026-06-14 12:29 CST

- 完成：按 Product Design 方向新增 `metric-card-interaction-standard-v1` 原型样板，明确只读统计卡、筛选统计卡和动作入口卡三类语义；同步登记到原型 README、静态索引、dev-only 原型查看器和文档清单。
- 完成：真实页面吸收第一批规则。`/erp/task-board` 顶部指标保持真实 `button`，增加动作提示、箭头图标、pointer / hover / focus / `aria-pressed` 和选中态；`/erp/business-dashboard` 汇总指标保持只读 `div`，增加“摘要”角标、default 光标、无按钮角色；`/erp/dashboard` 业务对象脉搏入口补充进入箭头，避免整块看起来像静默统计。
- 完成：`style:l1` 增加任务看板和业务看板指标卡语义断言，覆盖桌面、移动和暗色相关场景，防止后续把只读摘要伪装成可点卡，或把可点筛选卡退回静默卡片。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=erp-task-board-desktop,erp-task-board-mobile,erp-task-board-dark-wide-desktop,erp-business-dashboard-desktop,erp-business-dashboard-mobile pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；单测通过 308 个用例。
- 验证：in-app Browser 使用本仓库 5175 端口验证 `/__dev/prototypes` 可见并打开“指标卡交互语义样板”，iframe srcdoc 包含只读卡、筛选 button、动作 button、`aria-pressed`、default / pointer 光标规则和“摘要”角标；验证 `/erp/task-board` 四个指标均为 `BUTTON`、pointer、动作提示、图标、至少一个 active；验证 `/erp/business-dashboard` 四个摘要均为 `DIV`、default 光标、无 role、无内部 button、含“摘要”角标。
- 下一步：如果继续全局推广，应按页面扫描所有 KPI / 数字入口，把共享组件和 class 命名再收口；不要机械把所有数字卡都改成按钮。
- 阻塞/风险：本轮只实现看板中心相关页面和原型标准，不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送；其他业务页、移动岗位端和历史原型里可能仍有相似视觉但语义未统一的指标卡，需要后续按路径逐批迁移。

## 2026-06-14 12:37 CST

- 完成：按用户追问补做全局扫描，确认上一轮不是全局全部迁移。正式运行时里继续收口两类主路径：共享业务页头 `PageHeaderCard` 的 `stats` 统一标为只读摘要；移动岗位端“我的”四个指标入口保持真实按钮并补充 `aria-label`、进入箭头和“查看任务”提示。
- 完成：同步 CSS 暗色覆盖和回归断言。业务页头统计要求 `DIV`、default 光标、无 role、无内部 button、带“摘要”角标；移动端“我的”指标要求 `BUTTON`、pointer、可见边框 / 阴影、动作提示和箭头。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop,mobile-tasks-dark,erp-task-board-desktop,erp-business-dashboard-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；单测通过 308 个用例，目标 L1 通过 5 个场景。
- 下一步：如果还要继续扫全产品 UI，应把 dev-only 台账、权限中心、打印中心、打印工作台、历史原型和移动端其他区块逐页分类评审；只读摘要、筛选按钮、动作入口不能混用同一种视觉。
- 阻塞/风险：本轮没有把所有 dev-only 指标和打印工具内部按钮都改掉；它们不是客户主运行时的相同问题。in-app Browser 最后抽查时被 URL policy 拦截，未继续绕过；实际页面语义以通过的 `style:l1` 浏览器回归为准。未改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送。

## 2026-06-14 17:08 CST

- 完成：确认用户截图里的采购合同 / 加工合同模板卡属于可点击选择按钮。`PrintCenterPage` 中模板目录使用真实 `button` 和 `aria-pressed`，本轮补充右侧动作位：当前模板显示“当前模板”，非当前模板显示“选择”，并统一加箭头图标，避免模板卡看起来像只读状态块。
- 完成：同步浅色 / 暗色 CSS 和 `style:l1` 断言。打印模板按钮现在要求 `BUTTON`、pointer、`aria-pressed`、动作文本、箭头图标和无横向溢出。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-center-desktop,print-center-dark-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；打印中心目标 L1 通过 2 个场景。
- 下一步：继续遇到这种“大块卡片”时先看真实元素和行为：如果是 `button/link` 就要露出动作信号；如果是只读 `div` 就要保持安静并标摘要或状态。
- 阻塞/风险：本轮只改模板打印中心前端按钮语义、样式和 L1 断言；不改打印模板字段、打印窗口、PDF、后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送。

## 2026-06-14 17:10 CST

- 完成：修正业务页头只读摘要统计里的标签省略号问题。统计区宽度从 `min(500px, 50vw)` 放宽到 `min(640px, 56vw)`，统计卡高度留出余量；标签不再使用 `text-overflow: ellipsis`，改为完整显示并在极窄空间自然换行。
- 完成：同步 `style:l1` 断言，从旧的“标签必须单行 nowrap”改为“不能用省略号裁切、不能横向溢出、仍保持只读摘要语义”。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,business-module-dark-customers-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；目标 L1 通过 2 个场景。
- 下一步：后续业务页头如果再出现短标签被裁切，优先调整容器宽度、换行策略或角标位置，不用省略号隐藏业务词。
- 阻塞/风险：本轮只改前端业务页头统计样式和 L1 断言；不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、菜单 seed、部署、提交或推送。

## 2026-06-14 17:50 CST

- 完成：按用户反馈继续压缩业务页头只读摘要统计。统计区从整行大卡片收紧为 `fit-content` 紧凑摘要条，桌面每项宽度控制在约 124-132px；768px 以下改为两列，不再四列硬撑或整行拉长。
- 完成：同步 `style:l1` 尺寸断言，要求业务页头统计卡完整显示标签、不使用省略号、不横向溢出，并限制桌面单卡宽度不超过 150px。
- 验证：`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；目标 L1 通过 1 个场景。
- 下一步：如果还觉得页头信息占空间，可以进一步评审是否把“摘要”角标移到卡片组标题或只保留在辅助属性里，但不要再通过省略业务词来压缩。
- 阻塞/风险：`business-formal-module-shells-desktop` 当前会被工作区中已有的双击详情回归 helper 卡住，不是本轮摘要卡样式导致；本轮未继续改该历史 helper。当前工作区还存在多处非本轮文件改动，已保留未回退。

## 2026-06-14 17:27 CST

- 完成：修正 formal-shell 业务页行双击语义。`FormalBusinessModulePage` 现在单击行仍只选中记录，双击行走与“编辑”按钮一致的业务动作弹窗；显式“详情”按钮继续打开详情抽屉。弹窗新增当前边界说明，强调 formal-shell 真实保存必须等领域 usecase、API 和 RBAC 接入，不能由前端本地伪造事实。
- 完成：同步正式文档口径。`docs/current-source-of-truth.md`、`web/README.md` 和 `docs/product/formal-menu-entry-plan.md` 均改为“显式详情、双击 / 编辑动作提示”，避免后续继续把双击默认理解成详情抽屉。
- 验证：已执行 `node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/pages/FormalBusinessModulePage.jsx web/scripts/styleL1.mjs docs/current-source-of-truth.md web/README.md docs/product/formal-menu-entry-plan.md progress.md`，均通过；前端测试 308 个用例通过，目标 L1 通过 1 个场景。
- 下一步：如果继续把 formal-shell 推向真实完成，应按模块补字段、保存 usecase、JSON-RPC、RBAC、删除 / 回收站真实持久化和测试；库存台账仍应通过盘点 / 调整 / 调拨等受控动作改事实，不能直接编辑台账余额。
- 阻塞/风险：本轮不改后端 API、RBAC、schema / migration、WorkflowUsecase、Fact usecase、库存事实写入、菜单 seed、部署、提交或推送。当前工作区已有其他未提交改动，本轮只在相关文件上增量修改并保留现场。

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
