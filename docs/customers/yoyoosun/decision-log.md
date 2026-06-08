# 决策日志 / Decision Log

只记录已经确认的决策，不把猜测写成已决策。

| 日期 | 决策 | 影响 |
| --- | --- | --- |
| 2026-05-30 | `yoyoosun` 是第一个真实客户 / 种子客户 / 私有化客户实例，不是 SaaS runtime tenant | 不新增 `tenant_id`，不改多租户 RBAC |
| 2026-05-30 | 两个设计输入文件作为 imported notes 保存，Reference Only | 正式真源以 `docs/product/*`、`docs/architecture/*`、代码和测试为准 |
| 2026-05-30 | Phase 0 只做文档和目录骨架 | 不改 runtime、schema、migration、前端 docs registry |
| 2026-05-30 | `shipment_release done` 只到 `shipping_released` | 不写库存、出货、预留、应收或发票事实 |
| 2026-06-08 | Phase 7 按本地模拟数据试用通过关闭 | 真实客户数据当前不可导入，目标客户环境验收转为交付后续；Phase 8 只能先做事实层评审准备 |
