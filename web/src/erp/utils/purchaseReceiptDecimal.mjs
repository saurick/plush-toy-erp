import {
  compareNumeric20Scale6Values,
  formatNumeric20Scale6,
  sumNumeric20Scale6Values,
} from './numeric20Scale6.mjs'

export function sumPurchaseReceiptQuantities(items = []) {
  return sumNumeric20Scale6Values(
    (Array.isArray(items) ? items : []).map((item) => item?.quantity)
  )
}

export function formatPurchaseReceiptQuantityTotal(items = []) {
  if (new Set(items.map((item) => item.unit_id)).size > 1) {
    return '按单位查看明细'
  }
  return formatNumeric20Scale6(sumPurchaseReceiptQuantities(items))
}

export function comparePurchaseReceiptQuantityTotals(leftItems, rightItems) {
  if (
    new Set([...leftItems, ...rightItems].map((item) => item.unit_id)).size > 1
  ) {
    return 0
  }
  return compareNumeric20Scale6Values(
    sumPurchaseReceiptQuantities(leftItems),
    sumPurchaseReceiptQuantities(rightItems)
  )
}
