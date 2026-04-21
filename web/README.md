# web 前端说明

## 目录结构（简版）

| 路径          | 职责                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数                             |
| `src/erp/`    | 毛绒 ERP 初始化壳层，包含主路由、流程页、帮助中心、文档页和移动端工作台 |
| `src/pages/`  | 公共首页、登录、注册、管理员登录与后台账号目录页面                      |
| `src/mocks/`  | 本地 mock 与前端基线测试辅助                                            |
| `src/assets/` | 图标等静态资源                                                          |
| `public/`     | 静态公开资源                                                            |
| `scripts/`    | 最小浏览器级样式回归等前端侧脚本                                        |
| `build/`      | 构建产物，不作为日常开发真源                                            |

日常开发入口优先关注 `src/`、`scripts/` 与 `public/`；`build/` 更偏本地产物，不建议当成业务实现入口。

## 启动与构建

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm playwright:install
pnpm style:l1
pnpm build
```

- `pnpm style:l1` 是当前仓库最小浏览器级样式回归，会自动拉起本地 Vite 并覆盖公共首页、管理员登录、未登录访问 `/erp/dashboard` 的重定向，以及管理员登录后的 ERP 看板、帮助中心、移动端工作台和资料准备页。
- 若本轮改动触达更复杂的后台页面、弹窗、表格或更多响应式状态，仍需在 `style:l1` 之外继续补针对性浏览器回归。
- `pnpm test` 当前负责验证错误码常量、登录态错误分类，以及 ERP 初始化数据基线；它不替代浏览器里的样式 / box 模型验收。

## 环境变量

- `VITE_BASE_URL`：前端部署基础路径
- `VITE_APP_TITLE`：页面标题，应与当前项目名称保持一致
- `VITE_ENABLE_RPC_MOCK`：是否启用本地 RPC mock

环境文件：

- `/Users/simon/projects/plush-toy-erp/web/.env.development`
- `/Users/simon/projects/plush-toy-erp/web/.env.production`

说明：当前可执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm test` 验证错误码常量与鉴权分类基线，执行 `pnpm style:l1` 验证首页与登录链路的最小浏览器级样式回归；若任务涉及更复杂页面，仍应继续补页面级回归。
