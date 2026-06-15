# Phase 11 目标环境发布证据 2026-06-09 / Phase 11 Target Release Evidence 2026-06-09

- 文档类型：客户发布证据 / Customer Release Evidence
- 状态：已完成 / Completed
- 作用域：Phase 11 多客户私有化复制模板、边界守卫和模拟闭环发布
- 不代表：真实客户数据导入、客户已签收、SaaS、多租户、license、billing 或行业模板已成为 runtime 默认

## 发布内容

本次 Phase 11 仅发布：

- 私有化客户包模板候选。
- Phase 11 边界守卫。
- Phase 11 本地模拟闭环脚本。
- 对应文档、台账和 QA 接线。

不发布 schema / migration / RBAC / Workflow / Fact 语义变更。

## 本地验证

本地已通过：

```bash
node scripts/qa/private-deployment-boundaries.mjs
node --test scripts/qa/phase11-private-deployment-closure.test.mjs
node scripts/qa/phase11-private-deployment-closure.mjs --out output/customers/yoyoosun/phase11-private-deployment-closure-local
bash scripts/qa/fast.sh
bash scripts/qa/full.sh
```

`phase11-private-deployment-closure.mjs` 只生成本地 evidence，不连接数据库、不调用后端、不创建真实客户目录、不执行真实导入。

本地构建：

```text
plush-toy-erp-server:20260609T1320-phase11-private-amd64
sha256:12c894b407971a504c0a784bd347285458eb34fdfeca2574608b919986f6a320

plush-toy-erp-web:20260609T1320-phase11-private-amd64
sha256:a9929b20899a1825e0e7186af88dff256dc1a572cba2706482cddde1c974fb9e
```

Phase 11 只改文档、QA 和模板候选，运行时产物与 Phase 10 等价，因此镜像 ID 复用上一版已验证 runtime 产物。

## 目标环境验证

目标环境：`192.168.0.133`

发布包：

```text
/home/simon/plush-toy-erp-releases/20260609T1320-phase11-private-amd64/images.tar.gz
```

Compose 镜像：

```text
APP_IMAGE=plush-toy-erp-server:20260609T1320-phase11-private-amd64
WEB_IMAGE=plush-toy-erp-web:20260609T1320-phase11-private-amd64
```

目标环境 migration status：

```text
Migration Status: OK
Current Version: 20260608134530
Next Version: Already at latest version
Pending Files: 0
```

目标环境已通过：

```bash
curl -fsS http://192.168.0.133:8300/healthz
curl -fsS http://192.168.0.133:8300/readyz
curl -fsS http://192.168.0.133:5175/healthz
curl -fsSI http://192.168.0.133:5175/erp/dashboard
TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs
TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_BROWSER_SMOKE_BASE_URL=http://192.168.0.133:5175 TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL=http://192.168.0.133:8300/healthz pnpm --dir web smoke:trial-demo-browser
```

结果：

- `/healthz=ok`
- `/readyz=ready`
- 桌面前端 `/healthz` 返回 `{"status":"ok","appId":"desktop","title":"桌面后台"}`
- `/erp/dashboard` HTTP 200
- 试用账号 RBAC 核对通过 9 个 demo 账号
- 浏览器 smoke 通过桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个
- 目标容器运行 `plush-toy-erp-server:20260609T1320-phase11-private-amd64` 和 `plush-toy-erp-web:20260609T1320-phase11-private-amd64`
- 近 10 分钟 server logs 无 `panic|fatal|error`

发布后清理：

```text
df -h /: 98G total, 23G used, 71G available, 24%
docker system df: Images 10.57GB, reclaimable 0B
docker builder prune -f: 0B
docker image prune -f: 0B
```

为保留当前运行镜像和上一版回滚镜像，本轮未执行 `docker image prune -a -f`。

## 边界

- `SIM-PRIVATE-DEPLOYMENT` 只用于本地 evidence，不创建正式客户目录。
- 真实客户数据导入仍不可执行；如遇真实导入需求，只能先本地模拟并另开数据治理评审。
- 目标服务器只加载本地已构建镜像，不执行构建命令。
- 本轮未改 schema、migration、RBAC、WorkflowUsecase、Fact usecase、客户菜单 runtime loader 或真实导入 loader 写库语义。
