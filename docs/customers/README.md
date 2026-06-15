# 客户资料 / Customer Materials

本目录按稳定客户 key 隔离客户资料、客户差异、导入准备和客户配置草案。

## 放什么

- `docs/customers/<customer-key>/` 客户专属资料。
- 客户原始资料说明、需求线索、问题清单、决策日志和差异台账。
- 客户交付矩阵 `客户交付矩阵.md` 和客户差异台账 `客户差异台账.md`。
- 客户导入 dry-run、freeze evidence、人工 review checklist 和导入风险登记。

## 不放什么

- Product Core 规则。
- 通用 schema / usecase 设计。
- SaaS runtime tenant 设计。
- 未隔离到客户 key 的长期客户资料。

## 是否是真源

本目录是客户资料和客户差异真源，不是产品内核真源。客户资料只能作为线索、配置、导入来源或模板候选，不能自动升级为 Product Core。

## 更新规则

新增客户目录或调整客户 key 时，必须同步检查：

- 本 README。
- 对应 `docs/customers/<customer-key>/README.md`。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- `config/customers/<customer-key>/` 和 `deployments/<customer-key>/` 是否需要对应说明。

## 私有化客户包复制

新增客户前先复用私有化客户包模板：

```text
docs/customers/<customer-key>/
config/customers/<customer-key>/
deployments/<customer-key>/
```

`SIM-PRIVATE-DEPLOYMENT` 只用于本地模拟 evidence，不得创建为正式客户目录。真实导入仍需单独数据治理评审；没有客户确认、备份 evidence、unresolved queue 清零和回滚方案时，只能做本地模拟。
