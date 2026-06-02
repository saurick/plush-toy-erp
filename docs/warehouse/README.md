# 仓库与品质 / Warehouse And Quality

本目录保存仓库、品质和现场操作相关长期文档。

## 放什么

- 仓库与品质 v1 口径。
- 仓库、质检、库存、批次和现场操作相关说明。

## 不放什么

- 独立库存事实实现规格。
- 客户专属仓库样本。
- 只靠 workflow task 表示入库或出库完成的规则。

## 是否是真源

本目录是仓库与品质业务说明入口。库存流水、余额、批次和质检事实的当前实现状态仍以代码、测试和 `docs/current-source-of-truth.md` 为准。

## 更新规则

新增、删除、重命名仓库 / 品质文档，或改变库存、批次、质检边界时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/current-source-of-truth.md`。
- 相关 `docs/architecture/*` 评审文档。
