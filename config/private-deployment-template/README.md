# 多客户私有化复制模板 / Private Deployment Template

本目录是 私有化客户包模板 的私有化客户包模板入口，用于准备新增客户时的 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/` 和 `deployments/<customer-key>/` 边界。

它不是运行时 loader，不是 SaaS tenant 配置，也不授权真实客户数据导入。

## 当前状态

- `templateConfig.mjs` 只供 QA、文档评审和未来客户包准备读取。
- 模板状态为 `template_candidate`，`runtimeEnabled=false`。
- `simulatedCustomerKey` 只用于本地 私有化客户包模板 evidence，不应创建为正式客户目录。

## 禁止项

- 不新增 `tenant_id`。
- 不复制核心 schema、usecase、RBAC 或前端 runtime。
- 不在客户服务器构建镜像。
- 不执行真实客户数据导入。
- 不写 `business_records`、库存、出货、预留或财务事实。
- 不把 `config/industry-templates/plush` 从 `candidate` 提升为默认 runtime loader。

