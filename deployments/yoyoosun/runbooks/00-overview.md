# yoyoosun 部署总览 / Deployment Overview

本目录是 yoyoosun 的交付操作说明，不是第二套部署实现。唯一运行入口为 `server/deploy/compose/prod`，主机、目录、数据库、端口和公网入口只取 [`deployment-targets.json`](../../../scripts/deploy/deployment-targets.json)。

| 场景 | 阅读入口 |
| --- | --- |
| 环境划分、首次上线和检查清单 | [首次部署](01-first-deploy.md) |
| 固定版本升级 | [升级](02-upgrade.md) |
| 代码回滚及恢复决策 | [回滚](03-rollback.md) |
| PG 与 S3 附件成套恢复 | [备份恢复](04-backup-restore.md) |
| 迁移与存量升级 | [迁移](05-migration.md) |
| 故障处置 | [事故响应](07-incident-response.md) |
| 健康、告警和保留 | [日常运维](08-daily-ops.md) |

`demo-133` 用于项目方模拟，`customer-test-133` 用于甲方测试及预发布验收，`production-133` 对应正式 `erp.yoyoosun.net`。生产仓库定义不代表服务器已启用；普通发布默认只选择 demo/test，生产必须显式选择。

本地 / CI 构建一次不可变制品，目标机仅校验、加载、迁移、启动和读回。数据库、附件 bucket、凭据、备份及回滚点按环境隔离。真实客户原件仍在客户 Private 仓库，部署代码和普通验证不依赖原件。
