function positiveID(value) {
  const id = Number(value || 0)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function compactParts(parts = []) {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' / ')
}

function shortDemoUnitName(name) {
  const text = String(name ?? '').trim()
  const matched = text.match(/^核心演示单位[-－]\s*(.+)$/)
  return matched?.[1]?.trim() || text
}

function shortUnitCode(code) {
  const text = String(code ?? '').trim()
  if (!text) return ''
  if (text.startsWith('SIM-')) {
    return text.split('-').filter(Boolean).at(-1) || text
  }
  return text.length <= 8 ? text : ''
}

export function uniqueReferenceOptions(records, toOption) {
  const seen = new Set()
  return (Array.isArray(records) ? records : [])
    .map(toOption)
    .filter((option) => option && positiveID(option.value))
    .filter((option) => {
      const key = Number(option.value)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function referenceLabel(options, value, fallbackPrefix = '记录') {
  const normalizedValue = positiveID(value)
  if (!normalizedValue) return '-'
  const matched = (Array.isArray(options) ? options : []).find(
    (option) => option?.value === normalizedValue
  )
  return matched?.label || `${fallbackPrefix}已关联`
}

export function materialOption(material = {}) {
  const value = positiveID(material.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      material.code || '材料已关联',
      material.name,
      material.spec,
      material.color,
    ]),
  }
}

export function productOption(product = {}) {
  const value = positiveID(product.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      product.code || '产品已关联',
      product.name,
      product.style_no,
    ]),
  }
}

export function productSKUOption(sku = {}) {
  const value = positiveID(sku.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      sku.sku_code || 'SKU已关联',
      sku.sku_name,
      sku.color,
      sku.size,
    ]),
  }
}

export function unitOption(unit = {}) {
  const value = positiveID(unit.id)
  if (!value) return null
  const precision = Number(unit.precision)
  const name = shortDemoUnitName(unit.name)
  const code = shortUnitCode(unit.code)
  const fullName = String(unit.name ?? '').trim()
  const fullCode = String(unit.code ?? '').trim()
  const label =
    name && code && name !== code
      ? `${name}（${code}）`
      : name || code || '单位已关联'
  const fullLabel =
    fullName && fullCode && fullName !== fullCode
      ? `${fullName}（${fullCode}）`
      : fullName || fullCode || label
  return {
    value,
    label,
    suffixLabel: label,
    searchText: [label, fullLabel].filter(Boolean).join(' '),
    title: fullLabel,
    precision:
      Number.isInteger(precision) && precision >= 0 ? precision : undefined,
  }
}

export function customerOption(customer = {}) {
  const value = positiveID(customer.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      customer.code || '客户已关联',
      customer.name,
      customer.short_name,
    ]),
  }
}

export function supplierOption(supplier = {}) {
  const value = positiveID(supplier.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      supplier.code || '供应商已关联',
      supplier.name,
      supplier.short_name,
    ]),
  }
}

export function processOption(process = {}) {
  const value = positiveID(process.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      process.code || '工序已关联',
      process.name,
      process.category,
    ]),
    disabled:
      process.is_active === false || process.outsourcing_enabled !== true,
  }
}

export function salesOrderOption(order = {}) {
  const value = positiveID(order.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      order.order_no || order.document_no || '销售订单已关联',
      order.customer_snapshot?.name || order.customer_name_snapshot,
    ]),
  }
}

export function salesOrderItemOption(item = {}) {
  const value = positiveID(item.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      item.line_no ? `第 ${item.line_no} 行` : '销售订单行已关联',
      item.product_name_snapshot || item.product_snapshot?.name,
      item.quantity,
    ]),
  }
}

export function purchaseOrderItemOption(item = {}) {
  const value = positiveID(item.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      item.line_no ? `第 ${item.line_no} 行` : '采购订单行已关联',
      item.material_name_snapshot || item.material_snapshot?.name,
      item.quantity,
    ]),
  }
}

export function purchaseReceiptOption(receipt = {}) {
  const value = positiveID(receipt.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      receipt.receipt_no || '采购入库已关联',
      receipt.supplier_name,
      receipt.status,
    ]),
  }
}

export function shipmentOption(shipment = {}) {
  const value = positiveID(shipment.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      shipment.shipment_no || '出货单已关联',
      shipment.customer_snapshot,
      shipment.status,
    ]),
  }
}

export function purchaseReceiptItemOption(item = {}) {
  const value = positiveID(item.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      item.source_line_no || '入库行已关联',
      item.material_name_snapshot || item.material_snapshot?.name,
      item.lot_no,
      item.quantity,
    ]),
  }
}

export function inventoryLotOption(lot = {}) {
  const value = positiveID(lot.id || lot.lot_id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      lot.lot_no || '批次已关联',
      lot.supplier_lot_no,
      lot.status,
    ]),
  }
}

export function warehouseOptionFromRecord(record = {}) {
  const value = positiveID(record.warehouse_id || record.id)
  if (!value) return null
  const warehouseName = record.warehouse_name || record.name
  const warehouseCode = record.warehouse_code || record.code
  return {
    value,
    label:
      warehouseName || warehouseCode
        ? compactParts([warehouseName, warehouseCode])
        : '仓库已关联',
  }
}
