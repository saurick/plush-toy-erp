---
name: plush-domain-boundary-governance
description: 项目业务边界治理（plush-toy-erp）。Use when work may change schema, migration, repo, usecase, API, RBAC, Workflow/Fact, Product Core, customer isolation, or field truth.
---

# Plush 业务边界治理 Domain Boundary Governance

用这个 skill 在实现 `plush-toy-erp` 功能前收敛 domain ownership、source of truth、API/RBAC、frontend/backend responsibility 和 customer/template-specific boundary。

后端边界：这是 plush 后端业务实现前的主治理入口，覆盖 schema / migration / repo / usecase / JSON-RPC / API / RBAC / transaction / idempotency / error code / Workflow-Fact boundary。页面治理 skill 只核对可见能力是否有真实后端支撑；一旦需要新增或修改这些后端能力，应切换到本 skill。

## 真源链 Truth Chain

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`、相关 module docs/code/tests。
- 代码、schema/migrations、tests、formal docs 强于聊天规划或旧 reference notes。

## 项目规则 Project Rules

- 先按 `MasterData / Workflow / Fact / RBAC / API-UI / Productization` 分层定位责任。
- `Workflow task done` 不等于 `Fact posted`；`WorkflowUsecase` 不直接写库存、出货、财务事实。
- 禁止新增 `tenant_id`、SaaS 多租户、license server，禁止把当前客户字段硬编码进 Product Core。
- 后端实现先确认 schema/migration、repo、usecase、JSON-RPC/API、RBAC、transaction、idempotency、error code 和测试责任，不让前端或临时脚本承接业务事实一致性。

## 项目边界门禁 Project Boundary Gates

- 新增 schema、migration、repo、usecase、API、RBAC 权限、状态、字段或配置前，先证明现有真源不能承接，并说明新增复杂度的收益和退出边界。
- 优先主路径修复：不要用页面私有逻辑、脚本补写、兼容 fallback、重复派生字段或宽松校验掩盖 usecase / repo / API 合同缺口。
- Workflow / Fact、客户差异、字段残值 / 缺值、幂等和事务边界必须可测试、可解释、可回滚；不能只让当前 happy path 通过。
- 若任务跨太多层，先收窄成一个可验证切片；不在一轮里无约束扩张到 schema、RBAC、UI、docs、deploy 全链路。

## 工作流 Workflow

1. 写出 single domain outcome 和 owning layer。
2. 找到 source-of-truth fields、states、identifiers、permissions、derived values。
3. 检查现有 table/usecase/API/helper 是否已经拥有该行为。
4. 覆盖 stale/missing value paths：defaults、edits、source switch/clear、list/detail/print/export/search、historical fallback。
5. UI 不补造 backend facts；客户/模板特例不污染 generic core。
6. 按影响面选择 unit、integration、contract、browser、migration validation。

客户配置任务若进入 validate / publish / transition check / activate / readback、目标环境 migration 或 rollback，由本 skill 先确认 Product Core 与字段真源，再切 `$plush-operations-governance` 执行运行态步骤；不要另造页面私有配置真源或直接改库。

## 输出 Output

汇报 ownership decisions、source truth、changed layers、intentionally untouched layers、stale/missing paths、validation 和 residual risks。
