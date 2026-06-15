Doc Type / 文档类型: Business Records Risk Register / business_records 风险登记
Status / 状态: Post-Deletion Audit / 删除后审计
Runtime Implemented / 运行时已实现: Yes / 是
Ent Schema Implemented / Ent Schema 已实现: Yes / 是
Migration Implemented / Migration 已实现: Yes / 是
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录风险登记 / business_records Risk Register

本风险登记覆盖旧 `business_records / business_record_items / business_record_events` 表族删除后的剩余风险。旧表族已由 `20260612112337` migration 删除；当前运行时不再提供旧通用业务记录查询或写入。

| Risk | Impact | Current Control | Next review needed |
| --- | --- | --- | ---: |
| 复活旧通用事实表 | 再次形成与领域表重复的第二真源 | `business_records` schema/usecase/repo/API/client 已删除；文档明确不得恢复 | 是 |
| 旧 JSONL evidence 被误接回运行时 | 删除前备份被误当历史归档 API 或 import 输入 | evidence 只放在 `output/business-records-delete-20260612/`；不进入 API、菜单、RBAC 或 seed | 是 |
| 目标库未备份直接应用删除 migration | 客户库或生产库历史数据不可恢复 | 每个目标环境必须单独备份、检查 migration status、应用后验证 | 是 |
| 旧 `business_record_id` 字段回流采购事实 API | 采购事实再次依赖旧来源字段 | 采购 JSON-RPC 仍拒绝 `business_record_id`；purchase schema 已删除该列 | 是 |
| Workflow source 被误读为事实来源 | 任务 source/payload 被当库存、出货、财务事实 | Workflow / Fact 边界文档和 usecase 仍要求事实走领域 usecase | 是 |
| 旧页面或旧方法名恢复 | 用户继续误认为旧通用记录是正式入口 | 旧页面和旧路由已删除；旧 `business` 方法 unknown method；L1 和单测守卫 | 是 |
| 自动迁移误写正式数据 | 缺值、重名、单位不匹配或 payload 语义错误导致正式表污染 | 当前不从旧表或 JSONL 自动 backfill；真实 import 仍走 dry-run 和人工确认 | 是 |

## 当前最高风险

| 优先级 | 风险 | 处理口径 |
| ---: | --- | --- |
| P0 | 在新功能中恢复通用业务记录表 | 禁止恢复；若确需历史归档，另建只读归档模型并先评审 |
| P0 | 在客户库 / 生产库无备份执行删除 migration | 发布前必须单独做备份 evidence、migration status 和回归 |
| P1 | 把删除前 JSONL evidence 当 import source | 只能作为删除前证据；真实导入仍走 yoyoosun import dry-run / approval 流程 |
| P1 | 前端恢复旧通用表单或旧业务 API | 前端只保留正式 V1 页面和 `dashboard_stats`；L1 / test 继续守卫 |

## 删除完成证据

| Evidence | Result |
| --- | --- |
| Atlas migration | `20260612112337` 删除旧三表和采购事实 `business_record_id` 兼容列 |
| 删除前备份 | `output/business-records-delete-20260612/*.jsonl`，计数 49 / 3 / 55 |
| 当前 DB 验证 | `to_regclass` 对旧三表返回空；采购事实三表无 `business_record_id` 列 |
| 后端运行时 | `business` 域只保留 `dashboard_stats`；旧方法 unknown method |
| 前端运行时 | 旧通用业务页和旧入口退出页已删除；旧模块 URL 回到业务看板 |
