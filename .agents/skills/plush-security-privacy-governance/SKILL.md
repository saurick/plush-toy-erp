---
name: plush-security-privacy-governance
description: plush-toy-erp 项目安全与隐私治理。Use when Codex works on plush-toy-erp authentication, authorization, RBAC, permissions, secrets, credentials, API keys, tokens, production access, customer data, PII, data export, logs containing sensitive data, privacy boundaries, or security-sensitive deployment/configuration changes.
---

# Plush 安全与隐私治理 Security Privacy Governance

用这个 skill 处理 `plush-toy-erp` authentication、authorization、RBAC、secrets、production access、customer/user data、sensitive logs、exports 和 privacy boundaries。

## 真源链 Truth Chain

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`、相关 module docs/code/tests。
- auth/RBAC docs、deploy/config docs、secret/preflight scripts、touched code/tests 是当前判断依据。

## 项目规则 Project Rules

- 后端 RBAC 是安全边界，前端菜单隐藏只是不展示。
- 客户资料、导出文件、生产 env、管理员凭据、日志截图默认敏感。
- 不要把 yoyoosun 或任一客户专属资料写成通用 Product Core 规则。

## 工作流 Workflow

1. 识别 assets、actors、permissions、secrets、sensitive data。
2. 确认 backend/API authorization；UI hiding 不是 security boundary。
3. 不记录、不提交、不展示真实 secrets、tokens、PII、customer files、reusable credentials。
4. 高风险操作使用 least privilege、explicit target environment、backup/rollback。
5. 用 tests、secret scan、log redaction check、preflight 或 deployment evidence 验证。

## 输出 Output

汇报 assets、permission boundary、secret/privacy handling、logs/export choices、validation commands 和 residual risks。
