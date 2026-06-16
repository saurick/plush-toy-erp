# server 后端说明

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / gRPC / JSON-RPC 接入层
- `service`：DTO 转换、JSON-RPC URL / method 分发、入口级鉴权与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

## 开发验收 debug 能力

后端 JSON-RPC `debug` 域可生成和清理开发验收调试数据。前端业务链路调试页已移除，这组接口只作为受权限保护的后端调试能力保留；旧 `business_records / business_record_items / business_record_events` 表族已由 `20260612112337` migration 删除，debug seed / cleanup 不再写旧通用业务记录：

- `debug.capabilities`：返回当前环境、seed / cleanup / 业务数据清空是否允许和禁用原因
- `debug.rebuild_business_chain_scenario`：生成带 debugRunId 标记的调试数据
- `debug.clear_business_chain_scenario`：按 debugRunId 预览或清理调试数据
- `debug.clear_business_data`：清空本项目当前 SQL 连接中的 V1 主数据 / 订单、Workflow、Operational Fact、采购入库、库存、BOM、物料、成品、仓库和单位业务表

这些接口默认面向当前 SQL 连接开启。可用 `ERP_DEBUG_SEED_ENABLED=false` 或 `ERP_DEBUG_CLEANUP_ENABLED=false` 显式关闭写操作；清理类能力仍要求 `ERP_DEBUG_CLEANUP_SCOPE=debug_run`。业务数据清空不删除账号、权限、管理员偏好、配置和数据库结构。后端还会校验管理员身份和 debug 权限。

## 业务领域 JSON-RPC / Domain JSON-RPC

采购入库已接入独立 `purchase` JSON-RPC 域，当前只覆盖既有 `purchase_receipts / purchase_receipt_items` 事实主路径：

- `create_purchase_receipt_draft`
- `add_purchase_receipt_item`
- `post_purchase_receipt`
- `cancel_purchase_receipt`
- `get_purchase_receipt`
- `list_purchase_receipts`

这组接口走 `InventoryUsecase` 和既有采购入库事实表，过账写 `inventory_txns.IN`，取消已过账入库写 `REVERSAL`。公开入库 API 不接受 `business_record_id` 作为正式事实来源；`purchase.receipt.create / purchase.receipt.read / warehouse.inbound.confirm` 只控制采购入库 API 权限，不代表 Workflow 任务完成会自动过账库存事实。

普通 `business` JSON-RPC 域当前只保留业务看板 `dashboard_stats`。旧 `list_records / create_record / update_record / delete_records / restore_record` 已退出运行时，不能恢复为事实或历史快照查询入口。

`masterdata` JSON-RPC 域承载客户、供应商、联系人、材料和 SKU 主数据维护。SKU 使用 `create_product_sku / update_product_sku / get_product_sku / list_product_skus / set_product_sku_active`，只维护产品规格主数据和启停状态，校验归属产品与可选默认单位，不写订单、库存、BOM、生产、出货或财务事实。

`sales_order` JSON-RPC 域承载销售订单 Source Document / Business Commitment 主路径。订单表单保存应优先使用 `save_sales_order_with_items`，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；任一步失败会整体回滚，不由前端串联多个订单行接口拼装一次保存流程。原有 `create_sales_order / update_sales_order / add_sales_order_item / update_sales_order_item / remove_sales_order_item` 仍保留为底层单对象能力，不写库存、出货、预留、财务、发票或收付款事实。

`purchase_order` JSON-RPC 域承载采购订单 Source Document / Purchase Commitment 主路径。采购订单表单保存应优先使用 `save_purchase_order_with_items`，在一个后端事务中完成订单头创建 / 更新、订单行新增 / 更新以及缺失开放行取消；同时支持 `submit_purchase_order / approve_purchase_order / close_purchase_order / cancel_purchase_order / get_purchase_order / list_purchase_orders / list_purchase_order_items`。采购订单只表达供应商采购承诺，采购入库行可选关联 `purchase_order_item_id` 做来源追溯；它不写库存、批次、应付、发票或付款事实。

`bom` JSON-RPC 域承载 BOM Version / 工程资料主路径。当前支持 `list_bom_versions / get_bom_version / create_bom_draft / update_bom_draft / add_bom_item / update_bom_item / delete_bom_item / copy_bom_version / activate_bom_version / archive_bom_version`。BOM 草稿可维护头信息和明细；激活会归档同产品旧 `ACTIVE` 版本，已激活 BOM 不允许直接改头或明细，改版应复制新草稿后再激活。该域只维护工程资料，不生成采购需求、采购订单、库存流水、生产任务、成本、应付、发票或付款事实。

`admin` JSON-RPC 域承载后台管理员、角色和权限管理。当前系统控制面审计入口为 `audit_logs`，受 `system.audit.read` 权限控制，只读返回 `runtime_audit_events` 中的启动初始化和账号 / 角色 / 权限变更事件；账号创建、角色绑定、账号启停、重置密码和角色权限变更会追加非敏感 before / after 摘要，不保存密码、token 或密码 hash。该审计表不是采购、库存、质检、出货、财务等业务动作的通用审计事实表。

`operational_fact` JSON-RPC 当前承载生产、委外、出货、库存预留和财务事实的最小运行入口。shipment 主路径复用 `shipments / shipment_items / inventory_txns`，提供：

- `create_shipment`
- `create_shipment_with_items`
- `add_shipment_item`
- `ship_shipment`
- `cancel_shipment`
- `list_shipments`

这组接口使用 `shipment.read / shipment.create / shipment.ship / shipment.cancel` 动作权限。新建表单应优先使用 `create_shipment_with_items`，在一个后端事务中创建出货单头和明细，避免前端串联多个请求留下半成品草稿；`ship_shipment` 才把出货单推进到 `SHIPPED` 并写库存 `OUT`，`cancel_shipment` 只允许取消已出货单并写 `REVERSAL`；`shipment_release done` 不会自动调用这些接口。

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
go run ./cmd/seed-core-demo-data --help
```

本地开发默认只使用 `192.168.0.106:5432/plush_erp`。`192.168.0.133:5435/plush_erp` 是测试 / 目标环境库，不应通过 `config.local.yaml` 静默混入本地 `make run`、seed 或 migration；确需对测试库执行一次性操作时，必须显式设置 `ERP_ALLOW_TEST_DB_AS_DEV=1` 并在命令里写清目标。

库存事实 PostgreSQL 本地验收使用专用防呆 target，默认库名为 `plush_erp_phase2a_test`：

```bash
make inventory_pg_createdb
make inventory_migrate_status
make inventory_migrate_apply
make inventory_pg_test
```

BOM + 批次库存 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2b_test`：

```bash
make bom_lot_pg_createdb
make bom_lot_migrate_status
make bom_lot_migrate_apply
make bom_lot_pg_test
```

采购入库 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2c_test`：

```bash
make purchase_receipt_pg_createdb
make purchase_receipt_migrate_status
make purchase_receipt_migrate_apply
make purchase_receipt_pg_test
```

采购退货 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_phase2d_test`：

```bash
make purchase_return_pg_createdb
make purchase_return_migrate_status
make purchase_return_migrate_apply
make purchase_return_pg_test
```

## 迁移说明

- `make migrate_apply` 默认读取 `server/configs/dev/config.yaml`
- 若存在 `config.local.yaml`，会覆盖本地私有 DSN
- dev 配置解析到 `192.168.0.133` 或 `5435` 会被防呆拦截，避免把测试 / 目标环境当成本地开发库迁移
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
│   ├── core/
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
| `internal/core/` | 纯产品领域规则层，当前承载无 IO 的值对象、领域错误、出货三态、库存批次、采购过账单据、采购订单、来料质检、销售订单生命周期等状态机、库存可用量计算和边界守卫；后续其他状态机、计算器或 policy 迁入前必须先评审，不接 runtime / DB / transport |
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
