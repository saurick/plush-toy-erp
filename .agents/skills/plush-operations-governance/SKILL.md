---
name: plush-operations-governance
description: 项目运行与发布治理（plush-toy-erp）。Use when Codex diagnoses plush runtime failures, changes logs or error handling, handles secrets or production access, or plans and verifies releases, migrations, health checks, rollback, and release evidence.
---

# Plush 运行与发布治理 / Operations Governance

## Truth Chain / 必读真源

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`。
- 按任务读取 `server/deploy/README.md`、`scripts/README.md`、相关配置、代码和测试。
- 运行态判断必须核对 environment、commit/image、config、DB/migration、日志和请求证据。

## Project Rules / 项目边界

- 先定位 browser、API/RPC、usecase、DB/migration、RBAC、config/deploy 中的失败层，再决定改代码、数据或部署。
- 后端 RBAC 是安全边界；secrets、客户资料、生产 env、导出和日志截图按敏感信息处理。
- 关键链路保留可检索的 `request_id / trace_id / task_id / domain id`；用户提示使用场景化中文，不透传原始异常。
- 发布绑定 commit、image、migration、目标环境、health/ready、业务 smoke 和 rollback point。
- 低配目标机只加载本地或 CI 构建产物，不执行重构建；Atlas 及发布流程遵循项目正式部署文档。

## Workflow / 工作流

1. 明确动作类型：diagnose、observe、secure、release 或 rollback。
2. 记录目标环境、版本、请求/日志、配置和数据库证据；不把本地预期当运行态事实。
3. 诊断时先做最小复现和分层定位；涉及敏感信息时先收窄权限、目标和脱敏范围。
4. 发布前检查 worktree、upstream、migration、配置和本地验证；提交推送收口搭配全局 `$git-closeout-coordination`。
5. 发布后从目标环境验证 health/ready、日志、业务链路和 rollback 可用性；必要时按正式规则清理未使用镜像缓存。
6. 行为、配置、部署或运行真源变化时同步正式文档和 `progress.md`。

## Validation / 验证要求

- 诊断：保留可复现请求、浏览器 network/console、日志或只读数据库证据。
- 可观测性/错误：覆盖成功、业务失败、系统失败、脱敏和用户提示。
- 安全：运行相关 RBAC、secret scan、preflight 或日志脱敏检查。
- 发布：记录 commit/image、migration、health/ready、smoke、rollback 和未验证项。

## Output / 输出要求

先给结论和证据链，再说明改动、验证、目标环境、敏感信息处理、回滚点及剩余盲区。
