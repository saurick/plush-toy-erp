# 客户资料 / Customer Materials

本目录按稳定客户 key 保存可进入 Product Core 仓库的脱敏客户说明、差异、导入准备和配置草案。客户真实原件、私密 manifest 和未脱敏输出进入客户确认的专属 Private 仓库或等价受控存储；永绅原件与 manifest 已推送到独立 Private 仓库并完成远端回读，Product Core 当前工作树已移除旧副本。客户资料可以作为线索、配置、模板或交付 evidence，不能自动升级为 Product Core。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 判断某客户资料范围 | `<customer-key>/README.md` | `docs/当前真源与交接顺序.md`、客户目录内客户交付矩阵 |
| 与现有甲方确认多岗位职责、审批和跨岗流程 | `<customer-key>/甲方角色职责与业务流转确认表.md`（若该客户已建立） | 客户决策日志 / 问题待办、角色技术手册、当前系统流程矩阵 |
| 做客户导入 dry-run | `<customer-key>/导入策略.md` | 客户私有仓库中的 manifest、导入工具说明、脚本测试 |
| 判断客户差异是否产品化 | `<customer-key>/客户交付矩阵.md` 的客户差异与决策 | `docs/product/客户差异策略.md`、Product Core 评审 |
| 做客户私有化资料包 | `<customer-key>/README.md` | `config/customers/<customer-key>/README.md`、`deployments/<customer-key>/README.md` |
| 实施新增私有化甲方 | `../product/新增甲方客户实施流程.md` | `reference-customer/README.md`、`../../config/private-deployment-template/README.md`、目标客户受控交付资料 |

## 当前客户 / Current Customers

| 客户 key | 入口 | 当前用途 |
| --- | --- | --- |
| `yoyoosun` | `yoyoosun/README.md` | 永绅甲方面谈确认表、脱敏客户资料、导入准备、客户差异、试用说明和历史 evidence 索引；原件、签字版与私密 manifest 真源在客户专属 Private 仓库 |

## 工程参考 / Engineering Reference

| key | 入口 | 当前用途 |
| --- | --- | --- |
| `reference-customer` | `reference-customer/README.md` | 中性 draft/preview 工程参考；不是当前客户、生产实例或签收证据 |

## 真源边界 / Source Boundary

客户目录是可进入产品仓的脱敏客户资料和客户差异归属边界，不是原件存储，也不是通用产品内核真源。通用 schema、usecase、菜单、RBAC、Workflow / Fact 规则和 SaaS runtime tenant 设计仍回到 Product Core 文档、代码、migration 和测试。

## 新增客户路径 / New Customer Path

新增客户先按 `docs/product/新增甲方客户实施流程.md` 确认 customer key、资料授权、差异归类和验收责任，再复用私有化客户包模板，并保持产品仓三处投影与客户私密资料边界一致：

```text
docs/customers/<customer-key>/
config/customers/<customer-key>/
deployments/<customer-key>/

独立 Private 仓库：原始 Excel / PDF / 图片、manifest、私密评审、私有验证入口
```

客户私有仓库与 Product Core 采用兄弟目录或 CI multi-checkout，不使用 submodule / subtree。客户仓库固定产品版本并调用通用校验工具；Product Core 普通构建和 CI 不需要私有仓库、客户访问凭据或原件。

真实导入需要客户确认、备份 evidence、unresolved queue 清零和回滚 / forward-fix 方案；条件不满足时，只能做本地模拟或 dry-run evidence。

## 更新规则 / Maintenance

新增客户目录、调整客户 key、改变客户交付状态或客户差异分类时，必须同步检查：

- 本 README。
- 对应 `docs/customers/<customer-key>/README.md`。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 对应 `config/customers/<customer-key>/` 和 `deployments/<customer-key>/` 说明。
- 对应客户私有仓库 manifest、来源文件、远端状态和访问边界；私密内容不复制回本目录。
