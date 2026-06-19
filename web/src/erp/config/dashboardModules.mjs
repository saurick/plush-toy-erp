// 单对象入口用于 Workflow 任务来源解析；业务看板表格用下面的对象族分组。
export const dashboardModules = Object.freeze([
  {
    key: 'customers',
    title: '客户档案',
    path: '/erp/master/partners/customers',
  },
  {
    key: 'suppliers',
    title: '供应商档案',
    path: '/erp/master/partners/suppliers',
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
  },
])

export const dashboardHealthModules = Object.freeze([
  {
    key: 'partner-master',
    title: '客户/供应商',
    path: '/erp/master/partners/customers',
    sourceKeys: Object.freeze(['customers', 'suppliers']),
  },
  {
    key: 'product-engineering',
    title: '产品/BOM',
    path: '/erp/master/products',
    sourceKeys: Object.freeze(['products', 'material-bom']),
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
    sourceKeys: Object.freeze(['sales-orders']),
  },
  {
    key: 'purchase-inbound',
    title: '采购/入库',
    path: '/erp/purchase/accessories',
    sourceKeys: Object.freeze(['accessories-purchase', 'inbound']),
  },
  {
    key: 'quality-inventory',
    title: '质检/库存',
    path: '/erp/production/quality-inspections',
    sourceKeys: Object.freeze(['quality-inspections', 'inventory']),
  },
  {
    key: 'shipment-outbound',
    title: '出货/出库',
    path: '/erp/warehouse/shipments',
    sourceKeys: Object.freeze(['shipping-release', 'outbound']),
  },
  {
    key: 'production-outsourcing',
    title: '生产/委外',
    path: '/erp/production/progress',
    sourceKeys: Object.freeze([
      'production-scheduling',
      'production-progress',
      'production-exceptions',
      'processing-contracts',
    ]),
  },
  {
    key: 'finance-facts',
    title: '财务事实',
    path: '/erp/finance/reconciliation',
    sourceKeys: Object.freeze([
      'reconciliation',
      'payables',
      'receivables',
      'invoices',
    ]),
  },
])

export const dashboardStatusGroups = Object.freeze([
  {
    key: 'project',
    title: '立项/资料',
    statusKeys: Object.freeze([
      'project_pending',
      'project_approved',
      'engineering_preparing',
    ]),
  },
  {
    key: 'material',
    title: '齐套/排产',
    statusKeys: Object.freeze(['material_preparing', 'production_ready']),
  },
  {
    key: 'production',
    title: '生产/检验',
    statusKeys: Object.freeze([
      'production_processing',
      'qc_pending',
      'iqc_pending',
    ]),
  },
  {
    key: 'warehouse',
    title: '仓库/出货',
    statusKeys: Object.freeze([
      'warehouse_processing',
      'warehouse_inbound_pending',
      'inbound_done',
      'shipment_pending',
      'shipping_released',
      'shipped',
    ]),
  },
  {
    key: 'finance',
    title: '财务协同',
    statusKeys: Object.freeze(['reconciling', 'settled']),
  },
  {
    key: 'blocked',
    title: '阻塞/取消',
    statusKeys: Object.freeze(['blocked', 'qc_failed', 'cancelled']),
  },
  {
    key: 'closed',
    title: '归档',
    statusKeys: Object.freeze(['closed']),
  },
])
