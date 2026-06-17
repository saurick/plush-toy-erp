# 仓库与品质 / Warehouse And Quality

本目录回答“仓库、品质和现场操作的业务说明在哪里读”的问题。库存流水、余额、批次和质检事实的当前实现状态仍以代码、测试和真源索引为准。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 看仓库与品质业务口径 | `仓库与品质第一版.md` | `docs/当前真源与交接顺序.md` |
| 改库存、批次或质检事实 | `docs/architecture/材料成品物料清单与库存专表模型评审.md` | Ent schema、Inventory / Quality usecase 和测试 |
| 改入库或出库协同 | `docs/architecture/仓库入库工作流用例评审.md`、`docs/architecture/成品入库工作流用例评审.md` | WorkflowUsecase 和事实 usecase 边界 |
| 改出货库存扣减 | `docs/architecture/出货事实与库存边界评审.md` | Shipment / Inventory usecase、RBAC、UI 回归 |

## 真源边界 / Source Boundary

仓库与品质文档可以说明业务方向和现场口径；采购入库、库存流水、批次状态、来料质检、出货扣减和冲正是否已实现，必须回到代码、migration 和测试确认。

## 更新规则 / Maintenance

新增、删除、重命名仓库 / 品质文档，或改变库存、批次、质检边界时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 相关 `docs/architecture/*` 评审文档。
