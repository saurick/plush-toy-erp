Doc Type / 文档类型: Business Records Risk Register / business_records 风险登记
Status / 状态: Audit / 审计
Runtime Implemented / 运行时已实现: Partial / 部分
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录风险登记 / business_records Risk Register

本风险登记只覆盖 `business_records` 兼容层过渡。当前 `partners / project-orders` 旧路径已退出旧通用业务页，访问时只重定向到正式 V1 入口；其他旧模块、数据迁移、删除和归档仍需后续评审。

| Risk | Impact | Evidence | Mitigation | Owner Layer | Next review needed |
|---|---|---|---|---|---:|
| 双真源风险 | 同一客户、供应商、联系人或订单在旧入口和 V1 正式模型中各自可写，后续无法判断谁是准 | `partners`、`project-orders` 旧路径已重定向到 V1；V1 pages 已新增 | 正式写入只走 V1 usecase；旧记录只做 source snapshot | Product / UI / API | 是 |
| 双写风险 | 同一操作同时写 V1 和 `business_records`，导致状态、字段和审计分裂 | 重叠旧路径不再挂载旧 `BusinessModulePage`；其他旧模块仍保留兼容层 | 禁止双写；旧记录仅做 source snapshot；后续如需更强约束再评审 API 层限制 | API / UI / Data | 是 |
| demo 数据误当正式数据 | debug seed 或样本被导入正式模型，污染客户资料和订单 | `debug_seed`、`seedData`、mock 和 QA 文档仍引用 `business_records` | 保留 debug/demo 标记；import dry-run 排除 demo/debug | Data Import / QA | 是 |
| 永绅 yoyoosun 客户字段污染 Product Core | 客户专属字段变成通用必填字段，后续产品化失败 | `partners`、`products`、永绅 yoyoosun 样本含付款、税号、地址、SKU 等字段 | 字段先分类为 Product Core Candidate / Customer Material / Print Template Input / Import Adapter | Productization | 是 |
| `business_records` orders 误当 `sales_orders` | 旧 `project-orders` 状态、数量或未出货数被当正式 Source Document 或出货结果 | `project-orders` 定义包含订单数量、生产数量、未出货数 | 只做 dry-run；正式 sales order 不写 shipment / inventory / finance facts | Sales / Data | 是 |
| `business_records.products` 与 `products` schema 重复 | 旧产品资料页继续新增核心字段，形成第二套产品主档 | existing `products` 已是成品主数据；旧 `products` 仍在业务模块 | 旧 products 只保留 source snapshot；正式产品能力复用 existing `products` | MasterData | 是 |
| partners 同时对应 customers / suppliers | 同一 `partners` 记录可能是客户、供应商、加工厂或潜在客户，自动拆分可能错 | `payload.partner_type` 是文本分类，历史数据可能缺值或不一致 | 按 partner_type dry-run；无法唯一判断进入人工确认 | MasterData / Data Import | 是 |
| 旧页面继续新增功能导致 V1 失焦 | 新功能继续堆到通用页面，V1 正式模型长期无法成为主路径 | `BusinessModulePage` 功能完整；`partners / project-orders` 旧路径已退出旧页面并重定向到 V1 | 停止重叠领域新增核心能力；正式写入集中到 V1 | Product / UI | 是 |
| 自动迁移误写正式数据 | 缺值、重名、单位不匹配或 payload 语义错误导致正式表污染 | 旧记录字段包含自由文本、float 数量和 payload | 先 dry-run；输出 unresolved queue；人工确认后才迁移 | Data Import / Ops | 是 |
| 删除 `business_records` 破坏历史文档 / demo / QA | 旧 debug、L1、mock、移动端任务和历史记录不可用 | 引用审计显示后端、前端、docs、tests 多处依赖 | 禁止直接删除；先只读 / archive；保留历史查看 | Product / QA / Ops | 是 |
| seedData / 菜单路由修改引发前端回归 | 菜单、权限、兼容重定向和 L1 场景受影响 | `seedData.mjs`、`menuPermissions.mjs`、后端内置菜单和路由共同决定前端入口 | 正式菜单已指向 V1；继续跑前端 lint/css/test/style:l1 | UI / QA | 是 |
| 迁移后无法回滚 | 正式表被错误写入后无法恢复旧状态 | 当前无 migration / import 实现和备份方案 | 受控迁移前必须备份、dry-run、幂等、对账和 rollback/forward-fix | Data / Ops | 是 |
| 用户误认为 `business_records` 是正式入口 | 旧书签或培训资料可能继续指向旧路径 | Dashboard 和正式菜单已指向 V1；重叠旧路径访问时重定向到正式 V1 入口 | 正式菜单继续指向 V1；客户培训说明旧路径已退出 | UI / Docs | 是 |
| 出货放行误读为已发货 | `shipping-release` / `outbound` 旧快照可能和 `shipping_released` 混用 | 文档反复强调 `shipping_released != shipped` | 禁止自动生成 shipments / inventory facts；出货事实单独评审 | Workflow / Shipment | 是 |
| 财务快照误写财务事实 | 旧 reconciliation/payables/receivables/invoices 记录可能被当正式应收应付 | finance facts 尚未落地；旧入口只是快照 | finance review 前只保留 source snapshot；不得自动生成 AR/AP/invoice/payment | Finance | 是 |
| Workflow source 切换破坏移动端任务 | workflow_tasks source_type/source_id 可能仍指向旧 module 和 record | mobile task、linked navigation、workflow helper 使用旧 source key | source cutover 单独评审；兼容期保留旧 source 跳转 | Workflow / Mobile | 是 |

## 主要风险 / Top Risks

| 优先级 | 风险 | 当前处理 |
|---:|---|---|
| P0 | 双真源 / 双写 | `partners / project-orders` 旧路径已重定向到 V1；后续迁移 / 归档和 API 层限制需单独评审 |
| P0 | 自动迁移误写正式数据 | 后续必须先做 dry-run，不允许直接 backfill |
| P1 | 旧 `business_records` 路径仍可能被旧书签访问 | 重叠旧路径只重定向到 V1；后续再做迁移、归档或客户培训说明 |
| P1 | 用户误认为旧入口仍是正式入口 | UI / docs 已改为正式 V1 入口；后续补客户培训说明 |
| P1 | 出货 / 财务事实被旧快照伪造 | 继续保持 Workflow / Fact 边界和禁止自动映射 |
