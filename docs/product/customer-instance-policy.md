# Customer Instance Policy

## current 是什么

`current` 表示当前甲方相关资料和第一个私有化交付实例。

| Key | 口径 |
| --- | --- |
| customer_key | `current` |
| config_key | `current-private` |
| deployment_key | `current-prod` |
| template_key | `plush-industry` |

`current` 是：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

`current` 不是：

- SaaS runtime tenant。
- 数据库多租户。
- 多租户 RBAC 隔离对象。
- Product Core 真源。

## 当前禁止事项

- 不新增 `tenant_id`。
- 不改 Ent schema。
- 不改 RBAC 为多租户模型。
- 不创建租户隔离中间件。
- 不做套餐计费或 license server。

## 使用方式

当前客户资料进入：

- `docs/customers/current/*`
- `config/customers/current/*`
- `deployments/current/*`

通用产品规则只有在经过评审后，才进入：

- `docs/product/*`
- `docs/architecture/*`
- core usecase / schema / tests
