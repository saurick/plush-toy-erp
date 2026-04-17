# web 前端说明

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

- `pnpm style:l1` 是当前仓库最小浏览器级样式回归，会自动拉起本地 Vite 并覆盖首页、用户登录、注册、管理员登录，以及未登录访问 `/admin-menu` 的重定向。
- 若本轮改动触达更复杂的后台页面、弹窗、表格或更多响应式状态，仍需在 `style:l1` 之外继续补针对性浏览器回归。
- `pnpm test` 当前只负责验证错误码常量与登录态错误分类这类最小前端基线；它不替代浏览器里的样式 / box 模型验收。

## 环境变量

- `VITE_BASE_URL`：前端部署基础路径
- `VITE_APP_TITLE`：页面标题，应与当前项目名称保持一致
- `VITE_ENABLE_RPC_MOCK`：是否启用本地 RPC mock

环境文件：

- `/Users/simon/projects/plush-toy-erp/web/.env.development`
- `/Users/simon/projects/plush-toy-erp/web/.env.production`

说明：当前可执行 `cd /Users/simon/projects/plush-toy-erp/web && pnpm test` 验证错误码常量与鉴权分类基线，执行 `pnpm style:l1` 验证首页与登录链路的最小浏览器级样式回归；若任务涉及更复杂页面，仍应继续补页面级回归。
