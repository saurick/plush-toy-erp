const permissionModuleLabels = Object.freeze({
  business: '业务看板',
  debug: '调试能力',
  erp: '后台功能',
  finance: '财务',
  masterdata: '主数据',
  mobile: '岗位任务端',
  other: '其他',
  outsourcing: '委外',
  pmc: '生产计划 PMC',
  purchase: '采购',
  quality: '品质',
  sales_order: '销售订单',
  shipment: '出货',
  system: '系统管理',
  warehouse: '仓储',
  workflow: '协同任务',
})

export function getPermissionModuleTitle(moduleKey = '') {
  const normalizedKey = String(moduleKey || 'other').trim() || 'other'
  const label = permissionModuleLabels[normalizedKey]
  return label ? `${label} (${normalizedKey})` : normalizedKey
}
