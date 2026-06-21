---
name: plush-domain-boundary-governance
description: Project-specific domain-boundary implementation governance for plush-toy-erp. Use when Codex implements or reviews plush-toy-erp feature work that may affect data ownership, domain models, workflows, facts, schemas, APIs, permissions, frontend/backend responsibility, customer-specific behavior, source-of-truth fields, stale/missing field values, or cross-module boundaries.
---

# Plush Domain Boundary Governance

Use this skill before implementing plush-toy-erp feature work that may change domain ownership, data truth, APIs, permissions, frontend/backend responsibility, or customer/template-specific behavior.

## Truth Chain

- Read project `AGENTS.md`, `README.md`, current-source docs, and nearest module docs/code/tests for the touched area.
- Treat existing code, schema/migrations, tests, and formal docs as stronger truth than chat plans or old reference notes.

## Project Rules

- 先按 MasterData / Workflow / Fact / RBAC / API-UI / Productization 分层定位责任。
- Workflow task done 不等于 Fact posted；WorkflowUsecase 不直接写库存、出货、财务事实。
- 禁止新增 `tenant_id`、SaaS 多租户、license server 或把当前客户字段硬编码进 Product Core。

## Workflow

1. State the single domain outcome and the owning layer.
2. Identify source-of-truth fields, states, identifiers, permissions, and derived values.
3. Check whether an existing table/usecase/API/helper already owns the behavior.
4. Cover stale/missing value paths: defaults, edits, source switch/clear, list/detail/print/export/search, and historical fallback when relevant.
5. Keep UI from inventing backend facts and keep customer/template specifics out of generic core.
6. Choose tests by impact: unit/integration/contract/browser/migration as applicable.

## Output

Report ownership decisions, source truth, changed layers, intentionally untouched layers, stale/missing paths, validation, and residual risks.
