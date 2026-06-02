# 客户差异策略 / Customer Delta Policy

## 分类

甲方后续提需求时，先按以下类别归档：

| 类别 | 说明 | 默认落点 |
| --- | --- | --- |
| Product Core | 通用 ERP 内核能力，影响核心事实、权限或状态机 | `docs/product/*`、core usecase、schema、tests |
| Industry Template | 毛绒玩具行业通用模板 | `config/industry-templates/plush` |
| Customer Config | 当前客户可配置差异 | `config/customers/current` |
| Customer Extension | 极少量客户专属扩展 | 后续 extension 边界 |
| Data Import Adapter | 客户资料或历史数据导入适配 | 客户交付包或导入适配目录 |
| Print Template Candidate | 打印格式、合同样式、导出样式 | 客户资料 / 交付说明；当前默认 Deferred，不进产品内核 |
| Reporting | 报表和统计口径 | 通用报表或客户报表边界 |

## Product Core 评审门槛

涉及以下内容时，必须进入 Product Core 架构评审：

- 库存事实。
- 出货事实。
- 财务事实。
- 质检事实。
- 核心状态机。
- RBAC 安全边界。
- 数据库结构。
- 迁移和回滚。

## current 客户需求处理

- 只有当前客户需要的内容，先进入 `docs/customers/current` 或 `config/customers/current` 草案。
- 不能因为甲方提出过，就直接写成 Product Core 规则。
- 当前客户资料可以作为行业模板候选，但必须经过通用化评审。
- 客户专属内容必须记录原因、影响面、替换路径和维护责任。
- 打印格式只作为客户打印样本记录；只有多客户同类单据重复后，才评审是否进入 Print Template Core MVP。
