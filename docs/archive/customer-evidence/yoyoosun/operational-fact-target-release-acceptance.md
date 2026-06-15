Doc Type / 文档类型: Customer Target Release And Internal Simulated Acceptance Runbook / 客户目标环境发布与内部模拟验收手册
Status / 状态: Phase 8 Internal Closure Passed / Phase 8 内部闭环已通过
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否

# Phase 8 目标环境发布与内部模拟验收 / Phase 8 Target Release And Internal Simulated Acceptance

本文用于把 Phase 8 本地最小事实闭环推进到永绅 yoyoosun 目标环境发布、migration、smoke、内部模拟事实验收和 evidence 记录。本文不是部署脚本、runtime、schema、migration、RBAC 或客户签收真源；真实运行状态仍以目标环境、`server/deploy/compose/prod`、当前代码、migration 状态和验收记录为准。

本文禁止记录真实密码、token、短信验证码、数据库 DSN、私钥、客户真实敏感账号、完整生产地址或备份文件密钥。所有敏感值只通过本地 shell 环境变量、目标服务器 `.env` 或受控运维渠道传递。

## 1. 结论 / Conclusion

Phase 8 下一步不是继续扩大功能，而是先完成目标环境发布与内部模拟事实闭环。

2026-06-08 已按 `operational-fact-target-release-evidence-2026-06-08.md` 完成目标环境发布、试用账号 RBAC、登录态只读 smoke 和内部模拟事实写入闭环。客户使用确认属于交付后的业务确认，不作为 Phase 8 完成阻塞；仍禁止写成客户已签收、真实客户数据已导入或完整业务交付。

## 2. 范围 / Scope

本 runbook 覆盖：

| 范围 | 覆盖内容 |
| --- | --- |
| 发布准备 | 本地 / CI 构建镜像、目标服务器只 `docker load`、Compose 配置检查 |
| migration | 使用目标宿主机 `/usr/local/bin/atlas` 和 `migrate_online.sh` 执行状态检查与 apply |
| 健康检查 | `/healthz`、`/readyz`、Compose 状态、容器日志 |
| Phase 8 页面验收 | `/erp/phase8/facts` 五个事实页签加载、权限、空态或数据态 |
| 内部模拟事实验收 | 使用显式 `SIM-YOYOOSUN-OPFACT` 模拟主数据和 QA 脚本覆盖五条事实链 |
| 事实边界验收 | 确认 `shipping_released != shipped`，Workflow 不写库存、出货或财务事实 |
| Evidence | 记录非敏感命令结果、提交版本、镜像标签、migration 状态、验收结论和剩余问题 |

本 runbook 不覆盖：

1. 真实客户数据导入。
2. 完整打印、报表、发票明细、收付款核销、对账单、物流退货。
3. 并发锁升级、可用量 read model、自动预留或自动派生。
4. 新增 schema、migration、runtime API 或 UI 功能。
5. 把客户样本、模拟数据或本地 dev evidence 写成 Product Core 规则。
6. 绕过 `Phase8Usecase` 直接写库存、出货、财务或预留事实表。

## 3. 前置条件 / Preconditions

执行前必须确认：

1. 发布版本包含 Phase 8 本地最小事实闭环提交，至少包含 `production_facts`、`outsourcing_facts`、`shipments`、`shipment_items`、`stock_reservations` 和 `finance_facts` migration。
2. 本地或 CI 已通过发布前 QA；如果本轮代码没有变化，可引用最近一次 pre-push / CI evidence，但必须记录提交号。
3. 服务端和前端镜像已在本地开发机或 CI 构建完成，目标服务器不执行 `docker build`、`pnpm build`、`go build` 或 `make build_server`。
4. 目标服务器有可用 pre-migration 备份 evidence 和回滚计划；至少记录备份时间、备份位置代号和恢复责任人，不记录密钥或 DSN。缺少 pre-migration 备份 evidence 时，不得执行 `migrate_online.sh --apply`。
5. 目标服务器已安装 `/usr/local/bin/atlas`，并能通过宿主机端口访问 PostgreSQL。
6. 目标 Compose `.env` 已替换 `APP_IMAGE`、`WEB_IMAGE`、`POSTGRES_DSN`、`APP_JWT_SECRET` 等占位，不保留默认密钥。
7. 目标试用账号、权限和临时密码已通过授权渠道准备；普通业务账号不使用 `is_super_admin=true`，不分配 `debug_operator`。
8. 如需写入验收数据，只能使用显式标记的模拟数据；真实客户数据不可作为 Phase 8 写入验收输入。

## 4. 发布步骤 / Release Steps

### 4.1 本地发布前检查

```bash
cd /Users/simon/projects/plush-toy-erp
git status -sb
git rev-parse --short HEAD
bash scripts/qa/full.sh
```

通过标准：

- 工作区没有未提交的发布改动。
- QA 全部通过。
- 记录本次发布提交号。

如果只做目标环境发布、不改代码，也可以引用最近一次已通过的 pre-push / CI evidence，但必须记录其提交号和执行时间。

### 4.2 本地或 CI 构建镜像

```bash
cd /Users/simon/projects/plush-toy-erp
docker build -f server/Dockerfile -t plush-toy-erp-server:<release-tag> .
docker build -f web/Dockerfile -t plush-toy-erp-web:<release-tag> .
```

目标服务器配置较低，只接收构建好的镜像包：

```bash
docker save plush-toy-erp-server:<release-tag> -o output/release/plush-toy-erp-server-<release-tag>.tar
docker save plush-toy-erp-web:<release-tag> -o output/release/plush-toy-erp-web-<release-tag>.tar
```

`output/release/` 是本地发布产物目录，不纳入 git。

### 4.3 目标服务器发布前快照和备份 evidence

在目标服务器记录非敏感状态：

```bash
df -h /
docker system df
docker ps --format '{{.Names}} {{.Status}} {{.Image}}'
```

通过标准：

- 根分区有足够空间加载新镜像。
- 当前容器状态清晰。
- pre-migration 备份 evidence 已记录到受控交付记录，且可追溯备份时间、位置代号和恢复责任人。
- 不执行 `docker system prune --volumes`、`docker volume prune`，不删除 `/data`、数据库目录、compose `.env`、上传目录或证书目录。

### 4.4 加载镜像和更新 Compose

在目标服务器执行：

```bash
docker load -i /path/to/plush-toy-erp-server-<release-tag>.tar
docker load -i /path/to/plush-toy-erp-web-<release-tag>.tar

cd /opt/plush-toy-erp/current/server/deploy/compose/prod
docker compose -f compose.yml config
```

确认 `.env` 中：

```text
APP_IMAGE=plush-toy-erp-server:<release-tag>
WEB_IMAGE=plush-toy-erp-web:<release-tag>
ERP_DEBUG_ENV=prod
ERP_DEBUG_SEED_ENABLED=false
ERP_DEBUG_CLEANUP_ENABLED=false
```

### 4.5 执行 migration

目标服务器只使用宿主机 Atlas：

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
sh migrate_online.sh --status-only
sh migrate_online.sh --apply
sh migrate_online.sh --status-only
```

通过标准：

- apply 前已确认 pre-migration 备份 evidence 存在。
- apply 前能看到待执行 migration。
- apply 后 pending 为 0 或等价成功状态。
- 不使用 `arigaio/atlas:*` 临时容器。
- 不把 Atlas 写入业务 Compose。

### 4.6 重启服务和健康检查

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
curl -fsS http://127.0.0.1:8300/healthz
curl -fsS http://127.0.0.1:8300/readyz
```

通过标准：

- `app-server`、`web-desktop`、`postgres` 处于正常运行状态。
- `/healthz` 返回 ok。
- `/readyz` 返回 ok。

## 5. 内部模拟验收步骤 / Internal Simulated Acceptance Steps

### 5.1 只读页面验收

登录目标前端，访问：

```text
/erp/phase8/facts
```

检查：

| 页签 | 只读验收 |
| --- | --- |
| 生产事实 | 页签加载，列表请求成功，空态或数据态可读 |
| 委外事实 | 页签加载，列表请求成功，状态文案不把结算写成委外库存事实 |
| 出货事实 | 页签加载，列表请求成功，UI 区分放行和已发货 |
| 库存预留 | 页签加载，列表请求成功，文案不把预留写成库存流水 |
| 财务事实 | 页签加载，列表请求成功，不从放行自动派生应收或开票 |

只读验收不创建、过账、发货、释放、消耗、结清或取消任何事实。

### 5.2 权限和菜单验收

检查：

1. 客户侧栏、前端默认菜单和后端内置菜单不展示 `Phase 8` 或 `事实闭环` 入口。
2. 内部直达 `/erp/phase8/facts` 仍必须受后端 JSON-RPC / RBAC 保护，不能把菜单隐藏当安全边界。
3. 无权限账号不能通过直接 URL 执行业务动作。
4. 普通试用账号没有 `debug.*` 权限。
5. `demo_admin` 或等价系统管理员账号不冒充业务角色完成事实动作。

### 5.3 内部受控模拟写入验收

写入验收只使用显式模拟数据。只有同时满足以下条件才允许：

1. 数据编号、备注或 evidence 明确标记为 simulated / trial。
2. 已准备可回滚或可冲正方案。
3. 验收人员清楚写入会影响库存余额、预留状态或财务事实状态。

Phase 8 推荐统一使用脚本执行，不手工拼 API：

```bash
PHASE8_SIM_CONFIRM=APPLY_SIMULATED_PHASE8_FACTS \
PHASE8_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/phase8-simulated-fact-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --warehouse-id 1 \
    --run-id target-yyyymmdd-closure \
    --out output/customers/yoyoosun/phase8-simulated-fact-closure-target
```

该脚本只接受模拟闭环确认值，不执行真实客户导入。它会覆盖生产、库存预留、委外、出货和财务五条 Phase 8 最小事实链。

若必须人工分步检查，可参考以下最小顺序：

| 动作 | 预期 |
| --- | --- |
| 新建库存预留 | 只占用可用量，不写 `inventory_txns` |
| 释放库存预留 | 预留状态从 `ACTIVE` 到 `RELEASED` |
| 消耗库存预留 | 预留状态从 `ACTIVE` 到 `CONSUMED` |
| 新建并过账生产 / 委外 / 出货事实 | 库存类事实写 `inventory_txns` IN / OUT |
| 取消已过账库存类事实 | 进入 `CANCELLED`，按 usecase 写 REVERSAL |
| 新建财务草稿并过账 / 结清 / 取消 | 状态覆盖 `DRAFT` / `POSTED` / `SETTLED` / `CANCELLED` |

真实客户数据、真实出货、真实库存或真实财务单据不得作为本步骤输入。

## 6. Evidence 模板 / Evidence Template

发布后在客户交付记录或后续正式 evidence 文档中记录：

| 项目 | 记录 |
| --- | --- |
| Release Date | `YYYY-MM-DD HH:mm CST` |
| Commit | `<short-sha>` |
| Server Image | `plush-toy-erp-server:<release-tag>` |
| Web Image | `plush-toy-erp-web:<release-tag>` |
| Target | 环境代号，不写敏感地址 |
| Backup Evidence | 备份时间和位置代号，不写密钥 |
| Migration | apply 前后状态 |
| Health | `/healthz`、`/readyz` 结果 |
| UI | `/erp/phase8/facts` 五个页签结果 |
| RBAC | 账号 / 权限 / debug 权限检查结果 |
| Write Test | 未执行 / 已执行，若执行必须记录 simulated 编号 |
| Acceptance | Passed / Blocked / Failed |
| Remaining Risks | 未验收项和后续动作 |

不要把本模板中的 `Passed` 写成客户最终签收，除非已有客户确认记录。

## 7. 停止条件 / Stop Conditions

出现以下任一情况，停止发布或停止内部模拟验收：

| 停止条件 | 处理方式 |
| --- | --- |
| 目标环境没有 pre-migration 备份 evidence 或回滚计划 | 不执行 migration apply，先补备份和恢复方案 |
| migration 状态不明确 | 不启动新服务，先查 migration |
| 目标服务器需要现场构建镜像 | 停止，回到本地 / CI 构建 |
| `/readyz` 失败 | 不进入验收，先排查 PostgreSQL 或配置 |
| 普通试用账号需要 super admin 才能通过 | 停止，修 RBAC |
| 普通试用账号含 `debug.*` 权限 | 停止，移除 debug 权限 |
| 页面把 `shipping_released` 展示成 shipped | 停止，修文案或状态映射 |
| 验收人员要求导入真实客户数据 | 停止，另开数据治理评审 |
| 验收人员要求完整打印、报表、核销或物流退货 | 记录为后续增强，不塞进本次发布验收 |
| 写入测试缺少模拟标识或冲正方案 | 不执行写入测试 |

## 8. 通过后的下一步 / Next After Pass

目标环境内部模拟验收已在 2026-06-08 通过，允许按 evidence 更新交付台账：

1. 将 CAP-019 到 CAP-024 推进到 `Phase 8 Internal Simulated Closure Passed` 或等价内部闭环状态。
2. 将 CAP-026 / CAP-027 的 evidence 从草案推进到实际目标环境记录和交付后业务确认口径。
3. 再按客户使用反馈决定是否启动打印、报表、发票明细、收付款核销、对账单或物流退货专项。

任何后续增强都必须重新按 `docs/product/implementation-governance.md` 明确允许路径、禁止路径、验收命令和停止条件。
