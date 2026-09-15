# 前端脚本 / Web Scripts

本目录保存前端本地服务、浏览器级回归和 smoke 脚本。这里的脚本服务开发和验收，不是产品运行时真源；页面能力、菜单、RBAC、Workflow / Fact 边界仍以代码、后端 usecase、正式文档和测试结果交叉确认。

## 脚本分类

| 类型 | 入口 | 用途 | 边界 |
| --- | --- | --- | --- |
| 页面级浏览器回归（Style L1） | `pnpm style:l1` / `styleL1.mjs` / `style-l1/` | 启动前端并用 Playwright 覆盖登录、业务页、暗色、打印、移动端和局部页面交互 | 默认使用 mock / 前端态验证；失败要先分清页面回归、mock wiring 和浏览器基础设施问题 |
| 真实登录 smoke | `realLoginSmokeShared.mjs --print-input-template` / `--preflight-report <path>`、`mobileAuthLoginRouteSmoke.mjs --print-input-template` / `--preflight-report <path>`、`purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` / `--preflight-report <path>`、`pnpm smoke:purchase-contract-real-login`、`pnpm smoke:processing-contract-real-login`、`pnpm smoke:mobile-auth-login-route` | 先打印共享登录、移动端认证回跳或采购入库真实写入前置，再验证合同编辑联动、在线预览、下载 PDF、浏览器打印入口、岗位任务端入口和认证回跳 | 输入模板不读配置、不调后端、不启动浏览器、不登录、不写库；shared preflight 只探测 backend health 和凭据来源候选；mobile-auth preflight 只写本地角色路由 / 视口计划；采购入库 preflight 只探测 health、显式管理员凭据 env、持久测试数据确认和页面目标安全性；合同 smoke 依赖本地后端和开发账号，验证预览 / 下载 / 打印入口但不替代 PDF 版式坐标审阅、RBAC / usecase 单测或目标环境 evidence；mobile-auth route smoke 使用 mock RPC 验证生产单端口岗位路由 |
| 移动端 Workflow smoke | `pnpm smoke:mobile-workflow-runtime-browser` / `mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template` / `mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report <path>` | 创建 `simulated_only` workflow 任务，用真实浏览器验证 v1 列表进入 v2 查看 / 处理 / 可信回执、完成反馈校验、阻塞 / 退回 / 完成、跨角色催办及返回列表状态恢复 | 输入模板不登录、不调用后端、不启动浏览器、不写库；preflight 只探测 health、前置缺口和模拟任务动作计划 coverage；真实 smoke 只写本地 / 试用模拟 workflow 证据，不能替代真实岗位账号视觉验收、目标环境 smoke 或客户 UAT |
| 真实写入 e2e | `purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` / `--preflight-report <path>` / `pnpm smoke:purchase-receipt-real-write` | 先打印持久测试数据确认和真实写入前置，再写 no-write 前置报告，最后准备采购入库测试草稿并通过浏览器过账和取消模拟单据 | 输入模板和 preflight 不启动浏览器、不调 JSON-RPC、不写库；真实命令会写本地 / 开发库模拟采购入库事实，只能按脚本显式参数和 README 边界执行，禁止跑生产或客户正式环境 |
| 本地服务 | `pnpm start`、`pnpm start:frontend-only`、`pnpm start:yoyoosun`、`pnpm audit:yoyoosun-entry`、`pnpm serve:prod`、`pnpm preview:yoyoosun` | 默认前端入口、永绅 yoyoosun 热更新开发、端口审计和静态包预览 | `pnpm start` 与 `start:yoyoosun` 启动 Vite 前共用 schema / migration / backend health / ready 只读预检；已分类的本机可恢复阻断只开放迁移页，其它路径 fail closed。`start:frontend-only` 是不验证登录 / RPC 的显式降级模式；`start:yoyoosun` 另检查永绅静态客户配置与公开资源；`preview:yoyoosun` 构建并预览生产包形态；`audit:yoyoosun-entry` 只读检查端口归属、customer-config、asset 和 health。所有开发入口都不 apply migration，不 publish / activate 后端 customer config |
| QA 报告生成 | `buildFieldLinkageCoverageReport.mjs` | 由顶层 `scripts/qa/erp-field-linkage.mjs` runner 调用，生成字段联动结构化证据到 ignored `output/qa/coverage/field-linkage.latest.json` | 要求 runner 传入当前 repository identity；只证明字段联动专项，不写 `public/qa`、不进入生产构建，也不等于整仓代码、业务场景、目标环境或 UAT 覆盖 |

## 常用命令

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm style:l1
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
node scripts/realLoginSmokeShared.mjs --print-input-template
node scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json
node scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template
node scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json
node scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template
node scripts/purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json
pnpm smoke:mobile-auth-login-route
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
pnpm smoke:purchase-receipt-real-write
pnpm start
pnpm start:frontend-only
pnpm start:yoyoosun --print-plan
pnpm start:yoyoosun
pnpm --silent audit:yoyoosun-entry -- --json
pnpm preview:yoyoosun --print-plan
pnpm preview:yoyoosun
```

`STYLE_L1_SCENARIOS` 支持逗号分隔的场景名，适合局部页面回归；`STYLE_L1_SCENARIO_MAX_ATTEMPTS` 只接受 `1` 或 `2`，CI 固定为一次；`STYLE_L1_OUTPUT_DIR` 只接受仓库 `output/` 下的受管目录。默认读取 `config/dev-ports.env` 的专属 style 端口 `6175`；如需显式设置 `STYLE_L1_PORT=<port>`，只能使用该 style 端口或本项目 `15200-15299` 辅助区间，脚本会把实际端口同步给 Vite 和 HMR。

受管前端脚本的默认辅助端口按用途分开：共享真实登录 `15210`、采购合同 `15211`、委外合同 `15212`、采购入库 E2E `15213`、移动认证 `15220`、试用浏览器 `15230`、移动 Workflow `15240`，CI Browser 三条隔离 lane 使用 `15250`、`15251`、`15252`。`start:yoyoosun` / `preview:yoyoosun` 从 `15200` 起探测，但不会越过 `15299`；所有 Vite 入口的统一配置会拒绝主前端 `5175`、样式 `6175` 和本项目辅助块之外的受管监听端口。

## 写入和输出边界

- `style:l1` 默认输出浏览器截图、日志和报告到 `web/output/playwright/style-l1/`，不纳入 git；CI 三条 Browser lane 分别写入仓库 `output/` 下按 pipeline/job/lane 隔离的受管目录，取消、超时、成功或失败都按已验证进程组清理浏览器、Vite、端口、lock 与临时目录。
- `realLoginSmokeShared.mjs --print-input-template` 只打印真实登录 smoke 所需输入和命令模板，不读取本地配置、不校验账号、不调用后端、不启动浏览器、不登录、不写数据库。
- `realLoginSmokeShared.mjs --preflight-report <path>` 只写本地前置报告，探测后端 health 和管理员凭据来源候选是否存在；不读取 config 内容、不读取密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库，报告不保存密码、token 或 Authorization header。
- `mobileAuthLoginRouteSmoke.mjs --print-input-template` 只打印移动端认证回跳 smoke 所需输入、岗位任务端角色和命令模板，不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库。
- `mobileAuthLoginRouteSmoke.mjs --preflight-report <path>` 只写本地前置报告，记录脚本是否存在、岗位任务端角色路由计划、phone / iPad 视口计划和 mock RPC 覆盖口径；不启动 Vite / Playwright、不调用后端 / JSON-RPC、不读取密码、不登录、不保存 token 或 Authorization header、不写数据库，也不证明真实 RBAC / customer config active revision。
- 真实 `smoke:mobile-auth-login-route` 使用 mock auth / workflow RPC 验证 `/m/<role>/tasks` 生产单端口路由、phone/iPad 布局和登录回跳。
- `mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report <path>` 只写本地前置检查报告，记录后端 health 是否可达、是否存在演示密码 env、是否需要脚本托管 Vite、试用 customer-config 脚本是否存在，以及模拟任务动作计划是否覆盖老板阻塞 / 完成 / 退回、跨角色催办、reason 必填、完成反馈、阻塞 / 退回原因事件、动作页不出现证据输入、新动作不生成 evidence refs 和内部 `notification_type` 线索；不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建 workflow 任务、不写数据库，报告不保存 token 或 Authorization header。
- `purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 只打印采购入库页面真实写入 e2e 所需输入、持久测试数据确认、`PR-BROWSER-*` 记录边界和后续真实命令，不读取本地配置、不校验账号、不调用后端、不启动 Vite、不启动 Playwright、不登录、不写数据库。
- `purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report <path>` 只写本地前置检查报告，记录后端 health 是否可达、显式管理员账号密码 env 是否齐全、是否已确认持久测试数据、页面目标是否为本机或已显式允许外部测试目标；不读取本地配置、不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建或过账采购入库单、不写数据库，报告不保存 token 或 Authorization header。
- 真实登录 smoke 可能读取本地开发配置中的管理员账号，也可能通过环境变量覆盖账号密码；不要把账号、token 或截图里的敏感信息提交。
- 真实登录 smoke 的 `REAL_LOGIN_SMOKE_BASE_URL` 和 `REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL` 不得包含 URL 账号密码；账号密码只能走显式环境变量或本地开发配置读取。
- `smoke:purchase-receipt-real-write` 会用采购入库 RPC 准备带 `PR-BROWSER-*` 前缀的模拟草稿，再到入库管理页完成过账和取消；收尾口径是取消冲正并保留可追踪记录，不物理删除已过账单据。入库管理页本身不提供页面级“新建入库单”，真实业务草稿从采购订单“生成入库”入口产生。
- `start:yoyoosun` 默认从清单中的独占辅助块 `15200-15299` 起探测可用端口，且耗尽时失败、不会跨块顺延；它复用同一 runtime preflight，再检查 `config/customers/yoyoosun/customer-config.example.js` 和 `public-assets/`，通过 dev-only middleware 提供 `/customer-config.js`、`/customer-assets/yoyoosun/*`；客户工程图和来源资料不会公开提供。它保留 HMR，不构建生产包，不调用 `customer_config.validate / publish / activate / rollback`，不写数据库。同 key `builtin_rbac_fallback` 只允许进入带警示的 DEV 桌面预览壳，不升级为 active customer runtime；工作台 / 任务看板不发出 Workflow RPC，客户业务数据页和岗位任务端仍 fail closed。静态包通过不代表后端 active revision 已就绪。
- 两个 yoyoosun 入口的 `--print-plan` 都会按实际可用端口输出 `verify customer config` 和 `verify customer asset` 两条 `curl` 命令；验证通过只证明当前前端端口注入了 yoyoosun 静态配置和资产，不证明后端 active revision、真实 RBAC、真实登录或 release evidence 已完成。
- `audit:yoyoosun-entry` 默认只读检查主开发保留区 `5175-5179` 与本项目辅助块起点附近 `15200-15204`，汇总每个端口的监听进程 cwd / 命令、`/customer-config.js` 分类、yoyoosun favicon content-type 和 `8300/healthz`。它不启动服务、不登录、不调用 JSON-RPC、不读取密码或 token、不写报告、不写数据库；使用 `pnpm --silent audit:yoyoosun-entry -- --json` 可输出机器可读的本地诊断结果，仍不证明后端 active revision、真实 RBAC、真实登录或 release evidence。
- 本目录脚本不能绕过后端 RBAC、schema、migration、Workflow / Fact usecase 或客户配置边界。

## 维护规则

`startWebDev.mjs` 管理固定主入口、Codex / `--isolated` 辅助端口和重复启动；`devWebInstance.mjs` 校验实例配置摘要与显式重启的进程归属，`viteParentLifetime.mjs` 通过 IPC 处理启动器异常退出。`start:yoyoosun` 复用同一 Vite 子进程生命周期。日常 `pnpm start`、安全重启 `pnpm start:restart` 与临时验证 `pnpm start:isolated` 的完整约定见 [`web/README.md`](../README.md#启动命令)。实例摘要不包含路径或凭据，不承担业务健康或发布证据语义。

- 新增浏览器级页面回归时，优先复用 `style-l1/` 下已有 mock、assertion 和 scenario 拆分。
- 修改 API shape、页面字段映射或业务页主路径时，同步更新对应 mock 和页面级浏览器回归场景（Style L1），避免脚本继续验证旧前端契约。
- `styleL1.mjs` 只维护服务与浏览器生命周期、场景调度和报告；页面断言放在 `style-l1/*Assertions.mjs`，新增检查按对应职责维护。
- 脚本说明保持在本文件和 `web/README.md`，测试分层和选择口径仍以 `docs/product/自动化测试策略.md` 为准。

## Style L1 场景组织

`style-l1/scenarios.mjs` 只组合场景工厂和共享输入。登录、客户权限、工作台、移动任务、权限中心、打印和业务表单分别位于同目录对应的 `*Scenarios.mjs`。物料明细、色卡和作业指导书编辑各有独立的 `*InteractionScenario.mjs`，按命名交互步骤调用断言，每个场景使用自己的页面和 PDF 请求记录。场景名称、顺序与请求计数的生命周期保持独立；通过 `STYLE_L1_SCENARIOS` 选择受影响场景，完整运行遵循 QA 的高成本授权规则。

`test/reactRuntime.mjs` 为 Node 组件与 hook 行为测试提供 JSX 加载和可恢复的 DOM 环境，不进入产品运行时。

`global-tab-sliding-light` / `global-tab-sliding-dark` 检查共享页签的逐帧滑动、快速反向切换、尺寸变化、面板重新打开、键盘、禁用项与减少动态效果设置。场景通过浏览器拦截加载 `test/SlidingTabsFixture.jsx`，复用真实组件和样式，不添加产品路由或写入业务数据；输出 `global-tab-sliding-*-frames.json` 留存中间位置。可用 `STYLE_L1_SCENARIOS=global-tab-sliding-light,global-tab-sliding-dark pnpm style:l1` 定向运行。

## 本地启动与进程范围

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm install
pnpm start
```

默认地址：`http://127.0.0.1:5175`。开发服务器会把 `http://localhost:5175` 自动规范到同一 IPv4 地址。

本地开发端口由仓库根目录 `config/dev-ports.env` 统一提供。人工终端的 `pnpm start` 固定使用 `5175`，通过同一预检后，若已有同一工作区、后端、客户配置、启动参数和恢复状态的前端，会输出地址并成功退出，继续使用原服务。其他程序、其他工作区或不同启动配置的占用会明确阻断，保持 `strictPort`，不会自动停止占用者或把主入口顺延。

需要重新加载启动配置或接管遗留的本工作区 Vite 时运行 `pnpm start:restart`（等价于 `pnpm start --local --restart`）。它先完成预检，再用 `lsof` 与 `ps` 连续核对监听 PID、工作目录、Vite 命令和进程启动时间，仅向已确认的本工作区 Vite 发送 `SIGTERM`；归属不明、现场变化或端口未释放时停止，不强制杀进程。

Codex 会话通过 `CODEX_THREAD_ID` / `CODEX_CI` 自动选择辅助端口；人工临时验证可用 `pnpm start:isolated`。辅助端口只从 `15200-15299` 中选取，终端输出实际 URL，HMR 与监听端口同步；耗尽时阻断。启动器直接管理 Vite 子进程，通过信号和 IPC 在中断、终端关闭或启动器被强制结束后释放其监听端口；不会清理其他会话的服务。直接运行 Vite 时也会按 Codex 环境选择并固定辅助端口，生命周期由调用方管理。

明确需要固定辅助端口时，把 `ERP_VITE_PORT` 与 `ERP_VITE_HMR_CLIENT_PORT` 设为同一个值；显式端口优先于自动分配。只覆盖 Vite CLI 的 `--port` 会在启动期被拒绝，避免 HMR 连接旧端口后形成自动重载循环。`API_ORIGIN` 仍可显式覆盖，否则代理从同一清单的 HTTP `8300` 推导。

Windows / WSL 下的 `pnpm start`、`pnpm start:frontend-only` 和 `pnpm start:yoyoosun` 通过同一受管浏览器入口打开页面。它只在 Chrome、Edge 或 Brave 中检查标题属于本项目的候选标签，并在地址栏精确匹配 `127.0.0.1` / `localhost` 与实际端口后激活、刷新该标签；窗口保持原有最大化或普通状态，只有已最小化时才恢复。未命中或 Windows UI Automation 不可用时回退到系统默认的新标签页。它不会输出浏览地址、关闭历史重复标签或读取其他标题标签的地址栏；显式 `BROWSER=none` 或自定义 `BROWSER` 始终优先。macOS 与原生 Linux 保留 Vite 的平台默认打开行为。

`pnpm start` 默认先执行共享本地 runtime preflight：本机 `API_ORIGIN` 会先检查工作区 schema / versioned migration、开发库 Atlas status，再要求后端 `/healthz` 与 `/readyz` 同时通过；预检和 Vite 的 `/rpc`、`/templates` 代理共用同一 `API_ORIGIN`。预检只读，不会 apply migration。本地预检最多等待 15 秒；pending、数据库配置或连接、db-guard、Atlas、安全检查及后端异常或超时时，启动器保留 Vite，只开放 `/__dev/database-migration` 恢复页；恢复期间除启动器所需的只读实例摘要外，普通 ERP 页面、其它 DEV API 与 `/rpc`、`/templates` 失败关闭，修正环境后刷新状态，重新通过同一完整启动检查和同目标 health / ready，才能进入完整工作台。仅做不登录、不调 RPC 的前端布局调试时，可显式使用 `pnpm start:frontend-only`；该模式会标记为降级、非绿色证据，不能用来验证登录或业务页。如果 `API_ORIGIN` 指向外部环境，本地不会读取其数据库，也不进入本机恢复模式，仍要求该环境 health / ready 通过，migration 由目标环境发布证据负责。

开发工作台读取 GitLab CI、不可变版本目录与流水线耗时证据时，使用独立的 `PLUSH_GITLAB_READ_TOKEN`；macOS 未显式提供时，`pnpm start` 会自动读取钥匙串 service `plush-toy-erp.gitlab-read-api`，account 使用当前 macOS 登录用户名。该凭据只允许当前项目的最小读取权限，只保存在本机钥匙串和 DEV 服务私有内存；版本中心将它收口到不含发布方法的只读 Provider，不进入浏览器、仓库、日志、质量门禁子进程或部署执行子进程，也不替代创建新发布使用的短期 `PLUSH_GITLAB_TOKEN`。钥匙串未登记时业务开发仍可启动，但 GitLab 服务端证据保持失败关闭，不以本机结果补证。

## 客户前端调试与预览

本地预览永绅 yoyoosun 前端包可使用一键脚本。它会先检查 `http://127.0.0.1:8300/healthz`，再构建桌面和岗位任务端产物、注入 `config/customers/yoyoosun/customer-config.example.js` 和客户静态资产，并从本项目独占辅助块 `15200-15299` 起自动选择可用端口启动静态服务；该脚本只处理前端静态包，不会调用后端 `customer_config.validate / publish / activate / rollback`，也不会导入业务数据：

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm preview:yoyoosun --print-plan
pnpm preview:yoyoosun
```

默认从 `15200` 起探测可用端口，实际地址以终端输出的 `url=http://localhost:<port>/erp` 为准。如需指定起始端口或后端地址：

```bash
PORT=15202 API_ORIGIN=http://127.0.0.1:8300 pnpm preview:yoyoosun
```

`preview:yoyoosun --print-plan` 会按实际可用端口输出 `verify customer config` 和 `verify customer asset` 两条 `curl` 命令。打开页面前先用这两条命令确认当前端口的 `/customer-config.js` 已是 yoyoosun 配置、`/customer-assets/yoyoosun/favicon-yoyoosun.svg` 返回 SVG content-type；如果返回默认占位配置、资产 404，或 asset 命令只命中 Vite HTML fallback，说明当前打开的是 Product Core / 旧静态服务 / 错误端口，而不是本次 yoyoosun 预览。

如果本机已经开了多个前端端口，先跑只读端口审计。它默认同时检查主开发保留区 `5175-5179` 和本项目辅助块起点附近 `15200-15204` 的监听进程、`/customer-config.js`、yoyoosun favicon 和 `8300/healthz`，用于区分 Product Core dev、yoyoosun dev / preview、遗留占用或其他项目；不启动服务、不登录、不调用 JSON-RPC、不读取密码或 token、不写数据库。需要保存当前端口归属证据时，可追加 `--report output/yoyoosun-local-entry-audit/current.json` 写本地 no-write 报告；该报告不得写进 `deployments/**/evidence/**`：

```bash
pnpm --silent audit:yoyoosun-entry -- --json
pnpm --silent audit:yoyoosun-entry -- --json --report output/yoyoosun-local-entry-audit/current.json
```

该命令只证明当前端口是否注入 yoyoosun 静态配置和资产，不证明后端 active revision、真实 RBAC、真实登录、岗位任务端或 release evidence 已完成。

当前端口已确认是 yoyoosun 但还没有演示账号密码或 token 时，可单独记录后端 `get_effective_session` 的无凭据边界。该命令只做无 Authorization 的 JSON-RPC 只读探针，预期会停在 `40302 未登录` 或等价阻断；它不读取 token、不登录、不证明 active revision：

```bash
node ../scripts/qa/customer-config-effective-session-probe.mjs --json
node ../scripts/qa/customer-config-effective-session-probe.mjs --json --report output/customers/yoyoosun/customer-config-effective-session-probe/current.json
```

本地开发调试永绅前端时使用热更新入口。它不打包，直接启动 Vite dev server，并通过 dev-only middleware 提供永绅 `/customer-config.js` 和 `public-assets/` 下的 `/customer-assets/yoyoosun/*`：

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm start:yoyoosun --print-plan
pnpm start:yoyoosun
```

本地后端的 `make run`、`make dev` 和 `make dev_restart` 默认使用 `ERP_CUSTOMER_KEY=yoyoosun`，避免未显式携带 customer key 的业务 RPC 回落到 demo；这些本地入口同时显式开放后端 local-test gate，gate 按 pgx 最终连接配置只接受 `192.168.0.133:5432` 的 `plush_erp` / `plush_erp_*_dev` 开发库，production 配置会拒绝该开关。确需 demo 时使用 `ERP_CUSTOMER_KEY=demo make dev_restart` 显式覆盖。

`start:yoyoosun` 同样从 `15200` 起在 `15200-15299` 辅助块内自动顺延端口，保留 HMR，并复用 `pnpm start` 的 schema / migration / health / ready 预检，再检查 yoyoosun 静态配置和公开资源存在。启动命令只注入前端静态客户配置，不自动写库或切换后端 revision。登录后可在 `/__dev/customer-config?customer=yoyoosun` 由管理员显式确认应用；dev-only middleware 只接受匹配的 `start:yoyoosun` 客户上下文和 loopback `API_ORIGIN`，生成内容寻址、长度不超过 64 的 `local_test_apply` revision，再由已开放本地 gate 的后端执行 validate / publish / transition check / activate or rollback / active readback。该操作写入共享开发 PostgreSQL 客户配置控制面，active 切换对其他共享库使用者也可见；默认后端与正式 validator / executor 均拒绝 local-test marker，因此不等于正式 publish / activate、目标环境部署或客户签收。

未显式应用时，后端若只返回同 key 的 `builtin_rbac_fallback`，DEV 桌面端会进入带警示的本地预览壳，避免把成功登录误报成工作台故障；该 fallback 不视为 active revision，工作台 / 任务看板只做零 Workflow RPC 的能力审阅，客户业务数据页和岗位任务端仍 fail closed。页面 / 动作 / 字段是否按永绅 active revision 收窄，仍取决于本地后端 `8300` 当前数据库里的 `customer_config.get_effective_session`；静态包检查通过不等于 active revision 已就绪。

`start:yoyoosun --print-plan` 也会输出同一组按实际端口生成的 `curl` 验证命令；端口被占用时不要按 `15200` 手工猜测，以终端输出的 `url=` 和验证命令为准。


## 真实登录与回归参数

真实 smoke 在 `web/` 执行，依赖后端和经确认的测试账号。管理员凭据由受控本地配置或 `REAL_LOGIN_ADMIN_USERNAME / REAL_LOGIN_ADMIN_PASSWORD` 提供；报告不得保存密码或 token。`REAL_LOGIN_PREVIEW_MAX_MS` 可覆盖合同 PDF 预览默认 `10000ms` 阈值。

采购入库真实写入 smoke 会保留 `PR-BROWSER-*` 记录，以取消冲正收口；`pnpm smoke:purchase-receipt-real-write` 已传 `--accept-persistent-test-data`，直接运行脚本时需显式传入该参数或 `PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1`。默认只允许 loopback；扩展到已准备的开发 / 测试地址需要 `--allow-external-base-url`，不能直接用于生产或目标客户库。缺少主数据时可用同一命令的 `--seed-core-demo` 准备模拟前置。

完整的 no-write 前置报告、模拟 Workflow 动作与脱敏回执命令统一见 [QA 岗位登录核验](../../scripts/qa/README.md#角色演示账号与登录核验)。Mock / Style L1 保留 React StrictMode；真实后端 Vite 使用单次挂载，重复请求由 `trialDemoAccountBrowserSmoke.mjs` 的逐页采样单独验证。Style L1 的当前覆盖以 `style-l1/scenarios.mjs` 和同名场景为准，不在 README 复制一份随时漂移的页面清单。
