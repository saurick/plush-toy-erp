# plush-toy-erp

`plush-toy-erp` 当前是一套可直接运行的 Web + Server 单体骨架，先保留账号体系、错误码治理、健康检查、基础可观测性和 `docker compose` 发布链路，方便尽快把最小可运行链路搭起来，再继续补 ERP 的真实业务实体和页面。

## 当前结构

- `web/`：Vite + React 前端，保留用户登录、注册、管理员登录和后台账号目录骨架
- `server/`：Kratos + Ent + Atlas 后端，保留 `/healthz`、`/readyz`、鉴权、错误码与 JSON-RPC 基线
- `scripts/`：本地环境初始化、质量门禁和 Git hooks
- `docs/`：仓库级约定、部署口径和当前项目基线

## 当前边界

- 当前唯一部署真源是 `/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 本仓库没有初始化 `lab-ha`、Kubernetes 清单和 dashboard
- 首页、登录/注册、后台菜单仍是通用骨架，后续需要继续替换成毛绒玩具 ERP 的业务入口和操作台

## 快速开始

### 前端

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm install
pnpm start
```

默认地址：`http://localhost:5173`

### 后端

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

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
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- 脚本说明：`/Users/simon/projects/plush-toy-erp/scripts/README.md`
- 后端总览：`/Users/simon/projects/plush-toy-erp/server/README.md`
- 后端专题文档：`/Users/simon/projects/plush-toy-erp/server/docs/README.md`
- Compose 部署：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`

## 数据库约束

`server` 使用 Ent + Atlas 工作流：

- 禁止手写结构性 SQL
- schema 变更通过 `make data` 生成迁移
- 发布依赖新 schema 的服务前，先确认目标库 migration 已落地

细节见 `/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`。
