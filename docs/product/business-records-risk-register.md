Doc Type / 文档类型: Business Records Risk Register / business_records 风险登记
Status / 状态: Audit / 审计
Runtime Implemented / 运行时已实现: Partial / 部分
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录风险登记 / business_records Risk Register

本风险登记只覆盖 `business_records` 兼容层过渡。当前 `partners / project-orders` 旧路径已退出旧通用业务页，且不再保留产品内重定向或权限别名；普通 `business` JSON-RPC 已冻结这两个旧模块的 create / update / delete / restore；其他旧模块、数据迁移、删除和归档仍需后续评审。

| Risk | Impact | Evidence | Mitigation | Owner Layer | Next review needed |
|---|---|---|---|---|---:|
| 双真源风险 | 同一客户、供应商、联系人或订单在旧入口和 V1 正式模型中各自可写，后续无法判断谁是准 | `partners`、`project-orders` 旧入口定义、旧路径重定向和权限别名已删除；普通 `business` API 已冻结这两个模块写操作；V1 pages 已新增 | 正式写入只走 V1 usecase；旧记录只做 source snapshot | Product / UI / API | 是 |
| 双写风险 | 同一操作同时写 V1 和 `business_records`，导致状态、字段和审计分裂 | 重叠旧路径不再挂载旧 `BusinessModulePage`，普通 `business` API 已拒绝旧重叠模块 create / update / delete / restore；其他旧模块仍保留兼容层 | 禁止双写；旧记录仅做 source snapshot；其他模块继续按领域评审 | API / UI / Data | 是 |
| demo 数据误当正式数据 | debug seed 或样本被导入正式模型，污染客户资料和订单 | `debug_seed`、`seedData`、mock 和 QA 文档仍引用 `business_records` | 保留 debug/demo 标记；import dry-run 排除 demo/debug | Data Import / QA | 是 |
| 永绅 yoyoosun 客户字段污染 Product Core | 客户专属字段变成通用必填字段，后续产品化失败 | `partners`、`products`、永绅 yoyoosun 样本含付款、税号、地址、SKU 等字段 | 字段先分类为 Product Core Candidate / Customer Material / Print Template Input / Import Adapter | Productization | 是 |
| `business_records` orders 误当 `sales_orders` | 旧 `project-orders` 状态、数量或未出货数被当正式 Source Document 或出货结果 | `project-orders` 定义包含订单数量、生产数量、未出货数 | 只做 dry-run；正式 sales order 不写 shipment / inventory / finance facts | Sales / Data | 是 |
| `business_records.products` 与 `products` schema 重复 | 旧产品资料页继续新增核心字段，形成第二套产品主档 | existing `products` 已是成品主数据；旧 `products` 仍在业务模块 | 旧 products 只保留 source snapshot；正式产品能力复用 existing `products` | MasterData | 是 |
| partners 同时对应 customers / suppliers | 同一 `partners` 记录可能是客户、供应商、加工厂或潜在客户，自动拆分可能错 | `payload.partner_type` 是文本分类，历史数据可能缺值或不一致 | 按 partner_type dry-run；无法唯一判断进入人工确认 | MasterData / Data Import | 是 |
| 旧页面继续新增功能导致 V1 失焦 | 新功能继续堆到通用页面，V1 正式模型长期无法成为主路径 | `BusinessModulePage` 功能完整；`partners / project-orders` 旧入口定义、旧路径重定向和权限别名已删除，普通业务 API 写入已冻结 | 停止重叠领域新增核心能力；正式写入集中到 V1 | Product / UI | 是 |
| 自动迁移误写正式数据 | 缺值、重名、单位不匹配或 payload 语义错误导致正式表污染 | 旧记录字段包含自由文本、float 数量和 payload | 先 dry-run；输出 unresolved queue；人工确认后才迁移 | Data Import / Ops | 是 |
| 删除 `business_records` 破坏历史文档 / demo / QA | 旧 debug、L1、mock、移动端任务和历史记录不可用 | 引用审计显示后端、前端、docs、tests 多处依赖 | 禁止直接删除；先只读 / archive；保留历史查看 | Product / QA / Ops | 是 |
| seedData / 菜单路由修改引发前端回归 | 菜单、权限和 L1 场景受影响 | `seedData.mjs`、`menuPermissions.mjs`、后端内置菜单和路由共同决定前端入口 | 正式菜单已指向 V1；继续跑前端 lint/css/test/style:l1 | UI / QA | 是 |
| 迁移后无法回滚 | 正式表被错误写入后无法恢复旧状态 | 当前无 migration / import 实现和备份方案 | 受控迁移前必须备份、dry-run、幂等、对账和 rollback/forward-fix | Data / Ops | 是 |
| 用户误认为 `business_records` 是正式入口 | 旧书签或培训资料可能继续指向旧路径 | Dashboard 和正式菜单已指向 V1；重叠旧路径不再保留产品内重定向或权限别名 | 正式菜单继续指向 V1；客户培训说明旧路径已退出 | UI / Docs | 是 |
| 出货放行误读为已发货 | `shipping-release` / `outbound` 旧快照可能和 `shipping_released` 混用 | 文档反复强调 `shipping_released != shipped` | 禁止自动生成 shipments / inventory facts；出货事实单独评审 | Workflow / Shipment | 是 |
| 财务快照误写财务事实 | 旧 reconciliation/payables/receivables/invoices 记录可能被当正式应收应付 | finance facts 尚未落地；旧入口只是快照 | finance review 前只保留 source snapshot；不得自动生成 AR/AP/invoice/payment | Finance | 是 |
| Workflow source 切换破坏移动端任务 | workflow_tasks source_type/source_id 可能仍指向旧 module 和 record | mobile task、linked navigation、workflow helper 使用旧 source key | source cutover 单独评审；兼容期保留旧 source 跳转 | Workflow / Mobile | 是 |

## 主要风险 / Top Risks

| 优先级 | 风险 | 当前处理 |
|---:|---|---|
| P0 | 双真源 / 双写 | `partners / project-orders` 旧入口定义、旧路径重定向和权限别名已删除，普通 `business` API 已冻结旧模块写入；后续迁移 / 归档需单独评审 |
| P0 | 自动迁移误写正式数据 | 后续必须先做 dry-run，不允许直接 backfill |
| P1 | 旧 `business_records` 路径仍可能被旧书签访问 | 重叠旧路径不再保留产品内重定向；`docs/customers/yoyoosun/trial-training-note.md` 已补旧入口退出说明，后续迁移 / 归档仍需单独评审 |
| P1 | 用户误认为旧入口仍是正式入口 | UI / docs 已改为正式 V1 入口；试用培训说明草案已补，后续按真实试用反馈复核 |
| P1 | 出货 / 财务事实被旧快照伪造 | 继续保持 Workflow / Fact 边界和禁止自动映射 |

## 真实库风险复核 / Live DB Risk Check 2026-06-08

| 检查项 | 结果 | 风险判断 |
|---|---:|---|
| `partners` 旧记录 | 0 | 当前 dev DB 无客户 / 供应商旧数据迁移风险 |
| `project-orders` 旧记录 | 总数 4；active 0；deleted 4，全部 debug seed | 已软归档，不进入正式 V1 迁移 |
| `project-orders` workflow tasks | 0；清理前 432 条均为 debug 标记 | 已随受控 cleanup 删除，不再形成旧 source task 残留 |
| `project-orders` workflow business states | 0；清理前 4 条 | 已随受控 cleanup 删除 |
| 采购事实 `business_record_id` 引用 | 0 | 当前 dev DB 删除 / 清理旧重叠 debug 数据不会破坏采购事实追溯 |
| V1 正式表数据 | customers / suppliers / contacts / sales_orders / sales_order_items 均为 0 | 当前没有需要从旧记录对账到 V1 的真实业务数据 |
| orphan 明细 / 事件 | 0 | 当前没有孤儿数据修复需求 |
