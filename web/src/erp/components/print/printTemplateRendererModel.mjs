import { calculateProcessingContractTotals } from '../../data/processingContractTemplate.mjs'
import {
  computeMaterialPurchaseTotals,
  MATERIAL_PURCHASE_DETAIL_COLUMNS,
} from '../../utils/materialPurchaseContractEditor.mjs'
import {
  findMergeAtCell,
  isMergeTopLeftCell,
} from '../../utils/detailCellMerge.mjs'

export const PRINT_TEMPLATE_LINE_COLUMNS = Object.freeze({
  material: MATERIAL_PURCHASE_DETAIL_COLUMNS.map(({ key, label }) => ({
    key,
    label,
  })),
  processing: [
    { key: 'contractNo', label: '委外加工订单号' },
    { key: 'productOrderNo', label: '产品订单编号' },
    { key: 'productNo', label: '产品编号' },
    { key: 'productName', label: '产品名称' },
    { key: 'processName', label: '工序名称' },
    { key: 'supplierAlias', label: '加工厂商' },
    { key: 'processCategory', label: '工序类别' },
    { key: 'unit', label: '单位' },
    { key: 'unitPrice', label: '单价' },
    { key: 'quantity', label: '委托加工数量' },
    { key: 'amount', label: '委托加工金额' },
    { key: 'remark', label: '备注' },
  ],
})

export function getPrintTemplateLineColumns(kind) {
  return (
    PRINT_TEMPLATE_LINE_COLUMNS[kind] || PRINT_TEMPLATE_LINE_COLUMNS.processing
  )
}

export function normalizePrintTemplatePreviewData(data) {
  const source = data && typeof data === 'object' ? data : {}
  const clauses =
    source.clauses && typeof source.clauses === 'object' ? source.clauses : {}
  return {
    ...source,
    lines: Array.isArray(source.lines) ? source.lines : [],
    merges: Array.isArray(source.merges) ? source.merges : [],
    clauses: {
      delivery: Array.isArray(clauses.delivery) ? clauses.delivery : [],
      contract: Array.isArray(clauses.contract) ? clauses.contract : [],
      settlement: Array.isArray(clauses.settlement) ? clauses.settlement : [],
    },
  }
}

export function resolvePrintTemplateTotals(data, kind) {
  const source = normalizePrintTemplatePreviewData(data)
  const { lines, merges } = source
  if (kind === 'material') {
    return computeMaterialPurchaseTotals(lines, { merges })
  }
  const totals = calculateProcessingContractTotals(lines, { merges })
  return {
    quantityText: totals.totalQuantityText,
    amountText: totals.totalAmountText,
  }
}

export function buildPrintTemplateLineCells(line, rowIndex, kind, merges = []) {
  const source = line || {}
  return getPrintTemplateLineColumns(kind).flatMap((column, colIndex) => {
    const merge = findMergeAtCell(merges, rowIndex, colIndex)
    if (merge && !isMergeTopLeftCell(merge, rowIndex, colIndex)) {
      return []
    }
    return [
      {
        key: column.key,
        label: column.label,
        value: source?.[column.key] ?? '',
        rowSpan: merge ? merge.rowEnd - merge.rowStart + 1 : undefined,
        colSpan: merge ? merge.colEnd - merge.colStart + 1 : undefined,
      },
    ]
  })
}
