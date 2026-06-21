---
name: plush-security-privacy-governance
description: Project-specific security and privacy governance for plush-toy-erp. Use when Codex works on plush-toy-erp authentication, authorization, RBAC, permissions, secrets, credentials, API keys, tokens, production access, customer data, PII, data export, logs containing sensitive data, privacy boundaries, or security-sensitive deployment/configuration changes.
---

# Plush Security Privacy Governance

Use this skill when plush-toy-erp changes touch authentication, authorization, secrets, credentials, production access, customer/user data, sensitive logs, exports, or privacy boundaries.

## Truth Chain

- Read project `AGENTS.md`, auth/RBAC docs, deploy/config docs, secret/preflight scripts, and touched code/tests.
- Treat production/test envs, tokens, credentials, customer data, logs, screenshots, and exports as sensitive by default.

## Project Rules

- RBAC 后端校验是真安全边界，前端隐藏菜单只算可见性。
- 客户资料、手机号、token、密钥、生产配置和导出内容默认敏感；不写进日志、截图、fixture 或公开文档。
- 生产/测试环境数据操作必须明确目标库、权限、备份/回滚和审计证据。

## Workflow

1. Identify assets, actors, permissions, secrets, and sensitive data involved.
2. Confirm backend/API authorization; UI hiding is not a security boundary.
3. Avoid logging/committing/exposing real secrets, tokens, PII, customer files, or reusable credentials.
4. Use least privilege and explicit target environment for risky operations.
5. Validate unauthorized/disabled/no-permission/wrong-role/secret-placeholder/data-leak paths as relevant.
6. Update docs/progress when security, privacy, deploy, or permission behavior changes.

## Output

Report assets touched, permission model, secret/privacy handling, checks run, residual risk, and any rotation or follow-up needed.
