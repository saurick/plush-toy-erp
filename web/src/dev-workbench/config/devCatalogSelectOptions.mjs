const INTEGRATION_DOMAIN_GROUPS = [
  {
    key: 'fulfillment',
    label: '订单与履约',
    values: ['sales_order', 'purchase_order', 'purchase', 'outsourcing_order', 'production_order', 'production_wip', 'quality', 'inventory', 'operational_fact'],
  },
  {
    key: 'collaboration',
    label: '资料与协作',
    values: ['masterdata', 'bom', 'workflow', 'attachment', 'business'],
  },
  {
    key: 'system',
    label: '账号与系统',
    values: ['auth', 'admin', 'customer_config', 'partner', 'system', 'debug'],
  },
]

const PERMISSION_MODULE_GROUPS = [
  {
    key: 'business',
    label: '业务办理',
    values: ['sales_order', 'engineering', 'purchase', 'outsourcing', 'pmc', 'production', 'warehouse', 'quality', 'shipment', 'finance'],
  },
  {
    key: 'workspace',
    label: '基础资料与通用工具',
    values: ['masterdata', 'bom', 'workflow', 'erp', 'mobile', 'help'],
  },
  {
    key: 'system',
    label: '系统与开发',
    values: ['system', 'customer_config', 'process_runtime', 'field', 'debug'],
  },
]

function catalogOptionGroup(key, title, options) {
  return { key: `group:${key}`, title, label: `${title} · ${options.length}`, options }
}

function groupCatalogOptions(options, groups, otherLabel) {
  const remaining = new Map(options.map((option) => [option.value, option]))
  const grouped = groups.flatMap(({ key, label, values }) => {
    const members = values.flatMap((value) => {
      const option = remaining.get(value)
      if (!option) return []
      remaining.delete(value)
      return [option]
    })
    return members.length ? [catalogOptionGroup(key, label, members)] : []
  })
  if (remaining.size) {
    grouped.push(catalogOptionGroup('other', otherLabel, [...remaining.values()]))
  }
  return grouped
}

export function buildIntegrationDomainSelectOptions(entries) {
  const options = entries.map(({ domain, domainLabel }) => ({ value: domain, label: domainLabel }))
  return groupCatalogOptions(options, INTEGRATION_DOMAIN_GROUPS, '其他业务域')
}

export function groupPermissionModuleSelectOptions(moduleOptions) {
  const [overview, ...modules] = moduleOptions
  return [overview, ...groupCatalogOptions(modules, PERMISSION_MODULE_GROUPS, '其他功能')]
}
