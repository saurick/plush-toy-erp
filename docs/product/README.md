# 产品与路线 / Product Docs

本目录保存产品路线、产品原则、能力台账、客户差异治理和交付策略文档。

## 放什么

- 产品完成路线图。
- 产品原则、模块边界、配置权限策略。
- 产品能力进度台账、客户交付矩阵和客户差异台账。
- `business_records` 过渡、正式菜单、导入准备、发布门禁等产品化治理文档。

## 不放什么

- 当前 runtime、schema、migration 或 API 的唯一真源。
- 单客户原始资料和导入 evidence。
- 单轮临时执行说明。
- 临时过程记录。

## 是否是真源

本目录是产品路线和产品治理入口，但不直接证明能力已经实现。当前实现状态必须回到 `docs/current-source-of-truth.md`、代码、migration 和测试确认。

## 更新规则

新增、删除、重命名本目录长期维护文档，或改变 roadmap、能力台账、客户交付状态、客户差异分类时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/current-source-of-truth.md`。
- `progress.md`。
