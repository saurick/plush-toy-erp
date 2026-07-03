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
    '库存出库 / 冲正',
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
    description: '客户档案入口只维护客户交易主体；联系人随客户详情维护。',
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
      '供应商档案入口只维护供应商 / 加工厂交易主体；联系人随供应商详情维护。',
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
      '产品档案维护产品规格主数据，不等于库存、BOM、订单、生产或出货事实；真实事实写入必须走对应后端业务规则。',
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
      '材料档案入口只维护材料主数据；采购、库存、质检和 BOM 用量在对应模块处理。',
    primaryEntity: 'materials',
    factSource: 'materials',
    boundary:
      '材料档案不等于采购订单、库存余额、来料质检或 BOM 用量；真实事实仍由对应后端业务规则写入。',
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
    description: '销售订单入口只记录客户订单承诺，不写出货、库存或财务事实。',
    primaryEntity: 'sales_orders',
    boundary:
      '销售订单是客户订单承诺，不直接生成出货、库存、应收、发票或收付款事实。',
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
      'BOM 管理不等于采购需求、采购入库或库存余额；同一产品当前生效 BOM 约束由后端事实层保证。',
    sourceRefs: ['bom_headers', 'bom_items', 'materials', 'products'],
    currentScope: ['产品结构版本', '材料用量和损耗率', 'BOM 状态与生效边界'],
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
      '加工环节是可复用主数据，不等于委外订单、生产任务、发料、回货、库存或质检事实。',
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
      '采购订单入口只维护供应商采购承诺和采购明细，不写库存、批次或财务事实。',
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
      '采购订单明细、材料、数量、单价和预计到货日期',
      '提交、审核、关闭、取消状态动作',
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
      '入库管理承接采购收货、待检、退货和入库确认视图；真实库存变化由后端采购 / 库存规则写入。',
    primaryEntity: 'purchase_receipts / purchase_receipt_items',
    factSource: 'purchase_receipts, purchase_receipt_items, inventory_txns',
    boundary:
      '入库通知、检验和入库确认是流程视角；协同任务完成不等于采购入库已过账。',
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
    pageKind: 'formal-v1',
    description:
      '来料质检入口对应质检判定和批次状态变化，任务完成不替代质检事实。',
    primaryEntity: 'quality_inspections',
    factSource: 'quality_inspections, inventory_lots',
    boundary: '质检状态变化不直接写库存流水；不合格退供应商仍走采购退货。',
    sourceRefs: ['quality_inspections', 'inventory_lots', 'purchase_receipts'],
    currentScope: ['待检批次', '质检判定', '批次冻结 / 可用 / 不合格状态'],
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
      '库存台账统一查看库存余额、已预留、可用量、批次和流水；库存事实以库存流水、余额、批次状态和生效预留为准。',
    primaryEntity: 'inventory_balances / inventory_txns / inventory_lots',
    factSource:
      'inventory_txns, inventory_balances, inventory_lots, stock_reservations',
    boundary:
      '库存台账是事实视图，可用量只按后端只读 read model 展示，不允许前端本地伪造入库、出库、预留、调拨或调整事实。',
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
      '库存流水',
      '盘点 / 调整边界',
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
      '委外订单维护加工合同源单、工序明细、加工厂承诺和打印快照；发料、回货、质检、应付仍由对应后端事实规则承接。',
    primaryEntity: 'outsourcing_orders / outsourcing_order_items',
    factSource:
      'outsourcing_orders, outsourcing_order_items, processes, suppliers, products',
    boundary:
      '加工合同确认只表示委外承诺已确认，不自动写库存流水、质检结果、应付、发票、付款或协同任务完成；委外发料 / 回货事实继续由业务事实入口承接。',
    sourceRefs: [
      'outsourcing_orders',
      'outsourcing_order_items',
      'processes',
      'suppliers',
      'products',
      'outsourcing_facts',
    ],
    currentScope: [
      '加工合同源单',
      '工序明细',
      '草稿 / 提交 / 确认 / 关闭 / 取消状态',
      '加工合同打印带值',
      '导出筛选结果 / 列顺序 / 本页协同',
      '单位主数据可读选择',
      '委外发料 / 回货事实边界',
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
      '生产排程当前接入协同任务创建、筛选、完成、阻塞和催办；不代表生产完工、领料或成品入库事实。',
    primaryEntity: 'workflow_tasks',
    factSource: 'workflow_tasks 当前承载，生产排程事实规则待评审',
    boundary:
      '生产排程只表达计划和协同任务；完工、领料和成品入库必须由后端业务规则写事实。',
    sourceRefs: ['workflow_tasks', 'sales_orders', 'bom_headers'],
    currentScope: [
      '生产排程协同任务',
      '责任角色',
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
      '生产进度当前接入生产发料、成品入库和返工事实；页面只处理已有事实动作，不提供需要手填系统字段的无来源登记入口。',
    primaryEntity: 'production_facts',
    factSource: 'production_facts, inventory_txns',
    boundary:
      '生产进度事实不从协同任务完成自动生成；生产排程和异常仍属于协同层，不自动写出货、应收或发票事实。',
    sourceRefs: ['production_facts', 'inventory_txns', 'workflow_tasks'],
    currentScope: [
      '生产发料',
      '成品入库',
      '返工',
      '过账写库存流水，取消按后端规则冲正',
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
      '生产异常当前接入协同任务登记、筛选、完成、阻塞和催办；异常闭环仍属于协同层。',
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
    pageKind: 'formal-v1',
    description:
      '出货放行当前接入出货放行协同任务创建、筛选、完成、阻塞和催办；放行不等于真实出货。',
    primaryEntity: 'workflow_tasks / workflow_business_states',
    factSource:
      'workflow_tasks, workflow_business_states 当前承载，ShipmentUsecase 待评审',
    boundary:
      '放行完成不等于真实出货，不自动扣库存、生成应收、开票或收付款事实。',
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
      '出库管理当前承接出货单确认和库存预留处理；只有出货单发货才写库存出库事实。',
    primaryEntity: 'shipments / shipment_items / stock_reservations',
    factSource: 'shipments, shipment_items, stock_reservations, inventory_txns',
    boundary:
      '出货放行和任务完成不等于出库；库存预留释放 / 消耗不写库存流水，取消已发货才按后端规则写冲正追溯。',
    sourceRefs: [
      'shipments',
      'shipment_items',
      'stock_reservations',
      'inventory_txns',
    ],
    currentScope: [
      '出货单草稿和发货',
      '库存预留创建 / 释放 / 消耗',
      '出货取消冲正边界',
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
      '出货事实入口维护出货单和明细；确认出货才写库存出库事实，取消已出货会生成冲正追溯。',
    primaryEntity: 'shipments / shipment_items',
    factSource: 'shipments, shipment_items, inventory_txns',
    boundary:
      '出货放行只表示可发货，出库管理表达库存出库事实；只有出货单 SHIPPED 才是真实出货事实。',
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
      '对账管理当前接入对账业务事实，可过账、结清或取消业务对账事实。',
    primaryEntity: 'finance_facts.RECONCILIATION',
    factSource: 'finance_facts',
    boundary:
      '对账事实不自动写付款、应收、应付、发票、总账或会计凭证；差异处理仍需后续细化。',
    sourceRefs: ['finance_facts'],
    currentScope: ['对账事实创建', '过账', '结清', '取消'],
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
      '应付管理当前接入应付业务事实，可过账、结清或取消应付业务事实。',
    primaryEntity: 'finance_facts.PAYABLE',
    factSource: 'finance_facts',
    boundary:
      '应付来源必须回到采购、委外或对账事实；当前不代表付款审批、付款流水、总账或费用报销已交付。',
    sourceRefs: ['finance_facts', 'purchase_receipts', 'outsourcing_facts'],
    currentScope: ['应付事实创建', '过账', '结清', '取消'],
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
      '应收管理当前接入应收业务事实，可过账、结清或取消应收业务事实。',
    primaryEntity: 'finance_facts.RECEIVABLE',
    factSource: 'finance_facts',
    boundary:
      '应收至少应在真实出货后评审，不由销售订单、出货放行或任务完成直接生成；当前不代表收款核销、总账或税控已交付。',
    sourceRefs: ['finance_facts', 'shipments'],
    currentScope: ['应收事实创建', '过账', '结清', '取消'],
  },
  {
    key: 'invoices',
    sectionKey: 'finance',
    label: '发票管理',
    title: '发票管理',
    path: '/erp/finance/invoices',
    shortLabel: '发票',
    pageKind: 'formal-v1',
    description: '发票管理当前接入发票业务事实，记录业务开票状态。',
    primaryEntity: 'finance_facts.INVOICE',
    factSource: 'finance_facts',
    boundary: '发票事实不替代税控、发票查验、纳税申报、附件归档或会计凭证。',
    sourceRefs: ['finance_facts'],
    currentScope: ['发票事实创建', '过账', '结清', '取消'],
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
  if (businessModuleMap.get(key)?.pageKind !== 'formal-shell') {
    return []
  }
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
