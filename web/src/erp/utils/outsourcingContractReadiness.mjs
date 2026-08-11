const text = (value) => String(value ?? '').trim()

function activeContractItems(items = []) {
  return (Array.isArray(items) ? items : []).filter(
    (item) =>
      !['canceled', 'cancelled'].includes(text(item?.line_status).toLowerCase())
  )
}

function partySnapshot(order = {}, key = '') {
  const value = order?.[key]
  return value && typeof value === 'object' ? value : {}
}

function amountOf(item = {}) {
  const savedAmountText = text(item.amount).replaceAll(',', '')
  if (savedAmountText) {
    const savedAmount = Number(savedAmountText)
    if (Number.isFinite(savedAmount)) return savedAmount
  }
  const quantity = Number(text(item.outsourcing_quantity).replaceAll(',', ''))
  const unitPrice = Number(text(item.unit_price).replaceAll(',', ''))
  return Number.isFinite(quantity) && Number.isFinite(unitPrice)
    ? quantity * unitPrice
    : 0
}

export function inspectOutsourcingContractReadiness(order = {}, items = []) {
  const buyer = partySnapshot(order, 'contract_party_snapshot')
  const supplier = partySnapshot(order, 'supplier_snapshot')
  const activeItems = activeContractItems(items)
  const missing = []

  if (!order.expected_return_date) missing.push('预计回货日期')
  if (!text(buyer.buyerCompany)) missing.push('委托单位')
  if (!text(buyer.buyerContact)) missing.push('委托人')
  if (!text(buyer.buyerPhone)) missing.push('委托方电话')
  if (!text(buyer.buyerAddress)) missing.push('委托方地址')
  if (!text(supplier.name) && !text(supplier.short_name)) {
    missing.push('乙方单位')
  }
  if (!text(supplier.contact_name)) missing.push('乙方联系人')
  if (!text(supplier.contact_phone) && !text(supplier.contact_mobile)) {
    missing.push('乙方联系电话')
  }
  if (!text(supplier.address)) missing.push('乙方地址')
  if (activeItems.length === 0) {
    missing.push('至少一条有效加工明细')
  } else if (activeItems.some((item) => !text(item.processing_item))) {
    missing.push('每条明细的加工项目')
  }

  const totalAmount = activeItems.reduce((sum, item) => sum + amountOf(item), 0)
  return {
    complete: missing.length === 0,
    missing,
    activeItems,
    lineCount: activeItems.length,
    totalAmount,
    totalAmountText: totalAmount.toFixed(2),
  }
}

export function buildOutsourcingContractConfirmationSummary(
  order = {},
  items = [],
  attachmentCount = 0
) {
  const readiness = inspectOutsourcingContractReadiness(order, items)
  const buyer = partySnapshot(order, 'contract_party_snapshot')
  const supplier = partySnapshot(order, 'supplier_snapshot')
  return {
    ...readiness,
    buyerName: text(buyer.buyerCompany),
    supplierName: text(supplier.name) || text(supplier.short_name),
    expectedReturnDate: order.expected_return_date,
    attachmentCount: Math.max(0, Number(attachmentCount || 0)),
  }
}
