# yoyoosun 首次部署 / First Deploy Runbook

## 前置条件

1. Release 版本、Git commit、server image tag、web image tag 已固定。
2. 镜像已在本地或 CI 按目标平台构建完成并上传到目标服务器。
3. 目标服务器已安装 Docker、Docker Compose 和宿主机 Atlas：`/usr/local/bin/atlas`。
4. 生产 `.env` 已放在受控路径，且通过 `verify-env.sh` 校验。
5. 数据目录、备份目录和附件目录已创建并具备正确权限。
6. 已确认回滚窗口、备份策略、客户试用限制和已知限制。

## 执行步骤

1. 生成并填写 release evidence 目录：

```bash
bash deployments/yoyoosun/scripts/collect-evidence.sh \
  --release-version <release-version> \
  --output deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

2. 记录 release 基本信息到 `evidence/releases/<date>/release-evidence.md`。
3. 在目标服务器执行 `docker load` 导入本地构建好的镜像。
4. 同步 `server/deploy/compose/prod`、migration 目录和必要配置样例。
5. 按受控 `.env` 更新 `APP_IMAGE`、`WEB_IMAGE` 和端口 / 数据目录覆盖项。
6. 执行 env 校验：

```bash
bash deployments/yoyoosun/scripts/verify-env.sh --env-file /secure/path/yoyoosun/.env
```

7. 启动 PostgreSQL 和依赖服务：

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d postgres jaeger
```

8. 执行 migration status，并记录脱敏输出：

```bash
sh migrate_online.sh --status-only
```

9. 已完成 pre-migration 备份并填写 `backup-evidence.md` 后，再执行 migration apply：

```bash
sh migrate_online.sh --apply
```

10. 启动业务服务：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d --remove-orphans
```

11. 执行健康检查、登录 / RBAC smoke 和关键页面 smoke。
12. 收集 image digest、migration status、config fingerprint、smoke report、known limitations 和 release sign-off checklist。
13. 客户试用或交付前执行 release evidence gate：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

14. 只在客户确认范围内做客户试用交付确认；客户真实业务验收不作为本地部署步骤的隐式通过项。

## 失败处理

| 失败点 | 处理 |
| --- | --- |
| env 校验失败 | 停止部署，修正受控 `.env`，不要修改 `.env.example` 填真实值 |
| image load 失败 | 保留输出，重新上传镜像 tar；不要在目标服务器构建 |
| migration status 异常 | 停止 apply，先确认目标库和 migration 目录 |
| migration apply 失败 | 保留现场和日志摘要，按 `03-rollback.md` 选择恢复备份或 forward-fix |
| smoke 失败 | 不签收，记录失败项和日志摘要，按 `07-incident-response.md` 排查 |

## Evidence 要求

- `release-evidence.md`
- `image-digests.txt`
- `migration-status.txt`
- `config-fingerprint.txt`
- `smoke-test-report.json`
- `known-limitations.md`
- `release-signoff-checklist.md`
- `acceptance-checklist.md`
