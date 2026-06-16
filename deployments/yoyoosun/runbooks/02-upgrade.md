# yoyoosun 升级 / Upgrade Runbook

## 适用范围

用于 yoyoosun 已有私有化环境从一个 release 升级到另一个 release。升级不改变部署主路径，不在目标服务器构建镜像，不执行未经审批的真实导入。

## 升级前

1. 阅读 release notes、migration diff、配置变更和 known limitations。
2. 确认停机窗口、回滚负责人和客户通知方式。
3. 记录当前 Git commit、server/web image digest、migration version 和配置指纹。
4. 执行数据库备份和必要附件目录快照。
5. 验证备份可读，至少记录 backup id、hash、大小和存储别名。
6. 校验新 `.env` 不含 placeholder，且 debug / mock / public register 保持关闭。

## 升级步骤

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env ps
sh migrate_online.sh --status-only
```

1. `docker load` 新镜像。
2. 更新受控 `.env` 中 `APP_IMAGE` 和 `WEB_IMAGE`。
3. 再次执行 `verify-env.sh`。
4. 执行 migration status；如有 pending，确认备份 evidence 后执行 apply。
5. 重启服务：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d --remove-orphans
```

6. 执行 smoke 和日志检查。
7. 写入 upgrade evidence。
8. 客户试用或交付前执行 release evidence gate：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

## 失败处理

- 业务镜像启动失败：优先回滚镜像 tag，不动数据库。
- migration apply 失败：停止业务写入，保留日志摘要，按 `03-rollback.md` 判断恢复备份或 forward-fix。
- smoke 失败但健康检查通过：保留服务，暂停客户使用确认，定位具体页面 / API。
- 配置错误：恢复上一版受控 `.env`，重新 `up -d`。

## 验收

- server `/healthz` 和 `/readyz` 通过。
- web `/healthz` 通过，关键路由打开。
- migration version 符合 release 预期。
- 登录、RBAC、关键只读页面和岗位任务入口 smoke 通过。
- evidence 只记录版本、hash、状态和脱敏摘要。
- release evidence gate 通过后才允许把本次 release 写成可继续客户试用。
