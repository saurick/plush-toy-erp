const trimText = (value) => String(value ?? '').trim()
const valueOr = (value, fallback) => trimText(value) || fallback

function completePartyFields(draft = {}, labels = {}) {
  return {
    ...draft,
    supplierName: valueOr(draft.supplierName, labels.supplierName || '未维护供应方名称'),
    supplierContact: valueOr(draft.supplierContact, labels.supplierContact || '未维护联系人'),
    supplierPhone: valueOr(draft.supplierPhone, labels.supplierPhone || '未维护联系电话'),
    supplierAddress: valueOr(draft.supplierAddress, labels.supplierAddress || '未维护地址'),
    buyerCompany: valueOr(draft.buyerCompany, labels.buyerCompany || '未配置订货单位'),
    buyerContact: valueOr(draft.buyerContact, labels.buyerContact || '未配置经办人'),
    buyerPhone: valueOr(draft.buyerPhone, labels.buyerPhone || '未配置联系电话'),
    buyerAddress: valueOr(draft.buyerAddress, labels.buyerAddress || '未配置公司地址'),
  }
}

export function completeMaterialPurchaseContractDraft(draft = {}) {
  const completed = completePartyFields(draft, {
    supplierName: '未维护供应商名称',
    buyerCompany: '未配置订货单位',
    buyerContact: '未配置订货人',
  })
  const lines = Array.isArray(completed.lines) ? completed.lines : []
  return {
    ...completed,
    contractNo: valueOr(completed.contractNo, '未维护采购订单号'),
    orderDateText: valueOr(completed.orderDateText, '未维护下单日期'),
    returnDateText: valueOr(completed.returnDateText, '未维护回货日期'),
    lines: lines.map((line = {}) => ({
      ...line,
      contractNo: valueOr(line.contractNo, completed.contractNo || '未维护采购订单号'),
      productOrderNo: valueOr(line.productOrderNo, '未关联产品订单'),
      productNo: valueOr(line.productNo, '未关联产品编号'),
      productName: valueOr(line.productName, '未关联产品名称'),
      materialName: valueOr(line.materialName, '未维护材料品名'),
      vendorCode: valueOr(line.vendorCode, '未维护厂商料号'),
      spec: valueOr(line.spec, '未维护规格'),
      unit: valueOr(line.unit, '未维护单位'),
      unitPrice: valueOr(line.unitPrice, '未维护单价'),
      quantity: valueOr(line.quantity, '未维护数量'),
      amount: valueOr(line.amount, '未维护金额'),
      remark: valueOr(line.remark, '—'),
    })),
  }
}

export function completeProcessingContractDraft(draft = {}) {
  const completed = completePartyFields(draft, {
    supplierName: '未维护加工方名称',
    buyerCompany: '未配置委托单位',
    buyerContact: '未配置委托人',
  })
  const lines = Array.isArray(completed.lines) ? completed.lines : []
  return {
    ...completed,
    contractNo: valueOr(completed.contractNo, '未维护委外单号'),
    orderDateText: valueOr(completed.orderDateText, '未维护下单日期'),
    returnDateText: valueOr(completed.returnDateText, '未维护回货日期'),
    lines: lines.map((line = {}) => ({
      ...line,
      contractNo: valueOr(line.contractNo, completed.contractNo || '未维护委外单号'),
      productOrderNo: valueOr(line.productOrderNo, '未关联产品订单'),
      productNo: valueOr(line.productNo, '未维护产品编号'),
      productName: valueOr(line.productName, '未维护产品名称'),
      processName: valueOr(line.processName, '未维护工序名称'),
      supplierAlias: valueOr(line.supplierAlias, completed.supplierName || '未维护加工厂'),
      processCategory: valueOr(line.processCategory, '未维护工序类别'),
      unit: valueOr(line.unit, '未维护单位'),
      unitPrice: valueOr(line.unitPrice, '未维护单价'),
      quantity: valueOr(line.quantity, '未维护数量'),
      amount: valueOr(line.amount, '未维护金额'),
      remark: valueOr(line.remark, '—'),
    })),
  }
}

export function mergeSnapshotMissingFields(base = {}, patch = {}) {
  const out = { ...(base && typeof base === 'object' ? base : {}) }
  for (const [key, value] of Object.entries(patch && typeof patch === 'object' ? patch : {})) {
    if (!trimText(out[key]) && trimText(value)) {
      out[key] = value
    }
  }
  return out
}
