---
name: plush-operations-governance
description: 项目运行与发布治理（plush-toy-erp）。Use when Codex diagnoses plush runtime failures, changes logs or error handling, handles secrets or production access, performs live target checks, or plans and executes releases, migrations, health checks, rollback, and release evidence. For a purely read-only "what is complete" audit, use plush-capability-evidence-audit instead.
---

# Plush 运行与发布治理 / Operations Governance

只读回答“现在做到哪里、已有证据能证明什么”时切 `$plush-capability-evidence-audit`；本 skill 从实时运行态核验、敏感访问或任何配置、数据、migration、发布、回滚动作开始负责。

## Truth Chain / 必读真源

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`。
- 诊断或错误治理按需读 `server/README.md`、`web/README.md`、错误码真源、相关日志/代码/测试；发布、迁移或回滚读取 `docs/部署约定.md`、`docs/product/发布门禁.md`、`server/deploy/README.md`、`scripts/deploy/README.md` 和当前 Compose/config。
- 运行态判断必须核对 environment、commit/image、config、DB/migration、日志和请求证据。

## Project Rules / 项目边界

- 先定位 browser、API/RPC、usecase、DB/migration、RBAC、config/deploy 中的失败层，再决定改代码、数据或部署。
- 后端 RBAC 是安全边界；secrets、客户资料、生产 env、导出和日志截图按敏感信息处理。
- 关键链路保留可检索的 `request_id / trace_id / task_id / domain id`；用户提示使用场景化中文，不透传原始异常。
- 发布绑定 commit、image、migration、目标环境、health/ready、业务 smoke 和 rollback point。
- 低配目标机只加载本地或 CI 构建产物，不执行重构建；Atlas 及发布流程遵循项目正式部署文档。
- `full/strict`、本地 hook、仓库 workflow、历史 release note 都不是当前目标运行态；backup 存在也不等于 restore 已演练。
- 客户配置运行态必须走 validate / publish / transition check / activate / effective-session readback 的正式链路；不直接改数据库或只改 live config。

## Router / 分支路由

| 分支 | 先回答 | 配套全局 skill | 最低证据 |
| --- | --- | --- | --- |
| Diagnose | 失败在 browser、API/RPC、usecase、DB/migration、RBAC 还是 config/deploy？ | `$runtime-diagnostics` | 可复现请求、时间窗口、request id、日志/Network、只读状态 |
| Observe / Error | 内外错误语义、日志字段、trace、脱敏和告警是否一致？ | `$observability-error-governance` | 成功/业务失败/系统失败、错误码同步、用户提示与内部诊断 |
| Secure / Privacy | 资产、权限、secret、客户资料和审计边界是什么？ | `$security-privacy-governance` | RBAC、secret scan、最小权限、脱敏、访问与回收记录 |
| Release / Migration | 哪个不可变制品进入哪个 target，DB/config 如何推进？ | `$release-governance` | preflight、commit/image、migration lock、health/ready、smoke |
| Rollback / Recovery | 回退代码、配置或 migration 的安全点是什么，数据如何恢复？ | `$release-governance` | rollback point、备份、restore drill、对账、恢复后 smoke |

任务真实跨分支时才组合；先由本 skill 固定 plush 真源与 target，再按表中专项 workflow 深入。

## Workflow / 共用工作流

1. 明确动作分支、target/environment、允许写入、禁止路径、验收和停止条件。诊断默认只读；发布、migration apply、secret 变更、恢复和清理必须有明确授权。
2. 记录 current revision、image/config revision、请求时间窗口、DB/migration 与凭据来源；不输出 secret、完整 token/DSN 或不必要 PII。
3. Diagnose 先最小复现并逐层排除；Observe/Error 先确认错误码和日志真源；Secure 先做资产/权限边界；Release/Rollback 先冻结制品、迁移序列和恢复点。
4. 执行任何写动作前跑对应 preflight，并保留 before evidence。blocker、target 不一致、共享/生产库归属不清或 migration 预检失败时停止，不“顺手修数据”。
5. 发布前检查 worktree、upstream、当前树 QA、固定 image、config、migration lock、备份与 rollback；提交推送收口搭配 `$git-closeout-coordination`。
6. 从目标环境采集 after evidence：health/ready、migration/config readback、日志、业务 smoke、数据对账与 rollback/recovery 可用性。自动化绿色与人工/客户验收分开。
7. 只按正式保留策略清理项目未使用制品；不无条件 `docker image prune -a`，不碰 volume、数据库、`/data`、env、证书或运行容器依赖。
8. 行为、配置、部署或运行真源变化时同步相关正式文档与 `progress.md`。

## Stop Conditions / 停止条件

- target、commit/image、config revision、DB 或 migration 序列无法唯一确认。
- 生产/共享数据需要修复、破坏性 migration、历史改写、强推或不可逆 secret 轮换，且未获得明确授权和恢复方案。
- preflight、migration status、health/ready、业务 smoke、readback 或数据对账失败；不得跳过失败继续宣称发布完成。
- 只有本地 QA、历史报告或仓库配置，没有当前目标环境证据。此时最多报告本地/定义层完成。

## Validation / 验证要求

- 诊断：保留可复现请求、浏览器 network/console、日志或只读数据库证据。
- 可观测性/错误：覆盖成功、业务失败、系统失败、脱敏和用户提示。
- 安全：运行相关 RBAC、secret scan、preflight 或日志脱敏检查。
- 发布：记录 commit/image、migration、health/ready、smoke、rollback 和未验证项。
- 恢复：记录备份标识、restore target、演练结果、数据对账和恢复后 smoke；只有备份文件不算恢复验证。

## Output / 输出要求

先给分支结论和证据链，再说明实际动作、验证、目标环境、敏感信息处理、回滚/恢复点及剩余盲区。发布结论必须分开 `local QA`、`artifact`、`migration/config`、`target runtime`、`recovery` 与 `customer acceptance`。
