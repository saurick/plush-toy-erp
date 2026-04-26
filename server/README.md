# server 后端说明

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / gRPC / JSON-RPC 接入层
- `service`：DTO 转换与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

## 开发验收 debug 能力

业务链路调试页调用后端 JSON-RPC `debug` 域生成和清理调试数据：

- `debug.capabilities`：返回当前环境、seed / cleanup / 业务数据清空是否允许和禁用原因
- `debug.rebuild_business_chain_scenario`：生成带 debugRunId 标记的调试数据
- `debug.clear_business_chain_scenario`：按 debugRunId 预览或清理调试数据
- `debug.clear_business_data`：清空本项目当前 SQL 连接中的业务链路、采购入库、库存、BOM、物料、成品、仓库和单位业务表

这些接口默认面向当前 SQL 连接开启。可用 `ERP_DEBUG_SEED_ENABLED=false` 或 `ERP_DEBUG_CLEANUP_ENABLED=false` 显式关闭写操作；清理类能力仍要求 `ERP_DEBUG_CLEANUP_SCOPE=debug_run`。业务数据清空不删除账号、权限、管理员偏好、配置和数据库结构。后端还会校验管理员身份和业务链路调试菜单权限。

## 快速开始

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

## 常用命令

```bash
make api
make all
make data
make migrate_apply
make print_db_url
make migrate_status
go test ./...
make build
```

Phase 2A 库存事实 PostgreSQL 本地验收使用专用防呆 target，默认库名为 `plush_erp_phase2a_test`：

```bash
make phase2a_pg_createdb
make phase2a_migrate_status
make phase2a_migrate_apply
make phase2a_pg_test
```

Phase 2B BOM + 批次库存 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2b_test`：

```bash
make phase2b_pg_createdb
make phase2b_migrate_status
make phase2b_migrate_apply
make phase2b_pg_test
```

Phase 2C 采购入库 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2c_test`：

```bash
make phase2c_pg_createdb
make phase2c_migrate_status
make phase2c_migrate_apply
make phase2c_pg_test
```

Phase 2D-A 采购退货 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2d_test`：

```bash
make phase2d_pg_createdb
make phase2d_migrate_status
make phase2d_migrate_apply
make phase2d_pg_test
```

## 迁移说明

- `make migrate_apply` 默认读取 `server/configs/dev/config.yaml`
- 若存在 `config.local.yaml`，会覆盖本地私有 DSN
- 只有显式设置 `USE_ENV_DB_URL=1` 时才使用环境变量 `DB_URL`
- 发布依赖新 schema 的服务前，先确认目标库 migration 已落地

## 目录结构（简版）

```text
server/
├── api/
├── cmd/
├── configs/
├── deploy/
├── docs/
├── internal/
│   ├── biz/
│   ├── data/
│   ├── server/
│   └── service/
├── pkg/
└── third_party/
```

| 路径 | 职责 |
| --- | --- |
| `api/` | 协议定义与生成入口，目前包含 JSON-RPC 相关接口描述 |
| `cmd/` | 服务启动、迁移辅助与排障命令入口 |
| `configs/` | 按环境拆分的配置文件 |
| `internal/server/` | HTTP/gRPC/JSON-RPC 接入、中间件与路由装配 |
| `internal/service/` | 接口适配层，负责 DTO 转换与调用编排 |
| `internal/biz/` | 业务规约与 UseCase 真源 |
| `internal/data/` | 数据访问、外部依赖与持久化实现 |
| `internal/conf/` | 配置结构定义与加载相关代码 |
| `internal/errcode/` | 服务端错误码目录真源 |
| `pkg/` | 可复用基础设施组件，如日志、JWT、任务编排与 Telegram 辅助 |
| `deploy/` | Compose 部署模板与发布入口 |
| `docs/` | 后端专题文档索引与 runbook |
| `third_party/` | 第三方 proto / OpenAPI 依赖 |

## 文档索引

- 后端专题入口：`/Users/simon/projects/plush-toy-erp/server/docs/README.md`
- 部署总览：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- 运行说明：`/Users/simon/projects/plush-toy-erp/server/docs/runtime.md`
- 配置说明：`/Users/simon/projects/plush-toy-erp/server/docs/config.md`
- API 说明：`/Users/simon/projects/plush-toy-erp/server/docs/api.md`
- 可观测性：`/Users/simon/projects/plush-toy-erp/server/docs/observability.md`
- Ent / Atlas：`/Users/simon/projects/plush-toy-erp/server/docs/ent.md`
- DB 工作流：`/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`

## 部署

- 当前只保留 Compose：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 如需查看部署占位符和发布脚本入口，优先看 `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
