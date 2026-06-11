Doc Type / 文档类型: Business Records Reference Audit / business_records 引用审计
Status / 状态: Audit / 审计
Runtime Implemented / 运行时已实现: Yes / 是
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录引用审计 / business_records Reference Audit

本审计记录当前仓库中 `business_records / business_record_items / business_record_events` 的引用面和过渡建议；当前已同步删除旧路径权限别名，并将普通 `business` API 写操作全量冻结为 legacy/archive 只读。本审计不执行 schema、migration、seedData、真实数据迁移或删除。

结论先行：

- `business_records` 仍是兼容层、demo、seed、source snapshot、调研入口和旧页面承载层，但普通业务 API 只允许查询。
- `business_records` 不再作为任何正式业务对象的可写真源。
- `business_records` 不得替代库存、采购入库、采购退货、采购入库调整、批次、质检、出货或财务事实真源。
- 与 V1 正式模型重叠的旧前端入口已不再保留产品路由、菜单权限别名或旧路径重定向；普通 `business` JSON-RPC 已拒绝全部模块 create / update / delete / restore；历史数据后续应进入迁移 dry-run、归档或人工确认流程，不能双写。

## 引用审计清单

| 引用 | 当前作用 | 引用类型 | 与 V1 正式模型是否重叠 | 建议 |
|---|---|---|---:|---|
| `server/internal/data/model/schema/business_record.go` | `business_records` Ent schema，保存 module、单号、标题、状态、客户/供应商/产品/物料/仓库快照、数量、金额、日期、payload 和软删除信息 | runtime / compatibility / source snapshot | 是，partners / products / project-orders 与 V1 MasterData / Source Document 重叠 | keep；不得改 schema；后续重叠领域只作为 snapshot / audit source |
| `server/internal/data/model/schema/business_record_item.go` | `business_record_items` Ent schema，保存通用明细、联系人明细、产品 / 物料 / 数量 / 金额快照和 payload | runtime / compatibility / source snapshot | 是，partners 联系人和 project-orders 明细与 contacts / sales_order_items 重叠 | keep；后续只作为 source snapshot，迁移前需 dry-run |
| `server/internal/data/model/schema/business_record_event.go` | 记录通用业务记录创建、更新、删除、恢复等事件 | runtime / audit / compatibility | 间接重叠 | keep；仅作历史审计线索，不替代 V1 usecase 审计 |
| `server/internal/data/model/ent/businessrecord*`、`businessrecorditem*`、`businessrecordevent*` | Ent generated code，承接 legacy/archive 查询、历史夹具和 archive guard 需要；普通业务写入不再以 generated code 作为正式入口 | generated runtime | 是 | keep；本轮不得改 generated code |
| `server/internal/data/model/migrate/20260423090005_migrate.sql`、`20260425153557_migrate.sql`、`20260426033346_migrate.sql`、`20260426095103_migrate.sql` | 历史 migration 中包含 `business_records` 及其与采购事实的兼容关系 | migration / compatibility | 是 | keep；不得改历史 migration；后续只追加新迁移，不能回写 |
| `server/internal/biz/business_record.go` | 通用业务记录模块列表、编号前缀、字段模型和只读 archive guard；普通 create / update / delete / restore usecase 全量拒绝 | runtime / compatibility | 是，模块中包含 `partners`、`products`、`project-orders` 等旧快照 | keep；只保留查询 / 审计，不允许普通业务写入 |
| `server/internal/data/business_record_repo.go` | `business_records` repo 只保留 legacy/archive 查询；创建、更新、软删除、恢复均受 archive read-only guard 保护 | runtime / compatibility | 是 | keep；不得用于向领域模型双写 |
| `server/internal/data/jsonrpc_business.go` | `business` JSON-RPC 域：`list_records` 查询 legacy/archive；`dashboard_stats` 只读领域 usecase 投影；create / update / delete / restore 返回 archive readonly | API / compatibility | 是 | keep archive read；普通写入已冻结 |
| `server/internal/data/jsonrpc.go` | 注册 `business` JSON-RPC 域 | API / compatibility | 间接重叠 | keep |
| `server/internal/biz/rbac.go`、`server/internal/biz/rbac_test.go` | `business.record.*` 权限仍保护通用业务记录 API | RBAC / compatibility | 间接重叠 | keep；不得把菜单隐藏当安全边界 |
| `server/internal/biz/debug_seed.go`、`server/internal/data/debug_seed_repo.go`、`server/internal/data/jsonrpc_debug.go` | debug seed / cleanup 可显式创建和清理带 debug 标记的 archive fixture；不属于正式业务事实写入 | seed/demo / QA / compatibility | 间接重叠 | keep as demo；必须保持 debug 标记、权限边界和非正式事实口径 |
| `server/internal/biz/purchase_receipt.go`、`purchase_return.go`、`purchase_receipt_adjustment.go` | 采购事实对象保留可选 `business_record_id` 兼容来源快照 | compatibility / source snapshot | 不与 V1 MasterData / Sales Order 直接重叠，但与旧业务快照有关 | keep；不得反向把 `business_records` 当采购事实真源 |
| `server/internal/data/purchase_receipt_repo.go`、`purchase_return_repo.go`、`purchase_receipt_adjustment_repo.go` | 采购事实 repo 处理可选 `business_record` edge / id | compatibility / source snapshot | 间接重叠 | keep；后续只保留 source reference |
| `server/internal/biz/business_record_test.go`、`server/internal/data/business_record_repo_test.go` | 覆盖通用记录 module guard、编号、软删除、查询等行为 | test / compatibility | 是 | keep；后续只读化时需新增或调整测试 |
| `server/internal/biz/debug_seed_test.go`、`server/internal/data/debug_seed_repo_test.go`、`jsonrpc_debug_test.go` | 覆盖 demo/debug seed 和 cleanup | test / seed/demo | 间接重叠 | keep as demo；不得把 demo 数据当正式数据 |
| `web/src/erp/api/businessRecordApi.mjs` | 前端通用业务记录 JSON-RPC client | UI / API compatibility | 是 | keep；V1 正式页面不得与它双写 |
| `web/src/erp/pages/BusinessModulePage.jsx` | 通用业务模块页面，列表、弹窗、保存、删除、恢复、打印、任务协同和 source prefill 都围绕 `business_records`；`partners / project-orders` 已不再挂载旧通用业务页 | UI / runtime compatibility | 是，承载 products 等仍保留的旧通用入口；不再承载 partners / project-orders 旧路径 | keep for non-disabled compatibility modules；其他重叠领域后续评审 |
| `web/src/erp/config/businessModules.mjs` | 定义通用业务模块文案和边界；`partners`、`project-orders` 旧模块定义已删除，正式入口由 `customers / suppliers / sales_orders` V1 路径直接注入菜单 section | UI config / formal entry | 是 | keep formal V1 entries；不再保留旧产品入口配置 |
| `web/src/erp/config/businessRecordDefinitions.mjs` | 定义通用业务记录表单、表格、明细和 master-record 选择；`partners`、`products`、`project-orders` 有专门 override | UI config / compatibility | 是 | needs manual review；后续避免继续扩展重叠领域核心字段 |
| `web/src/erp/config/seedData.mjs` | 初始化导航、模块和示例数据入口 | seed/demo / UI config | 是 | keep as demo；本轮禁止改；后续要单独评审 seedData 与 V1 菜单切换 |
| `web/src/erp/config/docs.mjs` | 原前端 docs registry 已移除 | docs/help | 否 | removed；产品内文档中心不再作为运行时入口 |
| `web/src/erp/config/dashboardModules.mjs` | Dashboard 快捷模块已指向 `客户档案`、`供应商档案`、`销售订单` 正式 V1 路径 | UI / formal entry | 否，已退出旧重叠入口 | keep formal V1 entry；旧兼容路由不再作为 dashboard 入口 |
| `web/src/erp/config/menuPermissions.mjs`、测试；`server/internal/biz/admin_menu_permission.go`、测试 | 菜单权限选项已包含正式 V1 路径；旧 `/erp/master/partners`、`/erp/sales/project-orders` 在前后端权限归一化中均不再归一到正式入口，解析为空权限 key | UI / RBAC display | 否，已退出旧重叠入口 | keep formal V1 options；不能把菜单隐藏当后端安全边界 |
| `web/src/erp/router.jsx` | 挂载 V1 页面：`/erp/master/partners/customers`、`/erp/master/partners/suppliers`、`/erp/sales/project-orders/sales-orders`；旧 `/erp/master/partners`、`/erp/sales/project-orders` 不再挂载旧页面或重定向 | UI route | 是 | keep formal V1 routes；避免旧入口和 V1 页面双写同一真源 |
| `web/src/erp/utils/businessRecordForm.mjs` | 通用记录保存转换、明细金额派生、partners 联系人摘要和 products 标题兜底 | UI helper / compatibility | 是 | needs manual review；重叠领域不能继续把转换结果当 Product Core |
| `web/src/erp/utils/businessRecordSourcePrefill.mjs` | 跨模块 source prefill，从 project-orders / products / material-bom 等旧记录带值 | UI helper / source snapshot | 是 | keep as source snapshot；切换来源必须防残值和伪造值 |
| `web/src/erp/utils/businessRecordMasterSelection.mjs` | 从 `partners` / `products` 通用记录选择客户、供应商、产品并保存快照 | UI helper / compatibility | 是 | replace by V1 for overlapping domains；本轮只审计 |
| `web/src/erp/utils/linkedNavigation.mjs` | 旧业务链路导航使用 `project-orders` 等 module key | UI helper / compatibility | 是 | make read-only later for overlapping source |
| `web/src/erp/utils/orderApprovalFlow.mjs` | 老 `project-orders` 审批任务以 `business_records` 为 source | workflow helper / compatibility | 是，与 `sales_orders` Source Document 重叠 | deprecate later；不得把 workflow done 当 sales order fact |
| `web/src/erp/utils/purchaseInboundFlow.mjs`、`outsourceReturnFlow.mjs`、`finishedGoodsFlow.mjs`、`shipmentFinanceFlow.mjs`、`payableReconciliationFlow.mjs` | 旧通用业务链路从兼容记录派生协同任务或展示状态 | workflow helper / compatibility / demo | 间接重叠 | needs manual review；不得生成 inventory / shipment / finance facts |
| `web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | 移动端任务详情按 source_type 跳转和展示兼容记录 | UI / compatibility | 间接重叠 | keep until source route cutover |
| `web/src/erp/docs/*` | 原帮助中心、开发验收和高级文档 Markdown 已移除 | docs/help / compatibility | 否 | removed；正式口径回到 `docs/` 和 README |
| `docs/current-source-of-truth.md` | 当前状态入口，同时说明 `business_records` 仍是兼容层且 V1 已完成到 UI | docs/source index | 是 | update with 009 audit note |
| `docs/product/business-records-transition-plan.md` | 既有 transition plan，明确兼容层定位和不得直接删除 | docs/plan | 是 | update with 009 audit outputs |
| `docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md` | 记录当前 V1 正式模型状态、roadmap 阶段和 `business_records` 退出方向 | docs/plan | 是 | keep；旧 V1 schema draft / cutline / go-no-go 文件已从活跃文档树删除 |
| `docs/architecture/*business*`、`docs/architecture/*source-document*`、`docs/architecture/*purchase*`、`docs/architecture/*shipment*` | 架构评审文档反复声明 `business_records` 是快照 / 兼容层，不替代事实 | docs/architecture | 是 | keep；后续 runtime cutover 前继续作为边界输入 |
| Phase 2 历史变更记录 | 历史记录曾说明专表落地时不删除、不迁移、不替代 `business_records` | docs/history | 间接重叠 | 已从当前 docs 入口清理；当前口径以 `docs/current-source-of-truth.md`、代码和测试为准 |
| `web/src/erp/config/businessRecordDefinitions.test.mjs`、`businessRecordForm.test.mjs`、`businessRecordItemLayout.test.mjs`、`linkedNavigation.test.mjs` 等 | 覆盖旧通用页面配置、表单转换、滚动布局、source linkage 和链路派生 | test / compatibility | 是 | keep；后续 cutover 时必须调整测试语义 |
| `web/src/mocks/jsonRpcMockServer.js` | 前端测试 mock 包含通用业务记录接口 | test / compatibility | 间接重叠 | keep |
| `web/scripts/styleL1.mjs` | 浏览器级 L1 覆盖旧业务页和通用 business record 表单状态 | test / UI regression | 是 | keep until UI cutover；切换 V1 入口需新增回归 |

## 重叠矩阵

| `business_records` 入口 / 模块 | 当前承载 | V1 / 已有正式模型 | 重叠风险 | 过渡建议 |
|---|---|---|---|---|
| `partners` | 客户、潜在客户、合作供应商、联系人明细、付款 / 税号 / 地址快照 | `customers`、`suppliers`、`contacts` | 高：两套主数据可写会形成双真源 | replace by V1；旧记录保留为 source snapshot；迁移 dry-run 后只读 / demo 化 |
| `products` | 产品资料编号、分类、规格/图号、中英文描述、款式编号、产品编号 / SKU、附件 | existing `products`；`product_skus` 仍 draft-only | 高：可能重复 existing `products`，也可能把 SKU 草案误写成正式模型 | replace by existing products；保留旧记录为产品资料快照；SKU 需人工评审 |
| `project-orders` | 订单 / 款式立项、客户订单号、款式 / 产品 / 数量 / 交期、订单明细 | `sales_orders`、`sales_order_items` | 高：正式 Source Document 与旧订单入口并存可写 | replace by V1；不自动生成 shipment / inventory / finance facts |
| `material-bom` | BOM 快照、物料明细、损耗、组装部位、供应商料号 | existing `bom_headers`、`bom_items`、`materials`、`units` | 中：旧快照可能与 BOM / 物料真源重复 | keep as source snapshot；正式 BOM / materials 由已有模型承接 |
| `accessories-purchase` / `processing-contracts` | 辅包材采购、委外加工合同快照 | future purchase source document；existing purchase receipt / return / adjustment facts | 中：不可替代采购事实或未来采购承诺 | keep as source snapshot；不自动变 purchase facts |
| `inbound` / `inventory` | 入库 / 库存展示和兼容记录 | `purchase_receipts`、`purchase_returns`、`purchase_receipt_adjustments`、`inventory_txns`、`inventory_balances`、`inventory_lots` | 高：若继续写库存数量会与事实表冲突 | make read-only for facts；库存事实只看专表 |
| `quality-inspections` | 旧质检协同 / 快照入口 | `quality_inspections` | 中：旧页面不能替代质检判定真源 | keep as demo/source snapshot；正式判定走 QualityUsecase |
| `shipping-release` / `outbound` | 出货放行、出库协同和快照 | future `shipments` / `shipment_items`，current workflow `shipping_released` | 高：`shipping_released` 容易被误读为 shipped | keep compatibility；不得自动映射成出货事实 |
| `reconciliation` / `payables` / `receivables` / `invoices` | 对账、应付、应收、发票快照和任务协同 | future finance facts | 高：财务事实尚未落地，不能由旧快照伪造 | keep as demo/source snapshot；等待 finance review |

## 继续保留范围

| 范围 | 是否可继续保留 | 边界 |
|---|---:|---|
| 历史通用业务记录 | 是 | 只做历史查看、打印、审计和迁移来源，不覆盖正式模型 |
| demo / seed / debug 数据 | 是 | 必须标记为 demo / debug；不能当正式客户事实 |
| 调研入口和 source snapshot | 是 | 用于人工整理、导入 dry-run 和 unresolved queue |
| 尚未拆专表的低风险通用记录 | 有条件 | 不影响库存、出货、财务和已落地 MasterData / Source Document |
| 重叠领域继续新增核心字段 | 否 | customers / suppliers / contacts / sales_orders / products 等应转向正式模型 |
| 从旧记录自动生成库存、出货、财务事实 | 否 | 没有事实依据不得生成 |

## 引用缺口

| 缺口 | 影响 | 下一步 |
|---|---|---|
| 已完成当前 dev DB 统计与受控 cleanup | `partners` 旧记录为 0；`project-orders` 旧记录总数为 4、active 为 0、deleted 为 4，均为 debug seed；清理后 `workflow_tasks.source_type=project-orders` 和 `workflow_business_states.source_type=project-orders` 均为 0；采购事实 `business_record_id` 引用为 0；V1 正式表当前为 0 | 不需要把当前 dev DB 的 `partners / project-orders` 数据迁移到 V1；后续客户库或生产库仍需按库单独统计，不能套用 dev DB 清理结论 |
| 已改正式菜单 / dashboard / 菜单权限 / API 写入 | `客户档案`、`供应商档案`、`销售订单` 已进入正式入口；旧 `partners / project-orders` 产品入口、旧路径重定向和权限别名均已移除；普通 `business` API 已冻结旧模块写操作 | 后续单独评审旧数据迁移、归档或删除 |
| 生成代码引用数量较多 | 文件级审计可确认存在，但不应手改 generated code | 后续 runtime cutover 不触碰 generated code，除非 schema/migration 任务 |
