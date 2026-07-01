# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。
- `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`：归档 2026-06-29 target evidence binding 之后到 release evidence runner 脱敏报告与 URL 前置拦截的过程记录。
- `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`：归档 2026-06-29 adminProfileSync 菜单投影文档纠偏、P2 explain / entitlement / break-glass 中段过程记录。
- `docs/archive/progress-2026-06-29-before-linked-task-idempotency.md`：归档 2026-06-29 P3 ProcessRuntime expected_version 守卫之前至 linked task 幂等闭环前的过程记录。
- `docs/archive/progress-2026-06-30-before-inventory-post-inbound.md`：归档 2026-06-30 P3 / P4 前段、adminProfileSync 菜单投影文档多轮纠偏、sales_order_acceptance、material_supply definition evidence、`purchase_receipt.create` 和 `quality_inspection.decide` 领域命令 handler 过程记录。
- `docs/archive/progress-2026-06-30-before-p5-release-input-checklist.md`：归档 2026-06-30 P4-2 / P4-3、adminProfileSync 文档纠偏和进入 P5 release closeout 输入清单前的过程记录。
- `docs/archive/progress-2026-06-30-before-p5-input-checklist-followup.md`：归档 2026-06-30 P5 release closeout report-only、release evidence hardening、菜单投影纠偏和 input checklist JSON 自定义路径只读合同之前的过程记录。
- `docs/archive/progress-2026-06-30-before-outsourcing-order-api-gate.md`：归档 2026-06-30 P5 input checklist、adminProfileSync 文档纠偏、purchase / quality / shipment / stock reservation / production / outsourcing fact / sales / purchase order moduleStates 门禁等过程记录。
- `docs/archive/progress-2026-07-01-before-action-projection-l1.md`：归档 2026-06-30 outsourcing order API 门禁之后至 2026-07-01 动作投影浏览器回归扩展的过程记录。
- `docs/archive/progress-2026-07-01-before-progress-archive-and-next-no-write.md`：归档 2026-07-01 动作投影浏览器回归扩展之后至 Purchase Receipt Browser E2E 输入模板的过程记录。
- `docs/archive/progress-2026-07-01-before-readme-preflight-sync-closeout.md`：归档 2026-07-01 Purchase Receipt Browser E2E 输入模板之后至 Web README mobile preflight 口径同步的过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template、preflight 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本、backup id、目标管理员凭据和用户确认时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit、runner report、input template 或 preflight 替代。
- 当前可继续推进的本地闭环优先落在：试用账号 / 菜单 / 岗位任务端前置检查、客户配置控制台 no-write 诊断、字段链路守卫、错误提示和 README / `__dev/testing` 入口口径一致性。

## 2026-07-01 progress 归档到 Web README preflight 口径同步后

- 完成：归档前 `progress.md` 为 213 行 / 80449 bytes，超过 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-07-01-before-readme-preflight-sync-closeout.md`。
- 完成：根 `progress.md` 收敛为归档索引、当前活跃事项、归档说明和最近 4 组记录，避免继续在超过阈值的根流水上追加。
- 下一步：继续当前 goal 时按单个可验证闭环推进；若本轮继续改代码或正式文档，完成后再在根 `progress.md` 追加新的短记录，并在接近阈值时先归档。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、测试、发布脚本、目标环境状态、客户数据或正式业务真源。

## 2026-07-01 Dev Customer Config 错误提示收口

- 完成：收口 `/__dev/customer-config` 客户配置控制台的用户可见错误提示。`DevCustomerConfigPage.jsx` 现在复用共享 `getActionErrorMessage`，未知后端 / transport 异常不再直接把 `error.message` 显示给用户；未登录、无权限和本地后端不可达仍保留场景化中文提示。同步强化 `scripts/qa/frontend-error-message-boundary.test.mjs`，把 `DevCustomerConfigPage.jsx` 作为 dev-only 但用户可见的控制台纳入 raw error message 静态守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/frontend-error-message-boundary.test.mjs web/src/erp/config/devCustomerConfig.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 19 个用例；`PATH=/usr/local/bin:$PATH pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/DevCustomerConfigPage.jsx` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。曾尝试 `node --check web/src/erp/pages/DevCustomerConfigPage.jsx`，Node 对 `.jsx` 扩展不适用，改用项目 eslint 和测试入口验证。
- 下一步：继续按 goal 推进客户配置控制台、试用账号真实 RBAC、真实岗位任务端 browser smoke、customer_config active revision 读回和采购入库浏览器真实写入；若后续触达控制台交互/布局，再补 `STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop` 浏览器级回归。
- 阻塞/风险：本组只改 dev-only 控制台错误提示和静态守卫；未调用后端、未发布或激活客户配置、未读取 token、未导入真实客户业务数据、未写数据库，不修改 schema、RBAC、customer_config usecase、Workflow / Fact 规则、部署或 release evidence。页面视觉和真实后端错误链路未做浏览器运行时回归，本轮由 T5 静态/单测/fast 覆盖错误提示边界。

## 2026-07-01 Mobile Auth Route Smoke 前置报告

- 完成：为 `web/scripts/mobileAuthLoginRouteSmoke.mjs` 增加 `--preflight-report <path>` no-write 前置报告。报告复用当前移动端应用登记和 phone / iPad 视口真源，记录脚本存在性、9 个岗位 `/m/<role>/tasks` 路由计划、生产单端口覆盖、未登录 / 旧登录态拦截、密码 / 短信登录回跳、Workflow owner_role 查询、通知 / 预警、退出登录 / 返回栈和横向溢出检查口径；不启动 Vite / Playwright、不调用后端 / JSON-RPC、不读取密码、不登录、不保存 token / Authorization header、不写数据库。同步 `web/scripts/README.md`、`scripts/README.md`、`docs/product/自动化测试策略.md`、`/__dev/testing` 的 `real-login-smoke-shared` 预设、`devTesting.test.mjs` 和 `dev-entry-boundary.test.mjs`。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/mobileAuthLoginRouteSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devTesting.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/scripts/mobileAuthLoginRouteSmoke.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 17 个用例；`PATH=/usr/local/bin:$PATH node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json` 通过，报告 `readyForMockSmoke=true`、`blockers=[]`、`roles=9`、`viewports=phone/ipad`、`startsBrowser=false`、`startsDevServer=false`、`callsJSONRPC=false`、`writesDatabase=false`；敏感扫描未发现 Bearer、access_token、Authorization header、示例密码或 token；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route` 通过，已验证 9 个岗位任务端角色的 mock 认证回跳、任务池、通知 / 预警、退出和 phone / iPad 布局。
- 下一步：继续按 goal 推进真实试用账号 RBAC、真实岗位任务端 browser smoke、customer_config active revision 读回和采购入库浏览器真实写入；真正运行 `pnpm --dir web smoke:mobile-auth-login-route` 时仍会启动 Vite / Playwright，但使用 mock auth / workflow RPC，不替代后端 RBAC、真实账号、customer config active revision 或 usecase 测试。
- 阻塞/风险：本组只增加 no-write 路由计划 preflight、测试入口和文档口径；未启动真实浏览器、未登录真实账号、未调用后端 / JSON-RPC、未验证真实菜单投影、未写数据库、未连接生产 / 目标环境、未导入真实客户数据，不修改 schema、RBAC、WorkflowUsecase、Fact usecase、customer_config active revision、部署或 release evidence。

## 2026-07-01 Web README Mobile Auth Preflight 口径同步

- 完成：同步 `web/README.md` 的当前回归命令和移动端认证回跳说明，补上 `node scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json`，并明确该报告只写本地 JSON、记录脚本 / 路由 / phone-iPad 视口 / mock RPC 覆盖口径，不调用后端 / JSON-RPC、不读取密码、不保存 token、不写数据库；真实 `smoke:mobile-auth-login-route` 仍只证明 mock auth / workflow RPC 下的生产单端口岗位路由和登录回跳。
- 验证：`rg -n "mobileAuthLoginRouteSmoke\\.mjs --preflight-report|mobile-auth-login-route-smoke/preflight\\.json|真实后端 RBAC、真实账号" web/README.md docs/product/自动化测试策略.md scripts/README.md web/scripts/README.md web/src/erp/config/devTesting.mjs` 通过，确认 web README、测试策略、脚本 README 和 `__dev/testing` 复制入口口径一致；`git diff --check -- web/README.md` 通过。
- 下一步：继续按 goal 推进真实试用账号 RBAC、真实岗位任务端 browser smoke、customer_config active revision 读回和采购入库浏览器真实写入；若继续触达 README 中其它回归命令，再按影响面补对应测试或引用扫描。
- 阻塞/风险：本组只同步正式 README 文档口径；未改脚本运行逻辑、未启动浏览器、未登录真实账号、未调用后端 / JSON-RPC、未写数据库、未连接生产 / 目标环境、未导入真实客户数据，不修改 schema、RBAC、Workflow / Fact usecase、customer_config active revision、部署或 release evidence。`web/README.md` 中存在本轮前已有的其它未提交改动，本组未回退或重排。

## 2026-07-01 Web README Mobile Workflow Preflight 口径同步

- 完成：同步 `web/README.md` 的移动端 workflow 真实浏览器回归说明，把 `node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json` 写入本地前置路径，并明确该报告只探测 backend health、演示密码 env、Vite 托管需求、试用 customer-config 脚本存在性和模拟任务动作计划 coverage，不读取密码、不调用 JSON-RPC、不启动 Vite / Playwright、不创建任务、不保存 token。
- 验证：`rg -n "mobileWorkflowRuntimeBrowserSmoke\\.mjs --preflight-report|mobile-workflow-runtime-browser-smoke/preflight\\.json|不读取密码值、不调用 JSON-RPC" web/README.md docs/product/自动化测试策略.md scripts/README.md web/scripts/README.md web/src/erp/config/devTesting.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，确认 web README、测试策略、脚本 README 和 `__dev/testing` 复制入口口径一致；`git diff --check -- web/README.md` 通过。
- 下一步：继续按 goal 推进真实试用账号 RBAC、真实岗位任务端 browser smoke、customer_config active revision 读回和采购入库浏览器真实写入；真正运行 `pnpm --dir web smoke:mobile-workflow-runtime-browser` 前仍需要本地后端、前端 runtime 和演示账号密码，并复跑 preflight。
- 阻塞/风险：本组只同步正式 README 文档口径；未运行真实 mobile workflow browser smoke、未读取密码、未登录真实账号、未调用 JSON-RPC、未创建 workflow 任务、未写数据库、未连接生产 / 目标环境、未导入真实客户数据，不修改 schema、RBAC、WorkflowUsecase、Fact usecase、customer_config active revision、部署或 release evidence。

## 2026-07-01 Real Login Shared Preflight 报告

- 完成：为 `web/scripts/realLoginSmokeShared.mjs` 增加 `--preflight-report <path>` no-write 共享前置报告。报告只探测 backend health 和管理员凭据来源候选存在性；不读取 config 内容、不读取或保存密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库。同步 `web/scripts/README.md`、`scripts/README.md`、`docs/product/自动化测试策略.md`、`web/README.md`、`/__dev/testing` 复制入口与 `dev-entry-boundary` 守卫，并保持真实登录 smoke 的下游写库边界显式可见。
- 验证：`PATH=/usr/local/bin:$PATH node --check web/scripts/realLoginSmokeShared.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/scripts/realLoginSmokeShared.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 18 个用例；`PATH=/usr/local/bin:$PATH node web/scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json` 通过；本地脚本断言 `output/real-login-smoke-shared/preflight.json` 与 `preflight-test.json` 不包含 Bearer、access_token、Authorization header、示例密码、password key 或 token；引用扫描覆盖 README、测试策略、`devTesting` 和 dev entry 守卫；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 推进真实试用账号 RBAC、真实岗位任务端 browser smoke、customer_config active revision 读回和采购入库浏览器真实写入；真正运行 `pnpm --dir web smoke:purchase-contract-real-login` / `smoke:processing-contract-real-login` / `smoke:mobile-auth-login-route` 前仍需要本地后端、前端 runtime 和开发账号。
- 阻塞/风险：本组只增加 no-write 共享 preflight、入口测试和文档口径；未登录真实账号、未验证凭据有效性、未调用 auth / JSON-RPC、未启动浏览器、未执行真实合同 smoke、未写数据库、未连接生产 / 目标环境、未导入真实客户数据，不修改 schema、RBAC、WorkflowUsecase、Fact usecase、customer_config active revision、部署或 release evidence。

## 2026-07-01 Customer Config Readback Preflight 脱敏收口

- 完成：收口 `customer-config-release-readiness.mjs --readback-preflight-report` 的 active revision 读回本地诊断边界。preflight 现在对执行器报告和目标 smoke report 的 `backendEndpointAlias` 做 URL userinfo / query / hash 脱敏，只在报告中写入安全 alias，并把 credentialed alias 记为 blocker；正式 readiness 的 `--require-executed` 和 `--require-activated` 继续拒绝带账号密码的 release / smoke backend alias。同步 `scripts/README.md` 和 `docs/product/自动化测试策略.md`。
- 验证：`PATH=/usr/local/bin:$PATH node --check scripts/deploy/customer-config-release-readiness.mjs && PATH=/usr/local/bin:$PATH node --check scripts/deploy/customer-config-release-readiness.test.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/run-smoke-script.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/customer-package-lint.test.mjs scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devTesting.test.mjs` 通过，共 71 个用例；`PATH=/usr/local/bin:$PATH node --test scripts/qa/docs-inventory.test.mjs` 通过；重新生成 `output/customers/yoyoosun/customer-config-runtime-manifest.json` 和 `output/customers/yoyoosun/customer-config-readback-preflight.json` 通过，报告 `readyForReadinessGate=false`、blockers 为 `missing-effective-session-verification` / `missing-smoke-report`，敏感扫描未发现 Bearer、access_token、Authorization header、URL userinfo、token、password 或 secret；`git diff --check -- scripts/deploy/customer-config-release-readiness.mjs scripts/deploy/customer-config-release-readiness.test.mjs docs/product/自动化测试策略.md scripts/README.md` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按 goal 推进真实试用账号 RBAC、真实岗位任务端 browser smoke、customer_config active revision 目标环境读回、采购入库真实写入和 P5 release evidence；具备目标后端、管理员 token、目标 smoke endpoint 和真实发布证据后，再跑 `--require-executed --require-activated`。
- 阻塞/风险：本组仍是 no-write 本地诊断闭环；未调用目标后端、未读取管理员 token 值、未写 release evidence、未执行 publish / activate / rollback、未连接生产或目标环境、未写数据库、未导入客户数据，不证明 active revision 已读回。当前本地 `git fetch --prune` 曾因 GitHub SSH `Can't assign requested address` 失败，远端同步状态仍有盲区。

## 2026-07-01 Trial / Mobile Workflow Preflight 证据刷新

- 完成：按当前 goal 继续刷新试用账号、试用浏览器 smoke 和岗位任务端 workflow 浏览器 smoke 的本地 no-write 前置证据。已生成 `output/trial-account-rbac/preflight.json`、`output/trial-demo-account-browser-smoke/preflight.json`、`output/mobile-workflow-runtime-browser-smoke/preflight.json`；三份报告均显示未调用 JSON-RPC、不启动浏览器、不写数据库、不保存 token / Authorization header，当前真实阻塞只剩本地演示密码 env 缺失。只读优先级审计仍显示 P0-P4 本地 ready，P5 为 `external-release-evidence-required`，第一条 blocked release action 是 `immutable-version`，因此本轮未进入 release evidence 写入。
- 验证：`git fetch --prune` 通过，`git rev-list --left-right --count HEAD...@{u}` 为 `0 0`；`PATH=/usr/local/bin:$PATH node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 通过并输出 P5 目标 evidence 缺口；`PATH=/usr/local/bin:$PATH node --check scripts/qa/trial-account-rbac.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/trialDemoAccountBrowserSmoke.mjs && PATH=/usr/local/bin:$PATH node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-account-rbac.test.mjs web/scripts/trialDemoAccountBrowserSmoke.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/trial-role-entry-docs.test.mjs` 通过，共 22 个用例；三份 preflight 报告敏感扫描未发现 Bearer、access_token、Authorization、URL userinfo、password、token 或 secret。
- 下一步：如果本地后端和演示密码可用，可继续运行 `TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/trial-account-rbac.mjs --report output/trial-account-rbac/report.json`、`TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node web/scripts/trialDemoAccountBrowserSmoke.mjs ...` 和 `MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:mobile-workflow-runtime-browser`；否则继续推进不需要密码的字段链路、错误提示、`/__dev/testing` 入口和文档口径一致性闭环。
- 阻塞/风险：本组只刷新 no-write preflight 和静态/单测证据；未登录真实账号、未验证 RBAC 真实会话、未启动 Vite / Playwright、未创建 `simulated_only` workflow 任务、未调用后端、未写数据库、未连接目标环境、未写 release evidence、未导入真实客户数据，不证明真实岗位任务端 browser smoke 已通过。

## 2026-07-01 PDF Preview 错误提示边界收口

- 完成：收口共享 PDF 预览窗口的用户可见错误提示。`web/src/erp/utils/printPdf.mjs` 现在复用 `getActionErrorMessage(error, '生成 PDF 预览')` 渲染预览壳失败状态，不再直接把 `error.message` 透传到弹出的 PDF 预览页；`scripts/qa/frontend-error-message-boundary.test.mjs` 增加 PDF preview shell 守卫，避免后续共享打印预览层回退到 raw error message。同步 `web/src/erp/config/devTesting.mjs`、`scripts/README.md` 和 `docs/product/自动化测试策略.md`，明确该边界覆盖正式页面、组件、岗位任务端和共享 PDF 预览工具。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/frontend-error-message-boundary.test.mjs` 通过，共 4 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/printPdf.mjs` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/common/utils/errorMessage.test.mjs` 通过，共 7 个用例；`PATH=/usr/local/bin:$PATH node --test scripts/qa/frontend-error-message-boundary.test.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 16 个用例；`git diff --check -- web/src/erp/utils/printPdf.mjs scripts/qa/frontend-error-message-boundary.test.mjs web/src/erp/config/devTesting.mjs docs/product/自动化测试策略.md scripts/README.md progress.md` 通过；定向 `rg` 确认 `printPdf.mjs` 只剩 `getActionErrorMessage`，不再存在 `String(error?.message || '').trim()` 或 `error?.message || '生成 PDF 预览失败'`。
- 下一步：继续按 goal 推进不需要真实密码的字段链路、错误提示、`/__dev/testing` 入口和文档口径一致性；若后续改动其它共享 util 或打印链路，应把它们纳入同一前端错误提示边界测试。
- 阻塞/风险：本组只修共享前端 PDF 预览错误文案和静态边界测试；未启动浏览器、未打开真实 PDF 预览弹窗、未调用 `/templates/render-pdf`、未连接后端、未登录真实账号、未写数据库、未修改打印字段 mapper / 模板 / 业务表单字段链路，不证明 PDF 渲染服务或真实打印字段已完整验收。

## 2026-07-01 Dev Testing 与销售订单字段链路守卫补强

- 完成：补强 `__dev/testing` 和字段链路测试守卫。`web/src/erp/config/devTesting.test.mjs` 与 `scripts/qa/dev-entry-boundary.test.mjs` 现在直接断言 `frontend-error-messages` 预设说明覆盖“共享 PDF 预览”，避免复制入口口径退回只覆盖页面 / 组件 / 岗位任务端；`scripts/qa/sales-order-field-chain-boundary.test.mjs` 增加 `sales_order_items.default` 后端登记表禁入断言，确保销售订单明细字段在详情、打印和 active field policy 未完整闭环前不会被 `customer_config` 后端 validator 当成可发布 surface。同步 `web/src/erp/config/devTesting.mjs` 的 `business-action-field-boundaries` 描述，把它从“只证明本地前端边界守卫”改为“本地前端、文档和后端登记表静态边界守卫”，并用 `devTesting.test.mjs` / `dev-entry-boundary.test.mjs` 锁住。
- 验证：`git fetch --prune` 通过，`git status -sb` 显示当前分支仍为 `main...origin/main` 且没有远端落后提示；`wc -l -c progress.md` 为 `90 / 23369`，低于归档阈值；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/frontend-error-message-boundary.test.mjs` 通过，共 16 个用例；`PATH=/usr/local/bin:$PATH node --test scripts/qa/sales-order-field-chain-boundary.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 11 个用例；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 23 个用例；`git diff --check -- web/src/erp/config/devTesting.mjs web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs progress.md` 通过。
- 下一步：继续按 goal 推进不需要真实账号和后端写入的本地一致性闭环；优先从字段链路、错误提示、任务端状态和 `__dev/testing` 当前入口中挑选可由静态 / 单测证明的缺口。
- 阻塞/风险：本组只补测试守卫和本地入口口径，不发布 `sales_order_items.default`，不新增字段策略 surface，不修改客户配置包 raw 数据，不改销售订单表单 / 详情 / 打印 mapper，不登录真实账号、不调用后端、不写数据库、不连接生产或目标环境，因此不证明销售订单明细打印、详情字段策略或真实客户字段导入已完成。

## 2026-07-01 移动端任务动作 explain 与状态分类守卫

- 完成：补强移动端任务动作的 RBAC / 后端合同静态守卫。`scripts/qa/workflow-ui-action-boundary.test.mjs` 现在直接检查 `web/src/erp/mobile/hooks/useMobileRoleTaskActions.js`：阻塞 / 退回 reason 必填校验必须先于后端 explain；完成、阻塞、退回、催办提交前必须先调用 `explainWorkflowActionAccess`；后端返回不允许时必须显示 `action.reason || 当前账号不能提交这个任务动作`，防止移动端后续退回成只靠按钮显隐或直接提交 `complete/block/reject/urge` action 的路径。`web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs` 同步锁住 `blocked / rejected` 不是移动端已办终态，仍应留在待办风险态并允许 PMC 催办。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过，共 18 个用例；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs` 通过，共 23 个用例；`PATH=/usr/local/bin:$PATH node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs` 通过，共 29 个用例；`git diff --check -- scripts/qa/workflow-ui-action-boundary.test.mjs web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs progress.md` 通过。
- 下一步：继续按 goal 推进移动端任务端真实浏览器 smoke 的 no-write preflight、试用账号 RBAC 或字段链路静态闭环；若本地后端和演示密码可用，再运行真实 `smoke:mobile-workflow-runtime-browser`。
- 阻塞/风险：本组只补本地静态合同和移动端纯规则测试；未启动 Vite / Playwright、未登录真实账号、未调用 `explain_action_access` 后端、未提交真实 workflow action、未写数据库、未连接目标环境或生产，因此不证明真实岗位任务端 browser smoke、后端 RBAC 会话或任务状态写入已通过。

## 2026-07-01 Workflow action explain moduleState 后端门禁同步

- 完成：同步 `explain_action_access` 与真实 workflow task action 的 `workflow_tasks` moduleState 门禁。`server/internal/service/jsonrpc_workflow.go` 现在把 `explain_action_access` 纳入 `workflowMethodRequiresEnabledModule`，避免 customer config 将 workflow tasks 置为 `read_only` / disabled 时，移动端先拿到 `allowed=true`，但实际 `complete/block/reject/urge` 被后端写入门禁拒绝的合同漂移。`server/internal/service/jsonrpc_workflow_test.go` 在现有 `WorkflowWriteAPIRequiresEnabledModule` 用例中补充 read_only explain 断言，锁住 explain action preflight 不绕过模块写入门禁。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_Workflow(WriteAPIRequiresEnabledModule|ExplainActionAccess|ActionRequiresCustomerWorkPoolActionEntitlement|ControlledTaskActions|CompleteTaskAction|UrgeTask)'` 通过；`cd server && go test ./internal/service` 通过。
- 下一步：继续按 goal 推进任务端真实浏览器 smoke / 试用账号 RBAC 或不需真实密码的字段链路守卫；若后续需要页面层提示更细，可在前端把 `explain_action_access` 模块门禁错误映射成“当前客户配置未开放任务动作”的场景化文案。
- 阻塞/风险：本组只改 JSON-RPC 后端门禁与测试，不改 schema、RBAC 权限码、customer config 数据、WorkflowUsecase、Fact usecase、移动端 UI 或真实账号；未启动浏览器、未调用真实后端会话、未提交 workflow action、未写数据库、未连接生产 / 目标环境。

## 2026-07-01 Mobile action explain 错误提示守卫

- 完成：补强移动端任务动作 explain 失败时的用户可见错误守卫。`scripts/qa/workflow-ui-action-boundary.test.mjs` 现在断言 `useMobileRoleTaskActions.js` 必须导入并使用 `getActionErrorMessage(error, '核对任务动作权限失败')`，防止 `explain_action_access` 因 moduleState / RBAC / transport 失败时回退为 raw `error.message` 或底层英文异常。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过，共 18 个用例。
- 下一步：继续按 goal 推进真实任务端 browser smoke preflight、试用账号 RBAC 或字段链路静态闭环；若后续改动后台端 workflow action 页面，也应检查同类 explain / action 错误提示边界。
- 阻塞/风险：本组只补静态测试守卫，不改移动端 UI 运行时代码、不启动浏览器、不登录真实账号、不调用 JSON-RPC、不写数据库；不证明真实 moduleState 关闭场景下的浏览器 toast 文案已运行时验收。

## 2026-07-01 后台 Workflow action access 失败态禁用本地 fallback

- 完成：收口后台协同任务动作权限核对失败态。`web/src/erp/utils/workflowTaskActionAccess.mjs` 现在在 `explain_action_access` 请求失败时保持 `source=fallback_failed`，但不再使用本地角色推断放开 `complete/block/urge`，而是统一返回不可操作和“无法核对后端任务动作权限，请刷新后重试。”，避免 moduleState、RBAC 或网络失败时后台协同面板误显示可执行按钮。同步 `workflowTaskActionAccess.test.mjs` 覆盖本地 owner 具备权限但后端 explain 失败时仍禁用所有动作。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs` 通过，共 6 个用例；`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过，共 18 个用例。
- 下一步：继续检查后台协同动作页、任务端和 `__dev/testing` 的 moduleState / RBAC 可见性口径；若后续触达页面布局或真实交互，再补对应 browser / style:l1 回归。
- 阻塞/风险：本组只改前端状态合成和单测，不改后端、schema、RBAC、customer config、WorkflowUsecase 或 Fact usecase；未启动浏览器、未登录真实账号、未调用真实 JSON-RPC、未写数据库，不证明真实后台页面 toast / 按钮状态已浏览器验收。

## 2026-07-01 Workflow assignment explain moduleState 门禁同步

- 完成：同步 `explain_task_assignment` 与真实 workflow task action 的 `workflow_tasks` moduleState 门禁。`server/internal/service/jsonrpc_workflow.go` 现在把 `explain_task_assignment` 纳入 `workflowMethodRequiresEnabledModule`，避免该只读解释入口在 moduleState `read_only` / disabled 时仍返回 `can_handle=true` 或 `can_urge=true`，而真实 `complete/block/reject/urge` 写入被后端拒绝。`jsonrpc_workflow_test.go` 在 read_only 门禁用例中补充 assignment explain 拒绝断言。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_Workflow(WriteAPIRequiresEnabledModule|ExplainTaskAssignment|ExplainActionAccess)'` 通过；`cd server && go test ./internal/service` 通过。
- 下一步：继续按 goal 推进后台/任务端 moduleState 关闭时的可见提示、试用账号 RBAC 或无需真实账号的字段链路守卫；若后续有页面消费 `explain_task_assignment`，应确认失败态不展示可处理按钮。
- 阻塞/风险：本组只改 JSON-RPC 门禁和测试，不改 schema、RBAC 权限码、customer config 数据、WorkflowUsecase、Fact usecase 或前端页面；未启动浏览器、未登录真实账号、未调用真实后端会话、未写数据库。

## 2026-07-01 Dev Testing Workflow action access 入口同步

- 完成：同步 `__dev/testing` 的“业务动作与字段链路”复制入口，把 `web/src/erp/utils/workflowTaskActionAccess.test.mjs` 纳入当前命令，避免前端 action access helper 的后端 explain 优先、失败态禁用动作、stale / abort request 守卫只存在于代码测试而不出现在开发验收入口。同步 `devTesting.test.mjs`、`dev-entry-boundary.test.mjs`、`scripts/README.md` 和 `docs/product/自动化测试策略.md` 的命令口径。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 12 个用例；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs scripts/qa/frontend-error-message-boundary.test.mjs` 通过，共 22 个用例；定向 `rg` 确认 `workflowTaskActionAccess.test.mjs` 已出现在 devTesting、dev-entry 守卫、scripts README 和自动化测试策略中。
- 下一步：继续按 goal 推进 `__dev/testing` 其它当前入口与真实可运行命令的一致性，或转向试用账号 RBAC / 字段链路静态闭环。
- 阻塞/风险：本组只同步本地开发验收入口和正式文档命令，不启动浏览器、不登录真实账号、不调用后端、不写数据库；不证明真实后台协同页面在 moduleState 关闭时的浏览器按钮状态已验收。

## 2026-07-01 Dev Testing 客户配置 runtime 守卫入口补齐

- 完成：补齐 `__dev/testing` 的“客户配置包运行时”复制入口，把 `scripts/deploy/customer-config-release-readiness.test.mjs` 和 `scripts/deploy/run-smoke-script.test.mjs` 纳入首条 no-write 单测命令，和 `docs/product/自动化测试策略.md` 中 active revision 读回前置、readiness、目标 smoke 输入边界口径对齐。同步 `devTesting.test.mjs` 与 `dev-entry-boundary.test.mjs` 断言，防止入口退回只跑 lint / runtime manifest / release execute 三个测试。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 12 个用例；`PATH=/usr/local/bin:$PATH node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/run-smoke-script.test.mjs` 通过，共 75 个用例。
- 下一步：继续按 goal 检查 `__dev/testing` 其它预设与正式测试策略是否仍有命令范围漂移；也可转向试用账号 RBAC 或移动端真实 smoke preflight 的本地无写入证据。
- 阻塞/风险：本组只改 dev-only 复制入口和静态守卫，不执行 publish / activate / rollback，不调用 `get_effective_session`，不运行目标 smoke，不触网、不读取 token、不写 release evidence、不写数据库；不证明 active revision 已在目标环境读回。

## 2026-07-01 Dev Testing 失效脚本入口静态守卫

- 完成：在 `web/src/erp/config/devTesting.test.mjs` 增加通用路径存在性守卫，扫描 `DEV_TESTING_COPY_PRESETS` 中所有本地 `.mjs` / `.js` / `.sh` 脚本引用，要求对应文件在当前仓库真实存在。该守卫把本轮手工扫描沉淀为自动测试，避免 `/__dev/testing` 后续出现可复制但已失效的脚本入口。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 13 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-testing-light-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 2 个场景；`git diff --check -- web/src/erp/config/devTesting.test.mjs` 通过。附带无写入回归：角色菜单与入口配置 27 个用例通过；试用账号 RBAC / 浏览器 smoke 边界 12 个用例通过；试用模拟数据 / MVP closure / 采购入库 real-write preflight 35 个用例通过；移动端 runtime smoke preflight / 客户配置前端投影 / 多客户角色优先级审计 42 个用例通过。
- 下一步：继续推进 `__dev/testing` 与正式测试策略的命令口径一致性，或转向页面级 / style:l1 的本地浏览器回归入口。
- 阻塞/风险：本组只证明复制入口引用的本地脚本文件存在，并运行相关 no-write 单测；不启动 Vite / Playwright，不登录真实账号，不调用后端，不写数据库，不证明真实浏览器 smoke、目标环境 customer config active revision 或业务事实写入已通过。

## 2026-07-01 Dev Testing 当前文档命令块脚本守卫

- 完成：在 `scripts/qa/dev-entry-boundary.test.mjs` 增加 `/__dev/testing` 当前白名单文档命令块守卫。测试复用 `extractDevTestingCommandBlocks` 解析当前索引文档的 fenced command block，并按命令块中的 `cd` 维护工作目录，确认文档里展示的本地 `.mjs` / `.js` / `.sh` 脚本引用真实存在，覆盖 `web/README.md` 这类以 `web/` 为工作目录的相对路径，避免把可复制文档入口退回失效命令。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devTesting.test.mjs` 通过，共 14 个用例；`git diff --check -- scripts/qa/dev-entry-boundary.test.mjs web/src/erp/config/devTesting.test.mjs` 通过。
- 下一步：继续按 goal 推进开发验收入口与真实 no-write / browser 预检的一致性；若触达可见 `DevTestingPage` 布局或复制卡片内容，再跑对应 `dev-testing-*` style:l1 场景。
- 阻塞/风险：本组只校验当前白名单文档命令块里的本地脚本存在性，不执行这些文档命令、不启动浏览器、不登录账号、不调用后端、不写数据库；不证明真实 smoke、采购入库真实写入、目标环境 customer config 读回或 release evidence 已完成。

## 2026-07-01 移动端最近动态 action key 可见文案收口

- 完成：收口岗位任务端详情“最近动态”的动作展示。`web/src/erp/mobile/utils/mobileRoleTaskModel.mjs` 新增 `resolveMobileActionLabel`，把 `blocked / done / rejected / urge` 映射为“阻塞 / 完成 / 退回 / 催办”，`MobileTaskDetailScreen.jsx` 不再直接展示 `latestMobileAction.action_key`，避免通知 / 最近动态出现技术 action key。`mobileRoleTaskModel.test.mjs` 补充未知 action 回退为“移动处理”的单测。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 48 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景；`git diff --check -- web/src/erp/mobile/utils/mobileRoleTaskModel.mjs web/src/erp/mobile/components/MobileTaskDetailScreen.jsx web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs` 通过；`rg` 确认移动端详情不再直接拼接 `action_key`。
- 下一步：继续检查移动端通知 / 预警 / 详情的用户可见文案是否仍有 raw key 或技术字段泄漏，或转向试用账号真实 smoke preflight 缺口。
- 阻塞/风险：本组只改移动端详情文案映射和本地测试，不改后端 action key、WorkflowUsecase、RBAC、customer config、真实任务数据或移动端真实登录流程；未登录真实账号、未调用 JSON-RPC、未写数据库，不证明真实后端返回的所有历史 action payload 都已完整清洗。

## 2026-07-01 移动端 task_group / owner_role_key 可见文案收口

- 完成：继续收口岗位任务端用户可见技术字段。`web/src/erp/mobile/utils/mobileRoleTaskModel.mjs` 新增 `getMobileTaskGroupLabel`，把任务列表摘要和详情事实行中的 `task_group` fallback 改为“销售订单受理 / 出货放行协同 / 业务协同”等业务标签，不再显示 `order_approval`、`shipment_release` 或未知 raw key；`MobileTaskDetailScreen.jsx` 的“最近动态”无动作记录 fallback 改为 `ownerRoleLabel`，不再拼接 `owner_role_key`。`mobileRoleTaskModel.test.mjs` 补充摘要 / 事实行不透出 `task_group` 的单测，`workflow-ui-action-boundary.test.mjs` 增加详情最近动态 fallback 静态守卫。
- 验证：`git fetch --prune` 通过，`git status -sb` 显示当前分支仍为 `main...origin/main` 且工作区有既有未提交改动；`wc -l -c progress.md` 为 `167 / 41530`，低于归档阈值；`PATH=/usr/local/bin:$PATH node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 50 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/mobile/utils/mobileRoleTaskModel.mjs && PATH=/usr/local/bin:$PATH node --check scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；定向 `rg` 确认运行时代码不再命中 `分组：`、`['分组'`、`任务已流转至 ${roleLabel}` 或 `owner_role_key || '-'` 旧 fallback。
- 下一步：继续按 goal 检查移动端消息 / 我的页 / 后台协同面板是否仍有业务用户可见 raw key、裸 source id 或技术字段；也可转向试用账号 RBAC 和 no-write browser preflight 缺口。
- 阻塞/风险：本组只改移动端展示层 helper、详情文案和本地测试，不改后端 `task_group` / `owner_role_key` 真源，不改 WorkflowUsecase、RBAC、customer config、真实任务数据或登录流程；未登录真实账号、未调用 JSON-RPC、未写数据库，不证明真实历史任务 payload 中所有字段都已经被业务化展示。

## 2026-07-01 移动端我的页 role_key fallback 文案收口

- 完成：收口岗位任务端“我的 / 账号角色”角色名称缺失时的 fallback。`MobileTaskListScreen.jsx` 现在使用 `getMobileRoleLabel(role?.role_key)` 转换角色 key，不再把 `boss / warehouse / finance` 等技术 key 直接作为可见角色名称；`workflow-ui-action-boundary.test.mjs` 增加静态守卫，防止该区域退回 `role?.name || role?.role_key`。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 51 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；定向 `rg` 确认运行时代码不再命中 `role?.name || role?.role_key`、`任务已流转至 ${roleLabel}`、`owner_role_key || '-'`、`分组：` 或 `['分组'` 旧 fallback。
- 下一步：继续检查移动端其它可见区域和后台协同面板是否仍有 raw key / 裸 source id；或转向试用账号 RBAC 和 no-write browser preflight 缺口。
- 阻塞/风险：本组只改移动端“我的”页展示 fallback 和静态守卫，不改 admin profile 后端结构、角色真源、RBAC、customer config 或登录流程；未登录真实账号、未调用后端、不写数据库。

## 2026-07-01 岗位任务端 Current 原型参考同步

- 完成：同步 `docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html`，让 Current/as-built 参考跟运行时移动端语义一致：底部动作栏改为阻塞 / 完成 / 催办三列，不再保留无后端合同的“处理”按钮；最近动态不再显示 `仓库组 / warehouse`；原因输入 placeholder 对齐运行时“说明卡点、退回依据或催办诉求”；我的页账号角色不再显示 `仓库 / demo`。同步 `README.md` 文件说明，并在 `web/src/erp/config/devPrototypes.test.mjs` 增加静态 guard，防止 Current 参考退回旧动作和 raw key 文案。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devPrototypes.test.mjs scripts/qa/dev-entry-boundary.test.mjs` 通过，共 12 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/config/devPrototypes.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；定向 `rg` 确认旧动作 / 技术 key 文案只剩测试 guard 中的禁止字符串，`repeat(4...)` 命中的是指标、筛选和底部导航等非动作栏四列布局。
- 下一步：继续按 goal 推进移动端 / 原型 / __dev 入口一致性，或转向试用账号 RBAC、no-write browser preflight 与后台协同面板 raw key 检查。
- 阻塞/风险：本组只同步 Current 原型参考、README 和 dev-only 测试，不改运行时代码、正式菜单、RBAC、WorkflowUsecase、Fact usecase、客户配置或真实账号；未登录真实账号、不调用后端、不写数据库。`git fetch --prune` 本轮首次因本机到 GitHub SSH 报 `Can't assign requested address` 失败，收口重试已通过；当前本地工作区状态仍以后续 `git status -sb` 为准。

## 2026-07-01 后台任务责任角色 raw key 文案收口

- 完成：收口后台任务看板、业务协同面板和任务动作抽屉的 `owner_role_key` 可见 fallback。`workflowTaskBoard.mjs` 新增 `getWorkflowTaskOwnerRoleLabel` 统一把责任角色 key 映射为业务标签；`DashboardPage.jsx`、`WorkflowBusinessModulePage.jsx`、`CollaborationTaskPanel.jsx` 和 `WorkflowTaskActionDrawer.jsx` 改为使用业务标签或兜底“责任岗位”，异常流说明不再展示 `owner_role_key`。同步 `workflowTaskBoard.test.mjs` 与 `workflow-ui-action-boundary.test.mjs`，锁住后台任务 UI 不再回退到 `warehouse` 等 raw key。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/workflowTaskBoard.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 22 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/workflowTaskBoard.mjs && PATH=/usr/local/bin:$PATH node --check scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-task-board-desktop,business-collaboration-purchase-selected-desktop pnpm style:l1` 在 `web/` 下通过，共 2 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续按 goal 检查后台业务页、打印字段链路、试用账号 RBAC 和 no-write browser preflight 中是否仍有用户可见技术 key 或字段链路漂移。
- 阻塞/风险：本组只改后台前端展示 helper、页面/组件消费和本地测试，不改后端 `owner_role_key` 真源、RBAC、customer config、WorkflowUsecase、Fact usecase 或真实任务数据；未登录真实账号、未调用真实 JSON-RPC、未写数据库，不证明所有历史任务 payload 的其它技术字段都已业务化展示。

## 2026-07-01 移动端任务可见性解释 raw key 文案收口

- 完成：收口岗位任务端可见性解释和查询计划说明中的技术字段文案。`mobileTaskView.mjs` 的 `explainMobileTaskVisibility` 现在把主责岗位、终态、阻塞 / 退回、关键路径、出货风险、财务高风险、业务确认角色、委外责任标记、来源和任务组都表达为业务可读文案；`mobileTaskQueries.mjs` 的查询解释不再写“按 owner_role_key 直查”，改为“按主责岗位直查任务池”。同步 `mobileTaskView.test.mjs`、`mobileTaskQueries.test.mjs` 和 `workflow-ui-action-boundary.test.mjs`，锁住 explanation 的可见文本数组不再包含 `owner_role_key / task_group / source_type / payload` 等技术名。
- 验证：`git fetch --prune` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/mobileTaskQueries.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 36 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/mobileTaskView.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/mobileTaskQueries.mjs && PATH=/usr/local/bin:$PATH node --check scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；定向 `rg` 确认旧解释片段只剩测试 guard 和测试正则。
- 下一步：继续按 goal 推进试用账号 RBAC / no-write browser preflight、后台业务页字段链路、打印 mapper 或客户配置导入控制台的本地闭环缺口。
- 阻塞/风险：本组只改前端移动端 helper 的解释文案和本地测试，不改查询参数、返回结构、后端 `owner_role_key / task_group / source_type` 真源、RBAC、WorkflowUsecase、Fact usecase、customer config 或真实任务数据；未登录真实账号、未调用真实 JSON-RPC、未写数据库，不证明真实账号下所有历史任务 payload 都已完整业务化展示。

## 2026-07-01 单位显示未知引用 raw id 收口

- 完成：收口共享单位展示 helper 的未知引用 fallback。`masterDataOrderView.mjs` 的 `formatUnitDisplayName` 和 `formatUnitShortDisplayName` 在单位字典缺失或历史记录只保留单位 ID 时，不再显示“未知单位 #99”或“单位 #99”，统一回退为“单位已关联”；`userVisibleTechnicalFields.test.mjs` 纳入 `masterDataOrderView.mjs` 扫描并禁止“未知单位 #”这类业务可见 raw id 文案。
- 验证：`git fetch --prune` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/masterDataOrderView.test.mjs web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 18 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/masterDataOrderView.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/masterDataOrderView.test.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 未发现 `未知单位 #`、`单位 #`、`客户 #`、`供应商 #`、`材料 #`、`产品 #`、`SKU #`、`仓库 #`、`销售订单 #`、`采购订单 #`、`出货单 #` 这类运行时代码 fallback；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。曾尝试直接运行内部子场景 `business-standard-inventory`，style:l1 正确拒绝该名称，随后改跑外层正式场景通过。
- 下一步：继续按 goal 检查其它共享字段展示 helper、打印 mapper、导出列和客户配置导入控制台是否仍有 raw id / 技术字段口径漂移。
- 阻塞/风险：本组只改前端共享显示 helper 与本地测试，不改单位真源、后端 schema、migration、RBAC、JSON-RPC、导入逻辑或真实业务数据；未登录真实账号、未调用真实后端、不写数据库，不证明所有历史记录的单位字典缺失场景都已由真实后端回补。

## 2026-07-01 业务事实选中标签 raw id fallback 收口

- 完成：收口 operational facts 页选中记录标签的业务编号 fallback。`OperationalFactForms.jsx` 的 `recordNoForKey` 在出货、库存预留、生产、委外、财务事实缺少业务单号时，不再把 `record.id` 当业务编号展示，改为“出货单已关联 / 库存预留已关联 / 业务事实已关联”等业务可读状态；`userVisibleTechnicalFields.test.mjs` 增加静态守卫，禁止退回 `record.*_no || record.id`。
- 验证：`git fetch --prune` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 6 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认 operational facts 运行时代码不再命中 `record.(shipment_no|reservation_no|fact_no) || record.id` 或 `出货单 # / 库存预留 # / 业务事实 #` 这类 fallback；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`git diff --check -- web/src/erp/components/operational-facts/OperationalFactForms.jsx web/src/erp/utils/userVisibleTechnicalFields.test.mjs progress.md` 通过。
- 下一步：继续检查 operational facts 相关导出、打印 mapper、附件/关联菜单和其它业务页 selected label 是否还存在把内部 ID 当业务编号展示的路径。
- 阻塞/风险：本组只改前端展示 fallback 与本地静态测试，不改后端事实真源、schema、migration、RBAC、JSON-RPC、导入逻辑、真实业务数据或 CSV 导出字段；未登录真实账号、未调用真实后端、不写数据库，不证明历史数据缺单号时后端已完成业务编号回补。

## 2026-07-01 销售订单客户选项 ID fallback 收口

- 完成：收口销售订单表单客户下拉选项的客户编码 fallback。`SalesOrderForm.jsx` 在客户编码缺失时不再显示 `customer.id - 客户名`，改为优先显示客户名，客户名也缺失时显示“客户已关联”；有客户编码时仍保持“编码 - 客户名”的业务可读格式。`userVisibleTechnicalFields.test.mjs` 增加静态守卫，禁止退回 `customer.code || customer.id`。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 7 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认业务前端运行时代码不再存在 `code/sku/no || *.id` 形式的可见 label fallback；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查采购订单、任务编号、导出列和打印 mapper 是否仍有把内部 ID 当业务编号、客户编码或来源编号展示的路径。
- 阻塞/风险：本组只改销售订单前端表单选项与静态守卫，不改客户主数据真源、后端 schema、migration、RBAC、JSON-RPC、导入逻辑或真实客户数据；未登录真实账号、未调用真实后端、不写数据库，不证明所有历史客户都已补齐客户编码。

## 2026-07-01 采购订单来源供应商 ID fallback 收口

- 完成：收口采购订单页从来源记录解析供应商名称时的 ID fallback。`V1PurchaseOrdersPage.jsx` 在供应商快照和当前供应商字典都缺失、但来源仍有关联供应商时，不再把 `supplier_id` 当供应商名称展示，改为“供应商已关联”；`userVisibleTechnicalFields.test.mjs` 增加静态守卫，禁止退回 `source.supplier_id ||`。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 8 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认采购订单页不再命中 `source.supplier_id ||`，剩余 `supplier_id` 命中只在排序值或表单参数层；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查后台任务编号、导出列和打印 mapper 是否仍有把内部 ID 当业务编号展示的路径。
- 阻塞/风险：本组只改采购订单前端展示 fallback 与本地静态测试，不改供应商主数据真源、来源单据保存、后端 schema、migration、RBAC、JSON-RPC、导入逻辑或真实业务数据；未登录真实账号、未调用真实后端、不写数据库，不证明历史供应商快照缺失已由后端回补。

## 2026-07-01 后台任务编号 ID fallback 收口

- 完成：收口后台任务编号缺失时的 `TASK-${id}` 可见 fallback。`workflowTaskBoard.mjs` 新增 `getWorkflowTaskCodeLabel`，统一在缺少 `task_code` 时显示“任务已关联”；`WorkflowBusinessModulePage.jsx` 的选中条、任务编号列和导出值，以及 `WorkflowTaskActionDrawer.jsx` 的任务 tag 都改为使用该 helper。同步 `workflowTaskBoard.test.mjs` 和 `workflow-ui-action-boundary.test.mjs`，锁住业务协同页和任务动作抽屉不再用内部任务 ID 拼可见任务编号。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/workflowTaskBoard.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过，共 24 个用例，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/workflowTaskBoard.mjs && PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/workflowTaskBoard.test.mjs && PATH=/usr/local/bin:$PATH node --check scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；定向 `rg -n 'TASK-'` 确认运行时代码不再命中，剩余只在测试守卫；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-task-board-desktop,business-collaboration-purchase-selected-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 2 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查导出列、打印 mapper、附件 / 关联菜单和 operational facts 列配置里的其它 raw id fallback。
- 阻塞/风险：本组只改后台任务前端展示 helper、页面/抽屉消费和本地测试，不改后端 `task_code` 生成规则、WorkflowUsecase、RBAC、JSON-RPC、真实任务数据或导出后端；未登录真实账号、未调用真实后端、不写数据库，不证明历史任务都已补齐业务任务编号。

## 2026-07-01 BOM 导出与选中项 ID fallback 收口

- 完成：收口 BOM 管理页的导出字段和选中项 fallback。`BOMVersionsPage.jsx` 的 CSV 导出不再输出“产品ID”和裸 `product_id`，改为“产品”并通过 `referenceLabel(productOptions, product_id, '产品')` 输出业务可读产品标签；当前操作选中项在 BOM 版本号缺失时不再拼 `BOM ${id}`，改为“BOM 已关联”。`userVisibleTechnicalFields.test.mjs` 增加 BOM 定向守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 9 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认 `产品ID` 和 `BOM ${record.id}` 只剩测试禁止正则；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查 BOM 明细、打印 mapper、导出列和其它业务页 CSV / selected item label 是否仍有内部 ID 当业务字段输出。
- 阻塞/风险：本组只改前端 BOM 页面导出 view model、选中项文案和静态测试，不改 BOM schema、后端导出、JSON-RPC、RBAC、客户配置、真实 BOM 数据或产品主数据；未登录真实账号、未调用真实后端、不写数据库，不证明历史 BOM 都已补齐产品业务编码。

## 2026-07-01 委外订单引用选项缺值 fallback 收口

- 完成：收口委外订单表单引用选项缺字段时的空白 label 风险。`OutsourcingOrderForm.jsx` 的 `supplierLabel / productLabel / processLabel / unitLabel` 在编码、名称、分类等业务字段都缺失时，分别回退为“供应商已关联 / 产品已关联 / 工序已关联 / 单位已关联”，避免下拉出现空选项或后续误补内部 ID。`userVisibleTechnicalFields.test.mjs` 增加委外表单定向守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 10 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认委外 label helper 已包含四类“已关联” fallback；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查销售 / 采购 / 出货表单行级引用、打印 mapper 和导出列是否仍有空白 fallback 或内部 ID 伪装业务字段。
- 阻塞/风险：本组只改委外订单前端表单 option label helper 和本地静态测试，不改主数据真源、后端 schema、migration、RBAC、JSON-RPC、导入逻辑或真实业务数据；未登录真实账号、未调用真实后端、不写数据库，不证明历史供应商、产品、工序、单位主数据都已补齐业务编码或名称。

## 2026-07-01 采购订单引用选项缺值 fallback 收口

- 完成：收口采购订单表单引用选项缺字段时的空白 label 风险。`PurchaseOrderForm.jsx` 的 `supplierLabel / materialLabel` 在供应商或材料编码、名称都缺失时，分别回退为“供应商已关联 / 材料已关联”，避免下拉和导入选择器出现空白可见项。`userVisibleTechnicalFields.test.mjs` 增加采购表单定向守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 11 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认采购 label helper 已包含“供应商已关联 / 材料已关联” fallback；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查销售订单 SKU / 联系人、出货来源导入和打印 mapper 是否仍有空白 fallback、内部 ID 或技术字段进入业务可见层。
- 阻塞/风险：本组只改采购订单前端表单 option label helper 和本地静态测试，不改供应商 / 材料主数据真源、后端 schema、migration、RBAC、JSON-RPC、导入逻辑或真实业务数据；未登录真实账号、未调用真实后端、不写数据库，不证明历史供应商和材料主数据都已补齐业务编码或名称。

## 2026-07-01 来源导入选中摘要 ID fallback 收口

- 完成：收口共享来源导入弹窗和销售 / 采购导入调用点的选中摘要 fallback。`SourceImportPickerModal.jsx` 的默认选中标签在缺少业务编号、单号、名称时不再退回 `row.id`，改为“记录已关联”；`SalesOrderForm.jsx` 的 SKU 导入选中摘要改为复用 `skuLabel`，缺字段时显示“SKU 已关联”，联系人选项缺字段时显示“联系人已关联”；`PurchaseOrderForm.jsx` 的材料导入选中摘要改为复用 `materialLabel`，避免 `material.id` 进入业务可见层。`userVisibleTechnicalFields.test.mjs` 增加来源导入定向守卫。
- 验证：`git fetch --prune` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs web/src/erp/utils/referenceSelectOptions.test.mjs` 通过，共 15 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认本组三个文件不再命中 `row.id ||`、`sku?.id ||`、`material?.id ||`；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,business-menu-groups-desktop STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 2 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。额外尝试 `PATH=/usr/local/bin:$PATH pnpm --dir web test -- --runInBand` 未通过，失败点为当前 devTesting 预设脚本清单与 `printPdf.test.mjs`，不在本组修改文件；单独直接 `node --test web/src/erp/utils/printPdf.test.mjs` 因 `@/common` 别名解析失败，按当前命令形态不能作为本组回归证据。
- 下一步：继续检查出货来源导入、打印 mapper、CSV 导出和其它共享业务弹窗是否仍有空白 fallback、内部 ID 或技术字段进入业务可见层。
- 阻塞/风险：本组只改前端导入弹窗展示 fallback、销售 / 采购表单选项 helper 和本地静态测试，不改后端 source import 合同、主数据真源、schema、migration、RBAC、JSON-RPC、导入逻辑或真实业务数据；销售 SKU 导入暂无独立 L1 场景，本轮用静态守卫和销售业务页装载回归覆盖，未登录真实账号、未调用真实后端、不写数据库。

## 2026-07-01 采购入库与来料质检选中标签 ID fallback 收口

- 完成：收口采购入库和来料质检当前操作条的业务单号 fallback。`V1PurchaseReceiptsPage.jsx` 在入库单号缺失时不再把 `selectedRow.id` 当入库单号展示，改为“采购入库单已关联”；`V1QualityInspectionsPage.jsx` 在质检单号缺失时不再把 `selectedRow.id` 当质检单号展示，改为“来料质检单已关联”。`userVisibleTechnicalFields.test.mjs` 增加采购入库 / 来料质检定向守卫。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 13 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认旧 `selectedRow.receipt_no || selectedRow.id` 和 `selectedRow.inspection_no || selectedRow.id` 不再命中；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 1 个场景，覆盖出货、来料质检和入库页面选择态 / 动作禁用区，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查出货来源导入、库存流水导出、打印 mapper 和其它 selected label 是否仍有内部 ID 或技术字段进入业务可见层。
- 阻塞/风险：本组只改前端当前操作条展示 fallback 和本地静态测试，不改采购入库 / 质检后端单号生成、schema、migration、RBAC、JSON-RPC、usecase、导入逻辑或真实业务数据；同文件中已有其它未提交改动保持原样，未登录真实账号、未调用真实后端、不写数据库。

## 2026-07-01 出货弹窗来源追溯技术字段文案收口

- 完成：收口出货业务弹窗来源说明里的技术字段文案。`ShipmentBusinessModal.jsx` 不再向业务用户展示 `sales_order_item_id 追溯`，改为“销售订单行追溯”；`userVisibleTechnicalFields.test.mjs` 将该技术字段短语纳入业务可见禁用词，防止后续出货来源说明退回字段名口径。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 13 个用例；`PATH=/usr/local/bin:$PATH node --check web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过；定向 `rg` 确认 `sales_order_item_id 追溯` 只剩测试禁用词，运行时代码显示“销售订单行追溯”；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=shipment-date-filter-desktop,erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 2 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续检查出货业务弹窗是否需要独立 L1 打开态回归，或继续转向打印 mapper、库存流水导出和其它业务可见字段链路缺口。
- 阻塞/风险：本组只改前端用户可见说明文案和静态守卫，不改 `sales_order_item_id` 作为后端追溯字段的保存合同、Shipment usecase、schema、migration、RBAC、JSON-RPC 或真实出货数据；现有 L1 只覆盖出货页装载和动作投影，未独立打开出货弹窗。

## 2026-07-01 __dev 测试入口与 PDF 预览测试可信度收口

- 完成：修复 `devTesting.test.mjs` 在 `pnpm --dir web test` 下把仓库根脚本误判为缺失的问题；本地脚本存在性校验现在按仓库根解析，不再受 `web/` cwd 影响。同步 `errorMessage.js` 的 common 内部 import 为相对路径，消除 `printPdf.test.mjs` 通过 `printPdf.mjs -> errorMessage.js` 触发的 `@/common` 别名解析失败；`errorMessage.test.mjs` 的 VM 加载器同步兼容相对 import。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devTesting.test.mjs` 通过，共 10 个用例；`PATH=/usr/local/bin:$PATH node --test web/src/common/utils/errorMessage.test.mjs web/src/erp/utils/printPdf.test.mjs` 通过，共 24 个用例；`PATH=/usr/local/bin:$PATH pnpm --dir web test -- --runInBand` 通过，共 451 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-testing-dark-desktop,print-workspace-material-preview-popup STYLE_L1_PORT=5235 pnpm --dir web style:l1` 通过，共 2 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告。
- 下一步：继续按 goal 检查 __dev 测试预设和客户配置导入控制台的 no-write / preflight 口径，或转向打印字段 mapper 与出货业务弹窗打开态 L1 缺口。
- 阻塞/风险：本组只修本地测试入口、common import 解析和 PDF 预览测试链路，不改 __dev 正式可见范围、测试预设命令文本、后端、schema、RBAC、真实登录、真实客户导入、生产部署或 PDF 服务端渲染合同；全量 web test 已通过但不替代真实后端读写和目标环境验证。

## 2026-07-01 出货来源导入弹窗打开态 L1 回归补强

- 完成：补强 `business-formal-module-shells-desktop` 里的出货单表单来源导入回归。场景现在在“新建草稿”弹窗中打开“从销售订单导入出货明细”，检查来源行、剩余可出货、销售订单号、产品样本和空结果文案；并实际选择 `SO-STYLE-L1` 导入一次，回到父弹窗后断言“销售订单行追溯”出现且旧 `sales_order_item_id 追溯` 不再出现。为避免既有 `SHIP-STYLE-L1` 消耗同一来源行导致选择器禁用，场景只对本次来源导入的 `list_shipments limit=500` 做一次性空出货池 mock，不影响页面主列表和后续出货事实 mock。
- 验证：首跑 `PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=5236 pnpm --dir web style:l1` 失败，定位为 mock 中已有出货单消耗同一销售订单行导致来源行禁用；调整一次性来源池 mock 后同命令通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`git diff --check -- web/scripts/style-l1/businessFormalScenarios.mjs progress.md` 通过。
- 下一步：继续按 goal 检查打印 mapper、库存流水导出和其它业务可见字段链路缺口，或转向 __dev 客户配置导入控制台 no-write / preflight 口径。
- 阻塞/风险：本组只改浏览器 L1 回归场景和过程记录，不改出货组件、Shipment usecase、schema、migration、RBAC、JSON-RPC、真实来源剩余量校验、真实客户数据、生产部署或数据库；L1 证明本地 mock 下的打开态、来源导入交互、父弹窗回填文案和横向溢出链路，不证明真实后端剩余量强校验已补齐。

## 2026-07-01 采购入库草稿来源单号 fallback 收口

- 完成：收口采购订单“生成入库草稿”弹窗来源摘要的内部 ID fallback。`PurchaseOrderInboundDraftModal.jsx` 新增 `purchaseOrderLabel`，优先显示采购单号；采购订单对象存在但单号缺失时显示“采购订单已关联”，没有订单时才显示 `-`，不再把 `order.id` 当来源采购订单单号展示。`userVisibleTechnicalFields.test.mjs` 增加该弹窗定向守卫；`purchase-order-inbound-draft-modal-controls-desktop` L1 场景补充正常来源单号和禁止 `来源采购订单：1` 断言。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/utils/userVisibleTechnicalFields.test.mjs` 通过，共 14 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-order-inbound-draft-modal-controls-desktop STYLE_L1_PORT=5237 pnpm --dir web style:l1` 通过，共 1 个场景，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`git diff --check -- web/src/erp/components/purchase-orders/PurchaseOrderInboundDraftModal.jsx web/src/erp/utils/userVisibleTechnicalFields.test.mjs web/scripts/style-l1/scenarios.mjs progress.md` 通过。
- 下一步：继续检查打印 mapper、CSV 导出和其它业务弹窗里是否还有 `*.id` 被当成业务单号、来源编号或选中标签 fallback。
- 阻塞/风险：本组只改采购订单前端弹窗展示 fallback、静态守卫和本地 L1 场景，不改采购订单 / 采购入库后端合同、schema、migration、RBAC、JSON-RPC、真实剩余数量校验、真实采购数据或数据库；L1 覆盖正常单号场景，缺单号场景由静态守卫锁住，未调用真实后端。

## 2026-07-01 当前 diff 角色一致性定向收口

- 完成：按当前 diff 定向核查角色、权限、菜单、移动任务端和 Workflow 动作解释边界。修正 `workflowMethodRequiresEnabledModule` 中把只读 `explain_action_access / explain_task_assignment` 误纳入 `workflow_tasks=enabled` 写门禁的问题，保持正式文档约定的 read_only/disabled 下历史 explain 查询可读；对应测试改为断言 explain 在 read_only 下返回 OK 且不调用任务更新 usecase。同步确认工程岗位任务端是既有 `engineering` 角色和 `mobile.engineering.access` 权限的可授权入口补齐，不把 `/m/<role>/tasks` 当成真实账号岗位；移动端底部动作保留为完成 / 阻塞 / 催办 / 退回并先走后端 explain 合同，不新增本地事实写入。
- 验证：`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowWriteAPIRequiresEnabledModule|TestJsonrpcDispatcher_WorkflowUrgeTaskRejectsEmptyReason|TestJsonrpcDispatcher_WorkflowCompleteTaskActionUsesDoneAndServerActorRole|TestJsonrpcDispatcher_WorkflowControlledTaskActionsUseServerStatusAndActorRole|TestJsonrpcDispatcher_WorkflowExplain(ActionAccess|TaskAssignment)'` 通过；`go test ./internal/biz -run 'TestNormalizeAdminMobileRolePermissionsUsesCurrentRoleKeys|TestAdminMobileRolePermissionOptionsIncludeEngineering|TestBuiltinRoleWorkflowPermissionMatrix|TestMobileRoleAccessPermissionIncludesEngineering'` 通过；`go test ./internal/data -run TestWorkflowRepo_TaskStatusReasonEventAndCompletionCleanup` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/mobileRolePermissions.test.mjs web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/workflowTaskActionAccess.test.mjs web/src/erp/utils/workflowTaskBoard.test.mjs` 通过，共 81 个前端用例，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`git diff --check -- server/internal/service/jsonrpc_workflow.go server/internal/service/jsonrpc_workflow_test.go` 通过。
- 下一步：停止继续扩展 raw-id 或新主题扫描；后续若要产品化补齐工程岗位一键权限预设，应单独评审前端 preset 文案、菜单范围和测试，不混入本轮收口。
- 阻塞/风险：本轮只做当前 diff 的本地定向核查和一个 Workflow explain 门禁修复，不改 schema、migration、客户配置真源、RBAC 码表、生产部署、真实客户数据、真实账号或目标环境；本地单测和 no-write 前端测试不代表生产、目标环境或客户现场验证。当前 diff 仍包含大量其它会话/前序改动，未按本轮目标逐一重构或提交。

## 2026-07-01 永绅前端包本地预览脚本

- 完成：新增 `web/scripts/previewYoyoosun.mjs` 和 `pnpm preview:yoyoosun`，默认执行前端 `build:all`、注入 `config/customers/yoyoosun/customer-config.example.js` 与客户静态资产，并以 `APP_ID=desktop PORT=5176 API_ORIGIN=http://127.0.0.1:8300` 启动 `serve:prod`。脚本支持 `--print-plan / --skip-build / --port / --api-origin`，兼容 pnpm 传入的裸 `--`，并只做后端 `/healthz` 提示检查，不 publish / activate 后端 customer config。同步更新 `web/README.md` 和 `web/scripts/README.md` 的入口、边界和命令。
- 验证：`node --check web/scripts/previewYoyoosun.mjs` 通过；`node -e "JSON.parse(require('fs').readFileSync('web/package.json','utf8')); console.log('package json ok')"` 通过；首次 `pnpm --dir web preview:yoyoosun -- --print-plan` 命中 Codex runtime `pnpm 11.7.0` 被 engine 拦截，改用 `PATH=/usr/local/bin:$PATH` 后确认 `pnpm 10.13.1`；`PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun --print-plan` 和 `PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun -- --print-plan` 均通过；`PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun -- --skip-build --port 5276` 成功检查后端 health、注入 yoyoosun 静态配置并启动临时静态服务；`curl http://127.0.0.1:5276/healthz` 返回 `appId=desktop`，`curl http://127.0.0.1:5276/customer-config.js` 返回 `customerKey: "yoyoosun"` 和永绅品牌配置；验证后已 Ctrl-C 停止临时 `5276` 服务；`git diff --check -- web/scripts/previewYoyoosun.mjs web/package.json web/scripts/README.md web/README.md` 通过。
- 下一步：如果后续要把 yoyoosun runtime manifest 的 validate / publish / activate 也做成执行器，应另拆任务并保留 release readiness / `/__dev/customer-config` 的显式写入门禁，不并入本地静态预览脚本。
- 阻塞/风险：本轮只新增前端本地预览脚本和文档说明，不改后端服务、schema、migration、RBAC、customer_config 控制面、真实客户数据、生产部署或数据库；验证使用既有 `web/build` 加 `--skip-build` 启动实际静态服务，未重新跑完整 `build:all`，不代表当前大量未提交工作区改动整体可构建或可发布。

## 2026-07-01 super admin 前端产品核心看全

- 完成：`adminProfileSync` 改为让 super admin 在前端不受 active pages / actions / field policy 收窄，可查看已登记业务页、按钮和字段；普通账号仍按 RBAC 与 effective session 交集收窄。同步更新 L1 场景、测试预设、优先级审计和正式文档口径。
- 验证：`node --test` 覆盖 adminProfileSync、masterDataOrderView、formal customer config boundary、priority audit、devTesting 共 57 项通过；`node --check`、`git diff --check` 通过；targeted `STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages,erp-no-visible-menu-blocks-outlet pnpm --dir web style:l1` 通过 3 场景。
- 下一步：如需确认本机预览页面，应用 super admin 登录刷新后检查业务菜单和按钮；生产发布仍走既有 release gate。
- 阻塞/风险：本轮只改前端可见性和文档/测试，不绕过后端 RBAC、模块状态、Workflow / Fact usecase、幂等或审计；未改目标环境配置和真实发布证据。

## 2026-07-01 progress 归档索引补齐

- 完成：补齐 `docs/archive/README.md` 中漏登记的 `docs/archive/progress-2026-07-01-before-action-projection-l1.md`，让 7 月 1 日新增 progress 归档文件在归档索引中可查。
- 验证：更新前已检查 `progress.md` 规模为 321 行、81,606 bytes，未达到 600 行或 80 KiB 归档阈值；待跑 docs inventory 和 diff check。
- 下一步：继续保持当前 goal 收口，不再扩展 release evidence 或新主题；若后续改客户交付状态，再单独核对客户交付矩阵和真实证据。
- 阻塞/风险：本组只改归档索引和过程记录，不改代码、runtime、schema、RBAC、客户配置、测试脚本、部署或真实客户数据。
