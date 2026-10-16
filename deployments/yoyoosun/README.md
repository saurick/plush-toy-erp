# yoyoosun 私有化部署 / Private Deployment

本目录只保存永绅交付所需的操作说明、无凭据样例和脱敏证据。唯一 Compose 为 `server/deploy/compose/prod`，唯一目标身份为 [`scripts/deploy/deployment-targets.json`](../../scripts/deploy/deployment-targets.json)，通用执行逻辑放在 `scripts/deploy`。

## 环境

| 目标 | 地址 | 用途 |
| --- | --- | --- |
| `demo-133` | `demo.yoyoosun.net` | 模拟、演练和培训 |
| `customer-test-133` | `test.yoyoosun.net` | 甲方测试与预发布验收，普通升级保留数据 |
| `production-133` | `erp.yoyoosun.net` | 正式业务，独立数据与凭据；仓库支持不代表已经部署 |

默认部署只选择 demo/test。生产必须显式选择，不使用固定测试密码、demo seed 或测试数据重建；`admin.yoyoosun.net` 不属于任何部署目标。测试通过的发布包原样推广，服务器不重新构建。

## 按任务阅读

| 任务 | 入口 |
| --- | --- |
| 首次上线与准备清单 | [首次部署](runbooks/01-first-deploy.md) |
| 升级、回滚和故障 | [运行说明](runbooks/00-overview.md) |
| 备份、附件和恢复 | [备份恢复](runbooks/04-backup-restore.md)、[systemd 安装](systemd/README.md) |
| 凭据与样例 | [必需秘密](env/secrets.required.md)、`env/.env.example`、`env/backup.env.example`、`env/sms-provider.env.example` |
| 客户 env、凭据和公网切流适配 | [运维适配](scripts/README.md) |
| 发布证据与客户验收边界 | [证据说明](evidence/README.md) |
| 固定制品、操作执行器、smoke 与采证 | [仓库部署脚本](../../scripts/deploy/README.md) |

## 仓库检查

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
bash deployments/yoyoosun/scripts/verify-env.sh --example
```

PG 只保存附件元数据，S3 文件必须与 PG 成套备份和恢复。真实 env、密钥、dump、附件和客户原件不入 Git；客户原件进入 `plush-toy-erp-customer-yoyoosun-private`。本目录不派生 SaaS、多租户、license 或客户代码 fork，也不开放真实客户数据导入。
