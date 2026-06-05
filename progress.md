# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。

## 2026-06-05
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
