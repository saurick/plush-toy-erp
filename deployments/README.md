# 客户私有化部署资料 / Customer Private Deployments

本目录保存真实客户私有化实例的运行合同、配置差异、运维适配、脱敏 runbook、检查清单和 evidence。Compose 运行定义统一维护在：

```text
server/deploy/compose/prod
```

## 当前目录

| 路径 | 当前用途 |
| --- | --- |
| `yoyoosun/` | 当前真实客户的运行与凭据合同、env 和反向代理示例、运维适配、runbook、checklist 与 evidence |

通用发布、smoke、采证和备份恢复执行逻辑统一放在 [`scripts/deploy/`](../scripts/deploy/README.md)。客户目录不复制完整 Compose，也不提供没有运行消费者的服务端或前端配置样例；确有差异时只增加现有 env 无法表达的必要 override。

资料包 lint 在 `evidence/`、`reports/` 之外按内容识别 Compose，文件改名或换目录仍会检查。含顶层 `services`、`include` 或根层合并的配置，解析失败或重复键均会阻断，错误只报告文件和位置；YAML / JSON 扩展名的配置也会检查语法。普通文档、脚本和 Nginx 配置不作为 Compose 校验，记录目录保留原有 evidence。

必要 override 支持标准 YAML 类型、锚点、合并以及 Compose 的 `!reset` / `!override` 标签；实际合并语义由 Docker Compose 执行。配置只允许覆盖正式 Compose 已有服务的日志、资源、环境、挂载等设置；服务的 `image`、`build`、`extends`、`provider` 和顶层 `include` 留在正式运行定义，镜像通过主 Compose 的 env 变量指定。

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
pnpm --dir web install --frozen-lockfile
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
```

真实发布签核仍应对当次 evidence 目录执行项目 release evidence gate；模板目录本身不生成 release evidence。
