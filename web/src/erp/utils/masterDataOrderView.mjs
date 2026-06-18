export const V1_ROUTE_PATHS = Object.freeze({
  customers: '/erp/master/partners/customers',
  suppliers: '/erp/master/partners/suppliers',
  materials: '/erp/master/materials',
  processes: '/erp/engineering/processes',
  salesOrders: '/erp/sales/project-orders/sales-orders',
  purchaseOrders: '/erp/purchase/accessories',
  purchaseReceipts: '/erp/warehouse/inbound',
  qualityInspections: '/erp/production/quality-inspections',
  inventory: '/erp/warehouse/inventory',
  processingContracts: '/erp/purchase/processing-contracts',
  productionProgress: '/erp/production/progress',
  outbound: '/erp/warehouse/outbound',
  shipments: '/erp/warehouse/shipments',
  receivables: '/erp/finance/receivables',
  payables: '/erp/finance/payables',
  invoices: '/erp/finance/invoices',
  reconciliation: '/erp/finance/reconciliation',
})

export const SALES_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  active: '已生效',
  closed: '已关闭',
  canceled: '已取消',
})

export const SALES_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  active: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const SALES_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

export const PURCHASE_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  closed: '已关闭',
  canceled: '已取消',
})

export const PURCHASE_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  approved: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const PURCHASE_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

export const OUTSOURCING_ORDER_STATUS_LABELS = Object.freeze({
  draft: '草稿',
  submitted: '已提交',
  confirmed: '已确认',
  closed: '已关闭',
  canceled: '已取消',
})

export const OUTSOURCING_ORDER_STATUS_COLORS = Object.freeze({
  draft: 'default',
  submitted: 'blue',
  confirmed: 'green',
  closed: 'purple',
  canceled: 'red',
})

export const OUTSOURCING_ORDER_ITEM_STATUS_LABELS = Object.freeze({
  open: '未关闭',
  closed: '已关闭',
  canceled: '已取消',
})

const SALES_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['active', 'canceled']),
  active: Object.freeze(['closed', 'canceled']),
})

const PURCHASE_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['approved', 'canceled']),
  approved: Object.freeze(['closed', 'canceled']),
})

const OUTSOURCING_ORDER_LIFECYCLE_ACTIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'canceled']),
  submitted: Object.freeze(['confirmed', 'canceled']),
  confirmed: Object.freeze(['closed', 'canceled']),
})

function normalizeLifecycleStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function canRunLifecycleAction(transitions, currentStatus, nextStatus) {
  const current = normalizeLifecycleStatus(currentStatus)
  const next = normalizeLifecycleStatus(nextStatus)
  return (
    Array.isArray(transitions[current]) && transitions[current].includes(next)
  )
}

export function canRunSalesOrderLifecycleAction(currentStatus, nextStatus) {
  return canRunLifecycleAction(
    SALES_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function canRunPurchaseOrderLifecycleAction(currentStatus, nextStatus) {
  return canRunLifecycleAction(
    PURCHASE_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function canRunOutsourcingOrderLifecycleAction(
  currentStatus,
  nextStatus
) {
  return canRunLifecycleAction(
    OUTSOURCING_ORDER_LIFECYCLE_ACTIONS,
    currentStatus,
    nextStatus
  )
}

export function hasActionPermission(admin = {}, permissionKey = '') {
  if (!permissionKey) {
    return false
  }
  if (admin?.is_super_admin === true) {
    return true
  }
  return Array.isArray(admin?.permissions)
    ? admin.permissions.includes(permissionKey)
    : false
}

export function trimOptional(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

export function deriveSalesOrderItemAmount(values = {}) {
  const quantityText = String(values.ordered_quantity ?? '').trim()
  const unitPriceText = String(values.unit_price ?? '').trim()
  const quantity = Number(quantityText)
  const unitPrice = Number(unitPriceText)
  if (
    quantityText !== '' &&
    unitPriceText !== '' &&
    Number.isFinite(quantity) &&
    quantity >= 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0
  ) {
    return (quantity * unitPrice).toFixed(2)
  }
  return trimOptional(values.amount)
}

export function derivePurchaseOrderItemAmount(values = {}) {
  const quantityText = String(values.purchased_quantity ?? '').trim()
  const unitPriceText = String(values.unit_price ?? '').trim()
  const quantity = Number(quantityText)
  const unitPrice = Number(unitPriceText)
  if (
    quantityText !== '' &&
    unitPriceText !== '' &&
    Number.isFinite(quantity) &&
    quantity >= 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0
  ) {
    return (quantity * unitPrice).toFixed(2)
  }
  return trimOptional(values.amount)
}

export function deriveOutsourcingOrderItemAmount(values = {}) {
  const quantityText = String(values.outsourcing_quantity ?? '').trim()
  const unitPriceText = String(values.unit_price ?? '').trim()
  const quantity = Number(quantityText)
  const unitPrice = Number(unitPriceText)
  if (
    quantityText !== '' &&
    unitPriceText !== '' &&
    Number.isFinite(quantity) &&
    quantity >= 0 &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0
  ) {
    return (quantity * unitPrice).toFixed(2)
  }
  return trimOptional(values.amount)
}

export function compactParams(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  )
}

export function formatUnixDate(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-'
  }
  return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatUnixDateTime(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '-'
  }
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function unixToDateInputValue(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

export function statusText(status, labels = {}) {
  const key = String(status || '').trim()
  return labels[key] || key || '-'
}

export function formatUnitDisplayName(unitID, unitByID = new Map()) {
  const normalizedID = Number(unitID || 0)
  if (!Number.isFinite(normalizedID) || normalizedID <= 0) {
    return '-'
  }
  const unit = unitByID instanceof Map ? unitByID.get(normalizedID) : null
  if (!unit) {
    return `未知单位 #${normalizedID}`
  }
  const name = trimOptional(unit.name)
  const code = trimOptional(unit.code)
  if (name && code && name !== code) {
    return `${name}（${code}）`
  }
  return name || code || `单位 #${normalizedID}`
}

export function buildUnitSelectOptions(units = []) {
  const activeUnits = Array.isArray(units)
    ? units.filter((unit) => unit?.is_active !== false)
    : []
  const unitByID = new Map(
    activeUnits
      .map((unit) => [Number(unit?.id || 0), unit])
      .filter(([unitID]) => Number.isFinite(unitID) && unitID > 0)
  )
  return activeUnits
    .map((unit) => {
      const value = Number(unit?.id || 0)
      if (!Number.isFinite(value) || value <= 0) {
        return null
      }
      return {
        value,
        label: formatUnitDisplayName(value, unitByID),
      }
    })
    .filter(Boolean)
}

export function buildTextSelectOptions(records = [], fieldName = '') {
  const seen = new Set()
  return (Array.isArray(records) ? records : [])
    .map((record) => trimOptional(record?.[fieldName]))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) {
        return false
      }
      seen.add(value)
      return true
    })
    .map((value) => ({ value, label: value }))
}

export function inferDefaultUnitID(records = [], unitOptions = []) {
  const allowedUnitIDs = new Set(
    (Array.isArray(unitOptions) ? unitOptions : [])
      .map((option) => Number(option?.value || 0))
      .filter((unitID) => Number.isFinite(unitID) && unitID > 0)
  )
  if (allowedUnitIDs.size === 0) {
    return undefined
  }

  const counts = new Map()
  for (const record of Array.isArray(records) ? records : []) {
    const unitID = Number(record?.default_unit_id || 0)
    if (!allowedUnitIDs.has(unitID)) {
      continue
    }
    counts.set(unitID, (counts.get(unitID) || 0) + 1)
  }
  const [mostUsedUnitID] = [...counts.entries()].sort(
    ([unitIDA, countA], [unitIDB, countB]) =>
      countB - countA || unitIDA - unitIDB
  )[0] || [undefined]
  return mostUsedUnitID || [...allowedUnitIDs][0]
}

function draftCodeDateKey(now = new Date()) {
  const date =
    now instanceof Date && !Number.isNaN(now.valueOf()) ? now : new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
}

export function buildSequentialDraftCode(
  records = [],
  { prefix = '', field = 'code', now = new Date(), sequenceWidth = 3 } = {}
) {
  const normalizedPrefix = trimOptional(prefix)
  if (!normalizedPrefix) {
    return ''
  }
  const dateKey = draftCodeDateKey(now)
  const codePrefix = `${normalizedPrefix}-${dateKey}-`
  const maxSequence = (Array.isArray(records) ? records : []).reduce(
    (max, record) => {
      const code = String(record?.[field] || '')
      if (!code.startsWith(codePrefix)) {
        return max
      }
      const sequence = Number(code.slice(codePrefix.length))
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max
    },
    0
  )
  return `${codePrefix}${String(maxSequence + 1).padStart(sequenceWidth, '0')}`
}

export function buildMaterialDraftCode(records = [], now = new Date()) {
  return buildSequentialDraftCode(records, {
    prefix: 'MAT',
    field: 'code',
    now,
  })
}

export function buildCustomerSnapshot(customer = {}) {
  if (!customer?.id) {
    return {}
  }
  return compactParams({
    id: customer.id,
    code: trimOptional(customer.code),
    name: trimOptional(customer.name),
    short_name: trimOptional(customer.short_name),
  })
}

export function buildSupplierSnapshot(supplier = {}) {
  if (!supplier?.id) {
    return {}
  }
  return compactParams({
    id: supplier.id,
    code: trimOptional(supplier.code),
    name: trimOptional(supplier.name),
    short_name: trimOptional(supplier.short_name),
  })
}

export function buildMasterDataParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    short_name: trimOptional(values.short_name),
    supplier_type: trimOptional(values.supplier_type),
    tax_no: trimOptional(values.tax_no),
    category: trimOptional(values.category),
    spec: trimOptional(values.spec),
    color: trimOptional(values.color),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
    note: trimOptional(values.note),
  })
}

export function buildProductParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    style_no: trimOptional(values.style_no),
    customer_style_no: trimOptional(values.customer_style_no),
    default_unit_id:
      values.default_unit_id === undefined
        ? undefined
        : Number(values.default_unit_id || 0),
  })
}

export function buildProcessParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    code: trimOptional(values.code),
    name: trimOptional(values.name),
    category: trimOptional(values.category),
    outsourcing_enabled: values.outsourcing_enabled === true,
    inhouse_enabled: values.inhouse_enabled !== false,
    quality_required: values.quality_required === true,
    sort_order:
      values.sort_order === undefined
        ? undefined
        : Number(values.sort_order || 0),
    note: trimOptional(values.note),
  })
}

export function buildProductSKUParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    product_id: Number(values.product_id || 0),
    sku_code: trimOptional(values.sku_code),
    sku_name: trimOptional(values.sku_name),
    barcode: trimOptional(values.barcode),
    customer_sku: trimOptional(values.customer_sku),
    color: trimOptional(values.color),
    color_no: trimOptional(values.color_no),
    size: trimOptional(values.size),
    packaging_version: trimOptional(values.packaging_version),
    default_unit_id:
      values.default_unit_id === undefined || values.default_unit_id === null
        ? undefined
        : Number(values.default_unit_id || 0),
  })
}

export function buildContactParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    name: trimOptional(values.name),
    phone: trimOptional(values.phone),
    mobile: trimOptional(values.mobile),
    email: trimOptional(values.email),
    title: trimOptional(values.title),
    is_primary: values.is_primary === true,
    note: trimOptional(values.note),
  })
}

export function buildSalesOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    order_no: trimOptional(values.order_no),
    customer_id: Number(values.customer_id || 0),
    customer_order_no: trimOptional(values.customer_order_no),
    customer_snapshot:
      values.customer_snapshot && typeof values.customer_snapshot === 'object'
        ? values.customer_snapshot
        : {},
    order_date: trimOptional(values.order_date),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

export function buildSalesOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: Number(values.line_no || 0),
    product_id: Number(values.product_id || 0),
    product_sku_id: Number(values.product_sku_id || 0),
    unit_id: Number(values.unit_id || 0),
    product_code_snapshot: trimOptional(values.product_code_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    ordered_quantity: trimOptional(values.ordered_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: deriveSalesOrderItemAmount(values),
    planned_delivery_date: trimOptional(values.planned_delivery_date),
    note: trimOptional(values.note),
  })
}

export function buildPurchaseOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    purchase_order_no: trimOptional(values.purchase_order_no),
    supplier_id: Number(values.supplier_id || 0),
    supplier_purchase_order_no: trimOptional(values.supplier_purchase_order_no),
    supplier_snapshot:
      values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {},
    purchase_date: trimOptional(values.purchase_date),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    note: trimOptional(values.note),
  })
}

export function buildPurchaseOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: Number(values.line_no || 0),
    material_id: Number(values.material_id || 0),
    unit_id: Number(values.unit_id || 0),
    material_code_snapshot: trimOptional(values.material_code_snapshot),
    material_name_snapshot: trimOptional(values.material_name_snapshot),
    color_snapshot: trimOptional(values.color_snapshot),
    purchased_quantity: trimOptional(values.purchased_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: derivePurchaseOrderItemAmount(values),
    expected_arrival_date: trimOptional(values.expected_arrival_date),
    note: trimOptional(values.note),
  })
}

export function buildOutsourcingOrderParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    outsourcing_order_no: trimOptional(values.outsourcing_order_no),
    supplier_id: Number(values.supplier_id || 0),
    supplier_snapshot:
      values.supplier_snapshot && typeof values.supplier_snapshot === 'object'
        ? values.supplier_snapshot
        : {},
    source_order_no: trimOptional(values.source_order_no),
    source_sales_order_id:
      values.source_sales_order_id === undefined ||
      values.source_sales_order_id === null ||
      values.source_sales_order_id === ''
        ? undefined
        : Number(values.source_sales_order_id || 0),
    order_date: trimOptional(values.order_date),
    expected_return_date: trimOptional(values.expected_return_date),
    note: trimOptional(values.note),
  })
}

export function buildOutsourcingOrderItemParams(values = {}, extra = {}) {
  return compactParams({
    ...extra,
    line_no: Number(values.line_no || 0),
    product_id: Number(values.product_id || 0),
    process_id: Number(values.process_id || 0),
    unit_id: Number(values.unit_id || 0),
    product_no_snapshot: trimOptional(values.product_no_snapshot),
    product_name_snapshot: trimOptional(values.product_name_snapshot),
    process_name_snapshot: trimOptional(values.process_name_snapshot),
    process_category_snapshot: trimOptional(values.process_category_snapshot),
    unit_name_snapshot: trimOptional(values.unit_name_snapshot),
    outsourcing_quantity: trimOptional(values.outsourcing_quantity),
    unit_price: trimOptional(values.unit_price),
    amount: deriveOutsourcingOrderItemAmount(values),
    expected_return_date: trimOptional(values.expected_return_date),
    note: trimOptional(values.note),
  })
}

function materialLookupByID(materials = []) {
  return new Map(
    (Array.isArray(materials) ? materials : [])
      .filter((item) => item?.id)
      .map((item) => [Number(item.id), item])
  )
}

function formatPrintDraftDate(value) {
  const timestamp = Number(value || 0)
  return Number.isFinite(timestamp) && timestamp > 0
    ? formatUnixDate(value)
    : undefined
}

export function buildMaterialPurchaseContractDraftFromPurchaseOrder(
  order = {},
  items = [],
  { materials = [] } = {}
) {
  const supplierSnapshot =
    order?.supplier_snapshot && typeof order.supplier_snapshot === 'object'
      ? order.supplier_snapshot
      : {}
  const materialByID = materialLookupByID(materials)
  const lines = (Array.isArray(items) ? items : [])
    .filter((item) => item?.line_status !== 'canceled')
    .map((item) => {
      const material = materialByID.get(Number(item.material_id || 0)) || {}
      return compactParams({
        contractNo: trimOptional(order.purchase_order_no),
        materialName:
          trimOptional(item.material_name_snapshot) ||
          trimOptional(material.name),
        vendorCode:
          trimOptional(item.material_code_snapshot) ||
          trimOptional(material.code),
        spec: trimOptional(material.spec),
        unitPrice: trimOptional(item.unit_price),
        quantity: trimOptional(item.purchased_quantity),
        amount: derivePurchaseOrderItemAmount(item),
        remark: trimOptional(item.note) || trimOptional(item.color_snapshot),
      })
    })
  return compactParams({
    contractNo: trimOptional(order.purchase_order_no),
    orderDateText: formatPrintDraftDate(order.purchase_date),
    returnDateText: formatPrintDraftDate(order.expected_arrival_date),
    supplierName:
      trimOptional(supplierSnapshot.name) ||
      trimOptional(supplierSnapshot.short_name),
    lines,
  })
}
