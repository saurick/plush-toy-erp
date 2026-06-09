# 客户私有化部署资料 / Customer Private Deployments

本目录只保存客户私有化部署实例资料、runbook 和 evidence 索引，不是第二套部署主路径。

当前唯一部署真源仍是：

```text
server/deploy/compose/prod
```

## Phase 11 复制规则

新增客户时，客户包应至少具备：

- `docs/customers/<customer-key>/`
- `config/customers/<customer-key>/`
- `deployments/<customer-key>/`
- 数据导入 dry-run / freeze / unresolved queue 说明。
- 客户差异台账。
- 低配服务器发布 runbook。
- 备份、恢复、健康检查和验收清单。

## 禁止项

- 不按客户 fork 代码。
- 不按客户复制核心 schema、migration、usecase 或 RBAC 真源。
- 不在低配目标服务器执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
- 不执行真实客户数据导入；没有审批和备份 evidence 时只能本地模拟。
- 不新增 `tenant_id`、SaaS、多租户、license 或 billing。

