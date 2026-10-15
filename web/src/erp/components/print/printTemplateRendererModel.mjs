import {
  calculateProcessingContractTotals,
  PROCESSING_CONTRACT_TABLE_COLUMNS,
} from '../../data/processingContractTemplate.mjs'
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
  processing: PROCESSING_CONTRACT_TABLE_COLUMNS.map(({ key, label }) => ({
    key,
    label,
  })),
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
