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
  return matched?.label || `${fallbackPrefix} #${normalizedValue}`
}

export function materialOption(material = {}) {
  const value = positiveID(material.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      material.code || `材料 #${value}`,
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
      product.code || `产品 #${value}`,
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
      sku.sku_code || `SKU #${value}`,
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
      : name || code || `单位 #${value}`
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
      customer.code || `客户 #${value}`,
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
      supplier.code || `供应商 #${value}`,
      supplier.name,
      supplier.short_name,
    ]),
  }
}

export function salesOrderOption(order = {}) {
  const value = positiveID(order.id)
  if (!value) return null
  return {
    value,
    label: compactParts([
      order.order_no || order.document_no || `销售订单 #${value}`,
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
      item.line_no ? `第 ${item.line_no} 行` : `销售订单行 #${value}`,
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
      item.line_no ? `第 ${item.line_no} 行` : `采购订单行 #${value}`,
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
      receipt.receipt_no || `采购入库单 #${value}`,
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
      shipment.shipment_no || `出货单 #${value}`,
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
      item.source_line_no || `入库行 #${value}`,
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
      lot.lot_no || `批次 #${value}`,
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
        : `仓库 #${value}`,
  }
}
