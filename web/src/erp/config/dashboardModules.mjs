// 首页只保留当前已经落地的正式业务对象入口。
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
