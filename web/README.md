# web 前端说明

## 当前结构

当前前端是一个生产入口加开发调试入口：

- 生产前端：单入口 `5175`
- 桌面后台：根路径和 `/erp/*`
- 岗位任务端：`/m/<role>/tasks`
- 本地开发：仍可按角色拆成八个移动端调试端口
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

当前前端不提供普通协作账号自助注册入口，后端也不提供公开 `auth.register` 方法；协作账号来源回到受控初始化或后续账号管理流程。

桌面后台菜单由 `web/src/erp/config/seedData.mjs` 生成，并可通过 `web/src/erp/config/customerMenuConfig.mjs` 接入客户菜单配置。前端品牌默认走 `web/src/common/consts/brand.js` 的中性产品名；当前已登记 `config/customers/yoyoosun/menuConfig.mjs`，可通过构建环境 `VITE_ERP_CUSTOMER_KEY=yoyoosun` 或页面预置 `window.__PLUSH_ERP_CUSTOMER_KEY__ = 'yoyoosun'` 启用 yoyoosun 品牌、favicon 和菜单；也可用 `window.__PLUSH_ERP_CUSTOMER_CONFIG__` 直接提供一次性品牌 / favicon / 菜单配置。客户配置只控制前端品牌展示、favicon 和桌面菜单分组、排序、显隐、文案，不替代后端 RBAC action permission、Workflow / Fact usecase、schema、migration 或真实导入。

### 主题模式 / Theme mode

桌面后台、统一登录页和岗位任务端支持「跟系统 / 浅色 / 暗色」三种主题模式，默认跟随系统偏好。用户手动选择会写入浏览器 `localStorage` 的 `plush_erp_theme_mode`，刷新后保持；`跟系统` 只决定视觉主题，不影响入口选择、权限判断或最终路由。

当前登录态 token 仍保存在浏览器侧认证存储中，并通过 `Authorization: Bearer` 发送，主要风险面是 XSS 后的 token 读取或泄露；不得把 token 写入 trace、日志、文档、截图或 QA 报告。生产侧已补基础 HTTP 安全响应头降低误嵌入、MIME sniff 和宽泛 referrer 风险，但这不等同于 HttpOnly Cookie 方案。当前内部系统不把 CSRF 作为近期安全待办；只有后续明确迁到浏览器自动携带的 Cookie 登录态时，才需要把 SameSite / CSRF、登录态刷新和前端 API client 改造放到同一轮专项评审。

主题主路径：

- 运行时状态由 `src/common/theme/erpTheme.jsx` 和 `src/common/theme/erpThemeMode.mjs` 维护。
- Ant Design 组件通过根 `ConfigProvider` 在 `defaultAlgorithm / darkAlgorithm` 间切换。
- 项目自定义壳层、岗位任务卡片和局部硬编码样式通过 `data-erp-theme` 与 `src/erp/styles/app.css` 入口及 `src/erp/styles/app/` 分区文件中的 ERP theme 变量覆盖。
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

如需按真实管理员登录流程验证采购入库真实写入或合同编辑与在线预览时延链路，再执行：

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
- 桌面管理员登录页和岗位任务端登录页始终保留密码登录；短信登录只有在后端 `auth.capabilities` 返回可用时展示。用户不在登录前手选岗位角色，岗位任务端登录后按账号已有 `mobile.<role>.access` 权限自动进入第一个可用岗位，固定 `/m/<role>/tasks` 直达入口仍校验对应岗位授权，短信登录额外依赖手机号绑定
- 可通过 `REAL_LOGIN_PREVIEW_MAX_MS` 覆盖默认 `10000ms` 的 PDF 预览时延阈值
- 采购入库真实写入 e2e 会验证：登录成功、入库管理页面可创建草稿、维护明细、过账写 `inventory_txns`、取消入库写冲正、列表回显已取消；该脚本会写本地 / 开发库的模拟采购入库事实，采购入库单据不可物理删除，收尾口径是取消冲正并保留 `PR-BROWSER-*` 可追踪记录。`pnpm smoke:purchase-receipt-real-write` 已显式传入 `--accept-persistent-test-data`，直接 `node` 执行时也必须显式传入该参数或设置 `PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1`。脚本默认只允许 localhost / 127.0.0.1 页面目标；如确需跑准备好的开发 / 测试环境，必须额外传入 `--allow-external-base-url`，禁止直接跑生产或目标客户环境。若缺少单位、材料或仓库，可显式执行 `pnpm smoke:purchase-receipt-real-write -- --seed-core-demo` 先补核心演示主数据
- 采购合同烟测会验证：登录成功、采购合同工作台可打开、采购金额可手工修改、改单价后金额会按公式重算、在线 PDF 预览在阈值内打开
- 加工合同烟测会验证：登录成功、加工合同工作台可打开、工序名称 / 数量 / 单价会同步到纸面并联动金额、在线 PDF 预览在阈值内打开

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 登录页主题三态、暗色后台看板、暗色业务页中性 hover / focus、暗色开发文档查看器、暗色客户配置开发页、暗色打印中心 / 预览入口和暗色岗位任务端核心路径
- 未登录访问桌面后台的重定向
- 桌面工作台、任务看板和异常 / 阻塞闭环，包括协同任务筛选、任务详情抽屉、阻塞原因面板、催办、完成动作和运营工具入口
- 桌面业务看板和模板打印中心
- 当前正式业务页连续回归，包括客户档案、供应商档案、销售订单 V1 页面、采购订单日期筛选和出货单日期筛选（桌面 / 窄屏）
- 当前正式业务页表格、筛选、列顺序账号偏好、弹窗布局和协同入口
- 权限管理和审计日志
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
- 桌面侧栏只保留看板中心、业务分组、运营工具和系统管理。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness` 和 `/erp/mobile-workbenches` 路径只做兼容重定向，不再作为产品内页面。
- 仓库级 `docs/product/*`、`docs/architecture/*`、`docs/archive/*` 仍是正式文档体系，但不镜像到前端运行时。
- 开发环境额外提供 `http://localhost:5175/__dev` 作为本地开发态入口台账 / 总控；该入口只汇总 `/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger` 和 `/__dev/customer-config` 等 dev-only 页面，展示入口维护真源、边界标签、治理分组筛选、搜索、跳转、浏览器本地置顶和最近访问记录；入口卡片统一新标签打开，便于保留总控页对照，不改变各子页内部导航。不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；置顶和最近访问只写浏览器本地偏好，不是后端配置。入口总控使用 `/favicon-dev.svg`，测试入口使用 `/favicon-testing.svg`，只用于区分本地开发页面。
- 开发环境额外提供 `http://localhost:5175/__dev/docs` 作为本地开发态文档查看器；该入口左侧专用于按真实目录树浏览仓库 tracked Markdown，并在搜索框下方提供浏览器本地持久化的置顶文档区，当前打开文档、目录树展开状态和章节标签展开 / 收起状态也会写入浏览器本地偏好以便刷新后恢复；搜索态显示匹配结果，右侧标题栏图钉可置顶 / 取消置顶当前文档，置顶区行内图钉可直接取消置顶，目录树和搜索结果行内图钉可快速置顶 / 取消置顶，章节标签默认展开为自动换行展示，也可收起为单行横向滚动；章节标签点击可滚动到对应标题并提供回到顶部，Markdown fenced `mermaid` 代码块会只读渲染为图表，并提供适配宽度、缩小、放大、重置 100% 和当前页面全屏查看的本地临时控件，不进入侧栏、seedData、RBAC 或产品内文档 registry，生产构建不可访问。
- 开发环境额外提供 `http://localhost:5175/__dev/prototypes` 作为本地开发态产品原型查看器；该入口只浏览 `docs/product/prototypes` 下的 HTML 样板、PNG 方案图和截图证据，可按全部 / 当前实现 / 待实现 / 参考资料四类筛选、按目录分组折叠、使用浏览器本地偏好恢复上次筛选、当前打开资产和置顶状态，并在右侧预览。卡片里的参照范围只说明可借鉴的页面 / 菜单类型，不是正式菜单、路由、权限或 seedData 映射表；该入口不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问。
- 开发环境额外提供 `http://localhost:5175/__dev/capability-ledger` 作为本地开发态能力台账可视化；该入口只读解析 `docs/product/产品能力进度台账.md`、`docs/customers/yoyoosun/客户交付矩阵.md` 和 `docs/customers/yoyoosun/客户差异台账.md`，展示产品能力成熟度、客户交付状态、客户差异分类和显式 `CAP-*` 关联，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；三份 Markdown 仍是唯一维护入口。
- 开发环境额外提供 `http://localhost:5175/__dev/testing` 作为本地开发态测试入口；该入口只读解析 `docs/product/自动化测试策略.md` 和 `docs/**/*.md` 中的测试、验收、QA、smoke、`style:l1` 等相关文档，展示测试分层、命令块和相关文档索引，并为 T0-T8 每层及常用预设提供一键复制命令 / 清单；复制按钮不在浏览器内执行 shell，不进入侧栏、seedData、RBAC、后端业务、产品内文档 registry 或 ERP 正式菜单，生产构建不可访问；`docs/product/自动化测试策略.md` 仍是测试选择真源。
- 开发环境额外提供 `http://localhost:5175/__dev/customer-config` 作为本地开发态客户配置总控页；该入口通过 `?customer=<customer-key>` 和页面客户包选择器读取 dev-only 客户包 registry，query 缺失时默认 `yoyoosun`，当前只登记 `yoyoosun`，后续新增客户包时只扩展同一 registry。未登记 customer 会显示“未登记客户配置包”和已登记客户列表，不 fallback 到 yoyoosun 冒充。选择器只更新 URL query，不写 localStorage、后端、数据库或正式运行配置；该页只读展示客户配置包、前端品牌 / 桌面菜单 runtime、字段 / 编号草案、导入 tooling 和边界状态，不进入侧栏、seedData、RBAC、后端业务、真实导入或 ERP 正式菜单，生产构建不可访问；`config/customers/<customer-key>/*`、`scripts/import/*` 和正式文档仍是维护真源。

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单；统一登录页和 `/entry` 只做后台 / 岗位任务端入口选择
- 桌面后台管理员已接入 RBAC 权限中心；普通管理员通过 `roles` 获得 `permissions`，后端返回 `menus`，桌面菜单、岗位任务端入口和后端接口统一消费 permission code
- 桌面后台主业务菜单按当前产品设计保留看板中心、主数据、销售管理、产品工程、采购管理、质检管理、库存管理、委外管理、生产管理、出货管理、财务业务、运营工具和系统管理；系统管理当前包含权限管理和审计日志。客户档案 / 供应商档案走正式 MasterData V1 API，销售订单走正式 SalesOrder V1 API，采购订单走正式 PurchaseOrder V1 API。正式业务列表统一为单击行选中、双击行进入编辑 / 主操作弹窗；详情抽屉只由显式详情入口打开。采购订单页面支持列表、关键词 / 状态 / 采购日期或预计到货日期范围筛选、详情、订单头与明细保存、提交、审批、关闭和取消，但只表达采购承诺，不写库存、批次或财务事实。入库、来料质检、库存台账、委外订单、出货单、生产进度、出库管理和财务业务已分别接入正式 V1 或收窄 Operational Fact V1 页面；出货单页面支持状态 / 计划出货或实际出货日期范围筛选、草稿、加行、确认出货和已出货取消冲正，`SHIPPED` 才是真实出货事实。审计日志页面只读展示启动初始化和账号 / 角色 / 权限等系统控制面事件，不替代业务事实流水。当前仍为 `formal-shell` 的页面只剩生产排程、生产异常和出货放行；生产排程和生产异常只作为待接入预览页复用业务页标准骨架展示字段范围、筛选、列顺序、导出待接入提示、接入边界和底部协同入口；出货放行保留同样字段预览壳，并读取 / 处理 `source_type=shipping-release` 的 Workflow `shipment_release` 协同任务。三者不读取或写入旧 `business_records`，也不提供真实创建、删除、回收站、业务数据导出或领域事实写入主路径；出货放行任务完成仍不等于 `SHIPPED`。旧通用业务页、旧业务模块路由和旧入口退出页已删除。
- 桌面后台已移除 `帮助中心`、`开发与验收` 和 `高级文档` 分组；前端不再承接 Markdown 文档页、业务链路调试页或协同任务调试页
- 岗位任务端生产环境统一走 `5175` 的 `/m/<role>/tasks`；按角色拆端口只作为本地开发调试入口保留，两者不拆第二个仓库
- 岗位任务端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 岗位任务页读取真实 workflow API，展示任务、预警、通知和进度，并按当前端口角色支持处理、阻塞、完成三类 Workflow 任务状态回填；移动端不再回写 `business_records` 状态
- 岗位任务端复用管理员登录态，登录页固定提供密码登录，并在后端启用短信能力时提供短信登录；账号未授权当前角色、手机号未绑定或未授权当前角色、登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 模板打印当前由对应业务页选中记录后带值打开；打印中心保留默认样例，并已按原型复核后的轻量两栏承接左侧模板导航、右侧纸面预览和打印窗口入口；字段编辑在独立打印窗口内完成。
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- `docs/product/prototypes/admin-command-center-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时已吸收主要运行时骨架：`/erp/dashboard` 是后台首页 / 工作台，`/erp/task-board` 是任务看板，`/erp/business-dashboard` 是业务看板，`/erp/print-center` 是模板打印中心，`/erp/operations/exceptions` 是异常 / 阻塞闭环；工作台和业务看板保留后台运营中枢导航。未获用户明确确认前，不能把该资产改成 Current。
- `docs/product/prototypes/print-template-center-v1/` 按 `待实现 / To Implement` 登记，补齐模板打印中心独立样板；当前运行时已按原型复核后的轻量两栏保留模板导航 / 预览和打印窗口入口，字段编辑回到独立打印窗口。该原型不新增样品确认单、字段映射配置、后端 API、RBAC、schema、migration 或 Fact 写入。
- `/erp/task-board` 任务看板的关键词、状态、角色、到期和来源筛选使用 URL query 保存，支持复制链接、刷新恢复和一键清空；首屏按原型式四泳道展示本页待办、阻塞异常、今日到期和已完成协同，这些筛选和分组只影响当前页面展示，不写后端用户偏好、WorkflowUsecase 或事实表。
- `docs/product/prototypes/business-module-page-standard-v1/` 仍按 `待实现 / To Implement` 登记。当前运行时只保留客户档案、供应商档案和销售订单 V1 页面复用业务页骨架；旧 `BusinessModulePage`、旧通用业务页路由和旧只读变体页已删除。`/__dev/prototypes` 仍保留待实现队列，未获用户明确确认前不清空队列、不晋级 Current。
- 当前业务页、岗位任务端页面、桌面工作台、任务看板、异常闭环、业务看板和模板预览已经齐入口；通用业务记录已落盘，采购合同 / 加工合同已支持业务页带值打开，桌面任务看板只处理 Workflow 协同任务，不直接写库存、出货、应收、开票、付款或其他事实表；Excel 导入、打印留档回写和细分业务专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置，自研 `AppModal` 保持固定遮罩内 flex 居中。
- 业务记录的新建 / 编辑优先使用业务表单弹窗；详情抽屉只用于显式只读核对。仍为 `formal-shell` 的待接入预览页只允许预览字段和接入边界，来源、打印、删除等未接入真实 usecase 的动作必须用提示弹窗表达边界，不能写成真实业务动作；出货放行例外只允许处理现有 Workflow `shipment_release` 协同任务，不写 shipment、库存、财务或发票事实。
- 桌面端业务录入弹窗默认按紧凑自适应栅格排布：文本字段在可用宽度内多列展示，数量类短字段进一步收口，备注、边界说明和明细区保留整行。
- V1 主数据和销售订单表单弹窗宽度基线为 `min(960px, calc(100vw - 96px))`；formal-shell 待接入预览表单弹窗宽度基线为 `min(1120px, calc(100vw - 96px))`。
- 明细条目按共享列宽预算展示，长文本字段保留较宽输入，数量 / 单价 / 金额等短数字字段收窄；数量后缀读取当前行已填单位，金额类字段默认显示 `CNY` 后缀，但不把空单位强行保存成 `pcs`。
- 弹窗壳层按主题区分：浅色主题保持 Ant Design 轻量基线；暗色主题必须提供可辨认的遮罩、独立边框、浮层阴影以及 header / body / footer 分隔，避免业务页背景和弹窗融成一片。
- 弹窗 body 内部接管纵向滚动，避免长表单溢出视口；明细横向滚动只允许收口在明细容器内，不外溢到整组 Modal。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角；浅色焦点态保留 ERP 绿色，暗色普通 hover / focus 使用 slate / blue 交互色，绿色仅保留给品牌主按钮和状态强调，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
