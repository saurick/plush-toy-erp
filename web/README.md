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

前端依赖 pnpm，版本由 `web/package.json` 的 `packageManager` 固定为 `pnpm@10.34.5`；Node.js 版本由仓库根目录 `.n-node-version`、`.node-version` 和 `.nvmrc` 共同锁定为 `24.21.0`。

```bash
cd "$(git rev-parse --show-toplevel)"
corepack enable
bash scripts/doctor.sh

cd "$(git rev-parse --show-toplevel)/web"
pnpm install
```

`scripts/doctor.sh` 会检查当前 `node`、`pnpm` 和版本锁是否一致；不一致时先切换版本，不要继续安装依赖。

## 目录结构（简版）

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

产品路由只在 `import.meta.env.DEV` 下动态加载 `DevWorkbenchBridge.jsx` 这一处 DEV 入口。该入口包裹业务路由的停服恢复边界，并在进入 `/__dev` 时按需加载工作台页面；App 不直接引用 DEV 模块。

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

个人内网开发需要直接访问工作台时，在本机 ignored 的 `web/.env.development.local` 中设置：

```dotenv
PLUSH_DEV_WORKBENCH_ACCESS=private-network
```

重新加载对应开发进程后，浏览器可直接打开 `http://<服务器内网 IPv4>:<前端端口>/__dev`，无需 SSH 隧道或额外工作台登录。需要内网 HTTPS 域名时，在同一文件中配置 `PLUSH_DEV_HTTPS_ORIGIN=https://<内网域名>`，并配置只接受内网客户端的本机 TLS 代理；浏览器打开该域名的 `/__dev`，热更新默认使用同源 WSS。访问仍受私网来源、精确地址、同源、CSRF 与操作确认限制；默认 `operator` 模式继续使用独立运维身份。代理的 Host、转发头与 loopback 合同见 [开发服务 Bridge](dev-server/README.md#边界)。

普通 `pnpm start` 使用通用产品配置；永绅业务开发使用 `pnpm start:yoyoosun` 加载客户公开配置，并读取后端已激活的业务权限与岗位入口。

普通启动先只读检查 schema、migration 和后端 health / ready。登记的本地后端未运行且数据库检查通过时，自动通过现有 `make run` 链路构建、启动并验证当前工作区后端，随后开放电脑版和手机版；已有后端监听进程会保留。后端未就绪、数据库或迁移检查失败时，电脑版、手机版与登录页保留原地址，在原页显示服务不可用提示，不跳转到开发工作台。页面只读检查服务状态，通过同一完整启动检查后自动继续打开当前页面，路径、查询和锚点保持不变。需要人工恢复时可在新标签打开 `/__dev/database-migration`，不自动 apply 或重放业务请求。完整启动、进程保护、端口审计及客户包核对见 [前端脚本](scripts/README.md#本地启动与进程范围)。

所有开发入口直接加载当前工作区的 React / CSS 源文件并支持热更新，重启后不会用历史固定制品覆盖登录页或业务页。`pnpm start:restart` / `pnpm restart` 对应主端口 `5175`；使用 `15200` 客户入口时运行 `pnpm restart:yoyoosun`。停止前端使用 `pnpm stop` / `pnpm stop:yoyoosun`，后端仍独立管理。后端代码在 `server/` 执行 `make dev_restart` 按需构建并生效，输入不变时跳过编译；运行、状态和日志见 [服务端入口](../server/README.md#快速开始)。

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

`pnpm test` 自动发现 `*.test.mjs`，不手工枚举文件。浏览器输入模板、no-write preflight、真实登录和持久测试数据范围见 [前端回归脚本](scripts/README.md) 与 [QA 操作](../scripts/qa/README.md)；页面级 mock 不能代替真实后端、目标发布或客户验收。

## 前端文档入口边界

| 主题                           | 维护入口                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| 登录、菜单、权限与岗位帮助     | [菜单与正式入口合同](../docs/product/菜单与正式入口合同.md)                                   |
| 页面状态、表单、主题与共享控件 | [页面动作与生命周期](../docs/product/业务数据生命周期与页面动作规则.md)                       |
| 字段带值、清空与输出真源       | [业务数据流向与字段来源](../docs/product/业务主链路数据流向与字段来源规则.md)                 |
| 打印渲染与安全                 | [打印模板实现原理](../docs/打印模板实现原理.md)                                               |
| 打印字段与可编辑行为           | [打印字段与编辑清单](../docs/打印模板字段与编辑行为清单.md)                                   |
| `/__dev` 页面、证据和操作边界  | [研发工作台](../docs/engineering/研发效能工作台与CI-CD设计.md#本地开发入口-dev-only-surfaces) |
| Node / Vite Bridge             | [开发服务](dev-server/README.md)                                                              |

正式岗位帮助使用 `roleHelpContent.mjs`；仓库 Markdown 留在仓库与 DEV viewer，不复制到 ERP 运行时。

工作台“改动验证 → 压力测试”入口为 `/__dev/testing?view=pressure`，可运行隔离短档 / 10 分钟容量、切换历史报告并查看吞吐、方法延迟、业务对账和资源清理。报告保留候选版本与源码匹配状态；操作与读取合同见 [测试入口](../docs/engineering/研发效能工作台与CI-CD设计.md#pressure-workbench)，档位和维护方法见 [压力测试说明](../scripts/qa/README.md#pressure-testing)。

## 当前前端边界

前端负责展示与交互，领域事实、状态、权限和幂等由后端决定。详细读取与写后恢复合同见 [页面规则](../docs/product/业务数据生命周期与页面动作规则.md#前端实现与读取边界) 和 [API 合同](../server/docs/api.md)。

## 在线帮助与参考手册

`/erp/help-center` 提供岗位操作图解与文字参考，统一搜索和可收起目录；地址中的 `role / scene / view / ref / q` 保存岗位、场景、内容、词条和关键词。所选岗位统一限定目录、搜索、正文与手机选择器，菜单权限只控制办理入口；切换岗位保留搜索词和手册类型并清理旧章节。业务页帮助与字段问号直达相应章节 / 词条，未指定岗位时在当前账号的帮助岗位中选择关联岗位。内容来自 `businessUsabilityCatalog.mjs` 和 `engineeringMaterialHelp.mjs`，`helpManualCatalog.mjs` 负责索引与查找；不维护第二套规则。现有 24 个业务页及工程用料专题已接入，教学示例不表示真实业务进度，打印 / 离线版本未实现。

## 桌面业务编辑与弹窗约定

共用表单、明细、附件、图片、焦点和滚动约定见 [桌面业务编辑](../docs/product/业务数据生命周期与页面动作规则.md#桌面业务编辑与弹窗约定)。
