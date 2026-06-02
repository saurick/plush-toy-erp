# 财务文档 / Finance Docs

本目录保存财务方向的长期规划和口径说明。

## 放什么

- 应收、应付、发票、收付款、对账和核销的路线说明。
- 财务与出货、采购、委外事实之间的边界说明。

## 不放什么

- 从订单、放行或 workflow 直接生成财务事实的临时规则。
- 客户单独的结算样本或合同条款。
- 已实现状态声明。

## 是否是真源

本目录不表示财务事实已实现。财务事实必须基于真实出货、采购入库、委外结算或对账等事实评审后落地。

## 更新规则

新增、删除、重命名财务文档，或改变财务事实边界时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/product/product-completion-roadmap.md`。
- `docs/current-source-of-truth.md`。
