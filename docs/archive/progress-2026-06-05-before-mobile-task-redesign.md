# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。

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

## 2026-06-04 21:34 CST
- 完成：全局扫描并补齐暗色主题状态类 UI 覆盖，重点收口自定义 `Loading`、Ant Design `Spin / Empty / Alert / message / notification / tooltip / popover / tag / badge / progress / pagination / drawer / table placeholder` 等容易漏暗色的组件，避免页面加载中、空态、提示和浮层继续出现浅底浅字或橄榄绿大面积底色。
- 完成：`permission-center-loading-state` 改为暗色场景，先断言「权限加载中」面板背景、边框、阴影、Spin 主色和标题 / 说明对比度，再等待页面恢复并检查 AntD 状态组件不会回到浅色面；同步 `web/README.md` 的主题模式约定，要求新增状态类组件优先走全局 token 和 L1 断言。
- 完成：全量 L1 首次复跑暴露 `business-module-dark-products-modal-desktop` 的超宽弹窗 body 横向溢出断言误报，本轮把断言改为按 `clientWidth / scrollWidth / overflowX` 判断真实可见横向滚动，保留对大溢出和未托管横向滚动的失败保护。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm css` 通过；`STYLE_L1_PORT=4453 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=permission-center-loading-state,business-module-dark-partners-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过，267 个测试通过；`STYLE_L1_PORT=4455 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过；完整 `STYLE_L1_PORT=4456 NODE_USE_ENV_PROXY=0 pnpm style:l1` 通过 40 个场景。
- 下一步：后续新增 Ant Design 状态组件、异步加载页、浮层或标签类 UI 时，先复用 `data-erp-theme` 和 ERP theme token；若页面有独立 CSS，必须补暗色覆盖和对应 L1 断言。
- 阻塞/风险：本轮只改前端暗色状态组件样式、L1 断言、前端 README 和过程记录；未改后端、schema、migration、RBAC、seedData、业务事实层或部署。工作区仍存在非本轮 DevDocs、PDF、realLoginSmoke、tmp 等未提交现场改动，本轮未回退、清理或纳入成果。追加前 `progress.md` 为 335 行 / 71142 bytes，未达到归档阈值。

## 2026-06-04 21:28 CST
- 完成：微调开发文档查看器 `/__dev/docs` 目录树文档行的垂直对齐。目录树文档打开按钮、外层行容器和右侧图钉统一上下居中，解决长标题换行时左侧 Markdown 图标和右侧图钉贴近顶部的问题。
- 验证：`pnpm --dir web css` 通过；`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs` 量测目录树长标题行，文件图标、标题文本块、右侧图钉和整行容器 center 均为 `910.3671875`，页面无横向溢出且 console error/warn 为空。
- 下一步：后续如果目录树行继续加按钮，优先保持“打开区域 + 动作按钮”分离，并同步检查多行标题、长路径和暗色 hover / focus 状态。
- 阻塞/风险：本轮只改 dev docs 目录树样式；未改产品菜单、seedData、RBAC、docs registry、后端或部署。工作区仍有非本轮未提交现场和 `tmp/pdfs/*` 产物，本轮未回退或清理。追加前 `progress.md` 为 335 行 / 71142 bytes，未达到归档阈值。

## 2026-06-04 21:20 CST
- 完成：继续优化开发文档查看器 `/__dev/docs` 的置顶交互。置顶区每行右侧新增常驻实心图钉，可直接取消置顶；目录树和搜索结果文档行新增行内图钉动作，默认隐藏，hover / focus / 当前选中时显示，支持快速置顶 / 取消置顶。
- 完成：为避免嵌套按钮，把文档行 DOM 拆成外层行容器、左侧打开按钮和右侧图钉动作按钮；保留右侧标题栏图钉作为当前文档主操作。
- 完成：同步 `web/README.md` 的 dev-only 文档查看器说明，明确置顶区、目录树、搜索结果和右侧标题栏图钉行为仍只属于开发态隐藏入口。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web exec node --test src/erp/config/devDocs.test.mjs`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs` 验证置顶区取消图钉、目录树图钉默认隐藏、目录树图钉置顶后置顶数 7 -> 8、置顶区取消后恢复 7、搜索结果图钉置顶 `server/README.md` 后恢复取消、页面无横向溢出且 console error/warn 为空。
- 下一步：如果继续加 dev docs 快捷操作，仍保持“左侧导航区负责跨文档操作、右侧标题栏负责当前文档操作”的分层，不恢复产品内文档中心。
- 阻塞/风险：Browser 的 CSS hover computed opacity 检查受 in-app move 行为限制，已用默认隐藏态、focus/active 可见、真实点击和截图补足验证；全量 `pnpm --dir web style:l1` 未复跑，上一轮非本轮业务弹窗暗色场景已由 21:10 记录修复并全量通过。运行期间仍存在非本轮 `web/scripts/styleL1.mjs`、`web/scripts/realLoginSmokeShared.mjs`、`web/src/common/components/loading/loading.css`、`web/src/erp/utils/printPdf.mjs`、`web/src/erp/utils/printPdf.test.mjs`、`tmp/pdfs/*` 以及 `app.css` 暗色弹窗相关现场改动，本轮未回退或清理。追加前 `progress.md` 为 327 行 / 69032 bytes，未达到归档阈值。

## 2026-06-04 21:10 CST
- 完成：按 `openai-oauth-api-service` 暗色弹窗的层级方向，修复 ERP 暗色主题业务弹窗边界不清的问题。暗色 `antd Modal` 现在有更深遮罩、背景虚化、独立浅色边框、浮层阴影、header / body / footer 分隔和暗色二级 Card 面；浅色主题仍保持原 Ant Design 轻量壳层。
- 完成：新增 `business-module-dark-products-modal-desktop` L1 场景，打开 `/erp/master/products` 暗色新建产品弹窗，断言遮罩 alpha、backdrop-filter、弹窗边框 / 阴影 / 分隔线、暗色输入框边界、普通控件无绿色残留、body 纵向滚动和横向溢出收口。超宽 Modal 居中断言按滚动条补偿放宽到 20px，普通弹窗仍保持 3px 容差。
- 完成：同步 `web/README.md` 的桌面业务弹窗约定，明确浅色轻量、暗色必须有可辨认浮层边界，暗色普通 hover / focus 使用 slate / blue，绿色只保留给品牌主按钮和状态强调。
- 验证：`node --check web/scripts/styleL1.mjs`、`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop pnpm style:l1` 通过；`STYLE_L1_SCENARIOS=business-module-workflow-actions,business-module-dark-partners-desktop,business-module-dark-products-modal-desktop pnpm style:l1` 通过；完整 `STYLE_L1_PORT=4452 NODE_USE_ENV_PROXY=0 pnpm style:l1` 通过 40 个场景。已查看 `web/output/playwright/style-l1/business-module-dark-products-modal-desktop.png`，弹窗遮罩、外框、头尾分隔和内部 section 边界清楚。
- 下一步：后续若继续精修暗色主题，优先补同类 L1 断言后再改共享样式，避免回到局部截图补丁。
- 阻塞/风险：本轮只改前端暗色 Modal 样式、L1 断言和前端 README；未改后端、schema、migration、RBAC、seedData 或部署。工作区里仍存在非本轮 DevDocs、PDF、realLoginSmoke、tmp 等未提交现场改动，本轮未回退、清理或纳入成果。追加前 `progress.md` 为 319 行 / 66949 bytes，未达到归档阈值。

## 2026-06-04 21:06 CST
- 完成：开发文档查看器 `/__dev/docs` 加回图钉式置顶交互。右侧当前文档标题栏新增状态型图钉 icon，可置顶 / 取消置顶当前文档；左侧搜索框下方新增置顶文档区，点击置顶项可切换右侧文档并重置正文滚动。
- 完成：置顶路径使用浏览器 localStorage 本地持久化，首次打开沿用现有默认置顶清单；运行时只影响 dev-only 查看器，不进入 ERP 菜单、seedData、RBAC、产品内 docs registry 或生产构建。
- 完成：同步 `web/README.md` 的前端文档入口边界说明，并补充 `devDocs` 纯函数测试覆盖置顶路径归一化、默认置顶和置顶排序。
- 验证：`pnpm --dir web exec node --test src/erp/config/devDocs.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1` 通过；Browser 打开 `http://localhost:5175/__dev/docs` 验证左侧置顶区、右侧图钉取消 / 恢复、刷新后状态保留、回到顶部和置顶项切换，console error/warn 为空，页面无横向溢出。
- 下一步：后续如果继续扩展 dev docs 查看器，只保留在 `/__dev/docs` 开发态隐藏入口内；不要恢复产品内 docs registry、菜单或 seedData 链路。
- 阻塞/风险：全量 `pnpm --dir web style:l1` 当前失败在非本轮 `business-module-dark-products-modal-desktop` 业务弹窗暗色控件边框场景；本轮已用 dev docs 目标 L1 场景和 Browser 交互回归覆盖目标页面。运行期间存在非本轮 `progress.md`、`web/README.md`、`web/scripts/styleL1.mjs`、`web/scripts/realLoginSmokeShared.mjs`、`web/src/erp/utils/printPdf.mjs`、`web/src/erp/utils/printPdf.test.mjs`、`tmp/pdfs/pdf-content-check-local-dev/` 以及 `app.css` 暗色弹窗相关现场改动，本轮未回退或清理。追加前 `progress.md` 为 311 行 / 64969 bytes，未达到归档阈值。

## 2026-06-04 20:58 CST
- 完成：排查并修复 `192.168.0.133` 采购合同模板打印在线预览和下载 PDF 白页问题。根因是 133 前端运行在新增暗色主题后的 web 镜像，服务端 `/templates/render-pdf` 返回非空 PDF（约 368KB），但前端传给服务端 Chromium 的 HTML 快照保留了 `data-erp-theme="dark"`，而暗色主题 CSS 位于打印样式之后，导致 print-to-PDF 仍套用运行时暗色 / 等待态样式，纸面内容渲染为空白。
- 完成：在 `web/src/erp/utils/printPdf.mjs` 的服务端 PDF 快照主路径中固定浅色纸面口径：快照归一化阶段把 `data-erp-theme` / `data-erp-theme-mode` 收口为 `light`、清理打印等待态和选中态类；服务端 PDF 专用样式显式设置白底、深色文字、`color-scheme: light`、可见性和不透明度。在线预览和下载 PDF 共用该快照生成链路。
- 完成：补充 `web/src/erp/utils/printPdf.test.mjs` 单元测试，覆盖深色运行态快照进入服务端 PDF 时必须变回浅色纸面、清理等待态 / 选中态，并追加浅色打印覆盖。
- 完成：按低配服务器发布约束在本地构建 `linux/amd64` web 镜像 `plush-toy-erp-web:20260604T204500-c43a0b2-pdf-light-amd64`，上传到 133 后只更新 `WEB_IMAGE` 并重建 web-* 容器；PostgreSQL、Jaeger 和 server 未重建。过程中第一次误构建了本机 arm64 镜像，Compose 提示平台不匹配并导致 web 容器短暂重启，随后立即用 amd64 镜像替换并恢复健康。
- 验证：`cd web && pnpm test`、`pnpm lint`、`pnpm css`、`pnpm build` 通过；`node --test web/src/erp/utils/printPdf.test.mjs` 通过；本地修复版接 133 后端时，暗色主题下采购合同在线预览和下载 PDF 均能用 `pdftoppm` 渲染出合同内容，第一页像素指标从线上旧版白页 `mean=0.999252 / stddev=0.0263616` 恢复为 `mean=0.962309 / stddev=0.165652`；133 正式地址部署后，在线预览和下载 PDF 均返回约 368KB，渲染第一页同为 `mean=0.962309 / stddev=0.165652`，浏览器 console errors 为空；133 上 5175、5186-5193、8300 `/healthz` 均返回 200，web-* 容器均 healthy 且镜像架构为 `amd64 linux`。
- 下一步：后续继续改打印 / PDF / 合同纸面预览时，必须确保导出物固定浅色，不跟随运行时暗色主题；如全量 `style:l1` 的打印窗口刷新场景继续被 Vite HMR WebSocket 告警干扰，应单独收口测试脚本的 HMR console 过滤或刷新态等待。
- 阻塞/风险：`pnpm style:l1` 全量本轮失败在 `print-workspace-material-shell-refresh` 场景的 Vite HMR WebSocket console error，已用真实 133 在线预览 / 下载 PDF + Poppler 渲染作为本次核心回归补足；本轮未改后端 PDF renderer、schema、migration、RBAC、业务事实层或模板字段口径。133 server 仍是既有 `plush-toy-erp-server:20260531T145153-9b414a58-vm`，本轮仅修复前端 PDF 快照。追加前 `progress.md` 为 302 行 / 61929 bytes，未达到归档阈值。

## 2026-06-04 20:24 CST
- 完成：排查 `192.168.0.133` 上 plush-toy-erp 管理员登录密码错误。确认线上容器存在 `APP_ADMIN_PASSWORD` 环境变量覆盖，且当前数据库 `admin` 是已存在账号，启动初始化不会因 config 或 env 变化自动重置密码。已调整生产 Compose 模板和部署文档，默认不再注入 `APP_ADMIN_PASSWORD`，只有明确需要覆盖首次初始化密码时才临时添加。
- 验证：本地执行 `docker compose -f server/deploy/compose/prod/compose.yml config` 后确认渲染配置不再包含 `APP_ADMIN_PASSWORD`，`git diff --check -- server/deploy/compose/prod/compose.yml server/deploy/compose/prod/.env.example server/deploy/README.md server/deploy/compose/prod/README.md server/docs/config.md progress.md` 通过；133 现场已备份 `.env` 和 `compose.yml`，移除 `.env` 密码项和 compose 默认密码注入后重启 `app-server`；`docker exec plush-toy-erp-server printenv APP_ADMIN_PASSWORD` 已不存在；`/healthz` 返回 `ok`、`/readyz` 返回 `ready`；真实 `admin_login` 使用目标密码返回 code `0`。
- 下一步：后续若确实需要通过环境变量覆盖管理员初始化密码，应只在明确场景临时添加，并在初始化后移除；已有 admin 改密应走管理员改密或受控 SQL 更新密码哈希。
- 阻塞/风险：已有 admin 的密码哈希只由数据库决定；仅删除环境变量或重启服务不会改变旧密码，必须显式改密。133 旧哈希已备份到 `/root/plush-toy-erp-admin-password-hash-backup-20260604T122602.txt`。本轮追加前 `progress.md` 为 296 行 / 60262 bytes，未达到归档阈值。

## 2026-06-04 19:45 CST
- 完成：继续全局收敛暗色主题的绿色残留，根因包括 Ant Design 暗色 token 仍使用绿色系 `colorBgContainer / colorBgElevated / colorBorder / colorTextSecondary`，以及业务控件、普通按钮、弹窗控件、DevDocs、打印中心和移动端按钮 hover / focus 复用 `--erp-primary` / `--erp-primary-soft`。本轮把暗色 AntD token 改为 slate / blue，并新增 `--erp-interactive-*` 中性交互 token，绿色保留给品牌标识、主按钮和少量状态强调。
- 完成：`business-module-dark-partners-desktop` 新增暗色交互态断言，实际触发搜索框、业务状态筛选、日期筛选、普通工具按钮、表头工具按钮和表头单元格 hover / focus；若背景、边框或阴影出现绿色主导色会直接失败，避免后续把输入框 / hover 又改回绿黑底。
- 验证：`cd web && pnpm css && pnpm lint && pnpm test` 通过；`STYLE_L1_PORT=4435 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-partners-desktop pnpm style:l1` 通过，其中新增交互态断言已覆盖用户截图里的筛选区和表头 hover；`STYLE_L1_PORT=4438 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-partners-desktop,erp-dashboard-dark-desktop,dev-docs-dark-desktop,print-center-dark-desktop pnpm style:l1` 通过；`STYLE_L1_PORT=4439 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm style:l1` 通过；人工查看 `web/output/playwright/style-l1/business-module-dark-partners-desktop.png`，确认输入框、筛选下拉、日期控件、表头 hover 和普通按钮不再呈现绿黑底。
- 下一步：如果后续继续暗色视觉细化，优先检查 AntD theme token、组件 hover/focus token 和页面级 CSS 三层是否一致，不再只在单个页面局部覆盖颜色。
- 阻塞/风险：本轮未改后端、RBAC、schema、seedData、业务语义、产品内菜单或部署；`STYLE_L1_PORT=4440 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量复跑仍失败在无关 `erp-dashboard-dark-desktop` 场景等待「毛绒 ERP 管理后台」文案，随后 `STYLE_L1_PORT=4441 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=erp-dashboard-dark-desktop pnpm style:l1` 单场景复跑通过，按既有全量长链路等待抖动记录。本轮追加前 `progress.md` 为 289 行 / 57903 bytes，未达到归档阈值。

## 2026-06-04 19:32 CST
- 完成：修复开发文档查看器在暗色主题下无法查看的问题，暗色模式显式接管 DevDocs 侧栏标题 / 目录项 / 文档标题，以及 Markdown 标题、正文、列表、表格、引用、行内代码和代码块颜色，避免浅色主题的深绿 / 深灰文字落在深色背景上。
- 完成：`style:l1` 新增 `dev-docs-dark-desktop` 场景，把 `/__dev/docs` 暗色模式纳入可重复回归；同时把标题等待阈值从 10s 调整到 20s，降低全量 L1 长链路中页面刚渲染完成前误判标题不可见的概率。
- 验证：`cd web && node --check scripts/styleL1.mjs && pnpm css && pnpm lint && pnpm test` 通过；`STYLE_L1_PORT=4427 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm style:l1` 通过；`STYLE_L1_PORT=4428 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=dev-docs-dark-desktop,erp-dashboard-dark-desktop,business-module-dark-partners-desktop,print-center-dark-desktop pnpm style:l1` 通过；Browser 打开 `http://127.0.0.1:4432/__dev/docs` 确认根主题为 dark、标题 / 正文 / 表格 / 行内代码 computed color 已切到暗色 token、无横向溢出且无 console error；人工查看 `web/output/playwright/style-l1/dev-docs-dark-desktop.png`，确认用户截图中的标题、正文、表格和行内代码均恢复可读。
- 下一步：后续新增开发态 Markdown 组件、帮助页或浅底代码标签时，必须同步纳入暗色主题对比检查，避免只覆盖业务后台页面。
- 阻塞/风险：本轮未改后端、RBAC、schema、seedData、业务页面语义或产品内菜单；`STYLE_L1_PORT=4429 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量复跑失败在无关 `business-module-derived-item-amount` 场景等待「辅材/包材采购」标题，随后 `STYLE_L1_PORT=4430 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-derived-item-amount pnpm style:l1` 单场景复跑通过，按既有长链路等待抖动记录。本轮追加前 `progress.md` 为 282 行 / 55845 bytes，未达到归档阈值。

## 2026-06-04 19:03 CST
- 完成：参考 `openai-oauth-api-service` 的暗色基线，把本项目暗色主题从大面积橄榄绿面板调整为蓝黑 / slate 面板体系：页面底色、侧栏、卡片、表格、输入框、弹窗和打印中心运行时外壳改用 `#0f172a`、`#111827`、`#162033`、`#1b2538`、`#334155` 等中性深色；绿色保留为品牌点缀、主按钮、选中标记和状态提示。
- 完成：收窄打印中心大面积选中卡的绿色背景，改为 slate 面板 + 绿色边框 / 标记，避免暗色主题继续呈现“绿绿的橄榄色”。
- 验证：`STYLE_L1_PORT=4414 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,business-module-dark-partners-desktop,mobile-tasks-dark,print-center-dark-desktop,print-preview-material-dark-desktop pnpm style:l1` 通过；`STYLE_L1_PORT=4415 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=business-module-dark-partners-desktop,print-center-dark-desktop,erp-dashboard-dark-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4416 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 38 场景通过。
- 下一步：后续如果继续精修暗色视觉，优先按页面层级把“背景 / 面板 / 控件 / 状态点缀”拆清楚，不再把绿色用作大面积底色。
- 阻塞/风险：未改后端、RBAC、schema、seedData、业务语义或部署；本轮只调整暗色主题运行时视觉 token 和相关覆盖。本轮追加前 `progress.md` 为 275 行 / 54259 bytes，未达到归档阈值。

## 2026-06-04 18:56 CST
- 完成：继续全局检查暗色模式可读性，修复打印模板中心和打印预览兼容入口在暗色主题下浅底 / 浅字导致看不清的问题；打印中心 hero、当前模板卡、模板目录卡、提示项和模板卡片均改为暗色可读语义覆盖。
- 完成：保持打印 / PDF / 合同纸面预览固定浅色，不让运行时暗色主题污染导出物；`style:l1` 新增 `print-center-dark-desktop` 和 `print-preview-material-dark-desktop` 场景，并把暗色可见文本对比扫描改为按父级背景 alpha 合成计算，同时覆盖直接写在元素里的可见文本。
- 验证：`STYLE_L1_PORT=4411 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=print-center-dark-desktop,print-preview-material-dark-desktop pnpm style:l1` 通过；`STYLE_L1_PORT=4412 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,business-module-dark-partners-desktop,mobile-tasks-dark,print-center-dark-desktop,print-preview-material-dark-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4413 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 38 场景通过；`git diff --check` 通过。
- 下一步：后续新增硬编码浅色卡片、提示块、表单或打印中心同类 UI 时，优先补进暗色对比扫描场景，不只补局部颜色。
- 阻塞/风险：本轮未改后端、RBAC、schema、seedData、打印模板数据源或部署；当前修复只处理运行时暗色 UI 外壳，纸面打印交付仍按浅色口径。本轮追加前 `progress.md` 为 268 行 / 52598 bytes，未达到归档阈值。

## 2026-06-04 18:12 CST
- 完成：按 Product Design 评审结论调整主题切换层级。登录页主题选择从主内容中部三段式控件改为卡片右上角紧凑图标菜单；桌面后台 header 和岗位移动端 header 也改为复用同一紧凑菜单，避免主题偏好控件抢登录入口、登录方式和表单主流程的注意力。
- 完成：`ERPThemeToggle` 支持 `segmented` 与 `menu` 两种形态；`style:l1` 的主题切换 helper 同时支持三段式和下拉菜单，并在菜单点击后等待浮层关闭，避免截图停在临时 dropdown 状态。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4408 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,business-module-dark-partners-desktop,mobile-tasks-dark,business-module-toolbar-mobile-dropdown pnpm style:l1` 通过；`STYLE_L1_PORT=4409 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 36 场景通过；人工查看 `admin-login-theme-modes-desktop.png`，确认主题按钮位于登录卡片右上角且最终截图无 dropdown 残留。
- 下一步：若后续要进一步精修，可只在桌面后台 header 给主题菜单保留短标签，登录页和移动端继续保持图标形态。
- 阻塞/风险：未改登录鉴权、入口权限、后端、RBAC、schema、seedData 或部署；本轮只调整主题切换控件展示形态和对应浏览器回归。本轮追加前 `progress.md` 为 261 行 / 51KB，未达到归档阈值。

## 2026-06-04 17:46 CST
- 完成：全局检查暗色模式可读性，修复登录页以外的同类问题。暗色主题新增业务页、权限页、业务弹窗、下拉、表格、统计数字、左侧选中菜单、移动端 Tailwind 文本色和移动端 textarea 的统一覆盖，避免旧浅色硬编码继续把深色文字或浅色输入框带到暗色页面。
- 完成：`style:l1` 新增 `business-module-dark-partners-desktop` 场景，覆盖用户截图中的「客户/供应商」业务页；`mobile-tasks-dark` 改为先创建一条阻塞任务再回归，覆盖移动端任务详情、阻塞原因和催办原因输入框；桌面看板、业务页和移动端暗色场景新增全局可见文本对比度扫描。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4403 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,business-module-dark-partners-desktop,mobile-tasks-dark,business-module-toolbar-mobile-dropdown pnpm style:l1` 通过；`STYLE_L1_PORT=4404 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 36 场景通过；人工查看 `business-module-dark-partners-desktop.png` 和 `mobile-tasks-dark.png`，确认标题、筛选区、表格空态、任务详情和输入框均可读。
- 下一步：后续若新增新的硬编码浅色模块，优先补进暗色对比度扫描，而不是只加局部 CSS 覆盖。
- 阻塞/风险：本轮没有改后端、RBAC、schema、seedData 或部署；对比度扫描覆盖当前 L1 暗色关键路径，不等于逐像素审过所有业务模块的每个弹窗状态。本轮追加前 `progress.md` 为 254 行 / 49KB，未达到归档阈值。

## 2026-06-04 17:19 CST
- 完成：修复登录页暗色模式下 Segmented 选中项文字过暗的问题。根因是登录页既有 `.erp-login-card .ant-segmented .ant-segmented-item-label` 浅色规则优先级高于主题切换器通用样式，暗色下把「跟系统」和「后台管理」选中态文字压成深色。
- 完成：在暗色登录页样式中显式接管 Segmented 背景、选中态、hover / focus 和 label 颜色；`style:l1` 登录页主题场景新增选中项文字 / 背景对比度断言，要求不低于 4.5。
- 验证：`cd web && pnpm css && node --check scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4395 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm style:l1` 通过；`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4396 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,mobile-tasks-dark,business-module-toolbar-mobile-dropdown pnpm style:l1` 通过；`STYLE_L1_PORT=4399 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 35 场景通过。
- 下一步：后续继续把登录页和后台硬编码浅色规则迁移到主题变量，避免局部旧选择器再次压过暗色主题。
- 阻塞/风险：`STYLE_L1_PORT=4397 NODE_USE_ENV_PROXY=0 pnpm style:l1` 曾在 `business-module-workflow-actions` 场景一次性未等到业务状态提示；该场景单独复跑通过，随后全量 35 场景复跑通过，未发现稳定复现问题。本轮追加前 `progress.md` 为 247 行 / 48KB，未达到归档阈值。

## 2026-06-04 16:53 CST
- 完成：前端新增「跟系统 / 浅色 / 暗色」主题底座，统一登录页、桌面后台和岗位移动端接入主题切换；Ant Design 走根 `ConfigProvider` 算法切换，自定义壳层和移动端任务卡片通过 `data-erp-theme` 与 ERP theme 覆盖接管；打印 / PDF / 合同纸面预览保持浅色口径。
- 完成：同步更新 `AGENTS.md`、`web/README.md` 和 `docs/current-source-of-truth.md`，明确后续桌面后台与岗位移动端样式改动需覆盖浅色 / 暗色，打印交付物不跟随暗色。
- 完成：`style:l1` 新增登录页主题三态、桌面后台暗色和移动任务端暗色回归；业务页状态筛选下拉高度收口，避免窄屏向上翻转遮挡前置筛选项。
- 验证：`cd web && pnpm lint && pnpm css && pnpm test` 通过；`STYLE_L1_PORT=4393 NODE_USE_ENV_PROXY=0 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,erp-dashboard-dark-desktop,mobile-tasks-dark,business-module-toolbar-mobile-dropdown pnpm style:l1` 通过；`STYLE_L1_PORT=4394 NODE_USE_ENV_PROXY=0 pnpm style:l1` 全量 35 场景通过；Browser 打开 `http://127.0.0.1:4383/admin-login` 验证暗色切换后根节点 `data-erp-theme=dark`、无横向溢出、无 console error。
- 下一步：后续新增页面或样式时继续把硬编码颜色迁移到 ERP theme 变量；如要精修全站暗色视觉，可分模块补更细的表格、弹窗和业务页暗色断言。
- 阻塞/风险：Browser 截图接口本轮在当前 tab 上超时，最终视觉证据主要来自 `style:l1` 截图产物和 DOM / console 状态检查；未改后端、RBAC、schema、seedData 或部署脚本。本轮追加前 `progress.md` 为 239 行 / 48KB，未达到归档阈值。

## 2026-06-04 15:44
- 完成：修复登录页刷新时旧登录态触发全局“登录状态已失效”弹窗的问题。`JsonRpc` 新增 `withAuth=false` 公开调用模式，登录、管理员登录和注册页的 `auth` RPC 不再携带旧 token，也不会把登录前能力探测错误升级为全局重新登录弹窗；受保护业务 RPC 的登录态失效处理保持不变。
- 完成：新增 `web/src/common/utils/jsonRpc.test.mjs` 并纳入 `pnpm test`，覆盖公开 RPC 不带 Authorization、公开 RPC 鉴权错误不触发全局弹窗、默认受保护 RPC 仍触发登出与登录页跳转。
- 下一步：如后续继续新增登录前公开 `auth` 方法，默认复用 `withAuth=false` 的公开 RPC 实例，不要重新让旧 token 进入能力探测或验证码请求。
- 阻塞/风险：本轮只改前端认证 RPC 和登录前页面；未改后端鉴权语义、schema、migration、RBAC、菜单、业务 API、样式或部署。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test`、`cd web && pnpm smoke:mobile-auth-login-route`、`STYLE_L1_SCENARIOS=admin-login-mobile,auth-expired-alert-mobile pnpm style:l1`；Playwright 验证过期旧 token 下刷新 `/admin-login` 时 `auth.capabilities` 请求均不携带 Authorization，页面停留登录页，未出现“登录状态已失效”弹窗且控制台无 error/warn。本轮追加前 `progress.md` 为 233 行 / 44627 bytes，未达到归档阈值。

## 2026-06-04 Go 漏洞依赖升级
- 完成：修复 `govulncheck` 可达漏洞告警，升级 `server/go.mod` 的 Go 基线到 `go 1.25.0` 并显式固定 `toolchain go1.26.4`，同步升级 `go.opentelemetry.io/otel/*` 到 `v1.43.0`、`golang.org/x/net` 到 `v0.53.0` 及相关间接依赖。未改 Workflow / Fact 边界、schema、migration、API、RBAC、UI、seedData、客户资料或业务字段映射链路。
- 验证：已执行 `bash scripts/qa/govulncheck.sh`，结果为 0 个可达漏洞；已执行 `cd server && go test ./...`，通过。
- 下一步：后续若要把 `govulncheck` 从默认提示升级为严格阻断，可单独评审 pre-push / full QA 时间成本和剩余不可达依赖漏洞处理策略。
- 阻塞/风险：当前主工作区仍存在其它会话留下的未提交改动，本轮只精确触达并准备提交 `server/go.mod`、`server/go.sum` 和 `progress.md`；未运行前端或业务页面回归，因为未触达前端和业务逻辑。

## 2026-06-04 14:13
- 完成：将短信登录收口为后端 Auth 能力配置，新增 `data.auth.sms.mode`，dev 默认 `mock`、prod 默认 `disabled`，并支持 `APP_AUTH_SMS_MODE` 覆盖；新增公开 `auth.capabilities`，`send_sms_code` / `sms_login` 在未启用时统一返回 `AuthSMSLoginDisabled`，生产默认不返回 `mock_code`。
- 完成：前端登录页改为读取后端能力后再展示短信登录入口；管理员登录、普通协作登录、mock server、`style:l1` 和移动端认证烟测脚本同步 `auth.capabilities`；新增前端能力解析测试和错误码中文消费层。
- 完成：同步 `server/docs/config.md`、`docs/current-source-of-truth.md`、`web/README.md`，明确短信登录是部署/Auth 能力配置，不是客户配置包 runtime、`tenant_id` 或 SaaS tenant 配置。
- 下一步：如后续接真实短信服务商，单独实现 provider adapter、密钥/模板 Secret 注入、发送结果观测和生产回归；不要把 `provider` 配置误当已接入。
- 阻塞/风险：本轮未改 schema、migration、RBAC 权限矩阵、客户配置 loader、tenant 配置、生产 Compose 或真实短信服务商；`provider` 模式当前保留但不可用。验证已通过 `cd server && go test ./cmd/server ./internal/data ./internal/biz ./internal/errcode`、`bash scripts/qa/error-code-sync.sh`、`bash scripts/qa/error-codes.sh`、`cd web && pnpm lint && pnpm css && pnpm test`、`STYLE_L1_SCENARIOS=root-redirect-desktop,root-redirect-mobile,admin-login-mobile,erp-dashboard-redirect pnpm style:l1`、`pnpm smoke:mobile-auth-login-route`；Playwright 真实页面检查 `/admin-login` 移动宽度下短信入口可见、登录按钮唯一、无横向溢出和控制台错误。本轮追加前 `progress.md` 为 220 行 / 41805 bytes，未达到归档阈值。

## 2026-06-03 21:08
- 完成：修复统一登录页入口选择被默认后台回跳覆盖的问题；`/admin-login` 现在只在存在真实来源路由时回跳，普通登录页选择“岗位任务端”后会按账号移动端权限进入 `/m/<role>/tasks`，不会因 `defaultRedirect=/erp/dashboard` 回到后台。
- 下一步：如后续要支持一人多岗切换，仍按单独任务设计；本轮只修入口选择优先级。
- 阻塞/风险：本轮未改后端 schema、migration、API、RBAC 码表、部署脚本或生产 Compose。本轮追加前 `progress.md` 为 215 行 / 41170 bytes，未达到归档阈值。

## 2026-06-03 20:23
- 完成：按“账号决定岗位”口径收窄统一登录入口，移除登录页和 `/entry` 的岗位角色选择 UI；用户只选择“后台管理 / 岗位任务端”，岗位任务端按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位。
- 完成：修正 `/admin-login` 无真实来源路径时的默认入口判断，普通手机 UA 默认选中岗位任务端、电脑默认后台；同时把旧多端口移动端路由改为 pathless 受保护父路由，确保 `/tasks` 未登录和旧登录态缺权限时稳定回 `/admin-login`。
- 完成：同步 `README.md`、`web/README.md` 和 `docs/current-source-of-truth.md`，明确当前阶段不做登录前岗位选择；若后续出现一个账号多岗位高频切换，再单独设计账号内角色切换。
- 下一步：如后续需要支持一人多岗，应另开任务评审角色切换入口、默认岗位偏好、短信直达校验和移动任务页切换后的状态恢复，不在本轮提前实现。
- 阻塞/风险：本轮仍未改后端 schema、migration、API、RBAC 码表、部署脚本或生产 Compose；多岗位账号当前自动进入配置顺序中的第一个可用岗位。本轮追加前 `progress.md` 为 208 行 / 39875 bytes，未达到归档阈值。

## 2026-06-03 19:59
- 完成：新增统一登录入口选择和桌面单端口移动任务端兼容路径。桌面构建现在同时支持 `/erp/*` 后台和 `/m/<role>/tasks` 岗位任务端；`/admin-login` 按入口配置显示“后台管理 / 岗位任务端”，手机默认岗位任务端、电脑默认后台、平板无历史选择时保留入口选择；`/entry` 用于登录后在后台和岗位任务端之间切换。
- 完成：新增 `web/src/erp/config/entryConfig.mjs` 作为入口显隐配置真源，默认启用后台和 8 个移动端角色，并支持 `window.__PLUSH_ERP_ENTRY_CONFIG__` 覆盖；移动端岗位可用性先看配置，实际进入和操作仍由后端 `permissions / menus` 与 `mobile.<role>.access` 控制。
- 完成：同步 `README.md`、`web/README.md` 和 `docs/current-source-of-truth.md`，明确本轮保留现有多端口移动端构建 / 生产主路径，未删除 `APP_ID=mobile-*` 多实例部署约定。
- 下一步：如要正式把生产前端收口为单构建 / 单端口，需要另开部署收口任务，改 `serveStaticApp.mjs`、Docker / Compose / 网关文档和旧端口重定向策略，并重新跑移动端全角色 smoke。
- 阻塞/风险：本轮未改后端 schema、migration、API、RBAC 码表、部署脚本或生产 Compose；入口配置当前是前端运行时 / 构建侧配置，不是数据库配置中心，也没有引入 `tenant_id`。本轮追加前 `progress.md` 为 201 行 / 38360 bytes，未达到归档阈值。

## 2026-06-03 18:12
- 完成：将开发态文档查看器右侧章节标签改为可点击按钮，Markdown 渲染时给 H1-H6 标题补稳定 id；点击章节标签会在右侧阅读容器内滚动到对应标题，并新增“回到顶部”按钮。
- 完成：切换文档时右侧阅读区自动回到顶部；同步 `web/README.md` 和 `docs/current-source-of-truth.md` 记录该开发态阅读辅助能力。
- 下一步：如后续要加强长文档导航，可考虑将 TOC 固定在右侧或增加当前章节高亮；仍限开发态 viewer，不进入产品内 docs registry。
- 阻塞/风险：本轮只改开发态 viewer、Markdown 渲染 id、样式和说明文档；未改 schema、migration、后端 API、业务 fact usecase、RBAC、seedData 或产品内菜单。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test && pnpm build:desktop && pnpm style:l1`；生产构建产物 DevDocs 文本扫描无命中。Browser 验证 TOC 标签点击后右侧阅读区滚到对应标题、回到顶部后 `scrollTop=0`、390px 移动端无横向溢出；未为 `.jsx` Markdown 组件新增 Node 单测，因为当前 Node 测试不能直接 import `.jsx`，避免扩测试加载器范围。本轮追加前 `progress.md` 为 195 行 / 37065 bytes，未达到归档阈值。

## 2026-06-03 17:44
- 完成：按“左侧全给目录树”的反馈移除开发态文档查看器默认态的常用置顶卡片，侧栏默认只保留搜索框和真实目录树；搜索态仍显示匹配结果列表，目录树 / 搜索结果都占满左侧剩余高度。
- 完成：清理不再使用的置顶卡片样式，并把移动端目录树高度从固定 `320px` 调整为 `min(52vh, 560px)`，减少窄屏下目录树被压缩的问题；同步 `web/README.md` 和 `docs/current-source-of-truth.md` 的开发态入口口径。
- 下一步：如后续要恢复快捷入口，优先考虑目录树中的虚拟“常用”目录或最近访问，不再用大卡片挤占目录树首屏。
- 阻塞/风险：本轮只改开发态 viewer 布局、样式和说明文档；未改 schema、migration、后端 API、业务 fact usecase、RBAC、seedData 或产品内菜单。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test && pnpm build:desktop`；`pnpm style:l1` 首次在无关 `permission-center-desktop` 场景等待标题超时，原命令重跑通过 32 个场景。Browser 验证默认态无常用置顶、目录树占满左侧剩余空间、可展开目录并切换文档、390px 移动端上下堆叠且无横向溢出；搜索输入仍受 in-app Browser 虚拟剪贴板限制，搜索筛选由 `devDocs.test.mjs` 覆盖。本轮追加前 `progress.md` 为 189 行 / 35627 bytes，未达到归档阈值。

## 2026-06-03 17:21
- 完成：将开发态文档查看器左侧从全量平铺列表改为“常用置顶 + 真实目录树”，默认只展开 `docs` 一级，显示 `93 篇`总数和各目录文档数；目录按钮补稳定 `data-dev-doc-dir`，方便浏览器回归和后续维护。
- 完成：同步 `web/README.md` 和 `docs/current-source-of-truth.md`，把该入口口径更新为按真实目录树浏览仓库 tracked Markdown；补 `buildDevDocsTree` 数据层和对应测试，保留搜索态平铺结果。
- 下一步：如后续要优化大目录默认展开、目录中文别名或最近访问记录，只改开发态 viewer，不恢复产品内 docs registry、菜单、RBAC、seedData 或生产入口。
- 阻塞/风险：本轮只改开发态查看器、样式、说明文档和测试；未改 schema、migration、后端 API、业务 fact usecase、RBAC、seedData 或产品内菜单。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test && pnpm build:desktop && pnpm style:l1`、生产构建产物 DevDocs 文本扫描、Browser 默认目录树点击与 390px 移动端盒模型检查。in-app Browser 搜索输入仍受虚拟剪贴板限制，搜索筛选由 `devDocs.test.mjs` 覆盖；Browser 截图接口本轮超时，改用 DOM / console / box metrics 验证。本轮追加前 `progress.md` 为 183 行 / 34243 bytes，未达到归档阈值。

## 2026-06-03 16:31
- 完成：收口永绅 yoyoosun 导入资料中的旧执行编号口径，将 `010/011/012` 阶段编号改为 dry-run draft、dry-run package、source snapshot freeze evidence 和 real dry-run evidence 等产物口径；同步 `docs/current-source-of-truth.md`、`docs/customers/yoyoosun/*import*.md`、freeze / evidence 相关文档、客户目录 README、`scripts/README.md`、freeze checker 报告文案和 fixture README。
- 下一步：如后续真的要进入 import loader design，必须另开单独实现任务，明确备份、回滚、幂等、对账、客户确认和正式 usecase 边界；不能把 dry-run / freeze evidence 当导入批准。
- 阻塞/风险：本轮只改文档和 CLI 报告文案；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、数据库或部署配置。本轮追加前 `progress.md` 为 178 行 / 33217 bytes，未达到归档阈值。

## 2026-06-03 16:28
- 完成：将 `docs/customers/yoyoosun/delta-register.md` 中的差异项名收敛为“yoyoosun 数据导入适配”，与 `docs/product/product-delivery-ledgers.md` 的“yoyoosun 数据导入”口径保持一致，避免误读为历史事实导入已批准。
- 下一步：如后续要做真实 import loader，必须按 `import-strategy.md` 单独评审 loader、备份、回滚、幂等、对账和人工确认，不从该差异项直接推导执行。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、loader、`business_records` 或真实导入流程。本轮追加前 `progress.md` 为 173 行 / 32502 bytes，未达到归档阈值。

## 2026-06-03 16:22
- 完成：新增开发态文档查看器 `http://localhost:5175/__dev/docs`，常用文档置顶并全量读取 `docs/**/*.md` 及根 / web / server / scripts README；支持标题 / 路径 / 正文搜索、分类标签、文档切换、章节摘要和复制相对路径。
- 完成：入口用 `import.meta.env.DEV` 直接门禁，不进入 ERP 侧栏、seedData、RBAC、产品内 docs registry 或生产构建；同步 `docs/current-source-of-truth.md` 和 `web/README.md` 说明该开发态例外。
- 下一步：如后续要调整置顶顺序或分类，只改 `web/src/erp/config/devDocs.mjs` 并补测试；不要恢复旧 `/erp/docs/*` 产品内文档中心。
- 阻塞/风险：本轮只新增开发态查看页面和样式；未改 schema、migration、后端 API、RBAC、seedData、业务 fact usecase 或产品内菜单。Browser 验证显示当前列出 93 篇 Markdown，包含 archive/customers/reference/server/scripts；in-app Browser 输入搜索受虚拟剪贴板限制未能用真实键盘输入验证，搜索筛选由 `devDocs.test.mjs` 覆盖；非置顶文档点击切换、桌面 / 移动布局、console、生产构建排除均已验证。本轮追加前 `progress.md` 为 167 行 / 31312 bytes，未达到归档阈值。

## 2026-06-03 13:59
- 完成：在 `docs/README.md` 新增“设计文档分类入口 / Design Document Entry Points”，按顶层设计、详细设计、测试与验收设计、客户与交付设计、参考与归档列出人工校对和任务拆分常用入口；同时明确该分类不替代 `docs/document-inventory.md` 完整清单，也不替代 `docs/current-source-of-truth.md`、代码、migration 和测试。
- 下一步：后续人工校对设计文档时，可先按 `docs/README.md` 分类入口逐层检查；若新增、删除、重命名长期维护文档或改变职责分类，再同步检查 `docs/document-inventory.md` 和相关目录 README。
- 阻塞/风险：docs-only 导航补充；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 162 行 / 30370 bytes，未达到归档阈值。

## 2026-06-03 12:16
- 完成：移除前端产品内文档中心、帮助中心、高级文档和开发与验收页面的运行时代码与 Markdown，包括 `web/src/erp/docs/*`、`docs.mjs`、对应页面 / 组件 / util / 测试、前端 debug API client 和相关样式；旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness`、`/erp/mobile-workbenches`、`/erp/roles/*` 等路径仅兼容重定向到 `/erp/dashboard`。
- 完成：同步服务端内置菜单和 RBAC，移除帮助中心权限与旧 docs / QA 菜单下发，旧菜单权限归一到看板；同步 `AGENTS.md`、`README.md`、`docs/current-source-of-truth.md`、`web/README.md`、产品 / 架构 / 客户相关文档和 `docs/document-inventory.md`，将当前口径收敛为“仓库正式文档保留，产品内文档入口已下线”。
- 下一步：若未来要恢复产品内业务帮助或开发验收入口，需单独设计 registry、菜单权限、路由、seed navigation 和浏览器回归；不要复用本轮删除的旧页面作为隐藏真源。
- 阻塞/风险：本轮未改 schema、migration、库存 / 出货 / 财务 fact usecase、真实导入 loader 或部署脚本；后端 debug JSON-RPC 能力仍保留为受权限保护的内部调试接口，不再有前端调试页面入口。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`、`cd server && go test ./internal/biz ./internal/data`、`git diff --check`。本轮追加前 `progress.md` 为 156 行 / 28819 bytes，未达到归档阈值。

## 2026-06-02 21:15
- 完成：批量补齐长期维护 Markdown 的 H1 中文主体 + English anchor，覆盖产品、架构、工作流、仓库、财务、角色、可观测性、部署约定、打印模板说明、外部 imported notes、客户 evidence 和旧架构归档文档；同时给旧进度归档补 H1。
- 下一步：后续新增或触达长期维护 Markdown 时，继续保持 H1 和 `docs/document-inventory.md` 的标题 / 当前用途口径一致；不要把标题双语化误认为 runtime、schema、API 或 UI 能力变化。
- 阻塞/风险：docs-only 标题收口；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、数据库或部署配置。

## 2026-06-02 21:08
- 完成：修正 `docs/architecture/finished-goods-inbound-workflow-review.md` H1 标题，按仓库长期维护 Markdown 约定改为中文主体 + English anchor：`成品入库 Workflow Usecase 评审 / Finished Goods Inbound Workflow Usecase Review`。
- 下一步：后续触达其它长期维护 Markdown 时，继续检查 H1 和文档清单是否保持中文主体 + English anchor；本轮不批量重命名相邻评审文档。
- 阻塞/风险：docs-only 标题修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 140 行 / 26203 bytes，未达到归档阈值。

## 2026-06-02 21:07
- 完成：收口旧执行工作流口径，活跃规则改为普通实施任务边界：同步 `AGENTS.md`、当前真源、产品路线、实施治理、测试策略、文档清单、客户导入资料和 import dry-run / freeze checker 输出文案，统一避免把旧执行规格目录、短任务模板或本地审查报告当当前执行主路径。
- 完成：将原执行规格目录下 4 个模板 / 协议 Markdown 移入系统废纸篓，Git 记录为删除；`docs/document-inventory.md` 已移除该活跃分类，避免旧模板继续充当隐藏真源。
- 下一步：后续非平凡任务直接在当前会话、正式设计文档、roadmap 或台账中明确目标、允许 / 禁止路径、验收命令、停止条件和风险；如需要审查材料，直接在最终回复或用户指定文档中输出，不恢复本地审查报告默认流程。
- 阻塞/风险：docs/script wording 收口；未改 runtime 业务逻辑、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、数据库或部署配置。本轮追加前 `progress.md` 为 140 行 / 26203 bytes，未达到归档阈值。

## 2026-06-02 20:45
- 完成：审查 `docs` 目录 README 覆盖情况，补齐长期维护目录 README：`docs/architecture/README.md`、`docs/product/README.md`、`docs/customers/README.md`、`docs/reference/README.md`、`docs/workflow/README.md`、`docs/roles/README.md`、`docs/finance/README.md`、`docs/warehouse/README.md`、`docs/observability/README.md`。
- 完成：同步 `AGENTS.md` 和 `docs/README.md` 的目录 README 维护规则；同步 `docs/document-inventory.md` 新增 README 条目；修正 `docs/reference/imported-notes/README.md` 漏列的 imported notes 文件。
- 下一步：后续新增、删除、重命名长期维护文档，或改变文档职责、归属目录、入口状态、真源状态时，同时检查对应目录 README 和 `docs/document-inventory.md`。
- 阻塞/风险：docs-only 目录说明补齐；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 134 行 / 25062 bytes，未达到归档阈值。工作区已有其他 docs 现场改动，本轮未回退。

## 2026-06-02 20:36
- 完成：将 `docs/architecture/` 中 6 份旧 Phase 实现历史评审归档到 `docs/archive/architecture-history/`，包括 `phase-2b-bom-lot-schema-review.md`、`phase-2c-purchase-receipt-review.md`、`phase-2d-purchase-return-quality-review.md`、`phase-2d-purchase-receipt-adjustment-review.md`、`phase-2d-quality-inspection-entry-review.md` 和 `phase-2d-quality-inspection-schema-review.md`；新增归档 README，明确这些文件只作历史追溯，不再作为当前架构真源。
- 完成：同步 `AGENTS.md`、根 `README.md`、`docs/current-source-of-truth.md`、`docs/document-inventory.md` 和 `docs/archive/README.md`，把活跃架构入口收口到长期边界文档，避免旧 Phase 施工记录继续主导后续 roadmap 或模块实现。
- 下一步：后续模块实现任务先读活跃 `docs/architecture/*` 边界文档和 `docs/current-source-of-truth.md`；若归档 Phase 文档中有结论需要恢复为当前真源，必须先抽取到正式架构 / 产品文档并重新验收。
- 阻塞/风险：docs-only 归档；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、部署配置或本地审查报告。 本轮追加前 `progress.md` 为 128 行 / 23768 bytes，未达到归档阈值。

## 2026-06-02 20:24
- 完成：新增 `docs/product/implementation-governance.md`，固化模块实施治理口径，明确 Phase 是实施顺序，Architecture Layer 是职责边界，并补充标准模块开发闭环、模块类型适用强度、阶段门禁、禁止项和实施任务拆分规则。
- 完成：同步 `docs/product/product-completion-roadmap.md` 的短引用、`docs/current-source-of-truth.md` 的阅读入口和 `docs/document-inventory.md` 的长期文档登记。
- 下一步：后续拆新模块实现任务前先按 `docs/product/implementation-governance.md` 确认 Phase、Architecture Layer、门禁、允许范围和测试层级，再进入 schema、usecase、API/RBAC、UI 或 delivery/import。
- 阻塞/风险：docs-only 治理文档收口；未改 runtime、schema、migration、generated code、server/web 代码、seedData、docs registry、API、RBAC、UI、真实 import loader 或本地审查报告。本轮追加前 `progress.md` 为 122 行 / 22741 bytes，未达到归档阈值。

## 2026-06-02 19:50
- 完成：删除 `docs/product/product-completion-roadmap.md` 顶部“本次重构结论”过程说明，避免 roadmap 长期保留来源解释和补丁口吻；同步前移 `0.x` 小节编号，并收紧 metadata 中“不包含”的表述。
- 下一步：后续 roadmap 只保留当前产品路线、边界和阶段结果；过程来源、调整背景和本轮执行记录只进入 `progress.md` 或用户指定的验收材料。
- 阻塞/风险：docs-only 文案收口；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 117 行 / 22025 bytes，未达到归档阈值。

## 2026-06-02 19:31
- 完成：将 `docs/product/product-completion-roadmap.md` 从旧 `00x` 编号执行进度口径重构为“重新做项目”的 Phase 路线，明确旧编号只作为历史施工记录，新路线按 Phase 0 到 Phase 12 表达。
- 完成：同步 `docs/product/product-delivery-ledgers.md` 的当前推荐下一步和相关前置条件，把 `v1-formal-menu-and-legacy-entry-exit`、旧 import loader 编号式路线改为 Phase 制；同步 `docs/current-source-of-truth.md` 对 roadmap 的描述，避免继续暗示 roadmap 是旧候选任务顺序。
- 下一步：如果继续执行，应先拆 `Phase 0 docs-only reset` 的正式任务说明，限定为产品原则、分层、状态边界、客户配置、交付骨架、测试策略和任务拆分规则，不改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry 或 loader。
- 阻塞/风险：docs-only roadmap 重构；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 111 行 / 20871 bytes，未达到归档阈值。

## 2026-06-02 17:15
- 完成：同步修正 `AGENTS.md` 中残留的 `current` 客户边界口径，明确当前永绅客户稳定 key 是 `yoyoosun`，不要恢复 `current` 客户目录或导入工作区别名，并把“禁止把 current 客户资料写成 Product Core”改为“禁止把任一客户资料写成 Product Core”。
- 完成：将工程原则中的文档同步规则扩展为：代码行为、目录结构、脚本名称、部署方式、配置字段、客户 key 或正式文档口径变化时，必须同轮检查并按需更新相关 README、docs、`docs/current-source-of-truth.md`、`docs/document-inventory.md`、产品 / 架构文档、帮助文档和 `progress.md`。
- 完成：新增根 `.gitattributes`，将 `docs/customers/*/raw-source-files/**` 标记为 binary；同步 `docs/customers/yoyoosun/raw-source-files/README.md`，明确 Git 不应把原始 Excel / PDF / PNG 当文本做 whitespace 检查或展示正文 diff。
- 下一步：后续改代码、目录、脚本名、客户 key 或正式口径时，按 `AGENTS.md` 先确认影响面，再同步相关文档；只属于历史归档、外部参考或普通变量名的 `current` 不机械改。
- 阻塞/风险：规则 / docs 口径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 104 行 / 19403 bytes，未达到归档阈值。

## 2026-06-02 17:07
- 完成：按用户确认删除 `current` 客户目录 / 导入工作区别名，将可追溯客户资料统一收口到 `docs/customers/yoyoosun/`，并同步 `config/customers/yoyoosun/`、`deployments/yoyoosun/`、`scripts/import/fixtures/customers/yoyoosun/`。
- 完成：将 import tooling 从 `currentCustomerDryRun` / `currentSourceSnapshotFreezeCheck` 改为通用 `customerImportDryRun` / `customerSourceSnapshotFreezeCheck`，同时把 yoyoosun fixture 与 evidence 输出路径改到客户 key 下；同步 README、当前真源、文档清单、产品路线、交付台账和客户导入文档，移除活跃文档里的 `current` 客户 key 口径。
- 下一步：后续同时处理多个客户时，按 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/`、`deployments/<customer-key>/` 和 `scripts/import/fixtures/customers/<customer-key>/` 并列隔离；不要恢复 `current` alias。
- 阻塞/风险：本轮不改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径；原始二进制文件仍直接进入 Git，后续继续批量增加时应单独评审 Git LFS / 对象存储 / 脱敏 fixture。本轮追加前 `progress.md` 为 98 行 / 18077 bytes，未达到归档阈值。

## 2026-06-02 16:50
- 完成：补齐 `docs/` 下 19 个 `Doc Type / 文档类型` metadata 值的中文说明，保留原 English anchor，并将 `Current Source Snapshot Freeze Evidence` 明确为 `current 来源快照冻结证据`。
- 完成：同步 `docs/README.md` 文档 metadata 规则，明确凡出现 `Doc Type / 文档类型`，类型值必须保留 English anchor 并补中文说明。
- 下一步：后续新增带 metadata 头的 Markdown 时，先按 `docs/README.md` 保持字段名和值的中英可读性，再判断是否需要同步 `docs/document-inventory.md`。
- 阻塞/风险：docs-only 文案口径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 92 行 / 17229 bytes，未达到归档阈值。

## 2026-06-02 16:33
- 完成：按客户维度修正原始文件归档路径，将永绅客户稳定 key 定为 `yoyoosun`，把原件目录和归档评审从 `docs/customers/current/` 移到 `docs/customers/yoyoosun/`。
- 完成：新增 `docs/customers/yoyoosun/README.md`，同步 `docs/customers/current/README.md`、`source-materials.md`、`docs/current-source-of-truth.md` 和 `docs/document-inventory.md`，明确 `current` 只是当前活跃客户 / 导入工作区别名，不是长期客户 key；后续多客户资料按 `docs/customers/<customer-key>/` 隔离。
- 下一步：后续若需要客户级配置或交付包，应优先建立 `config/customers/yoyoosun/*` 和 `deployments/yoyoosun/*`，不要继续把长期客户资料塞进 `current`。
- 阻塞/风险：docs-only + 原件归档路径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。

## 2026-06-02 16:27（已由 16:33 修正）
- 完成：当时修正 current 原始客户文件归档口径，将 8 个本地原始 Excel / PDF / PNG 复制到 `docs/customers/current/raw-source-files/`，保留原始文件名，用于后续字段、模板、导入、页面和验收溯源；该路径已在 16:33 修正为 `docs/customers/yoyoosun/raw-source-files/`。
- 完成：当时新增 `docs/customers/current/raw-source-files/README.md`，并同步 `raw-source-file-archive-review.md`、`source-materials.md`、`README.md`、`docs/current-source-of-truth.md` 和 `docs/document-inventory.md`，明确原件已在项目归档，但仍不是 Product Core、runtime、schema、migration、API、UI、seedData、docs registry、真实导入批准或 `business_records` cutover；该归档文档已在 16:33 移至 `docs/customers/yoyoosun/`。
- 下一步：后续从原件推进功能前，先生成脱敏 / 结构化 fixture 或正式产品 / 架构评审；如果继续批量增加原始二进制文件，再评审 Git LFS、对象存储或只提交脱敏样本。
- 阻塞/风险：当前仓库未启用 Git LFS，本批原件约 24MB，直接进入 Git 会增加仓库历史体积；本轮未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 80 行 / 14564 bytes，未达到归档阈值。

## 2026-06-02 16:18（已由 16:27 和 16:33 修正）
- 完成：当时新增 `docs/customers/current/raw-source-file-archive-review.md`，登记 `/Users/simon/Downloads/永绅erp/原文件/` 下 8 个 current 原始 Excel / PDF / PNG 的类型、大小、checksum、用途分类、允许落点和禁止事项；该归档文档已在 16:33 移至 `docs/customers/yoyoosun/raw-source-file-archive-review.md`。
- 完成：同步 `docs/customers/current/README.md`、`docs/customers/current/source-materials.md`、`docs/document-inventory.md` 和 `docs/current-source-of-truth.md`，当时明确原始文件本轮不移动进仓库、不提交二进制原件、不作为 Product Core 或真实导入批准；该“原件不进仓库”口径已在 16:27 修正为“原件进入 `raw-source-files/` 归档，但仍不作为 Product Core 或真实导入批准”。
- 下一步：如需从原件生成 dry-run 数据，先做脱敏 / 结构化 snapshot fixture，落到 `scripts/import/fixtures/current/*`；如需迁移原件，另开归档迁移任务评审敏感信息、引用关系、docs registry、测试断言和 Git 历史体积。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 74 行 / 13483 bytes，未达到归档阈值。

## 2026-06-02 16:03
- 完成：检查 tracked Markdown 的中英可读性状态，确认 metadata 字段已无英文-only 问题、`docs/document-inventory.md` 清单无漏列 / stale 路径 / 英文-only 用途项。
- 完成：将 54 个仍为英文-only 的 Markdown H1 标题补为中文主体 + English anchor，覆盖根 README、配置 / 部署 README、架构评审、产品路线、current 客户资料、外部参考、server internal README、脚本 fixtures 和前端骨架 README。
- 完成：继续补齐当前活跃文档里明显用于阅读的英文-only 二级 / 三级章节标题，共 111 处；保留外部导入原文、归档日期标题、纯表名 / API / 代码锚点等不适合机械翻译的标题边界。
- 完成：把“长期维护 Markdown H1 标题和用于阅读的主要章节标题应中文主体 + English anchor”的规则同步写入 `AGENTS.md` 和 `docs/README.md`。
- 下一步：后续新增或重命名长期维护 Markdown 文档时，同时检查 H1、主要章节标题、metadata 和 `docs/document-inventory.md` 标题 / 用途列是否都保留中文说明与 English anchor。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 66 行 / 12127 bytes，未达到归档阈值。

## 2026-06-02 15:47
- 完成：将 `docs/document-inventory.md` 的“标题 / 当前用途”清单项统一补成中文主体 + English anchor，覆盖架构评审、产品路线、current 客户资料、外部参考、前端 / 后端 / 脚本说明等仍偏英文的条目，方便人工审查时先读懂用途、再用英文锚点检索。
- 完成：把“文档清单标题 / 用途列必须中文主体 + English anchor”的规则同步写入 `AGENTS.md`、`docs/README.md` 和 `docs/document-inventory.md` 使用规则。
- 下一步：后续新增、删除、重命名或调整长期维护 Markdown 文档时，除同步清单外，也要按中文主体 + English anchor 维护清单里的“标题 / 当前用途”列。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 60 行 / 11157 bytes，未达到归档阈值。

## 2026-06-02 15:34
- 完成：按“活跃文档树回到 roadmap / current-source / product-delivery-ledgers”的口径清理历史遗留文档。删除已完成编号执行规格 `000` 到 `012`、旧 `rewrite-roadmap` 兼容入口、早期根目录初始化 / 主流程 / 数据模型 / 项目状态文档，以及旧 Phase 1 / V1 schema draft、cutline、go/no-go、旧下一步规划等执行规划文档；这些内容后续仅从 Git 历史或 `docs/archive/*` 过程线索追溯。
- 完成：同步 `README.md`、`AGENTS.md`、`docs/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、原执行规格目录模板说明、`docs/product/product-completion-roadmap.md`、`docs/product/domain-model-v1.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/business-records-reference-audit.md`、`docs/product/business-records-cutover-plan.md`、`docs/architecture/phase-2b-bom-lot-schema-review.md` 和 `scripts/project-scan.sh`，移除活跃文档对已删除文件的引用。
- 下一步：剩余 `business_records` 过渡文档、current import 文档、正式架构评审、产品内帮助文档和 imported-notes 仍保留；它们分别对应 roadmap 第 13 / 14 阶段、当前事实边界、产品内展示或 Reference Only 输入，后续应按具体阶段再整合，不在本轮无差别删除。
- 阻塞/风险：docs / governance cleanup；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。`scripts/project-scan.sh` 仅更新扫描目标中的已删除文档路径。本轮追加前 `progress.md` 为 54 行 / 9495 bytes，未达到归档阈值。

## 2026-06-02 15:06
- 完成：按用户已删除 `docs/changes/*` 的现场同步相关文档，更新 `docs/document-inventory.md`、`docs/README.md` 和 `web/README.md`，移除当前索引和前端文档规则中的 `docs/changes/*` 入口；保留 `docs/current-source-of-truth.md` 中“历史 changes 文件已清理、当前状态回到真源索引 / 正式文档 / 代码 / 测试”的口径。
- 下一步：后续若需要追溯旧 changes 内容，只能从 Git 历史或 `docs/archive/progress-2026-06-02-before-print-template-defer.md` 的过程线索回查；当前文档清单不再列出 `docs/changes/*`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 49 行 / 8649 bytes，未达到归档阈值。

## 2026-06-02 12:42
- 完成：将 `docs/document-inventory.md` 同步维护规则写入 `AGENTS.md`、`docs/README.md` 和 `docs/document-inventory.md` 本身：新增、删除、重命名长期维护 Markdown 文档，或调整文档用途、归属分类、产品内入口 / 外部参考 / 归档 / 任务说明等入口状态时，必须同步更新文档清单。
- 完成：明确例外边界：只改现有文档正文、措辞、局部结论或表格数据，且不改变标题、职责、分类、路径或入口状态时，通常不需要更新文档清单；如果清单中的“标题 / 当前用途”会因此失真，则必须同步更新。
- 下一步：后续文档增删改名或分类调整时，按该规则同步维护 `docs/document-inventory.md`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 43 行 / 7658 bytes，未达到归档阈值。

## 2026-06-02 12:39
- 完成：将现有英文 metadata 字段名双语化，覆盖 `Doc Type`、`Status`、`Runtime Implemented`、`Ent Schema Implemented`、`Migration Implemented`、`Current Implementation Source of Truth`、`Runtime Source of Truth`、`Schema Source of Truth`、`Notes`、`Current Evidence Inputs` 以及 imported note 的 `Source`、`Imported At`、`Purpose`、`Not Source Of Truth` 等字段；同时给常见 `Status` 值和 `Yes/No` 值补中文说明。
- 完成：新增 `docs/document-inventory.md`，按仓库根文档、配置与部署骨架、docs 真源入口、架构评审、产品与路线、客户资料边界、旧执行规格、历史变更、外部参考、前端产品内文档、前后端 / 脚本说明等分类列出当前 tracked Markdown 文档；同步在根 `README.md` 和 `docs/README.md` 增加文档清单入口。
- 下一步：后续新增、删除或重命名长期维护文档时，同步更新 `docs/document-inventory.md`；若状态值或类型值容易误解，在对应文档触达时继续补中文值说明。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 37 行 / 6371 bytes，未达到归档阈值。

## 2026-06-02 12:23
- 完成：补充 metadata 双语规则：后续若新增可被机器读取或跨团队复用的 metadata，必须同时保留中文说明和 English anchor；推荐 `title_zh/title_en`、`summary_zh/summary_en`、`status_zh/status_key` 这类成对字段。
- 完成：明确当前前端 registry 尚未消费 `title_en` / `summary_en` 等字段；如要新增双语 metadata 到运行时 registry，必须同步修改渲染消费逻辑和 `docs.test.mjs`，不能只写未生效字段。
- 下一步：如果后续决定真正支持双语前端文档展示，再单独拆 UI / registry / test 任务，先设计字段结构再落代码。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 31 行 / 5490 bytes，未达到归档阈值。

## 2026-06-02 12:22
- 完成：整理文档 metadata / registry 边界，明确当前仓库不要求所有 Markdown 添加 YAML frontmatter 或统一 metadata 头；metadata 主要用于减少产品内文档入口、受众、状态和是否接入前端页面的信息差，不制造新的内容真源。
- 完成：在 `docs/README.md` 增加全仓分类规则，列出 `README`、`docs/current-source-of-truth.md`、`docs/product/*`、`docs/architecture/*`、旧执行规格目录、`docs/changes/*`、`docs/archive/*`、`progress.md`、`docs/reference/imported-notes/*`、`server/docs/*` 等不需要产品内 metadata 的文档类型和应保留信息；在 `web/README.md` 增加前端文档注册约定，明确 `docRegistry`、`seedData.mjs` 和 `docs.test.mjs` 才是产品内文档入口守卫。
- 下一步：后续若新增产品内文档页，只对 `web/src/erp/docs/*.md` 走 `docs.mjs` / `seedData.mjs` 注册；若要引入 Markdown frontmatter，必须先实现解析器和测试，再限定目录。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 25 行 / 4253 bytes，未达到归档阈值。

## 2026-06-02 12:01
- 完成：读取 `/Users/simon/Desktop/automated-test-strategy.md`，将其中适合本项目的自动化测试分层、Workflow / Fact 边界检查、docs-only 验收、Schema / Migration、Repo / Usecase、API / RBAC、Frontend UI、current import dry-run / freeze 和部署前验收口径整理进 `docs/product/test-strategy.md`。
- 完成：明确暂不直接落地的内容，包括完整业务 E2E runner、真实 import loader 测试、shipment / finance 完整事实测试、backup / restore 脚本和 CI 分层自动化，避免把未来建议写成当前已实现能力；同步在 `README.md` 文档索引加入自动化测试策略入口。
- 下一步：后续新增真实 import loader、出货 / 财务事实层或 CI 流水线时，再按本文 T6 / T7 / T8 补 runner、结构化摘要和验收命令。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、import loader、部署脚本或 CI 配置。本轮追加前 `progress.md` 为 19 行 / 3170 bytes，未达到归档阈值。

## 2026-06-02 11:47
- 完成：按“打印模板暂不做产品内核”的决策收紧正式产品文档。`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/zero-to-one-architecture.md`、`docs/product/product-principles.md`、`docs/product/config-permission-policy.md`、`docs/product/v1-schema-go-no-go.md`、`docs/product/customer-delta-policy.md` 和 `docs/product/formal-menu-entry-plan.md` 均已明确：打印格式当前只作为客户打印样本、交付诉求或 `Print Template Candidate` 记录，默认 Deferred；不进入 Product Core，不作为行业模板默认能力，不新增模板 schema，不实现模板设计器或通用模板引擎。
- 完成：同步 current 客户资料边界和业务记录过渡文档，把“打印模板 / 合同样式”统一改为客户打印样本、`Print Template Input` 或 `Print Template Candidate`；只有至少 2-3 个真实客户同类单据重复、字段来源稳定且差异主要是抬头 / 字段显示 / 版式微调时，才重新评审是否做 Print Template Core MVP。
- 下一步：如果后续客户继续提出打印格式诉求，先登记到客户差异台账和客户打印样本清单，不进入 roadmap 编号；等多客户重复性成立后再单独拆 `print-template-core-mvp-review`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、打印中心实现、模板渲染、loader 或部署配置。旧 `progress.md` 已按阈值要求归档到 `docs/archive/progress-2026-06-02-before-print-template-defer.md`。

## 2026-06-02 10:28
- 完成：将 `/Users/simon/Desktop/plush-toy-erp-from-0-to-1-plan.md` 归档为 `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md`，明确 `Reference Only`，不作为 runtime、schema、migration、API、UI、目录结构、roadmap 编号或交付排期真源；同步更新 imported-notes README 文件清单。
- 完成：从外部规划稿中只提炼稳定口径到正式文档：`docs/product/zero-to-one-architecture.md` 补业务闭环主线；`docs/product/domain-model-v1.md` 补业务域职责和字段 / API / 状态示例边界；`docs/architecture/status-workflow-fact-boundary.md` 补混合状态词拆层规则。
- 下一步：如继续吸收外部规划，只能按具体评审拆到 domain model、architecture review 或单独任务说明；roadmap 不吸收目录大重构、团队排期、时间估算或 API / schema 示例。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。`progress.md` 本次追加前已检查为 380 行 / 79551 bytes，后续再更新时大概率需要先归档。
