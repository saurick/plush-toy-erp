# web 前端说明

## 当前结构

当前前端不是“一个桌面站点 + 一个通用移动壳层”，而是：

- 桌面后台：单入口
- 移动端：按角色拆成八个端口
- 仍然共享同一个 React 项目、同一个 common / ui / api / 文档层

## 目录结构（简版）

| 路径          | 职责                                                            |
| ------------- | --------------------------------------------------------------- |
| `src/common/` | 通用认证、组件、hooks、状态、常量与工具函数                     |
| `src/erp/`    | 毛绒 ERP 桌面后台、业务页、移动端页面、流程页、帮助中心、文档页 |
| `src/erp/qa/` | 字段联动等前端 QA catalog 与覆盖报告视图模型                    |
| `src/pages/`  | 根路由重定向、登录、注册、管理员登录                            |
| `public/qa/`  | 字段联动覆盖等 latest 结构化报告，供后台验收页读取              |
| `scripts/`    | 浏览器级样式回归脚本                                            |
| `build/`      | 构建产物，不作为业务真源                                        |

## 启动命令

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认端口：`5175`

### 角色移动端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:all
```

`pnpm start:mobile:all` 启动前会先停止旧的本项目移动端 Vite 进程，避免端口自动漂移导致角色入口错位。

或按角色单独启动：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm start:mobile:boss
pnpm start:mobile:merchandiser
pnpm start:mobile:purchasing
pnpm start:mobile:production
pnpm start:mobile:warehouse
pnpm start:mobile:finance
pnpm start:mobile:pmc
pnpm start:mobile:quality
```

端口矩阵：

| 入口       | 端口   | 说明                                            |
| ---------- | ------ | ----------------------------------------------- |
| 老板移动端 | `5186` | 交期风险、异常、待结算、本周重点                |
| 跟单移动端 | `5187` | 客户 / 款式 / 缺资料 / 催料 / 催合同 / 交期预警 |
| 采购移动端 | `5188` | 缺料、到料、单价确认、回签、辅材包材确认        |
| 生产移动端 | `5189` | 今日排产、进度回填、延期原因、返工、异常        |
| 仓库移动端 | `5190` | 收货、备料、成品入库、待出货、异常件处理        |
| 财务移动端 | `5191` | 待对账、待付款、异常费用、结算提醒              |
| PMC 移动端 | `5192` | 齐套推进、排产推进、延期跟进、催办、异常分发    |
| 品质移动端 | `5193` | IQC、过程检验、返工复检、放行反馈、退回反馈     |

## 构建命令

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:desktop
pnpm build:mobile:boss
pnpm build:mobile:merchandiser
pnpm build:mobile:purchasing
pnpm build:mobile:production
pnpm build:mobile:warehouse
pnpm build:mobile:finance
pnpm build:mobile:pmc
pnpm build:mobile:quality
```

说明：

- 桌面后台默认输出到 `build/`
- 移动端按入口输出到 `build/mobile-*`
- 生产环境应使用构建产物加静态服务，不使用 `pnpm start:*` 或 Vite dev server 承载流量
- 后续如果需要不同域名，可以直接绑定不同构建产物

## 生产静态服务

前端生产镜像使用一个镜像、多实例启动：镜像内包含桌面端和 8 个移动端构建产物，运行时通过 `APP_ID` 选择入口，通过 `PORT` 固定监听端口。

构建镜像：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

本地验证某个入口：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm build:all
APP_ID=mobile-boss PORT=5186 API_ORIGIN=http://127.0.0.1:8200 pnpm serve:prod
```

固定端口矩阵：

| APP_ID                | 入口       | 构建产物                    | 生产端口 |
| --------------------- | ---------- | --------------------------- | -------- |
| `desktop`             | 桌面后台   | `build/`                    | `5175`   |
| `mobile-boss`         | 老板移动端 | `build/mobile-boss`         | `5186`   |
| `mobile-merchandiser` | 跟单移动端 | `build/mobile-merchandiser` | `5187`   |
| `mobile-purchasing`   | 采购移动端 | `build/mobile-purchasing`   | `5188`   |
| `mobile-production`   | 生产移动端 | `build/mobile-production`   | `5189`   |
| `mobile-warehouse`    | 仓库移动端 | `build/mobile-warehouse`    | `5190`   |
| `mobile-finance`      | 财务移动端 | `build/mobile-finance`      | `5191`   |
| `mobile-pmc`          | PMC 移动端 | `build/mobile-pmc`          | `5192`   |
| `mobile-quality`      | 品质移动端 | `build/mobile-quality`      | `5193`   |

生产静态服务约定：

- `/healthz` 和 `/readyz` 返回当前入口健康状态，供容器健康检查或网关探活。
- `/rpc` 和 `/templates` 默认反代到 `API_ORIGIN`，Compose 内默认是 `http://app-server:8200`。
- 默认构建 `VITE_BASE_URL=/`，网关应让每个前端实例看到根路径流量；如果使用路径前缀且不做前缀剥离，需要按入口重新设置构建期 `VITE_BASE_URL`。

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
- 桌面管理员登录页同时保留密码登录和短信登录；角色移动端只开放短信登录，并按权限管理里的手机号绑定和移动端角色授权校验
- 可通过 `REAL_LOGIN_PREVIEW_MAX_MS` 覆盖默认 `10000ms` 的 PDF 预览时延阈值
- 采购合同烟测会验证：登录成功、采购合同工作台可打开、采购金额可手工修改、改单价后金额会按公式重算、在线 PDF 预览在阈值内打开
- 加工合同烟测会验证：登录成功、加工合同工作台可打开、工序名称 / 数量 / 单价会同步到纸面并联动金额、在线 PDF 预览在阈值内打开

`pnpm style:l1` 当前覆盖：

- 根路由到后台登录的重定向
- 管理员登录
- 未登录访问桌面后台的重定向
- 桌面任务看板
- 桌面业务页表格 / 日期范围筛选 / 列顺序账号偏好 / 弹窗布局 / 弹窗保存、批量删除、协同任务创建和回收站
- 权限管理
- 帮助中心
- 模板打印中心
- 采购合同打印工作台
- 加工合同打印工作台
- 移动端端口说明页
- 资料与字段真源页
- 开发与验收分组总览页
- 业务链路调试只读查询页

`pnpm smoke:mobile-auth-login-route` 当前覆盖全部 8 个角色移动端入口的未登录拦截、缺少移动端角色授权的旧登录态回登录页、短信登录携带当前角色、重新登录后回跳任务页、任务 / 预警 / 通知 / 进度展示、移动端不显示说明 / 角色文案，以及退出登录清空登录态。

`pnpm style:l1` 支持用逗号分隔的 `STYLE_L1_SCENARIOS` 跑指定场景，适合局部页面回归，例如：

```bash
cd /Users/simon/projects/plush-toy-erp/web
STYLE_L1_SCENARIOS=qa-acceptance-overview-desktop pnpm style:l1
```

## 当前前端边界

- 桌面后台继续只保留一个入口
- 桌面后台不再保留角色切换、角色首页或角色入口菜单
- 桌面后台管理员已接入权限管理页；普通管理员按 `menu_permissions` 裁剪桌面菜单可见范围，并通过绑定手机号和 `mobile_role_permissions` 控制可登录的角色移动端
- 桌面后台主业务菜单按销售链路、采购/仓储、生产和财务收口；各业务页已接入通用业务记录表格 / 日期范围筛选 / 列顺序账号偏好 / 弹窗保存、批量删除、workflow 业务状态保存和协同任务池，基础资料页保留为底层资料入口但不占主菜单
- 桌面后台已新增 `开发与验收` 分组，当前先承接验收结果总览、业务链路调试、字段联动覆盖、运行记录和专项报告；其中验收结果总览已升级为状态总览页，会读取字段联动 latest 报告并按模板目录展示打印专项范围，业务链路调试已是只读查询页，字段联动覆盖已读取 `public/qa/erp-field-linkage-coverage.latest.json`，运行记录和专项报告仍以文档型入口为主，这些入口不表示已具备一键造数能力
- 移动端按角色拆端口访问，但不拆第二个仓库
- 移动端只保留任务页，不展示角色说明、端口说明、技术字段、状态字典或帮助文案；根路径和未知路径统一进入任务页
- 移动端任务页读取真实 workflow API，展示任务、预警、通知和进度，并按当前端口角色支持处理、阻塞、完成三类状态回填
- 移动端复用管理员登录态但只允许短信登录；未绑定手机号、手机号未授权当前角色或登录失效时进入 `/admin-login`，登录后回到任务页，并提供退出登录按钮
- 模板打印当前由对应业务页选中记录后带值打开；打印中心保留默认样例和模板核对入口
- 扩展硬件链路、PDA、条码枪、图片识别继续 deferred
- 当前业务页、移动端页面、文档、帮助中心和模板预览已经齐入口；通用业务记录已落盘，采购合同 / 加工合同已支持业务页带值打开，Excel 导入、打印留档回写和细分业务专表继续 deferred

## 桌面业务弹窗约定

- 项目弹窗默认上下左右居中：JSX 版 `antd Modal` 由根 `ConfigProvider` 统一启用 `centered`，命令式 `modal.confirm/info/success/warning/error` 由 `AntdAppBridge` 的消费层统一补齐居中配置，自研 `AppModal` 保持固定遮罩内 flex 居中。
- 业务记录弹窗按当前 ERP 宽弹窗基线承载表头字段和明细行。
- 桌面端业务录入弹窗默认按紧凑栅格排布：文本字段收口到三列，数量类短字段进一步收口，备注和明细区保留整行。
- 弹窗壳层沿用当前 ERP 的 Ant Design 轻量基线，不额外叠加头尾分割线、厚边框或重阴影；只在弹窗 body 内部接管纵向滚动，避免长表单溢出视口。
- 弹窗内普通输入框、密码框、数字输入框、日期输入、下拉框和按钮统一沿用 Ant Design 的 32px 控件高度、10px 圆角和绿色焦点态，避免 Tailwind 表单 reset 覆盖到业务弹窗控件。
