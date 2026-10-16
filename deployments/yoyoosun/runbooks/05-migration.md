# yoyoosun 迁移 / Migration Runbook

登记目标的 migration 属于正式初始化、升级或恢复链，由执行器在目标 Atlas 串行锁下调用 `server/deploy/compose/prod/migrate_online.sh`。不复制 `/opt` 路径或在目标机另建手工 apply 路径。

## 发布前

1. 固定候选 commit、migration 序列、镜像和客户配置身份。
2. 按正式数据库合同完成生成、fresh / upgrade 审计；涉及存量转换时，用已有备份在隔离目标验证已过账事实、冻结快照、历史缺值及附件恢复。
3. 核对目标 registry 中的数据库、受控 env、Compose override、端口与串行锁。
4. 准备配套 PG 和附件恢复点，并取得停写、迁移和发布授权。

## 执行与读回

执行器依次进行 status、validate / dry-run、apply 和 status / readback。宿主机 Atlas 使用项目固定版本；不在 Compose 中启动临时 Atlas 容器，不由启动脚本自动 apply。附件外置时必须在同一维护窗口导出、逐对象校验和绑定凭证，见[附件合同](../../../server/deploy/compose/prod/README.md#附件存储与raid5)。

任一步失败均停止后续发布并保留现场。成功后核对迁移序列、业务健康、配置和适用业务 smoke；schema 不兼容时只换旧镜像不能恢复，见[回滚](03-rollback.md)。

只读预检、授权执行和证据边界统一见[首次部署](01-first-deploy.md)及[发布脚本](../../../scripts/deploy/README.md)。
