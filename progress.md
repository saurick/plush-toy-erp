# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-06-before-print-restore-sample.md`：历史过程记录索引见归档文件本身、`docs/archive/README.md` 和 git history。
- `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：归档 2026-07-08 本地开发入口跳转、打印模板样式、作业指导书入口归属、长业务带值换行、L1 收口提交等流水，为本轮路由动态模块加载恢复修复前归档。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 的 133 内部验证证据已收口到 `deployments/yoyoosun/evidence/releases/2026-07-03/`，`release-evidence-status` 为 `ready`，closeoutSummary 为 `gateVerified=6/6`、`blockers=0`。
- 本次 133 发布验证已完成本地构建镜像、远端 `docker load`、运行时 `.env` 脱敏 preflight、migration before/after、pre-migration backup、隔离恢复 + migration 演练、真实库 migration、业务容器重建、目标 smoke、rollback / forward-fix evidence 和 internal-only sign-off。

## 2026-07-08 路由动态模块加载恢复

完成：按 `$plush-runtime-diagnostics` 和 `$plush-code-review-governance` 排查“连续切菜单后 `<Route.Provider>` 报 `Failed to fetch dynamically imported module`”。截图指向 `V1SalesOrdersPage.jsx` 的 React Router lazy import；当前 runtime 证据显示 `curl` 直接请求 `V1SalesOrdersPage.jsx` 返回 `200 OK`，Vite dev server 监听 `*:5175`，`@vite/client` HMR 目标仍是 `127.0.0.1:5175`，不是业务 RPC、DB、RBAC 或 Workflow / Fact 层问题。Playwright 首次直接动态 import `router.jsx` 复现一次浏览器侧模块加载失败，随后 network 复查 `router.jsx`、`lazyImportRetry.mjs` 和 `V1SalesOrdersPage.jsx` 均为 `200`，销售页模块重复导入 5 次均返回默认 React component，说明故障链路更接近本地 Vite / 浏览器模块图瞬态失败。

本轮将 `App.jsx` 和 `erp/router.jsx` 的 `React.lazy` 统一切到 `lazyWithDynamicImportRetry`，只对浏览器常见动态 import 取模块失败重试，不重试普通页面运行时错误；同时给 ERP 路由层补 `RouteRuntimeErrorBoundary`，失败时展示“重新加载 / 返回工作台”的可恢复界面，避免直接落到 React Router 默认红屏。`Loading` 组件新增可选 `actions` 插槽和对应浅色 / 暗色按钮样式。同步新增 `lazyImportRetry.test.mjs` 并加入 `web/package.json` 测试列表。

下一步：如果用户继续在同一浏览器看到旧红屏，先确认当前标签页已加载新 `router.jsx`（dev server HMR 已更新，必要时硬刷新）；若仍复现，继续抓 Network 里具体失败的 `/src/**` 或 `/.vite-cache/**` 子模块，而不是改销售订单业务页或后端接口。

阻塞/风险：追加前 `progress.md` 为 294 行、81954 字节，已先归档到 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`。本轮只改前端路由懒加载恢复、通用 loading action 样式、测试列表和进度 / 归档索引；不改 schema、migration、RBAC 权限码、Workflow / Fact usecase、销售订单业务逻辑、菜单定义、客户配置、后端 JSON-RPC、部署脚本或生产发布路径。已通过 `/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/common/utils/lazyImportRetry.mjs src/common/utils/lazyImportRetry.test.mjs src/App.jsx src/erp/router.jsx src/common/components/loading/index.jsx`、`/usr/local/bin/pnpm --dir web exec stylelint "src/common/components/loading/loading.css"`、`/usr/local/bin/pnpm --dir web exec node --test src/common/utils/lazyImportRetry.test.mjs src/common/utils/errorMessage.test.mjs`、`/usr/local/bin/pnpm --dir web exec prettier --check ...`、`/usr/local/bin/pnpm --dir web test`、`/usr/local/bin/pnpm --dir web build`，以及 Playwright 浏览器动态 import 验证。未跑全站 `style:l1`；本轮不涉及业务页面 DOM / box 模型或后端事实链路。

## 2026-07-08 作业指导书 BOM / 委外双入口收口

完成：按甲方确认“内部和委外同时都有”重新收口作业指导书入口。BOM 管理继续作为内部 / 工程资料作业指导书入口，委外订单页面新增 `作业指导书打印`，与 `加工合同打印` 并列；新增 `buildWorkInstructionDraftFromOutsourcingOrder`，只从委外源单和明细快照带入委外单号、加工厂、加工项目、产品、委外数量、回货日期和备注，取消明细不会进入打印草稿。模板元数据、README、当前真源、打印模板字段清单、打印模板实现原理和 server README 已同步为“双入口、单模板、只读打印草稿”口径；`engineering-work-instruction` PDF 门禁仍按 `material_bom` 工程资料模板登记。

下一步：如果后续要让生产进度、来料质检或岗位任务端直接打开作业指导书，需要先有对应生产工单 / 质检规范 / 任务来源到打印草稿的字段映射评审；当前不把生产事实页、质检事实页或加工环节主数据页作为直接打印源。

阻塞/风险：本轮不改 schema、migration、RBAC 权限码、Workflow / Fact usecase、PDF 服务端门禁代码、客户配置激活、业务附件或生产 / 质检事实页面。委外入口只提供外发加工上下文，不自动生成完整 SOP 步骤，也不表示委外、生产、质检或库存事实完成。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/config/printTemplates.test.mjs src/erp/utils/printPdf.test.mjs`、`STYLE_L1_SCENARIOS=print-template-business-entry-ownership /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；`lint` 仍有既有 `ProcessingContractPrintWorkspacePage.jsx` hooks warning，无错误。

## 2026-07-08 作业指导书正文行类型合并

完成：按用户确认将作业指导书正文行收口为 `标题行 / 编号行 / 文本行` 三类；旧草稿里的 `note` / `remark` 继续兼容读取，但运行时统一归一为 `text`。页面工具栏只保留 `设为文本行`，纸面 class 和样式统一为 `erp-work-instruction-paper__text-row`；默认样例仍保留 `注：...`、`备注：...` 的文字内容，不再把“说明 / 备注”作为固定行类型。编号行继续按最近的标题行或文本行重新从 `1` 编号，编号行图片限制保持不变。

下一步：如果后续客户要求某些文本行不重置编号，需要另评估是否增加更明确的“分隔文本 / 普通文本”能力；当前先保持源 Excel 小模块编号口径，避免把 `注` 或 `备注` 行从表格语义里拆出去。

阻塞/风险：本轮不改 schema、migration、RBAC、Workflow / Fact、PDF 服务端门禁、客户配置激活或业务事实写入。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs && node --check web/src/erp/utils/engineeringPrintEditor.mjs && node --check web/scripts/style-l1/scenarios.mjs`、`node --test web/src/erp/utils/engineeringPrintEditor.test.mjs web/src/erp/config/printTemplates.test.mjs`、`web/node_modules/.bin/eslint ...`、`web/node_modules/.bin/eslint --ext .jsx src/erp/pages/EngineeringPrintWorkspacePage.jsx`、`web/node_modules/.bin/stylelint "web/src/**/*.{css,scss,sass}"`、`node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets node scripts/styleL1.mjs`、`git diff --check`。直接 `pnpm --dir web ...` 在当前 Codex runtime 命中 pnpm `11.7.0`，仓库要求 `10.13.x`，因此改用已安装的 `web/node_modules/.bin/*` 和脚本入口验证。

## 2026-07-08 委外加工明细产品订单编号收口

完成：修正委外订单编辑链路没有逐行承接甲方加工汇总和加工合同纸面 `产品订单编号` 的问题。`outsourcing_order_items` 新增 nullable `product_order_no_snapshot`，JSON-RPC 保存 / 回显、委外编辑表单、加工合同打印草稿和参数构建统一读写该字段；加工合同打印优先使用明细行快照，旧数据缺失时继续回退表头 `source_order_no`。同步更新 server README、打印模板字段清单和 yoyoosun Excel 字段映射评审，明确该字段只作逐行追溯快照，不新增销售订单外键，不写委外事实、库存、质检、应付或付款。

下一步：如果还要修正本地截图里 `SIM-SELECT-COL-* / 选择列手测模拟加工厂` 这类历史调试样例，需要先定位该数据所在开发库或 seed 来源，再决定清理 / 重建样例；本轮已确认 tracked code 中未找到该字符串。

阻塞/风险：本轮新增 schema migration，但未执行 `make migrate_apply`，目标开发库 / 测试库需按发布或本地开发流程 apply 后才能保存新字段。已通过 `make data`、`go test ./internal/biz ./internal/service ./internal/data`、`pnpm exec node --test src/erp/utils/masterDataOrderView.test.mjs src/erp/data/processingContractTemplate.test.mjs`、`STYLE_L1_SCENARIOS=processing-contract-form-modal-title-desktop pnpm exec node ./scripts/styleL1.mjs`。未跑全量 `web test` 或全量 `style:l1`。

## 2026-07-09 管理员权限 profile 后台同步

完成：`ERPLayout` 的管理员 profile 同步从 mount-only 扩展为首次进入、`visibilitychange` 回到 visible、visible 状态下 60 秒低频同步三类触发；hidden 状态下定时器不发请求；`loadProfile` 增加单飞 promise 保护，避免上一轮 `admin.me / get_effective_session` 未完成时重复发起。后台同步默认静默，不重置 `profileLoading / profileSyncCompleted`，避免协同入口在轮询期间短暂收起；首次进入仍显式 `showLoading`。权限中心保存用户角色或角色权限后仍走原有 `loadData()` 刷新当前页面数据，本轮未改该页面保存链路。

下一步：如后续需要更实时的跨账号权限刷新，再单独评审 SSE / WebSocket / 服务端推送和后端事件边界；当前先保持轻量轮询和前台恢复同步。

阻塞/风险：本轮只改善前端菜单 / 按钮 / 字段可见投影的新鲜度，不改变后端 RBAC、schema、migration、角色模型、客户配置语义、Workflow / Fact 写入门禁或 release 路径。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/adminProfileSync.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/components/ERPLayout.jsx src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`git diff --check -- web/src/erp/components/ERPLayout.jsx web/src/erp/utils/adminProfileSync.test.mjs`。默认 `pnpm --dir web exec eslint ...` 和 `corepack pnpm --dir web exec eslint ...` 均因当前 runtime pnpm 为 `11.7.0`、仓库要求 `10.13.x` 被版本门禁拦截，已改用项目锁定的 `/usr/local/bin/pnpm@10.13.1` 验证；未跑全量 `pnpm test` 或 `style:l1`，因为本轮不改 DOM / 样式 / 业务事实链路，且当前工作区存在大量 unrelated dirty files。

## 2026-07-09 提交推送 pre-push 收口

完成：按 full-worktree 收口执行 `git fetch --prune origin`、`git diff --check`、`bash scripts/qa/full.sh`、`git add -A` 和提交；pre-push 首次运行时，`adminProfileSync.test.mjs` 对 `ERPLayout.jsx` 的 `loadProfile` 依赖数组断言只接受未换行格式，而 pre-commit Prettier 已将依赖数组格式化为多行，导致 push hook 阻断。已将断言改为等价的空白无关正则，继续锁住 `loadProfile` 只依赖 `activeBrand / adminRpc`，不依赖 location 或选中菜单状态。

下一步：amend 当前提交后重新运行相关测试和 push hook，确认 `origin/main` 与本地提交同步。

阻塞/风险：本次修正只调整测试格式鲁棒性和进度记录，不改变运行时代码、schema、migration、RBAC、Workflow / Fact 或客户配置语义。

## 2026-07-09 永绅客户包与 Product Core 边界隔离

完成：按 `Product Core 中性 + yoyoosun 客户包显式选择` 收口隔离边界。后端缺省客户 key 从 `yoyoosun` 改为中性 `demo`；开发态客户配置页不再在缺少 `customer` query 时自动进入永绅包，而是显示“未选择客户配置包”，只有显式 `?customer=yoyoosun` 或选择器切换才进入客户包。Product Core 打印目录和加工合同模板的可见来源文案改为中性来源样本，不再在通用模板 catalog 中直出 `docs/customers/yoyoosun/raw-source-files` 或“基于 yoyoosun”口径；客户 raw-source 引用保留在 `config/customers/yoyoosun` 和 `docs/customers/yoyoosun` 边界内。同步更新 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/customers/yoyoosun/客户交付矩阵.md`。

下一步：若后续新增第二个客户包，优先补 `config/customers/<customer-key>/`、客户 runtime manifest、页面选择器和发布证据链；仍不把客户差异写进 Product Core 默认 key、schema 或通用 usecase。

阻塞/风险：本轮不新增 `tenant_id`、不实现 SaaS 多租户、不做真实客户数据导入、不改 schema / migration / RBAC / Workflow / Fact / release 执行器。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/config/devCustomerConfig.test.mjs src/erp/config/printTemplates.test.mjs`、`node --test scripts/qa/dev-entry-boundary.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、`go test ./internal/biz ./internal/server`、`node --check web/scripts/style-l1/scenarios.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-mobile /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`；L1 验证覆盖缺省未选择、未知客户、显式 yoyoosun、选择器切换和移动端布局。focused runtime 扫描仅剩客户配置包目录内的 raw-source 引用，符合隔离边界。

## 2026-07-09 super admin 永绅菜单审阅可见性

完成：修正永绅静态客户菜单先隐藏 `business-dashboard` 等入口，导致 `admin` 超级管理员也无法审阅业务看板的问题。`ERPLayout` 现在在 `is_super_admin=true` 时使用 Product Core 默认导航，不再被客户静态菜单子集收窄；普通账号仍按永绅 `customer-config.js`、RBAC 菜单路径和 active effective session pages 交集收窄。同步更新 `web/README.md`，明确该行为只影响前端审阅可见性，不扩大后端写入口、Workflow / Fact 或业务动作权限。

下一步：如果后续要让普通永绅业务角色也看到业务看板，需要单独评审客户试用菜单和培训口径；当前只修复 `admin` 超级管理员看全产品核心菜单。

阻塞/风险：本轮不改后端 RBAC、schema、migration、客户配置 active revision、Workflow / Fact usecase 或 release evidence。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/utils/adminProfileSync.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/config/customerMenuConfig.mjs src/erp/config/seedData.mjs src/erp/config/seedData.test.mjs src/erp/components/ERPLayout.jsx`、`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 和 `git diff --check -- web/src/erp/config/customerMenuConfig.mjs web/src/erp/config/seedData.mjs web/src/erp/components/ERPLayout.jsx web/src/erp/config/seedData.test.mjs web/README.md`。未跑浏览器 `style:l1`，因为本轮只改菜单数据源分流与单元合同，不改 DOM 样式、布局或交互态。

## 2026-07-09 永绅试用角色菜单合同收口

完成：按 super admin 审阅结论继续收口普通试用角色菜单合同。`trialDemoAccountBrowserSmoke` 不再把永绅隐藏的 `业务看板`、`异常 / 阻塞闭环` 写成普通 demo 账号 expectedMenus，而是改为各岗位稳定可见的任务看板和代表性业务页；测试同步锁住普通账号不得把永绅隐藏项配置为期望菜单。前端 `ERP_PERMISSION_PRESETS` 补齐 `engineering` 和 `admin`，其中 `engineering` 对应产品工程和工程岗位任务端，`admin` 只对应权限管理，继续和 `is_super_admin=true` 的产品核心看全账号分开。

下一步：如要做真实浏览器试用验收，先启动本地后端、已审计的永绅前端 runtime，并提供 `TRIAL_ACCOUNT_PASSWORD` 后运行 `pnpm --dir web smoke:trial-demo-browser`；当前本轮已把静态模板和合同测试收口。

阻塞/风险：本轮不改后端 RBAC、角色 seed、schema、migration、客户配置 active revision、Workflow / Fact usecase、业务写入口或 release evidence。已通过 `node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs web/src/erp/config/workflowStatus.test.mjs scripts/qa/trial-account-rbac.test.mjs web/scripts/trialDemoAccountBrowserSmoke.test.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/config/menuPermissions.mjs src/erp/config/menuPermissions.test.mjs scripts/trialDemoAccountBrowserSmoke.mjs scripts/trialDemoAccountBrowserSmoke.test.mjs src/erp/components/ERPLayout.jsx src/erp/config/seedData.test.mjs`、`/usr/local/bin/pnpm --dir web exec prettier --check src/erp/config/menuPermissions.mjs src/erp/config/menuPermissions.test.mjs scripts/trialDemoAccountBrowserSmoke.mjs scripts/trialDemoAccountBrowserSmoke.test.mjs` 和 `git diff --check -- web/src/erp/config/menuPermissions.mjs web/src/erp/config/menuPermissions.test.mjs web/scripts/trialDemoAccountBrowserSmoke.mjs web/scripts/trialDemoAccountBrowserSmoke.test.mjs`。未跑真实浏览器 smoke 和 `style:l1`；本轮是菜单 / RBAC 数据合同调整，不改 DOM 样式和页面布局。

## 2026-07-09 Product Core 业务数据隔离空态

完成：在 super admin `super_admin_product_core` 投影下，`ERPLayout` 对客户业务数据页新增产品核心评审空态，不再挂载真实业务 `Outlet`，避免销售、采购、委外、库存、质检、出货、财务、主数据和异常闭环页面读取当前客户业务表。普通账号 / 客户有效投影仍按原业务 API 读取当前部署数据库；系统权限、审计日志、打印中心和工作台不进入该业务数据阻断。`businessModules` 新增 `isCustomerBusinessDataPageKey` 作为业务数据页单一判断，`style:l1` 的 super admin Product Core 场景改为断言不出现 `SHIP-STYLE-L1` 和写按钮，并用 DOM / scroll metrics 确认空态不溢出。同步更新 `docs/当前真源与交接顺序.md`、`web/README.md` 和正式前端客户配置边界测试。

下一步：如果后续要让 Product Core 评审页展示能力矩阵或中性 demo 数据，应单独做只读产品能力页或 demo 数据源，不在客户业务页里读取当前客户表。

阻塞/风险：本轮不新增 `tenant_id`、不实现 SaaS 多租户、不拆数据库、不清理已有本地 / 测试库里的 `SIM-*` 模拟业务数据，也不改 schema、migration、RBAC、Workflow / Fact usecase 或后端 JSON-RPC。已通过 `node --test web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/adminProfileSync.test.mjs src/erp/config/seedData.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/components/ERPLayout.jsx src/erp/config/businessModules.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5236 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`。首次 L1 复用旧 Vite 端口时遇到 HMR 导致的 `ERPWorkspaceProvider is missing`，换新端口重启干净服务后通过。

## 2026-07-09 super admin 客户运行态误拦截修正

完成：修正上一条 Product Core 空态判定过宽的问题。`super_admin_product_core` 只是 super admin 的前端投影诊断 reason，不等同无客户运行态；`ERPLayout` 现在只有在该 reason 且 `effectiveSessionDiagnostic.customerKey` 为空时才显示产品核心评审空态。带有 `yoyoosun` 等客户 key 的 super admin 仍按客户运行环境挂载业务页，`style:l1` 反向锁住出货页必须显示 `SHIP-STYLE-L1`、保留 `新建草稿` 动作且不出现隔离提示。同步更新 `web/README.md`、`docs/当前真源与交接顺序.md` 和正式前端客户配置边界测试。

下一步：如果后续确实需要“纯 Product Core 能力矩阵”页面，应新建只读能力页或中性 demo 数据源，不复用客户业务页去表达产品核心。

阻塞/风险：本轮不新增 `tenant_id`、不实现 SaaS 多租户、不拆客户数据库、不改 schema、migration、RBAC、Workflow / Fact usecase 或后端 JSON-RPC。已通过 `node --test web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/adminProfileSync.test.mjs src/erp/config/seedData.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/components/ERPLayout.jsx src/erp/config/businessModules.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5238 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`；pnpm/css 与 style:l1 仅保留当前 Node 版本高于仓库 engine 的 warning。

## 2026-07-09 Product Core 无客户态业务看板隔离补漏

完成：修正 Product Core 无客户态仍可挂载 `/erp/business-dashboard` 并读取真实业务统计的问题。`isCustomerBusinessDataPageKey` 现在把 `business-dashboard` 纳入客户业务数据页，`ERPLayout` 通过既有 `shouldGuardCustomerBusinessPageRuntime` 在无有效客户 key / sync-failed 空投影时显示产品核心评审空态，不再挂载业务看板 `Outlet`；带有 `yoyoosun` customer key 的 super admin 客户运行态仍可正常打开业务页。同步更新 `web/README.md`、`docs/当前真源与交接顺序.md`、正式前端客户配置边界测试和 `style:l1` 场景。

下一步：如果后续需要 Product Core 的中性能力总览，应新建只读产品能力矩阵或 demo 数据源，不复用客户业务看板读取 `business.dashboard_stats`。

阻塞/风险：本轮不改后端 RBAC、JSON-RPC、schema、migration、Workflow / Fact usecase、业务统计 API 或客户数据库隔离方式；只是阻止无客户 Product Core 前端挂载客户业务数据页。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/utils/adminProfileSync.test.mjs`、`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec prettier --check src/erp/config/businessModules.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs ../scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/config/businessModules.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs`、`node --check scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`STYLE_L1_PORT=5241 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core-no-customer-business-dashboard,erp-effective-session-super-admin-product-core /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check -- web/src/erp/config/businessModules.mjs web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs web/scripts/style-l1/scenarios.mjs web/README.md docs/当前真源与交接顺序.md`；当前 Node 版本仍高于仓库 engine，style:l1 仅保留 engine / typeless module warning。

## 2026-07-09 super admin 可见性与客户运行态拆分及回归数据重建

完成：将 `super_admin_product_core` 收口为前端可见性 `visibilityMode`，新增 `dataRuntimeScope` 与 `canMountCustomerBusinessPages` 作为客户业务页是否挂载的唯一数据运行态判断；`ERPLayout` 改为通过 `shouldGuardCustomerBusinessPageRuntime` 判断客户业务页空态，并在 shell 上暴露 `data-effective-session-data-scope` 供浏览器回归断言。带 `yoyoosun` customer key 的 super admin 仍进入客户运行态，sync-failed / 无客户 key 才阻止客户业务页挂载。Product Core demo seed 扩充为中性单位、材料、产品、仓库、工序和 BOM 数据；永绅 preview fixture 扩充到客户、供应商、材料、产品、仓库、BOM、销售、采购、委外、采购入库、质检、库存批次、出货、财务草稿和 Workflow 任务，并覆盖 draft / active / cancelled、pending / passed / rejected、ready / blocked / done 等手动回归状态。新增 `scripts/qa/manual-regression-data-plan.mjs` 只读总计划和测试，`test-data-isolation-boundary` 也纳入永绅 fixture 与手动回归计划守卫。同步更新 `web/README.md`、`docs/当前真源与交接顺序.md`、`docs/customers/yoyoosun/客户交付矩阵.md` 和 `scripts/README.md`。

下一步：如果要把这些模拟数据真正写入本地或目标试用环境，先按 `manual-regression-data-plan` 输出准备 Product Core seed 结果中的 ID，再分别执行 trial / operational fact / mobile workflow 的 `--apply` 路径，并提供对应模拟确认环境变量；真实客户数据导入仍需单独 approval、备份和恢复计划。

阻塞/风险：本轮不新增 `tenant_id`、不实现 SaaS 多租户、不拆客户数据库、不执行真实客户导入、不改 schema / migration / RBAC / Workflow / Fact usecase 或后端 JSON-RPC 写入口。已通过 `node --test web/src/erp/utils/adminProfileSync.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs scripts/qa/manual-regression-data-plan.test.mjs scripts/qa/test-data-isolation-boundary.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs scripts/qa/trial-simulated-data.test.mjs scripts/qa/operational-fact-simulated-closure.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs`、`go test ./internal/data`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/utils/adminProfileSync.mjs src/erp/utils/adminProfileSync.test.mjs src/erp/components/ERPLayout.jsx scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5239 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages /usr/local/bin/pnpm --dir web style:l1`、`node --check scripts/qa/manual-regression-data-plan.mjs scripts/qa/manual-regression-data-plan.test.mjs scripts/qa/test-data-isolation-boundary.mjs`、`node scripts/qa/test-data-isolation-boundary.mjs --json`、`node scripts/qa/manual-regression-data-plan.mjs --json` 和 `git diff --check`。Node 仍有 typeless package warning，不影响本轮测试结果。

## 2026-07-09 第二轮提交推送全量验证收口

完成：继续按 full-worktree closeout 复跑提交前验证。`qa:full` 首次在 `server/internal/service` 暴露服务测试夹具仍写死旧 `yoyoosun` 默认客户 key；已将服务层客户配置测试中的默认客户 key / scope value 对齐到 `biz.DefaultCustomerKey`，避免后端默认客户从 `yoyoosun` 切到 `demo` 后，省略 `customer_key` 的业务 API 测试找不到 active revision。

下一步：提交并推送当前全工作区改动，推送前继续确认远端未领先；如 pre-commit / pre-push 产生格式化或守卫问题，按 hook 反馈继续收口。

阻塞/风险：本轮服务测试修正只改测试夹具，不改变 schema、migration、RBAC、Workflow / Fact、客户配置 usecase 或 JSON-RPC 运行时语义。已通过 `go test ./internal/service` 和 `bash scripts/qa/full.sh`；`qa:full` 最终显示 `[qa:full] 全部通过`。当前 Node 版本高于仓库 engine、`ProcessingContractPrintWorkspacePage.jsx` 仍有既有 React Hook dependency warning，不影响本轮 full QA 结果。
