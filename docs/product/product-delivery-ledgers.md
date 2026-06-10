# 产品台账索引 / Product Delivery Ledgers Index

本文只保留 `plush-toy-erp` 三类长期台账的入口、分工和维护关系，不再承载完整表格。

## 0. 当前台账入口

| 台账 | 路径 | 粒度 | 用途 |
| --- | --- | --- | --- |
| 产品能力进度台账 | `docs/product/capability-ledger.md` | 全局一份 | 判断 Product Core、Industry Template、Customer Config、Customer Extension、Delivery、Help、Reporting 等能力成熟度、证据和下一步 |
| yoyoosun 客户交付矩阵 | `docs/customers/yoyoosun/delivery-matrix.md` | 客户一份 | 判断 yoyoosun 已交付、可试用、配置草案、延期和不可承诺能力 |
| yoyoosun 客户差异台账 | `docs/customers/yoyoosun/delta-ledger.md` | 客户一份 | 判断 yoyoosun 差异需求分类、是否进入产品内核和后续处理方式 |

## 1. 拆分规则

- 产品能力进度台账是全局产品治理真源，只保留一份，不按客户复制。
- 客户交付矩阵必须一客户一份，后续新增客户使用 `docs/customers/<customer-key>/delivery-matrix.md`。
- 客户差异台账必须一客户一份，后续新增客户使用 `docs/customers/<customer-key>/delta-ledger.md`。
- 客户资料只能作为客户配置、交付说明、导入来源、打印样本或模板候选；不能因为写进客户台账就自动升级为 Product Core。

## 2. 维护关系

- 产品能力成熟度变化，先更新 `docs/product/capability-ledger.md`。
- 某个客户是否可试用、是否可交付承诺发生变化，更新该客户的 `delivery-matrix.md`。
- 某个客户新增字段、流程、打印、报表、导入、部署或扩展差异，更新该客户的 `delta-ledger.md`。
- 如果客户差异被评审为通用能力候选，再回到产品能力台账新增或更新对应 Capability；不要在客户台账里直接改写产品内核规则。

## 3. 三类台账之间的关系

| 问题 | 先看哪里 | 再看哪里 |
| --- | --- | --- |
| 产品有没有这项能力 | `docs/product/capability-ledger.md` | 代码、测试、current-source-of-truth |
| 某客户能不能试用这项能力 | `docs/customers/<customer-key>/delivery-matrix.md` | 对应客户 evidence / runbook |
| 某客户提出的差异怎么处理 | `docs/customers/<customer-key>/delta-ledger.md` | `docs/product/customer-delta-policy.md`、架构评审 |
| 客户差异是否进入产品内核 | 先看客户差异台账分类 | 再更新产品能力台账和相关正式评审文档 |

## 4. 当前推荐下一步

1. 维护 `docs/product/capability-ledger.md` 作为全局能力成熟度台账。
2. 维护 `docs/customers/yoyoosun/delivery-matrix.md` 和 `docs/customers/yoyoosun/delta-ledger.md` 作为 yoyoosun 客户专属台账。
3. 后续新增客户时，只复制客户交付矩阵和客户差异台账结构，不复制产品能力台账。

## 5. 最终结论

当前推荐结构是：产品能力台账全局一份；客户交付矩阵和客户差异台账按客户一份。原本文档只作为索引保留，避免旧入口和旧引用失效。
