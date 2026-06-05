# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。

## 2026-06-05
- 完成：统一移除主题菜单触发按钮的 tooltip。`ERPThemeToggle` 的 menu 形态现在只保留按钮 `aria-label` 和下拉菜单选中态，不再在点击主题按钮时额外弹出“主题：浅色 / 暗色”提示，避免移动端菜单选项被 tooltip 覆盖。
- 完成：`style:l1` 的主题菜单切换 helper 新增断言，菜单打开后不允许出现可见的“主题” tooltip，防止后续重新包回 tooltip 造成遮挡回归。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,mobile-tasks-dark pnpm style:l1` 通过，覆盖桌面登录页主题菜单和移动任务端暗色主题场景。Browser 复用 `http://127.0.0.1:5175`，390x844 视口打开移动任务入口后未登录守卫落到 `/admin-login`，主题菜单打开时“跟系统 / 浅色 / 暗色”可见、可见主题 tooltip 数为 0，点击“暗色”后按钮变为“主题模式：暗色”，console error/warn 为空。
- 下一步：如后续继续优化移动端主题菜单，可优先调整菜单位置、触控尺寸或选中态，不再为该按钮恢复 hover tooltip。
- 阻塞/风险：本轮只改前端共用主题组件和 L1 回归脚本；未改主题真源、localStorage key、暗色样式 token、后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 截图接口本轮仍出现 `Page.captureScreenshot` 超时，视觉证据以 L1 产物为准；Browser DOM / console / 交互状态已验证。

- 完成：撤销生产 Compose README 中 `8.218.4.199` / Cloudflare / `yoyoosun.net` 域名 / Nginx / Let's Encrypt 作为当前部署真源的旧口径，当前部署目标改为内网服务器 `192.168.0.133`，Compose 入口为 `/opt/plush-toy-erp/current/server/deploy/compose/prod`。本轮未向 `8.218.4.199` 上传、加载镜像、重启服务或修改文件。
- 完成：按低配服务器发布约束在本机构建并上传 amd64 前端镜像 `plush-toy-erp-web:20260605T101206-0e5b65b-mobile-metrics-amd64`，服务器侧仅执行 `docker load`、更新 `.env` 的 `WEB_IMAGE`、重建 9 个 web 容器；服务端镜像仍为 `plush-toy-erp-server:20260531T145153-9b414a58-vm`。
- 完成：线上 Atlas 状态初查发现 1 个历史 pending migration `20260530161152`。该迁移为新增 `contacts / suppliers / customers / sales_orders / sales_order_items` 及索引约束，dry-run 通过后使用宿主机 `/usr/local/bin/atlas` 执行 apply；迁移后 `Migration Status: OK`，当前版本 `20260530161152`，pending files 为 0。
- 验证：`192.168.0.133` 上 `5175` 和 `5186-5193` 的 `/healthz` 均返回对应桌面 / 移动端 `{"status":"ok"}`；`8300/healthz` 返回 `ok`，`8300/readyz` 返回 `ready`；9 个 web 容器均 `healthy` 并运行新镜像。发布后按约定执行 `docker image prune -a -f` 与 `docker builder prune -f`，未执行 volume prune；清理前 `/` 为 98G / used 19G / avail 74G，清理后 avail 75G，回收 unused images 314.8MB。
- 下一步：后续如果要恢复公网域名或网关入口，必须先补新的正式部署方案、README、Compose 环境说明和 smoke，不要沿用已撤销的阿里云 / Cloudflare 旧口径。
- 阻塞/风险：本轮前端功能发布只改 web 镜像；Atlas apply 是补齐线上 release 已携带的历史 pending migration，不来自本轮移动端统计卡改动。清理已删除未被容器使用的旧 web 镜像，当前运行镜像保留；如需要更强回滚保留策略，应单独调整低配宿主机镜像清理口径。

- 完成：移动端岗位任务页统计卡改为可点击快捷入口。待办页顶部“我的预警 / 已超时 / 即将超时 / 阻塞/高优先”、已办页进度“待处理 / 处理中 / 卡住 / 完成”、我的页“待办 / 已办 / 预警 / 高优先”均只做 tab 切换和当前可见任务池筛选；点击不会选中第一条任务，也不会触发完成、催办、状态流转或 Workflow / Fact 动作。
- 完成：补齐移动端筛选主路径。新增 pending、processing、blocked、due_soon、high_priority、blocked_or_high_priority 等前端筛选 key；统计入口切换后清空选中任务、关闭详情动作态并收回对应长列表，避免沿用旧展开状态。
- 完成：`mobile-tasks-dark` L1 回归补充统计卡点击断言。测试数据新增 processing 任务，回归覆盖“处理中 / 待处理 / 完成 / 我的预警 / 阻塞或高优先 / 我的高优先 / 我的已办”等入口，确认进入正确 tab 和筛选结果。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx`、`cd web && pnpm exec stylelint "src/erp/styles/app.css"` 通过；`cd web && STYLE_L1_PORT=4187 STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && STYLE_L1_PORT=4188 pnpm style:l1` 通过，41 个场景通过。Browser 使用 `VITE_ENABLE_RPC_MOCK=true pnpm start:mobile:business` 打开 `http://localhost:5187/tasks`，390x844 视口未登录守卫落到 `/admin-login`、页面非空、console error/warn 为空；Browser 因登录表单事件和本地存储注入安全策略限制未进入已登录任务页，已登录统计卡交互证据以 L1 mock 后端回归为准。
- 下一步：如果后续希望统计入口支持 URL 可分享筛选态，再单独评审 query 参数、返回恢复态和底部 tab 状态同步；不要把点击统计卡升级为业务动作入口。
- 阻塞/风险：本轮只改移动端任务页前端交互、移动端按钮样式、L1 回归脚本和本过程记录；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Inventory / Shipment / Finance facts、部署或真实通知表。当前工作区已有同文件移动端消息、刷新和长列表现场改动，本轮在其上增量实现，未回退或清理非本轮内容。

- 完成：继续优化移动端岗位任务页在数据很多时的浏览体验。待办、已办、预警、通知四类长列表统一增加默认收起和“展开全部 / 收起”控制：待办默认 12 条，已办默认 10 条，预警 / 通知默认 8 条；展开按钮显示总数和剩余数量，筛选切换会收回待办列表，避免换筛选后直接铺满长页面。
- 完成：通知候选列表不再在数据层预先 `slice(0, 8)`，改由统一展示控制决定默认条数和展开，避免通知多时永远无法看到第 9 条之后。该调整仍只属于移动端展示层，不改变通知事实来源或后端 API。
- 完成：`mobile-tasks-dark` L1 回归改为创建大量待办、预警、通知和已办样本，逐项验证默认收起、展开后条目增加、收起后恢复、无横向溢出、消息二级 tab sticky 和暗色可读性。
- 验证：`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过；Browser 打开 `http://127.0.0.1:5175/m/sales/tasks` 验证未登录守卫落到 `/admin-login`、页面 DOM 非空、无 framework overlay、console error/warn 为空。
- 下一步：如果后续真实任务量继续增大到数百条，应先评审后端分页 / cursor 和移动端搜索，而不是继续提高前端一次性渲染上限。
- 阻塞/风险：本轮仍未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。当前优化只控制前端已加载数据的展示长度；接口仍按现有查询返回任务集合。

- 完成：移动端岗位任务页“消息”分区新增预警 / 通知二级切换。消息页默认显示预警列表，通知通过顶部 sticky 分段控件一键切换，不再把通知区块排在预警长列表后面；当前只调整前端展示信息架构，不改后端通知真源、Workflow / Fact 语义、路由、RBAC 或真实通知表。
- 完成：补齐二级切换的浅色 / 暗色样式和 `mobile-tasks-dark` L1 回归断言。回归检查消息页默认只渲染预警 section，点击“通知”后只渲染通知 section，二级 tab sticky 盒模型稳定、卡片无横向溢出，并保留暗色消息卡片对比度检查。
- 验证：`cd web && STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过。Browser 打开 `http://127.0.0.1:5175/m/boss/tasks` 验证未登录守卫落到 `/admin-login`、页面非空、console error/warn 为空；Browser 受限于本地 mock 登录态写入 / Ant Design Form 状态，未进入已登录消息页，已登录消息页交互证据以 L1 的 Playwright mock 后端回归为准。
- 下一步：如后续要把“通知”从当前 active task 摘要升级为真实通知流，应先评审通知事实来源、已读状态和后端 API，再改数据层；不要只在前端继续派生长期通知真源。
- 阻塞/风险：本轮只改移动端任务页展示、移动端样式、L1 回归脚本和本过程记录；未改后端、schema、migration、RBAC、seedData、部署、WorkflowUsecase、Inventory / Shipment / Finance facts 或真实通知表。通知列表仍沿用当前 `activeTasks.slice(0, 8)` 的既有口径，本轮未重新定义通知数据来源。

- 完成：移动端岗位任务页手动刷新新增明确反馈。页面初始化加载仍保持原有加载失败提示；用户点击页头“刷新”后，成功显示“数据已刷新”，失败显示“刷新移动端任务失败，已保留上次数据”，并保留上次任务列表不清空。
- 完成：`mobile-tasks-dark` L1 回归补充手动刷新成功 / 失败提示断言。失败分支用一次未知英文业务错误模拟接口异常，验证前端不会透传英文原文，而是走当前交互的中文 fallback。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx` 通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过。Browser 使用 `VITE_ENABLE_RPC_MOCK=true pnpm start:mobile:business` 临时打开 `http://localhost:5187/tasks`，未登录守卫落到 `/admin-login`，390x844 视口非空、无 framework overlay、console error/warn 为空；目标刷新交互证据以 L1 的 Playwright mock 后端回归为准。
- 下一步：如后续要覆盖真实登录态下的移动端刷新，可复用 `mobile-auth-login-route-smoke` 的登录 mock，把刷新 toast 断言扩到全部 8 个岗位入口。
- 阻塞/风险：本轮只改移动端任务页刷新提示和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、移动端路由或部署。`cd web && pnpm style:l1` 全量运行在到达移动端场景前失败于既有 `business-module-dark-products-modal-desktop` 弹窗水平居中断言（modal centerX=1776，viewport centerX=1024），与本轮刷新入口不同页，本轮未顺手修改该无关弹窗布局。

- 完成：继续修复移动端岗位任务“消息”分区暗色模式可读性。预警 / 通知消息区块和消息卡片新增稳定语义类，暗色下不再沿用浅灰 `bg-white/bg-slate-50` 背景；预警等级、任务名、来源单号、阻塞原因和通知时间分别补齐暗色背景上的可读文字颜色。
- 完成：`mobile-tasks-dark` L1 回归扩展到消息 tab，切入“消息”后检查预警 / 通知区块、消息卡片非浅色背景、边框清晰、文字对比度不低于 4.5、底部导航固定和无横向溢出；保留详情态暗色断言。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm exec eslint --ext .jsx src/erp/mobile/pages/MobileRoleTasksPage.jsx`、`cd web && pnpm exec stylelint "src/erp/styles/app.css"` 通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm style:l1` 通过，41 个场景通过；临时 Playwright 截图 `/tmp/plush-mobile-messages-dark.png` 验证 `/m/boss/tasks` 消息页卡片为暗色背景且 console error 为空。
- 下一步：如果继续出现暗色可读性问题，应优先把对应页面状态纳入 L1 的 computed color / box 模型断言，再调整具体样式。
- 阻塞/风险：本轮只改移动端任务消息页样式、组件语义类和前端回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 对 authenticated mock 状态仍不作为主验证路径，消息页视觉证据来自 Playwright L1 和临时截图。

- 完成：修复移动端岗位任务详情暗色模式文字可读性问题。任务详情页头、任务关键信息表格、质检不合格风险提示、关联单据、最近动态和底部处理动作按钮补齐暗色背景、边框、文字与禁用态覆盖；按钮不再依赖透明度压暗导致文字对比不足。
- 完成：`style:l1` 的 `mobile-tasks-dark` 场景新增详情态断言，进入“暗色任务验证”任务后检查详情页关键文字、暗色对比度、横向溢出、底部动作栏固定位置和 4 个动作按钮尺寸，避免列表态通过但详情态漏检。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，41 个场景通过；已查看 `web/output/playwright/style-l1/mobile-tasks-dark.png`，暗色详情页文字、风险提示和底部按钮均可读且无横向溢出。
- 下一步：如继续反馈暗色问题，优先按页面状态补语义类名和 L1 computed style / box 模型断言，不只修当前截图节点。
- 阻塞/风险：本轮只改移动端任务详情页前端样式、详情组件类名和前端回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 辅助打开未登录移动任务入口会跳转 `/admin-login` 且 console 无 error/warn；Browser 截图接口本轮仍超时，详情态视觉证据以 Playwright L1 产物为准。

- 完成：修复桌面单端口移动任务页 `/m/<role>/tasks` 的浏览器后退串回桌面后台问题。`ERPRouter` 新增 `MobileEntryBackGuard`，记录最近一次岗位任务端路径；当浏览器 `POP` 或 back/forward 整页恢复落到 `/` 或 `/erp/*` 桌面入口时，用 `replace` 回到上一条移动任务路径，避免从任务端后退到后台壳层。
- 完成：`style:l1` 新增 `mobile-tasks-browser-back-stays-mobile` 场景，覆盖已登录 `/erp/dashboard` -> `/m/sales/tasks` -> 浏览器后退，断言最终仍在 `/m/sales/tasks`、移动任务页壳层存在、桌面后台壳层不存在。
- 验证：`cd web && pnpm lint`、`pnpm css`、`pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-browser-back-stays-mobile pnpm style:l1` 通过。Browser 复用 `http://localhost:5175`，真实登录后验证 `/erp/dashboard -> /m/boss/tasks -> 浏览器后退` 最终仍停在 `/m/boss/tasks`，移动任务页壳层存在、桌面后台壳层不存在、console error/warn 为空。
- 下一步：如后续新增任务端到桌面后台的显式切换入口，应使用明确按钮或入口选择页，不依赖浏览器后退跨入口切换。
- 阻塞/风险：本轮只改桌面单端口移动任务端的前端路由返回栈和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义或部署。Browser 截图接口本轮 `Page.captureScreenshot` 超时，视觉截图证据以 `style:l1` 产物为准。

- 完成：新增移动端岗位任务页原型资产落点 `docs/assets/mobile-role-tasks/README.md`，预留列表页、详情页、风险分组页 3 个稳定原型文件名；新增 `docs/product/mobile-role-tasks-redesign.md` 记录采用方向、实现边界和“原型图非业务真源”说明。
- 完成：同步更新 `docs/README.md` 和 `docs/document-inventory.md`，把移动端岗位任务页改版说明纳入详细设计入口，并把原型资产 README / 产品改版说明纳入长期文档清单。
- 下一步：用户提供原始 PNG 文件或本地路径后，将图片补入 `docs/assets/mobile-role-tasks/` 并把产品说明中的“待补原图”更新为“已归档”。
- 阻塞/风险：当前对话中的原型图二进制文件不在本地工作区，无法直接从聊天显示内容落成 PNG；本轮只建立仓库落点和引用清单，未生成替代图片，也未改运行时代码。

- 完成：移动端岗位任务页按原型方向重做为移动优先列表。默认态改为「待办 + 岗位胶囊 + 刷新」、最后同步 / 最近任务摘要、四项指标条、分段筛选、任务列表行和底部导航；手机视口先看任务队列，进度 / 预警 / 通知下移，平板仍保留双栏。
- 完成：点选任务后进入详情态，展示任务关键信息、风险提示、关联单据、最近动态、阻塞 / 退回 / 催办原因输入和底部动作栏；状态更新、催办、下游 follow-up 仍复用现有 `moveTask` / `urgeTask` 主路径，未改后端、RBAC、Workflow/Fact 语义或事实层。
- 完成：移动端外壳去掉旧桌面卡片式页头，避免“待办”页面继续像桌面卡片；暗色模式补齐移动任务页背景、文本和强调色覆盖，保留 `surface-panel` / `erp-mobile-list-item` 回归锚点。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个移动端角色和手机 / iPad 任务页截图；`cd web && pnpm style:l1` 通过，40 个场景通过。已查看 `web/output/playwright/mobile-auth-login-route-smoke/mobile-warehouse-phone-tasks.png`，默认态已从旧桌面卡片改为移动端任务列表且无横向溢出。
- 下一步：如继续做第二轮移动端细节，可优先补“详情页真实动作流”的专门 Playwright 回归，包括阻塞原因输入、完成、催办和返回列表；也可按 PMC / 老板汇总视角做风险分组列表。
- 阻塞/风险：本轮只改移动端任务页、移动端外壳和移动端暗色样式覆盖；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。当前工作区仍有本轮之前就存在的 `web/scripts/styleL1.mjs`、`web/src/erp/pages/BusinessModulePage.jsx` 等现场改动，本轮未回退、未清理、未作为移动端改版成果处理。

- 完成：继续修正移动端岗位任务页改版遗留问题。底部 `待办 / 已办 / 消息 / 我的` 改为同页真实分区并固定在任务页视口底部；正文改为独立滚动区，退出登录从外壳底部移入“我的”分区，待办默认态不再混入旧的进度 / 预警 / 通知区块。
- 完成：详情页同步改为固定高度壳层，任务正文独立滚动，底部处理 / 阻塞 / 完成 / 催办动作栏固定在容器底部；状态更新、催办和后续 follow-up 仍复用现有 `moveTask` / `urgeTask` 主路径，未新增路由、权限码或后端事实写入。
- 完成：同步 `docs/product/mobile-role-tasks-redesign.md`，明确底部四项当前只是页面内前端分区，不升级为权限或路由真源；更新 `style:l1` 和 `mobile-auth-login-route-smoke` 断言，覆盖底部导航固定、tab 切换、退出登录只在“我的”出现，以及手机 / iPad 盒模型。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；`cd web && pnpm style:l1` 通过，40 个场景通过；`MOBILE_AUTH_SMOKE_APP_ID=mobile-business pnpm smoke:mobile-auth-login-route` 通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个移动端角色和手机 / iPad。Browser 打开 `http://localhost:5175/m/sales/tasks` 验证未登录守卫跳转 `/admin-login` 且 console 无 error/warn；Browser 截图接口本轮超时，移动端任务页视觉证据以 L1 / smoke Playwright 截图和 DOM 断言为准。
- 下一步：如果继续按原型细化，可补“已办 / 消息 / 我的”更完整的信息架构，或为详情页真实动作流增加专门回归：阻塞原因输入、完成、催办、返回列表和恢复态。
- 阻塞/风险：本轮只改移动端任务页、移动端外壳、移动端样式、前端回归脚本和改版说明；未改后端、schema、migration、RBAC、seedData、Workflow / Fact 语义、部署或真实通知表。原型 PNG 仍未落入 `docs/assets/mobile-role-tasks/`，当前按仓库改版说明和用户截图方向实现；工作区仍保留本轮之前已有的 `BusinessModulePage.jsx`、合同纸面样式、dev docs 样式和部分 L1 框架现场改动，本轮未回退。

## 2026-06-04 22:04 CST
- 完成：修复采购合同服务端 PDF 在线预览 / 下载样式丢失。根因是后端通过 `data:text/html` 交给 Chromium 渲染时，生产构建里的外链 CSS 会被 `data:` 文档跨源加载拦截；当前快照改为在前端克隆阶段内联已加载 stylesheet，并移除外链 stylesheet / preload，保证服务端 PDF 使用同一份纸面样式。
- 完成：补齐服务器与本机字体度量差异下的采购合同短字段列样式，采购订单号、产品订单编号、单位、数量、金额列不再按字符拆行；同步让 `style:l1` 的 Chromium 直连本地地址，并对本地 `goto` 的 `ERR_ADDRESS_INVALID / ERR_CONNECTION_REFUSED` 做有限重试，修复全量回归里 Vite HMR / 127.0.0.1 导航偶发打断。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`NODE_USE_ENV_PROXY=0 pnpm style:l1` 通过，40 个场景通过；`pnpm build` 通过；本地生产页面 + 本地后端生成的在线预览和下载 PDF 均为 110328 bytes，渲染第一页确认标题、表格、边距正常；133 已部署 `WEB_IMAGE=plush-toy-erp-web:20260604T214355-5da677a-pdf-style-v3-amd64`，5175 / 5186-5193 / 8300 健康检查通过，远端在线预览和下载 PDF 均为 348096 bytes，渲染第一页确认纸面样式、编号列和 PCS 正常；最终远端 PDF `pdfinfo` 显示 `Pages: 1`，未再出现第二页空白。
- 下一步：如果后续继续调整合同模板，应优先走服务端 PDF 快照 + Poppler 渲染验证，避免只看浏览器页面；`style:l1` 若再出现非业务断言失败，应继续收口到脚本框架层，而不是在单个场景重复补局部重试。
- 阻塞/风险：本轮未改后端、schema、migration、RBAC、seedData 或业务事实层；最终发布镜像从隔离 detached worktree 构建，只套用本轮 `styleL1.mjs` 与 `app.css` diff，避免混入主工作区里非本轮 `BusinessModulePage.jsx` 改动。主工作区仍保留非本轮 `BusinessModulePage.jsx / progress.md` 现场，未回退、未提交。

## 2026-06-04 21:52 CST
- 完成：修复暗色业务弹窗明细统计区仍看不清的问题。根因是 `.erp-business-record-form__item-summary` 下的 `.erp-item-summary-metric` 自定义统计胶囊仍沿用浅色背景、浅蓝边框和 Ant Design 浅色次级文字，暗色模式下 label 对比度不足；本轮补齐暗色背景、蓝色细边、次级文字和数值颜色。
- 完成：`business-module-dark-products-modal-desktop` L1 场景新增明细统计胶囊 computed style 断言，检查至少 3 个统计 chip 的暗色背景、清晰边框、label 对比度和数值对比度，避免后续再次漏掉「已录入 / 数量合计 / 金额合计」这类自定义 UI。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`STYLE_L1_PORT=4457 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；已查看 `web/output/playwright/style-l1/business-module-dark-products-modal-desktop.png`，暗色产品弹窗渲染正常。
- 下一步：后续若继续反馈暗色主题问题，优先搜索自定义 `erp-*` 组件，不只看 Ant Design token；每个自定义状态块都应补暗色覆盖和 L1 computed style 断言。
- 阻塞/风险：本轮只改业务弹窗明细统计 chip 样式和 L1 断言；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。工作区仍存在 `tmp/pdfs/*` 未跟踪临时验证产物；`web/src/erp/styles/app.css` 中还包含非本轮采购合同纸面列宽 / 字号现场改动，本轮未回退或清理。追加前 `progress.md` 为 349 行 / 74451 bytes，未达到归档阈值。

## 2026-06-04 21:46 CST
- 完成：为桌面业务页“导出当前结果”增加空结果保护。`BusinessModulePage.jsx` 现在在导出 CSV 前检查当前筛选 / 排序后的 `displayRecords`，没有记录时提示“当前结果没有记录，无法导出”并直接返回，不再创建下载链接。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test` 通过，267 个测试通过；使用临时 Playwright 回归打开 `http://127.0.0.1:5275/erp/master/products`，空记录点击导出显示提示且未触发 download；`STYLE_L1_BASE_URL=http://127.0.0.1:5275 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过。
- 下一步：如后续要把导出行为扩展到“仅导出勾选记录”等模式，再按各导出入口分别补空态文案与下载事件回归。
- 阻塞/风险：本轮只改前端业务页导出按钮行为；未改后端、schema、migration、RBAC、seedData、业务事实层、CSV 字段口径或部署。工作区已有非本轮 `progress.md`、`web/scripts/styleL1.mjs`、`web/src/erp/styles/app.css` 和 `tmp/pdfs/*` 现场改动，本轮未回退或清理。追加前 `progress.md` 为 362 行 / 77538 bytes，未达到归档阈值。

## 2026-06-04 21:37 CST
- 完成：优化开发文档查看器 `/__dev/docs` 左侧滚动列表的右侧安全区。置顶列表、搜索结果列表和目录树统一增加稳定 scrollbar gutter 和 18px 右侧内边距，避免系统 overlay 滚动条显现时盖住目录计数 badge 或行内置顶图钉，导致快速滚动后按钮难以点击。
- 验证：`pnpm --dir web css` 通过；`pnpm --dir web exec node --test src/erp/config/devDocs.test.mjs` 通过；`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs` 实测目录树右侧计数 / pin 到滚动容器右边距从约 10-11px 提升到 18-27px，滚动后可见图钉真实点击置顶数 `7 -> 8`，再次点击恢复 `7`，页面无横向溢出且 console error/warn 为空。
- 下一步：后续若继续加目录树右侧动作，优先复用该滚动安全区，避免动作按钮贴近滚动条；如新增移动端独立布局，再补对应视口回归。
- 阻塞/风险：本轮只改 dev docs 左侧滚动列表样式；未改产品菜单、seedData、RBAC、docs registry、后端、schema、migration 或部署。工作区仍有非本轮未提交现场和 `tmp/pdfs/*` 产物，本轮未回退或清理。追加前 `progress.md` 为 349 行 / 74451 bytes，未达到归档阈值。
