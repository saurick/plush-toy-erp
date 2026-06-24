# 前端脚本 / Web Scripts

本目录保存前端本地服务、浏览器级回归和 smoke 脚本。这里的脚本服务开发和验收，不是产品运行时真源；页面能力、菜单、RBAC、Workflow / Fact 边界仍以代码、后端 usecase、正式文档和测试结果交叉确认。

## 脚本分类

| 类型               | 入口                                                                                                                         | 用途                                                                       | 边界                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 样式与页面 L1 回归 | `pnpm style:l1` / `styleL1.mjs` / `style-l1/`                                                                                | 启动前端并用 Playwright 覆盖登录、业务页、暗色、打印、移动端和局部页面交互 | 默认使用 mock / 前端态验证；失败要先分清页面回归、mock wiring 和浏览器基础设施问题                |
| 真实登录 smoke     | `pnpm smoke:purchase-contract-real-login`、`pnpm smoke:processing-contract-real-login`、`pnpm smoke:mobile-auth-login-route` | 通过真实登录流程验证合同预览、岗位任务端入口和认证回跳                     | 依赖本地后端和开发账号；不替代 RBAC / usecase 单测                                                |
| 真实写入 e2e       | `pnpm smoke:purchase-receipt-real-write`                                                                                     | 准备采购入库测试草稿，并通过浏览器过账和取消模拟单据                       | 会写本地 / 开发库模拟采购入库事实；只能按脚本显式参数和 README 边界执行，禁止跑生产或客户正式环境 |
| 本地服务           | `pnpm serve:prod`、`pnpm start:mobile:all`                                                                                   | 本地静态服务验证和多端口岗位任务端调试                                     | 生产环境仍使用单端口 `5175`，多端口只用于本地开发调试                                             |
| QA 报告生成        | `buildFieldLinkageCoverageReport.mjs`                                                                                        | 生成字段联动 latest 结构化报告                                             | 报告供开发验收页读取，不是业务事实真源                                                            |

## 常用命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
pnpm smoke:mobile-auth-login-route
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
pnpm smoke:purchase-receipt-real-write
```

`STYLE_L1_SCENARIOS` 支持逗号分隔的场景名，适合局部页面回归。默认端口冲突时优先换一个 `STYLE_L1_PORT=<port>` 复跑，不要先把端口占用误判成页面回归。

## 写入和输出边界

- `style:l1` 输出浏览器截图、日志和报告到 `web/output/playwright/style-l1/`，不纳入 git。
- 真实登录 smoke 可能读取本地开发配置中的管理员账号，也可能通过环境变量覆盖账号密码；不要把账号、token 或截图里的敏感信息提交。
- `smoke:purchase-receipt-real-write` 会用采购入库 RPC 准备带 `PR-BROWSER-*` 前缀的模拟草稿，再到入库管理页完成过账和取消；收尾口径是取消冲正并保留可追踪记录，不物理删除已过账单据。入库管理页本身不提供页面级“新建入库单”，真实业务草稿从采购订单“生成入库”入口产生。
- 本目录脚本不能绕过后端 RBAC、schema、migration、Workflow / Fact usecase 或客户配置边界。

## 维护规则

- 新增浏览器级页面回归时，优先复用 `style-l1/` 下已有 mock、assertion 和 scenario 拆分。
- 修改 API shape、页面字段映射或业务页主路径时，同步更新对应 mock 和 L1 场景，避免脚本继续验证旧前端契约。
- 不要对 `styleL1.mjs` 做无关大范围格式化；该文件体量大，改动应按场景和 helper 分区收口。
- 脚本说明保持在本文件和 `web/README.md`，测试分层和选择口径仍以 `docs/product/自动化测试策略.md` 为准。
