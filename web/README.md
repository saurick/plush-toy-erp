# web 前端说明

## 当前结构

当前前端是一个生产入口加开发调试入口：

- 生产前端：单入口 `5175`
- 桌面后台：根路径和 `/erp/*`
- 岗位任务端：`/m/<role>/tasks`
- 本地开发：仍可按角色拆成八个移动端调试端口
- 登录页：按入口配置显示“后台管理 / 岗位任务端”，设备只决定默认选项，不决定权限，岗位由账号授权自动决定
- 仍然共享同一个 React 项目、同一个 common / ui / api 层

## 目录结构（简版）

| 路径          | 职责                                                  |
| ------------- | ----------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数           |
| `src/erp/`    | 毛绒 ERP 桌面后台、业务页、岗位任务端页面和打印工作台 |
| `src/erp/qa/` | 字段联动等前端 QA catalog 与 latest 报告生成依赖      |
| `src/pages/`  | 根路由重定向、登录、注册、管理员登录                  |
| `public/qa/`  | 字段联动覆盖等 latest 结构化报告，供后台验收页读取    |
| `scripts/`    | 浏览器级样式回归脚本                                  |
| `build/`      | 构建产物，不作为业务真源                              |

## 启动命令

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认端口：`5175`

桌面构建已提供单端口岗位任务端兼容路径：

```text
http://localhost:5175/m/boss/tasks
http://localhost:5175/m/sales/tasks
http://localhost:5175/m/purchase/tasks
http://localhost:5175/m/production/tasks
http://localhost:5175/m/warehouse/tasks
http://localhost:5175/m/finance/tasks
http://localhost:5175/m/pmc/tasks
http://localhost:5175/m/quality/tasks
```

`/admin-login` 统一承接后台和岗位任务端登录。手机默认选择岗位任务端，电脑默认选择后台，平板没有历史选择时保留入口选择；用户手动选择入口优先于设备默认。入口显隐由 `web/src/erp/config/entryConfig.mjs` 控制，并可通过 `window.__PLUSH_ERP_ENTRY_CONFIG__` 覆盖。用户不在登录前手选岗位，岗位任务端登录后按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位；是否真正可进入仍由后端返回的 `permissions / menus` 决定。短信登录入口由后端 `auth.capabilities` 决定，前端不自行决定认证方式是否可用。

桌面后台菜单由 `web/src/erp/config/seedData.mjs` 生成，并可通过 `web/src/erp/config/customerMenuConfig.mjs` 接入客户菜单配置。前端品牌默认走 `web/src/common/consts/brand.js` 的中性产品名；当前已登记 `config/customers/yoyoosun/menuConfig.mjs`，可通过构建环境 `VITE_ERP_CUSTOMER_KEY=yoyoosun` 或页面预置 `window.__PLUSH_ERP_CUSTOMER_KEY__ = 'yoyoosun'` 启用 yoyoosun 品牌、favicon 和菜单；也可用 `window.__PLUSH_ERP_CUSTOMER_CONFIG__` 直接提供一次性品牌 / favicon / 菜单配置。客户配置只控制前端品牌展示、favicon 和桌面菜单分组、排序、显隐、文案，不替代后端 RBAC action permission、Workflow / Fact usecase、schema、migration 或真实导入。

### 主题模式 / Theme mode

桌面后台、统一登录页和岗位任务端支持「跟系统 / 浅色 / 暗色」三种主题模式，默认跟随系统偏好。用户手动选择会写入浏览器 `localStorage` 的 `plush_erp_theme_mode`，刷新后保持；`跟系统` 只决定视觉主题，不影响入口选择、权限判断或最终路由。

主题主路径：

- 运行时状态由 `src/common/theme/erpTheme.jsx` 和 `src/common/theme/erpThemeMode.mjs` 维护。
- Ant Design 组件通过根 `ConfigProvider` 在 `defaultAlgorithm / darkAlgorithm` 间切换。
- 项目自定义壳层、岗位任务卡片和局部硬编码样式通过 `data-erp-theme` 与 `src/erp/styles/app.css` 的 ERP theme 变量覆盖。
- 新增状态类组件时必须同步覆盖暗色主题，包括 loading / empty / alert / message / notification / tooltip / popover / tag / badge / progress / pagination / drawer / table placeholder；优先复用全局 token 和 L1 断言，避免组件只在浅色模式可读。
- 打印、PDF、采购合同 / 加工合同纸面预览默认固定浅色，不跟随暗色主题，避免污染导出物。

### 岗位任务端本地调试

生产环境不再为岗位任务端启动独立前端容器或独立端口，统一使用 `5175` 上的 `/m/<role>/tasks`。下面的多端口命令只用于本地开发和回归调试：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:all
```

`pnpm start:mobile:all` 启动前会先停止旧的本项目移动端 Vite 进程，避免端口自动漂移导致角色入口错位。

或按角色单独启动：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:boss
pnpm start:mobile:business
pnpm start:mobile:purchasing
pnpm start:mobile:production
pnpm start:mobile:warehouse
pnpm start:mobile:finance
pnpm start:mobile:pmc
pnpm start:mobile:quality
```

端口矩阵：

| 入口           | 端口   | 说明                                            |
| -------------- | ------ | ----------------------------------------------- |
| 老板岗位任务端 | `5186` | 交期风险、异常、待结算、本周重点                |
| 业务岗位任务端 | `5187` | 客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警 |
| 采购岗位任务端 | `5188` | 缺料、到料、单价确认、回签、辅材包材确认        |
| 生产岗位任务端 | `5189` | 今日排产、进度回填、延期原因、返工、异常        |
| 仓库岗位任务端 | `5190` | 收货、备料、成品入库、待出货、异常件处理        |
| 财务岗位任务端 | `5191` | 待对账、待付款、异常费用、结算提醒              |
| PMC 岗位任务端 | `5192` | 齐套推进、排产推进、延期跟进、催办、异常分发    |
| 品质岗位任务端 | `5193` | IQC、过程检验、返工复检、放行反馈、退回反馈     |

## 构建命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:desktop
pnpm build:mobile:boss
pnpm build:mobile:business
pnpm build:mobile:purchasing
pnpm build:mobile:production
pnpm build:mobile:warehouse
pnpm build:mobile:finance
pnpm build:mobile:pmc
pnpm build:mobile:quality
```

说明：

- 桌面后台默认输出到 `build/`
- 桌面后台构建产物同时包含 `/m/<role>/tasks` 单端口任务端兼容路由
- 岗位任务端按入口输出到 `build/mobile-*`
- 生产环境应使用构建产物加静态服务，不使用 `pnpm start:*` 或 Vite dev server 承载流量
- 后续如果需要不同域名，可以直接绑定不同构建产物

## 生产静态服务

前端生产镜像使用一个镜像、一个实例启动：运行时固定 `APP_ID=desktop`、`PORT=5175`，桌面后台和岗位任务端都由这一组静态服务承载。岗位任务端访问路径为 `/m/<role>/tasks`，不再启动 `APP_ID=mobile-*` 的生产容器。

构建镜像：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

本地验证生产入口：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:all
APP_ID=desktop PORT=5175 API_ORIGIN=http://127.0.0.1:8300 pnpm serve:prod
```

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
pnpm smoke:mobile-auth-login-route
```

如需按真实管理员登录流程验证合同编辑与在线预览时延链路，再执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

说明：

- 两条烟测都会真实打开管理员登录页，使用 `server/configs/dev/config.local.yaml` 或 `config.yaml` 中的管理员账号登录
- 若本地账号不在配置文件中，可通过环境变量 `REAL_LOGIN_ADMIN_USERNAME` / `REAL_LOGIN_ADMIN_PASSWORD` 覆盖
- 桌面管理员登录页和岗位任务端登录页始终保留密码登录；短信登录只有在后端 `auth.capabilities` 返回可用时展示。用户不在登录前手选岗位角色，岗位任务端登录后按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位，固定 `/m/<role>/tasks` 直达入口仍校验对应岗位授权，短信登录额外依赖手机号绑定
- 可通过 `REAL_LOGIN_PREVIEW_MAX_MS` 覆盖默认 `10000ms` 的 PDF 预览时延阈值
- 采购合同烟测会验证：登录成功、采购合同工作台可打开、采购金额可手工修改、改单价后金额会按公式重算、在线 PDF 预览在阈值内打开
- 加工合同烟测会验证：登录成功、加工合同工作台可打开、工序名称 / 数量 / 单价会同步到纸面并联动金额、在线 PDF 预览在阈值内打开

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 登录页主题三态、暗色后台看板、暗色业务页中性 hover / focus、暗色开发文档查看器、暗色客户配置开发页、暗色打印中心 / 预览入口和暗色岗位任务端核心路径
- 未登录访问桌面后台的重定向
- 桌面工作台 / 任务看板，包括协同任务筛选、任务详情抽屉、阻塞原因面板、催办和完成动作
- 桌面业务看板
- 桌面业务页表格 / 日期范围筛选 / 列顺序账号偏好 / 弹窗布局 / 弹窗保存、批量删除、协同任务创建和回收站
- 权限管理
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台

`pnpm smoke:mobile-auth-login-route` 当前覆盖全部 8 个岗位任务端入口的未登录拦截、缺少岗位任务端角色授权的旧登录态回登录页、登录页密码入口、后端能力开启时的短信入口、账号密码登录后回跳任务页、任务 / 预警 / 通知 / 进度展示、岗位任务端不显示说明 / 角色文案，以及退出登录清空登录态。

`pnpm style:l1` 支持用逗号分隔的 `STYLE_L1_SCENARIOS` 跑指定场景，适合局部页面回归，例如：

```bash
cd /Users/simon/projects/plush-toy-erp/web
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
```

## 前端文档入口边界

前端已移除产品内文档中心、帮助中心、高级文档和开发与验收页面入口。

当前规则：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- 桌面侧栏只保留看板、业务分组、单据模板和系统管理。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness` 和 `/erp/mobile-workbenches` 路径只做兼容重定向，不再作为产品内页面。
- 仓库级 `docs/product/*`、`docs/architecture/*`、`docs/archive/*` 仍是正式文档体系，但不镜像到前端运行时。
- 开发环境额外提供 `http://localhost:5175/__dev` 作为本地开发态入口台账 / 总控；该入口只汇总 `/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger` 和 `/__dev/customer-config` 等 dev-only 页面，展示入口维护真源、边界标签、治理分组筛选、搜索、跳转、浏览器本地置顶和最近访问记录；入口卡片统一新标签打开，便于保留总控页对照，不改变各子页内部导航。不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；置顶和最近访问只写浏览器本地偏好，不是后端配置。入口总控使用 `/favicon-dev.svg`，测试入口使用 `/favicon-testing.svg`，只用于区分本地开发页面。
- 开发环境额外提供 `http://localhost:5175/__dev/docs` 作为本地开发态文档查看器；该入口左侧专用于按真实目录树浏览仓库 tracked Markdown，并在搜索框下方提供浏览器本地持久化的置顶文档区，当前打开文档和目录树展开状态也会写入浏览器本地偏好以便刷新后恢复；搜索态显示匹配结果，右侧标题栏图钉可置顶 / 取消置顶当前文档，置顶区行内图钉可直接取消置顶，目录树和搜索结果行内图钉可快速置顶 / 取消置顶，章节标签可滚动到对应标题并提供回到顶部，不进入侧栏、seedData、RBAC 或产品内文档 registry，生产构建不可访问。
- 开发环境额外提供 `http://localhost:5175/__dev/prototypes` 作为本地开发态产品原型查看器；该入口只浏览 `docs/product/prototypes` 下的 HTML 原型、PNG 方案图和截图证据，可按全部 / 当前实现 / 待实现 / 参考资料四类筛选、按目录分组折叠、使用浏览器本地置顶偏好并在右侧预览，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问。
- 开发环境额外提供 `http://localhost:5175/__dev/capability-ledger` 作为本地开发态能力台账可视化；该入口只读解析 `docs/product/capability-ledger.md`、`docs/customers/yoyoosun/delivery-matrix.md` 和 `docs/customers/yoyoosun/delta-ledger.md`，展示产品能力成熟度、客户交付状态、客户差异分类和显式 `CAP-*` 关联，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；三份 Markdown 仍是唯一维护入口。
- 开发环境额外提供 `http://localhost:5175/__dev/testing` 作为本地开发态测试入口；该入口只读解析 `docs/product/test-strategy.md` 和 `docs/**/*.md` 中的测试、验收、QA、smoke、`style:l1` 等相关文档，展示测试分层、命令块和相关文档索引，并为 T0-T8 每层及常用预设提供一键复制命令 / 清单；复制按钮不在浏览器内执行 shell，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；`docs/product/test-strategy.md` 仍是测试选择真源。
- 开发环境额外提供 `http://localhost:5175/__dev/customer-config` 作为本地开发态客户配置总控页；该入口通过 `?customer=<customer-key>` 和页面客户包选择器读取 dev-only 客户包 registry，query 缺失时默认 `yoyoosun`，当前只登记 `yoyoosun`，后续新增客户包时只扩展同一 registry。未登记 customer 会显示“未登记客户配置包”和已登记客户列表，不 fallback 到 yoyoosun 冒充。选择器只更新 URL query，不写 localStorage、后端、数据库或正式运行配置；该页只读展示客户配置包、前端品牌 / 桌面菜单 runtime、字段 / 编号草案、导入 tooling 和边界状态，不进入侧栏、seedData、RBAC、后端业务、真实导入或 ERP 正式菜单，生产构建不可访问；`config/customers/<customer-key>/*`、`scripts/import/*` 和正式文档仍是维护真源。

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单；统一登录页和 `/entry` 只做后台 / 岗位任务端入口选择
- 桌面后台管理员已接入 RBAC 权限中心；普通管理员通过 `roles` 获得 `permissions`，后端返回 `menus`，桌面菜单、岗位任务端入口和后端接口统一消费 permission code
- 桌面后台主业务菜单按基础资料、销售链路、采购/仓储、生产和财务收口；各业务页已接入通用业务记录表格 / 日期范围筛选 / 列顺序账号偏好 / 弹窗保存、批量删除、workflow 业务状态保存和协同任务池，基础资料页当前暴露客户/供应商和产品入口，并复用 `business_records` 承接 trade-erp 字段口径
- 桌面后台已移除 `帮助中心`、`开发与验收` 和 `高级文档` 分组；前端不再承接 Markdown 文档页、业务链路调试页或协同任务调试页
- 岗位任务端生产环境统一走 `5175` 的 `/m/<role>/tasks`；按角色拆端口只作为本地开发调试入口保留，两者不拆第二个仓库
- 岗位任务端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 岗位任务页读取真实 workflow API，展示任务、预警、通知和进度，并按当前端口角色支持处理、阻塞、完成三类状态回填
- 岗位任务端复用管理员登录态，登录页固定提供密码登录，并在后端启用短信能力时提供短信登录；账号未授权当前角色、手机号未绑定或未授权当前角色、登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 模板打印当前由对应业务页选中记录后带值打开；打印中心保留默认样例和模板核对入口
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- `docs/product/prototypes/admin-command-center-v1/` 已按当前实现对齐版承接到运行时：`/erp/dashboard`、`/erp/business-dashboard`、`/erp/print-center` 和任务详情抽屉分别承接任务看板、业务看板、模板打印中心和异常 / 阻塞闭环；原型仍只作 as-built 参考，不是运行时真源。
- `/erp/dashboard` 任务看板的关键词、状态、角色、到期和来源筛选使用 URL query 保存，支持复制链接、刷新恢复和一键清空；首屏按原型式四泳道展示本页待办、阻塞异常、今日到期和已完成协同，这些筛选和分组只影响当前页面展示，不写后端用户偏好、WorkflowUsecase 或事实表。
- `docs/product/prototypes/business-module-page-standard-v1/` 已按当前实现对齐版承接到运行时：业务模块标准页由 `BusinessModulePage` 和共享业务列表组件承接，协同入口由共享协同面板承接；当前 `/__dev/prototypes` 没有待实现队列项，后续新增待实现 HTML 仍按 prototype checklist 吸收。
- 当前业务页、岗位任务端页面、桌面任务看板、业务看板和模板预览已经齐入口；通用业务记录已落盘，采购合同 / 加工合同已支持业务页带值打开，桌面任务看板只处理 Workflow 协同任务，不直接写库存、出货、应收、开票、付款或其他事实表；Excel 导入、打印留档回写和细分业务专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置，自研 `AppModal` 保持固定遮罩内 flex 居中。
- 业务记录弹窗按当前 ERP 宽弹窗基线承载表头字段和明细行。
- 桌面端业务录入弹窗默认按紧凑栅格排布：文本字段收口到三列，数量类短字段进一步收口，备注和明细区保留整行。
- 明细条目按共享列宽预算展示，长文本字段保留较宽输入，数量 / 单价 / 金额等短数字字段收窄；数量后缀读取当前行已填单位，金额类字段默认显示 `CNY` 后缀，但不把空单位强行保存成 `pcs`。
- 弹窗壳层按主题区分：浅色主题保持 Ant Design 轻量基线；暗色主题必须提供可辨认的遮罩、独立边框、浮层阴影以及 header / body / footer 分隔，避免业务页背景和弹窗融成一片。
- 弹窗 body 内部接管纵向滚动，避免长表单溢出视口；明细横向滚动只允许收口在明细容器内，不外溢到整组 Modal。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角；浅色焦点态保留 ERP 绿色，暗色普通 hover / focus 使用 slate / blue 交互色，绿色仅保留给品牌主按钮和状态强调，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
