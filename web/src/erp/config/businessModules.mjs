const businessSectionMeta = Object.freeze([
  { key: 'master', title: '主数据' },
  { key: 'sales', title: '销售管理' },
  { key: 'engineering', title: '产品工程' },
  { key: 'purchase', title: '采购管理' },
  { key: 'quality', title: '质检管理' },
  { key: 'warehouse', title: '库存管理' },
  { key: 'outsourcing', title: '委外管理' },
  { key: 'production', title: '生产管理' },
  { key: 'shipment', title: '出货管理' },
  { key: 'finance', title: '财务业务' },
])

const businessSectionTitleMap = new Map(
  businessSectionMeta.map((section) => [section.key, section.title])
)

const formalShellFormFieldLabelsByModuleKey = Object.freeze({
  products: [
    '产品编号',
    '产品名称',
    '产品分类',
    '默认单位',
    '产品状态',
    'SKU / 规格',
  ],
  'material-bom': [
    '产品',
    'BOM 版本',
    '材料',
    '材料用量',
    '损耗率',
    'BOM 状态',
  ],
  inbound: ['入库单号', '来源采购', '物料批次', '仓库', '入库数量', '质检状态'],
  'quality-inspections': [
    '质检单号',
    '采购入库单',
    '材料批次',
    '抽检数量',
    '判定',
    '批次状态',
  ],
  inventory: ['物料 / 产品', '仓库', '批次', '当前余额', '可用量', '最近流水'],
  'processing-contracts': [
    '委外单号',
    '加工厂',
    '产品 / 工序',
    '交期',
    '合同状态',
    '发料 / 回货',
  ],
  'production-scheduling': [
    '销售订单',
    '产品 / BOM',
    '排程日期',
    '生产负责人',
    '齐套状态',
    '延期风险',
  ],
  'production-progress': [
    '生产任务',
    '当前工序',
    '完工数量',
    '进度状态',
    '成品入库状态',
    '异常原因',
  ],
  'production-exceptions': [
    '异常编号',
    '来源任务',
    '责任角色',
    '异常类型',
    '处理结论',
    '阻塞 / 返工原因',
  ],
  'shipping-release': [
    '销售订单',
    '出货批次',
    '库存检查',
    '质检检查',
    '财务检查',
    '放行结论',
  ],
  outbound: [
    '出库单号',
    '来源出货',
    '仓库 / 批次',
    '出库数量',
    '出库状态',
    '冲正边界',
  ],
  shipments: [
    '出货单号',
    '销售订单',
    '客户',
    '出货明细',
    'SHIPPED 状态',
    '库存 OUT / REVERSAL',
  ],
  reconciliation: [
    '对账对象',
    '来源单据',
    '应收 / 应付金额',
    '差异金额',
    '对账状态',
    '差异原因',
  ],
  payables: [
    '供应商 / 加工厂',
    '来源单据',
    '应付金额',
    '付款提醒日',
    '应付状态',
    '结算说明',
  ],
  receivables: [
    '客户',
    '来源出货',
    '应收金额',
    '开票状态',
    '应收状态',
    '回款风险',
  ],
  invoices: [
    '发票号码',
    '客户 / 供应商',
    '来源业务',
    '开票金额',
    '发票状态',
    '发票附件',
  ],
})

export const businessModuleDefinitions = Object.freeze([
  {
    key: 'customers',
    sectionKey: 'master',
    label: '客户档案',
    title: '客户档案',
    path: '/erp/master/partners/customers',
    shortLabel: '客户',
    pageKind: 'formal-v1',
    description:
      '正式 customers 表入口，只维护客户交易主体；联系人随客户详情维护。',
    primaryEntity: 'customers',
    boundary:
      '客户是 MasterData 交易主体，不写销售订单、出货、应收或收款事实。',
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
      '正式 suppliers 表入口，只维护供应商 / 加工厂交易主体；联系人随供应商详情维护。',
    primaryEntity: 'suppliers',
    boundary:
      '供应商 / 加工厂是 MasterData 主体，不直接等同采购、委外或应付事实。',
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
      '产品规格 / SKU 主数据入口；SKU 归属产品，维护颜色、尺码、条码、客户 SKU 和包装版本。',
    primaryEntity: 'product_skus',
    factSource: 'product_skus',
    boundary:
      '产品档案维护产品规格主数据，不等于库存、BOM、订单、生产或出货事实；真实事实写入必须走对应领域 usecase。',
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
      '正式 materials 表入口，只维护材料主数据；采购、库存、质检和 BOM 用量在对应模块处理。',
    primaryEntity: 'materials',
    factSource: 'materials',
    boundary:
      '材料档案不等于采购订单、库存余额、来料质检或 BOM 用量；真实事实仍由对应领域 usecase 写入。',
    sourceRefs: ['materials', 'units'],
    currentScope: [
      '材料编号、名称、分类、规格、颜色',
      '默认单位和启停状态',
      '采购、库存、质检、BOM 只引用材料主数据',
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
      '正式 sales_orders 表入口，只记录客户订单承诺，不写出货、库存或财务事实。',
    primaryEntity: 'sales_orders',
    boundary:
      '销售订单是 Source Document / Business Commitment，不直接生成出货、库存、应收、发票或收付款事实。',
  },
  {
    key: 'material-bom',
    sectionKey: 'engineering',
    label: 'BOM 管理',
    title: 'BOM 管理',
    path: '/erp/purchase/material-bom',
    shortLabel: 'BOM',
    pageKind: 'formal-v1',
    description:
      'BOM 是产品结构和用量真源；物料、损耗和版本状态应回到 BOM 领域能力。',
    primaryEntity: 'bom_headers / bom_items',
    factSource: 'bom_headers, bom_items, materials',
    boundary:
      'BOM 管理不等于采购需求、采购入库或库存余额；同一产品 ACTIVE BOM 约束由后端事实层保证。',
    sourceRefs: ['bom_headers', 'bom_items', 'materials', 'products'],
    currentScope: ['产品结构版本', '材料用量和损耗率', 'BOM 状态与生效边界'],
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
      '正式 purchase_orders 表入口，只维护供应商采购承诺和采购明细，不写库存、批次或财务事实。',
    primaryEntity: 'purchase_orders / purchase_order_items',
    factSource: 'purchase_orders, purchase_order_items',
    boundary: '采购订单表达采购承诺，不等于采购收货、入库、退货或应付事实。',
    sourceRefs: [
      'purchase_orders',
      'purchase_order_items',
      'suppliers',
      'materials',
      'purchase_receipts',
      'purchase_returns',
    ],
    currentScope: [
      '采购订单头和供应商快照',
      '采购订单明细、材料、数量、单价和预计到货',
      '提交、审核、关闭、取消生命周期',
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
    pageKind: 'formal-shell',
    description:
      '入库管理承接采购收货、待检、退货和入库确认视图；真实库存变化由采购 / 库存 usecase 写入。',
    primaryEntity: 'purchase_receipts / purchase_receipt_items',
    factSource: 'purchase_receipts, purchase_receipt_items, inventory_txns',
    boundary:
      '入库通知、检验和入库确认是流程视角；warehouse_inbound done 不等于 purchase_receipt posted。',
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
    label: '来料质检',
    title: '来料质检',
    path: '/erp/production/quality-inspections',
    shortLabel: '质检',
    pageKind: 'formal-shell',
    description:
      '来料质检入口对应 quality_inspections 判定和批次状态变化，任务完成不替代质检事实。',
    primaryEntity: 'quality_inspections',
    factSource: 'quality_inspections, inventory_lots',
    boundary:
      '质检状态变化不写 inventory_txns；不合格退供应商仍走 purchase_returns。',
    sourceRefs: ['quality_inspections', 'inventory_lots', 'purchase_receipts'],
    currentScope: [
      '待检批次',
      '质检判定',
      '批次 HOLD / ACTIVE / REJECTED 状态',
    ],
  },
  {
    key: 'inventory',
    sectionKey: 'warehouse',
    label: '库存台账',
    title: '库存台账',
    path: '/erp/warehouse/inventory',
    shortLabel: '库存',
    pageKind: 'formal-shell',
    description:
      '库存台账统一查看库存余额、批次和流水；库存事实以库存流水、余额和批次状态为准。',
    primaryEntity: 'inventory_balances / inventory_txns / inventory_lots',
    factSource: 'inventory_txns, inventory_balances, inventory_lots',
    boundary:
      '库存台账是事实视图，不允许前端本地伪造入库、出库、预留、调拨或调整事实。',
    sourceRefs: ['inventory_txns', 'inventory_balances', 'inventory_lots'],
    currentScope: ['库存余额', '库存批次', '库存流水', '盘点 / 调整边界'],
  },
  {
    key: 'processing-contracts',
    sectionKey: 'outsourcing',
    label: '委外订单',
    title: '委外订单',
    path: '/erp/purchase/processing-contracts',
    shortLabel: '委外',
    pageKind: 'formal-shell',
    description:
      '委外订单承接外发加工安排、合同打印和回货协同；委外发料 / 回货事实后续单独评审。',
    primaryEntity: 'outsourcing_orders（后续评审）',
    factSource: 'workflow_tasks / print templates 当前承载，委外事实待评审',
    boundary:
      '委外合同和任务不等于发料、回货、库存或应付事实；合同打印快照不替代结算事实。',
    sourceRefs: ['suppliers', 'workflow_tasks', 'print templates'],
    currentScope: [
      '委外供应商',
      '加工内容',
      '交期和合同状态',
      '发料 / 回货追溯',
    ],
  },
  {
    key: 'production-scheduling',
    sectionKey: 'production',
    label: '生产排程',
    title: '生产排程',
    path: '/erp/production/scheduling',
    shortLabel: '排程',
    pageKind: 'formal-shell',
    description:
      '生产排程是计划与任务协同入口，不代表生产完工、领料或成品入库事实。',
    primaryEntity: 'production_orders（后续评审）',
    factSource:
      'workflow_tasks / pmc plan permissions 当前承载，生产事实待评审',
    boundary:
      '生产排程只表达计划和协同任务；完工、领料和成品入库必须由领域 usecase 写事实。',
    sourceRefs: ['workflow_tasks', 'sales_orders', 'bom_headers'],
    currentScope: ['订单齐套', '生产计划', '责任角色', '延期风险'],
  },
  {
    key: 'production-progress',
    sectionKey: 'production',
    label: '生产进度',
    title: '生产进度',
    path: '/erp/production/progress',
    shortLabel: '进度',
    pageKind: 'formal-shell',
    description:
      '生产进度用于跟进过程状态和上报计划；上报不等于库存、出货或财务事实。',
    primaryEntity: 'production_progress（后续评审）',
    factSource: 'workflow_tasks / operational facts 当前承载，生产事实待评审',
    boundary:
      '进度回填是过程状态，不自动写成品入库、库存扣减、出货或应收事实。',
    sourceRefs: ['workflow_tasks', 'operational facts', 'sales_orders'],
    currentScope: [
      '开工 / 进行中 / 完工视图',
      '异常回填',
      '生产经理和 PMC 跟进',
    ],
  },
  {
    key: 'production-exceptions',
    sectionKey: 'production',
    label: '生产异常',
    title: '生产异常',
    path: '/erp/production/exceptions',
    shortLabel: '异常',
    pageKind: 'formal-shell',
    description:
      '生产异常用于延期、返工和阻塞协同；异常闭环仍属于 Workflow / 协同层。',
    primaryEntity: 'workflow_tasks / workflow_task_events',
    factSource: 'workflow_tasks, workflow_task_events',
    boundary:
      '异常处理不直接改变生产、库存、出货或财务事实，也不新增客户工单系统。',
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
    pageKind: 'formal-shell',
    description:
      '出货放行用于销售、仓库、品质和财务在发货前确认条件；放行不等于真实 shipped。',
    primaryEntity: 'shipments（后续评审）',
    factSource: 'workflow_business_states 当前承载，ShipmentUsecase 待评审',
    boundary:
      'shipping_released 不等于 shipped，不自动扣库存、生成应收、开票或收付款事实。',
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
    pageKind: 'formal-shell',
    description:
      '出库管理是库存扣减和发货确认候选入口；真实出库必须由 Inventory / Shipment usecase 控制。',
    primaryEntity: 'inventory_txns / shipments（后续评审）',
    factSource: 'inventory_txns 当前为库存事实流水',
    boundary:
      '出库才可能触发库存扣减事实；不能把出货放行或任务完成当成出库事实。',
    sourceRefs: ['inventory_txns', 'inventory_balances', 'sales_orders'],
    currentScope: ['待出库', '已出库', '缺料风险', '出库冲正边界'],
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
      '正式 shipments / shipment_items 出货事实入口；确认出货才写库存 OUT，取消已出货写 REVERSAL。',
    primaryEntity: 'shipments / shipment_items',
    factSource: 'shipments, shipment_items, inventory_txns',
    boundary:
      '出货放行只表示可发货，出库管理表达库存出库事实；只有出货单 SHIPPED 才是真实出货事实。',
    sourceRefs: ['shipments', 'shipment_items', 'inventory_txns'],
    currentScope: [
      '出货单列表和明细维护',
      '新建草稿和添加商品明细',
      '确认出货写 OUT，取消已出货写 REVERSAL',
    ],
  },
  {
    key: 'reconciliation',
    sectionKey: 'finance',
    label: '对账管理',
    title: '对账管理',
    path: '/erp/finance/reconciliation',
    shortLabel: '对账',
    pageKind: 'formal-shell',
    description: '对账管理承接应收、应付和收付款核对入口；对账不是总账凭证。',
    primaryEntity: 'finance_facts（后续评审）',
    factSource: 'finance fact usecase 待评审',
    boundary: '对账 / 结算不自动写付款、应收、应付、发票或总账事实。',
    sourceRefs: [
      'sales_orders',
      'purchase_receipts',
      'workflow_business_states',
    ],
    currentScope: ['应收核对', '应付核对', '差异处理', '收付款关联记录'],
  },
  {
    key: 'payables',
    sectionKey: 'finance',
    label: '应付管理',
    title: '应付管理',
    path: '/erp/finance/payables',
    shortLabel: '应付',
    pageKind: 'formal-shell',
    description:
      '应付管理用于采购、委外和费用来源的应付提醒；完整应付事实后续评审。',
    primaryEntity: 'finance_payables（后续评审）',
    factSource: 'finance fact usecase 待评审',
    boundary:
      '待付款提醒不是付款事实或审批事实，应付来源必须回到采购、委外或对账事实。',
    sourceRefs: ['purchase_receipts', 'suppliers', 'processing contracts'],
    currentScope: ['待确认应付', '供应商对账', '付款提醒', '差异说明'],
  },
  {
    key: 'receivables',
    sectionKey: 'finance',
    label: '应收管理',
    title: '应收管理',
    path: '/erp/finance/receivables',
    shortLabel: '应收',
    pageKind: 'formal-shell',
    description:
      '应收管理用于出货后应收确认和开票登记前置视图；完整应收事实后续评审。',
    primaryEntity: 'finance_receivables（后续评审）',
    factSource: 'finance fact usecase 待评审',
    boundary:
      '应收至少应在真实 shipped 后评审，不由销售订单、出货放行或任务完成直接生成。',
    sourceRefs: [
      'sales_orders',
      'shipments（后续评审）',
      'workflow_business_states',
    ],
    currentScope: ['待确认应收', '客户对账', '开票状态', '回款风险'],
  },
  {
    key: 'invoices',
    sectionKey: 'finance',
    label: '发票管理',
    title: '发票管理',
    path: '/erp/finance/invoices',
    shortLabel: '发票',
    pageKind: 'formal-shell',
    description:
      '发票管理记录业务开票状态和发票信息；不替代税控、查验或纳税申报。',
    primaryEntity: 'invoices（后续评审）',
    factSource: 'finance fact usecase 待评审',
    boundary: '发票登记是财务业务快照，不提前接入税务平台或复杂会计账簿。',
    sourceRefs: [
      'finance receivables/payables（后续评审）',
      'sales_orders',
      'suppliers',
    ],
    currentScope: ['待开票', '已开票', '异常发票', '发票附件记录'],
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

export function getFormalBusinessShellModules() {
  return businessModuleDefinitions
    .filter((moduleItem) => moduleItem.pageKind === 'formal-shell')
    .map((moduleItem) => getBusinessModule(moduleItem.key))
    .filter(Boolean)
    .map((moduleItem) => ({ ...moduleItem }))
}

export function getFormalShellFormFieldLabels(moduleKey = '') {
  const key = String(moduleKey || '').trim()
  return [...(formalShellFormFieldLabelsByModuleKey[key] || [])]
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
