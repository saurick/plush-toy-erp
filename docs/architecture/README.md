# 架构评审 / Architecture Reviews

本目录保存长期维护的架构边界、领域模型和 usecase 评审文档。

## 放什么

- Workflow / Fact / Source Document / MasterData 等系统分层边界。
- 已进入长期维护的 usecase、schema、状态和业务事实评审。
- Phase 8 生产、委外、出货、库存预留和财务事实扩展的总评审与专项评审。
- 后续实现前需要反复复核的设计约束。

## 不放什么

- 单轮临时执行说明。
- 已退出活跃入口的阶段性实现评审。
- 客户原始资料、导入 evidence 或客户差异清单。

## 是否是真源

本目录是架构边界和设计评审入口，但不直接替代当前代码、Ent schema、Atlas migration、测试或 `docs/current-source-of-truth.md`。评审文档写了方案，不等于 runtime 已实现。

## 更新规则

新增、删除、重命名本目录长期维护文档，或改变某篇文档是否属于活跃架构入口时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/current-source-of-truth.md`。
- 相关产品路线或台账文档。
