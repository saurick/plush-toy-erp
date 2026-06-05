# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。

## 2026-06-05
- 完成：移动端岗位任务页按原型方向重做为移动优先列表。默认态改为「待办 + 岗位胶囊 + 刷新」、最后同步 / 最近任务摘要、四项指标条、分段筛选、任务列表行和底部导航；手机视口先看任务队列，进度 / 预警 / 通知下移，平板仍保留双栏。
- 完成：点选任务后进入详情态，展示任务关键信息、风险提示、关联单据、最近动态、阻塞 / 退回 / 催办原因输入和底部动作栏；状态更新、催办、下游 follow-up 仍复用现有 `moveTask` / `urgeTask` 主路径，未改后端、RBAC、Workflow/Fact 语义或事实层。
- 完成：移动端外壳去掉旧桌面卡片式页头，避免“待办”页面继续像桌面卡片；暗色模式补齐移动任务页背景、文本和强调色覆盖，保留 `surface-panel` / `erp-mobile-list-item` 回归锚点。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`cd web && pnpm smoke:mobile-auth-login-route` 通过，覆盖 8 个移动端角色和手机 / iPad 任务页截图；`cd web && pnpm style:l1` 通过，40 个场景通过。已查看 `web/output/playwright/mobile-auth-login-route-smoke/mobile-warehouse-phone-tasks.png`，默认态已从旧桌面卡片改为移动端任务列表且无横向溢出。
- 下一步：如继续做第二轮移动端细节，可优先补“详情页真实动作流”的专门 Playwright 回归，包括阻塞原因输入、完成、催办和返回列表；也可按 PMC / 老板汇总视角做风险分组列表。
- 阻塞/风险：本轮只改移动端任务页、移动端外壳和移动端暗色样式覆盖；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。当前工作区仍有本轮之前就存在的 `web/scripts/styleL1.mjs`、`web/src/erp/pages/BusinessModulePage.jsx` 等现场改动，本轮未回退、未清理、未作为移动端改版成果处理。

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
