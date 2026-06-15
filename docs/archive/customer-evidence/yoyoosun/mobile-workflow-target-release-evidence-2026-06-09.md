# Phase 9 目标环境发布证据 / Phase 9 Target Release Evidence 2026-06-09

- 文档类型：客户目标环境发布证据
- 客户 key：`yoyoosun`
- 发布日期：2026-06-09
- 目标环境：`192.168.0.133`
- Compose 真源：`/opt/plush-toy-erp/current/server/deploy/compose/prod`

## 1. 发布范围

本次 Phase 9 一次性完成岗位任务端与岗位协同的目标环境发布和内部模拟闭环，不拆任何字母子阶段。

| 项目 | 结果 |
| --- | --- |
| Web 镜像 | `plush-toy-erp-web:20260609T1053-9173b13-phase9-mobile-amd64` |
| Server 镜像 | 继续使用 `plush-toy-erp-server:20260608T2345-phase8-closure-amd64` |
| Release 目录 | `/opt/plush-toy-erp/releases/20260609T1053-9173b13-phase9-mobile-amd64` |
| `.env` 备份 | `/opt/plush-toy-erp/releases/20260609T1053-9173b13-phase9-mobile-amd64/env.before-phase9-mobile` |
| Migration | 未执行；本轮不改 schema、migration 或 server runtime |

本次前端发布包含：

- 岗位任务端详情页支持现场留痕、最近动作、保存 evidence 和异常报告展示。
- 岗位任务端完成 / 催办动作会把模拟现场留痕写入 workflow task update payload。
- `/m/<role>/guide` 兼容入口修正为绝对跳转到 `/m/<role>/tasks`，避免旧 wildcard 形成 `tasks/tasks` 循环。
- `smoke:mobile-auth-login-route` 默认切换到当前生产单端口 `/m/<role>/tasks` 主路径，旧多实例入口仅保留显式兼容开关。
- 新增 `scripts/qa/phase9-simulated-mobile-closure.mjs`，只创建和更新显式模拟 workflow 任务，不执行真实导入或事实过账。

## 2. 本地验证

| 命令 | 结果 |
| --- | --- |
| `node --test web/src/erp/utils/mobileTaskView.test.mjs` | 通过，18 项 |
| `node --test scripts/qa/phase9-simulated-mobile-closure.test.mjs` | 通过，4 项 |
| `node scripts/qa/phase9-simulated-mobile-closure.mjs --out /tmp/phase9-sim-report` | 通过，只生成报告 |
| `pnpm --dir web lint` | 通过 |
| `pnpm --dir web css` | 通过 |
| `pnpm --dir web test` | 通过，277 项 |
| `bash scripts/qa/fast.sh` | 通过 |
| `pnpm --dir web style:l1` | 通过，41 个场景 |
| `TRIAL_ACCOUNT_PASSWORD=12345678 node scripts/qa/trial-account-rbac.mjs` | 通过，9 个 demo 账号 |
| `TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route` | 通过，8 个岗位任务端角色 |
| `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS PHASE9_SIM_PASSWORD=12345678 node scripts/qa/phase9-simulated-mobile-closure.mjs --apply --backend-url http://127.0.0.1:8300 --run-id LOCAL-20260609-PHASE9-V3 --out output/customers/yoyoosun/phase9-simulated-mobile-closure-local` | 通过，本地仅模拟 workflow 闭环 |

浏览器级回归：

- 使用 Codex in-app Browser 打开 `http://127.0.0.1:5175/m/warehouse/guide`。
- 已确认运行时跳转到 `/m/warehouse/tasks`，没有进入 `tasks/tasks` 循环。
- 已确认岗位任务端页面可渲染 Phase 9 模拟出货放行异常任务。

## 3. 目标环境部署与验证

| 检查项 | 结果 |
| --- | --- |
| `docker compose ps` | `plush-toy-erp-web-desktop` 使用 Phase 9 Web 镜像并为 `healthy`；`plush-toy-erp-server` 继续使用 Phase 8 server 镜像 |
| `curl http://192.168.0.133:5175/healthz` | `{"status":"ok","appId":"desktop","title":"桌面后台"}` |
| `curl http://192.168.0.133:8300/healthz` | `ok` |
| `curl http://192.168.0.133:8300/readyz` | `ready` |
| `curl -I http://192.168.0.133:5175/m/warehouse/tasks` | `HTTP/1.1 200 OK` |
| `curl -I http://192.168.0.133:5175/m/warehouse/guide` | `HTTP/1.1 200 OK` |
| `MOBILE_AUTH_SMOKE_BASE_URL=http://192.168.0.133:5175 MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route` | 通过，目标前端仓库岗位任务端主路径 |
| `TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` | 通过，9 个 demo 账号 |
| `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS PHASE9_SIM_PASSWORD=12345678 node scripts/qa/phase9-simulated-mobile-closure.mjs --apply --backend-url http://192.168.0.133:8300 --run-id TARGET-20260609-PHASE9 --out output/customers/yoyoosun/phase9-simulated-mobile-closure-target` | 通过，目标环境仅模拟 workflow 闭环 |
| `docker compose logs --since 10m app-server web-desktop | grep -Ei "panic|fatal|error"` | 无命中 |

## 4. 目标机清理记录

| 项目 | 清理前 | 清理后 |
| --- | --- | --- |
| `/` 磁盘 | `98G total / 21G used / 72G avail / 23%` | `98G total / 21G used / 72G avail / 23%` |
| Docker images | `20 total / 19 active / 10.58GB / 36.26MB reclaimable` | `20 total / 19 active / 10.58GB / 36.26MB reclaimable` |
| Build cache | `0B` | `0B` |

已执行：

```bash
docker builder prune -f
docker image prune -f
```

本次未执行 `docker image prune -a -f`，原因是目标机磁盘空间充足、可回收空间极小，且需要保留当前运行镜像和相邻项目回滚镜像。

## 5. 边界和剩余项

- 本次 Phase 9 只关闭“岗位任务端 + workflow 模拟协同闭环”，不代表客户已签收。
- 本次不执行真实客户数据导入；如果遇到真实数据导入需求，只能先本地模拟并重新评审。
- 本次不新增 schema / migration，不改 server fact usecase。
- 本次不写 `business_records`。
- 本次不写生产、出货、库存、预留、财务、发票、收付款或对账事实。
- 本次的现场留痕是 workflow payload 中的 evidence 文本 / refs；不代表已经交付对象存储、拍照上传、附件管理或扫码能力。
- 客户使用确认、真实人员账号确认、附件上传服务、扫码、打印、报表、核销和行业模板沉淀进入后续任务。
