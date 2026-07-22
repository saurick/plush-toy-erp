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
4. 进入已通知客户的停写维护窗口，停止旧后端和 Web；PostgreSQL、备份和 tracing 服务保持运行：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env stop app-server web-desktop
```

5. 再次确认 `docker compose ps app-server` 没有运行中的容器。执行 migration status；如有 pending，确认备份 evidence 后显式确认维护窗口并执行 apply：

```bash
MIGRATION_MAINTENANCE_CONFIRMED=1 sh migrate_online.sh --apply
```

`migrate_online.sh` 会再次检查 `app-server` 已停止；旧服务仍运行或没有维护确认时必须 fail closed。

6. 只启动新版本后端，等待 `/healthz`、`/readyz` 通过：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d app-server
```

7. 本 release 的 Customer Config hash cutover 会清空未发布系统中的旧 revision 与五类 compiled projection。开放 Web 前，必须在受信发布工作站用已审查 manifest 执行 `validate -> publish -> activate -> get_effective_session`，并让 readiness 同时核对执行报告和目标 smoke：

```bash
CUSTOMER_CONFIG_CONFIRM=ACTIVATE_YOYOOSUN_CONFIG \
CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' \
node scripts/deploy/customer-config-release-execute.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --out output/customers/yoyoosun/customer-config-release \
  --backend-url https://<target-backend> --execute --activate

node scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --require-executed --require-activated
```

执行报告必须证明 active revision 与 manifest identity 一致，`get_effective_session` 的 source 为 `active_customer_config_revision`，且页面投影非空；任一项失败都不得开放业务。

8. Customer Config 读回通过后启动只绑定受控入口的 Web 和其余服务；公网 / 客户切流仍保持关闭：

```bash
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d --remove-orphans
```

9. 若本轮创建、恢复或重建过数据库，必须在入口关闭状态下使用合同固定测试凭据重新轮换稳定 `admin` 与固定十个 demo，并撤销旧会话；普通应用升级未触碰数据库账号时也必须运行真实登录矩阵，不能复用旧 token 代替密码验证。SMS 手机号未人工录入时不阻断。
10. 执行 smoke 和日志检查；正式 smoke 必须包含 `credential-login-matrix`，稳定 `admin` 和十个 demo 全部以当前密码取得新 token。全部门禁通过后才执行公网 / 客户入口切流。
11. 写入 upgrade evidence。
12. 客户试用或交付前执行 release evidence gate：

```bash
node scripts/deploy/release-evidence-gate.mjs \
  --customer yoyoosun \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

## 失败处理

- migration 尚未 apply 时业务镜像启动失败：可恢复上一版镜像 tag；先确认数据库 migration version 未变化。
- migration 已 apply 后旧镜像不再兼容：禁止只回滚镜像。保持停写，按 `03-rollback.md` 恢复升级前数据库备份并同时恢复旧镜像，或执行已评审的 forward-fix。
- migration apply 失败：停止业务写入，保留日志摘要，按 `03-rollback.md` 判断恢复备份或 forward-fix。
- Customer Config publish / activate / effective-session 读回失败：保持 Web 停止，恢复数据库备份或 forward-fix，不得用默认配置冒充已激活客户配置。
- smoke 失败但健康检查通过：保持客户入口关闭，定位具体页面 / API。
- 配置错误：恢复上一版受控 `.env`，重新 `up -d`。

## 验收

- server `/healthz` 和 `/readyz` 通过。
- web `/healthz` 通过，关键路由打开。
- migration version 符合 release 预期。
- 登录、RBAC、关键只读页面和岗位任务入口 smoke 通过。
- evidence 只记录版本、hash、状态和脱敏摘要。
- release evidence gate 通过后才允许把本次 release 写成可继续客户试用。
