# 工作流文档 / Workflow Docs

本目录回答“协同任务怎么流转、通知预警怎么表达”的问题。Workflow 文档只描述协同层，不把任务完成写成库存、出货、财务或其他事实落账。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 校对接单、工程、采购、生产到入仓的角色、任务和异常交接 | [业务与协同流程地图](业务与协同流程地图.md) | 文中的代码与测试依据；涉及客户人员组合时再看客户岗位指南 |
| 看通知、预警、催办和升级 | `通知预警催办与升级第一版.md` | 真实任务页、提醒入口和相关测试 |
| 改 Workflow 与 Fact 边界 | `docs/architecture/状态工作流事实边界.md` | 对应事实 usecase 和测试 |

## 真源边界 / Source Boundary

Workflow task `done` 不等于 Fact posted。当前 runtime 行为以 `docs/当前真源与交接顺序.md`、WorkflowUsecase、JSON-RPC / RBAC 和测试为准。

## 更新规则 / Maintenance

业务代码改变前置条件、角色责任、任务派发、状态或完成结果时，按[流程地图的同步维护约定](业务与协同流程地图.md#阅读与同步维护--reading-and-maintenance)同轮修改对应章节。流程地图承接跨岗位交接，领域专题保留具体算法、数据及权限合同。

新增、删除、重命名 workflow 长期文档，或改变任务树、通知、预警口径时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/architecture/状态工作流事实边界.md`。
- `docs/product/多甲方角色能力与流程编排.md`。
- `docs/当前真源与交接顺序.md`。
