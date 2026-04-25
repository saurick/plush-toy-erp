// 首页只需要模块键和标题，单独拆一份轻量配置，避免把整份业务页定义打进首屏。
export const dashboardModules = Object.freeze([
  { key: 'partners', title: '客户/供应商', path: '/erp/master/partners' },
  { key: 'products', title: '产品', path: '/erp/master/products' },
  {
    key: 'project-orders',
    title: '客户/款式立项',
    path: '/erp/sales/project-orders',
  },
  {
    key: 'material-bom',
    title: '材料 BOM',
    path: '/erp/purchase/material-bom',
  },
  {
    key: 'accessories-purchase',
    title: '辅材/包材采购',
    path: '/erp/purchase/accessories',
  },
  {
    key: 'processing-contracts',
    title: '加工合同/委外下单',
    path: '/erp/purchase/processing-contracts',
  },
  {
    key: 'inbound',
    title: '入库通知/检验/入库',
    path: '/erp/warehouse/inbound',
  },
  { key: 'inventory', title: '库存', path: '/erp/warehouse/inventory' },
  {
    key: 'shipping-release',
    title: '待出货/出货放行',
    path: '/erp/warehouse/shipping-release',
  },
  { key: 'outbound', title: '出库', path: '/erp/warehouse/outbound' },
  {
    key: 'production-scheduling',
    title: '生产排单',
    path: '/erp/production/scheduling',
  },
  {
    key: 'production-progress',
    title: '生产进度',
    path: '/erp/production/progress',
  },
  {
    key: 'production-exceptions',
    title: '延期/返工/异常',
    path: '/erp/production/exceptions',
  },
  {
    key: 'quality-inspections',
    title: '品质检验',
    path: '/erp/production/quality-inspections',
  },
  {
    key: 'reconciliation',
    title: '对账/结算',
    path: '/erp/finance/reconciliation',
  },
  {
    key: 'payables',
    title: '待付款/应付提醒',
    path: '/erp/finance/payables',
  },
  {
    key: 'receivables',
    title: '应收/开票登记',
    path: '/erp/finance/receivables',
  },
  {
    key: 'invoices',
    title: '发票登记',
    path: '/erp/finance/invoices',
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
      'shipping_released',
      'shipped',
    ]),
  },
  {
    key: 'finance',
    title: '对账/结算',
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
