# 第四次 GPT 参考资料 20260627

本目录保存同一 GPT 会话的最终收敛版，只作为 Reference Only，不是当前实现、schema、migration、API、测试或部署真源。

## 优先阅读

- [ERP 客户差异实现边界规范](ERP客户差异实现边界规范.md)：重点参考“Product Core 主导、客户差异先分类、扩展结果由核心校验”的原则，代码与目录示例必须按当前项目边界复核。
- [多甲方角色能力模块组合流程编排设计-效率优先部署导入版-20260627.md](多甲方角色能力模块组合流程编排设计-效率优先部署导入版-20260627.md)
- [ERP 各类“流”的边界与实现参考](erp各类“流”的边界与实现参考.md)

其中“各类流”参考已经按 plush 当前边界收敛到正式架构评审：[各类流程建模边界评审](../../architecture/各类流程建模边界评审.md)。后续实现以正式评审、当前代码和测试为准，不从 reference 直接施工。

## 已知边界

- 文中的 overlay 脚本缺失判断已过期，当前仓库 `scripts/build/apply-customer-web-config.mjs` 存在且 customer config QA 已通过。
- `ERP客户差异实现边界规范.md` 中的 `TenantID / tenant_id`、`yongshen`、客户代码注册和通用规则引擎示例不是当前实现口径；本项目当前是一客户一库的私有化部署，稳定 key 为 `yoyoosun`，禁止新增 `tenant_id`，也不允许客户包上传或注册任意运行时代码。
- 文中把 `ship -> shipped` 画成普通流转只能作为概念示意；当前必须保持 `shipping_released != shipped`，只有 Shipment 领域 usecase 完成真实出货与库存事实后才能记为 `SHIPPED`，Workflow task done 不得代替事实过账。
- 文中将采购订单、审批和审计并列到 Fact 的分类不是本项目分层真源：采购订单是 Source Document，审批属于 Workflow 协同，审计是跨域证据与可观测性边界；实际归属以正式架构文档、usecase 和测试为准。
- 文中的推荐目录、模板、registry 和 extension 分层只是分类参考，不是当前仓库重构指令；未完成独立边界评审、引用迁移和回归前，不按 reference 直接新增或移动目录。
- 文中部分 QA runner 属于未来门禁，不是当前可执行命令。
- 真实客户数据导入、yoyoosun 黄金闭环、A/B 客户 release gate 只能作为未来条件，当前仍以仓库真源为准。
- 部署构建必须在本地或 CI 执行；低配目标机只加载制品、执行 migration、启动和检查。

## 使用方式

实施前必须回到 [当前真源与交接顺序](../../当前真源与交接顺序.md)、正式产品 / 架构文档、当前代码、migration 和测试复核。若本目录内容与当前代码或正式文档冲突，优先按当前代码和正式文档判断。
