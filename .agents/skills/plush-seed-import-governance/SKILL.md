---
name: plush-seed-import-governance
description: 项目seed、fixture、导入与清理治理（plush-toy-erp）。Use when Codex creates, changes, reviews, or explains plush-toy-erp seed data, fixtures, import scripts, customer data imports, demo data, reversible manual-test data, cleanup scripts, destructive dev resets, source snapshots, or import validation.
---

# Plush Seed / 导入治理 Seed Import Governance

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文，`Workflow / Fact / RBAC / API / migration / runtime` 等术语按需保留，方便触发、检索和跨工具引用。

用这个 skill 处理 `plush-toy-erp` seed data、fixtures、demo data、import dry-runs、manual-test data 和 cleanup，保证数据可查、可回收、不冒充产品真源。

## 真源链 Truth Chain

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`、相关 module docs/code/tests。
- 写数据前确认 target DB/env、schema/migration state、run id/prefix 和 cleanup path。

## 项目规则 Project Rules

- 试用模拟只使用 seed、fixture 或手工构造数据；当前没有可直接导入的 yoyoosun 真实客户数据。
- 模拟数据不得写成真实导入、客户字段确认、出货、库存或财务事实。
- seed/import 要可定位、可回收、可复跑；不要污染 Product Core、RBAC 或长期 schema。

## 结构质量门禁 Structure Quality Gate

- 边界清晰、合理严谨：说明本轮管什么、不管什么、依赖哪个真源，以及为什么当前拆分、抽象和验证足够但不过度。
- 语义清晰：seed、fixture、dry-run、模拟数据、真实客户数据、导入、清理和回滚必须区分清楚，避免把样例写成事实。
- 模块化：seed、fixture、dry-run、真实 import、cleanup 和 rollback 分开入口，不用一个脚本同时承担模拟、写入和清理所有职责。
- 高内聚：同一数据来源、run id/prefix、映射规则、去重规则和清理规则收口到共享配置或 helper。
- 低耦合：测试数据不污染产品真源，demo 数据不伪装成客户事实，导入脚本不绕过 schema/usecase/RBAC/audit 主路径。
- 单一职责：每批数据都说明 purpose、target env、write scope、cleanup path 和未覆盖风险；不可回收数据默认不写。

## 工作流 Workflow

1. 定义 purpose：automated test、manual test、demo、import rehearsal、initialization、cleanup。
2. 确认 target environment 和 data source。
3. 复用现有 seed/import scripts；用 stable prefixes/run ids。
4. import 或 destructive cleanup 前先 dry-run。
5. 写入后用 API/page/query/test 证明数据满足目标，并给出 cleanup/rollback。

## 输出 Output

汇报 target env、data source、prefix/run id、dry-run/write result、records affected、cleanup command、validation 和 remaining data risks。
