# Imported Note: 毛绒玩具 ERP 从 0 到 1 重构方案

- Source: `/Users/simon/Desktop/plush-toy-erp-from-0-to-1-plan.md`
- Imported At: 2026-06-02
- Status: Reference Only
- Purpose: 作为 0 到 1 产品架构、业务域闭环、Workflow / Fact 边界和后续 Goal 拆分的外部规划输入。
- Not Source Of Truth: 本文不是 runtime、schema、migration、API、UI、目录结构、roadmap 编号或交付排期真源。

使用时必须先对照：

- `docs/current-source-of-truth.md`
- `docs/product/zero-to-one-architecture.md`
- `docs/product/product-completion-roadmap.md`
- `docs/product/domain-model-v1.md`
- `docs/architecture/status-workflow-fact-boundary.md`

本文中的“大量重构”、目录树、API 示例、状态示例、字段示例和时间估算只能作为评审素材；不得直接作为执行指令，也不得绕过具体 `docs/codex-goals/*.md`。

---

# 毛绒玩具 ERP 从 0 到 1 重构方案

整理日期：2026-06-01

## 0. 项目重新定义

既然项目还在起步阶段，允许大量重写 / 大重构，方案应从“低风险渐进修补”切换成“从 0 到 1 重建产品骨架”。

这里的“大重构”不是无序推倒重来，而是：

- 先把边界、模型、目录、事实层、配置层一次性立正。
- 再按 MVP 闭环开发。

建议将项目重新定义为：

> 毛绒玩具工厂任务驱动型 ERP 产品内核
>
> 第一目标：服务当前甲方上线。
>
> 第二目标：沉淀为可复制给同行的私有化部署产品。
>
> 第三目标：未来再评审 SaaS 多租户。

这和现有汇报材料匹配：材料里已经明确系统原则是“岗位入口、任务驱动、桌面端 + 手机端”，手机端负责移动场景下的高频任务。

实施建议：

- 第一期先打通订单到出货主链路和手机端任务处理。
- 第二期补异常 / 返工中心。
- 第三期补成本、供应商绩效、外发工厂绩效。

## 1. 先给结论

### 1.1 现在可以大量重构什么

可以大量重构：

```text
目录结构
前端模块组织
后端 usecase 边界
业务模型命名
seed/demo/test 分离
文档体系
客户资料隔离
Workflow / Fact 边界
API 分层
RBAC 权限码体系
测试门禁
部署交付结构
```

可以重新设计：

```text
customers / suppliers
orders
products / SKU / BOM
purchase
outsourcing
quality
inventory
production
shipment
finance
mobile task
```

可以保留并吸收：

```text
已有 inventory_txns / balances / lots 思路
已有 purchase_receipts / returns / adjustments 思路
已有 quality_inspections 思路
已有 workflow task 思路
已有 RBAC 权限底座思路
已有手机端岗位入口设计
```

### 1.2 现在仍然不建议做什么

哪怕从 0 到 1，也不建议第一版就做：

```text
真正 SaaS 多租户
license server
套餐计费
客户工单系统
复杂插件市场
每客户独立 fork 一份代码
泛化 Change 模块
泛化 BusinessRecord 代替所有事实表
```

原因很简单：现在最缺的不是 SaaS 能力，而是行业 ERP 产品内核的业务闭环。

## 2. 当前甲方怎么定位

当前甲方应该算：

```text
第一个真实客户
第一个种子客户
第一个私有化部署客户实例
第一个需求验证样本
第一个配置包来源
```

但不建议现在算：

```text
数据库 runtime tenant
SaaS 租户
多租户隔离对象
```

推荐内部口径：

```text
customer_key = current
deployment_key = current-prod
config_key = current-private
template_key = plush-industry
core_version = 0.1.x
```

也就是说，管理上把它当客户实例，技术运行时先不加 `tenant_id`。

如果以后真的做 SaaS，再单独评审 `tenant_id`、数据隔离、对象存储隔离、权限隔离、计费授权。现在先做：

```text
一套代码
一个行业模板
多个客户配置包
每客户一套数据库 / 对象存储 / 部署配置
```

## 3. 从 0 到 1 的总架构

建议重构成下面这套分层：

```text
Product Core 产品内核
  ├─ MasterData 主数据
  ├─ Fact 事实层
  ├─ Workflow 协同层
  ├─ RBAC 权限层
  ├─ API 层
  └─ Audit / Reporting 基础

Industry Template 毛绒玩具行业模板
  ├─ 默认角色
  ├─ 默认菜单
  ├─ 默认流程
  ├─ 默认字段
  ├─ 默认打印模板
  └─ 默认 seed

Customer Config 客户配置包
  ├─ 公司信息
  ├─ 菜单开关
  ├─ 字段显示 / 必填
  ├─ 编号规则
  ├─ 打印模板
  ├─ 初始化数据
  └─ 部署参数

Customer Extension 客户扩展
  └─ 极少数客户专属逻辑

Delivery / Ops 交付运维层
  ├─ compose / env
  ├─ migration
  ├─ backup / restore
  ├─ release checklist
  └─ customer deployment notes
```

## 4. 从 0 到 1 的推荐目录结构

既然允许大量重构，建议从一开始就把目录切清楚。

### 4.1 后端目录

建议目标结构：

```text
server/
  cmd/
    api/
    migrate/
    seed/

  internal/
    app/
      bootstrap/
      config/
      auth/
      http/
      rpc/

    core/
      masterdata/
        customer/
        supplier/
        product/
        material/
        warehouse/
        unit/

      order/
        sales_order/
        order_revision/

      bom/
        bom_header/
        bom_item/
        bom_version/

      purchase/
        purchase_order/
        purchase_receipt/
        purchase_return/
        purchase_adjustment/

      inventory/
        lot/
        txn/
        balance/
        reservation/
        adjustment/

      quality/
        inspection/
        exception/

      production/
        production_order/
        material_issue/
        finished_goods_receipt/
        rework/

      outsourcing/
        outsource_order/
        outsource_issue/
        outsource_receipt/
        outsource_settlement/

      shipment/
        shipment/
        shipment_item/
        reservation/
        outbound/

      finance/
        ar/
        ap/
        invoice/
        payment/
        reconciliation/

      workflow/
        task/
        rule/
        event/

      rbac/
        role/
        permission/
        menu/

      audit/
        audit_log/

      reporting/
        dashboard/

    data/
      ent/
      migrations/
      repositories/

    interfaces/
      api/
      dto/
      presenters/

    tests/
      fixtures/
      integration/
```

核心原则：

```text
workflow 不写 inventory / shipment / finance fact
inventory 只管库存事实
shipment 只管出货事实
finance 只管财务事实
quality 只管质检事实
purchase 只管采购事实
production 只管生产事实
```

### 4.2 前端目录

建议目标结构：

```text
web/src/erp/
  app/
    routes/
    providers/
    layout/

  shared/
    api/
    auth/
    components/
    hooks/
    utils/
    constants/

  modules/
    dashboard/
    workflow/
    masterdata/
      customers/
      suppliers/
      products/
      materials/
      warehouses/
      units/

    order/
    bom/
    purchase/
    inventory/
    quality/
    production/
    outsourcing/
    shipment/
    finance/
    reporting/
    rbac/
    settings/

  mobile/
    app/
    roles/
      boss/
      business/
      pmc/
      purchase/
      warehouse/
      quality/
      production/
      finance/

  docs/
    business/
    qa/
    productization/
    customer-guides/

  config/
    moduleRegistry.mjs
    menuRegistry.mjs
    roleRegistry.mjs
    fieldRegistry.mjs
    docsRegistry.mjs
```

当前汇报材料里已经强调岗位入口和手机端策略：岗位入口不是复杂菜单驱动，订单创建后系统自动生成任务树，手机端负责移动场景高频任务。这个应该成为前端重构主线，不要只做传统后台菜单。

### 4.3 配置和部署目录

第一版可以建，但不做 SaaS runtime。

```text
config/
  product/
    modules.yaml
    permissions.yaml
    roles.yaml

  industry-templates/
    plush/
      roles.yaml
      menus.yaml
      workflows.yaml
      fields.yaml
      numbering.yaml
      print-templates/
      seed/

  customers/
    current/
      customer.yaml
      modules.yaml
      menus.yaml
      fields.yaml
      numbering.yaml
      roles.yaml
      seed/
      print-templates/

deployments/
  current/
    README.md
    env.example
    compose.override.example.yml
    backup.md
    restore.md
    release-checklist.md
```

注意：

```text
config/customers/current 不是 SaaS tenant
deployments/current 不是多租户
只是第一个客户私有化部署配置
```

## 5. 从 0 到 1 的业务域模型

### 5.1 主数据 MasterData

第一版必须有：

```text
customers
suppliers
contacts
units
materials
products
product_skus
warehouses
locations 可选
```

建议模型：

```text
customers
  id
  code
  name
  short_name
  status
  invoice_title
  tax_no
  payment_terms
  remark

suppliers
  id
  code
  name
  type: material / outsourcing / service / mixed
  status
  invoice_title
  tax_no
  settlement_terms
  remark

contacts
  id
  owner_type: customer / supplier
  owner_id
  name
  phone
  role
  is_primary

products
  id
  code
  name
  customer_id
  category
  status
  remark

product_skus
  id
  product_id
  sku_code
  color
  size
  version
  image_url
  status

materials
  id
  code
  name
  category
  color
  spec
  default_unit_id
  status

warehouses
  id
  code
  name
  type: material / semi_finished / finished_goods / defective / outsource / virtual
  status
```

生产订单截图里能看到下单日期、客户、订单编号、产品编号、产品名称、颜色、订购数量、出货日期、未出货数、跟单业务人员、类别、单价、备注等列。这说明第一版主数据和订单模型必须支持客户、产品、颜色、数量、交期、未出货、单价这些字段，但不能简单照抄截图列名做死。

### 5.2 订单 Order

第一版建议做正式销售订单，不要再用泛化 `business_records` 顶着。

```text
sales_orders
  id
  order_no
  customer_id
  customer_order_no
  status
  order_date
  delivery_date
  merchandiser_id
  remark

sales_order_items
  id
  sales_order_id
  product_id
  sku_id
  product_code_snapshot
  product_name_snapshot
  color_snapshot
  quantity
  unit_price
  planned_delivery_date
  shipped_quantity
  status
```

订单状态建议：

```text
draft
submitted
boss_reviewing
approved
engineering
purchasing
production
quality_checking
shipping_releasing
shipping_released
partially_shipped
shipped
closed
cancelled
```

注意：

```text
shipping_released != shipped
approved != 采购已完成
production != 库存已扣
```

### 5.3 BOM

第一版要做 BOM，但要允许版本。

```text
bom_headers
  id
  product_id
  sku_id nullable
  version
  status: draft / active / archived
  effective_from
  remark

bom_items
  id
  bom_header_id
  material_id
  usage_qty
  unit_id
  loss_rate
  position
  color
  process_note
  remark
```

原则：

```text
BOM 是产品工程资料
采购需求可以从 BOM 派生
库存不能直接从 BOM 改
BOM 改版要留版本
```

### 5.4 采购 Purchase

第一版必须做：

```text
purchase_orders
purchase_order_items
purchase_receipts
purchase_receipt_items
purchase_returns
purchase_adjustments
```

采购入库过账写库存事实：

```text
purchase_receipt posted
  -> inventory_lots
  -> inventory_txns IN
  -> inventory_balances +
```

采购退货：

```text
purchase_return posted
  -> inventory_txns OUT
  -> inventory_balances -
```

采购调整：

```text
purchase_adjustment posted
  -> inventory_txns ADJUST_IN / ADJUST_OUT
```

### 5.5 质检 Quality

第一版建议区分三类质检：

```text
incoming_material_inspection
outsource_return_inspection
finished_goods_inspection
```

可以先共用表：

```text
quality_inspections
  id
  inspection_no
  source_type: purchase_receipt / outsource_receipt / finished_goods_receipt
  source_id
  lot_id nullable
  item_type: material / product
  item_id
  status: submitted / passed / rejected / cancelled
  decision: pass / reject / concession
  inspected_qty
  defect_qty
  inspector_id
  inspected_at
  reason
  photos
```

质检规则：

```text
质检改变批次状态
质检不直接写库存数量流水
不合格退货走 purchase_return 或后续 outsource_return
让步接收要记录批准人
```

### 5.6 库存 Inventory

第一版建议坚持事实层：

```text
inventory_lots
inventory_txns
inventory_balances
stock_reservations
```

库存流水不可变。

```text
inventory_txns
  id
  txn_no
  item_type: material / product
  item_id
  lot_id
  warehouse_id
  direction: in / out
  txn_type: purchase_in / purchase_return / production_issue / finished_goods_in / shipment_out
  quantity
  source_type
  source_id
  occurred_at
```

余额表：

```text
inventory_balances
  item_type
  item_id
  warehouse_id
  lot_id nullable
  on_hand_qty
  reserved_qty
  frozen_qty
```

可用量：

```text
available_qty = on_hand_qty - reserved_qty - frozen_qty
```

### 5.7 生产 Production

第一版不需要做复杂 MES，但必须做生产事实。

```text
production_orders
  id
  production_no
  sales_order_id
  sales_order_item_id
  product_id
  sku_id
  planned_qty
  status

production_material_issues
  id
  issue_no
  production_order_id
  status

production_material_issue_items
  issue_id
  material_id
  lot_id
  warehouse_id
  qty

finished_goods_receipts
  id
  receipt_no
  production_order_id
  product_id
  sku_id
  qty
  warehouse_id
  status
```

规则：

```text
生产领料 posted -> inventory OUT
成品入库 posted -> inventory IN
workflow 的 finished_goods_inbound done 不是库存入账
```

### 5.8 委外 Outsourcing

加工合同样本里能看到来货要求、交期责任、违约处理、结算方式，以及纸样 / 图片附件，这说明委外模块不能只做一个“加工记录”，至少要支持合同 / 发料 / 回货 / 质检 / 结算 / 附件。

第一版建议做：

```text
outsource_orders
outsource_order_items
outsource_material_issues
outsource_receipts
outsource_receipt_inspections
outsource_settlements
```

可以先简化：

```text
委外订单
委外发料
委外回货
委外质检
委外返工
委外结算草稿
```

### 5.9 出货 Shipment

第一版一定要把出货事实做清楚。

```text
shipments
  id
  shipment_no
  customer_id
  sales_order_id
  status: draft / released / reserved / picked / shipped / cancelled
  planned_ship_date
  actual_ship_date

shipment_items
  id
  shipment_id
  sales_order_item_id
  product_id
  sku_id
  planned_qty
  shipped_qty

stock_reservations
  id
  source_type: shipment
  source_id
  item_type: product
  item_id
  warehouse_id
  lot_id
  reserved_qty
  status: active / released / consumed / cancelled
```

关键规则：

```text
shipment_release workflow done -> shipping_released
shipping_released 后可以创建 / 确认 shipment
reservation 只是锁库存
shipped 才写 inventory OUT
shipped 后才进入财务应收评审
```

### 5.10 财务 Finance

第一版财务不要一口吃完。建议先做：

```text
AR 应收草案
AP 应付草案
invoice 发票记录
payment 收付款记录
reconciliation 对账单
```

财务生成时机必须明确：

```text
AR 不从 workflow shipment_release 直接生成
AR 应从真实 shipped 或客户对账确认生成
AP 不一定从 purchase_receipt 自动生成，可能从供应商对账确认生成
```

## 6. Workflow 从 0 到 1 怎么做

Workflow 是协同层，不是事实层。

建议 Workflow 只做：

```text
任务生成
任务分派
任务认领
任务完成
任务驳回
任务转派
任务超时
任务提醒
任务评论
任务附件
```

任务类型：

```text
boss_approval
engineering_data
purchase_followup
iqc
warehouse_inbound
production_schedule
material_issue
outsource_issue
outsource_return_qc
finished_goods_qc
finished_goods_inbound
shipment_release
finance_review
```

Workflow 的输出可以是：

```text
协同状态
下一任务
事件通知
```

不能直接替代：

```text
库存入账
出货扣减
应收生成
应付生成
发票开具
付款核销
```

## 7. 从 0 到 1 的 MVP 顺序

建议 MVP 分 6 个版本，而不是一个“大 ERP”。

### V0：骨架重构，2~3 周

目标：重建目录、文档、测试门禁、基础配置。

做：

```text
新目录结构
Product Core / Template / Customer Config 边界
docs/current-source-of-truth
capability-ledger
release-gates
customer current 资料台账
测试门禁
RBAC 基础
API 基础
前端模块注册
移动端入口骨架
```

不做：

```text
复杂业务功能
财务
SaaS
tenant_id
```

验收：

```text
后端可启动
前端可启动
空数据首页可访问
移动端角色入口可访问
基础测试通过
```

### V1：订单到工程资料，3~4 周

目标：从客户订单进入系统，到老板审批、工程资料、BOM。

做：

```text
customers
products
product_skus
sales_orders
sales_order_items
boss approval workflow
BOM
BOM version
工程资料附件
```

页面：

```text
订单列表
订单详情
产品 / SKU
BOM 编辑
老板审批手机端
工程资料任务
```

验收：

```text
创建订单
提交审批
老板手机端审批
审批通过进入工程 / BOM
BOM 生效
```

### V2：采购 + 来料 + 质检 + 库存，4~5 周

目标：BOM 触发采购，材料入库，质检，库存形成事实。

做：

```text
suppliers
purchase_orders
purchase_receipts
quality_inspections
inventory_lots
inventory_txns
inventory_balances
purchase_returns
purchase_adjustments
```

页面：

```text
采购单
采购入库
IQC
材料库存
批次详情
采购退货
入库调整
```

验收：

```text
从订单 / BOM 生成采购需求
采购下单
到货入库
提交质检
质检通过批次可用
库存余额正确
不合格退货
```

### V3：生产 + 委外 + 成品入库，5~6 周

目标：材料进入生产 / 委外，成品入库形成事实。

做：

```text
production_orders
production_material_issues
finished_goods_receipts
outsource_orders
outsource_material_issues
outsource_receipts
outsource_return_qc
finished_goods_qc
```

页面：

```text
PMC 排产
生产任务
生产领料
委外加工单
委外发料
委外回货
成品质检
成品入库
```

验收：

```text
生产领料扣材料库存
委外发料可追踪
委外回货可质检
成品入库增加成品库存
返工有记录
```

### V4：出货 + 库存预留 + 实际出库，4~5 周

目标：完成真实出货事实。

做：

```text
shipment_release workflow
shipments
shipment_items
stock_reservations
picking
shipment_outbound
inventory OUT
```

页面：

```text
出货计划
出货放行
库存预留
拣货
出库确认
出货记录
未出货跟踪
```

验收：

```text
出货放行不扣库存
预留锁定可用库存
实际出库才扣库存
订单 shipped_quantity 正确
支持部分出货
取消可释放预留
```

### V5：财务对账最小版，4~6 周

目标：先做应收 / 应付 / 对账，不追求复杂财务。

做：

```text
AR from shipment
AP from purchase / outsource settlement
invoice records
payment records
customer reconciliation
supplier reconciliation
```

页面：

```text
客户对账
供应商对账
应收列表
应付列表
发票记录
收款记录
付款记录
```

验收：

```text
已出货生成应收草案
采购 / 委外生成应付草案
支持对账确认
支持收付款登记
支持未收 / 未付查询
```

### V6：产品化交付，持续

目标：让第二个甲方可以复制部署。

做：

```text
config/customers/current
industry template plush
deployment current
backup / restore
release checklist
customer onboarding checklist
data import templates
print templates
training docs
```

验收：

```text
新客户能用同一套代码
替换配置和初始化数据即可试点
不复制代码 fork
```

## 8. 大重构的具体执行策略

即使允许大重构，也建议分三步做，不要同时改一切。

### 第一步：立新骨架

先新建目标目录，保留旧代码。

```text
server/internal/core/*
web/src/erp/modules/*
docs/product/*
docs/customers/current/*
config/industry-templates/plush/*
config/customers/current/*
```

旧代码暂时放：

```text
server/internal/legacy/
web/src/erp/legacy/
```

或者不移动旧代码，只通过新入口逐步替换。

### 第二步：迁移可复用逻辑

把现有比较正确的部分吸收到新骨架：

```text
inventory fact 思路
purchase receipt / return / adjustment 思路
quality inspection 思路
workflow task 思路
RBAC 权限思路
mobile role entry 思路
```

迁移时要重新命名和分层，避免旧的混杂结构继续扩散。

### 第三步：废弃旧入口

等新主链路跑通后，再删旧的：

```text
泛化 business_records 业务入口
前端 demo helper 双写
混杂 seedData
过期 docs
旧 debug 页面
```

## 9. 关键技术决策

### 9.1 API

推荐：

```text
JSON-RPC 或 REST 均可，但必须按 usecase 暴露
```

不要让前端直接拼业务规则。

API 命名示例：

```text
salesOrder.create
salesOrder.submit
salesOrder.approve
bom.activate
purchaseOrder.createFromBom
purchaseReceipt.post
qualityInspection.submit
qualityInspection.decide
productionOrder.release
materialIssue.post
finishedGoodsReceipt.post
shipment.release
shipment.reserve
shipment.ship
ar.generateDraft
payment.record
```

### 9.2 状态机

每个事实模块单独状态机，不要全塞 workflow。

```text
sales_order.status
purchase_order.status
purchase_receipt.status
quality_inspection.status
production_order.status
shipment.status
ar.status
ap.status
invoice.status
payment.status
```

Workflow task 只是协同任务状态：

```text
pending
claimed
done
blocked
cancelled
```

### 9.3 编号规则

第一版就要配置化：

```text
SO-YYYYMMDD-###
PO-YYYYMMDD-###
PR-YYYYMMDD-###
QC-YYYYMMDD-###
PROD-YYYYMMDD-###
OUT-YYYYMMDD-###
SHP-YYYYMMDD-###
AR-YYYYMMDD-###
```

放在：

```text
config/industry-templates/plush/numbering.yaml
config/customers/current/numbering.yaml
```

### 9.4 打印模板

第一版不要写死。

打印模板包括：

```text
采购单
加工合同
入库单
质检单
出库单
送货单
客户对账单
供应商对账单
```

加工合同样本可以作为当前客户的打印模板输入，但不要当通用产品固定规则。

### 9.5 移动端

移动端不是缩小版后台，而是任务处理端。

角色入口：

```text
老板：审批、风险、异常、放行
业务：订单、客户确认、出货跟进
PMC：排产、卡点、催办
采购：采购跟进、到货异常
仓库：扫码入库、出库、盘点
品质：拍照、不良、判定
生产经理：进度、返工、异常
财务：放行、对账、收付款提醒
```

汇报材料里也强调老板、PMC、生产经理、仓库 / 品质在手机端处理高频任务，减少回填和等待。

## 10. 不建议做泛化 Change 模块

从 0 开始更应该避免。

不要做：

```text
change_records
change_module
ChangeUsecase
```

正确做法：

```text
订单变更 -> order_revision
BOM 变更 -> bom_version
库存变更 -> inventory_adjustment / reversal
采购入库变更 -> purchase_receipt_adjustment
出货变更 -> shipment cancellation / correction
财务变更 -> ar_adjustment / ap_adjustment / invoice correction
客户需求变更 -> docs/customers/current/delta-register.md / issue
```

## 11. 从 0 到 1 的开发团队任务分配

### 后端

优先级：

```text
1. 目录骨架和基础 app bootstrap
2. Ent schema / migration 规范
3. RBAC
4. Workflow task
5. MasterData
6. SalesOrder
7. BOM
8. Purchase + Inventory + Quality
9. Production + Outsourcing
10. Shipment
11. Finance
```

### 前端

优先级：

```text
1. 新模块路由
2. 岗位入口首页
3. 手机端任务入口
4. 订单页面
5. BOM 页面
6. 采购 / 入库 / 质检
7. 库存
8. 生产 / 委外
9. 出货
10. 财务
```

### 测试

优先级：

```text
1. 状态机测试
2. 库存不可变流水测试
3. 余额防负测试
4. Workflow 不写 Fact 测试
5. 出货预留并发测试
6. 财务生成时机测试
```

### 运维

优先级：

```text
1. dev / test / prod env
2. migration runbook
3. backup / restore
4. release checklist
5. customer deployment package
```
