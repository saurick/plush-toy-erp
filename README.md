# plush-toy-erp

`plush-toy-erp` 当前是一套已经开始按真实资料收口的毛绒工厂 ERP：桌面后台继续保持一个入口，移动端按角色拆成多端口，并且开始基于真实 PDF、Excel、报表截图收口流程、字段真源、数据模型和导入映射。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含桌面后台统一入口和八个角色移动端入口，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，当前承载账号、鉴权、错误码、工作流协同、通用业务记录、`/healthz`、`/readyz` 与 JSON-RPC 基线 |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks |
| `docs/` | 仓库级约定、流程、数据模型、changes 和部署文档 |

## 当前边界

- 当前唯一部署真源仍是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前后端统一走 `8200`
- 当前数据库默认命中 `192.168.0.106:5432/plush_erp`
- 当前数据库已存在，账号表、工作流协同表和首版通用业务记录表已通过 Ent + Atlas 落地；细分业务专表后续仍按真实样本逐步拆
- 扩展硬件链路、PDA、条码枪、图片识别本轮统一标记为 deferred
- 模板打印当前只保留采购合同、加工合同两套正式模板；对应业务页已支持选中记录带值打开，打印中心保留默认样例和模板核对入口

## 本地启动

### 桌面后台

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start:desktop
```

默认地址：`http://localhost:5175`

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

| 入口 | 端口 |
| --- | --- |
| 老板移动端 | `5186` |
| 跟单移动端 | `5187` |
| 采购移动端 | `5188` |
| 生产移动端 | `5189` |
| 仓库移动端 | `5190` |
| 财务移动端 | `5191` |
| PMC 移动端 | `5192` |
| 品质移动端 | `5193` |

### 生产前端

生产环境不使用 Vite dev server。前端镜像从构建产物启动静态服务，并通过 `APP_ID` / `PORT` 固定入口与端口，供任意外部网关映射：

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f web/Dockerfile -t plush-toy-erp-web:dev .
```

固定端口：桌面后台 `5175`，老板 `5186`，跟单 `5187`，采购 `5188`，生产 `5189`，仓库 `5190`，财务 `5191`，PMC `5192`，品质 `5193`。

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

默认端口：

- HTTP：`8200`
- gRPC：`9200`
- PostgreSQL Compose 宿主机映射：`5435`

## 当前不做

- 扩展硬件链路、PDA、条码枪、图片识别
- 正式 Excel 导入落库
- PDF 坐标填充
- Excel 母版回写
- 打印结果自动留档或反向回写业务记录
- 未经样本验证的细分业务专表和复杂自动派单规则

## 当前推荐检查命令

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

前端改动后执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

## 文档索引

- 协作约定：`/Users/simon/projects/plush-toy-erp/AGENTS.md`
- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 初始化范围：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- 主流程：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- 数据模型与导入映射：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- 工作流主任务树 v1：`/Users/simon/projects/plush-toy-erp/docs/workflow/task-flow-v1.md`
- 通知 / 预警 v1：`/Users/simon/projects/plush-toy-erp/docs/workflow/notification-alert-v1.md`
- 角色权限矩阵 v1：`/Users/simon/projects/plush-toy-erp/docs/roles/role-permission-matrix-v1.md`
- 财务 v1：`/Users/simon/projects/plush-toy-erp/docs/finance/finance-v1.md`
- 仓库与品质 v1：`/Users/simon/projects/plush-toy-erp/docs/warehouse/warehouse-quality-v1.md`
- 日志 / 审计 / Trace v1：`/Users/simon/projects/plush-toy-erp/docs/observability/log-trace-audit-v1.md`
- 打印模板字段与编辑行为：`/Users/simon/projects/plush-toy-erp/docs/erp-print-template-field-behavior.md`
- 打印模板实现原理：`/Users/simon/projects/plush-toy-erp/docs/erp-print-template-implementation.md`
- 当前 changes：`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`
- 前端说明：`/Users/simon/projects/plush-toy-erp/web/README.md`
- 打印模板与帮助中心口径：`/Users/simon/projects/plush-toy-erp/web/src/erp/docs/print-templates.md`
- 后端说明：`/Users/simon/projects/plush-toy-erp/server/README.md`

## 数据库约束

`server` 继续使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更必须通过 `make data`
- 工作流协同和通用业务记录已进入 Ent schema v1；后续细分业务专表仍必须先稳定字段关系，再改 `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/*.go`
