---
name: plush-seed-import-governance
description: plush-toy-erp 项目 seed、fixture、import、dry-run、demo-data 和 cleanup 治理。Use when Codex creates, changes, reviews, or explains plush-toy-erp seed data, fixtures, import scripts, customer data imports, demo data, reversible manual-test data, cleanup scripts, destructive dev resets, source snapshots, or import validation.
---

# Plush Seed / 导入治理 Seed Import Governance

用这个 skill 处理 `plush-toy-erp` seed data、fixtures、demo data、import dry-runs、manual-test data 和 cleanup，保证数据可查、可回收、不冒充产品真源。

## 真源链 Truth Chain

- 先读 `AGENTS.md`、`README.md`、`docs/当前真源与交接顺序.md`、相关 module docs/code/tests。
- 写数据前确认 target DB/env、schema/migration state、run id/prefix 和 cleanup path。

## 项目规则 Project Rules

- 试用模拟只使用 seed、fixture 或手工构造数据；当前没有可直接导入的 yoyoosun 真实客户数据。
- 模拟数据不得写成真实导入、客户字段确认、出货、库存或财务事实。
- seed/import 要可定位、可回收、可复跑；不要污染 Product Core、RBAC 或长期 schema。

## 工作流 Workflow

1. 定义 purpose：automated test、manual test、demo、import rehearsal、initialization、cleanup。
2. 确认 target environment 和 data source。
3. 复用现有 seed/import scripts；用 stable prefixes/run ids。
4. import 或 destructive cleanup 前先 dry-run。
5. 写入后用 API/page/query/test 证明数据满足目标，并给出 cleanup/rollback。

## 输出 Output

汇报 target env、data source、prefix/run id、dry-run/write result、records affected、cleanup command、validation 和 remaining data risks。
