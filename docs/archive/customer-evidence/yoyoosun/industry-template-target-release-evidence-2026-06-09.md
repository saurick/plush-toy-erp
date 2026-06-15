# Phase 10 目标环境发布证据 / Phase 10 Target Release Evidence 2026-06-09

## 结论

Phase 10 按“一步完成、不拆子阶段、真实导入只能模拟”的口径完成行业模板沉淀、QA、本地模拟验收和目标环境发布。

本次发布内容：

- 新增 `config/industry-templates/plush/templateConfig.mjs`，沉淀毛绒玩具行业模板候选配置。
- 新增 `scripts/qa/industry-template-boundaries.mjs`，守住行业模板候选边界。
- 新增 `scripts/qa/phase10-industry-template-closure.mjs` 和测试，生成 Phase 10 本地模拟闭环 evidence。
- 客户侧栏、前端默认菜单、后端内置菜单和菜单权限预设不再展示 `Phase 8` 或 `事实闭环` 这类内部工程入口；`/erp/phase8/facts` 保留为内部直达验证页面，不作为客户默认菜单。

## 边界

- 不执行真实客户数据导入。
- 不把 yoyoosun 单客户样本直接写成行业默认。
- 不新增 `tenant_id`。
- 不改 Ent schema 或 Atlas migration。
- 不改 Workflow / Fact usecase 事实规则。
- 不写 `business_records`。
- 不写库存、出货、预留、财务或其他事实表。
- 不交付拍照上传、附件服务、扫码、通用打印模板引擎、正式报表或 SaaS 能力。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| Phase 10 行业模板边界守卫 | PASS：`node scripts/qa/industry-template-boundaries.mjs` |
| Phase 10 模拟闭环测试 | PASS：`node --test scripts/qa/phase10-industry-template-closure.test.mjs` |
| Phase 10 本地模拟报告 | PASS：`node scripts/qa/phase10-industry-template-closure.mjs --out output/customers/yoyoosun/phase10-industry-template-closure-local` |
| Customer Config 边界守卫 | PASS：`node scripts/qa/customer-config-boundaries.mjs` |
| 菜单与权限专项测试 | PASS：`node --test web/src/erp/config/seedData.test.mjs web/src/erp/config/menuPermissions.test.mjs` |
| 快速 QA | PASS：`bash scripts/qa/fast.sh` |
| 前端全量测试 | PASS：`pnpm --dir web test`，共 277 个测试 |
| 前端样式 L1 回归 | PASS：`pnpm --dir web style:l1`，共 41 个场景 |
| 全量 QA | PASS：`bash scripts/qa/full.sh` |
| diff 空白检查 | PASS：`git diff --check` |

## 目标环境发布

| 项目 | 结果 |
| --- | --- |
| 目标环境 | `192.168.0.133` |
| release 包 | `/home/simon/plush-toy-erp-releases/20260609T1125-dd845a4-phase10-industry-amd64/images.tar.gz`，SHA256 `790fa265513f2f99bf2e47d39deea9e39de0d49a3ff8e07548b23a33bdaf6331` |
| migration | PASS：`sh ./migrate_online.sh --status-only`，Atlas status OK，Current Version `20260608134530`，Pending Files `0` |
| 服务端镜像 | `plush-toy-erp-server:20260609T1125-dd845a4-phase10-industry-amd64`，目标环境 image id `sha256:38f6125705baf7449ca264013c466e8b890a713c8eff98eac496d1a738bf9aad` |
| 前端镜像 | `plush-toy-erp-web:20260609T1125-dd845a4-phase10-industry-amd64`，目标环境 image id `sha256:84be5507c08501c10e0e273051c517309719854229e980a091e4b4985e7d9ef5` |
| Compose 状态 | PASS：`plush-toy-erp-server` 与 `plush-toy-erp-web-desktop` 均运行 Phase 10 tag，`web-desktop` healthy |
| 健康检查 | PASS：`/healthz=ok`、`/readyz=ready`、桌面前端 `/healthz={"status":"ok","appId":"desktop","title":"桌面后台"}` |
| 目标路由 smoke | PASS：`/erp/dashboard` HTTP 200 |
| 目标账号 RBAC | PASS：`TRIAL_ACCOUNT_PASSWORD=... TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs`，9 个 demo 账号通过 |
| 目标浏览器回归 | PASS：`TRIAL_ACCOUNT_PASSWORD=... TRIAL_BROWSER_SMOKE_BASE_URL=http://192.168.0.133:5175 TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL=http://192.168.0.133:8300/healthz pnpm --dir web smoke:trial-demo-browser`，桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个通过 |
| 发布后日志 | PASS：近 10 分钟 `app-server` / `web-desktop` 日志无 `panic` / `fatal` / `error` 命中 |
| 发布后清理 | PASS：目标机 `/` 为 98G / 22G used / 72G avail；`docker builder prune -f` 和 `docker image prune -f` 回收 0B；`docker image prune -a -f` 未执行，以保留运行镜像和相邻回滚镜像 |

## 剩余风险

- Phase 10 行业模板仍是 `candidate`，不是运行时 loader，也不是多客户验证后的正式默认。
- 客户侧栏隐藏内部工程入口不代表 Phase 8 fact usecase 被删除；内部直达验证页面仍需按权限和 URL 直达方式受控使用。
- 客户使用确认属于交付后的业务确认，不作为 Phase 10 关闭阻塞。
