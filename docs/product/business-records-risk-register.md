Doc Type: Business Records Risk Register
Status: Audit
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# Business Records Risk Register

本风险登记只覆盖 `business_records` 兼容层过渡，不代表任何 runtime 防护已经实施。

| Risk | Impact | Evidence | Mitigation | Owner Layer | Next review needed |
|---|---|---|---|---|---:|
| 双真源风险 | 同一客户、供应商、联系人或订单在旧入口和 V1 正式模型中各自可写，后续无法判断谁是准 | `partners`、`project-orders` 仍在通用业务页；V1 pages 已新增 | 重叠领域进入只读 / demo 化；正式写入只走 V1 usecase | Product / UI / API | 是 |
| 双写风险 | 同一操作同时写 V1 和 `business_records`，导致状态、字段和审计分裂 | 旧 `BusinessModulePage` 和 V1 页面并存 | 禁止双写；旧记录仅做 source snapshot；后续 runtime Goal 加写入限制 | API / UI / Data | 是 |
| demo 数据误当正式数据 | debug seed 或样本被导入正式模型，污染客户资料和订单 | `debug_seed`、`seedData`、mock 和 QA 文档仍引用 `business_records` | 保留 debug/demo 标记；import dry-run 排除 demo/debug | Data Import / QA | 是 |
| current 客户字段污染 Product Core | 客户专属字段变成通用必填字段，后续产品化失败 | `partners`、`products`、current 样本含付款、税号、地址、SKU 等字段 | 字段先分类为 Product Core Candidate / Customer Material / Print Template Input / Import Adapter | Productization | 是 |
| `business_records` orders 误当 `sales_orders` | 旧 `project-orders` 状态、数量或未出货数被当正式 Source Document 或出货结果 | `project-orders` 定义包含订单数量、生产数量、未出货数 | 只做 dry-run；正式 sales order 不写 shipment / inventory / finance facts | Sales / Data | 是 |
| `business_records.products` 与 `products` schema 重复 | 旧产品资料页继续新增核心字段，形成第二套产品主档 | existing `products` 已是成品主数据；旧 `products` 仍在业务模块 | 旧 products 只保留 source snapshot；正式产品能力复用 existing `products` | MasterData | 是 |
| partners 同时对应 customers / suppliers | 同一 `partners` 记录可能是客户、供应商、加工厂或潜在客户，自动拆分可能错 | `payload.partner_type` 是文本分类，历史数据可能缺值或不一致 | 按 partner_type dry-run；无法唯一判断进入人工确认 | MasterData / Data Import | 是 |
| 旧页面继续新增功能导致 V1 失焦 | 新功能继续堆到通用页面，V1 正式模型长期无法成为主路径 | `BusinessModulePage` 功能完整，V1 页面仍未进 seedData/docs registry | 停止重叠领域新增核心能力；单独做菜单和只读化 Goal | Product / UI | 是 |
| 自动迁移误写正式数据 | 缺值、重名、单位不匹配或 payload 语义错误导致正式表污染 | 旧记录字段包含自由文本、float 数量和 payload | 先 dry-run；输出 unresolved queue；人工确认后才迁移 | Data Import / Ops | 是 |
| 删除 `business_records` 破坏历史文档 / demo / QA | 旧帮助、debug、L1、mock、移动端任务和历史记录不可用 | 引用审计显示后端、前端、docs、tests 多处依赖 | 禁止直接删除；先只读 / archive；保留历史查看 | Product / QA / Ops | 是 |
| seedData / docs registry 修改引发前端回归 | 菜单、权限、帮助入口和 L1 场景受影响 | `seedData.mjs`、`docs.mjs` 是前端入口真源，本轮禁止修改 | 单独菜单入口 Goal；跑前端 lint/css/test/style:l1 | UI / QA | 是 |
| 迁移后无法回滚 | 正式表被错误写入后无法恢复旧状态 | 当前无 migration / import 实现和备份方案 | 受控迁移前必须备份、dry-run、幂等、对账和 rollback/forward-fix | Data / Ops | 是 |
| 用户误认为 `business_records` 是正式入口 | 旧页面仍有完整表单和保存能力，容易继续用于正式业务 | Dashboard、menu、BusinessModulePage、帮助文档仍暴露旧入口 | UI 文案标识 compatibility / demo / read-only；正式菜单指向 V1 | UI / Docs | 是 |
| 出货放行误读为已发货 | `shipping-release` / `outbound` 旧快照可能和 `shipping_released` 混用 | 文档反复强调 `shipping_released != shipped` | 禁止自动生成 shipments / inventory facts；出货事实单独评审 | Workflow / Shipment | 是 |
| 财务快照误写财务事实 | 旧 reconciliation/payables/receivables/invoices 记录可能被当正式应收应付 | finance facts 尚未落地；旧入口只是快照 | finance review 前只保留 source snapshot；不得自动生成 AR/AP/invoice/payment | Finance | 是 |
| Workflow source 切换破坏移动端任务 | workflow_tasks source_type/source_id 可能仍指向旧 module 和 record | mobile task、linked navigation、workflow helper 使用旧 source key | source cutover 单独评审；兼容期保留旧 source 跳转 | Workflow / Mobile | 是 |

## Top Risks

| 优先级 | 风险 | 当前处理 |
|---:|---|---|
| P0 | 双真源 / 双写 | 009 只输出审计和计划；后续 runtime Goal 才能限制写入 |
| P0 | 自动迁移误写正式数据 | 后续必须先做 dry-run，不允许直接 backfill |
| P1 | seedData / docs registry 切换影响前端 | 单独菜单入口 Goal，不能混在审计里 |
| P1 | 用户误认为旧入口仍是正式入口 | 后续 UI / docs 标识只读或 deprecated |
| P1 | 出货 / 财务事实被旧快照伪造 | 继续保持 Workflow / Fact 边界和禁止自动映射 |
