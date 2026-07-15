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
    key: 'material-bom',
    sectionKey: 'engineering',
    label: '物料清单（BOM）',
    title: '物料清单（BOM）',
    path: '/erp/purchase/material-bom',
    shortLabel: '物料清单',
    pageKind: 'formal-v1',
    description:
      '物料清单（BOM）用于维护产品结构、材料用量、损耗和版本状态。',
    primaryEntity: 'bom_headers / bom_items',
    factSource: 'bom_headers, bom_items, materials',
    boundary:
      '维护物料清单不会直接生成采购需求、采购入库或库存数量；同一产品只能保留一个当前生效版本。',
    sourceRefs: ['bom_headers', 'bom_items', 'materials', 'products'],
    currentScope: ['产品结构版本', '材料用量和损耗率', '物料清单状态和生效规则'],
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
      '入库管理用于采购收货、待检、退货和入库确认；确认过账后系统更新库存。',
    primaryEntity: 'purchase_receipts / purchase_receipt_items',
    factSource: 'purchase_receipts, purchase_receipt_items, inventory_txns',
    boundary:
      '任务标记为完成不等于采购入库已经过账；请以入库单状态为准。',
    sourceRefs: [
      'purchase_receipts',
      'purchase_returns',
      'inventory_lots',
      'inventory_txns',
    ],
    currentScope: ['待收货', '待质检', '已入库', '退货 / 调整追溯'],
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
      '质量检验用于采购来料、委外回货等业务的检验判定和批次状态处理；任务完成不能代替质检判定。',
    primaryEntity: 'quality_inspections',
    factSource: 'quality_inspections, inventory_lots',
    boundary: '质检状态变化不会增减库存总量；不合格退供应商仍需办理采购退货。',
    sourceRefs: [
      'quality_inspections',
      'inventory_lots',
      'purchase_receipts',
      'outsourcing_facts',
    ],
    currentScope: [
      '采购来料检验',
      '委外回货检验',
      '质检判定',
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
      '库存台账只展示系统查询结果；入库、出库、预留、调拨和调整必须通过对应业务操作完成。',
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
      '盘点 / 调整规则',
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
      '导出筛选结果 / 列顺序 / 相关任务',
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
      '生产订单维护生产计划的草稿、发布、关闭和取消；已发布订单可在本页按已确认需求办理领料或完工入库草稿。',
    primaryEntity: 'production_orders / production_order_items',
    factSource:
      'production_orders, production_order_items, production_order_material_requirements, production_facts',
    boundary:
      '生产订单只表达计划承诺；领料和完工必须由本页办理，草稿仍需在生产记录中确认后才会形成库存变动记录。',
    sourceRefs: [
      'production_orders',
      'production_order_items',
      'products',
      'product_skus',
      'units',
      'sales_order_items',
      'bom_headers',
      'production_order_material_requirements',
      'production_facts',
    ],
    currentScope: [
      '生产计划草稿与明细',
      '发布、关闭和取消等状态操作',
      '销售来源与当前生效 BOM 可读选择',
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
      '生产排程用于创建、筛选、完成、阻塞和催办排程任务；不会自动登记生产完工、领料或成品入库。',
    primaryEntity: 'workflow_tasks',
    factSource: 'workflow_tasks 当前承载，生产排程事实规则待评审',
    boundary:
      '生产排程只管理计划和待办任务；完工、领料和成品入库需到对应页面登记。',
    sourceRefs: ['workflow_tasks', 'sales_orders', 'bom_headers'],
    currentScope: [
      '生产排程任务',
      '负责岗位',
      '到期跟进',
      '完成 / 阻塞 / 催办',
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
    sourceRefs: ['production_facts', 'inventory_txns', 'workflow_tasks'],
    currentScope: [
      '生产发料',
      '成品入库',
      '返工',
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
    description: '生产异常用于登记、筛选、完成、阻塞和催办异常任务。',
    primaryEntity: 'workflow_tasks / workflow_task_events',
    factSource: 'workflow_tasks, workflow_task_events',
    boundary:
      '异常处理只更新当前任务；不会直接修改生产、库存、出货或财务记录，也不会新增客户工单。',
    sourceRefs: [
      'workflow_tasks',
      'workflow_task_events',
      'workflow_business_states',
    ],
    currentScope: ['延期', '返工', '阻塞', '退回和催办'],
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
      '出货放行用于创建、筛选、完成、阻塞和催办放行任务；放行不等于已出货。',
    primaryEntity: 'workflow_tasks / workflow_business_states',
    factSource:
      'workflow_tasks, workflow_business_states 当前承载，ShipmentUsecase 待评审',
    boundary:
      '放行完成不等于已出货，不会自动扣减库存或生成应收、开票、收付款记录。',
    sourceRefs: [
      'workflow_business_states',
      'sales_orders',
      'inventory_balances',
    ],
    currentScope: ['待放行订单', '缺料 / 质检 / 财务风险', '放行后出库状态'],
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
      'shipments',
      'shipment_items',
      'stock_reservations',
      'inventory_txns',
    ],
    currentScope: [
      '出货单草稿和发货',
      '库存预留创建 / 释放，以及确认出货时自动扣减预留',
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
    sourceRefs: ['shipments', 'shipment_items', 'inventory_txns'],
    currentScope: [
      '出货单列表和明细维护',
      '新建草稿和添加商品明细',
      '确认出货和取消追溯',
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
    key: 'payables',
    sectionKey: 'finance',
    label: '应付管理',
    title: '应付管理',
    path: '/erp/finance/payables',
    shortLabel: '应付',
    pageKind: 'formal-v1',
    description:
      '应付管理记录来源明确的应付款项，可过账、结清或取消。',
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
    description:
      '应收管理记录已出货业务产生的应收款项，可过账、结清或取消。',
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
  'exception-flow',
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
