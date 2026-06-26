# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件 | 范围 |
| --- | --- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |
| `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md` | 截至 2026-06-22 项目级 AGENTS skill 维护规则补充前的完整过程流水，包含 dev-only 治理地图、登录页动效、skill metadata 中英化和运营事实筛选合同等记录。 |
| `docs/archive/progress-2026-06-24-before-menu-request-lifecycle.md` | 截至 2026-06-24 菜单请求生命周期修复前的完整过程流水，包含业务附件、清空筛选、工程字段隐藏、产品档案 Tab 统一、Tab 背景修正和刷新真源修复等记录。 |

## 最近活跃事项

- 业务页数据新鲜度主路径：切换菜单、切换主视图 Tab、顶部“刷新当前页”都应重新请求后端；不得用页内业务数据缓存替代真实读取。
- 菜单交互主路径：切换到不同菜单触发目标页面加载；重复点击当前菜单不刷新，避免请求风暴。需要强制重读时使用顶部“刷新当前页”。
- 主数据页请求生命周期：新一轮列表 / 字典 / 引用请求开始时取消上一轮同类请求；取消请求不算网络错误、不弹 toast、不回写旧页面状态。
- 业务用户可见字段继续禁止裸主键、幂等键、内部引用、source ID / source line ID 和 `#数字` 兜底；真实业务对象展示名称、编号、来源单据、状态、数量或“已关联”反馈。
- 后续若恢复生产事实或 Workflow 创建能力，必须从生产任务、来源单据、事实行或后端规则生成，不恢复无来源手填事实入口。

## 2026-06-24 JSON-RPC service 大文件职责拆分

- 完成：按可维护边界继续拆分服务层 JSON-RPC 大文件，覆盖 `workflow`、`debug`、`sales_order`、`purchase_order`、`purchase`、`outsourcing_order` 和 `bom`；拆分方式统一为小 router + 业务责任 handler + shared params/result/error mapper，避免 handler、参数解析、权限分发、结果映射继续挤在一个文件里。
- 完成：`jsonrpc_workflow.go` 拆为 metadata、task、business_state、shared，保留 WorkflowUsecase 规则、任务权限、owner / assignee / status 判断和 Workflow / Fact 边界不变。
- 完成：`jsonrpc_debug.go` 拆为 capabilities、seed、cleanup、clear 和 shared，保留 debug 写入开关、debugRunId 清理边界、业务数据清空权限和日志字段不变。
- 完成：`sales_order`、`purchase_order` 和 `outsourcing_order` 按 Source Document 的文档头 / 整单保存、明细、生命周期、shared mapper 拆分；销售承诺、采购承诺和委外源单仍不写库存、出货、财务或其他 Fact。
- 完成：`purchase` 按采购入库 receipt handler + shared 拆分，保留 `InventoryUsecase` 调用、`business_record_id` 禁止项、入库 / 取消权限和返回字段不变；`bom` 按 BOM version / item / shared 拆分，保留 BOM 只维护工程资料、不生成采购 / 库存 / 成本事实的边界。
- 验证：`gofmt -w server/internal/service/jsonrpc_workflow*.go server/internal/service/jsonrpc_debug*.go server/internal/service/jsonrpc_sales_order*.go server/internal/service/jsonrpc_purchase_order*.go server/internal/service/jsonrpc_purchase*.go server/internal/service/jsonrpc_outsourcing_order*.go server/internal/service/jsonrpc_bom*.go`、`cd server && go test ./internal/service`、`cd server && go test -count=1 ./internal/biz ./internal/data ./internal/service ./internal/server`、`git diff --check` 均通过。
- 下一步：后续如果继续拆 service 层，应先处理剩余职责混杂的测试文件或共享 helper 命名收口，不要继续拆已经低于 300 行且领域单一的 handler 文件。
- 阻塞/风险：当前工作区已有大量并行改动，本轮未回退、格式化或纳入这些无关路径；本轮未跑前端浏览器回归，因为没有改前端运行时、页面结构、菜单、样式或原型资产。

## 2026-06-24 Operational Fact JSON-RPC 入口拆分

- 完成：保留 `/rpc/operational_fact` 和 method 合同不变，将原 `jsonrpc_operational_fact.go` 的大 switch 拆为生产事实、委外事实、出货、库存预留、财务事实和 shared helper 子文件；权限检查、参数解析、错误映射和返回包装仍留在 `service` 同包，真实事实规则继续由 `biz.OperationalFactUsecase` 承接。
- 完成：本轮不改 schema、migration、RBAC 权限码、菜单、前端页面、WorkflowUsecase、Fact usecase、客户配置或原型状态；只降低 operational_fact 入口维护负担。
- 验证：`gofmt -w server/internal/service/jsonrpc_operational_fact*.go`、`cd server && go test ./internal/service`、`cd server && go test -count=1 ./internal/biz ./internal/data ./internal/service ./internal/server`、`git diff --check` 均通过。
- 下一步：后续若继续拆服务层，优先评审 `jsonrpc_workflow.go` 的 handler / params / results 拆分；不要在拆文件时改变 Workflow 业务规则。
- 阻塞/风险：当前工作区已有大量并行改动，本轮未回退、格式化或纳入这些路径；本轮未跑前端浏览器回归，因为没有改前端运行时、页面结构、菜单或样式。

## 2026-06-24 MasterData 页面列定义拆分

- 完成：按页面责任拆出 `web/src/erp/components/master-data/masterDataColumns.jsx`，把主数据列表列定义、状态标签、供应商类型选项和共享排序入口从 `V1MasterDataPage.jsx` 中移出；页面壳继续负责请求、表单、分页、列顺序和动作编排。
- 完成：`V1MasterDataPage.jsx` 从 1713 行降到 1244 行，新列构造文件 390 行；列标题、导出标题、排序、单位 / 产品引用回显和启停标签语义保持不变。
- 验证：`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1MasterDataPage.jsx src/erp/components/master-data/masterDataColumns.jsx src/erp/utils/moduleTableColumns.test.mjs`、`pnpm --dir web css`、`pnpm --dir web exec node --test src/erp/utils/moduleTableColumns.test.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；前端单测 401 个通过，定向 L1 覆盖供应商、客户、产品、材料、库存、质检等正式业务壳层。
- 下一步：继续治理大文件时，优先按页面主职责拆 `V1PurchaseOrdersPage`、`ShipmentsPage` 或共享业务表格容器，不做只转发的空壳层。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、JSON-RPC、RBAC、菜单真源、客户配置、原型资产或部署脚本；没有做全站 `style:l1`，只跑了覆盖本次主数据页面影响面的定向场景。当前工作区存在多组并行改动，本轮未回退、格式化或纳入这些路径。

## 2026-06-24 MasterData JSON-RPC 入口拆分

- 完成：保留 `jsonrpcDispatcher` 和 `masterdata` URL 对外合同不变，将原 `jsonrpc_masterdata.go` 的大 switch 拆为客户、供应商、材料、工序、产品 / SKU、联系人和引用数据子文件；参数映射、权限检查、错误映射和返回包装仍留在 `service` 同包，业务规则继续由 `biz` usecase 承接。
- 完成：本轮不改 schema、migration、RBAC 权限码、菜单、前端页面、WorkflowUsecase、Fact usecase、客户配置或原型状态；仅降低 masterdata JSON-RPC 入口文件维护负担。
- 验证：`gofmt -w server/internal/service/jsonrpc_masterdata*.go`、`cd server && go test ./internal/service`、`cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`、`git diff --check` 均通过。
- 下一步：如继续治理入口体量，优先按生产 / 委外 / 出货 / 预留 / 财务拆 `jsonrpc_operational_fact.go`，仍保持 URL / method / usecase 合同不变。
- 阻塞/风险：当前工作区已有并行改动（`scripts/README.md`、`scripts/qa/secrets.sh`、部分 `web/` 文件和既有 `progress.md` 记录），本轮未回退、格式化或纳入这些路径；本轮未跑前端浏览器回归，因为没有改前端运行时或页面结构。

## 2026-06-24 Dashboard 任务来源技术字段收口

- 完成：Dashboard / 任务看板 / 移动任务共用的 `dashboardTaskDisplay` 不再把缺少 `source_no` 的任务显示成“内部来源 + 数字 ID”，改为业务可读的“已关联业务来源”，保留有业务来源单号时优先显示单号。
- 完成：`userVisibleTechnicalFields` 静态守卫补扫 `dashboardTaskDisplay.mjs`，并将“内部来源”纳入禁止文案；任务看板单测和 L1 场景同步锁住用户可见层不再出现该技术文案。
- 验证：已执行 `node --test src/erp/utils/userVisibleTechnicalFields.test.mjs src/erp/utils/workflowDashboardStats.test.mjs`、限定文件 eslint、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-task-board-desktop,erp-business-dashboard-desktop,erp-dashboard-mobile,erp-task-board-dark-wide-desktop pnpm --dir web style:l1`、`git diff --check`，均通过；前端单测 401 个通过，定向 L1 覆盖 5 个 Dashboard / 任务看板场景。
- 下一步：剩余“大文件按职责拆分”仍应按单页 / 单业务域拆成独立可验证任务；不要在技术字段治理同轮顺手硬拆大量页面。
- 阻塞/风险：本轮不改 schema、migration、后端 WorkflowUsecase / Fact usecase、RBAC、菜单真源、客户配置、原型资产或部署脚本；没有跑完整 `pnpm style:l1`，已用覆盖受影响页面的定向 L1 代替。

## 2026-06-24 secrets 脚本源码包运行收口

- 完成：`scripts/qa/secrets.sh` 支持 git 仓库和非 git 源码包双模式；仓库内保留 diff / staged 扫描，源码包内按脚本位置推导项目根目录并扫描包内文件；非 git 目录下 `SECRETS_STAGED_ONLY=1` 明确失败，避免伪装成 staged 扫描。
- 完成：内置 npm token 检查覆盖 `.npmrc.local` 和 `web/.npmrc.local`，防止源码包误带本机私有 registry token 时只依赖 `gitleaks`；`scripts/README.md` 同步补充源码包模式边界。
- 验证：见本轮收口回复；覆盖 shell 语法、git 仓库内扫描、非 git 源码包无 token 通过、非 git 源码包明文 token 阻断、非 git staged-only 明确失败、无 `gitleaks` 时内置 npm token 检查、shellcheck、diff check。
- 下一步：若未来要求 `full.sh` / `strict.sh` 整套 QA 在源码 zip 中运行，再单独评审 root fallback 和非 git 下各子守卫的语义；本轮只收口 `secrets.sh`。
- 阻塞/风险：本轮不改部署目录、服务器发布流程、镜像构建、migration、RBAC、Workflow / Fact、客户配置或 Git hooks 入口语义；非 git 模式不提供 diff range 和 staged-only 能力。

## 2026-06-24 产品档案 Tab 切换刷新真源修复

- 完成：撤回产品档案页内 record 缓存、idle 预取和字典跳过请求方案；保留不影响业务数据新鲜度的优化：tab 激活与表格内容更新拆分、产品档案表格固定布局。
- 完成：主数据页面顶部“刷新当前页”改为重新请求当前列表、单位字典和 SKU 产品引用；`style:l1` 正式业务壳层场景新增请求断言，锁住产品档案切换“产品规格”必须请求 `list_product_skus / list_products`、顶部刷新必须重新请求当前 SKU 列表和产品引用、点击“材料档案”菜单必须请求 `list_materials / list_units`。
- 验证：更新前 `progress.md` 为 426 行、81886 字节，未达到归档阈值；已执行业务页数据缓存关键词扫描、Playwright 手工请求计数脚本、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check`，均通过；前端单测 400 个通过。
- 下一步：后续业务页若要优化 tab 手感，只允许做渲染优先级、固定布局、loading 占位、请求并发等不缓存业务事实的优化；不得把页内缓存作为列表刷新或菜单切换的默认手段。
- 阻塞/风险：本轮不改 schema、migration、API、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；打印/PDF preview 的 Blob/草稿缓存、列顺序偏好和 dev-only 本地偏好不属于业务列表数据缓存，本轮不改。

## 2026-06-24 菜单请求生命周期与重复点击收口

- 完成：全局菜单重复点击当前路径不再触发刷新，只关闭移动侧栏；切换到其他菜单仍由目标页面 mount / type change 重新读取后端，顶部“刷新当前页”继续保留显式重读能力，并用 ref 锁避免连点刷新并发。
- 完成：`JsonRpc` 区分主动取消请求和真实网络错误，`AbortError` 标记为 `isAbortError` 且不再归类为 `isNetworkError`；主数据列表 API 透传 `AbortSignal`。
- 完成：主数据页为 records / units / productReferences / contacts 增加 latest request guard；新一轮请求会 abort 旧请求，旧请求失败或返回后不弹 toast、不写旧状态、不覆盖当前页面。
- 完成：`style:l1` 正式业务壳层场景新增当前菜单重复点击负向断言，确保切到材料档案会请求 `list_materials / list_units`，但再次点击当前“材料档案”不会重复请求；`plush-page-design-governance` 同步补充页面请求生命周期和当前菜单重复点击规则。
- 验证：追加前 `progress.md` 为 428 行、82507 字节，已归档到 `docs/archive/progress-2026-06-24-before-menu-request-lifecycle.md`；已执行真实浏览器快速切菜单回归，人为延迟 `/rpc/masterdata` 后旧请求出现 `net::ERR_ABORTED` 但页面无 console error、无 toast，同菜单重复点击无 masterdata 请求；已执行 `node --test web/src/common/utils/jsonRpc.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、skill YAML 解析和规则 grep、`git diff --check`，均通过；前端单测 401 个通过。
- 下一步：后续其他页面若出现快速切换旧请求污染，复用 `JsonRpc` 的 `isRpcAbortError` 和页面 latest request guard 思路，不用页面缓存掩盖数据新鲜度问题。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；本轮只治理主数据页的请求生命周期，其他业务页仍按各自既有加载逻辑运行。

## 2026-06-24 服务端 Docker Go builder 版本对齐

- 完成：`server/Dockerfile` 默认 `GO_BUILDER_IMAGE` 从 `golang:1.26.2` 对齐为 `golang:1.26.4`，与 `server/go.mod` 的 `toolchain go1.26.4` 保持一致，减少 Docker build 时再下载 Go toolchain 的风险。
- 验证：先用 Docker 官方 tags 页面确认 `golang:1.26.4` tag 存在；本机 `docker manifest inspect golang:1.26.4` 因当前代理端口 `127.0.0.1:7897` 不可用失败，未作为 tag 不存在处理。已执行 `bash scripts/deploy/production-preflight.sh --example --skip-compose-config`、`git diff --check`。
- 下一步：正式发版前仍应在本地或 CI 完整构建 `docker build -f server/Dockerfile -t plush-toy-erp-server:<release> .`，并把 release tag / digest 写入发布证据。
- 阻塞/风险：本轮不触碰目标服务器、不执行 migration、不改 Compose runtime 镜像、不提交推送；当前工作区存在多组并行改动，本轮只新增 `server/Dockerfile` 与本条 `progress.md` 记录。

## 2026-06-24 默认前端包移除 yoyoosun 静态客户配置

- 完成：默认产品前端 runtime 不再静态 import `config/customers/yoyoosun/menuConfig.mjs`；`brand.js` 和 `customerMenuConfig.mjs` 只读取部署侧 `window.__PLUSH_ERP_CUSTOMER_CONFIG__`，`VITE_ERP_CUSTOMER_KEY` / `window.__PLUSH_ERP_CUSTOMER_KEY__` 不再按 key 查找内置客户包。
- 完成：新增中性 `web/public/customer-config.js` 占位和 `config/customers/yoyoosun/customer-config.example.js` 部署注入示例；将 yoyoosun favicon 从默认 `web/public` 移到 `config/customers/yoyoosun/assets/`，并在 `customer-config-boundaries` 脚本中加入默认 runtime 不打包客户包的守卫；同步更新 README、当前真源、产品菜单、客户配置、试用说明和 scripts 文档口径。
- 验证：`pnpm --dir web exec node --test src/common/consts/brand.test.mjs src/erp/config/seedData.test.mjs src/erp/config/devCustomerConfig.test.mjs src/common/consts/favicon.test.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、`git diff --check`、`pnpm --dir web build:desktop`、`pnpm --dir web exec vite build --config vite.config.mjs --outDir /tmp/plush-customer-config-build --emptyOutDir`、`rg "yoyoosun|永绅|东莞市永绅玩具有限公司|favicon-yoyoosun|customer-assets/yoyoosun" /tmp/plush-customer-config-build -S` 无命中、限定文件 eslint、`node --check` 客户配置脚本、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm --dir web style:l1` 均通过；前端单测 402 个通过。
- 下一步：yoyoosun 或后续客户发布时，应由部署包把客户 `customer-config.js` 和客户资产放入静态根路径；若要把这个复制动作纳入正式发布脚本，需要另开发布治理任务。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC、菜单权限真源、WorkflowUsecase、Fact usecase、真实导入、SaaS tenant 或部署 Compose；仓库内仍保留 yoyoosun 客户资料和配置源，不等于默认前端产物包含客户资料。当前工作区还有多组并行改动，本轮未回退、未格式化或提交。

## 2026-06-24 库存台账 Product Core 页面治理

- 完成：库存台账保持只读事实页，不新增库存写入、调整、出入库、盘点或预留消耗入口；列表展示收口为业务可读对象、仓库、批次、单位和关联状态，不再把流水幂等键、来源行 ID、冲正原流水 ID 或未知来源 key 直接暴露给业务用户。
- 完成：库存页列表和引用数据请求接入 latest request guard 与 `AbortSignal`；快速切换视图 / 筛选时取消旧请求，取消请求不弹错误、不回写旧状态；库存 API 和仓库引用 API 同步透传请求选项。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && node --test src/erp/api/inventoryApi.test.mjs src/erp/utils/userVisibleTechnicalFields.test.mjs`、`cd web && STYLE_L1_PORT=4273 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、限定库存相关文件 `git diff --check` 均通过；默认 `4173` 端口曾因占用导致首次 L1 启动失败，换用 `4273` 后同场景通过。
- 下一步：若要把库存从只读台账推进为完整库存管理闭环，应另开后端 Fact usecase、状态机、RBAC、审计、事务和真实数据库回归任务，不在页面治理里补前端假动作。
- 阻塞/风险：本轮不改 schema、migration、InventoryUsecase、库存写入 JSON-RPC、RBAC、菜单真源、WorkflowUsecase、客户配置、原型状态或部署脚本；验证覆盖 mock/L1 页面和前端测试，未做真实数据库写入链路回归。

## 2026-06-24 客户配置 QA 守卫 review follow-up

- 完成：`scripts/qa/customer-config-boundaries.mjs` 改为按脚本位置推导仓库根目录，修复从非仓库根目录执行绝对路径脚本时找不到 `web/src/...` 的问题。
- 完成：同一 QA 守卫新增 `customer-config.example.js` 与 `menuConfig.mjs` 的 runtime 注入字段一致性校验，覆盖 `customerKey`、`label`、`brand` 和 `desktopMenu`，防止部署示例和客户配置源分叉。
- 验证：`node --check scripts/qa/customer-config-boundaries.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、`cd /tmp && node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-boundaries.mjs` 均通过。
- 下一步：若后续希望彻底避免复制式 example，可另开任务把 `customer-config.example.js` 改为生成产物或发布脚本输出；本轮先用守卫锁住一致性。
- 阻塞/风险：本轮不改 schema、migration、前端 runtime 页面、RBAC、菜单权限真源、WorkflowUsecase、Fact usecase、部署 Compose 或真实发布脚本；当前工作区仍有多组并行改动，本轮未回退、未格式化或提交。

## 2026-06-24 库存余额搜索占位符收口

- 完成：库存余额页搜索占位符改为“搜索对象类型”，对齐后端当前 keyword 不搜索数量字段的事实；本轮不新增库存数量搜索能力。
- 下一步：如需按数量筛选库存余额，另开后端 repo / JSON-RPC / 页面筛选合同任务。
- 阻塞/风险：本轮不改 schema、migration、InventoryUsecase、repo、JSON-RPC、RBAC、菜单、测试服数据或其他并行改动。

## 2026-06-24 客户配置 Docker 构建 overlay 闭环

- 完成：新增 `scripts/build/apply-customer-web-config.mjs`，本地 / CI 构建时可按 `ERP_CUSTOMER_KEY` 将 `config/customers/<customer-key>/customer-config.example.js` 覆盖到前端静态产物 `customer-config.js`，并复制客户 assets 到 `customer-assets/<customer-key>/`；未传客户 key 时保持中性产品包。
- 完成：`web/Dockerfile` 和 `server/Dockerfile` 均接入 `ERP_CUSTOMER_KEY` build arg 和 overlay 脚本；文档同步补充中性包与 yoyoosun 客户包构建命令，继续强调低配目标服务器不执行构建。
- 完成：`scripts/qa/customer-config-boundaries.mjs` 增加 favicon 资产路径和 Docker overlay 路径守卫，确保 `customer-config.example.js` 与 `menuConfig.mjs` 的 runtime 字段一致，且两个 Dockerfile 都保留客户配置 overlay。
- 验证：`node --check scripts/build/apply-customer-web-config.mjs`、`node --check scripts/qa/customer-config-boundaries.mjs`、空客户 overlay 跳过、`--customer yoyoosun` overlay 到 `/tmp/plush-customer-overlay-test/build`、grep 临时 `customer-config.js` 中永绅公司名和 favicon 路径、检查临时 `customer-assets/yoyoosun/favicon-yoyoosun.svg` 存在、`node scripts/qa/customer-config-boundaries.mjs` 均通过。
- 下一步：正式发布前仍需在本地或 CI 执行真实 `docker build --build-arg ERP_CUSTOMER_KEY=yoyoosun ...` 并记录 image tag / digest、commit hash、migration 状态、health / smoke 和 rollback point；本轮未触碰目标环境。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC、菜单权限真源、WorkflowUsecase、Fact usecase、Compose runtime、Atlas migration 或目标服务器；未执行真实 Docker 镜像构建和发布。

## 2026-06-24 销售与采购订单页列定义拆分

- 完成：`V1SalesOrdersPage.jsx` 的销售订单主表列和订单行列抽离到 `components/sales-orders/salesOrderColumns.jsx`，页面保留加载、保存、生命周期动作、列顺序偏好和业务页组合逻辑。
- 完成：`V1PurchaseOrdersPage.jsx` 的采购订单主表列抽离到 `components/purchase-orders/purchaseOrderColumns.jsx`，采购页的打印、入库草稿预览、Workflow 协同和来源跳转语义不变。
- 完成：`moduleTableColumns.test.mjs` 的共享排序守卫同步识别“页面调用列 builder、列模块调用 `applyBusinessColumnSorters`”的拆分形态，避免后续把排序规则又塞回页面。
- 验证：已执行 `cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_PORT=4195 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop pnpm style:l1`，均通过；前端单测 402 个通过，目标 L1 覆盖销售订单标准业务页和采购订单日期筛选 / 表单场景。
- 下一步：若继续拆页面，优先按同一策略拆销售 / 采购订单的数据加载 hook、状态动作区和表单 modal 组合；每次保持一个可验证闭环，不在同轮重排页面交互或改业务字段。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；没有跑完整 `pnpm style:l1`，已用受影响业务页的定向 L1 代替。

## 2026-06-24 客户配置 Docker 真实构建验证

- 完成：真实执行 `docker build --build-arg ERP_CUSTOMER_KEY=yoyoosun -f web/Dockerfile -t plush-toy-erp-web:yoyoosun-review-6a92a9b8 .`；首次构建暴露 `.dockerignore` 的 `**/build` 会排除源码目录 `scripts/build/`，导致 overlay 脚本在镜像内缺失。
- 完成：修复 `.dockerignore`，显式保留 `scripts/build/**` 进入 Docker build context；`scripts/qa/customer-config-boundaries.mjs` 增加对应守卫，防止后续再次排除 overlay 脚本。
- 验证：修复后 web 镜像构建成功，日志包含 `[apply-customer-web-config] applied customer=yoyoosun target=/app/web/build/customer-config.js`；镜像 `plush-toy-erp-web:yoyoosun-review-6a92a9b8` ID 为 `sha256:a011dc278cd1b7183352f2fbc5f7aa60fe5960377b877871b25776ebe4454ecc`，已在容器内 grep `/app/build/customer-config.js` 的永绅公司名和 favicon 路径，并确认 `/app/build/customer-assets/yoyoosun/favicon-yoyoosun.svg` 存在。
- 验证：真实执行 `docker build --target web-builder --build-arg ERP_CUSTOMER_KEY=yoyoosun -f server/Dockerfile -t plush-toy-erp-server-webbuilder:yoyoosun-review-6a92a9b8 .`；target 镜像 ID 为 `sha256:a2d9673ae3928921d3b17619df86213f1b67274249cb8edf224e97196f44f7e4`，已在容器内 grep `/web/build/customer-config.js` 的永绅公司名和 favicon 路径，并确认 `/web/build/customer-assets/yoyoosun/favicon-yoyoosun.svg` 存在。
- 验证：`node --check scripts/qa/customer-config-boundaries.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、限定 diff `git diff --check` 均通过。
- 下一步：`server/Dockerfile` 最终 runtime 镜像仍需在 Go 编译恢复后重跑 `docker build --build-arg ERP_CUSTOMER_KEY=yoyoosun -f server/Dockerfile ...`，并 inspect `/app/public/customer-config.js` 与 `/app/public/customer-assets/yoyoosun/favicon-yoyoosun.svg`。
- 阻塞/风险：本轮没有部署目标环境、没有 migration、没有 health / smoke、没有推送镜像；`server/Dockerfile` 最终镜像被当前工作区的 Go 重复声明阻断：`server/internal/biz/workflow_metadata.go` 与 `server/internal/biz/workflow.go` 重复声明 Workflow 常量 / task group，属于并行服务端拆分问题，不是客户配置 overlay 本身。

## 2026-06-24 大文件按职责边界拆分收口

- 完成：抽出 `web/src/erp/utils/businessTableActions.mjs`，统一承接业务表格列顺序偏好、排序值解析和 CSV 导出；销售 / 采购订单页不再各自维护重复工具函数，列顺序本地 reset 语义保持不变。
- 完成：销售订单表单弹窗抽到 `components/sales-orders/SalesOrderBusinessModal.jsx`；采购订单表单弹窗抽到 `components/purchase-orders/PurchaseOrderBusinessModal.jsx`；采购“生成入库草稿”来源预览与表单抽到 `components/purchase-orders/PurchaseOrderInboundDraftModal.jsx`。页面壳仍只负责数据加载、选中记录、保存 / 生命周期动作和路由跳转。
- 完成：`scripts/import/customerImportDryRun.mjs` 拆出 `customerImportDryRunRules.mjs`、`customerImportDryRunNormalize.mjs` 和 `customerImportDryRunReport.mjs`，分别承接 dry-run 规则表、纯字段归一化和报告输出；`canExecuteRealImport` 仍固定为 `false`，不新增真实导入、数据库连接或 runtime loader。
- 完成：`server/internal/biz/workflow.go` 拆出 `workflow_metadata.go` 和 `workflow_types.go`，把状态字典 / 权限判断、DTO / repo interface 从 usecase 行为里分离；Workflow task done / Fact posted 边界、状态流转规则和 side effects 未改。
- 完成：附件入口测试同步到新表单组件边界，继续要求直接 `BusinessAttachmentPanel` 只存在于 `BusinessFormModal` 内部；`moduleTableColumns` 守卫继续要求页面调用列 builder、列模块使用共享排序入口。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd server && go test ./...`、`node scripts/import/customerImportDryRun.mjs --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json --out output/customers/yoyoosun/import-dry-run-codex-split --format json,md`、`git diff --check` 均通过；前端单测 402 个通过，dry-run 输出 `canExecuteRealImport: false`。
- 验证：完整 `cd web && pnpm style:l1` 运行超过 6 分钟无增量输出后手动中断；随后执行 `STYLE_L1_PORT=4196 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,purchase-order-inbound-draft-modal-controls-desktop pnpm style:l1` 通过，共验证 3 个与本轮页面拆分相关的场景。
- 下一步：如果后续继续降页面文件体积，优先拆 `V1PurchaseOrdersPage.jsx` 的数据加载 / Workflow 动作 hook 和 `V1SalesOrdersPage.jsx` 的付款条件联动 hook；如果继续拆 dry-run，优先按 target evaluator 分域拆，不把 source normalization、candidate decision 和 report writer 混回一起。
- 阻塞/风险：CSS 本轮未拆；`theme-overrides.css` 当前是整块暗色主题覆盖且缺少稳定二级分区，硬拆会按行数切层叠顺序，不符合“不要为了拆而拆”。本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、Workflow / Fact 语义、客户配置、原型状态或部署脚本；当前工作区仍有多组并行改动，本轮未回退、未提交。

## 2026-06-24 活跃阶段编号入口重新治理

- 完成：移除活跃历史阶段编号 PostgreSQL 本地验收入口；四个 PG 验收脚本改为业务域脚本承接真实实现：`inventory-pg.sh`、`bom-lot-pg.sh`、`purchase-receipt-pg.sh`、`purchase-return-pg.sh`。Makefile 删除旧阶段编号兼容 target，只保留业务域 target 和业务域环境变量 / 测试库名。
- 完成：`server/internal/data/inventory_postgres_test.go` 的测试函数、helper、环境变量、source type 和 idempotency key 全部改为库存、BOM 批次、采购入库、采购退货命名；`scripts/qa/phase-label-boundaries.mjs` 删除历史 PG 白名单，并扩大到 AGENTS、README、当前真源和 docs/product，防止正式入口文档继续写入阶段编号。
- 完成：同步更新 AGENTS、server / scripts README 和模块实施治理文档，当前口径改为活跃脚本、测试、数据库名和 Make target 不再保留阶段编号兼容入口；历史阶段编号只允许留在 archive / reference 作为证据检索线索。
- 验证：`node --check scripts/qa/phase-label-boundaries.mjs`、`node scripts/qa/phase-label-boundaries.mjs`、阶段编号残留 grep（排除 `docs/archive/**` 与 `docs/reference/**`）、`bash -n scripts/inventory-pg.sh scripts/bom-lot-pg.sh scripts/purchase-receipt-pg.sh scripts/purchase-return-pg.sh`、`bash scripts/qa/shfmt.sh scripts/inventory-pg.sh scripts/bom-lot-pg.sh scripts/purchase-receipt-pg.sh scripts/purchase-return-pg.sh`、`cd server && go test ./internal/data -run 'TestInventoryPostgres|TestInventoryLotPostgres|TestPurchaseReceiptPostgres|TestPurchaseReturnPostgres|TestOperationalFactPostgresOutsourcingMaterialIssueWithoutLotPostAndCancel' -count=1`、`cd server && go test ./internal/data -run '^$'` 均通过。
- 下一步：若历史 archive / reference 中的旧阶段证据影响人工查找，可另开文档归档索引治理；不要把历史证据移动到活跃入口。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态、页面 UI 或部署脚本；未连接真实 PostgreSQL 运行写入级 PG 集成测试，当前验证覆盖脚本语法、命名守卫和 Go 编译 / skip 路径。

## 2026-06-25 销售订单明细添加按钮滚动边界

- 完成：销售订单弹窗明细区的添加按钮文案收口为共享 `添加条目`，并给 `.erp-line-items-form__footer` 明确加上不参与明细横向滚动的宽度约束，保持按钮随弹窗正文纵向滚动。
- 完成：`business-formal-module-shells-desktop` 的销售订单弹窗 L1 增加 footer 滚动边界断言，锁住“明细列表承接横向滚动、弹窗正文不横向滚、添加条目按钮不随 item 横向滚动、footer 不被明细宽度撑开”。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 均通过；前端单测 402 条通过，目标 L1 验证 1 个场景。
- 下一步：若后续继续治理业务弹窗明细区，优先把采购订单、委外订单和销售订单的 add-item footer 契约抽成更小的共享断言或组件，不在单页重复补规则。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；只跑了受影响业务壳的定向 L1，没有跑完整 `pnpm style:l1`。

## 2026-06-25 多明细添加后的弹窗滚动体验收口

- 完成：对照 trade-erp `ItemsFormList` 后确认 plush 不顺的主要原因是各业务弹窗 Form.List 只做 `add()`，没有在新行渲染完成后把弹窗正文平滑滚到新增明细；新增 `useLineItemAppendScroll` 共享 hook，统一记录目标行、注册行节点，并在行数变化后 `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })`。
- 完成：销售订单、采购订单、委外订单、出货单和主数据联系人添加 / 复制条目均接入新增后滚动策略；批量来源导入不触发自动拉动，避免导入回填时页面突然跳动。
- 完成：销售订单 L1 增加连续添加多行后的浏览器断言，要求弹窗正文形成纵向滚动、自动滚到新明细附近、最新明细进入可视区，并继续保留 footer 不参与横向滚动的断言。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop pnpm style:l1` 均通过；前端单测 402 条通过，目标 L1 验证 2 个场景。
- 下一步：若后续要进一步统一明细表单，应评审是否把销售 / 采购 / 委外 Form.List 抽成共享业务单据明细组件；本轮只抽滚动行为，不重排字段、保存映射或来源导入。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；未跑完整 `pnpm style:l1`，已用覆盖销售 / 采购 / 出货 / 委外 / 主数据联系人弹窗的定向 L1 组合替代。

## 2026-06-25 item 区域纵向滚动对齐 trade-erp

- 完成：对照 trade-erp `erp-items-list-unified-scroll` 后，将 plush 的 `.erp-sales-order-lines-form__list` 和 `.erp-master-contact-list__items` 改为 item 区域自身 `max-height: min(58vh, 680px)` + `overflow: auto`，由 items 列表同时承接横向和纵向滚动。
- 完成：销售 / 采购 / 委外单据明细、出货明细、主数据联系人继续沿用同一批添加 / 复制后定位新行逻辑；添加条目 footer 保持在 item 滚动容器外，仍随弹窗整体内容滚动。
- 完成：L1 连续添加多行断言从“弹窗正文应纵向滚动”改为“item 区域应纵向滚动并滚到最新明细”，避免后续把旧外层滚动行为误判为通过。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop pnpm style:l1`、`git diff --check` 均通过；前端单测 402 条通过，目标 L1 验证 2 个场景。
- 下一步：若后续继续统一 item 表单，可评审是否抽共享明细列表组件；本轮只统一滚动容器和添加后定位行为，不重排字段、保存映射或来源导入。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；未跑完整 `pnpm style:l1`，已用覆盖受影响弹窗的定向 L1 组合替代。

## 2026-06-25 活跃阶段编号残留二次收口

- 完成：清理活跃客户私有化部署资料里的阶段编号文案，`deployments/README.md` 改为“客户私有化复制规则”，yoyoosun smoke checklist 改为禁止“开发阶段命名 / 内部闭环”等非产品化菜单文案，不再直接列出历史阶段号。
- 完成：`businessAttachmentAssertions` 的内部断言状态字段从 `phase` 改为 `checkState`，避免前端 L1 脚本继续使用阶段语义字段名；`phase-label-boundaries` 扫描范围扩大到 `deployments` 和 `web/scripts`，补上此前 hook 漏扫的活跃目录。
- 验证：`node --check scripts/qa/phase-label-boundaries.mjs`、`node scripts/qa/phase-label-boundaries.mjs`、活跃路径阶段编号与旧阶段状态字段 grep（排除 archive / reference / generated ent / guard 自身）、`node --check web/scripts/style-l1/businessAttachmentAssertions.mjs`、`pnpm --dir web exec eslint scripts/style-l1/businessAttachmentAssertions.mjs`、`node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、限定 diff `git diff --check` 均通过。
- 下一步：若要求连本机 ignored 生成产物也不含历史阶段号，需要单独清理 `output/**` 和 `server/bin/**` 这类不纳入 git 的构建 / evidence 产物；不要把它们误判为当前 tracked runtime 真源。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态、页面运行时或部署脚本；仓库中 `docs/archive/**` 与 `docs/reference/**` 仍保留历史阶段号作为归档证据，当前守卫不扫描归档 / 参考资料。

## 2026-06-25 出货 / 质检 / BOM 页面职责拆分收口

- 完成：`ShipmentsPage.jsx` 抽出出货业务弹窗和出货列定义模块，页面保留列表加载、选择、确认出货、来源跳转和页面壳组合；出货附件仍在业务弹窗内，不把附件当成确认出货事实。
- 完成：`V1QualityInspectionsPage.jsx` 继续沿用既有质检创建 / 判定表单边界，并抽出列定义、导出列、状态 / 结果展示和列排序入口；页面保留数据请求、筛选、详情状态、列顺序偏好和操作编排。
- 完成：`BOMVersionsPage.jsx` 抽出 BOM 表头 / 明细表单、保存参数构造、版本建议和 BOM 列定义；页面保留产品 / BOM 数据加载、版本动作、明细动作和页面壳组合。
- 完成：附件入口守卫和业务表格列守卫同步识别新组件边界，继续要求表单附件位于 `BusinessFormModal` 内部、业务列统一走共享排序入口。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`git diff --check` 均通过；前端单测 402 条通过，定向 L1 验证 1 个业务页场景。
- 下一步：剩余页面大文件如果继续拆，优先按数据加载 hook、生命周期 / Workflow 动作 hook、表单组合组件这类真实变更边界推进；CSS 只在触达对应视觉规则时按职责拆，不为行数单独大动。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；没有跑完整 `pnpm style:l1`，已用受影响业务页的定向 L1 代替。页面文件仍在 1000 行上下，但剩余内容主要是页面编排和状态动作，不继续为行数硬拆。

## 2026-06-25 销售 / 采购订单页职责拆分收口

- 完成：`V1SalesOrdersPage.jsx` 抽出销售订单状态 / 日期 / 排序 / 生命周期配置到 `salesOrderPageConfig.mjs`，并把付款条件变化后的单价复核逻辑收口到 `useSalesOrderPaymentReview`；页面继续负责列表加载、选中订单、保存、关联跳转和页面组合。
- 完成：`V1PurchaseOrdersPage.jsx` 抽出采购订单页面配置、选中态视图模型、Workflow 任务动作、采购合同打印动作、入库草稿生成动作和上方筛选 / 选中操作条；页面继续负责采购订单加载、保存、列顺序、选中记录、关联跳转和页面组合。
- 完成：销售页降到 919 行，采购页降到 846 行；拆分后没有新增后端能力、没有改变采购承诺 / 销售源单据 / 入库事实 / 出货事实边界，也没有新增页面级删除 / 回收站入口。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop pnpm style:l1`、`git diff --check` 均通过；前端单测 402 条通过，定向 L1 验证 2 个销售 / 采购相关业务页场景。
- 下一步：若继续做大文件治理，前端优先评估 `OperationalFactsPage.jsx`、`V1OutsourcingOrdersPage.jsx`、`V1MasterDataPage.jsx` 和共享 `BusinessListLayout.jsx`；CSS、import dry-run、Workflow 后端文件不应混入页面拆分轮次。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；没有跑完整 `pnpm style:l1`，已用受影响业务页的定向 L1 代替。当前工作区仍有多组并行 / 既有改动，本轮未回退、未提交。

## 2026-06-25 Codex skills 使用场景速查补充

- 完成：补充根 `README.md` 的 `.agents/skills/` 导航，并完善 `.agents/skills/README.md` 的“按问题选 Skill / Scenario Matrix”，把选中文本分析、提示词、runtime 诊断、测试范围、代码 review、文档治理、页面治理、业务边界、发布、seed/import、可观测错误和安全隐私按常见提问方式映射到对应 skill。
- 完成：同步新增全局 `/Users/simon/.codex/skills/README.md`，作为跨项目通用 skill 使用场景速查；单个 skill 子目录仍不新增 README。
- 验证：追加前 `progress.md` 为 227 行、42476 字节，未达到归档阈值；本轮只改根 README、skills README 和过程记录，不改运行时代码、schema、migration、RBAC、菜单、测试脚本或部署脚本。
- 下一步：后续在 side chat 里遇到“是什么 / 为什么 / 怎么解决 / 测试是否够 / review 是否通过”等问题时，优先按场景矩阵选择一个主 skill，再按影响面补相邻 skill。
- 阻塞/风险：README 只负责选型导航，不替代各 skill 的 `SKILL.md`、项目 `AGENTS.md`、正式文档、代码、runtime 证据或自动化校验。

## 2026-06-25 PDF warmup 变量口径对齐

- 完成：plush PDF 预热新增推荐主变量 `ERP_PDF_WARMUP=async/off`，保留旧变量 `ERP_PDF_WARMUP_ENABLED=true/false` 兼容；两者同时设置时以 `ERP_PDF_WARMUP` 为准。
- 完成：生产 compose 增加 `ERP_PDF_WARMUP` 空值透传，继续保留 `ERP_PDF_WARMUP_ENABLED=true` 默认，避免新变量默认值遮蔽旧变量；部署 README、runtime/config 文档同步说明推荐变量、legacy 变量和启动日志口径。
- 验证：追加前 `progress.md` 为 235 行、43694 字节，未达到归档阈值；本轮不改 PDF DOM、打印模板、schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、页面 UI 或部署执行。
- 下一步：发布或本地重启后，可用日志 `template pdf warmup started / success / failed / disabled` 与 `/readyz` 状态确认预热链路；如需关闭，优先设置 `ERP_PDF_WARMUP=off`。
- 阻塞/风险：plush 继续保持既有 `/readyz` 语义，PDF warmup 未完成或失败时 readyz 不 ready；这次只统一配置变量口径，不把 readyz 语义改成 trade。

## 2026-06-25 输入控件圆角裁剪全局修复

- 完成：定位销售订单弹窗 `付款周期(天)` 的 `InputNumber` 圆角不完整，根因是圆角 wrapper 与内层原生 input 的背景 / 裁剪没有统一；计算圆角值达标，但内层矩形背景会在暗色业务弹窗里遮住左右圆角视觉。
- 完成：在全局 `control-radius.css` 收口 `.ant-input-affix-wrapper`、`.ant-input-number`、`.ant-picker` 的子元素裁剪，并让嵌套原生输入透明化，避免在单页或单字段硬补。
- 完成：`style:l1` 增加真实浏览器断言，检查圆角输入 wrapper 必须裁剪子元素，嵌套原生 input 背景必须透明，防止后续只看 `border-radius` 数值而漏掉视觉圆角被遮挡。
- 验证：追加前 `progress.md` 为 243 行、44842 字节，未达到归档阈值；`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`STYLE_L1_PORT=4247 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；前端单测 402 条通过，定向 L1 验证 1 个业务页场景。
- 下一步：若后续发现下拉面板、第三方弹层或特殊组合控件需要独立圆角策略，应先补 L1 复现断言，再评审是否扩展共享基线。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、字段映射、原型状态或部署脚本；未跑完整 `pnpm style:l1`，已用覆盖销售订单弹窗和共享业务壳的定向 L1 代替。`pnpm lint` 未跑，因为该脚本会 `--fix` 整个 `src/`，当前工作区已有大量非本轮改动，避免自动改写并行现场。

## 2026-06-25 页面大文件职责拆分一次收口

- 完成：`BusinessListLayout.jsx` 抽出本页协同面板到 `business-list/CollaborationTaskPanel.jsx`，并把列顺序偏好与 CSV 导出收口到 `business-list/businessListPreferences.mjs`；共享列表壳继续只负责 header、筛选、当前操作、表格容器和页面布局组合。
- 完成：`OperationalFactsPage.jsx` 抽出事实页配置、列定义、统计、附件 owner type 和关联入口构造到 `operational-facts/operationalFactPageConfig.mjs`；页面保留事实列表加载、筛选、创建 / 过账 / 取消 / 结算动作、附件弹窗和页面组合。
- 完成：`V1OutsourcingOrdersPage.jsx` 抽出页面配置、列定义和 Workflow 任务动作到 `outsourcing-orders/*`；委外订单页继续只承接加工合同源单、打印快照、生命周期动作和页面编排，不承接质检、库存或应付事实。
- 完成：`V1MasterDataPage.jsx` 抽出主数据对象配置、检索占位、编号 / 名称读取和单位字典判断到 `master-data/masterDataPageConfig.mjs`，并复用共享列顺序 / CSV helper；主数据页保留对象切换、列表加载、保存、启停和表单组合。
- 完成：顺手清掉采购入库草稿里采购订单缺编号时的裸 ID 可见 fallback，改为业务占位口径；更新主数据聚合保存静态测试，让测试跟随新配置边界。
- 验证：追加前 `progress.md` 为 243 行、44842 字节，未达到归档阈值；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_PORT=4189 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,material-master-header-desktop,purchase-order-date-filter-desktop pnpm style:l1`、`git diff --check` 均通过；前端单测 402 条通过，定向 L1 验证 3 个核心业务页场景。
- 下一步：当前页面大文件治理可以先停，不建议继续为了行数拆页面。后续只在触达具体业务时再按真实责任拆：CSS 按视觉规则拆、import dry-run 按解析 / 归一化 / 匹配 / 报告拆、Workflow 后端按 transition policy / payload helper / task 派生规则单独拆。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；完整 `pnpm style:l1` 未跑完，已用覆盖共享业务壳、主数据、委外、运营事实、采购相邻页的定向 L1 组合代替。当前工作区仍有多组并行 / 既有改动，本轮未回退、未提交。

## 2026-06-25 委外订单缺号显示 fallback 收口

- 完成：按 runtime 分层确认问题位于前端 UI 选中态文案，不涉及 JSON-RPC、后端 usecase、DB、migration、RBAC、Workflow 或部署；`V1OutsourcingOrdersPage.jsx` 缺加工合同号时不再显示 `加工合同 ${id}`，统一回退为 `加工合同未编号`。
- 完成：将加工合同号显示 fallback 收口到 `getOutsourcingOrderDisplayNo`，选中摘要、选中条目和协同面板当前记录标签共用同一口径；`userVisibleTechnicalFields.test.mjs` 增加 `加工合同 ${` 静态守卫，防止后续再把裸 ID 拼进业务可见文案。
- 验证：追加前 `progress.md` 为 263 行、49101 字节，未达到归档阈值；`node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs`、`node --test web/src/erp/api/masterDataOrderApi.test.mjs`、`cd web && pnpm test`、`cd web && pnpm exec eslint --ext .js --ext .jsx --ext .mjs src/erp/pages/V1OutsourcingOrdersPage.jsx src/erp/components/outsourcing-orders/outsourcingOrderPageConfig.mjs src/erp/utils/userVisibleTechnicalFields.test.mjs`、`cd web && STYLE_L1_PORT=4191 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`git diff --check` 均通过；前端单测 402 条通过，定向 L1 验证 1 个核心业务页场景。
- 下一步：页面大文件拆分保持当前边界，不继续为行数拆；后续若发现其它裸 ID fallback，优先补到用户可见技术字段守卫，而不是在页面局部硬补。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态、部署脚本或样式；未跑完整 `pnpm style:l1`，已用覆盖委外页的定向 L1 代替。

## 2026-06-25 Git closeout coordination skill 接入

- 完成：新增全局 `/Users/simon/.codex/skills/git-closeout-coordination/`，用于提交推送、多会话同时收口、hook/lint/test 反复失败时先判定 owner、冻结范围、upstream/dirty 状态和停止条件。
- 完成：在 `.agents/skills/README.md` 增加 `$git-closeout-coordination` + `$plush-release-governance` 场景入口；`plush-release-governance` 增加提交推送前先走全局协调、hook/generator 改写后重查 `git status -sb` 的项目差异规则。
- 验证：追加前 `progress.md` 为 271 行、50868 字节，未达到归档阈值；已执行全局 skill 与 `plush-release-governance` 的 `quick_validate.py`、`agents/openai.yaml` Ruby YAML 解析、TODO 扫描和限定 `git diff --check`，均通过。
- 下一步：后续 plush 提交推送相关 / 所有代码，尤其多会话、脏工作区或 hook 反复失败时，先 `$git-closeout-coordination`，再按 `$plush-release-governance` 和 `$plush-test-governance` 选择项目命令。
- 阻塞/风险：本轮只改全局 skill、项目 skill README、release skill 和过程记录，不改运行时代码、schema、migration、JSON-RPC、RBAC、页面、测试脚本或部署脚本；当前工作区仍有多组并行 / 既有改动，本轮未回退、未提交。

## 2026-06-25 销售订单录入字段与联系人快照收口

- 完成：销售订单 Source Document 新增 `sales_owner` 与 `contact_snapshot`，并生成 Ent / Atlas migration；repo、biz、JSON-RPC 保存 / 返回 / 搜索同步接入，业务员参与关键词检索，联系人以订单快照保存，不回写客户联系人主数据。
- 完成：销售订单弹窗新增业务员 / 跟单人、联系人、联系电话、邮箱等录入字段；选择客户后按客户主联系人 / 首个联系人带默认联系人，编辑已有订单时优先回显订单快照，手工修改联系人不会覆盖客户主数据。
- 完成：销售订单列表 / 导出增加业务员和联系人列，搜索占位同步补充业务员；客户字段确认清单更新销售订单的业务员和联系人口径，明确本轮只做销售订单录入，不引入外销页面、报价单、下游出货、采购、财务或 Workflow / Fact 自动生成。
- 验证：追加前 `progress.md` 为 279 行、52204 字节，未达到归档阈值；`cd server && make data`、`gofmt`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check` 均通过。
- 下一步：若后续要借鉴 trade-erp 的币种、贸易条款、外销流程、报价转订单、销售订单生成采购 / 出货 / 应收，应作为独立边界评审和 usecase / RBAC / 测试任务推进；若业务员要绑定系统用户或角色，也需要单独做 RBAC / Workflow 评审。
- 阻塞/风险：本轮只生成 migration，未执行本地或线上数据库 `migrate apply`；未跑完整 `pnpm style:l1`，已用覆盖销售订单弹窗的定向 L1 替代；当前工作区仍有多组既有 / 并行改动，本轮未回退、未提交。

## 2026-06-25 Git 收口钩子格式冲突收口

- 完成：补收 `pre-push` 全量检查后由 lint/format 留下的采购订单配置差异；将 `forEach` 回调内以 `(` 开头的明细遍历改为局部变量后再遍历，避免 Prettier 补前置分号、ESLint 删除分号导致反复脏工作区。
- 验证：追加前 `progress.md` 为 288 行、54119 字节，未达到归档阈值；已完成上一轮 `git push` 触发的 `qa:full`，并确认本地与 `origin/main` 无 ahead/behind 分叉。
- 下一步：继续按 full-worktree closeout 收到 `git status -sb` 干净后再结束。
- 阻塞/风险：本轮不改业务语义、schema、migration、JSON-RPC、RBAC、菜单、Workflow / Fact usecase 或部署脚本。

## 2026-06-25 业务页面系统时间列统一隐藏

- 完成：普通业务页面 / 组件默认不再展示系统 `created_at / updated_at` 对应的创建时间、更新时间列；主数据、销售订单、采购订单、委外订单、BOM、采购入库、质检、出货、库存台账、业务事实和 formal shell 的默认表格 / 导出列统一保留业务日期、状态、来源、数量、金额、备注等业务字段。
- 完成：`userVisibleTechnicalFields.test.mjs` 增加普通业务页面不默认展示“创建时间 / 更新时间 / 创建日期 / 更新日期”的静态守卫；`style:l1` 质检和采购入库表头断言同步更新，防止旧断言把系统时间列带回业务默认视图。
- 验证：追加前 `progress.md` 为 295 行、54861 字节，未达到归档阈值；`node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs`、`cd web && pnpm test`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`cd web && pnpm style:l1` 均通过；完整 L1 验证 66 个场景。
- 下一步：若后续需要审计详情、管理员排障或专门历史追溯视图展示系统时间，应显式放到审计 / 详情 / 开发治理边界，不回到普通业务列表默认列。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC 返回字段、排序参数、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；后端仍可返回 `created_at / updated_at` 供审计、排序和内部排查使用。

## 2026-06-25 生命周期可见文案收口为状态

- 完成：销售订单列表 / 导出列头从“生命周期”改为“状态”，订单附件说明从“不改变订单生命周期”改为“不改变订单状态”；采购订单模块能力说明从“提交、审核、关闭、取消生命周期”改为“状态动作”口径。
- 完成：dev 原型配置、原型索引、业务表单样板和局部动作弹窗样板里的“生命周期动作 / 生命周期规则”统一改为“状态动作 / 状态规则”，保留内部 `lifecycle_status` 字段和 HTML 脚本锚点不变。
- 完成：`userVisibleTechnicalFields.test.mjs` 增加“业务可见文案不暴露架构状态机术语”守卫，覆盖页面、组件、移动端和 `businessModules / devPrototypes` 配置，防止“生命周期”再作为业务可见字段或动作说明回流。
- 验证：追加前 `progress.md` 为 303 行、56457 字节，未达到归档阈值；`rg` 确认业务页面 / 组件 / 配置 / 脚本 / 原型资产中只剩原型 README 的“资产生命周期”普通阶段说明；`node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs web/src/erp/config/devPrototypes.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；前端单测 404 条通过，定向 L1 验证 1 个业务页场景。
- 下一步：若后续需要在正式业务文档中解释内部状态机，继续使用“单据状态 / 状态动作 / 状态规则”作为用户可见口径，`lifecycle_status` 只留在代码、API 合同和架构文档里。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC 字段、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或部署脚本；完整 `pnpm style:l1` 未跑，已用覆盖销售订单和共享业务壳的定向 L1 代替。

## 2026-06-25 销售订单单行导出入口移除

- 完成：移除销售订单选中态操作栏里的“导出订单行”按钮；保留列表级“导出当前结果”，避免为通常只有一行的所选订单明细占用常驻操作位。
- 完成：删除该按钮牵引的订单行 CSV 导出、选中订单后自动加载订单行、不可达的订单行列顺序弹窗和对应本地状态；订单行仍在销售订单新建 / 编辑业务弹窗内按真实编辑流程加载和维护。
- 完成：同步 `moduleTableColumns.test.mjs`，不再要求销售订单页挂无可见入口的订单行列表列顺序；扫描确认当前前端没有“导出订单行 / 导出明细 / 导出行”类单行导出按钮文案，其他页面保留的是“导出当前结果”或禁用说明。
- 验证：追加前 `progress.md` 为 312 行、58396 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/pages/V1SalesOrdersPage.jsx src/erp/utils/moduleTableColumns.test.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check -- web/src/erp/pages/V1SalesOrdersPage.jsx web/src/erp/utils/moduleTableColumns.test.mjs` 均通过；前端单测 404 条通过，定向 L1 验证 1 个业务页场景。
- 下一步：若后续确有批量订单行对账 / 下发需求，应设计为列表级多行导出或详情里的低频更多操作，不恢复选中单行常驻按钮。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；未跑完整 `pnpm style:l1`，已用覆盖销售订单和共享业务壳的定向 L1 代替。当前工作区进入本轮前已有多组非本轮改动，本轮未回退、未提交。

## 2026-06-25 销售订单签约与计划交付日期口径收口

- 完成：销售订单 `order_date` 的用户可见文案统一从“订单日期”改为“签约日期”；`planned_delivery_date` 统一展示为“计划交付日期”，覆盖列表列头、导出列头、日期筛选、排序选项、弹窗字段标签和校验提示。
- 完成：确认销售订单弹窗已经使用既有 `DateInput` 暴露 `order_date / planned_delivery_date`，本轮保留并加静态测试锁住两个日期控件，避免后续只在表格显示日期但弹窗无法录入。
- 完成：同步 `docs/product/prototypes/core-menu-coverage-v1/index.html` 中销售订单字段口径；底层字段名、JSON-RPC、schema、migration、RBAC、菜单、Workflow / Fact 和客户配置均未修改。
- 验证：追加前 `progress.md` 为 321 行、60252 字节，未达到归档阈值；`pnpm --dir web exec node --test src/erp/utils/userVisibleTechnicalFields.test.mjs src/erp/utils/moduleTableColumns.test.mjs`、`pnpm --dir web exec eslint --no-warn-ignored --ext .js --ext .jsx src/erp/components/sales-orders/SalesOrderForm.jsx src/erp/components/sales-orders/salesOrderColumns.jsx src/erp/components/sales-orders/salesOrderPageConfig.mjs src/erp/utils/userVisibleTechnicalFields.test.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 均通过；前端单测 405 条通过，定向 L1 验证 1 个业务页场景。
- 下一步：若后续需要把后端字段从 `order_date` 物理改名为 `contract_date`，必须作为独立 schema/API/migration 兼容任务评审；当前只收口业务可见语义。
- 阻塞/风险：本轮不改数据库字段名和 API 参数名，因此代码内部仍使用 `order_date` 作为兼容字段；未跑 `pnpm --dir web lint`，因为项目脚本会 `--fix` 整个 `src/`，当前工作区已有多组非本轮改动，已用定向 ESLint 只读校验替代。

## 2026-06-25 全局业务日期可见口径扫描

- 完成：全局扫描业务页面、L1 脚本和原型资产中的“订单日期 / 采购日期 / 预计到货 / 预计回货 / 计划出货 / 实际出货”等日期文案；采购订单统一为“下单日期 / 预计到货日期”，委外订单统一为“预计回货日期”，出货与运营事实筛选统一为“计划出货日期 / 实际出货日期”。
- 完成：同步采购订单、委外订单、出货、运营事实、业务模块配置、原型样例和 L1 文案断言；补 `userVisibleTechnicalFields.test.mjs` 静态守卫，确认对应弹窗仍有 `DateInput` 日期控件，且短标签不会回流。
- 完成：保留“收货日期 / 出货日期 / 回货日期”等事实日期口径，不改底层 `purchase_date / expected_arrival_date / expected_return_date / planned_ship_at / shipped_at` 字段名，也不改 schema、migration、JSON-RPC、RBAC、Workflow / Fact usecase、菜单或客户配置。
- 验证：追加前 `progress.md` 为 330 行、62225 字节，未达到归档阈值；`rg -n "采购日期|预计到货(?!日期)|预计回货(?!日期)|计划出货(?!日期)|实际出货(?!日期)|计划 / 实际出货|行预计回货(?!日期)|明细预计到货(?!日期)" web/src web/scripts docs/product/prototypes -S --pcre2` 无遗留匹配；`cd web && pnpm exec node --test src/erp/utils/userVisibleTechnicalFields.test.mjs src/erp/utils/moduleTableColumns.test.mjs src/erp/config/seedData.test.mjs src/erp/config/devPrototypes.test.mjs`、定向 ESLint、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile pnpm style:l1`、`cd web && pnpm test`、限定 `git diff --check` 均通过；前端单测 406 条通过，定向 L1 验证 4 个场景。
- 下一步：若后续要物理重命名底层日期字段，应作为独立 schema/API/migration 兼容任务推进；当前只治理用户可见文案和弹窗控件一致性。
- 阻塞/风险：完整 `pnpm --dir web lint` 未跑，因为脚本会 `--fix` 整个 `src/`，当前工作区已有多组非本轮改动，已用定向 ESLint 只读校验替代；当前工作区仍有并行 / 既有改动，本轮未回退、未提交。

## 2026-06-25 低频备注输入降级

- 完成：销售订单 `price_condition_note` 从常驻全宽“价格条件说明”降级为普通权重“报价备注”，保留账期影响报价时记录核对结论的语义，不改字段名、API 参数或后端保存链路。
- 完成：全局扫描业务页面 `TextArea`；将销售订单、采购订单、委外订单、BOM、主数据、出货、采购入库草稿 / 明细等普通可选备注改为一行起步、按内容自动展开，减少空备注框占用；Workflow 原因、质检判定备注、打印 / 合同模板文本区、移动端任务处理和 dev-only 边界预览因属于动作证据或正式输出，本轮保留。
- 完成：同步 `docs/product/产品能力证据详情.md` 的销售订单 UI 口径为“报价备注（`price_condition_note`）”。
- 验证：追加前 `progress.md` 为 339 行、64531 字节，未达到归档阈值；已复扫 `Input.TextArea / textarea`，确认剩余大块文本区均属于动作原因、判定、打印输出、移动端任务处理或 dev-only 预览边界；`git diff --check`、定向 ESLint、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop pnpm style:l1` 均通过；前端单测 406 条通过，定向 L1 验证 3 个场景。
- 下一步：如后续某个备注字段开始承载结构化业务判断，应独立评审为明确字段或动作原因，不继续堆在普通备注里。
- 阻塞/风险：本轮不改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置或部署脚本；完整 `pnpm lint` 未跑，因为项目脚本会 `--fix` 整个 `src/`，当前工作区已有多组非本轮改动，已用定向 ESLint 只读校验替代；未跑完整 `pnpm style:l1`，已用覆盖业务表单、采购订单和出货日期筛选的定向 L1 代替。

## 2026-06-25 邮箱电话保存校验收口

- 完成：新增后端联系人校验主路径，客户 / 供应商联系人 `phone / mobile / email` 在主数据独立联系人 API 和 `save_customer_with_contacts / save_supplier_with_contacts` 聚合保存前统一 trim、校验和拒绝明显非法值；销售订单 `contact_snapshot` 的 `phone / mobile / email` 同步复用该规则，避免来源主数据和订单快照各拦各的。
- 完成：新增前端 `contactValidation.mjs`，主数据联系人、销售订单联系人快照、管理员登录短信手机号和权限中心管理员手机号维护统一使用共享表单规则；管理员手机号仍按短信登录大陆手机号规则，业务联系人电话 / 手机使用较宽松联系电话规则，允许座机、总机、国际前缀和分机写法。
- 完成：新增并登记 `contactValidation.test.mjs`；补后端 `masterdata / sales_order` 单测，覆盖有效邮箱、无效邮箱、有效联系电话、无效短号、销售订单快照 trim 和非法快照拒绝。
- 验证：追加前 `progress.md` 为 348 行、66503 字节，未达到归档阈值；`go test ./internal/biz`、`go test ./internal/biz ./internal/service`、`pnpm --dir web exec node --test src/erp/utils/contactValidation.test.mjs src/erp/utils/masterDataOrderView.test.mjs`、定向 ESLint、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、限定 `git diff --check` 均通过；前端全量单测 409 条通过，定向 L1 验证 1 个业务表单场景。
- 下一步：若后续需要清理历史脏联系人数据，应另做只读审计报告或受控修复脚本；本轮不直接改历史库数据。
- 阻塞/风险：本轮不改 schema、migration、Ent 生成文件、错误码、JSON-RPC 方法、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、原型状态或部署脚本；未跑完整 `pnpm lint`，因为该脚本会 `--fix` 整个 `src/`，当前工作区已有多组非本轮改动，已用定向 ESLint 只读校验替代；未跑完整 `pnpm style:l1`，已用覆盖正式业务表单壳的定向 L1 代替。
