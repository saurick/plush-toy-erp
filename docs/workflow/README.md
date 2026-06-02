# Workflow 文档 / Workflow Docs

本目录保存 workflow 主任务树、通知、预警和协同流程相关的长期文档。

## 放什么

- 工作流主任务树。
- 通知、预警、催办和升级规则。
- 与岗位协同相关的流程说明。

## 不放什么

- 库存、出货、财务等事实层落账规则。
- 单轮 workflow usecase 实现任务。
- 客户专属流程样本。

## 是否是真源

本目录描述 workflow 协同方向，不表示事实已经发生。Workflow task `done` 不等于 Fact posted，具体 runtime 行为仍以代码、测试和 `docs/current-source-of-truth.md` 为准。

## 更新规则

新增、删除、重命名 workflow 长期文档，或改变任务树、通知、预警口径时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/architecture/workflow-usecase-review.md`。
- `docs/current-source-of-truth.md`。
