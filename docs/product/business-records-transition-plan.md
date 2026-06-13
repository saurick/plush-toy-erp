Doc Type / 文档类型: Business Records Transition Plan / business_records 过渡记录
Status / 状态: Superseded By Deletion / 已由删除闭环替代
Runtime Implemented / 运行时已实现: Yes / 是
Ent Schema Implemented / Ent Schema 已实现: Yes / 是
Migration Implemented / Migration 已实现: Yes / 是
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录过渡记录 / business_records Transition Record

本文保留旧 `business_records` 过渡阶段的背景和边界。当前运行时已经越过“只读兼容层”阶段：`business_records / business_record_items / business_record_events` 已由 `20260612112337` migration 删除。当前状态以 `docs/current-source-of-truth.md` 和 `docs/product/business-records-cutover-plan.md` 为准。

## 已完成的过渡结论

- 客户、供应商、联系人和销售订单正式写入已转向 V1 MasterData / SalesOrder usecase。
- 库存、采购、质检、出货、财务相关事实不得由旧通用记录或 Workflow payload 伪造。
- 旧普通 `business` API 写入口已先冻结，随后旧记录查询和写入方法整体退出运行时。
- 旧通用记录前端表单、打印、source prefill、批量删除、恢复和任务派生 helper 已从运行时删除。
- 删除前当前开发库旧数据已导出 JSONL evidence；该 evidence 不是 import source，也不是新归档 API。

## 仍有效的边界

| 边界 | 当前口径 |
| --- | --- |
| Product Core | 不把旧通用记录字段、旧截图或客户样本直接升为通用核心 schema |
| Workflow / Fact | Workflow task done 不等于库存、出货、财务、应收、应付、发票或收付款事实 |
| Import / backfill | 不从旧 JSONL evidence 自动写正式表；真实导入仍需 dry-run、approval、backup evidence 和人工确认 |
| 历史归档 | 若未来需要客户可见历史归档，另做归档模型评审，不恢复旧三表 |
| 客户库 / 生产库 | 不套用当前开发库结果；每个环境必须独立备份、migration status 检查和回归 |

## 已替代的旧阶段

| 旧阶段 | 当前状态 |
| --- | --- |
| Stage 0: compatibility/demo layer | 已结束 |
| Stage 1: V1 与旧记录并行可见但禁止双写 | 已结束 |
| Stage 2: 只读 / demo 化 | 已结束 |
| Stage 3: dry-run mapping | 仅保留真实 import 体系，不依赖旧表 |
| Stage 4: 受控迁移 | 当前未从旧表执行 backfill |
| Stage 5: deprecated / archive | 已升级为物理删除 |

## 停止条件

- Stop if code or docs reintroduce `business_records` as runtime table, archive table, API source, debug fixture or Product Core source.
- Stop if old JSONL evidence is used to create inventory, shipment, quality, finance, receivable, payable, invoice or payment facts.
- Stop if target environment deletion migration is attempted without backup evidence and migration status check.
