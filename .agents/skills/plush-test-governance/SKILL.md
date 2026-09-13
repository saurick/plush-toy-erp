---
name: plush-test-governance
description: 按改动选择最小充分验证（plush-toy-erp）。Use when validation scope needs judgment, especially for browser, database, migration or CI evidence.
---

# Plush Test Governance

按改动影响面为 plush-toy-erp 选择最小充分验证，并准确说明证据能证明什么。不要把测试数量、内部验证键或全量命令本身当作目标。

`T0-T8` 只是在开发工作台和报告中使用的稳定追踪键，不是开发阶段，也不要求从低到高逐级执行。面向用户先写“文档与边界、领域逻辑、API 与权限、页面与浏览器、真实数据库、发布与恢复”等业务名称。

## Truth Routing / 真源路由

- 需要判断覆盖层级或证据边界时读 `docs/product/自动化测试策略.md`。
- 需要运行命令、解释当前 CI/push 证据或修改 QA 脚本时，才读 `scripts/qa/README.md`、相关脚本 `--help` 与测试。
- 代码行为：当前代码、schema/migration 和对应测试；历史报告或聊天不能覆盖当前树。

## 工作流

1. 先看 `GIT_OPTIONAL_LOCKS=0 git status --short`，确认本轮路径、其他 writer 和当前 repository identity。
2. 按项目 `AGENTS.md` 的验证授权规则，以用户目标和实际改动为边界选择最小充分验证；当前目标必要的静态、同名测试、受影响模块、浏览器和 PDF 验证直接执行。共享环境配置、真实数据写入、Git 和发布动作仍按各自授权边界处理。
3. 按实际风险选择验证：文档/Skill 做链接与合同检查；schema/migration 做生成、迁移和数据测试；领域/API/RBAC 做正常、边界、异常和权限；页面做 Web 与真实浏览器；发布做目标环境证据。
4. 改动适合现有 affected 路由时，用 `bash scripts/qa/affected.sh --plan` 选计划再按需 `--run`；否则直接运行同名或专项检查，不为普通改动机械运行全站。
5. `full.sh`、`strict.sh`、Full Acceptance、全量页面或 PDF 回归只在目标和风险需要时执行。明显超出任务范围或资源预算时，一次说明新增范围、预计开销和停止条件；名称或覆盖数量本身不构成额外门禁。
6. 任务涉及已授权的 commit/push、远端 exact-SHA CI、发布或 GPT 镜像审查时，按 `scripts/qa/README.md` 的当前合同收口；本 skill 不复制 remote、Runner、机器型号或镜像拓扑。失败修复后只重跑受影响证据，无新改动不重复门禁。
7. 对 `affected` 无法选择的生成命令、真实数据库、浏览器、migration 或发布检查显式补充；环境不具备时报告 `blocked` 或 `missing`，不要用另一类测试绿色代替。
8. 记录实际命令、执行数、pass/fail/skip、证据环境和相关未覆盖项。缺 summary、`0 tests executed` 或意外 skip 一律不能写成通过。

## 风险边界

| 触达面 | 最少要守住 |
| --- | --- |
| Workflow / ProcessRuntime | 状态、reason、版本/幂等、owner/assignee/RBAC、终态和 Workflow 不代写 Fact |
| Fact 与 Source Document | 合法/非法状态、重复提交、事务回滚、取消/冲正、余额与事实一致性 |
| Schema / migration | `make data`、生成零漂移、版本化 migration、fresh/upgrade 和目标库证据分离 |
| API / RBAC | 未登录、disabled、无权限、角色边界、super admin 和前端隐藏不是安全边界 |
| 页面与样式 | 默认态、交互态、恢复态、相邻区域、长文本/异常数据和真实浏览器 |
| Seed / Import / Config | 模拟与真实数据、dry-run、批次身份、readback、cleanup 和失败关闭 |

本地验证、远端 exact-SHA CI、制品/发布、目标运行、恢复和客户验收是不同证据；一种绿色不能替代另一种。具体 CI/push 编排以当前脚本和 `scripts/qa/README.md` 为准。

## 输出

结论先行，再列出：

- 选择了哪些可读验证范围，必要时括注内部键；
- 实际命令、测试形态、证据环境和 pass/fail/skip 数量；
- 与本次目标相关的状态或环境覆盖；
- 相关未执行项、原因、剩余盲区和最小下一步。
