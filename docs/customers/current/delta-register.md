# 差异登记 / Delta Register

本文件记录 current 客户差异项。差异项默认不进入 Product Core，除非通过通用化评审。

| 差异项 | 分类 | 当前处理 | 是否 Product Core |
| --- | --- | --- | --- |
| 当前客户合同样式 | Print Template Candidate / Customer Material | 只作客户打印样本和字段来源记录，默认 Deferred | 否，待多客户重复后再评审 |
| 当前客户截图字段 | Customer Material | 作为字段线索 | 否，待评审 |
| 当前客户角色叫法 | Customer Config | 通过 RBAC 角色模板映射职责 | 否 |
| 当前客户部署实例 | Delivery / Ops | `deployments/current` 记录 | 否 |
| 毛绒玩具 BOM / 辅材 / 包材模式 | Industry Template Candidate | 评审后可沉淀为行业模板 | 待评审 |
| current 历史资料导入适配 | Data Import Adapter | 先做 dry-run、字段分类和 unresolved queue；真实 loader 单独评审 | 否，待评审 |
