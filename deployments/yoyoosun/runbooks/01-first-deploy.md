# yoyoosun 首次部署 / First Deploy Runbook

## 前置条件

1. Release 版本、Git commit、server image tag、web image tag 已固定。
2. 镜像已在本地或 CI 按目标平台构建完成并上传到目标服务器。
3. 目标服务器已安装 Docker、Docker Compose 和宿主机 Atlas：`/usr/local/bin/atlas`。
4. 生产 `.env` 已放在受控路径，且通过 `verify-env.sh` 校验。
5. PostgreSQL 数据目录、本地备份目录和异地备份挂载已创建并具备正确权限；当前没有独立运行时附件目录。
6. 已确认回滚窗口、备份策略、客户试用限制和已知限制。

## 执行步骤

1. 生成并填写 release evidence 目录：

```bash
bash deployments/yoyoosun/scripts/collect-evidence.sh \
  --deployment-target <demo-133|customer-test-133> \
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
MIGRATION_MAINTENANCE_CONFIRMED=1 sh migrate_online.sh --apply
```

10. 全新库先使用一次性 bootstrap 创建稳定 `admin`；随后以 steady env 启动后端并保持 Web / 客户入口关闭。`demo-133` 才生成登记的模拟验收数据；`customer-test-133` 必须保持甲方干净测试基线，禁止写入 demo seed / fixture。
11. 按 `credential.contract.json` 执行目标特定凭据合同：两个 target 的 `admin` 都恢复为固定测试凭据 `adminadmin`；只有 `demo-133` 轮换合同精确列出的十个 `uat_*` 为 `12345678`。demo 必须覆盖全部 11 个账号；test 只轮换 admin，并在同一事务内证明非管理员 `id/username` 身份集合保持不变，不读取、猜测或改写其密码。正式轮换闭包必须先持有目标 mutation lock，自行生成并隔离恢复校验 operation-bound 备份，原子保留后才递增对应账号的 `auth_version`、撤销旧会话并生成脱敏回执；调用者不得传入备份路径或 hash。公开测试凭据不得由 Keychain、环境变量或临时发布输入覆盖，也不得进入服务器 steady `.env`。
12. 确认轮换完成后启动全部业务服务：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d --remove-orphans
```

13. 执行 health / ready 后，使用合同固定测试凭据运行正式 smoke。`demo-133` 的 `credential-login-matrix` 必须真实登录稳定 `admin` 与十个 `uat_*`；`customer-test-133` 只真实登录 admin，并核对非管理员身份集合未变化，禁止尝试非管理员密码。SMS 手机号仅属于 demo，且只在人工录入后校验指定账号绑定。任何适用账号失败、身份集合漂移，或已配置手机号不一致，都保持入口关闭。
14. 收集 image digest、migration status、config fingerprint、smoke report、known limitations 和 release sign-off checklist。
15. 客户试用或交付前执行 release evidence gate：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --deployment-target <demo-133|customer-test-133> \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

16. 只在客户确认范围内做客户试用交付确认；客户真实业务验收不作为本地部署步骤的隐式通过项。

## 失败处理

| 失败点                | 处理                                                               |
| --------------------- | ------------------------------------------------------------------ |
| env 校验失败          | 停止部署，修正受控 `.env`，不要修改 `.env.example` 填真实值        |
| image load 失败       | 保留输出，重新上传镜像 tar；不要在目标服务器构建                   |
| migration status 异常 | 停止 apply，先确认目标库和 migration 目录                          |
| migration apply 失败  | 保留现场和日志摘要，按 `03-rollback.md` 选择恢复备份或 forward-fix |
| smoke 失败            | 不签收，记录失败项和日志摘要，按 `07-incident-response.md` 排查    |

## Evidence 要求

- `release-evidence.md`
- `image-digests.txt`
- `migration-status.txt`
- `config-fingerprint.txt`
- `smoke-test-report.json`
- `known-limitations.md`
- `release-signoff-checklist.md`
- `acceptance-checklist.md`
