# 客户实例策略 / Customer Instance Policy

## yoyoosun 是什么

`yoyoosun` 表示永绅客户资料和第一个私有化交付实例。

| Key | 口径 |
| --- | --- |
| customer_key | `yoyoosun` |
| config_path | `config/customers/yoyoosun` |
| deployment_path | `deployments/yoyoosun` |
| template_key | `plush-industry` |

`yoyoosun` 是：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

`yoyoosun` 不是：

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

永绅客户资料进入：

- `docs/customers/yoyoosun/*`
- `config/customers/yoyoosun/*`
- `deployments/yoyoosun/*`

通用产品规则只有在经过评审后，才进入：

- `docs/product/*`
- `docs/architecture/*`
- core usecase / schema / tests
