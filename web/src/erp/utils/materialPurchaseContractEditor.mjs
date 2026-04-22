const MATERIAL_DETAIL_COLUMNS = [
  { key: 'contractNo', label: '采购订单号', editable: true },
  { key: 'productOrderNo', label: '产品订单编号', editable: true },
  { key: 'productNo', label: '产品编号', editable: true },
  { key: 'productName', label: '产品名称', editable: true },
  { key: 'materialName', label: '材料品名', editable: true },
  { key: 'vendorCode', label: '厂商料号', editable: true },
  { key: 'spec', label: '规格', editable: true },
  { key: 'unit', label: '单位', editable: true },
  { key: 'unitPrice', label: '单价', editable: true, numeric: true },
  { key: 'quantity', label: '采购数量', editable: true, numeric: true },
  { key: 'amount', label: '采购金额', editable: false, numeric: true },
  { key: 'remark', label: '备注', editable: true, multiline: true },
]

const DEFAULT_CLAUSES = {
  delivery: [
    '按订单明细分别打包，并标明产品编号。',
    '请严格按定单数量发货，尺码必须足量。如有尾货或存货不足时，及时与我司采购沟通确认。否则我司将拒绝收货。',
    '必须保证商品品质，保证商品的颜色、克重与样品一致。',
  ],
  contract: [
    '在订单约定日期前交货。如因货期延误影响上货计划，每延误一天按 100 元 / 款处罚，直接从货款扣除。',
    '如因特殊原因不能按期交货，须提前与我司采购沟通确认，经同意后方可延期，否则订单作废或按约收取违约金。',
    '因乙方产品质量问题造成经济纠纷，或者延误交期造成的损失均由乙方负责。',
  ],
  settlement: [
    '按我仓库确认收到货物日期，次月开始对账，每月 15 号之前完成对账。',
    '对完账后，次月支付货款，供货方开具等额增值税专用发票。',
  ],
}

export const MATERIAL_PURCHASE_DETAIL_COLUMNS = MATERIAL_DETAIL_COLUMNS
export const MATERIAL_PURCHASE_MAX_ROWS = 300

const DETAIL_COLUMN_KEYS = MATERIAL_DETAIL_COLUMNS.map((column) => column.key)

const toText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()

const cloneLine = (line = {}) =>
  DETAIL_COLUMN_KEYS.reduce((output, key) => {
    output[key] = toText(line?.[key])
    return output
  }, {})

const parseNumeric = (raw) => {
  const text = String(raw ?? '')
    .trim()
    .replaceAll(',', '')
    .replace(/[^\d.-]/g, '')
  if (!text || text === '-' || text === '.' || text === '-.') {
    return Number.NaN
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

const formatTrimmedNumber = (numeric, fractionDigits = 3) => {
  if (!Number.isFinite(numeric)) {
    return ''
  }
  return numeric.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

const formatAmountNumber = (numeric) => {
  if (!Number.isFinite(numeric)) {
    return ''
  }
  return numeric.toFixed(2)
}

const computeAmountText = (quantity, unitPrice) => {
  const quantityValue = parseNumeric(quantity)
  const unitPriceValue = parseNumeric(unitPrice)
  if (!Number.isFinite(quantityValue) || !Number.isFinite(unitPriceValue)) {
    return ''
  }
  return formatAmountNumber(quantityValue * unitPriceValue)
}

export const normalizeMaterialPurchaseLine = (line = {}) => {
  const normalized = cloneLine(line)
  normalized.unitPrice = formatTrimmedNumber(
    parseNumeric(normalized.unitPrice),
    3
  )
  normalized.quantity = formatTrimmedNumber(
    parseNumeric(normalized.quantity),
    3
  )
  normalized.amount = computeAmountText(
    normalized.quantity,
    normalized.unitPrice
  )
  return normalized
}

const buildLineSeedFromBase = (baseLine = {}) => ({
  contractNo: toText(baseLine.contractNo),
  productOrderNo: toText(baseLine.productOrderNo),
  productNo: toText(baseLine.productNo),
  productName: toText(baseLine.productName),
  materialName: '',
  vendorCode: '',
  spec: '',
  unit: toText(baseLine.unit),
  unitPrice: '',
  quantity: '',
  amount: '',
  remark: '',
})

const normalizeClauses = (rawClauses = {}) => ({
  delivery: Array.isArray(rawClauses.delivery)
    ? rawClauses.delivery.map((item) => toText(item)).filter(Boolean)
    : [...DEFAULT_CLAUSES.delivery],
  contract: Array.isArray(rawClauses.contract)
    ? rawClauses.contract.map((item) => toText(item)).filter(Boolean)
    : [...DEFAULT_CLAUSES.contract],
  settlement: Array.isArray(rawClauses.settlement)
    ? rawClauses.settlement.map((item) => toText(item)).filter(Boolean)
    : [...DEFAULT_CLAUSES.settlement],
})

const normalizeMerge = (merge = {}) => ({
  id: String(
    merge.id ||
      `merge_${merge.rowStart}_${merge.rowEnd}_${merge.colStart}_${merge.colEnd}`
  ),
  rowStart: Number(merge.rowStart) || 0,
  rowEnd: Number(merge.rowEnd) || 0,
  colStart: Number(merge.colStart) || 0,
  colEnd: Number(merge.colEnd) || 0,
})

const cloneMerges = (merges = []) =>
  (Array.isArray(merges) ? merges : []).map((merge) => normalizeMerge(merge))

export const buildMaterialPurchaseContractDraft = (sample = {}) => {
  const normalizedLines = Array.isArray(sample?.lines)
    ? sample.lines.map((line) => normalizeMaterialPurchaseLine(line))
    : []

  return {
    contractNo: toText(sample.contractNo),
    orderDateText: toText(sample.orderDateText),
    returnDateText: toText(sample.returnDateText),
    supplierName: toText(sample.supplierName),
    supplierContact: toText(sample.supplierContact),
    supplierPhone: toText(sample.supplierPhone),
    supplierAddress: toText(sample.supplierAddress),
    buyerCompany: toText(sample.buyerCompany),
    buyerContact: toText(sample.buyerContact),
    buyerPhone: toText(sample.buyerPhone),
    buyerAddress: toText(sample.buyerAddress),
    buyerSigner: toText(sample.buyerSigner || sample.buyerContact),
    supplierSigner: toText(sample.supplierSigner),
    signDateText: toText(sample.signDateText),
    supplierSignDateText: toText(sample.supplierSignDateText),
    lines:
      normalizedLines.length > 0
        ? normalizedLines
        : [normalizeMaterialPurchaseLine(buildLineSeedFromBase(sample))],
    clauses: normalizeClauses(sample.clauses),
    buyerStampVisible:
      typeof sample?.buyerStampVisible === 'boolean'
        ? sample.buyerStampVisible
        : false,
    merges: cloneMerges(sample.merges),
  }
}

export const computeMaterialPurchaseTotals = (lines = []) => {
  let quantityTotal = 0
  let amountTotal = 0
  let quantityHasValue = false
  let amountHasValue = false

  ;(Array.isArray(lines) ? lines : []).forEach((line) => {
    const quantity = parseNumeric(line?.quantity)
    if (Number.isFinite(quantity)) {
      quantityTotal += quantity
      quantityHasValue = true
    }
    const amount = parseNumeric(line?.amount)
    if (Number.isFinite(amount)) {
      amountTotal += amount
      amountHasValue = true
    }
  })

  return {
    quantityText: quantityHasValue ? formatTrimmedNumber(quantityTotal, 3) : '',
    amountText: amountHasValue ? formatAmountNumber(amountTotal) : '',
  }
}

export const updateMaterialPurchaseLineCell = (
  lines,
  rowIndex,
  columnKey,
  rawValue
) =>
  (Array.isArray(lines) ? lines : []).map((line, index) => {
    if (index !== rowIndex) {
      return line
    }
    const nextLine = {
      ...cloneLine(line),
      [columnKey]: String(rawValue ?? '').replaceAll('\r', ''),
    }
    return normalizeMaterialPurchaseLine(nextLine)
  })

export const updateMaterialPurchaseField = (draft, fieldKey, rawValue) => ({
  ...draft,
  [fieldKey]: String(rawValue ?? '')
    .replaceAll('\r', '')
    .trim(),
})

export const updateMaterialPurchaseClause = (
  clauses,
  sectionKey,
  clauseIndex,
  rawValue
) => {
  const safeClauses = normalizeClauses(clauses)
  safeClauses[sectionKey] = safeClauses[sectionKey].map((item, index) =>
    index === clauseIndex
      ? String(rawValue ?? '')
          .replaceAll('\r', '')
          .trim()
      : item
  )
  return safeClauses
}

export const normalizeCellSelection = (anchorCell, focusCell = anchorCell) => {
  if (!anchorCell || !focusCell) {
    return null
  }
  const rowStart = Math.min(anchorCell.rowIndex, focusCell.rowIndex)
  const rowEnd = Math.max(anchorCell.rowIndex, focusCell.rowIndex)
  const colStart = Math.min(anchorCell.colIndex, focusCell.colIndex)
  const colEnd = Math.max(anchorCell.colIndex, focusCell.colIndex)
  return { rowStart, rowEnd, colStart, colEnd }
}

export const isCellInsideSelection = (selection, rowIndex, colIndex) => {
  if (!selection) {
    return false
  }
  return (
    rowIndex >= selection.rowStart &&
    rowIndex <= selection.rowEnd &&
    colIndex >= selection.colStart &&
    colIndex <= selection.colEnd
  )
}

export const findMergeAtCell = (merges, rowIndex, colIndex) =>
  (Array.isArray(merges) ? merges : []).find(
    (merge) =>
      rowIndex >= merge.rowStart &&
      rowIndex <= merge.rowEnd &&
      colIndex >= merge.colStart &&
      colIndex <= merge.colEnd
  ) || null

export const isMergeTopLeftCell = (merge, rowIndex, colIndex) =>
  Boolean(merge) && merge.rowStart === rowIndex && merge.colStart === colIndex

const rangesOverlap = (left, right) =>
  left.rowStart <= right.rowEnd &&
  left.rowEnd >= right.rowStart &&
  left.colStart <= right.colEnd &&
  left.colEnd >= right.colStart

export const applyDetailCellMerge = ({
  lines = [],
  merges = [],
  selection,
}) => {
  if (!selection) {
    return {
      ok: false,
      message: '请先点“选择单元格”，再在表格里选中要合并的矩形区域。',
    }
  }
  if (
    selection.rowStart === selection.rowEnd &&
    selection.colStart === selection.colEnd
  ) {
    return { ok: false, message: '至少选择 2 个单元格后才能合并。' }
  }
  const conflict = merges.find((merge) => rangesOverlap(merge, selection))
  if (conflict) {
    return {
      ok: false,
      message: '当前选区已命中合并单元格，请先拆分当前后再重新选择。',
    }
  }

  const nextLines = (Array.isArray(lines) ? lines : []).map((line) =>
    cloneLine(line)
  )
  for (
    let rowIndex = selection.rowStart;
    rowIndex <= selection.rowEnd;
    rowIndex += 1
  ) {
    for (
      let colIndex = selection.colStart;
      colIndex <= selection.colEnd;
      colIndex += 1
    ) {
      if (rowIndex === selection.rowStart && colIndex === selection.colStart) {
        continue
      }
      const fieldKey = DETAIL_COLUMN_KEYS[colIndex]
      if (fieldKey) {
        nextLines[rowIndex][fieldKey] = ''
      }
    }
    nextLines[rowIndex] = normalizeMaterialPurchaseLine(nextLines[rowIndex])
  }

  const nextMerge = normalizeMerge({
    ...selection,
    id: `merge_${Date.now()}_${selection.rowStart}_${selection.colStart}`,
  })

  return {
    ok: true,
    lines: nextLines,
    merges: [...cloneMerges(merges), nextMerge],
    message: '已合并选区，按 Excel 规则仅保留左上角内容。',
  }
}

export const splitDetailCellMerge = ({ merges, rowIndex, colIndex }) => {
  const targetMerge = findMergeAtCell(merges, rowIndex, colIndex)
  if (!targetMerge) {
    return { ok: false, message: '当前单元格没有命中已合并区域。' }
  }
  return {
    ok: true,
    merges: cloneMerges(merges).filter((merge) => merge.id !== targetMerge.id),
    message: '已拆分当前合并单元格。',
  }
}

const shiftMergesAfterInsert = (merges, insertIndex) =>
  cloneMerges(merges).map((merge) => {
    if (merge.rowStart >= insertIndex) {
      return {
        ...merge,
        rowStart: merge.rowStart + 1,
        rowEnd: merge.rowEnd + 1,
      }
    }
    if (merge.rowStart < insertIndex && merge.rowEnd >= insertIndex) {
      return { ...merge, rowEnd: merge.rowEnd + 1 }
    }
    return merge
  })

const shiftMergesAfterDelete = (merges, deleteStart, deleteEnd) =>
  cloneMerges(merges)
    .filter((merge) => merge.rowEnd < deleteStart || merge.rowStart > deleteEnd)
    .map((merge) => {
      if (merge.rowStart > deleteEnd) {
        const offset = deleteEnd - deleteStart + 1
        return {
          ...merge,
          rowStart: merge.rowStart - offset,
          rowEnd: merge.rowEnd - offset,
        }
      }
      return merge
    })

export const insertMaterialPurchaseLine = ({
  lines = [],
  merges = [],
  selectedRowIndex,
  position = 'after',
}) => {
  const safeLines = Array.isArray(lines) ? lines : []
  if (!Number.isInteger(selectedRowIndex) || selectedRowIndex < 0) {
    return {
      ok: false,
      message: '请先点“选择明细行”，再在明细表里点中目标行。',
    }
  }
  if (safeLines.length >= MATERIAL_PURCHASE_MAX_ROWS) {
    return {
      ok: false,
      message: `采购合同明细最多支持 ${MATERIAL_PURCHASE_MAX_ROWS} 行，请先删减后再插入。`,
    }
  }

  const targetMerge =
    cloneMerges(merges).find(
      (merge) =>
        selectedRowIndex >= merge.rowStart &&
        selectedRowIndex <= merge.rowEnd &&
        merge.rowEnd > merge.rowStart
    ) || null
  const insertIndex =
    position === 'before'
      ? targetMerge
        ? targetMerge.rowStart
        : selectedRowIndex
      : targetMerge
        ? targetMerge.rowEnd + 1
        : selectedRowIndex + 1

  const seedIndex =
    position === 'before'
      ? Math.max(0, insertIndex)
      : Math.max(0, insertIndex - 1)
  const baseLine = safeLines[seedIndex] || safeLines[selectedRowIndex] || {}
  const nextLine = normalizeMaterialPurchaseLine(
    buildLineSeedFromBase(baseLine)
  )
  const nextLines = [...safeLines]
  nextLines.splice(insertIndex, 0, nextLine)

  return {
    ok: true,
    lines: nextLines,
    merges: shiftMergesAfterInsert(merges, insertIndex),
    selectedRowIndex: insertIndex,
    message: `已在第 ${insertIndex + 1} 行${position === 'before' ? '上方' : '下方'}插入空白行。`,
  }
}

export const deleteMaterialPurchaseLine = ({
  lines = [],
  merges = [],
  selectedRowIndex,
}) => {
  const safeLines = Array.isArray(lines) ? lines : []
  if (!Number.isInteger(selectedRowIndex) || selectedRowIndex < 0) {
    return {
      ok: false,
      message: '请先点“选择明细行”，再在明细表里点中目标行。',
    }
  }

  const rowMerge = cloneMerges(merges).find(
    (merge) =>
      selectedRowIndex >= merge.rowStart &&
      selectedRowIndex <= merge.rowEnd &&
      merge.rowEnd > merge.rowStart
  )
  const deleteStart = rowMerge ? rowMerge.rowStart : selectedRowIndex
  const deleteEnd = rowMerge ? rowMerge.rowEnd : selectedRowIndex
  const nextLines = safeLines.filter(
    (_, index) => index < deleteStart || index > deleteEnd
  )

  const fallbackLine =
    nextLines[deleteStart - 1] ||
    safeLines[selectedRowIndex] ||
    safeLines[0] ||
    {}

  return {
    ok: true,
    lines:
      nextLines.length > 0
        ? nextLines
        : [normalizeMaterialPurchaseLine(buildLineSeedFromBase(fallbackLine))],
    merges: shiftMergesAfterDelete(merges, deleteStart, deleteEnd),
    selectedRowIndex:
      nextLines.length === 0 ? 0 : Math.min(deleteStart, nextLines.length - 1),
    message:
      deleteStart === deleteEnd
        ? `已删除第 ${deleteStart + 1} 行。`
        : `已删除第 ${deleteStart + 1} - ${deleteEnd + 1} 行合并块。`,
  }
}
