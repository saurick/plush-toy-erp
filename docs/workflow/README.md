# 工作流文档 / Workflow Docs

本目录回答“协同任务怎么流转、通知预警怎么表达”的问题。Workflow 文档只描述协同层，不把任务完成写成库存、出货、财务或其他事实落账。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 看业务与协同主链 | `业务与协同流程地图.md` | `docs/architecture/状态工作流事实边界.md`、当前 ProcessRuntime / WorkflowUsecase |
| 看通知、预警、催办和升级 | `通知预警催办与升级第一版.md` | 真实任务页、提醒入口和相关测试 |
| 改 Workflow 与 Fact 边界 | `docs/architecture/状态工作流事实边界.md` | 对应事实 usecase 和测试 |

## 真源边界 / Source Boundary

Workflow task `done` 不等于 Fact posted。当前 runtime 行为以 `docs/当前真源与交接顺序.md`、WorkflowUsecase、JSON-RPC / RBAC 和测试为准。

## 更新规则 / Maintenance

新增、删除、重命名 workflow 长期文档，或改变任务树、通知、预警口径时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/architecture/状态工作流事实边界.md`。
- `docs/product/多甲方角色能力与流程编排.md`。
- `docs/当前真源与交接顺序.md`。
