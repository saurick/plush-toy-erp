# 毛绒玩具 ERP / plush-toy-erp

面向毛绒工厂的单客户私有化 ERP。React 前端提供电脑后台与手机岗位任务；Go 后端负责业务、权限与事实写入。客户差异通过配置表达。

## 文档索引

| 当前任务 | 入口 |
| --- | --- |
| 找操作手册或专题 | [文档首页](docs/README.md) |
| 判断当前能力和证据 | [当前真源](docs/当前真源与交接顺序.md)、[能力台账](docs/product/产品能力进度台账.md) |
| 开发与维护 | [前端](web/README.md)、[后端](server/README.md)、[脚本](scripts/README.md) |
| 修改功能，查同步范围 | [项目治理地图](docs/项目治理地图.md)、[项目 Skills](.agents/skills/README.md) |
| 部署与恢复 | [部署说明](server/deploy/README.md) |
| 查完整文件目录 | [文档清单](docs/文档清单.md) |

## 本地工具版本

首次准备环境，从仓库根执行：

```bash
sudo n auto
bash scripts/doctor.sh
bash scripts/bootstrap.sh
```

`doctor` 通过后再安装依赖；工具安装与版本切换见[工具链说明](scripts/README.md#版本锁定)。

| 工具 | 版本依据 |
| --- | --- |
| Node.js | [.n-node-version](.n-node-version)，当前 `24.22.1` |
| pnpm | [web/package.json](web/package.json)，当前 `10.34.5` |
| Go | [server/go.mod](server/go.mod)，toolchain `go1.26.10` |
| Bash | `>= 4`，由 `scripts/lib/bash.sh` 检查 |
| PostgreSQL | [后端配置说明](server/docs/config.md)及 `make print_db_url` |

## 本地启动

### 桌面后台

在仓库的 `web/` 目录执行：

```bash
pnpm install
pnpm start
```

默认访问 `http://localhost:5175`。数据库或后端预检失败时，启动器保留[迁移恢复页](http://127.0.0.1:5175/__dev/database-migration)；启动不会自动迁移。成功后核对启动输出的实际地址与业务入口。

端口以 [config/dev-ports.env](config/dev-ports.env) 为准，主前端为 `5175`、后端 HTTP 为 `8300`。隔离验收、客户入口、本机覆盖与故障处理见 [Web README](web/README.md)。

### 岗位任务端

手机与电脑共用前端服务，不另起 Vite。岗位入口为 `/m/<role>/tasks`，例如 `http://localhost:5175/m/engineering/tasks`。登录后仅进入账号已获准的岗位，角色映射与切换规则见 [Web README](web/README.md)。

### 后端

需要单独运行后端时，在 `server/` 执行：

```bash
make init
make run
```

配置、数据库目标与启动预检见 [Server README](server/README.md)。

### 生产前端

生产使用构建后的静态制品，电脑与手机共用 `5175`，不运行 Vite dev server。客户构建参数、镜像与 `/rpc` 代理见[生产 Compose](server/deploy/compose/prod/README.md)；目标机只加载制品。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| [web/](web/README.md) | React 页面、共享组件、岗位任务端与开发工作台 |
| [server/](server/README.md) | Go 业务、API、权限、Ent 模型与 Atlas 迁移 |
| [docs/](docs/README.md) | 手册、业务合同、设计与操作说明 |
| [config/](config/README.md) | 行业模板、客户配置与配置 schema |
| [deployments/](deployments/README.md) | 客户部署合同、运维适配与脱敏证据 |
| [scripts/](scripts/README.md) | 初始化、生成、验证与 Git hooks |
| [.agents/skills/](.agents/skills/README.md) | Codex 项目专项操作流程 |
| `.vscode/` | 编辑器设置，排除 `output/` 等生成与验证目录 |

## 当前边界

客户 key 只选择配置与部署，不承担运行时租户语义。Workflow 任务完成不等于库存、质检、出货或财务事实过账；写入只经过正式后端 usecase。客户原件与私密 manifest 留在客户专属受控存储。

业务边界与判断依据集中在[当前真源](docs/当前真源与交接顺序.md)，协作和授权规则见 [AGENTS](AGENTS.md)。

## 当前不做

当前不扩展硬件/PDA/识别链路、通用客户批量导入、PDF 坐标填充、Excel 母版回写、打印自动留档或未经样本验证的自动派单。已有 BOM 与销售订单 Excel 辅助录入的范围见[字段来源规则](docs/product/业务主链路数据流向与字段来源规则.md#销售订单-excel-辅助录入--sales-order-excel-entry)。

## 当前推荐检查命令

按[测试策略](docs/product/自动化测试策略.md)选择受影响检查，具体命令见 [QA 操作](scripts/qa/README.md)。文档检查、前端测试、浏览器验收与目标发布分别留证，单层通过不代表完整验收。

## 数据库约束

Ent schema 是结构真源。`make data` 生成 Ent 与 Atlas 产物，不修改开发库。登记共享开发库使用 `make migrate`；非交互流程按同次 `make migrate_prepare` 的 ready 回执执行 `make migrate_execute`。实际 apply 须获明确授权，准备成功不等于已迁移。

生成、存量预演、备份恢复与目标读回统一见 [Ent + Atlas](server/docs/ent.md)。
