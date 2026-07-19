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
  return formatNumeric20Scale6(sumPurchaseReceiptQuantities(items))
}

export function comparePurchaseReceiptQuantityTotals(leftItems, rightItems) {
  return compareNumeric20Scale6Values(
    sumPurchaseReceiptQuantities(leftItems),
    sumPurchaseReceiptQuantities(rightItems)
  )
}
