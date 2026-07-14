# 客户私有化部署资料 / Customer Private Deployments

本目录只保存真实客户私有化实例的脱敏 runbook、检查清单和 evidence 索引。唯一部署真源始终是：

```text
server/deploy/compose/prod
```

## 当前目录

| 路径 | 当前用途 |
| --- | --- |
| `yoyoosun/` | 当前真实客户的 env/override 示例、runbook、checklist、evidence 与薄脚本 |

`reference-customer` 是 draft/preview 工程参考，不创建 `deployments/reference-customer/`。它的最小参数示例、首次部署/升级/回滚/恢复边界统一放在 `config/private-deployment-template/`，避免复制第二套部署架构或生成虚假 evidence。

## 新增真实客户

1. 先在 `docs/customers/<customer-key>/` 完成差异、资料授权和验收边界。
2. 在 `config/customers/<customer-key>/` 维护声明式客户配置，不复制 Product Core。
3. 从 `config/private-deployment-template/` 准备受控 env；只在确有客户运维/evidence 资料时建立 `deployments/<customer-key>/`。
4. 使用独立数据库/账号、文件、日志、备份、恢复权限和 secrets；固定 `ERP_CUSTOMER_KEY`，不增加 `tenant_id`。
5. 目标机只加载固定 tag/digest 制品，执行受控 migration、health/ready/smoke，并保存回滚点。

## 禁止项

- 不按客户 fork 代码、schema、migration、RBAC、usecase 或前端应用。
- 不在目标机执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
- 没有来源授权、dry-run、备份、审批和对账时，不执行真实导入。
- 不把模板检查、本地绿色或历史 evidence 写成当前目标环境已发布或客户已签收。

当前真实 yoyoosun 资料包校验：

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
```

真实发布签核仍应对当次 evidence 目录执行项目 release evidence gate；模板目录本身不生成 release evidence。
