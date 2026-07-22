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
| `src/erp/qa/` | 字段联动等前端 QA catalog 与报告生成依赖                         |
| `src/pages/`  | 根路由重定向、登录、注册、管理员登录                              |
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

本地开发端口由仓库根目录 `config/dev-ports.env` 统一提供，Vite 主入口固定 `5175` 并启用 `strictPort`；被占用时应处理占用者或调整完整本机端口组，不能让主入口静默顺延。`API_ORIGIN` 仍可显式覆盖，否则代理从同一清单的 HTTP `8300` 推导。

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

岗位任务端也属于客户运行态入口，不属于无客户 key 的 Product Core 控制面。`/m/<role>/tasks` 先用当前静态客户配置 key 读取 `customer_config.get_effective_session`，只有 effective session 带有客户 key 时才挂载岗位任务页并请求 Workflow 任务；没有有效客户 key、Product Core 中性入口或 sync-failed 空投影时，只显示“暂时无法进入岗位任务端”的拦截页，不读取客户 Workflow 任务、不展示客户待办 / 逾期 / 详情 / 操作按钮。`mobile.<role>.access` 只表示账号具备该岗位入口权限，不等于已经进入某个客户运行环境。

当前诊断例外都收口在 `adminProfileSync` helper 的前端 pages 判定层，不改变正式客户 / 非前端 DEV 构建普通账号必须同时命中 RBAC 菜单路径和 active revision pages 的强收窄：`local dev` 指前端 DEV 构建态，不等于测试 / 目标环境；local dev 只允许已登记且 RBAC 已允许的直达 URL 放开第二层 pages 用于排障，不把 active revision 隐藏页加入普通账号侧边菜单。菜单项过滤中普通账号仍必须先通过第一层 RBAC 菜单路径，再命中 active pages；空数组继续收窄为无可见页面。`super admin` 在 active customer runtime 用于查看当前客户系统能力进度，仍可看到完整产品导航中的业务页、业务动作和字段列；无客户运行态则只显示 Product Core 控制面导航，并在 `/erp/dashboard` 显示产品核心总览。这只是前端可见 / 可发起层，不扩大后端写入口。对业务看板、销售、采购、委外、库存、质检、出货、财务、主数据和异常闭环等客户业务数据页，`ERPLayout` 只通过 `shouldGuardCustomerBusinessPageRuntime` 消费 `dataRuntimeScope / canMountCustomerBusinessPages`，不直接复用 `super_admin_product_core` 判断数据挂载；只有带 customer key 且来源为 active revision 的 super admin 才属于 customer runtime，业务页读取当前客户部署数据库；`builtin_rbac_fallback` 即使带同 key 也不升级为 customer runtime。后端仍按 RBAC、active module states、业务状态机、Workflow owner / assignee / break-glass、Fact usecase、幂等和审计决定是否允许真正写入。helper 本身不登记页面，也不校验原始 URL 是否是正式入口；页面范围来自调用方：侧栏菜单项过滤传入当前运行态菜单，隐藏 URL 判定使用完整产品导航调用 `resolveCurrentNavigationEntry`。当前 URL 若解析出未授权菜单权限路径，普通账号仍会被 RBAC 层判定跳转；若无法解析出菜单权限路径，则不会单独因 RBAC 触发跳转。未命中菜单定义时只用工作台作为标题 / 面包屑显示 fallback，`pageKey / menuPath` 保持为空，不参与 active pages 授权，也不选中工作台菜单。`getAdminProfileSyncErrorAction` 的 `hasCachedProfile` 只决定同步失败错误的动作分类；`ERPLayout` 在客户配置同步失败时仍只复用 `adminProfileRef.current.effective_session`，普通 `me` profile 缓存不等于已经存在客户配置投影缓存。

在进入上述菜单与页面投影逻辑前，客户部署若已通过静态配置声明 customer key，`ERPLayout` 会等待 profile/effective session 首次同步完成，并要求 effective session customer key 与部署 key 一致。正式构建、静态预览、同步失败、缺失或 key 不匹配且没有可用的同客户缓存投影时，页面 fail closed 到“暂时无法进入工作台”，不挂载 Product Core、RBAC-only 或客户业务 `Outlet`。`start:yoyoosun` 的前端 DEV 构建只有一个窄例外：后端成功返回同 customer key 的 `builtin_rbac_fallback` 时，可挂载带明确警示的本地桌面预览壳；该投影不升级为 customer runtime，`dataRuntimeScope` 仍是 `product_core_review` 或 `customer_runtime_missing`。工作台和任务看板只显示 Product Core 能力审阅且不发出 Workflow RPC，客户业务数据页继续由 `canMountCustomerBusinessPages=false` 拦截，岗位任务端也仍只接受 active revision。

正式前端文案统一站在当前使用账号和业务人员视角：本地 `pnpm start` / `start:yoyoosun`、`preview:yoyoosun` 与生产构建复用正式业务组件和文案；仅 `start:yoyoosun` 的 DEV fallback 壳显示开发诊断警示。`customer key`、`客户运行环境`、`Product Core`、配置投影和后端实现术语只保留在开发调试页、该 DEV 警示、无客户 Product Core 页面、日志或技术文档中，不出现在客户正式业务界面；交易主体“客户”和合同法律主体“甲方 / 委托方 / 订货方”仍按业务语义保留。

| 场景                                                                       | 当前前端行为                                                                                                                                                                                                                                                                                                                                                                                | helper reason                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 正式客户 / 非前端 DEV 构建普通账号                                         | 正常 active revision 必须同时通过 RBAC 菜单路径和 active revision pages 交集；配置了部署 customer key 时，sync failure 且没有同 key cached effective session 会先进入客户运行态不可用页，不再挂载空投影业务壳；已有同 key cached effective session 时继续按缓存投影收窄，正式客户仍是强收窄。                                                                                               | `effective_session_page` / `effective_session_page_blocked`                 |
| `local dev` 普通账号                                                       | 同 customer key 的 active revision 正常挂载；若成功读回 `builtin_rbac_fallback`，只允许带警示的桌面预览壳，不把 fallback 视为 customer runtime；工作台 / 任务看板只做零 Workflow RPC 的能力审阅，客户业务数据页和岗位任务端继续 fail closed。菜单仍按 RBAC 路径和 pages 规则收窄；sync failure、customer key 不匹配或缺失仍进入客户运行态不可用页。                                                        | `local_dev_customer_config_diagnostic` / `customer_runtime_missing`         |
| `local dev` super admin                                                    | 第一层前端 RBAC 菜单路径不依赖 `allowedMenuPaths`；active revision 正常挂载客户运行态，同 key `builtin_rbac_fallback` 只挂载带警示的桌面预览壳且业务数据页保持 Product Core 审阅，无客户 key 时侧栏只使用 Product Core 控制面导航。隐藏 URL 始终按完整产品导航解析，未登记路径只得到显示 fallback，不得到授权 page key。                                                                                       | `super_admin_product_core`                                                  |
| 正式 / 非前端 DEV 构建 super admin，正常 active revision                   | 前端菜单路径不依赖 `allowedMenuPaths`，也不再被 active pages / active actions / field policy 收窄；若 effective session 带有客户 key，则侧栏使用完整产品导航、`dataRuntimeScope=customer_runtime`、`canMountCustomerBusinessPages=true`，业务页仍按该客户运行环境读取当前部署数据库；后端写入口仍按模块状态、业务状态、Workflow / Fact 边界和审计门禁执行。                                 | `super_admin_product_core`                                                  |
| 中性 Product Core 构建 super admin，`effective_session_sync_failed` 空投影 | 未配置静态 customer key 时，前端菜单路径不依赖 `allowedMenuPaths`，侧栏只显示 Product Core 控制面导航；此时 `dataRuntimeScope=sync_failed_diagnostic`、`canMountCustomerBusinessPages=false`，`/erp/dashboard` 显示产品核心总览，客户业务数据页可通过直达 URL 进入 Product Core 能力审阅页，不挂载真实业务 `Outlet`。已配置 customer key 的客户部署不走此分支，而是进入客户运行态不可用页。 | `super_admin_product_core`                                                  |

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

默认命令构建中性产品包。客户私有化前端包必须在本地或 CI 构建时显式传入客户 key，Dockerfile 会把经过审查的 `config/customers/<customer-key>/customer-config.example.js` 覆盖到构建产物的 `customer-config.js`，并且只复制 `public-assets/` 到 `customer-assets/<customer-key>/`。原始表格、工程图和员工信息不会进入公开产物：

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

`start:yoyoosun` 同样从 `15200` 起在 `15200-15299` 辅助块内自动顺延端口，保留 HMR，并复用 `pnpm start` 的 schema / migration / health / ready 预检，再检查 yoyoosun 静态配置和公开资源存在。启动命令只注入前端静态客户配置，不自动写库或切换后端 revision。登录后可在 `/__dev/customer-config?customer=yoyoosun` 由管理员显式确认应用；dev-only middleware 只接受匹配的 `start:yoyoosun` 客户上下文和 loopback `API_ORIGIN`，生成内容寻址、长度不超过 64 的 `local_test_apply` revision，再由已开放本地 gate 的后端执行 validate / publish / transition / active readback。该操作写入共享开发 PostgreSQL 客户配置控制面，active 切换对其他共享库使用者也可见；默认后端与正式 validator / executor 均拒绝 local-test marker，因此不等于正式 publish / activate、目标环境部署或客户签收。

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
- 桌面工作台和任务看板，包括待我处理、阻塞 / 逾期风险队列、协同任务筛选、任务详情抽屉、阻塞 / 退回原因面板、催办，以及基于 `complete_task_action` / `block_task_action` / `reject_task_action` 的任务动作
- 桌面业务看板和模板打印中心
- 当前正式业务页连续回归，包括客户档案、供应商档案、销售订单 V1 页面、采购订单日期筛选和出货单日期筛选（桌面 / 窄屏）
- 当前正式业务页表格、筛选、列顺序账号偏好、弹窗布局和协同入口
- 权限管理和审计日志
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台

`pnpm smoke:mobile-auth-login-route` 当前覆盖全部 9 个业务岗位任务端入口的未登录拦截、缺少岗位任务端角色授权的旧登录态回登录页、登录页密码入口、后端能力开启时的短信入口、账号密码登录后回跳任务页、`admin.me` 与客户 effective session 刷新、当前优先事项 / 风险提醒 / 已办进度展示、岗位任务端不显示技术说明，以及退出登录清空登录态。

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
- 桌面侧栏在权限过滤后附加 `使用帮助 / 岗位使用帮助`；该入口属于登录态壳层能力，不恢复 `erp.help_center.read` 或其他旧权限别名。
- `/erp/help-center` 根据当前有效岗位选择 `src/erp/config/roleHelpContent.mjs` 中的内容，多岗位账号可切换，单岗位账号不显示切换器，常用入口继续与当前可见菜单取交集。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/source-readiness` 和 `/erp/mobile-workbenches` 路径不再注册运行时路由、重定向或权限别名。
- 仓库级 `docs/product/*`、`docs/architecture/*`、`docs/archive/*` 仍是正式文档体系，但不镜像到前端运行时。

### 本地开发入口 / Dev-only surfaces

下列页面只在开发构建中可访问，不进入侧栏、`seedData`、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单。

| 路径                       | 职责                                     | 维护真源                                                    |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `/__dev`                   | 开发态导航、搜索、分组和本地置顶         | `web/src/erp/config/devHub.mjs`                             |
| `/__dev/governance`        | 项目治理地图只读可视化                   | `docs/项目治理地图.md`                                      |
| `/__dev/docs`              | 当前工作区 Markdown 查看器               | 仓库 Markdown 文件本身                                      |
| `/__dev/testing`           | 验证层级、当前命令和预设查询             | `docs/product/自动化测试策略.md`                            |
| `/__dev/prototypes`        | HTML / PNG / 截图原型资产预览            | `docs/product/prototypes/**`                                |
| `/__dev/capability-ledger` | 产品能力、证据、客户交付和差异台账查看   | 四份正式台账 / 证据 Markdown                                |
| `/__dev/customer-config`   | 已登记客户配置包预检、测试应用与发布门禁 | `config/customers/<customer-key>/*` 及 customer config 脚本 |

#### 开发导航 `/__dev`

- 入口卡片在当前标签内进入子页，不改变各子页内部导航。
- 卡片显示用途、真源路径和边界摘要；重复“进入”链接使用页面专属可访问名称，实时搜索不再渲染无动作的搜索按钮。
- 置顶只写浏览器本地偏好，不是后端配置。
- 开发导航使用 `/favicon-dev.svg`；测试入口使用 `/favicon-testing.svg`，每个开发页同时提供独立浏览器标题，只用于区分本地开发页面。
- 六个子页统一提供开发工作台全局菜单、当前页高亮、返回开发导航、复制当前深链和按需打开来源文档；开发人员可以在任意子页直接切换治理、文档、测试、原型、能力和客户配置，不再先返回首页寻找入口。“开发工作台”按钮是唯一返回总览的入口，不在菜单中重复放第二个“总览”。移动端全局菜单允许横向滚动，并保持单一当前页语义。

#### 项目治理地图 `/__dev/governance`

该页只读解析 `docs/项目治理地图.md`，展示治理维度、常见任务分流、Mermaid 图、文档跳转和路径复制。`axis` / `scope` 写入 URL，可刷新、前进后退和分享；非法值会规范化。页面不创建第二份治理真源。

#### 开发文档 `/__dev/docs`

- Vite 在开发服务启动时收集仓库入口、`docs/**/*.md`、`config/customers/**/*.md` 和 `AGENTS.md`；客户配置页的“查看来源文档”因此会命中真实客户配置包说明。页面不校验 Git tracked 状态，因此不得将“能查看”解读为“已纳入版本管理”。
- `?path=<markdown-path>#<section-anchor>` 可直达文档和章节；在页面选择文档或章节会同步 URL，浏览器前进后退和刷新可恢复。相对 Markdown 链接继续留在开发文档查看器，站外链接保持普通外链行为。
- 搜索结果、目录树和置顶区都可快速置顶或取消置顶。章节标签支持展开换行、收起横向滚动、跳转和回到顶部。
- Markdown fenced `mermaid` 代码块会只读渲染为图表，可在当前页面适配宽度、缩放、重置和全屏查看。

#### 产品原型 `/__dev/prototypes`

该页只浏览 `docs/product/prototypes` 下的 HTML、PNG 和截图证据，支持分类、分组折叠、当前资产和本地置顶恢复。筛选无结果时预览同步为空；每个资产可打开对应 README、复制仓库路径，并通过隔离 sandbox 预览。全屏预览进入弹窗焦点、圈定 Tab、Escape 关闭并恢复触发按钮。卡片参照范围不是正式菜单、路由、权限或 `seedData` 映射表。

#### 能力台账 `/__dev/capability-ledger`

该页只读解析下列四份文档，展示产品能力快查与证据详情、客户交付状态和客户差异分类：

- `docs/product/产品能力进度台账.md`
- `docs/product/产品能力证据详情.md`
- `docs/customers/yoyoosun/客户交付矩阵.md`
- `docs/customers/yoyoosun/客户差异台账.md`

解析按当前表头签名和完全同名的能力标题连接，不依赖章节编号，不恢复或伪造 `CAP-*` 关系。表头漂移、重复入口、详情缺失或孤立标题会显示明确诊断；筛选无结果时不回退到筛选外详情。四份 Markdown 仍是唯一维护入口。

能力台账的产品能力、客户交付和客户差异使用带任务说明的一级视图导航；分布统计默认收起，开发人员需要分析结构时再显式展开，避免分布卡挤占日常“筛选 → 选择 → 查看详情”主路径。展开状态写入 `analysis=1`，可随深链恢复。产品能力分析会从 `docs/product/产品能力进度台账.md` 的正式定义表同屏展示完整 L0–L8 梯度、含义和客户承诺边界；这里的 L0–L8 是能力成熟度，不是 `style:l1` 或 T0–T8 验证层级。

`/__dev` 可见分类、状态、格式和筛选项默认使用“中文主体 / English anchor”。英文原值继续作为 Markdown 真源、筛选值和稳定技术锚点，不直接作为无说明的下拉选项；同一分类在筛选、列表、详情和分布图中复用 `devVisibleLabels.mjs` 的展示口径。能力台账的所属层、业务域、成熟度、交付状态和差异分类必须显示可见字段名，不能只依赖 aria-label 后让多个闭合下拉框都显示无法区分的“全部”。路径、命令、配置 key、API/RPC 名和代码标识保持原文。

#### 测试入口 `/__dev/testing`

- 该页只读解析自动化测试策略、`scripts/README.md`、`web/scripts/README.md`、前后端 README 和部署说明等 9 份当前白名单文档，展示 T0-T8、命令块、常用预设和独立的“覆盖状态 / Coverage”视图。
- `docs/reference/**` 和 `docs/archive/**` 默认不进入可复制命令来源，避免把历史或未来命令写成当前测试入口。
- 多行命令会保留完整续行参数；不完整且以反斜杠结尾的命令不会进入复制结果。命令区按内容高度展示，不再被网格压缩裁切；筛选无结果时文档详情同步为空。
- 覆盖视图从 dev-only `GET /__dev/api/qa/coverage` 读取固定 `output/qa/coverage/latest.json`，按 Go、Web、业务域、T0-T8、PostgreSQL、浏览器、readiness、目标环境和 UAT 分栏；未采集、过期、失败、跳过、阻塞和零执行不会折算为通过，也不会合并成一个总百分比。
- 报告接口仅在 development serve 且请求来源与 Host 都是 loopback 时可用，返回 `no-store` 脱敏摘要；生产 build 不包含 `output/qa/**`，也不再从 `public/qa` 携带本机路径或覆盖报告。
- 先运行 `node scripts/qa/erp-field-linkage.mjs`，再运行 `node scripts/qa/test-coverage-report.mjs --write` 刷新本地报告。字段联动 runner 会前后校验仓库指纹；仓库在运行期变动时 fail closed，不生成冒充当前的证据。页面复制按钮不会执行 shell，聚合命令也不会自动执行 full / strict、数据库或浏览器写入测试；`docs/product/自动化测试策略.md` 仍是测试选择和覆盖门槛真源。

#### 客户配置包预检与发布 `/__dev/customer-config`

- 页面通过 `customer`、`view`、`section`、`action`、`release` query 和客户包选择器读取 dev-only registry，当前只登记 `yoyoosun`。未选择或未登记 customer 时只显示状态与已登记列表，不 fallback 到 `yoyoosun`；视图、当前任务和证据批次均可通过 URL 恢复。
- 页面一级任务固定为总览、配置预检、差异、界面配置和执行发布。配置预检不再一次渲染全部对象，而是通过 `section=package|runtime|flow|evidence` 分成包结构、运行投影、流程策略和验证证据；执行发布通过 `action=dry-run|test-apply|release` 分开试跑证据、测试配置应用和正式发布检查。默认值省略 query，非法或跨视图残留参数会被清理。
- 配置预检和执行发布的当前任务导航在长页面滚动时保持可见；每次只渲染当前任务对应模块，避免把边界、模块、流程、命令和发布操作堆在同一阅读流中。
- 页面只读取已登记 customer package，不提供 raw package、任意代码、SQL 或脚本上传。可视内容包括品牌 / 桌面菜单 runtime、字段和编号草案、流程 preview、`moduleStates`、打印模板字段、差异与版本门禁。
- UI Dry Run 只调用 `scripts/import/customerImportDryRun.mjs` 生成 ignored `output/customers/<customer-key>/ui-import-dry-run` 证据，不写数据库。当前登记的 yoyoosun 包仍是 draft / preview-only，`runtimeEnabled / publishEnabled / activateEnabled` 均未开放，因此“测试配置应用”按钮和 handler 都失败关闭，只允许预览和试跑；页面不会把 preview manifest 送入正式编译或发布链路。
- 只有受控配置包明确进入 `release_ready`，同时开放 runtime / publish / activate 后，测试配置应用才会用当前管理员登录态通过 Vite `/rpc` 固定代理 `http://127.0.0.1:8300` 调用后端校验、发布、切换检查、激活和有效配置读回接口。该路径不直写业务数据、不导入真实客户业务数据，也不绕过后端 RBAC；后端以 canonical hash 判断同 revision 幂等或冲突，前端不吞发布错误，并把同一 hash、产品版本和观测到的 active revision 作为 CAS 条件提交，最后按 customer、revision、hash、hash version 和来源读回确认。写入期间客户包和视图会锁定，离开页面不代表已发请求被撤销。
- `moduleStates` 只是控制面输入预览，不安装或卸载模块。`printTemplateDefaults` 只声明甲方 / 委托方默认字段；当前正式消费方是采购订单 `material-purchase-contract` 和委外订单 `processing-contract`，不覆盖供应商 / 加工方业务快照，也不启用销售订单打印模板。
- release readiness 必须显式选择 `deployments/<customer-key>/evidence/releases/<release-batch>` 的已登记批次，不猜 `latest`、不接受父目录或路径穿越。页面只做只读门禁并复制 `customer-config-release-readiness.mjs --print-input-template` 或统一 `customer-config-release-execute.mjs --print-input-template`；备用命令不拼未替换的 `<release-batch>` 或旧 manifest 路径，不再从浏览器直接发布 / 激活“正式版”。正式执行器继续要求目标端点、令牌、确认短语、release report 和 authenticated readback。
- `rollback_customer_config` 只回滚已发布 compiled revision 并记录独立审计，不是 raw 包回滚或业务导入失败恢复；页面不提供裸回滚按钮。
- 维护真源是 `config/customers/<customer-key>/*`、`config/catalog/*`、`config/schemas/*`、`scripts/import/*` 和相关正式文档。

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单；统一登录页和 `/entry` 只做后台 / 岗位任务端入口选择
- 桌面后台管理员已接入 RBAC 权限中心；普通管理员通过 `roles` 获得 `permissions`，后端返回 `menus`，桌面菜单、岗位任务端入口和后端接口统一消费 permission code
- 桌面后台主业务菜单按当前产品设计保留看板中心、主数据、销售管理、产品工程、采购管理、质检管理、库存管理、委外管理、生产管理、出货管理、财务业务、运营工具和系统管理；系统管理当前包含权限管理和审计日志。客户档案 / 供应商档案走正式 MasterData V1 API，销售订单走正式 SalesOrder V1 API，采购订单走正式 PurchaseOrder V1 API。正式业务列表统一为单击行选中、双击行进入编辑 / 主操作弹窗；详情抽屉只由显式详情入口打开。采购订单页面支持列表、关键词 / 状态 / 采购日期或预计到货日期范围筛选、详情、订单头与明细保存、提交、审批、关闭和取消，但只表达采购承诺，不写库存、批次或财务事实。入库、来料质检、库存台账、委外订单、出货单、生产进度、生产排程、生产异常、出货放行、出库管理和财务业务已分别接入正式 V1、Workflow V1 或收窄 Operational Fact V1 页面；出货单页面支持状态 / 计划出货或实际出货日期范围筛选、事务内聚合新建草稿、只读查看明细、显式提交放行、确认出货和已出货取消冲正。品质岗位可在提交放行前从 `DRAFT` 出货单按产品规格、仓库和批次发起出货前成品检验；一旦存在检验，未完成合格 / 让步判定时后端会阻止提交，提交成功后也不再允许补建检验。提交返回必须通过前端对任务编号、任务组、来源、责任岗位、状态、来源合同和意图摘要的完整校验，结构不可信时不冒充成功。没有发起检验仍按当前可选检验策略提交；创建检验不会启动 Workflow。放行任务完成只表示允许仓库执行，`SHIPPED` 才是真实出货事实。草稿逐行追加已退出，避免重复提交和多行半保存。审计日志页面只读展示启动初始化和账号 / 角色 / 权限等系统控制面事件，不替代业务事实流水。生产排程、生产异常和出货放行由 Workflow V1 协同页承接读取、完成、阻塞和催办；任务分别由生产订单下达、返工事实过账和出货单显式提交放行生成，页面不提供通用新建入口。三类保留任务组和确定性任务编号不能由普通任务创建、流程节点或客户流程配置占用。任务终态只更新协同投影；来源随后关闭、取消或真实出货时，页面读取的来源投影可继续显示 `closed / cancelled / shipped`，但不改写任务处理结论。三者不读取或写入旧 `business_records`，也不提供删除、回收站、业务数据导出或生产 / 出货 / 库存 / 财务领域事实写入主路径。旧预览壳页、旧通用业务页、旧业务模块路由和旧入口退出页已删除。
- 正式业务页的“相关单据”支持连续往返。每一跳都以目标页拥有的数值 ID 或来源类型 + 来源 ID 重新建立精确筛选，业务单号只用于筛选框回显，不参与精确请求。目标关系只有一条可确定记录时自动选中并回显目标单号，用户编辑或清空筛选后退出关联上下文；存在多条取消历史且无法唯一确定时不臆选。
- 生产订单页的“工序办理”已接固定 `PLUSH_SEW_HAND_V1` v1：布料加工正常流整单外发且首道不可拆，只有裁片检验 `PASS` 转入车缝后才可按产品数量拆批；车缝和手工按“先车缝、后手工”分别选择本厂或外发。内部完成使用“车间移交 / WIP 转移”，外发完成返回才使用“外发回仓”。首道外发只允许选择逐条精确覆盖显式 `FABRIC_PROCESSING` 冻结材料需求的 MATERIAL 合同行，并在开始前核对已过账委外发料；FABRIC 返工再次外发改用新的 PRODUCT 合同行。生产、品质、业务和 PMC 分别按 WIP 执行、分段质检、包材业务确认和只读跟进权限进入对应入口，业务岗位可凭 `production.wip.read` 打开生产订单页，但新建、编辑、发布、关闭、取消和引用选项仍只认 PMC 计划权限。
- 质量检验页已把生产 WIP 纳入独立读模型，按裁片、皮套、成品、针检、抽检和订单条件性客户验货逐关口展示；每张单只代表当前批次当前关口，生产路线当前只有 `PASS` 可推进，`CONCESSION` fail closed。包材版面 / 包装版本由业务独立确认，不替代正式品质检验；路线订单的完工入库入口会重新核对已验收包装 WIP 数量。
- 上述生产路线、WIP、分段质检和岗位投影当前只证明本地源码与定向合同已经接入；完整 Atlas 迁移链已在一次性 PostgreSQL 18 隔离库 apply 并读回，登记的个人开发库仍有 `20260718110227` pending，目标客户数据库没有本轮 apply、部署、health / smoke 或客户 UAT 证据。
- P0/P1 业务页已接入共享业务附件面板：销售订单、采购订单、委外订单、采购入库、来料质检、出货单、收窄财务 / 生产 / 委外事实、SKU、BOM、Workflow V1 桌面页和岗位任务端详情可上传、下载附件。普通已上传附件删除入口已退出，避免无持久审计地抹除业务证据；待上传文件仍可在保存前移除。产品基础信息页另提供 `产品图 1（主图）/ 产品图 2（辅图）` 两个可替换媒体槽，只允许 PNG / JPEG / WEBP；源图选择不设文件大小上限，超过打印快照预算时浏览器会自动优化为不超过 1MiB、长边不超过 2560px、总像素不超过 400 万的 WEBP。服务端仍对最终快照执行 5MB、单边 8192px 和总像素 2000 万的纵深门禁；同槽替换 / 清空是产品媒体的窄例外，不恢复普通证据附件删除。普通证据附件上限仍为 5MB，允许格式覆盖常见图片、HEIC / HEIF、PDF、Word、Excel、CSV、文本、ZIP、邮件证据和 WPS 文件；PNG / JPG / WEBP / GIF / PDF 支持轻量预览，其他格式下载后查看。单据编辑弹窗中的附件默认作为备注 / 交付 / 合同资料 / 凭证附近的紧凑证据行放在明细区之前，页面级选中记录附件仍可保留独立区块。附件必须挂到已保存业务记录，不改变 Source Document、Fact、Workflow、库存、质检或财务状态。
- 桌面后台已恢复 `使用帮助 / 岗位使用帮助` 分组，不恢复旧 `帮助中心`、`开发与验收` 或 `高级文档` 信息架构；前端仍不承接 Markdown 文档页、业务链路调试页或协同任务调试页
- 岗位任务端本地和生产环境统一走 `5175` 的 `/m/<role>/tasks`；不再保留按角色拆端口入口，也不拆第二个仓库
- 岗位任务端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 岗位任务页读取真实 workflow API，采用有意组合的移动主路径：保留 v1 的待办 / 已办 / 提醒 / 我的列表、主筛选、服务端游标分页 / 分批展开和任务卡片；选中任务后进入 v2 独立全屏查看、处理和可信结果回执，结束后恢复原列表的筛选、已加载分页、滚动位置和焦点。`todo / risk / history` 仍是各自服务端查询视图，不在前端拼成第二套任务真源。完成 / 阻塞 / 退回分别走 `complete_task_action` / `block_task_action` / `reject_task_action`，均由服务端按当前管理员和任务责任推导角色。桌面任务看板、Workflow V1 页面、业务协同 Drawer 和岗位任务端提交前预检已消费 `explainWorkflowActionAccess` / `explainWorkflowTaskAssignment` 的后端只读原因；移动端不再回写 `business_records` 状态，附件上传和 Workflow done 都不代表业务 Fact 已生效
- 正式完成 / 阻塞 / 退回 / 催办入口为一次用户 intent 冻结业务参数、`expected_version` 和安全 UUID `idempotency_key`；HTTPS 优先使用 `crypto.randomUUID()`，内网 HTTP 浏览器使用 `crypto.getRandomValues()` 生成 RFC 4122 v4 key，不允许退回 `Math.random()`。只有新 intent 执行 explain 预检；HTTP 408、网络中断、5xx 或结构不合法的 success response 都保留原 attempt、抽屉、原因、证据和同一 key，原样读取 / 重放 receipt，不刷新列表也不把未知结果误报为失败。后端在每次请求仍重新校验登录、RBAC、客户 scope、任务可见性和 receipt，前端跳过重复 explain 不构成授权绕过
- Dashboard、Workflow V1 页面、岗位任务端、采购订单与委外订单协同入口共用 task 级同步 in-flight guard：同一 task 的首个动作在任何 await 前取得 lease，完成 / 阻塞 / 退回 / 催办跨动作双击不会发出第二个请求，`finally` 只释放本次持有的 lease。Go 与 JS 已共同消费 `scripts/qa/workflow-task-mutation-intent-v1.vectors.json`，锁住 mixed evidence 类型 / 顺序、raw whitespace key、mobile 精确重复 key 和 changed-intent relations；Node 24.14 定向 util + mobile + purchase / outsourcing guard 为 33/33，联合 Workflow API / caller 为 62/62，受影响 ESLint 0 error。该结果不代表 final full/strict/L1 或目标环境证据已经完成
- 岗位任务端复用管理员登录态，登录页固定提供密码登录，并在后端启用短信能力时提供短信登录；账号未授权当前角色、手机号未绑定或未授权当前角色、登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 模板打印当前由对应业务页选中记录后带值打开；产品页维护的 0–2 张产品图会在 BOM 生成物料明细 / 作业指导书时冻结到右上角，委外订单仅在全部有效产品行归属同一产品时自动带图。打印中心保留默认样例，并已按原型复核后的轻量两栏承接左侧模板导航、右侧纸面预览和打印窗口入口；字段和当前草稿图片编辑在独立打印窗口内完成。
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- `docs/product/prototypes/admin-command-center-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已吸收主要运行时骨架：`/erp/dashboard` 是后台首页 / 工作台，并承接待我处理与阻塞 / 逾期风险队列；`/erp/task-board` 是任务看板，`/erp/business-dashboard` 是业务看板，`/erp/print-center` 是模板打印中心。工作台和业务看板保留后台运营中枢导航；不再提供重复的通用异常总控页。未获用户明确确认前，不能把该资产改成 Current。
- `docs/product/prototypes/print-template-center-v1/` 按 `待实现 / To Implement` 登记，补齐模板打印中心独立样板；当前运行时已按原型复核后的轻量两栏保留模板导航 / 预览和打印窗口入口，字段编辑回到独立打印窗口。该原型不新增样品确认单、字段映射配置、后端 API、RBAC、schema、migration 或 Fact 写入。
- `/erp/task-board` 任务看板的关键词、状态、角色、到期、来源、泳道和页码使用 URL query 保存，支持复制链接、刷新恢复和一键清空。页面读取服务端 `get_task_board` 全量投影，顶部指标与下方“常规待办 / 阻塞与退回 / 到期提醒 / 已结束”四个互斥泳道一一对应，四项之和等于当前筛选的真实总数。总览每栏最多展示 5 条并标明“已显示 / 共多少条”，单栏聚焦后按 8 条分页；不再把 `list_tasks(limit: 200)` 的当前页长度冒充全量统计，也不在前端循环拉取全部任务。这些筛选和投影只影响看板展示，不写用户偏好、Workflow 任务状态或 Fact 表。
- `docs/product/prototypes/business-module-page-standard-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已经由客户、供应商、产品、材料、SKU、BOM、销售订单、采购订单、采购入库、来料质检、委外订单和出货单等正式 V1 页面复用业务页骨架，收窄 Fact / Workflow 页面继续遵守各自事实边界；旧 `BusinessModulePage`、旧通用业务页路由和旧只读变体页已删除。`/__dev/prototypes` 仍保留待实现队列，未获用户明确确认前不清空队列、不晋级 Current。
- 当前业务页、岗位任务端页面、桌面工作台、任务看板、异常闭环、业务看板和模板预览已经齐入口；业务数据分别落在领域专表、Source Document、Workflow 与 Fact 真源，不再存在通用 `business_records` 运行时真源。采购合同 / 加工合同已支持业务页带值打开，桌面任务看板只处理 Workflow 协同任务，不直接写库存、出货、应收、开票、付款或其他事实表；真实客户数据批量导入、打印留档回写和尚未接入的细分领域专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置；`AppModal` 复用 Ant Design 的遮罩、键盘、焦点圈定和触发点恢复，并只补充业务面板外观与可访问名称。
- 业务记录的新建 / 编辑优先使用业务表单弹窗；详情抽屉只用于显式只读核对。生产排程、生产异常和出货放行页只读取并处理由生产订单下达、返工事实过账和出货单提交放行生成的 Workflow 协同任务，不提供通用任务创建弹窗，也不能把协同结果写成生产订单、生产异常事实、出货单、库存、财务或发票事实；来源、打印、删除等未接入真实 usecase 的动作不能写成真实业务动作。
- 桌面端业务录入弹窗默认按紧凑自适应栅格排布：文本字段在可用宽度内多列展示，数量类短字段进一步收口，备注、边界说明和明细区保留整行。
- V1 主数据和销售订单表单弹窗宽度基线为 `min(960px, calc(100vw - 96px))`；普通 Workflow V1 协同创建弹窗使用当前共享业务弹窗约束，不恢复 formal-shell 字段预览弹窗主路径。生产排程、生产异常和出货放行是来源生成页，不渲染该创建弹窗。
- 明细条目按共享列宽预算展示，长文本字段保留较宽输入，数量 / 单价 / 金额等短数字字段收窄；数量后缀读取当前行已填单位，金额类字段默认显示 `CNY` 后缀，但不把空单位强行保存成 `pcs`。
- 单据级附件属于主对象证据字段，放在备注、交付、合同资料或凭证语义附近，并位于订单行、BOM 明细、出货明细等 item 区之前；未保存状态可先选择附件并在保存成功后自动上传绑定，单个附件上限 5MB，PNG / JPG / WEBP / GIF / PDF 可轻量预览，HEIC / HEIF、Office、ZIP、邮件证据和 WPS 文件下载后查看，无附件状态使用紧凑空态，不在弹窗末尾放置独立大区块，避免明细增多后必须滚到最后才看见上传入口。
- 产品图不是普通证据附件：产品表单内固定显示两个紧凑图片位，选择、替换或清空先留在当前表单会话，产品保存成功后才调用产品媒体接口；取消或产品保存失败不写图片，已打开打印草稿也不随主档后续替换而变化。
- 弹窗壳层按主题区分：浅色主题保持 Ant Design 轻量基线；暗色主题必须提供可辨认的遮罩、独立边框、浮层阴影以及 header / body / footer 分隔，避免业务页背景和弹窗融成一片。
- 弹窗 body 内部接管纵向滚动，避免长表单溢出视口；明细横向滚动只允许收口在明细容器内，不外溢到整组 Modal。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角；浅色焦点态保留 ERP 绿色，暗色普通 hover / focus 使用 slate / blue 交互色，绿色仅保留给品牌主按钮和状态强调，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
