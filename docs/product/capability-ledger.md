# 产品能力进度台账 / Product Capability Ledger

本文是 plush-toy-erp 的全局产品能力进度台账。它只回答产品内核、行业模板、配置能力和交付工具的成熟度问题；客户交付状态和客户差异明细按客户拆到 `docs/customers/<customer-key>/`。

## 0. 文档边界

- 全局能力台账只有一份：`docs/product/capability-ledger.md`。
- 客户交付矩阵一客户一份：`docs/customers/<customer-key>/delivery-matrix.md`。
- 客户差异台账一客户一份：`docs/customers/<customer-key>/delta-ledger.md`。
- 原 `docs/product/product-delivery-ledgers.md` 只保留三类台账索引和维护关系，不再承载完整表格。

## 1. 台账总原则

### 1.1 产品化原则

本项目采用：

- 一套标准产品内核。
- 一个毛绒玩具行业模板。
- 多个客户配置包。
- 少量客户专属打印样本记录 / 数据适配。
- 极少数客户扩展。
- 核心业务代码尽量不分叉。

### 1.1.1 打印样本当前处理原则

当前阶段不建立 Print Template 产品内核，也不把 yoyoosun 单一客户合同样式抽成行业默认模板。打印相关资料只按客户打印样本、交付说明或差异线索记录；不新增模板 schema、不实现模板设计器、不做通用渲染引擎，也不让打印格式反向决定 schema、fact、workflow 或 API。只有至少 2-3 个真实客户出现同类单据、字段来源稳定且差异主要是抬头 / 字段显示 / 版式微调时，才重新评审是否进入 `PRINT-TEMPLATE-CORE-MVP`。

### 1.2 当前阶段禁止项

当前阶段禁止：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把任一客户资料直接写成 Product Core。
- 不让 Workflow 写库存、出货、财务、应收、应付、发票、收付款事实。
- 不把 `business_records` 当长期事实真源。

### 1.3 Workflow / Fact 边界

核心口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

关键边界：

- `Workflow task done != Fact posted`
- `shipment_release done -> shipping_released`
- `shipping_released != shipped`
- `sales_order` 是 Source Document，不是 shipment fact
- `inventory_txns` 才是库存落账事实
- shipment / inventory / finance facts 不能从 workflow 或旧快照自动生成

---

## 2. 能力成熟度定义

产品能力进度统一使用 L0 到 L8。

| 等级 | 名称           | 含义                                            | 是否可对客户承诺   |
| ---: | -------------- | ----------------------------------------------- | ------------------ |
|   L0 | Not Started    | 未开始，只在路线图里                            | 否                 |
|   L1 | Discussed      | 已讨论，有初步口径                              | 否                 |
|   L2 | Reviewed       | 已做架构 / 业务评审                             | 否                 |
|   L3 | Drafted        | 有 schema draft / design draft / data map draft | 否                 |
|   L4 | Schema Ready   | schema / migration / generated code 已完成      | 否                 |
|   L5 | Runtime Ready  | repo/usecase 已完成，后端核心逻辑可测           | 内部可测           |
|   L6 | API Ready      | API/RBAC 已完成                                 | 内部可联调         |
|   L7 | UI Ready       | 前端页面可操作                                  | 可试用，但需标边界 |
|   L8 | Delivery Ready | 数据、权限、菜单、部署、培训、验收都可交付      | 可对客户承诺       |

对数据导入 CLI、freeze checker、evidence tooling 和受控 execution loader 等非业务 runtime 能力，L5 只表示内部工具逻辑、门禁和测试已可运行，不表示已经对客户库执行 DB 写入、取得客户导入批准或完成导入后对账。

### 2.1 状态用语规则

只有满足以下条件，才允许写“已完成”：

- 有代码路径。
- 有测试命令。
- 有审查报告。
- 没有违反禁止项。
- 文档明确了不包含哪些 deferred 能力。

否则只能写：

- 已评审。
- 草案。
- 待实现。
- 内部可测。
- 客户试用候选。
- 交付待验收。

---

## 3. 产品能力进度台账说明

产品能力进度台账用于追踪 Product Core / Industry Template / Customer Config / Customer Extension 的能力成熟度。

每一行表示一个可独立规划、开发、测试和验收的产品能力。

### 3.1 字段说明

| 字段           | 说明                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Capability ID  | 能力编号                                                                                              |
| 能力名称       | 产品能力名                                                                                            |
| 所属层         | Product Core / Industry Template / Customer Config / Customer Extension / Delivery / Help / Reporting |
| 业务域         | MasterData / Order / Inventory / Workflow / Finance 等                                                |
| 当前成熟度     | L0-L8                                                                                                 |
| 当前结果       | 当前已具备的能力                                                                                      |
| 当前不包含     | 防止误解的边界说明                                                                                    |
| 证据           | 文档、代码、测试、审查报告路径                                                                        |
| 下一步         | 下一轮要做什么                                                                                        |
| 风险           | 当前主要风险                                                                                          |
| 是否可客户试用 | Yes / No / Limited                                                                                    |
| 是否可交付承诺 | Yes / No                                                                                              |

---

## 4. 产品能力进度台账

| Capability ID | 能力名称                                                   | 所属层                 | 业务域                  | 当前成熟度 | 当前结果                                                                                                                                                                                                                                                                                                                         | 当前不包含                                                                                                                          | 证据                                                                                                                                                                                                                                                                                                                                                          | 下一步                                                   | 风险                                                                    | 可客户试用     | 可交付承诺 |
| ------------- | ---------------------------------------------------------- | ---------------------- | ----------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ---------- |
| CAP-000       | 产品化架构骨架                                             | Product Core           | Architecture            |         L7 | 已建立产品原则、分层边界、永绅 yoyoosun 客户边界和实施任务治理                                                                                                                                                                                                                                                                   | 不代表业务闭环完成                                                                                                                  | `docs/product/*`、`docs/architecture/*`                                                                                                                                                                                                                                                                                                                       | 持续维护 current-source-of-truth                         | 文档多，需防信息差                                                      | Yes            | No         |
| CAP-001       | Workflow / Fact 边界                                       | Product Core           | Architecture / Workflow |         L7 | 已明确 `workflow done != fact posted`、`shipping_released != shipped`                                                                                                                                                                                                                                                            | 不代表 shipment facts 已实现                                                                                                        | `docs/architecture/status-workflow-fact-boundary.md`                                                                                                                                                                                                                                                                                                          | 后续 shipment / finance 继续复用                         | UI 文案可能误导                                                         | Yes            | No         |
| CAP-002       | 永绅 yoyoosun 客户资料治理                                 | Customer Config        | Productization          |         L6 | 已建立 永绅 yoyoosun 客户资料、导入来源、字段分类、dry-run 草案、source freeze、real dry-run evidence 和受控 execution loader 口径                                                                                                                                                                                               | 当前不可执行真实导入                                                                                                                | `docs/customers/yoyoosun/*import*.md`、`docs/customers/yoyoosun/*freeze*.md`                                                                                                                                                                                                                                                                                  | simulated data trial rehearsal                           | 永绅 yoyoosun 字段污染 Product Core                                     | Limited        | No         |
| CAP-003       | customers 主数据                                           | Product Core           | MasterData              |         L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                                                                                                                                                                                                                                                         | 地址、账期、信用额度未做                                                                                                            | `customer.go`、`masterdata.go`、`jsonrpc_masterdata_order.go`、V1 UI                                                                                                                                                                                                                                                                                          | 模拟数据试用 / 菜单入口评审                              | 当前不可导入真实客户数据                                                | Yes            | No         |
| CAP-004       | suppliers 主数据                                           | Product Core           | MasterData              |         L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                                                                                                                                                                                                                                                         | 供应商物料档案、结算资料未做                                                                                                        | `supplier.go`、`masterdata.go`、V1 UI                                                                                                                                                                                                                                                                                                                         | 菜单入口评审 / 数据导入                                  | supplier_type 后续可能细化                                              | Yes            | No         |
| CAP-005       | contacts 联系人                                            | Product Core           | MasterData              |         L7 | 支持 customer / supplier owner，usecase guard 已完成，UI 区块已完成                                                                                                                                                                                                                                                              | DB 无跨表强 FK，依赖 usecase guard                                                                                                  | `contact.go`、`masterdata.go`、V1 UI                                                                                                                                                                                                                                                                                                                          | 导入 dry-run / API smoke                                 | 直接 SQL 可能绕过 guard                                                 | Yes            | No         |
| CAP-006       | sales_orders 销售订单源单据                                | Product Core           | Order                   |         L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                                                                                                                                                                                                                                                         | 不含出货事实、库存扣减、应收、发票                                                                                                  | `sales_order.go`、`sales_order.go usecase`、V1 UI                                                                                                                                                                                                                                                                                                             | 菜单入口 / 真实试用                                      | 甲方可能误认为已出货闭环                                                | Yes, with note | No         |
| CAP-007       | sales_order_items 销售订单明细                             | Product Core           | Order                   |         L7 | 支持新增、编辑、取消/移除、列表                                                                                                                                                                                                                                                                                                  | 不含 `shipped_quantity`、product_sku                                                                                                | `sales_order_item.go`、V1 UI                                                                                                                                                                                                                                                                                                                                  | 产品/单位选择器                                          | 当前 UI 产品/单位暂用 ID                                                | Limited        | No         |
| CAP-008       | business_records 旧入口退出                                | Productization         | Compatibility           |         L5 | 已完成引用审计、cutover plan、data map draft、risk register；`partners / project-orders` 旧入口定义、旧路径重定向和权限别名已删除，正式菜单和权限选项只保留 V1 入口，普通 `business` API 已冻结旧模块写操作；当前 dev DB 中 `partners=0`，`project-orders` 4 条 debug seed 已软归档，相关 debug workflow task / state 已清理为 0 | 未做客户库 / 生产库迁移、删除或客户可见归档承诺；其他旧模块仍按领域后续评审                                                         | `docs/product/business-records-*.md`、`businessModules.mjs`、`router.jsx`、`rbac.go`、`business_record.go`                                                                                                                                                                                                                                                    | business_records data migration / archive decision       | 旧书签和历史数据仍需培训和迁移口径                                      | Limited        | No         |
| CAP-009       | 永绅 yoyoosun 客户导入 tooling / evidence / execution gate | Delivery               | Data Import             |         L5 | 已具备 source inventory、field classification、dry-run plan、unresolved queue、acceptance checklist、只读 dry-run CLI、source freeze / evidence preparation 和受控 JSON-RPC execution loader；当前没有客户真实数据，执行器只用于报告模式、门禁校验和模拟数据试用前确认；Phase 7 模拟主数据 seed、模拟数据入口和本地模拟试用验收记录已新增，Phase 7 已按本地模拟试用关闭 | 当前不可执行真实导入，不写 `business_records`，模拟数据不转成真实导入结论                                                         | `docs/customers/yoyoosun/import-*.md`、`docs/customers/yoyoosun/source-snapshot-freeze.md`、`docs/customers/yoyoosun/real-dry-run-evidence.md`、`docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`、`scripts/import/customerImportDryRun.mjs`、`scripts/import/customerSourceSnapshotFreezeCheck.mjs`、`scripts/import/customerImportExecute.mjs`、`scripts/seed-phase7-sim-masterdata.sh`、`scripts/qa/phase7-simulated-trial-data.mjs` | Phase 8 implementation gate / target trial rerun          | 字段语义仍需人工确认，execution loader 和模拟数据都不能被误读成真实导入 | No             | No         |
| CAP-010       | V1 前端页面                                                | Product Core           | UI                      |         L7 | customers / suppliers / contacts / sales_orders 页面、路由、桌面正式菜单、dashboard 入口和前后端菜单权限选项已完成；旧重叠路径不再保留产品内路由、重定向或权限别名；前端桌面菜单已接入客户菜单 config loader；本地 Phase 7 浏览器入口 smoke 已通过                                              | 产品内 docs registry 已下线；客户菜单 loader 只控制前端菜单，不替代后端 RBAC；本地 smoke 不等于目标客户环境验收      | `V1MasterDataPage.jsx`、`V1SalesOrdersPage.jsx`、`businessModules.mjs`、`router.jsx`、`rbac.go`、`customerMenuConfig.mjs`、`trial-training-note.md`、`trial-account-role-menu-checklist.md`、`trial-environment-runbook.md`、`phase7-simulated-trial-acceptance.md`                                                                                                                                   | target trial browser rerun / trial feedback              | 旧书签、正式入口和账号权限仍需目标环境确认                              | Yes, with note | No         |
| CAP-011       | V1 API/RBAC                                                | Product Core           | API / RBAC              |         L7 | JSON-RPC API + 动作权限已完成；试用账号角色菜单核对清单已明确普通试用账号不使用 super admin、不分配 debug_operator，岗位任务端只认 `mobile.<role>.access`；本地 9 个 `demo_*` 账号已通过 RBAC 核对                                                                                                                      | 未接客户化角色模板 runtime；目标客户环境真实账号核对未完成                                                                                      | `jsonrpc_masterdata_order.go`、`rbac.go`、`trial-account-role-menu-checklist.md`、`trial-environment-runbook.md`、`phase7-simulated-trial-acceptance.md`                                                                                                                                                                                                                                              | target trial account setup / RBAC rerun                  | JSON-RPC handler 位于 data 层历史架构；权限模板还需目标环境核对         | Yes, with note | No         |
| CAP-012       | 产品 / materials / units / warehouses 既有主数据           | Product Core           | MasterData              |      L5-L7 | 已有既有 schema / runtime 能力                                                                                                                                                                                                                                                                                                   | 本台账未重新评审全部 UI/API                                                                                                         | 既有代码和 docs                                                                                                                                                                                                                                                                                                                                               | 后续与导入和 SKU 评审对齐                                | 与 business_records products 可能重叠                                   | Limited        | No         |
| CAP-013       | product_skus                                               | Product Core           | Product / SKU           |         L3 | Draft Only                                                                                                                                                                                                                                                                                                                       | 未落 schema / runtime / UI                                                                                                          | `docs/architecture/product-sku-bom-boundary-review.md`、roadmap 未来专项评审                                                                                                                                                                                                                                                                                  | SKU/BOM version review                                   | 不能因颜色字段直接落 SKU                                                | No             | No         |
| CAP-014       | BOM 版本能力                                               | Product Core           | BOM                     |      L3-L4 | 现有 BOM 真源已存在，版本扩展仍 draft                                                                                                                                                                                                                                                                                            | 未做 BOM version extension                                                                                                          | BOM schema / draft docs                                                                                                                                                                                                                                                                                                                                       | product-sku-bom-version-review                           | 重复设计风险                                                            | No             | No         |
| CAP-015       | purchase_orders 采购承诺                                   | Product Core           | Purchase                |         L3 | Draft / V2 candidate                                                                                                                                                                                                                                                                                                             | 未落 schema / runtime                                                                                                               | purchase/order boundary docs                                                                                                                                                                                                                                                                                                                                  | purchase-order-usecase-review                            | 不能替代 purchase_receipts                                              | No             | No         |
| CAP-016       | purchase_receipts 采购入库事实                             | Product Core           | Purchase / Inventory    |        L5+ | 既有采购入库事实能力                                                                                                                                                                                                                                                                                                             | 与 future purchase_order 衔接未做                                                                                                   | existing schema / changes docs                                                                                                                                                                                                                                                                                                                                | purchase order linking review                            | 口径需和采购订单对齐                                                    | Limited        | No         |
| CAP-017       | quality_inspections 质检事实                               | Product Core           | Quality                 |        L5+ | 既有质检事实能力                                                                                                                                                                                                                                                                                                                 | 与 Workflow task 对接需评审                                                                                                         | existing schema / usecase                                                                                                                                                                                                                                                                                                                                     | QualityUsecase + workflow review                         | task done 与 quality passed 混淆                                        | Limited        | No         |
| CAP-018       | inventory_txns / balances / lots                           | Product Core           | Inventory               |        L5+ | 既有库存事实基础                                                                                                                                                                                                                                                                                                                 | 出货预留 / outbound 未完成                                                                                                          | existing schema / usecase                                                                                                                                                                                                                                                                                                                                     | stock reservation / outbound review                      | 不可从 sales_order 直接扣库存                                           | Limited        | No         |
| CAP-019       | stock_reservations                                         | Product Core           | Inventory / Shipment    |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：`stock_reservations` schema / migration、usecase、JSON-RPC、最小 UI 和测试已落；预留检查 `inventory_balances - active reservations`，不写库存流水；目标环境内部模拟闭环已覆盖预留 release / consume                                                                 | 客户使用确认属于交付后业务确认；未做并发锁升级、可用量 read model、自动预留或出货自动消耗                                           | `stock_reservation.go`、`phase8.go`、`phase8_repo.go`、`jsonrpc_phase8.go`、`Phase8FactsPage.jsx`、`phase8_repo_test.go`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                 | reservation read model / customer usage feedback          | 预留和出库易混                                                          | Yes, with note | No         |
| CAP-020       | shipments / shipment_items                                 | Product Core           | Shipment                |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：`shipments` / `shipment_items` schema / migration、usecase、JSON-RPC、最小 UI 和测试已落；`SHIPPED` 才代表真实出货；目标环境内部模拟闭环已覆盖 create / add item / ship / cancel                                                                                     | 客户使用确认属于交付后业务确认；未做拣货、装箱、物流、退货、打印或自动应收                                                           | `shipment.go`、`shipment_item.go`、`phase8.go`、`phase8_repo.go`、`jsonrpc_phase8.go`、`Phase8FactsPage.jsx`、`phase8_repo_test.go`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                       | shipment usage feedback / print review                    | `shipping_released != shipped`                                          | Yes, with note | No         |
| CAP-021       | shipment outbound inventory fact                           | Product Core           | Shipment / Inventory    |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：发货按出货行写 `inventory_txns.OUT`，取消已发货出货单写 `inventory_txns.REVERSAL`，测试已覆盖出库和冲正；目标环境内部模拟闭环已核对出货正反库存流水                                                                                                                        | 客户使用确认属于交付后业务确认；未做并发扣减压力测试、退货链路或出货预留自动消耗                                                     | `phase8_repo.go`、`phase8_repo_test.go`、`inventory_txns`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                                                                                 | inventory regression / usage feedback                     | 高风险，必须继续按实现门禁控制                                          | Yes, with note | No         |
| CAP-022       | AR/AP/invoice/payment/reconciliation                       | Product Core           | Finance                 |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：`finance_facts` schema / migration、usecase、JSON-RPC 和最小 UI 已落，支持 draft / posted / settled / cancelled；目标环境内部模拟闭环已覆盖 posted / settled / cancelled                                                                                               | 客户使用确认属于交付后业务确认；未做发票明细、收付款核销、对账单、总账、红冲或自动派生                                               | `finance_fact.go`、`phase8.go`、`phase8_repo.go`、`jsonrpc_phase8.go`、`Phase8FactsPage.jsx`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                                             | finance detail / settlement review / usage feedback       | 不能从放行直接生成财务事实                                              | Yes, with note | No         |
| CAP-023       | production facts                                           | Product Core           | Production              |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：`production_facts` schema / migration、usecase、JSON-RPC、最小 UI 和测试已落；生产领料 / 返工写 OUT，成品入库写 IN，取消写 REVERSAL；目标环境内部模拟闭环已覆盖成品入库过账和取消冲正                                                                                 | 客户使用确认属于交付后业务确认；未接生产订单专表、移动端岗位任务、成本归集或完整报工                                                 | `production_fact.go`、`phase8.go`、`phase8_repo.go`、`jsonrpc_phase8.go`、`Phase8FactsPage.jsx`、`phase8_repo_test.go`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                  | production order review / usage feedback                  | 不能只靠任务状态                                                        | Yes, with note | No         |
| CAP-024       | outsourcing facts                                          | Product Core           | Outsourcing             |         L7 | Phase 8 本地最小实现已完成并已发布到当前目标环境：`outsourcing_facts` schema / migration、usecase、JSON-RPC 和最小 UI 已落；委外发料写 OUT，委外回料写 IN，取消写 REVERSAL；目标环境内部模拟闭环已覆盖无批次委外发料过账和取消冲正                                                                                     | 客户使用确认属于交付后业务确认；委外结算不写入委外库存事实，需进入 `finance_facts`；未做委外订单专表、质检对接或应付自动生成         | `outsourcing_fact.go`、`phase8.go`、`phase8_repo.go`、`jsonrpc_phase8.go`、`Phase8FactsPage.jsx`、`phase8-simulated-fact-closure.mjs`、`phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                                          | outsourcing order review / usage feedback                 | 委外发料/回货/结算要分开                                                | Yes, with note | No         |
| CAP-025       | mobile task entry                                          | Industry Template / UI | Mobile                  |         L7 | Phase 9 已发布目标环境岗位任务端现场留痕、最近动作、保存 evidence、异常报告展示和 `/m/<role>/guide` 兼容跳转修复；目标仓库岗位任务端路由 smoke、试用账号 RBAC 和 `SIM-YOYOOSUN-PHASE9` 内部模拟 workflow 闭环已通过                                                                                                             | 不等于客户已签收；不等于拍照上传 / 附件服务 / 扫码已交付；不从任务端自动写库存、出货、预留或财务事实                                 | `MobileRoleTaskPage.jsx`、`mobileTaskView.js`、`mobileTaskView.test.mjs`、`phase9-simulated-mobile-closure.mjs`、`phase9-target-release-evidence-2026-06-09.md`                                                                                                                                                                                                 | mobile attachment / scan review only after feedback       | 把 workflow evidence 当事实或附件服务                                    | Yes, with note | No         |
| CAP-026       | 永绅 yoyoosun 私有化部署包                                 | Delivery               | Deployment              |      L4-L5 | deployments/yoyoosun README 已有；Phase 8 已执行目标环境发布、migration、健康检查、镜像加载、试用账号 RBAC、登录态只读 API smoke、内部模拟事实写入闭环和 evidence 记录                                                                                                                                                         | 缺首次目标发布前 pre-migration 备份 evidence；已补 post-deploy 逻辑备份；客户使用确认属于交付后业务确认                             | `deployments/yoyoosun/README.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                                                        | post-delivery usage confirmation                         | 后续发布必须先补 pre-migration 备份 evidence                              | Limited        | No         |
| CAP-027       | 客户使用确认体系                                           | Delivery               | Acceptance              |      L3-L4 | 已有导入验收、阶段验收口径；Phase 8 目标环境发布、页面路由、未登录鉴权、试用账号 RBAC、登录态只读 API smoke 和内部模拟事实写入闭环 evidence 已形成                                                                                                                                                                                | 不把客户使用确认作为 Phase 8 完成阻塞；不可把内部模拟闭环写成客户签收或真实导入                                                     | `docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                          | post-delivery usage confirmation                         | 验收口径要业务化，且不能扩大到打印、报表、核销和真实导入                | No             | No         |
| CAP-028       | 行业默认模板清单                                           | Industry Template      | Productization / Menu   |         L3 | Phase 10 已新增 `config/industry-templates/plush/templateConfig.mjs`，把默认角色、桌面菜单、岗位任务模式、字段显示、编号规则、导入模板、培训验收清单和 deferred 项沉淀为 `candidate` 配置；已新增行业模板边界守卫和模拟闭环报告脚本，并从客户默认菜单 / 后端内置菜单移除 `Phase 8` / `事实闭环` 内部工程入口 | 仍不是 runtime loader；不代表 yoyoosun 单客户样本已成为行业默认；不含 Print Template Core、真实导入、附件服务、扫码、报表或 SaaS 能力 | `config/industry-templates/plush/templateConfig.mjs`、`scripts/qa/industry-template-boundaries.mjs`、`scripts/qa/phase10-industry-template-closure.mjs`、`docs/customers/yoyoosun/phase10-target-release-evidence-2026-06-09.md`                                                                                                                             | multi-customer industry review / Phase 11 readiness      | 单客户样本或打印格式被误读为行业标准；candidate 被误接 runtime loader    | Limited        | No         |
| CAP-029       | Customer Config 配置形态                                   | Customer Config        | Productization          |      L2-L3 | 已有公司名、logo、主题色、菜单、字段、编号、角色、权限、初始化数据和打印样本引用等配置项口径；核心前端品牌已改为中性产品名，yoyoosun 配置包已新增品牌 / 桌面菜单展示配置并接入前端 loader，字段显示和编号规则已新增 `runtimeEnabled=false` 草案配置、客户确认清单和结果回写模板                                                                                           | 不新增 `tenant_id`，不含通用打印模板引擎；当前 loader 只影响前端品牌展示和菜单，字段 / 编号草案不接运行时，不改变后端 usecase / RBAC / schema | `docs/product/product-delivery-ledgers.md`、`config/customers/yoyoosun/README.md`、`config/customers/yoyoosun/menuConfig.mjs`、`config/customers/yoyoosun/fieldNumberingConfig.mjs`、`docs/customers/yoyoosun/field-numbering-confirmation-checklist.md`、`docs/customers/yoyoosun/field-numbering-confirmation-result-template.md`、`customerMenuConfig.mjs`、`brand.js` | customer field / numbering config review                 | 被误读为 Runtime Tenant、SaaS 多租户、模板系统或已生效 runtime 字段规则 | Limited        | No         |
| CAP-030       | Customer Extension 边界                                    | Customer Extension     | Productization          |         L1 | 已有原则：极端客户专属逻辑才进入 extension，并记录原因、范围、退出条件和维护责任                                                                                                                                                                                                                                                 | 目前没有清晰 runtime extension 层，也没有真实专属逻辑落地                                                                           | `docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`                                                                                                                                                                                                                                                                      | real-customer-extension-review-only                      | 核心 schema / 库存 / 财务规则被客户长期分叉                             | No             | No         |
| CAP-031       | 业务帮助 / 开发验收 / 客户交付说明分离                     | Help / Delivery        | Help / QA               |         L2 | 前端产品内文档中心、帮助中心、高级文档和开发与验收页已移除；仓库正式文档和测试策略保留；yoyoosun 已新增试用培训说明、账号角色菜单核对清单、目标试用环境执行手册和 Phase 8 发布验收手册，明确正式入口、旧入口退出、菜单配置、销售订单边界、普通试用账号、岗位任务端、目标环境执行和内部事实验收边界；客户侧栏不展示 `Phase 8` 或 `事实闭环` 这类内部工程入口 | 普通业务用户版产品内帮助若要恢复，需单独设计产品内入口、菜单、权限和测试；当前清单和执行手册不创建真实账号或记录密码，也不代表目标环境已验收 | `docs/current-source-of-truth.md`、`web/README.md`、`docs/product/test-strategy.md`、`docs/customers/yoyoosun/trial-training-note.md`、`docs/customers/yoyoosun/trial-account-role-menu-checklist.md`、`docs/customers/yoyoosun/trial-environment-runbook.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md` | business-help-entry-redesign-if-needed / trial feedback  | 开发术语暴露给业务用户、账号权限误配或敏感信息被写进文档                | Limited        | No         |
| CAP-032       | Reporting / Audit / Integration 增强层                     | Reporting              | Reporting / Integration |      L0-L2 | 已有 observability / audit 口径和后续增强方向                                                                                                                                                                                                                                                                                    | 报表、附件、导入导出、扫码、外部集成未落地                                                                                          | `docs/current-source-of-truth.md`                                                                                                                                                                                                                                                                                                                             | wait-for-fact-layer-stability                            | 先做报表倒推事实模型                                                    | No             | No         |
| CAP-033       | 多客户私有化复制包                                         | Delivery / Customer Config | Productization / Deployment |      L3-L4 | Phase 11 已新增 `config/private-deployment-template/templateConfig.mjs`，把 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/`、`deployments/<customer-key>/`、导入 dry-run、差异台账、部署 runbook、备份恢复和验收清单沉淀为私有化客户包模板候选；边界守卫和模拟闭环脚本已接入 fast / full / strict | 不代表真实第二客户已创建、真实导入已批准、多客户 runtime 已生效、SaaS、tenant、license、billing 或客户已签收                        | `config/private-deployment-template/templateConfig.mjs`、`docs/product/private-deployment-package-review.md`、`scripts/qa/private-deployment-boundaries.mjs`、`scripts/qa/phase11-private-deployment-closure.mjs`、`phase11-target-release-evidence-2026-06-09.md` | real customer package only after customer-key review     | 模拟 key、客户包模板或行业候选被误读为正式客户 / runtime loader          | Limited        | No         |
| CAP-034       | Phase 12 SaaS 单独评审                                     | Productization         | SaaS / Multi-tenant     |         L1 | Phase 12 已新增 `docs/product/phase12-saas-review.md` 作为 docs-only 评审入口，明确当前不进入 SaaS 实现；继续优先验证 Phase 11 私有化客户包和真实新增客户闭环                                                                                                                                                               | 不新增 `tenant_id`、runtime tenant、license、billing、套餐权限、客户工单系统或 SaaS 运营后台；不改 schema / migration / RBAC / Workflow / Fact | `docs/product/phase12-saas-review.md`、`docs/product/product-completion-roadmap.md`、`docs/current-source-of-truth.md`                                                                                                                                                                                                                                          | real multi-customer private deployment evidence           | 过早把客户配置包、customer key 或行业模板候选误接成多租户 runtime       | No             | No         |

---

# 维护流程

## 10. 什么时候更新产品能力进度台账

以下情况必须更新产品能力进度台账：

- 新增 schema。
- 新增 migration。
- 新增 repo/usecase。
- 新增 API/RBAC。
- 新增 UI 页面。
- 新增数据导入工具。
- 新增部署包。
- 某能力从 draft 进入 implemented。
- 某能力从 internal ready 进入 trial ready。
- 某能力被客户试用。
- 某能力被标记为 deferred / deprecated。

更新时必须写：

- 证据路径。
- 测试命令。
- 当前不包含。
- 下一步。
- 风险。

---

## 13. 三类台账之间的关系

```text
客户差异台账
  -> 判断某个需求属于什么分类

产品能力进度台账
  -> 判断产品内核是否已经具备该能力

客户交付矩阵
  -> 判断某个客户是否可以看到、试用、验收该能力
```

关系示例：

```text
yoyoosun 提出“订单里要颜色”
  -> 客户差异台账：颜色字段来自 永绅 yoyoosun 样本，分类为 Industry Template Candidate / Deferred
  -> 产品能力进度台账：product_skus 仍 L3 Draft Only
  -> 客户交付矩阵：yoyoosun 暂不能承诺 SKU 能力，只能在 sales_order_item 中保留 color snapshot 或备注类字段
```

---

## 14. 防止信息差规则

### 14.1 禁止写法

禁止在没有证据时写：

- 已完成。
- 已上线。
- 已支持。
- 已交付。
- 可销售。
- 事实真源。
- 客户已确认。
- 已迁移。

### 14.2 推荐写法

应写：

- 已评审。
- 已形成草案。
- 已完成 schema。
- 已生成 migration。
- 已完成 repo/usecase。
- 已完成 API/RBAC。
- 已完成 UI。
- 可内部联调。
- 可客户试用。
- 待客户确认。
- 待真实导入。
- 待交付验收。

### 14.3 “已完成”必须附证据

任何“已完成”都必须附：

- 文件路径。
- 测试命令。
- review 报告。
- 不包含内容。

---
