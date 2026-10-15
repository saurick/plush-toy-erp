const trimText = (value) => String(value ?? '').trim()
const valueOr = (value, fallback) => trimText(value) || fallback

function completePartyFields(draft = {}) {
  return {
    ...draft,
    supplierName: trimText(draft.supplierName),
    supplierContact: trimText(draft.supplierContact),
    supplierPhone: trimText(draft.supplierPhone),
    supplierAddress: trimText(draft.supplierAddress),
    buyerCompany: trimText(draft.buyerCompany),
    buyerContact: trimText(draft.buyerContact),
    buyerPhone: trimText(draft.buyerPhone),
    buyerAddress: trimText(draft.buyerAddress),
  }
}

export function completeMaterialPurchaseContractDraft(draft = {}) {
  const completed = completePartyFields(draft)
  const lines = Array.isArray(completed.lines) ? completed.lines : []
  return {
    ...completed,
    contractNo: valueOr(completed.contractNo, ''),
    orderDateText: valueOr(completed.orderDateText, ''),
    returnDateText: valueOr(completed.returnDateText, ''),
    lines: lines.map((line = {}) => ({
      ...line,
      contractNo: valueOr(line.contractNo, completed.contractNo || ''),
      productOrderNo: valueOr(line.productOrderNo, ''),
      productNo: valueOr(line.productNo, ''),
      productName: valueOr(line.productName, ''),
      materialName: valueOr(line.materialName, ''),
      vendorCode: valueOr(line.vendorCode, ''),
      spec: valueOr(line.spec, ''),
      unit: valueOr(line.unit, ''),
      unitPrice: valueOr(line.unitPrice, ''),
      quantity: valueOr(line.quantity, ''),
      amount: valueOr(line.amount, ''),
      remark: trimText(line.remark),
    })),
  }
}

export function completeProcessingContractDraft(draft = {}) {
  const completed = completePartyFields(draft)
  const lines = Array.isArray(completed.lines) ? completed.lines : []
  return {
    ...completed,
    contractNo: valueOr(completed.contractNo, ''),
    orderDateText: valueOr(completed.orderDateText, ''),
    returnDateText: valueOr(completed.returnDateText, ''),
    lines: lines.map((line = {}) => ({
      ...line,
      contractNo: valueOr(line.contractNo, completed.contractNo || ''),
      productOrderNo: valueOr(line.productOrderNo, ''),
      productNo: valueOr(line.productNo, ''),
      productName: valueOr(line.productName, ''),
      processingItem: valueOr(line.processingItem, ''),
      supplierAlias: valueOr(line.supplierAlias, completed.supplierName || ''),
      processCategory: valueOr(line.processCategory, ''),
      unit: valueOr(line.unit, ''),
      unitPrice: valueOr(line.unitPrice, ''),
      quantity: valueOr(line.quantity, ''),
      amount: valueOr(line.amount, ''),
      remark: trimText(line.remark),
    })),
  }
}

export function mergeSnapshotMissingFields(base = {}, patch = {}) {
  const out = { ...(base && typeof base === 'object' ? base : {}) }
  for (const [key, value] of Object.entries(
    patch && typeof patch === 'object' ? patch : {}
  )) {
    if (!trimText(out[key]) && trimText(value)) {
      out[key] = value
    }
  }
  return out
}
