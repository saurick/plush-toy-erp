---
name: plush-capability-evidence-audit
description: 项目能力证据审计（plush-toy-erp）。Use for read-only evidence audits when users ask what is implemented, what remains, what local QA proves, or whether existing release, recovery, delivery, and acceptance evidence is complete. Do not use for live target checks or release, migration, rollback, or other operational execution.
---

# Plush Capability Evidence Audit

本 skill 用于只读回答“现在做到哪里了、还缺什么、能不能交付、`full/strict` 绿色代表什么”。默认不改代码、文档、数据或部署；若用户同时要求修复，再按发现的问题切换到相应项目 skill。

## Truth Chain / 真源顺序

按问题范围读取，不机械展开全部文件：

1. `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`。
2. `docs/product/产品能力进度台账.md`、`docs/product/产品能力证据详情.md`。
3. 涉及 Workflow runtime 时读 `docs/product/流程编排运行时完成度台账.md`；涉及客户时读 `docs/customers/<customer-key>/客户交付矩阵.md` 和对应验收清单。
4. 当前代码、schema/migration、测试与 `git status --short`；历史 changes、`progress.md`、聊天和截图只作辅助证据。
5. 涉及运行态或发布时，读取正式 release evidence，并核对 target、commit/image、config revision、migration、health/ready、smoke、backup/restore 和 rollback 证据。没有目标环境证据就明确写“未核验”，不以本地结果代替。

## Evidence Layers / 证据分层

每个结论必须归入下列层级，不能合并成一句“已完成”：

| 层级 | 核对内容 | 不足以证明 |
| --- | --- | --- |
| 1. Product truth | 当前代码、schema、API/RBAC、页面投影、正式能力台账 | 已在共享库或目标机可用 |
| 2. Local exact-tree QA | 当前工作树、实际命令、测试数、fail/skip、`full/strict` 结果 | 已提交、已发布或客户已验收 |
| 3. Runtime / data state | 本地或共享环境、migration、active config、真实读回 | 目标生产环境状态 |
| 4. Target release | commit/image、migration、health/ready、业务 smoke、rollback point | 数据恢复可用或客户签收 |
| 5. Data / recovery | import/readback、backup、restore drill、数据对账 | 客户业务验收完成 |
| 6. Customer acceptance | 验收清单、负责人、时间、结果、问题闭环与签收 | 只能由内部推断替代的事实 |

状态词统一使用 `confirmed`、`partial`、`blocked`、`absent`、`not checked`。`passed` 只描述实际执行的验证；`skipped`、`0 tests executed` 和环境阻断必须单列。

## Workflow / 工作流

1. 把用户问题翻译成待判定命题，例如“采购事实已闭环”或“133 已可交付”，并写出需要哪些层级才能成立。
2. 检查 worktree 与当前 revision，区分 committed truth、local WIP 和其他会话改动；不把观察到的无关 diff 算作本轮成果。
3. 从正式台账定位能力，再回到代码、migration 和测试核对。文档声明与实现冲突时，以当前代码/数据/运行证据为准，并报告漂移。
4. 只在结论确实需要且命令安全时补充只读检查。不要为了回答状态题自动迁移、写库、发布、清理、提交或推送。
5. 对每层给出 verdict、证据时间/环境、缺口与 owner；证据陈旧或 target 不一致时降级为 `not checked` 或 `partial`。
6. 最后给出最小下一步：指出哪一层缺哪份证据；不要把“继续开发”作为所有缺口的泛化答案。

## Stop Conditions / 停止条件

- 需要生产凭据、真实写入、migration apply、发布、恢复演练或客户签收时停止只读审计，先取得相应授权并切 `$plush-operations-governance`。
- 需要修业务真源、schema/API/RBAC 时切 `$plush-domain-boundary-governance`；需要补测试时切 `$plush-test-governance`。
- 无法取得完整 target 或客户证据时，报告已核范围与缺失来源，不根据旧记忆或本地绿色补齐结论。

## Output / 输出合同

结论先行，然后用紧凑表格报告：`层级 | verdict | 当前证据 | 仍缺什么`。另列：

- 当前 revision / worktree 边界；
- 已执行与未执行的检查；
- 文档、代码、运行态之间的漂移；
- 能否准确使用“已实现、已本地收口、已发布、已恢复验证、已客户验收”等词；
- 下一步和 owner。
