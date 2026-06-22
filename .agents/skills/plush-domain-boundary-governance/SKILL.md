---
name: plush-domain-boundary-governance
description: plush-toy-erp 项目业务边界与数据真源治理。Use when Codex implements or reviews plush-toy-erp feature work that may affect backend implementation, server code, schema, migration, repo, usecase, JSON-RPC, APIs, RBAC, transactions, idempotency, error codes, data ownership, domain models, workflows, facts, frontend/backend responsibility, customer-specific behavior, source-of-truth fields, stale/missing field values, or cross-module boundaries.
---

# Plush 业务边界治理 Domain Boundary Governance

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文，`Workflow / Fact / RBAC / API / migration / runtime` 等术语按需保留，方便触发、检索和跨工具引用。

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

## 工作流 Workflow

1. 写出 single domain outcome 和 owning layer。
2. 找到 source-of-truth fields、states、identifiers、permissions、derived values。
3. 检查现有 table/usecase/API/helper 是否已经拥有该行为。
4. 覆盖 stale/missing value paths：defaults、edits、source switch/clear、list/detail/print/export/search、historical fallback。
5. UI 不补造 backend facts；客户/模板特例不污染 generic core。
6. 按影响面选择 unit、integration、contract、browser、migration validation。

## 输出 Output

汇报 ownership decisions、source truth、changed layers、intentionally untouched layers、stale/missing paths、validation 和 residual risks。
