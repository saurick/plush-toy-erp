# 产品能力进度台账、客户交付矩阵与客户差异台账 / Product Delivery Ledgers

## 0. 文档目的

本文用于统一管理 `plush-toy-erp` 的三类长期台账：

1. 产品能力进度台账
   用来回答：产品内核有哪些能力？每项能力做到什么成熟度？证据在哪里？下一步是什么？

2. 客户交付矩阵
   用来回答：某个客户交付了哪些模块？哪些可试用？哪些还只是配置草案？哪些不能承诺？

3. 客户差异台账
   用来回答：客户提出的差异需求属于 Product Core、Industry Template、Customer Config、Customer Extension、Data Import Adapter、Print Template Candidate、Reporting、Deferred 中哪一类？是否允许进入产品内核？

本文不是业务帮助中心。
本文不是客户合同。
本文不是代码实现真源。
本文是产品治理、交付治理和差异治理的台账入口。

---

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

# 第一部分：产品能力进度台账

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
| CAP-025       | mobile task entry                                          | Industry Template / UI | Mobile                  |      L1-L2 | 已有方向和骨架                                                                                                                                                                                                                                                                                                                   | 未实现真实岗位任务闭环                                                                                                              | V3 汇报 / mobile roles README                                                                                                                                                                                                                                                                                                                                 | mobile-task-entry-review                                 | 不要先做空壳菜单                                                        | No             | No         |
| CAP-026       | 永绅 yoyoosun 私有化部署包                                 | Delivery               | Deployment              |      L4-L5 | deployments/yoyoosun README 已有；Phase 8 已执行目标环境发布、migration、健康检查、镜像加载、试用账号 RBAC、登录态只读 API smoke、内部模拟事实写入闭环和 evidence 记录                                                                                                                                                         | 缺首次目标发布前 pre-migration 备份 evidence；已补 post-deploy 逻辑备份；客户使用确认属于交付后业务确认                             | `deployments/yoyoosun/README.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                                                        | post-delivery usage confirmation                         | 后续发布必须先补 pre-migration 备份 evidence                              | Limited        | No         |
| CAP-027       | 客户使用确认体系                                           | Delivery               | Acceptance              |      L3-L4 | 已有导入验收、阶段验收口径；Phase 8 目标环境发布、页面路由、未登录鉴权、试用账号 RBAC、登录态只读 API smoke 和内部模拟事实写入闭环 evidence 已形成                                                                                                                                                                                | 不把客户使用确认作为 Phase 8 完成阻塞；不可把内部模拟闭环写成客户签收或真实导入                                                     | `docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`                                                                                                                                                          | post-delivery usage confirmation                         | 验收口径要业务化，且不能扩大到打印、报表、核销和真实导入                | No             | No         |
| CAP-028       | 行业默认模板清单                                           | Industry Template      | Productization / Menu   |      L1-L2 | 已有毛绒玩具角色、菜单、流程、字段样本、编号和岗位任务端角色方向；yoyoosun 只能作为模板候选输入，打印样本暂不进入行业默认模板                                                                                                                                                                                                    | 尚未从 永绅 yoyoosun 样本中抽离正式行业默认模板；不含 Print Template Core                                                           | `docs/product/formal-menu-entry-plan.md`、`config/industry-templates/plush/README.md`                                                                                                                                                                                                                                                                         | industry-template-inventory                              | 单客户样本或打印格式被误读为行业标准                                    | No             | No         |
| CAP-029       | Customer Config 配置形态                                   | Customer Config        | Productization          |      L2-L3 | 已有公司名、logo、主题色、菜单、字段、编号、角色、权限、初始化数据和打印样本引用等配置项口径；yoyoosun 配置包已新增桌面菜单配置并接入前端 loader，字段显示和编号规则已新增 `runtimeEnabled=false` 草案配置、客户确认清单和结果回写模板                                                                                           | 不新增 `tenant_id`，不含通用打印模板引擎；当前 loader 只影响前端菜单，字段 / 编号草案不接运行时，不改变后端 usecase / RBAC / schema | `docs/product/product-delivery-ledgers.md`、`config/customers/yoyoosun/README.md`、`config/customers/yoyoosun/menuConfig.mjs`、`config/customers/yoyoosun/fieldNumberingConfig.mjs`、`docs/customers/yoyoosun/field-numbering-confirmation-checklist.md`、`docs/customers/yoyoosun/field-numbering-confirmation-result-template.md`、`customerMenuConfig.mjs` | customer field / numbering config review                 | 被误读为 Runtime Tenant、SaaS 多租户、模板系统或已生效 runtime 字段规则 | Limited        | No         |
| CAP-030       | Customer Extension 边界                                    | Customer Extension     | Productization          |         L1 | 已有原则：极端客户专属逻辑才进入 extension，并记录原因、范围、退出条件和维护责任                                                                                                                                                                                                                                                 | 目前没有清晰 runtime extension 层，也没有真实专属逻辑落地                                                                           | `docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`                                                                                                                                                                                                                                                                      | real-customer-extension-review-only                      | 核心 schema / 库存 / 财务规则被客户长期分叉                             | No             | No         |
| CAP-031       | 业务帮助 / 开发验收 / 客户交付说明分离                     | Help / Delivery        | Help / QA               |         L2 | 前端产品内文档中心、帮助中心、高级文档和开发与验收页已移除；仓库正式文档和测试策略保留；yoyoosun 已新增试用培训说明、账号角色菜单核对清单、目标试用环境执行手册和 Phase 8 发布验收手册，明确正式入口、旧入口退出、菜单配置、销售订单边界、普通试用账号、岗位任务端、目标环境执行和事实闭环验收边界 | 普通业务用户版产品内帮助若要恢复，需单独设计产品内入口、菜单、权限和测试；当前清单和执行手册不创建真实账号或记录密码，也不代表目标环境已验收 | `docs/current-source-of-truth.md`、`web/README.md`、`docs/product/test-strategy.md`、`docs/customers/yoyoosun/trial-training-note.md`、`docs/customers/yoyoosun/trial-account-role-menu-checklist.md`、`docs/customers/yoyoosun/trial-environment-runbook.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md` | business-help-entry-redesign-if-needed / trial feedback  | 开发术语暴露给业务用户、账号权限误配或敏感信息被写进文档                | Limited        | No         |
| CAP-032       | Reporting / Audit / Integration 增强层                     | Reporting              | Reporting / Integration |      L0-L2 | 已有 observability / audit 口径和后续增强方向                                                                                                                                                                                                                                                                                    | 报表、附件、导入导出、扫码、外部集成未落地                                                                                          | `docs/current-source-of-truth.md`                                                                                                                                                                                                                                                                                                                             | wait-for-fact-layer-stability                            | 先做报表倒推事实模型                                                    | No             | No         |

---

# 第二部分：客户交付矩阵

## 5. 客户交付矩阵说明

客户交付矩阵用于追踪每个客户实际交付状态。

它回答：

- 某客户启用了哪些模块？
- 哪些模块是正式可用？
- 哪些只是试用？
- 哪些只是 demo？
- 哪些是配置草案？
- 哪些不能承诺？
- 哪些需要客户确认？
- 哪些依赖 Product Core 后续开发？

### 5.1 交付状态定义

| 状态           | 含义             | 是否可对客户承诺 |
| -------------- | ---------------- | ---------------- |
| Not Planned    | 暂不计划给该客户 | 否               |
| Planned        | 已计划但未实现   | 否               |
| Config Draft   | 配置草案         | 否               |
| Internal Ready | 内部可用         | 否               |
| Local Verified | 本地环境已验证   | 否               |
| Trial Ready    | 可给客户试用     | 有条件           |
| Post-delivery  | 交付后业务确认   | 否               |
| Delivery Ready | 可交付           | 是               |
| Blocked        | 被前置条件阻塞   | 否               |
| Deferred       | 延后             | 否               |
| Deprecated     | 已废弃           | 否               |

---

## 6. 客户交付矩阵：yoyoosun

| Customer Key | 模块 / 能力             | 产品能力 ID         | 交付状态       | 当前客户可见方式                                                          | 交付结果                                                                                                                                                                                                                                                                                                                                                                            | 不包含                                                                                     | 前置条件                                                                                          | 客户确认项                                                             | 风险                                                    |
| ------------ | ----------------------- | ------------------- | -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| yoyoosun     | 客户主数据              | CAP-003             | Trial Ready    | 桌面正式菜单 `客户档案`                                                   | 可创建、编辑、查看、启停客户；当前试用使用模拟客户数据                                                                                                                                                                                                                                                                                                                              | 地址、账期、信用额度；真实客户数据导入当前不可执行                                         | 模拟数据 / 客户菜单配置                                                                           | 客户编码规则、客户简称、税号是否必填                                   | 模拟数据被误读为真实客户数据                            |
| yoyoosun     | 供应商主数据            | CAP-004             | Trial Ready    | 桌面正式菜单 `供应商档案`                                                 | 可创建、编辑、查看、启停供应商；当前试用使用模拟供应商数据                                                                                                                                                                                                                                                                                                                          | 银行账号、账期、供应物料档案；真实供应商数据导入当前不可执行                               | 模拟数据 / 客户菜单配置                                                                           | 供应商分类、是否区分委外/材料                                          | supplier_type 后续可能调整                              |
| yoyoosun     | 联系人                  | CAP-005             | Trial Ready    | 客户 / 供应商详情区块                                                     | 可维护主联系人和普通联系人；当前试用使用模拟联系人数据                                                                                                                                                                                                                                                                                                                              | 联系人通知权限；真实联系人数据导入当前不可执行                                             | 模拟数据 / 客户菜单配置                                                                           | 联系人角色、手机号、微信等字段                                         | owner guard 依赖 usecase                                |
| yoyoosun     | 销售订单                | CAP-006             | Trial Ready    | 桌面正式菜单 `销售订单`                                                   | 可录入、提交、激活、关闭、取消销售订单；当前试用使用模拟销售订单数据                                                                                                                                                                                                                                                                                                                | 出货、库存、财务；真实销售订单数据导入当前不可执行                                         | 模拟数据 / 客户菜单配置                                                                           | 订单编号规则、客户订单号、交期字段                                     | 甲方可能误解为出货闭环                                  |
| yoyoosun     | 销售订单明细            | CAP-007             | Trial Ready    | 销售订单详情区块                                                          | 可维护订单行                                                                                                                                                                                                                                                                                                                                                                        | SKU、已出货数                                                                              | 产品/单位选择器                                                                                   | 颜色、尺寸、客户款号如何处理                                           | 当前产品/单位暂用 ID                                    |
| yoyoosun     | V1 API/RBAC             | CAP-011             | Local Verified | 后端 JSON-RPC / 试用账号角色菜单核对清单 / 目标试用环境执行手册           | 有权限码和后端校验；已明确普通试用账号不使用 super admin、不分配 debug_operator，岗位任务端只认 `mobile.<role>.access`；本地 9 个 `demo_*` 账号已通过 RBAC 核对                                                                                                                                                                                                                                    | 未接客户化角色模板 runtime；目标客户环境真实账号核对未完成                                             | `phase7-simulated-trial-acceptance.md` / `trial-account-role-menu-checklist.md` / `trial-environment-runbook.md` | 角色权限模板 / 试用账号清单 / 目标环境账号核对                         | 权限模板还未客户化，账号误配会影响试用                  |
| yoyoosun     | V1 前端页面             | CAP-010             | Local Verified | 桌面正式菜单 / route                                                      | 页面可操作，且客户、供应商、销售订单已进入正式菜单；旧 `partners / project-orders` 路径不再保留产品内路由、重定向或权限别名；桌面菜单可由 yoyoosun 菜单配置生成；本地 Phase 7 浏览器入口 smoke 已通过                                                                                                                                                       | 当前只能使用模拟数据试用；真实数据导入不可执行；目标客户环境验收未完成                                             | `phase7-simulated-trial-acceptance.md` / trial feedback / trial environment runbook                       | 甲方试用入口 / 试用账号角色菜单核对                                    | 旧书签和账号权限仍需培训确认                            |
| yoyoosun     | business_records 旧入口 | CAP-008             | Deprecated     | 不进入正式菜单 / 无旧路径重定向 / API 写入冻结                            | `partners / project-orders` 仅可作为迁移来源或审计线索，不作为交付写入能力；当前 dev DB 旧重叠 debug 残留已清理，不代表客户库结论                                                                                                                                                                                                                                                   | 不承诺客户可见归档页；其他旧模块仍按各自领域后续评审                                       | legacy removal direction / data migration decision                                                | 如需迁移历史数据再确认范围                                             | 旧数据迁移和培训口径风险                                |
| yoyoosun     | yoyoosun 数据导入       | CAP-009             | Local Verified | 本地 CLI evidence / Markdown 报告 / execution report                      | 已有来源清单、字段分类、unresolved queue、只读 dry-run tooling、source freeze evidence、受控 JSON-RPC execution loader 和本地 Phase 7 模拟试用验收记录；当前没有客户真实数据，只作为模拟数据试用前门禁和报告模式工具                                                                                                                                                                                             | 当前不可执行真实导入；模拟数据不代表客户真实数据                                           | `phase7-simulated-trial-acceptance.md`                                                                  | 字段含义、冲突处理和未来数据治理条件                                   | 样本语义不清，execution loader 或模拟数据可能被误读成已完成导入 |
| yoyoosun     | 正式菜单入口            | CAP-010 / CAP-011   | Trial Ready    | 桌面正式菜单 / yoyoosun menu config                                       | `客户档案`、`供应商档案`、`销售订单` 已接入桌面菜单、dashboard 和前后端菜单权限选项；旧重叠路径不再保留产品内路由、重定向或权限别名；`config/customers/yoyoosun/menuConfig.mjs` 已可控制桌面菜单分组、排序、显隐和文案；`trial-training-note.md`、`trial-account-role-menu-checklist.md` 与 `trial-environment-runbook.md` 已说明旧入口退出、账号角色、岗位任务端和目标环境执行边界 | 需用真实试用反馈复核；不创建真实账号或记录密码                                             | trial feedback / trial account setup / trial environment runbook                                  | 确认旧入口不进入正式产品菜单，确认试用账号角色                         | 旧书签、培训口径和账号权限误配风险                      |
| yoyoosun     | 产品 / SKU              | CAP-012 / CAP-013   | Deferred       | 既有产品可用，SKU 延后                                                    | 产品主数据已有基础                                                                                                                                                                                                                                                                                                                                                                  | SKU 未落                                                                                   | product-sku-bom-version-review                                                                    | 色号、尺寸、版本口径                                                   | 不能从订单颜色自动建 SKU                                |
| yoyoosun     | BOM                     | CAP-014             | Deferred       | 既有 BOM 能力 / 后续评审                                                  | 有基础 BOM 真源                                                                                                                                                                                                                                                                                                                                                                     | 版本扩展未做                                                                               | BOM version review                                                                                | BOM 改版规则                                                           | 与 SKU 关系未定                                         |
| yoyoosun     | 采购订单                | CAP-015             | Deferred       | 无正式 V1 入口                                                            | 延后 V2                                                                                                                                                                                                                                                                                                                                                                             | 不代表采购入库                                                                             | purchase-order review                                                                             | 采购流程口径                                                           | 不可替代 purchase_receipts                              |
| yoyoosun     | 采购入库                | CAP-016             | Internal Ready | 既有能力                                                                  | 有采购入库事实基础                                                                                                                                                                                                                                                                                                                                                                  | 与采购订单衔接未做                                                                         | purchase review                                                                                   | 入库/质检流程                                                          | 口径需客户确认                                          |
| yoyoosun     | 质检                    | CAP-017             | Internal Ready | 既有能力                                                                  | 有 quality_inspections 基础                                                                                                                                                                                                                                                                                                                                                         | 与 workflow 任务对接需评审                                                                 | quality-workflow review                                                                           | IQC/OQC 口径                                                           | task done 与 passed 混淆                                |
| yoyoosun     | 库存事实                | CAP-018             | Internal Ready | 既有能力                                                                  | 有 txns / lots / balances                                                                                                                                                                                                                                                                                                                                                           | 出货预留/出库未做                                                                          | inventory boundary review                                                                         | 仓库/批次规则                                                          | 出货会影响库存，需谨慎                                  |
| yoyoosun     | 出货放行                | Workflow capability | Internal Ready | workflow 状态                                                             | `shipping_released` 表示已放行                                                                                                                                                                                                                                                                                                                                                      | 不等于出库                                                                                 | shipment review                                                                                   | 放行权限                                                               | UI 文案误导                                             |
| yoyoosun     | 出货事实                | CAP-020             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `shipments` / `shipment_items`、发货库存 OUT、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟出货 ship / cancel 已通过                                                                                                                                                                                                                    | 不等于客户已签收；不等于出货放行；未做打印、物流、退货或自动应收                            | `phase8-target-release-evidence-2026-06-08.md`                                                   | 出货流程 / 使用反馈                                                    | 高风险事实层                                            |
| yoyoosun     | 库存预留                | CAP-019             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `stock_reservations`、可用量检查和统一事实页面；预留不写库存流水；`phase8` 路由、登录态只读 API smoke 和模拟预留 release / consume 已通过                                                                                                                                                                                                                  | 不等于客户已签收；不从销售订单直接扣库存；未做自动预留或出货自动消耗                        | `phase8-target-release-evidence-2026-06-08.md`                                                   | 是否需要预留 / 使用反馈                                                | 容易和出库混                                            |
| yoyoosun     | 财务应收 / 应付         | CAP-022             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `finance_facts`、AR/AP/invoice/payment/reconciliation 状态事实和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟财务 settle / cancel 已通过                                                                                                                                                                                                       | 不等于客户已签收；不能从放行生成财务事实；未做发票明细、收付款核销或对账单                  | `phase8-target-release-evidence-2026-06-08.md`                                                   | 对账/开票/收付款流程 / 使用反馈                                        | 不能从放行生成                                          |
| yoyoosun     | 生产事实                | CAP-023             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `production_facts`、生产领料 / 返工 OUT、成品入库 IN、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟生产 post / cancel 已通过                                                                                                                                                                                                          | 不等于客户已签收；未接生产订单专表、移动端岗位任务、成本归集或完整报工                      | `phase8-target-release-evidence-2026-06-08.md`                                                   | 排产/领料流程 / 使用反馈                                                | 不要只做状态                                            |
| yoyoosun     | 委外事实                | CAP-024             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `outsourcing_facts`、委外发料 OUT、委外回料 IN、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟委外 post / cancel 已通过                                                                                                                                                                                                                 | 不等于客户已签收；委外结算进入财务事实；未做委外订单专表、质检对接或应付自动生成             | `phase8-target-release-evidence-2026-06-08.md`                                                   | 加工合同/外发流程 / 使用反馈                                            | 委外合同样本需人工确认                                  |
| yoyoosun     | 岗位任务                | CAP-025             | Planned        | 骨架/方向                                                                 | 任务驱动方向明确                                                                                                                                                                                                                                                                                                                                                                    | 真实岗位任务未做                                                                           | mobile task review                                                                                | 哪些岗位用手机                                                         | 不做空壳入口                                            |
| yoyoosun     | 私有化部署包            | CAP-026             | Target Released | deployments/yoyoosun / Phase 8 发布与内部模拟验收手册 / 发布 evidence     | 已执行目标环境镜像加载、migration、健康检查、Compose 重建、试用账号 RBAC、登录态只读 API smoke、内部模拟事实写入闭环和 post-deploy 备份                                                                                                                                                                                                                                      | 缺首次目标发布前 pre-migration 备份 evidence；客户使用确认属于交付后业务确认                 | `phase8-target-release-evidence-2026-06-08.md`                                                   | 使用确认                                                               | 运维风险                                                |
| yoyoosun     | 客户使用确认            | CAP-027             | Post-delivery   | checklist 草案 / 模拟数据试用目标 / Phase 8 发布与内部模拟验收手册 / 发布 evidence | Phase 7 本地模拟试用已关闭；Phase 8 目标环境发布 smoke、试用账号 RBAC、登录态只读 API smoke 和内部模拟事实写入闭环已通过                                                                                                                                                                                                                                                              | 不作为 Phase 8 完成阻塞；当前不可执行真实导入；模拟数据不代表客户已签收或真实出货 / 库存 / 财务事实 | `phase7-simulated-trial-acceptance.md` / `phase8-target-release-acceptance.md` / `phase8-target-release-evidence-2026-06-08.md` | 使用范围、模拟数据范围、真实导入不可执行边界                           | 范围过大或把内部闭环误读为客户签收                     |
| yoyoosun     | 行业默认模板清单        | CAP-028             | Planned        | config/industry-templates/plush                                           | 方向明确，永绅 yoyoosun 样本可作为候选输入                                                                                                                                                                                                                                                                                                                                          | 未完成行业共性 / 客户样本拆分；打印样本暂不进入行业默认模板                                | industry template inventory                                                                       | 哪些角色、菜单、字段属于行业共性                                       | 单客户样本或打印格式污染行业模板                        |
| yoyoosun     | 客户配置包              | CAP-029             | Config Draft   | config/customers/yoyoosun                                                 | 已有目录骨架和配置项口径，桌面菜单配置已接入前端 loader；字段显示和编号规则已形成 `runtimeEnabled=false` 草案配置、客户确认清单和结果回写模板                                                                                                                                                                                                                                       | 不是 `tenant_id`，不含通用打印模板引擎；字段 / 编号草案不接运行时，角色模板 runtime 尚未做 | customer field / numbering config review                                                          | 公司信息、主题、编号、打印样本记录、字段编号确认清单、确认结果回写模板 | 被误读为 SaaS tenant、模板系统或已生效 runtime 字段规则 |
| yoyoosun     | 客户扩展边界            | CAP-030             | Not Planned    | 无                                                                        | 当前没有需要落地的专属 extension                                                                                                                                                                                                                                                                                                                                                    | 不创建 extension runtime                                                                   | 真实出现专属逻辑后再评审                                                                          | 暂无                                                                   | 为假想定制过早造层                                      |
| yoyoosun     | 业务帮助 / 交付说明     | CAP-031             | Draft Ready    | 试用培训说明 / 账号角色菜单核对清单 / 目标试用环境执行手册 / Phase 8 发布验收手册 / 后续业务帮助 | 已新增 `trial-training-note.md`、`trial-account-role-menu-checklist.md`、`trial-environment-runbook.md` 和 `phase8-target-release-acceptance.md`，用于说明正式入口、旧入口退出、菜单配置边界、销售订单边界、普通试用账号、岗位任务端、目标环境执行和事实闭环验收边界                                                                                                            | 仍不是产品内帮助中心；不创建真实账号或记录密码；不代表目标环境已发布或客户已签收；需按试用反馈继续业务化 | trial feedback / business help split review / trial account setup / trial environment runbook / phase8 release acceptance | 客户培训材料 / 试用账号角色菜单确认 / 目标环境执行记录                 | 开发术语误导业务用户、账号权限误配或敏感信息写入文档    |
| yoyoosun     | 报表 / 审计 / 集成增强  | CAP-032             | Deferred       | 无正式入口                                                                | 后续增强方向明确                                                                                                                                                                                                                                                                                                                                                                    | 报表、附件、扫码、外部集成未做                                                             | 事实层稳定后再评审                                                                                | 报表范围                                                               | 倒推事实模型                                            |

---

# 第三部分：客户差异台账

## 7. 客户差异台账说明

客户差异台账用于记录每个客户提出或隐含的差异需求，并对其分类。

客户差异必须先分类，再决定是否实现。

### 7.1 差异分类

| 分类                     | 含义                         | 是否进入 Product Core |
| ------------------------ | ---------------------------- | --------------------- |
| Product Core             | 所有客户都应该共享的核心能力 | 是                    |
| Industry Template        | 毛绒玩具行业常见默认能力     | 可能                  |
| Customer Config          | 客户配置项                   | 否                    |
| Customer Extension       | 客户专属扩展                 | 否，除非多客户验证    |
| Data Import Adapter      | 数据导入适配                 | 否                    |
| Print Template Candidate | 打印 / 导出格式样本          | 否，当前默认 Deferred |
| Reporting                | 报表展示差异                 | 视情况                |
| Customer Material        | 客户资料线索                 | 否                    |
| Deferred                 | 延后评审                     | 否                    |
| Forbidden                | 明确禁止                     | 否                    |

---

## 8. 客户差异台账：yoyoosun

| Delta ID           | Customer | 差异/需求                               | 来源                            | 分类                                         | 当前判断                                                                                                      | 是否进入 Product Core | 处理方式                                                                                      | 前置条件                                      | 风险                           | 下一步                                      |
| ------------------ | -------- | --------------------------------------- | ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------ | ------------------------------------------- |
| DELTA-YOYOOSUN-001 | yoyoosun | yoyoosun 是第一个真实客户和种子客户     | 项目背景                        | Customer Material                            | 已确认                                                                                                        | 否                    | 作为配置包来源                                                                                | 无                                            | 误当 runtime tenant            | 保持 yoyoosun 非 tenant                     |
| DELTA-YOYOOSUN-002 | yoyoosun | 永绅 yoyoosun 私有化部署                | 项目背景                        | Customer Config / Delivery                   | 已确认方向                                                                                                    | 否                    | `deployments/yoyoosun`                                                                        | 部署包设计                                    | 运维边界不清                   | deployment package                          |
| DELTA-YOYOOSUN-003 | yoyoosun | 客户资料字段可能不同                    | yoyoosun 资料                   | Customer Config / Data Import Source         | 待确认                                                                                                        | 否                    | 字段分类 + unresolved queue                                                                   | 甲方确认                                      | 污染 Product Core              | import dry-run                              |
| DELTA-YOYOOSUN-004 | yoyoosun | 客户 / 供应商 / 联系人正式主数据        | V1 需求                         | Product Core                                 | 已进入 V1                                                                                                     | 是                    | 已做 V1 能力                                                                                  | 已完成基础链路                                | 后续字段扩张风险               | 地址/账期另评审                             |
| DELTA-YOYOOSUN-005 | yoyoosun | 销售订单正式源单据                      | V1 需求                         | Product Core                                 | 已进入 V1                                                                                                     | 是                    | 已做 V1 能力                                                                                  | 已完成基础链路                                | 误当出货事实                   | UI 文案继续约束                             |
| DELTA-YOYOOSUN-006 | yoyoosun | 颜色、尺寸、客户款号                    | Excel/订单字段线索              | Industry Template Candidate / Deferred       | 不直接落 SKU                                                                                                  | 暂不进入              | 作为 SKU/BOM 评审输入                                                                         | product_sku review                            | 过早建 SKU                     | SKU/BOM review                              |
| DELTA-YOYOOSUN-007 | yoyoosun | 加工合同样式                            | PDF / 合同样本                  | Customer Material / Print Template Candidate | 只作客户打印样本输入                                                                                          | 否                    | 记录样式、字段来源和条款线索；不抽产品内核模板                                                | 委外模块评审；至少 2-3 客户重复后再评审模板化 | 合同条款当业务规则             | outsourcing review + print sample inventory |
| DELTA-YOYOOSUN-008 | yoyoosun | 委外加工流程                            | 合同/业务线索                   | Product Core / Industry Template Candidate   | 延后                                                                                                          | 待评审                | 委外事实阶段评审                                                                              | outsourcing facts                             | 只用合同不足以建模             | outsourcing review                          |
| DELTA-YOYOOSUN-009 | yoyoosun | 采购 / 包材 / 辅材                      | 需求线索                        | Product Core / Deferred                      | 延后                                                                                                          | 待评审                | 采购订单 / 采购需求评审                                                                       | purchase review                               | 与已有 purchase_receipts 重复  | purchase-order review                       |
| DELTA-YOYOOSUN-010 | yoyoosun | 出货放行                                | Workflow 规则                   | Product Core                                 | 已有 workflow 边界                                                                                            | 是                    | 保持 `shipping_released != shipped`                                                           | shipment review                               | 被误解为已出库                 | shipment-usecase-review                     |
| DELTA-YOYOOSUN-011 | yoyoosun | 实际出货 / 出库                         | 业务主链路                      | Product Core                                 | 未做                                                                                                          | 是                    | 后续 shipment facts                                                                           | shipment review                               | 高风险事实层                   | shipment-usecase-review                     |
| DELTA-YOYOOSUN-012 | yoyoosun | 库存预留                                | 出货/库存需求                   | Product Core                                 | 未做                                                                                                          | 是                    | 后续 reservation review                                                                       | shipment/inventory boundary                   | 预留和扣减混淆                 | stock-reservation review                    |
| DELTA-YOYOOSUN-013 | yoyoosun | 应收 / 发票 / 收款                      | 财务需求                        | Product Core                                 | 未做                                                                                                          | 是                    | 后续 finance review                                                                           | 出货事实/对账口径                             | 不能从放行生成                 | finance review                              |
| DELTA-YOYOOSUN-014 | yoyoosun | 供应商应付 / 付款                       | 财务需求                        | Product Core                                 | 未做                                                                                                          | 是                    | 后续 finance review                                                                           | purchase/outsourcing facts                    | 付款口径复杂                   | finance review                              |
| DELTA-YOYOOSUN-015 | yoyoosun | 手机端任务处理                          | 汇报资料/产品方向               | Industry Template / UI                       | 计划中                                                                                                        | 可能                  | mobile task review                                                                            | 任务/岗位权限                                 | 空壳入口风险                   | mobile review                               |
| DELTA-YOYOOSUN-016 | yoyoosun | 老板审批更快                            | 汇报资料                        | Industry Template                            | 方向成立                                                                                                      | 可能                  | Workflow/mobile                                                                               | 审批节点设计                                  | 只做 UI 不做权限               | mobile workflow review                      |
| DELTA-YOYOOSUN-017 | yoyoosun | 仓库 / 品质现场扫码拍照                 | 汇报资料                        | Industry Template / Product Core             | 延后                                                                                                          | 可能                  | 质检/库存/移动端评审                                                                          | 事实模型                                      | 手机端先做空壳风险             | mobile + quality review                     |
| DELTA-YOYOOSUN-018 | yoyoosun | 旧 business_records partners 入口       | 旧系统兼容                      | Compatibility                                | 退出正式入口                                                                                                  | 否                    | 删除 / 隐藏旧入口；必要时仅保留迁移参考数据                                                   | transition audit                              | 双真源                         | legacy removal review                       |
| DELTA-YOYOOSUN-019 | yoyoosun | 旧 business_records project-orders 入口 | 旧系统兼容                      | Compatibility                                | 退出正式入口                                                                                                  | 否                    | 用正式 sales_orders 承接新写入；旧入口删除 / 隐藏                                             | transition audit                              | 双写/误导                      | legacy removal review                       |
| DELTA-YOYOOSUN-020 | yoyoosun | 旧 business_records products 入口       | 旧系统兼容                      | Compatibility / Deferred                     | 退出正式入口                                                                                                  | 否                    | 与正式 products / SKU 方向对齐；旧入口删除 / 隐藏                                             | product review                                | 重复主数据                     | product-sku review                          |
| DELTA-YOYOOSUN-021 | yoyoosun | yoyoosun 数据导入                       | 客户落地需要                    | Data Import Adapter                          | dry-run / freeze tooling 和受控 execution loader 已完成；当前没有可执行客户真实数据，Phase 7 只能模拟          | 否                    | source freeze / dry-run evidence -> simulated data trial rehearsal                              | 人工确认                                      | 误导入/误生成事实              | simulated data trial rehearsal              |
| DELTA-YOYOOSUN-022 | yoyoosun | 打印/导出格式                           | 客户交付需要                    | Customer Material / Print Template Candidate | 默认 Deferred                                                                                                 | 否                    | 只登记客户样本和交付诉求，不建立打印交付包或模板引擎                                          | 多客户同类单据重复、字段来源稳定后再评审      | 模板当业务规则                 | print sample inventory                      |
| DELTA-YOYOOSUN-023 | yoyoosun | 菜单入口                                | V1 页面可试用需要               | Customer Config / UI                         | 正式菜单已接入核心 V1 入口，旧重叠路径不再保留产品内路由、重定向或权限别名，普通业务 API 已冻结旧重叠模块写入 | 否                    | 保持正式菜单指向 V1；后续再做客户菜单配置和旧数据迁移 / 归档决策                              | business_records cutover                      | 旧书签和培训口径风险           | customer menu config / migration decision   |
| DELTA-YOYOOSUN-024 | yoyoosun | seedData 初始化                         | 交付/演示需要                   | Customer Config / Demo Seed                  | 未改                                                                                                          | 否                    | 单独评审                                                                                      | menu/seed boundary                            | 误当正式数据                   | seed review                                 |
| DELTA-YOYOOSUN-025 | yoyoosun | 业务帮助入口                            | 交付/培训需要                   | Help / QA                                    | 未改                                                                                                          | 否                    | 后续重新设计产品内业务帮助入口                                                                | 功能稳定后                                    | 文档误导实现状态               | help review                                 |
| DELTA-YOYOOSUN-026 | yoyoosun | 行业默认角色、菜单、字段、编号规则      | 永绅 yoyoosun 样本 / 产品化方向 | Industry Template Candidate                  | 待抽离模板清单                                                                                                | 否                    | 先分类行业共性、永绅 yoyoosun 样本和 deferred 输入                                            | 多客户或人工评审                              | 单客户样本被当行业标准         | industry template inventory                 |
| DELTA-YOYOOSUN-027 | yoyoosun | 客户配置包 / 配置 loader                | 产品化交付需要                  | Customer Config                              | 桌面菜单配置 loader 已接入前端；字段、编号、角色模板等 runtime loader 未做                                    | 否                    | 不新增 `tenant_id`；继续按低风险配置项逐步接入                                                | 字段 / 编号配置评审                           | 被误读为 Runtime Tenant / SaaS | customer field / numbering config review    |
| DELTA-YOYOOSUN-028 | yoyoosun | 极端客户专属逻辑放置边界                | 产品化交付需要                  | Customer Extension                           | 当前没有真实落地需求                                                                                          | 否                    | 只有真实出现专属逻辑时建立 extension，并记录退出条件                                          | 明确客户专属规则                              | 核心规则长期分叉               | extension review only                       |
| DELTA-YOYOOSUN-029 | yoyoosun | 报表、附件、导入导出、扫码、外部集成    | 后续增强方向                    | Reporting / Deferred                         | 延后                                                                                                          | 否                    | 事实层稳定后再评审                                                                            | 生产 / 出货 / 财务事实稳定                    | 报表倒推事实模型               | reporting review later                      |

---

## 9. 客户差异处理规则

### 9.1 可以直接进入 Product Core 的条件

满足以下条件之一，才考虑进入 Product Core：

- 多个客户都会用。
- 属于 ERP 核心事实正确性。
- 属于库存、出货、财务、审计、权限等不可客户自由配置的规则。
- 不依赖 yoyoosun 单一客户特殊字段。
- 有明确业务口径和测试口径。

### 9.2 不得直接进入 Product Core 的内容

以下内容不得直接进入 Product Core：

- yoyoosun Excel 中单独出现的字段。
- yoyoosun PDF 中单独出现的合同条款。
- 当前客户口头说法但未确认的问题。
- 打印样本字段和单客户打印格式。
- 导入适配字段。
- 旧 business_records 快照字段。
- demo / seed 数据字段。
- 尚未评审的 product_skus / purchase_orders / shipment / finance 字段。

### 9.3 必须进入 Customer Config 的内容

适合 Customer Config：

- 公司名称。
- Logo。
- 菜单显示。
- 字段显示 / 必填。
- 编号规则。
- 打印抬头、页脚、logo、公司信息等低风险展示参数。
- 默认仓库。
- 默认单位。
- 角色模板。
- 权限模板。
- 初始化数据。

### 9.4 必须进入 Data Import Adapter 的内容

适合 Data Import Adapter：

- yoyoosun Excel 字段映射。
- business_records 历史快照映射。
- 不同客户导入表头。
- 数据清洗规则。
- unresolved queue。
- dry-run preview。
- duplicate candidates。
- conflict candidates。

### 9.5 打印样本默认 Deferred

当前不建立 Print Template 产品能力。以下内容只作为 Customer Material / Delivery Note / Print Template Candidate 记录，默认 Deferred：

- 加工合同格式。
- 客户送货单样式。
- 采购单打印样式。
- 对账单导出样式。
- 页眉页脚。
- 公司名称、地址、电话、税号。
- 客户专属条款。

这些内容不得直接影响 Product Core、schema、fact、workflow、API 或权限模型。只有至少 2-3 个真实客户的同类单据结构重复，且差异主要是抬头、字段显示、字段排序或版式微调时，才允许新建独立评审判断是否进入 Print Template Core MVP。

### 9.6 必须 Deferred 的内容

以下内容必须 Deferred，直到独立评审：

- product_skus。
- purchase_orders。
- stock_reservations。
- shipments。
- shipment_items。
- AR/AP。
- invoice。
- payment。
- reconciliation。
- production facts。
- outsourcing facts。

---

# 第四部分：三类台账的维护流程

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

## 11. 什么时候更新客户交付矩阵

以下情况必须更新客户交付矩阵：

- 某客户启用模块。
- 某客户完成配置草案。
- 某客户完成数据导入 dry-run。
- 某客户完成真实导入。
- 某客户开始试用。
- 某客户验收某模块。
- 某客户模块被阻塞。
- 某客户模块进入 deferred。
- 某客户模块不再交付。

更新时必须写：

- 交付状态。
- 客户可见方式。
- 不包含什么。
- 客户确认项。
- 风险。

---

## 12. 什么时候更新客户差异台账

以下情况必须更新客户差异台账：

- 甲方提出新需求。
- 从 Excel / PDF / 截图中发现字段差异。
- 从试用反馈中发现特殊流程。
- 从导入 dry-run 中发现 unresolved 字段。
- 从客户打印样本中发现客户专属字段。
- 从权限配置中发现职责差异。
- 从业务讨论中发现行业共性。
- 某客户差异被提升为行业模板候选。
- 某客户差异被拒绝进入产品内核。
- 某客户差异被标记为 deferred。

更新时必须分类：

- Product Core
- Industry Template
- Customer Config
- Customer Extension
- Data Import Adapter
- Print Template Candidate
- Reporting
- Customer Material
- Deferred
- Forbidden

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

## 15. 建议后续台账拆分

当本文变大后，可以拆为：

```text
docs/product/capability-ledger.md
docs/customers/yoyoosun/delivery-matrix.md
docs/customers/yoyoosun/delta-ledger.md
```

其中：

- `capability-ledger.md` 维护产品能力进度。
- `delivery-matrix.md` 维护 永绅 yoyoosun 客户交付状态。
- `delta-ledger.md` 维护 永绅 yoyoosun 客户差异。

未来新增客户时：

```text
docs/customers/<customer-key>/delivery-matrix.md
docs/customers/<customer-key>/delta-ledger.md
```

产品能力台账仍只有一份：

```text
docs/product/capability-ledger.md
```

---

## 16. 当前推荐下一步

当前下一步按 roadmap Phase 制执行，不再复用旧 `00x` 编号作为路线。

通用前置检查：

```text
workspace checkpoint
-> roadmap / product-delivery-ledgers impact check
-> current-source-of-truth verification
-> allowed / forbidden path confirmation
```

如果目标是重新开工：

```text
Phase 0 docs-only reset
```

如果目标是让 yoyoosun 甲方尽快试用：

```text
Phase 0 docs-only reset
-> Phase 1 yoyoosun source governance
-> Phase 2 MVP cutline
-> Phase 3 MasterData + Sales Order MVP
-> Phase 5 Formal product entry and legacy exit
-> Phase 6 import loader report gate
-> Phase 7 simulated data trial rehearsal and acceptance
-> Phase 8 fact expansion local minimum implementation
```

如果目标是准备真实数据落地：

```text
当前不成立。yoyoosun 没有可直接执行的客户真实数据，真实数据导入在当前 Phase 7 中不可执行；只能执行 Phase 7 simulated data trial rehearsal and acceptance。
```

---

## 17. 最终结论

三类台账的最终作用：

```text
产品能力进度台账
  管产品内核做到哪一步。

客户交付矩阵
  管某个客户能看到、试用、验收什么。

客户差异台账
  管客户特殊需求怎么分类、是否进入产品、是否只做配置或导入适配。
```

它们共同防止：

- 永绅 yoyoosun 客户资料污染 Product Core。
- 旧 business_records 变成双真源或旧入口继续误导用户。
- 菜单看起来比能力成熟。
- Workflow 和 Fact 混淆。
- 文档写“已完成”但代码没有证据。
- 多客户交付时每家 fork 一套代码。
