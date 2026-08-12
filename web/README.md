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

| 路径                 | 职责                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `src/common/`        | 通用认证、组件、hooks、状态、常量与工具函数                                                 |
| `src/erp/`           | 毛绒 ERP 桌面后台、业务页、岗位任务端页面和打印工作台                                       |
| `src/erp/qa/`        | 字段联动等前端 QA catalog 与报告生成依赖                                                    |
| `src/dev-workbench/` | `/__dev` 浏览器端页面、配置、组件和样式，不进入 production build                            |
| `src/pages/`         | 根路由重定向、登录、注册、管理员登录                                                        |
| `dev-server/`        | Node/Vite development-serve Bridge、operation 适配器及合同测试，详见 `dev-server/README.md` |
| `scripts/`           | 前端本地服务、浏览器级回归和 smoke 脚本，详见 `scripts/README.md`                           |
| `build/`             | 构建产物，不作为业务真源                                                                    |

## 启动命令

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

默认地址：`http://127.0.0.1:5175`。开发服务器会把 `http://localhost:5175` 自动规范到同一 IPv4 地址。

本地开发端口由仓库根目录 `config/dev-ports.env` 统一提供，Vite 主入口固定 `5175` 并启用 `strictPort`；被占用时应处理占用者或调整完整本机端口组，不能让主入口静默顺延。临时使用辅助端口时必须把 `ERP_VITE_PORT` 与 `ERP_VITE_HMR_CLIENT_PORT` 设为同一个值；只覆盖 Vite CLI 的 `--port` 会在启动期被拒绝，避免 HMR 连接旧端口后形成自动重载循环。`API_ORIGIN` 仍可显式覆盖，否则代理从同一清单的 HTTP `8300` 推导。

`pnpm start` 默认先执行共享本地 runtime preflight：本机 `API_ORIGIN` 会先检查工作区 schema / versioned migration、开发库 Atlas status，再要求后端 `/healthz` 与 `/readyz` 同时通过；预检和 Vite 的 `/rpc`、`/templates` 代理共用同一 `API_ORIGIN`。预检只读，不会 apply migration。仅做不登录、不调 RPC 的前端布局调试时，可显式使用 `pnpm start:frontend-only`；该模式会标记为降级、非绿色证据，不能用来验证登录或业务页。如果 `API_ORIGIN` 指向外部环境，本地不会读取其数据库，但仍要求该环境 health / ready 通过，migration 由目标环境发布证据负责。

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

`/admin-login` 统一承接后台和岗位任务端登录。手机默认选择岗位任务端，电脑默认选择后台，平板没有历史选择时保留入口选择；用户手动选择入口优先于设备默认，并在刷新后保持。入口显隐由 `web/src/erp/config/entryConfig.mjs` 控制，并可通过 `window.__PLUSH_ERP_ENTRY_CONFIG__` 覆盖。用户不在登录前手选岗位角色；岗位任务端登录后优先进入已授权的明确岗位深链，否则自动进入当前账号第一个可用 `mobile.<role>.access` 岗位。是否真正可进入仍由后端刷新后的管理员状态、`permissions / menus` 与客户 effective session 决定。短信登录入口由后端 `auth.capabilities` 决定，前端不自行决定认证方式是否可用；用户手动选择的“密码登录 / 短信登录”会随浏览器刷新保持，短信验证码发送后的前端倒计时在当前标签页刷新后继续显示。前端只在后端明确返回 `mock_delivery=true` 时展示临时验证码；provider 模式下按后端错误码展示中文提示，例如发送过于频繁、短信服务额度已用完、短信服务暂不可用、验证码错误或验证码过期，不透传阿里云原始错误。后端仍负责真实频控和验证码校验。

当前前端不提供普通协作账号自助注册、登录或管理入口；登录主路径是 `/admin-login`，旧 `/login`、`/admin-accounts` 与 `/admin-users` 已不再注册路由或重定向。后端普通 `users` 表和 `user` JSON-RPC 域已退出，账号、岗位任务端和 RBAC 主路径统一使用 `admin_users`、角色和权限码。

桌面后台菜单由 `web/src/erp/config/seedData.mjs` 生成，并可通过 `web/src/erp/config/customerMenuConfig.mjs` 接入客户菜单配置。前端品牌默认走 `web/src/common/consts/brand.js` 的中性产品名；默认产品构建不静态打包任一客户配置包，也不通过 `VITE_ERP_CUSTOMER_KEY` 或 `window.__PLUSH_ERP_CUSTOMER_KEY__` 按 key 查找内置客户。客户部署时应在 `web/public/customer-config.js` 对应的静态根路径注入 `window.__PLUSH_ERP_CUSTOMER_CONFIG__`，例如把 `config/customers/yoyoosun/customer-config.example.js` 渲染或复制为部署产物的 `customer-config.js`，并发布对应客户资产。该静态配置只控制前端品牌展示、favicon 和桌面菜单分组、排序、显隐、文案，是客户部署外观和候选菜单输入，不是最终授权边界；登录后的正式后台还会通过 `ERPLayout` 调用后端 `customer_config.get_effective_session`，把当前 active customer config revision 的页面、动作、字段策略和责任池投影到当前 admin profile。未显式传入 customer key 的后端客户配置查询默认落到中性 `demo`，不会自动进入 yoyoosun。

`adminProfileSync` 当前只做前端 profile 投影、菜单过滤和当前 URL 是否应跳转的 helper 判断；`customer_config.get_effective_session` 拉取、cached effective session 复用、`effective_session_sync_failed` 空投影挂载，以及实际 `navigate(..., { replace: true })` fallback 跳转都由 `ERPLayout` 负责。菜单投影固定为两层：第一层是 RBAC 菜单路径，普通账号必须命中 `allowedMenuPaths`；第二层是 `effective_session.pages` 页面 key，普通账号在 `pages` 是数组时必须命中页面 key，空数组会收窄为无可见页面，不退回 RBAC-only。`super admin` 是产品核心 / 客户系统的全功能审阅和配置账号；当 effective session 带有客户 key 时，侧栏使用完整产品导航审阅当前客户运行环境的已登记业务能力；没有有效客户 key 或 sync-failed 空投影时，侧栏只使用 Product Core 控制面导航，第一项为 `/erp/dashboard` 的产品核心总览，不把客户业务菜单或客户 Workflow 工作台当作产品核心菜单展示。当前 URL 识别仍用完整产品导航解析已登记业务页，避免直访业务 URL 绕过客户业务页 guard。`super_admin_product_core` 只表示 `visibilityMode`；是否能挂载客户业务页只看 `dataRuntimeScope` 和 `canMountCustomerBusinessPages`。当 effective session 带有客户 key 时，`dataRuntimeScope=customer_runtime`，业务页按当前客户运行环境挂载真实业务列表或事实页组件；没有有效客户 key 或 sync-failed 空投影时，`/erp/dashboard` 显示 Product Core 能力总览和审阅入口，客户业务数据页显示 Product Core 能力审阅页，两者都不读取客户订单、库存、Workflow 或财务事实。`pages` 缺失或不是数组时，正式普通账号不回退旧 RBAC；通过 `attachEffectiveSessionToAdminProfile` 挂载的 effective session 即使输入缺少 pages，也会被归一为空数组。

岗位任务端也属于客户运行态入口，不属于无客户 key 的 Product Core 控制面。`/m/<role>/tasks` 先用当前静态客户配置 key 读取 `customer_config.get_effective_session`，只有 effective session 带有客户 key，且账号 `mobile.<role>.access` 与 active revision 对同一岗位入口的 effective action 同时命中时，才挂载岗位任务页并请求 Workflow 任务；没有有效客户 key、Product Core 中性入口、sync-failed 空投影或入口动作被客户配置收窄时，只显示“暂时无法进入岗位任务端”的拦截页，不读取客户 Workflow 任务、不展示客户待办 / 逾期 / 详情 / 操作按钮。多岗位账号可以在其真实且有效的岗位间切换，super admin 也不能凭管理身份绕过业务岗位和 effective action。`mobile.<role>.access` 只表示账号具备该岗位入口上限，不等于已经进入某个客户运行环境。

当前诊断例外都收口在 `adminProfileSync` helper 的前端 pages 判定层，不改变正式客户 / 非前端 DEV 构建普通账号必须同时命中 RBAC 菜单路径和 active revision pages 的强收窄：`local dev` 指前端 DEV 构建态，不等于测试 / 目标环境；local dev 只允许已登记且 RBAC 已允许的直达 URL 放开第二层 pages 用于排障，不把 active revision 隐藏页加入普通账号侧边菜单。菜单项过滤中普通账号仍必须先通过第一层 RBAC 菜单路径，再命中 active pages；空数组继续收窄为无可见页面。`super admin` 在 active customer runtime 用于查看当前客户系统能力进度，仍可看到完整产品导航中的业务页、业务动作和字段列；无客户运行态则只显示 Product Core 控制面导航，并在 `/erp/dashboard` 显示产品核心总览。这只是前端可见 / 可发起层，不扩大后端写入口。对业务看板、销售、采购、委外、库存、质检、出货、财务、主数据和异常闭环等客户业务数据页，`ERPLayout` 只通过 `shouldGuardCustomerBusinessPageRuntime` 消费 `dataRuntimeScope / canMountCustomerBusinessPages`，不直接复用 `super_admin_product_core` 判断数据挂载；只有带 customer key 且来源为 active revision 的 super admin 才属于 customer runtime，业务页读取当前客户部署数据库；`builtin_rbac_fallback` 即使带同 key 也不升级为 customer runtime。后端仍按 RBAC、active module states、业务状态机、Workflow owner / assignee / break-glass、Fact usecase、幂等和审计决定是否允许真正写入。helper 本身不登记页面，也不校验原始 URL 是否是正式入口；页面范围来自调用方：侧栏菜单项过滤传入当前运行态菜单，隐藏 URL 判定使用完整产品导航调用 `resolveCurrentNavigationEntry`。当前 URL 若解析出未授权菜单权限路径，普通账号仍会被 RBAC 层判定跳转；若无法解析出菜单权限路径，则不会单独因 RBAC 触发跳转。未命中菜单定义时只用工作台作为标题 / 面包屑显示 fallback，`pageKey / menuPath` 保持为空，不参与 active pages 授权，也不选中工作台菜单。`getAdminProfileSyncErrorAction` 的 `hasCachedProfile` 只决定同步失败错误的动作分类；`ERPLayout` 在客户配置同步失败时仍只复用 `adminProfileRef.current.effective_session`，普通 `me` profile 缓存不等于已经存在客户配置投影缓存。

在进入上述菜单与页面投影逻辑前，客户部署若已通过静态配置声明 customer key，`ERPLayout` 会等待 profile/effective session 首次同步完成，并要求 effective session customer key 与部署 key 一致。正式构建、静态预览、同步失败、缺失或 key 不匹配且没有可用的同客户缓存投影时，页面 fail closed 到“暂时无法进入工作台”，不挂载 Product Core、RBAC-only 或客户业务 `Outlet`。`start:yoyoosun` 的前端 DEV 构建只有一个窄例外：后端成功返回同 customer key 的 `builtin_rbac_fallback` 时，可挂载带明确警示的本地桌面预览壳；该投影不升级为 customer runtime，`dataRuntimeScope` 仍是 `product_core_review` 或 `customer_runtime_missing`。工作台和任务看板只显示 Product Core 能力审阅且不发出 Workflow RPC，客户业务数据页继续由 `canMountCustomerBusinessPages=false` 拦截，岗位任务端也仍只接受 active revision。

正式前端文案统一站在当前使用账号和业务人员视角：本地 `pnpm start` / `start:yoyoosun`、`preview:yoyoosun` 与生产构建复用正式业务组件和文案；仅 `start:yoyoosun` 的 DEV fallback 壳显示开发诊断警示。`customer key`、`客户运行环境`、`Product Core`、配置投影和后端实现术语只保留在开发调试页、该 DEV 警示、无客户 Product Core 页面、日志或技术文档中，不出现在客户正式业务界面；交易主体“客户”和合同法律主体“甲方 / 委托方 / 订货方”仍按业务语义保留。

| 场景                                                                       | 当前前端行为                                                                                                                                                                                                                                                                                                                                                                                | helper reason                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 正式客户 / 非前端 DEV 构建普通账号                                         | 正常 active revision 必须同时通过 RBAC 菜单路径和 active revision pages 交集；配置了部署 customer key 时，sync failure 且没有同 key cached effective session 会先进入客户运行态不可用页，不再挂载空投影业务壳；已有同 key cached effective session 时继续按缓存投影收窄，正式客户仍是强收窄。                                                                                               | `effective_session_page` / `effective_session_page_blocked`         |
| `local dev` 普通账号                                                       | 同 customer key 的 active revision 正常挂载；若成功读回 `builtin_rbac_fallback`，只允许带警示的桌面预览壳，不把 fallback 视为 customer runtime；工作台 / 任务看板只做零 Workflow RPC 的能力审阅，客户业务数据页和岗位任务端继续 fail closed。菜单仍按 RBAC 路径和 pages 规则收窄；sync failure、customer key 不匹配或缺失仍进入客户运行态不可用页。                                         | `local_dev_customer_config_diagnostic` / `customer_runtime_missing` |
| `local dev` super admin                                                    | 第一层前端 RBAC 菜单路径不依赖 `allowedMenuPaths`；active revision 正常挂载客户运行态，同 key `builtin_rbac_fallback` 只挂载带警示的桌面预览壳且业务数据页保持 Product Core 审阅，无客户 key 时侧栏只使用 Product Core 控制面导航。隐藏 URL 始终按完整产品导航解析，未登记路径只得到显示 fallback，不得到授权 page key。                                                                    | `super_admin_product_core`                                          |
| 正式 / 非前端 DEV 构建 super admin，正常 active revision                   | 前端菜单路径不依赖 `allowedMenuPaths`，也不再被 active pages / active actions / field policy 收窄；若 effective session 带有客户 key，则侧栏使用完整产品导航、`dataRuntimeScope=customer_runtime`、`canMountCustomerBusinessPages=true`，业务页仍按该客户运行环境读取当前部署数据库；后端写入口仍按模块状态、业务状态、Workflow / Fact 边界和审计门禁执行。                                 | `super_admin_product_core`                                          |
| 中性 Product Core 构建 super admin，`effective_session_sync_failed` 空投影 | 未配置静态 customer key 时，前端菜单路径不依赖 `allowedMenuPaths`，侧栏只显示 Product Core 控制面导航；此时 `dataRuntimeScope=sync_failed_diagnostic`、`canMountCustomerBusinessPages=false`，`/erp/dashboard` 显示产品核心总览，客户业务数据页可通过直达 URL 进入 Product Core 能力审阅页，不挂载真实业务 `Outlet`。已配置 customer key 的客户部署不走此分支，而是进入客户运行态不可用页。 | `super_admin_product_core`                                          |

隐藏 URL 跳转也是 helper 判定，不是授权来源。直接打开已登记菜单路径但 RBAC 未授权、已登记页面被 active revision 隐藏，或 pages 判定不属于上述诊断例外时，`shouldRedirectFromCurrentNavigation` 只返回是否需要跳转；`ERPLayout` 只有在已过滤后的 `visibleSections[0].items[0].path` 存在时才 `replace` 到第一个可见入口。没有可见 fallback 时，只显示“当前账号暂无可见后台入口”并阻止业务 `Outlet`，不会跳到隐藏页、RBAC-only 页面或默认全量后台。当前 URL 的 RBAC 判断来自 `resolveMenuPermissionKey(location.pathname)` 解析出的 `currentMenuPath`，pages 判断来自 `resolveCurrentNavigationEntry` 对未过滤菜单定义的解析结果：已登记 exact / prefix 路径才返回 page key；未命中菜单定义时只返回工作台显示 fallback，`pageKey / menuPath` 为空。这个 fallback 只服务页头展示，不把原始 URL 升级为菜单入口、授权入口或业务页面准入；是否渲染业务内容仍由 React 路由、已过滤菜单是否为空、当前页面实际路由和对应后端权限共同决定。

`ERPLayout` 在 `get_effective_session` 同步失败时只复用 `adminProfileRef.current.effective_session` 这个客户配置投影缓存；普通管理员 `me` profile 缓存不等于客户配置投影缓存，也不影响 super admin 的产品核心可见性。已有正常 cached effective session 时继续复用正常投影，不进入 sync-failed 诊断例外；缓存本身已经是 sync-failed 空投影时才继续复用该空投影；没有客户配置投影缓存时才挂载新的 `effective_session_sync_failed` 空投影。active revision 正常返回空页面清单不是 sync failure，而是按空 active pages 投影处理。`web/src/erp/utils/adminProfileSync.test.mjs` 覆盖正式普通账号 sync failure 不退回 RBAC-only、本地开发直达 URL pages 诊断不放开普通账号菜单、super admin 产品核心看全、当前页面被 active pages 隐藏时的 helper 跳转判定，以及 super admin 不受 field policy 隐藏列收窄；`web/src/erp/utils/currentNavigationEntry.test.mjs` 覆盖已登记路由保留 page key、未登记 URL 只使用显示 fallback 且不授予 page key；`scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 只静态锁住 `ERPLayout` 仍存在空入口提示和 sync-failed helper anchor。这些测试只锁住前端 helper / 页面壳边界，不替代后端 RBAC、active revision、目标环境 smoke 或 release evidence。

### 主题模式 / Theme mode

桌面后台、统一登录页、岗位任务端和开发工作台支持「跟系统 / 浅色 / 暗色」三种主题模式，默认跟随系统偏好。开发工作台在共享侧栏操作区提供主题入口，所有 `/__dev/**` 页面复用同一运行时状态；用户手动选择会写入浏览器 `localStorage` 的 `plush_erp_theme_mode`，刷新后保持。`跟系统` 只决定视觉主题，不影响入口选择、权限判断或最终路由。

当前登录态 token 仍保存在浏览器侧认证存储中，并通过 `Authorization: Bearer` 发送，主要风险面是 XSS 后的 token 读取或泄露；不得把 token 写入 trace、日志、文档、截图或 QA 报告。生产侧已补基础 HTTP 安全响应头降低误嵌入、MIME sniff 和宽泛 referrer 风险，但这不等同于 HttpOnly Cookie 方案。当前内部系统不把 CSRF 作为近期安全待办；只有后续明确迁到浏览器自动携带的 Cookie 登录态时，才需要把 SameSite / CSRF、登录态刷新和前端 API client 改造放到同一轮专项评审。

主题主路径：

- 运行时状态由 `src/common/theme/erpTheme.jsx` 和 `src/common/theme/erpThemeMode.mjs` 维护。
- Ant Design 组件通过根 `ConfigProvider` 在 `defaultAlgorithm / darkAlgorithm` 间切换。
- 项目自定义壳层、岗位任务卡片和局部硬编码样式通过 `data-erp-theme` 与 `src/erp/styles/app.css` 入口及 `src/erp/styles/app/` 分区文件中的 ERP theme 变量覆盖。
- 新增状态类组件时必须同步覆盖暗色主题，包括 loading / empty / alert / message / notification / tooltip / popover / tag / badge / progress / pagination / drawer / table placeholder；优先复用全局 token 和页面级浏览器回归断言（Style L1），避免组件只在浅色模式可读。
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

默认命令构建中性产品包。客户私有化前端包必须在本地或 CI 构建时显式传入客户 key，Dockerfile 会把经过审查的 `config/customers/<customer-key>/customer-config.example.js` 覆盖到构建产物的 `customer-config.js`，并且只复制 `public-assets/` 到 `customer-assets/<customer-key>/`。原始表格、工程图和员工信息不会进入公开产物：

```bash
docker build \
  --build-arg ERP_CUSTOMER_PACKAGE=yoyoosun \
  -f web/Dockerfile \
  -t plush-toy-erp-web:yoyoosun-dev .
```

本地验证生产入口：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:all
APP_ID=desktop PORT=5175 API_ORIGIN=http://127.0.0.1:8300 pnpm serve:prod
```

本地预览永绅 yoyoosun 前端包可使用一键脚本。它会先检查 `http://127.0.0.1:8300/healthz`，再构建桌面和岗位任务端产物、注入 `config/customers/yoyoosun/customer-config.example.js` 和客户静态资产，并从本项目独占辅助块 `15200-15299` 起自动选择可用端口启动静态服务；该脚本只处理前端静态包，不会调用后端 `customer_config.validate / publish / activate / rollback`，也不会导入业务数据：

```bash
cd /Users/simon/projects/plush-toy-erp/web
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
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:yoyoosun --print-plan
pnpm start:yoyoosun
```

本地后端的 `make run`、`make dev` 和 `make dev_restart` 默认使用 `ERP_CUSTOMER_KEY=yoyoosun`，避免未显式携带 customer key 的业务 RPC 回落到 demo；这些本地入口同时显式开放后端 local-test gate，gate 按 pgx 最终连接配置只接受 `192.168.0.106:5432` 的 `plush_erp` / `plush_erp_*_dev` 开发库，production 配置会拒绝该开关。确需 demo 时使用 `ERP_CUSTOMER_KEY=demo make dev_restart` 显式覆盖。

`start:yoyoosun` 同样从 `15200` 起在 `15200-15299` 辅助块内自动顺延端口，保留 HMR，并复用 `pnpm start` 的 schema / migration / health / ready 预检，再检查 yoyoosun 静态配置和公开资源存在。启动命令只注入前端静态客户配置，不自动写库或切换后端 revision。登录后可在 `/__dev/customer-config?customer=yoyoosun` 由管理员显式确认应用；dev-only middleware 只接受匹配的 `start:yoyoosun` 客户上下文和 loopback `API_ORIGIN`，生成内容寻址、长度不超过 64 的 `local_test_apply` revision，再由已开放本地 gate 的后端执行 validate / publish / transition check / activate or rollback / active readback。该操作写入共享开发 PostgreSQL 客户配置控制面，active 切换对其他共享库使用者也可见；默认后端与正式 validator / executor 均拒绝 local-test marker，因此不等于正式 publish / activate、目标环境部署或客户签收。

未显式应用时，后端若只返回同 key 的 `builtin_rbac_fallback`，DEV 桌面端会进入带警示的本地预览壳，避免把成功登录误报成工作台故障；该 fallback 不视为 active revision，工作台 / 任务看板只做零 Workflow RPC 的能力审阅，客户业务数据页和岗位任务端仍 fail closed。页面 / 动作 / 字段是否按永绅 active revision 收窄，仍取决于本地后端 `8300` 当前数据库里的 `customer_config.get_effective_session`；静态包检查通过不等于 active revision 已就绪。

`start:yoyoosun --print-plan` 也会输出同一组按实际端口生成的 `curl` 验证命令；端口被占用时不要按 `15200` 手工猜测，以终端输出的 `url=` 和验证命令为准。

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

`pnpm test` 使用 Node test runner 的默认自动发现，覆盖 `web/` 下全部 `*.test.mjs`；不要在 `package.json` 中手工枚举测试文件，避免新增测试静默漏跑。

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
- 桌面管理员登录页和岗位任务端登录页始终保留密码登录；短信登录只有在后端 `auth.capabilities` 返回可用时展示。用户不在登录前手选岗位；岗位任务端登录后优先进入已授权的固定 `/m/<role>/tasks` 深链，否则自动进入当前账号第一个可用岗位，短信登录额外依赖手机号绑定
- 可通过 `REAL_LOGIN_PREVIEW_MAX_MS` 覆盖默认 `10000ms` 的 PDF 预览时延阈值
- 采购入库真实写入 e2e 会验证：登录成功、通过采购入库 RPC 准备测试草稿、入库管理页面可处理该草稿、过账写 `inventory_txns`、取消入库写冲正、列表回显已取消；该脚本会写本地 / 开发库的模拟采购入库事实，采购入库单据不可物理删除，收尾口径是取消冲正并保留 `PR-BROWSER-*` 可追踪记录。入库管理页不提供页面级“新建入库单”，正式入库草稿应从采购订单“生成入库”入口产生。`pnpm smoke:purchase-receipt-real-write` 已显式传入 `--accept-persistent-test-data`，直接 `node` 执行时也必须显式传入该参数或设置 `PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1`。脚本默认只允许 localhost / 127.0.0.1 页面目标；如确需跑准备好的开发 / 测试环境，必须额外传入 `--allow-external-base-url`，禁止直接跑生产或目标客户环境。若缺少单位、材料或仓库，可显式执行 `pnpm smoke:purchase-receipt-real-write -- --seed-core-demo` 先补核心演示主数据
- 采购合同烟测会验证：登录成功、采购合同工作台可打开、采购金额可手工修改、改单价后金额会按公式重算、在线 PDF 预览在阈值内打开
- 加工合同烟测会验证：登录成功、加工合同工作台可打开、工序名称 / 数量 / 单价会同步到纸面并联动金额、在线 PDF 预览在阈值内打开

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 登录页主题三态、暗色后台看板、暗色业务页中性 hover / focus、暗色开发文档查看器、暗色客户配置包预检页、暗色打印中心 / 预览入口和暗色岗位任务端核心路径
- 未登录访问桌面后台的重定向
- 桌面工作台和任务看板，包括待我处理、按有效审批能力显示的待我审批、阻塞 / 逾期风险队列、协同任务筛选、任务详情抽屉、阻塞 / 退回原因面板、催办、受控转交，以及基于 `complete_task_action` / `block_task_action` / `reject_task_action / reassign_task` 的任务动作
- 桌面业务看板和模板打印中心
- 当前正式业务页连续回归，包括客户档案、供应商与加工厂、销售订单 V1 页面、采购订单日期筛选和出货单日期筛选（桌面 / 窄屏）
- 当前正式业务页表格、筛选、列顺序账号偏好、弹窗布局和协同入口
- 权限管理和审计日志
- 权限管理“审批责任”的未配置推荐顺序、明确停用，以及调整、发布和启用恢复；未配置显示“待初始化”，只有 `configured=true / enabled=false` 才显示“停用 / 不参与流程”
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台

`pnpm smoke:mobile-auth-login-route` 当前覆盖全部 9 个业务岗位任务端入口的未登录拦截、缺少岗位任务端角色授权的旧登录态回登录页、登录页密码入口、后端能力开启时的短信入口、账号密码登录后回跳任务页、`admin.me` 与客户 effective session 刷新、服务端权威岗位状态 / 待办 / 已办 / 风险 / 超时数量展示、岗位任务端不显示技术说明，以及退出登录清空登录态。岗位状态满足 `total=ready+blocked+done+rejected+withdrawn`，已办使用 `history=done+rejected+withdrawn`，风险和超时是重叠关注项；有真实电脑端菜单的账号会在任务端顶部和“我的”页看到“进入电脑端”，该入口继续以当前后端菜单投影为准，不按用户名或岗位名硬放行。

缺少浏览器运行条件或只想确认移动端认证回跳 smoke 的执行范围时，可先执行 `node scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template`。该命令只打印岗位任务端角色、phone / iPad 视口、可选环境变量和真实回归命令，不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库。需要留下可保存的 no-write 前置记录时，执行 `node scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json`；该报告只写本地 JSON，记录脚本存在性、岗位任务端路由计划、phone / iPad 视口计划和 mock RPC 覆盖口径，不调用后端 / JSON-RPC、不读取密码、不保存 token、不写数据库。真实 `pnpm smoke:mobile-auth-login-route` 使用 mock auth / admin / customer-config / workflow RPC 验证生产单端口 `/m/<role>/tasks` 路由、会话刷新和登录回跳，不证明真实后端 RBAC、真实账号或 customer config active revision。

`pnpm smoke:mobile-workflow-runtime-browser` 使用真实后端和真实浏览器创建 `simulated_only` 老板审批任务、老板退回任务、老板完成任务、品质成品抽检任务、仓库入库任务与仓库放行任务，登录 `demo_boss` 后在 `/m/boss/tasks` 验证自有任务阻塞、退回、完成反馈、现场留痕、异常上报，以及 `owner_role_key=warehouse` 且 `assignee_id=demo_boss` 的跨角色任务只能催办、不能代办阻塞 / 完成；随后登录 `demo_quality` 和 `demo_warehouse`，分别验证品质岗位完成、仓库入库完成、完成反馈、已办列表和 evidence refs。该回归只覆盖本地 / 试用模拟 workflow 证据，不代表真实客户导入、生产写入或 Fact 落账。

缺少本地后端、演示账号密码或前端地址时，可先执行 `node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template`。该命令只打印所需输入、模拟任务计划和真实回归命令，不登录、不调用后端、不启动浏览器、不写数据库，也不证明移动端 workflow 真实可用。具备本地后端候选但还缺演示密码或不确定运行前置时，执行 `node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json` 写 no-write 前置报告；报告只探测 backend health、演示密码 env、Vite 托管需求、试用 customer-config 脚本存在性、`audit:yoyoosun-entry` 只读端口审计和模拟任务动作计划 coverage。若显式传入 `MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL`，preflight 会要求该端口命中 yoyoosun config 和 yoyoosun asset，否则以 `external-base-url-not-yoyoosun-entry` 阻止真实 smoke。不读取密码值、不调用 JSON-RPC、不启动 Vite / Playwright、不创建任务、不保存 token。需要留下本地真实浏览器读回记录时，可执行 `MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' node scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --report output/mobile-workflow-runtime-browser-smoke/report.json`；报告只保存任务码、状态、模拟任务计划 coverage 摘要、未证明项和脱敏布尔结果，不保存密码、token、Authorization header、raw customer package 或 action 列表，也不代表目标环境发布或 release evidence 完成。

`pnpm style:l1` 支持用逗号分隔的 `STYLE_L1_SCENARIOS` 跑指定场景，适合局部页面回归，例如：

```bash
cd /Users/simon/projects/plush-toy-erp/web
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
```

## 前端文档入口边界

前端已恢复面向登录用户的单一岗位使用帮助入口；旧产品内 Markdown 文档中心、高级文档和开发与验收页面仍已移除。

当前规则：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- 桌面侧栏在权限过滤后附加 `使用帮助 / 岗位使用帮助`；该入口属于登录态壳层能力，不恢复 `erp.help_center.read` 或其他旧权限别名。客户配置可用 `desktopMenu.presentation = 'role_guided'` 依次显示“看板中心”、“常用工作”和“更多功能”：看板仅按最终页面权限固定在最前，岗位帮助固定在更多功能末尾；系统推荐通常选择 3 个岗位高频业务，财务推荐应收、应付、发票、对账 4 个。权限管理外层统一为“岗位设置 / 员工账号 / 审批责任”。“可用功能”消费后端 `menu_options` 与 `effective_role_access`：岗位列表、岗位摘要、保存状态和四类设置保持在同一双栏工作区；每条权限行直接标明“菜单入口 / 页内操作”，菜单入口同行展示页面是否出现及“看板中心 / 常用工作 / 更多功能”位置，页内操作同行展示所需入口，不再另设整组菜单结果卡。菜单与操作说明收进岗位头部问号浮层。桌面按业务分类提供吸顶直达和已选 / 总数，手机使用“跳到功能分类”下拉，保留“只看已选”用于复核，不提供低频全文搜索。未保存 `permission_keys` 只做客户有效范围预览，不持久化。主办理页面明确且入口唯一时会补齐该入口，但不会开启其他关联页面；关闭单一入口会移除仅在该页使用的操作，跨页面能力不自动删除。“页面与导航”可为业务岗位选择系统推荐，也可在双栏编辑器中把每个最终可进入页面放入“常用工作”或“更多功能”；常用工作按岗位保存顺序保留 1–5 项，更多功能直接复用当前管理员侧栏的模块名称与顺序，只允许调整同一菜单分组内的顺序。页面从常用工作移回更多功能时自动归入对应管理员菜单分组，空组不显示；客户菜单配置产生的分组改名、重排和扩展也沿用最终投影，岗位帮助固定在末尾的“使用帮助”分组；分组标题不可点击、不可折叠，也不计入“更多功能（N）”。撤销权限或失效页面会移出草稿，新出现的最终页面追加到对应更多分组。保存时前端通过一次 `set_role_settings` 整包提交权限、仓库范围与两组菜单路径，后端以一个角色 version CAS、一个事务和一条审计原子落库；并发冲突保留整份草稿。角色保存的 `navigation_mode / primary_menu_paths / secondary_menu_paths` 只控制位置和组内顺序，不改变页面权限、操作权限、客户投影或直接路由。“关联账号”按当前 `admin.list` 与账号岗位关系只读列出会受该岗位设置影响的账号、状态和兼任岗位；账号分配、停用、重置与注销仍统一在外层“员工账号”办理，从岗位详情进入时仅按当前岗位预填现有账号搜索，不新增第二套账号管理或权限真源。“审批责任”复用同一员工与岗位真源，只展示三类已有正式 ProcessRuntime / 领域命令闭环的审批；具名员工必须启用且持有所选岗位，多岗位员工按真实岗位进入候选，主办、备用、升级按最低可用优先级串行生效。常规操作通过一次“保存并生效”按 active revision/hash CAS 原子写入新 revision 和 active 切换，同时要求发布与激活权限；事务提交后新流程立即使用新设置，在途流程继续绑定冻结 revision。响应不确定时页面保留同一 intent 做权威回读确认，不另造 revision；具名员工停用 / 注销时未结束待办退回该冻结责任池。
- “页面与导航”默认显示二级“菜单布局”，保留系统推荐 / 自定义模式、常用工作与更多功能双列表和导航预览；二级“页面可用范围”只读展示全部、可进入、不可进入三种筛选及最终原因，精确配置版本改为按需查看。切换二级 Tab 不清空未保存草稿、不重新请求权限解释，也不新增保存动作；所有岗位设置仍由岗位头部唯一的“保存岗位设置”整包提交。
- `/erp/help-center` 根据当前有效岗位选择 `src/erp/config/roleHelpContent.mjs` 中的内容，多岗位账号可切换，单岗位账号不显示切换器，常用入口继续与当前可见菜单取交集。每岗帮助统一展示正常案例、完成标准、异常处理、退回对象和操作注意事项；未知岗位使用安全通用帮助。高频业务页另复用 `src/erp/config/businessUsabilityCatalog.mjs` 提供“这页怎么用”和关键字段问号说明，不新增第二个帮助中心；公式、字段来源和办理顺序只维护一份页内说明目录。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/source-readiness` 和 `/erp/mobile-workbenches` 路径不再注册运行时路由、重定向或权限别名。
- 仓库级 `docs/product/*`、`docs/architecture/*`、`docs/archive/*` 仍是正式文档体系，但不镜像到前端运行时。

### 本地开发入口 / Dev-only surfaces

下列页面只在开发构建中可访问，不进入侧栏、`seedData`、RBAC、产品内文档 registry、生产构建或 ERP 正式菜单。除本机 loopback Bridge 明确登记的客户配置、版本交付、测试数据和共享开发库迁移操作外，页面不直接写后端业务。

| 路径                              | 职责                                               | 维护真源                                                     |
| --------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `/__dev`                          | 按改动、验证、交付进入开发任务                     | `web/src/dev-workbench/config/devHub.mjs`                    |
| `/__dev/product-engineering`      | 按问题进入内核、权限、规则、业务链、文档和原型     | `web/src/dev-workbench/config/devHub.mjs`                    |
| `/__dev/product-core`             | 当前 Product Core 能力、归属、范围和边界           | `docs/product/产品能力进度台账.md`                           |
| `/__dev/permission-relationships` | 当前账号、岗位、最终功能、页面、仓库范围和审批责任 | 现有后台只读接口与已启用客户配置                             |
| `/__dev/governance`               | 项目治理地图只读可视化                             | `docs/项目治理地图.md`                                       |
| `/__dev/status-flows`             | 业务链、协同、运行、事实与状态规则只读观察         | 代码合同、三类 dev-only 配置目录与正式架构文档               |
| `/__dev/business-usability`       | 页面任务、完成标准和页内解释覆盖只读检查           | `web/src/erp/config/businessUsabilityCatalog.mjs`            |
| `/__dev/docs`                     | 当前工作区 Markdown 查看器                         | 仓库 Markdown 文件本身                                       |
| `/__dev/testing`                  | 本轮验证、专项检查、Git 收口和证据覆盖             | `docs/product/自动化测试策略.md`                             |
| `/__dev/quality-gates`            | full / strict 运行、结果、耗时、治理与覆盖缺口     | 正式 QA runner、门禁回执、affected 与本地 operation          |
| `/__dev/data-preparation`         | 固定数据范围检查、计划确认、执行与回执             | 既有 Core seed、统一本地验收 lifecycle 与 operation store    |
| `/__dev/database-migration`       | 共享开发库迁移准备、执行、读回与重启               | 高层 CLI、迁移 operation service、备份恢复与 operation store |
| `/__dev/prototypes`               | HTML / PNG / 截图原型资产预览                      | `docs/product/prototypes/**`                                 |
| `/__dev/customer-config`          | 已登记客户配置包预检、测试应用与发布门禁           | `config/customers/<customer-key>/*` 及 customer config 脚本  |
| `/__dev/version-center`           | exact-SHA 发布、固定 133 部署与回滚                | GitHub Release、固定目标预检与 operation 回执                |
| `/__dev/drill-recovery`           | 演练优先级、周期、证据状态与安全接管入口           | 固定目标预检、不可变 Release 与部署 / 回滚 operation 回执    |

#### 开发导航 `/__dev`

- 默认页不平铺十四张同权入口卡片，而是按“先弄清楚怎么改、验证改动没有越界、准备安全交付”展示三段连续任务路径；阶段内的具体入口默认折叠，已明确目标时可直接进入对应一级区域。
- 已置顶入口只作为轻量快捷方式显示。完整十四个入口、搜索、分类、来源和置顶操作统一放在默认收起的“查看全部入口”中；展开后仍在当前标签内进入子页，不改变各子页内部导航。
- 开发态边界放在页头按需查看。具体入口继续显示用途、维护来源和状态，但不与用户的下一步争夺首屏注意力。
- 置顶只写浏览器本地偏好，不是后端配置；路由、分组和入口登记仍以 `web/src/dev-workbench/config/devHub.mjs` 为真源。
- 开发导航使用 `/favicon-dev.svg`；测试入口使用 `/favicon-testing.svg`，每个开发页同时提供独立浏览器标题，只用于区分本地开发页面。
- 十五个子页统一提供开发工作台全局菜单、当前页高亮、复制当前深链和按需打开来源文档。一级菜单按稳定责任域命名为“总览、产品工程、质量验证、交付运行”；二级菜单按开发者要完成的任务或查看的对象命名，页面标题可在短名基础上补充完整职责，路由和内部 key 不随文案调整。

| 一级菜单 | 二级菜单                                                                 |
| -------- | ------------------------------------------------------------------------ |
| 产品工程 | 产品内核、权限关系、改动指南、业务链观察、业务易用性、开发文档、产品原型 |
| 质量验证 | 改动验证、质量门禁、测试数据                                             |
| 交付运行 | 客户配置、数据库迁移、版本发布、演练与恢复                               |

“质量验证”和“交付运行”一级页只负责选择下一项任务，不重复读取或展示通用最近回执。full / strict 运行结果、阶段和历史统一在“质量门禁”核对；当前 SHA 的 strict 发布资格统一在“版本发布”核对，入口页不维护第二份证据摘要。

移动端全局菜单允许横向滚动，并保持单一当前页语义。

##### 工作台入口变更门禁

- 新入口先归入“产品工程、质量验证、交付运行”之一，并在 `DEV_HUB_ITEMS.areaKey` 维护唯一归属；总览阶段直接由该字段派生，不维护第二份入口清单。
- 新能力默认进入对应阶段的折叠入口和“查看全部入口”。只有它会改变多数开发任务的下一步时，才调整首屏任务路径；不新增同权卡片或重复快捷方式。
- 新增或调整入口时，同步核对入口 key、路由、标题、用途、维护来源、状态与边界，并运行配置单测及受影响的 Style-L1 默认态、交互态、恢复态、移动端、深色和相邻页面检查。仅在外部行为变化时更新本节。

#### 产品工程入口 `/__dev/product-engineering`

该页不再把内核、权限、治理、业务链、易用性、文档和原型作为同权技术资产卡平铺，而是按“查看当前产品能力、核对权限结果、判断规则、查看业务链、检查员工能否看懂并独立完成、搜索文档、评审原型”七类用户问题组织连续任务列表。每项只在主路径展示用途、适用范围和下一步；工具名称、页面路径、维护来源和开发边界默认折叠。

#### 产品内核 `/__dev/product-core`

该页只读解析全局唯一的 `docs/product/产品能力进度台账.md`，完整展示全部能力的当前可用范围和主要边界。页面把台账状态翻译为“已进入内核（可试用）、部分进入（实现中）、尚未进入（待办）、当前不纳入（暂不做）”，支持按归属筛选和搜索能力、范围或边界，筛选条件写入 URL。页面不维护第二份能力状态，不根据文件存在、菜单出现或测试数量自行推断完成度；进入 Product Core 也不等于目标环境已发布、恢复可用或客户已验收。字段、状态、Workflow / Fact 和实现细节继续通过台账中的正式证据入口核对。

#### 权限关系 `/__dev/permission-relationships`

该页按岗位或账号汇聚当前后端返回的员工账号、岗位、最终功能解释、可进入页面、仓库数据范围和已启用审批责任，并复用正式前端菜单投影显示完整的“看板中心 / 常用工作 / 更多功能”实际侧栏；菜单保持完整结果，不随功能模块筛选缩小。岗位视角读取已保存的系统推荐或自定义布局，员工视角按账号岗位顺序合并；超级管理员缺少独立有效会话、任一岗位最终结果未完整读取或账号 / 岗位已停用时会明确失败关闭或标记当前不可使用，不从前端样例猜测菜单。页面以菜单预览、有向图和关系明细展示同一最终页面结果，只读取现有后台接口，不保存岗位、员工或客户配置，不创建新的权限真源；任务、单据、Workflow / ProcessRuntime 运行状态和 Fact / Ledger 不进入本页。正式配置仍在 `/erp/system/permissions` 办理，保存后返回本页刷新核对；该页及其路由、文案、样式和代码块必须随研发效能工作台一起排除在生产构建之外。

#### 项目治理地图 `/__dev/governance`

该页只读解析 `docs/项目治理地图.md`，主标题使用“这次改动该怎么做？”。默认按八类常见改动进入，不要求先理解架构层级、测试内部键或中英文工程术语；选中后只展示“先看这些、同时检查、不要误判”三步。任务名称、稳定 `task` 键、内部范围、依据、同步检查和边界均由 Markdown 明确维护，页面不再根据共享文档路径或关键词猜测相关任务。内部范围、个人 ToB 五步交付循环、治理维度解释、完整 Mermaid 关系图和维护来源统一放进“完整工作方式和内部说明”，默认折叠。`task` 写入 URL，可刷新、前进后退和分享；旧 `axis` / `scope` 参数会被清理，非法值回到第一项。该页继续保持 dev-only、只读和单一 Markdown 真源，不新增后端、数据库、RBAC 或正式菜单能力。

#### 业务链与运行观察台 `/__dev/status-flows`

- 页面保留稳定 `view` 值，主导航使用“看业务链、查责任与任务、看运行路径、看已生效结果、查状态规则”五个用户问题，不新增权限或基础资料等平行 Tab。顶部概念解释默认折叠：五个视图继续用“人、路、账、规则、链”帮助记忆，同时明确基础资料（如客户、供应商、产品、材料和仓库）提供标准，来源单据（如销售订单、采购订单、生产订单和加工合同）记录准备做什么或承诺做什么，但不代表库存、出货或财务结果已经发生；受控业务动作真正执行，计算结果从正式来源和事实派生，权限、客户配置与审计贯穿全部视图而不单独构成业务链。全局定义搜索默认折叠；当前视图、业务链和专项定义上下文始终可见，已选择任务只在 Workflow 主内容以及实际使用该任务定位的业务链或 ProcessRuntime 局部结果中展示，不进入 Fact / Ledger 或状态规则的全局上下文。业务链 Tab 默认进入 `view=chain&chain=all`：用 11 个链级节点按主链、供给支撑、异常返工和纠正冲正分区展示明确衔接，不展开各链内部节点，也不把总图登记成伪造的第 12 条业务链。点击或选择具体链后，一次只展示一条详细业务链，并以编号步骤回答“做什么、谁处理、怎样算完成、异常怎么办”；业务单据、基础资料、流程运行、岗位协同、已生效业务记录和计算结果使用业务名称，稳定 key、内部分类、查询来源、实例 ID 与代码证据按需查看。桌面同时直接展示分组卡片、编号步骤及对应 Mermaid 关系图，不提供图表展开或收起动作；移动端隐藏复杂图并保留纵向入口。
- `devFlowStateCatalog.mjs` 汇总状态机和流程 variant，`devBusinessChainCatalog.mjs` 是业务链目录，`devFactLedgerCatalog.mjs` 是 Fact / Ledger 定义目录。三者都是 dev-only 只读投影，不是新的业务真源；构建器校验唯一 key、引用、覆盖和图可达，未知引用或缺失覆盖 fail closed。生产异常决策属于来源单据，不进入 Fact / Ledger 定义；拒绝或取消、超领额度、报废或在制让步执行分别按正式流程合同展示。合同测试还会扫描 Ent schema 中持久化的状态所有者字段，并要求与状态目录的 canonical 引用及少量显式 schema 映射全等：业务侧或观察台任一侧先改，另一侧未同步时都会失败关闭；事件前后值和来源快照不算状态所有者。
- 状态规则视图直接消费同一状态目录登记的转换与异常路径分类，把正常推进、暂停与恢复、不通过与终止、纠正与退回、返工与再处理分组说明；图内用同一分类的彩色线、线型和动作短标签辅助扫读，图例与清单再解释适用条件、转换结果、影响边界和内部证据，不只靠颜色判断。可按全部、异常与纠正或当前状态筛选，并跳转到目录已明确关联的业务链、任务、运行路径或事实定义；它不查询历史实例，不提供改状态动作，也不是跨对象的通用状态管理器。
- 全局定义搜索按业务链、Workflow、ProcessRuntime、状态机和 Fact / Ledger 分组，搜索文字不写入 URL。`view / chain / node / flow / state / process / fact / task_id` 保存在 URL；每个视图只接受自己的对象参数，切换视图会清理无关对象参数并在返回业务链时恢复最近链和步骤。未知、重复、过期、当前视图无关的参数，或 `chain=all` 携带单链 `node` 时停止加载并提供恢复到业务总图的入口。
- 业务总图和具体业务链均提供“导出甲方校对版”。该入口直接从同一份业务链目录及其已登记流程、状态和岗位责任来源生成独立浅色打印稿，并调用浏览器原生打印；可在系统打印预览中保存为 PDF。打印稿先用 Mermaid 关系图展示主路径、岗位办理点、异常或纠正分支和正式业务结果，再用紧凑表格补充编号步骤、进入条件、可证明的责任岗位、人员与系统分工、完成条件及下一步；完整合同仍留在开发观察台，对外异常校对点去重后只列一次。具体链只导出当前所选链，`chain=all` 使用横向一页展示十二条链及其分区和衔接，不展开各链内部步骤。缺失信息显示“当前正式合同未定义”；暗色页面发起导出时图和文字仍固定为浅色。打印稿不包含稳定 key、源码路径、实例 ID、RPC、测试命令或真实业务记录，固定声明“未绑定客户发布版本”，并明确流程或任务完成不等于库存、出货、生产或财务事实生效。它只用于业务需求校对，不证明已经实现、发布或经甲方验收；页面不保存导出历史，也不新增 PDF 服务、数据库、API、RBAC、审批或外部发送能力。
- 真实查询只使用当前已有的 `workflow.list_tasks`、`workflow.list_task_events` 和 task-scoped `workflow.get_task_process_context`。可按任务名称、任务编号、来源单号或既有 `task_id` 定位；同名候选必须显式选择，分页结果不完整时不自动选择。可见任务若两个 ProcessRuntime 锚点都为空，页面直接显示普通未关联或 `simulated_only` 模拟展示摘要，不调用 context RPC，也不补造流程节点；后端返回“当前任务未关联正式流程”时使用同一正常边界。
- 当前后端没有通用 ProcessRuntime 实例 ID 直查，也没有跨领域 Fact 凭证 ID 查询。运行实例只能从可见任务锚定；事实页只展示经代码核实的 21 个定义并标注“未提供运行凭证查询”，不放置伪造输入框或 mock 凭证。
- 页面不导入库存过账、付款、冲正、流程推进、通用 `set_status` 或数据库写入。Workflow task `done`、ProcessRuntime node `completed` 和 Fact `POSTED` 使用不同说明；真实实例在总图最多高亮所属的一条业务链，在单链最多高亮一个 ProcessRuntime 节点，始终提示尚未证明上下游完成或业务事实已落账。

#### 业务易用性 `/__dev/business-usability`

- 页面只读消费正式业务页面目录、现有业务链目录、岗位帮助和 `businessUsabilityCatalog.mjs`，按页面检查“当前要做什么、做到什么算完成、完成后交给谁、办理顺序、名词、公式、字段来源和禁用原因”是否齐全；不复制权限、岗位责任或业务链矩阵。
- `已覆盖 / 部分覆盖 / 缺失` 只表示说明目录的完整程度，不表示页面已发布、客户已验收或员工已经会用。岗位标签只是岗位帮助中的常用入口推荐，实际页面与动作仍以后端权限和当前账号投影为准。
- 页面支持按覆盖状态、岗位帮助和通俗文字筛选，并可回到正式业务页、岗位使用帮助或业务链观察继续核对；它不调用业务写接口，不保存覆盖状态，也不建立 CMS、审批流或培训统计。

#### 开发文档 `/__dev/docs`

- Vite 在开发服务启动时收集仓库入口、`docs/**/*.md`、`config/customers/**/*.md` 和 `AGENTS.md`；客户配置页的“查看来源文档”因此会命中真实客户配置包说明。页面不校验 Git tracked 状态，因此不得将“能查看”解读为“已纳入版本管理”。
- 文档按“当前 / 评审与参考 / 历史”分层，默认只展示当前长期入口。`docs/reference/**` 与原型子目录 README 进入评审与参考，`docs/archive/**` 进入历史；目录、搜索结果和置顶区始终只显示当前所选层级的文档。
- 当前与评审文档在开发服务启动时进入全文索引；历史文档先只索引标题和路径，选中后才按需加载正文，避免历史过程记录拖慢默认阅读路径。深链或 Markdown 链接指向其他层级时，查看器会自动切换。
- `?path=<markdown-path>#<section-anchor>` 可直达文档和章节；在页面选择文档或章节会同步 URL，浏览器前进后退和刷新可恢复。相对 Markdown 链接继续留在开发文档查看器，站外链接保持普通外链行为。
- 搜索默认匹配标题、路径和正文，可切换为“仅标题”减少正文命中噪声；标题无结果时可直接切回“全部”继续查找。搜索结果、目录树和置顶区都可快速置顶或取消置顶。新用户默认收起目录、置顶区和多行章节，先保留搜索与当前文档；已有本地偏好继续恢复。章节标签支持展开换行、收起横向滚动、跳转和回到顶部。
- Markdown fenced `mermaid` 代码块会只读渲染为图表，可在当前页面适配宽度或可见高度、按 10%-240% 缩放、重置和全屏查看。

#### 产品原型 `/__dev/prototypes`

该页只浏览 `docs/product/prototypes` 下的 HTML、PNG 和截图证据，支持分类、分组折叠、当前资产和本地置顶恢复。新用户默认只展开当前资产所在目录，状态说明、资产统计和技术来源按需展开；已有目录偏好继续恢复。筛选无结果时预览同步为空；每个资产可打开对应 README、复制仓库路径，并通过隔离 sandbox 预览。全屏预览进入弹窗焦点、圈定 Tab、Escape 关闭并恢复触发按钮。卡片参照范围不是正式菜单、路由、权限或 `seedData` 映射表。

#### 测试入口 `/__dev/testing`

- 该页只读解析自动化测试策略、`scripts/README.md`、`web/scripts/README.md`、前后端 README 和部署说明等 9 份当前白名单文档，主视图按任务命名为“本轮验证”“专项检查库”“Git 收口”和“证据与覆盖”，稳定 `view=tiers|commands|closeout|coverage`。Git 收口只读展示 `core.hooksPath`、固定 Hook 文件与可执行权限，解释 pre-commit、commit-msg、prepare-push 和 pre-push 的职责；页面只能复制固定核对/准备命令，不执行、不暂存、不提交或推送。默认只展开“生成验证计划—运行匹配检查”主路径；17 组复制预设与内部 T0–T8 验证范围按需展开，T0–T8 不是完成进度或逐级验收。full / strict 不再作为主复制预设，页面以“前往质量门禁”深链进入固定 profile，终端入口仍在策略与脚本文档详情中保留。完整 Markdown 继续由独立的 `/__dev/docs` 查看器负责，不在测试入口复制第二个文档阅读器。
- `docs/archive/**` 不进入可复制命令来源，避免把历史命令写成当前测试入口；其他项目或 GPT/ChatGPT 原文不保存在仓库。
- “执行命令”只按同一条文档职责轴筛选来源：策略与口径、工程说明、执行脚本、部署与发布；搜索是独立的命令块关键词条件，“全部来源”只负责复位职责筛选。主视图、职责和关键词分别写入 `view`、`role`、`q` query，刷新、前进后退和从来源文档返回时可恢复。每个命令块可打开对应来源文档，文档职责、前后端技术域、脚本类型和部署阶段不再混成同一级分类。
- 多行命令会保留完整续行参数；不完整且以反斜杠结尾的命令不会进入复制结果。命令区按内容高度展示，不再被网格压缩裁切；验证层级和覆盖证据视图不显示对当前内容无效的命令来源筛选。
- “本轮验证”按收益优先展示五项独立能力：只读生成本轮 affected 验证计划、运行带稳定仓库身份回执的 fast 开发门禁、九岗位权限与任务可见性巡检、字段联动专项，以及“证据与覆盖”中的本地覆盖基线。页面把 P0/P1、命令来源和证据边界降为追踪信息，先显示用户下一步；计划可随时重生，执行动作和覆盖基线共同使用全局 QA 锁，同一时间只允许一项运行。各项状态与终态独立展示，不合成为“全系统已通过”。
- 固定动作通过 development-only `/__dev/api/qa/testing` 的 summary / plan / action / operation 合同运行。浏览器只能提交 `fast / role-access / field-linkage + idempotencyKey`，不能传 shell、参数、路径、环境变量、URL 或凭据；服务端固定映射仓库脚本，前后核对 repository identity，页面刷新后从私有 ignored operation store 恢复。岗位巡检只有本地后端与九岗位演示账号凭据就绪时才真实登录，凭据只从 Vite 服务端进程环境继承且不会返回浏览器；其预期业务写入为零，也不等于完整角色协同闭环。
- 覆盖视图从 dev-only `GET /__dev/api/qa/coverage` 读取固定 `output/qa/coverage/latest.json`，按 Go、Web、业务域、验证范围（内部键 T0-T8）、PostgreSQL、浏览器、readiness、目标环境和 UAT 分栏；未采集、过期、失败、跳过、阻塞和零执行不会折算为通过，也不会合并成一个总百分比。
- 报告与操作接口仅在 development serve 且请求来源与 Host 都是 loopback 时可用，返回 `no-store` 脱敏摘要；生产 build 不包含 `output/qa/**`，也不再从 `public/qa` 携带本机路径或覆盖报告。
- 「采集本地覆盖基线」通过 dev-only session / action / operation API 发起异步固定 baseline。浏览器只提交 `collect + idempotencyKey`，不能传 shell、参数、路径、环境变量或 profile；服务端校验本机 Host、同源、CSRF、JSON 合同，解析项目锁定的 Node / pnpm，以持久化幂等索引和全局 QA 锁串行运行 `node scripts/qa/test-coverage-collect.mjs --profile baseline --write`。页面显示 11 个脱敏阶段，其中先以 error-code `--check` 证明生成物无漂移，再直接使用项目 Node 做 Web native coverage，不触发会改写 tracked 生成物的 package `pretest`。切换视图不取消后台任务，回到页面后可恢复读回；按钮在运行期间原位禁用，终态自动刷新报告。
- 运行期仓库变化、启动/服务中断或终态读回无法证明时 fail closed，上一份报告继续展示；字段联动 TAP 与报告也先写 staging，只有测试、builder 和仓库身份复核均通过才原子替换，失败时保留上一份。真实 baseline 测试完成但存在失败、缺失或零执行时会发布绑定当前身份的 issues 报告，防止旧绿色遮蔽。页面“重新读取”只读取报告，“复制备用命令”只在 DEV 操作接口不可用时供手工执行。覆盖基线适合代码基本稳定、其它写任务结束的检查点，不必每次编辑后运行；它不写 PostgreSQL、不运行真实业务浏览器、不部署或做客户 UAT，未实际采集的值显示为空而不是 `0%`。`docs/product/自动化测试策略.md` 仍是测试选择和覆盖门槛真源。

#### 质量门禁 `/__dev/quality-gates`

- 页面内部只保留 `run / governance / gaps` 三个 URL-backed 视图，复用 `DevTaskNav` 的 roving tabIndex、方向键、Home / End、焦点与主题合同。每个视图只接受固定 query；未知、重复、过期或跨视图参数 fail closed。切换视图会清理无关 query，不启动、不取消或清空 operation；公共仓库身份与当前 operation 摘要由页面级唯一状态源读取，只有活动 operation 启用一个 polling，治理与缺口请求在切换时取消并以请求序号防止旧结果覆盖。
- “运行与结果”只通过固定 `full / strict + idempotencyKey` 动作异步调用正式 runner；显式 loopback database base 仍受支持，没有显式 base 时自动使用本机已有的固定 `postgres:18.1` 创建本次专用容器、随机凭据和动态 loopback 端口，正式回执、内部临时数据库、容器与进程组清理全部读回后才可通过。浏览器不能提交 DSN、凭据、镜像、命令或路径，也不会清理外部容器。页面支持刷新恢复、精确取消、有界超时、中文阶段、正式回执、可比环境耗时和最近 20 次脱敏记录；当前版本回执优先于旧运行历史，dirty 结果不会升级成发布证明，样本不足时不估算剩余时间，终态不再显示“预计剩余”。门禁执行轨道直接消费服务端 `profiles` 阶段序列与 operation `stageTimings`，自动分出 strict 附加检查和 full 共用主路径；运行前、运行中和终态原位展示阶段状态、第一失败、最长阶段、正式回执与清理读回，回执和清理不计入 runner 阶段。共享基础检查与 Web 阶段的固定子步骤也只从 runner 登记表投影，不在页面复制命令或推测子步骤实时状态；已记录阶段耗时按阶段耗时之和归一化，并明确标注可并行阶段不能相加推算墙钟时间。只有至少 3 个 profile、环境指纹和 dirty / clean 状态相同的正式通过回执才绘制零基线耗时趋势，精确历史表始终保留。技术 ID、完整 SHA、指纹和原始 stage key 默认折叠。
- 本机托管数据库只提供一张默认折叠、展开后才加载的静态 Mermaid 生命周期图，并同步提供有序文字说明；它解释“登记环境或创建本次专用环境—运行正式门禁—精确清理—回执与清理读回”的固定边界，不承担实时运行状态。实时状态仍只读取当前 environment、operation 和正式回执，页面不为每种门禁重复绘制 Mermaid。
- “门禁治理”只读登记风险、触发条件、正式来源引用、唯一证据与退出条件；不复制命令或测试列表，不提供新增、编辑、跳过、禁用或删除。“覆盖缺口”复用 affected 与七类风险边界，按当前或 staged 改动展示应运行门禁、当前结果和仍缺证据，并以语义化“风险 × 门禁”矩阵支持横向比较；原有逐类风险、原因和证据详情继续保留。本地门禁通过不证明目标发布、回滚、客户 UAT 或签收。
- 页面及 `/__dev/api/qa/quality-gates` 仅在 development serve 存在，生产构建和正式部署不包含路由、页面 chunk、operation bridge、本地回执或 DEV 文案。测试数据仍由独立测试数据页管理，版本发布只读当前 exact SHA 的 strict 摘要与深链，不复制阶段、历史、治理或缺口。

#### 测试数据中心 `/__dev/data-preparation`

- 页面默认按“确认完整回归能否开始 → 核对最新业务链与数据范围 → 准备并确认新批次 → 查看回执与耗时”组织为一条连续工作流。主路径直接读取业务链与造数的同一合同，显示当前 11 条业务链、67 个步骤、66 个合法场景、9 个现有造数阶段和 51 个页面目标；选择业务链只展开责任岗位、前置状态、允许动作、结果状态、Fact 与该步骤已登记场景，不创建局部造数入口。安全结论、阻断和主动作保持可见；SHA、目标指纹、plan hash、run id、固定步骤及历史事件按需展开。
- 页面只通过 development serve 的 loopback Bridge 使用三个固定 profile，不接受 shell、SQL、脚本路径、DSN、后端地址、密码或自定义环境变量。写入口的信任边界是本机开发进程、Host / Origin / `Sec-Fetch-Site`、CSRF 和 operation 确认，不冒充 ERP RBAC。
- `共享开发基础数据 / core-demo` 只允许登记的 `192.168.0.106:5432/plush_erp` 或 `plush_erp_*_dev`，先确认 migration 已到 head，再顺序复用角色演示账号和 Product Core 基础资料 seed。它只生成账号、单位、材料、产品、仓库、工序和 BOM 等稳定开发基线，不生成客户、订单、Workflow、库存、出货或财务事实；稳定 upsert 不等于整批事务，也不提供按 operation 删除。
- `业务场景演示数据 / scenario-demo` 固定使用 `yoyoosun-manual-acceptance / 2026.07.16-v5 / 20260716-V5`，只允许 `127.0.0.1:8300` 对应的登记 106 长期开发库。用户确认后先稳定准备本地岗位账号与至少 30 条由真实控制面操作产生的审计样例，再通过正式 `validate / publish / transition check / activate or rollback / effective-session readback` 对齐当前跟踪的 yoyoosun 本地测试配置，之后才准备 Source Document、已登记的 ProcessRuntime、模拟岗位任务和来源驱动 Fact。同批只允许精确创建或读回；半批、字段或身份漂移直接阻断，不提供清理或重置。收付款覆盖已批准、两笔已过账和已冲销，红冲覆盖一条有效红冲与一组原红冲 / 反向红冲。岗位到期时间是固定 V5 快照，不保证长期维持“今天 / 本周”相对语义；数据前置不替代浏览器验证和岗位人工验收。
- `按最新业务链完整回归 / full-acceptance` 是默认推荐入口，只接受 clean exact commit 和服务端已有的 `LOCAL_ACCEPTANCE_DATABASE_BASE_URL`。每次执行都复用统一 lifecycle 建立新的同批专用库，按当前合同运行全部已登记合法场景、migration、正式 Source / ProcessRuntime / Fact 数据、51 项只读页面验收和收付款、库存人工调整、生产超领三条真实写流程；成功或失败都必须停服、删库并读回零残留。页面记录 operation 实际墙钟时间，并从同一 dataset 回执展示 9 个现有造数阶段的开始、结束和耗时。旧回执只证明对应旧计划，不会被当作最新代码已经回归。
- `scenario-demo` 的页面操作固定为“读取预检 → 点击生成 → 自动准备并冻结 `planHash`、`runId`、仓库和目标摘要 → 核对固定目标 / V5 批次 / 数据范围 / 长期保留边界 → 确认生成 → 异步执行 → 读取回执”，不要求手输长确认串。其他 profile 继续使用完整确认串。执行前身份变化会使原计划失效；页面刷新可恢复最近 operation。进程中断或结果不明确时显示 `not_proven`，不会自动重试；用户可重新准备更晚的同目标 scenario plan 并再次确认，以同一固定批次显式补齐，其他 profile、不同目标或仍在运行的 operation 继续阻断。
- `scenario-demo` 只在固定本机 8300、登记 106 长期开发库、migration 和 runtime identity 已证明后，由后台使用项目登记的本机开发账号约定；显式 Vite 进程环境覆盖值仍优先，但凭据不进入浏览器、命令参数或回执。日常直接在本页点击即可，不需要 `make dev_restart`；只有修改 Vite 凭据覆盖环境时才重启一次 `pnpm start`。后端代码、配置或 migration 变化时才按正式后端流程重启。
- 页面不提供普通“重置全部数据”或 debug cleanup。共享基线按正式账号 / 主数据生命周期退出，已生效业务事实按取消、冲正或调整退出；只有专用验收库允许数据库级自动清理。Workflow task 完成不等于 Fact 已生成。
- 代码变化后不靠 Codex 定时同步平行清单：业务链数据摘要和验证摘要都相同，长期同批数据仍可用；数据摘要相同而验证摘要变化时只需重新核验；数据摘要变化或缺失时必须重新造数。完整回归仍默认每次使用新隔离批次，长期保留规则只服务 `core-demo / scenario-demo` 的日常联调边界。

#### 数据库迁移 `/__dev/database-migration`

- 页面只操作 application config 已登记的 `192.168.0.106:5432/plush_erp` 共享开发库，不接受浏览器传入的 DSN、目标、命令、SQL、脚本路径、凭据或环境变量，也不支持 133、测试或生产数据库。
- 默认只读显示当前 / 最新 migration、pending 数和后端 health / ready。存在 pending 时先点“检查并准备”：Bridge 固定执行同目标 status、停止后端、plan、备份恢复演练和最终身份复核；其它数据库客户端仍占用目标时按既有 guard 阻断，不代替用户强制断开。
- 准备成功后，页面要求输入当前 operation 给出的完整确认串；execute 会再次核对 migration / schema 指纹、目标 revision 和准备阶段备份文件身份，随后同一 operation 只执行一次 apply、`pending=0` 读回、后端重启和 health / ready。提交结果无法证明时标为 `not_proven`，先读回，不自动重试。
- operation 使用 `0600` 原子状态、幂等键和跨 Vite 进程排他锁。migration / schema / guard / 备份编排真源、目标状态或备份文件身份变化会使旧计划失效；未变化且文件大小与 SHA-256 均读回一致的备份恢复报告可以复用，避免同一计划因非写入阻断反复 dump / restore。命令行 `make migrate` 与该页面复用同一 service；非交互调用必须显式使用 prepare / execute 两阶段，prepare 成功不能冒充已迁移。
- 此入口不运行 `fast`、`full`、`strict`、完整验收 lifecycle 或发布构建。后端只在确认 apply 后重启一次；数据库已到 head 时不为了“证明绿色”重新迁移或重建。正式发布迁移继续使用受控发布制品、目标备份、串行锁、readback、smoke 和 rollback point。

#### 客户配置包预检与发布 `/__dev/customer-config`

- 页面通过 `customer`、`view`、`section`、`action`、`release` query 和客户包选择器读取 dev-only registry，当前只登记 `yoyoosun`。未选择或未登记 customer 时只显示状态与已登记列表，不 fallback 到 `yoyoosun`；视图、当前任务和证据批次均可通过 URL 恢复。
- 页面一级任务的用户可见名称为总览、检查配置包、查看变化、页面配置预览和试跑与发布；稳定 `view` 值仍保持 `overview|preflight|diff|assets|import`。配置预检不再一次渲染全部对象，而是通过 `section=package|runtime|flow|evidence` 分成包结构、运行投影、流程策略和验证证据；执行发布通过 `action=dry-run|test-apply|release` 分开试跑证据、测试配置应用和正式发布检查。默认值省略 query，非法或跨视图残留参数会被清理。
- 配置预检和执行发布的当前任务导航在长页面滚动时保持可见；每次只渲染当前任务对应模块，避免把边界、模块、流程、命令和发布操作堆在同一阅读流中。
- 页面配置预览先按业务名称展示品牌和菜单目录，菜单内部键降为展开后的追踪信息；页面配置边界、字段候选、编号规则和打印模板使用互斥展开区，一次只阅读一类明细。
- 页面只读取已登记 customer package，不提供 raw package、任意代码、SQL 或脚本上传。可视内容包括品牌 / 桌面菜单 runtime、字段和编号草案、流程 preview、`moduleStates`、打印模板字段、差异与版本门禁。
- UI Dry Run 只调用 `scripts/import/customerImportDryRun.mjs` 生成 ignored `output/customers/<customer-key>/ui-import-dry-run` 证据，不写数据库。当前登记的 yoyoosun 包仍是 draft / preview-only，`runtimeEnabled / publishEnabled / activateEnabled` 均未开放，因此“测试配置应用”按钮和 handler 都失败关闭，只允许预览和试跑；页面不会把 preview manifest 送入正式编译或发布链路。
- 只有受控配置包明确进入 `release_ready`，同时开放 runtime / publish / activate 后，测试配置应用才会用当前管理员登录态通过 Vite `/rpc` 固定代理 `http://127.0.0.1:8300` 调用后端校验、发布、切换检查、激活和有效配置读回接口。该路径不直写业务数据、不导入真实客户业务数据，也不绕过后端 RBAC；后端以 canonical hash 判断同 revision 幂等或冲突，前端不吞发布错误，并把同一 hash、产品版本和观测到的 active revision 作为 CAS 条件提交，最后按 customer、revision、hash、hash version 和来源读回确认。写入期间客户包和视图会锁定，离开页面不代表已发请求被撤销。
- `moduleStates` 只是控制面输入预览，不安装或卸载模块。`printTemplateDefaults` 只声明甲方 / 委托方默认字段；当前正式消费方是采购订单 `material-purchase-contract` 和委外订单 `processing-contract`，不覆盖供应商 / 加工方业务快照，也不启用销售订单打印模板。
- release readiness 必须显式选择 `deployments/<customer-key>/evidence/releases/<release-batch>` 的已登记批次，不猜 `latest`、不接受父目录或路径穿越。页面只做只读门禁并复制 `customer-config-release-readiness.mjs --print-input-template` 或统一 `customer-config-release-execute.mjs --print-input-template`；备用命令不拼未替换的 `<release-batch>` 或旧 manifest 路径，不再从浏览器直接发布 / 激活“正式版”。正式执行器继续要求目标端点、令牌、确认短语、release report 和 authenticated readback。
- `rollback_customer_config` 只回滚已发布 compiled revision 并记录独立审计，不是 raw 包回滚或业务导入失败恢复；页面不提供裸回滚按钮。
- 维护真源是 `config/customers/<customer-key>/*`、`config/catalog/*`、`config/schemas/*`、`scripts/import/*` 和相关正式文档。

#### 版本发布与部署中心 `/__dev/version-center`

- 页面只在 development serve 中存在，展示当前 HEAD/dirty、GitHub 不可变版本、固定 `test-133` 当前 SHA、容量 blocker 和 operation 状态。它不把本地、CI、制品、目标 smoke 或 UAT 合并成一个绿色结论。
- 页面顶部常驻四项关键状态、未结束 operation 与交付速览；下方以 URL 可恢复的 `版本与部署 / CI/CD 效能 / 操作记录` 三个视图分流阅读。最近最多 20 个不可变版本固定每页 6 条，已结束操作每页 10 条；切换视图不重新请求摘要，也不会停止未结束 operation 的轮询。
- 顶部“人工接管说明”只解释 AI 不可用或用户亲自操作时如何沿用同一正式链路：Codex / 本地终端负责验证、中文提交和 push，GitHub 负责 CI 与不可变 Release，当前页面负责发布制品、部署、回滚和查看回执。说明会先区分可继续与必须停止的证据，再给出固定顺序和禁止捷径；它不创建 commit、push、tag、凭据输入、后台调度或第二套发布动作。
- “CI/CD 效能”直接读取固定 GitHub 仓库最近 CI / Release 的 run、对应 attempt、job 和 step 时间，分别显示统计读取时间及最近动作、完整发布、制品和真实部署的事件时间，并默认展示观测关键路径、最长可见环节和建议复核点；全部 job / step 使用原生按需展开，各 job 初始收起且支持统一展开 / 收起，不自动并发、重跑或复制 GitHub 状态。
- 发布只允许当前 clean exact SHA；GitHub adapter 固定公开仓库、`release.yml` 和 `yoyoosun`，同一 SHA 的 strict 与镜像构建可复用，不会因刷新或失败自动重发。
- 版本列表不改写不可变版本号；GitHub adapter 提供带时区的 `publishedAt`，每行在版本号和 short SHA 下显示本地完整日期时间，并用 HTML `time/dateTime` 保留原始值。Provider 拒绝缺失或非法发布时间，前端摘要合同进一步拒绝无时区值；比 133 当前 manifest 新的版本只允许准备部署，旧版本只允许检查回滚，当前 manifest、migration 序列或客户配置源指纹不能证明时按钮禁用并说明原因。顶部严格门禁与最新不可变版本、当前 operation、历史记录、详情头部和事件流统一显示各自真源提供的完成、发布、开始或更新时间；没有对应真源时显示“时间未证明”，不拿制品发布时间推算目标部署或公网核验时间。
- 发布、部署与回滚先按动作、固定目标、Exact-SHA、版本和发布输入创建或复用 operation；不同窗口的相同意图会合并为一个 operation。同一目标只允许一个执行器；页面刷新从原子 operation store 恢复。`failed / blocked` 可由用户显式创建带父 operation 和尝试次数的新 operation，旧终态不变；`not_proven` 必须先读回目标且不提供重试。幂等证据仍以现有“操作记录”和详情为唯一运行真源，不新增幂等写动作或第二套 operation 状态，也不显示原始幂等键或指纹；演练页只读引用其完成状态。
- Operation 列表同时展示开始时间、终态完成时间和总耗时；未结束 operation 显示开始与最近更新时间。详情通过独立 GET 按需读取最近 100 条脱敏事件，在头部保留 operation 起止时间，每条事件使用完整本地时间并在 `time/dateTime` 中保留原始带时区值，同时把 promotion / rollback v2 回执的固定阶段耗时或本地生命周期耗时显示为可读比例条。浏览器不接收本机路径、repo/workflow/target/SSH/shell/SQL/Docker 输入，也不持有 GitHub 或 SSH 凭据。
- 效能工作台的质量门禁、测试、数据准备、数据库迁移和客户配置执行证据统一展示真源提供的统计读取、开始、完成、阶段、事件、计划、备份验证、发布或激活时间；ISO 值必须自带时区，后端 Unix 时间只在字段合同明确为秒时转换。缺失或非法值显示“时间未证明”，静态目录和没有权威快照时间的页面不使用页面加载时间冒充更新时间。
- 远端基础回执当前只证明制品、备份恢复检查、migration、Compose、health、ready、Web health 与运行 SHA；带凭据岗位矩阵、PDF、客户 UAT 和签收仍需独立完成。

#### 演练与恢复中心 `/__dev/drill-recovery`

- 页面只读复用版本中心同一份摘要、固定目标 preflight、不可变 Release 和 promotion / rollback operation，不新增 Bridge action、后台任务、数据库或第二套状态真源。刷新只会重新读取固定目标状态；目标写入仍回到版本中心按既有准备、确认和读回合同办理。
- 信息层级固定为“当前恢复结论与唯一下一步 → 六项紧凑清单 → 最近交付与应急接管”。桌面只默认展开当前建议，窄屏从全部折叠态开始；目的、触发、证据和安全边界按需展开，不平铺成卡片墙。
- 演练按风险和优先级组织：P0 是目标身份与健康、相同 SHA 幂等、兼容回滚与再前滚；P1 是隔离数据库备份恢复及新服务器 / 正式环境切换；P2 是未来故障注入。普通成功部署不会自动冒充演练；只有明确的 no-target-write 幂等回执，或回滚后再前滚到当前 exact SHA 的完整 operation 链，才显示最近证据可用。
- 每项同时展示建议频率、变化触发条件、完成证据和安全边界。稳定期不要求每次发布都跑完整演练：目标预检仍是每次发布门禁，幂等与隔离恢复建议每月或相关脚本变化后执行，回滚 / 前滚建议每季度及 migration 合同变化后执行。
- 服务器迁移或增加正式环境时，必须先在受控 deployment target registry 登记新的环境身份、路径、Compose、数据库、公网入口和容量合同，再为该目标建立独立 preflight 与 operation。页面使用“环境语义 + 技术 key”展示，不按 IP、机器名或菜单复制一套实现；当前未登记的第二目标保持不可执行。
- 故障注入默认关闭。只有存在独立隔离环境、固定故障目录、明确恢复步骤和残留读回后才可扩展；页面不接受临时主机、路径、凭据、命令、SQL 或 Docker 输入，也禁止对当前试用或正式环境临时制造故障。
- AI 不可用时仍回到版本中心的“人工接管说明”，沿用 clean exact SHA、GitHub CI、不可变 Release、固定 operation 和结果读回；演练页不复制易漂移的命令清单，也不提供绕过门禁的应急按钮。

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单；统一登录页和 `/entry` 只做后台 / 岗位任务端入口选择
- 桌面后台管理员已接入 RBAC 权限中心；普通管理员通过 `roles` 获得 `permissions`，后端返回 `menus`，桌面菜单、岗位任务端入口和后端接口统一消费 permission code。权限清单按后端 `module_name` 展示“物料清单（BOM）/ 库存管理 / 生产执行 / 敏感字段”等业务分类，不在前端重复维护模块翻译；仅对未知或缺失分类合并显示一个“未分类功能”，避免多个技术模块同时冒充“其他功能”。分类导航只负责页内定位，不改变勾选结果或权限真源
- 桌面后台主业务菜单按当前产品设计保留看板中心、主数据、销售管理、产品工程、采购管理、质检管理、库存管理、委外管理、生产管理、出货管理、财务业务、运营工具和系统管理；系统管理当前包含权限管理和审计日志。客户档案 / 供应商与加工厂走正式 MasterData V1 API，销售订单走正式 SalesOrder V1 API，采购订单走正式 PurchaseOrder V1 API。正式业务列表统一为单击行选中、双击行进入编辑 / 主操作弹窗；详情抽屉只由显式详情入口打开。
- 采购订单页面支持列表、关键词 / 状态 / 采购日期或预计到货日期范围筛选、详情、订单头与明细保存、提交、审批、关闭和取消，但只表达采购承诺，不写库存、批次或财务事实。入库、来料质检、库存台账、委外订单、出货单、生产进度、生产排程、生产异常处置、出货放行、出库管理和财务业务已分别接入正式 V1、Workflow V1 或收窄 Operational Fact V1 页面。
- 出货单页面支持状态 / 计划出货或实际出货日期范围筛选、事务内聚合新建草稿、只读查看明细、启动财务审批、确认出货和已出货取消冲正。品质岗位可在启动前从 `DRAFT` 出货单按产品规格、仓库和批次发起出货前成品检验；一旦存在检验，未完成合格 / 让步判定时后端会阻止启动，启动成功后也不再允许补建检验。前端必须校验返回的 ProcessInstance、财务 approval 节点和来源锚点，结构不可信时不冒充成功。没有发起检验仍按当前可选策略启动；创建检验不会启动 Workflow。财务审批通过后只写 Shipment 版本化放行门禁，仓库仍须显式确认出货；`SHIPPED + inventory OUT` 才是真实出货事实。草稿逐行追加已退出，避免重复提交和多行半保存。
- 审计日志页面只读展示启动初始化和账号 / 角色 / 权限等系统控制面事件，不替代业务事实流水。生产排程与历史出货放行由 Workflow V1 协同页只读或按现有任务合同办理；生产排程任务由生产订单下达产生，新的 Shipment 财务 approval 由 `finished_goods_delivery` 产生，历史 `shipment_release` 不再有公开 producer。生产异常处置页的待审批任务由正式处置申请启动的 `production_exception_approval` 生成；返工事实过账产生的 `production_exception` 来源提醒不进入该页待审批任务表。这些页面都不提供通用新建入口，保留任务组和确定性编号不能由普通任务创建或客户配置占用。任务终态只更新协同投影；来源随后关闭、取消或真实出货时可以继续投影 `closed / cancelled / shipped`，但不改写任务处理结论。相关页面只读取对应的 Source Document、Workflow 或 Fact 投影，也不提供删除、回收站、业务数据导出或跨领域事实旁路。
- `生产异常处置` 是上述 Workflow V1 页面中的正式复合变体：`处置申请` 页签读取 ProductionExceptionDecision 并承接审批后的执行 / 冲正，`待审批` 页签只读取 `production_exception_decision_approval` 任务。两个页签分别维护统计、刷新和操作区，每次只挂载当前页签；任务完成仍不代替报废 / 在制让步执行或超领额度消费。
- 正式业务页的“相关单据”支持连续往返。每一跳都以目标页拥有的数值 ID 或来源类型 + 来源 ID 重新建立精确筛选，业务单号只用于筛选框回显，不参与精确请求。目标关系只有一条可确定记录时自动选中并回显目标单号，用户编辑或清空筛选后退出关联上下文；存在多条取消历史且无法唯一确定时不臆选。
- 生产订单页的“工序办理”已接固定 `PLUSH_SEW_HAND_V1` v1：布料加工正常流整单外发且首道不可拆，只有裁片检验 `PASS` 转入车缝后才可按产品数量拆批；车缝和手工按“先车缝、后手工”分别选择本厂或外发。内部完成使用“车间移交 / WIP 转移”，外发完成返回才使用“外发回仓”。首道外发只允许选择逐条精确覆盖显式 `FABRIC_PROCESSING` 冻结材料需求的 MATERIAL 合同行，并在开始前核对已过账委外发料；FABRIC 返工再次外发改用新的 PRODUCT 合同行。生产、品质、业务和 PMC 分别按 WIP 执行、分段质检、包材业务确认和只读跟进权限进入对应入口，业务岗位可凭 `production.wip.read` 打开生产订单页，但新建、编辑、发布、关闭、取消和引用选项仍只认 PMC 计划权限。
- 质量检验页已把生产 WIP 纳入独立读模型，按裁片、皮套、成品、针检、抽检和订单条件性客户验货逐关口展示；每张单只代表当前批次当前关口，生产路线当前只有 `PASS` 可推进，`CONCESSION` fail closed。包材版面 / 包装版本由业务独立确认，不替代正式品质检验；路线订单的完工入库入口会重新核对已验收包装 WIP 数量。
- 上述生产路线、WIP、分段质检和岗位投影当前只证明本地源码与定向合同已经接入；完整 Atlas 迁移链已在一次性 PostgreSQL 18 隔离库 apply 并读回，登记的个人开发库仍有 `20260718110227` pending，目标客户数据库没有本轮 apply、部署、health / smoke 或客户 UAT 证据。
- 首批高优先级业务页已接入共享业务附件面板：销售订单、采购订单、委外订单、采购入库、来料质检、出货单、收窄财务 / 生产 / 委外事实、SKU、BOM、Workflow V1 桌面页和岗位任务端详情可上传、下载附件。待上传文件仍可在保存前“移除”；普通已保存证据不提供物理删除，只允许有所属对象写权限的账号填写原因后“撤销附件”。撤销后列表继续显示文件名、上传账号 / 时间和撤销账号 / 时间 / 原因，预览与下载动作退出且撤销动作保持置灰；正确文件需另行上传，不恢复或改写已撤销记录。产品基础信息页另提供 `产品图 1（主图）/ 产品图 2（辅图）` 两个可替换媒体槽，只允许 PNG / JPEG / WEBP；源图选择不设文件大小上限，超过打印快照预算时浏览器会自动优化为不超过 1MiB、长边不超过 2560px、总像素不超过 400 万的 WEBP。服务端仍对最终快照执行 5MB、单边 8192px 和总像素 2000 万的纵深门禁；同槽替换 / 清空是产品媒体的窄例外，不进入普通证据撤销。普通证据附件上限仍为 5MB，允许格式覆盖常见图片、HEIC / HEIF、PDF、Word、Excel、CSV、文本、ZIP、邮件证据和 WPS 文件；PNG / JPG / WEBP / GIF / PDF 支持轻量预览，其他格式下载后查看。单据编辑弹窗中的附件默认作为备注 / 交付 / 合同资料 / 凭证附近的紧凑证据行放在明细区之前，页面级选中记录附件仍可保留独立区块。附件必须挂到已保存业务记录，上传、预览、下载或撤销都不改变 Source Document、Fact、Workflow、库存、质检或财务状态。
- 委外订单附件另提供“选择合同附图”，只接收 PNG / JPEG / WEBP / GIF 并标记为 `print_appendix`。未撤销的合同附图在打开加工合同打印时冻结带入末尾；普通归档附件不会自动进入纸面，打印窗口内调序、移除或新增也不回写业务附件。
- 桌面后台已恢复 `使用帮助 / 岗位使用帮助` 分组，不恢复旧 `帮助中心`、`开发与验收` 或 `高级文档` 信息架构；前端仍不承接 Markdown 文档页、业务链路调试页或协同任务调试页
- 岗位任务端本地和生产环境统一走 `5175` 的 `/m/<role>/tasks`；不再保留按角色拆端口入口，也不拆第二个仓库
- 岗位任务端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 岗位任务页读取真实 workflow API，采用有意组合的移动主路径：保留 v1 的待办 / 已办 / 风险 / 我的四项主导航、服务端游标分页 / 分批展开和任务卡片。首次无游标 `list_role_tasks` 在同一读快照返回 `ready / blocked / todo / done / rejected / withdrawn / history / total / approval / risk / overdue`、`risk_scope` 和 `server_time`；`todo=ready+blocked`、`history=done+rejected+withdrawn`、`total=todo+history`、`overdue<=risk`，响应字段或公式不可信时失败关闭。待办筛选“全部”读取 `todo`，已办读取 `history`；审批、风险、超时可重叠，不与岗位 `total` 相加。有效 `workflow.task.supervise` 把风险扩为 `risk_scope=supervised` 并显示“跨岗风险”，不扩大当前岗位状态数量或任务办理权限。每个 `todo / approval / risk / history` 查询槽位分别保存数量和服务端时间，后续游标页不重复总数；任务处理成功后使全部槽位失效、重读首屏并恢复原已加载深度。筛选数字不再取本地数组长度，尚未读到可信总数时显示“—”而不是 0。无审批权限时待办筛选为“全部 / 风险 / 超时”，有任一有效审批能力时为“全部 / 审批 / 风险 / 超时”，不增加第五个底部导航；原“我负责”近似筛选已移除。选中任务后进入 v2 独立全屏查看、处理和可信结果回执，结束后恢复原列表的筛选、分页、滚动位置和焦点。完成 / 阻塞 / 退回分别走 `complete_task_action` / `block_task_action` / `reject_task_action`，均由服务端按当前管理员和任务责任推导角色；`withdrawn` 只由来源取消或受控恢复内部写入，不开放为岗位动作。桌面任务看板、Workflow V1 页面、业务协同 Drawer 和岗位任务端提交前预检已消费 `explainWorkflowActionAccess` / `explainWorkflowTaskAssignment` 的后端只读原因；移动端只提交 Workflow task action，附件上传和 Workflow done 都不代表业务 Fact 已生效
- 桌面任务抽屉与岗位任务详情统一把 `get_task_process_context` 展示为“业务轨迹”，把 `list_task_events` 展示为“本任务处理记录”。业务轨迹回答来源流程走到哪里；任务记录按最新在前显示当前任务的进度、异常 / 恢复、责任流转、处理岗位与意见。单条任务事件不是完整审批链，失败也不隐藏另一条读链；两者都不代替 Source Document 或领域 Fact。
- 桌面 `/erp/task-board` 的任务详情抽屉通过 `get_task_assignment_options` 获取服务端筛选后的接收人，并以 `reassign_task` 提交接收人或岗位池、当前 version、幂等键和必填原因；前端不从管理员列表自行拼候选人。当前默认只有老板角色和 super admin 能看到转交动作，但 super admin 不会因全权限自动成为业务岗位接收人；PMC 仍只读监督。转交成功后抽屉关闭并刷新服务端任务投影，只改变个人归属，不改变任务状态或业务事实。`/m/<role>/tasks` 当前仍只提供既有完成 / 阻塞 / 退回 / 催办动作，不把桌面转交入口误写成岗位任务端已接能力
- 正式完成 / 阻塞 / 退回 / 催办入口为一次用户 intent 冻结业务参数、`expected_version` 和安全 UUID `idempotency_key`；HTTPS 优先使用 `crypto.randomUUID()`，内网 HTTP 浏览器使用 `crypto.getRandomValues()` 生成 RFC 4122 v4 key，不允许退回 `Math.random()`。只有新 intent 执行 explain 预检；HTTP 408、网络中断、5xx 或结构不合法的 success response 都保留原 attempt、抽屉、原因、证据和同一 key，原样读取 / 重放 receipt，不刷新列表也不把未知结果误报为失败。后端在每次请求仍重新校验登录、RBAC、客户 scope、任务可见性和 receipt，前端跳过重复 explain 不构成授权绕过
- Dashboard、Workflow V1 页面、岗位任务端、采购订单与委外订单协同入口共用 task 级同步 in-flight guard：同一 task 的首个动作在任何 await 前取得 lease，完成 / 阻塞 / 退回 / 催办跨动作双击不会发出第二个请求，`finally` 只释放本次持有的 lease。Go 与 JS 已共同消费 `scripts/qa/workflow-task-mutation-intent-v1.vectors.json`，锁住 mixed evidence 类型 / 顺序、raw whitespace key、mobile 精确重复 key 和 changed-intent relations；Node 24.14 定向 util + mobile + purchase / outsourcing guard 为 33/33，联合 Workflow API / caller 为 62/62，受影响 ESLint 0 error。该结果不代表 final full/strict、页面级浏览器回归（Style L1）或目标环境证据已经完成。
- 岗位任务端复用管理员登录态，登录页固定提供密码登录，并在后端启用短信能力时提供短信登录；账号未授权当前角色、手机号未绑定或未授权当前角色、登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 登录页公开提供 `/legal/privacy` 与 `/legal/system-rules`，短信模式在手机号旁说明登录验证用途；登录后的电脑账号菜单和手机“我的 / 入口与安全”保留同一规则入口。`LegalNoticeGate` 按当前账号、客户 `legalNotice` 版本和规范化内容指纹查询后端追加式知悉审计；未命中时要求“已阅读并知悉”，规则或客户处理方配置变化后重新提示。该回执不是概括授权同意，不存手机号、密码、token 或业务原文；状态核对失败时显示可重试警告，不阻断全部 ERP。
- 模板打印当前由对应业务页选中记录后带值打开；产品页维护的 0–2 张产品图会在 BOM 生成物料明细 / 作业指导书时冻结到右上角，委外订单仅在全部有效产品行归属同一产品时自动带图。打印中心保留默认样例，并已按原型复核后的轻量两栏承接左侧模板导航、右侧纸面预览和打印窗口入口；字段和当前草稿图片编辑在独立打印窗口内完成。
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- `docs/product/prototypes/admin-command-center-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已吸收主要运行时骨架：`/erp/dashboard` 是后台首页 / 工作台，并承接待我处理、按有效审批能力显示的待我审批与阻塞 / 逾期风险队列；`/erp/task-board` 是任务看板，`/erp/business-dashboard` 是业务看板，`/erp/print-center` 是模板打印中心。工作台和业务看板保留后台运营中枢导航；不再提供重复的通用异常总控页。未获用户明确确认前，不能把该资产改成 Current。
- `docs/product/prototypes/print-template-center-v1/` 按 `待实现 / To Implement` 登记，补齐模板打印中心独立样板；当前运行时已按原型复核后的轻量两栏保留模板导航 / 预览和打印窗口入口，字段编辑回到独立打印窗口。该原型不新增样品确认单、字段映射配置、后端 API、RBAC、schema、migration 或 Fact 写入。
- `/erp/task-board` 任务看板的关键词、状态、角色、到期、来源、泳道和页码使用 URL query 保存，支持复制链接、刷新恢复和一键清空。页面读取服务端 `get_task_board` 全量投影，顶部指标与下方“常规待办 / 阻塞与退回 / 到期提醒 / 已结束”四个互斥泳道一一对应，四项之和等于当前筛选的真实总数。首次进入看板才使用整卡加载；分类或翻页切换会保留同一筛选范围的顶部指标，只让下方泳道显示局部加载并在请求完成后替换结果。总览每栏最多展示 5 条并标明“已显示 / 共多少条”，单栏聚焦后按 8 条分页；不再把 `list_tasks(limit: 200)` 的当前页长度冒充全量统计，也不在前端循环拉取全部任务。这些筛选和投影只影响看板展示，不写用户偏好、Workflow 任务状态或 Fact 表。
- 正式业务列表页的 `PageHeaderCard.stats` 只接受非负安全整数计数，`0` 表示已成功读取且确实为零；数字字符串、视图名、模式名、文字状态、负数和不可用占位不会渲染为页头指标。当前视图和状态文字放在页签、标签或说明中；请求失败 / 尚未读取等 unavailable 语义继续由看板自己的 `— / 暂不可用` 状态承接，不伪装成 `0`。
- `docs/product/prototypes/business-module-page-standard-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已经由客户、供应商、产品、材料、SKU、BOM、销售订单、采购订单、采购入库、来料质检、委外订单和出货单等正式 V1 页面复用业务页骨架，收窄 Fact / Workflow 页面继续遵守各自事实边界。`/__dev/prototypes` 仍保留待实现队列，未获用户明确确认前不清空队列、不晋级 Current。
- 当前业务页、岗位任务端页面、桌面工作台、任务看板、异常闭环、业务看板和模板预览已经齐入口；业务数据分别落在领域专表、Source Document、Workflow 与 Fact 真源。采购合同 / 加工合同已支持业务页带值打开，桌面任务看板只处理 Workflow 协同任务，不直接写库存、出货、应收、开票、付款或其他事实表；真实客户数据批量导入、打印留档回写和尚未接入的细分领域专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置；`AppModal` 复用 Ant Design 的遮罩、键盘、焦点圈定和触发点恢复，并只补充业务面板外观与可访问名称。
- 业务记录的新建 / 编辑优先使用业务表单弹窗；详情抽屉只用于显式只读核对。生产排程和出货放行页只读取并处理来源生成的 Workflow 协同任务；生产异常处置页以独立页签分开处置申请和待审批任务。三者都不提供通用任务创建弹窗，也不能把协同结果写成生产订单、生产异常执行、出货单、库存、财务或发票事实；来源、打印、删除等未接入真实 usecase 的动作不能写成真实业务动作。
- 桌面端业务录入弹窗默认按紧凑自适应栅格排布：文本字段在可用宽度内多列展示，数量类短字段进一步收口，备注、边界说明和明细区保留整行。
- V1 主数据和销售订单表单弹窗宽度基线为 `min(960px, calc(100vw - 96px))`；普通 Workflow V1 协同创建弹窗使用当前共享业务弹窗约束，不恢复 formal-shell 字段预览弹窗主路径。生产排程、生产异常处置和出货放行是来源生成页，不渲染该创建弹窗。
- 明细条目按共享列宽预算展示，长文本字段保留较宽输入，数量 / 单价 / 金额等短数字字段收窄；数量后缀读取当前行已填单位，金额类字段默认显示 `CNY` 后缀，但不把空单位强行保存成 `pcs`。
- 单据级附件属于主对象证据字段，放在备注、交付、合同资料或凭证语义附近，并位于订单行、BOM 明细、出货明细等 item 区之前；未保存状态可先选择附件并在保存成功后自动上传绑定，单个附件上限 5MB，PNG / JPG / WEBP / GIF / PDF 可轻量预览，HEIC / HEIF、Office、ZIP、邮件证据和 WPS 文件下载后查看，无附件状态使用紧凑空态，不在弹窗末尾放置独立大区块，避免明细增多后必须滚到最后才看见上传入口。
- 产品图不是普通证据附件：产品表单内固定显示两个紧凑图片位，选择、替换或清空先留在当前表单会话，产品保存成功后才调用产品媒体接口；取消或产品保存失败不写图片，已打开打印草稿也不随主档后续替换而变化。
- 弹窗壳层按主题区分：浅色主题保持 Ant Design 轻量基线；暗色主题必须提供可辨认的遮罩、独立边框、浮层阴影以及 header / body / footer 分隔，避免业务页背景和弹窗融成一片。
- 弹窗 body 内部接管纵向滚动，避免长表单溢出视口；明细横向滚动只允许收口在明细容器内，不外溢到整组 Modal。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角；浅色焦点态保留 ERP 绿色，暗色普通 hover / focus 使用 slate / blue 交互色，绿色仅保留给品牌主按钮和状态强调，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
