const businessSectionMeta = Object.freeze([
  { key: 'master', title: '基础资料' },
  { key: 'sales', title: '销售管理' },
  { key: 'engineering', title: '产品工程' },
  { key: 'purchase', title: '采购管理' },
  { key: 'quality', title: '质检管理' },
  { key: 'warehouse', title: '库存管理' },
  { key: 'outsourcing', title: '委外管理' },
  { key: 'production', title: '生产管理' },
  { key: 'shipment', title: '出货管理' },
  { key: 'finance', title: '财务管理' },
])

const businessSectionTitleMap = new Map(
  businessSectionMeta.map((section) => [section.key, section.title])
)

export const businessModuleDefinitions = Object.freeze([
  {
    key: 'customers',
    sectionKey: 'master',
    label: '客户档案',
    title: '客户档案',
    path: '/erp/master/partners/customers',
    shortLabel: '客户',
    pageKind: 'formal-v1',
    description: '客户档案用于维护客户交易主体；联系人请在客户详情中维护。',
    primaryEntity: 'customers',
    boundary:
      '客户档案只维护交易主体资料；销售订单、出货、应收和收款需到对应页面处理。',
  },
  {
    key: 'suppliers',
    sectionKey: 'master',
    label: '供应商档案',
    title: '供应商档案',
    path: '/erp/master/partners/suppliers',
    shortLabel: '供应商',
    pageKind: 'formal-v1',
    description:
      '供应商档案用于维护供应商和加工厂交易主体；联系人请在供应商详情中维护。',
    primaryEntity: 'suppliers',
    boundary:
      '供应商和加工厂档案只维护交易主体资料；采购、委外和应付需到对应页面处理。',
  },
  {
    key: 'products',
    sectionKey: 'master',
    label: '产品档案',
    title: '产品档案',
    path: '/erp/master/products',
    shortLabel: '产品',
    pageKind: 'formal-v1',
    description:
      '维护产品规格（SKU）、颜色、尺码、条码、客户规格编号和包装版本。',
    primaryEntity: 'product_skus',
    factSource: 'product_skus',
    boundary:
      '产品档案只维护产品和规格资料；库存、物料清单、订单、生产和出货需到对应页面处理。',
    sourceRefs: ['products', 'product_skus'],
    currentScope: [
      'SKU 编号、条码、客户 SKU、颜色、色号、尺码、包装版本',
      'SKU 归属产品和可选默认单位',
      'SKU 状态启停',
    ],
  },
  {
    key: 'materials',
    sectionKey: 'master',
    label: '材料档案',
    title: '材料档案',
    path: '/erp/master/materials',
    shortLabel: '材料',
    pageKind: 'formal-v1',
    description:
      '维护材料基础资料；采购、库存、质检和物料清单用量请到对应页面处理。',
    primaryEntity: 'materials',
    factSource: 'materials',
    boundary:
      '材料档案只维护材料资料；采购订单、库存余额、来料质检和物料清单用量需到对应页面处理。',
    sourceRefs: ['materials', 'units'],
    currentScope: [
      '材料编号、名称、分类、规格、颜色',
      '默认单位和启停状态',
      '采购、库存、质检和物料清单使用这里的材料资料',
    ],
  },
  {
    key: 'sales-orders',
    sectionKey: 'sales',
    label: '销售订单',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
    shortLabel: '销售订单',
    pageKind: 'formal-v1',
    description:
      '销售订单记录客户订单承诺；出货、库存和财务处理请到对应页面完成。',
    primaryEntity: 'sales_orders',
    boundary: '销售订单不会自动生成出货单、库存变动、应收、发票或收付款记录。',
  },
  {
    key: 'sales-returns',
    sectionKey: 'sales',
    label: '客户退货（RMA）',
    title: '客户退货（RMA）',
    path: '/erp/sales/customer-returns',
    shortLabel: '客户退货',
    pageKind: 'formal-v1',
    description:
      '客户退货从已出货记录发起，依次办理审核、实物收回和取消；确认收回后才形成库存恢复记录。',
    primaryEntity: 'sales_returns / sales_return_items',
    factSource: 'sales_returns, sales_return_items, shipments, inventory_txns',
    boundary:
      '客户提出退货、销售任务完成或退货审核都不等于库存已收回；只有退货单确认收回后才增加库存，取消已收回退货会通过反向库存记录恢复。',
    sourceRefs: [
      'shipments',
      'shipment_items',
      'sales_returns',
      'inventory_txns',
    ],
    currentScope: [
      '从已出货记录发起客户退货',
      '退货审核',
      '确认收回并恢复库存',
      '取消和并发版本校验',
    ],
  },
  {
    key: 'material-bom',
    sectionKey: 'engineering',
    label: '物料清单（BOM）',
    title: '物料清单（BOM）',
    path: '/erp/purchase/material-bom',
    shortLabel: '物料清单',
    pageKind: 'formal-v1',
    description: '物料清单（BOM）用于维护产品结构、材料用量、损耗和版本状态。',
    primaryEntity: 'bom_headers / bom_items',
    factSource: 'bom_headers, bom_items, materials',
    boundary:
      '维护物料清单不会直接生成采购需求、采购入库或库存数量；同一产品只能保留一个当前生效版本。',
    sourceRefs: ['bom_headers', 'bom_items', 'materials', 'products'],
    currentScope: [
      '产品结构版本',
      '材料用量和损耗率',
      '物料清单状态和生效规则',
    ],
  },
  {
    key: 'processes',
    sectionKey: 'engineering',
    label: '加工环节',
    title: '加工环节',
    path: '/erp/engineering/processes',
    shortLabel: '环节',
    pageKind: 'formal-v1',
    description:
      '加工环节维护委外订单和质检标记可引用的少量标准环节，不承接完整工艺路线、排程或报工。',
    primaryEntity: 'processes',
    factSource: 'processes',
    boundary:
      '加工环节用于委外和质检引用；不会自动生成委外订单、生产任务、发料、回货、库存或质检记录。',
    sourceRefs: ['processes', 'bom_headers', 'outsourcing orders（后续评审）'],
    currentScope: [
      '环节编号和名称',
      '环节类别文本',
      '委外 / 内制适用标记',
      '质检要求和启停状态',
    ],
  },
  {
    key: 'accessories-purchase',
    sectionKey: 'purchase',
    label: '采购订单',
    title: '采购订单',
    path: '/erp/purchase/accessories',
    shortLabel: '采购',
    pageKind: 'formal-v1',
    description:
      '采购订单维护供应商采购承诺和采购明细；入库、批次和财务处理请到对应页面完成。',
    primaryEntity: 'purchase_orders / purchase_order_items',
    factSource: 'purchase_orders, purchase_order_items',
    boundary: '采购订单不会自动生成采购收货、入库、退货或应付记录。',
    sourceRefs: [
      'purchase_orders',
      'purchase_order_items',
      'suppliers',
      'materials',
      'purchase_receipts',
      'purchase_returns',
    ],
    currentScope: [
      '采购订单和供应商信息',
      '采购订单明细、材料、数量、单价和预计到货日期',
      '提交、审核、关闭、取消等状态操作',
      '采购入库行可选关联采购订单行做追溯',
    ],
  },
  {
    key: 'inbound',
    sectionKey: 'warehouse',
    label: '入库管理',
    title: '入库管理',
    path: '/erp/warehouse/inbound',
    shortLabel: '入库',
    pageKind: 'formal-v1',
    description:
      '入库管理只接收从已审核采购订单生成的入库草稿，并继续办理收货、待检、退货、调整和入库确认；确认过账后系统更新库存。',
    primaryEntity: 'purchase_receipts / purchase_receipt_items',
    factSource: 'purchase_receipts, purchase_receipt_items, inventory_txns',
    boundary: '任务标记为完成不等于采购入库已经过账；请以入库单状态为准。',
    sourceRefs: [
      'purchase_orders',
      'purchase_order_items',
      'purchase_receipts',
      'purchase_returns',
      'inventory_lots',
      'inventory_txns',
    ],
    currentScope: [
      '从已审核采购订单生成入库草稿',
      '待收货',
      '待质检',
      '已入库',
      '退货 / 调整追溯',
    ],
  },
  {
    key: 'quality-inspections',
    sectionKey: 'quality',
    label: '质量检验',
    title: '质量检验',
    path: '/erp/production/quality-inspections',
    shortLabel: '质检',
    pageKind: 'formal-v1',
    description:
      '质量检验汇总办理采购来料、委外回货、生产工序和出货前成品的检验判定；各类质检均从对应来源记录或在制批次发起，办理状态变化不会代替实际检验。',
    primaryEntity: 'quality_inspections',
    factSource: 'quality_inspections, inventory_lots',
    boundary:
      '每张质检单只表达一次通用判定，不能代表裁片、皮套、针检、抽检或客户验货全部完成；估算不良比例不会自动换算退货数量；首次到货检验不合格会阻止入库，可另行按来源行办理部分退厂或补换；已入库后的不合格才走采购退货。质检状态变化不会自行增减库存总量。',
    sourceRefs: [
      'quality_inspections',
      'inventory_lots',
      'purchase_receipts',
      'outsourcing_facts',
      'production_wip_batches',
      'shipments',
    ],
    currentScope: [
      '采购来料检验',
      '委外回货检验',
      '生产 WIP 分段质检',
      '出货前成品检验',
      '质检判定',
      '来源单据级估算不良比例（档位 / 自定义）',
      '批次冻结 / 可用 / 不合格状态',
    ],
  },
  {
    key: 'inventory',
    sectionKey: 'warehouse',
    label: '库存台账',
    title: '库存台账',
    path: '/erp/warehouse/inventory',
    shortLabel: '库存',
    pageKind: 'formal-v1',
    description:
      '库存台账统一查看库存余额、已预留、可用量、批次和变动记录；库存数量以已确认的入库、出库和调整记录为准。',
    primaryEntity: 'inventory_balances / inventory_txns / inventory_lots',
    factSource:
      'inventory_txns, inventory_balances, inventory_lots, stock_reservations',
    boundary:
      '入库、生产、委外、出货和预留必须通过对应来源单据或业务记录办理；本页只额外提供盘点、仓间调拨和有权限的人工调整，过账后才改变库存。',
    sourceRefs: [
      'inventory_txns',
      'inventory_balances',
      'inventory_lots',
      'stock_reservations',
    ],
    currentScope: [
      '库存余额',
      '已预留 / 可用量只读',
      '库存批次',
      '库存变动记录',
      '按来源单据和业务记录追溯',
      '盘点差异、仓间调拨和受控人工调整',
      '调整草稿过账、取消和并发版本校验',
    ],
  },
  {
    key: 'processing-contracts',
    sectionKey: 'outsourcing',
    label: '委外订单',
    title: '委外订单',
    path: '/erp/purchase/processing-contracts',
    shortLabel: '委外',
    pageKind: 'formal-v1',
    description:
      '委外订单维护加工合同、工序明细、加工厂承诺和打印内容；已确认合同可在本页按明细生成委外发料或回货草稿。',
    primaryEntity: 'outsourcing_orders / outsourcing_order_items',
    factSource:
      'outsourcing_orders, outsourcing_order_items, outsourcing_facts, quality_inspections, finance_facts',
    boundary:
      '确认加工合同只表示双方约定已确认；发料和回货仍需在本页办理并过账，回货质检和应付请到对应页面继续处理。',
    sourceRefs: [
      'outsourcing_orders',
      'outsourcing_order_items',
      'processes',
      'suppliers',
      'products',
      'outsourcing_facts',
      'quality_inspections',
      'finance_facts',
    ],
    currentScope: [
      '加工合同',
      '工序明细',
      '草稿 / 提交 / 确认 / 关闭 / 取消状态',
      '加工合同打印内容',
      '导出筛选结果 / 列顺序 / 当前记录任务',
      '选择计量单位',
      '从已确认合同行生成委外发料 / 回货草稿',
      '从已过账回货发起质检 / 合格后生成应付',
    ],
  },
  {
    key: 'production-orders',
    sectionKey: 'production',
    label: '生产订单',
    title: '生产订单',
    path: '/erp/production/orders',
    shortLabel: '生产订单',
    pageKind: 'formal-v1',
    description:
      '生产订单维护生产计划与固定工序路线；发布后按布料加工、车缝、手工、包装依次办理 WIP、逐工序内外发决策、分段质检与包材确认，并可生成领料或完工入库草稿。',
    primaryEntity: 'production_orders / production_order_items',
    factSource:
      'production_orders, production_order_items, production_order_material_requirements, production_order_operations, production_wip_batches, production_wip_outsourcing_allocations, outsourcing_orders, outsourcing_order_items, production_packaging_confirmations, quality_inspections, production_facts',
    boundary:
      '生产订单、工序路线、WIP 流转、内外发安排、质检状态和包材确认都不等于库存事实；领料与完工草稿仍需在生产记录中过账，只有已过账生产事实才会形成库存变动。',
    sourceRefs: [
      'production_orders',
      'production_order_items',
      'products',
      'product_skus',
      'units',
      'sales_order_items',
      'bom_headers',
      'production_order_material_requirements',
      'production_order_operations',
      'production_wip_batches',
      'production_wip_outsourcing_allocations',
      'outsourcing_orders',
      'outsourcing_order_items',
      'production_packaging_confirmations',
      'quality_inspections',
      'production_facts',
    ],
    currentScope: [
      '生产计划草稿与明细',
      '发布、关闭和取消等状态操作',
      '发布时原子生成 PMC 生产排程待办',
      '销售来源与当前生效 BOM 可读选择',
      '固定路线：布料加工 → 车缝 → 手工 → 包装',
      '按在制批次办理拆分、内外发安排与车间移交',
      '布料整单外发与车缝 / 手工逐工序独立决策',
      '裁片、皮套、成品分段质检与包材确认',
      '从冻结物料需求生成领料草稿',
      '从已发布订单行生成完工入库草稿',
    ],
  },
  {
    key: 'production-scheduling',
    sectionKey: 'production',
    label: '生产排程',
    title: '生产排程',
    path: '/erp/production/scheduling',
    shortLabel: '排程',
    pageKind: 'formal-v1',
    description:
      '生产排程处理生产订单发布时生成的 PMC 待办；完成排程任务不会代写领料、完工或库存记录。',
    primaryEntity: 'workflow_tasks',
    factSource: 'production_orders -> workflow_tasks',
    boundary:
      '生产排程只管理已有计划待办；当前不提供通用新建任务，完工、领料和成品入库需到对应页面登记。',
    sourceRefs: ['production_orders', 'workflow_tasks'],
    currentScope: [
      '生产订单发布生成的排程任务',
      '负责岗位',
      '到期跟进',
      '完成 / 阻塞 / 催办',
      '返回来源生产订单',
    ],
  },
  {
    key: 'production-progress',
    sectionKey: 'production',
    label: '生产进度',
    title: '生产进度',
    path: '/erp/production/progress',
    shortLabel: '进度',
    pageKind: 'formal-v1',
    description:
      '生产进度用于处理生产发料、成品入库和返工记录；所有记录必须从明确的业务来源生成。',
    primaryEntity: 'production_facts',
    factSource: 'production_facts, inventory_txns',
    boundary:
      '任务标记为完成不会自动生成生产发料、成品入库或返工记录；生产排程和异常也不会自动生成出货、应收或发票记录。',
    sourceRefs: [
      'production_orders',
      'production_order_items',
      'production_facts',
      'inventory_txns',
      'workflow_tasks',
    ],
    currentScope: [
      '从已发布生产订单生成领料 / 完工草稿',
      '生产发料',
      '成品入库',
      '返工',
      '返工记录过账时原子生成生产异常待办',
      '确认后更新库存，取消后生成撤销调整记录',
    ],
  },
  {
    key: 'production-exceptions',
    sectionKey: 'production',
    label: '生产异常',
    title: '生产异常',
    path: '/erp/production/exceptions',
    shortLabel: '异常',
    pageKind: 'formal-v1',
    description:
      '生产异常处理返工记录过账时生成的协同待办；完成异常任务不会代写返工、报废或库存调整。',
    primaryEntity: 'workflow_tasks / workflow_task_events',
    factSource: 'workflow_tasks, workflow_task_events',
    boundary:
      '异常处理只更新已有任务；当前不提供通用新建任务，也不会直接修改生产、库存、出货或财务记录。',
    sourceRefs: [
      'production_facts',
      'workflow_tasks',
      'workflow_task_events',
      'workflow_business_states',
    ],
    currentScope: [
      '返工记录过账生成的异常任务',
      '退回和催办',
      '返回来源生产记录',
    ],
  },
  {
    key: 'shipping-release',
    sectionKey: 'shipment',
    label: '出货放行',
    title: '出货放行',
    path: '/erp/warehouse/shipping-release',
    shortLabel: '放行',
    pageKind: 'formal-v1',
    description:
      '出货放行处理草稿出货单显式提交后生成的仓库待办；放行完成不等于已出货。',
    primaryEntity: 'workflow_tasks / workflow_business_states',
    factSource: 'shipments -> workflow_tasks, workflow_business_states',
    boundary:
      '当前不提供通用新建任务；放行完成不等于已出货，不会自动扣减库存或生成应收、开票、收付款记录。',
    sourceRefs: ['shipments', 'workflow_tasks', 'workflow_business_states'],
    currentScope: [
      '草稿出货单提交生成的待放行任务',
      '完成 / 阻塞 / 催办',
      '返回来源出货单',
    ],
  },
  {
    key: 'outbound',
    sectionKey: 'shipment',
    label: '出库管理',
    title: '出库管理',
    path: '/erp/warehouse/outbound',
    shortLabel: '出库',
    pageKind: 'formal-v1',
    description:
      '出库管理用于出货单确认和库存预留处理；只有确认出货后才更新库存出库记录。',
    primaryEntity: 'shipments / shipment_items / stock_reservations',
    factSource: 'shipments, shipment_items, stock_reservations, inventory_txns',
    boundary:
      '出货放行和完成任务不等于出库；释放预留不会增减库存总量，确认出货才消耗预留，取消已发货后系统会保留调整记录。',
    sourceRefs: [
      'sales_orders',
      'sales_order_items',
      'shipments',
      'shipment_items',
      'stock_reservations',
      'inventory_txns',
    ],
    currentScope: [
      '出货单草稿和发货',
      '草稿显式提交出货放行待办',
      '从销售订单生成 / 释放库存预留，以及确认出货时自动扣减预留',
      '出货取消后的库存恢复规则',
    ],
  },
  {
    key: 'shipments',
    sectionKey: 'shipment',
    label: '出货单',
    title: '出货单',
    path: '/erp/warehouse/shipments',
    shortLabel: '出货',
    pageKind: 'formal-v1',
    description:
      '出货单维护出货信息和明细；确认出货后更新库存，取消已出货会保留原记录并恢复相应库存。',
    primaryEntity: 'shipments / shipment_items',
    factSource: 'shipments, shipment_items, inventory_txns',
    boundary:
      '出货放行只表示可以发货；只有出货单确认发货后，才记录实际出货和库存出库。',
    sourceRefs: [
      'sales_orders',
      'sales_order_items',
      'shipments',
      'shipment_items',
      'inventory_txns',
      'finance_facts',
    ],
    currentScope: [
      '出货单列表和明细维护',
      '新建草稿和添加商品明细，可关联销售订单',
      '确认出货和取消追溯',
      '从已出货记录生成应收 / 开票记录',
    ],
  },
  {
    key: 'reconciliation',
    sectionKey: 'finance',
    label: '对账管理',
    title: '对账管理',
    path: '/erp/finance/reconciliation',
    shortLabel: '对账',
    pageKind: 'formal-v1',
    description:
      '对账管理记录单笔业务核对结果；核对草稿只能从已过账应收、应付或发票生成。',
    primaryEntity: 'finance_facts.RECONCILIATION',
    factSource: 'finance_facts',
    boundary:
      '对账记录不会自动生成付款、应收、应付、发票、总账或会计凭证；差异需按实际业务继续处理。',
    sourceRefs: ['finance_facts'],
    currentScope: [
      '从已过账应收 / 应付 / 发票生成单笔核对',
      '过账',
      '完成核对',
      '取消',
    ],
  },
  {
    key: 'finance-payments',
    sectionKey: 'finance',
    label: '收付款与核销',
    title: '收付款与核销',
    path: '/erp/finance/payments',
    shortLabel: '收付款',
    pageKind: 'formal-v1',
    description:
      '登记真实收款或付款，并按同一往来方和币种对多张应收或应付进行核销。',
    primaryEntity:
      'finance_payments / finance_allocations / finance_credit_notes',
    factSource:
      'finance_payments, finance_allocations, finance_credit_notes, finance_facts',
    boundary:
      '收付款过账才形成核销；冲销和红冲保留原记录及反向审计，不提供物理删除，也不替代总账凭证、税控或银行对账。',
    sourceRefs: [
      'finance_facts',
      'finance_payments',
      'finance_allocations',
      'finance_credit_notes',
    ],
    currentScope: [
      '真实收款和付款登记',
      '同一往来方和币种的多单核销',
      '已过账收付款冲销',
      '应收 / 应付红冲及红冲撤销',
    ],
  },
  {
    key: 'payables',
    sectionKey: 'finance',
    label: '应付管理',
    title: '应付管理',
    path: '/erp/finance/payables',
    shortLabel: '应付',
    pageKind: 'formal-v1',
    description: '应付管理记录来源明确的应付款项，可过账、结清或取消。',
    primaryEntity: 'finance_facts.PAYABLE',
    factSource: 'finance_facts',
    boundary:
      '应付记录只从已过账采购入库或已完成合格 / 让步质检的委外回货生成；不表示付款审批、付款、总账或费用报销已经完成。',
    sourceRefs: ['finance_facts', 'purchase_receipts', 'outsourcing_facts'],
    currentScope: [
      '从已过账采购入库生成应付',
      '从合格 / 让步委外回货生成应付',
      '过账',
      '结清',
      '取消',
    ],
  },
  {
    key: 'receivables',
    sectionKey: 'finance',
    label: '应收管理',
    title: '应收管理',
    path: '/erp/finance/receivables',
    shortLabel: '应收',
    pageKind: 'formal-v1',
    description: '应收管理记录已出货业务产生的应收款项，可过账、结清或取消。',
    primaryEntity: 'finance_facts.RECEIVABLE',
    factSource: 'finance_facts',
    boundary:
      '应收只从已出货出货单生成，不由销售订单、出货放行或任务完成直接生成；当前不代表收款核销、总账或税控已交付。',
    sourceRefs: ['finance_facts', 'shipments'],
    currentScope: ['从已出货出货单生成应收', '过账', '结清', '取消'],
  },
  {
    key: 'invoices',
    sectionKey: 'finance',
    label: '发票管理',
    title: '发票管理',
    path: '/erp/finance/invoices',
    shortLabel: '发票',
    pageKind: 'formal-v1',
    description:
      '发票管理记录已出货业务的开票情况；系统中的发票记录不等于税控开票已经完成。',
    primaryEntity: 'finance_facts.INVOICE',
    factSource: 'finance_facts',
    boundary:
      '发票记录只从已出货出货单生成，不提供结清操作，也不替代税控、发票查验、纳税申报、附件归档或会计凭证。',
    sourceRefs: ['finance_facts', 'shipments'],
    currentScope: ['从已出货出货单生成发票记录', '过账', '取消'],
  },
])

const businessModuleMap = new Map(
  businessModuleDefinitions.map((moduleItem) => [
    moduleItem.key,
    {
      ...moduleItem,
      sectionTitle: businessSectionTitleMap.get(moduleItem.sectionKey) || '',
    },
  ])
)

export function getBusinessModule(moduleKey) {
  return businessModuleMap.get(String(moduleKey || '').trim()) || null
}

const productCoreReviewBlockedPageKeys = new Set([
  'business-dashboard',
  ...businessModuleDefinitions.map((moduleItem) => moduleItem.key),
])

export function isCustomerBusinessDataPageKey(pageKey = '') {
  return productCoreReviewBlockedPageKeys.has(String(pageKey || '').trim())
}

export function getBusinessNavigationSections() {
  return businessSectionMeta
    .map((section) => {
      const items = businessModuleDefinitions.filter(
        (item) => item.sectionKey === section.key
      )
      if (items.length === 0) {
        return null
      }

      return {
        key: section.key,
        title: section.title,
        items: items.map((item) => ({
          ...item,
          sectionTitle: section.title,
        })),
      }
    })
    .filter(Boolean)
}

export const businessNavigationSections = getBusinessNavigationSections()
