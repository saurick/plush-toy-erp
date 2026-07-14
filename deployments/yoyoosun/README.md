# 永绅 yoyoosun 私有化部署资料包 / Yoyoosun Private Deployment Package

本目录保存 yoyoosun 私有化部署的可交付资料：配置样例、Compose 样例、runbook、检查清单、发布 evidence 模板和轻量校验脚本。

它不是第二套部署主路径。当前唯一部署真源仍是：

```text
server/deploy/compose/prod
```

## 当前边界 / Current Boundaries

| 项目 | 当前口径 |
| --- | --- |
| customerCode | `yoyoosun` |
| deploymentType | private / customer-trial candidate |
| timezone | `Asia/Shanghai` |
| database | PostgreSQL |
| front-end entry | single `web-desktop` service, port `5175`; mobile roles use `/m/<role>/tasks` |
| backend | HTTP `8300`, gRPC `9300` |
| migration | host Atlas at `/usr/local/bin/atlas` through `server/deploy/compose/prod/migrate_online.sh`; private lock defaults to `/run/lock/plush-toy-erp/atlas-migrate.lock` |
| build boundary | build images locally or in CI; target server only runs `docker load`, Compose, migration and smoke |

## 目录说明 / Package Contents

| 路径 | 用途 |
| --- | --- |
| `env/` | `.env.example`、服务配置样例和必需 secret 说明，只能使用 placeholder |
| `compose/` | yoyoosun 私有化部署参考 Compose / Nginx 样例，不替代 `server/deploy/compose/prod` |
| `runbooks/` | 首次部署、升级、回滚、备份恢复、migration、导入、故障处理和日常运维 |
| `checklists/` | 部署前后、smoke、安全、备份恢复、升级、回滚和巡检清单 |
| `evidence/` | 发布、migration、备份、smoke evidence 模板；只记录 hash、版本、状态和脱敏摘要 |
| `reports/` | 本地生成的最新检查报告落点；真实报告提交前必须脱敏 |
| `scripts/` | 针对本资料包的薄脚本，只做 env 校验、smoke、evidence 收集和备份恢复检查 |

## 敏感信息规则 / Sensitive Data Rules

本目录禁止提交：

- 真实 `.env`、数据库密码、JWT secret、管理员密码、token、私钥或证书私钥。
- 数据库 dump、生产备份文件、附件原件或未加密备份。
- 客户原始 Excel / PDF / JPG / PNG 或未脱敏截图。
- 包含手机号、地址、价格、订单明细、token 或完整连接串的日志。
- 长期有效下载链接、对象存储 access key、备份加密 key。

客户原始资料与私密 manifest 的当前真源是专属 Private 仓库 `plush-toy-erp-customer-yoyoosun-private`；Product Core 当前工作树不再归档这些原件。生产 `.env`、数据库备份和签署后的正式交付文件仍应按各自安全边界放入受控存储，不进入本部署资料目录。

## 常用入口 / Common Entrypoints

- 部署总览：`runbooks/00-overview.md`
- 首次部署：`runbooks/01-first-deploy.md`
- 升级：`runbooks/02-upgrade.md`
- 回滚：`runbooks/03-rollback.md`
- 备份恢复：`runbooks/04-backup-restore.md`
- 导入执行边界：`runbooks/06-import-apply.md`
- 部署前检查：`checklists/pre-deploy-checklist.md`
- smoke 检查：`checklists/smoke-test-checklist.md`
- 安全检查：`checklists/security-checklist.md`
- 发布 evidence 模板：`evidence/releases/release-evidence-template.md`

## 校验 / Validation

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
bash deployments/yoyoosun/scripts/verify-env.sh --example
```

`deployment-package-lint` 会检查资料包必需文件、禁止文件类型、真实 secret 高风险模式和基础样例结构。
`run-backup-restore-rehearsal.sh` 用于执行真实备份恢复演练，默认把 dump 和本地 evidence 输出到 `output/`，不纳入 git。
`release-evidence-gate` 只在实际发布 / 客户试用交付前执行，检查本次 release evidence、pre-migration backup evidence、backup restore report、migration status、smoke report 和 sign-off checklist 是否已脱敏并填齐；不会读取真实 `.env`、真实备份文件或客户 raw files。

## 仍不做 / Out Of Scope

- 不新增 `tenant_id`、SaaS、多租户、license、billing 或客户工单系统。
- 不 fork 核心代码、schema、migration、usecase、RBAC、Workflow 或 Fact 规则。
- 不在目标服务器执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
- 不执行 yoyoosun 真实客户数据导入；没有审批、备份 evidence 和单独数据治理任务时，只能做 dry-run / 模拟闭环。
