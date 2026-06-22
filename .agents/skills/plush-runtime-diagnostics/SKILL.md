---
name: plush-runtime-diagnostics
description: plush-toy-erp 项目运行时故障诊断。Use when Codex diagnoses plush-toy-erp page errors, API/RPC failures, backend read/write failures, migration drift, database mismatch, deployment mismatch, browser/runtime issues, logs, request IDs, configuration drift, environment confusion, or production/test/local differences before changing code.
---

# Plush 运行时诊断 Runtime Diagnostics

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文，`Workflow / Fact / RBAC / API / migration / runtime` 等术语按需保留，方便触发、检索和跨工具引用。

用这个 skill 在修改 `plush-toy-erp` 代码前先用 runtime evidence 分层定位故障，避免把环境、数据、migration、部署或浏览器问题误修成代码补丁。

## 真源链 Truth Chain

- 核对 actual environment、branch/commit/image、config/env、DB/migration state、logs、request IDs、browser network/console、recent deploys。
- live behavior 可取得时，不只靠 static code 推断 runtime truth。

## 项目规则 Project Rules

- 页面报错先分层：browser/route、JSON-RPC、usecase、DB/migration、auth/RBAC、deploy/container。
- 涉及数据库先确认 `DB URL` 和 migration 状态；区分 mock、真实后端、本地、106/133 和线上环境。
- 浏览器截图、DOM、network、console、server logs 和 request_id 是 runtime 证据，静态代码不是最终 runtime truth。

## 工作流 Workflow

1. 捕获 symptom：route/API、user/role、timestamp、environment、last known good version。
2. 分层：browser/UI、route/menu、API/RPC、service/usecase、DB/migration、auth/RBAC、config/env、deploy/container、network/upstream。
3. 用一个最小 command/request/browser action 复现。
4. 对比 runtime evidence 与 code/docs，区分 local/test/prod 和 mock/real path。
5. 先给出 root cause 或 narrowed suspects，再决定改代码、改数据、改配置、补 migration 或回滚部署。

## 输出 Output

汇报 symptom、evidence、failing layer、reproduction、root cause/suspects、fix path、validation 和 remaining blind spots。
