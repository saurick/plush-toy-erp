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
| --- | --- |
| `src/common/`        | 通用认证、组件、hooks、状态、常量与工具函数                                                 |
| `src/erp/`           | 毛绒 ERP 桌面后台、业务页、岗位任务端页面和打印工作台                                       |
| `src/erp/qa/`        | 字段联动等前端 QA catalog 与报告生成依赖                                                    |
| `src/dev-workbench/` | `/__dev` 浏览器端页面、配置、组件和样式，不进入 production build                            |
| `src/pages/`         | 根路由重定向、登录、注册、管理员登录                                                        |
| `dev-server/`        | Node/Vite development-serve Bridge、operation 适配器及合同测试，详见 `dev-server/README.md` |
| `scripts/`           | 前端本地服务、浏览器级回归和 smoke 脚本，详见 `scripts/README.md`                           |
| `build/`             | 构建产物，不作为业务真源                                                                    |

`src/erp/utils/` 中，`sourcePartySnapshots.mjs` 管理往来方快照，`sourceOrderLineValues.mjs` 管理明细来源带值和清空，`masterDataParams.mjs` / `sourceOrderParams.mjs` 管理提交映射，`purchaseOrderPrintDraft.mjs` 管理采购打印输入；`masterDataOrderView.mjs` 保留展示、生命周期和表单行基础规则。页面状态和动作的职责见 [ERP 组件入口](./src/erp/components/README.md)。

## 启动命令

在 `web/` 执行 `pnpm start`。人工终端默认 `http://127.0.0.1:5175`；Codex 会话自动使用 `15200-15299` 辅助端口，以终端输出 URL 为准。端口、后端和 HMR 共用 `config/dev-ports.env`；只复用同工作区、同配置服务，未知占用会阻断。

| 场景 | 入口 |
| --- | --- |
| 日常开发 | `pnpm start` |
| 重新加载本工作区服务 | `pnpm start:restart`，先预检并核对进程归属 |
| 独立前端验证 | `pnpm start:isolated`，自动选择辅助端口 |
| 只调布局，不登录或调用 RPC | `pnpm start:frontend-only`，明确为降级模式 |
| 客户热更新 / 静态预览 | `pnpm start:yoyoosun --print-plan` / `pnpm preview:yoyoosun --print-plan` |

普通启动先只读检查 schema、migration 和后端 health / ready。可恢复的本机预检失败时保留 `/__dev/database-migration`，业务入口继续阻断；修正后重新通过完整检查才恢复，不自动 apply。完整启动、进程保护、端口审计及客户包核对见 [前端脚本](scripts/README.md#本地启动与进程范围)。

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

`pnpm test` 自动发现 `*.test.mjs`，不手工枚举文件。浏览器输入模板、no-write preflight、真实登录和持久测试数据范围见 [前端回归脚本](scripts/README.md) 与 [QA 操作](../scripts/qa/README.md)；页面级 mock 不能代替真实后端、目标发布或客户验收。

## 前端文档入口边界

| 主题 | 维护入口 |
| --- | --- |
| 登录、菜单、权限与岗位帮助 | [菜单与正式入口合同](../docs/product/菜单与正式入口合同.md) |
| 页面状态、表单、主题与共享控件 | [页面动作与生命周期](../docs/product/业务数据生命周期与页面动作规则.md) |
| 字段带值、清空与输出真源 | [业务数据流向与字段来源](../docs/product/业务主链路数据流向与字段来源规则.md) |
| 打印渲染与安全 | [打印模板实现原理](../docs/打印模板实现原理.md) |
| 打印字段与可编辑行为 | [打印字段与编辑清单](../docs/打印模板字段与编辑行为清单.md) |
| `/__dev` 页面、证据和操作边界 | [研发工作台](../docs/engineering/研发效能工作台与CI-CD设计.md#本地开发入口-dev-only-surfaces) |
| Node / Vite Bridge | [开发服务](dev-server/README.md) |

正式岗位帮助使用 `roleHelpContent.mjs`；仓库 Markdown 留在仓库与 DEV viewer，不复制到 ERP 运行时。

## 当前前端边界

前端负责展示与交互，领域事实、状态、权限和幂等由后端决定。详细读取与写后恢复合同见 [页面规则](../docs/product/业务数据生命周期与页面动作规则.md#前端实现与读取边界) 和 [API 合同](../server/docs/api.md)。

## 桌面业务编辑与弹窗约定

共用表单、明细、附件、图片、焦点和滚动约定见 [桌面业务编辑](../docs/product/业务数据生命周期与页面动作规则.md#桌面业务编辑与弹窗约定)。
