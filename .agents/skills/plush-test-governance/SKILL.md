---
name: plush-test-governance
description: 项目测试治理（plush-toy-erp）。Use when choosing, running, reviewing, or explaining validation scope, T0-T8 levels, test shapes, browser checks, migrations, or release evidence.
---

# Plush Test Governance

按改动影响面为 plush-toy-erp 选择最小充分验证，并准确说明证据能证明什么。不要把测试数量、内部验证键或全量命令本身当作目标。

`T0-T8` 只是在开发工作台和报告中使用的稳定追踪键，不是开发阶段，也不要求从低到高逐级执行。面向用户先写“文档与边界、领域逻辑、API 与权限、页面与浏览器、真实数据库、发布与恢复”等业务名称。

## 真源

- 验证范围和证据边界：`docs/product/自动化测试策略.md`。
- 当前命令、分组、锁和回执：`scripts/qa/README.md`、相关脚本 `--help` 与测试。
- 代码行为：当前代码、schema/migration 和对应测试；历史报告或聊天不能覆盖当前树。

## 工作流

1. 先看 `git status --short`，确认本轮路径、其他 writer 和当前 repository identity。
2. 新任务或续跑前先展示执行合同：完整提示词、修改范围、精确测试、明确不跑项、数据写入、部署、stage/commit/push 和停止条件；创建任务前让用户看到最终提示词。Codex 自拟提示词不能代替用户确认。
3. 按实际风险选择验证：文档/Skill 做链接与合同检查；schema/migration 做生成、迁移和数据测试；领域/API/RBAC 做正常、边界、异常和权限；页面做 Web 与真实浏览器；发布做目标环境证据。
4. 开发期先运行 `bash scripts/qa/affected.sh --plan`，确认计划和 required follow-up 后再使用 `--run`；优先同名测试、受影响模块和单链浏览器，不为普通改动机械运行全站。
5. `full.sh`、`strict.sh`、Full Acceptance、全量 Style L1、全页面或全 PDF 回归必须逐次得到用户明确确认；“覆盖所有业务链场景”“一次做完”“提交并推送”等宽泛表述不构成授权。`prepare-push.sh` 会运行一次完整 full，启动前单独说明。
6. 产品范围与 clean exact SHA 冻结后，同一候选只运行一轮完整 lifecycle 和一轮 `prepare-push`。高成本门禁失败即停止，不自动扩圈或重跑；只有影响生产正确性、安全、数据完整性、权限或可恢复发布的修复形成新候选后，才重新确认。fixture、mock、选择器、测试文案、开发工作台或证据展示问题若不使生产结论失效，列为后续事项。
7. 对 `affected` 无法选择的生成命令、真实数据库、浏览器、migration 或发布检查，按计划显式补充；环境不具备时报告 `blocked` 或 `missing`，不要用另一类测试绿色代替。
8. 记录实际命令、执行数、pass/fail/skip、证据环境和未覆盖项。缺 summary、`0 tests executed` 或意外 skip 一律不能写成通过。
9. 只有命中项目过程记录条件时才更新 `progress.md`；普通且已闭环的小改动不重复留过程台账。

## 风险边界

| 触达面 | 最少要守住 |
| --- | --- |
| Workflow / ProcessRuntime | 状态、reason、版本/幂等、owner/assignee/RBAC、终态和 Workflow 不代写 Fact |
| Fact 与 Source Document | 合法/非法状态、重复提交、事务回滚、取消/冲正、余额与事实一致性 |
| Schema / migration | `make data`、生成零漂移、版本化 migration、fresh/upgrade 和目标库证据分离 |
| API / RBAC | 未登录、disabled、无权限、角色边界、super admin 和前端隐藏不是安全边界 |
| 页面与样式 | 默认态、交互态、恢复态、相邻区域、长文本/异常数据和真实浏览器 |
| Seed / Import / Config | 模拟与真实数据、dry-run、批次身份、readback、cleanup 和失败关闭 |

`prepare-push.sh`、`full.sh` 和 `strict.sh` 的当前编排以脚本为准。本地绿色不等于已提交、已发布、恢复可用或客户验收；这些结论需要对应环境和责任人的独立证据。

## 输出

结论先行，再列出：

- 选择了哪些可读验证范围，必要时括注内部键；
- 实际命令、测试形态、证据环境和 pass/fail/skip 数量；
- 默认态、交互态、恢复态、真实数据库、migration、浏览器或目标环境中哪些已覆盖；
- 未执行项、原因、剩余盲区和最小下一步。
