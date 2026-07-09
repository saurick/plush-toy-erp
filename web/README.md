# web 前端说明

## 当前结构

当前前端是一个生产入口加开发调试入口：

- 生产前端：单入口 `5175`
- 桌面后台：根路径和 `/erp/*`
- 岗位任务端：`/m/<role>/tasks`
- 本地开发：同一个 `pnpm start` 入口承载桌面后台和岗位任务端
- 登录页：按入口配置显示“后台管理 / 岗位任务端”，设备只决定默认选项，不决定权限，岗位由账号授权自动决定
- 仍然共享同一个 React 项目、同一个 common / ui / api 层

## 环境版本

前端依赖 pnpm，版本由 `web/package.json` 的 `packageManager` 固定为 `pnpm@10.13.1`；Node.js 版本由仓库根目录 `.n-node-version`、`.node-version` 和 `.nvmrc` 共同锁定为 `24.14.0`。

```bash
cd /Users/simon/projects/plush-toy-erp
corepack enable
bash scripts/doctor.sh

cd /Users/simon/projects/plush-toy-erp/web
pnpm install
```

`scripts/doctor.sh` 会检查当前 `node`、`pnpm` 和版本锁是否一致；不一致时先切换版本，不要继续安装依赖。

## 目录结构（简版）

| 路径          | 职责                                                              |
| ------------- | ----------------------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数                       |
| `src/erp/`    | 毛绒 ERP 桌面后台、业务页、岗位任务端页面和打印工作台             |
| `src/erp/qa/` | 字段联动等前端 QA catalog 与 latest 报告生成依赖                  |
| `src/pages/`  | 根路由重定向、登录、注册、管理员登录                              |
| `public/qa/`  | 字段联动覆盖等 latest 结构化报告，供后台验收页读取                |
| `scripts/`    | 前端本地服务、浏览器级回归和 smoke 脚本，详见 `scripts/README.md` |
| `build/`      | 构建产物，不作为业务真源                                          |

## 启动命令

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

默认地址：`http://127.0.0.1:5175`。开发服务器会把 `http://localhost:5175` 自动规范到同一 IPv4 地址。

桌面构建提供单端口岗位任务端主路径：

```text
http://127.0.0.1:5175/m/boss/tasks
http://127.0.0.1:5175/m/sales/tasks
http://127.0.0.1:5175/m/purchase/tasks
http://127.0.0.1:5175/m/production/tasks
http://127.0.0.1:5175/m/warehouse/tasks
http://127.0.0.1:5175/m/finance/tasks
http://127.0.0.1:5175/m/pmc/tasks
http://127.0.0.1:5175/m/quality/tasks
http://127.0.0.1:5175/m/engineering/tasks
```

`/admin-login` 统一承接后台和岗位任务端登录。手机默认选择岗位任务端，电脑默认选择后台，平板没有历史选择时保留入口选择；用户手动选择入口优先于设备默认，并在刷新后保持。入口显隐由 `web/src/erp/config/entryConfig.mjs` 控制，并可通过 `window.__PLUSH_ERP_ENTRY_CONFIG__` 覆盖。用户不在登录前手选岗位，岗位任务端登录后按管理员账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位；是否真正可进入仍由后端返回的 `permissions / menus` 决定。短信登录入口由后端 `auth.capabilities` 决定，前端不自行决定认证方式是否可用；用户手动选择的“密码登录 / 短信登录”会随浏览器刷新保持，短信验证码发送后的前端倒计时在当前标签页刷新后继续显示。前端只在后端明确返回 `mock_delivery=true` 时展示临时验证码；provider 模式下按后端错误码展示中文提示，例如发送过于频繁、短信服务额度已用完、短信服务暂不可用、验证码错误或验证码过期，不透传阿里云原始错误。后端仍负责真实频控和验证码校验。

当前前端不提供普通协作账号自助注册、登录或管理入口；登录主路径是 `/admin-login`，旧 `/login`、`/admin-accounts` 与 `/admin-users` 已不再注册路由或重定向。后端普通 `users` 表和 `user` JSON-RPC 域已退出，账号、岗位任务端和 RBAC 主路径统一使用 `admin_users`、角色和权限码。

桌面后台菜单由 `web/src/erp/config/seedData.mjs` 生成，并可通过 `web/src/erp/config/customerMenuConfig.mjs` 接入客户菜单配置。前端品牌默认走 `web/src/common/consts/brand.js` 的中性产品名；默认产品构建不静态打包任一客户配置包，也不通过 `VITE_ERP_CUSTOMER_KEY` 或 `window.__PLUSH_ERP_CUSTOMER_KEY__` 按 key 查找内置客户。客户部署时应在 `web/public/customer-config.js` 对应的静态根路径注入 `window.__PLUSH_ERP_CUSTOMER_CONFIG__`，例如把 `config/customers/yoyoosun/customer-config.example.js` 渲染或复制为部署产物的 `customer-config.js`，并发布对应客户资产。该静态配置只控制前端品牌展示、favicon 和桌面菜单分组、排序、显隐、文案，是客户部署外观和候选菜单输入，不是最终授权边界；登录后的正式后台还会通过 `ERPLayout` 调用后端 `customer_config.get_effective_session`，把当前 active customer config revision 的页面、动作、字段策略和责任池投影到当前 admin profile。未显式传入 customer key 的后端客户配置查询默认落到中性 `demo`，不会自动进入 yoyoosun。

`adminProfileSync` 当前只做前端 profile 投影、菜单过滤和当前 URL 是否应跳转的 helper 判断；`customer_config.get_effective_session` 拉取、cached effective session 复用、`effective_session_sync_failed` 空投影挂载，以及实际 `navigate(..., { replace: true })` fallback 跳转都由 `ERPLayout` 负责。菜单投影固定为两层：第一层是 RBAC 菜单路径，普通账号必须命中 `allowedMenuPaths`；第二层是 `effective_session.pages` 页面 key，普通账号在 `pages` 是数组时必须命中页面 key，空数组会收窄为无可见页面，不退回 RBAC-only。`super admin` 是产品核心 / 客户系统的全功能审阅和配置账号；当 effective session 带有客户 key 时，侧栏使用完整产品导航审阅当前客户运行环境的已登记业务能力；没有有效客户 key 或 sync-failed 空投影时，侧栏只使用 Product Core 控制面导航，第一项为 `/erp/dashboard` 的产品核心总览，不把客户业务菜单或客户 Workflow 工作台当作产品核心菜单展示。当前 URL 识别仍用完整产品导航解析已登记业务页，避免直访业务 URL 绕过客户业务页 guard。`super_admin_product_core` 只表示 `visibilityMode`；是否能挂载客户业务页只看 `dataRuntimeScope` 和 `canMountCustomerBusinessPages`。当 effective session 带有客户 key 时，`dataRuntimeScope=customer_runtime`，业务页按当前客户运行环境挂载真实业务列表或事实页组件；没有有效客户 key 或 sync-failed 空投影时，`/erp/dashboard` 显示 Product Core 能力总览和审阅入口，客户业务数据页显示 Product Core 能力审阅页，两者都不读取客户订单、库存、Workflow 或财务事实。`pages` 缺失或不是数组时，正式普通账号不回退旧 RBAC；通过 `attachEffectiveSessionToAdminProfile` 挂载的 effective session 即使输入缺少 pages，也会被归一为空数组。

岗位任务端也属于客户运行态入口，不属于无客户 key 的 Product Core 控制面。`/m/<role>/tasks` 先用当前静态客户配置 key 读取 `customer_config.get_effective_session`，只有 effective session 带有客户 key 时才挂载岗位任务页并请求 Workflow 任务；没有有效客户 key、Product Core 中性入口或 sync-failed 空投影时，只显示“岗位任务端需要客户运行环境”的拦截页，不读取客户 Workflow 任务、不展示客户待办 / 逾期 / 详情 / 操作按钮。`mobile.<role>.access` 只表示账号具备该岗位入口权限，不等于已经进入某个客户运行环境。

当前诊断例外都收口在 `adminProfileSync` helper 的前端 pages 判定层，不改变正式客户 / 非前端 DEV 构建普通账号必须同时命中 RBAC 菜单路径和 active revision pages 的强收窄：`local dev` 指前端 DEV 构建态，不等于测试 / 目标环境；local dev 只允许已登记且 RBAC 已允许的直达 URL 放开第二层 pages 用于排障，不把 active revision 隐藏页加入普通账号侧边菜单。菜单项过滤中普通账号仍必须先通过第一层 RBAC 菜单路径，再命中 active pages；空数组继续收窄为无可见页面。`super admin` 在客户运行态用于查看当前客户系统能力进度，仍可看到完整产品导航中的业务页、业务动作和字段列；无客户运行态则只显示 Product Core 控制面导航，并在 `/erp/dashboard` 显示产品核心总览。这只是前端可见 / 可发起层，不扩大后端写入口。对业务看板、销售、采购、委外、库存、质检、出货、财务、主数据和异常闭环等客户业务数据页，`ERPLayout` 只通过 `shouldGuardCustomerBusinessPageRuntime` 消费 `dataRuntimeScope / canMountCustomerBusinessPages`，不直接复用 `super_admin_product_core` 判断数据挂载；带有 `yoyoosun` 等客户 key 的 super admin 仍属于客户运行态，业务页应读取当前客户部署数据库。后端仍按 RBAC、active module states、业务状态机、Workflow owner / assignee / break-glass、Fact usecase、幂等和审计决定是否允许真正写入。helper 本身不登记页面，也不校验原始 URL 是否是正式入口；页面范围来自调用方：侧栏菜单项过滤传入当前运行态菜单，隐藏 URL 判定使用完整产品导航调用 `resolveCurrentNavigationEntry`。当前 URL 若解析出未授权菜单权限路径，普通账号仍会被 RBAC 层判定跳转；若无法解析出菜单权限路径，则不会单独因 RBAC 触发跳转。未命中菜单定义时只用工作台作为标题 / 面包屑显示 fallback，`pageKey / menuPath` 保持为空，不参与 active pages 授权，也不选中工作台菜单。`getAdminProfileSyncErrorAction` 的 `hasCachedProfile` 只决定同步失败错误的动作分类；`ERPLayout` 在客户配置同步失败时仍只复用 `adminProfileRef.current.effective_session`，普通 `me` profile 缓存不等于已经存在客户配置投影缓存。

| 场景                                                                       | 当前前端行为                                                                                                                                                                                                                                                                                                                                                                                     | helper reason                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 正式客户 / 非前端 DEV 构建普通账号                                         | 正常 active revision 必须同时通过 RBAC 菜单路径和 active revision pages 交集；sync failure 且没有 `adminProfileRef.current.effective_session` 时挂载空投影，无可见菜单并阻止业务 `Outlet`；已有正常 cached effective session 时继续按缓存投影收窄，不进入 sync-failed 诊断例外，正式客户仍是强收窄。                                                                                             | `effective_session_page` / `effective_session_page_blocked`                 |
| `local dev` 普通账号                                                       | `ERPLayout` 当前不显式传 `isLocalDev`，helper 默认按 `import.meta.env.DEV` 判断前端 DEV 构建态；菜单项过滤中普通账号仍按 RBAC 菜单路径和 active pages 交集收窄，不因 local dev 显示 active-hidden 页面；直达已登记隐藏 URL 时，若当前路径解析出未授权菜单权限路径仍会跳转，若 RBAC 已允许则可放开第二层 pages 做排障，但仍受 page key、可见 fallback 和 no-visible-menu 渲染边界约束。           | `local_dev_customer_config_diagnostic` / `local_dev_sync_failed_diagnostic` |
| `local dev` super admin                                                    | 第一层前端 RBAC 菜单路径不依赖 `allowedMenuPaths`，带客户 key 时侧栏使用完整产品导航；无客户 key 时侧栏只使用 Product Core 控制面导航，`/erp/dashboard` 显示产品核心总览而不是客户 Workflow 工作台。隐藏 URL 始终按完整产品导航调用 `resolveCurrentNavigationEntry` 解析，未登记路径只得到显示 fallback，不得到授权 page key。                                                                   | `super_admin_product_core`                                                  |
| 正式 / 非前端 DEV 构建 super admin，正常 active revision                   | 前端菜单路径不依赖 `allowedMenuPaths`，也不再被 active pages / active actions / field policy 收窄；若 effective session 带有客户 key，则侧栏使用完整产品导航、`dataRuntimeScope=customer_runtime`、`canMountCustomerBusinessPages=true`，业务页仍按该客户运行环境读取当前部署数据库；后端写入口仍按模块状态、业务状态、Workflow / Fact 边界和审计门禁执行。                                      | `super_admin_product_core`                                                  |
| 正式 / 非前端 DEV 构建 super admin，`effective_session_sync_failed` 空投影 | 前端菜单路径不依赖 `allowedMenuPaths`，但侧栏只显示 Product Core 控制面导航；此时 `dataRuntimeScope=sync_failed_diagnostic`、`canMountCustomerBusinessPages=false`，`/erp/dashboard` 显示产品核心总览，客户业务数据页可通过直达 URL 进入 Product Core 能力审阅页，不挂载真实业务 `Outlet`。这只是诊断和审阅可见性，不证明原始 URL 已登记、已授权或可渲染客户业务内容，也不绕过任何后端写入门禁。 | `super_admin_product_core`                                                  |

隐藏 URL 跳转也是 helper 判定，不是授权来源。直接打开已登记菜单路径但 RBAC 未授权、已登记页面被 active revision 隐藏，或 pages 判定不属于上述诊断例外时，`shouldRedirectFromCurrentNavigation` 只返回是否需要跳转；`ERPLayout` 只有在已过滤后的 `visibleSections[0].items[0].path` 存在时才 `replace` 到第一个可见入口。没有可见 fallback 时，只显示“当前账号暂无可见后台入口”并阻止业务 `Outlet`，不会跳到隐藏页、RBAC-only 页面或默认全量后台。当前 URL 的 RBAC 判断来自 `resolveMenuPermissionKey(location.pathname)` 解析出的 `currentMenuPath`，pages 判断来自 `resolveCurrentNavigationEntry` 对未过滤菜单定义的解析结果：已登记 exact / prefix 路径才返回 page key；未命中菜单定义时只返回工作台显示 fallback，`pageKey / menuPath` 为空。这个 fallback 只服务页头展示，不把原始 URL 升级为菜单入口、授权入口或业务页面准入；是否渲染业务内容仍由 React 路由、已过滤菜单是否为空、当前页面实际路由和对应后端权限共同决定。

`ERPLayout` 在 `get_effective_session` 同步失败时只复用 `adminProfileRef.current.effective_session` 这个客户配置投影缓存；普通管理员 `me` profile 缓存不等于客户配置投影缓存，也不影响 super admin 的产品核心可见性。已有正常 cached effective session 时继续复用正常投影，不进入 sync-failed 诊断例外；缓存本身已经是 sync-failed 空投影时才继续复用该空投影；没有客户配置投影缓存时才挂载新的 `effective_session_sync_failed` 空投影。active revision 正常返回空页面清单不是 sync failure，而是按空 active pages 投影处理。`web/src/erp/utils/adminProfileSync.test.mjs` 覆盖正式普通账号 sync failure 不退回 RBAC-only、本地开发直达 URL pages 诊断不放开普通账号菜单、super admin 产品核心看全、当前页面被 active pages 隐藏时的 helper 跳转判定，以及 super admin 不受 field policy 隐藏列收窄；`web/src/erp/utils/currentNavigationEntry.test.mjs` 覆盖已登记路由保留 page key、未登记 URL 只使用显示 fallback 且不授予 page key；`scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 只静态锁住 `ERPLayout` 仍存在空入口提示和 sync-failed helper anchor。这些测试只锁住前端 helper / 页面壳边界，不替代后端 RBAC、active revision、目标环境 smoke 或 release evidence。

### 主题模式 / Theme mode

桌面后台、统一登录页和岗位任务端支持「跟系统 / 浅色 / 暗色」三种主题模式，默认跟随系统偏好。用户手动选择会写入浏览器 `localStorage` 的 `plush_erp_theme_mode`，刷新后保持；`跟系统` 只决定视觉主题，不影响入口选择、权限判断或最终路由。

当前登录态 token 仍保存在浏览器侧认证存储中，并通过 `Authorization: Bearer` 发送，主要风险面是 XSS 后的 token 读取或泄露；不得把 token 写入 trace、日志、文档、截图或 QA 报告。生产侧已补基础 HTTP 安全响应头降低误嵌入、MIME sniff 和宽泛 referrer 风险，但这不等同于 HttpOnly Cookie 方案。当前内部系统不把 CSRF 作为近期安全待办；只有后续明确迁到浏览器自动携带的 Cookie 登录态时，才需要把 SameSite / CSRF、登录态刷新和前端 API client 改造放到同一轮专项评审。

主题主路径：

- 运行时状态由 `src/common/theme/erpTheme.jsx` 和 `src/common/theme/erpThemeMode.mjs` 维护。
- Ant Design 组件通过根 `ConfigProvider` 在 `defaultAlgorithm / darkAlgorithm` 间切换。
- 项目自定义壳层、岗位任务卡片和局部硬编码样式通过 `data-erp-theme` 与 `src/erp/styles/app.css` 入口及 `src/erp/styles/app/` 分区文件中的 ERP theme 变量覆盖。
- 新增状态类组件时必须同步覆盖暗色主题，包括 loading / empty / alert / message / notification / tooltip / popover / tag / badge / progress / pagination / drawer / table placeholder；优先复用全局 token 和 L1 断言，避免组件只在浅色模式可读。
- 打印、PDF、采购合同 / 加工合同纸面预览默认固定浅色，不跟随暗色主题，避免污染导出物。

### 共享控件样式边界 / Shared control style boundary

`src/erp/styles/app.css` 的最后三层是输入框、选择器、日期框、数字框和 Ant Design portal 浮层控件的共享治理层。它们只处理控件基线，不承接单页布局、字段语义、业务状态或客户差异。

| 文件                              | 职责                                                                                                                                       | 不应放入                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `app/control-foundation.css`      | ERP runtime 可见控件 token、圆角、wrapper 裁剪、portal 控件基线和嵌套原生输入透明化。                                                      | 单页间距、业务字段宽度、表格布局、具体弹窗内容排列。            |
| `app/business-control-rhythm.css` | 业务表单、业务 action modal、业务筛选和业务记录弹窗的控件高度、真实 input / placeholder / search input 的 line-height、textarea 最小高度。 | focus 颜色、hover 状态、页面级 grid / flex 布局、业务保存逻辑。 |
| `app/control-focus.css`           | ERP 控件 focus / focus-within ring、modal 内层原生 input 的默认浏览器 / Tailwind ring 清理、checkbox focus ring。                          | 控件高度、圆角、字段语义、可见文案、权限或菜单规则。            |

维护规则：

- 改 caret、placeholder 垂直居中、input 高度时，优先改 `business-control-rhythm.css`，并确认真实 `input.ant-input`、Select placeholder/search input 和 wrapper 作为一个控件合同一起生效。
- 改圆角、裁剪或 AntD portal 基线时，优先改 `control-foundation.css`。
- 改 focus ring 颜色、位置或内外扩策略时，优先改 `control-focus.css`，默认使用 inset ring，避免被圆角容器或滚动区域裁掉。
- 不在业务页面 CSS 里重复写单字段 caret、line-height 或 focus ring 补丁；确有新控件类型时先补 `style:l1` 浏览器断言，再扩展共享层。
- 新增规则不能使用 `!important`，除非正在对抗不可控的第三方内联样式，并且必须在交付说明中写明原因。

### 岗位任务端本地调试

岗位任务端不再启动独立前端容器、独立 Vite 配置或独立端口。本地开发先启动同一个前端入口：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start
```

然后按角色访问 `5175` 下的单端口路径：

```text
http://127.0.0.1:5175/m/boss/tasks
http://127.0.0.1:5175/m/sales/tasks
http://127.0.0.1:5175/m/purchase/tasks
http://127.0.0.1:5175/m/production/tasks
http://127.0.0.1:5175/m/warehouse/tasks
http://127.0.0.1:5175/m/finance/tasks
http://127.0.0.1:5175/m/pmc/tasks
http://127.0.0.1:5175/m/quality/tasks
http://127.0.0.1:5175/m/engineering/tasks
```

## 构建命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:all
```

说明：

- `build:all` 当前只生成 `build/` 单入口静态产物
- 构建产物同时包含桌面后台和 `/m/<role>/tasks` 岗位任务端路由
- 生产环境应使用构建产物加静态服务，不使用 `pnpm start:*` 或 Vite dev server 承载流量
- 不再生成 `build/mobile-*` 生产产物，也不再保留按角色拆端口的 Vite 入口

## 生产静态服务

前端生产镜像使用一个镜像、一个实例启动：运行时固定 `APP_ID=desktop`、`PORT=5175`，桌面后台和岗位任务端都由这一组静态服务承载。岗位任务端访问路径为 `/m/<role>/tasks`，不再启动独立岗位任务端生产容器。

构建镜像：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

默认命令构建中性产品包。客户私有化前端包必须在本地或 CI 构建时显式传入客户 key，Dockerfile 会把 `config/customers/<customer-key>/customer-config.example.js` 覆盖到构建产物的 `customer-config.js`，并复制客户资产到 `customer-assets/<customer-key>/`：

```bash
docker build \
  --build-arg ERP_CUSTOMER_KEY=yoyoosun \
  -f web/Dockerfile \
  -t plush-toy-erp-web:yoyoosun-dev .
```

本地验证生产入口：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:all
APP_ID=desktop PORT=5175 API_ORIGIN=http://127.0.0.1:8300 pnpm serve:prod
```

本地预览永绅 yoyoosun 前端包可使用一键脚本。它会先检查 `http://127.0.0.1:8300/healthz`，再构建桌面和岗位任务端产物、注入 `config/customers/yoyoosun/customer-config.example.js` 和客户静态资产，并从 `5176` 起自动选择可用端口启动静态服务；该脚本只处理前端静态包，不会调用后端 `customer_config.validate / publish / activate / rollback`，也不会导入业务数据：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm preview:yoyoosun --print-plan
pnpm preview:yoyoosun
```

默认从 `5176` 起探测可用端口，实际地址以终端输出的 `url=http://localhost:<port>/erp` 为准。如需指定起始端口或后端地址：

```bash
PORT=5177 API_ORIGIN=http://127.0.0.1:8300 pnpm preview:yoyoosun
```

`preview:yoyoosun --print-plan` 会按实际可用端口输出 `verify customer config` 和 `verify customer asset` 两条 `curl` 命令。打开页面前先用这两条命令确认当前端口的 `/customer-config.js` 已是 yoyoosun 配置、`/customer-assets/yoyoosun/favicon-yoyoosun.svg` 返回 SVG content-type；如果返回默认占位配置、资产 404，或 asset 命令只命中 Vite HTML fallback，说明当前打开的是 Product Core / 旧静态服务 / 错误端口，而不是本次 yoyoosun 预览。

如果本机已经开了多个前端端口，先跑只读端口审计。它默认检查 `5175,5176,5177,5178,5179` 的监听进程、`/customer-config.js`、yoyoosun favicon 和 `8300/healthz`，用于区分 Product Core dev、yoyoosun dev / preview 或其他项目占用；不启动服务、不登录、不调用 JSON-RPC、不读取密码或 token、不写数据库。需要保存当前端口归属证据时，可追加 `--report output/yoyoosun-local-entry-audit/current.json` 写本地 no-write 报告；该报告不得写进 `deployments/**/evidence/**`：

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

本地开发调试永绅前端时使用热更新入口。它不打包，直接启动 Vite dev server，并通过 dev-only middleware 提供永绅 `/customer-config.js` 和 `/customer-assets/yoyoosun/*`：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:yoyoosun --print-plan
pnpm start:yoyoosun
```

`start:yoyoosun` 同样从 `5176` 起自动顺延端口，保留 HMR；它只注入前端静态客户配置，不会激活后端 yoyoosun `customer_config` revision。登录后页面 / 动作 / 字段是否按永绅 active revision 收窄，仍取决于本地后端 `8300` 当前数据库里的 `customer_config.get_effective_session`。

`start:yoyoosun --print-plan` 也会输出同一组按实际端口生成的 `curl` 验证命令；端口被占用时不要按 `5176` 手工猜测，以终端输出的 `url=` 和验证命令为准。

生产入口：

| APP_ID    | 入口                         | 构建产物 | 生产端口 |
| --------- | ---------------------------- | -------- | -------- |
| `desktop` | 桌面后台与 `/m/<role>/tasks` | `build/` | `5175`   |

生产静态服务约定：

- `/healthz` 和 `/readyz` 返回当前入口健康状态，供容器健康检查或网关探活。
- `/rpc` 和 `/templates` 默认反代到 `API_ORIGIN`，Compose 内默认是 `http://app-server:8300`。
- 默认构建 `VITE_BASE_URL=/`，网关应让前端实例看到根路径流量；如果使用路径前缀且不做前缀剥离，需要先评审构建期 `VITE_BASE_URL`。

## 当前回归命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
node scripts/realLoginSmokeShared.mjs --print-input-template
node scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json
node scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template
node scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json
node scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template
node scripts/purchaseReceiptRealWriteBrowserE2E.mjs --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json
pnpm smoke:mobile-auth-login-route
```

如需按真实管理员登录流程验证采购入库真实写入，或合同编辑联动、在线预览时延、下载 PDF 和浏览器打印入口，再执行：

`node scripts/realLoginSmokeShared.mjs --print-input-template` 只打印真实登录 smoke 所需输入和命令模板，不读取配置、不校验账号、不调用后端、不启动浏览器、不登录、不写库；`node scripts/realLoginSmokeShared.mjs --preflight-report output/real-login-smoke-shared/preflight.json` 只探测后端 health 和管理员凭据来源候选，不读取 config 内容、不读取密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库。真实 smoke 仍需要本地后端和开发账号。`node scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 只打印采购入库页面真实写入 e2e 的前置输入、持久测试数据确认、`PR-BROWSER-*` 记录边界和真实命令，不启动 Vite、不启动 Playwright、不调用后端、不登录、不写库；`--preflight-report` 只写本地前置报告，探测后端 health、显式管理员凭据 env、持久测试数据确认和页面目标安全性，不读取本地配置、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不写数据库。

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-receipt-real-write
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

说明：

- 上述真实登录烟测都会打开管理员登录页，使用 `server/configs/dev/config.local.yaml` 或 `config.yaml` 中的管理员账号登录
- 若本地账号不在配置文件中，可通过环境变量 `REAL_LOGIN_ADMIN_USERNAME` / `REAL_LOGIN_ADMIN_PASSWORD` 覆盖
- 桌面管理员登录页和岗位任务端登录页始终保留密码登录；短信登录只有在后端 `auth.capabilities` 返回可用时展示。用户不在登录前手选岗位角色，岗位任务端登录后按管理员账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位，固定 `/m/<role>/tasks` 直达入口仍校验对应岗位授权，短信登录额外依赖手机号绑定
- 可通过 `REAL_LOGIN_PREVIEW_MAX_MS` 覆盖默认 `10000ms` 的 PDF 预览时延阈值
- 采购入库真实写入 e2e 会验证：登录成功、通过采购入库 RPC 准备测试草稿、入库管理页面可处理该草稿、过账写 `inventory_txns`、取消入库写冲正、列表回显已取消；该脚本会写本地 / 开发库的模拟采购入库事实，采购入库单据不可物理删除，收尾口径是取消冲正并保留 `PR-BROWSER-*` 可追踪记录。入库管理页不提供页面级“新建入库单”，正式入库草稿应从采购订单“生成入库”入口产生。`pnpm smoke:purchase-receipt-real-write` 已显式传入 `--accept-persistent-test-data`，直接 `node` 执行时也必须显式传入该参数或设置 `PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1`。脚本默认只允许 localhost / 127.0.0.1 页面目标；如确需跑准备好的开发 / 测试环境，必须额外传入 `--allow-external-base-url`，禁止直接跑生产或目标客户环境。若缺少单位、材料或仓库，可显式执行 `pnpm smoke:purchase-receipt-real-write -- --seed-core-demo` 先补核心演示主数据
- 采购合同烟测会验证：登录成功、采购合同工作台可打开、采购金额可手工修改、改单价后金额会按公式重算、在线 PDF 预览在阈值内打开
- 加工合同烟测会验证：登录成功、加工合同工作台可打开、工序名称 / 数量 / 单价会同步到纸面并联动金额、在线 PDF 预览在阈值内打开

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 登录页主题三态、暗色后台看板、暗色业务页中性 hover / focus、暗色开发文档查看器、暗色客户配置包预检页、暗色打印中心 / 预览入口和暗色岗位任务端核心路径
- 未登录访问桌面后台的重定向
- 桌面工作台、任务看板和异常 / 阻塞闭环，包括协同任务筛选、任务详情抽屉、阻塞 / 退回原因面板、催办、基于 `complete_task_action` / `block_task_action` / `reject_task_action` 的任务动作和运营工具入口
- 桌面业务看板和模板打印中心
- 当前正式业务页连续回归，包括客户档案、供应商档案、销售订单 V1 页面、采购订单日期筛选和出货单日期筛选（桌面 / 窄屏）
- 当前正式业务页表格、筛选、列顺序账号偏好、弹窗布局和协同入口
- 权限管理和审计日志
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台

`pnpm smoke:mobile-auth-login-route` 当前覆盖全部 9 个业务岗位任务端入口的未登录拦截、缺少岗位任务端角色授权的旧登录态回登录页、登录页密码入口、后端能力开启时的短信入口、账号密码登录后回跳任务页、任务 / 预警 / 通知 / 进度展示、岗位任务端不显示说明 / 角色文案，以及退出登录清空登录态。

缺少浏览器运行条件或只想确认移动端认证回跳 smoke 的执行范围时，可先执行 `node scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template`。该命令只打印岗位任务端角色、phone / iPad 视口、可选环境变量和真实回归命令，不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库。需要留下可保存的 no-write 前置记录时，执行 `node scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json`；该报告只写本地 JSON，记录脚本存在性、岗位任务端路由计划、phone / iPad 视口计划和 mock RPC 覆盖口径，不调用后端 / JSON-RPC、不读取密码、不保存 token、不写数据库。真实 `pnpm smoke:mobile-auth-login-route` 使用 mock auth / workflow RPC 验证生产单端口 `/m/<role>/tasks` 路由和登录回跳，不证明真实后端 RBAC、真实账号或 customer config active revision。

`pnpm smoke:mobile-workflow-runtime-browser` 使用真实后端和真实浏览器创建 `simulated_only` 老板审批任务、老板退回任务、老板完成任务、品质成品抽检任务、仓库入库任务与仓库放行任务，登录 `demo_boss` 后在 `/m/boss/tasks` 验证自有任务阻塞、退回、完成反馈、现场留痕、异常上报，以及 `owner_role_key=warehouse` 且 `assignee_id=demo_boss` 的跨角色任务只能催办、不能代办阻塞 / 完成；随后登录 `demo_quality` 和 `demo_warehouse`，分别验证品质岗位完成、仓库入库完成、完成反馈、已办列表和 evidence refs。该回归只覆盖本地 / 试用模拟 workflow 证据，不代表真实客户导入、生产写入或 Fact 落账。

缺少本地后端、演示账号密码或前端地址时，可先执行 `node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template`。该命令只打印所需输入、模拟任务计划和真实回归命令，不登录、不调用后端、不启动浏览器、不写数据库，也不证明移动端 workflow 真实可用。具备本地后端候选但还缺演示密码或不确定运行前置时，执行 `node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json` 写 no-write 前置报告；报告只探测 backend health、演示密码 env、Vite 托管需求、试用 customer-config 脚本存在性、`audit:yoyoosun-entry` 只读端口审计和模拟任务动作计划 coverage。若显式传入 `MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL`，preflight 会要求该端口命中 yoyoosun config 和 yoyoosun asset，否则以 `external-base-url-not-yoyoosun-entry` 阻止真实 smoke。不读取密码值、不调用 JSON-RPC、不启动 Vite / Playwright、不创建任务、不保存 token。需要留下本地真实浏览器读回记录时，可执行 `MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --report output/mobile-workflow-runtime-browser-smoke/report.json`；报告只保存任务码、状态、模拟任务计划 coverage 摘要、未证明项和脱敏布尔结果，不保存密码、token、Authorization header、raw customer package 或 action 列表，也不代表目标环境发布或 release evidence 完成。

`pnpm style:l1` 支持用逗号分隔的 `STYLE_L1_SCENARIOS` 跑指定场景，适合局部页面回归，例如：

```bash
cd /Users/simon/projects/plush-toy-erp/web
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
```

## 前端文档入口边界

前端已移除产品内文档中心、帮助中心、高级文档和开发与验收页面入口。

当前规则：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- 桌面侧栏只保留看板中心、业务分组、运营工具和系统管理。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness` 和 `/erp/mobile-workbenches` 路径不再注册运行时路由、重定向或权限别名。
- 仓库级 `docs/product/*`、`docs/architecture/*`、`docs/archive/*` 仍是正式文档体系，但不镜像到前端运行时。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev` 作为本地开发态简洁导航；该入口只汇总 `/__dev/governance`、`/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger` 和 `/__dev/customer-config` 等 dev-only 页面，展示搜索、分组筛选、跳转和浏览器本地置顶；入口卡片在当前标签内进入子页，不改变各子页内部导航。不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；置顶只写浏览器本地偏好，不是后端配置。开发导航使用 `/favicon-dev.svg`，测试入口使用 `/favicon-testing.svg`，只用于区分本地开发页面。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/governance` 作为本地开发态项目治理地图；该入口只读解析 `docs/项目治理地图.md`，展示治理维度与口径速查、常见任务分流、Mermaid 分流图、文档查看器跳转和路径复制，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；`docs/项目治理地图.md` 仍是维护真源。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/docs` 作为本地开发态文档查看器；该入口左侧专用于按真实目录树浏览仓库 tracked Markdown 和 `AGENTS.md`，支持 `?path=<markdown-path>#<section-anchor>` 直接定位文档和章节，并在搜索框下方提供浏览器本地持久化的置顶文档区，当前打开文档、目录树展开状态和章节标签展开 / 收起状态也会写入浏览器本地偏好以便刷新后恢复；搜索态显示匹配结果，右侧标题栏图钉可置顶 / 取消置顶当前文档，置顶区行内图钉可直接取消置顶，目录树和搜索结果行内图钉可快速置顶 / 取消置顶，章节标签默认展开为自动换行展示，也可收起为单行横向滚动；章节标签点击可滚动到对应标题并提供回到顶部，Markdown fenced `mermaid` 代码块会只读渲染为图表，并提供适配宽度、缩小、放大、重置 100% 和当前页面全屏查看的本地临时控件，不进入侧栏、seedData、RBAC 或产品内文档 registry，生产构建不可访问。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/prototypes` 作为本地开发态产品原型查看器；该入口只浏览 `docs/product/prototypes` 下的 HTML 样板、PNG 方案图和截图证据，可按全部 / 当前实现 / 待实现 / 参考资料四类筛选、按目录分组折叠、使用浏览器本地偏好恢复上次筛选、当前打开资产和置顶状态，并在右侧预览。卡片里的参照范围只说明可借鉴的页面 / 菜单类型，不是正式菜单、路由、权限或 seedData 映射表；该入口不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/capability-ledger` 作为本地开发态能力台账可视化；该入口只读解析 `docs/product/产品能力进度台账.md`、`docs/customers/yoyoosun/客户交付矩阵.md` 和 `docs/customers/yoyoosun/客户差异台账.md`，展示产品能力成熟度、客户交付状态、客户差异分类和显式 `CAP-*` 关联，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；三份 Markdown 仍是唯一维护入口。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/testing` 作为本地开发态测试入口；该入口只读解析 `docs/product/自动化测试策略.md`、`scripts/README.md`、前后端 README 和部署说明等当前维护文档，展示 T0-T8 验证层级、命令块和常用预设复制入口；`docs/reference/**`、`docs/archive/**` 等历史参考默认不进入可复制命令来源，避免把旧方案或未来命令误当当前测试入口；复制按钮不在浏览器内执行 shell，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；`docs/product/自动化测试策略.md` 仍是测试选择真源。
- 开发环境额外提供 `http://127.0.0.1:5175/__dev/customer-config` 作为本地开发态客户配置包预检控制台；该入口通过 `?customer=<customer-key>` 和页面客户包选择器读取 dev-only 客户包 registry，query 缺失时显示“未登记客户配置包”和已登记客户列表，不自动进入 yoyoosun，当前只登记 `yoyoosun`，后续新增客户包时只扩展同一 registry。未登记 customer 会显示“未登记客户配置包”和已登记客户列表，不 fallback 到 yoyoosun 冒充。选择器只更新 URL query，不写 localStorage、后端、数据库或正式运行配置；该页展示客户配置包、前端品牌 / 桌面菜单 runtime、字段 / 编号草案、流程结构 preview、moduleStates 模块状态预览、打印模板字段只读预检、预检步骤、差异预览、版本门禁、导入 tooling 和边界状态，并可在本地开发服务中触发测试版 UI Dry Run，调用 `scripts/import/customerImportDryRun.mjs` 生成 ignored `output/customers/<customer-key>/ui-import-dry-run` evidence；也可编译受控 runtime manifest 并用当前管理员登录态调用当前后端 `customer_config.validate_customer_config / publish_customer_config / activate_customer_config / get_effective_session`。本地开发默认写 `8300` 的客户配置控制面；若连接显式测试环境，必须先确认后端目标。moduleStates 在控制台只作为后端 `module_states` 控制面输入预览和 manifest 计数回显，不安装 / 卸载模块，也不证明完整模块关闭已 ready。打印模板字段只展示当前正式合同和工程资料模板的 fieldTruth 来源，销售订单受理当前未接打印模板；客户包可用 `printTemplateDefaults` 声明甲方 party defaults，并经 runtime manifest、后端 active revision 和 `customer_config.get_effective_session` 投影给正式前端；当前已接入的正式消费方是采购订单页 `material-purchase-contract` 和委外订单页 `processing-contract` 打印入口，仅读取买方 / 委托方默认字段，不覆盖供应商 / 加工方业务快照，也不启用销售订单打印模板。客户抬头、签章和固定文案仍属于客户配置或模板边界，不进入 Product Core 表单。Dry Run 不写数据库；本地/测试后端应用只写客户配置控制面表，不上传 raw 包、不直写数据库、不导入真实客户业务数据、不绕过后端 RBAC；后端 `rollback_customer_config` 只对已发布 compiled revision 做受控版本回滚并写独立审计，不是 raw 包回滚或导入失败恢复；正式版入口先运行 release readiness gate，门禁通过后才允许发布 / 激活，命令兜底区展示 active revision no-write 读回缺口报告、rollback readiness 和 rollback executor 复核命令，不提供页面裸回滚按钮，仍必须依赖 release evidence、readiness gate 和后端受控 API；生产构建不可访问；`config/customers/<customer-key>/*`、`config/catalog/*`、`config/schemas/*`、`scripts/import/*` 和正式文档仍是维护真源。

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单；统一登录页和 `/entry` 只做后台 / 岗位任务端入口选择
- 桌面后台管理员已接入 RBAC 权限中心；普通管理员通过 `roles` 获得 `permissions`，后端返回 `menus`，桌面菜单、岗位任务端入口和后端接口统一消费 permission code
- 桌面后台主业务菜单按当前产品设计保留看板中心、主数据、销售管理、产品工程、采购管理、质检管理、库存管理、委外管理、生产管理、出货管理、财务业务、运营工具和系统管理；系统管理当前包含权限管理和审计日志。客户档案 / 供应商档案走正式 MasterData V1 API，销售订单走正式 SalesOrder V1 API，采购订单走正式 PurchaseOrder V1 API。正式业务列表统一为单击行选中、双击行进入编辑 / 主操作弹窗；详情抽屉只由显式详情入口打开。采购订单页面支持列表、关键词 / 状态 / 采购日期或预计到货日期范围筛选、详情、订单头与明细保存、提交、审批、关闭和取消，但只表达采购承诺，不写库存、批次或财务事实。入库、来料质检、库存台账、委外订单、出货单、生产进度、生产排程、生产异常、出货放行、出库管理和财务业务已分别接入正式 V1、Workflow V1 或收窄 Operational Fact V1 页面；出货单页面支持状态 / 计划出货或实际出货日期范围筛选、草稿、加行、确认出货和已出货取消冲正，`SHIPPED` 才是真实出货事实。审计日志页面只读展示启动初始化和账号 / 角色 / 权限等系统控制面事件，不替代业务事实流水。当前 `formal-shell` 模块清零；生产排程、生产异常和出货放行改为 Workflow V1 协同页，读取 / 创建 / 完成 / 阻塞 / 催办各自 `workflow_tasks`，其中出货放行限定 `source_type=shipping-release + task_group=shipment_release`。三者不读取或写入旧 `business_records`，也不提供删除、回收站、业务数据导出或生产 / 出货 / 库存 / 财务领域事实写入主路径；出货放行任务完成仍不等于 `SHIPPED`。旧通用业务页、旧业务模块路由和旧入口退出页已删除。
- P0/P1 业务页已接入共享业务附件面板：销售订单、采购订单、委外订单、采购入库、来料质检、出货单、收窄财务 / 生产 / 委外事实、SKU、BOM、Workflow V1 桌面页和岗位任务端详情可上传、下载、删除附件。单个附件上限 50MB；允许格式覆盖常见图片、HEIC / HEIF、PDF、Word、Excel、CSV、文本、ZIP、邮件证据和 WPS 文件；PNG / JPG / WEBP / GIF / PDF 支持轻量预览，其他格式下载后查看。单据编辑弹窗中的附件默认作为备注 / 交付 / 合同资料 / 凭证附近的紧凑证据行放在明细区之前，页面级选中记录附件仍可保留独立区块。附件必须挂到已保存业务记录，只作为证据，不改变 Source Document、Fact、Workflow、库存、质检或财务状态。
- 桌面后台已移除 `帮助中心`、`开发与验收` 和 `高级文档` 分组；前端不再承接 Markdown 文档页、业务链路调试页或协同任务调试页
- 岗位任务端本地和生产环境统一走 `5175` 的 `/m/<role>/tasks`；不再保留按角色拆端口入口，也不拆第二个仓库
- 岗位任务端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 岗位任务页读取真实 workflow API，展示任务、预警、通知、进度和现场附件；完成 / 阻塞 / 退回分别走 `complete_task_action` / `block_task_action` / `reject_task_action`，均由服务端按当前管理员和任务责任推导角色；桌面任务看板、Workflow V1 页面、业务协同 Drawer 和岗位任务端提交前预检已消费 `explainWorkflowActionAccess` / `explainWorkflowTaskAssignment` 的后端只读原因，列表行即时按钮仍保留本地 helper fallback；移动端不再回写 `business_records` 状态，附件上传不代表任务完成
- 岗位任务端复用管理员登录态，登录页固定提供密码登录，并在后端启用短信能力时提供短信登录；账号未授权当前角色、手机号未绑定或未授权当前角色、登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 模板打印当前由对应业务页选中记录后带值打开；打印中心保留默认样例，并已按原型复核后的轻量两栏承接左侧模板导航、右侧纸面预览和打印窗口入口；字段编辑在独立打印窗口内完成。
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- `docs/product/prototypes/admin-command-center-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已吸收主要运行时骨架：`/erp/dashboard` 是后台首页 / 工作台，`/erp/task-board` 是任务看板，`/erp/business-dashboard` 是业务看板，`/erp/print-center` 是模板打印中心，`/erp/operations/exceptions` 是异常 / 阻塞闭环；工作台和业务看板保留后台运营中枢导航。未获用户明确确认前，不能把该资产改成 Current。
- `docs/product/prototypes/print-template-center-v1/` 按 `待实现 / To Implement` 登记，补齐模板打印中心独立样板；当前运行时已按原型复核后的轻量两栏保留模板导航 / 预览和打印窗口入口，字段编辑回到独立打印窗口。该原型不新增样品确认单、字段映射配置、后端 API、RBAC、schema、migration 或 Fact 写入。
- `/erp/task-board` 任务看板的关键词、状态、角色、到期和来源筛选使用 URL query 保存，支持复制链接、刷新恢复和一键清空；首屏按原型式四泳道展示可推进任务、阻塞异常、今日到期和已完成协同，这些筛选和分组只影响当前页面展示，不写后端用户偏好、WorkflowUsecase 或事实表。
- `docs/product/prototypes/business-module-page-standard-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时只保留客户档案、供应商档案和销售订单 V1 页面复用业务页骨架；旧 `BusinessModulePage`、旧通用业务页路由和旧只读变体页已删除。`/__dev/prototypes` 仍保留待实现队列，未获用户明确确认前不清空队列、不晋级 Current。
- 当前业务页、岗位任务端页面、桌面工作台、任务看板、异常闭环、业务看板和模板预览已经齐入口；通用业务记录已落盘，采购合同 / 加工合同已支持业务页带值打开，桌面任务看板只处理 Workflow 协同任务，不直接写库存、出货、应收、开票、付款或其他事实表；Excel 导入、打印留档回写和细分业务专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置，自研 `AppModal` 保持固定遮罩内 flex 居中。
- 业务记录的新建 / 编辑优先使用业务表单弹窗；详情抽屉只用于显式只读核对。生产排程、生产异常和出货放行当前只允许创建和处理 Workflow 协同任务，不能把协同任务写成生产订单、生产异常事实、出货单、库存、财务或发票事实；来源、打印、删除等未接入真实 usecase 的动作不能写成真实业务动作。
- 桌面端业务录入弹窗默认按紧凑自适应栅格排布：文本字段在可用宽度内多列展示，数量类短字段进一步收口，备注、边界说明和明细区保留整行。
- V1 主数据和销售订单表单弹窗宽度基线为 `min(960px, calc(100vw - 96px))`；Workflow V1 协同创建弹窗使用当前共享业务弹窗约束，不恢复 formal-shell 字段预览弹窗主路径。
- 明细条目按共享列宽预算展示，长文本字段保留较宽输入，数量 / 单价 / 金额等短数字字段收窄；数量后缀读取当前行已填单位，金额类字段默认显示 `CNY` 后缀，但不把空单位强行保存成 `pcs`。
- 单据级附件属于主对象证据字段，放在备注、交付、合同资料或凭证语义附近，并位于订单行、BOM 明细、出货明细等 item 区之前；未保存状态可先选择附件并在保存成功后自动上传绑定，单个附件上限 50MB，PNG / JPG / WEBP / GIF / PDF 可轻量预览，HEIC / HEIF、Office、ZIP、邮件证据和 WPS 文件下载后查看，无附件状态使用紧凑空态，不在弹窗末尾放置独立大区块，避免明细增多后必须滚到最后才看见上传入口。
- 弹窗壳层按主题区分：浅色主题保持 Ant Design 轻量基线；暗色主题必须提供可辨认的遮罩、独立边框、浮层阴影以及 header / body / footer 分隔，避免业务页背景和弹窗融成一片。
- 弹窗 body 内部接管纵向滚动，避免长表单溢出视口；明细横向滚动只允许收口在明细容器内，不外溢到整组 Modal。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角；浅色焦点态保留 ERP 绿色，暗色普通 hover / focus 使用 slate / blue 交互色，绿色仅保留给品牌主按钮和状态强调，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
