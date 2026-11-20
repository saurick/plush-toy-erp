export function outsourcingFactProductSKUText(fact = {}) {
  const snapshot = String(fact?.sku_code_snapshot ?? '').trim()
  if (snapshot) return snapshot

  const productSKUID = Number(fact?.product_sku_id || 0)
  return Number.isSafeInteger(productSKUID) && productSKUID > 0
    ? '产品规格已关联'
    : '-'
}
