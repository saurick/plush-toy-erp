import {
  applyTableCellMerge,
  cloneDetailCellMerges,
  findMergeAtCell,
  findRowMergeAtLine,
  isCellInsideSelection,
  isMergeTopLeftCell,
  normalizeCellSelection,
  shiftMergesAfterDelete,
  shiftMergesAfterInsert,
  splitTableCellMerge,
} from './detailCellMerge.mjs'

export {
  findMergeAtCell,
  isCellInsideSelection,
  isMergeTopLeftCell,
  normalizeCellSelection,
} from './detailCellMerge.mjs'

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
  { key: 'amount', label: '采购金额', editable: true, numeric: true },
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

const resolveAmountModeForColumn = (
  columnKey,
  { amountInputPhase = 'commit' } = {}
) => {
  if (columnKey === 'amount') {
    return amountInputPhase === 'input' ? 'manual-draft' : 'manual'
  }
  if (columnKey === 'quantity' || columnKey === 'unitPrice') {
    return 'recompute'
  }
  return 'auto'
}

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

const sanitizePositiveDecimalText = (
  raw,
  { fractionDigits = 2, preserveTrailingDot = false } = {}
) => {
  const source = String(raw ?? '')
  let normalized = ''
  let hasDot = false

  for (const char of source) {
    if (/\d/.test(char)) {
      normalized += char
      continue
    }
    if (char === '.' && !hasDot) {
      if (!normalized) {
        normalized = '0'
      }
      normalized += '.'
      hasDot = true
    }
  }

  if (!normalized) {
    return ''
  }

  const endsWithDot = normalized.endsWith('.')
  const [rawInteger = '', rawFraction = ''] = normalized.split('.')
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0'
  const fraction = rawFraction.slice(0, Math.max(0, fractionDigits))

  if (!hasDot) {
    return integer
  }
  if (fraction || (preserveTrailingDot && endsWithDot)) {
    return `${integer}.${fraction}`
  }
  return integer
}

const normalizeAmountDraftText = (raw) =>
  sanitizePositiveDecimalText(raw, {
    fractionDigits: 2,
    preserveTrailingDot: true,
  })

const normalizeAmountText = (raw) => {
  const sanitized = sanitizePositiveDecimalText(raw, {
    fractionDigits: 2,
  })
  return formatAmountNumber(parseNumeric(sanitized))
}

const computeAmountText = (quantity, unitPrice) => {
  const quantityValue = parseNumeric(quantity)
  const unitPriceValue = parseNumeric(unitPrice)
  if (!Number.isFinite(quantityValue) || !Number.isFinite(unitPriceValue)) {
    return ''
  }
  return formatAmountNumber(quantityValue * unitPriceValue)
}

export const normalizeMaterialPurchaseLine = (
  line = {},
  { amountMode = 'auto' } = {}
) => {
  const normalized = cloneLine(line)
  normalized.unitPrice = formatTrimmedNumber(
    parseNumeric(normalized.unitPrice),
    3
  )
  normalized.quantity = formatTrimmedNumber(
    parseNumeric(normalized.quantity),
    3
  )
  const computedAmount = computeAmountText(
    normalized.quantity,
    normalized.unitPrice
  )
  const draftAmount = normalizeAmountDraftText(normalized.amount)
  const explicitAmount = normalizeAmountText(normalized.amount)
  if (amountMode === 'manual-draft') {
    normalized.amount = draftAmount
  } else if (amountMode === 'manual') {
    normalized.amount = explicitAmount
  } else if (amountMode === 'recompute') {
    normalized.amount = computedAmount
  } else {
    normalized.amount = explicitAmount || computedAmount
  }
  return normalized
}

const createEmptyMaterialPurchaseLine = () => ({
  contractNo: '',
  productOrderNo: '',
  productNo: '',
  productName: '',
  materialName: '',
  vendorCode: '',
  spec: '',
  unit: '',
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
        : [normalizeMaterialPurchaseLine(createEmptyMaterialPurchaseLine())],
    clauses: normalizeClauses(sample.clauses),
    buyerStampVisible:
      typeof sample?.buyerStampVisible === 'boolean'
        ? sample.buyerStampVisible
        : false,
    merges: cloneDetailCellMerges(sample.merges),
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
  rawValue,
  options = {}
) =>
  (Array.isArray(lines) ? lines : []).map((line, index) => {
    if (index !== rowIndex) {
      return line
    }
    const nextLine = {
      ...cloneLine(line),
      [columnKey]: String(rawValue ?? '').replaceAll('\r', ''),
    }
    return normalizeMaterialPurchaseLine(nextLine, {
      amountMode: resolveAmountModeForColumn(columnKey, options),
    })
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

export const applyDetailCellMerge = ({ lines = [], merges = [], selection }) =>
  applyTableCellMerge({
    lines,
    merges,
    selection,
    columnKeys: DETAIL_COLUMN_KEYS,
    cloneLine,
    normalizeLine: normalizeMaterialPurchaseLine,
  })

export const splitDetailCellMerge = ({ merges, rowIndex, colIndex }) =>
  splitTableCellMerge({ merges, rowIndex, colIndex })

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

  const targetMerge = findRowMergeAtLine(merges, selectedRowIndex)
  const insertIndex =
    position === 'before'
      ? targetMerge
        ? targetMerge.rowStart
        : selectedRowIndex
      : targetMerge
        ? targetMerge.rowEnd + 1
        : selectedRowIndex + 1

  const nextLine = normalizeMaterialPurchaseLine(
    createEmptyMaterialPurchaseLine()
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

  const rowMerge = findRowMergeAtLine(merges, selectedRowIndex)
  const deleteStart = rowMerge ? rowMerge.rowStart : selectedRowIndex
  const deleteEnd = rowMerge ? rowMerge.rowEnd : selectedRowIndex
  const nextLines = safeLines.filter(
    (_, index) => index < deleteStart || index > deleteEnd
  )

  return {
    ok: true,
    lines:
      nextLines.length > 0
        ? nextLines
        : [normalizeMaterialPurchaseLine(createEmptyMaterialPurchaseLine())],
    merges: shiftMergesAfterDelete(merges, deleteStart, deleteEnd),
    selectedRowIndex:
      nextLines.length === 0 ? 0 : Math.min(deleteStart, nextLines.length - 1),
    message:
      deleteStart === deleteEnd
        ? `已删除第 ${deleteStart + 1} 行。`
        : `已删除第 ${deleteStart + 1} - ${deleteEnd + 1} 行合并块。`,
  }
}
