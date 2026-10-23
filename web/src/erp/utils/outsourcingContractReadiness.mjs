import { deriveOutsourcingOrderItemAmount } from './sourceOrderAmounts.mjs'
import {
  formatNumeric20Scale6Summary,
  numeric20Scale6Units,
  sumNumeric20Scale6Values,
} from './numeric20Scale6.mjs'
import { isBusinessCurrency } from './businessCurrency.mjs'

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

  const currency = text(order.currency).toUpperCase()
  if (!isBusinessCurrency(currency)) missing.push('合同币种')
  const amounts = activeItems.map(deriveOutsourcingOrderItemAmount)
  const unpricedCount = amounts.filter((amount) => amount === undefined).length
  if (unpricedCount) missing.push('每条明细的数量及单价')
  const totalAmount = unpricedCount ? '' : sumNumeric20Scale6Values(amounts)
  if (totalAmount && numeric20Scale6Units(totalAmount) === null)
    { missing.push('合同金额超出范围') }
  return {
    complete: missing.length === 0,
    missing,
    activeItems,
    lineCount: activeItems.length,
    totalAmount,
    currency,
    unpricedCount,
    totalAmountText:
      totalAmount && numeric20Scale6Units(totalAmount) !== null
        ? `${formatNumeric20Scale6Summary(totalAmount, 2)} ${currency}`.trim()
        : '待补齐金额',
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
