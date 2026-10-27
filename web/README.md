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

Node.js 统一由 `n` 管理，唯一版本文件为根目录 `.n-node-version`，当前精确锁定 `24.22.1`；`web/package.json#engines.node` 声明 `24.22.x`。pnpm 由 `web/package.json#packageManager` 固定为 `pnpm@10.34.5`。首次安装见 [工具链安装](../scripts/README.md#版本锁定)。

```bash
cd "$(git rev-parse --show-toplevel)"
sudo n auto
bash scripts/doctor.sh

cd "$(git rev-parse --show-toplevel)/web"
pnpm install
```

`scripts/doctor.sh` 会检查当前 `node`、`pnpm` 和版本锁是否一致；不一致时先切换版本，不要继续安装依赖。

## 目录结构（简版）

组件选型、复用顺序与底层使用边界见[组件复用与使用入口](../docs/engineering/前端实现与交互约定.md#组件复用与使用入口--shared-component-entrypoints)，领域实现按 [ERP 组件入口](src/erp/components/README.md)定位。

业务页负责权限、当前选择和领域组件的编排，查询、提交及表单按实际职责放在对应领域目录。收付款实现集中在 `src/erp/components/finance/`，各动作复用页面级防重尝试记录与忙碌状态；事实和状态仍取后端及生成契约。

质检的列表和导出请求共用 [`qualityInspectionQueries.mjs`](src/erp/components/quality-inspections/qualityInspectionQueries.mjs)，按检验类型选择正式读取接口并保留相同筛选语义。

[表单生命周期](src/erp/components/quality-inspections/useQualityInspectionEditor.js) 负责新建、判定切换与来源清空；打开草稿后刷新列表保留正在输入的内容。

[质检提交动作](src/erp/components/quality-inspections/useQualityInspectionActions.js) 负责防重复提交、业务结果及附件部分失败反馈，页面保留权限、当前选择和关联处置编排。

工作台质量门禁由 `DevQualityGatesPage.jsx` 唯一持有客户端、轮询与请求取消，`src/dev-workbench/components/quality-gates/` 展示服务器 CI、历史、执行过程和治理结果；纯展示计算位于 `config/qualityGatePresentation.mjs`，不发起请求。

| 路径                 | 职责                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------- |
| `src/common/`        | 通用认证、组件、hooks、状态、常量与工具函数                                                 |
| `src/erp/`           | 毛绒 ERP 桌面后台、业务页、岗位任务端页面和打印工作台                                       |
| `src/erp/qa/`        | 字段联动等前端 QA catalog 与报告生成依赖                                                    |
| `src/dev-workbench/` | DEV 恢复边界、`/__dev` 浏览器端页面、配置、组件和样式，不进入 production build              |
| `src/pages/`         | 根路由重定向、登录、注册、管理员登录                                                        |
| `dev-server/`        | Node/Vite development-serve Bridge、operation 适配器及合同测试，详见 `dev-server/README.md` |
| `scripts/`           | 前端本地服务、浏览器级回归和 smoke 脚本，详见 `scripts/README.md`                           |
| `build/`             | 构建产物，不作为业务真源                                                                    |

`src/erp/utils/` 中，`sourcePartySnapshots.mjs` 管理往来方快照，`sourceOrderLineValues.mjs` 管理明细来源带值和清空，`masterDataParams.mjs` / `sourceOrderParams.mjs` 管理提交映射，`purchaseOrderPrintDraft.mjs` 管理采购打印输入；`masterDataOrderView.mjs` 保留展示、生命周期和表单行基础规则。

页面状态和动作的职责见 [ERP 组件入口](./src/erp/components/README.md)。

分页范围与总数文案由 `src/common/utils/pagination.mjs` 提供，表格内通过 `AppTable`、独立分页通过 `AppPagination` 共用外观和窄屏模式；业务页码、查询参数和精确记录分页仍由 `src/erp/utils/businessPagination.mjs` 负责。工作台“控件设计 → 列表与分页”（`/__dev/ui-design?page=controls&control=pagination`）提供可操作示例，可从“组件选用”进入，使用本地虚构数据验证翻页、条数调整、加载和恢复。

同一控件设计入口的“业务表单与明细”（`control=business-form`）与“来源选择”（`control=source-picker`）按需加载正式共享组件，操作校验、离开保护、明细增删、跨页选择和失败恢复。组件选用及各分类提供同源的真实页面入口与核对任务；使用边界统一维护在[组件复用约定](../docs/engineering/前端实现与交互约定.md#组件复用与使用入口--shared-component-entrypoints)。

横向与纵向滚动提示统一由 [`ScrollEdges`](src/common/components/scroll/ScrollEdges.jsx) 管理，ERP 和独立工作台各在入口挂载一次。共享控制器识别实际可滚动的容器及弹窗、抽屉中的动态内容，使用被动滚动监听和按帧合并的测量更新，保留原生滚动、尺寸和焦点。

边缘在对应方向还有内容时出现，到尽头或内容不再溢出时消失；固定列和吸顶／底部控件占用的区域保持清楚。效果集中在 [`scrollEdges.css`](src/common/components/scroll/scrollEdges.css)：模糊 `3px`、横向宽 `24px`、纵向高 `10px`，随主题背景适配，打印隐藏，减少动态效果时取消过渡。

手机吸顶栏复用这些参数和滚动边界计算，并标记已负责的顶部提示以避免叠加。输入控件与可编辑区域自动排除；纸面、图片和图形画布等细节预览用 `data-scroll-edges="off"` 标记其容器。

打印条款分组支持新增、改名、排序和删除，组内条目与明细支持增删、调序和清空，纸面继续作为预览、PDF 和打印的输出来源；清空与删除、空组标题、自动编号及留白定位规则见[打印字段与编辑行为](../docs/打印模板字段与编辑行为清单.md#条目编辑)，实现分层见[打印模板实现原理](../docs/打印模板实现原理.md)。

产品路由只在 `import.meta.env.DEV` 下动态加载 `DevWorkbenchBridge.jsx` 这一处 DEV 入口。该入口包裹业务路由的停服恢复边界，并在进入 `/__dev` 时按需加载工作台页面；App 不直接引用 DEV 模块。

效能工作台的外观与密度独立保存在当前站点浏览器中，本地开发和独立部署入口均不读取或回写 ERP 账号偏好；刷新、页面切换和同源标签页沿用工作台设置，独立登录页也读取同一主题色与明暗模式。保存与恢复规则见[主题模式](../docs/engineering/前端实现与交互约定.md#主题模式--theme-mode)。

“开发资源”保留“工具清单 / 项目关系图”两个同级页签；`/__dev/development-resources?view=relationships` 默认按项目与目录、开发与交付、权限与业务选择主题，也可切换为按图模型浏览 DAG、有向有环图、无向关联和树／森林。点选节点查看关系；“接口契约与接入边界”示例共用生成的 RPC 入口标签，链接实际接口、授权和质量依据，外部接入明确标为待建设。

图、分类和节点解释同源，模型、示例、节点及引用选项写入 URL；缩放、布局切换、全屏和正式依据入口继续复用现有能力。具体边界见[开发资源入口](../docs/engineering/研发效能工作台与CI-CD设计.md#development-resources)。

“开发资源 → 项目 Skill”（`/__dev/project-skills`）按当前仓库 Skill 的适用任务检索，查看职责与引用关系，并复用现有健康检查；原文和引用进入项目文档查看器。来源和检查边界见[项目 Skill](../docs/engineering/研发效能工作台与CI-CD设计.md#project-skills)。

“开发资源 → 接口与集成”（`/__dev/integration`）同时出现在默认工具清单。页面使用“接口清单 / 本轮变更 / 接入指引”三个同级页签，默认查看接口；接入指引直接读取正式规范并支持原文定位，边界图在同页按需展开。页签选择写入 URL，切换保留筛选与分页。

页面从公共契约生成物读取接口清单，支持业务域、中文名称及用途搜索、分页和方法详情；中文目录覆盖当前生成清单，方法抽屉在清单内展开并高亮对应行，保留上方筛选上下文；关联已有只读权限登记、正式 API 合同与回归来源；字段合同优先读取正式方法章节，其余方法展示同源生成的源码读取索引及明确的待核对边界，缺失和读取失败分别标注。筛选、分页、详情及辅助边界图的节点选择随 URL 恢复。

质量门禁按需读取，整体结果不代表逐接口验证；不另维护接口或测试结果台账。范围见[接口与集成](../docs/engineering/研发效能工作台与CI-CD设计.md#接口与集成-__devintegration)。

效能工作台另有独立部署入口：`pnpm build:workbench` 构建 `workbench.html` 与 `src/dev-workbench/standalone.jsx`，输出 ignored `build-workbench/`；`pnpm serve:workbench` 运行带专用登录会话的 Node 服务。

独立构建同时生成绑定源码、Node 和依赖锁的 `workbench-build.json`；正式制品通过[工作台发布入口](../server/deploy/workbench/README.md#workbench-release)校验、保全运行记录并切换，默认命令不写远端。本地 Vite 继续运行当前源码与热更新。

工作台登录页与全部页面统一使用 `src/dev-workbench/assets/favicon-dev.svg` 的紫底白色闪电图标。独立构建将它输出为 `/favicon-dev.svg`，供登录前读取；图标不放入公共资源目录，也不进入 ERP `build/`。本地免登录配置保持不变。部署身份、凭据与 HTTPS 入口见 [独立工作台部署](../server/deploy/workbench/README.md)。

## 启动命令

在 `web/` 执行 `pnpm start`。人工终端默认 `http://127.0.0.1:5175`；Codex 会话自动使用 `15200-15299` 辅助端口，以终端输出 URL 为准。端口、后端和 HMR 共用 `config/dev-ports.env`；只复用同工作区、同配置服务，未知占用会阻断。

| 场景                       | 入口                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| 日常开发                   | `pnpm start`                                                                             |
| 重新加载本工作区服务       | `pnpm restart` / `pnpm start:restart`，先预检并核对进程归属                              |
| 独立前端验证               | `pnpm start:isolated`，自动选择辅助端口                                                  |
| 只调布局，不登录或调用 RPC | `pnpm start:frontend-only`，明确为降级模式                                               |
| 客户热更新 / 静态预览      | `pnpm start:yoyoosun --print-plan`（固定 `15200`）/ `pnpm preview:yoyoosun --print-plan` |
| 重启客户开发入口           | `pnpm restart:yoyoosun`，固定重启 `15200`；可用 `--port` 指定辅助端口                    |

客户入口遇到本工作区的过期 Vite 会核验归属后自动停止并重新启动，继续使用原端口；同配置实例继续复用，其他程序或工作区的占用会阻断。

本机开发默认使用 `local` 访问模式，无工作台登录页且拒绝远程访问。需要个人内网直接访问时，在本机 ignored 的 `web/.env.development.local` 中设置：

```dotenv
PLUSH_DEV_WORKBENCH_ACCESS=private-network
```

重新加载对应开发进程后，浏览器可直接打开 `http://<服务器内网 IPv4>:<前端端口>/__dev`，无需 SSH 隧道或额外工作台登录。需要内网 HTTPS 域名时，在同一文件中配置 `PLUSH_DEV_HTTPS_ORIGIN=https://<内网域名>`，并配置只接受内网客户端的本机 TLS 代理；浏览器打开该域名的 `/__dev`，热更新默认使用同源 WSS。

访问仍受私网来源、精确地址、同源、CSRF 与操作确认限制；显式 `operator` 模式使用独立运维身份。代理的 Host、转发头与 loopback 合同见 [开发服务 Bridge](dev-server/README.md#边界)。

普通 `pnpm start` 使用通用产品配置；永绅业务开发使用 `pnpm start:yoyoosun` 加载客户公开配置，并读取后端已激活的业务权限与岗位入口。

普通启动先只读检查 schema、migration 和后端 health / ready。登记的本地后端未运行且数据库检查通过时，自动通过现有 `make run` 链路构建、启动并验证当前工作区后端，随后开放电脑版和手机版；已有后端监听进程会保留。后端未就绪、数据库或迁移检查失败时，电脑版、手机版与登录页保留原地址，在原页显示服务不可用提示，不跳转到开发工作台。

页面只读检查服务健康与依赖就绪状态；运行中数据库断连也会暂停业务，通过同一完整启动检查后自动继续打开当前页面，路径、查询和锚点保持不变。需要人工恢复时可在新标签打开 `/__dev/database-migration`，不自动 apply 或重放业务请求。恢复期间工作台菜单仍可切换，文档、设计等本地资料可继续查看；依赖服务的接口仍受恢复限制。完整启动、进程保护、端口审计及客户包核对见 [前端脚本](scripts/README.md#本地启动与进程范围)。

所有开发入口直接加载当前工作区的 React / CSS 源文件并支持热更新，重启后不会用历史固定制品覆盖登录页或业务页。`pnpm start:restart` / `pnpm restart` 对应主端口 `5175`；使用 `15200` 客户入口时运行 `pnpm restart:yoyoosun`。

人工启动、重启与复用已有服务均共用浏览器策略：macOS 有同服务页签时保留当前页面，没有时自动后台打开；跨平台边界及显式浏览器设置见[前端脚本](scripts/README.md#本地启动与进程范围)。停止前端使用 `pnpm stop` / `pnpm stop:yoyoosun`，后端仍独立管理。

后端代码在 `server/` 执行 `make dev_restart` 按需构建并生效，输入不变时跳过编译；运行、状态和日志见 [服务端入口](../server/README.md#快速开始)。

一次性验证副本可链接当前已安装的 `node_modules`。开发服务只将该副本 Web 和项目依赖目录的实际路径补入 Vite 静态文件范围，让字体、图片等依赖资源可用；仍保留严格文件访问和默认敏感文件拒绝规则，不放行依赖所在的整个工作区或父目录。

“产品与业务 → 任务办理”（`/__dev/task-handling`）通过筛选、任务清单与同行详情核对岗位和两端支持范围，复用正式目录及共享分类；同权限下电脑覆盖手机办理能力。页面参数与清空合同见[任务办理](../docs/engineering/研发效能工作台与CI-CD设计.md#task-handling)。

### 岗位任务端本地调试

岗位任务端不再启动独立前端容器、独立 Vite 配置或独立端口。本地开发先启动同一个前端入口：

```bash
cd "$(git rev-parse --show-toplevel)/web"
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
cd "$(git rev-parse --show-toplevel)/web"
pnpm build:all
```

说明：

- `build:all` 当前只生成 `build/` 单入口静态产物
- 构建产物同时包含桌面后台和 `/m/<role>/tasks` 岗位任务端路由
- 生产环境应使用构建产物加静态服务，不使用 `pnpm start:*` 或 Vite dev server 承载流量
- 不再生成 `build/mobile-*` 生产产物，也不再保留按角色拆端口的 Vite 入口

## 生产静态服务

单一 `build/` 由 `APP_ID=desktop / PORT=5175` 承载桌面与岗位任务端。镜像构建、客户配置注入、代理、health / ready 统一见 [Compose 前端静态服务](../server/deploy/compose/prod/README.md#前端静态服务)；本地客户包预览见 [前端脚本](scripts/README.md#客户前端调试与预览)。

## 当前回归命令

在 `web/` 按影响面执行：

```bash
pnpm lint
pnpm css
pnpm test
STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm style:l1
```

需要一次收集多个页面问题时，可设置 `STYLE_L1_CONTINUE_ON_FAILURE=1`；失败仍使命令退出非零，逐场景结果写入本轮输出目录的 `scenario-results.json`。默认遇到第一个失败停止。高保真外观与效能工作台检查使用 `high-fidelity-*` 场景；具体名称由场景注册表维护。

`pnpm test` 通过 [源码测试入口](scripts/runUnitTests.mjs) 自动发现测试，保留 4 路文件并发。

发现范围、产物隔离与筛选方式见[源码测试说明](scripts/README.md#源码测试--unit-tests)；浏览器输入模板、no-write preflight、真实登录和持久测试数据范围见[前端回归脚本](scripts/README.md)与 [QA 操作](../scripts/qa/README.md)。页面级 mock 不能代替真实后端、目标发布或客户验收。

## 前端文档入口边界

| 主题                           | 维护入口                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| 登录、菜单、权限与岗位帮助     | [菜单与正式入口合同](../docs/product/菜单与正式入口合同.md)                                   |
| 业务对象状态与页面动作 | [生命周期与页面动作规则](../docs/product/业务数据生命周期与页面动作规则.md) |
| 主题、偏好、共享控件、表单与读取恢复 | [前端实现与交互约定](../docs/engineering/前端实现与交互约定.md) |
| 字段带值、清空与输出真源       | [业务数据流向与字段来源](../docs/product/业务主链路数据流向与字段来源规则.md)                 |
| 打印渲染与安全                 | [打印模板实现原理](../docs/打印模板实现原理.md)                                               |
| 打印字段与可编辑行为           | [打印字段与编辑清单](../docs/打印模板字段与编辑行为清单.md)                                   |
| `/__dev` 页面、证据和操作边界  | [研发工作台](../docs/engineering/研发效能工作台与CI-CD设计.md#本地开发入口-dev-only-surfaces) |
| Node / Vite Bridge             | [开发服务](dev-server/README.md)                                                              |

正式岗位帮助使用 `roleHelpContent.mjs`；管理与运维手册从正式 Markdown 生成受控后端正文。其他仓库专题继续由仓库与 DEV viewer 提供。

工作台文档先加载标题，正文在阅读或全文搜索时加载；交互设计按 HTML 预览、设计说明和控件分别加载，已打开的 HTML 预览在切换查看方式时保留状态。导航在鼠标悬停或键盘聚焦时预取目标页面，不在后台推测下一个页面。

合作方订单只读能力沿同一 API 文档展示身份与单位归属边界，供应商 A/B、客户 A/B 的真实 HTTP / PostgreSQL 模拟结果复用既有场景运行证据；没有合作方门户或业务写入入口。

工作台“开发资源 → 接口与集成”的“读取场景运行证据”复用既有隔离数据库门禁报告，查看上下游模拟闭环及其他接入场景的实际结果、源码身份和清理结果；历史与当前证据分开显示，方法详情只说明所关联场景，不外推为全部接口覆盖。

工作台“测试执行”默认打开测试总览，直接对齐[各类测试方式](../docs/product/自动化测试策略.md#test-methods)、执行入口与报告位置，并展示当前报告状态。本轮验证、测试报告、压力测试和测试指引保留为主视图；总览的专项命令带入对应检索，刷新后仍可返回来源。“测试报告 → 运行与验收”提供同源[证据分类](../docs/product/自动化测试策略.md#evidence-categories)，无报告时测试入口仍可使用。分类说明不代表执行结果，真机固定 runner 尚未接入。

接口差异、检查结果、样例执行和暂存范围统一在“接口与集成 → 本轮变更”查看；“本轮验证”的样例检查摘要提供“查看并运行”入口。当前结论按源码身份匹配后的回执判断，历史结果按需查看。

工作台“测试执行 → 压力测试”入口为 `/__dev/testing?view=pressure`，可运行隔离短档 / 10 分钟容量、切换历史报告并查看吞吐、方法延迟、业务对账和资源清理。

报告保留候选版本与源码匹配状态；操作与读取合同见 [测试入口](../docs/engineering/研发效能工作台与CI-CD设计.md#pressure-workbench)，档位和维护方法见 [压力测试说明](../scripts/qa/README.md#pressure-testing)。

版本发布页的“操作指引”在当前标签页进入 `/__dev/version-center/guide`。左侧章节目录支持同页跳转，右侧全部章节直接展开阅读；地址栏保留章节锚点，支持直接访问与刷新，长内容随整页滚动；阅读不依赖实时发布或目标状态，边界见 [版本发布说明](../docs/engineering/研发效能工作台与CI-CD设计.md#版本发布与部署中心-__devversion-center)。

效能工作台的 Mermaid 图首次显示即适应全图，隐藏区域展开及容器尺寸变化时继续自动适配；手动缩放、适配宽度和重置由用户控制。共享交互与打印边界见 [可视化表达规范](../docs/engineering/可视化表达规范.md#图形与交互--presentation)。

## 当前前端边界

前端负责展示与交互，领域事实、状态、权限和幂等由后端决定。详细读取与写后恢复合同见 [页面规则](../docs/engineering/前端实现与交互约定.md#前端实现与读取边界) 和 [API 合同](../server/docs/api.md)。

手机任务页保留权限、页面导航与办理结果编排；[列表投影](src/erp/mobile/utils/mobileRoleTaskListView.mjs) 负责已读取任务的排序、筛选和服务端汇总展示，[关联任务读取](src/erp/mobile/hooks/useMobileLinkedTask.js) 负责范围隔离与过期请求取消。

[历史状态](src/erp/mobile/utils/mobileTaskHistory.mjs) 集中维护浏览器快照字段和草稿备份，[草稿保存](src/erp/mobile/hooks/useMobileTaskDraftHistory.js) 合并连续编辑与相同内容的写入，只更新当前任务及访问范围的历史记录。列表投影与当前选择分别缓存，切换任务不重建整份任务展示数据。

## 在线帮助与参考手册

章节和图解提供全员纠错，普通读者仅查看自己的记录和回复。`useHelpContent` 读取同一份章节目录与已发布企业补充，`HelpContributionPanel` 按三册分别控制编辑 / 发布，支持草稿、预览、修改记录对照和恢复为新草稿；接口见 `helpContentApi.mjs`。补充继承章节阅读范围，不能覆盖正式正文。

在线阅读、搜索、HTML / Markdown 下载只合并已发布补充；读取失败阻断下载并提供重试，切换账号清空旧范围，修改冲突保留输入。正文与纠错不存入浏览器持久存储；企业数据随数据库备份恢复，仓库产品手册导出不带部署中的补充。

手机待办从“我的 → 帮助与手册”进入 `/m/<role>/handle/help-center`，复用同一帮助页面与权限范围；跨册阅读保持手机入口，正文滚动和前后退使用所属页面容器。HTML 下载提供整册可点击目录，与仓库手册导出使用同一渲染函数。

桌面帮助中的业务跳转使用正式页面路由。手机保留任务入口和同一阅读权限范围，实际业务从任务内办理，不开放独立单据菜单。

手机在现有 `/m/<role>/tasks` 的“任务办理”步骤内复用正式业务表单、领域 API 与业务结果回执，不跳转来源单据页面。进入前重新读取实际任务、来源对象和来源访问权限，按账号、岗位、菜单及准确来源编号固定当前办理对象。历史任务保持协同终态锁定，仍可按来源权限办理后续合法业务；业务结果重新读取实际任务状态，不把入账当作任务完成。

从回货继续质检等跨来源动作须先解析后端实际产生的目标任务，再在同一任务入口切换办理上下文。未知、无权或存在歧义的目标不进入办理。单据深链返回同岗位任务；帮助页面继续使用其独立阅读入口。

手机只显示当前任务的来源摘要和办理表单，不开放完整来源单据详情。委外发料、回货从任务办理明细直接进入，不先打开合同详情；完整单据在电脑查看，只有“切换工作入口”可显式换端。

任务内的关联办理按当前来源和目标业务权限开放：销售订单可进入关联生产计划或出货表单，已入库的采购或成品记录可核对自身批次库存，财务可按来源单位登记预收预付或结算。关联表单重新读取实际来源；生产和出货提交须保留当前销售订单行，库存只选择来源已入库批次。切换任务或批次不沿用上一来源的草稿和结果回执。登记、任务完成、审批、实际入账和冲销分别显示各自结果。

`/erp/help-center` 默认显示“操作图解”岗位推荐页，与业务手册、管理实施、技术运维共用一层导航，可直接切换。业务册按账号岗位说明与实际已开放页面的并集投影，管理 / 运维册由 `admin.project_manuals` 按当前有效账号角色和控制面权限读取，普通 Web 资源不包含这两册正文；切换推荐岗位不改变阅读或办理权限。

目录按业务模块组织；桌面标题、书目、搜索和下载共用单行工具栏，窄目录可收起，目录与正文独立滚动；手机目录与正文在同一滚动区切换，关闭目录恢复原阅读位置，帮助页不重复显示外层标题栏。切换书目保留本册上次章节，浏览器返回恢复阅读位置；“下载手册”菜单提供当前整册 HTML 和 Markdown。

地址 `role / scene / view / book / ref / q` 保存推荐、图解、书目、章节与搜索；刷新、前进后退和深链均可恢复。原业务帮助、工程专题、岗位说明、`businessHandbookOperations.mjs` 与 `businessHandbook.mjs` 提供业务内容，`projectManuals.mjs` 处理受控两册章节和跨册链接。

来源、权限规则及三册导出见[项目手册](../docs/manuals/README.md)。

## 桌面业务编辑与弹窗约定

共用表单、明细、附件、图片、焦点和滚动约定见 [桌面业务编辑](../docs/engineering/前端实现与交互约定.md#桌面业务编辑与弹窗约定)。
