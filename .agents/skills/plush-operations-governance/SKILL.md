---
name: plush-operations-governance
description: 实时环境与运行操作（plush-toy-erp），不用于仅核对已有证据。Use for runtime fixes, live target checks, observability, secrets/privacy, migration, release or rollback.
---

# Plush 运行与发布治理 / Operations Governance

只读回答“现在做到哪里、已有证据能证明什么”时切 `$plush-capability-evidence-audit`；本 skill 从实时运行态核验、敏感访问或任何配置、数据、migration、发布、回滚动作开始负责。

## Truth Routing / 真源路由

- target、模块责任或运行入口不清时，才用 `README.md` 与 `docs/当前真源与交接顺序.md` 定位。
- 诊断或错误治理按需读相关服务 README、错误码真源、日志、代码和测试；发布、迁移或回滚才读取部署约定、发布门禁、deploy README 和当前 Compose/config。
- 诊断先确认 environment 和最小请求/错误证据，再按失败层补查版本、config、DB/migration 或日志；发布/回滚结论须完整绑定制品、配置、迁移和目标运行证据。

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

先由本 Skill 固定 plush 真源与 target；表中配套 Skill 仅在当前分支需要其专项步骤时加载，已有充分规则和证据时直接完成。真实跨分支才组合。

## Shared Workflow / 共用工作流

1. 明确分支、target/environment、允许写入、验收和停止条件。诊断默认只读；发布、migration apply、secret 变更、恢复和清理必须有明确授权。
2. 按当前分支取证，不同时加载无关分支；只记录支撑本次判断需要的 revision、请求窗口、配置/迁移与凭据来源，不输出 secret、完整 token/DSN 或不必要 PII。
3. 写动作前运行对应 preflight 并保留 before evidence；target、数据归属或 migration 状态不清时停止对应动作，不顺手修数据。
4. 从目标环境采集 after evidence；本地 QA、制品、migration/config、target runtime、recovery 和客户验收分开判定。
5. 只按正式保留策略清理明确制品；不无条件 prune，不碰 volume、数据库、`/data`、env、证书或运行依赖。正式真源变化时同步相关文档与 `progress.md`。

## Stop Conditions / 停止条件

- 拟执行的写入/发布/恢复所需 target、commit/image、config revision、DB 或 migration 序列无法唯一确认；只阻断依赖该身份的动作。
- 生产/共享数据需要修复、破坏性 migration、历史改写、强推或不可逆 secret 轮换，且未获得明确授权和恢复方案。
- preflight、migration status、health/ready、业务 smoke、readback 或数据对账失败；不得跳过失败继续宣称发布完成。
- 只有本地 QA、历史报告或仓库配置，没有当前目标环境证据。此时最多报告本地/定义层完成。

## Output / 输出要求

先给分支结论和证据链，再说明实际动作、验证、目标环境、敏感信息处理、回滚/恢复点及剩余盲区。发布结论必须分开 `local QA`、`artifact`、`migration/config`、`target runtime`、`recovery` 与 `customer acceptance`。
