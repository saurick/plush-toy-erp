---
name: plush-runtime-diagnostics
description: Project-specific runtime diagnostics workflow for plush-toy-erp. Use when Codex diagnoses plush-toy-erp page errors, API/RPC failures, backend read/write failures, migration drift, database mismatch, deployment mismatch, browser/runtime issues, logs, request IDs, configuration drift, environment confusion, or production/test/local differences before changing code.
---

# Plush Runtime Diagnostics

Use this skill to diagnose plush-toy-erp runtime failures from evidence before editing code.

## Truth Chain

- Check actual environment, branch/commit/image, config/env, DB/migration state, logs, request IDs, browser network/console, and recent deploys.
- Do not infer runtime truth from static code alone when live behavior is available.

## Project Rules

- 先分清本地 106、测试/目标 133、浏览器 mock、真实 JSON-RPC 和当前数据库。
- 页面大面积读失败先查 RPC、日志、`cd server && make migrate_status`，再决定是否迁移或改代码。
- `style:l1` 只能证明浏览器/样式回归，不替代真实后端读写验证。

## Workflow

1. Capture exact symptom, route/API, user/role, timestamp, environment, and last known good version.
2. Classify the failing layer: browser/UI, route/menu, API/RPC, service/usecase, DB/migration, auth/RBAC, config/env, deploy/container, network/upstream.
3. Reproduce narrowly with one command/request/browser action.
4. Compare runtime evidence against code/docs; distinguish local/test/prod and mock/real paths.
5. Fix the owning layer, avoiding page-local or fallback patches unless they are documented and bounded.
6. Rerun the failing path and adjacent regression checks.

## Output

Report root cause, evidence, environment, commands/requests, fix scope, validation, and unverified paths.
