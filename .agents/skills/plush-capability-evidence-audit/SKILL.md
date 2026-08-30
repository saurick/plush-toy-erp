---
name: plush-capability-evidence-audit
description: 项目能力证据审计（plush-toy-erp）。Use for read-only evidence audits when users ask what is implemented, what remains, what local QA proves, or whether existing release, recovery, delivery, and acceptance evidence is complete. Do not use for live target checks or release, migration, rollback, or other operational execution.
---

# Plush Capability Evidence Audit

只读回答“现在做到哪里、还缺什么、能不能使用或交付”。只核对当前问题需要的证据类型，不为简单状态题展开固定层级、全仓扫描或新建第二份台账。

## 真源顺序

1. 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`。
2. 从 `docs/product/产品能力进度台账.md` 定位业务能力；细节回到对应专题文档、代码、migration 和测试。
3. 涉及 Workflow / ProcessRuntime 时先看台账聚合能力行和 `docs/architecture/状态工作流事实边界.md`。
4. 涉及客户状态时读取对应客户受控资料和当前目标证据；历史 changes、`progress.md`、聊天和截图只作辅助。

## 按问题选择证据

| 证据类型 | 什么时候需要 | 典型依据 |
| --- | --- | --- |
| 产品事实 | 问“做了吗、代码支持什么” | 当前代码、schema/migration、API/RBAC、页面和能力台账 |
| 本地验证 | 问“这次改动测过吗” | 当前 worktree、实际命令、执行数、fail/skip 和浏览器/数据库环境 |
| 目标运行与交付 | 问“某环境能用吗、发布或恢复了吗” | commit/image、config、migration、health/smoke、readback、backup/restore 和 rollback |
| 客户结果 | 问“甲方认可或使用正常吗” | 固定版本、反馈记录、UAT、问题闭环和签收 |

这些证据相互独立。产品事实不能推出目标环境已发布；本地绿色不能推出恢复可用；自动化和内部判断不能替代客户实际使用结果。只检查问题成立所必需的类型，无关类型写“本题不需要”，不逐项补齐。

结论词使用 `confirmed`、`partial`、`blocked`、`absent`、`not checked`。`passed` 只描述实际执行的验证；`skipped`、`0 tests executed` 和环境阻断必须单列。

## 工作流

1. 把问题改写成可判定命题，例如“采购主路径已具备产品事实”或“固定版本已在目标环境可用”。
2. 选择命题真正需要的证据类型和停止条件，不默认要求客户确认技术实现、架构或测试内部键。
3. 检查 current revision 与 worktree，区分 committed truth、local WIP 和其他任务改动。所有 status、diff、ref 与 index 只读盘点都设置 `GIT_OPTIONAL_LOCKS=0`；共享 dirty Local 直接读取 HEAD、index、`index.lock`、`git status --short --untracked-files=all` 与 scoped diff，不用普通 `git status` 制造可避免的 index refresh / lock。
4. 从能力台账定位范围，再回到当前代码、migration、测试或目标证据核对；发生冲突时报告漂移。
5. 状态题默认只读。不要为补证据自动迁移、写库、发布、清理、提交或推送。
6. 给出结论、已核证据、缺口和最小下一步；不要用“继续开发”概括所有问题。

## 停止条件

- 需要生产凭据、真实写入、migration apply、发布、恢复演练或签收时，先取得授权并切 `$plush-operations-governance`。
- 需要修业务真源、schema/API/RBAC 时切 `$plush-domain-boundary-governance`；需要补测试时切 `$plush-test-governance`。
- 无法取得目标或客户证据时准确写 `not checked`，不根据旧记忆或本地绿色补齐。

## 输出

结论先行；需要比较多个证据类型时使用紧凑表格：`证据类型 | verdict | 当前证据 | 仍缺什么`。只列与问题有关的类型，并说明 current revision/worktree、实际检查、未检查项和最小下一步。
