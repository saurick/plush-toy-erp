const permissionModuleLabels = Object.freeze({
  business: '业务看板',
  debug: '其他功能',
  erp: '常用功能',
  finance: '财务',
  masterdata: '基础资料',
  mobile: '手机待办',
  other: '其他功能',
  outsourcing: '委外',
  pmc: '生产计划',
  purchase: '采购',
  quality: '品质',
  sales_order: '销售订单',
  shipment: '出货',
  system: '系统管理',
  warehouse: '仓储',
  workflow: '任务',
})

export function getPermissionModuleTitle(moduleKey = '') {
  const normalizedKey = String(moduleKey || 'other').trim() || 'other'
  const label = permissionModuleLabels[normalizedKey]
  return label || '其他功能'
}
