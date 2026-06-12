# yoyoosun 部署总览 / Deployment Overview

## 目标

本 runbook 汇总 yoyoosun 私有化部署的服务、目录、数据、备份和安全边界，供首次部署、升级、回滚和日常巡检前快速定位。

## 服务组成

| 服务 | 当前口径 | 说明 |
| --- | --- | --- |
| `postgres` | PostgreSQL | 业务数据库和 migration 目标 |
| `app-server` | backend HTTP `8300`, gRPC `9300` | JSON-RPC、鉴权、领域 usecase、健康检查 |
| `web-desktop` | static web `5175` | 桌面后台和 `/m/<role>/tasks` 岗位任务端统一入口 |
| `jaeger` | tracing | 低配环境可按正式方案评审后关闭或保留 |

当前唯一部署主路径仍是 `server/deploy/compose/prod`；本目录只保存 yoyoosun 交付资料、样例和 evidence 模板。

## 数据目录

| 类型 | 建议受控位置 | 是否入 Git |
| --- | --- | --- |
| PostgreSQL 数据目录 | `/data/plush-toy-erp-yoyoosun/postgres` | 否 |
| 上传附件目录 | `/data/plush-toy-erp-yoyoosun/files` | 否 |
| 生产 `.env` | `/secure/path/yoyoosun/.env` 或等价受控目录 | 否 |
| 备份文件 | `/var/backups/plush-toy-erp-yoyoosun` 或外部备份存储 | 否 |
| release evidence | `deployments/yoyoosun/evidence/releases/<date>/` | 可入库，必须脱敏 |

## 部署边界

- 本地或 CI 构建 `linux/amd64` 镜像。
- 目标服务器只执行 `docker load`、`.env` tag 切换、`migrate_online.sh`、Compose 重启和 smoke。
- Atlas migration 使用宿主机 `/usr/local/bin/atlas`，不拉起 `arigaio/atlas` 临时容器，不把 Atlas 写进业务 Compose。
- 不新增 `tenant_id`、SaaS runtime、多租户、license、billing 或客户代码 fork。
- 不执行真实客户数据导入；没有审批、备份和单独数据治理任务时，只允许 dry-run / 模拟。

## 资料边界

| 资料 | 正确位置 |
| --- | --- |
| 客户资料说明、导入 dry-run、unresolved queue | `docs/customers/yoyoosun/` |
| 客户配置草案 | `config/customers/yoyoosun/` |
| 部署 runbook、检查清单、evidence 模板 | `deployments/yoyoosun/` |
| 当前运行 Compose 主路径 | `server/deploy/compose/prod` |
| 客户 raw Excel / PDF / 图片 | `docs/customers/yoyoosun/raw-source-files/` 或受控外部存储，不能放本部署目录 |

## 常用检查

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
bash deployments/yoyoosun/scripts/verify-env.sh --example
```

真实环境 smoke、备份恢复和 migration 结果必须进入 release evidence，且只记录脱敏摘要、hash、版本和状态。
