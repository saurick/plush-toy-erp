# Orb 本地开发备用环境 / Orb Development Standby

本目录为开发机准备独立的 PostgreSQL、SeaweedFS 和 Jaeger。默认开发连接继续使用共享服务器；只有显式切换配置后，日常启动才使用 Orb。正式 demo / test 发布仍走 [prod Compose](../prod/README.md)。

## 服务与数据 / Services and Data

| 服务 | 本机入口 | 持久化 |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:15432/plush_erp` | `plush-erp-dev-orb_postgres-data` |
| S3 附件 | `http://127.0.0.1:18333`，独立桶 `plush-orb-dev-files` | `plush-erp-dev-orb_attachments-data` |
| Jaeger | [查询界面](http://127.0.0.1:16687)，OTLP HTTP `127.0.0.1:14318` | `plush-erp-dev-orb_jaeger-data`，保留 7 天 |

所有发布端口绑定 loopback。三个容器分别限制 1 CPU，内存上限为 512 / 768 / 192 MiB；服务随 Orb 启动，显式停止后保持停止。现有容器、端口、Docker context 和其他项目不作修改。

私有状态位于 `~/.local/share/plush-toy-erp/orbstack/`：`compose.env`、`profiles/` 和 `profiles.json` 保存本机独立凭据与成组切换快照；`snapshot/` 保存 PG custom dump、配套附件及校验回执。目录权限为 `0700`、私有配置为 `0600`。这些文件不进入 Git 或源码包；Docker 数据卷和此目录都是恢复资产，不属于可随手清理的 `output/`。

## 查看与切换 / Inspect and Switch

命令在仓库根目录运行。已准备好的本机环境可直接查看、启动：

```bash
node scripts/local-orb.mjs status
node scripts/local-orb.mjs up
```

1. 等待当前开发及验收任务结束，再用现有入口停止本项目的前端、客户开发页和后端。切换器检查登记的前后端与辅助端口，并与启动、迁移共用操作锁；仍有任务运行时拒绝切换，不终止进程。
2. 运行 `node scripts/local-orb.mjs switch orb`。它验证配置快照与目标集群身份，成组切换数据库管理员、三类服务账号、附件与追踪配置。当前配置已有后续改动时保留现场，先审查并更新本机快照。
3. 运行 `pnpm --dir web start` 打开通用开发入口，客户业务页沿用 `pnpm --dir web start:yoyoosun`。两者仍使用正常的迁移预检、按需构建、health / ready / 登录与业务核验；存在待执行迁移时走迁移页或 `make migrate`，不会自动 apply。
4. 回到共享服务器时，在开发服务停止后运行 `node scripts/local-orb.mjs switch shared`，再启动。此操作只切连接，不会合并或反向覆盖任何业务数据。

登记目标由 `server/internal/devdbguard/development-targets.json` 同源提供给 Go 与维护脚本。Orb 使用独立 PostgreSQL system identifier，由受保护的角色配置注入固定运行版本；错端口、错库、远端集群、连接覆盖与多主机回退均不能成为本地开发目标。迁移沿用登记开发库的 `shared-dev` 操作类型及只读审计、恢复演练和显式执行门禁。

## 快照与恢复 / Snapshot and Recovery

这是一份可独立运行的开发快照，不是持续复制或自动故障转移。新写入 133 的数据不会自动进入 Orb，Orb 开发的新数据也不会自动回传。Jaeger 从本地新 Trace 开始记录，远端历史日志和 Trace 不属于业务恢复资产。

初始化应先确认源为当前登记开发库、目标为独立空 Orb 库，生成独立凭据和数据卷。通过只读备份角色执行 `pg_dump -Fc --no-owner --no-privileges --lock-wait-timeout=5s`，恢复到本地后复用 `prod/database_roles.sh reconcile` 配置角色和权限。

冻结恢复库中的附件元数据，再使用正式 `cmd/attachment-storage` 的 `backup` 从源 S3 读取不可覆盖对象，随后向本地桶 `restore`、逐对象 `verify`。源数据库与源存储保持只读；附件缺失或哈希不符时不得签发可接续开发的回执。

只有 PG 恢复、附件全量校验、迁移状态、审计、隔离端口下的实际开发启动及业务读取均通过，才表示该快照可使用。后续刷新须保留旧快照和本地独有数据，在新隔离目标完成相同验证后再替换备用配置；本脚本不提供覆盖现有本地库或自动清理数据卷的入口。数据库重建产生新的集群身份时，重新核验并生成完整配置快照，不能只修改白名单绕过校验。
