# ERP V1 主链验收计划与证据边界 / ERP V1 Acceptance Plan and Evidence Boundary

- 文档类型：测试 / 验收说明
- 状态：Active
- Runtime Source of Truth：No
- Schema Source of Truth：No
- Current Implementation Source of Truth：No

本文定义 `plush-toy-erp` 的 V1 主链验收计划、结论分级和证据边界。它服务于测试组织与验收准备，不替代 `docs/当前真源与交接顺序.md`、`docs/product/产品能力进度台账.md`、代码、Ent schema、Atlas migration、API、RBAC、实际测试回执或目标环境读回。

## 1. 定位

项目当前以 **V1 候选** 作为活跃交付口径，不再沿用早期“最小可用产品”阶段作为当前范围名。该历史阶段术语只在路线图与归档中保留；“用最小能力验证主链”的出发点仍有效，但当前 Product Core 已覆盖多条 Source Document、ProcessRuntime、Fact、RBAC、客户配置和质量治理链路，继续沿用早期范围名会低估系统范围，也容易把计划生成误读为闭环验收完成。

V1 主链验收计划回答的是：**当前候选版本需要按什么顺序验证、每类证据能证明什么、还缺什么证据**。

它不是完整真实客户 E2E，也不是业务运行时主流程。计划脚本只负责组织检查、生成本地计划 evidence 和暴露剩余风险；真正的业务能力仍必须落在 schema、repo / usecase、API / RBAC、UI 和对应测试中。

### 1.1 读者路径

| 要回答的问题 | 当前入口 |
| --- | --- |
| 当前实现到了哪一层 | `docs/product/产品能力进度台账.md` |
| 当前代码、部署与交接事实看哪里 | `docs/当前真源与交接顺序.md` |
| 测试层级和证据要求是什么 | `docs/product/自动化测试策略.md` |
| clean exact SHA 如何完成本地完整技术验收 | `scripts/qa/local-acceptance-lifecycle.mjs` |
| 本文负责什么 | V1 主链验收计划、结论分级与证据边界 |

## 2. 计划与证据边界

| 项目 | 当前口径 |
| --- | --- |
| 数据类型 | 只允许模拟数据、dry-run evidence 或明确人工准备的验收数据 |
| 默认行为 | plan-only，只写本地计划 evidence，不连接后端、不写数据库 |
| `--run-report-tools` | 只运行已登记的 no-write report-only 子工具，不传递写入参数 |
| 写入模拟数据 | 必须调用具体脚本的 `--apply`，并提供对应确认环境变量 |
| 真实客户导入 | 不属于本计划；另走客户导入 dry-run、冻结和人工审批 |
| Workflow | 只验证协同任务闭环，不代表事实已过账 |
| Fact | 只由对应事实 usecase 写入，不由前端或 workflow 伪造 |
| 前端 | 验证入口、回显、权限和交互态，不替代后端事实规则 |
| 本地完整技术验收 | 以 clean exact SHA 的 `local-acceptance-lifecycle.mjs` 回执为准 |
| 目标发布与客户 UAT | 必须分别取得目标 migration / health / smoke 和客户岗位验收证据 |

## 3. 推荐入口

生成 V1 主链验收计划和本地 evidence：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/v1-acceptance-plan.mjs \
  --out output/customers/yoyoosun/v1-acceptance-plan
```

需要同时运行现有 no-write report-only 工具时：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/v1-acceptance-plan.mjs \
  --run-report-tools \
  --out output/customers/yoyoosun/v1-acceptance-plan
```

`--run-report-tools` 只会调用 no-write 子工具。它不会传递 `--apply`，不会连接后端，不会写库；业务事实子项只打印停用边界和输入模板，不再要求或伪造产品、单位、仓库 ID。

输出：

```text
output/customers/yoyoosun/v1-acceptance-plan/
  v1-acceptance-plan-report.json
  v1-acceptance-plan-report.md
  trial-simulated-data/
  operational-fact-simulated-closure/
  mobile-workflow-simulated-closure/
```

其中子目录只在使用 `--run-report-tools` 时生成。

## 4. 标准流程

1. 环境和真源预检

```bash
git status --short
git diff --check
cd server && make print_db_url
cd server && make migrate_status
```

确认当前工作区、目标数据库、migration 状态和本轮允许路径。若存在并行现场，只记录并隔离，不回退、不格式化、不提交无关文件。

2. 角色和核心模拟基础资料

```bash
ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' \
  bash scripts/seed-role-demo-admins.sh

bash scripts/seed-core-demo-data.sh

TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node scripts/qa/trial-account-rbac.mjs
```

验收点：十个标准 `demo_*` 角色账号在登记的 `192.168.0.106:5432/plush_erp` / `plush_erp_*_dev` 本地开发库统一使用公开测试密码 `12345678` 并绑定真实 RBAC 角色；稳定超级管理员、调试账号和人工验收专用账号不进入该默认重置范围。上面的完整验收命令仍显式传入密码，便于受控覆盖默认值并让后续核对复用同一输入；普通本地开发不传密码时就是 `12345678`。需要调试 / 人工验收专用账号时也必须改用显式非默认密码。核心 seed 只写单位、材料、产品、仓库和 BOM 模拟基础资料。

3. V1 源单据试用数据

```bash
node scripts/qa/trial-simulated-data.mjs \
  --out output/customers/yoyoosun/trial-simulated-data
```

需要写入本地或目标试用环境时，必须显式确认：

```bash
TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA \
TRIAL_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/trial-simulated-data.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --out output/customers/yoyoosun/trial-simulated-data
```

验收点：客户、供应商、联系人、销售订单和订单行只作为 V1 模拟数据；销售订单仍是 Source Document / Business Commitment，不生成出货、库存、财务、发票或收付款事实。

4. 采购 / 质检 / 库存事实基础

```bash
cd server
make inventory_pg_test
make bom_lot_pg_test
make purchase_receipt_pg_test
make purchase_return_pg_test
go test ./internal/core/... ./internal/biz ./internal/data
```

验收点：库存变化来自事实 usecase 和 `inventory_txns`；采购入库、退货、调整、质检和批次状态互相不替代；错误通过 `REVERSAL` 或调整修正，不直接修改历史流水。

5. 业务事实来源驱动输入合同

```bash
node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template
```

验收点：该脚本当前只提供 no-write 输入模板和旧矩阵 report-only 计划。旧 `--apply` 已在登录、RPC 和任何写入前停用，因为它依赖已退役的通用事实创建接口。恢复写入前必须重建来源驱动 fixture，分别从生产订单 / 物料需求、委外订单、销售订单、出货、采购入库和已过账财务事实发起；旧报告不能作为当前完整财务、物流、装箱、核销或客户验收证据。

6. 岗位任务端 Workflow 闭环

```bash
node scripts/qa/mobile-workflow-simulated-closure.mjs \
  --out output/customers/yoyoosun/mobile-workflow-simulated-closure
```

需要写入模拟 Workflow 任务时：

```bash
MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS \
MOBILE_WORKFLOW_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/mobile-workflow-simulated-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --run-id target-yyyymmdd-mobile \
    --out output/customers/yoyoosun/mobile-workflow-simulated-closure-target
```

验收点：只验证岗位协同、处理动作、反馈 / 原因、详情任务附件入口和新动作不生成历史证据引用；Workflow task done 不等于库存、出货或财务事实已过账。

7. 前端菜单和浏览器回归

```bash
cd web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

需要试用账号浏览器回归时：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir web smoke:trial-demo-browser
```

验收点：默认态、交互态、恢复态和相邻区域通过；菜单隐藏不替代后端 RBAC；页面只提交业务动作，不补造后端事实。

## 5. 结论分级

不得笼统写“V1 验收通过”。结论必须落到下列具体层级：

| 可写结论 | 最低证据 | 不能证明 |
| --- | --- | --- |
| V1 验收计划已生成 | 本脚本 plan-only 报告、必需入口存在、边界清单明确 | 领域测试、浏览器回归、本地完整技术验收 |
| V1 本地完整技术验收通过 | clean exact SHA 的 `local-acceptance-lifecycle.mjs` 完整回执、隔离库清理读回、所有失败关闭项通过 | 目标环境已发布、客户岗位已验收 |
| V1 目标发布已验证 | 绑定 commit / image、目标 migration 与结构读回、health / ready、岗位 smoke、回滚点 | 客户业务接受或签收 |
| V1 客户验收完成 | 客户岗位按约定数据与清单操作、问题处置完成、取得明确签收或等价确认 | 未经确认的后续范围 |

各层结论都必须同时记录环境、数据类型、exact SHA / 制品身份、已执行命令、跳过项和剩余风险。

## 6. 不通过或不能声称完成的情况

- 只跑了脚本 report，没有跑对应领域测试。
- 只生成本计划，却写成本地完整技术验收通过。
- 只点了页面，没有验证后端事实表和 usecase。
- 只验证了 Workflow task done，却声称库存、出货或财务事实已完成。
- 使用模拟数据，却写成客户真实导入或客户验收。
- 跳过 RBAC、migration、浏览器回归或目标环境 smoke，却没有说明原因。
- 为了闭环而新增业务字段、放宽状态机、绕过权限或直接写表。

## 7. 与测试分层的关系

`v1-acceptance-plan.mjs` 本身属于现场与静态检查（T0）以及文档与边界检查（T1）的计划入口编排：它只证明计划可生成、必需入口存在和 no-write 边界成立。计划中列出的命令分别提供数据结构与迁移（T2）、领域逻辑（T3）、API 与权限（T4）、页面与浏览器（T5）、配置与导入（T6）、业务集成与真实数据库（T7）证据，不能由本报告代替。

clean exact SHA 的本地完整技术验收入口是 `scripts/qa/local-acceptance-lifecycle.mjs`。发布、恢复与回滚验证（T8）以及客户岗位 UAT 仍是独立证据层，不能由本地绿色或历史发布记录替代。
