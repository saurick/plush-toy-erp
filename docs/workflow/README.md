# 工作流文档 / Workflow Docs

查跨岗位任务、责任交接、通知与异常处理。

## 先读哪几份 / Reader Paths

| 任务 | 入口 |
| --- | --- |
| 校对接单、工程、采购、生产到入仓的交接 | [业务与协同流程地图](业务与协同流程地图.md) |
| 查通知、预警、催办和升级 | [通知与升级规则](通知预警催办与升级.md) |
| 调整任务与事实的关系 | [状态与事实边界](../architecture/状态工作流事实边界.md) |

## 真源边界 / Source Boundary

任务完成不等于事实过账。当前行为核对 WorkflowUsecase、领域 usecase、JSON-RPC、RBAC 与测试。

## 更新规则 / Maintenance

前置条件、责任、派发、状态或完成结果变化时，同步[流程地图对应章节](业务与协同流程地图.md#阅读与同步维护--reading-and-maintenance)与领域合同；文档索引遵循[统一同步规则](../README.md#索引同步--index-sync)。
