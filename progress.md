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
