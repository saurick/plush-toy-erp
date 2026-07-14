# 业务层说明 / Biz

`server/internal/biz` 承载应用业务规约和 UseCase 编排。它接收已经脱离 HTTP / gRPC / JSON-RPC 传输结构的输入，通过 repository interface 访问持久化能力；稳定、无 IO 的纯产品规则下沉到 `core`，不在两层重复实现。

## 当前职责

| 职责组 | 主要 UseCase / 边界 |
| --- | --- |
| 身份与控制面 | `AdminAuthUsecase`、`AdminManageUsecase`、`CustomerConfigUsecase`：认证、账号与 RBAC 管理、客户配置版本控制 |
| Workflow 与流程运行时 | `WorkflowUsecase`、`ProcessRuntimeUsecase`：协同任务、责任投影、流程实例与显式领域命令编排 |
| MasterData 与 Source Document | `MasterDataUsecase`、`SalesOrderUsecase`、`PurchaseOrderUsecase`、`ProductionOrderUsecase`、`OutsourcingOrderUsecase` |
| 库存、质检与 Fact | `InventoryUsecase`、`OperationalFactUsecase`：BOM、采购收货、库存、质检、生产、委外、出货和财务事实的业务入口 |
| 业务证据 | `BusinessAttachmentUsecase`：附件 owner 校验、上传和读取边界 |
| 开发验收 | `DebugUsecase`：只在受控开发环境提供 seed / 清理能力，不属于正式业务事实入口 |

实际 Wire 注册入口以 [`biz.go`](./biz.go) 的 `ProviderSet` 为准；具体业务合同以对应接口、实现和测试为准，本 README 只负责分层导航。

## 分层边界

- `service` 负责协议参数、入口鉴权、错误映射与结果包装；`biz` 不解析 transport 请求。
- repository interface 定义在 `biz`，实现位于 `data`；`biz` 不直接依赖 Ent、SQL 或数据库驱动。
- 可复用的纯状态机、值对象、领域错误和计算规则进入 [`core`](../core/README.md)，UseCase、权限、幂等、事务编排和外部依赖仍留在 `biz / data` 主路径。
- `WorkflowUsecase` 只维护协同任务和事件，Workflow task done 不等于 Fact posted；事实写入必须经过对应 Fact UseCase 或显式 ProcessRuntime 领域命令边界。

## 相关入口

- [当前真源与交接顺序](../../../docs/当前真源与交接顺序.md)
- [后端 API 说明](../../docs/api.md)
- [可观测性与健康检查](../../docs/observability.md)
- [Workflow / Fact 边界](../../../docs/architecture/状态工作流事实边界.md)
- [服务层说明](../service/README.md)
- [数据层说明](../data/README.md)
- [数据库变更工作流](../data/AI_DB_WORKFLOW.md)
