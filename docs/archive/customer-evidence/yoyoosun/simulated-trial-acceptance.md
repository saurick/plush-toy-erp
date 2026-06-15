# Phase 7 模拟数据试用验收记录 / Phase 7 Simulated Trial Acceptance

| 项目 | 结论 |
| --- | --- |
| Doc Type | Customer Delivery Evidence |
| Customer Key | `yoyoosun` |
| Phase | Phase 7 |
| Status | Phase 7 Closed By Local Simulated Trial |
| Evidence Date | 2026-06-08 |
| Data Scope | Simulated Only |
| Real Customer Import | Not Executable |

## 结论 / Conclusion

Phase 7 当前只能使用模拟数据完成试用演练；当前没有可直接导入的永绅 yoyoosun 客户真实数据，真实数据导入在本 Phase 中不可执行，也不作为隐藏完成条件。

本地 dev 环境已完成一次 Phase 7 模拟数据试用闭环：模拟主数据 seed、模拟客户 / 供应商 / 联系人 / 销售订单写入、试用账号 RBAC 核对、桌面后台与岗位任务端浏览器 smoke、以及仓库快速 QA 均已通过。

这份记录的验收结论是：**Phase 7 本地模拟数据试用通过，并作为当前 Phase 7 的关闭口径**。它不代表目标客户环境已正式验收，不代表真实客户数据已导入，也不代表 Phase 8 的事实层能力已经开始实现。

## 范围 / Scope

本次验收覆盖：

1. 本地 dev DB 准备模拟单位和模拟产品主数据。
2. 通过 Phase 7 模拟数据工具写入模拟客户、供应商、联系人、销售订单和销售订单行。
3. 9 个 `demo_*` 试用账号使用统一演示密码 `12345678` 完成 RBAC 核对。
4. 桌面后台正式 V1 菜单和岗位任务端入口完成浏览器 smoke。
5. 仓库快速 QA 通过。

本次验收不覆盖：

1. 目标客户正式环境写入或客户现场验收。
2. 永绅 yoyoosun 真实客户数据 import / backfill。
3. `business_records` 迁移、归档或 cutover。
4. 出货、库存出库、库存预留、财务、发票、付款、应收或应付事实。
5. schema、migration、runtime API 语义或 Workflow / Fact usecase 变更。
6. Phase 8 的生产、委外、出货、库存预留或财务事实扩展。

## 已写入的模拟数据 / Simulated Data Written

| 对象 | 模拟标识 / 结果 |
| --- | --- |
| Unit | `SIM-YOYOOSUN-PHASE7-PCS`, local `unit_id=1` |
| Product | `SIM-YOYOOSUN-PHASE7-PRODUCT`, local `product_id=1` |
| Customer | `SIM-YOYOOSUN-PHASE7-C001` |
| Supplier | `SIM-YOYOOSUN-PHASE7-S001`, `supplier_type=material` |
| Contacts | 2 条模拟联系人 |
| Sales Order | `SIM-YOYOOSUN-PHASE7-SO001`, `draft` |
| Sales Order Item | 1 条模拟销售订单行，`open` |

模拟数据报告：

```text
output/customers/yoyoosun/phase7-simulated-trial/phase7-simulated-trial-report.json
```

报告结论：

```text
mode=apply-simulated-data
simulatedOnly=true
realCustomerImport=false
resultCount=6
```

该报告是本地 ignored evidence，不纳入 git；正式结论以本文档记录的范围和边界为准。

## 验证命令 / Verification

### 试用账号 RBAC

```bash
TRIAL_ACCOUNT_PASSWORD=12345678 \
TRIAL_ACCOUNT_BACKEND_URL=http://127.0.0.1:8300 \
node scripts/qa/trial-account-rbac.mjs
```

结果：通过。覆盖 9 个 `demo_*` 账号，确认普通试用账号不是 super admin、未禁用、未分配 debug 权限，岗位入口由 `mobile.<role>.access` 权限控制。

### 浏览器入口 smoke

```bash
TRIAL_ACCOUNT_PASSWORD=12345678 \
TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL=http://127.0.0.1:8300/healthz \
pnpm --dir web smoke:trial-demo-browser
```

结果：通过。覆盖桌面账号 9 个、岗位任务端角色 8 个、拒绝态 1 个；本地前端 smoke base 为 `http://127.0.0.1:4194`。

### 快速 QA

```bash
bash scripts/qa/fast.sh
```

结果：通过。

### 推送前完整 QA

在提交 `2d450fd feat: 增加 Phase 7 模拟数据试用入口` 推送前，pre-push `qa:full` 已通过。已知输出中仍有既有 Node module type warning、Vite chunk-size warning，以及 `govulncheck` 对 unused/imported required module 的提示；当前代码受影响漏洞为 0。

## 验收判定 / Acceptance Decision

| 项目 | 判定 |
| --- | --- |
| Phase 7 本地模拟数据试用 | Passed |
| Phase 7 关闭口径 | Closed by local simulated trial |
| 真实客户数据导入 | Not Executable |
| 目标客户环境验收 | Delivery Follow-up |
| 客户正式交付完成 | Not Yet |
| Phase 8 进入条件 | Open for review planning, not implementation without separate review |

## Phase 7 关闭边界 / Closure Boundary

Phase 7 已按本地模拟数据试用通过关闭。关闭只解决“在没有真实客户可导入数据的前提下，Phase 7 是否可以继续推进”的问题，不改变以下边界：

1. 真实客户数据导入仍不可执行。
2. 目标客户环境账号、RBAC、菜单、V1 页面和岗位任务端验收仍是交付后续项。
3. 客户正式交付完成仍需目标环境或客户现场 evidence。
4. Phase 8 可以开始做评审准备，但生产、委外、出货、库存预留和财务事实必须分别单独评审、实现和验证。
5. 不得从 Phase 7 模拟数据直接派生出货、库存、财务、发票、付款、应收或应付事实。

## 后续 / Next

1. Phase 8 下一步应从事实层评审开始，不直接写 runtime 或 migration。
2. 若要做客户正式试用验收，应在目标环境重复本记录中的账号、RBAC、菜单、V1 页面和岗位任务端验证，并追加目标环境 evidence。
3. 若未来真的出现可导入客户真实数据，必须另开数据治理 / import 执行评审，不得作为 Phase 7 延续。
