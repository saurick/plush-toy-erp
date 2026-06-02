# 假设登记 / Assumption Register

这些内容是当前假设，不能直接开发成规则。

| 假设 | 状态 | 风险 | 处理方式 |
| --- | --- | --- | --- |
| current 客户流程代表毛绒玩具行业通用流程 | 未确认 | 可能把客户习惯误写进 Product Core | 先放 Industry Template Candidate |
| 当前截图字段就是唯一字段真源 | 未确认 | 可能造成残值 / 缺值和字段混淆 | 回到源单据、schema 和导入样本交叉确认 |
| 所有客户都需要委外模块 | 未确认 | 模块开关和权限模板会过度设计 | 先作为可选行业能力 |
| 出货放行后即可财务开票 | 否定倾向 | 会混淆 Workflow / Fact / Finance | 等真实 shipped 后再评审 |
| current 需要 runtime tenant | 已否定 | 会误加 `tenant_id` 和多租户复杂度 | 当前只做客户配置包和私有化实例 |
