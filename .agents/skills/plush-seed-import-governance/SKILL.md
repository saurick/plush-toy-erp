---
name: plush-seed-import-governance
description: Project-specific seed, fixture, import, dry-run, demo-data, and cleanup governance for plush-toy-erp. Use when Codex creates, changes, reviews, or explains plush-toy-erp seed data, fixtures, import scripts, customer data imports, demo data, reversible manual-test data, cleanup scripts, destructive dev resets, source snapshots, or import validation.
---

# Plush Seed Import Governance

Use this skill for plush-toy-erp seed data, fixtures, demo data, import dry-runs, manual-test data, and cleanup.

## Truth Chain

- Read project `AGENTS.md`, `README.md`, scripts docs, import/seed docs, and the current DB/env target before data writes.
- Treat real customer/prod data as sensitive and non-default.

## Project Rules

- 共享主数据优先走 `scripts/seed-core-demo-data.sh` 和现有 JSON-RPC/脚本，不新增业务事实真源。
- 模拟数据必须可搜索、可清理、可复现；真实客户数据导入没有当前可执行来源时不得伪装已导入。
- `debug.clear_business_data` 是 allowlist destructive dev reset，新增业务表要同步清理列表和断言测试。

## Workflow

1. Define purpose: automated test, manual test, demo, import rehearsal, initialization, or cleanup.
2. Confirm target environment and data source.
3. Use stable prefixes/run ids and existing seed/import scripts where available.
4. Run dry-run before real-write when import or destructive cleanup is involved.
5. Provide exact records/routes/expected states and cleanup steps.
6. Update docs/progress when seed/import behavior or manual-test instructions change.

## Output

Report data source, target env, generated prefixes/records, dry-run/real-write result, cleanup path, validation, and remaining risks.
