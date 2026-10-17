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

Node.js 统一由 `n` 管理，唯一版本文件为根目录 `.n-node-version`，当前精确锁定 `24.21.0`；`web/package.json#engines.node` 声明 `24.21.x`。pnpm 由 `web/package.json#packageManager` 固定为 `pnpm@10.34.5`。首次安装见 [工具链安装](../scripts/README.md#版本锁定)。

```bash
cd "$(git rev-parse --show-toplevel)"
sudo n auto
bash scripts/doctor.sh

cd "$(git rev-parse --show-toplevel)/web"
pnpm install
```

`scripts/doctor.sh` 会检查当前 `node`、`pnpm` 和版本锁是否一致；不一致时先切换版本，不要继续安装依赖。

## 目录结构（简版）

业务页负责权限、当前选择和领域组件的编排，查询、提交及表单按实际职责放在对应领域目录。收付款实现集中在 `src/erp/components/finance/`，各动作复用页面级防重尝试记录与忙碌状态；事实和状态仍取后端及生成契约。

质检的列表和导出请求共用 [`qualityInspectionQueries.mjs`](src/erp/components/quality-inspections/qualityInspectionQueries.mjs)，按检验类型选择正式读取接口并保留相同筛选语义。[表单生命周期](src/erp/components/quality-inspections/useQualityInspectionEditor.js) 负责新建、判定切换与来源清空；打开草稿后刷新列表保留正在输入的内容。[质检提交动作](src/erp/components/quality-inspections/useQualityInspectionActions.js) 负责防重复提交、业务结果及附件部分失败反馈，页面保留权限、当前选择和关联处置编排。

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

`src/erp/utils/` 中，`sourcePartySnapshots.mjs` 管理往来方快照，`sourceOrderLineValues.mjs` 管理明细来源带值和清空，`masterDataParams.mjs` / `sourceOrderParams.mjs` 管理提交映射，`purchaseOrderPrintDraft.mjs` 管理采购打印输入；`masterDataOrderView.mjs` 保留展示、生命周期和表单行基础规则。页面状态和动作的职责见 [ERP 组件入口](./src/erp/components/README.md)。

分页范围与总数文案由 `src/common/utils/pagination.mjs` 提供，ERP 列表和 DEV 工作台直接复用；业务页码、查询参数和精确记录分页仍由 `src/erp/utils/businessPagination.mjs` 负责。

打印条款分组支持新增、改名、排序和删除，组内条目与明细支持增删、调序和清空，纸面继续作为预览、PDF 和打印的输出来源；清空与删除、空组标题、自动编号及留白定位规则见[打印字段与编辑行为](../docs/打印模板字段与编辑行为清单.md#条目编辑)，实现分层见[打印模板实现原理](../docs/打印模板实现原理.md)。

产品路由只在 `import.meta.env.DEV` 下动态加载 `DevWorkbenchBridge.jsx` 这一处 DEV 入口。该入口包裹业务路由的停服恢复边界，并在进入 `/__dev` 时按需加载工作台页面；App 不直接引用 DEV 模块。

“产品工程”保留“工具清单 / 项目图视角”两个同级页签；`/__dev/product-engineering?view=relationships` 采用模型目录，区分 DAG、有向有环图、无向关联和树／森林，选择项目示例后点选节点查看关系。“接口契约与接入边界”示例共用生成的 RPC 入口标签，链接实际接口、授权和质量依据；外部接入明确标为待建设。图、分类和节点解释同源，模型、示例、节点及引用选项写入 URL；缩放、布局切换、全屏和正式依据入口继续复用现有能力。具体边界见[产品工程入口](../docs/engineering/研发效能工作台与CI-CD设计.md#产品工程入口-__devproduct-engineering)。

“产品工程 → 工程规范与 Skill”（`/__dev/project-skills`）按当前仓库 Skill 的适用任务检索，查看职责与引用关系，并复用现有健康检查；原文和引用进入开发文档查看器。来源和检查边界见[工程规范与 Skill](../docs/engineering/研发效能工作台与CI-CD设计.md#project-skills)。

“产品工程 → 接口与集成”（`/__dev/integration`）同时出现在默认工具清单。页面直接复用接入边界图、节点解释及正式 API、接入规范、权限关系与质量门禁链接，选中节点随 URL、刷新和前进后退恢复；不另维护接口或测试结果台账。范围见[接口与集成](../docs/engineering/研发效能工作台与CI-CD设计.md#接口与集成-__devintegration)。

效能工作台另有独立部署入口：`pnpm build:workbench` 构建 `workbench.html` 与 `src/dev-workbench/standalone.jsx`，输出 ignored `build-workbench/`；`pnpm serve:workbench` 运行带专用登录会话的 Node 服务。它不改变 ERP `build/` 的生产隔离或本地免登录配置。部署身份、凭据与 HTTPS 入口见 [独立工作台部署](../server/deploy/workbench/README.md)。

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

重新加载对应开发进程后，浏览器可直接打开 `http://<服务器内网 IPv4>:<前端端口>/__dev`，无需 SSH 隧道或额外工作台登录。需要内网 HTTPS 域名时，在同一文件中配置 `PLUSH_DEV_HTTPS_ORIGIN=https://<内网域名>`，并配置只接受内网客户端的本机 TLS 代理；浏览器打开该域名的 `/__dev`，热更新默认使用同源 WSS。访问仍受私网来源、精确地址、同源、CSRF 与操作确认限制；显式 `operator` 模式使用独立运维身份。代理的 Host、转发头与 loopback 合同见 [开发服务 Bridge](dev-server/README.md#边界)。

普通 `pnpm start` 使用通用产品配置；永绅业务开发使用 `pnpm start:yoyoosun` 加载客户公开配置，并读取后端已激活的业务权限与岗位入口。

普通启动先只读检查 schema、migration 和后端 health / ready。登记的本地后端未运行且数据库检查通过时，自动通过现有 `make run` 链路构建、启动并验证当前工作区后端，随后开放电脑版和手机版；已有后端监听进程会保留。后端未就绪、数据库或迁移检查失败时，电脑版、手机版与登录页保留原地址，在原页显示服务不可用提示，不跳转到开发工作台。页面只读检查服务状态，通过同一完整启动检查后自动继续打开当前页面，路径、查询和锚点保持不变。需要人工恢复时可在新标签打开 `/__dev/database-migration`，不自动 apply 或重放业务请求。完整启动、进程保护、端口审计及客户包核对见 [前端脚本](scripts/README.md#本地启动与进程范围)。

所有开发入口直接加载当前工作区的 React / CSS 源文件并支持热更新，重启后不会用历史固定制品覆盖登录页或业务页。`pnpm start:restart` / `pnpm restart` 对应主端口 `5175`；使用 `15200` 客户入口时运行 `pnpm restart:yoyoosun`。停止前端使用 `pnpm stop` / `pnpm stop:yoyoosun`，后端仍独立管理。后端代码在 `server/` 执行 `make dev_restart` 按需构建并生效，输入不变时跳过编译；运行、状态和日志见 [服务端入口](../server/README.md#快速开始)。

一次性验证副本可链接当前已安装的 `node_modules`。开发服务只将该副本 Web 和项目依赖目录的实际路径补入 Vite 静态文件范围，让字体、图片等依赖资源可用；仍保留严格文件访问和默认敏感文件拒绝规则，不放行依赖所在的整个工作区或父目录。

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

`pnpm test` 通过 [源码测试入口](scripts/runUnitTests.mjs) 自动发现测试，保留 4 路文件并发。发现范围、产物隔离与筛选方式见[源码测试说明](scripts/README.md#源码测试--unit-tests)；浏览器输入模板、no-write preflight、真实登录和持久测试数据范围见[前端回归脚本](scripts/README.md)与 [QA 操作](../scripts/qa/README.md)。页面级 mock 不能代替真实后端、目标发布或客户验收。

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

工作台文档先加载标题，正文在阅读或全文搜索时加载；UI 交互设计按 HTML 预览、设计说明和控件分别加载，已打开的 HTML 预览在切换查看方式时保留状态。导航在鼠标悬停或键盘聚焦时预取目标页面，不在后台推测下一个页面。

工作台“改动验证 → 压力测试”入口为 `/__dev/testing?view=pressure`，可运行隔离短档 / 10 分钟容量、切换历史报告并查看吞吐、方法延迟、业务对账和资源清理。报告保留候选版本与源码匹配状态；操作与读取合同见 [测试入口](../docs/engineering/研发效能工作台与CI-CD设计.md#pressure-workbench)，档位和维护方法见 [压力测试说明](../scripts/qa/README.md#pressure-testing)。

版本发布页的“操作指引”在当前标签页进入 `/__dev/version-center/guide`。左侧章节目录支持同页跳转，右侧全部章节直接展开阅读；地址栏保留章节锚点，支持直接访问与刷新，长内容随整页滚动；阅读不依赖实时发布或目标状态，边界见 [版本发布说明](../docs/engineering/研发效能工作台与CI-CD设计.md#版本发布与部署中心-__devversion-center)。

效能工作台的 Mermaid 图首次显示即适应全图，隐藏区域展开及容器尺寸变化时继续自动适配；手动缩放、适配宽度和重置由用户控制。共享交互与打印边界见 [可视化表达规范](../docs/engineering/可视化表达规范.md#图形与交互--presentation)。

## 当前前端边界

前端负责展示与交互，领域事实、状态、权限和幂等由后端决定。详细读取与写后恢复合同见 [页面规则](../docs/engineering/前端实现与交互约定.md#前端实现与读取边界) 和 [API 合同](../server/docs/api.md)。

## 在线帮助与参考手册

章节和图解提供全员纠错，普通读者仅查看自己的记录和回复。`useHelpContent` 读取同一份章节目录与已发布企业补充，`HelpContributionPanel` 按三册分别控制编辑 / 发布，支持草稿、预览、修改记录对照和恢复为新草稿；接口见 `helpContentApi.mjs`。补充继承章节阅读范围，不能覆盖正式正文。在线阅读、搜索、HTML / Markdown 下载只合并已发布补充；读取失败阻断下载并提供重试，切换账号清空旧范围，修改冲突保留输入。正文与纠错不存入浏览器持久存储；企业数据随数据库备份恢复，仓库产品手册导出不带部署中的补充。

手机待办从“我的 → 帮助与手册”进入 `/m/<role>/handle/help-center`，复用同一帮助页面与权限范围；跨册阅读保持手机入口，正文滚动和前后退使用所属页面容器。HTML 下载提供整册可点击目录，与仓库手册导出使用同一渲染函数。

桌面帮助中的业务跳转使用正式页面路由。手机保留任务入口和同一阅读权限范围，实际业务从任务内办理，不开放独立单据菜单。

手机任务内的 `/m/<role>/tasks/<taskID>/handle/...` 复用正式业务表单、领域 API 与业务结果回执。进入前重新读取实际任务、来源对象和来源访问权限，按账号菜单及准确来源编号显示当前记录；没有当前账号和岗位的任务交接上下文时不能直接打开该地址。历史任务保持协同终态锁定，仍可按来源单据权限办理后续合法业务。从回货继续质检等跨来源动作须先解析后端实际产生的目标任务，再切换办理上下文，保留原筛选和返回位置。未知、无权或存在歧义的目标不进入办理。旧 `/m/<role>/handle/...` 单据链接返回同岗位任务；帮助页面继续使用其独立阅读入口。

任务内的关联办理按当前来源和目标业务权限开放：销售订单可进入关联生产计划或出货表单，已入库的采购或成品记录可核对自身批次库存，财务可按来源单位登记预收预付或结算。关联表单重新读取实际来源；生产和出货提交须保留当前销售订单行，库存只选择来源已入库批次。切换任务或批次不沿用上一来源的草稿和结果回执。登记、任务完成、审批、实际入账和冲销分别显示各自结果。

`/erp/help-center` 默认显示“操作图解”岗位推荐页，与业务手册、管理实施、技术运维共用一层导航，可直接切换。业务册按账号岗位说明与实际已开放页面的并集投影，管理 / 运维册由 `admin.project_manuals` 按当前有效账号角色和控制面权限读取，普通 Web 资源不包含这两册正文；切换推荐岗位不改变阅读或办理权限。目录按业务模块组织；桌面标题、书目、搜索和下载共用单行工具栏，窄目录可收起，目录与正文独立滚动；手机目录与正文在同一滚动区切换，关闭目录恢复原阅读位置，帮助页不重复显示外层标题栏。切换书目保留本册上次章节，浏览器返回恢复阅读位置；“下载手册”菜单提供当前整册 HTML 和 Markdown。地址 `role / scene / view / book / ref / q` 保存推荐、图解、书目、章节与搜索；刷新、前进后退和深链均可恢复。原业务帮助、工程专题、岗位说明、`businessHandbookOperations.mjs` 与 `businessHandbook.mjs` 提供业务内容，`projectManuals.mjs` 处理受控两册章节和跨册链接。来源、权限规则及三册导出见[项目手册](../docs/manuals/README.md)。

## 桌面业务编辑与弹窗约定

共用表单、明细、附件、图片、焦点和滚动约定见 [桌面业务编辑](../docs/engineering/前端实现与交互约定.md#桌面业务编辑与弹窗约定)。
