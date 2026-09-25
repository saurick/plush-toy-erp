# 毛绒玩具 ERP / plush-toy-erp

`plush-toy-erp` 当前是一套已经开始按真实资料收口的毛绒工厂 ERP：生产前端保持一个入口，桌面后台和岗位任务端统一由 `5175` 承载，岗位任务端通过 `/m/<role>/tasks` 进入，并开始基于真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含桌面后台统一入口、登录入口选择和生产单端口 `/m/<role>/tasks` 岗位任务端路径，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，当前承载管理员账号、鉴权、错误码、工作流协同、领域 usecase、进度看板 `list_progress / get_progress`、客户配置版本 `customer_config` JSON-RPC 域、采购订单 `purchase_order` JSON-RPC 域、采购入库与采购更正 `purchase` JSON-RPC 域、库存台账只读 `inventory` JSON-RPC 域、质量检验 `quality` JSON-RPC 域、业务事实 `operational_fact` JSON-RPC 域、`/healthz`、`/readyz` 与 JSON-RPC 基线 |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks |
| [`.agents/skills/`](.agents/skills/README.md) | Codex 项目专项 SOP：代码审查、文档、领域边界、页面、打印模板、seed/import、测试与 operations；Git 改动按项目约定留下被动 handoff record，复杂 commit/push 仅在明确授权后使用全局 skill |
| `docs/` | 仓库级约定、流程、数据模型、产品化架构、架构评审和部署文档 |
| `config/` | 行业模板、客户配置包、客户配置 catalog / schema 和私有化复制模板落点；`demo` 是最小 smoke fixture，`reference-customer` 是 draft/preview 工程参考，`yoyoosun` 是当前真实客户配置；默认产品前端包不静态打包具体客户配置，后端只接收受控编译后的 revision 并生成 effective session，不代表 SaaS tenant，也不改变 Workflow / Fact 真源，内部目录职责见 [`config/README.md`](config/README.md) |
| `deployments/` | 客户私有化部署实例资料落点；当前唯一部署真源仍在 `server/deploy/compose/prod`，私有化模板不创建第二套部署主路径 |

## 当前边界

- 文档从 [docs/README.md](docs/README.md) 进入；能力判断先看[当前真源与交接顺序](docs/当前真源与交接顺序.md)，跨层改动看[项目治理地图](docs/项目治理地图.md)，具体产品状态回到[产品能力进度台账](docs/product/产品能力进度台账.md)、代码、migration 和测试核对。
- 当前形态是单仓库、单客户私有化部署。Product Core 通过客户配置、菜单开关、RBAC、角色模板和 Workflow 责任投影岗位界面；稳定客户 key 为 `yoyoosun`，customer key 不承担 runtime tenant 语义。
- 生产前端保持一个 Vite 入口，桌面后台与 `/m/<role>/tasks` 岗位任务端共用服务；本地固定端口、启动和故障恢复以本页后文、[Web README](web/README.md) 与 `config/dev-ports.env` 为准。
- Source Document、Workflow / ProcessRuntime 与 Fact 分层：任务完成不代写库存、质检、生产、出货或财务事实；业务写入只经过受控后端 repository / usecase，前端不补造或双写事实。
- 部署唯一真源是 [server/deploy/compose/prod](server/deploy/compose/prod/README.md)。目标机只加载不可变制品、执行正式 migration 并读回运行身份；本地绿色、过程记录或历史 release 都不等于当前目标交付。
- 当前对象、页面、权限与状态较多，不在根 README 复制明细表。字段来源、生命周期、角色责任、打印、导入和部署分别由对应专题文档维护，目标是否已 apply / 激活 / 验收必须读取目标证据。
- Debug seed、按 `debugRunId` 清理和全量业务数据清空只服务受控开发验收，默认关闭；远程、共享与生产环境不得借此绕过业务 usecase、权限、审计或恢复边界。

## 本地工具版本

新人拉仓库后先跑 `scripts/doctor.sh`，确认本机工具链与仓库锁定一致；不一致时先修环境，再安装依赖或跑 QA。

| 工具 | 当前锁定 | 真源 |
| --- | --- | --- |
| Bash | `>= 4` | `scripts/lib/bash.sh`；QA 当前解释器与 `PATH` 子进程均须满足 |
| Node.js | `24.21.0` | `.n-node-version`、`.node-version`、`.nvmrc` |
| pnpm | `10.34.5` | `web/package.json` 的 `packageManager` |
| Go | `>= 1.26.8` | `server/go.mod` 的 `toolchain go1.26.8` |
| PostgreSQL | 本地开发默认 `192.168.0.133:5432/plush_erp` | `server/configs/dev/config.yaml` / `config.local.yaml` 和 `make print_db_url` |

推荐初始化顺序：

```bash
cd "$(git rev-parse --show-toplevel)"
corepack enable
bash scripts/doctor.sh
bash scripts/bootstrap.sh
```

## 本地启动

### 桌面后台

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm install
pnpm start
```

默认地址：`http://localhost:5175`

本地数据库或后端检查失败、超时时，启动器会保留[数据库迁移恢复页](http://127.0.0.1:5175/__dev/database-migration)，按页面提示处理并刷新后恢复业务入口。启动不会自动迁移；详细边界见 [Web 启动说明](web/README.md)。

本地 `make dev` / `pnpm start` 的固定端口组以 [`config/dev-ports.env`](config/dev-ports.env) 为真源：主前端 `5175`、后端 HTTP `8300`，端口被占用时直接失败，不会静默顺延到其他项目。`start:yoyoosun`、`preview:yoyoosun` 等短生命周期入口从本项目独占辅助块 `15200-15299` 起探测，并始终输出实际 URL。确需本机整组覆盖时使用 ignored 的 `config/dev-ports.local.env`，必须同时填写完整端口组，避免前端、代理和后端漂移。

在 Windows / WSL 的 Chrome、Edge 或 Brave 中，`pnpm start` 与 `pnpm start:yoyoosun` 会优先激活并刷新同一 loopback 端口的已有项目标签页；只有首次打开、未找到精确端口标签或浏览器拒绝自动化时才新开标签页。显式 `BROWSER=none` 或其他 `BROWSER` 设置仍优先，不会被启动脚本覆盖。

同一个 Vite 服务同时提供桌面后台和岗位任务端，例如 `http://localhost:5175/m/warehouse/tasks`。统一登录页会按设备给默认入口，手机默认岗位任务端、电脑默认后台、平板优先使用上次选择；入口按钮由前端入口配置控制。用户不在登录前手选岗位角色；岗位任务端登录后优先进入已授权的明确岗位深链，否则自动进入当前账号第一个可用岗位。`admin` 单一角色和仅具超级管理员身份的账号不会自动映射成老板或其他业务岗位；手机登录会保留登录态并提示进入电脑端或先分配业务岗位。最终可见岗位和任务操作仍由后端管理员状态、RBAC、客户 effective session 与 Workflow 动作投影共同校验。

### 岗位任务端

岗位任务端不再单独启动 Vite，也不再按角色拆端口。本地和生产都通过同一个前端入口访问：

```text
http://localhost:5175/m/boss/tasks
http://localhost:5175/m/sales/tasks
http://localhost:5175/m/purchase/tasks
http://localhost:5175/m/production/tasks
http://localhost:5175/m/warehouse/tasks
http://localhost:5175/m/finance/tasks
http://localhost:5175/m/pmc/tasks
http://localhost:5175/m/quality/tasks
http://localhost:5175/m/engineering/tasks
```

### 生产前端

生产环境不使用 Vite dev server。前端镜像从桌面构建产物启动一个静态服务，统一监听 `5175`；岗位任务端通过 `/m/<role>/tasks` 访问，由外部网关只映射这一组前端入口：

```bash
cd "$(git rev-parse --show-toplevel)"
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

yoyoosun 等客户私有化前端包必须在本地或 CI 构建时显式注入客户配置，目标服务器仍只负责加载镜像：

```bash
docker build \
  --build-arg ERP_CUSTOMER_PACKAGE=yoyoosun \
  -f web/Dockerfile \
  -t plush-toy-erp-web:yoyoosun-dev .
```

固定端口：前端 `5175`；生产 Compose 中后端 HTTP `127.0.0.1:8300` 只绑定宿主机 loopback，浏览器业务流量通过前端容器 `/rpc` 反代进入 Docker 网络内的 `app-server:8300`。

### 后端

```bash
cd "$(git rev-parse --show-toplevel)/server"
make init
make run
```

默认端口：

- HTTP：`8300`
- 本地开发 PostgreSQL：`192.168.0.133:5432/plush_erp`
- 演示与甲方测试 PostgreSQL：133 上的独立 loopback 端口 `55436/55437`，远程访问使用 SSH tunnel；发布与验收仍走各自正式流程。`5435/55435` 是已退役旧实例。

## 当前不做

- 扩展硬件链路、PDA、条码枪、图片识别
- 通用客户 Excel 批量导入落库；BOM 页面支持 `.xlsx` 辅助录入，销售订单汇总表支持多选批量新建草稿及图片附件；导入边界见[字段来源规则](docs/product/业务主链路数据流向与字段来源规则.md#销售订单-excel-辅助录入--sales-order-excel-entry)
- PDF 坐标填充
- Excel 母版回写
- 打印结果自动留档或反向回写业务记录
- 未经样本验证的细分业务专表和复杂自动派单规则

## 当前推荐检查命令

```bash
bash scripts/bootstrap.sh
bash scripts/doctor.sh
bash scripts/project-scan.sh --strict
```

前端改动后执行：

```bash
cd "$(git rev-parse --show-toplevel)/web"
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

## 文档索引

按任务查找从 [文档入口](docs/README.md) 开始；其中按上手维护、业务领域、页面打印、开发交付、客户验收、参考历史六类导航。

- 判断当前状态：[当前真源与交接顺序](docs/当前真源与交接顺序.md)。
- 查询全部文档：[文档清单](docs/文档清单.md)。
- 开发入口：[前端](web/README.md)、[后端](server/README.md)、[脚本](scripts/README.md)。
- 协作与维护：[AGENTS.md](AGENTS.md)。

客户原件与私密 manifest 留在客户专属 Private 仓库；产品仓内的客户资料与交付包只保存脱敏合同和证据。

## 数据库约束

Ent schema 是结构真源，`make data` 生成 Ent 与 Atlas 产物，不会修改开发库。登记共享开发库交互使用 `make migrate`；非交互使用同一次 `make migrate_prepare` 回执执行 `make migrate_execute`。准备成功不等于已迁移，实际 apply 与同目标读回分别留证。

完整生成、预演、备份恢复、未知结果与目标边界统一见 [Ent + Atlas](server/docs/ent.md)；演示、验收与生产仍走正式发布流程。
