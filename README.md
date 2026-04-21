# plush-toy-erp

`plush-toy-erp` 当前是一套可直接运行的毛绒工厂 ERP 初始化框架：先保留账号体系、错误码治理、健康检查、`docker compose` 发布链路，并补齐 ERP 主路由、角色工作台、流程总览、帮助中心、文档中心和移动端入口，再继续接正式合同、Excel 与业务实体。

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `web/` | Vite + React 前端，包含公共登录页与 `src/erp/` 初始化壳层，内部目录职责见 [`web/README.md`](web/README.md) |
| `server/` | Kratos + Ent + Atlas 后端，保留 `/healthz`、`/readyz`、鉴权、错误码与 JSON-RPC 基线，内部目录职责见 [`server/README.md`](server/README.md) |
| `scripts/` | 本地环境初始化、质量门禁和 Git hooks，详见 [`scripts/README.md`](scripts/README.md) |
| `docs/` | 仓库级约定、部署口径、ERP 初始化文档与 changes 记录 |

若需要查看 `web/` 或 `server/` 的内部目录，不在根 README 继续展开，以各自子目录 README 为准，避免同一份结构说明在多处漂移。

## 当前边界

- 当前唯一部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 本仓库没有初始化 `lab-ha`、Kubernetes 清单
- 已完成 ERP 初始化看板、流程总览、帮助中心、文档页和移动端工作台
- 拍照扫码、正式 Excel 导入、合同打印模板和图片识别本轮明确不做

## 快速开始

### 前端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

默认地址：`http://localhost:5175`

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

默认端口：

- HTTP：`8200`
- gRPC：`9200`
- 本地开发数据库：`192.168.0.106:5432/plush_erp`
- PostgreSQL Compose 宿主机映射：`5435`

### 本地数据库迁移

```bash
cd /Users/simon/projects/plush-toy-erp/server
make data
make migrate_apply
```

## Compose 部署

```bash
cd /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod
cp .env.example .env
docker compose -f compose.yml up -d
```

首次启动前至少替换：

- `POSTGRES_PASSWORD`
- `POSTGRES_DSN`
- `POSTGRES_DATA_DIR`
- `APP_IMAGE` 或本地构建镜像名

详细说明见 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/README.md`。

## 常用检查命令

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

前端样式或布局任务还应执行：

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
- 当前项目基线：`/Users/simon/projects/plush-toy-erp/docs/project-status.md`
- ERP 初始化范围：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-initialization.md`
- ERP 主流程草案：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-operation-flow.md`
- ERP 数据模型草案：`/Users/simon/projects/plush-toy-erp/docs/plush-erp-data-model.md`
- 本轮 changes 记录：`/Users/simon/projects/plush-toy-erp/docs/changes/plush-erp-bootstrap-init.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- 脚本说明：`/Users/simon/projects/plush-toy-erp/scripts/README.md`
- 前端总览：`/Users/simon/projects/plush-toy-erp/web/README.md`
- 后端总览：`/Users/simon/projects/plush-toy-erp/server/README.md`
- 后端专题文档：`/Users/simon/projects/plush-toy-erp/server/docs/README.md`
- Compose 部署：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`

## 数据库约束

`server` 使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更通过 `make data` 生成迁移
- 发布依赖新 schema 的服务前，先确认目标库 migration 已落地

细节见 `/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`。
