const MASTER_HISTORY_STATUS = Object.freeze({
  false: '已停用',
  true: '已启用',
})

const SALES_ORDER_STATUS = Object.freeze({
  closed: '已关闭',
  canceled: '已取消',
})

const PURCHASE_ORDER_STATUS = Object.freeze({
  closed: '已关闭',
  canceled: '已取消',
})

const OUTSOURCING_ORDER_STATUS = Object.freeze({
  closed: '已关闭',
  canceled: '已取消',
})

const PRODUCTION_ORDER_STATUS = Object.freeze({
  CLOSED: '已关闭',
  CANCELLED: '已取消',
})

const BOM_STATUS = Object.freeze({ ARCHIVED: '已归档' })

function text(value, fallback = '-') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function snapshotName(snapshot) {
  return snapshot && typeof snapshot === 'object'
    ? text(snapshot.name || snapshot.short_name, '')
    : ''
}

function joinSummary(values = []) {
  return (
    values
      .map((value) => text(value, ''))
      .filter(Boolean)
      .join(' / ') || '-'
  )
}

function historyPath(path, params = {}) {
  const searchParams = new URLSearchParams({ scope: 'history' })
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      searchParams.set(key, String(value))
    }
  })
  return `${path}?${searchParams.toString()}`
}

function masterRecord(
  source,
  record,
  { codeKey = 'code', nameKey = 'name' } = {}
) {
  const code = text(record?.[codeKey], '')
  const name = text(record?.[nameKey], '')
  return {
    key: `${source.key}:${record?.id}`,
    sourceKey: source.key,
    sourceLabel: source.label,
    primary: code || name || '未编号记录',
    secondary: name || code || '-',
    status: MASTER_HISTORY_STATUS[String(record?.is_active === true)],
    summary: joinSummary([
      record?.category,
      record?.spec,
      record?.color,
      record?.note,
    ]),
    updatedAt: record?.updated_at,
    createdAt: record?.created_at,
    link: historyPath(source.menuPath, {
      catalog: source.catalog,
      keyword: code || name,
    }),
  }
}

function sourceOrderRecord(source, record, config) {
  const statusValue = text(record?.[config.statusKey], '')
  return {
    key: `${source.key}:${record?.id}`,
    sourceKey: source.key,
    sourceLabel: source.label,
    primary: text(record?.[config.numberKey], '未编号记录'),
    secondary: text(config.secondary(record), '-'),
    status: config.statusLabels[statusValue] || '历史状态待核对',
    summary: joinSummary(config.summary(record)),
    updatedAt: record?.updated_at,
    createdAt: record?.created_at,
    link: historyPath(source.menuPath, {
      [config.routeIDKey]: record?.id,
    }),
  }
}

function masterSource(config) {
  const source = {
    kind: 'master',
    statusParam: '',
    historyStatusOptions: [],
    ...config,
  }
  return Object.freeze({
    ...source,
    normalize: (record) => masterRecord(source, record, config.recordConfig),
  })
}

function orderSource(config) {
  const source = { kind: 'order', ...config }
  return Object.freeze({
    ...source,
    normalize: (record) =>
      sourceOrderRecord(source, record, config.recordConfig),
  })
}

export const HISTORY_RECORD_SOURCES = Object.freeze([
  masterSource({
    key: 'customers',
    label: '客户档案',
    menuPath: '/erp/master/partners/customers',
    responseKey: 'customers',
    readPermissions: ['customer.read'],
  }),
  masterSource({
    key: 'suppliers',
    label: '供应商档案',
    menuPath: '/erp/master/partners/suppliers',
    responseKey: 'suppliers',
    readPermissions: ['supplier.read'],
  }),
  masterSource({
    key: 'materials',
    label: '材料档案',
    menuPath: '/erp/master/materials',
    responseKey: 'materials',
    readPermissions: ['material.read'],
  }),
  masterSource({
    key: 'products',
    label: '产品档案',
    menuPath: '/erp/master/products',
    responseKey: 'products',
    readPermissions: ['product.read'],
    catalog: 'products',
  }),
  masterSource({
    key: 'product_skus',
    label: '产品规格',
    menuPath: '/erp/master/products',
    responseKey: 'product_skus',
    readPermissions: ['product_sku.read'],
    catalog: 'product_skus',
    recordConfig: { codeKey: 'sku_code', nameKey: 'sku_name' },
  }),
  masterSource({
    key: 'processes',
    label: '加工环节',
    menuPath: '/erp/engineering/processes',
    responseKey: 'processes',
    readPermissions: ['process.read'],
  }),
  orderSource({
    key: 'sales_orders',
    label: '销售订单',
    menuPath: '/erp/sales/project-orders/sales-orders',
    responseKey: 'sales_orders',
    readPermissions: ['sales_order.read'],
    statusParam: 'lifecycle_status',
    historyStatusOptions: [
      { value: '', label: '全部历史状态' },
      { value: 'closed', label: '已关闭' },
      { value: 'canceled', label: '已取消' },
    ],
    recordConfig: {
      numberKey: 'order_no',
      statusKey: 'lifecycle_status',
      statusLabels: SALES_ORDER_STATUS,
      routeIDKey: 'sales_order_id',
      secondary: (record) =>
        snapshotName(record?.customer_snapshot) || record?.customer_order_no,
      summary: (record) => [record?.sales_owner, record?.note],
    },
  }),
  orderSource({
    key: 'purchase_orders',
    label: '采购订单',
    menuPath: '/erp/purchase/accessories',
    responseKey: 'purchase_orders',
    readPermissions: ['purchase.order.read'],
    statusParam: 'lifecycle_status',
    historyStatusOptions: [
      { value: '', label: '全部历史状态' },
      { value: 'closed', label: '已关闭' },
      { value: 'canceled', label: '已取消' },
    ],
    recordConfig: {
      numberKey: 'purchase_order_no',
      statusKey: 'lifecycle_status',
      statusLabels: PURCHASE_ORDER_STATUS,
      routeIDKey: 'purchase_order_id',
      secondary: (record) =>
        snapshotName(record?.supplier_snapshot) ||
        record?.supplier_purchase_order_no,
      summary: (record) => [record?.supplier_purchase_order_no, record?.note],
    },
  }),
  orderSource({
    key: 'outsourcing_orders',
    label: '委外订单',
    menuPath: '/erp/purchase/processing-contracts',
    responseKey: 'outsourcing_orders',
    readPermissions: ['outsourcing.order.read'],
    statusParam: 'lifecycle_status',
    historyStatusOptions: [
      { value: '', label: '全部历史状态' },
      { value: 'closed', label: '已关闭' },
      { value: 'canceled', label: '已取消' },
    ],
    recordConfig: {
      numberKey: 'outsourcing_order_no',
      statusKey: 'lifecycle_status',
      statusLabels: OUTSOURCING_ORDER_STATUS,
      routeIDKey: 'outsourcing_order_id',
      secondary: (record) => snapshotName(record?.supplier_snapshot),
      summary: (record) => [record?.source_order_no, record?.note],
    },
  }),
  orderSource({
    key: 'production_orders',
    label: '生产订单',
    menuPath: '/erp/production/orders',
    responseKey: 'production_orders',
    readPermissions: ['pmc.plan.read', 'production.wip.read'],
    permissionMode: 'any',
    statusParam: 'status',
    historyStatusOptions: [
      { value: '', label: '全部历史状态' },
      { value: 'CLOSED', label: '已关闭' },
      { value: 'CANCELLED', label: '已取消' },
    ],
    recordConfig: {
      numberKey: 'order_no',
      statusKey: 'status',
      statusLabels: PRODUCTION_ORDER_STATUS,
      routeIDKey: 'production_order_id',
      secondary: (record) => record?.note,
      summary: (record) => [record?.close_reason, record?.cancel_reason],
    },
  }),
  orderSource({
    key: 'bom_versions',
    label: 'BOM 版本',
    menuPath: '/erp/purchase/material-bom',
    responseKey: 'bom_versions',
    readPermissions: ['bom.read'],
    statusParam: 'status',
    historyStatusOptions: [
      { value: '', label: '全部历史状态' },
      { value: 'ARCHIVED', label: '已归档' },
    ],
    recordConfig: {
      numberKey: 'version',
      statusKey: 'status',
      statusLabels: BOM_STATUS,
      routeIDKey: 'unused',
      secondary: (record) => record?.source_order_no,
      summary: (record) => [record?.designer, record?.maker, record?.note],
    },
  }),
])

export function getAvailableHistorySources({
  visibleMenuPaths = [],
  canReadPermission = () => false,
} = {}) {
  const visiblePathSet = new Set(visibleMenuPaths)
  return HISTORY_RECORD_SOURCES.filter((source) => {
    if (!visiblePathSet.has(source.menuPath)) return false
    const permissions = source.readPermissions || []
    return source.permissionMode === 'any'
      ? permissions.some((permission) => canReadPermission(permission))
      : permissions.every((permission) => canReadPermission(permission))
  })
}

export function buildHistoryListParams(
  source,
  { keyword = '', status = '' } = {}
) {
  const params = {
    keyword: text(keyword, ''),
    lifecycle_scope: 'history',
  }
  if (source?.statusParam && status) {
    params[source.statusParam] = status
  }
  return params
}

export function normalizeHistoryRecords(source, records = []) {
  if (!source || typeof source.normalize !== 'function') return []
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.id)
    .map((record) => {
      const normalized = source.normalize(record)
      if (source.key === 'bom_versions') {
        normalized.link = historyPath(source.menuPath, {
          product_id: record.product_id,
          keyword: record.version,
        })
      }
      return normalized
    })
}
