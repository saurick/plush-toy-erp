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

## 当前 yoyoosun 资料包

`deployments/yoyoosun/` 已按私有化交付资料包维护：

- `env/`：环境变量和服务配置样例，只允许 placeholder。
- `compose/`：参考 Compose / Nginx 样例，不替代 `server/deploy/compose/prod`。
- `runbooks/`：首次部署、升级、回滚、备份恢复、migration、导入边界、故障处理和巡检。
- `checklists/`：部署、smoke、安全、备份恢复、升级、回滚和巡检清单。
- `evidence/`：发布、migration、备份和 smoke evidence 模板。
- `scripts/`：薄脚本，只做资料包 env / smoke / evidence / backup evidence 检查。

调整后执行：

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
```

实际发布或客户试用交付前，再对本次已填 evidence 目录执行：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```
