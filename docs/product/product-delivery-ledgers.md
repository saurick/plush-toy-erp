# 产品能力进度台账 + 客户交付矩阵 + 客户差异台账

## 0. 文档目的

本文用于统一管理 `plush-toy-erp` 的三类长期台账：

1. 产品能力进度台账
   用来回答：产品内核有哪些能力？每项能力做到什么成熟度？证据在哪里？下一步是什么？

2. 客户交付矩阵
   用来回答：某个客户交付了哪些模块？哪些可试用？哪些还只是配置草案？哪些不能承诺？

3. 客户差异台账
   用来回答：客户提出的差异需求属于 Product Core、Industry Template、Customer Config、Customer Extension、Data Import Adapter、Print Template、Reporting 中哪一类？是否允许进入产品内核？

本文不是业务帮助中心。
本文不是客户合同。
本文不是代码实现真源。
本文是产品治理、交付治理和差异治理的台账入口。

---

## 1. 台账总原则

### 1.1 产品化原则

本项目采用：

* 一套标准产品内核。
* 一个毛绒玩具行业模板。
* 多个客户配置包。
* 少量客户专属模板 / 数据适配。
* 极少数客户扩展。
* 核心业务代码尽量不分叉。

### 1.2 当前阶段禁止项

当前阶段禁止：

* 不新增 `tenant_id`。
* 不实现 SaaS 多租户。
* 不实现 license server。
* 不实现套餐计费。
* 不实现客户工单系统。
* 不创建泛化 `ChangeUsecase`。
* 不创建泛化 `change_records`。
* 不把 `current` 客户资料直接写成 Product Core。
* 不让 Workflow 写库存、出货、财务、应收、应付、发票、收付款事实。
* 不把 `business_records` 当长期事实真源。

### 1.3 Workflow / Fact 边界

核心口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

关键边界：

* `Workflow task done != Fact posted`
* `shipment_release done -> shipping_released`
* `shipping_released != shipped`
* `sales_order` 是 Source Document，不是 shipment fact
* `inventory_txns` 才是库存落账事实
* shipment / inventory / finance facts 不能从 workflow 或旧快照自动生成

---

## 2. 能力成熟度定义

产品能力进度统一使用 L0 到 L8。

| 等级 | 名称             | 含义                                             | 是否可对客户承诺  |
| -: | -------------- | ---------------------------------------------- | --------- |
| L0 | Not Started    | 未开始，只在路线图里                                     | 否         |
| L1 | Discussed      | 已讨论，有初步口径                                      | 否         |
| L2 | Reviewed       | 已做架构 / 业务评审                                    | 否         |
| L3 | Drafted        | 有 schema draft / design draft / data map draft | 否         |
| L4 | Schema Ready   | schema / migration / generated code 已完成        | 否         |
| L5 | Runtime Ready  | repo/usecase 已完成，后端核心逻辑可测                      | 内部可测      |
| L6 | API Ready      | API/RBAC 已完成                                   | 内部可联调     |
| L7 | UI Ready       | 前端页面可操作                                        | 可试用，但需标边界 |
| L8 | Delivery Ready | 数据、权限、菜单、部署、培训、验收都可交付                          | 可对客户承诺    |

对数据导入 CLI、freeze checker、evidence tooling 等非业务 runtime 能力，L5 只表示内部工具逻辑和测试已可运行，不表示真实 import loader、DB 写入、客户导入批准或 runtime API 已完成。

### 2.1 状态用语规则

只有满足以下条件，才允许写“已完成”：

* 有代码路径。
* 有测试命令。
* 有审查报告。
* 没有违反禁止项。
* 文档明确了不包含哪些 deferred 能力。

否则只能写：

* 已评审。
* 草案。
* 待实现。
* 内部可测。
* 客户试用候选。
* 交付待验收。

---

# 第一部分：产品能力进度台账

## 3. 产品能力进度台账说明

产品能力进度台账用于追踪 Product Core / Industry Template / Customer Config / Customer Extension 的能力成熟度。

每一行表示一个可独立规划、开发、测试和验收的产品能力。

### 3.1 字段说明

| 字段            | 说明                                                                                 |
| ------------- | ---------------------------------------------------------------------------------- |
| Capability ID | 能力编号                                                                               |
| 能力名称          | 产品能力名                                                                              |
| 所属层           | Product Core / Industry Template / Customer Config / Customer Extension / Delivery |
| 业务域           | MasterData / Order / Inventory / Workflow / Finance 等                              |
| 当前成熟度         | L0-L8                                                                              |
| 当前结果          | 当前已具备的能力                                                                           |
| 当前不包含         | 防止误解的边界说明                                                                          |
| 证据            | 文档、代码、测试、审查报告路径                                                                    |
| 下一步           | 下一轮要做什么                                                                            |
| 风险            | 当前主要风险                                                                             |
| 是否可客户试用       | Yes / No / Limited                                                                 |
| 是否可交付承诺       | Yes / No                                                                           |

---

## 4. 产品能力进度台账

| Capability ID | 能力名称                                      | 所属层                    | 业务域                     | 当前成熟度 | 当前结果                                                                                         | 当前不包含                             | 证据                                                                | 下一步                                 | 风险                               | 可客户试用          | 可交付承诺 |
| ------------- | ----------------------------------------- | ---------------------- | ----------------------- | ----: | -------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- | ----------------------------------- | -------------------------------- | -------------- | ----- |
| CAP-000       | 产品化架构骨架                                   | Product Core           | Architecture            |    L7 | 已建立产品原则、分层边界、current 客户边界、Codex 工作流                                                          | 不代表业务闭环完成                         | `docs/product/*`、`docs/architecture/*`、`docs/codex-goals/*`       | 持续维护 current-source-of-truth        | 文档多，需防信息差                        | Yes            | No    |
| CAP-001       | Workflow / Fact 边界                        | Product Core           | Architecture / Workflow |    L7 | 已明确 `workflow done != fact posted`、`shipping_released != shipped`                            | 不代表 shipment facts 已实现            | `docs/architecture/status-workflow-fact-boundary.md`              | 后续 shipment / finance 继续复用          | UI 文案可能误导                        | Yes            | No    |
| CAP-002       | current 客户资料治理                            | Customer Config        | Productization          |    L6 | 已建立 current 客户资料、导入来源、字段分类、dry-run 草案、source freeze 和 real dry-run evidence 口径                         | 未真实导入                             | `docs/customers/current/*import*.md`、`docs/customers/current/*freeze*.md` | import loader design                | current 字段污染 Product Core        | Limited        | No    |
| CAP-003       | customers 主数据                             | Product Core           | MasterData              |    L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                        | 地址、账期、信用额度未做                      | `customer.go`、`masterdata.go`、`jsonrpc_masterdata_order.go`、V1 UI | 菜单入口评审 / 数据导入                       | 真实数据尚未导入                         | Yes            | No    |
| CAP-004       | suppliers 主数据                             | Product Core           | MasterData              |    L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                        | 供应商物料档案、结算资料未做                    | `supplier.go`、`masterdata.go`、V1 UI                               | 菜单入口评审 / 数据导入                       | supplier_type 后续可能细化             | Yes            | No    |
| CAP-005       | contacts 联系人                              | Product Core           | MasterData              |    L7 | 支持 customer / supplier owner，usecase guard 已完成，UI 区块已完成                                      | DB 无跨表强 FK，依赖 usecase guard       | `contact.go`、`masterdata.go`、V1 UI                                | 导入 dry-run / API smoke              | 直接 SQL 可能绕过 guard                | Yes            | No    |
| CAP-006       | sales_orders 销售订单源单据                      | Product Core           | Order                   |    L7 | schema / migration / repo/usecase / API/RBAC / UI 已完成                                        | 不含出货事实、库存扣减、应收、发票                 | `sales_order.go`、`sales_order.go usecase`、V1 UI                   | 菜单入口 / 真实试用                         | 甲方可能误认为已出货闭环                     | Yes, with note | No    |
| CAP-007       | sales_order_items 销售订单明细                  | Product Core           | Order                   |    L7 | 支持新增、编辑、取消/移除、列表                                                                             | 不含 `shipped_quantity`、product_sku | `sales_order_item.go`、V1 UI                                       | 产品/单位选择器                            | 当前 UI 产品/单位暂用 ID                 | Limited        | No    |
| CAP-008       | business_records 旧入口退出                    | Productization         | Compatibility           |    L3 | 已完成引用审计、cutover plan、data map draft、risk register                                            | 不把旧入口作为正式产品入口，不承诺只读归档页          | `docs/product/business-records-*.md`                              | legacy entry removal / formal menu direction | 双真源、旧入口误导                        | No             | No    |
| CAP-009       | current 客户导入 dry-run tooling / evidence    | Delivery               | Data Import             |    L5 | 已具备 source inventory、field classification、dry-run plan、unresolved queue、acceptance checklist、只读 dry-run CLI 和 source freeze / evidence preparation | 未写真实 import loader，未执行真实导入，不写 DB，不写 `business_records` | `docs/customers/current/import-*.md`、`docs/customers/current/source-snapshot-freeze.md`、`docs/customers/current/real-dry-run-evidence.md`、`scripts/import/currentCustomerDryRun.mjs`、`scripts/import/currentSourceSnapshotFreezeCheck.mjs` | import loader design                | 字段语义仍需人工确认，dry-run 不能被误读成真实导入批准 | No             | No    |
| CAP-010       | V1 前端页面                                   | Product Core           | UI                      |    L7 | V1 customers / suppliers / contacts / sales_orders 页面和路由已完成                                  | 未接正式菜单 / seedData / docs registry | `V1MasterDataPage.jsx`、`V1SalesOrdersPage.jsx`                    | V1 menu entry review                | 只能直链访问或路由访问                      | Limited        | No    |
| CAP-011       | V1 API/RBAC                               | Product Core           | API / RBAC              |    L7 | JSON-RPC API + 动作权限已完成                                                                       | 未接 UI 菜单权限体系总收口                   | `jsonrpc_masterdata_order.go`、`rbac.go`                           | API smoke / menu permission review  | JSON-RPC handler 位于 data 层历史架构   | Yes            | No    |
| CAP-012       | 产品 / materials / units / warehouses 既有主数据 | Product Core           | MasterData              | L5-L7 | 已有既有 schema / runtime 能力                                                                     | 本台账未重新评审全部 UI/API                 | 既有代码和 docs                                                        | 后续与导入和 SKU 评审对齐                     | 与 business_records products 可能重叠 | Limited        | No    |
| CAP-013       | product_skus                              | Product Core           | Product / SKU           |    L3 | Draft Only                                                                                   | 未落 schema / runtime / UI          | `domain-schema-draft-v1-v2.md`                                    | SKU/BOM version review              | 不能因颜色字段直接落 SKU                   | No             | No    |
| CAP-014       | BOM 版本能力                                  | Product Core           | BOM                     | L3-L4 | 现有 BOM 真源已存在，版本扩展仍 draft                                                                     | 未做 BOM version extension          | BOM schema / draft docs                                           | product-sku-bom-version-review      | 重复设计风险                           | No             | No    |
| CAP-015       | purchase_orders 采购承诺                      | Product Core           | Purchase                |    L3 | Draft / V2 candidate                                                                         | 未落 schema / runtime               | purchase/order boundary docs                                      | purchase-order-usecase-review       | 不能替代 purchase_receipts           | No             | No    |
| CAP-016       | purchase_receipts 采购入库事实                  | Product Core           | Purchase / Inventory    |   L5+ | 既有采购入库事实能力                                                                                   | 与 future purchase_order 衔接未做      | existing schema / changes docs                                    | purchase order linking review       | 口径需和采购订单对齐                       | Limited        | No    |
| CAP-017       | quality_inspections 质检事实                  | Product Core           | Quality                 |   L5+ | 既有质检事实能力                                                                                     | 与 Workflow task 对接需评审             | existing schema / usecase                                         | QualityUsecase + workflow review    | task done 与 quality passed 混淆    | Limited        | No    |
| CAP-018       | inventory_txns / balances / lots          | Product Core           | Inventory               |   L5+ | 既有库存事实基础                                                                                     | 出货预留 / outbound 未完成               | existing schema / usecase                                         | stock reservation / outbound review | 不可从 sales_order 直接扣库存            | Limited        | No    |
| CAP-019       | stock_reservations                        | Product Core           | Inventory / Shipment    | L0-L2 | Deferred                                                                                     | 未评审 / 未落地                         | V1 deferred list                                                  | stock-reservation-usecase           | 预留和出库易混                          | No             | No    |
| CAP-020       | shipments / shipment_items                | Product Core           | Shipment                | L0-L2 | Deferred                                                                                     | 未评审 / 未落地                         | V1 deferred list                                                  | shipment-usecase-review             | `shipping_released != shipped`   | No             | No    |
| CAP-021       | shipment outbound inventory fact          | Product Core           | Shipment / Inventory    |    L0 | 未开始                                                                                          | 未写库存出向事实                          | N/A                                                               | shipment-outbound-inventory-fact    | 高风险，必须单独评审                       | No             | No    |
| CAP-022       | AR/AP/invoice/payment/reconciliation      | Product Core           | Finance                 | L0-L2 | Deferred                                                                                     | 未评审 / 未落地                         | V1 deferred list                                                  | finance-ar-ap review                | 不能从放行直接生成财务事实                    | No             | No    |
| CAP-023       | production facts                          | Product Core           | Production              | L0-L2 | Deferred                                                                                     | 未评审 / 未落地                         | roadmap                                                           | production-fact-review              | 不能只靠任务状态                         | No             | No    |
| CAP-024       | outsourcing facts                         | Product Core           | Outsourcing             | L0-L2 | Deferred                                                                                     | 未评审 / 未落地                         | roadmap                                                           | outsourcing-fact-review             | 委外发料/回货/结算要分开                    | No             | No    |
| CAP-025       | mobile task entry                         | Industry Template / UI | Mobile                  | L1-L2 | 已有方向和骨架                                                                                      | 未实现真实移动端任务闭环                      | V3 汇报 / mobile roles README                                       | mobile-task-entry-review            | 不要先做空壳菜单                         | No             | No    |
| CAP-026       | current 私有化部署包                            | Delivery               | Deployment              | L1-L2 | deployments/current README 已有                                                                | 未形成可执行部署包                         | `deployments/current/README.md`                                   | deployment-package-current          | 备份/恢复/发布未完整                      | No             | No    |
| CAP-027       | 客户验收体系                                    | Delivery               | Acceptance              | L1-L2 | 已有导入验收、阶段验收口径                                                                                | 未形成客户验收包                          | import acceptance checklist                                       | customer-trial-acceptance           | 验收口径要业务化                         | No             | No    |

---

# 第二部分：客户交付矩阵

## 5. 客户交付矩阵说明

客户交付矩阵用于追踪每个客户实际交付状态。

它回答：

* 某客户启用了哪些模块？
* 哪些模块是正式可用？
* 哪些只是试用？
* 哪些只是 demo？
* 哪些是配置草案？
* 哪些不能承诺？
* 哪些需要客户确认？
* 哪些依赖 Product Core 后续开发？

### 5.1 交付状态定义

| 状态             | 含义       | 是否可对客户承诺 |
| -------------- | -------- | -------- |
| Not Planned    | 暂不计划给该客户 | 否        |
| Planned        | 已计划但未实现  | 否        |
| Config Draft   | 配置草案     | 否        |
| Internal Ready | 内部可用     | 否        |
| Trial Ready    | 可给客户试用   | 有条件      |
| Delivery Ready | 可交付      | 是        |
| Blocked        | 被前置条件阻塞  | 否        |
| Deferred       | 延后       | 否        |
| Deprecated     | 已废弃      | 否        |

---

## 6. 客户交付矩阵：current

| Customer Key | 模块 / 能力              | 产品能力 ID             | 交付状态           | 当前客户可见方式              | 交付结果                         | 不包含                      | 前置条件                           | 客户确认项              | 风险                        |
| ------------ | -------------------- | ------------------- | -------------- | --------------------- | ---------------------------- | ------------------------ | ------------------------------ | ------------------ | ------------------------- |
| current      | 客户主数据                | CAP-003             | Trial Ready    | V1 route / 后续菜单入口     | 可创建、编辑、查看、启停客户               | 地址、账期、信用额度               | V1 menu entry review           | 客户编码规则、客户简称、税号是否必填 | 真实数据未导入                   |
| current      | 供应商主数据               | CAP-004             | Trial Ready    | V1 route / 后续菜单入口     | 可创建、编辑、查看、启停供应商              | 银行账号、账期、供应物料档案           | V1 menu entry review           | 供应商分类、是否区分委外/材料    | supplier_type 后续可能调整      |
| current      | 联系人                  | CAP-005             | Trial Ready    | 客户/供应商详情区块            | 可维护主联系人和普通联系人                | 联系人通知权限                  | V1 menu entry review           | 联系人角色、手机号、微信等字段    | owner guard 依赖 usecase    |
| current      | 销售订单                 | CAP-006             | Trial Ready    | V1 sales_orders route | 可录入、提交、激活、关闭、取消销售订单          | 出货、库存、财务                 | V1 menu entry review           | 订单编号规则、客户订单号、交期字段  | 甲方可能误解为出货闭环               |
| current      | 销售订单明细               | CAP-007             | Trial Ready    | 销售订单详情区块              | 可维护订单行                       | SKU、已出货数                 | 产品/单位选择器                       | 颜色、尺寸、客户款号如何处理     | 当前产品/单位暂用 ID              |
| current      | V1 API/RBAC          | CAP-011             | Internal Ready | 后端 JSON-RPC           | 有权限码和后端校验                    | 前端完整权限体验                 | 菜单入口 / 用户角色配置                  | 角色权限模板             | 权限模板还未客户化                 |
| current      | V1 前端页面              | CAP-010             | Trial Ready    | 直链 / route            | 页面可操作                        | 菜单入口未正式接                 | V1 menu entry review           | 甲方试用入口             | 旧入口仍存在                    |
| current      | business_records 旧入口 | CAP-008             | Deprecated     | 不进入正式菜单 / 默认隐藏或删除 | 仅可作为迁移来源或审计线索，不作为交付能力         | 不承诺客户可见只读归档页            | legacy removal direction / data migration decision | 如需迁移历史数据再确认范围 | 双真源风险                     |
| current      | current 数据导入 dry-run | CAP-009             | Internal Ready | 本地 CLI evidence / Markdown 报告 | 已有来源清单、字段分类、unresolved queue、只读 dry-run tooling、source freeze evidence | 没有真实 import loader，不写 DB，不执行导入 | loader design                  | 字段含义、冲突处理、签字确认     | 样本语义不清，dry-run 可能被误读成批准导入 |
| current      | 正式菜单入口               | 待建                  | Planned        | 暂未正式接                 | 待评审                          | 不做全局菜单重构                 | V1 menu entry review           | 确认旧入口不进入正式产品菜单 | seedData/docs registry 风险 |
| current      | 产品 / SKU             | CAP-012 / CAP-013   | Deferred       | 既有产品可用，SKU 延后         | 产品主数据已有基础                    | SKU 未落                   | product-sku-bom-version-review | 色号、尺寸、版本口径         | 不能从订单颜色自动建 SKU            |
| current      | BOM                  | CAP-014             | Deferred       | 既有 BOM 能力 / 后续评审      | 有基础 BOM 真源                   | 版本扩展未做                   | BOM version review             | BOM 改版规则           | 与 SKU 关系未定                |
| current      | 采购订单                 | CAP-015             | Deferred       | 无正式 V1 入口             | 延后 V2                        | 不代表采购入库                  | purchase-order review          | 采购流程口径             | 不可替代 purchase_receipts    |
| current      | 采购入库                 | CAP-016             | Internal Ready | 既有能力                  | 有采购入库事实基础                    | 与采购订单衔接未做                | purchase review                | 入库/质检流程            | 口径需客户确认                   |
| current      | 质检                   | CAP-017             | Internal Ready | 既有能力                  | 有 quality_inspections 基础     | 与 workflow 任务对接需评审       | quality-workflow review        | IQC/OQC 口径         | task done 与 passed 混淆     |
| current      | 库存事实                 | CAP-018             | Internal Ready | 既有能力                  | 有 txns / lots / balances     | 出货预留/出库未做                | inventory boundary review      | 仓库/批次规则            | 出货会影响库存，需谨慎               |
| current      | 出货放行                 | Workflow capability | Internal Ready | workflow 状态           | `shipping_released` 表示已放行    | 不等于出库                    | shipment review                | 放行权限               | UI 文案误导                   |
| current      | 出货事实                 | CAP-020             | Deferred       | 无                     | 未做                           | shipments/items/outbound | shipment-usecase-review        | 出货流程               | 高风险事实层                    |
| current      | 库存预留                 | CAP-019             | Deferred       | 无                     | 未做                           | reservations             | stock-reservation review       | 是否需要预留             | 容易和出库混                    |
| current      | 财务应收 / 应付            | CAP-022             | Deferred       | 无                     | 未做                           | AR/AP/invoice/payment    | finance review                 | 对账/开票/收付款流程        | 不能从放行生成                   |
| current      | 生产事实                 | CAP-023             | Deferred       | 无                     | 未做                           | 生产领料/成品入库                | production review              | 排产/领料流程            | 不要只做状态                    |
| current      | 委外事实                 | CAP-024             | Deferred       | 无                     | 未做                           | 委外发料/回货/结算               | outsourcing review             | 加工合同/外发流程          | 委外合同样本需人工确认               |
| current      | 移动端任务                | CAP-025             | Planned        | 骨架/方向                 | 任务驱动方向明确                     | 真实移动端任务未做                | mobile task review             | 哪些岗位用手机            | 不做空壳入口                    |
| current      | 私有化部署包               | CAP-026             | Planned        | deployments/current   | 方向明确                         | 备份/恢复/发布未完整              | deployment package             | 部署环境               | 运维风险                      |
| current      | 客户验收                 | CAP-027             | Planned        | checklist 草案          | 导入验收部分已有                     | 完整试点验收未做                 | trial acceptance               | 验收范围               | 范围过大风险                    |

---

# 第三部分：客户差异台账

## 7. 客户差异台账说明

客户差异台账用于记录每个客户提出或隐含的差异需求，并对其分类。

客户差异必须先分类，再决定是否实现。

### 7.1 差异分类

| 分类                  | 含义             | 是否进入 Product Core |
| ------------------- | -------------- | ----------------- |
| Product Core        | 所有客户都应该共享的核心能力 | 是                 |
| Industry Template   | 毛绒玩具行业常见默认能力   | 可能                |
| Customer Config     | 客户配置项          | 否                 |
| Customer Extension  | 客户专属扩展         | 否，除非多客户验证         |
| Data Import Adapter | 数据导入适配         | 否                 |
| Print Template      | 打印 / 导出模板      | 否                 |
| Reporting           | 报表展示差异         | 视情况               |
| Customer Material   | 客户资料线索         | 否                 |
| Deferred            | 延后评审           | 否                 |
| Forbidden           | 明确禁止           | 否                 |

---

## 8. 客户差异台账：current

| Delta ID          | Customer | 差异/需求                                | 来源           | 分类                                         | 当前判断           | 是否进入 Product Core | 处理方式                              | 前置条件                        | 风险                       | 下一步                      |
| ----------------- | -------- | ------------------------------------ | ------------ | ------------------------------------------ | -------------- | ----------------- | --------------------------------- | --------------------------- | ------------------------ | ------------------------ |
| DELTA-CURRENT-001 | current  | current 是第一个真实客户和种子客户                | 项目背景         | Customer Material                          | 已确认            | 否                 | 作为配置包来源                           | 无                           | 误当 runtime tenant        | 保持 current 非 tenant      |
| DELTA-CURRENT-002 | current  | current 私有化部署                        | 项目背景         | Customer Config / Delivery                 | 已确认方向          | 否                 | `deployments/current`             | 部署包设计                       | 运维边界不清                   | deployment package       |
| DELTA-CURRENT-003 | current  | 客户资料字段可能不同                           | current 资料   | Customer Config / Data Import Source       | 待确认            | 否                 | 字段分类 + unresolved queue           | 甲方确认                        | 污染 Product Core          | import dry-run           |
| DELTA-CURRENT-004 | current  | 客户 / 供应商 / 联系人正式主数据                  | V1 需求        | Product Core                               | 已进入 V1         | 是                 | 已做 V1 能力                          | 已完成基础链路                     | 后续字段扩张风险                 | 地址/账期另评审                 |
| DELTA-CURRENT-005 | current  | 销售订单正式源单据                            | V1 需求        | Product Core                               | 已进入 V1         | 是                 | 已做 V1 能力                          | 已完成基础链路                     | 误当出货事实                   | UI 文案继续约束                |
| DELTA-CURRENT-006 | current  | 颜色、尺寸、客户款号                           | Excel/订单字段线索 | Industry Template Candidate / Deferred     | 不直接落 SKU       | 暂不进入              | 作为 SKU/BOM 评审输入                   | product_sku review          | 过早建 SKU                  | 016 review               |
| DELTA-CURRENT-007 | current  | 加工合同样式                               | PDF / 合同样本   | Print Template                             | 只作模板输入         | 否                 | 进入打印模板候选                          | 委外模块评审                      | 合同条款当业务规则                | outsourcing review       |
| DELTA-CURRENT-008 | current  | 委外加工流程                               | 合同/业务线索      | Product Core / Industry Template Candidate | 延后             | 待评审               | 委外事实阶段评审                          | outsourcing facts           | 只用合同不足以建模                | outsourcing review       |
| DELTA-CURRENT-009 | current  | 采购 / 包材 / 辅材                         | 需求线索         | Product Core / Deferred                    | 延后             | 待评审               | 采购订单 / 采购需求评审                     | purchase review             | 与已有 purchase_receipts 重复 | purchase-order review    |
| DELTA-CURRENT-010 | current  | 出货放行                                 | Workflow 规则  | Product Core                               | 已有 workflow 边界 | 是                 | 保持 `shipping_released != shipped` | shipment review             | 被误解为已出库                  | shipment-usecase-review  |
| DELTA-CURRENT-011 | current  | 实际出货 / 出库                            | 业务主链路        | Product Core                               | 未做             | 是                 | 后续 shipment facts                 | shipment review             | 高风险事实层                   | shipment-usecase-review  |
| DELTA-CURRENT-012 | current  | 库存预留                                 | 出货/库存需求      | Product Core                               | 未做             | 是                 | 后续 reservation review             | shipment/inventory boundary | 预留和扣减混淆                  | stock-reservation review |
| DELTA-CURRENT-013 | current  | 应收 / 发票 / 收款                         | 财务需求         | Product Core                               | 未做             | 是                 | 后续 finance review                 | 出货事实/对账口径                   | 不能从放行生成                  | finance review           |
| DELTA-CURRENT-014 | current  | 供应商应付 / 付款                           | 财务需求         | Product Core                               | 未做             | 是                 | 后续 finance review                 | purchase/outsourcing facts  | 付款口径复杂                   | finance review           |
| DELTA-CURRENT-015 | current  | 手机端任务处理                              | 汇报资料/产品方向    | Industry Template / UI                     | 计划中            | 可能                | mobile task review                | 任务/岗位权限                     | 空壳入口风险                   | mobile review            |
| DELTA-CURRENT-016 | current  | 老板审批更快                               | 汇报资料         | Industry Template                          | 方向成立           | 可能                | Workflow/mobile                   | 审批节点设计                      | 只做 UI 不做权限               | mobile workflow review   |
| DELTA-CURRENT-017 | current  | 仓库 / 品质现场扫码拍照                        | 汇报资料         | Industry Template / Product Core           | 延后             | 可能                | 质检/库存/移动端评审                       | 事实模型                        | 手机端先做空壳风险                | mobile + quality review  |
| DELTA-CURRENT-018 | current  | 旧 business_records partners 入口       | 旧系统兼容        | Compatibility                              | 退出正式入口         | 否                 | 删除 / 隐藏旧入口；必要时仅保留迁移参考数据 | transition audit            | 双真源                      | legacy removal review    |
| DELTA-CURRENT-019 | current  | 旧 business_records project-orders 入口 | 旧系统兼容        | Compatibility                              | 退出正式入口         | 否                 | 用正式 sales_orders 承接新写入；旧入口删除 / 隐藏 | transition audit            | 双写/误导                    | legacy removal review    |
| DELTA-CURRENT-020 | current  | 旧 business_records products 入口       | 旧系统兼容        | Compatibility / Deferred                   | 退出正式入口         | 否                 | 与正式 products / SKU 方向对齐；旧入口删除 / 隐藏 | product review              | 重复主数据                    | product-sku review       |
| DELTA-CURRENT-021 | current  | current 数据导入                         | 客户落地需要       | Data Import Adapter                        | dry-run / freeze tooling 已完成，真实导入未做 | 否                 | source freeze / dry-run evidence -> loader design -> import execution | 人工确认                        | 误导入/误生成事实                | import loader design     |
| DELTA-CURRENT-022 | current  | 打印/导出模板                              | 客户交付需要       | Print Template                             | 未做             | 否                 | 模板包                               | 确认格式                        | 模板当业务规则                  | print template review    |
| DELTA-CURRENT-023 | current  | 菜单入口                                 | V1 页面可试用需要   | Customer Config / UI                       | 未接正式菜单         | 否                 | formal menu review + legacy entry removal | business_records cutover    | 菜单误导成熟度                  | V1 menu entry review     |
| DELTA-CURRENT-024 | current  | seedData 初始化                         | 交付/演示需要      | Customer Config / Demo Seed                | 未改             | 否                 | 单独评审                              | menu/seed boundary          | 误当正式数据                   | seed review              |
| DELTA-CURRENT-025 | current  | docs registry / 帮助中心                 | 交付/培训需要      | Help / QA                                  | 未改             | 否                 | 后续帮助中心业务版                         | 功能稳定后                       | 文档误导实现状态                 | help review              |

---

## 9. 客户差异处理规则

### 9.1 可以直接进入 Product Core 的条件

满足以下条件之一，才考虑进入 Product Core：

* 多个客户都会用。
* 属于 ERP 核心事实正确性。
* 属于库存、出货、财务、审计、权限等不可客户自由配置的规则。
* 不依赖 current 单一客户特殊字段。
* 有明确业务口径和测试口径。

### 9.2 不得直接进入 Product Core 的内容

以下内容不得直接进入 Product Core：

* current Excel 中单独出现的字段。
* current PDF 中单独出现的合同条款。
* 当前客户口头说法但未确认的问题。
* 打印模板字段。
* 导入适配字段。
* 旧 business_records 快照字段。
* demo / seed 数据字段。
* 尚未评审的 product_skus / purchase_orders / shipment / finance 字段。

### 9.3 必须进入 Customer Config 的内容

适合 Customer Config：

* 公司名称。
* Logo。
* 菜单显示。
* 字段显示 / 必填。
* 编号规则。
* 打印模板参数。
* 默认仓库。
* 默认单位。
* 角色模板。
* 权限模板。
* 初始化数据。

### 9.4 必须进入 Data Import Adapter 的内容

适合 Data Import Adapter：

* current Excel 字段映射。
* business_records 历史快照映射。
* 不同客户导入表头。
* 数据清洗规则。
* unresolved queue。
* dry-run preview。
* duplicate candidates。
* conflict candidates。

### 9.5 必须进入 Print Template 的内容

适合 Print Template：

* 加工合同格式。
* 客户送货单样式。
* 采购单打印样式。
* 对账单导出样式。
* 页眉页脚。
* 公司名称、地址、电话、税号。
* 客户专属条款。

### 9.6 必须 Deferred 的内容

以下内容必须 Deferred，直到独立评审：

* product_skus。
* purchase_orders。
* stock_reservations。
* shipments。
* shipment_items。
* AR/AP。
* invoice。
* payment。
* reconciliation。
* production facts。
* outsourcing facts。

---

# 第四部分：三类台账的维护流程

## 10. 什么时候更新产品能力进度台账

以下情况必须更新产品能力进度台账：

* 新增 schema。
* 新增 migration。
* 新增 repo/usecase。
* 新增 API/RBAC。
* 新增 UI 页面。
* 新增数据导入工具。
* 新增部署包。
* 某能力从 draft 进入 implemented。
* 某能力从 internal ready 进入 trial ready。
* 某能力被客户试用。
* 某能力被标记为 deferred / deprecated。

更新时必须写：

* 证据路径。
* 测试命令。
* 当前不包含。
* 下一步。
* 风险。

---

## 11. 什么时候更新客户交付矩阵

以下情况必须更新客户交付矩阵：

* 某客户启用模块。
* 某客户完成配置草案。
* 某客户完成数据导入 dry-run。
* 某客户完成真实导入。
* 某客户开始试用。
* 某客户验收某模块。
* 某客户模块被阻塞。
* 某客户模块进入 deferred。
* 某客户模块不再交付。

更新时必须写：

* 交付状态。
* 客户可见方式。
* 不包含什么。
* 客户确认项。
* 风险。

---

## 12. 什么时候更新客户差异台账

以下情况必须更新客户差异台账：

* 甲方提出新需求。
* 从 Excel / PDF / 截图中发现字段差异。
* 从试用反馈中发现特殊流程。
* 从导入 dry-run 中发现 unresolved 字段。
* 从打印模板中发现客户专属字段。
* 从权限配置中发现职责差异。
* 从业务讨论中发现行业共性。
* 某客户差异被提升为行业模板候选。
* 某客户差异被拒绝进入产品内核。
* 某客户差异被标记为 deferred。

更新时必须分类：

* Product Core
* Industry Template
* Customer Config
* Customer Extension
* Data Import Adapter
* Print Template
* Reporting
* Customer Material
* Deferred
* Forbidden

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
current 提出“订单里要颜色”
  -> 客户差异台账：颜色字段来自 current 样本，分类为 Industry Template Candidate / Deferred
  -> 产品能力进度台账：product_skus 仍 L3 Draft Only
  -> 客户交付矩阵：current 暂不能承诺 SKU 能力，只能在 sales_order_item 中保留 color snapshot 或备注类字段
```

---

## 14. 防止信息差规则

### 14.1 禁止写法

禁止在没有证据时写：

* 已完成。
* 已上线。
* 已支持。
* 已交付。
* 可销售。
* 事实真源。
* 客户已确认。
* 已迁移。

### 14.2 推荐写法

应写：

* 已评审。
* 已形成草案。
* 已完成 schema。
* 已生成 migration。
* 已完成 repo/usecase。
* 已完成 API/RBAC。
* 已完成 UI。
* 可内部联调。
* 可客户试用。
* 待客户确认。
* 待真实导入。
* 待交付验收。

### 14.3 “已完成”必须附证据

任何“已完成”都必须附：

* 文件路径。
* 测试命令。
* review 报告。
* 不包含内容。

---

## 15. 建议后续台账拆分

当本文变大后，可以拆为：

```text
docs/product/capability-ledger.md
docs/customers/current/delivery-matrix.md
docs/customers/current/delta-ledger.md
```

其中：

* `capability-ledger.md` 维护产品能力进度。
* `delivery-matrix.md` 维护 current 客户交付状态。
* `delta-ledger.md` 维护 current 客户差异。

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

建议下一步优先做：

```text
workspace-boundary-checkpoint
```

然后二选一：

```text
v1-menu-entry-review
```

或：

```text
current-customer-import-loader-design
```

如果目标是让 current 甲方尽快试用：

```text
workspace-boundary-checkpoint
-> v1-menu-entry-review
-> current customer trial checklist
```

如果目标是准备真实数据落地：

```text
workspace-boundary-checkpoint
-> current-customer-import-loader-design
-> current-import-execution-and-audit
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

* current 客户资料污染 Product Core。
* 旧 business_records 变成双真源或旧入口继续误导用户。
* 菜单看起来比能力成熟。
* Workflow 和 Fact 混淆。
* 文档写“已完成”但代码没有证据。
* 多客户交付时每家 fork 一套代码。
