# 系统分层进度

> 目的：给开发、验收和实施人员提供一页系统层级进度总控，明确哪些层已有事实真源、哪些仍停留在 schema / usecase / test，哪些能力后续必须单独评审。本文档不是业务操作页面，不接后端 API，也不替代正式业务帮助中心。

## 1. 页面定位

- 本页只属于“开发与验收”模块。
- 本页用于跟踪 ERP 各架构层做到哪了，不作为普通业务用户帮助页。
- 本页只记录当前代码和正式文档事实，不做动态项目管理表。
- 本页不新增后端表、不改 Ent schema、不生成 migration。
- 本页不改变 workflow、inventory、purchase、quality、shipment、finance 的运行时行为。

## 2. 总体分层

| 层级                                       | 当前状态                     | 本页口径                                                             |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| MasterData 主数据层                        | 部分完成                     | 已有单位、材料、产品、仓库和最小 BOM；客户 / 供应商仍待评审。        |
| Workflow 协同层                            | 已落 7 条最小后端规则        | 只承接协同任务、事件、业务状态和必要任务派生。                       |
| Inventory 库存事实层                       | 已有最小事实底座             | `inventory_txns` 是库存事实真源，`inventory_balances` 是查询加速表。 |
| Quality 质检事实层                         | 已有来料质检最小主表         | `quality_inspections` 已落地，但明细、报告、页面和 API 未接。        |
| Purchase 采购事实层                        | 已有入库、退货、调整事实     | 还不是完整采购订单系统。                                             |
| Shipment 出货事实层                        | 已评审，未落事实表           | `shipment_release done` 只是 `shipping_released`，不是 `shipped`。   |
| Finance 财务事实层                         | 未开始                       | 应收 / 开票至少应在真实 `shipped` 后评审。                           |
| RBAC 权限层                                | 已切换标准 RBAC              | 前端隐藏菜单不是安全边界。                                           |
| API / UI 层                                | 部分接入                     | 多个事实能力仍停留在 schema / repo / usecase / test。                |
| Help / Debug / QA 层                       | 已有 5 个入口，本轮新增 2 个 | 开发验收入口不与普通帮助中心主入口混淆。                             |
| Reporting / Audit / Integration 后续增强层 | 未开始 / 后续增强            | 报表、审计、附件、导入导出、扫码和集成后续再做。                     |
| Productization / Delivery 产品化交付层     | 本轮新增总控入口             | 当前只记录单客户私有化和产品化边界，不提前实现复杂 SaaS。            |

## 3. 必须长期保持的边界

- Workflow task done 不等于 Fact posted。
- Business status 不等于 Inventory balance。
- `warehouse_inbound done` 不等于 `purchase_receipt posted`，除非后续明确 usecase 对接。
- `shipment_release done` 不等于 `shipped`。
- 应收 / 开票至少应在真实 `shipped` 后再评审。
- workflow payload 是展示快照，不是库存、出货、财务事实真源。
- 已有 `products / materials / units / warehouses / inventory_txns / inventory_balances / inventory_lots` 不要重复设计。
- `WorkflowUsecase` 不应直接写库存、出货、财务事实，除非正式边界文档明确允许。

## 4. MasterData 主数据层

### 已完成 / 已有

- `units`
- `materials`
- `products`
- `warehouses`
- `bom_headers`
- `bom_items`

### 未完成

- `customers / suppliers`
- `supplier_contacts`
- `supplier_materials / supplier_prices`
- 产品 / 客户 / 供应商前端页面

### 下一步

- 不重复设计 `products / materials / units / warehouses`。
- 客户 / 供应商先做方案评审，再落最小主数据。
- 供应商价格、联系人和默认资料应先确认字段真源，再决定是否进入主数据层。

## 5. Workflow 协同层

### 已完成 7 条后端 WorkflowUsecase 最小规则

| 规则                       | 当前结果                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- |
| boss approval              | `done -> engineering_data`，`blocked / rejected -> order_revision`。              |
| IQC                        | `done -> warehouse_inbound`，`blocked / rejected -> purchase_quality_exception`。 |
| purchase warehouse_inbound | `done -> inbound_done`，`blocked / rejected -> blocked`。                         |
| outsource_return_qc        | `done -> outsource_warehouse_inbound`，`blocked / rejected -> outsource_rework`。 |
| finished_goods_qc          | `done -> finished_goods_inbound`，`blocked / rejected -> finished_goods_rework`。 |
| finished_goods_inbound     | `done -> inbound_done`，`blocked / rejected -> blocked`。                         |
| shipment_release           | `done -> shipping_released`，`blocked / rejected -> blocked`。                    |

### 边界

- `WorkflowUsecase` 只负责协同任务、事件、业务状态和必要的协同任务派生。
- `WorkflowUsecase` 不直接写库存、出货、财务事实。
- 已迁入后端的 workflow 规则，前端真实运行时不应再本地双写同一业务状态或下游任务。
- 七条最小规则不是完整 workflow engine。

## 6. Inventory 库存事实层

### 已完成

- `inventory_txns`
- `inventory_balances`
- `inventory_lots`
- `IN / OUT / ADJUST / REVERSAL`
- 采购入库
- 采购退货
- 采购入库调整
- 批次状态守卫

### 未完成

- 生产领料
- 成品入库事实
- 出货扣减
- `available / reserved / frozen`
- `stock_reservations`
- `stock_holds`

### 边界

- `inventory_txns` 是库存事实真源。
- `inventory_balances` 是查询加速表。
- 不在 `WorkflowUsecase` 中直接写库存事实。
- 库存错误通过 `REVERSAL` 或明确业务单据冲正，不直接修改历史流水。

## 7. Quality 质检事实层

### 已完成

- `quality_inspections`
- 来料质检状态联动 `inventory_lots.status`
- `DRAFT / SUBMITTED / PASSED / REJECTED / CANCELLED` 等状态规则

### 未完成

- `quality_inspection_items`
- 缺陷项字典
- 抽检数量
- 不良数量
- 质检报告
- 供应商质量评分
- 前端页面 / API 接入

### 下一步

- 评审 `QualityUsecase` 与 workflow task 的关系。
- 质检 API / 页面后续单独接入。
- submit / pass / reject / cancel 这类会改变批次可用性的动作，应拆分动作级权限。

## 8. Purchase 采购事实层

### 已完成

- `purchase_receipts / purchase_receipt_items`
- `purchase_returns / purchase_return_items`
- `purchase_receipt_adjustments / purchase_receipt_adjustment_items`

### 未完成

- `purchase_orders`
- `purchase_order_items`
- `purchase_contracts`
- `purchase_requisitions`
- supplier quotation
- purchase planning

### 边界

- 当前已做采购入库、采购退货、采购入库调整事实。
- 当前还不是完整采购订单系统。
- 供应商主数据、采购合同、采购计划、应付和发票仍需单独评审。

## 9. Shipment 出货事实层

### 已评审

- `shipment_release done` 不等于 `shipped`。
- `shipment_release` 最小语义是 `shipping_released`。
- `shipped` 应由未来 `ShipmentUsecase / shipment_execution / outbound done` 确认。

### 未完成

- `shipments`
- `shipment_items`
- `stock_reservations / shipment_reservations`
- `shipment_execution`
- outbound posting
- inventory `OUT` with shipment source

### 下一步

- 先做 `ShipmentUsecase / 出货事实模型` 评审或最小 schema 方案。
- 不要直接从 `shipment_release done` 生成应收 / 开票。
- 出货事实需要结构化产品、单位、仓库、批次、行级来源和幂等键，不能只依赖 workflow payload 展示快照。

## 10. Finance 财务事实层

### 未开始

- `accounts_receivable`
- `ar_invoices`
- `accounts_payable`
- `ap_invoices`
- `payments`
- `payment_allocations`
- reconciliation

### 边界

- 应收 / 开票至少应在真实 `shipped` 后评审。
- 不从 `shipment_release done` 直接生成财务事实。
- 入库金额、退货金额和调整说明当前只作为业务快照，不等于应付、发票或付款真源。

## 11. RBAC 权限层

### 已完成

- `roles`
- `permissions`
- `role_permissions`
- `admin_user_roles`
- `admin_users.is_super_admin`
- workflow 权限回归

### 后续

- 每个事实 API 接入时同步接 RBAC。
- 前端隐藏菜单不是安全边界。
- 任务处理不能只靠菜单权限，还必须校验 `owner_role_key / assignee_id / task_status_key` 等业务边界。

## 12. API / UI 层

### 当前

- workflow 移动端和开发验收页面较多。
- 库存 / 采购 / 质检事实能力很多还停留在 schema / repo / usecase / test。

### 未完成

- 采购入库页面
- 采购退货页面
- 库存查询页面
- 质检页面
- 生产页面
- 出货页面
- 财务页面

## 13. Help / Debug / QA 层

### 已有

- 验收结果总览
- 业务链路调试
- 字段联动覆盖
- 运行记录
- 专项报告

### 本轮新增

- 系统分层进度
- 产品化与交付

### 后续

- 帮助中心写业务版全链路说明。
- 不暴露 `WorkflowUsecase / InventoryUsecase / schema / migration` 等技术细节给普通业务用户。
- 开发与验收入口用于研发、实施和验收，不替代业务操作教程。

## 14. Reporting / Audit / Integration 后续增强层

### 未开始 / 后续增强

- 报表 / BI
- 审计追踪
- 附件 / 文件
- Excel 导入导出
- 条码 / 扫码
- 外部财务 / 物流集成
- 数据归档 / 分区 / 压测

这些能力应在事实层和核心 usecase 稳定后推进，不应提前污染当前核心业务模型。

## 15. Productization / Delivery 产品化交付层

- 本轮新增“产品化与交付”入口。
- 当前阶段只做单客户私有化部署和产品化边界记录。
- 当前不提前实现复杂 SaaS 多租户。
- 客户资料隔离、tenant config 目录规划、部署模板和客户扩展边界后续单独评审。
