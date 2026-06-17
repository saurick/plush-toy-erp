export const V1_ROUTE_PATHS = Object.freeze({
  customers: '/erp/master/partners/customers',
  suppliers: '/erp/master/partners/suppliers',
  materials: '/erp/master/materials',
  salesOrders: '/erp/sales/project-orders/sales-orders',
  purchaseOrders: '/erp/purchase/accessories',
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
