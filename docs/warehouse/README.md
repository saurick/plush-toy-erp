# 仓库与品质 / Warehouse And Quality

查仓库、品质和现场操作的业务规则。

## 先读哪几份 / Reader Paths

| 任务 | 入口 |
| --- | --- |
| 查收发、库存与品质操作口径 | [仓库与品质业务](仓库与品质业务.md) |
| 调整库存、批次或检验事实 | [主数据、源单与事实边界](../architecture/主数据源单据事实边界评审.md) |
| 调整出入库协同或出货扣减 | [状态与事实边界](../architecture/状态工作流事实边界.md) |

## 真源边界 / Source Boundary

库存流水、余额、批次、检验和冲正由所属领域事实维护，任务完成不自动写入事实。是否已实现需核对 schema、migration、usecase、权限与测试。

## 更新规则 / Maintenance

业务口径变化时同步对应领域专题与消费者；文档索引遵循[统一同步规则](../README.md#索引同步--index-sync)。
