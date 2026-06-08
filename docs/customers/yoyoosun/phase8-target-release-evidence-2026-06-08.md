Doc Type / 文档类型: Customer Target Release Evidence / 客户目标环境发布证据
Status / 状态: Target Release Smoke Passed, Customer Acceptance Pending / 目标环境发布 smoke 通过，客户验收待完成
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否

# Phase 8 目标环境发布证据 2026-06-08 / Phase 8 Target Release Evidence 2026-06-08

本文记录 2026-06-08 将 Phase 8 本地最小事实闭环发布到当前目标环境的非敏感 evidence。本文不是 runtime、schema、migration、RBAC 或客户签收真源；真实运行状态仍以目标环境、当前代码、migration 状态和验收记录为准。

## 1. 结论 / Conclusion

Phase 8 已发布到当前目标环境，Atlas migration 已执行到最新版本，服务端、前端、只读 Phase 8 路由 smoke、目标环境试用账号 RBAC 核对和登录态 Phase 8 只读 JSON-RPC smoke 已通过。

本次发布不等于客户最终验收完成。当前只完成了目标环境发布、权限核对和登录态只读 API smoke；未执行客户业务确认、受控写入验收、真实客户数据导入、完整打印、报表、发票明细、收付款核销、对账单、物流退货、并发锁升级或自动派生。

## 2. 发布摘要 / Release Summary

| 项目 | 记录 |
| --- | --- |
| Release Date | 2026-06-08 22:53 CST |
| Target | 当前 Compose 目标环境，内网主机 `192.168.0.133` |
| Commit | `a490b92` |
| Server Image | `plush-toy-erp-server:20260608T2230-a490b92-phase8-amd64` |
| Web Image | `plush-toy-erp-web:20260608T2230-a490b92-phase8-amd64` |
| Compose Path | `/opt/plush-toy-erp/current/server/deploy/compose/prod` |
| Release Dir | `/opt/plush-toy-erp/releases/20260608T2230-a490b92-phase8-amd64` |
| Migration | `20260530161152 -> 20260608134530`，pending 0 |
| Post-deploy Backup | `/opt/plush-toy-erp/releases/20260608T2230-a490b92-phase8-amd64/plush_erp-postdeploy-20260608T2230-a490b92-phase8-amd64.dump` |
| Trial Accounts | 9 个 `demo_*` 角色试用账号已创建 / 更新；未创建 `demo_debug`，未分配 `debug_operator` |

## 3. 已执行 / Executed

1. 本地使用 `docker buildx` 构建 `linux/amd64` 服务端和前端镜像。
2. 镜像包上传到目标主机 release 目录。
3. 同步当前 Atlas migration 目录到目标主机。
4. 目标主机执行 `docker load`，未在服务器上执行 Docker build、pnpm build、go build 或 make build。
5. 目标主机使用宿主机 `/usr/local/bin/atlas` 执行 `migrate_online.sh --apply`。
6. 目标主机备份 `.env` 后切换 `APP_IMAGE` 和 `WEB_IMAGE`。
7. 只重建 `app-server` 和 `web-desktop`，未重建 PostgreSQL 或 Jaeger。
8. 发布后生成 post-deploy 逻辑备份。
9. 使用受控 seed 命令在目标数据库创建 / 更新 9 个角色试用账号，密码仅通过本地环境变量传入，不写入文档。
10. 执行目标环境试用账号 RBAC 核对和 `demo_boss` 登录态 Phase 8 只读 API smoke。

## 4. 验证 / Verification

| 验证项 | 结果 |
| --- | --- |
| migration status | OK，Current Version `20260608134530`，Pending Files `0` |
| app-server image | `plush-toy-erp-server:20260608T2230-a490b92-phase8-amd64` |
| web-desktop image | `plush-toy-erp-web:20260608T2230-a490b92-phase8-amd64` |
| container status | `app-server` running，`web-desktop` healthy |
| `/healthz` | `ok` |
| `/readyz` | `ready` |
| `/erp/phase8/facts` | HTTP 200 |
| `phase8` JSON-RPC unauth smoke | 返回 `40302 未登录`，`unknownUrl=false` |
| role demo admin seed | OK，9 个账号；`include_debug=false`；无 `demo_debug` |
| trial account RBAC | OK，9 个 demo 账号角色、岗位权限、debug 权限、super admin 和 disabled 边界通过 |
| `phase8` JSON-RPC auth smoke | OK，`demo_boss` 登录后 `phase8.list_finance_facts` 返回 code `0`，`total=0`，确认登录态只读 handler 和权限生效 |
| server logs | 发布后近 5 分钟未发现 `panic` / `fatal` |
| disk after release | `/` 约 73G 可用，约 22% 使用率 |

## 5. 未完成 / Not Completed

| 项目 | 原因 / 结论 |
| --- | --- |
| 客户正式验收 | 仍需客户或业务负责人按验收手册确认页面、权限、边界和剩余功能范围 |
| 受控写入验收 | 本次未写生产、委外、出货、预留或财务事实 |
| pre-migration 备份 evidence | 本次执行前未找到并记录明确 pre-migration 备份 evidence；已补 post-deploy 逻辑备份作为当前状态恢复点 |
| 镜像清理 | 为保留上一版回滚镜像且本次可回收空间很小，未执行 `docker image prune -a -f` |

## 6. 结论状态 / Status

| 对象 | 状态 |
| --- | --- |
| CAP-019 到 CAP-024 | Target Deployed / Acceptance Pending |
| CAP-026 私有化部署包 | Target Release Executed / Evidence Captured |
| CAP-027 客户验收体系 | Login Smoke Passed / Customer Acceptance Pending |

禁止把本 evidence 写成 `Delivery Ready` 或客户已签收。下一步应按 `phase8-target-release-acceptance.md` 做客户业务确认；如需受控写入验收，必须先准备模拟数据、冲正方案和客户授权。
