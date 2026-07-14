# ERP MVP 闭环验收 / ERP MVP Closure

- 文档类型：测试 / 验收说明
- 状态：Active
- Runtime Source of Truth：No
- Schema Source of Truth：No
- Current Implementation Source of Truth：No

本文定义 `plush-toy-erp` 的 ERP MVP 闭环验收口径。它服务于测试层和验收层，不替代 `docs/当前真源与交接顺序.md`、`docs/product/产品完成路线图.md`、代码、Ent schema、Atlas migration、API、RBAC 或实际测试结果。

## 1. 定位

ERP MVP 闭环验收回答一个问题：当前 MVP 主链路是否能在受控数据和明确边界下被重复验证。

它不是完整真实客户 E2E，也不是业务运行时主流程。验收脚本只负责组织检查、生成 evidence 和暴露剩余风险；真正的业务能力仍必须落在 schema、repo / usecase、API / RBAC、UI 和对应测试中。

## 2. 验收边界

| 项目 | 当前口径 |
| --- | --- |
| 数据类型 | 只允许模拟数据、dry-run evidence 或明确人工准备的验收数据 |
| 默认行为 | report-only，不连接后端、不写数据库 |
| 写入模拟数据 | 必须调用具体脚本的 `--apply`，并提供对应确认环境变量 |
| 真实客户导入 | 不属于 MVP 闭环验收；另走客户导入 dry-run、冻结和人工审批 |
| Workflow | 只验证协同任务闭环，不代表事实已过账 |
| Fact | 只由对应事实 usecase 写入，不由前端或 workflow 伪造 |
| 前端 | 验证入口、回显、权限和交互态，不替代后端事实规则 |

## 3. 推荐入口

生成 MVP 闭环验收计划和本地 evidence：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/mvp-closure.mjs \
  --out output/customers/yoyoosun/mvp-closure
```

需要同时运行现有 no-write report-only 工具时：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/mvp-closure.mjs \
  --run-report-tools \
  --product-id 1 \
  --unit-id 1 \
  --warehouse-id 1 \
  --out output/customers/yoyoosun/mvp-closure
```

`--run-report-tools` 只会调用 no-write 子工具。它不会传递 `--apply`，不会连接后端，不会写库；业务事实子项只打印停用边界和输入模板，不再要求或伪造产品、单位、仓库 ID。

输出：

```text
output/customers/yoyoosun/mvp-closure/
  mvp-closure-report.json
  mvp-closure-report.md
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

验收点：角色账号绑定真实 RBAC 角色，核心 seed 只写单位、材料、产品、仓库和 BOM 模拟基础资料。

3. MVP 源单据试用数据

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

验收点：只验证岗位协同、处理动作、异常和现场留痕；Workflow task done 不等于库存、出货或财务事实已过账。

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

## 5. 通过标准

一次 MVP 闭环验收可以写作通过，至少需要同时说明：

| 项目 | 要求 |
| --- | --- |
| 环境 | 数据库、migration、后端、前端和账号环境明确 |
| 数据 | 区分模拟数据、dry-run evidence 和真实客户数据 |
| 主数据 / 源单据 | V1 客户、供应商、联系人、销售订单链路可验收 |
| 事实层 | 库存、采购、质检事实测试通过；扩展业务事实如运行则明确为模拟 |
| Workflow | 岗位任务端闭环不被写成事实过账 |
| RBAC | 登录、角色、菜单和后端权限边界有验证 |
| 前端 | 受影响页面完成浏览器级回归 |
| 盲区 | 未覆盖路径、跳过命令和剩余风险明确记录 |

## 6. 不通过或不能声称完成的情况

- 只跑了脚本 report，没有跑对应领域测试。
- 只点了页面，没有验证后端事实表和 usecase。
- 只验证了 Workflow task done，却声称库存、出货或财务事实已完成。
- 使用模拟数据，却写成客户真实导入或客户验收。
- 跳过 RBAC、migration、浏览器回归或目标环境 smoke，却没有说明原因。
- 为了闭环而新增业务字段、放宽状态机、绕过权限或直接写表。

## 7. 与测试分层的关系

MVP 闭环验收主要覆盖 `T7 业务事实 / E2E` 的当前可执行替代形态：分层脚本、事实模拟和浏览器回归组合验收。它不能替代 `T2-T6` 的 schema、usecase、API、RBAC、前端和 import dry-run 专项测试，也不能替代 `T8` 部署 / 发布 / 回滚检查。
