# 前端脚本 / Web Scripts

本目录保存前端本地服务、浏览器级回归和 smoke 脚本。这里的脚本服务开发和验收，不是产品运行时真源；页面能力、菜单、RBAC、Workflow / Fact 边界仍以代码、后端 usecase、正式文档和测试结果交叉确认。

## 脚本分类

| 类型                  | 入口                                                                                                                                                                                                                                                                                                                                                                                               | 用途                                                                                                                                   | 边界                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 样式与页面 L1 回归    | `pnpm style:l1` / `styleL1.mjs` / `style-l1/`                                                                                                                                                                                                                                                                                                                                                      | 启动前端并用 Playwright 覆盖登录、业务页、暗色、打印、移动端和局部页面交互                                                             | 默认使用 mock / 前端态验证；失败要先分清页面回归、mock wiring 和浏览器基础设施问题                                                                                                                                                                                                                                                                                                                                                                       |
| 真实登录 smoke        | `realLoginSmokeShared.mjs --print-input-template` / `--preflight-report <path>`、`mobileAuthLoginRouteSmoke.mjs --print-input-template` / `--preflight-report <path>`、`purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` / `--preflight-report <path>`、`pnpm smoke:purchase-contract-real-login`、`pnpm smoke:processing-contract-real-login`、`pnpm smoke:mobile-auth-login-route` | 先打印共享登录、移动端认证回跳或采购入库真实写入前置，再验证合同编辑联动、在线预览、下载 PDF、浏览器打印入口、岗位任务端入口和认证回跳 | 输入模板不读配置、不调后端、不启动浏览器、不登录、不写库；shared preflight 只探测 backend health 和凭据来源候选；mobile-auth preflight 只写本地角色路由 / 视口计划；采购入库 preflight 只探测 health、显式管理员凭据 env、持久测试数据确认和页面目标安全性；合同 smoke 依赖本地后端和开发账号，验证预览 / 下载 / 打印入口但不替代 PDF 版式坐标审阅、RBAC / usecase 单测或目标环境 evidence；mobile-auth route smoke 使用 mock RPC 验证生产单端口岗位路由 |
| 移动端 Workflow smoke | `pnpm smoke:mobile-workflow-runtime-browser` / `mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template` / `mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report <path>`                                                                                                                                                                                                                  | 创建 `simulated_only` workflow 任务并用真实浏览器验证阻塞、退回、完成和跨角色催办                                                      | 输入模板不登录、不调用后端、不启动浏览器、不写库；preflight 只探测 health、前置缺口和模拟任务动作计划 coverage；真实 smoke 只写本地 / 试用模拟 workflow 证据                                                                                                                                                                                                                                                                                             |
| 真实写入 e2e          | `purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` / `--preflight-report <path>` / `pnpm smoke:purchase-receipt-real-write`                                                                                                                                                                                                                                                           | 先打印持久测试数据确认和真实写入前置，再写 no-write 前置报告，最后准备采购入库测试草稿并通过浏览器过账和取消模拟单据                   | 输入模板和 preflight 不启动浏览器、不调 JSON-RPC、不写库；真实命令会写本地 / 开发库模拟采购入库事实，只能按脚本显式参数和 README 边界执行，禁止跑生产或客户正式环境                                                                                                                                                                                                                                                                                      |
| 本地服务              | `pnpm start`、`pnpm start:frontend-only`、`pnpm start:yoyoosun`、`pnpm audit:yoyoosun-entry`、`pnpm serve:prod`、`pnpm preview:yoyoosun`                                                                                                                                                                                                                                                                                       | 默认前端入口、永绅 yoyoosun 热更新开发、端口审计和静态包预览                                                                           | `pnpm start` 与 `start:yoyoosun` 启动 Vite 前共用 schema / migration / backend health / ready 只读预检，本机后端不就绪时 fail closed；`start:frontend-only` 是不验证登录 / RPC 的显式降级模式；`start:yoyoosun` 另检查永绅静态客户配置与公开资源；`preview:yoyoosun` 构建并预览生产包形态；`audit:yoyoosun-entry` 只读检查端口归属、customer-config、asset 和 health。所有开发入口都不 apply migration，不 publish / activate 后端 customer config                                                                                         |
| QA 报告生成           | `buildFieldLinkageCoverageReport.mjs`                                                                                                                                                                                                                                                                                                                                                              | 生成字段联动 latest 结构化报告                                                                                                         | 报告供开发验收页读取，不是业务事实真源                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 常用命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
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

`STYLE_L1_SCENARIOS` 支持逗号分隔的场景名，适合局部页面回归。默认端口冲突时优先换一个 `STYLE_L1_PORT=<port>` 复跑，不要先把端口占用误判成页面回归。

## 写入和输出边界

- `style:l1` 输出浏览器截图、日志和报告到 `web/output/playwright/style-l1/`，不纳入 git。
- `realLoginSmokeShared.mjs --print-input-template` 只打印真实登录 smoke 所需输入和命令模板，不读取本地配置、不校验账号、不调用后端、不启动浏览器、不登录、不写数据库。
- `realLoginSmokeShared.mjs --preflight-report <path>` 只写本地前置报告，探测后端 health 和管理员凭据来源候选是否存在；不读取 config 内容、不读取密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库，报告不保存密码、token 或 Authorization header。
- `mobileAuthLoginRouteSmoke.mjs --print-input-template` 只打印移动端认证回跳 smoke 所需输入、岗位任务端角色和命令模板，不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库。
- `mobileAuthLoginRouteSmoke.mjs --preflight-report <path>` 只写本地前置报告，记录脚本是否存在、岗位任务端角色路由计划、phone / iPad 视口计划和 mock RPC 覆盖口径；不启动 Vite / Playwright、不调用后端 / JSON-RPC、不读取密码、不登录、不保存 token 或 Authorization header、不写数据库，也不证明真实 RBAC / customer config active revision。
- 真实 `smoke:mobile-auth-login-route` 使用 mock auth / workflow RPC 验证 `/m/<role>/tasks` 生产单端口路由、phone/iPad 布局和登录回跳。
- `mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report <path>` 只写本地前置检查报告，记录后端 health 是否可达、是否存在演示密码 env、是否需要脚本托管 Vite、试用 customer-config 脚本是否存在，以及模拟任务动作计划是否覆盖老板阻塞 / 完成 / 退回、跨角色催办、reason 必填、完成反馈、异常上报、evidence refs 和内部 `notification_type` 线索；不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建 workflow 任务、不写数据库，报告不保存 token 或 Authorization header。
- `purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 只打印采购入库页面真实写入 e2e 所需输入、持久测试数据确认、`PR-BROWSER-*` 记录边界和后续真实命令，不读取本地配置、不校验账号、不调用后端、不启动 Vite、不启动 Playwright、不登录、不写数据库。
- `purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report <path>` 只写本地前置检查报告，记录后端 health 是否可达、显式管理员账号密码 env 是否齐全、是否已确认持久测试数据、页面目标是否为本机或已显式允许外部测试目标；不读取本地配置、不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建或过账采购入库单、不写数据库，报告不保存 token 或 Authorization header。
- 真实登录 smoke 可能读取本地开发配置中的管理员账号，也可能通过环境变量覆盖账号密码；不要把账号、token 或截图里的敏感信息提交。
- 真实登录 smoke 的 `REAL_LOGIN_SMOKE_BASE_URL` 和 `REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL` 不得包含 URL 账号密码；账号密码只能走显式环境变量或本地开发配置读取。
- `smoke:purchase-receipt-real-write` 会用采购入库 RPC 准备带 `PR-BROWSER-*` 前缀的模拟草稿，再到入库管理页完成过账和取消；收尾口径是取消冲正并保留可追踪记录，不物理删除已过账单据。入库管理页本身不提供页面级“新建入库单”，真实业务草稿从采购订单“生成入库”入口产生。
- `pnpm start` 先运行仓库共享的 `scripts/local-runtime-preflight.mjs`；本机 API 必须通过 db-guard、Atlas pending=0、`healthz` 和 `readyz`，才启动 Vite。预检与 Vite proxy 共用 `API_ORIGIN`，且不会自动 apply migration。`pnpm start:frontend-only` 只适用于不登录、不调 RPC 的页面调试，会显式输出非绿色证据边界。
- `start:yoyoosun` 默认从 `5176` 起探测可用端口，复用同一 runtime preflight，再检查 `config/customers/yoyoosun/customer-config.example.js` 和 `public-assets/`，通过 dev-only middleware 提供 `/customer-config.js`、`/customer-assets/yoyoosun/*`；客户工程图和来源资料不会公开提供。它保留 HMR，不构建生产包，不调用 `customer_config.validate / publish / activate / rollback`，不写数据库。静态包通过不代表后端 active revision 已就绪。
- `preview:yoyoosun` 默认执行单入口 `build:all`、注入 `config/customers/yoyoosun/customer-config.example.js` 与客户静态资产，并以 `APP_ID=desktop API_ORIGIN=http://127.0.0.1:8300` 启动 `serve:prod`；端口默认从 `5176` 起探测，遇占用自动顺延并在终端输出实际 URL。它只预览永绅前端静态包，不生成 `build/mobile-*`，不调用 `customer_config.validate / publish / activate / rollback`，不导入业务数据、不写数据库。
- 两个 yoyoosun 入口的 `--print-plan` 都会按实际可用端口输出 `verify customer config` 和 `verify customer asset` 两条 `curl` 命令；验证通过只证明当前前端端口注入了 yoyoosun 静态配置和资产，不证明后端 active revision、真实 RBAC、真实登录或 release evidence 已完成。
- `audit:yoyoosun-entry` 默认只读检查 `5175,5176,5177,5178,5179`，汇总每个端口的监听进程 cwd / 命令、`/customer-config.js` 分类、yoyoosun favicon content-type 和 `8300/healthz`。它不启动服务、不登录、不调用 JSON-RPC、不读取密码或 token、不写报告、不写数据库；使用 `pnpm --silent audit:yoyoosun-entry -- --json` 可输出机器可读的本地诊断结果，仍不证明后端 active revision、真实 RBAC、真实登录或 release evidence。
- 本目录脚本不能绕过后端 RBAC、schema、migration、Workflow / Fact usecase 或客户配置边界。

## 维护规则

- 新增浏览器级页面回归时，优先复用 `style-l1/` 下已有 mock、assertion 和 scenario 拆分。
- 修改 API shape、页面字段映射或业务页主路径时，同步更新对应 mock 和 L1 场景，避免脚本继续验证旧前端契约。
- 不要对 `styleL1.mjs` 做无关大范围格式化；该文件体量大，改动应按场景和 helper 分区收口。
- 脚本说明保持在本文件和 `web/README.md`，测试分层和选择口径仍以 `docs/product/自动化测试策略.md` 为准。
