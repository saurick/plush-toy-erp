// 单对象入口用于协同任务来源解析。
export const dashboardModules = Object.freeze([
  {
    key: 'customers',
    title: '客户档案',
    path: '/erp/master/partners/customers',
  },
  {
    key: 'suppliers',
    title: '供应商与加工厂',
    path: '/erp/master/partners/suppliers',
  },
  {
    key: 'sales-orders',
    title: '销售订单',
    path: '/erp/sales/project-orders/sales-orders',
  },
])
