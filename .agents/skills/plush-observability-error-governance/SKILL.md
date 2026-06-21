---
name: plush-observability-error-governance
description: Project-specific observability and error-governance workflow for plush-toy-erp. Use when Codex designs, reviews, or changes plush-toy-erp structured logs, request IDs, trace IDs, metrics, audit evidence, error codes, error classification, retries, fallbacks, alerts, dashboards, user-facing error messages, or debugging evidence.
---

# Plush Observability Error Governance

Use this skill when plush-toy-erp logs, traces, metrics, audit evidence, error codes, fallbacks, dashboards, or user-facing errors change.

## Truth Chain

- Read project error/logging helpers, API contracts, frontend error handling, observability docs, and tests for touched paths.
- Check whether the signal must support local debugging, production operations, user support, audit, or product metrics.

## Project Rules

- request_id / trace_id / audit log / business error code 要帮助定位用户动作、RPC 和后端事实。
- 前端用户可见错误使用中文场景 fallback，不直接透传原始异常。
- 调整错误码时同步服务端真源、前端生成码表、消费层和测试。

## Workflow

1. Define which operator/user question the signal answers.
2. Include stable request/job/session/domain identifiers and sanitized classifications.
3. Separate technical logs from user-facing messages.
4. Mark degraded/stale/fallback behavior honestly.
5. Redact secrets and sensitive customer/user data.
6. Validate at least one success and relevant failure path when feasible.

## Output

Report changed signals, identifiers, redaction, user-facing messages, failure paths checked, and remaining diagnostic gaps.
