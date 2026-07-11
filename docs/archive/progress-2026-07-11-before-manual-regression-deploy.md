# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-11 发布候选本地收口与阻断复核

完成：按当前 236 个受影响路径完成 release candidate 本地审查与门禁收口。修复已结算 legacy / protocol-0 domain command 绕过 durable result 校验、已取消 finance fact 被 exact recovery 重绑为 Applied、成品质检省略 `inspected_at` 时同 fingerprint 并发不收敛、旧质检终态缺时间误报幂等冲突、配置客户 effective session 同步失败仍落入本地诊断壳等正确性问题；同步收口 40921 用户文案、财务字段能力文档口径、漏洞扫描与 PostgreSQL 门禁顺序，以及 L1 高负载下采购明细异步校验等待。开发库与本机隔离库均已到 `20260710150001`，Atlas validate 通过；临时 detached worktree 覆盖当前 `server/` 快照运行 `make data` 后 schema / Ent / migration 无漂移。最终快照通过 `git diff --check`、`style:l1` 92 个场景、`scripts/qa/full.sh`、`scripts/qa/strict.sh`，前端 675/675、生产构建、关键 PostgreSQL 事务、全量 Go 测试/构建和 0 个可达漏洞均通过。

下一步：获得提交 / 推送授权后，先形成包含 6 条 migration exact bytes 的固定 revision，再在 detached clean worktree 执行 `make data` 并确认无新增 migration / Ent 漂移；目标发布仍需一次性补齐 SSH / 受控 `.env`、真实验收账号、当前 runtime snapshot、备份恢复证据、immutable image、回滚点和发布窗口，之后才按正式 runbook 执行目标库只读 preflight、migration、Compose 和 authenticated smoke。

阻塞/风险：本轮未 commit、未 push、未连接或修改 133，当前仍是 217 个 tracked modified 与 19 个 untracked 文件；6 条 migration 已应用到开发 / 隔离库但尚未纳入固定 Git revision，目标库 `inventory_lots` 存量与 `inventory_balances` 非并发索引切换的锁时长仍未证明。`com.simon.lab-saurick.ipv6-https` LaunchDaemon 的 `socat [::]:443 -> 127.0.0.1:443` 会自环耗尽临时端口，TERM 后会因 KeepAlive 复活；本轮未获授权修改系统 plist，建议另行改为 IPv6-only 并重载后复验。短信 provider 仍为外部能力，保持 disabled 时不阻断本次非短信发布口径。

## 2026-07-10 133 多状态模拟数据生成器接口对齐

完成：133 试用造数运行时发现 `trial-simulated-data.mjs` 仍调用已退出主路径的拆分式 `create_sales_order / add_sales_order_item`，已改为当前销售订单唯一写入入口 `save_sales_order_with_items`，订单和明细原子创建；重复运行继续按模拟单号和行号复用，若发现历史模拟订单缺失预期明细则显式阻断，避免静默覆盖未知现场。同步修正 focused mock 测试，锁住工具只使用当前 V1 masterdata 与 sales_order API。事实矩阵继续运行时确认 yoyoosun 仓库角色只有 `shipment.ship`、没有创建和取消出货单的权限，导致正式出货主路径不可闭环；已按 Product Core 既有权限补入 `shipment.create / shipment.cancel`。岗位任务造数继续确认客户投影未给任何岗位 `workflow.task.create`，已按 PMC 的计划与协同发起职责补入 Product Core 既有 `workflow.task.create`，客户包升级为 v7，并新增角色投影断言。真实写入还发现生成器允许 26 字符 run-id，但最长场景 task code 会超过 schema 的 64 字符合同；现已按最终编号长度把 run-id 上限收紧为 19，并补最大长度断言，不放宽 schema 或静默截断编号。

下一步：由甲方通过受控渠道补齐阿里云号码认证短信的 access key id / secret、签名和模板 code，再把 133 `APP_AUTH_SMS_MODE` 切到 `provider`，执行短信发送 / 登录真实回归；不得用 mock 代替。

阻塞/风险：yoyoosun v7 已在 133 激活；数据库现有销售、采购、收货、质检、库存、出货、财务和 Workflow 多状态模拟记录，10 个 demo 账号真实登录 / RBAC 通过，浏览器已核对老板采购五状态、仓库任务看板和出货草稿 / 已出货 / 已取消列表。短信仍为 `disabled`，四项阿里云 provider 配置均缺失，当前不能声明短信登录可用。本轮不导入真实客户数据、不改 schema / migration，所有新增业务记录均使用 `SIM-*` 前缀并明确标记为模拟数据。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-06-before-print-restore-sample.md`：历史过程记录索引见归档文件本身、`docs/archive/README.md` 和 git history。
- `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：归档 2026-07-08 本地开发入口跳转、打印模板样式、作业指导书入口归属、长业务带值换行、L1 收口提交等流水，为本轮路由动态模块加载恢复修复前归档。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力与流程编排.md`、`docs/workflow/业务与协同流程地图.md`、产品能力台账、当前代码/migration/测试。`docs/reference/**`、客户 PDF/Excel 和 GPT 对话只作输入线索。
- Product Core / 永绅客户包、角色页面和动作投影、模块依赖、窄版 Process Runtime、Source Document / Workflow / Fact 边界、客户导入与发布门禁已完成本地综合收口；后续改动不得恢复旧业务记录、拆分单据写 API、formal-shell 假页或客户分支。
- 当前只能声明本地代码、模拟数据、测试库和浏览器回归通过；本轮没有执行永绅真实客户数据导入、目标环境发布/配置激活、备份恢复演练或客户签收，不将旧 evidence 冒充为本轮结果。

## 2026-07-09 Product Core 首页总览修正

完成：修正 admin 无 customer key 进入 Product Core 后 `/erp/dashboard` 仍显示客户 Workflow 工作台空队列的问题。无客户态 Product Core 现在侧栏第一项显示“产品核心总览”，首页展示产品核心能力总览、能力审阅入口和控制面入口，并在加载逻辑中直接跳过 `listWorkflowTasks`，不读取客户订单、库存、Workflow 或财务事实。点击能力审阅入口会进入对应业务页的 `ProductCoreCapabilityReview`，继续保持不挂载客户业务数据。同步更新正式前端边界测试、`style:l1` 桌面 / 移动 / 暗色断言、`web/README.md` 和 `docs/当前真源与交接顺序.md`。

下一步：如果要让 Product Core 控制面支持客户配置发布 / 激活 / 回滚的正式页面，需要单独评审 `/erp/product-core/customer-config` 或等价路由、后端 JSON-RPC 权限、release evidence 读回和目标环境 smoke。

阻塞/风险：本轮只改前端 Product Core 首页、导航文案、样式和文档口径；不新增后端 API，不改 schema / migration / RBAC / Workflow / Fact，不执行真实客户导入或发布激活。已通过 `node --test web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`node --check web/src/erp/config/seedData.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/pages/DashboardPage.jsx src/erp/config/seedData.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5243 STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-effective-session-super-admin-product-core-no-customer-business-dashboard /usr/local/bin/pnpm --dir web style:l1`。`node --check` 不适用于 `.jsx` 扩展名，本轮 JSX 语法由 ESLint / Vite L1 覆盖；Node 仍有 engine / typeless package warning。

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

完成：修正永绅静态客户菜单先隐藏 `business-dashboard` 等入口，导致 `admin` 超级管理员也无法审阅业务看板的问题。当时 `ERPLayout` 在 `is_super_admin=true` 时使用完整产品导航，不再被客户静态菜单子集收窄；普通账号仍按永绅 `customer-config.js`、RBAC 菜单路径和 active effective session pages 交集收窄。该历史记录已被下方“Product Core 控制面导航拆分”收窄：无客户 Product Core 只显示控制面导航，带 customer key 的 super admin 才显示完整产品导航。同步更新 `web/README.md`，明确该行为只影响前端审阅可见性，不扩大后端写入口、Workflow / Fact 或业务动作权限。

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

## 2026-07-09 Product Core / 客户运行态前后端门禁复查

完成：再次复查 Product Core 与客户运行态在前端导航、后端 RBAC / JSON-RPC、customer_config 校验、发布 / 激活 / 回滚流程和 runtime audit 上的对齐情况。发现并修复 `rollback_customer_config` 后端仍复用 `customer_config.activate` 权限的问题：新增内置权限 `customer_config.rollback`，管理员角色纳入该权限，JSON-RPC 回滚入口改为独立 rollback 门禁，并补充“只有 activate 不能 rollback”的服务层回归测试。同步修正当前真源索引和多甲方能力台账，明确 super admin 带 customer key 才使用完整客户运行态导航，无 customer key 只显示 Product Core 控制面导航；rollback 使用独立 RBAC 权限并写独立审计。

下一步：如果要把客户配置发布 / 激活 / 回滚从 dev-only 控制台推进为正式 Product Core 控制面页面，需要单独评审 `/erp/product-core/customer-config` 或等价路由、按钮权限、release evidence 读回和目标环境 smoke。

阻塞/风险：本轮不改 schema / migration，不执行真实客户导入、发布、激活、回滚、目标环境 smoke、备份恢复或生产演练；priority audit 只证明本地代码 / 文档 / 脚本证据 ready。已通过 `cd server && go test ./internal/biz ./internal/data ./internal/service`、`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPCRollbackUsesTargetRevision|TestCustomerConfigJSONRPCRollbackRequiresRollbackPermission'`、`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs`、`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`、`pnpm --dir web exec eslint ...`、`pnpm --dir web css`、`STYLE_L1_PORT=5243 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core-no-customer-business-dashboard,erp-effective-session-super-admin-product-core pnpm --dir web style:l1`、`node --check scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 和 `git diff --check`。Node 仍有 engine / typeless package warning，不影响本轮结果。

## 2026-07-09 Product Core 无客户态业务页审阅页

完成：修正 Product Core 系统在委外订单、业务看板等多个业务页反复显示“产品核心评审不读取客户业务数据”提示的问题。保留 `shouldGuardCustomerBusinessPageRuntime` 阻止无客户态挂载真实业务 `Outlet` 的数据边界，但把重复 Alert 空态替换为 `ProductCoreCapabilityReview`：按当前页面读取 `businessModules` 的模块定义，展示模块说明、数据真源、当前审阅范围和边界说明；`business-dashboard` 和 `exception-flow` 使用本地 fallback 定义。同步更新暗色主题、正式前端客户配置边界测试、`style:l1` 场景、`web/README.md` 和 `docs/当前真源与交接顺序.md`，并增加静态断言防止旧提示文案回到 `ERPLayout`。

下一步：如后续需要 Product Core 专门的能力矩阵总览，可新建只读产品能力页；不要把客户业务页改成读取客户表或真实业务事实来伪装产品核心数据。

阻塞/风险：本轮只改前端页面语义和样式，不新增后端 API、不改 schema / migration / RBAC、不改 Workflow / Fact usecase、不执行真实客户导入，也不改变带 customer key 的客户运行态业务页读取路径。已通过 `node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/components/ERPLayout.jsx scripts/style-l1/scenarios.mjs src/erp/config/businessModules.mjs src/erp/config/seedData.test.mjs src/erp/utils/adminProfileSync.mjs src/erp/utils/adminProfileSync.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5242 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core-no-customer-business-dashboard,erp-effective-session-super-admin-product-core /usr/local/bin/pnpm --dir web style:l1`。首次 L1 断言误写为通用数据真源文案，已改为业务看板真实 fallback `business.dashboard_stats` 后通过；Node 仍有 typeless package warning。

## 2026-07-09 第二轮提交推送全量验证收口

完成：继续按 full-worktree closeout 复跑提交前验证。`qa:full` 首次在 `server/internal/service` 暴露服务测试夹具仍写死旧 `yoyoosun` 默认客户 key；已将服务层客户配置测试中的默认客户 key / scope value 对齐到 `biz.DefaultCustomerKey`，避免后端默认客户从 `yoyoosun` 切到 `demo` 后，省略 `customer_key` 的业务 API 测试找不到 active revision。

下一步：提交并推送当前全工作区改动，推送前继续确认远端未领先；如 pre-commit / pre-push 产生格式化或守卫问题，按 hook 反馈继续收口。

阻塞/风险：本轮服务测试修正只改测试夹具，不改变 schema、migration、RBAC、Workflow / Fact、客户配置 usecase 或 JSON-RPC 运行时语义。已通过 `go test ./internal/service` 和 `bash scripts/qa/full.sh`；`qa:full` 最终显示 `[qa:full] 全部通过`。当前 Node 版本高于仓库 engine、`ProcessingContractPrintWorkspacePage.jsx` 仍有既有 React Hook dependency warning，不影响本轮 full QA 结果。

## 2026-07-09 Product Core 控制面导航拆分

完成：按 docs/reference 第四次的 Product Core / 客户运行态边界，把 super admin 无客户运行态侧栏从完整业务导航拆为 Product Core 控制面导航，只保留工作台、模板打印中心、权限管理和审计日志；带有 `yoyoosun` 等 customer key 的 super admin 仍使用完整产品导航进入客户运行态业务页。`ERPLayout` 同时保留完整产品导航作为当前 URL 识别真源，直访 `/erp/business-dashboard` 等业务 URL 仍能解析 page key 并进入 `ProductCoreCapabilityReview`，不会因为侧栏隐藏业务菜单而绕过客户业务页 guard。同步更新 `web/README.md`、`docs/当前真源与交接顺序.md`、`seedData` 单元测试、正式前端客户配置边界测试和 `style:l1` 浏览器断言。

下一步：如要把第四次参考里的客户配置包导入控制台升级为正式 Product Core 页面，需要单独做 `/erp/product-core/customer-config` 或等价控制面路由评审，不能复用客户业务表单页。

阻塞/风险：本轮不新增后端 API、不改 schema / migration / RBAC、不改 Workflow / Fact usecase、不执行真实客户导入，也不改变带 customer key 的客户运行态业务页读取路径。已通过 `node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/config/seedData.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/components/ERPLayout.jsx src/erp/config/seedData.mjs src/erp/config/seedData.test.mjs scripts/style-l1/scenarios.mjs`、`node --check scripts/qa/formal-frontend-customer-config-boundary.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_PORT=5243 STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core-no-customer-business-dashboard,erp-effective-session-super-admin-product-core /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`。Node 仍有 engine / typeless package warning，不影响本轮验证结果。

## 2026-07-09 加工合同与采购合同带值字段补齐

完成：按永绅真源文件 `模板-材料与加工合同.xlsx` 核对采购合同 `C类辅料合同` 和加工合同 `B类加工合同` 的甲方 / 委托方字段，将 `customerPackage.mjs` 中 `material-purchase-contract`、`processing-contract` 的联系人、电话、地址和签名人从占位值补为真源值；同时为永绅 trial supplier fixture 补齐供应商 / 加工方地址，保证业务页跳转到采购合同、加工合同打印草稿时，甲方字段来自客户配置，乙方 / 加工方字段仍来自业务快照。补充 mapper、打印草稿完整性、runtime manifest 和客户闭环 QA 测试，防止 `待维护` 等占位值继续进入打印默认字段。

下一步：如果要让目标环境立即生效，需要通过受控 `customer_config.validate_customer_config / publish_customer_config / activate_customer_config` 发布并激活新的永绅客户配置；如需截图或 PDF 证据，再在目标运行态打开采购订单和委外订单打印入口做浏览器 / PDF 回归。

阻塞/风险：本轮不改 Product Core 通用默认样例、不覆盖供应商 / 加工方业务快照、不改 schema / migration / RBAC / Workflow / Fact usecase，也不执行真实客户数据导入或发布激活；现有 active revision 若尚未重新发布，运行环境仍可能继续使用旧配置。

## 2026-07-09 加工合同与采购合同缺值二次收口

完成：继续定位业务页跳转打印仍出现 `未配置 / 未维护 / 未关联` 的链路。采购合同日期 formatter 现在兼容字符串日期快照，永绅 trial 采购 / 委外 fixture 补齐下单日期并按合同源文件日期口径收口；委外订单打开加工合同时会像采购订单一样，在打印前用当前加工厂主数据和联系人列表补齐旧单缺失的 `supplier_snapshot` 空字段，但不覆盖已有业务快照。新增永绅采购合同 / 加工合同完整草稿扫描测试，直接从 trial 业务来源生成打印草稿并断言不输出 `未配置 / 未维护 / 未关联` 占位。

下一步：如果当前浏览器仍看到历史 `SIM-SELECT-COL-*` 或 `SIM-YOYOOSUN-BULK-*` 旧草稿，需要清掉对应打印窗口 localStorage / 重新从业务页打开，或重建本地模拟业务单；这些历史草稿不是 tracked fixture 真源。

阻塞/风险：本轮不从材料主数据伪造产品订单编号 / 产品编号 / 产品名称，不改 schema / migration / RBAC / Workflow / Fact，不执行真实客户数据导入，也不发布激活客户配置；旧数据库中已经保存且没有产品快照的采购明细，除非重新编辑补齐或重建模拟数据，仍会按缺值保护显示占位。

## 2026-07-09 采购合同与加工合同本地运行态打印收口

完成：把永绅客户配置包升级到 `yoyoosun-customer-package-v3`，为采购角色补入 `material.read`，使采购合同打印入口能读取材料 / 单位上下文；本地通过 `customer_config.validate_customer_config`、`publish_customer_config`、`activate_customer_config` 激活 v3，并确认当前登录态拿到 `material.read`。修复旧 `SIM-SELECT-COL-20260619T160406Z-OUT` 委外订单供应商快照和产品订单快照，新增本地采购合同验证单 `SIM-CODEX-PRINT-PO-20260709`。采购订单打印入口改为点击打印前按需刷新材料和单位主数据，避免基础资料异步未完成时生成 `未维护规格 / 未维护单位`；加工合同打印草稿改为优先使用供应商快照全称，短名仅作缺失兜底。浏览器在 `http://127.0.0.1:5177` 用 `demo_purchase` 从采购订单和委外订单业务页实际点击打印，采购合同与加工合同打印页 DOM 断言均无 `未配置 / 未维护 / 未关联`，并确认采购规格 / 单位、加工方联系人 / 电话 / 地址、委托方字段和产品订单号均带出。

下一步：若要让目标环境生效，仍需按正式发布流程在目标环境执行客户配置发布 / 激活和 smoke；本轮只完成本地运行态闭环。

阻塞/风险：本轮重置了本地 demo 账号密码用于浏览器验证，不涉及生产账号；未提交 / 未推送，未执行真实客户数据导入，不改 schema / migration / Workflow / Fact usecase。已通过 `node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/run-smoke-script.test.mjs`、`node --test scripts/qa/yoyoosun-customer-closure.test.mjs scripts/qa/trial-simulated-data.test.mjs`、`cd web && node --test src/erp/utils/masterDataOrderView.test.mjs src/erp/data/processingContractTemplate.test.mjs src/erp/utils/contractPrintDraftCompleteness.test.mjs src/erp/utils/referenceSelectOptions.test.mjs`、`cd web && node --test src/erp/utils/moduleTableColumns.test.mjs src/erp/utils/userVisibleTechnicalFields.test.mjs`、`cd web && pnpm build`、`node --check web/src/erp/components/purchase-orders/usePurchaseOrderContractPrint.mjs && node --check web/src/erp/data/processingContractTemplate.mjs` 和 `git diff --check`；`pnpm build` 仅提示当前 Node v26.5.0 高于仓库 engine `24.14.x`。

## 2026-07-09 采购合同与加工合同固定字段源表收口

完成：继续按永绅源文件 `模板-材料与加工合同.xlsx` 复核 `C类辅料合同` 和 `B类加工合同`，把“固定合同字段”和“业务页动态字段”重新分开。客户包升级为 `yoyoosun-customer-package-v4`，采购合同和加工合同的甲方 / 委托方显示名按源表固定为 `永绅`，联系人、电话、地址、签名人仍由 yoyoosun 客户配置投影；供应商 / 加工方、明细行、数量金额、产品追溯继续来自采购订单 / 委外订单业务快照。采购合同、加工合同和打印中心采购合同样例的固定合同条款已恢复为源表文本，补充测试锁住这些条款不再被摘要版覆盖。本地通过 `customer_config.validate_customer_config / publish_customer_config / activate_customer_config` 激活 v4，并读回 active effective session 的两个合同模板默认值；浏览器在 `http://127.0.0.1:5177` 使用 `demo_purchase` 从采购订单 `SIM-CODEX-PRINT-PO-20260709` 和委外订单 `SIM-SELECT-COL-20260619T160406Z-OUT` 实际点击打印，两个打印工作台均显示 `永绅`、源表固定条款，且 DOM 中无 `未配置 / 未维护 / 未关联`。

下一步：如果目标环境也要同步，需要按正式 release evidence 流程发布 / 激活 `yoyoosun-customer-package-v4.runtime-manifest-v1` 并跑目标环境 customer-config smoke；本轮只完成本地运行态验证。

阻塞/风险：本轮不改 Product Core 中性买方样例、不把永绅客户抬头写入通用核心、不覆盖供应商 / 加工方业务快照，不改 schema / migration / RBAC / Workflow / Fact usecase，也不执行真实客户导入。已通过 `node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customer-config-runtime-manifest/yoyoosun-v4-runtime-manifest.json`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs`、`node --test web/src/erp/utils/materialPurchaseContractEditor.test.mjs web/src/erp/data/processingContractTemplate.test.mjs web/src/erp/utils/contractPrintDraftCompleteness.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs web/src/erp/config/printTemplates.test.mjs`、`node --test scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/run-smoke-script.test.mjs scripts/deploy/release-evidence-status.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs` 和业务页 Playwright 跳转打印回归。

## 2026-07-09 合同打印变量字段覆盖审计

完成：按“每个纸面变量都要能追到业务页、主数据、客户配置或模板固定值”的口径复查采购合同和加工合同。采购合同业务草稿现在把 `signDateText` 从采购单 `purchase_date` 带出；加工合同业务草稿把 `buyerSignDateText` 从委外单 `order_date` 带出，避免甲方签字日期变量空着。永绅 trial 采购 / 委外明细补齐 `note`，让合同明细 `备注` 也有测试数据值。`yoyoosun-customer-closure.test.mjs` 新增字段覆盖矩阵：逐项声明采购合同头、采购明细、加工合同头、加工明细各字段来自采购订单页 / 委外订单页 / 主数据快照 / 客户配置，并对所有 trial 采购单和委外单逐单逐行生成打印草稿断言非空；同时静态检查采购订单表单、委外订单表单和操作区确实保留这些业务字段和打印入口。

下一步：若目标环境要使用同一套新增 fixture / 字段断言，需要在正式发布流程里同步构建和客户配置 smoke；本轮只完成本地代码、fixture 和运行态打印验证。

阻塞/风险：乙方 / 供应商签名和乙方日期仍按纸质回签留白处理，不从业务页伪造；本轮不新增 schema / migration / RBAC / Workflow / Fact，不把客户字段写入 Product Core。已通过 `node --test scripts/qa/yoyoosun-customer-closure.test.mjs`、`node --test web/src/erp/utils/masterDataOrderView.test.mjs web/src/erp/data/processingContractTemplate.test.mjs web/src/erp/utils/materialPurchaseContractEditor.test.mjs web/src/erp/utils/contractPrintDraftCompleteness.test.mjs`、`node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs web/src/erp/config/printTemplates.test.mjs`、`PATH=/usr/local/bin:$PATH pnpm --dir web build`、业务页 Playwright 跳转打印回归和 `git diff --check`。Node 仍有 typeless package warning，不影响本轮结果。

## 2026-07-09 合同方变量字段源单化收口

完成：继续按“采购合同 / 加工合同几乎所有字段都应来自源单变量”的口径复查并修正。新增 `purchase_orders.contract_party_snapshot` 与 `outsourcing_orders.contract_party_snapshot`，后端 biz / repo / JSON-RPC 均读写该源单合同方快照；采购订单、委外订单表单新增合同订购方 / 委托方字段（单位、联系人、电话、地址、签字人），新建 / 编辑时客户配置仅作为初始建议值，保存后打印优先读取源单快照。采购合同和加工合同业务草稿改为源单快照覆盖客户默认值，永绅 trial 采购 / 委外 fixture 也补齐每张源单的合同方测试数据，QA 矩阵改为指向采购订单页 / 委外订单页的 `contract_party_snapshot.*`。

下一步：如要让已有本地或目标环境历史单据完全改用新字段，需要执行迁移后重新编辑保存历史采购 / 委外订单，或按受控脚本补齐历史源单 `contract_party_snapshot`；客户配置仍只适合作为新建默认建议和旧数据兼容兜底。

阻塞/风险：本轮新增 schema / migration，已对本地 dev DB 执行 `make migrate_apply` 并复核 `migrate_status` 为 OK；也已重建 `./bin/server-dev`，当前 `server-dev` PID 99350 在 `8300/9300` 监听，`/healthz` 和 `/readyz` 通过。仍未写历史数据回填脚本；已有历史采购 / 委外单如果未重新保存，可能继续依赖客户默认兜底。浏览器验证使用 5177 + 项目 mock effective session 验证采购 / 委外表单新增字段真实可见，截图在 ignored 的 `web/output/playwright/contract-party-fields/`。已通过 `make data`、`make migrate_apply`、`env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy make migrate_status`、`go test ./internal/service -run 'PurchaseOrder|OutsourcingOrder'`、`go test ./internal/biz ./internal/data -run 'PurchaseOrder|OutsourcingOrder'`、`node --test web/src/erp/utils/masterDataOrderView.test.mjs web/src/erp/data/processingContractTemplate.test.mjs scripts/qa/yoyoosun-customer-closure.test.mjs`、`node --test scripts/qa/customer-config-runtime-manifest.test.mjs web/src/erp/config/printTemplates.test.mjs web/src/erp/utils/contractPrintDraftCompleteness.test.mjs web/src/erp/utils/materialPurchaseContractEditor.test.mjs`、`corepack pnpm --dir web build`、`git diff --check`、dev DB 新列只读查询、`curl /healthz` / `curl /readyz` 和一次性 Playwright DOM 字段可见性验证。`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,processing-contract-form-modal-title-desktop corepack pnpm --dir web style:l1` 仍在采购场景前置“下单日期”处失败，未跑到新增字段断言；需单独修复当前 L1 入口 / 客户运行态前置漂移后再恢复该长期浏览器场景。

## 2026-07-09 弹窗非明细备注整行布局

完成：按页面治理口径把业务弹窗里非 item 明细行的普通备注收口为整行展示。销售订单的 `报价备注`、采购订单单据备注、委外订单单据备注、来料质检创建 / 判定备注、采购订单生成入库草稿备注都补齐 `erp-business-action-form__field--full`；明细 item 内的备注继续保留 `erp-line-item-field--note` 明细行布局，不拉成单据级整行。新增静态测试 `businessModalRemarkLayout.test.mjs`，并在 `business-formal-module-shells-desktop` L1 场景中加入非 item 备注盒模型断言。

下一步：待当前业务 formal L1 的入口 / 权限投影前置恢复后，重新跑 `STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`，让新增浏览器断言覆盖真实业务页弹窗。

阻塞/风险：本轮不改字段保存、schema、migration、RBAC、Workflow / Fact、客户配置或 item 明细语义。已通过 `node --test src/erp/utils/businessModalRemarkLayout.test.mjs`、`pnpm lint`、`pnpm css` 和独立 Playwright 盒模型探针；`node --test src/erp/utils/businessModalRemarkLayout.test.mjs src/erp/utils/userVisibleTechnicalFields.test.mjs src/erp/utils/masterDataOrderView.test.mjs` 中新增备注测试和 masterData 测试通过，但被既有 `DashboardPage.jsx: 生命周期` 可见术语断言拦截；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 未跑到本轮断言，当前卡在场景开头 `新建供应商` 按钮不可见。当前 Node 为 v26.5.0，高于仓库 engine `24.14.x`，命令均有 engine warning。

## 2026-07-10 第三轮提交推送全量验证收口

完成：继续按 full-worktree closeout 收口当前大批改动。`qa:full` 首轮暴露 `devCustomerConfig` 测试仍期望 4 个合同默认方字段，已同步为当前 `partyDefaults` 的 5 字段口径。第二轮 `web test` 暴露新增 `FL_*` 用例未登记字段链路目录、以及 Product Core 审阅卡片出现用户可见架构词“生命周期”；已补登记采购 / 加工合同打印日期、源单合同方快照、加工方名称 fallback 的 FL case，并将看板文案改为“业务状态、权限、动作和字段边界”。第三轮 `bash scripts/qa/full.sh` 已完整通过。

下一步：提交并推送当前全工作区改动；推送前继续确认远端未领先，推送后以 `origin/main...HEAD = 0 0` 收口。

阻塞/风险：本次 closeout 修正的是测试目录、测试断言和用户可见文案，不改变 schema / migration / RBAC / Workflow / Fact usecase 的运行时语义。`qa:full` 仍保留当前 Node v26.5.0 高于仓库 engine `24.14.x` 的 warning，以及既有 `ProcessingContractPrintWorkspacePage.jsx` React Hook dependency warning；均未阻断全量验证。

## 2026-07-10 岗位任务端客户运行态隔离

完成：按 Product Core / 永绅客户运行态边界复核岗位任务端。新增 `canMountCustomerRuntime`，`MobileAppLayout` 在进入 `/m/<role>/tasks` 前按当前静态客户配置 key 拉取 `customer_config.get_effective_session`，只有 effective session 带 customer key 时才渲染岗位任务页；无客户 key、Product Core 中性入口或 sync-failed 空投影时显示客户运行环境拦截页，不挂载客户 Workflow 数据。`MobileRoleTasksPage` 在调用 `listWorkflowTasks` 前再次检查客户运行态，不满足时清空任务并短路。二次 review 后将移动端拦截页文案从 `Product Core / customer key / Workflow` 改成岗位用户可读的客户运行环境说明。同步补充 `formal-frontend-customer-config-boundary` 静态门禁、auth storage 拒绝读取时的登录态韧性、移动端 smoke 的 yoyoosun effective session mock，以及 `web/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/自动化测试策略.md` 口径。

下一步：如需验证所有岗位角色的移动端真实浏览器链路，可在当前本机代理 / loopback 环境稳定后去掉 `MOBILE_AUTH_SMOKE_ROLE_KEY='boss'` 跑完整 `smoke:mobile-auth-login-route`；目标环境仍需真实账号、active customer config revision 和目标 smoke 单独证明。

阻塞/风险：本轮不改后端 schema / migration / RBAC / Workflow / Fact usecase，不导入或创建真实客户任务数据。已通过相关单测、lint、css 和 boss 岗位浏览器 smoke；浏览器 smoke 在本机 Vite 监听 `[::1]` 时需用 `MOBILE_AUTH_SMOKE_BASE_URL='http://[::1]:4193'` 复用已启动入口，直接走 `127.0.0.1` 会被当前代理 / 地址解析环境干扰。

## 2026-07-10 永绅工程资料打印字段链路切片

完成：按永绅 Excel 源表和 `docs/reference/第四次20260627` 的业务 / 流程 / 状态边界，先收口非合同打印模板中的 BOM 工程资料切片。BOM 版本新增并贯通 `来源订单号 / 订单数量 / 备品 / 制表日期 / 设计师 / 制表 / 审核 / 毛向`，BOM 明细新增并贯通 `片数 / 总用量含损耗 / 加工底料 / 加工方式`；后端 Ent schema、Atlas migration、biz/repo、JSON-RPC、前端 BOM 表单 / 明细 / 列表导出和三套工程打印模板 mapper 已同步。永绅 trial fixture 补齐材料类别、厂商料号、颜色和每行加工底料 / 加工方式测试值，`yoyoosun-customer-closure` 增加工程打印字段覆盖矩阵和业务页字段存在断言。Review 后修正了 `process_base` fixture 覆盖缺口，并把 `web/README.md` 中只提合同模板的过期口径改为合同和工程资料模板。

下一步：继续按源表分批审计其它永绅表格字段、业务页表单 / 弹窗、单据状态、通知 / 审计 / 流程编排和字典状态树；每批都应先确认字段真源和业务边界，再决定是否进入 Product Core、客户配置、fixture、打印模板或 deferred 评审。

阻塞/风险：本轮只完成 BOM 工程资料到 `物料分析明细表 / 色卡 / 作业指导书` 的可验证切片，不把 Excel 里的加工厂银行信息、财务信息、库存 / 出货 / 质检 / 通知 / 审计事实写入运行时，也不执行真实客户导入或目标环境发布。新增 schema / migration 尚未在本轮 apply 到本地 dev DB；当前验证覆盖本地代码生成、Go unit / service 测试、Node 字段链路测试和文档静态检查，不替代目标环境 migration、浏览器 PDF 版式回归或 release evidence。

## 2026-07-10 Product Core / 永绅全链审查与实现收口

完成：以当前代码、`docs/reference/第四次20260627`、永绅 PDF/Excel 和客户新增合同/仓库线索为输入，重新审查前后端、领域边界、角色/RBAC、模块组合、流程编排、字段残值/缺值、模拟数据、导入、打印、部署和文档。Product Core 与永绅客户包改为显式运行时投影：页面取 RBAC/模块/角色页面交集，动作以 `access_entitlements` 为唯一客户配置加法真源并受后端 RBAC 上限、模块状态和角色 revoke 收窄；窄联查权限不再误开独立菜单，多角色账号先逐角色计算再取并集。已从 Ent、Atlas migration、repo 和 RPC 输入物理删除失效 `role_profiles.grants`，不保留新系统兼容列。

完成：业务与协同主路收口。销售/采购 Source Document 只保留表头+明细聚合事务保存，提交后只读；公开 Workflow API 不再允许客户端写流程锚点或任意业务状态。Process Runtime 只支持人工任务、审批、白名单领域命令、等待事件和结束节点，Workflow done 不冒充 Fact posted。来料链路实现采购单数量约束、并发入库防超收、HOLD 批次、多行 IQC 聚合放行/拒收/让步接收和库存过账；采购调整新增明细与过账并发锁。加工合同统一承接车缝、手工和布料加工，每行产品/材料二选一并清除切换残值；永绅主料仓、成品仓、其他仓作为仓库主数据，财务下采购合同通过 `finance + purchase` 多角色表达，不污染通用财务角色。

完成：文档和页面降噪。删除旧业务记录系列文档/实现、过大的一次性多客户审计脚本、formal-shell 假页和真实导入执行器，历史架构评审移入 archive；活跃文档收口为真源索引、角色流程专文、流程地图、能力台账和测试策略。前端用户可见文案不显示 Workflow/Fact/raw key/底层错误；无权移动端动作使用明确只读说明和中性禁用态。Node 包改为明确 ESM，清理 typeless package warning；`lint` 不再自动修改代码，另保留 `lint:fix`。

下一步：如果要进入真实客户验收，必须准备经客户确认的真实数据和目标环境授权，然后按客户配置 validate/publish/activate、导入 dry-run/批次 usecase、backup/restore、migration、目标 smoke 和签收 evidence 执行；不得把本地模拟 fixture 写成客户真实导入。

阻塞/风险：本轮没有真实客户数据、目标环境发布权限或客户签收，因此只声明本地产品核心/永绅模拟闭环可验证，不声明 release-ready 或客户可交付。已通过 `bash scripts/qa/full.sh`、`bash scripts/qa/strict.sh`（含 secrets、shellcheck、shfmt、govulncheck）、Atlas migration validate、真实 PostgreSQL migration/关键并发事务、前端 652 项测试与 production build、五岗位移动端/只读态/BOM 宽表/业务表单/加工合同浏览器回归。未提交、未推送。

## 2026-07-10 133 多场景模拟数据与短信登录准备

完成：盘点 133 测试库后确认采购单、采购入库和质检为空，销售、出货、财务与 Workflow 也只有少量终态；新增 `purchase-quality-simulated-matrix.mjs`，通过正式 JSON-RPC 和岗位账号生成带 `SIM-YOYOOSUN-PQ` 前缀的采购单五生命周期、采购入库 / 质检五场景，并接入手动回归计划和测试数据隔离门禁。133 已写入 `SIM-PLUSH-CORE` 中性单位、材料、产品、仓库、工序和 BOM，并重置 10 个岗位演示账号。修正客户配置编译器把未确认空电话 / 签字人发布到合同默认值的问题，空值现在不发布；yoyoosun 包升级到 v5，并补回销售客户 / 联系人维护、采购联系人维护的既有 Product Core 权限投影。发现 Kratos transport logging 会序列化原始 JSON-RPC params，已改为只记录 domain / method / id、结果码和耗时，并立即轮换已进入旧日志的演示密码。

下一步：完成本地全量 QA、提交推送并部署带安全日志修复的新 server 镜像；部署后再次轮换演示密码，发布 / 激活 yoyoosun v5，再执行销售、采购 / 质检、生产 / 库存 / 出货 / 财务和岗位任务模拟数据 apply，最后做 133 API、数据库和浏览器回归。短信 provider 仍需目标 `.env` 注入阿里云 PNVS AccessKey ID / Secret、签名和模板号后才能开启并做真实验证码 smoke。

阻塞/风险：133 当前四项阿里云 PNVS 必填配置均为空，不能用生产禁止的 mock 冒充短信登录；在供应商 secret 到位前只能保留 `disabled`，否则生产启动门禁会拒绝启动。当前 yoyoosun v4 已临时激活用于验证配置链路，但 v5 尚未发布；新演示密码在安全日志修复部署前不再用于登录，避免再次进入旧 transport 日志。模拟数据不是真实客户导入，不声明甲方真实出货、库存、质检或财务事实。

## 2026-07-10 GPT 全链审查复核与高优先级事实链加固

完成：按仓库当前真源复核外部 GPT 审查，确认其 Product Core / 客户运行态、Workflow / Fact、发布 `NO-GO` 大方向合理，但 ZIP 的 177 项、断链数量和缺工具链结论不能替代当前仓库证据。以 `docs/reference/第四次20260627` 为优先参考、第三次为次级 Reference Only，新增《ERP 客户差异实现边界规范》已登记到文档清单，并在第四次 README 明确降权 `tenant_id / yongshen / 任意客户代码 / Fact 分类 / 目录重构` 等冲突示例。正式文档、根 / server / web README、客户差异台账、交付矩阵、能力台账、流程运行时台账和当前真源已同步治理；过期的“仅三个 V1 页面 / 通用 business_records 已落盘”口径已删除。客户原始资料和归档通过 `.dockerignore / .gitattributes` 退出 Docker build context 与源码发布包；非 demo 客户缺 active revision 时普通账号和 super admin 业务动作均 fail closed。

完成：关闭库存预留、出货、幂等与 ProcessRuntime 的高优先级问题。预留按统一库存键加锁，出货校验销售订单 / 客户 / 产品 / SKU / 单位 / 累计数量，禁止出货确认后追加明细，出货事务原子消费本单预留并守住跨 grain 剩余预留；库存、生产、委外、财务、采购入库和预留均持久 exact-intent 与调用方时间 marker，同 key 同 payload 返回原结果，不同 payload 明确 `40920` 冲突。ProcessRuntime 先做只读 preflight，再以条件 `UPDATE ... RETURNING` 绑定不可变 SHA-256 fingerprint；claim 期间同意图已结算时不重复执行 handler，并发终态、linked refs CAS、return-to attempt 创建重放、质检纳秒到 PostgreSQL 微秒重放和升级前 active 空 fingerprint sentinel 均已补测试 / migration。流程 payload 删除 caller 自报客户、质检员、due date 等非真源字段，财务客户取已出货 shipment，成品质检员取认证 actor。领域事实随后被取消 / 冲正或流程外继续推进时不放宽状态伪造成功，当前明确 fail closed 并进入补偿 / 人工对账恢复。

完成：客户前端与多角色协同同步加固。六类正式列表统一 latest-request coordinator，旧请求 / abort 不再覆盖新筛选结果；岗位任务端按 task + action 加锁，快速双击只提交一次，不同任务互不串状态。`/__dev` 导航、测试策略解析、客户配置包预检 / 发布控制台、文档查看器和移动端 / 桌面布局已补搜索、真源标签、门禁说明、响应式盒模型与长内容回归；出货放行只读账号只显示禁用动作且不发写请求。已通过前端 lint、666/666 单测、production build（3233 modules）、92/92 `style:l1` 场景并人工查看最新 dev、客户配置、移动端任务、采购协同和出货放行截图；最终 `bash scripts/qa/full.sh` 全部通过，`govulncheck` 显示本代码可达漏洞 0。后端 `go test -count=1 ./...`、7 项真实 PostgreSQL 并发 / 幂等门禁、Atlas validate 均通过；两个本地隔离库都已到 migration `20260710150000`、pending 0。

下一步：真实客户验收前仍需在受控目标环境执行 migration、构建产物发布、客户配置 validate / publish / activate、备份恢复检查、真实账号 smoke 和签收 evidence。若业务要求颜色 / 尺寸维度的可用库存与扣减，应另立 SKU 库存 grain 设计任务，把当前订单到 shipment / reservation 的 SKU 追溯继续贯通到 `inventory_txns / inventory_balances`，不能把本轮产品级库存证据写成 SKU 级闭环。

阻塞/风险：本轮未发布目标环境、未执行真实客户数据导入、未获得客户签收；目标环境仍可能运行旧 schema / 镜像 / active revision。ProcessRuntime 对“领域副作用已提交后又被取消 / 冲正、节点仍 active”的全自动恢复尚无持久 command result / outbox，当前按 fail-closed + 补偿 / 人工对账治理。Codex in-app browser 本轮不可用，浏览器证据来自项目自身 Playwright `style:l1` 与截图人工复核；不把它写成真实登录或目标环境验证。当前库存事实仍是产品 grain，SKU 只贯通到销售订单、出货和预留追溯。

## 2026-07-10 133 永绅桌面刷新客户运行态首屏修复

完成：实测 133 当前 `plush-toy-erp-web:yoyoosun-20260710-4f035164-amd64` 静态包已注入 `customerKey: "yoyoosun"`，服务健康；根因是登录缓存只保存管理员 RBAC 元数据、不保存 `effective_session`，桌面壳在异步 `customer_config.get_effective_session` 返回前将超级管理员误投影为无客户 Product Core。桌面入口现对带静态客户 key 的构建先显示客户工作台加载态，只有 effective session 的 customer key 与静态客户入口一致才挂载页面；同步失败或错配时显示可重试 / 退出的客户运行环境拦截页，不再短暂显示 Product Core 审阅页面。已补静态客户入口匹配测试和桌面启动合同测试。

下一步：获得提交 / 推送确认后，按低配服务器发布流程构建永绅前端镜像、上传到 133、仅重建 `web-desktop`，并使用真实已登录会话做刷新前后浏览器回归，确认首屏只出现客户加载态后进入永绅页面。

阻塞/风险：当前 133 仍运行修复前的 `4f035164` 前端镜像；本轮尚未提交、推送或部署。Codex in-app browser 没有已登录标签，不能在不读取或发送账号凭据的前提下复现真实管理员刷新态；发布后需由现有登录会话或受控真实账号补最终在线验证。

## 2026-07-10 BOM 明细弹窗行卡片溢出修复

完成：定位到 BOM 页私有 CSS 把共享明细行从 `width: max-content; min-width: 100%` 覆盖成 `width/max-width: 100%`，而字段网格仍按内容宽度横向展开且 `overflow: visible`，导致备注等右侧字段穿出行卡片。已删除这条冲突覆盖，让 BOM 回到 `BusinessLineItemsSection` 的统一横向滚动合同；浏览器回归同步改为要求行卡片完整包住字段网格、列表独占横向滚动，并新增滚到最右侧后的备注 / 行边框可见性断言和截图。后续复查又在 `businessLineItems.test.mjs` 增加共享 CSS ownership 门禁：列表 / 行 / 网格的横向尺寸与 overflow 只能由共享基线规则定义，任何页面私有选择器再次覆盖都会在 `pnpm test` 和 pre-push `qa:full` 失败；模拟本次错误覆盖的反例测试也已验证门禁确实能抓住问题。

下一步：本轮无需继续改 JSX、字段宽度或组件封装；后续若确需改变共享明细横向合同，应先统一修改共享基线和静态合同，再更新列表滚动、行内无 overflow、左右边界截图三项浏览器回归，不能从业务页加覆盖。目标环境只有在包含本次前端改动的版本发布后才会生效。

阻塞/风险：本轮不改字段语义、保存逻辑、schema、migration、RBAC、Workflow / Fact、客户配置或原型结构；现有业务弹窗标准原型仍准确，因此未修改原型。已在 Node 24.14.0 / pnpm 10.13.1 下通过 `STYLE_L1_PORT=4253 STYLE_L1_SCENARIOS=business-core-pages-desktop pnpm style:l1`、`pnpm lint`、`pnpm css`、`node --test src/erp/utils/businessLineItems.test.mjs`（8/8）、脚本语法与 Prettier 检查；截图位于 ignored 的 `web/output/playwright/style-l1/business-v1-bom-wide-line-scroll.png` 和 `business-v1-bom-wide-line-scroll-right-edge.png`。内置浏览器只确认本机 Product Core 页面可打开，永绅 dev 入口无可复用登录态，因此未把它声明为真实登录或目标环境验证。

## 2026-07-10 出货来源切换与 SKU 粒度表单收口

完成：出货新建弹窗切换 / 清空销售订单时同步替换客户快照并清空旧明细；手工选择 / 清空销售订单行时统一带回或清除产品、SKU、单位、仓库、批次、默认数量和来源备注。来源行存在时产品、SKU、单位保持只读，手工产品切换会清除旧来源、SKU 和批次，SKU 切换会清除不兼容批次；SKU 选项按当前产品过滤，批次只展示同产品、同 SKU grain 的 ACTIVE 批次。同步删除“剩余量强校验待补”的过期客户可见文案，并修正 ProductSKU schema 注释和 current SKU 管理原型的旧口径。

下一步：主线程继续执行全量 QA 和最终差异收口；目标环境仍需随正式版本发布后再做真实出货来源切换与确认出货回归。

阻塞/风险：本轮不改变后端出货、库存或 SKU 真源，只收口前端带值 / 清值和可选范围；后端仍负责最终来源、数量、SKU、批次和库存校验。已通过 `businessLineItems`、用户可见字段和 current prototype 定向测试（73/73）、相关 Go data 测试、目标 ESLint、production build（3233 modules）及 `git diff --check`；全量 style / QA 由主线程继续执行。

## 2026-07-10 SKU 库存与 ProcessRuntime 持久结果最终收口

完成：本条替代上方“库存仍是产品 grain、ProcessRuntime 尚无持久 command result”的旧边界。显式 `product_sku_id` 已贯通销售订单、库存批次 / 流水 / 余额、生产 / 委外事实、出货和预留，并以产品 + 可选 SKU + 仓库 + 单位 + 可选批次作为 exact inventory grain；`NULL` 只表示独立未分规格库存，不自动回填、不跨池兜底。ProcessRuntime protocol v1 的六个写命令会在领域事务内原子写业务副作用与 durable result / effect ref，两个只读 gate 会锁定来源并写 `effect_state=none`；重试先读持久结果，不重复 Validate / handler。销售取消、采购入库取消冲正、出货取消冲正和财务取消会记录 compensation，认证 JSON-RPC 主路径同时记录操作人；active 节点阻塞，已完成节点补偿后重放返回 `40921` 且不再推进。出货弹窗也已按销售订单 / 来源行 / 产品 / SKU / 批次依赖统一带值、清值和过滤，恢复“销售订单行追溯”可见合同。

完成：补齐真实 PostgreSQL 防回归。result conflict 会让 `shipment.ship` 的 SKU OUT、余额、流水和预留消费全部回滚，让 `finished_goods_quality.decide` 的质检与批次状态回滚，让 `inventory.post_inbound` 的收货状态、IN 流水与余额回滚；Finance / Sales exact recovery、payload conflict、legacy fail closed、completed-node compensation 和并发 claim / linked ref 也保持通过。migration `20260710150001` 已在本地隔离库验证，目标环境尚未应用。

下一步：进入真实客户验收前，在受控目标环境执行 `20260710150001`、发布镜像、客户配置 validate / publish / activate、备份恢复、真实账号 smoke 和签收。BOM SKU 粒度、旧未分规格库存重分类、导入自动建 SKU 继续 deferred；protocol 0、无法精确证明的 legacy result-missing、成品质检缺撤销 usecase，以及补偿前已激活下游的恢复仍需人工决策或后续明确恢复流程。

阻塞/风险：本轮没有目标环境发布、真实客户导入或客户签收，生产交付仍为 `NO-GO`。已在 Node 24.14.0 / pnpm 10.13.1 下通过 `bash scripts/qa/full.sh`（前端 675/675、build 3233 modules、后端全包、隔离 PostgreSQL 关键事务与 Go build）、`STYLE_L1_SCENARIOS=business-core-pages-desktop pnpm style:l1`、Atlas validate、SKU / ProcessRuntime 专项 PostgreSQL 回归、文档索引 288 份和 `git diff --check`。`bash scripts/qa/strict.sh` 在显式跳过本机未安装的可选 `shfmt / govulncheck` 后通过；shellcheck、secrets 和其余严格门禁均执行通过，不把两项跳过写成已验证。

## 2026-07-11 按影响面测试入口治理

完成：新增 `scripts/qa/affected.sh`、`affected.mjs` 和合同测试。默认只读取当前 unstaged、staged、未跟踪文件并输出 T0-T8 计划，`--run` 才执行；支持 staged、Git base、显式文件和 JSON。选择器优先复用同名测试，按前端、后端领域/API、业务事实 PostgreSQL、客户配置/导入、schema 和发布路径升级；未知路径保守进入 `full.sh`。页面 L1、`make data` 和目标环境证据保持 required follow-up，pre-push 仍固定运行 `full.sh`。同步更新测试策略、脚本 README，并把选择器合同测试接入 `fast.sh`。

下一步：日常开发优先使用 `bash scripts/qa/affected.sh --plan/--run`；积累真实耗时后，再评估是否合并 `fast.sh` 中重复 Node 进程和按业务域拆分 L1 巨型场景文件，不在本轮扩大重构。

阻塞/风险：当前工作树包含大量既有前后端、migration、文档和 L1 现场，默认 affected 计划因此正确升级为 T8/full；本轮没有擅自执行全量数据库门禁或完整 L1。已通过选择器 15 项合同测试、脚本实际 `--run`、`fast.sh`、docs inventory、前端 dateRange 定向测试、全前端 lint、shellcheck/shfmt、Node 语法和 `git diff --check`。
