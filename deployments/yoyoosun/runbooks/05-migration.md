# yoyoosun Migration / Migration Runbook

## 当前口径

生产 / 低配服务器 migration 使用宿主机 `/usr/local/bin/atlas` 和 `server/deploy/compose/prod/migrate_online.sh`。不要拉起 `arigaio/atlas:*` 临时容器，也不要把 Atlas 写进业务 Compose。

## 执行前

1. 确认目标 compose 目录是 `/opt/plush-toy-erp/current/server/deploy/compose/prod` 或当前正式部署目录。
2. 确认 `.env` 的 `POSTGRES_DSN` 指向目标库，输出时必须脱敏。
3. 确认 migration 目录随 release 同步。
4. 确认 pre-migration 备份 evidence 存在。
5. 确认停机窗口和回滚策略。

## 状态检查

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
sh migrate_online.sh --status-only
```

记录：

- 执行时间。
- 操作人角色。
- 当前 version。
- pending 数量。
- 输出摘要。

## Apply

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
sh migrate_online.sh --apply
```

执行后再次运行 status，并写入 `evidence/migrations/migration-evidence-template.md` 对应字段。

## 失败处理

| 现象 | 处理 |
| --- | --- |
| Atlas 不存在 | 停止；按运维规范安装宿主机 Atlas |
| DSN 连接失败 | 停止；核对 `.env`、端口、容器状态和网络 |
| migration dirty / failed | 停止业务写入；保留日志摘要；评审恢复备份或修复 migration |
| apply 后服务异常 | 先收集 health、ready、日志和 migration status，再决定回滚或 forward-fix |

## 禁止

- 不记录完整 DSN 或密码。
- 不把失败日志中的客户业务明细原样提交。
- 不在目标服务器构建服务端或前端来“顺手修复”。
