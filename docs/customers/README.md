# 客户资料 / Customer Materials

本目录按稳定客户 key 隔离客户资料、客户差异、导入准备和客户配置草案。客户资料可以作为线索、配置、模板或交付 evidence，不能自动升级为 Product Core。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 判断某客户资料范围 | `<customer-key>/README.md` | `docs/当前真源与交接顺序.md`、客户目录内交付矩阵 / 差异台账 |
| 做客户导入 dry-run | `<customer-key>/导入策略.md` | `source-manifest.json`、导入工具说明、脚本测试 |
| 判断客户差异是否产品化 | `<customer-key>/客户差异台账.md` | `docs/product/客户差异策略.md`、Product Core 评审 |
| 做客户私有化资料包 | `<customer-key>/README.md` | `config/customers/<customer-key>/README.md`、`deployments/<customer-key>/README.md` |

## 当前客户 / Current Customers

| 客户 key | 入口 | 当前用途 |
| --- | --- | --- |
| `yoyoosun` | `yoyoosun/README.md` | 永绅客户资料、导入准备、客户差异、试用说明和历史 evidence 索引 |

## 真源边界 / Source Boundary

客户目录是客户资料和客户差异的归属边界，不是通用产品内核真源。通用 schema、usecase、菜单、RBAC、Workflow / Fact 规则和 SaaS runtime tenant 设计仍回到 Product Core 文档、代码、migration 和测试。

## 新增客户路径 / New Customer Path

新增客户前先复用私有化客户包模板，并保持三处边界一致：

```text
docs/customers/<customer-key>/
config/customers/<customer-key>/
deployments/<customer-key>/
```

真实导入需要客户确认、备份 evidence、unresolved queue 清零和回滚 / forward-fix 方案；条件不满足时，只能做本地模拟或 dry-run evidence。

## 更新规则 / Maintenance

新增客户目录、调整客户 key、改变客户交付状态或客户差异分类时，必须同步检查：

- 本 README。
- 对应 `docs/customers/<customer-key>/README.md`。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 对应 `config/customers/<customer-key>/` 和 `deployments/<customer-key>/` 说明。
