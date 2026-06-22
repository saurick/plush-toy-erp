---
name: plush-observability-error-governance
description: plush-toy-erp 项目可观测性和错误治理 workflow。Use when Codex designs, reviews, or changes plush-toy-erp structured logs, request IDs, trace IDs, metrics, audit evidence, error codes, error classification, retries, fallbacks, alerts, dashboards, user-facing error messages, or debugging evidence.
---

# Plush 可观测性与错误治理 Observability Error Governance

用这个 skill 处理 `plush-toy-erp` logs、traces、metrics、audit evidence、error codes、fallbacks、dashboards 和 user-facing errors，让问题能被定位、解释和复现。

## 真源链 Truth Chain

- 先读 error/logging helpers、API contracts、frontend error handling、observability docs 和相关 tests。
- 明确 signal 是给 local debugging、production operations、user support、audit 还是 product metrics 使用。

## 项目规则 Project Rules

- 关键链路保留 `request_id / trace_id / task_id / domain id`，日志要能分层定位。
- 前端用户可见错误默认中文、场景化，不直接透传 raw exception。
- 错误码、结构化日志、审计和页面提示变动要同步测试与正式文档口径。

## 工作流 Workflow

1. 定义 signal 要回答哪个 operator/user question。
2. 包含稳定 identifiers：request/job/session/domain ids、status、latency、dependency、sanitized classification。
3. 区分 technical logs 和 user-facing messages。
4. fallback/degraded/stale 行为要明确标记原因、时间和证据来源。
5. 用测试、日志样本、浏览器/API evidence 证明 signal 可用。

## 输出 Output

汇报 changed signals、fields、error classifications、user messages、redaction choices、validation 和 remaining observability gaps。
