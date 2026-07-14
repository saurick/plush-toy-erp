# yoyoosun Migration / Migration Runbook

## 当前口径

生产 / 低配服务器 migration 使用宿主机 `/usr/local/bin/atlas` 和 `server/deploy/compose/prod/migrate_online.sh`。不要拉起 `arigaio/atlas:*` 临时容器，也不要把 Atlas 写进业务 Compose。

## 执行前

1. 确认目标 compose 目录是 `/opt/plush-toy-erp/current/server/deploy/compose/prod` 或当前正式部署目录。
2. 确认 `.env` 的 `POSTGRES_DSN` 指向目标库，输出时必须脱敏。
3. 确认 migration 目录随 release 同步。
4. 确认 pre-migration 备份 evidence 存在。
5. 确认 `MIGRATION_LOCK_FILE` 为绝对路径，位于专用私有目录且归当前 migration 执行用户所有；生产默认为 `/run/lock/plush-toy-erp/atlas-migrate.lock`。
6. 确认停机窗口和回滚策略。
7. 正式 apply 前停止旧 `app-server` 和客户入口，确认不存在业务写入；仅 status / dry-run 可在服务运行时执行。

## 状态检查

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
sh migrate_online.sh --status-only
```

如果生产 `.env` 使用了非默认 `MIGRATION_LOCK_FILE`，在执行上述命令前单独 `export MIGRATION_LOCK_FILE=<absolute-path>`；不要为此 source 整个 `.env`。

记录：

- 执行时间。
- 操作人角色。
- 当前 version。
- pending 数量。
- 输出摘要。

## Apply

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env stop app-server web-desktop
MIGRATION_MAINTENANCE_CONFIRMED=1 sh migrate_online.sh --apply
```

脚本会拒绝没有维护确认或 `app-server` 仍运行的 apply。执行后再次运行 status，并写入 `evidence/migrations/migration-evidence-template.md` 对应字段。存在 Customer Config cutover 时，按 `02-upgrade.md` 先启动新后端、重新 publish/activate 并验证 `get_effective_session`，完成后才能恢复 Web。

## 失败处理

| 现象 | 处理 |
| --- | --- |
| Atlas 不存在 | 停止；按运维规范安装宿主机 Atlas |
| DSN 连接失败 | 停止；核对 `.env`、端口、容器状态和网络 |
| migration lock 路径 / 权限 / symlink 检查失败 | 停止；修正专用 lock 目录的 owner 和权限，不要改回共享 `/tmp` |
| migration dirty / failed | 停止业务写入；保留日志摘要；评审恢复备份或修复 migration |
| apply 后服务异常 | 保持停写；旧镜像与新 schema 不兼容，不得只换镜像。先收集 health、ready、日志和 migration status，再恢复升级前数据库备份并配套旧镜像，或执行已评审 forward-fix |

## 禁止

- 不记录完整 DSN 或密码。
- 不把失败日志中的客户业务明细原样提交。
- 不在目标服务器构建服务端或前端来“顺手修复”。
